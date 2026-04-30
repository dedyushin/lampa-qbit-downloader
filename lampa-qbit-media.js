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

  function cleanMediaName(value) {
    var text = String(value || '')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\([^)]*(?:rip|web|dl|hdr|dv|hevc|h\.264|x264|x265|aac|dts|rus|eng)[^)]*\)/ig, ' ')
      .replace(/\b(S\d{1,2}E\d{1,2}|S\d{1,2}|Season\s*\d+|Episode\s*\d+)\b/ig, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|hdr10|dv|dolby|vision|web[-_. ]?dl|webrip|bluray|bdrip|hdtv|hevc|h265|h264|x265|x264|aac|dts|truehd|atmos|proper|repack|amzn|nf|itunes|lostfilm|newstudio)\b/ig, ' ')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text || String(value || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  }

  function guessTitleFromGroup(folder, files) {
    var base = folder && folder !== Lampa.Lang.translate('qbit_media_no_folder') ? folder : (files[0] && files[0].name) || '';
    return cleanMediaName(base);
  }

  function groupDownloads(items) {
    var groups = {};
    (items || []).forEach(function (item) {
      var folder = item.folder || Lampa.Lang.translate('qbit_media_no_folder');
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(item);
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
      return {
        folder: folder,
        files: files,
        size: size,
        title: guessTitleFromGroup(folder, files)
      };
    });
  }

  function cacheKey(query) {
    return 'qbit_media_meta_' + String(query || '').toLowerCase().replace(/[^a-zа-я0-9]+/ig, '_').slice(0, 80);
  }

  function bestSearchCard(groups, query) {
    var best = null;
    var queryLower = String(query || '').toLowerCase();

    (groups || []).forEach(function (group) {
      (group.results || []).forEach(function (card) {
        var title = String(card.title || card.name || card.original_title || card.original_name || '').toLowerCase();
        var score = 0;
        if (title === queryLower) score += 100;
        if (title.indexOf(queryLower) >= 0 || queryLower.indexOf(title) >= 0) score += 50;
        if (card.poster_path) score += 10;
        if (card.vote_average) score += Number(card.vote_average);
        if (!best || score > best.score) best = { score: score, card: card, type: group.type || card.media_type || (card.name ? 'tv' : 'movie') };
      });
    });

    return best && best.card ? { card: best.card, type: best.type } : null;
  }

  function loadMetadata(group, done) {
    var query = group.title;
    if (!query || !Lampa.Api || !Lampa.Api.sources || !Lampa.Api.sources.cub || !Lampa.Api.sources.cub.discovery) return done(group);

    var key = cacheKey(query);
    var cached = Lampa.Storage.get(key, '{}');
    if (cached && cached.card) {
      group.meta = cached;
      return done(group);
    }

    try {
      var source = Lampa.Api.sources.cub.discovery();
      source.search({ query: encodeURIComponent(query) }, function (results) {
        var match = bestSearchCard(results, query);
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

  function showFileActions(item, group, refresh) {
    Lampa.Select.show({
      title: item.name,
      items: [{
        title: Lampa.Lang.translate('qbit_media_play'),
        subtitle: humanSize(item.size),
        action: 'play'
      }, {
        title: Lampa.Lang.translate('qbit_media_delete'),
        subtitle: Lampa.Lang.translate('qbit_media_delete_hint'),
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
      group.files.forEach(function (file) {
        items.push({ title: file.name, subtitle: humanSize(file.size), action: 'file', file: file });
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
      }
    });
  }

  function mediaLibraryComponent(object) {
    var self = this;
    var scroll = new Lampa.Scroll({ mask: true, over: true, step: 300 });
    var html = $('<div class="qbit-media-library"><div class="qbit-media-head"><div class="qbit-media-title">' + Lampa.Lang.translate('qbit_media_open_downloads') + '</div><div class="qbit-media-subtitle">' + Lampa.Lang.translate('qbit_media_loading') + '</div></div><div class="qbit-media-grid"></div></div>');
    var grid = html.find('.qbit-media-grid');
    var last;

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
        back: function () { Lampa.Activity.backward(); }
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
        var groups = groupDownloads(json.items || []);
        if (!groups.length) return self.empty();

        html.find('.qbit-media-subtitle').text(groups.length + ' ' + Lampa.Lang.translate('qbit_media_items'));
        loadAllMetadata(groups, function (readyGroups) {
          self.build(readyGroups);
        });
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

    this.build = function (groups) {
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
          showGroup(group, function () { self.load(); });
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
      qbit_media_no_folder: { ru: 'Без папки', en: 'No folder' },
      qbit_media_loading: { ru: 'Загружаю медиатеку...', en: 'Loading library...' },
      qbit_media_empty: { ru: 'Скачанных видео не найдено', en: 'No downloaded videos found' },
      qbit_media_error: { ru: 'Ошибка загрузки', en: 'Loading error' },
      qbit_media_open_card: { ru: 'Открыть карточку Lampa', en: 'Open Lampa card' }
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
      '.qbit-media-empty{font-size:1.2em;color:rgba(255,255,255,.7);padding:2em;}'
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
