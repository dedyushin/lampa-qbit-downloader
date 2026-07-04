(function () {
  'use strict';

  var PLUGIN_ID = 'lampa_qbit_download';
  var MENU_FLAG = '__lampa_qbit_download';

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

  function bool(name) {
    return Lampa.Storage.field(name) === true || Lampa.Storage.field(name) === 'true';
  }

  function cleanUrl(url) {
    return String(url || '').replace(/\/+$/, '');
  }

  function notify(text) {
    if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(text);
  }

  function torrentLink(element) {
    return element && (element.MagnetUri || element.Link || element.link || element.url || element.magnet);
  }

  function asLower(value) {
    return String(value || '').toLowerCase();
  }

  function looksLikeTorrentScreen(card) {
    var title = asLower(card && (card.title || card.name || card.Title || card.Name || ''));
    return /^(торренты|torrents?)$/.test(title);
  }

  function looksLikeContentCard(card) {
    if (!card || typeof card !== 'object' || looksLikeTorrentScreen(card)) return false;
    if (torrentLink(card)) return false;
    if (card.movie || card.card || card.object) return false;
    return !!(
      card.id ||
      card.tmdb_id ||
      card.movie_id ||
      card.poster_path ||
      card.backdrop_path ||
      card.img ||
      card.poster ||
      card.release_date ||
      card.first_air_date ||
      card.original_title ||
      card.original_name ||
      card.number_of_seasons ||
      card.number_of_episodes
    ) && !!cardTitle(card);
  }

  function findContentCard(value, depth, seen) {
    if (!value || typeof value !== 'object' || depth > 5) return null;
    if (seen.indexOf(value) >= 0) return null;
    seen.push(value);

    if (looksLikeContentCard(value)) return value;

    var priority = ['card', 'movie', 'object', 'card_data', 'data', 'cardData', 'source', 'activity', 'params'];
    for (var i = 0; i < priority.length; i++) {
      var found = findContentCard(value[priority[i]], depth + 1, seen);
      if (found) return found;
    }

    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (/^(menu|items|results|element|torrent|torrents)$/i.test(key)) continue;
      var nested = value[key];
      if (!nested || typeof nested !== 'object') continue;
      var result = findContentCard(nested, depth + 1, seen);
      if (result) return result;
    }

    return null;
  }

  function contentTypeFromObject(object) {
    if (!object || typeof object !== 'object') return '';

    var direct = asLower(object.contentType || object.mediaType || object.media_type || object.type || object.Type || object.category || object.Category);
    if (/movie|film|фильм|кино/.test(direct)) return 'movie';
    if (/tv|show|series|serial|episode|сериал|эпизод/.test(direct)) return 'tv';

    if (object.number_of_seasons || object.number_of_episodes || object.season || object.episode || object.Episode || object.Season) return 'tv';
    if (object.original_title || object.release_date || object.year || object.Year) return 'movie';

    return '';
  }

  function activeCard() {
    try {
      var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      var card = findContentCard(active, 0, []);
      return card && !looksLikeTorrentScreen(card) ? card : null;
    } catch (error) {
      return null;
    }
  }

  function inferContentType(element) {
    var fromElement = contentTypeFromObject(element) || contentTypeFromObject(element && element.card) || contentTypeFromObject(element && element.movie);
    if (fromElement) return fromElement;

    try {
      var activity = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      var card = activity && activity.activity && activity.activity.card;
      return contentTypeFromObject(card) || contentTypeFromObject(activity && activity.card) || '';
    } catch (error) {
      return '';
    }
  }

  function cardTitle(card) {
    return card && (card.title || card.name || card.original_title || card.original_name || card.Title || card.Name || '');
  }

  function metadataFromCard(card, element, contentType) {
    card = findContentCard(card, 0, []) || card;
    if (!card || typeof card !== 'object' || looksLikeTorrentScreen(card)) return null;

    var metadata = {
      id: card.id || card.tmdb_id || card.movie_id || '',
      title: card.title || card.name || card.Title || card.Name || '',
      original_title: card.original_title || card.original_name || '',
      release_date: card.release_date || card.first_air_date || '',
      year: card.year || card.Year || '',
      poster_path: card.poster_path || card.img || card.poster || '',
      backdrop_path: card.backdrop_path || card.background_image || card.backdrop || '',
      vote_average: card.vote_average || card.rating || '',
      overview: card.overview || card.description || '',
      media_type: contentType || contentTypeFromObject(card) || inferContentType(element),
      source: 'lampa-card'
    };

    if (!metadata.title && !metadata.original_title) metadata.title = cardTitle(card);
    return metadata.title || metadata.original_title || metadata.id || metadata.poster_path ? metadata : null;
  }

  function requestJson(url, payload, success, fail) {
    var headers = { 'Content-Type': 'application/json' };
    var token = storage('qbit_download_bridge_token', '');
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

  function requestForm(url, form, success, fail) {
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    }).then(function (response) {
      return response.text().then(function (text) {
        if (!response.ok || text.trim() === 'Fails.') throw new Error(text || response.status);
        success(text);
      });
    }).catch(function (error) {
      fail(error);
    });
  }

  function loginDirect(baseUrl, done, fail) {
    var username = storage('qbit_download_username', '');
    var password = storage('qbit_download_password', '');

    if (!username && !password) return done();

    var form = new URLSearchParams();
    form.set('username', username);
    form.set('password', password);

    requestForm(baseUrl + '/api/v2/auth/login', form, function (text) {
      if (String(text).trim() !== 'Ok.') return fail(new Error('qBittorrent auth: ' + text));
      done();
    }, fail);
  }

  function sendDirect(element, link) {
    var baseUrl = cleanUrl(storage('qbit_download_url', 'http://127.0.0.1:8080'));
    var form = new URLSearchParams();
    form.set('urls', link);
    form.set('paused', 'false');

    var savePath = storage('qbit_download_savepath', '');
    var category = storage('qbit_download_category', '');
    var tags = storage('qbit_download_tags', '');

    if (savePath) form.set('savepath', savePath);
    if (category) form.set('category', category);
    if (tags) form.set('tags', tags);
    if (bool('qbit_download_sequential')) form.set('sequentialDownload', 'true');
    if (bool('qbit_download_first_last')) form.set('firstLastPiecePrio', 'true');

    loginDirect(baseUrl, function () {
      requestForm(baseUrl + '/api/v2/torrents/add', form, function () {
        notify('Отправлено в qBittorrent: ' + (element.title || element.Title || 'torrent'));
      }, function (error) {
        notify('qBittorrent: ' + error.message);
      });
    }, function (error) {
      notify('qBittorrent: ' + error.message);
    });
  }

  function sendBridge(element, link, contentType, card) {
    var baseUrl = cleanUrl(storage('qbit_download_bridge_url', 'http://192.168.1.149:8787'));
    var type = contentType || inferContentType(element);
    requestJson(baseUrl + '/add', {
      link: link,
      title: element.title || element.Title || '',
      tracker: element.Tracker || element.tracker || '',
      contentType: type,
      metadata: metadataFromCard(card || activeCard(), element, type),
      savePath: storage('qbit_download_savepath', ''),
      category: storage('qbit_download_category', ''),
      tags: storage('qbit_download_tags', 'lampa'),
      sequential: bool('qbit_download_sequential'),
      firstLastPiece: bool('qbit_download_first_last')
    }, function () {
      notify('Отправлено в qBittorrent: ' + (element.title || element.Title || 'torrent'));
    }, function (error) {
      notify('qBittorrent bridge: ' + error.message);
    });
  }

  function download(element, contentType, card) {
    var link = torrentLink(element);
    if (!link) return notify('Не нашёл magnet или ссылку .torrent');

    if (storage('qbit_download_mode', 'bridge') === 'direct') sendDirect(element, link);
    else sendBridge(element, link, contentType, card);
  }

  function addSettings() {
    Lampa.Lang.add({
      qbit_download_title: { ru: 'qBittorrent загрузка', en: 'qBittorrent download' },
      qbit_download_mode: { ru: 'Режим подключения', en: 'Connection mode' },
      qbit_download_bridge_url: { ru: 'Bridge URL', en: 'Bridge URL' },
      qbit_download_bridge_token: { ru: 'Bridge токен', en: 'Bridge token' },
      qbit_download_url: { ru: 'qBittorrent Web UI URL', en: 'qBittorrent Web UI URL' },
      qbit_download_username: { ru: 'Логин qBittorrent', en: 'qBittorrent username' },
      qbit_download_password: { ru: 'Пароль qBittorrent', en: 'qBittorrent password' },
      qbit_download_savepath: { ru: 'Путь сохранения', en: 'Save path' },
      qbit_download_category: { ru: 'Категория', en: 'Category' },
      qbit_download_tags: { ru: 'Теги', en: 'Tags' },
      qbit_download_sequential: { ru: 'Последовательная загрузка', en: 'Sequential download' },
      qbit_download_first_last: { ru: 'Первый и последний блок', en: 'First and last piece' },
      qbit_download_menu: { ru: 'Скачать в qBittorrent', en: 'Download to qBittorrent' },
      qbit_download_menu_movie: { ru: 'Скачать как фильм', en: 'Download as movie' },
      qbit_download_menu_tv: { ru: 'Скачать как сериал', en: 'Download as TV show' }
    });

    Lampa.SettingsApi.addComponent({
      component: 'qbit_download',
      name: Lampa.Lang.translate('qbit_download_title'),
      icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm1 0v8.59l3.3-3.3 1.4 1.42-5.7 5.7-5.7-5.7 1.4-1.42 3.3 3.3V3h2Z"/></svg>'
    });

    [
      ['qbit_download_mode', 'select', { bridge: 'Bridge на Mac mini', direct: 'Напрямую в qBittorrent' }, 'bridge'],
      ['qbit_download_bridge_url', 'input', null, 'http://192.168.1.149:8787'],
      ['qbit_download_bridge_token', 'input', null, ''],
      ['qbit_download_url', 'input', null, 'http://127.0.0.1:8080'],
      ['qbit_download_username', 'input', null, 'admin'],
      ['qbit_download_password', 'input', null, ''],
      ['qbit_download_savepath', 'input', null, ''],
      ['qbit_download_category', 'input', null, ''],
      ['qbit_download_tags', 'input', null, 'lampa'],
      ['qbit_download_sequential', 'trigger', null, false],
      ['qbit_download_first_last', 'trigger', null, false]
    ].forEach(function (row) {
      var param = { name: row[0], type: row[1], default: row[3] };
      if (row[2]) param.values = row[2];
      Lampa.SettingsApi.addParam({
        component: 'qbit_download',
        param: param,
        field: { name: Lampa.Lang.translate(row[0]) }
      });
    });
  }

  function patchSelect() {
    var original = Lampa.Select.show;
    Lampa.Select.show = function (params) {
      if (params && params.items && params.items.some(function (item) { return item && item[MENU_FLAG]; })) {
        var onSelect = params.onSelect;
        params.onSelect = function (item) {
          if (item && item[MENU_FLAG]) {
            download(item.element, item.contentType || '', item.card || null);
            return;
          }
          if (onSelect) onSelect.apply(this, arguments);
        };
      }
      return original.call(this, params);
    };
  }

  function addMenuHook() {
    Lampa.Listener.follow('torrent', function (event) {
      if (event.type !== 'onlong' || !event.menu || !torrentLink(event.element)) return;
      var sourceCard = findContentCard(event, 0, []) || activeCard();
      event.menu.unshift({
        title: Lampa.Lang.translate('qbit_download_menu_movie'),
        subtitle: event.element.Title || event.element.title || '',
        element: event.element,
        contentType: 'movie',
        card: sourceCard,
        qbit_download: true,
        __lampa_qbit_download: true
      }, {
        title: Lampa.Lang.translate('qbit_download_menu_tv'),
        subtitle: event.element.Title || event.element.title || '',
        element: event.element,
        contentType: 'tv',
        card: sourceCard,
        qbit_download: true,
        __lampa_qbit_download: true
      });
    });
  }

  ready(function () {
    addSettings();
    patchSelect();
    addMenuHook();
  });
})();
