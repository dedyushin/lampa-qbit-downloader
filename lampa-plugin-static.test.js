'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

function pluginSource() {
  return fs.readFileSync(path.join(__dirname, 'lampa-qbit-download.js'), 'utf8');
}

test('Lampa plugin exposes explicit movie and TV download menu actions', () => {
  const source = pluginSource();
  assert.match(source, /qbit_download_menu_movie:\s*\{ ru: 'Скачать как фильм'/);
  assert.match(source, /qbit_download_menu_tv:\s*\{ ru: 'Скачать как сериал'/);
  assert.match(source, /contentType:\s*'movie'/);
  assert.match(source, /contentType:\s*'tv'/);
  assert.match(source, /download\(item\.element, item\.contentType \|\| ''\)/);
});
