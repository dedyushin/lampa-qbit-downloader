'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

function pluginSource(file = 'lampa-qbit-download.js') {
  return fs.readFileSync(path.join(__dirname, file), 'utf8');
}

test('main Lampa downloader plugin exposes only explicit movie and TV download menu actions', () => {
  const source = pluginSource();
  assert.match(source, /qbit_download_menu_movie:\s*\{ ru: 'Скачать как фильм'/);
  assert.match(source, /qbit_download_menu_tv:\s*\{ ru: 'Скачать как сериал'/);
  assert.match(source, /contentType:\s*'movie'/);
  assert.match(source, /contentType:\s*'tv'/);
  assert.match(source, /download\(item\.element, item\.contentType \|\| ''\)/);
  assert.doesNotMatch(source, /qbit_download_open_downloads/);
  assert.doesNotMatch(source, /AndroidJS\.openPlayer/);
  assert.doesNotMatch(source, /\/downloads/);
  assert.doesNotMatch(source, /\/delete/);
});


test('separate media plugin exposes downloaded files browser actions', () => {
  const source = pluginSource('lampa-qbit-media.js');
  assert.match(source, /PLUGIN_ID = 'lampa_qbit_media'/);
  assert.match(source, /qbit_media_open_downloads:\s*\{ ru: 'Скачанное'/);
  assert.match(source, /\/downloads/);
  assert.match(source, /AndroidJS\.openPlayer/);
  assert.match(source, /\/delete/);
  assert.match(source, /type:\s*'button'/);
  assert.match(source, /function groupDownloads/);
  assert.match(source, /function mediaNameInfo/);
  assert.match(source, /yearMatch = original\.match/);
  assert.match(source, /function cardYear/);
  assert.match(source, /year === wantedYear\) score \+= 80/);
  assert.match(source, /year !== wantedYear\) score -= 70/);
  assert.match(source, /function episodeInfo/);
  assert.match(source, /function fileDisplay/);
  assert.match(source, /qbit_media_episode:\s*\{ ru: 'Эпизод'/);
  assert.match(source, /qbit_media_season:\s*\{ ru: 'Сезон'/);
  assert.match(source, /ep\.season \* 1000 \+ ep\.episode/);
  assert.match(source, /function librarySummary/);
  assert.match(source, /self\.buildLibraries/);
  assert.match(source, /self\.buildCategory/);
  assert.match(source, /qbit_media_movies:\s*\{ ru: 'Фильмы'/);
  assert.match(source, /qbit_media_tv:\s*\{ ru: 'Сериалы'/);
  assert.match(source, /libraryType === 'movie' \? \(folder \|\| item\.id \|\| item\.name\)/);
  assert.match(source, /function mediaLibraryComponent/);
  assert.match(source, /Lampa\.Component\.add\(COMPONENT_ID, mediaLibraryComponent\)/);
  assert.match(source, /MENU_ACTION = 'qbit_media_downloads'/);
  assert.match(source, /function loadMetadata/);
  assert.match(source, /function bestSearchCard/);
  assert.match(source, /function posterUrlsFromLibrary/);
  assert.match(source, /function categoryPosterHtml/);
  assert.match(source, /qbit-media-collage/);
  assert.match(source, /movies\.groups\.concat\(tv\.groups\)/);
  assert.match(source, /categoryPosterHtml\(library, title\)/);
  assert.match(source, /function openLampaCard/);
  assert.match(source, /function restoreMediaController/);
  assert.match(source, /Lampa\.Controller\.toggle\(COMPONENT_ID\)/);
  assert.match(source, /restoreMediaController\(\)/);
  assert.match(source, /onBack:\s*function \(\) \{\s*restoreMediaController\(\);\s*\}/);
  assert.match(source, /qbit_media_files:\s*\{ ru: 'файлов'/);
  assert.match(source, /qbit_media_no_folder:\s*\{ ru: 'Без папки'/);
  assert.match(source, /qbit_media_bridge_url', 'input', '', 'http:\/\/192\.168\.1\.149:8787'/);
  assert.match(source, /qbit_media_bridge_token', 'input', '', ''/);
});
