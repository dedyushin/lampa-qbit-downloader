(function () {
  'use strict';

  var PLUGIN_ID = 'lampa_qbit_media';
  var COMPONENT_ID = 'qbit_media_library';
  var MENU_ACTION = 'qbit_media_downloads';

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

  function absoluteBridgeUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return bridgeBaseUrl() + path;
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
      var info = libraryType === 'movie' && files.length === 1 ? mediaNameInfo(files[0].name) : guessInfoFromGroup(folder, files);
      return {
        folder: folder,
        libraryType: libraryType,
        files: files,
        size: size,
        title: info.title,
        year: info.year
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

  function bestSearchCard(groups, group) {
    var best = null;
    var query = group.title;
    var queryLower = String(query || '').toLowerCase();
    var wantedYear = String(group.year || '');

    (groups || []).forEach(function (resultGroup) {
      (resultGroup.results || []).forEach(function (card) {
        var title = String(card.title || card.name || card.original_title || card.original_name || '').toLowerCase();
        var year = cardYear(card);
        var score = 0;
        if (title === queryLower) score += 100;
        if (title.indexOf(queryLower) >= 0 || queryLower.indexOf(title) >= 0) score += 50;
        if (wantedYear && year === wantedYear) score += 80;
        else if (wantedYear && year && year !== wantedYear) score -= 70;
        if (card.poster_path) score += 10;
        if (card.vote_average) score += Number(card.vote_average);
        if (!best || score > best.score) best = { score: score, card: card, type: resultGroup.type || card.media_type || (card.name ? 'tv' : 'movie') };
      });
    });

    return best && best.card ? { card: best.card, type: best.type } : null;
  }

  function loadMetadata(group, done) {
    var query = group.title;
    if (!query || !Lampa.Api || !Lampa.Api.sources || !Lampa.Api.sources.cub || !Lampa.Api.sources.cub.discovery) return done(group);

    var key = cacheKey(group);
    var cached = Lampa.Storage.get(key, '{}');
    if (cached && cached.card) {
      group.meta = cached;
      return done(group);
    }

    try {
      var source = Lampa.Api.sources.cub.discovery();
      source.search({ query: encodeURIComponent(query) }, function (results) {
        var match = bestSearchCard(results, group);
        if (match) {
          group.meta = match;
          Lampa.Storage.set(key, match);
        }
        done(group);
      });
    } catch (error) {
      done(group);
    }
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

  function stillUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('t/p/w300/' + String(path).replace(/^\//, '')) : '';
  }

  function fileExtension(name) {
    var match = String(name || '').match(/\.([a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : 'mkv';
  }

  function loadEpisodeDetails(group, done) {
    var map = {};
    if (!group || group.libraryType !== 'tv' || !group.meta || !group.meta.card || !group.meta.card.id) return done(map);
    if (!Lampa.Api || !Lampa.Api.sources) return done(map);

    var seasons = {};
    (group.files || []).forEach(function (file) {
      var ep = episodeInfo(file);
      if (ep) seasons[ep.season] = true;
    });

    var seasonList = Object.keys(seasons).map(function (season) { return Number(season); }).filter(Boolean);
    if (!seasonList.length) return done(map);

    try {
      var source = (Lampa.Api.sources.cub && Lampa.Api.sources.cub.seasons) ? Lampa.Api.sources.cub : Lampa.Api.sources.tmdb;
      if (!source || !source.seasons) return done(map);

      source.seasons(group.meta.card, seasonList, function (result) {
        Object.keys(result || {}).forEach(function (seasonNumber) {
          var season = result[seasonNumber] || {};
          (season.episodes || []).forEach(function (episode) {
            var key = Number(seasonNumber) + 'x' + Number(episode.episode_number);
            map[key] = episode;
          });
        });
        done(map);
      });
    } catch (error) {
      done(map);
    }
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

  function sortedFiles(group) {
    return group.files.map(function (file) {
      return { file: file, display: fileDisplay(file, group) };
    }).sort(function (a, b) {
      return a.display.sort === b.display.sort ? String(a.file.name || '').localeCompare(String(b.file.name || '')) : a.display.sort - b.display.sort;
    });
  }

  function showFilesModal(group, refresh) {
    loadEpisodeDetails(group, function (episodeDetails) {
      var title = group.meta && group.meta.card ? (group.meta.card.title || group.meta.card.name || group.title) : group.title;
      var wrap = $('<div class="files qbit-media-files-modal"></div>');
      var fallbackImage = group.meta && group.meta.card ? imageUrl(group.meta.card) : '';

      if (group.meta && group.meta.card) {
        var cardRow = $('<div class="torrent-file selector qbit-media-modal-action"><div class="torrent-file__title"></div><div class="torrent-file__size"></div></div>');
        cardRow.find('.torrent-file__title').text(Lampa.Lang.translate('qbit_media_open_card'));
        cardRow.find('.torrent-file__size').text(title);
        cardRow.data('action', 'card');
        wrap.append(cardRow);
      }

      sortedFiles(group).forEach(function (row) {
        var ep = episodeInfo(row.file);
        var detail = ep ? (episodeDetails[ep.season + 'x' + ep.episode] || {}) : {};
        var episodeTitle = detail.name || row.display.title;
        var airDate = detail.air_date || '';
        var img = stillUrl(detail.still_path) || fallbackImage;
        var line = Lampa.Lang.translate('qbit_media_season') + ' - ' + (ep ? ep.season : '') + (airDate ? ' • ' + Lampa.Lang.translate('qbit_media_air_date') + ' - ' + airDate : '');
        var item = $('<div class="torrent-serial selector layer--visible layer--render qbit-media-episode-row"><img class="torrent-serial__img" /><div class="torrent-serial__content"><div class="torrent-serial__body"><div class="torrent-serial__title"></div><div class="torrent-serial__line"><span></span></div></div><div class="torrent-serial__detail"><div class="torrent-serial__size"></div><div class="torrent-serial__exe"></div></div><div class="torrent-serial__clear"></div></div><div class="torrent-serial__episode"></div></div>');
        item.find('.torrent-serial__img').attr('src', img || '').attr('data-src', img || '');
        item.find('.torrent-serial__title').text(episodeTitle);
        item.find('.torrent-serial__line span').text(line);
        item.find('.torrent-serial__size').text(humanSize(row.file.size));
        item.find('.torrent-serial__exe').text('.' + fileExtension(row.file.name));
        item.find('.torrent-serial__episode').text(ep ? ep.episode : '');
        item.data('action', 'file');
        item.data('file', row.file);
        wrap.append(item);
      });

      var deleteRow = $('<div class="torrent-file selector qbit-media-modal-action"><div class="torrent-file__title"></div><div class="torrent-file__size"></div></div>');
      deleteRow.find('.torrent-file__title').text(Lampa.Lang.translate(group.files.length > 1 ? 'qbit_media_delete_all' : 'qbit_media_delete'));
      deleteRow.find('.torrent-file__size').text(humanSize(group.size));
      deleteRow.data('action', 'delete');
      wrap.append(deleteRow);

      Lampa.Modal.open({
        title: Lampa.Lang.translate('title_files') || 'Файлы',
        html: wrap,
        size: 'large',
        scroll_to_center: true,
        onSelect: function (element) {
          var row = $(element);
          var action = row.data('action');
          if (action === 'card') {
            Lampa.Modal.close();
            openLampaCard(group);
          } else if (action === 'file') {
            Lampa.Modal.close();
            showFileActions(row.data('file'), group, refresh);
          } else if (action === 'delete') {
            Lampa.Modal.close();
            deleteGroup(group, refresh);
          }
        }
      });
    });
  }

  function showGroup(group, refresh) {
    if (group.files.length > 1 && Lampa.Modal && Lampa.Modal.open) return showFilesModal(group, refresh);

    var items = [];

    if (group.files.length === 1) {
      items.push({ title: Lampa.Lang.translate('qbit_media_play'), subtitle: group.files[0].name, action: 'play' });
    }

    if (group.meta && group.meta.card) {
      items.push({ title: Lampa.Lang.translate('qbit_media_open_card'), subtitle: group.title, action: 'card' });
    }

    items.push({ title: Lampa.Lang.translate(group.files.length > 1 ? 'qbit_media_delete_all' : 'qbit_media_delete'), subtitle: humanSize(group.size), action: 'delete' });

    Lampa.Select.show({
      title: group.meta && group.meta.card ? (group.meta.card.title || group.meta.card.name || group.title) : group.title,
      items: items,
      onSelect: function (selected) {
        if (selected.action === 'play') playDownload(group.files[0]);
        else if (selected.action === 'card') openLampaCard(group);
        else if (selected.action === 'delete') deleteGroup(group, refresh);
      }
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
          if (currentLibrary) {
            currentLibrary = null;
            self.buildLibraries(libraries);
          } else {
            Lampa.Activity.backward();
          }
        }
      });
      Lampa.Controller.toggle(COMPONENT_ID);
    };

    this.move = function (direction) {
      var items = grid.find('.selector').toArray();
      if (!items.length) return false;
      var current = last || grid.find('.selector.focus').get(0) || items[0];
      var index = Math.max(0, items.indexOf(current));
      var target = index;
      var currentRect = current.getBoundingClientRect();

      if (direction === 'left') target = index - 1;
      if (direction === 'right') target = index + 1;
      if (direction === 'up' || direction === 'down') {
        var candidates = items.map(function (node, i) {
          var rect = node.getBoundingClientRect();
          return { node: node, index: i, rect: rect, dx: Math.abs((rect.left + rect.width / 2) - (currentRect.left + currentRect.width / 2)) };
        }).filter(function (candidate) {
          return direction === 'up' ? candidate.rect.top < currentRect.top - 5 : candidate.rect.top > currentRect.top + 5;
        }).sort(function (a, b) {
          var dyA = Math.abs(a.rect.top - currentRect.top);
          var dyB = Math.abs(b.rect.top - currentRect.top);
          return dyA === dyB ? a.dx - b.dx : dyA - dyB;
        });
        if (candidates.length) target = candidates[0].index;
      }

      if (target < 0 || target >= items.length || target === index) return false;
      last = items[target];
      Lampa.Controller.focus(last);
      scroll.update($(last), true);
      return true;
    };

    this.load = function () {
      requestGet(bridgeBaseUrl() + '/downloads', function (json) {
        self.items = json.items || [];
        var movies = librarySummary(self.items, 'movie');
        var tv = librarySummary(self.items, 'tv');
        if (!movies.files.length && !tv.files.length) return self.empty();
        libraries = [movies, tv];
        self.buildLibraries(libraries);
      }, function (error) {
        self.error(error);
      });
    };

    this.empty = function () {
      grid.empty().append('<div class="qbit-media-empty">' + Lampa.Lang.translate('qbit_media_empty') + '</div>');
      self.activity.loader(false);
      self.activity.toggle();
    };

    this.error = function (error) {
      grid.empty().append('<div class="qbit-media-empty">' + Lampa.Lang.translate('qbit_media_error') + ': ' + (error.message || error) + '</div>');
      self.activity.loader(false);
      self.activity.toggle();
    };

    this.buildLibraries = function (libraries) {
      currentLibrary = null;
      grid.empty();
      html.find('.qbit-media-title').text(Lampa.Lang.translate('qbit_media_open_downloads'));
      html.find('.qbit-media-subtitle').text(Lampa.Lang.translate('qbit_media_choose_library'));
      last = null;

      libraries.forEach(function (library) {
        if (!library.files.length) return;
        var title = Lampa.Lang.translate(library.type === 'movie' ? 'qbit_media_movies' : 'qbit_media_tv');
        var letter = library.type === 'movie' ? 'Ф' : 'С';
        var item = $('<div class="qbit-media-card qbit-media-folder selector"><div class="qbit-media-poster"></div><div class="qbit-media-card-title"></div><div class="qbit-media-card-meta"></div></div>');
        item.find('.qbit-media-poster').append('<div class="qbit-media-poster-fallback">' + letter + '</div>');
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
          showGroup(group, function () { self.buildCategory(library); });
        });
        grid.append(item);
      });

      self.activity.loader(false);
      self.activity.toggle();
      self.start();
    };
  }

  function openLibrary() {
    Lampa.Activity.push({
      url: '',
      title: Lampa.Lang.translate('qbit_media_open_downloads'),
      component: COMPONENT_ID
    });
  }

  function addMenuItem(event) {
    var body = event && event.body ? event.body : (Lampa.Menu && Lampa.Menu.render && Lampa.Menu.render());
    if (!body || body.find('[data-action="' + MENU_ACTION + '"]').length) return;

    var icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16v4H4V5Zm0 6h16v8H4v-8Zm3 2v2h10v-2H7Z"/></svg>';
    var item = $('<li class="menu__item selector" data-action="' + MENU_ACTION + '"><div class="menu__ico">' + icon + '</div><div class="menu__text">' + Lampa.Lang.translate('qbit_media_open_downloads') + '</div></li>');
    item.on('hover:enter', function () {
      openLibrary();
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
      qbit_media_error: { ru: 'Ошибка загрузки', en: 'Loading error' },
      qbit_media_open_card: { ru: 'Открыть карточку Lampa', en: 'Open Lampa card' },
      qbit_media_episode: { ru: 'Эпизод', en: 'Episode' },
      qbit_media_season: { ru: 'Сезон', en: 'Season' },
      qbit_media_air_date: { ru: 'Выход', en: 'Air date' }
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
      '.qbit-media-rating{position:absolute;right:.45em;bottom:.45em;background:rgba(0,0,0,.72);border-radius:.35em;padding:.15em .45em;color:#fff;font-size:.95em;font-weight:700;}',
      '.qbit-media-card-title{font-size:1.05em;color:#fff;font-weight:600;margin-top:.7em;line-height:1.18;min-height:2.35em;}',
      '.qbit-media-card-meta{font-size:.82em;color:rgba(255,255,255,.62);line-height:1.25;margin-top:.25em;}',
      '.qbit-media-empty{font-size:1.2em;color:rgba(255,255,255,.7);padding:2em;}',
      '.qbit-media-files-modal .torrent-serial__img[src=\"\"]{background:linear-gradient(135deg,#29313d,#12151b);}',
      '.qbit-media-modal-action{margin-bottom:.75em;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  ready(function () {
    addStyles();
    addSettings();
    Lampa.Component.add(COMPONENT_ID, mediaLibraryComponent);
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
