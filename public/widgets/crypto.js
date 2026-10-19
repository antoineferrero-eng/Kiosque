// Cours des cryptomonnaies avec mini-graphique sur 7 jours (CoinGecko via /api/data).
import { h, dataWidget } from '../lib.js';

function sparkline(points, up) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const d = points.map((p, i) => `${((i / (points.length - 1)) * 100).toFixed(2)},${(30 - ((p - min) / range) * 28 - 1).toFixed(2)}`).join(' ');
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 100 30');
  el.setAttribute('preserveAspectRatio', 'none');
  el.setAttribute('class', `spark ${up ? 'is-up' : 'is-down'}`);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<polyline points="${d}" vector-effect="non-scaling-stroke"/>`;
  return el;
}

export function buildCrypto(sec, body, actions, card) {
  dataWidget({
    sec, body, actions, card, refresh: 300, label: 'Actualiser les cours',
    render: ({ currency, coins }) => {
      if (!coins.length) { body.replaceChildren(h('p', { class: 'empty' }, 'Aucune cryptomonnaie trouvée : vérifie les identifiants.')); return; }
      const price = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase(), maximumSignificantDigits: 6 });
      const pct = (v) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`);
      body.replaceChildren(h('div', { class: 'coins' }, coins.map((c) => {
        const up = (c.change7d ?? c.change24 ?? 0) >= 0;
        return h('a', { class: 'coin', href: `https://www.coingecko.com/fr/pi%C3%A8ces/${c.id}`, target: '_blank', rel: 'noopener noreferrer' },
          h('img', { class: 'coin-ico', src: c.image, alt: '', loading: 'lazy' }),
          h('span', { class: 'coin-name' }, h('strong', {}, c.symbol), h('small', {}, c.name)),
          sparkline(c.spark, up),
          h('span', { class: 'coin-price' },
            h('strong', {}, price.format(c.price)),
            h('small', { class: (c.change24 ?? 0) >= 0 ? 'is-up' : 'is-down', title: `7 jours : ${pct(c.change7d)}` }, `${pct(c.change24)} 24 h`)));
      })));
    },
  });
}
