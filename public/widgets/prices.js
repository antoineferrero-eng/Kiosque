// Comparateur de prix : pour chaque produit, la meilleure offre parmi les boutiques retenues (Idealo et
// LeDénicheur réunis). Un clic déplie la courbe du prix (1 ou 3 mois, survolable), les repères (plus bas,
// moyenne, plus haut) et la liste des offres (via /api/data).
import { h, svg, store, dataWidget } from '../lib.js';

const link = (url, attrs, ...children) => (url
  ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', ...attrs }, ...children)
  : h('span', attrs, ...children));
const shortDate = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const longDate = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
let uid = 0;

// Tracé en escalier (un prix tient jusqu'au changement suivant), interrompu là où le prix est inconnu.
// Renvoie le chemin de la ligne et celui de l'aire, en coordonnées du viewBox.
function stepPaths(values, x, y, bottom) {
  let line = '';
  let area = '';
  let run = [];
  const flush = () => {
    if (!run.length) return;
    let d = `M${x(run[0][0]).toFixed(1)},${y(run[0][1]).toFixed(1)}`;
    for (let k = 1; k < run.length; k++) d += `H${x(run[k][0]).toFixed(1)}V${y(run[k][1]).toFixed(1)}`;
    // un point isolé : juste un petit palier, sans aire (sinon on verrait une barre)
    if (run.length === 1) d += `h${run[0][0] === values.length - 1 ? -4 : 4}`;
    else area += `${d}V${bottom}H${x(run[0][0]).toFixed(1)}Z`;
    line += d;
    run = [];
  };
  values.forEach((v, i) => { if (v == null) flush(); else run.push([i, v]); });
  flush();
  return { line, area };
}

function sparkline(series) {
  const values = series.slice(-30).map(([, v]) => v);
  const known = values.filter((v) => v != null);
  if (known.length < 2) return null;
  const lo = Math.min(...known);
  const range = Math.max(...known) - lo || 1;
  const { line, area } = stepPaths(values, (i) => (i / (values.length - 1)) * 100, (v) => 21 - ((v - lo) / range) * 18, 24);
  const down = known.at(-1) <= known[0];
  return h('span', { class: `pr-spark ${down ? 'is-down' : 'is-up'}`, 'aria-hidden': 'true',
    html: `<svg viewBox="0 0 100 24" preserveAspectRatio="none"><path class="a" d="${area}"/><path class="l" d="${line}" vector-effect="non-scaling-stroke"/></svg>` });
}

// Grand graphique : aire en dégradé, ligne cible en pointillés, repère du plus bas, survol avec infobulle
function chart(series, { money, target }) {
  const values = series.map(([, v]) => v);
  const known = values.filter((v) => v != null);
  if (known.length < 2) return h('p', { class: 'pr-chart-empty' }, 'La courbe se dessinera au fil des relevés quotidiens.');
  let lo = Math.min(...known);
  let hi = Math.max(...known);
  const spread = hi - lo || hi * 0.05 || 1;
  const showTarget = target && target > lo - spread * 0.6 && target < hi + spread * 0.6;
  if (showTarget) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
  const pad = (hi - lo || spread) * 0.14;
  const top = hi + pad;
  const bottom = lo - pad;
  const W = 600;
  const H = 150;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => H - ((v - bottom) / (top - bottom)) * H;
  const { line, area } = stepPaths(values, x, y, H);
  const id = `prg${++uid}`;
  const minIndex = values.indexOf(Math.min(...known));
  const pct = (i, v) => ({ left: `${(x(i) / W) * 100}%`, top: `${(y(v) / H) * 100}%` });

  const svgEl = h('div', { class: 'pr-chart-svg', html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tint)" stop-opacity="0.32"/><stop offset="1" stop-color="var(--tint)" stop-opacity="0"/></linearGradient></defs>
    <line class="grid" x1="0" x2="${W}" y1="${y(hi).toFixed(1)}" y2="${y(hi).toFixed(1)}" vector-effect="non-scaling-stroke"/>
    <line class="grid" x1="0" x2="${W}" y1="${y(lo).toFixed(1)}" y2="${y(lo).toFixed(1)}" vector-effect="non-scaling-stroke"/>
    ${showTarget ? `<line class="target" x1="0" x2="${W}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" vector-effect="non-scaling-stroke"/>` : ''}
    <path class="area" d="${area}" fill="url(#${id})"/>
    <path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
  </svg>` });
  const guide = h('span', { class: 'pr-guide' });
  const dot = h('span', { class: 'pr-dot' });
  const tip = h('span', { class: 'pr-tip' });
  const minDot = h('span', { class: 'pr-min', style: pct(minIndex, values[minIndex]), title: `Plus bas : ${money.format(values[minIndex])}` });
  const lastIndex = values.findLastIndex((v) => v != null);
  const nowDot = h('span', { class: 'pr-now', style: pct(lastIndex, values[lastIndex]) });
  const zone = h('div', { class: 'pr-chart-zone' }, svgEl, minDot, nowDot, guide, dot, tip);

  const nearest = (i) => {
    for (let d = 0; d < values.length; d++) {
      if (values[i - d] != null) return i - d;
      if (values[i + d] != null) return i + d;
    }
    return lastIndex;
  };
  const show = (e) => {
    const box = zone.getBoundingClientRect();
    const i = nearest(Math.round(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) * (values.length - 1)));
    const at = pct(i, values[i]);
    zone.classList.add('is-hover');
    guide.style.left = at.left;
    Object.assign(dot.style, at);
    tip.replaceChildren(h('strong', {}, money.format(values[i])), h('small', {}, longDate(series[i][0])));
    Object.assign(tip.style, at);
    tip.classList.toggle('is-right', x(i) / W > 0.62);
  };
  zone.addEventListener('pointermove', show);
  zone.addEventListener('pointerdown', show);
  zone.addEventListener('pointerleave', () => zone.classList.remove('is-hover'));

  return h('div', { class: 'pr-chart' },
    h('div', { class: 'pr-axis-y' }, h('span', {}, money.format(hi)), h('span', {}, money.format(lo))),
    zone,
    h('div', { class: 'pr-axis-x' }, h('span', {}, shortDate(series[0][0])), h('span', {}, shortDate(series[Math.floor(series.length / 2)][0])), h('span', {}, 'auj.')),
    showTarget ? h('span', { class: 'pr-target-label', style: { top: `${(y(target) / H) * 100}%` } }, `cible ${money.format(target)}`) : null);
}

function changeBadge(p, money) {
  if (p.reached) return h('small', { class: 'pr-flag is-reached', title: `Prix cible : ${money.format(p.target)}` }, 'Cible atteinte');
  const s = p.stats;
  if (!p.best || !s || s.days < 2) return p.target ? h('small', { class: 'pr-change' }, `cible ${money.format(p.target)}`) : null;
  if (p.best.price <= s.min + 0.005 && s.max > s.min) return h('small', { class: 'pr-flag', title: `Le plus bas des ${s.days} derniers jours` }, 'Au plus bas');
  if (Math.abs(s.change) < 0.5) return h('small', { class: 'pr-change' }, `stable · ${s.changeDays} j`);
  const pctChange = (s.change / (p.best.price - s.change)) * 100;
  return h('small', { class: `pr-change ${s.change < 0 ? 'is-down' : 'is-up'}`, title: `${s.change < 0 ? 'Baisse' : 'Hausse'} de ${money.format(Math.abs(s.change))} en ${s.changeDays} jours` },
    `${s.change < 0 ? '↓' : '↑'} ${Math.abs(pctChange).toFixed(pctChange > -10 && pctChange < 10 ? 1 : 0).replace('.', ',')} % · ${s.changeDays} j`);
}

function shipping(o, money) {
  if (o.shipping === 0) return 'livraison offerte';
  if (o.shipping > 0) return `+ ${money.format(o.shipping)} de port`;
  return o.delivery ? `livré ${o.delivery.replace(/^jusqu'au /, 'd’ici le ')}` : null;
}

function detail(p, money, period, setPeriod) {
  const days = period === '1m' ? 30 : 90;
  const series = p.series.slice(-days);
  const s = p.stats;
  const shown = series.filter(([, v]) => v != null).map(([, v]) => v);
  const tabs = h('div', { class: 'pr-periods', role: 'tablist' }, [['1m', '1 mois'], ['3m', '3 mois']].map(([key, label]) => {
    const b = h('button', { type: 'button', class: key === period ? 'is-on' : null, role: 'tab', 'aria-selected': String(key === period) }, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); setPeriod(key); });
    return b;
  }));
  const stat = (label, value, sub) => h('div', { class: 'pr-stat' }, h('small', {}, label), h('strong', {}, value), sub ? h('span', {}, sub) : null);
  const min = shown.length ? Math.min(...shown) : null;
  const max = shown.length ? Math.max(...shown) : null;
  const minDay = series.find(([, v]) => v === min)?.[0];

  const offers = p.offers.map((o, i) => link(o.url, { class: `pr-offer${i === 0 ? ' is-best' : ''}${o.inStock === false ? ' is-out' : ''}` },
    h('span', { class: 'pr-offer-shop' }, h('strong', {}, o.shop), o.marketplace ? h('em', { title: 'Vendeur tiers sur la plateforme' }, 'tiers') : null,
      h('small', {}, [o.inStock === false ? 'en rupture' : shipping(o, money)].filter(Boolean).join(' · '))),
    h('span', { class: 'pr-offer-price' }, h('strong', {}, money.format(o.price)),
      i > 0 && p.best ? h('small', {}, `+${money.format(o.price - p.best.price)}`) : h('small', { class: 'is-best' }, 'meilleur prix'))));

  const errors = p.sources.filter((src) => src.error);
  const sourceLabel = { idealo: 'Idealo', ledenicheur: 'LeDénicheur', shop: 'la boutique' };
  return h('div', { class: 'pr-detail' },
    h('div', { class: 'pr-detail-head' }, h('span', { class: 'pr-detail-title' }, 'Évolution du prix'), tabs),
    chart(series, { money, target: p.target }),
    s ? h('div', { class: 'pr-stats' },
      stat('Plus bas', min != null ? money.format(min) : '–', minDay ? shortDate(minDay) : null),
      stat('Moyenne', shown.length ? money.format(shown.reduce((a, b) => a + b, 0) / shown.length) : '–', `${shown.length} j`),
      stat('Plus haut', max != null ? money.format(max) : '–', p.best && min ? `actuel ${p.best.price <= min + 0.005 ? 'au plus bas' : `+${Math.round(((p.best.price - min) / min) * 100)} %`}` : null)) : null,
    p.offers.length
      ? h('div', { class: 'pr-offers' }, offers,
        p.offerCount > p.offers.length ? h('p', { class: 'pr-more' }, `et ${p.offerCount - p.offers.length} autre${p.offerCount - p.offers.length > 1 ? 's' : ''} offre${p.offerCount - p.offers.length > 1 ? 's' : ''}`) : null)
      : h('p', { class: 'pr-none' }, 'Aucune offre chez les boutiques retenues pour l’instant.'),
    p.outside ? link(p.outside.url, { class: 'pr-outside' }, 'Moins cher ailleurs : ', h('strong', {}, money.format(p.outside.price)), ` chez ${p.outside.shop}${p.outside.marketplace ? ' (vendeur tiers)' : ''}`) : null,
    h('p', { class: 'pr-sources' },
      'Comparé sur ', p.sources.flatMap((src, i) => [i ? (i === p.sources.length - 1 ? ' et ' : ', ') : '',
        link(src.url, { class: src.error ? 'is-error' : null, title: src.error ?? (src.stale ? 'Dernière lecture (site injoignable)' : `${src.offers} offres lues`) }, sourceLabel[src.source])]),
      errors.length ? h('span', { class: 'pr-src-error' }, ` · ${errors.map((e) => `${sourceLabel[e.source]} : ${e.error}`).join(' · ')}`) : null));
}

function product(p, { sec, openSet, persist, rerender, period, setPeriod, card }) {
  const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: p.currency || 'EUR' });
  const key = p.name;
  const open = openSet.has(key);
  const best = p.best;
  const meta = best
    ? [`chez ${best.shop}${best.marketplace ? ' (tiers)' : ''}`, p.offerCount > 1 ? `${p.offerCount} offres` : null].filter(Boolean).join(' · ')
    : p.outside ? `pas chez tes boutiques · ${money.format(p.outside.price)} chez ${p.outside.shop}` : (p.sources.find((s) => s.error)?.error ?? 'aucune offre');

  const row = h('button', { class: 'pr-row', type: 'button', 'aria-expanded': String(open), title: open ? 'Replier' : 'Voir la courbe et les offres' },
    h('span', { class: 'pr-thumb' }, p.image ? h('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'pr-noimg', html: svg('tag') })),
    h('span', { class: 'pr-main' }, h('strong', { class: 'pr-name' }, p.name), h('small', { class: 'pr-meta' }, meta)),
    sparkline(p.series),
    h('span', { class: 'pr-side' },
      h('strong', { class: `pr-price${best ? '' : ' is-none'}` }, best ? money.format(best.price) : '–'),
      changeBadge(p, money)));
  row.addEventListener('click', () => {
    // en format mini, pas de détail : on ouvre directement la meilleure offre
    if (card.dataset.size === 'xs') { if (best?.url) window.open(best.url, '_blank', 'noopener'); return; }
    if (openSet.has(key)) openSet.delete(key); else openSet.add(key);
    persist();
    rerender();
  });
  return h('article', { class: `pr-item${open ? ' is-open' : ''}${p.reached ? ' is-reached' : ''}${best ? '' : ' is-missing'}` },
    row,
    open ? detail(p, money, period, setPeriod) : null);
}

export function buildPrices(sec, body, actions, card) {
  const storeKey = `kiosque.prices.${sec.id}`;
  const saved = store.get(storeKey, null);
  const openSet = new Set(saved?.open ?? []);
  let period = saved?.period ?? '3m';
  let last = null;
  const persist = () => store.set(storeKey, { open: [...openSet], period });

  function render(data = last) {
    last = data;
    const { products } = data;
    if (!products.length) {
      body.replaceChildren(h('p', { class: 'empty' }, 'Aucun produit suivi : ouvre les réglages de la section pour en chercher un sur Idealo ou LeDénicheur.'));
      return;
    }
    // un seul produit : son détail est ouvert d'office (sauf si on l'a replié)
    if (products.length === 1 && !saved) openSet.add(products[0].name);
    const ctx = {
      sec, openSet, persist, card, period,
      rerender: () => render(),
      setPeriod: (p) => { period = p; persist(); render(); },
    };
    body.replaceChildren(h('div', { class: 'prices' }, products.map((p) => product(p, ctx))));
  }

  dataWidget({ sec, body, actions, card, refresh: 1800, label: 'Actualiser les prix', render: (data) => render(data) });
}
