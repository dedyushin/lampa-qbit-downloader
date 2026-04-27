'use strict';

const http = require('http');
const { execFile } = require('child_process');

const env = process.env;
const config = {
  host: env.HOST || '0.0.0.0',
  port: parseInt(env.PORT || '8787', 10),
  qbitUrl: trimRight(env.QBIT_URL || 'http://127.0.0.1:8080'),
  username: env.QBIT_USERNAME || '',
  password: env.QBIT_PASSWORD || '',
  savePath: env.QBIT_SAVE_PATH || '',
  category: env.QBIT_CATEGORY || '',
  tags: env.QBIT_TAGS || '',
  sequential: env.QBIT_SEQUENTIAL === 'true',
  firstLastPiece: env.QBIT_FIRST_LAST_PIECE === 'true',
  bridgeToken: env.BRIDGE_TOKEN || '',
  addMode: env.QBIT_ADD_MODE || 'auto',
  qbitBinary: env.QBIT_BINARY || '/Applications/qBittorrent.app/Contents/MacOS/qbittorrent'
};

let sid = '';

function trimRight(value) {
  return String(value).replace(/\/+$/, '');
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Token, Authorization, Access-Control-Request-Private-Network',
    'Access-Control-Allow-Private-Network': 'true',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getBearerToken(header) {
  const value = String(header || '');
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function isAuthorized(req, url) {
  if (!config.bridgeToken) return true;

  const headerToken = req.headers['x-bridge-token'];
  const bearerToken = getBearerToken(req.headers.authorization);
  const queryToken = url.searchParams.get('token');

  return headerToken === config.bridgeToken || bearerToken === config.bridgeToken || queryToken === config.bridgeToken;
}

function validateTorrentLink(link) {
  const value = String(link || '').trim();
  if (!value) throw new Error('Torrent link is empty');

  const lower = value.toLowerCase();
  if (lower.startsWith('magnet:?')) return value;
  if (lower.startsWith('http://') || lower.startsWith('https://')) return value;

  throw new Error('Unsupported torrent link. Expected magnet, http or https URL');
}

async function qbitLogin() {
  if (!config.username && !config.password) return '';

  const form = new URLSearchParams();
  form.set('username', config.username);
  form.set('password', config.password);

  const response = await fetch(config.qbitUrl + '/api/v2/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: config.qbitUrl
    },
    body: form
  });

  const text = await response.text();
  if (!response.ok || text.trim() !== 'Ok.') {
    throw new Error('qBittorrent login failed: ' + (text || response.status));
  }

  const cookie = response.headers.get('set-cookie') || '';
  sid = (cookie.match(/SID=[^;]+/) || [''])[0];
  return sid;
}

function qbitAddCli(payload) {
  const link = validateTorrentLink(payload.link || payload.url || payload.magnet);
  const savePath = payload.savePath || config.savePath;
  const category = payload.category || config.category;
  const sequential = payload.sequential;
  const firstLastPiece = payload.firstLastPiece;

  const args = ['--skip-dialog=true'];
  if (savePath) args.push('--save-path=' + savePath);
  if (category) args.push('--category=' + category);
  if (typeof sequential === 'boolean' ? sequential : config.sequential) args.push('--sequential');
  if (typeof firstLastPiece === 'boolean' ? firstLastPiece : config.firstLastPiece) args.push('--first-and-last');
  args.push(link);

  return new Promise((resolve, reject) => {
    execFile(config.qbitBinary, args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error('qBittorrent CLI add failed: ' + (stderr || stdout || error.message)));
        return;
      }
      resolve({ ok: true, response: 'Added via qBittorrent CLI' });
    });
  });
}

async function qbitAddWebUi(payload, retry) {
  if (!sid) await qbitLogin();

  const link = validateTorrentLink(payload.link || payload.url || payload.magnet);

  const form = new URLSearchParams();
  form.set('urls', link);
  form.set('paused', 'false');

  const savePath = payload.savePath || config.savePath;
  const category = payload.category || config.category;
  const tags = payload.tags || config.tags;
  const sequential = payload.sequential;
  const firstLastPiece = payload.firstLastPiece;

  if (savePath) form.set('savepath', savePath);
  if (category) form.set('category', category);
  if (tags) form.set('tags', tags);
  if (typeof sequential === 'boolean' ? sequential : config.sequential) form.set('sequentialDownload', 'true');
  if (typeof firstLastPiece === 'boolean' ? firstLastPiece : config.firstLastPiece) form.set('firstLastPiecePrio', 'true');

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Referer: config.qbitUrl
  };
  if (sid) headers.Cookie = sid;

  const response = await fetch(config.qbitUrl + '/api/v2/torrents/add', {
    method: 'POST',
    headers,
    body: form
  });

  const text = await response.text();
  if (response.status === 403 && retry) {
    sid = '';
    return qbitAddWebUi(payload, false);
  }
  if (!response.ok || text.trim() === 'Fails.') {
    throw new Error('qBittorrent add failed: ' + (text || response.status));
  }

  return { ok: true, response: text || 'Ok.' };
}

async function qbitAdd(payload) {
  if (config.addMode === 'cli') return qbitAddCli(payload);
  if (config.addMode === 'webui') return qbitAddWebUi(payload, true);

  try {
    return await qbitAddWebUi(payload, true);
  } catch (error) {
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|qBittorrent login failed|qBittorrent add failed/.test(error.message)) {
      return qbitAddCli(payload);
    }
    throw error;
  }
}

async function qbitStatus() {
  const response = await fetch(config.qbitUrl + '/api/v2/app/version', {
    headers: sid ? { Cookie: sid, Referer: config.qbitUrl } : { Referer: config.qbitUrl }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || String(response.status));
  return text.trim();
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, {});
  }

  try {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, {
        ok: true,
        qbitUrl: config.qbitUrl,
        authEnabled: Boolean(config.bridgeToken)
      });
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      if (!isAuthorized(req, url)) return send(res, 401, { ok: false, error: 'Unauthorized' });
      const version = await qbitStatus();
      return send(res, 200, { ok: true, qbitUrl: config.qbitUrl, qbitVersion: version });
    }

    if (req.method === 'POST' && url.pathname === '/add') {
      if (!isAuthorized(req, url)) return send(res, 401, { ok: false, error: 'Unauthorized' });
      const payload = await readJson(req);
      const result = await qbitAdd(payload);
      return send(res, 200, result);
    }

    return send(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Lampa qBittorrent bridge: http://${config.host}:${config.port}`);
  console.log(`qBittorrent Web API: ${config.qbitUrl}`);
  console.log(`Bridge auth: ${config.bridgeToken ? 'enabled' : 'disabled'}`);
});

server.on('error', (error) => {
  console.error(`Bridge failed to start on ${config.host}:${config.port}: ${error.message}`);
  process.exit(1);
});
