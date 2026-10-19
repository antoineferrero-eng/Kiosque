// Dernières vidéos des chaînes suivies (flux RSS YouTube via /api/youtube).
import { h, svg, api, iconButton, ago } from '../lib.js';

export function buildYoutube(sec, body, actions, card) {
  const show = sec.show || 8;
  const grid = h('div', { class: 'videos' }, Array.from({ length: show }, () => h('div', { class: 'sk sk-video' })));
  const more = h('button', { class: 'more-btn', type: 'button', hidden: true });
  body.append(grid, more);

  let videos = [];
  let expanded = false;
  more.addEventListener('click', () => { expanded = !expanded; render(); });

  const refresh = iconButton('refresh', 'Actualiser les vidéos', () => load(true));
  actions.append(refresh);

  let timer;
  async function load(force) {
    clearTimeout(timer);
    refresh.classList.add('spin');
    try {
      videos = await api(`/api/youtube?section=${encodeURIComponent(sec.id)}${force ? '&force' : ''}`);
      render();
    } catch (err) {
      grid.replaceChildren(h('p', { class: 'empty' }, err.message));
    } finally {
      refresh.classList.remove('spin');
      if (card.isConnected) timer = setTimeout(() => load(false), 15 * 60_000);
    }
  }

  function render() {
    const list = expanded ? videos : videos.slice(0, show);
    grid.replaceChildren(...(list.length ? list.map((v) => videoCard(v, sec)) : [h('p', { class: 'empty' }, sec.channels?.length ? 'Aucune vidéo récente.' : 'Aucune chaîne. Ajoute-en depuis le mode édition.')]));
    more.hidden = videos.length <= show;
    more.innerHTML = expanded ? `Afficher moins ${svg('chevron')}` : `Afficher ${videos.length - show} vidéos de plus ${svg('chevron')}`;
    more.classList.toggle('is-open', expanded);
  }

  load(false);
}

function videoCard(v, sec) {
  const card = h('a', { class: 'video', href: v.link, target: '_blank', rel: 'noopener noreferrer' },
    h('div', { class: 'thumb' },
      h('img', { src: v.thumbnail, alt: '', loading: 'lazy', decoding: 'async' }),
      h('span', { class: 'thumb-play', html: svg('play') })),
    h('div', { class: 'video-info' },
      h('h3', { title: v.title }, v.title),
      h('p', {},
        h('span', { class: 'video-author' }, v.author),
        h('span', { 'aria-hidden': 'true' }, ' · '),
        h('time', { datetime: v.date, title: new Date(v.date).toLocaleString('fr-FR') }, ago(v.date)))));

  // Clic simple : lecture dans la page. Ctrl/Cmd/clic molette : ouvre YouTube normalement.
  if (sec.player !== 'tab') {
    card.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openPlayer(v);
    });
  }
  return card;
}

let player;
function openPlayer(v) {
  player ??= createPlayer();
  player.frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0`;
  player.title.textContent = v.title;
  player.author.textContent = v.author;
  player.link.href = v.link;
  player.dialog.showModal();
}

function createPlayer() {
  const frame = h('iframe', {
    title: 'Lecteur YouTube',
    allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write',
    allowfullscreen: true,
  });
  const title = h('h3', {});
  const author = h('p', {});
  const link = h('a', { class: 'btn', target: '_blank', rel: 'noopener noreferrer', html: `${svg('external')}<span>Ouvrir sur YouTube</span>` });
  const dialog = h('dialog', { class: 'player', 'aria-label': 'Lecture de la vidéo' },
    h('div', { class: 'player-frame' }, frame),
    h('div', { class: 'player-bar' },
      h('div', { class: 'player-meta' }, title, author),
      link,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', title: 'Fermer (Échap)', html: svg('x'), onclick: () => dialog.close() })));

  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { frame.src = 'about:blank'; });
  document.body.append(dialog);
  return { dialog, frame, title, author, link };
}
