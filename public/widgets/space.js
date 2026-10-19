// Prochains lancements spatiaux avec compte à rebours (The Space Devs via /api/data).
import { h, svg, dataWidget } from '../lib.js';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS = { Go: 'Confirmé', TBD: 'Date à confirmer', TBC: 'À confirmer', Hold: 'En attente', 'In Flight': 'En vol', Success: 'Réussi' };

export function countdownParts(ms) {
  const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const pad = (n) => String(n).padStart(2, '0');
const shortDelay = (ms) => {
  const { d, h: hh, m } = countdownParts(ms);
  const sign = ms < 0 ? 'T+' : 'T-';
  return d ? `${sign}${d} j ${hh} h` : `${sign}${pad(hh)}:${pad(m)}`;
};

export function buildLaunches(sec, body, actions, card) {
  let ticker;
  dataWidget({
    sec, body, actions, card, refresh: 1800, label: 'Actualiser les lancements',
    render: (launches) => {
      clearInterval(ticker);
      if (!launches.length) { body.replaceChildren(h('p', { class: 'empty' }, 'Aucun lancement prévu.')); return; }
      const [next, ...others] = launches;
      const clock = h('div', { class: 'launch-clock', 'aria-live': 'off' });
      const tick = () => {
        if (!card.isConnected) { clearInterval(ticker); return; }
        const ms = Date.parse(next.net) - Date.now();
        const { d, h: hh, m, s } = countdownParts(ms);
        clock.replaceChildren(
          h('span', { class: 'launch-sign' }, ms < 0 ? 'T+' : 'T-'),
          ...[[d, 'j'], [hh, 'h'], [m, 'min'], [s, 's']].map(([v, u]) => h('span', { class: 'launch-unit' }, h('strong', {}, u === 'j' ? String(v) : pad(v)), h('small', {}, u))));
      };
      body.replaceChildren(h('div', { class: 'launches' },
        h('div', { class: 'launch-next' },
          next.image ? h('img', { class: 'launch-art', src: next.image, alt: '', loading: 'lazy' }) : null,
          h('div', { class: 'launch-overlay' },
            h('span', { class: `launch-status is-${next.status.toLowerCase().replace(/\s+/g, '-')}` }, STATUS[next.status] ?? next.statusName),
            h('strong', { class: 'launch-name', title: next.description }, next.name),
            h('span', { class: 'launch-meta' }, [next.rocket, next.provider].filter(Boolean).join(' · ')),
            clock,
            h('span', { class: 'launch-meta' }, `${fmtDate.format(new Date(next.net))} · ${next.pad}`),
            next.video ? h('a', { class: 'stream-btn', href: next.video, target: '_blank', rel: 'noopener noreferrer', html: `${svg('play')}<span>${next.webcast ? 'En direct' : 'Vidéo'}</span>` }) : null)),
        others.length ? h('div', { class: 'launch-list' }, others.map((l) =>
          h('div', { class: 'launch-row', title: l.description },
            h('span', { class: 'launch-when' }, h('strong', {}, shortDelay(Date.parse(l.net) - Date.now())), h('small', {}, fmtDate.format(new Date(l.net)))),
            h('span', { class: 'launch-what' }, h('strong', {}, l.name), h('small', {}, [l.rocket, l.provider].filter(Boolean).join(' · ')))))) : null));
      tick();
      ticker = setInterval(tick, 1000);
    },
  });
}
