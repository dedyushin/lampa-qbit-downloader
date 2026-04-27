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

  function sendBridge(element, link) {
    var baseUrl = cleanUrl(storage('qbit_download_bridge_url', 'http://192.168.1.149:8787'));
    requestJson(baseUrl + '/add', {
      link: link,
      title: element.title || element.Title || '',
      tracker: element.Tracker || element.tracker || '',
      savePath: storage('qbit_download_savepath', ''),
      category: storage('qbit_download_category', ''),
      tags: storage('qbit_download_tags', ''),
      sequential: bool('qbit_download_sequential'),
      firstLastPiece: bool('qbit_download_first_last')
    }, function () {
      notify('Отправлено в qBittorrent: ' + (element.title || element.Title || 'torrent'));
    }, function (error) {
      notify('qBittorrent bridge: ' + error.message);
    });
  }

  function download(element) {
    var link = torrentLink(element);
    if (!link) return notify('Не нашёл magnet или ссылку .torrent');

    if (storage('qbit_download_mode', 'bridge') === 'direct') sendDirect(element, link);
    else sendBridge(element, link);
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
      qbit_download_menu: { ru: 'Скачать в qBittorrent', en: 'Download to qBittorrent' }
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
      ['qbit_download_category', 'input', null, 'lampa'],
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
            download(item.element);
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
      event.menu.unshift({
        title: Lampa.Lang.translate('qbit_download_menu'),
        subtitle: event.element.Title || event.element.title || '',
        element: event.element,
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
