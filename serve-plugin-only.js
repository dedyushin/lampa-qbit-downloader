'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8790);
const pluginPath = path.join(__dirname, 'lampa-qbit-download.js');

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);

  if (req.method === 'OPTIONS') return send(res, 204, '');
  if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/lampa-qbit-download.js')) {
    const source = fs.readFileSync(pluginPath);
    return send(res, 200, req.method === 'HEAD' ? '' : source, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': source.length
    });
  }

  return send(res, 404, req.method === 'HEAD' ? '' : 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
});

server.listen(port, host, () => {
  console.log(`Serving only lampa-qbit-download.js at http://${host}:${port}/lampa-qbit-download.js`);
});

server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
