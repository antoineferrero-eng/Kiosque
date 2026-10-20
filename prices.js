// Comparateur de prix : lit les offres de chaque boutique sur Idealo et LeDénicheur (ou la page d'une boutique),
// garde seulement les marchands choisis, et trace l'évolution du meilleur prix : relevés jour par jour
// (data/prices.json) complétés par l'historique publié par LeDénicheur. Aucune clé, aucune dépendance.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const TZ = () => process.env.TZ || 'Europe/Paris';
const dayOf = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ() }).format(date);
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
  accept: 'text/html,application/xhtml+xml',
};
const PAGE_TTL = 3 * 3600_000;
const HISTORY_DAYS = 120;
const CHART_DAYS = 90;

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

// ---------------------------------------------------------------- marchands
// Les comparateurs n'écrivent pas les noms pareil (« Cdiscount.com (Marketplace) », « Cdiscount Marketplace »,
// « amazon-marketplace.fr », « Amazon.fr ») : on les ramène à une clé commune, plus un drapeau « marketplace »
// (vendeur tiers sur la plateforme).
export const MERCHANTS = [
  ['amazon', 'Amazon'], ['cdiscount', 'Cdiscount'], ['fnac', 'Fnac'], ['darty', 'Darty'], ['boulanger', 'Boulanger'],
  ['ldlc', 'LDLC'], ['materielnet', 'Materiel.net'], ['topachat', 'TopAchat'], ['rueducommerce', 'Rue du Commerce'],
  ['alternate', 'Alternate'], ['grosbill', 'Grosbill'], ['kaufland', 'Kaufland'], ['rakuten', 'Rakuten'],
  ['pixmania', 'Pixmania'], ['leclerc', 'E.Leclerc'], ['carrefour', 'Carrefour'], ['auchan', 'Auchan'],
  ['backmarket', 'Back Market'], ['pccomponentes', 'PcComponentes'], ['cybertek', 'Cybertek'], ['electrodepot', 'Electro Dépôt'],
  ['ubaldi', 'Ubaldi'], ['conforama', 'Conforama'], ['but', 'BUT'], ['apple', 'Apple'], ['samsung', 'Samsung'],
  ['aliexpress', 'AliExpress'], ['ebay', 'eBay'], ['cultura', 'Cultura'], ['micromania', 'Micromania'], ['galaxus', 'Galaxus'],
  ['sonvideo', 'Son-Vidéo'], ['joybuy', 'Joybuy'],
];
export function merchant(raw) {
  // « fr.aliexpress.com » → « aliexpress.com », « Joybuy FR » → « Joybuy »
  const text = decodeHtml(raw).replace(/^https?:\/\//, '').replace(/^(www|fr)\./i, '').replace(/\/.*$/, '').replace(/\s+(fr|france)$/i, '');
  const marketplace = /market\s*-?\s*place/i.test(text);
  const flat = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const known = MERCHANTS.find(([k]) => (k.length > 3 ? flat.includes(k) : flat === k || flat.startsWith(`${k}fr`) || flat.startsWith(`${k}com`)));
  if (known) return { key: known[0], name: known[1], marketplace };
  let name = text.replace(/\s*\(?market\s*-?\s*place\)?/i, '').replace(/-+$/, '').trim() || 'Boutique';
  // « compumsa.eu » → « Compumsa »
  if (/^[a-z0-9-]+\.(com|fr|eu|net|de|es|it|be)$/i.test(name)) name = name.replace(/\.[a-z]+$/i, '').replace(/^./, (c) => c.toUpperCase());
  return { key: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.(com|fr|eu|net|de|es|it|be)$/, '').replace(/[^a-z0-9]+/g, '') || 'boutique', name, marketplace };
}

// Entre deux écritures d'un même marchand, la plus lisible : « Hello Edge » plutôt que « Helloedge »
const nicer = (a, b) => (/\s/.test(b) && !/\s/.test(a) ? b : a);

const sourceOf = (url) => {
  const host = new URL(url).hostname;
  return /(^|\.)idealo\./.test(host) ? 'idealo' : /(^|\.)(ledenicheur\.fr|prisjakt\.|pricespy\.)/.test(host) ? 'ledenicheur' : 'shop';
};
const SOURCE_LABEL = { idealo: 'Idealo', ledenicheur: 'LeDénicheur' };

// ---------------------------------------------------------------- lecture des pages
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

export async function fetchPage(url) {
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

// Fiche Product des données structurées (JSON-LD), sinon balises meta des boutiques
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
function pageSummary(html) {
  const meta = (name) => decodeHtml(
    html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]+content=["']([^"']*)`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name|itemprop)=["']${name}["']`, 'i'))?.[1]);
  for (const p of ldProducts(html)) {
    const offers = [].concat(p.offers ?? []);
    const lows = offers.flatMap((o) => [o.lowPrice, o.price, o.priceSpecification?.price].map(toNumber)).filter(Boolean);
    const image = [].concat(p.image ?? [])[0];
    return {
      name: decodeHtml(p.name) || null,
      image: (typeof image === 'string' ? image : image?.url) || meta('og:image') || null,
      price: lows.length ? Math.min(...lows) : null,
      currency: offers.find((o) => o.priceCurrency)?.priceCurrency ?? 'EUR',
    };
  }
  return {
    name: meta('og:title') || null,
    image: meta('og:image') || null,
    price: toNumber(meta('product:price:amount') || meta('og:price:amount') || meta('price')),
    currency: meta('product:price:currency') || 'EUR',
  };
}

// Idealo : chaque ligne d'offre porte le marchand et le prix dans son lien de signalement d'erreur
function idealoOffers(html) {
  return html.split('<li class="productOffers-listItem').slice(1).flatMap((item) => {
    const report = item.match(/data-error-reporting-overlay-url="([^"]+)"/)?.[1];
    if (!report) return [];
    let params;
    try { params = new URL(decodeHtml(report)).searchParams; } catch { return []; }
    const price = toNumber(params.get('offerPrice'));
    const shop = params.get('shopName');
    if (!price || !shop) return [];
    const link = item.match(/href="(\/relocator\/relocate\?[^"]+)"/)?.[1];
    const delivery = params.get('deliveryTime');
    return [{
      ...merchant(shop), price,
      url: link ? `https://www.idealo.fr${decodeHtml(link)}` : null,
      delivery: delivery && !/renseigner|exemplaire/i.test(delivery) ? delivery : null,
      shipping: null, inStock: true,
    }];
  });
}

// LeDénicheur (Next.js) : les données de la page sont dans les blocs self.__next_f.push
const flightData = (html) => [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)]
  .map((m) => { try { return JSON.parse(`"${m[1]}"`); } catch { return ''; } }).join('');
// Le tableau JSON qui suit "clé": dans le texte
function arrayAfter(text, key) {
  const at = text.indexOf(`"${key}":[`);
  if (at < 0) return null;
  const start = at + key.length + 3;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if ((c === ']' || c === '}') && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}
function ledenicheurData(html) {
  const flight = flightData(html);
  const offers = (arrayAfter(flight, 'offerRows') ?? []).flatMap((o) => {
    const price = toNumber(o?.price?.amount);
    if (!price || !o.shop?.name || (o.condition && o.condition !== 'New')) return [];
    const ship = o.shipping?.nodes?.[0]?.price?.amount;
    return [{
      ...merchant(o.shop.name), price,
      url: o.clickoutUrl || null,
      delivery: null,
      shipping: typeof ship === 'number' ? ship : null,
      inStock: o.stockStatus !== 'OutOfStock',
    }];
  });
  // historique publié : chaque changement du prix le plus bas, avec le marchand du moment (prix en centimes)
  const history = (arrayAfter(flight, 'historyItems') ?? []).flatMap((it) => {
    const price = Number(it?.price) / 100;
    if (!(price > 0) || !it.date) return [];
    return [{ day: dayOf(new Date(it.date)), price, ...merchant(it.shopName ?? '') }];
  }).sort((a, b) => a.day.localeCompare(b.day));
  return { offers, history };
}

function parseSource(html, url) {
  const source = sourceOf(url);
  const summary = pageSummary(html);
  let offers = [];
  let history = [];
  if (source === 'idealo') offers = idealoOffers(html);
  else if (source === 'ledenicheur') ({ offers, history } = ledenicheurData(html));
  else if (summary.price) offers = [{ ...merchant(new URL(url).hostname), price: summary.price, url, delivery: null, shipping: null, inStock: true }];
  // comparateur dont la liste d'offres est illisible : on garde au moins son prix le plus bas, sans marchand
  if (!offers.length && summary.price) offers = [{ key: '?', name: SOURCE_LABEL[source], marketplace: false, unknown: true, price: summary.price, url, delivery: null, shipping: null, inStock: true }];
  if (!offers.length) throw httpError(502, 'prix introuvable sur la page');
  return { name: summary.name, image: summary.image, currency: summary.currency, offers: offers.map((o) => ({ ...o, source })), history };
}

// Une page est relue au plus toutes les 3 h (20 min après une erreur). En cas d'échec, on garde la dernière lecture.
const pageCache = new Map();
export function readPage(url) {
  const entry = pageCache.get(url) ?? {};
  pageCache.set(url, entry);
  if (entry.pending) return entry.pending;
  if (entry.at && Date.now() - entry.at < (entry.error ? 20 * 60_000 : PAGE_TTL)) {
    return entry.error && !entry.data ? Promise.reject(entry.error) : Promise.resolve(entry.error ? { ...entry.data, stale: true } : entry.data);
  }
  entry.pending = fetchPage(url).then((html) => parseSource(html, url))
    .then((data) => { entry.data = data; entry.error = null; return data; },
      (err) => { entry.error = err; if (entry.data) return { ...entry.data, stale: true }; throw err; })
    .finally(() => { entry.at = Date.now(); entry.pending = null; });
  return entry.pending;
}

// ---------------------------------------------------------------- historique
// data/prices.json : { v: 2, products: { clé produit: { marchand: [[AAAA-MM-JJ, prix], …] } } }
// Un point par jour et par marchand (le plus bas du jour). Marchand = clé, « +m » pour ses vendeurs tiers.
const offerId = (o) => `${o.key}${o.marketplace ? '+m' : ''}`;
const parseOfferId = (id) => ({ key: id.replace(/\+m$/, ''), marketplace: id.endsWith('+m'), unknown: id === '?' });

let historyQueue = Promise.resolve();
function recordOffers(dataDir, entries) {
  const file = path.join(dataDir, 'prices.json');
  const task = historyQueue.then(async () => {
    let store = {};
    try { store = JSON.parse(await readFile(file, 'utf8')); } catch { /* premier relevé */ }
    if (store.v !== 2) store = { v: 2, products: {} };
    const today = dayOf(new Date());
    const oldest = addDays(today, -HISTORY_DAYS);
    let changed = false;
    for (const [productKey, offers] of entries) {
      const shops = (store.products[productKey] ??= {});
      const todays = new Map();
      for (const o of offers) if (o.inStock) todays.set(offerId(o), Math.min(todays.get(offerId(o)) ?? Infinity, o.price));
      for (const [id, price] of todays) {
        const series = (shops[id] ?? []).filter(([day]) => day >= oldest);
        const last = series.at(-1);
        if (last?.[0] !== today) { series.push([today, price]); changed = true; } else if (price < last[1]) { last[1] = price; changed = true; }
        shops[id] = series;
      }
    }
    if (changed) {
      await mkdir(dataDir, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(store) + '\n', 'utf8');
      await rename(`${file}.tmp`, file);
    }
    return store;
  });
  historyQueue = task.catch(() => {});
  return task;
}

// Courbe du meilleur prix parmi les marchands retenus, jour par jour sur 90 jours. L'historique de LeDénicheur
// donne, entre deux changements, le plus bas et son marchand : on ne garde que les périodes d'un marchand retenu.
// Un prix connu est prolongé 7 jours au plus ; au-delà, la courbe s'interrompt (null).
function buildSeries(stored, published, keep, current) {
  const today = dayOf(new Date());
  const from = addDays(today, -CHART_DAYS + 1);
  const known = new Map();
  const put = (day, price) => { if (day >= from && day <= today) known.set(day, Math.min(known.get(day) ?? Infinity, price)); };
  for (const [id, series] of Object.entries(stored ?? {})) {
    if (keep(parseOfferId(id))) for (const [day, price] of series) put(day, price);
  }
  for (let i = 0; i < published.length; i++) {
    const item = published[i];
    if (!keep(item)) continue;
    const end = published[i + 1]?.day ?? addDays(today, 1);
    for (let day = item.day < from ? from : item.day; day < end && day <= today; day = addDays(day, 1)) put(day, item.price);
  }
  if (current) put(today, current);
  const days = [...known.keys()].sort();
  if (!days.length) return [];
  const out = [];
  let last = null;
  let lastDay = null;
  for (let day = days[0]; day <= today; day = addDays(day, 1)) {
    if (known.has(day)) { last = known.get(day); lastDay = day; out.push([day, last]); }
    else out.push([day, last != null && Date.parse(day) - Date.parse(lastDay) <= 7 * 86_400_000 ? last : null]);
  }
  return out;
}

function seriesStats(series) {
  const points = series.filter(([, v]) => v != null);
  if (!points.length) return null;
  let min = points[0];
  let max = points[0];
  for (const p of points) { if (p[1] < min[1]) min = p; if (p[1] > max[1]) max = p; }
  const current = points.at(-1);
  const monthAgo = points.find(([day]) => day >= addDays(current[0], -30)) ?? points[0];
  return {
    min: min[1], minDay: min[0], max: max[1], maxDay: max[0],
    avg: Math.round((points.reduce((s, [, v]) => s + v, 0) / points.length) * 100) / 100,
    change: Math.round((current[1] - monthAgo[1]) * 100) / 100,
    changeDays: Math.round((Date.parse(current[0]) - Date.parse(monthAgo[0])) / 86_400_000),
    days: points.length,
  };
}

// ---------------------------------------------------------------- widget
const productUrls = (p) => [p.idealo, p.ledenicheur, p.shop]
  .map((u) => String(u ?? '').trim()).filter((u) => /^https?:\/\/[^/]+/i.test(u));

export const prices = {
  ttl: 20 * 60_000,
  async load(sec, { dataDir } = {}) {
    const wanted = new Set((sec.shops ?? []).map((s) => merchant(s).key));
    const thirdParty = sec.marketplace !== false;
    const keep = (o) => (wanted.size ? !o.unknown && wanted.has(o.key) : true) && (thirdParty || !o.marketplace);
    const maxOffers = Math.max(1, Math.min(20, Number(sec.maxOffers) || 6));

    const products = (sec.products ?? []).filter((p) => productUrls(p).length);
    const read = await Promise.all(products.map((p) => Promise.all(productUrls(p).map(async (url) => {
      try { return { url, source: sourceOf(url), ...(await readPage(url)) }; } catch (err) { return { url, source: sourceOf(url), error: err.message }; }
    }))));
    const store = dataDir
      ? await recordOffers(dataDir, products.map((p, i) => [productUrls(p)[0], read[i].filter((r) => r.offers && !r.stale).flatMap((r) => r.offers)])).catch(() => null)
      : null;

    const seen = new Map();
    const result = products.map((p, i) => {
      const pages = read[i];
      // une offre par marchand (vendeurs tiers à part) : la moins chère des deux comparateurs
      const byShop = new Map();
      for (const o of pages.flatMap((r) => r.offers ?? [])) {
        if (!o.unknown) {
          const s = seen.get(o.key) ?? { name: o.name, count: 0 };
          s.count++;
          s.name = nicer(s.name, o.name);
          seen.set(o.key, s);
        }
        const id = offerId(o);
        const prev = byShop.get(id);
        const name = prev ? nicer(prev.name, o.name) : o.name;
        if (!prev || o.price < prev.price) byShop.set(id, { ...o, name, sources: [...new Set([...(prev?.sources ?? []), o.source])] });
        else Object.assign(prev, { name, sources: [...new Set([...prev.sources, o.source])] });
      }
      const all = [...byShop.values()].sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.price - b.price);
      const kept = all.filter(keep);
      const best = kept.find((o) => o.inStock) ?? null;
      const cheapest = all.find((o) => o.inStock) ?? null;
      const published = pages.flatMap((r) => r.history ?? []).sort((a, b) => a.day.localeCompare(b.day));
      const series = buildSeries(store?.products?.[productUrls(p)[0]], published, keep, best?.price);
      const target = toNumber(p.target);
      const pick = (o) => o && { shop: o.name, marketplace: o.marketplace, price: o.price, url: o.url, shipping: o.shipping, delivery: o.delivery, inStock: o.inStock, sources: o.sources ?? [o.source] };
      return {
        name: p.name || pages.find((r) => r.name)?.name || 'Produit',
        image: pages.find((r) => r.image)?.image ?? null,
        currency: pages.find((r) => r.currency)?.currency ?? 'EUR',
        best: pick(best),
        outside: cheapest && best && cheapest.price < best.price - 0.005 && !keep(cheapest) ? pick(cheapest) : best ? null : pick(cheapest),
        offers: kept.slice(0, maxOffers).map(pick),
        offerCount: kept.length,
        totalCount: all.length,
        series,
        stats: seriesStats(series),
        target,
        reached: Boolean(target && best && best.price <= target),
        sources: pages.map((r) => ({ source: r.source, url: r.url, offers: r.offers?.length ?? 0, error: r.error ?? null, stale: Boolean(r.stale) })),
      };
    });
    return {
      filtered: wanted.size > 0 || !thirdParty,
      shopsSeen: [...seen.values()].sort((a, b) => b.count - a.count).map((s) => s.name),
      products: result,
    };
  },
};

// ---------------------------------------------------------------- recherche
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
    const page = i < 6 ? await readPage(r.url).catch(() => null) : null;
    const lows = page?.offers.map((o) => o.price) ?? [];
    return {
      shop: 'idealo',
      name: r.title.replace(/\s+au meilleur prix.*$/i, '').replace(/\s*[-|–]\s*idealo.*$/i, '').trim(),
      url: r.url,
      price: lows.length ? Math.min(...lows) : null,
      count: lows.length || null,
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

