import { $, $$, settings, target, svg, store, api, h, hostOf, renderIcon, iconButton, openButton, skeletons, ago, applyTheme } from './lib.js';
import { initEditor, sectionTools, addSectionTile, addItemTile, resizeHandle } from './editor.js';
import { COMPACT_STEPS } from './schema.js';
import { buildEsport } from './widgets/esport.js';
import { buildYoutube } from './widgets/youtube.js';
import { buildFlags } from './widgets/flags.js';
import { buildNotes } from './widgets/notes.js';
import { buildWeather } from './widgets/weather.js';
import { buildRadio } from './widgets/radio.js';
import { buildFreeGames, buildDeals } from './widgets/games.js';
import { buildLaunches } from './widgets/space.js';
import { buildCrypto } from './widgets/crypto.js';
import { buildEphemeris, buildWebStatus, buildFun } from './widgets/daily.js';
import { buildPokemon } from './widgets/pokemon.js';
import { buildCountdown } from './widgets/countdown.js';
import { buildTimer } from './widgets/timer.js';

const BUILDERS = {
  links: buildLinks,
  rss: buildRss,
  iframe: buildFrame,
  esport: buildEsport,
  youtube: buildYoutube,
  flags: buildFlags,
  notes: buildNotes,
  weather: buildWeather,
  radio: buildRadio,
  freegames: buildFreeGames,
  deals: buildDeals,
  launches: buildLaunches,
  crypto: buildCrypto,
  ephemeris: buildEphemeris,
  pokemon: buildPokemon,
  webstatus: buildWebStatus,
  countdown: buildCountdown,
  fun: buildFun,
  timer: buildTimer,
};

let config;
let statusTimer;
let lastStatus = {};
let lastStatusAt = 0;
const collapsed = new Set(store.get('kiosque.collapsed', []));

init();

// ---------------------------------------------------------------- démarrage

async function init() {
  startClock();
  try {
    config = await api('/api/config');
  } catch (err) {
    $('#grid').replaceChildren(h('p', { class: 'fatal' }, `Impossible de charger la configuration : ${err.message}`));
    setHealth('down', 'Hors ligne');
    return;
  }
  renderAll();
  setupStatus();
  initEditor({
    getConfig: () => config,
    setConfig: (next, { render = true } = {}) => {
      config = next;
      if (!render) return;
      renderAll();
      refreshStatus(true);
    },
  });
}

function renderAll() {
  applyTheme(config.theme, config.themeMode);
  settings.openIn = config.openIn || 'sametab';
  document.title = config.title || 'Kiosque';
  if (config.favicon) $('#favicon').href = config.favicon;

  const cards = config.sections.map(renderSection);
  $('#grid').replaceChildren(
    ...cards,
    cards.length ? '' : h('div', { class: 'empty-dashboard' },
      h('p', {}, 'Ton dashboard est vide.'),
      h('p', {}, 'Clique sur le crayon en haut à droite pour ajouter des sections.')),
    addSectionTile());

  applyStatuses(lastStatus);
  $('#health').hidden = !$('.link[data-check]');
  layoutMasonry($('#grid'));
}

// Maçonnerie : chaque carte garde sa hauteur naturelle et occupe autant de lignes de 2 px
// que nécessaire, les cartes plus courtes venant se ranger dans les trous (grid-auto-flow: dense).
const ROW = 2;
let masonry;
function layoutMasonry(grid) {
  masonry?.disconnect();
  const fit = (el) => {
    const gap = parseFloat(getComputedStyle(el).marginBottom) || 0;
    el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((el.getBoundingClientRect().height + gap) / ROW))}`;
  };
  masonry = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));
  grid.classList.add('is-masonry');
  for (const el of grid.children) { fit(el); masonry.observe(el); }
}

// ---------------------------------------------------------------- sections

function renderSection(sec, index) {
  const span = sec.span || 4;
  const isCollapsed = collapsed.has(sec.id);
  const card = h('section', {
    class: `card type-${sec.type}${isCollapsed ? ' is-collapsed' : ''}${sec.cardHeight ? ' has-height' : ''}`,
    id: `section-${sec.id}`,
    'data-id': sec.id,
    style: {
      '--span': span,
      '--span-md': sec.spanMd || (span >= 6 ? 12 : 6),
      '--i': index,
      ...(sec.tint && { '--tint': sec.tint }),
      ...(sec.cardHeight && { '--card-h': `${sec.cardHeight}px` }),
    },
  });
  const body = h('div', { class: 'card-body' });
  const actions = h('div', { class: 'card-actions' });
  const toggle = h('button', { class: 'card-title', type: 'button', 'aria-expanded': String(!isCollapsed) },
    renderIcon(sec.icon, null, sec.name, 'card-ico'),
    h('h2', {}, sec.name || ''),
    h('span', { class: 'badge', hidden: true }),
    h('span', { class: 'chev', html: svg('chevron') }));
  toggle.addEventListener('click', () => toggleSection(sec.id, card, toggle));

  card.append(
    h('header', { class: 'card-head' }, toggle, h('div', { class: 'card-tools' }, actions, sectionTools(sec, card))),
    h('div', { class: 'card-body-wrap' }, body),
    resizeHandle(sec, card));
  try {
    BUILDERS[sec.type]?.(sec, body, actions, card);
    watchSize(sec, card, body);
    fitItems(sec, card, body);
  } catch (err) {
    console.error(err);
    body.replaceChildren(h('p', { class: 'empty' }, `Erreur dans la section : ${err.message}`));
  }
  return card;
}

// Format réduit (data-size = s ou xs) : forcé dans la config, ou selon la taille de la carte.
// On ne regarde la hauteur que pour une carte de hauteur fixe : elle ne dépend alors pas du contenu,
// donc changer de format ne change pas la taille (pas de boucle).
function watchSize(sec, card, body) {
  const steps = COMPACT_STEPS[sec.type];
  if (!steps) return;
  const forced = { small: 1, tiny: 2 }[sec.compact] ?? 0;
  const level = (value, [s, xs]) => (xs && value < xs ? 2 : s && value < s ? 1 : 0);
  const apply = () => {
    let lvl = forced;
    if (card.isConnected) {
      if (card.classList.contains('has-height') && !card.classList.contains('is-collapsed')) lvl = Math.max(lvl, level(body.clientHeight, steps.h));
      lvl = Math.max(lvl, level(body.clientWidth, steps.w));
    }
    const size = ['', 's', 'xs'][lvl];
    if ((card.dataset.size ?? '') !== size) {
      if (size) card.dataset.size = size; else delete card.dataset.size;
    }
  };
  new ResizeObserver(apply).observe(body);
  apply();
}

// Listes dans une carte de hauteur fixe : plutôt que de défiler, on masque les éléments qui ne rentrent pas.
const FIT_ITEMS = {
  freegames: '.game', deals: '.deal', ephemeris: '.eph-event', webstatus: '.ws-row', crypto: '.coin',
  launches: '.launch-row', countdown: '.cd-row', radio: '.radio-station', links: '.link:not(.add-tile)',
};
function fitItems(sec, card, body) {
  const selector = FIT_ITEMS[sec.type];
  if (!selector) return;
  let frame;
  const fit = () => {
    const items = [...body.querySelectorAll(selector)];
    for (const item of items) item.classList.remove('is-clipped');
    if (!card.classList.contains('has-height') || card.classList.contains('is-collapsed') || document.body.classList.contains('is-editing')) return;
    // on retire par la fin tant que ça déborde (on garde au moins un élément)
    for (let i = items.length - 1; i > 0 && body.scrollHeight > body.clientHeight + 1; i--) items[i].classList.add('is-clipped');
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
  new ResizeObserver(schedule).observe(body);
  // le widget redessine son contenu (données chargées, actualisation) : on recommence
  new MutationObserver(schedule).observe(body, { childList: true, subtree: true });
  // en mode édition on montre tout (pour pouvoir cliquer sur chaque application)
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function toggleSection(id, card, btn) {
  const now = card.classList.toggle('is-collapsed');
  btn.setAttribute('aria-expanded', String(!now));
  if (now) collapsed.add(id); else collapsed.delete(id);
  store.set('kiosque.collapsed', [...collapsed]);
}

// ---------------------------------------------------------------- applications + statuts

function buildLinks(sec, body, actions, card) {
  const checks = config.statusCheck !== false && sec.statusCheck !== false;
  const display = sec.display || 'list';
  const items = (sec.items || []).filter((it) => it.url);

  body.append(h('div', { class: `links display-${display}`, style: { '--cols': sec.cols || 3 } },
    items.map((it) => {
      const checked = checks && it.statusCheck !== false;
      const sub = display === 'list' ? (it.description || hostOf(it.url)) : null;
      return h('a', {
        class: 'link',
        href: it.url,
        target: target(),
        rel: 'noopener noreferrer',
        title: it.description ? `${it.title} — ${it.description}` : it.title,
        'data-id': it.id,
        'data-name': it.title,
        'data-check': checked,
        'data-state': checked ? 'pending' : null,
      },
      renderIcon(it.icon || 'favicon', it.url, it.title),
      h('span', { class: 'link-text' },
        h('span', { class: 'link-title' }, it.title || hostOf(it.url)),
        sub ? h('span', { class: `link-sub${it.description ? '' : ' is-host'}` }, sub) : null),
      checked ? h('span', { class: 'status', role: 'img', 'aria-label': 'Vérification…' }) : null);
    }),
    addItemTile(sec)));

  if (checks && items.some((it) => it.statusCheck !== false)) {
    card.dataset.status = '';
    actions.append(iconButton('refresh', 'Revérifier les statuts', (btn) => refreshStatus(true, btn)));
  } else {
    const badge = $('.badge', card);
    badge.textContent = items.length;
    badge.hidden = !items.length;
  }
}

function setupStatus() {
  $('#health').addEventListener('click', () => {
    setHealth('pending', 'Vérification…');
    refreshStatus(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastStatusAt > interval()) refreshStatus(false);
  });
  refreshStatus(false);
}

const interval = () => (config.statusInterval || 60) * 1000;

async function refreshStatus(force, btn) {
  clearTimeout(statusTimer);
  if (!$('.link[data-check]')) return;
  btn?.classList.add('spin');
  try {
    lastStatus = await api(`/api/status${force ? '?force' : ''}`);
    lastStatusAt = Date.now();
    applyStatuses(lastStatus);
  } catch {
    setHealth('down', 'Statuts indisponibles');
  } finally {
    btn?.classList.remove('spin');
    statusTimer = setTimeout(() => refreshStatus(false), interval());
  }
}

function applyStatuses(data) {
  const links = $$('.link[data-check]');
  for (const link of links) {
    const r = data[link.dataset.id];
    if (!r) continue;
    link.dataset.state = r.ok ? 'up' : 'down';
    const detail = r.ok ? `En ligne · HTTP ${r.code} · ${r.ms} ms` : `Hors ligne · ${r.error || `HTTP ${r.code}`}`;
    const dot = $('.status', link);
    dot.title = detail;
    dot.setAttribute('aria-label', detail);
  }

  for (const card of $$('.card[data-status]')) {
    const own = $$('.link[data-check]', card);
    const up = own.filter((l) => l.dataset.state === 'up').length;
    const badge = $('.badge', card);
    badge.textContent = `${up}/${own.length}`;
    badge.dataset.state = up === own.length ? 'up' : 'down';
    badge.hidden = false;
  }

  const checked = links.filter((l) => l.dataset.state !== 'pending');
  const down = links.filter((l) => l.dataset.state === 'down');
  if (!checked.length) setHealth('pending', 'Vérification…');
  else if (!down.length) setHealth('up', `${links.length}/${links.length} services en ligne`);
  else setHealth('down', down.length === 1 ? `${down[0].dataset.name} hors ligne` : `${down.length} services hors ligne`);
}

function setHealth(state, label) {
  $('#health').dataset.state = state;
  $('#health-label').textContent = label;
}

// ---------------------------------------------------------------- flux RSS

function buildRss(sec, body, actions) {
  const feeds = (sec.feeds || []).filter((f) => f.url).map((f) => renderFeed(f, sec));
  if (!feeds.length) {
    body.append(h('p', { class: 'empty' }, 'Aucun flux. Ajoute-en depuis le mode édition.'));
    return;
  }
  body.append(h('div', { class: 'feeds', style: { '--cols': feeds.length } }, feeds));
  actions.append(iconButton('refresh', 'Actualiser les flux', async (btn) => {
    btn.classList.add('spin');
    await Promise.all(feeds.map((f) => f.reload(true)));
    btn.classList.remove('spin');
  }));
}

function renderFeed(feed, sec) {
  const list = h('div', { class: 'feed-list', style: { 'max-height': `${sec.maxHeight || 420}px` } }, skeletons(4));
  const refresh = iconButton('refresh', `Actualiser ${feed.name || ''}`.trim(), () => load(true));
  const name = h('span', { class: 'feed-name' }, feed.name || hostOf(feed.url));
  const col = h('div', { class: 'feed' },
    h('div', { class: 'feed-head' }, renderIcon(feed.icon || 'favicon', feed.url, feed.name, 'ico feed-ico'), name, refresh),
    list);

  async function load(force) {
    refresh.classList.add('spin');
    try {
      const data = await api(`/api/rss?url=${encodeURIComponent(feed.url)}${force ? '&force' : ''}`);
      if (!feed.name && data.title) name.textContent = data.title;
      const posts = data.items.slice(0, sec.limit || 20).map((p) => renderPost(p, sec));
      list.replaceChildren(...(posts.length ? posts : [h('p', { class: 'empty' }, 'Aucun article pour le moment.')]));
      list.scrollTop = 0;
    } catch (err) {
      list.replaceChildren(h('p', { class: 'empty' }, err.message || 'Flux indisponible.'));
    } finally {
      refresh.classList.remove('spin');
    }
  }

  col.reload = load;
  load(false);
  return col;
}

function renderPost(post, sec) {
  return h(post.link ? 'a' : 'div', { class: 'post', href: post.link || null, target: target(), rel: 'noopener noreferrer' },
    h('h3', {}, post.title, post.link ? h('span', { class: 'post-arrow', 'aria-hidden': 'true', html: svg('arrow') }) : null),
    post.description ? h('p', {}, post.description) : null,
    sec.showDates && post.date ? h('span', { class: 'post-meta' }, h('time', { datetime: post.date }, ago(post.date))) : null);
}

// ---------------------------------------------------------------- pages intégrées

function buildFrame(sec, body, actions) {
  if (!sec.url) {
    body.append(h('p', { class: 'empty' }, 'Aucune adresse. Indique-la depuis le mode édition.'));
    return;
  }
  const frame = h('iframe', {
    src: sec.url,
    title: sec.name || 'Page intégrée',
    loading: 'lazy',
    allow: 'autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture',
    allowfullscreen: true,
  });
  const wrap = h('div', { class: `frame${sec.transparent === false ? ' is-opaque' : ''}`, style: { '--h': `${sec.height || 400}px` } }, frame);
  frame.addEventListener('load', () => wrap.classList.add('is-loaded'));

  actions.append(
    iconButton('refresh', 'Recharger', () => { wrap.classList.remove('is-loaded'); frame.src = sec.url; }),
    openButton(sec.url));
  body.append(wrap);
}

// ---------------------------------------------------------------- horloge

function startClock() {
  const fmtDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const tick = () => {
    const now = new Date();
    const hour = now.getHours();
    $('#greeting').textContent = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
    $('#date').textContent = fmtDate.format(now);
    $('#clock').textContent = fmtTime.format(now);
    $('#clock').setAttribute('datetime', now.toISOString());
    setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  };
  tick();
}
