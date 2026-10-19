// Matchs e-sport majeurs du jour (données PandaScore via /api/esport).
import { h, svg, api, iconButton, skeletons, fillArea, sameDay } from '../lib.js';

const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export function buildEsport(sec, body, actions, card) {
  const { fill, scroll } = fillArea(sec.maxHeight || sec.minHeight || 300, skeletons(3, 'sk sk-match'));
  scroll.classList.add('esport');
  body.append(fill);

  const badge = card.querySelector('.badge');
  const refresh = iconButton('refresh', 'Actualiser les matchs', () => load(true));
  actions.append(refresh);

  let timer;
  async function load(force) {
    clearTimeout(timer);
    refresh.classList.add('spin');
    try {
      render(await api(`/api/esport?section=${encodeURIComponent(sec.id)}${force ? '&force' : ''}`));
    } catch (err) {
      scroll.replaceChildren(h('p', { class: 'empty' }, err.message));
    } finally {
      refresh.classList.remove('spin');
      // la carte a pu être redessinée entre-temps (config modifiée) : on arrête alors de rafraîchir
      if (card.isConnected) timer = setTimeout(() => load(false), (sec.refresh || 300) * 1000);
    }
  }

  function render(matches) {
    const now = new Date();
    const today = matches.filter((m) => sameDay(new Date(m.beginAt), now));
    const live = matches.filter((m) => m.status === 'running');

    badge.hidden = !live.length;
    badge.textContent = live.length ? `${live.length} en direct` : '';
    badge.dataset.state = live.length ? 'live' : '';

    if (today.length) {
      const rows = today.map((m) => matchRow(m));
      scroll.replaceChildren(...rows);
      // comme avant : on se place sur le premier match pas encore terminé
      const next = rows.find((r) => !r.classList.contains('is-past'));
      if (next) requestAnimationFrame(() => scroll.scrollTo({ top: next.offsetTop - 6, behavior: 'smooth' }));
      return;
    }

    const upcoming = matches.find((m) => Date.parse(m.beginAt) > now && m.status === 'not_started');
    const recent = matches.filter((m) => m.status === 'finished').slice(-3).reverse();
    const parts = [h('p', { class: 'esport-empty' }, 'Aucun match majeur aujourd’hui.')];
    if (upcoming) parts.push(h('p', { class: 'eyebrow' }, 'Prochain match'), matchRow(upcoming, true));
    if (recent.length) parts.push(h('p', { class: 'eyebrow' }, 'Derniers résultats'), ...recent.map((m) => matchRow(m, true)));
    scroll.replaceChildren(...parts);
  }

  load(false);
}

function matchRow(m, withDay = false) {
  const start = new Date(m.beginAt);
  const live = m.status === 'running';
  const past = m.status === 'finished' || m.status === 'canceled';
  const [a, b] = m.teams;
  const hasScore = (live || past) && a?.score != null && b?.score != null;

  const when = live
    ? h('span', { class: 'live-pill' }, h('span', { class: 'live-dot' }), 'En direct')
    : h('span', { class: 'match-time' },
      withDay && !sameDay(start, new Date()) ? `${fmtDay.format(start)} · ` : '',
      past && !withDay ? 'Terminé' : fmtTime.format(start));

  const team = (t, side) => t
    ? h('div', { class: `team team-${side}${hasScore && t.score > (side === 'a' ? b : a).score ? ' is-winner' : ''}`, title: t.name },
      h('span', { class: 'team-logo' }, t.image ? h('img', { src: t.image, alt: '', loading: 'lazy' }) : t.acronym.charAt(0)),
      h('span', { class: 'team-name is-full' }, t.name.length > 14 ? t.acronym : t.name),
      h('span', { class: 'team-name is-short' }, t.acronym))
    : h('div', { class: `team team-${side} is-tbd` }, h('span', { class: 'team-logo' }, '?'), h('span', { class: 'team-name' }, 'À déterminer'));

  return h('article', { class: `match${live ? ' is-live' : ''}${past ? ' is-past' : ''}`, style: { '--game': m.color } },
    h('div', { class: 'match-top' },
      when,
      h('span', { class: 'game-chip' }, m.gameName)),
    h('div', { class: 'match-teams' },
      team(a, 'a'),
      h('span', { class: 'match-score' }, hasScore ? `${a.score} – ${b.score}` : 'vs'),
      team(b, 'b')),
    h('div', { class: 'match-foot' },
      h('span', { class: 'match-league', title: m.tournament },
        m.leagueImage ? h('img', { src: m.leagueImage, alt: '', loading: 'lazy' }) : null,
        h('span', {}, [m.league, m.bestOf > 1 ? `BO${m.bestOf}` : null].filter(Boolean).join(' · '))),
      m.stream ? h('a', { class: 'stream-btn', href: m.stream, target: '_blank', rel: 'noopener noreferrer', html: `${svg(live ? 'tv' : 'play')}<span>${past ? 'Replay' : 'Regarder'}</span>` }) : null));
}
