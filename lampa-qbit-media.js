(function () {
  'use strict';

  var PLUGIN_ID = 'lampa_qbit_media';
  var COMPONENT_ID = 'qbit_media_library';
  var MENU_ACTION = 'qbit_media_downloads';
  var CARD_BUTTON_CLASS = 'qbit-media-card-button';

  if (window[PLUGIN_ID]) return;
  window[PLUGIN_ID] = true;

  function ready(fn) {
    if (window.appready) fn();
    else {
      Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') fn();
      });
    }
  }

  function storage(name, fallback) {
    var value = Lampa.Storage.field(name);
    return value === undefined || value === null || value === '' ? fallback : value;
  }

  function cleanUrl(url) {
    return String(url || '').replace(/\/+$/, '');
  }

  function notify(text) {
    if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(text);
  }

  function bridgeBaseUrl() {
    return cleanUrl(storage('qbit_media_bridge_url', storage('qbit_download_bridge_url', 'http://192.168.1.149:8787')));
  }

  function bridgeToken() {
    return storage('qbit_media_bridge_token', storage('qbit_download_bridge_token', ''));
  }

  function withToken(url) {
    var token = bridgeToken();
    if (!token) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(token);
  }

  function requestJson(url, payload, success, fail) {
    var headers = { 'Content-Type': 'application/json' };
    var token = bridgeToken();
    if (token) headers['X-Bridge-Token'] = token;

    fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.text().then(function (text) {
        var json = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch (error) {
          json = { ok: response.ok, response: text };
        }
        if (!response.ok || json.ok === false) throw new Error(json.error || json.response || response.status);
        success(json);
      });
    }).catch(function (error) {
      fail(error);
    });
  }

  function requestGet(url, success, fail) {
    var headers = {};
    var token = bridgeToken();
    if (token) headers['X-Bridge-Token'] = token;

    fetch(url, { method: 'GET', headers: headers }).then(function (response) {
      return response.text().then(function (text) {
        var json = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch (error) {
          json = { ok: response.ok, response: text };
        }
        if (!response.ok || json.ok === false) throw new Error(json.error || json.response || response.status);
        success(json);
      });
    }).catch(function (error) {
      fail(error);
    });
  }

  function humanSize(bytes) {
    var value = Number(bytes || 0);
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value = value / 1024;
      unit += 1;
    }
    return (unit ? value.toFixed(value >= 10 ? 1 : 2) : String(value)) + ' ' + units[unit];
  }

  function asLower(value) {
    return String(value || '').toLowerCase();
  }

  function transliterateCyrillic(value) {
    var map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
      к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
      х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
    };
    return asLower(value).replace(/[а-яё]/g, function (char) { return map[char] || char; });
  }

  function normalizeMatchText(value) {
    return transliterateCyrillic(value)
      .replace(/\.[a-z0-9]{2,5}$/i, ' ')
      .replace(/[._-]+/g, ' ')
      .replace(/[^a-z0-9а-яё]+/ig, ' ')
      .replace(/\b(s\d{1,2}e\d{1,3}|s\d{1,2}|season|episode|2160p|1080p|720p|480p|4k|uhd|hdr|dv|dovi|web|webdl|web dl|webrip|bluray|bdrip|remux|hevc|avc|x264|x265|h264|h265)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchVariants(value) {
    var normalized = normalizeMatchText(value);
    var variants = [normalized];
    if (normalized) variants.push(normalized.replace(/yo/g, 'e'));
    return variants.filter(function (item, index) {
      return item && variants.indexOf(item) === index;
    });
  }

  function absoluteBridgeUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return bridgeBaseUrl() + path;
  }

  function restoreMediaController() {
    setTimeout(function () {
      try {
        var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
        if (active && active.component === COMPONENT_ID && Lampa.Controller && Lampa.Controller.toggle) {
          Lampa.Controller.toggle(COMPONENT_ID);
        }
      } catch (error) {}
    }, 0);
  }

  function playDownload(item) {
    var url = withToken(absoluteBridgeUrl(item.streamUrl));
    var payload = {
      url: url,
      title: item.name || 'Lampa download',
      filename: item.name || 'video',
      subtitles: []
    };

    if (window.AndroidJS && AndroidJS.openPlayer) {
      AndroidJS.openPlayer(url, JSON.stringify(payload));
    } else if (typeof window.open === 'function') {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }

    markWatched(item);
    restoreMediaController();
  }

  function deleteDownload(item, done) {
    requestJson(bridgeBaseUrl() + '/delete', { id: item.id }, function () {
      notify('Удалено: ' + item.name);
      if (done) done();
    }, function (error) {
      notify('Удаление: ' + error.message);
    });
  }

  function deleteGroup(group, done) {
    var index = 0;
    function next() {
      if (index >= group.files.length) {
        notify('Удалено: ' + group.title);
        if (done) done();
        return;
      }
      deleteDownload(group.files[index++], next);
    }
    next();
  }

  function mediaNameInfo(value) {
    var original = String(value || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
    var yearMatch = original.match(/\b(19|20)\d{2}\b/);
    var year = yearMatch ? yearMatch[0] : '';
    var text = original
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[._-]+/g, ' ')
      .replace(/[–—]+/g, ' ')
      .replace(/\bS\d{1,2}E\d{1,2}\b/ig, ' ')
      .replace(/\bS\d{1,2}\b/ig, ' ')
      .replace(/\bSeason\s*\d+\b/ig, ' ')
      .replace(/\bEpisode\s*\d+\b/ig, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\bDDP?\s*\d+(\s*\d+)?\b/ig, ' ')
      .replace(/\bDTS\s*HD\b/ig, ' ')
      .replace(/\bH\s*26[45]\b/ig, ' ')
      .replace(/\b(HDR10?|HDR|DV|DVT|DoVi|Dolby\s*Vision|HEVC|AVC|REMUX|BDREMUX|BluRay|BDRip|WEB\s*DL|WEBRip|WEB|HDTV|NF|AMZN|MA|MAX|HMAX|ATVP|DSNP|iTunes|RGzsRutracker)\b/ig, ' ')
      .replace(/\b(2160p|1080p|720p|480p|4K|UHD|x26[45]|Atmos|TrueHD|AAC|AC3|EAC3|DTS|Proper|Repack|Open\s*Matte)\b/ig, ' ')
      .replace(/\b(Rus|Eng|Ukr|Multi|Sub|Subs|LostFilm|NewStudio|Jaskier|HDRezka)\b/ig, ' ')
      .replace(/\bH\b/ig, ' ')
      .replace(/\b\d+\s*\d*\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { title: text || original, year: year };
  }

  function cleanMediaName(value) {
    return mediaNameInfo(value).title;
  }

  function guessInfoFromGroup(folder, files) {
    var base = folder && folder !== Lampa.Lang.translate('qbit_media_no_folder') ? folder : (files[0] && files[0].name) || '';
    var info = mediaNameInfo(base);
    if (!info.year && files && files[0]) info.year = mediaNameInfo(files[0].name).year;
    return info;
  }

  function guessTitleFromGroup(folder, files) {
    return guessInfoFromGroup(folder, files).title;
  }

  function savedMetadataFromFiles(files, libraryType) {
    var found = null;
    (files || []).some(function (item) {
      if (item.metadata && typeof item.metadata === 'object') {
        var usable = usableMetaCard(item.metadata, libraryType);
        found = {
          card: item.metadata,
          type: item.metadata.media_type || libraryType || (item.metadata.name ? 'tv' : 'movie'),
          saved: true,
          hint: !usable
        };
        return true;
      }
      return false;
    });
    return found;
  }

  function groupDownloads(items, libraryType) {
    var groups = {};
    (items || []).filter(function (item) {
      return item.type === libraryType;
    }).forEach(function (item) {
      var folder = item.folder || '';
      var key = libraryType === 'movie' ? (folder || item.id || item.name) : (folder || Lampa.Lang.translate('qbit_media_no_folder'));
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return Object.keys(groups).sort(function (a, b) {
      return a.localeCompare(b);
    }).map(function (folder) {
      var files = groups[folder].sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      var size = files.reduce(function (total, item) {
        return total + Number(item.size || 0);
      }, 0);
      var savedMeta = savedMetadataFromFiles(files, libraryType);
      var info = libraryType === 'movie' && files.length === 1 ? mediaNameInfo(files[0].name) : guessInfoFromGroup(folder, files);
      if (savedMeta && savedMeta.card && !savedMeta.hint) {
        info.title = savedMeta.card.title || savedMeta.card.name || savedMeta.card.original_title || savedMeta.card.original_name || info.title;
        info.year = String(savedMeta.card.release_date || savedMeta.card.first_air_date || savedMeta.card.year || info.year || '').slice(0, 4);
      }
      return {
        folder: folder,
        libraryType: libraryType,
        files: files,
        size: size,
        title: info.title,
        year: info.year,
        meta: savedMeta
      };
    });
  }

  function librarySummary(items, type) {
    var filtered = (items || []).filter(function (item) { return item.type === type; });
    var size = filtered.reduce(function (total, item) { return total + Number(item.size || 0); }, 0);
    var groups = groupDownloads(items, type);
    return { type: type, files: filtered, groups: groups, size: size };
  }

  function cacheKey(group) {
    return 'qbit_media_meta_' + String((group && group.title) || '').toLowerCase().replace(/[^a-zа-я0-9]+/ig, '_').slice(0, 80) + '_' + String((group && group.year) || 'any');
  }

  function cardYear(card) {
    return String((card && (card.release_date || card.first_air_date)) || '').slice(0, 4);
  }

  function genericCardTitle(card) {
    var title = String(card && (card.title || card.name || card.original_title || card.original_name || '')).toLowerCase().trim();
    return /^(торренты|torrent|torrents|детектив|detective|боевик|action|комедия|comedy|драма|drama|мелодрама|триллер|thriller|ужасы|horror|фантастика|sci fi|фэнтези|fantasy|мультфильм|animation|документальный|documentary)$/.test(title);
  }

  function episodeOnlyMetaCard(card, libraryType) {
    if (!card || libraryType !== 'tv') return false;
    if (card.poster_path || card.profile_path || card.backdrop_path || card.original_name || card.first_air_date || card.number_of_seasons || card.number_of_episodes) return false;
    if (card.season_number || card.episode_number || card.still_path) return true;

    var title = String(card.title || card.name || '').trim();
    return /^(эпизод|episode)\s*\d+$/i.test(title);
  }

  function usableMetaCard(card, libraryType) {
    if (!card || typeof card !== 'object' || genericCardTitle(card)) return false;
    if (episodeOnlyMetaCard(card, libraryType)) return false;
    return !!(card.poster_path || card.profile_path || card.backdrop_path || card.original_title || card.original_name || card.release_date || card.first_air_date || card.overview || card.name || card.title);
  }

  function cardSearchTitleVariants(card) {
    return matchVariants([card.title, card.name, card.original_title, card.original_name].filter(Boolean).join(' '));
  }

  function normalizeSearchGroups(results, fallbackType) {
    var groups = [];

    function pushGroup(type, items) {
      var list = (items || []).filter(Boolean);
      if (list.length) groups.push({ type: type || fallbackType || '', results: list });
    }

    if (!results) return groups;

    if (Array.isArray(results)) {
      results.forEach(function (entry) {
        if (!entry) return;
        if (entry.results) pushGroup(entry.type || entry.media_type || fallbackType, entry.results);
        else if (entry.movie || entry.tv) {
          if (entry.movie) pushGroup('movie', entry.movie.results || entry.movie);
          if (entry.tv) pushGroup('tv', entry.tv.results || entry.tv);
        } else {
          pushGroup(entry.media_type || (entry.name ? 'tv' : entry.title ? 'movie' : fallbackType), [entry]);
        }
      });
    } else if (results.movie || results.tv) {
      if (results.movie) pushGroup('movie', results.movie.results || results.movie);
      if (results.tv) pushGroup('tv', results.tv.results || results.tv);
    } else if (results.results) {
      pushGroup(results.type || results.media_type || fallbackType, results.results);
    }

    return groups;
  }

  function bestSearchCard(groups, group) {
    var best = null;
    var query = group.title;
    var queryVariants = matchVariants(query);
    var wantedYear = String(group.year || '');

    normalizeSearchGroups(groups, group.libraryType).forEach(function (resultGroup) {
      (resultGroup.results || []).forEach(function (card) {
        if (genericCardTitle(card)) return;
        var type = resultGroup.type || card.media_type || (card.name ? 'tv' : 'movie');
        if (group.libraryType && type && type !== group.libraryType) return;

        var titleVariants = cardSearchTitleVariants(card);
        var year = cardYear(card);
        var score = 0;
        queryVariants.forEach(function (queryTitle) {
          titleVariants.forEach(function (resultTitle) {
            if (resultTitle === queryTitle) score += 100;
            else if (resultTitle.indexOf(queryTitle) >= 0 || queryTitle.indexOf(resultTitle) >= 0) score += 50;
          });
        });
        if (wantedYear && year === wantedYear) score += 80;
        else if (wantedYear && year && year !== wantedYear) score -= 70;
        if (card.poster_path) score += 10;
        if (card.vote_average) score += Number(card.vote_average);
        if (score > 0 && (!best || score > best.score)) best = { score: score, card: card, type: type };
      });
    });

    return best && best.card && best.score >= 50 ? { card: best.card, type: best.type } : null;
  }

  function searchTmdb(query, done) {
    try {
      if (Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.search) {
        return Lampa.Api.sources.tmdb.search({ query: query }, function (results) {
          done(results || []);
        });
      }

      if (Lampa.Api && Lampa.Api.search) {
        return Lampa.Api.search({ query: query }, function (result) {
          done([result.movie, result.tv].filter(Boolean));
        });
      }
    } catch (error) {}

    done(null);
  }

  function searchCub(query, done) {
    try {
      if (!Lampa.Api || !Lampa.Api.sources || !Lampa.Api.sources.cub || !Lampa.Api.sources.cub.discovery) return done(null);
      var source = Lampa.Api.sources.cub.discovery();
      source.search({ query: encodeURIComponent(query) }, function (results) {
        done(results || []);
      });
    } catch (error) {
      done(null);
    }
  }

  function loadMetadata(group, done) {
    if (group.meta && group.meta.card && !group.meta.hint) return done(group);

    var query = group.title;
    if (!query || !Lampa.Api) return done(group);

    var key = cacheKey(group);
    var cached = Lampa.Storage.get(key, '{}');
    var cachedIsTmdb = cached && cached.provider === 'tmdb' && cached.card && usableMetaCard(cached.card, group.libraryType);
    if (cachedIsTmdb) {
      group.meta = cached;
      return done(group);
    }

    searchTmdb(query, function (tmdbResults) {
      var match = bestSearchCard(tmdbResults, group);
      if (match) {
        match.provider = 'tmdb';
        group.meta = match;
        Lampa.Storage.set(key, match);
        return done(group);
      }

      searchCub(query, function (cubResults) {
        match = bestSearchCard(cubResults, group);
        if (match) {
          match.provider = 'cub';
          group.meta = match;
          Lampa.Storage.set(key, match);
        }
        done(group);
      });
    });
  }

  function loadAllMetadata(groups, done) {
    var index = 0;
    function next() {
      if (index >= groups.length) return done(groups);
      loadMetadata(groups[index++], function () {
        next();
      });
    }
    next();
  }

  function imageUrl(card) {
    if (!card) return '';
    var path = card.poster_path || card.profile_path || card.backdrop_path || '';
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('t/p/w300/' + String(path).replace(/^\//, '')) : '';
  }

  function backdropUrl(card) {
    if (!card) return '';
    var path = card.backdrop_path || card.poster_path || card.img || card.poster || '';
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('t/p/w500/' + String(path).replace(/^\//, '')) : '';
  }

  function escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function posterUrlsFromLibrary(library) {
    var urls = [];
    (library.groups || []).forEach(function (group) {
      var url = group.meta && group.meta.card ? imageUrl(group.meta.card) : '';
      if (url && urls.indexOf(url) === -1) urls.push(url);
    });
    return urls.slice(0, 4);
  }

  function categoryPosterHtml(library, title) {
    var posters = posterUrlsFromLibrary(library);
    if (!posters.length) {
      return '<div class="qbit-media-folder-fallback"><div class="qbit-media-folder-icon">▦</div><div class="qbit-media-folder-name">' + escapeAttr(title) + '</div></div>';
    }
    return '<div class="qbit-media-collage qbit-media-collage--' + posters.length + '">' + posters.map(function (url) {
      return '<img src="' + escapeAttr(url) + '">';
    }).join('') + '<div class="qbit-media-collage-shade"></div></div>';
  }

  function openLampaCard(group) {
    if (!group.meta || !group.meta.card) return notify('Карточка Lampa не найдена');
    var card = group.meta.card;
    Lampa.Activity.push({
      url: '',
      component: 'full',
      id: card.id,
      method: group.meta.type || (card.name ? 'tv' : 'movie'),
      card: card,
      source: 'cub'
    });
  }

  function episodeInfo(item) {
    var name = String((item && item.name) || '');
    var match = name.match(/S(\d{1,2})E(\d{1,3})/i) || name.match(/(\d{1,2})x(\d{1,3})/i);
    if (!match) return null;
    return {
      season: Number(match[1]),
      episode: Number(match[2])
    };
  }

  function watchKey(item) {
    return 'qbit_media_watched_' + String((item && item.id) || (item && item.name) || '').replace(/[^a-z0-9а-я]+/ig, '_').slice(0, 120);
  }

  function isWatched(item) {
    return Lampa.Storage.get(watchKey(item), false) === true;
  }

  function markWatched(item) {
    if (item && item.id) Lampa.Storage.set(watchKey(item), true);
  }

  function fileDisplay(item, group) {
    var ep = episodeInfo(item);
    if (ep && group && group.libraryType === 'tv') {
      return {
        title: Lampa.Lang.translate('qbit_media_episode') + ' ' + ep.episode,
        subtitle: Lampa.Lang.translate('qbit_media_season') + ' - ' + ep.season + ' • ' + humanSize(item.size),
        sort: ep.season * 1000 + ep.episode
      };
    }
    return {
      title: item.name,
      subtitle: humanSize(item.size),
      sort: 999999
    };
  }

  function filePreviewHtml(group) {
    var card = group && group.meta && group.meta.card;
    var url = backdropUrl(card);
    var title = card ? (card.title || card.name || group.title) : (group && group.title) || '';
    if (url) return '<div class="qbit-media-file-preview"><img src="' + escapeAttr(url) + '"></div>';
    return '<div class="qbit-media-file-preview qbit-media-file-preview--fallback">' + escapeAttr(String(title || '?').slice(0, 1).toUpperCase()) + '</div>';
  }

  function fileOverview(group, row) {
    var card = group && group.meta && group.meta.card;
    if (card && card.overview) return card.overview;
    return row.display.subtitle;
  }

  function cardTitle(card) {
    return card && (card.title || card.name || card.original_title || card.original_name || card.Title || card.Name || '');
  }

  function cardContentType(card) {
    if (!card || typeof card !== 'object') return '';
    var direct = asLower(card.media_type || card.type || card.Type || '');
    if (/movie|film|фильм|кино/.test(direct)) return 'movie';
    if (/tv|show|series|serial|episode|сериал|эпизод/.test(direct)) return 'tv';
    if (card.name || card.original_name || card.first_air_date || card.number_of_seasons || card.number_of_episodes) return 'tv';
    if (card.title || card.original_title || card.release_date) return 'movie';
    return '';
  }

  function cardTitleVariants(card) {
    var titles = [
      card && card.title,
      card && card.name,
      card && card.original_title,
      card && card.original_name,
      card && card.Title,
      card && card.Name
    ];
    var result = [];
    titles.forEach(function (title) {
      matchVariants(title).forEach(function (variant) {
        if (variant.length > 2 && result.indexOf(variant) === -1) result.push(variant);
      });
    });
    return result;
  }

  function groupMatchHaystack(group) {
    var parts = [group && group.folder, group && group.title];
    (group && group.files || []).forEach(function (item) {
      parts.push(item.name, item.folder);
      if (item.metadata) {
        parts.push(item.metadata.title, item.metadata.name, item.metadata.original_title, item.metadata.original_name);
      }
    });
    return matchVariants(parts.filter(Boolean).join(' ')).join(' ');
  }

  function groupMatchesCard(group, card) {
    if (!group || !card) return false;
    var wantedType = cardContentType(card);
    if (wantedType && group.libraryType && wantedType !== group.libraryType) return false;

    var cardId = String(card.id || card.tmdb_id || card.movie_id || '');
    if (cardId) {
      var idMatched = (group.files || []).some(function (item) {
        var meta = item.metadata || {};
        var metaId = String(meta.id || meta.tmdb_id || meta.movie_id || '');
        var metaType = meta.media_type || meta.type || '';
        return metaId && metaId === cardId && (!wantedType || !metaType || metaType === wantedType);
      });
      if (idMatched) return true;
    }

    var haystack = groupMatchHaystack(group);
    if (!haystack) return false;
    return cardTitleVariants(card).some(function (title) {
      return haystack.indexOf(title) >= 0;
    });
  }

  function sortedFileRows(group) {
    return group.files.map(function (file) {
      return { file: file, display: fileDisplay(file, group) };
    }).sort(function (a, b) {
      return a.display.sort === b.display.sort ? String(a.file.name || '').localeCompare(String(b.file.name || '')) : a.display.sort - b.display.sort;
    });
  }

  function showFileActions(item, group, refresh) {
    var display = fileDisplay(item, group);
    Lampa.Select.show({
      title: display.title,
      items: [{
        title: Lampa.Lang.translate('qbit_media_play'),
        subtitle: display.subtitle,
        action: 'play'
      }, {
        title: Lampa.Lang.translate('qbit_media_delete'),
        subtitle: item.name,
        action: 'delete'
      }],
      onSelect: function (action) {
        if (action.action === 'delete') deleteDownload(item, refresh);
        else playDownload(item);
      },
      onBack: function () {
        showGroup(group, refresh);
      }
    });
  }

  function showGroup(group, refresh) {
    var items = [];

    if (group.files.length === 1) {
      items.push({ title: Lampa.Lang.translate('qbit_media_play'), subtitle: group.files[0].name, action: 'play' });
    }

    if (group.meta && group.meta.card) {
      items.push({ title: Lampa.Lang.translate('qbit_media_open_card'), subtitle: group.title, action: 'card' });
    }

    if (group.files.length > 1) {
      sortedFileRows(group).forEach(function (row) {
        items.push({ title: row.display.title, subtitle: row.display.subtitle, action: 'file', file: row.file });
      });
    }

    items.push({ title: Lampa.Lang.translate(group.files.length > 1 ? 'qbit_media_delete_all' : 'qbit_media_delete'), subtitle: humanSize(group.size), action: 'delete' });

    Lampa.Select.show({
      title: group.meta && group.meta.card ? (group.meta.card.title || group.meta.card.name || group.title) : group.title,
      items: items,
      onSelect: function (selected) {
        if (selected.action === 'play') playDownload(group.files[0]);
        else if (selected.action === 'card') openLampaCard(group);
        else if (selected.action === 'file') showFileActions(selected.file, group, refresh);
        else if (selected.action === 'delete') deleteGroup(group, refresh);
      },
      onBack: function () { restoreMediaController(); }
    });
  }

  function mediaLibraryComponent(object) {
    var self = this;
    var scroll = new Lampa.Scroll({ mask: true, over: true, step: 300 });
    var html = $('<div class="qbit-media-library"><div class="qbit-media-head"><div class="qbit-media-title">' + Lampa.Lang.translate('qbit_media_open_downloads') + '</div><div class="qbit-media-subtitle">' + Lampa.Lang.translate('qbit_media_loading') + '</div></div><div class="qbit-media-grid"></div></div>');
    var grid = html.find('.qbit-media-grid');
    var last;
    var libraries = [];
    var currentLibrary = null;
    var currentGroup = null;

    this.create = function () {
      self.activity.loader(true);
      scroll.minus();
      scroll.append(html);
      self.load();
      return self.render();
    };

    this.render = function () {
      return scroll.render();
    };

    this.destroy = function () {
      scroll.destroy && scroll.destroy();
      html.remove();
    };

    this.start = function () {
      Lampa.Controller.add(COMPONENT_ID, {
        link: self,
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render());
          Lampa.Controller.collectionFocus(last || scroll.render().find('.selector').get(0), scroll.render(), true);
        },
        up: function () { self.move('up'); },
        down: function () { self.move('down'); },
        left: function () { if (!self.move('left')) Lampa.Controller.toggle('menu'); },
        right: function () { self.move('right'); },
        back: function () {
          if (currentGroup && currentLibrary) {
            if (currentLibrary.cardScope) return Lampa.Activity.backward();
            currentGroup = null;
            self.buildCategory(currentLibrary);
          } else if (currentLibrary) {
            if (currentLibrary.cardScope) return Lampa.Activity.backward();
            currentLibrary = null;
            self.buildLibraries(libraries);
          } else {
            Lampa.Activity.backward();
          }
        }
      });
      Lampa.Controller.toggle(COMPONENT_ID);
    };

    this.focusItem = function (node) {
      if (!node) return false;
      last = node;
      Lampa.Controller.focus(last);
      scroll.update($(last), true);
      return true;
    };

    this.cardMetrics = function (items) {
      return items.map(function (node, i) {
        var rect = node.getBoundingClientRect();
        return {
          node: node,
          index: i,
          rect: rect,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2
        };
      });
    };

    this.sameVisualRow = function (a, b) {
      if (!a || !b) return false;
      var tolerance = Math.max(8, Math.min(a.rect.height || 0, b.rect.height || 0) * 0.35);
      return Math.abs(a.centerY - b.centerY) <= tolerance;
    };

    this.findMoveTarget = function (direction, items, current) {
      var metrics = self.cardMetrics(items);
      var currentIndex = items.indexOf(current);
      var active = metrics[currentIndex];
      if (!active) return null;

      var candidates = metrics.filter(function (candidate) {
        if (candidate.index === active.index) return false;
        if (direction === 'left') return self.sameVisualRow(active, candidate) && candidate.centerX < active.centerX - 5;
        if (direction === 'right') return self.sameVisualRow(active, candidate) && candidate.centerX > active.centerX + 5;
        if (direction === 'up') return candidate.centerY < active.centerY - 5;
        if (direction === 'down') return candidate.centerY > active.centerY + 5;
        return false;
      });

      if (!candidates.length) return null;

      candidates.sort(function (a, b) {
        if (direction === 'left' || direction === 'right') {
          var dxA = Math.abs(a.centerX - active.centerX);
          var dxB = Math.abs(b.centerX - active.centerX);
          return dxA === dxB ? Math.abs(a.centerY - active.centerY) - Math.abs(b.centerY - active.centerY) : dxA - dxB;
        }

        var dyA = Math.abs(a.centerY - active.centerY);
        var dyB = Math.abs(b.centerY - active.centerY);
        var columnA = Math.abs(a.centerX - active.centerX);
        var columnB = Math.abs(b.centerX - active.centerX);
        return dyA === dyB ? columnA - columnB : dyA - dyB;
      });

      return candidates[0].node;
    };

    this.move = function (direction) {
      var items = grid.find('.selector').toArray();
      if (!items.length) return false;
      var current = grid.find('.selector.focus').get(0) || last || items[0];
      var target = self.findMoveTarget(direction, items, current);
      if (!target) return false;
      return self.focusItem(target);
    };

    this.load = function () {
      requestGet(bridgeBaseUrl() + '/downloads', function (json) {
        self.items = json.items || [];
        if (object && object.card) return self.loadCard(object.card);
        var movies = librarySummary(self.items, 'movie');
        var tv = librarySummary(self.items, 'tv');
        if (!movies.files.length && !tv.files.length) return self.empty();
        libraries = [movies, tv];
        loadAllMetadata(movies.groups.concat(tv.groups), function () {
          self.buildLibraries(libraries);
        });
      }, function (error) {
        self.error(error);
      });
    };

    this.loadCard = function (card) {
      var type = cardContentType(card) || 'movie';
      var groups = groupDownloads(self.items, type).filter(function (group) {
        return groupMatchesCard(group, card);
      });
      if (!groups.length) return self.emptyCard(card);

      var files = [];
      var size = 0;
      groups.forEach(function (group) {
        group.meta = { card: card, type: type, saved: true };
        group.title = cardTitle(card) || group.title;
        files = files.concat(group.files);
        size += Number(group.size || 0);
      });

      var library = { type: type, files: files, groups: groups, size: size, cardScope: true, card: card };
      currentLibrary = library;
      libraries = [library];

      if (groups.length === 1) self.buildFileList(groups[0], library);
      else {
        html.find('.qbit-media-title').text(cardTitle(card) || Lampa.Lang.translate('qbit_media_open_downloads'));
        html.find('.qbit-media-subtitle').text(groups.length + ' ' + Lampa.Lang.translate('qbit_media_items') + ' · ' + files.length + ' ' + Lampa.Lang.translate('qbit_media_files'));
        self.build(groups, library);
      }
    };

    this.empty = function () {
      grid.empty().append('<div class="qbit-media-empty">' + Lampa.Lang.translate('qbit_media_empty') + '</div>');
      self.activity.loader(false);
      self.activity.toggle();
    };

    this.emptyCard = function (card) {
      html.find('.qbit-media-title').text(cardTitle(card) || Lampa.Lang.translate('qbit_media_open_downloads'));
      html.find('.qbit-media-subtitle').text(Lampa.Lang.translate('qbit_media_card_empty'));
      grid.empty().append('<div class="qbit-media-empty">' + Lampa.Lang.translate('qbit_media_card_empty') + '</div>');
      self.activity.loader(false);
      self.activity.toggle();
      self.start();
    };

    this.error = function (error) {
      grid.empty().append('<div class="qbit-media-empty">' + Lampa.Lang.translate('qbit_media_error') + ': ' + (error.message || error) + '</div>');
      self.activity.loader(false);
      self.activity.toggle();
    };

    this.buildLibraries = function (libraries) {
      currentLibrary = null;
      currentGroup = null;
      html.removeClass('qbit-media-library--list');
      grid.empty();
      html.find('.qbit-media-title').text(Lampa.Lang.translate('qbit_media_open_downloads'));
      html.find('.qbit-media-subtitle').text(Lampa.Lang.translate('qbit_media_choose_library'));
      last = null;

      libraries.forEach(function (library) {
        if (!library.files.length) return;
        var title = Lampa.Lang.translate(library.type === 'movie' ? 'qbit_media_movies' : 'qbit_media_tv');
        var item = $('<div class="qbit-media-card qbit-media-folder selector"><div class="qbit-media-poster"></div><div class="qbit-media-card-title"></div><div class="qbit-media-card-meta"></div></div>');
        item.find('.qbit-media-poster').append(categoryPosterHtml(library, title));
        item.find('.qbit-media-card-title').text(title);
        item.find('.qbit-media-card-meta').text([library.groups.length + ' ' + Lampa.Lang.translate('qbit_media_items'), library.files.length + ' ' + Lampa.Lang.translate('qbit_media_files'), humanSize(library.size)].join(' · '));
        item.on('hover:focus hover:touch hover:hover', function () {
          last = item.get(0);
          scroll.update(item, true);
        });
        item.on('hover:enter', function () {
          self.buildCategory(library);
        });
        grid.append(item);
      });

      self.activity.loader(false);
      self.activity.toggle();
      self.start();
    };

    this.buildCategory = function (library) {
      currentLibrary = library;
      currentGroup = null;
      html.removeClass('qbit-media-library--list');
      self.activity.loader(true);
      html.find('.qbit-media-title').text(Lampa.Lang.translate(library.type === 'movie' ? 'qbit_media_movies' : 'qbit_media_tv'));
      html.find('.qbit-media-subtitle').text(library.groups.length + ' ' + Lampa.Lang.translate('qbit_media_items'));
      grid.empty();
      last = null;
      loadAllMetadata(library.groups, function (readyGroups) {
        self.build(readyGroups, library);
      });
    };

    this.build = function (groups, library) {
      grid.empty();
      groups.forEach(function (group) {
        var card = group.meta && group.meta.card;
        var poster = imageUrl(card);
        var title = card ? (card.title || card.name || group.title) : group.title;
        var year = card ? String(card.release_date || card.first_air_date || '').slice(0, 4) : '';
        var rating = card && card.vote_average ? Number(card.vote_average).toFixed(1) : '';
        var item = $('<div class="qbit-media-card selector"><div class="qbit-media-poster"></div><div class="qbit-media-card-title"></div><div class="qbit-media-card-meta"></div></div>');
        item.find('.qbit-media-card-title').text(title);
        item.find('.qbit-media-card-meta').text([year, group.files.length + ' ' + Lampa.Lang.translate('qbit_media_files'), humanSize(group.size)].filter(Boolean).join(' · '));
        if (poster) item.find('.qbit-media-poster').append('<img src="' + poster + '"><div class="qbit-media-rating">' + rating + '</div>');
        else item.find('.qbit-media-poster').append('<div class="qbit-media-poster-fallback">' + title.slice(0, 1).toUpperCase() + '</div>');

        item.on('hover:focus hover:touch hover:hover', function () {
          last = item.get(0);
          scroll.update(item, true);
        });
        item.on('hover:enter', function () {
          self.buildFileList(group, library);
        });
        grid.append(item);
      });

      self.activity.loader(false);
      self.activity.toggle();
      self.start();
    };

    this.buildFileList = function (group, library) {
      currentLibrary = library;
      currentGroup = group;
      html.addClass('qbit-media-library--list');
      grid.empty();
      last = null;

      var card = group.meta && group.meta.card;
      var title = card ? (card.title || card.name || group.title) : group.title;
      html.find('.qbit-media-title').text(title);
      html.find('.qbit-media-subtitle').text(group.files.length + ' ' + Lampa.Lang.translate('qbit_media_files') + ' · ' + humanSize(group.size));

      var tools = $('<div class="qbit-media-file-tools"></div>');
      if (group.meta && group.meta.card) {
        var cardButton = $('<div class="qbit-media-tool selector"><div class="qbit-media-tool-title"></div><div class="qbit-media-tool-subtitle"></div></div>');
        cardButton.find('.qbit-media-tool-title').text(Lampa.Lang.translate('qbit_media_open_card'));
        cardButton.find('.qbit-media-tool-subtitle').text(title);
        cardButton.on('hover:focus hover:touch hover:hover', function () {
          last = cardButton.get(0);
          scroll.update(cardButton, true);
        });
        cardButton.on('hover:enter', function () { openLampaCard(group); });
        tools.append(cardButton);
      }

      var deleteButton = $('<div class="qbit-media-tool qbit-media-tool--danger selector"><div class="qbit-media-tool-title"></div><div class="qbit-media-tool-subtitle"></div></div>');
      deleteButton.find('.qbit-media-tool-title').text(Lampa.Lang.translate(group.files.length > 1 ? 'qbit_media_delete_all' : 'qbit_media_delete'));
      deleteButton.find('.qbit-media-tool-subtitle').text(humanSize(group.size));
      deleteButton.on('hover:focus hover:touch hover:hover', function () {
        last = deleteButton.get(0);
        scroll.update(deleteButton, true);
      });
      deleteButton.on('hover:enter', function () {
        deleteGroup(group, function () {
          if (library && library.cardScope) self.load();
          else self.buildCategory(library);
        });
      });
      tools.append(deleteButton);
      grid.append(tools);

      var list = $('<div class="qbit-media-file-list"></div>');
      sortedFileRows(group).forEach(function (row) {
        var watched = isWatched(row.file);
        var ext = String(row.file.name || '').split('.').pop() || '';
        var item = $('<div class="qbit-media-file-row selector"><div class="qbit-media-file-num"></div><div class="qbit-media-file-art"></div><div class="qbit-media-file-body"><div class="qbit-media-file-title"></div><div class="qbit-media-file-subtitle"></div><div class="qbit-media-file-progress"><span></span></div></div><div class="qbit-media-file-side"><div class="qbit-media-file-size"></div><div class="qbit-media-file-ext"></div></div></div>');
        if (watched) item.addClass('qbit-media-file-row--watched');
        item.find('.qbit-media-file-num').text(watched ? '✓' : String((episodeInfo(row.file) || {}).episode || (group.files.length === 1 ? '1' : '')));
        item.find('.qbit-media-file-art').append(filePreviewHtml(group));
        item.find('.qbit-media-file-title').text(group.files.length === 1 && title ? title : row.display.title);
        item.find('.qbit-media-file-subtitle').text(fileOverview(group, row) + (watched ? ' · ' + Lampa.Lang.translate('qbit_media_watched') : ''));
        item.find('.qbit-media-file-size').text(humanSize(row.file.size));
        item.find('.qbit-media-file-ext').text(ext ? '.' + ext : '');
        item.find('.qbit-media-file-progress span').css('width', watched ? '100%' : '0%');
        item.on('hover:focus hover:touch hover:hover', function () {
          last = item.get(0);
          scroll.update(item, true);
        });
        item.on('hover:enter', function () {
          playDownload(row.file);
          item.addClass('qbit-media-file-row--watched');
          item.find('.qbit-media-file-num').text('✓');
          item.find('.qbit-media-file-progress span').css('width', '100%');
        });
        list.append(item);
      });
      grid.append(list);

      self.activity.loader(false);
      self.activity.toggle();
      self.start();
    };

    this.buildEpisodeList = this.buildFileList;
  }

  function openLibrary() {
    Lampa.Activity.push({
      url: '',
      title: Lampa.Lang.translate('qbit_media_open_downloads'),
      component: COMPONENT_ID
    });
  }

  function openCardDownloads(card) {
    if (!card || !cardTitle(card)) return notify('Скачанное: откройте карточку Lampa');

    Lampa.Activity.push({
      url: '',
      title: Lampa.Lang.translate('qbit_media_open_downloads'),
      component: COMPONENT_ID,
      card: card
    });
  }

  function cardFromFullEvent(event) {
    return (
      (event && event.data && (event.data.movie || event.data.card)) ||
      (event && event.object && (event.object.card || event.object.movie)) ||
      null
    );
  }

  function cardButtonHtml() {
    var title = Lampa.Lang.translate('qbit_media_open_downloads');
    return '<div class="full-start__button selector view--downloads ' + CARD_BUTTON_CLASS + '" data-subtitle="' + title + '">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v9.2l3.4-3.4 1.4 1.4L11 16 5.2 10.2l1.4-1.4 3.4 3.4V3h2Zm-7 14h14v3H5v-3Z"/></svg>' +
      '<span>' + title + '</span>' +
      '</div>';
  }

  function addCardButton(event) {
    if (!event || event.type !== 'complite' || !event.object || !event.object.activity) return;

    var render = event.object.activity.render && event.object.activity.render();
    if (!render || !render.find) return;
    if (render.find('.' + CARD_BUTTON_CLASS).length) return;

    var card = cardFromFullEvent(event);
    if (!cardTitle(card)) return;

    var button = $(cardButtonHtml());
    button.on('hover:enter', function () {
      openCardDownloads(card);
    });

    var getstvButton = render.find('.getstv-online-button').last();
    var torrentButton = render.find('.view--torrent').last();
    if (getstvButton.length) getstvButton.after(button);
    else if (torrentButton.length) torrentButton.after(button);
    else {
      var container = render.find('.buttons--container').last();
      if (container.length) container.append(button);
    }
  }

  function addCardHook() {
    Lampa.Listener.follow('full', addCardButton);
  }

  function addMenuItem(event) {
    var body = event && event.body ? event.body : (Lampa.Menu && Lampa.Menu.render && Lampa.Menu.render());
    if (!body || body.find('[data-action="' + MENU_ACTION + '"]').length) return;

    var icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16v4H4V5Zm0 6h16v8H4v-8Zm3 2v2h10v-2H7Z"/></svg>';
    var item = $('<li class="menu__item selector" data-action="' + MENU_ACTION + '"><div class="menu__ico">' + icon + '</div><div class="menu__text">' + Lampa.Lang.translate('qbit_media_open_downloads') + '</div></li>');
    item.on('hover:enter', function () {
      openLibrary();
    });
    item.on('hover:right', function () {
      restoreMediaController();
    });
    body.find('.menu__list:eq(0)').append(item);
  }

  function addSettings() {
    Lampa.Lang.add({
      qbit_media_title: { ru: 'Скачанное с Mac mini', en: 'Mac mini downloads' },
      qbit_media_bridge_url: { ru: 'Bridge URL', en: 'Bridge URL' },
      qbit_media_bridge_token: { ru: 'Bridge токен', en: 'Bridge token' },
      qbit_media_open_downloads: { ru: 'Скачанное', en: 'Downloads' },
      qbit_media_open_downloads_descr: { ru: 'Открыть отдельный раздел скачанного', en: 'Open downloaded media section' },
      qbit_media_play: { ru: 'Воспроизвести', en: 'Play' },
      qbit_media_delete: { ru: 'Удалить', en: 'Delete' },
      qbit_media_delete_all: { ru: 'Удалить всё', en: 'Delete all' },
      qbit_media_delete_hint: { ru: 'Удалить файл с диска', en: 'Delete file from disk' },
      qbit_media_files: { ru: 'файлов', en: 'files' },
      qbit_media_items: { ru: 'папок', en: 'items' },
      qbit_media_movies: { ru: 'Фильмы', en: 'Movies' },
      qbit_media_tv: { ru: 'Сериалы', en: 'TV Shows' },
      qbit_media_choose_library: { ru: 'Выберите раздел', en: 'Choose section' },
      qbit_media_no_folder: { ru: 'Без папки', en: 'No folder' },
      qbit_media_loading: { ru: 'Загружаю медиатеку...', en: 'Loading library...' },
      qbit_media_empty: { ru: 'Скачанных видео не найдено', en: 'No downloaded videos found' },
      qbit_media_card_empty: { ru: 'Для этой карточки скачанные файлы не найдены', en: 'No downloaded files for this card' },
      qbit_media_error: { ru: 'Ошибка загрузки', en: 'Loading error' },
      qbit_media_open_card: { ru: 'Открыть карточку Lampa', en: 'Open Lampa card' },
      qbit_media_episode: { ru: 'Эпизод', en: 'Episode' },
      qbit_media_season: { ru: 'Сезон', en: 'Season' },
      qbit_media_watched: { ru: 'просмотрено', en: 'watched' }
    });

    Lampa.SettingsApi.addComponent({
      component: 'qbit_media',
      name: Lampa.Lang.translate('qbit_media_title'),
      icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16v4H4V5Zm0 6h16v8H4v-8Zm3 2v2h10v-2H7Z"/></svg>'
    });

    Lampa.SettingsApi.addParam({
      component: 'qbit_media',
      param: { name: 'qbit_media_open_downloads', type: 'button' },
      field: {
        name: Lampa.Lang.translate('qbit_media_open_downloads'),
        description: Lampa.Lang.translate('qbit_media_open_downloads_descr')
      },
      onChange: function () {
        openLibrary();
      }
    });

    [
      ['qbit_media_bridge_url', 'input', '', 'http://192.168.1.149:8787'],
      ['qbit_media_bridge_token', 'input', '', '']
    ].forEach(function (row) {
      var param = { name: row[0], type: row[1], values: row[2], default: row[3] };
      Lampa.SettingsApi.addParam({
        component: 'qbit_media',
        param: param,
        field: { name: Lampa.Lang.translate(row[0]) }
      });
    });
  }

  function addStyles() {
    if (document.getElementById('qbit-media-style')) return;
    var style = document.createElement('style');
    style.id = 'qbit-media-style';
    style.textContent = [
      '.qbit-media-library{padding:2.4em 3em 3em 3em;}',
      '.qbit-media-head{margin-bottom:1.6em;}',
      '.qbit-media-title{font-size:2.2em;font-weight:700;color:#fff;}',
      '.qbit-media-subtitle{font-size:1.05em;color:rgba(255,255,255,.6);margin-top:.35em;}',
      '.qbit-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(11.5em,1fr));gap:1.55em;align-items:start;}',
      '.qbit-media-card{border-radius:1em;padding:.55em;background:rgba(255,255,255,.04);transition:.18s transform,.18s background;}',
      '.qbit-media-card.focus,.qbit-media-card:hover{background:rgba(255,255,255,.14);transform:scale(1.045);}',
      '.qbit-media-poster{position:relative;width:100%;aspect-ratio:2/3;border-radius:.75em;overflow:hidden;background:linear-gradient(135deg,#29313d,#12151b);}',
      '.qbit-media-poster img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.qbit-media-poster-fallback{height:100%;display:flex;align-items:center;justify-content:center;font-size:4em;font-weight:800;color:rgba(255,255,255,.8);}',
      '.qbit-media-collage{position:absolute;inset:0;display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:.08em;background:#111722;}',
      '.qbit-media-collage img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.qbit-media-collage--1{display:block;}',
      '.qbit-media-collage--2{grid-template-rows:1fr;}',
      '.qbit-media-collage--3 img:first-child{grid-row:1 / span 2;}',
      '.qbit-media-collage-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.18));}',
      '.qbit-media-folder-fallback{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5em;background:linear-gradient(135deg,#31445f,#151b27);color:#fff;text-align:center;padding:1em;}',
      '.qbit-media-folder-icon{font-size:2.4em;line-height:1;opacity:.9;}',
      '.qbit-media-folder-name{font-size:1.15em;font-weight:800;line-height:1.1;}',
      '.qbit-media-rating{position:absolute;right:.45em;bottom:.45em;background:rgba(0,0,0,.72);border-radius:.35em;padding:.15em .45em;color:#fff;font-size:.95em;font-weight:700;}',
      '.qbit-media-card-title{font-size:1.05em;color:#fff;font-weight:600;margin-top:.7em;line-height:1.18;min-height:2.35em;}',
      '.qbit-media-card-meta{font-size:.82em;color:rgba(255,255,255,.62);line-height:1.25;margin-top:.25em;}',
      '.qbit-media-empty{font-size:1.2em;color:rgba(255,255,255,.7);padding:2em;}',
      '.qbit-media-library--list .qbit-media-grid{display:block;}',
      '.qbit-media-file-tools,.qbit-media-episode-tools{display:flex;gap:1em;margin-bottom:1.15em;max-width:92em;}',
      '.qbit-media-tool{min-width:15em;border-radius:.55em;background:rgba(255,255,255,.06);padding:.75em 1em;transition:.18s background,.18s transform;}',
      '.qbit-media-tool.focus,.qbit-media-tool:hover{background:rgba(255,255,255,.16);transform:scale(1.02);}',
      '.qbit-media-tool--danger{background:rgba(170,50,50,.18);}',
      '.qbit-media-tool-title{font-size:1.08em;color:#fff;font-weight:700;}',
      '.qbit-media-tool-subtitle{font-size:.86em;color:rgba(255,255,255,.58);margin-top:.2em;}',
      '.qbit-media-file-list{display:flex;flex-direction:column;gap:.9em;max-width:92em;}',
      '.qbit-media-file-row{display:flex;align-items:stretch;min-height:6.6em;border-radius:.45em;background:rgba(255,255,255,.06);overflow:hidden;transition:.18s background,.18s transform;}',
      '.qbit-media-file-row.focus,.qbit-media-file-row:hover{background:rgba(255,255,255,.15);transform:scale(1.006);}',
      '.qbit-media-file-row--watched{opacity:.74;}',
      '.qbit-media-file-num{width:3.4em;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.36);color:#fff;font-size:1.35em;font-weight:800;flex:0 0 auto;}',
      '.qbit-media-file-art{width:12.5em;flex:0 0 auto;background:rgba(0,0,0,.18);}',
      '.qbit-media-file-preview{width:100%;height:100%;min-height:6.6em;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#29313d,#12151b);color:rgba(255,255,255,.8);font-size:2.4em;font-weight:800;overflow:hidden;}',
      '.qbit-media-file-preview img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.qbit-media-file-body{flex:1;padding:1em 1.25em .75em 1.25em;min-width:0;}',
      '.qbit-media-file-title{font-size:1.55em;color:#fff;font-weight:500;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.qbit-media-file-subtitle{font-size:.98em;color:rgba(255,255,255,.72);margin-top:.52em;line-height:1.25;max-height:2.5em;overflow:hidden;}',
      '.qbit-media-file-progress{height:.2em;background:rgba(255,255,255,.28);margin-top:.78em;border-radius:1em;overflow:hidden;}',
      '.qbit-media-file-progress span{display:block;height:100%;background:#d8d8d8;transition:.2s width;}',
      '.qbit-media-file-side{width:8em;padding:.9em 1em;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:.35em;color:#fff;flex:0 0 auto;}',
      '.qbit-media-file-size{font-size:1.05em;background:rgba(255,255,255,.1);border-radius:.35em;padding:.18em .45em;white-space:nowrap;}',
      '.qbit-media-file-ext{font-size:1.08em;font-weight:700;color:rgba(255,255,255,.84);}',
      '.qbit-media-episode-list{display:flex;flex-direction:column;gap:.8em;max-width:60em;}',
      '.qbit-media-episode-row{display:flex;align-items:stretch;min-height:5.6em;border-radius:.45em;background:rgba(255,255,255,.045);overflow:hidden;transition:.18s background,.18s transform;}',
      '.qbit-media-episode-row.focus,.qbit-media-episode-row:hover{background:rgba(255,255,255,.14);transform:scale(1.01);}',
      '.qbit-media-episode-row--watched{opacity:.72;}',
      '.qbit-media-episode-index{width:2.2em;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);color:#fff;font-size:1.35em;font-weight:800;}',
      '.qbit-media-episode-body{flex:1;padding:.75em 1em .65em 1em;min-width:0;}',
      '.qbit-media-episode-title{font-size:1.45em;color:#fff;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.qbit-media-episode-subtitle{font-size:.92em;color:rgba(255,255,255,.68);margin-top:.4em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.qbit-media-episode-progress{height:.18em;background:rgba(255,255,255,.24);margin-top:.72em;border-radius:1em;overflow:hidden;}',
      '.qbit-media-episode-progress span{display:block;height:100%;background:#d8d8d8;transition:.2s width;}',
      '.qbit-media-episode-side{width:6.2em;padding:.72em .75em;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:.3em;color:#fff;}',
      '.qbit-media-episode-size{font-size:1.05em;background:rgba(255,255,255,.08);border-radius:.35em;padding:.18em .45em;}',
      '.qbit-media-episode-ext{font-size:1.08em;font-weight:700;color:rgba(255,255,255,.82);}'
    ].join('\n');
    document.head.appendChild(style);
  }

  ready(function () {
    addStyles();
    addSettings();
    Lampa.Component.add(COMPONENT_ID, mediaLibraryComponent);
    addCardHook();
    Lampa.Listener.follow('menu', function (event) {
      if (event.type === 'start') addMenuItem(event);
      if (event.type === 'action' && event.action === MENU_ACTION) {
        event.abort && event.abort();
        openLibrary();
      }
    });
    setTimeout(function () { addMenuItem(); }, 500);
  });
})();
