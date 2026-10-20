// Comparateur de prix : meilleur prix de chaque produit entre Idealo, LeDénicheur et une boutique,
// écart avec les autres sources, évolution jour par jour et prix cible (via /api/data).
import { h, dataWidget } from '../lib.js';

const link = (url, attrs, ...children) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', ...attrs }, ...children);

function sparkline(series) {
  if (series.length < 2) return null;
  const values = series.map(([, v]) => v);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const d = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(24 - ((v - min) / range) * 22 - 1).toFixed(2)}`).join(' ');
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 100 24');
  el.setAttribute('preserveAspectRatio', 'none');
  el.setAttribute('class', `spark ${values.at(-1) <= values[0] ? 'is-up' : 'is-down'}`);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<polyline points="${d}" vector-effect="non-scaling-stroke"/>`;
  return el;
}

// « −12 € en 9 j » par rapport au premier relevé, « au plus bas » quand c'est le minimum connu
function trend(p, money) {
  if (!p.best || p.history.length < 2) return null;
  const [firstDay, first] = p.history[0];
  const diff = p.best.price - first;
  const days = Math.round((Date.now() - Date.parse(firstDay)) / 86_400_000);
  if (Math.abs(diff) < 0.01) return h('small', { class: 'pr-trend' }, `stable sur ${days} j`);
  return h('small', { class: `pr-trend ${diff < 0 ? 'is-up' : 'is-down'}`, title: `Premier relevé : ${money.format(first)} le ${new Date(firstDay).toLocaleDateString('fr-FR')}` },
    `${diff < 0 ? '−' : '+'}${money.format(Math.abs(diff))} en ${days} j`);
}

function product(p) {
  const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: p.currency || 'EUR' });
  const best = p.best;
  const atLowest = best && p.history.length > 1 && best.price <= p.lowest;
  const others = p.offers.filter((o) => o.url !== best?.url);
  const bestCount = p.offers.find((o) => o.url === best?.url)?.count;

  return h('div', { class: `pr-item${p.reached ? ' is-reached' : ''}${best ? '' : ' is-missing'}` },
    link(best?.url ?? p.offers[0].url, { class: 'pr-thumb', tabindex: '-1', 'aria-hidden': 'true' },
      p.image ? h('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null),
    h('div', { class: 'pr-main' },
      link(best?.url ?? p.offers[0].url, { class: 'pr-name', title: p.name }, p.name),
      h('div', { class: 'pr-offers' },
        best ? link(best.url, { class: 'pr-offer is-best', title: 'Meilleur prix' }, best.shop) : null,
        others.map((o) => (o.price
          ? link(o.url, { class: 'pr-offer', title: o.stale ? 'Dernier prix connu (site injoignable)' : `${o.count ? `${o.count} offres, ` : ''}jusqu’à ${o.high ? money.format(o.high) : '–'}` },
            o.shop, h('span', {}, `+${money.format(o.price - best.price)}`))
          : link(o.url, { class: 'pr-offer is-error', title: o.error ?? 'Prix indisponible' }, o.shop, h('span', {}, '?')))))),
    h('div', { class: 'pr-side' },
      best
        ? h('strong', { class: 'pr-price', title: bestCount ? `${bestCount} offres sur ${best.shop}` : null }, money.format(best.price))
        : h('strong', { class: 'pr-price is-none', title: p.offers[0]?.error ?? '' }, '–'),
      sparkline(p.history),
      p.reached
        ? h('small', { class: 'pr-flag is-reached', title: `Prix cible : ${money.format(p.target)}` }, 'Prix cible atteint')
        : atLowest && p.best.price < p.history[0][1]
          ? h('small', { class: 'pr-flag', title: `Plus bas prix relevé, ${money.format(p.history[0][1])} au premier relevé` }, `−${money.format(p.history[0][1] - p.best.price)} · au plus bas`)
          : trend(p, money) ?? (p.target ? h('small', { class: 'pr-trend' }, `cible ${money.format(p.target)}`) : null)));
}

export function buildPrices(sec, body, actions, card) {
  dataWidget({
    sec, body, actions, card, refresh: 1800, label: 'Actualiser les prix',
    render: ({ products }) => {
      if (!products.length) {
        body.replaceChildren(h('p', { class: 'empty' }, 'Aucun produit suivi : ouvre les réglages de la section pour en chercher un sur Idealo ou coller un lien LeDénicheur.'));
        return;
      }
      body.replaceChildren(h('div', { class: 'prices' }, products.map(product)));
    },
  });
}
