// Comptes à rebours vers tes événements (aucune API). Un événement « chaque année » se recale tout seul.
import { h } from '../lib.js';
import { countdownParts } from './space.js';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const pad = (n) => String(n).padStart(2, '0');

// Si aucun événement n'est configuré : les grandes dates de l'année
const DEFAULT_EVENTS = [
  { name: 'Noël', date: '2000-12-25T00:00', emoji: '🎄', yearly: true },
  { name: 'Nouvel An', date: '2000-01-01T00:00', emoji: '🎆', yearly: true },
  { name: 'Halloween', date: '2000-10-31T00:00', emoji: '🎃', yearly: true },
];

function nextOccurrence(e, now = new Date()) {
  const date = new Date(e.date);
  if (Number.isNaN(date.getTime())) return null;
  if (!e.yearly) return date;
  const d = new Date(date);
  d.setFullYear(now.getFullYear());
  if (d < now) d.setFullYear(now.getFullYear() + 1);
  return d;
}

const short = (ms) => {
  const { d, h: hh, m } = countdownParts(ms);
  if (d >= 2) return `dans ${d} jours`;
  if (d === 1) return `dans 1 jour ${hh} h`;
  return hh ? `dans ${hh} h ${pad(m)}` : `dans ${m} min`;
};

export function buildCountdown(sec, body, actions, card) {
  const now = new Date();
  const events = (sec.events?.length ? sec.events : DEFAULT_EVENTS)
    .map((e) => ({ ...e, at: nextOccurrence(e, now) }))
    .filter((e) => e.at && (e.at > now || sec.showPast))
    .sort((a, b) => a.at - b.at);

  if (!events.length) {
    body.append(h('p', { class: 'empty' }, 'Aucun événement à venir. Ajoute-en depuis le mode édition.'));
    return;
  }
  const [next, ...rest] = events;
  const clock = h('div', { class: 'cd-clock' });
  const rows = rest.slice(0, sec.limit || 6).map((e) => ({ e, el: h('small', {}) }));

  body.append(h('div', { class: 'countdown' },
    h('div', { class: 'cd-next' },
      h('span', { class: 'cd-emoji', 'aria-hidden': 'true' }, next.emoji || '⏳'),
      h('strong', { class: 'cd-name' }, next.name),
      clock,
      h('span', { class: 'cd-date' }, fmtDate.format(next.at))),
    rows.length ? h('div', { class: 'cd-list' }, rows.map(({ e, el }) =>
      h('div', { class: 'cd-row', title: fmtDate.format(e.at) },
        h('span', { class: 'cd-row-emoji', 'aria-hidden': 'true' }, e.emoji || '•'),
        h('strong', {}, e.name),
        el))) : null));

  const tick = () => {
    if (!card.isConnected && card.dataset.rendered) { clearInterval(timer); return; }
    const ms = next.at - Date.now();
    const { d, h: hh, m, s } = countdownParts(ms);
    clock.replaceChildren(...(ms <= 0
      ? [h('span', { class: 'cd-now' }, 'C’est maintenant ! 🎉')]
      : [[d, 'jours'], [hh, 'h'], [m, 'min'], [s, 's']].map(([v, u]) => h('span', { class: 'cd-unit' }, h('strong', {}, u === 'jours' ? String(v) : pad(v)), h('small', {}, u)))));
    for (const { e, el } of rows) el.textContent = short(e.at - Date.now());
  };
  const timer = setInterval(tick, 1000);
  tick();
  queueMicrotask(() => { card.dataset.rendered = '1'; });
}
