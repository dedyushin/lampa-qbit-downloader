'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_API_ORIGIN = 'https://getstv.com';

function trimRight(value) {
  return String(value || '').replace(/\/+$/, '');
}

function firstExisting(paths) {
  return paths.find((filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });
}

function defaultStatePath(cwd) {
  return (
    firstExisting([
      path.join(cwd, '.getstv-state.json'),
      path.join(cwd, '.getstv-diagnostic.json')
    ]) || path.join(cwd, '.getstv-state.json')
  );
}

function readState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(statePath, state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function fingerprint(state, statePath) {
  if (state.fingerprint) return state.fingerprint;
  state.fingerprint = crypto.randomBytes(16).toString('hex');
  writeState(statePath, state);
  return state.fingerprint;
}

function deviceInfo(env) {
  return {
    type: env.GETSTV_DEVICE_TYPE || 'desktop',
    brand: env.GETSTV_DEVICE_BRAND || 'Apple',
    model: env.GETSTV_DEVICE_MODEL || 'Mac',
    os: env.GETSTV_DEVICE_OS || 'macOS',
    browser: env.GETSTV_DEVICE_BROWSER || 'Chrome',
    userAgent:
      env.GETSTV_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
  };
}

function buildUrl(origin, endpoint, query) {
  const url = new URL(endpoint, origin);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  return url;
}

function tokenFrom(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return (
    payload.token ||
    payload.access_token ||
    payload.accessToken ||
    payload.jwt ||
    payload.data?.token ||
    payload.data?.access_token ||
    payload.user?.token ||
    ''
  );
}

function listFrom(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['items', 'movies', 'results', 'data', 'rows', 'list']) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const key of ['items', 'movies', 'results', 'data', 'rows', 'list']) {
    if (data[key] && typeof data[key] === 'object') {
      const nested = listFrom(data[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function titleText(value) {
  if (!value || typeof value !== 'object') return String(value || '');
  return value.ru || value.en || value.original || value.name || '';
}

function compactMovie(item) {
  const title = item.title || item.titleRu || item.title_ru || item.name || item.originalTitle;
  return {
    id: String(item.id || item._id || item.movieId || item.gtv_id || ''),
    gtvId: item.gtvId || item.gtv_id,
    title,
    titleText: titleText(title),
    year: item.year || item.releaseYear || item.release_year,
    type: item.type || item.contentType || item.content_type || '',
    poster: item.poster || item.posterId || '',
    bgPoster: item.bgPoster || item.bg_poster || ''
  };
}

function compactMedia(item) {
  return {
    id: String(item.id || item._id || item.mediaId || item.media_id || ''),
    title: item.title || item.name || '',
    trName: item.trName || item.tr_name || item.translator || item.translation || '',
    season: item.season || item.s,
    episode: item.episode || item.e,
    duration: item.duration || '',
    sourceType: item.sourceType || item.source_type || '',
    quality: item.quality || ''
  };
}

function serialMedia(raw) {
  const media = [];
  for (const season of raw?.seasons || []) {
    for (const episode of season.episodes || []) {
      for (const translation of episode.trs || []) {
        media.push(compactMedia({
          ...translation,
          season: translation.season || season.seasonNum || season.season,
          episode: translation.episode || episode.episodeNum || episode.episode
        }));
      }
    }
  }
  return media.filter((item) => item.id);
}

function movieMedia(raw) {
  const direct = listFrom({ data: raw?.media || [] }).map(compactMedia).filter((item) => item.id);
  const serial = serialMedia(raw);
  return direct.concat(serial);
}

function normalizeStreams(data) {
  const raw = data && typeof data === 'object' ? data.resolutions || data.streams || data.video || data.urls || [] : [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => ({
        quality: String(item.type || item.quality || item.resolution || ''),
        url: item.url || item.src || item.href || ''
      }))
      .filter((item) => item.url);
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .map(([quality, url]) => ({ quality: String(quality), url: String(url || '') }))
      .filter((item) => item.url);
  }
  return [];
}

function bestStream(streams, preferredQuality) {
  const sorted = [...(streams || [])].sort((a, b) => Number(b.quality || 0) - Number(a.quality || 0));
  if (!preferredQuality || preferredQuality === 'auto') return sorted[0] || null;
  return sorted.find((item) => String(item.quality) === String(preferredQuality)) || sorted[0] || null;
}

function createGetstvClient(options = {}) {
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const origin = trimRight(env.GETSTV_API_ORIGIN || options.apiOrigin || DEFAULT_API_ORIGIN);
  const statePath = env.GETSTV_STATE_PATH || options.statePath || defaultStatePath(cwd);
  const state = readState(statePath);
  const fp = fingerprint(state, statePath);
  let token = env.GETSTV_TOKEN || state.token || '';

  async function request(method, endpoint, { query, body, auth = true, token: requestToken = '' } = {}) {
    const url = buildUrl(origin, endpoint, query);
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: origin,
      Referer: `${origin}/app/`
    };
    if (requestToken) {
      headers.Authorization = `Bearer ${requestToken}`;
    } else if (auth) {
      const bearer = await ensureToken();
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (!response.ok) {
      const message = data && typeof data === 'object' ? data.error || data.message : data;
      throw new Error(`GETS TV ${method} ${endpoint} failed: ${message || response.status}`);
    }
    return data;
  }

  async function login() {
    const email = env.GETSTV_EMAIL || '';
    const password = env.GETSTV_PASSWORD || '';
    if (!email || !password) {
      throw new Error('GETS TV auth required: set GETSTV_EMAIL/GETSTV_PASSWORD or keep a valid GETSTV_TOKEN/state token');
    }

    const data = await request('POST', '/api/login', {
      auth: false,
      body: {
        email,
        password,
        fingerprint: fp,
        device: deviceInfo(env)
      }
    });
    const nextToken = tokenFrom(data);
    if (!nextToken) throw new Error('GETS TV login response did not include token');
    token = nextToken;
    state.token = nextToken;
    state.tokenSavedAt = new Date().toISOString();
    writeState(statePath, state);
    return token;
  }

  async function ensureToken() {
    if (!token) return login();
    if (env.GETSTV_SKIP_TOKEN_CHECK === 'true') return token;

    try {
      await request('GET', '/api/check-token', {
        auth: false,
        query: {
          fingerprint: fp,
          device: deviceInfo(env)
        },
        token
      });
      return token;
    } catch {
      token = '';
      state.token = '';
      writeState(statePath, state);
      return login();
    }
  }

  async function search(query, options = {}) {
    const data = await request('GET', '/api/movies', {
      query: {
        skip: Number(options.skip || 0),
        limit: Number(options.limit || 10),
        searchText: query || ''
      }
    });
    return listFrom(data).map(compactMovie).filter((item) => item.id);
  }

  async function movie(id) {
    const data = await request('GET', `/api/movies/${encodeURIComponent(id)}`);
    const raw = data && data.data ? data.data : data;
    return {
      ...compactMovie(raw || {}),
      media: movieMedia(raw || {})
    };
  }

  async function media(id) {
    const data = await request('GET', `/api/media/${encodeURIComponent(id)}`, {
      query: { format: 'm3u8', protocol: 'https' }
    });
    return {
      media: compactMedia(data.media || {}),
      raw: data,
      streams: normalizeStreams(data)
    };
  }

  return {
    statePath,
    search,
    movie,
    media,
    bestStream
  };
}

module.exports = {
  createGetstvClient,
  compactMovie,
  compactMedia,
  normalizeStreams,
  bestStream
};
