'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { test } = require('node:test');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function startMockQbit() {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const body = await readBody(req);
    calls.push({ method: req.method, path: url.pathname, headers: req.headers, body });

    if (req.method === 'POST' && url.pathname === '/api/v2/auth/login') {
      res.writeHead(200, { 'Set-Cookie': 'SID=test-session; HttpOnly' });
      return res.end('Ok.');
    }

    if (req.method === 'GET' && url.pathname === '/api/v2/app/version') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('v5.0.0');
    }

    if (req.method === 'POST' && url.pathname === '/api/v2/torrents/add') {
      if (!String(req.headers.cookie || '').includes('SID=test-session')) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      res.writeHead(200);
      return res.end('Ok.');
    }

    res.writeHead(404);
    res.end('Not found');
  });

  const port = await listen(server);
  return { server, port, calls };
}

async function startBridge(env) {
  const port = await freePort();
  const child = spawn(process.execPath, ['qbit-bridge.js'], {
    cwd: __dirname,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Bridge start timeout: ' + output)), 3000);
    child.once('exit', (code) => reject(new Error('Bridge exited with ' + code + ': ' + output)));
    child.stdout.on('data', () => {
      if (output.includes('Lampa qBittorrent bridge:')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return {
    port,
    child,
    stop: () => new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
      setTimeout(resolve, 1000);
    })
  };
}

test('bridge protects add endpoint with token and forwards torrent to qBittorrent', async () => {
  const qbit = await startMockQbit();
  const bridge = await startBridge({
    QBIT_URL: `http://127.0.0.1:${qbit.port}`,
    QBIT_USERNAME: 'admin',
    QBIT_PASSWORD: 'secret',
    QBIT_SAVE_PATH: '/Volumes/Media/Downloads/qBittorrent',
    BRIDGE_TOKEN: 'test-token'
  });

  try {
    const health = await fetch(`http://127.0.0.1:${bridge.port}/health`).then((res) => res.json());
    assert.equal(health.ok, true);
    assert.equal(health.authEnabled, true);

    const denied = await fetch(`http://127.0.0.1:${bridge.port}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: 'magnet:?xt=urn:btih:abc' })
    });
    assert.equal(denied.status, 401);

    const added = await fetch(`http://127.0.0.1:${bridge.port}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': 'test-token' },
      body: JSON.stringify({ link: 'magnet:?xt=urn:btih:abc', category: 'films', tags: 'lampa', sequential: true })
    });
    assert.equal(added.status, 200);
    assert.deepEqual(await added.json(), { ok: true, response: 'Ok.' });

    const addCall = qbit.calls.find((call) => call.path === '/api/v2/torrents/add');
    assert.ok(addCall, 'qBittorrent add endpoint was called');
    assert.match(addCall.body, /urls=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc/);
    assert.match(addCall.body, /savepath=%2FVolumes%2FMedia%2FDownloads%2FqBittorrent/);
    assert.match(addCall.body, /category=films/);
    assert.match(addCall.body, /tags=lampa/);
    assert.match(addCall.body, /sequentialDownload=true/);
  } finally {
    await bridge.stop();
    await close(qbit.server);
  }
});

test('bridge routes movie and tv content to Plex library folders', async () => {
  const qbit = await startMockQbit();
  const bridge = await startBridge({
    QBIT_URL: `http://127.0.0.1:${qbit.port}`,
    QBIT_USERNAME: 'admin',
    QBIT_PASSWORD: 'secret',
    QBIT_MOVIES_PATH: '/Volumes/Media/FILMS',
    QBIT_TV_PATH: '/Volumes/Media/TV SHOWS',
    QBIT_MOVIES_CATEGORY: 'films',
    QBIT_TV_CATEGORY: 'tv-shows',
    BRIDGE_TOKEN: 'test-token'
  });

  try {
    const movie = await fetch(`http://127.0.0.1:${bridge.port}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': 'test-token' },
      body: JSON.stringify({ link: 'magnet:?xt=urn:btih:movie', contentType: 'movie', category: 'lampa' })
    });
    assert.equal(movie.status, 200);

    const tv = await fetch(`http://127.0.0.1:${bridge.port}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': 'test-token' },
      body: JSON.stringify({ link: 'magnet:?xt=urn:btih:tv', contentType: 'tv' })
    });
    assert.equal(tv.status, 200);

    const addCalls = qbit.calls.filter((call) => call.path === '/api/v2/torrents/add');
    assert.equal(addCalls.length, 2);
    assert.match(addCalls[0].body, /savepath=%2FVolumes%2FMedia%2FFILMS/);
    assert.match(addCalls[0].body, /category=films/);
    assert.match(addCalls[1].body, /savepath=%2FVolumes%2FMedia%2FTV\+SHOWS/);
    assert.match(addCalls[1].body, /category=tv-shows/);
  } finally {
    await bridge.stop();
    await close(qbit.server);
  }
});

test('bridge routes movie and tv content to Plex library folders in qBittorrent CLI mode', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lampa-qbit-cli-'));
  const argsFile = path.join(tempDir, 'args.jsonl');
  const fakeQbit = path.join(tempDir, 'qbittorrent-fake.js');
  fs.writeFileSync(fakeQbit, `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.appendFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`);
  fs.chmodSync(fakeQbit, 0o755);

  const bridge = await startBridge({
    QBIT_ADD_MODE: 'cli',
    QBIT_BINARY: fakeQbit,
    QBIT_MOVIES_PATH: '/Volumes/Media/FILMS',
    QBIT_TV_PATH: '/Volumes/Media/TV SHOWS',
    QBIT_MOVIES_CATEGORY: 'films',
    QBIT_TV_CATEGORY: 'tv-shows',
    BRIDGE_TOKEN: 'test-token'
  });

  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': 'test-token' },
      body: JSON.stringify({ link: 'magnet:?xt=urn:btih:tvcli', contentType: 'series' })
    });
    assert.equal(response.status, 200);

    const calls = fs.readFileSync(argsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [
      '--skip-dialog=true',
      '--save-path=/Volumes/Media/TV SHOWS',
      '--category=tv-shows',
      'magnet:?xt=urn:btih:tvcli'
    ]);
  } finally {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('bridge rejects unsupported torrent links', async () => {
  const qbit = await startMockQbit();
  const bridge = await startBridge({
    QBIT_URL: `http://127.0.0.1:${qbit.port}`,
    BRIDGE_TOKEN: 'test-token'
  });

  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': 'test-token' },
      body: JSON.stringify({ link: 'file:///tmp/movie.torrent' })
    });
    assert.equal(response.status, 500);
    const json = await response.json();
    assert.equal(json.ok, false);
    assert.match(json.error, /Unsupported torrent link/);
  } finally {
    await bridge.stop();
    await close(qbit.server);
  }
});


test('bridge lists downloaded video files and streams them with range support', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lampa-downloads-'));
  const moviesDir = path.join(tempDir, 'FILMS');
  const tvDir = path.join(tempDir, 'TV SHOWS');
  fs.mkdirSync(path.join(moviesDir, 'Movie One'), { recursive: true });
  fs.mkdirSync(path.join(tvDir, 'Show One'), { recursive: true });
  const movieFile = path.join(moviesDir, 'Movie One', 'Movie.One.2026.mkv');
  const tvFile = path.join(tvDir, 'Show One', 'Show.One.S01E01.mp4');
  fs.writeFileSync(movieFile, '0123456789abcdef');
  fs.writeFileSync(tvFile, 'episode');
  fs.writeFileSync(path.join(moviesDir, 'ignore.txt'), 'not video');

  const bridge = await startBridge({
    QBIT_ADD_MODE: 'cli',
    QBIT_BINARY: process.execPath,
    LAMPA_DOWNLOAD_ROOTS: `${moviesDir}${path.delimiter}${tvDir}`,
    BRIDGE_TOKEN: 'test-token'
  });

  try {
    const denied = await fetch(`http://127.0.0.1:${bridge.port}/downloads`);
    assert.equal(denied.status, 401);

    const listed = await fetch(`http://127.0.0.1:${bridge.port}/downloads`, {
      headers: { 'X-Bridge-Token': 'test-token' }
    });
    assert.equal(listed.status, 200);
    const json = await listed.json();
    assert.equal(json.ok, true);
    assert.equal(json.items.length, 2);
    const movie = json.items.find((item) => item.name === 'Movie.One.2026.mkv');
    assert.ok(movie, 'movie file is listed');
    assert.equal(movie.size, 16);
    assert.equal(movie.type, 'movie');
    assert.match(movie.streamUrl, /^\/media\//);
    assert.equal(movie.path, undefined, 'absolute filesystem path is not exposed');

    const ranged = await fetch(`http://127.0.0.1:${bridge.port}${movie.streamUrl}`, {
      headers: { Range: 'bytes=2-5', 'X-Bridge-Token': 'test-token' }
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get('content-range'), 'bytes 2-5/16');
    assert.equal(await ranged.text(), '2345');
  } finally {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('bridge lists configured movie and tv libraries without mixing generic qBittorrent save path', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lampa-libraries-'));
  const moviesDir = path.join(tempDir, 'FILMS');
  const tvDir = path.join(tempDir, 'TV SHOWS');
  const qbitDir = path.join(tempDir, 'Downloads', 'qBittorrent');
  fs.mkdirSync(moviesDir, { recursive: true });
  fs.mkdirSync(tvDir, { recursive: true });
  fs.mkdirSync(qbitDir, { recursive: true });
  fs.writeFileSync(path.join(moviesDir, 'Apex.2026.mkv'), 'movie');
  fs.writeFileSync(path.join(tvDir, 'Show One S01E01.mkv'), 'tv');
  fs.writeFileSync(path.join(qbitDir, 'Temporary.Mixed.Download.mkv'), 'tmp');

  const bridge = await startBridge({
    QBIT_ADD_MODE: 'cli',
    QBIT_BINARY: process.execPath,
    QBIT_MOVIES_PATH: moviesDir,
    QBIT_TV_PATH: tvDir,
    QBIT_SAVE_PATH: qbitDir,
    BRIDGE_TOKEN: 'test-token'
  });

  try {
    const listed = await fetch(`http://127.0.0.1:${bridge.port}/downloads`, {
      headers: { 'X-Bridge-Token': 'test-token' }
    });
    assert.equal(listed.status, 200);
    const json = await listed.json();
    assert.equal(json.ok, true);
    assert.equal(json.items.length, 2);
    assert.ok(json.items.find((item) => item.name === 'Apex.2026.mkv' && item.type === 'movie'));
    assert.ok(json.items.find((item) => item.name === 'Show One S01E01.mkv' && item.type === 'tv'));
    assert.equal(json.items.find((item) => item.name === 'Temporary.Mixed.Download.mkv'), undefined);
  } finally {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('bridge deletes downloaded files by id without accepting raw paths', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lampa-delete-'));
  const moviesDir = path.join(tempDir, 'FILMS');
  fs.mkdirSync(moviesDir, { recursive: true });
  const movieFile = path.join(moviesDir, 'Delete.Me.mkv');
  fs.writeFileSync(movieFile, 'delete me');

  const bridge = await startBridge({
    QBIT_ADD_MODE: 'cli',
    QBIT_BINARY: process.execPath,
    LAMPA_DOWNLOAD_ROOTS: moviesDir,
    BRIDGE_TOKEN: 'test-token'
  });

  try {
    const listedResponse = await fetch(`http://127.0.0.1:${bridge.port}/downloads`, {
      headers: { 'X-Bridge-Token': 'test-token' }
    });
    assert.equal(listedResponse.status, 200);
    const listed = await listedResponse.json();
    const id = listed.items[0].id;

    const unsafe = await fetch(`http://127.0.0.1:${bridge.port}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': 'test-token' },
      body: JSON.stringify({ path: movieFile })
    });
    assert.equal(unsafe.status, 500);
    assert.equal(fs.existsSync(movieFile), true);

    const deleted = await fetch(`http://127.0.0.1:${bridge.port}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': 'test-token' },
      body: JSON.stringify({ id })
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { ok: true, deleted: true });
    assert.equal(fs.existsSync(movieFile), false);
  } finally {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
