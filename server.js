// Kiosque : serveur du dashboard. Sert la page, garde la config (modifiable depuis la page
// avec le mot de passe admin) et va chercher les données : statuts des services, flux RSS,
// vidéos YouTube et matchs e-sport (PandaScore). Aucune dépendance, Node 20.12+.
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* pas de fichier .env */ }

const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'config.default.json');
const PORT = Number(process.env.PORT) || 3010;

const STATUS_TTL = 15_000;
const FEED_TTL = 10 * 60_000;
const YOUTUBE_TTL = 15 * 60_000;
const ESPORT_TTL = 5 * 60_000;
const TOKEN_TTL = 30 * 86400_000;
const MAX_BODY = 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; Kiosque/1.0)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const SECTION_TYPES = new Set(['links', 'rss', 'iframe', 'esport', 'youtube', 'flags', 'notes']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const NET_ERRORS = {
  ECONNREFUSED: 'Connexion refusée',
  ECONNRESET: 'Connexion réinitialisée',
  ENOTFOUND: 'Hôte introuvable',
  EHOSTUNREACH: 'Hôte injoignable',
  ETIMEDOUT: 'Délai dépassé',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Certificat auto-signé',
  SELF_SIGNED_CERT_IN_CHAIN: 'Certificat auto-signé',
  CERT_HAS_EXPIRED: 'Certificat expiré',
  ERR_TLS_CERT_ALTNAME_INVALID: 'Certificat invalide',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Certificat non vérifiable',
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------------------------------------------------------------- config

function slugify(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'section';
}

// Donne un id unique à chaque section et à chaque élément (les statuts sont indexés par id d'élément).
// Les ids manquants sont déduits de la position : une config écrite à la main garde les mêmes ids à chaque lecture.
function withIds(cfg) {
  const unique = (taken, base) => {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  };
  const sectionIds = new Set();
  const itemIds = new Set();
  cfg.sections = cfg.sections.map((s) => {
    const id = unique(sectionIds, slugify(s.id || s.name || s.type));
    const out = { ...s, id };
    if (Array.isArray(s.items)) {
      out.items = s.items
        .filter((it) => it && typeof it === 'object')
        .map((it, i) => ({ ...it, id: unique(itemIds, String(it.id || `${id}-${i + 1}`)) }));
    }
    return out;
  });
  return cfg;
}

function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'La configuration doit être un objet JSON');
  const cfg = { ...input, sections: input.sections ?? [] };
  if (!Array.isArray(cfg.sections)) throw httpError(400, '"sections" doit être une liste');
  cfg.sections.forEach((s, i) => {
    if (!s || typeof s !== 'object') throw httpError(400, `Section n°${i + 1} invalide`);
    if (!SECTION_TYPES.has(s.type)) throw httpError(400, `Section « ${s.name ?? i + 1} » : type inconnu « ${s.type} »`);
  });
  return withIds(cfg);
}

async function loadConfig() {
  let raw;
  try {
    raw = await readFile(CONFIG_PATH, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // Premier démarrage : on part de la config d'exemple
    raw = await readFile(DEFAULT_CONFIG_PATH, 'utf8');
    await saveConfig(validateConfig(JSON.parse(raw)));
  }
  return validateConfig(JSON.parse(raw));
}

async function saveConfig(cfg) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  await rename(tmp, CONFIG_PATH);
  memoStore.clear();
  return cfg;
}

async function findSection(id, type) {
  const sec = (await loadConfig()).sections.find((s) => s.id === id && s.type === type);
  if (!sec) throw httpError(404, `Section « ${id} » introuvable`);
  return sec;
}

// ---------------------------------------------------------------- clés et mot de passe

// Les variables d'environnement ont la priorité. Sinon, les valeurs saisies dans la page sont gardées
// dans data/secrets.json : le mot de passe y est haché (scrypt) et rien n'est jamais renvoyé en clair.
const SECRETS_PATH = path.join(DATA_DIR, 'secrets.json');
const MIN_PASSWORD = 8;
let secrets = {};
try { secrets = JSON.parse(readFileSync(SECRETS_PATH, 'utf8')); } catch { /* aucun secret enregistré */ }

async function saveSecrets(patch) {
  const next = { ...secrets, ...patch };
  for (const [k, v] of Object.entries(next)) if (v == null || v === '') delete next[k];
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${SECRETS_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, SECRETS_PATH);
  secrets = next;
  memoStore.clear();
}

const pandascoreToken = () => process.env.PANDASCORE_TOKEN || secrets.pandascoreToken || '';
const passwordSource = () => (process.env.ADMIN_PASSWORD ? 'env' : secrets.adminHash ? 'page' : null);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 32).toString('base64url')}`;
}

function checkPassword(password) {
  const given = String(password ?? '');
  if (process.env.ADMIN_PASSWORD) {
    const hash = (s) => crypto.createHash('sha256').update(s).digest();
    return crypto.timingSafeEqual(hash(given), hash(process.env.ADMIN_PASSWORD));
  }
  const [, salt, expected] = String(secrets.adminHash ?? '').split(':');
  if (!salt || !expected) return false;
  const a = crypto.scryptSync(given, salt, 32);
  const b = Buffer.from(expected, 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secretsStatus() {
  const token = pandascoreToken();
  return {
    pandascoreToken: {
      set: Boolean(token),
      source: process.env.PANDASCORE_TOKEN ? 'env' : secrets.pandascoreToken ? 'page' : null,
      hint: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : '',
    },
    adminPassword: { source: passwordSource() },
  };
}

// ---------------------------------------------------------------- authentification

// Changer de mot de passe change la clé de signature : les anciennes sessions deviennent invalides.
const sign = (exp) => crypto.createHmac('sha256', `kiosque:${process.env.ADMIN_PASSWORD || secrets.adminHash || ''}`).update(String(exp)).digest('base64url');

function makeToken() {
  const exp = Date.now() + TOKEN_TTL;
  return `${exp}.${sign(exp)}`;
}

function isAuthenticated(req) {
  if (!passwordSource()) return false;
  const [exp, sig] = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAuth(req) {
  if (!passwordSource()) throw httpError(403, 'Crée d’abord le mot de passe admin (bouton crayon)');
  if (!isAuthenticated(req)) throw httpError(401, 'Session expirée, reconnecte-toi');
}

function checkNewPassword(value) {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD) throw httpError(400, `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères`);
  return password;
}

// Premier lancement : tant qu'aucun mot de passe n'existe, la page propose d'en créer un
async function setup(body) {
  if (passwordSource()) throw httpError(409, 'Un mot de passe admin existe déjà');
  await saveSecrets({ adminHash: hashPassword(checkNewPassword(body?.password)) });
  return { token: makeToken() };
}

const loginAttempts = new Map();
async function login(req, body) {
  if (!passwordSource()) throw httpError(409, 'Aucun mot de passe : crée-le d’abord');
  const ip = req.socket.remoteAddress ?? '?';
  const entry = loginAttempts.get(ip) ?? { fails: 0, until: 0 };
  if (entry.until > Date.now()) throw httpError(429, 'Trop d’essais, réessaie dans quelques minutes');

  if (!checkPassword(body?.password)) {
    entry.fails++;
    if (entry.fails >= 5) { entry.fails = 0; entry.until = Date.now() + 5 * 60_000; }
    loginAttempts.set(ip, entry);
    await new Promise((r) => setTimeout(r, 600));
    throw httpError(401, 'Mot de passe incorrect');
  }
  loginAttempts.delete(ip);
  return { token: makeToken() };
}

async function updateSecrets(req, body) {
  requireAuth(req);
  const patch = {};
  if (body && 'pandascoreToken' in body) {
    if (process.env.PANDASCORE_TOKEN) throw httpError(409, 'La clé PandaScore est définie par la variable PANDASCORE_TOKEN');
    patch.pandascoreToken = String(body.pandascoreToken ?? '').trim() || null;
  }
  if (body?.adminPassword !== undefined) {
    if (process.env.ADMIN_PASSWORD) throw httpError(409, 'Le mot de passe est défini par la variable ADMIN_PASSWORD');
    if (!checkPassword(body.currentPassword)) throw httpError(403, 'Mot de passe actuel incorrect');
    patch.adminHash = hashPassword(checkNewPassword(body.adminPassword));
  }
  await saveSecrets(patch);
  return { ...secretsStatus(), token: patch.adminHash ? makeToken() : undefined };
}

// Une config importée peut contenir ses clés : { ..., "secrets": { "pandascoreToken": "…" } }
async function importConfig(req, body) {
  requireAuth(req);
  const { secrets: incoming, ...cfg } = body ?? {};
  if (incoming?.pandascoreToken && !process.env.PANDASCORE_TOKEN) {
    await saveSecrets({ pandascoreToken: String(incoming.pandascoreToken).trim() });
  }
  return saveConfig(validateConfig(cfg));
}

async function exportConfig(req, url) {
  requireAuth(req);
  const cfg = await loadConfig();
  if (url.searchParams.has('secrets') && pandascoreToken()) cfg.secrets = { pandascoreToken: pandascoreToken() };
  return cfg;
}

// ---------------------------------------------------------------- cache

// Met en cache le résultat de loader() pendant ttl ms. Un seul appel en vol par clé ;
// en cas d'erreur on renvoie la dernière valeur connue s'il y en a une.
const memoStore = new Map();
function memo(key, ttl, force, loader) {
  const entry = memoStore.get(key) ?? {};
  memoStore.set(key, entry);
  if (!force && 'data' in entry && Date.now() - entry.at < ttl) return Promise.resolve(entry.data);
  entry.pending ??= loader()
    .then((data) => { entry.data = data; entry.at = Date.now(); return data; },
      (err) => { if ('data' in entry) return entry.data; throw err; })
    .finally(() => { entry.pending = null; });
  return entry.pending;
}

// ---------------------------------------------------------------- statuts

function statusTargets(cfg) {
  if (cfg.statusCheck === false) return [];
  return cfg.sections
    .filter((s) => s.type === 'links' && s.statusCheck !== false)
    .flatMap((s) => s.items ?? [])
    .filter((it) => it.url && it.statusCheck !== false);
}

function parseCodes(value) {
  return String(value ?? '').split(/[\s,;]+/).filter(Boolean).map(Number);
}

function probe(item, timeout = 8000) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(item.statusUrl || item.url); } catch { return resolve({ ok: false, error: 'URL invalide' }); }
    if (!/^https?:$/.test(url.protocol)) return resolve({ ok: false, error: 'Protocole non pris en charge' });

    const started = performance.now();
    const done = (r) => resolve({ ...r, ms: Math.round(performance.now() - started) });
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      timeout,
      rejectUnauthorized: !item.allowInsecure,
      headers: { 'user-agent': UA, accept: '*/*' },
    }, (res) => {
      const code = res.statusCode;
      res.destroy();
      done({ ok: (code >= 200 && code < 400) || parseCodes(item.acceptCodes).includes(code), code });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('Délai dépassé'), { code: 'ETIMEDOUT' })));
    req.on('error', (err) => done({ ok: false, error: NET_ERRORS[err.code] || err.code || err.message }));
    req.end();
  });
}

function getStatuses(force) {
  return memo('status', STATUS_TTL, force, async () => {
    const items = statusTargets(await loadConfig());
    const results = await Promise.all(items.map(async (it) => [it.id, { ...(await probe(it)), checkedAt: Date.now() }]));
    return Object.fromEntries(results);
  });
}

// ---------------------------------------------------------------- XML / RSS

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', ecirc: 'ê', euml: 'ë',
  agrave: 'à', Agrave: 'À', acirc: 'â', ccedil: 'ç', Ccedil: 'Ç',
  icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü', oelig: 'œ',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', euro: '€', copy: '©', reg: '®', trade: '™',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return NAMED_ENTITIES[e] ?? m;
    const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(cp); } catch { return m; }
  });
}

function cleanText(s) {
  if (s == null) return '';
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = decodeEntities(s); // le HTML est souvent encodé (&lt;p&gt;)
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0];
  return pick?.match(/href=["']([^"']+)["']/i)?.[1] ?? '';
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const head = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)[0];

  const items = blocks.map((b) => {
    const link = isAtom ? atomLink(b) : cleanText(tag(b, 'link')) || cleanText(tag(b, 'guid'));
    const rawDate = cleanText(tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date'));
    const date = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
    return {
      title: cleanText(tag(b, 'title')),
      link: /^https?:\/\//.test(link) ? link : '',
      description: truncate(cleanText(tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content')), 280),
      date,
    };
  }).filter((it) => it.title);

  return {
    title: cleanText(tag(head, 'title')),
    link: isAtom ? atomLink(head) : cleanText(tag(head, 'link')),
    items,
  };
}

function decodeBody(buf, contentType) {
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 200));
  const enc = head.match(/encoding=["']([\w-]+)["']/i)?.[1] || contentType?.match(/charset=([\w-]+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder().decode(buf); }
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*', ...headers },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type'));
}

async function getFeed(url, force) {
  const cfg = await loadConfig();
  const allowed = cfg.sections.flatMap((s) => (s.feeds ?? []).map((f) => f.url));
  if (!allowed.includes(url)) throw httpError(403, 'Flux non déclaré dans la config');
  try {
    return await memo(`rss:${url}`, FEED_TTL, force, async () => parseFeed(await fetchText(url)));
  } catch (err) {
    throw httpError(502, `Flux indisponible (${err.message})`);
  }
}

// ---------------------------------------------------------------- YouTube

const channelFeed = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`;

async function fetchChannel(channel) {
  const xml = await fetchText(channelFeed(channel.id));
  const feedAuthor = cleanText(tag(tag(xml.split('<entry>')[0], 'author') ?? '', 'name'));
  return [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(([e]) => {
    const id = cleanText(tag(e, 'yt:videoId'));
    const link = atomLink(e) || `https://www.youtube.com/watch?v=${id}`;
    return {
      id,
      title: cleanText(tag(e, 'title')),
      link,
      short: link.includes('/shorts/'),
      date: cleanText(tag(e, 'published')),
      author: feedAuthor || channel.name || '',
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }).filter((v) => v.id);
}

async function getYoutube(sectionId, force) {
  const sec = await findSection(sectionId, 'youtube');
  const channels = (sec.channels ?? []).filter((c) => c.id);
  return memo(`youtube:${sec.id}`, YOUTUBE_TTL, force, async () => {
    const results = await Promise.allSettled(channels.map(fetchChannel));
    if (channels.length && results.every((r) => r.status === 'rejected')) throw httpError(502, 'YouTube injoignable');
    // Par chaîne : on retire les Shorts et on garde au plus `perChannel` vidéos, pour varier les chaînes
    const videos = results.flatMap((r) => {
      if (r.status !== 'fulfilled') return [];
      const list = sec.hideShorts !== false ? r.value.filter((v) => !v.short) : r.value;
      return sec.perChannel ? list.slice(0, sec.perChannel) : list;
    });
    videos.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return videos.slice(0, sec.limit || 16);
  });
}

// Retrouve l'identifiant d'une chaîne à partir d'un @pseudo, d'un lien ou d'un ID
async function resolveChannel(query) {
  const q = String(query ?? '').trim();
  if (!q) throw httpError(400, 'Indique un @pseudo, un lien ou un ID de chaîne');

  let id = q.match(/UC[\w-]{22}/)?.[0];
  if (!id) {
    let url;
    try {
      url = new URL(/^https?:\/\//.test(q) ? q : /youtu\.?be/.test(q) ? `https://${q}` : `https://www.youtube.com/@${q.replace(/^@/, '')}`);
    } catch { throw httpError(400, 'Lien invalide'); }
    if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname)) throw httpError(400, 'Ce n’est pas un lien YouTube');
    let html;
    try {
      html = await fetchText(url, { 'user-agent': BROWSER_UA, 'accept-language': 'fr', cookie: 'SOCS=CAI; CONSENT=YES+cb', accept: 'text/html' });
    } catch { throw httpError(404, 'Chaîne introuvable'); }
    id = html.match(/"externalId":"(UC[\w-]{22})"/)?.[1]
      ?? html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1]
      ?? html.match(/itemprop="channelId" content="(UC[\w-]{22})"/)?.[1]
      ?? html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  }
  if (!id) throw httpError(404, 'Chaîne introuvable');

  try {
    const xml = await fetchText(channelFeed(id));
    return { id, name: cleanText(tag(xml.split('<entry>')[0], 'title')) };
  } catch {
    throw httpError(404, 'Chaîne introuvable');
  }
}

// ---------------------------------------------------------------- e-sport (PandaScore)

function pickStream(streams = [], lang) {
  const ok = streams.filter((s) => s.raw_url);
  return (ok.find((s) => s.language === lang) ?? ok.find((s) => s.main) ?? ok.find((s) => s.official) ?? ok[0])?.raw_url ?? null;
}

function normalizeMatch(m, game) {
  const scoreOf = (teamId) => m.results?.find((r) => r.team_id === teamId)?.score ?? null;
  return {
    id: m.id,
    game: game.id,
    gameName: game.name || game.id,
    color: game.color,
    name: m.name,
    status: m.status,
    beginAt: m.begin_at,
    endAt: m.end_at,
    bestOf: m.number_of_games,
    league: m.league?.name ?? '',
    leagueImage: m.league?.image_url ?? null,
    tournament: [m.serie?.full_name, m.tournament?.name].filter(Boolean).join(' · '),
    tier: m.tournament?.tier,
    teams: (m.opponents ?? []).map(({ opponent: o }) => ({
      name: o.name,
      acronym: o.acronym || o.name,
      image: o.image_url,
      score: scoreOf(o.id),
    })),
    stream: pickStream(m.streams_list, game.streamLang ?? 'fr'),
  };
}

async function fetchGameMatches(game, from, to) {
  const matches = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://api.pandascore.co/${encodeURIComponent(game.id)}/matches?sort=begin_at&per_page=100&page=${page}&range[begin_at]=${from},${to}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${pandascoreToken()}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) throw httpError(502, 'Clé PandaScore refusée : vérifie-la dans Réglages → Clés');
    if (!res.ok) throw new Error(`PandaScore ${game.id} : HTTP ${res.status}`);
    const batch = await res.json();
    matches.push(...batch);
    if (batch.length < 100) break;
  }
  return matches;
}

async function getEsport(sectionId, force) {
  const sec = await findSection(sectionId, 'esport');
  if (!pandascoreToken()) throw httpError(503, 'Ajoute ta clé PandaScore (Réglages → Clés) pour voir les matchs');

  return memo(`esport:${sec.id}`, ESPORT_TTL, force, async () => {
    // Fenêtre large : le tri « aujourd'hui » se fait côté navigateur, dans son fuseau horaire.
    const from = new Date(Date.now() - 30 * 3600_000).toISOString();
    const to = new Date(Date.now() + (sec.days ?? 4) * 86400_000).toISOString();
    const tiers = sec.tiers?.length ? sec.tiers : ['s', 'a'];
    const games = (sec.games ?? []).filter((g) => g.id);

    const results = await Promise.allSettled(games.map(async (game) =>
      (await fetchGameMatches(game, from, to))
        .filter((m) => m.begin_at && tiers.includes(m.tournament?.tier))
        .map((m) => normalizeMatch(m, game))));
    const failed = results.filter((r) => r.status === 'rejected');
    if (games.length && failed.length === games.length) throw httpError(502, failed[0].reason.message);

    return results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .sort((a, b) => Date.parse(a.beginAt) - Date.parse(b.beginAt));
  });
}

// ---------------------------------------------------------------- HTTP

function sendJson(res, body, status = 200) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError(413, 'Contenu trop volumineux');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); } catch { throw httpError(400, 'JSON invalide'); }
}

async function serveStatic(pathname, res) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return sendJson(res, { error: 'Requête invalide' }, 400); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, { error: 'Interdit' }, 403);
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    sendJson(res, { error: 'Introuvable' }, 404);
  }
}

const routes = {
  'GET /api/config': () => loadConfig(),
  'PUT /api/config': async (req) => importConfig(req, await readJson(req)),
  'GET /api/export': (req, url) => exportConfig(req, url),
  'GET /api/session': (req) => ({ needsSetup: !passwordSource(), authenticated: isAuthenticated(req), esport: Boolean(pandascoreToken()) }),
  'POST /api/setup': async (req) => setup(await readJson(req)),
  'POST /api/login': async (req) => login(req, await readJson(req)),
  'GET /api/secrets': (req) => { requireAuth(req); return secretsStatus(); },
  'PUT /api/secrets': async (req) => updateSecrets(req, await readJson(req)),
  'GET /api/status': (req, url) => getStatuses(url.searchParams.has('force')),
  'GET /api/rss': (req, url) => getFeed(url.searchParams.get('url') ?? '', url.searchParams.has('force')),
  'GET /api/youtube': (req, url) => getYoutube(url.searchParams.get('section') ?? '', url.searchParams.has('force')),
  'GET /api/youtube/resolve': (req, url) => { requireAuth(req); return resolveChannel(url.searchParams.get('q')); },
  'GET /api/esport': (req, url) => getEsport(url.searchParams.get('section') ?? '', url.searchParams.has('force')),
  'GET /healthz': () => ({ ok: true }),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return sendJson(res, await route(req, url));
    if (url.pathname.startsWith('/api/')) throw httpError(404, 'Route inconnue');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'Méthode non autorisée');
    return await serveStatic(url.pathname, res);
  } catch (err) {
    if (!err.status) console.error(err);
    sendJson(res, { error: err.message }, err.status || 500);
  }
});

server.listen(PORT, () => {
  console.log(`Kiosque prêt sur http://localhost:${PORT}`);
  if (!passwordSource()) console.log('Aucun mot de passe admin : il sera créé au premier clic sur le crayon.');
  if (!pandascoreToken()) console.log('Pas de clé PandaScore : à ajouter dans Réglages → Clés pour l’e-sport.');
});
