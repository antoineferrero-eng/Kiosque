// Jeux gratuits du moment (Epic Games, Steam, GOG…) et bons plans PC (CheapShark).
import { h, svg, dataWidget } from '../lib.js';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function until(iso) {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86400_000);
  if (days <= 0) return 'dernier jour';
  if (days === 1) return 'encore 1 jour';
  return days <= 7 ? `encore ${days} jours` : `jusqu’au ${fmtDate.format(new Date(iso))}`;
}

export function buildFreeGames(sec, body, actions, card) {
  dataWidget({
    sec, body, actions, card, refresh: 1800, label: 'Actualiser les jeux gratuits',
    render: (games) => {
      if (!games.length) { body.replaceChildren(h('p', { class: 'empty' }, 'Aucun jeu gratuit pour le moment.')); return; }
      body.replaceChildren(h('div', { class: 'games' }, games.map((g) =>
        h('a', { class: `game${g.upcoming ? ' is-upcoming' : ''}`, href: g.url, target: '_blank', rel: 'noopener noreferrer' },
          h('div', { class: 'game-art' },
            g.image ? h('img', { src: g.image, alt: '', loading: 'lazy' }) : null,
            h('span', { class: 'game-badge' }, g.upcoming ? `Dès le ${fmtDate.format(new Date(g.start))}` : 'Gratuit')),
          h('div', { class: 'game-info' },
            h('strong', { title: g.title }, g.title),
            h('span', { class: 'game-meta' },
              h('span', { class: 'game-store' }, g.store),
              g.worth ? h('s', {}, g.worth) : null),
            !g.upcoming && g.end ? h('small', {}, until(g.end)) : null)))));
    },
  });
}

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' });

export function buildDeals(sec, body, actions, card) {
  dataWidget({
    sec, body, actions, card, refresh: 1800, label: 'Actualiser les promos',
    render: (deals) => {
      if (!deals.length) { body.replaceChildren(h('p', { class: 'empty' }, 'Aucune promo avec ces critères.')); return; }
      body.replaceChildren(h('div', { class: 'deals' }, deals.map((d) =>
        h('a', { class: 'deal', href: d.url, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'deal-art' }, d.image ? h('img', { src: d.image, alt: '', loading: 'lazy' }) : null),
          h('span', { class: 'deal-info' },
            h('strong', { title: d.title }, d.title),
            h('span', { class: 'deal-meta' },
              d.storeIcon ? h('img', { src: d.storeIcon, alt: '', loading: 'lazy' }) : null,
              h('span', {}, d.store),
              d.rating ? h('span', { class: `deal-rating${d.rating >= 80 ? ' is-good' : ''}`, title: `Avis Steam : ${d.ratingText}` }, `${d.rating} %`) : null)),
          h('span', { class: 'deal-price' },
            h('span', { class: 'deal-off' }, `-${d.savings}%`),
            h('strong', {}, d.sale === 0 ? 'Gratuit' : money.format(d.sale)),
            h('s', {}, money.format(d.normal)))))));
    },
  });
}
