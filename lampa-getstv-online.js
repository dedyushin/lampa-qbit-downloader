(function () {
  'use strict';

  var PLUGIN_ID = 'lampa_getstv_online';
  var MENU_FLAG = '__lampa_getstv_online';
  var MENU_ACTION = 'getstv_online_current';
  var CARD_BUTTON_CLASS = 'getstv-online-button';

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
    return cleanUrl(storage('getstv_online_bridge_url', storage('qbit_download_bridge_url', 'http://192.168.1.149:8787')));
  }

  function desktopBridgeFallbackAllowed() {
    return !/Android|Tizen|WebOS|SmartTV|SMART-TV|TV/i.test(String(navigator.userAgent || ''));
  }

  function bridgeBaseUrls() {
    var primary = bridgeBaseUrl();
    var urls = [primary];
    if (desktopBridgeFallbackAllowed() && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(primary)) {
      urls.push('http://127.0.0.1:8787');
    }
    return urls.filter(function (url, index, list) {
      return url && list.indexOf(url) === index;
    });
  }

  function bridgeToken() {
    return storage('getstv_online_bridge_token', storage('qbit_download_bridge_token', ''));
  }

  function withToken(url) {
    var token = bridgeToken();
    if (!token) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(token);
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

  function requestBridgeGet(path, success, fail) {
    var urls = bridgeBaseUrls();
    var index = 0;

    function next(lastError) {
      if (index >= urls.length) return fail(lastError || new Error('GETS TV bridge недоступен'));
      requestGet(withToken(cleanUrl(urls[index++]) + path), success, function (error) {
        var message = String((error && error.message) || error || '');
        if (index < urls.length && (/failed to fetch|network|load failed/i.test(message) || (error && error.name === 'TypeError'))) next(error);
        else fail(error);
      });
    }

    next();
  }

  function titleText(value) {
    if (!value || typeof value !== 'object') return String(value || '');
    return value.ru || value.en || value.original || value.name || '';
  }

  function activeCard() {
    try {
      var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      var activity = active && (active.activity || active);
      return (
        (activity && (activity.card || activity.object || activity.movie)) ||
        (active && (active.card || active.object || active.movie)) ||
        null
      );
    } catch (error) {
      return null;
    }
  }

  function cardTitle(card) {
    return titleText(card && (card.title || card.name || card.original_title || card.original_name || card.Title || card.Name));
  }

  function cardYear(card) {
    return String((card && (card.release_date || card.first_air_date || card.year || card.Year)) || '').slice(0, 4);
  }

  function queryFromCard(card) {
    return {
      card: card,
      title: cardTitle(card),
      year: cardYear(card)
    };
  }

  function currentQuery() {
    return queryFromCard(activeCard());
  }

  function scoreResult(item, wantedTitle, wantedYear) {
    var title = titleText(item.title || item.titleText).toLowerCase();
    var wanted = String(wantedTitle || '').toLowerCase();
    var score = 0;
    if (title === wanted) score += 100;
    if (title.indexOf(wanted) >= 0 || wanted.indexOf(title) >= 0) score += 50;
    if (wantedYear && String(item.year || '') === String(wantedYear)) score += 80;
    else if (wantedYear && item.year && String(item.year) !== String(wantedYear)) score -= 50;
    return score;
  }

  function sortResults(items, query) {
    return (items || []).slice().sort(function (a, b) {
      return scoreResult(b, query.title, query.year) - scoreResult(a, query.title, query.year);
    });
  }

  function searchCurrentCard(card) {
    var query = card ? queryFromCard(card) : currentQuery();
    if (!query.title) return notify('GETS TV: откройте карточку фильма или сериала');

    notify('GETS TV: ищу ' + query.title);
    requestBridgeGet('/getstv/search?q=' + encodeURIComponent(query.title) + '&limit=10', function (json) {
      var items = sortResults(json.items || [], query);
      if (!items.length) return notify('GETS TV: ничего не найдено');
      showResults(items, query);
    }, function (error) {
      notify('GETS TV: ' + error.message);
    });
  }

  function showResults(items, query) {
    Lampa.Select.show({
      title: 'GETS TV: ' + query.title,
      items: items.map(function (item) {
        return {
          title: titleText(item.title || item.titleText) || 'Без названия',
          subtitle: [item.year, item.type].filter(Boolean).join(' • '),
          movie: item
        };
      }),
      onSelect: function (selected) {
        loadMovie(selected.movie);
      }
    });
  }

  function loadMovie(item) {
    notify('GETS TV: открываю ' + (titleText(item.title || item.titleText) || 'карточку'));
    requestBridgeGet('/getstv/movie/' + encodeURIComponent(item.id), function (json) {
      var movie = json.movie || {};
      if (!movie.media || !movie.media.length) return notify('GETS TV: не нашёл варианты воспроизведения');
      showMedia(movie);
    }, function (error) {
      notify('GETS TV: ' + error.message);
    });
  }

  function mediaTitle(media, index) {
    return media.trName || media.title || ('Вариант ' + (index + 1));
  }

  function mediaSubtitle(media) {
    return [
      media.season ? 'Сезон ' + media.season : '',
      media.episode ? 'Эпизод ' + media.episode : '',
      media.quality || '',
      media.sourceType || ''
    ].filter(Boolean).join(' • ');
  }

  function showMedia(movie) {
    var title = titleText(movie.title || movie.titleText) || 'GETS TV';
    Lampa.Select.show({
      title: title,
      items: movie.media.map(function (media, index) {
        return {
          title: mediaTitle(media, index),
          subtitle: mediaSubtitle(media),
          media: media,
          movie: movie
        };
      }),
      onSelect: function (selected) {
        loadStreams(selected.media, selected.movie);
      }
    });
  }

  function loadStreams(media, movie) {
    var quality = storage('getstv_online_quality', 'ask');
    var url = '/getstv/play/' + encodeURIComponent(media.id);
    if (quality && quality !== 'ask') url += '?quality=' + encodeURIComponent(quality);

    requestBridgeGet(url, function (json) {
      var streams = json.streams || (json.stream ? [json.stream] : []);
      if (!streams.length) return notify('GETS TV: потоков нет');
      if (quality && quality !== 'ask') return playStream(json.stream || streams[0], media, movie);
      showStreams(streams, media, movie);
    }, function (error) {
      notify('GETS TV: ' + error.message);
    });
  }

  function showStreams(streams, media, movie) {
    streams = streams.slice().sort(function (a, b) {
      return Number(b.quality || 0) - Number(a.quality || 0);
    });
    Lampa.Select.show({
      title: media.trName || titleText(movie.title || movie.titleText) || 'GETS TV',
      items: streams.map(function (stream) {
        return {
          title: (stream.quality || 'auto') + 'p',
          subtitle: titleText(movie.title || movie.titleText),
          stream: stream
        };
      }),
      onSelect: function (selected) {
        playStream(selected.stream, media, movie);
      }
    });
  }

  function playStream(stream, media, movie) {
    if (!stream || !stream.url) return notify('GETS TV: нет ссылки на поток');
    var title = titleText(movie.title || movie.titleText) || media.trName || 'GETS TV';
    var payload = {
      url: stream.url,
      title: title,
      filename: title + '.m3u8',
      subtitles: []
    };

    if (window.AndroidJS && AndroidJS.openPlayer) {
      AndroidJS.openPlayer(stream.url, JSON.stringify(payload));
    } else if (typeof window.open === 'function') {
      window.open(stream.url, '_blank');
    } else {
      window.location.href = stream.url;
    }
  }

  function addSettings() {
    Lampa.Lang.add({
      getstv_online_title: { ru: 'GETS TV онлайн', en: 'GETS TV online' },
      getstv_online_bridge_url: { ru: 'Bridge URL', en: 'Bridge URL' },
      getstv_online_bridge_token: { ru: 'Bridge токен', en: 'Bridge token' },
      getstv_online_quality: { ru: 'Качество', en: 'Quality' },
      getstv_online_current: { ru: 'Смотреть в GETS TV', en: 'Watch in GETS TV' },
      getstv_online_current_descr: { ru: 'Найти текущую карточку в GETS TV', en: 'Search current card in GETS TV' }
    });

    Lampa.SettingsApi.addComponent({
      component: 'getstv_online',
      name: Lampa.Lang.translate('getstv_online_title'),
      icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm4 3v8l7-4-7-4Z"/></svg>'
    });

    Lampa.SettingsApi.addParam({
      component: 'getstv_online',
      param: { name: 'getstv_online_current', type: 'button' },
      field: {
        name: Lampa.Lang.translate('getstv_online_current'),
        description: Lampa.Lang.translate('getstv_online_current_descr')
      },
      onChange: function () {
        searchCurrentCard();
      }
    });

    [
      ['getstv_online_bridge_url', 'input', null, 'http://192.168.1.149:8787'],
      ['getstv_online_bridge_token', 'input', null, ''],
      ['getstv_online_quality', 'select', { ask: 'Спрашивать', auto: 'Лучшее', 1080: '1080p', 720: '720p', 480: '480p', 360: '360p', 240: '240p' }, 'ask']
    ].forEach(function (row) {
      var param = { name: row[0], type: row[1], default: row[3] };
      if (row[2]) param.values = row[2];
      Lampa.SettingsApi.addParam({
        component: 'getstv_online',
        param: param,
        field: { name: Lampa.Lang.translate(row[0]) }
      });
    });
  }

  function shouldAddSelectAction(params) {
    if (!params || params[MENU_FLAG] || !params.items || !params.items.length) return false;
    if (!activeCard() || !cardTitle(activeCard())) return false;
    if (params.items.some(function (item) { return item && item[MENU_FLAG]; })) return false;

    var text = String(params.title || '') + ' ' + params.items.map(function (item) {
      return String((item && item.title) || '');
    }).join(' ');

    return /смотреть|торрент|трейлер|избран|заклад|похож|меню|watch|torrent|trailer|favorite/i.test(text);
  }

  function patchSelect() {
    var original = Lampa.Select.show;
    if (original && original[MENU_FLAG]) return;

    function patched(params) {
      if (shouldAddSelectAction(params)) {
        params.items.unshift({
          title: Lampa.Lang.translate('getstv_online_current'),
          subtitle: cardTitle(activeCard()),
          action: 'getstv_online_current',
          __lampa_getstv_online: true
        });
        params[MENU_FLAG] = true;
      }

      var onSelect = params && params.onSelect;
      if (params && params.items && params.items.some(function (item) { return item && item[MENU_FLAG]; })) {
        params.onSelect = function (item) {
          if (item && item[MENU_FLAG]) {
            searchCurrentCard();
            return;
          }
          if (onSelect) onSelect.apply(this, arguments);
        };
      }

      return original.call(this, params);
    }

    patched[MENU_FLAG] = true;
    Lampa.Select.show = patched;
  }

  function addMenuItem(event) {
    var body = event && event.body ? event.body : (Lampa.Menu && Lampa.Menu.render && Lampa.Menu.render());
    if (!body || body.find('[data-action="' + MENU_ACTION + '"]').length) return;

    var icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm4 3v8l7-4-7-4Z"/></svg>';
    var item = $('<li class="menu__item selector" data-action="' + MENU_ACTION + '"><div class="menu__ico">' + icon + '</div><div class="menu__text">' + Lampa.Lang.translate('getstv_online_title') + '</div></li>');
    item.on('hover:enter', function () {
      searchCurrentCard();
    });
    body.find('.menu__list:eq(0)').append(item);
  }

  function addMenuHook() {
    Lampa.Listener.follow('menu', addMenuItem);
    addMenuItem();
  }

  function cardFromFullEvent(event) {
    return (
      (event && event.data && (event.data.movie || event.data.card)) ||
      (event && event.object && (event.object.card || event.object.movie)) ||
      null
    );
  }

  function cardButtonHtml() {
    return '<div class="full-start__button selector view--online ' + CARD_BUTTON_CLASS + '" data-subtitle="GETS TV">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm5 3.5v7l6-3.5-6-3.5Z"/></svg>' +
      '<span>GETS TV</span>' +
      '</div>';
  }

  function addCardButton(event) {
    if (!event || event.type !== 'complite' || !event.object || !event.object.activity) return;

    var render = event.object.activity.render && event.object.activity.render();
    if (!render || !render.find) return;
    if (render.find('.' + CARD_BUTTON_CLASS).length) return;

    var card = cardFromFullEvent(event);
    var button = $(cardButtonHtml());

    button.on('hover:enter', function () {
      searchCurrentCard(card);
    });

    var torrentButton = render.find('.view--torrent').last();
    if (torrentButton.length) torrentButton.after(button);
    else {
      var container = render.find('.buttons--container').last();
      if (container.length) container.append(button);
    }
  }

  function addCardHook() {
    Lampa.Listener.follow('full', addCardButton);
  }

  ready(function () {
    addSettings();
    addCardHook();
    patchSelect();
    addMenuHook();
  });
})();
