(function () {
  'use strict';

  var PLUGIN_ID = 'lampa_getstv_online';
  var COMPONENT_ID = 'getstv_online_component';
  var MENU_FLAG = '__lampa_getstv_online';
  var MENU_ACTION = 'getstv_online_current';
  var CARD_BUTTON_CLASS = 'getstv-online-button';
  var componentRegistered = false;
  var lastKnownCard = null;

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

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (symbol) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[symbol];
    });
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

  function titleValues(value) {
    if (!value) return [];
    if (typeof value !== 'object') return [String(value || '')];
    return [value.ru, value.en, value.original, value.name].filter(Boolean).map(function (item) {
      return String(item || '');
    });
  }

  function unique(values) {
    var seen = {};
    return values.map(function (item) {
      return String(item || '').trim();
    }).filter(function (item) {
      var key = item.toLowerCase();
      if (!item || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function rememberCard(card) {
    if (card && typeof card === 'object') lastKnownCard = card;
    return card || null;
  }

  function activeCard() {
    try {
      var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      var activity = active && (active.activity || active);
      var card = (
        (activity && (activity.card || activity.object || activity.movie)) ||
        (active && (active.card || active.object || active.movie)) ||
        null
      );
      return rememberCard(card) || lastKnownCard;
    } catch (error) {
      return lastKnownCard;
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

  function originalCardTitle(card) {
    return titleText(card && (card.original_title || card.original_name || card.title || card.name));
  }

  function queryCandidates(card, preferred) {
    var values = [];
    if (preferred) values.push(preferred);
    if (card) {
      values = values.concat(
        titleValues(card.title),
        titleValues(card.name),
        titleValues(card.original_title),
        titleValues(card.original_name),
        titleValues(card.Title),
        titleValues(card.Name)
      );
      if (card.names && card.names.length) values = values.concat(card.names);
      if (card.alternative_titles && card.alternative_titles.titles) {
        card.alternative_titles.titles.forEach(function (item) {
          values.push(item && item.title);
        });
      }
    }
    return unique(values.length ? values : [cardTitle(card)]);
  }

  function openGetstvSource(card) {
    card = rememberCard(card || activeCard());
    var title = cardTitle(card);
    if (!title) return notify('GETS TV: откройте карточку фильма или сериала');

    registerGetstvComponent();

    Lampa.Activity.push({
      url: '',
      title: 'GETS TV',
      component: COMPONENT_ID,
      search: title,
      search_one: title,
      search_two: originalCardTitle(card),
      movie: card,
      page: 1
    });
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

  function playUrlForMedia(media, requestedQuality) {
    var quality = requestedQuality || storage('getstv_online_quality', 'auto');
    var url = '/getstv/play/' + encodeURIComponent(media.id);
    if (quality && quality !== 'ask') url += '?quality=' + encodeURIComponent(quality);
    return url;
  }

  function loadStreams(media, movie, requestedQuality, options) {
    var quality = requestedQuality || storage('getstv_online_quality', 'auto');

    requestBridgeGet(playUrlForMedia(media, quality), function (json) {
      var streams = json.streams || (json.stream ? [json.stream] : []);
      if (!streams.length) return notify('GETS TV: потоков нет');
      if (quality && quality !== 'ask') return playStream(json.stream || streams[0], media, movie, options);
      showStreams(streams, media, movie, options);
    }, function (error) {
      notify('GETS TV: ' + error.message);
    });
  }

  function showStreams(streams, media, movie, options) {
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
        playStream(selected.stream, media, movie, options);
      }
    });
  }

  function addGetstvTemplates() {
    Lampa.Template.add('getstv_online_item', '<div class="online selector">' +
      '<div class="online__body">' +
      '<div style="position:absolute;left:0;top:-0.3em;width:2.4em;height:2.4em">' +
      '<svg style="height:2.4em;width:2.4em" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="64" cy="64" r="56" stroke="white" stroke-width="16"/>' +
      '<path d="M90.5 64.4 50 87.8V41l40.5 23.4Z" fill="white"/>' +
      '</svg>' +
      '</div>' +
      '<div class="online__title" style="padding-left:2.1em;">{title}</div>' +
      '<div class="online__quality" style="padding-left:3.4em;">{quality}{info}</div>' +
      '</div>' +
      '</div>');
  }

  function registerGetstvComponent() {
    if (componentRegistered) return;
    addGetstvTemplates();
    Lampa.Component.add(COMPONENT_ID, getstvComponent);
    componentRegistered = true;
  }

  function getstvComponent(object) {
    var component = this;
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Files(object);
    var filter = new Lampa.Filter(object);
    var network = { clear: function () {} };
    var last = false;
    var lastFilter = false;
    var selectedResult = null;
    var searchResults = [];
    var currentMovie = null;
    var currentMedia = [];
    var translations = [];
    var seasons = [];
    var selectedTranslation = '';
    var selectedSeason = null;
    var selectedQuality = storage('getstv_online_quality', 'auto');

    var qualityItems = [
      { title: 'Лучшее', quality: 'auto' },
      { title: '1080p', quality: '1080' },
      { title: '720p', quality: '720' },
      { title: '480p', quality: '480' },
      { title: '360p', quality: '360' },
      { title: '240p', quality: '240' },
      { title: 'Спросить', quality: 'ask' }
    ];

    scroll.body().addClass('torrent-list');

    function minus() {
      scroll.minus(window.innerWidth > 580 ? false : files.render().find('.files__left'));
    }

    function resultLabel(item) {
      return [titleText(item.title || item.titleText), item.year].filter(Boolean).join(' / ');
    }

    function translationName(media, index) {
      return media.trName || media.title || ('Перевод ' + (index + 1));
    }

    function preferredTranslation(items) {
      var names = unique(items.map(function (media, index) {
        return translationName(media, index);
      }));
      return names.find(function (name) { return /^дубляж$/i.test(name); }) ||
        names.find(function (name) { return /lostfilm/i.test(name); }) ||
        names[0] ||
        '';
    }

    function collectTranslations(items) {
      return unique(items.map(function (media, index) {
        return translationName(media, index);
      }));
    }

    function timelineBaseTitle(movie) {
      var card = object.movie || {};
      return titleText(card.original_name || card.original_title || card.name || card.title || card.Title || card.Name) ||
        titleText(movie && (movie.original_name || movie.original_title || movie.title || movie.titleText)) ||
        'GETS TV';
    }

    function timelineHash(media, movie) {
      var base = timelineBaseTitle(movie);
      if (media && (media.season || media.episode)) {
        return Lampa.Utils.hash([media.season || 1, media.episode || 1, base].join(''));
      }
      return Lampa.Utils.hash(base);
    }

    function viewedHash(media, movie, index) {
      var base = timelineBaseTitle(movie);
      var voice = translationName(media, index);
      if (media && (media.season || media.episode)) {
        return Lampa.Utils.hash([media.season || 1, media.episode || 1, base, voice].join(''));
      }
      return Lampa.Utils.hash(base + voice);
    }

    function watchedList() {
      return Lampa.Storage.cache('online_view', 5000, []);
    }

    function timelineFor(media, movie) {
      if (!Lampa.Timeline || !Lampa.Timeline.view) return null;
      return Lampa.Timeline.view(timelineHash(media, movie));
    }

    function seasonValue(media) {
      var season = media && media.season;
      if (season === undefined || season === null || season === '') return null;
      return String(season);
    }

    function seasonTitle(season) {
      return season ? 'Сезон ' + season : '';
    }

    function collectSeasons(items) {
      return unique(items.map(seasonValue).filter(Boolean)).sort(function (a, b) {
        return Number(a) - Number(b);
      });
    }

    function sortedMedia(items) {
      return items.slice().sort(function (a, b) {
        return Number(a.season || 0) - Number(b.season || 0) || Number(a.episode || 0) - Number(b.episode || 0);
      });
    }

    function lastEpisode(items) {
      return items.reduce(function (max, media) {
        return Math.max(max, Number(media.episode || 0));
      }, 0);
    }

    function preferredSeason(items, movie) {
      var viewed = watchedList();
      var progressMedia = null;
      var viewedMedia = null;

      sortedMedia(items).forEach(function (media, index) {
        var timeline = timelineFor(media, movie);
        if (timeline && timeline.percent > 0 && timeline.percent < 95) progressMedia = media;
        if (viewed.indexOf(viewedHash(media, movie, index)) !== -1) viewedMedia = media;
      });

      return seasonValue(progressMedia) || seasonValue(viewedMedia) || '';
    }

    function ensureSeasonButton() {
      var line = filter.render().find('.filter--sort').parent();
      if (line.find('.filter--season').length) return;

      var button = $('<div class="simple-button simple-button--filter selector filter--season hide"><span>Сезон</span><div class="hide"></div></div>');
      button.on('hover:enter', function () {
        filter.show('Сезон', 'season');
      });
      line.find('.filter--sort').after(button);
    }

    function qualityTitle() {
      var item = qualityItems.find(function (candidate) {
        return String(candidate.quality) === String(selectedQuality || 'auto');
      });
      return item ? item.title : 'Лучшее';
    }

    function persistQuality(value) {
      selectedQuality = value || 'auto';
      if (Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set('getstv_online_quality', selectedQuality);
    }

    function setFilterState() {
      var translatedMedia = currentMedia.filter(function (media, index) {
        return !selectedTranslation || translationName(media, index) === selectedTranslation;
      });

      seasons = collectSeasons(translatedMedia);
      if (seasons.length && seasons.indexOf(String(selectedSeason || '')) === -1) {
        selectedSeason = preferredSeason(translatedMedia, currentMovie) || seasons[0];
      }
      if (!seasons.length) selectedSeason = null;

      filter.set('sort', translations.map(function (name) {
        return { title: name, translation: name, selected: name === selectedTranslation };
      }));
      filter.chosen('sort', selectedTranslation ? [selectedTranslation] : []);

      filter.set('season', seasons.map(function (season) {
        return { title: seasonTitle(season), season: season, selected: String(season) === String(selectedSeason || '') };
      }));
      filter.chosen('season', selectedSeason ? [seasonTitle(selectedSeason)] : []);
      filter.render().find('.filter--season')
        .toggleClass('selector', seasons.length > 1)
        .toggleClass('hide', seasons.length > 1 ? false : true);

      filter.set('filter', qualityItems.map(function (item) {
        return { title: item.title, quality: item.quality, selected: String(item.quality) === String(selectedQuality || 'auto') };
      }));
      filter.chosen('filter', [qualityTitle()]);
    }

    function reset() {
      last = false;
      scroll.render().find('.empty').remove();
      filter.render().detach();
      scroll.clear();
      scroll.append(filter.render());
      setFilterState();
    }

    function append(item) {
      item.on('hover:focus', function (event) {
        last = event.target;
        scroll.update($(event.target), true);
      });
      scroll.append(item);
    }

    function loading(status) {
      if (status) component.activity.loader(true);
      else {
        component.activity.loader(false);
        component.activity.toggle();
      }
    }

    function empty(message) {
      var emptyElement = Lampa.Template.get('list_empty');
      if (message) emptyElement.find('.empty__descr').text(message);
      scroll.append(emptyElement);
      loading(false);
    }

    function visibleMedia() {
      return sortedMedia(currentMedia.filter(function (media, index) {
        var translationMatch = !selectedTranslation || translationName(media, index) === selectedTranslation;
        var seasonMatch = !selectedSeason || seasonValue(media) === String(selectedSeason);
        return translationMatch && seasonMatch;
      }));
    }

    function itemTitle(media, index, mediaItems) {
      if (media.season || media.episode) {
        return [
          media.season ? 'Сезон ' + media.season : '',
          media.episode ? 'Серия ' + media.episode : ''
        ].filter(Boolean).join(' / ');
      }
      return mediaItems.length > 1 ? (media.sourceType || media.quality || 'Смотреть') : 'Смотреть';
    }

    function playlistMedia(startMedia) {
      if (!startMedia || selectedQuality === 'ask') return [];
      var items = sortedMedia(currentMedia.filter(function (media, index) {
        return !selectedTranslation || translationName(media, index) === selectedTranslation;
      }));
      var startIndex = items.findIndex(function (media) {
        return media.id === startMedia.id;
      });
      return startIndex >= 0 ? items.slice(startIndex) : [];
    }

    function playlistFor(startMedia, movie, firstStream) {
      return playlistMedia(startMedia).map(function (media, index) {
        var cell = {
          title: itemTitle(media, index, [media]),
          timeline: timelineFor(media, movie)
        };

        if (object.movie) cell.card = object.movie;

        if (media.id === startMedia.id) {
          cell.url = firstStream.url;
        } else {
          cell.url = function (call) {
            requestBridgeGet(playUrlForMedia(media, selectedQuality), function (json) {
              var streams = json.streams || (json.stream ? [json.stream] : []);
              var stream = json.stream || streams[0] || {};
              cell.url = stream.url || '';
              call();
            }, function () {
              cell.url = '';
              call();
            });
          };
        }

        return cell;
      });
    }

    function markViewed(hashFile, item) {
      if (!hashFile) return;
      var viewed = watchedList();
      if (viewed.indexOf(hashFile) !== -1) return;
      viewed.push(hashFile);
      if (item && item.append) item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
      Lampa.Storage.set('online_view', viewed);
    }

    function renderMedia(movie) {
      currentMovie = movie;
      currentMedia = movie.media || [];
      translations = collectTranslations(currentMedia);
      if (!selectedTranslation || translations.indexOf(selectedTranslation) === -1) selectedTranslation = preferredTranslation(currentMedia);

      reset();
      var mediaItems = visibleMedia();

      if (!currentMedia.length) return empty('GETS TV: не нашёл варианты воспроизведения');
      if (!mediaItems.length) return empty('GETS TV: нет вариантов для выбранного перевода');

      var viewed = watchedList();
      var focusProgress = null;
      var focusViewed = null;
      var serialLastEpisode = lastEpisode(mediaItems);

      mediaItems.forEach(function (media, index) {
        var timeline = timelineFor(media, movie);
        var hashFile = viewedHash(media, movie, index);
        var itemData = {
          title: escapeHtml(itemTitle(media, index, mediaItems)),
          quality: escapeHtml(translationName(media, index)),
          info: mediaSubtitle(media) ? ' / ' + escapeHtml(mediaSubtitle(media)) : ''
        };
        var item = Lampa.Template.get('getstv_online_item', itemData);

        media.timeline = timeline;
        media.hashFile = hashFile;
        if (media.season) media.translate_episode_end = serialLastEpisode;

        if (timeline && Lampa.Timeline && Lampa.Timeline.render) item.append(Lampa.Timeline.render(timeline));
        if (timeline && Lampa.Timeline && Lampa.Timeline.details) {
          item.find('.online__quality').append(Lampa.Timeline.details(timeline, ' / '));
        }
        if (viewed.indexOf(hashFile) !== -1) {
          item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
          focusViewed = item[0];
        }
        if (timeline && timeline.percent > 0 && timeline.percent < 95) focusProgress = item[0];

        item.addClass('video--stream');
        item.on('hover:enter', function () {
          if (object.movie && object.movie.id && Lampa.Favorite) Lampa.Favorite.add('history', object.movie, 100);
          loadStreams(media, movie, selectedQuality, {
            timeline: timeline,
            card: object.movie,
            playlist: function (stream) {
              return playlistFor(media, movie, stream);
            },
            viewed: function () {
              markViewed(hashFile, item);
            }
          });
        });

        append(item);
      });

      last = focusProgress || focusViewed || last;
      loading(false);
    }

    function loadSelectedMovie(item) {
      selectedResult = item;
      reset();
      loading(true);

      requestBridgeGet('/getstv/movie/' + encodeURIComponent(item.id), function (json) {
        renderMedia(json.movie || {});
      }, function (error) {
        empty('GETS TV: ' + error.message);
      });
    }

    this.create = function () {
      window.addEventListener('resize', minus, false);
      minus();

      filter.onSearch = function (value) {
        object.search = value;
        component.search();
      };

      filter.onBack = function () {
        component.start();
      };

      ensureSeasonButton();

      filter.render().find('.selector').on('hover:focus', function (event) {
        lastFilter = event.target;
      });

      filter.onSelect = function (type, item) {
        if (type === 'sort' && item && item.translation) {
          selectedTranslation = item.translation;
          selectedSeason = null;
          renderMedia(currentMovie || {});
        } else if (type === 'season' && item && item.season) {
          selectedSeason = item.season;
          renderMedia(currentMovie || {});
        } else if (type === 'filter' && item && item.quality) {
          persistQuality(item.quality);
          renderMedia(currentMovie || {});
        } else {
          component.start();
        }
      };

      filter.render().find('.filter--sort span').text('Перевод');
      filter.render().find('.filter--season span').text('Сезон');
      filter.render().find('.filter--filter span').text('Качество');
      filter.render();

      files.append(scroll.render());
      scroll.append(filter.render());

      this.search();

      return this.render();
    };

    this.search = function () {
      loading(true);
      reset();

      var candidates = queryCandidates(object.movie, object.search || object.search_one);
      var index = 0;
      var lastError = null;

      function next() {
        var query = candidates[index++];
        if (!query) {
          if (lastError) return empty('GETS TV: ' + lastError.message);
          return empty('GETS TV: по запросу (' + candidates.join(' / ') + ') нет результатов');
        }

        requestBridgeGet('/getstv/search?q=' + encodeURIComponent(query) + '&limit=15', function (json) {
          searchResults = sortResults(json.items || [], { title: query, year: cardYear(object.movie) });
          if (!searchResults.length) return next();
          loadSelectedMovie(searchResults[0]);
        }, function (error) {
          lastError = error;
          next();
        });
      }

      next();
    };

    this.start = function () {
      if (Lampa.Activity.active().activity !== component.activity) return;

      Lampa.Background.immediately(Lampa.Utils.cardImgBackground(object.movie));

      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || scroll.render().find('.video--stream.selector')[0] || scroll.render().find('.selector').eq(0)[0] || false, scroll.render());
        },
        up: function () {
          if (Navigator.canmove('up')) {
            if (scroll.render().find('.video--stream.selector').index(last) === 0 && lastFilter) {
              Lampa.Controller.collectionFocus(lastFilter, scroll.render());
            } else Navigator.move('up');
          } else Lampa.Controller.toggle('head');
        },
        down: function () {
          Navigator.move('down');
        },
        right: function () {
          if (Navigator.canmove('right')) Navigator.move('right');
          else filter.show('Качество', 'filter');
        },
        left: function () {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        back: this.back
      });

      Lampa.Controller.toggle('content');
    };

    this.render = function () {
      return files.render();
    };

    this.back = function () {
      Lampa.Activity.backward();
    };

    this.pause = function () {};
    this.stop = function () {};

    this.destroy = function () {
      window.removeEventListener('resize', minus);
      network.clear();
      files.destroy();
      scroll.destroy();
      filter.destroy();
      network = null;
    };
  }

  function playStream(stream, media, movie, options) {
    options = options || {};
    if (!stream || !stream.url) return notify('GETS TV: нет ссылки на поток');
    var title = titleText(movie.title || movie.titleText) || media.trName || 'GETS TV';
    var payload = {
      url: stream.url,
      title: title,
      filename: title + '.m3u8',
      subtitles: []
    };

    if (options.timeline) payload.timeline = options.timeline;
    if (options.card) payload.card = options.card;

    if (Lampa.Player && Lampa.Player.play) {
      Lampa.Player.play(payload);
      if (options.playlist && Lampa.Player.playlist) Lampa.Player.playlist(options.playlist(stream));
      if (options.viewed) options.viewed();
    } else if (window.AndroidJS && AndroidJS.openPlayer) {
      AndroidJS.openPlayer(stream.url, JSON.stringify(payload));
      if (options.viewed) options.viewed();
    } else if (typeof window.open === 'function') {
      window.open(stream.url, '_blank');
      if (options.viewed) options.viewed();
    } else {
      window.location.href = stream.url;
      if (options.viewed) options.viewed();
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
        openGetstvSource();
      }
    });

    [
      ['getstv_online_bridge_url', 'input', null, 'http://192.168.1.149:8787'],
      ['getstv_online_bridge_token', 'input', null, ''],
      ['getstv_online_quality', 'select', { auto: 'Лучшее', 1080: '1080p', 720: '720p', 480: '480p', 360: '360p', 240: '240p', ask: 'Спрашивать' }, 'auto']
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
            openGetstvSource();
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
      openGetstvSource();
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

    var card = rememberCard(cardFromFullEvent(event));
    var button = $(cardButtonHtml());

    button.on('hover:enter', function () {
      openGetstvSource(card);
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
    registerGetstvComponent();
    addCardHook();
    patchSelect();
    addMenuHook();
  });
})();
