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
  assert.match(source, /metadataFromCard/);
  assert.match(source, /metadata:\s*metadataFromCard/);
  assert.match(source, /download\(item\.element, item\.contentType \|\| '', item\.card \|\| null\)/);
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
  assert.match(source, /savedMetadataFromFiles/);
  assert.match(source, /group\.meta && group\.meta\.card && !group\.meta\.hint\) return done\(group\)/);
  assert.match(source, /function bestSearchCard/);
  assert.match(source, /function searchTmdb/);
  assert.match(source, /Lampa\.Api\.sources\.tmdb\.search/);
  assert.match(source, /function searchCub/);
  assert.match(source, /searchTmdb\(query/);
  assert.match(source, /searchCub\(query/);
  assert.match(source, /best\.score >= 50/);
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
  assert.match(source, /function watchKey/);
  assert.match(source, /function markWatched/);
  assert.match(source, /buildEpisodeList/);
  assert.match(source, /buildFileList/);
  assert.match(source, /qbit-media-library--list/);
  assert.match(source, /qbit-media-file-row/);
  assert.match(source, /qbit-media-file-preview/);
  assert.match(source, /function \(direction, items, current\)/);
  assert.match(source, /sameVisualRow\(active, candidate\) && candidate\.centerX < active\.centerX - 5/);
  assert.match(source, /if \(!target\) return false;/);
  assert.match(source, /Lampa\.Controller\.toggle\('menu'\)/);
  assert.match(source, /item\.on\('hover:right', function \(\) \{\s*restoreMediaController\(\);\s*\}\);/);
  assert.match(source, /qbit_media_files:\s*\{ ru: 'файлов'/);
  assert.match(source, /qbit_media_no_folder:\s*\{ ru: 'Без папки'/);
  assert.match(source, /qbit_media_bridge_url', 'input', '', 'http:\/\/192\.168\.1\.149:8787'/);
  assert.match(source, /qbit_media_bridge_token', 'input', '', ''/);
});

test('GETS TV online plugin is separate from qBittorrent downloader and uses bridge playback API', () => {
  const source = pluginSource('lampa-getstv-online.js');
  assert.match(source, /PLUGIN_ID = 'lampa_getstv_online'/);
  assert.match(source, /COMPONENT_ID = 'getstv_online_component'/);
  assert.match(source, /getstv_online_title:\s*\{ ru: 'GETS TV онлайн'/);
  assert.match(source, /\/getstv\/search/);
  assert.match(source, /\/getstv\/movie\//);
  assert.match(source, /\/getstv\/play\//);
  assert.match(source, /AndroidJS\.openPlayer/);
  assert.match(source, /getstv_online_quality/);
  assert.match(source, /Lampa\.SettingsApi\.addComponent/);
  assert.match(source, /desktopBridgeFallbackAllowed/);
  assert.match(source, /http:\/\/127\.0\.0\.1:8787/);
  assert.match(source, /requestBridgeGet/);
  assert.match(source, /function openGetstvSource/);
  assert.match(source, /Lampa\.Activity\.push\(\{/);
  assert.match(source, /component:\s*COMPONENT_ID/);
  assert.match(source, /Lampa\.Template\.add\('getstv_online_item'/);
  assert.match(source, /class="online selector"/);
  assert.match(source, /Lampa\.Component\.add\(COMPONENT_ID, getstvComponent\)/);
  assert.match(source, /new Lampa\.Files\(object\)/);
  assert.match(source, /new Lampa\.Filter\(object\)/);
  assert.match(source, /new Lampa\.Scroll\(\{ mask: true, over: true \}\)/);
  assert.match(source, /scroll\.body\(\)\.addClass\('torrent-list'\)/);
  assert.match(source, /filter\.render\(\)\.find\('\.filter--sort span'\)\.text\('Перевод'\)/);
  assert.match(source, /filter\.render\(\)\.find\('\.filter--season span'\)\.text\('Сезон'\)/);
  assert.match(source, /filter\.render\(\)\.find\('\.filter--filter span'\)\.text\('Качество'\)/);
  assert.match(source, /selectedQuality = storage\('getstv_online_quality', 'auto'\)/);
  assert.match(source, /function ensureSeasonButton/);
  assert.match(source, /filter\.show\('Сезон', 'season'\)/);
  assert.match(source, /selectedSeason/);
  assert.match(source, /collectSeasons/);
  assert.match(source, /timelineHash/);
  assert.match(source, /Lampa\.Timeline\.view/);
  assert.match(source, /Lampa\.Timeline\.render/);
  assert.match(source, /Lampa\.Timeline\.details/);
  assert.match(source, /online_view/);
  assert.match(source, /preferredSeason/);
  assert.match(source, /playlistFor/);
  assert.match(source, /Lampa\.Player\.play/);
  assert.match(source, /Lampa\.Player\.playlist/);
  assert.match(source, /queryCandidates/);
  assert.match(source, /lastKnownCard/);
  assert.match(source, /translationName/);
  assert.match(source, /visibleMedia/);
  assert.match(source, /Lampa\.Listener\.follow\('full', addCardButton\)/);
  assert.match(source, /full-start__button selector view--online/);
  assert.match(source, /getstv-online-button/);
  assert.match(source, /\.view--torrent/);
  assert.match(source, /patchSelect/);
  assert.doesNotMatch(source, /\/add/);
  assert.doesNotMatch(source, /qbitAdd/);
});

test('plugin server exposes the GETS TV plugin file', () => {
  const source = pluginSource('serve-plugin-only.js');
  assert.match(source, /lampa-getstv-online\.js/);
});

test('bridge exposes GETS TV routes through the existing bridge auth surface', () => {
  const source = pluginSource('qbit-bridge.js');
  assert.match(source, /require\('\.\/getstv-client'\)/);
  assert.match(source, /\/getstv\/search/);
  assert.match(source, /\/getstv\/movie\//);
  assert.match(source, /\/getstv\/media\//);
  assert.match(source, /\/getstv\/play\//);
  assert.match(source, /getGetstvClient\(\)\.search/);
  assert.match(source, /getGetstvClient\(\)\.bestStream/);
});

test('GETS TV client flattens serial seasons without exposing raw movie payload', () => {
  const source = pluginSource('getstv-client.js');
  assert.match(source, /function serialMedia/);
  assert.match(source, /raw\?\.seasons/);
  assert.match(source, /episode\.trs/);
  assert.match(source, /season: translation\.season \|\| season\.seasonNum/);
  assert.match(source, /episode: translation\.episode \|\| episode\.episodeNum/);
  assert.match(source, /function movieMedia/);
  assert.match(source, /media: movieMedia\(raw \|\| \{\}\)/);
  assert.doesNotMatch(source, /\n\s*raw,\n\s*media:/);
});
