// Fournisseurs de données des widgets : chacun charge et met en forme les données d'une section.
// Tous utilisent des API publiques sans clé. `ttl` = durée de cache côté serveur (ms).

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

export const PROVIDERS = { weather, freegames, deals, launches, crypto, ephemeris, webstatus, fun };
