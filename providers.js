// Fournisseurs de données des widgets : chacun charge et met en forme les données d'une section.
// Tous utilisent des API publiques sans clé. `ttl` = durée de cache côté serveur (ms).

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

// ASCII uniquement : certains services refusent les en-têtes avec accents
const UA = 'Kiosque/1.0 (self-hosted dashboard)';
const httpError = (status, message) => Object.assign(new Error(message), { status });

export async function fetchJson(url, { timeout = 12_000, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    throw httpError(502, `Service injoignable (${err.name === 'TimeoutError' ? 'délai dépassé' : err.message})`);
  }
  if (!res.ok) throw httpError(502, `Le service a répondu HTTP ${res.status}`);
  return res.json();
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const shuffle = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

// Date du jour dans le fuseau du dashboard (le conteneur Docker est souvent en UTC)
const todayParts = (timeZone) => {
  const [y, m, d] = new Intl.DateTimeFormat('fr-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-');
  return { y, m, d };
};
const TZ = () => process.env.TZ || 'Europe/Paris';

// ---------------------------------------------------------------- météo (Open-Meteo)

const geocodeCache = new Map();
async function geocode(city) {
  const key = city.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`);
  const place = data.results?.[0];
  if (!place) throw httpError(404, `Ville « ${city} » introuvable`);
  const result = { name: place.name, region: place.admin1 ?? '', country: place.country ?? '', lat: place.latitude, lon: place.longitude };
  geocodeCache.set(key, result);
  return result;
}

const weather = {
  ttl: 15 * 60_000,
  async load(sec) {
    const place = await geocode(sec.city || 'Paris');
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${place.lat}&longitude=${place.lon}&timezone=auto&forecast_days=6&forecast_hours=24`
      + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,precipitation'
      + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset';
    const w = await fetchJson(url);
    return {
      place,
      current: {
        temp: w.current.temperature_2m,
        feels: w.current.apparent_temperature,
        humidity: w.current.relative_humidity_2m,
        wind: w.current.wind_speed_10m,
        code: w.current.weather_code,
        isDay: Boolean(w.current.is_day),
        rain: w.current.precipitation,
      },
      hourly: w.hourly.time.map((time, i) => ({
        time, temp: w.hourly.temperature_2m[i], code: w.hourly.weather_code[i], rain: w.hourly.precipitation_probability[i], isDay: Boolean(w.hourly.is_day[i]),
      })),
      daily: w.daily.time.map((date, i) => ({
        date, code: w.daily.weather_code[i], max: w.daily.temperature_2m_max[i], min: w.daily.temperature_2m_min[i], rain: w.daily.precipitation_probability_max[i],
      })),
      sunrise: w.daily.sunrise[0],
      sunset: w.daily.sunset[0],
    };
  },
};

// ---------------------------------------------------------------- jeux gratuits (Epic Games + GamerPower)

async function epicGames() {
  const data = await fetchJson('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR');
  const isFree = (o) => o?.discountSetting?.discountPercentage === 0;
  return (data.data?.Catalog?.searchStore?.elements ?? []).flatMap((e) => {
    const now = e.promotions?.promotionalOffers?.[0]?.promotionalOffers?.find(isFree);
    const next = e.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.find(isFree);
    const offer = now ?? next;
    if (!offer) return [];
    const img = e.keyImages?.find((k) => k.type === 'OfferImageWide') ?? e.keyImages?.find((k) => k.type === 'DieselStoreFrontWide') ?? e.keyImages?.[0];
    const slug = e.catalogNs?.mappings?.[0]?.pageSlug || e.offerMappings?.[0]?.pageSlug || e.productSlug;
    return [{
      store: 'Epic Games',
      title: e.title,
      image: img?.url ?? null,
      url: slug ? `https://store.epicgames.com/fr/p/${slug.replace(/\/home$/, '')}` : 'https://store.epicgames.com/fr/free-games',
      worth: e.price?.totalPrice?.fmtPrice?.originalPrice ?? null,
      start: offer.startDate,
      end: offer.endDate,
      upcoming: !now,
    }];
  });
}

async function gamerPower(platforms) {
  const list = await fetchJson(`https://www.gamerpower.com/api/filter?platform=${encodeURIComponent(platforms.join('.'))}&type=game&sort-by=popularity`);
  if (!Array.isArray(list)) return [];
  return list.map((g) => ({
    store: g.platforms,
    title: g.title.replace(/\s*\(([^)]*)\)\s*Giveaway$/i, '').replace(/\s*Giveaway$/i, ''),
    image: g.thumbnail,
    url: g.open_giveaway_url,
    worth: g.worth && g.worth !== 'N/A' ? g.worth : null,
    end: g.end_date && g.end_date !== 'N/A' ? new Date(`${g.end_date.replace(' ', 'T')}Z`).toISOString() : null,
    upcoming: false,
  }));
}

const freegames = {
  ttl: 30 * 60_000,
  async load(sec) {
    const sources = sec.sources?.length ? sec.sources : ['epic', 'steam', 'gog'];
    const others = sources.filter((s) => s !== 'epic');
    const results = await Promise.allSettled([
      sources.includes('epic') ? epicGames() : [],
      others.length ? gamerPower(others) : [],
    ]);
    if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
    const games = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set();
    return games
      .filter((g) => { const k = g.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => Number(a.upcoming) - Number(b.upcoming) || (Date.parse(a.end ?? '9999') - Date.parse(b.end ?? '9999')))
      .slice(0, sec.limit || 12);
  },
};

// ---------------------------------------------------------------- bons plans PC (CheapShark)

let storesCache = null;
async function cheapSharkStores() {
  if (storesCache && Date.now() - storesCache.at < 86400_000) return storesCache.data;
  const list = await fetchJson('https://www.cheapshark.com/api/1.0/stores');
  const data = Object.fromEntries(list.map((s) => [s.storeID, { name: s.storeName, icon: `https://www.cheapshark.com${s.images?.icon ?? ''}` }]));
  storesCache = { at: Date.now(), data };
  return data;
}

const deals = {
  ttl: 30 * 60_000,
  async load(sec) {
    const stores = await cheapSharkStores();
    const params = new URLSearchParams({
      storeID: (sec.stores?.length ? sec.stores : ['1', '7', '25', '11']).join(','),
      upperPrice: String(sec.maxPrice ?? 20),
      pageSize: String(sec.limit || 12),
      sortBy: sec.sort || 'Deal Rating',
      onSale: '1',
    });
    if (sec.minRating) params.set('steamRating', String(sec.minRating));
    const list = await fetchJson(`https://www.cheapshark.com/api/1.0/deals?${params}`);
    return list.map((d) => ({
      title: d.title,
      sale: Number(d.salePrice),
      normal: Number(d.normalPrice),
      savings: Math.round(Number(d.savings)),
      store: stores[d.storeID]?.name ?? 'Boutique',
      storeIcon: stores[d.storeID]?.icon ?? null,
      rating: d.steamRatingPercent && d.steamRatingPercent !== '0' ? Number(d.steamRatingPercent) : null,
      ratingText: d.steamRatingText,
      image: d.steamAppID ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${d.steamAppID}/header.jpg` : d.thumb,
      url: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
    }));
  },
};

// ---------------------------------------------------------------- lancements spatiaux (The Space Devs, 15 requêtes/heure)

const launches = {
  ttl: 30 * 60_000,
  async load(sec) {
    const params = new URLSearchParams({ limit: String(sec.limit || 6), hide_recent_previous: 'true' });
    if (sec.provider) params.set('lsp__name', sec.provider);
    const data = await fetchJson(`https://ll.thespacedevs.com/2.2.0/launch/upcoming/?${params}`, { timeout: 20_000 });
    return (data.results ?? []).map((l) => ({
      name: l.mission?.name || l.name,
      rocket: l.rocket?.configuration?.name ?? '',
      provider: l.launch_service_provider?.name ?? '',
      pad: l.pad?.location?.name ?? '',
      net: l.net,
      status: l.status?.abbrev ?? '',
      statusName: l.status?.name ?? '',
      image: l.image ?? null,
      description: l.mission?.description ?? '',
      video: l.vidURLs?.[0]?.url ?? null,
      webcast: Boolean(l.webcast_live),
    }));
  },
};

// ---------------------------------------------------------------- crypto (CoinGecko, limité : on garde 5 minutes)

const crypto = {
  ttl: 5 * 60_000,
  async load(sec) {
    const ids = (sec.coins?.length ? sec.coins : [{ id: 'bitcoin' }, { id: 'ethereum' }, { id: 'solana' }]).map((c) => c.id).filter(Boolean);
    const currency = sec.currency || 'eur';
    const list = await fetchJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=${currency}&ids=${encodeURIComponent(ids.join(','))}&sparkline=true&price_change_percentage=24h,7d`);
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    return {
      currency,
      coins: ids.map((id) => byId[id]).filter(Boolean).map((c) => {
        const spark = c.sparkline_in_7d?.price ?? [];
        const step = Math.max(1, Math.floor(spark.length / 48));
        return {
          id: c.id,
          name: c.name,
          symbol: c.symbol.toUpperCase(),
          image: c.image,
          price: c.current_price,
          change24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
          change7d: c.price_change_percentage_7d_in_currency,
          spark: spark.filter((_, i) => i % step === 0),
        };
      }),
    };
  },
};

// ---------------------------------------------------------------- éphéméride (Wikipédia)

const ephemeris = {
  ttl: 3 * 3600_000,
  async load(sec) {
    const lang = sec.lang || 'fr';
    const { y, m, d } = todayParts(TZ());
    const data = await fetchJson(`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/featured/${y}/${m}/${d}`);
    let events = data.onthisday ?? [];
    if (events.length < 4) {
      const more = await fetchJson(`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/events/${m}/${d}`).catch(() => ({}));
      events = [...events, ...(more.events ?? [])];
    }
    const picked = shuffle(events).slice(0, sec.limit || 5).sort((a, b) => b.year - a.year);
    return {
      date: `${y}-${m}-${d}`,
      image: data.image ? {
        url: data.image.thumbnail?.source ?? null,
        title: stripHtml(data.image.description?.text ?? data.image.title?.replace(/^File:|\.\w+$/g, '')),
        artist: stripHtml(data.image.artist?.text ?? ''),
        link: data.image.file_page ?? null,
      } : null,
      events: picked.map((e) => ({
        year: e.year,
        text: stripHtml(e.text).replace(/^\p{Ll}/u, (c) => c.toUpperCase()),
        link: e.pages?.[0]?.content_urls?.desktop?.page ?? null,
        thumb: e.pages?.[0]?.thumbnail?.source ?? null,
      })),
    };
  },
};

// ---------------------------------------------------------------- état des services web (pages Statuspage)

export const DEFAULT_STATUS_PAGES = [
  { name: 'GitHub', url: 'https://www.githubstatus.com' },
  { name: 'Discord', url: 'https://discordstatus.com' },
  { name: 'Cloudflare', url: 'https://www.cloudflarestatus.com' },
  { name: 'OpenAI', url: 'https://status.openai.com' },
  { name: 'Reddit', url: 'https://www.redditstatus.com' },
  { name: 'Twitch', url: 'https://status.twitch.com' },
];

const webstatus = {
  ttl: 3 * 60_000,
  async load(sec) {
    const pages = (sec.services?.length ? sec.services : DEFAULT_STATUS_PAGES).filter((p) => p.url);
    return Promise.all(pages.map(async (p) => {
      const base = p.url.replace(/\/+$/, '');
      try {
        const data = await fetchJson(`${base}/api/v2/status.json`, { timeout: 8000 });
        return { name: p.name || data.page?.name || base, url: base, indicator: data.status?.indicator ?? 'unknown', description: data.status?.description ?? '' };
      } catch (err) {
        return { name: p.name || base, url: base, indicator: 'unknown', description: err.message };
      }
    }));
  },
};

// ---------------------------------------------------------------- pour rire (Kaamelott + JokeAPI en français)

async function kaamelott() {
  const { citation: c } = await fetchJson('https://kaamelott.chaudie.re/api/random');
  return { kind: 'quote', text: c.citation.trim(), author: c.infos?.personnage ?? '', meta: [c.infos?.saison, c.infos?.episode].filter(Boolean).join(' · ') };
}

async function joke() {
  const j = await fetchJson('https://v2.jokeapi.dev/joke/Any?lang=fr&blacklistFlags=nsfw,religious,political,racist,sexist,explicit&safe-mode');
  if (j.error) throw httpError(502, 'Pas de blague disponible');
  return j.type === 'twopart' ? { kind: 'joke', setup: j.setup, punchline: j.delivery } : { kind: 'joke', setup: j.joke, punchline: '' };
}

const fun = {
  ttl: 30_000,
  async load(sec) {
    const source = sec.source || 'mix';
    const pick = source === 'mix' ? (Math.random() < 0.5 ? 'kaamelott' : 'joke') : source;
    try {
      return await (pick === 'kaamelott' ? kaamelott() : joke());
    } catch (err) {
      if (source !== 'mix') throw err;
      return pick === 'kaamelott' ? joke() : kaamelott();
    }
  },
};

// ---------------------------------------------------------------- recherche de radios (Radio Browser)

export async function searchRadios(query) {
  const q = String(query ?? '').trim();
  if (!q) throw httpError(400, 'Tape le nom d’une radio ou un style (ex. lofi, jazz, FIP)');
  const params = new URLSearchParams({ name: q, limit: '12', hidebroken: 'true', order: 'clickcount', reverse: 'true' });
  let list;
  for (const host of ['all.api.radio-browser.info', 'de1.api.radio-browser.info', 'de2.api.radio-browser.info']) {
    try { list = await fetchJson(`https://${host}/json/stations/search?${params}`, { timeout: 8000 }); break; } catch { /* serveur suivant */ }
  }
  if (!list) throw httpError(502, 'Annuaire des radios injoignable, réessaie plus tard');
  // une recherche par nom ne trouve rien ? on essaie par style
  if (!list.length) {
    params.delete('name');
    params.set('tag', q.toLowerCase());
    list = await fetchJson(`https://all.api.radio-browser.info/json/stations/search?${params}`, { timeout: 8000 }).catch(() => []);
  }
  return list.filter((s) => s.url_resolved).map((s) => ({
    name: s.name.trim(),
    url: s.url_resolved,
    favicon: s.favicon || null,
    country: s.countrycode || '',
    tags: s.tags?.split(',').slice(0, 3).join(', ') ?? '',
    codec: s.codec,
    bitrate: s.bitrate,
  }));
}

// ---------------------------------------------------------------- comparateur de prix (Idealo, LeDénicheur…)
// Lit le prix le plus bas dans les données structurées (JSON-LD Product) des pages produit. Marche avec
// Idealo, LeDénicheur et la plupart des boutiques. Chaque page est relue au plus toutes les 3 h, et le prix
// du jour est gardé dans data/prices.json pour tracer l'évolution.

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
  accept: 'text/html,application/xhtml+xml',
};
const PAGE_TTL = 3 * 3600_000;
const HISTORY_DAYS = 120;

const SHOPS = [
  [/(^|\.)idealo\./, 'idealo'],
  [/(^|\.)(ledenicheur\.fr|prisjakt\.|pricespy\.)/, 'LeDénicheur'],
  [/(^|\.)amazon\./, 'Amazon'],
  [/(^|\.)fnac\.com$/, 'Fnac'],
  [/(^|\.)darty\.com$/, 'Darty'],
  [/(^|\.)cdiscount\.com$/, 'Cdiscount'],
  [/(^|\.)boulanger\.com$/, 'Boulanger'],
  [/(^|\.)ldlc\.com$/, 'LDLC'],
  [/(^|\.)rakuten\./, 'Rakuten'],
];
const shopName = (url) => {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return SHOPS.find(([re]) => re.test(host))?.[1] ?? host;
};

const decodeHtml = (s) => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
// 179.49, "179,49 €", "1 299,00" → nombre
const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  let t = String(v ?? '').replace(/[^\d.,]/g, '');
  t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Beaucoup de sites refusent les requêtes venant d'un hébergeur (adresse de serveur cloud) : dans ce cas la page
// est relue via un relais de lecture (r.jina.ai par défaut, gratuit et sans clé, ~20 pages par minute).
// PRICES_RELAY=off le désactive, JINA_API_KEY (facultative) relève la limite.
const BLOCKED_PAGE = /Something has gone wrong|cf-chl-|challenge-platform|anomaly-modal|Access Denied|captcha/i;
const blockedHosts = new Map();
const relayUrl = () => {
  const v = (process.env.PRICES_RELAY ?? '').trim();
  return /^(off|false|0|non)$/i.test(v) ? null : v || 'https://r.jina.ai/';
};

async function fetchOnce(url, headers, timeout) {
  let res;
  try {
    res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    throw httpError(502, err.name === 'TimeoutError' ? 'site trop lent' : 'site injoignable');
  }
  const html = await res.text().catch(() => '');
  const blocked = [202, 403, 429, 503].includes(res.status) || (html.length < 60_000 && BLOCKED_PAGE.test(html));
  if (blocked) throw Object.assign(httpError(502, 'le site bloque la lecture automatique'), { blocked: true, status429: res.status === 429 });
  if (!res.ok) throw httpError(502, `le site a répondu HTTP ${res.status}`);
  return html;
}

async function fetchPage(url) {
  const host = new URL(url).hostname;
  const relay = relayUrl();
  if (!relay || !(blockedHosts.get(host) > Date.now())) {
    try {
      return await fetchOnce(url, BROWSER_HEADERS, 15_000);
    } catch (err) {
      if (!err.blocked || !relay) throw err;
      blockedHosts.set(host, Date.now() + 6 * 3600_000);
    }
  }
  const headers = { 'x-return-format': 'html', ...(process.env.JINA_API_KEY && { authorization: `Bearer ${process.env.JINA_API_KEY}` }) };
  try {
    return await fetchOnce(relay + url, headers, 40_000);
  } catch (err) {
    if (err.status429) throw httpError(502, 'relais saturé, nouvel essai bientôt');
    throw httpError(502, err.blocked ? 'le site bloque la lecture, même via le relais' : `relais : ${err.message}`);
  }
}

// Toutes les fiches Product des blocs JSON-LD (y compris dans @graph ou en tableau)
function ldProducts(html) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if ([].concat(node['@type'] ?? []).some((t) => /Product/.test(t))) out.push(node);
    if (node['@graph']) walk(node['@graph']);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])); } catch { /* bloc illisible */ }
  }
  return out;
}

function parseProductPage(html) {
  const meta = (name) => decodeHtml(
    html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]+content=["']([^"']*)`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name|itemprop)=["']${name}["']`, 'i'))?.[1]);
  for (const p of ldProducts(html)) {
    const offers = [].concat(p.offers ?? []);
    const lows = offers.flatMap((o) => [o.lowPrice, o.price, o.priceSpecification?.price].map(toNumber)).filter(Boolean);
    if (!lows.length) continue;
    const highs = offers.flatMap((o) => [o.highPrice, o.price].map(toNumber)).filter(Boolean);
    const count = offers.reduce((n, o) => n + (Number(o.offerCount) || (o['@type'] === 'Offer' ? 1 : 0)), 0);
    const image = [].concat(p.image ?? [])[0];
    return {
      name: decodeHtml(p.name) || null,
      image: (typeof image === 'string' ? image : image?.url) || meta('og:image') || null,
      price: Math.min(...lows),
      high: highs.length ? Math.max(...highs) : null,
      count: count || null,
      currency: offers.find((o) => o.priceCurrency)?.priceCurrency ?? 'EUR',
    };
  }
  // pas de JSON-LD : balises meta des boutiques (Open Graph produit, microdonnées)
  const price = toNumber(meta('product:price:amount') || meta('og:price:amount') || meta('price'));
  if (price) return { name: meta('og:title') || null, image: meta('og:image') || null, price, high: null, count: null, currency: meta('product:price:currency') || 'EUR' };
  throw httpError(502, 'prix introuvable sur la page');
}

// Une page est relue au plus toutes les 3 h (20 min après une erreur). En cas d'échec, on garde le dernier prix lu.
const pageCache = new Map();
function readPrice(url) {
  const entry = pageCache.get(url) ?? {};
  pageCache.set(url, entry);
  if (entry.pending) return entry.pending;
  if (entry.at && Date.now() - entry.at < (entry.error ? 20 * 60_000 : PAGE_TTL)) {
    return entry.error && !entry.data ? Promise.reject(entry.error) : Promise.resolve(entry.error ? { ...entry.data, stale: true } : entry.data);
  }
  entry.pending = fetchPage(url).then(parseProductPage)
    .then((data) => { entry.data = data; entry.error = null; return data; },
      (err) => { entry.error = err; if (entry.data) return { ...entry.data, stale: true }; throw err; })
    .finally(() => { entry.at = Date.now(); entry.pending = null; });
  return entry.pending;
}

// Historique : { url: [[AAAA-MM-JJ, prix], …] }, un point par jour (le plus bas du jour)
let historyQueue = Promise.resolve();
function recordPrices(dataDir, points) {
  const file = path.join(dataDir, 'prices.json');
  const task = historyQueue.then(async () => {
    let history = {};
    try { history = JSON.parse(await readFile(file, 'utf8')); } catch { /* premier relevé */ }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ() }).format(new Date());
    const oldest = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    let changed = false;
    for (const [url, price] of points) {
      const series = (history[url] ?? []).filter(([day]) => day >= oldest);
      const last = series.at(-1);
      if (last?.[0] !== today) { series.push([today, price]); changed = true; } else if (price < last[1]) { last[1] = price; changed = true; }
      history[url] = series;
    }
    if (changed) {
      await mkdir(dataDir, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(history) + '\n', 'utf8');
      await rename(`${file}.tmp`, file);
    }
    return history;
  });
  historyQueue = task.catch(() => {});
  return task;
}

const productUrls = (p) => [p.idealo, p.ledenicheur, p.shop]
  .map((u) => String(u ?? '').trim()).filter((u) => /^https?:\/\/[^/]+/i.test(u));

const prices = {
  ttl: 20 * 60_000,
  async load(sec, { dataDir } = {}) {
    const products = (sec.products ?? []).filter((p) => productUrls(p).length);
    const read = await Promise.all(products.map((p) => Promise.all(productUrls(p).map(async (url) => {
      try { return { url, shop: shopName(url), ...(await readPrice(url)) }; } catch (err) { return { url, shop: shopName(url), error: err.message }; }
    }))));
    const points = read.flat().filter((o) => o.price && !o.stale).map((o) => [o.url, o.price]);
    const history = dataDir ? await recordPrices(dataDir, points).catch(() => ({})) : {};

    return {
      products: products.map((p, i) => {
        const offers = read[i].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        const best = offers.find((o) => o.price) ?? null;
        // évolution du meilleur prix : le plus bas de toutes les sources, jour par jour
        const byDay = new Map();
        for (const o of offers) for (const [day, price] of history[o.url] ?? []) byDay.set(day, Math.min(byDay.get(day) ?? Infinity, price));
        const series = [...byDay].sort((a, b) => a[0].localeCompare(b[0])).slice(-60);
        const target = toNumber(p.target);
        return {
          name: p.name || best?.name || offers[0].shop,
          image: offers.find((o) => o.image)?.image ?? null,
          currency: best?.currency ?? 'EUR',
          best: best && { price: best.price, shop: best.shop, url: best.url },
          offers: offers.map((o) => ({ url: o.url, shop: o.shop, price: o.price ?? null, high: o.high ?? null, count: o.count ?? null, error: o.error ?? null, stale: Boolean(o.stale) })),
          history: series,
          lowest: series.length ? Math.min(...series.map(([, v]) => v)) : best?.price ?? null,
          target,
          reached: Boolean(target && best && best.price <= target),
        };
      }),
    };
  },
};

// Recherche de produits. Idealo d'abord (sa page de recherche donne nom, prix, offres et image) ; si elle
// est bloquée, un moteur de recherche (DuckDuckGo) retrouve les fiches Idealo. Les fiches LeDénicheur,
// trouvées par le moteur, sont associées au produit Idealo qui leur ressemble le plus.
async function idealoSearch(q) {
  const html = await fetchPage(`https://www.idealo.fr/prechcat.html?q=${encodeURIComponent(q)}`);
  const seen = new Set();
  const items = html.split(/class="sr-resultList__item/).slice(1).flatMap((chunk) => {
    const url = chunk.match(/href="(https:\/\/www\.idealo\.fr\/prix\/\d+\/[^"]+\.html)"/)?.[1];
    const name = decodeHtml(chunk.match(/productSummary__title[^>]*>([^<]+)</)?.[1]);
    if (!url || !name || seen.has(url)) return [];
    seen.add(url);
    const priceText = chunk.match(/detailedPriceInfo__price[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<span[^>]*>[^<]*<\/span>/g, '') ?? '';
    return [{
      shop: 'idealo',
      name,
      url,
      price: toNumber(decodeHtml(priceText)),
      count: Number(chunk.match(/offerCount[^>]*>(\d+)/)?.[1]) || null,
      image: chunk.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
      details: decodeHtml(chunk.match(/productSummary__mainDetails[^>]*>\s*<span>([^<]+)/)?.[1]),
    }];
  });
  if (!items.length && !/sr-resultList/.test(html)) throw httpError(502, 'page de recherche illisible');
  return items.slice(0, 10);
}

async function webSearch(q) {
  const html = await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
  return [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, href, title]) => {
    const link = decodeHtml(href);
    const target = link.match(/[?&]uddg=([^&]+)/)?.[1];
    return { url: target ? decodeURIComponent(target) : link, title: decodeHtml(title.replace(/<[^>]+>/g, ' ')) };
  });
}

async function idealoViaWeb(q) {
  const seen = new Set();
  const found = (await webSearch(`site:idealo.fr/prix ${q}`))
    .filter((r) => /^https:\/\/www\.idealo\.fr\/prix\/\d+\/[^?#]+\.html$/.test(r.url) && !seen.has(r.url) && seen.add(r.url))
    .slice(0, 8);
  // le moteur ne donne pas les prix : on lit les premières fiches (elles restent en cache pour le widget)
  return Promise.all(found.map(async (r, i) => {
    const page = i < 6 ? await readPrice(r.url).catch(() => null) : null;
    return {
      shop: 'idealo',
      name: r.title.replace(/\s+au meilleur prix.*$/i, '').replace(/\s*[-|–]\s*idealo.*$/i, '').trim(),
      url: r.url,
      price: page?.price ?? null,
      count: page?.count ?? null,
      image: page?.image ?? null,
      details: '',
    };
  }));
}

async function ledenicheurViaWeb(q) {
  const seen = new Set();
  return (await webSearch(`site:ledenicheur.fr ${q}`)).flatMap((r) => {
    const id = r.url.match(/^https:\/\/ledenicheur\.fr\/product\.php\?(?:.*&)?p=(\d+)/)?.[1];
    if (!id || seen.has(id)) return [];
    seen.add(id);
    // « Sapphire Radeon RX 9070 XT Pulse 16 Go - Offres dès 869,7 € »
    const [name, rest = ''] = r.title.split(/\s+[-–]\s+(?=Offres|Comparer|Trouvez|Meilleur)/i);
    return [{
      shop: 'LeDénicheur',
      name: name.trim(),
      url: `https://ledenicheur.fr/product.php?p=${id}`,
      price: toNumber(rest.match(/dès\s+([\d\s  .,]+)/i)?.[1]),
      count: null,
      image: `https://cdn.pji.nu/product/standard/280/${id}.jpg`,
      details: '',
    }];
  }).slice(0, 8);
}

// Ressemblance entre deux noms de produit (coefficient de Dice sur les mots, « 16 Go » = « 16GB »)
const nameWords = (s) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d+)\s*(go|gb|g)\b/g, '$1go').replace(/(\d+)\s*(to|tb|t)\b/g, '$1to')
  .split(/[^a-z0-9]+/).filter((w) => w.length > 1 || /\d/.test(w)));
function similarity(a, b) {
  const A = nameWords(a);
  const B = nameWords(b);
  // capacités différentes (16 Go / 8 Go) : pas le même produit
  const sizes = (set) => [...set].filter((w) => /^\d+(go|to)$/.test(w));
  if (sizes(A).length && sizes(B).length && !sizes(A).some((w) => B.has(w))) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return (2 * common) / ((A.size + B.size) || 1);
}

export async function searchPrices(query) {
  const q = String(query ?? '').trim();
  if (!q) throw httpError(400, 'Tape le nom d’un produit (ex. AirPods Pro 2, Switch 2)');
  const [idealo, ledenicheur] = await Promise.allSettled([
    idealoSearch(q).catch(() => idealoViaWeb(q)),
    ledenicheurViaWeb(q),
  ]);
  if (idealo.status === 'rejected' && ledenicheur.status === 'rejected') throw httpError(502, `Recherche impossible : ${idealo.reason.message}`);
  const fromIdealo = idealo.value ?? [];
  const fromLed = ledenicheur.value ?? [];
  const paired = new Set();
  for (const item of fromIdealo) {
    let match = null;
    let best = 0.75;
    for (const l of fromLed) {
      const score = similarity(item.name, l.name);
      if (!paired.has(l.url) && score >= best) { match = l; best = score; }
    }
    if (match) {
      paired.add(match.url);
      item.match = { url: match.url, name: match.name, price: match.price };
    }
  }
  return [...fromIdealo, ...fromLed.filter((l) => !paired.has(l.url)).slice(0, 6)];
}

export const PROVIDERS = { weather, freegames, deals, launches, crypto, ephemeris, webstatus, fun, prices };
