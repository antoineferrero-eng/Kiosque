// Dernières vidéos des chaînes suivies (flux RSS YouTube via /api/youtube).
import { h, svg, api, iconButton, ago } from '../lib.js';

export function buildYoutube(sec, body, actions, card) {
  const show = sec.show || 8;
  const grid = h('div', { class: 'videos' }, Array.from({ length: show }, () => h('div', { class: 'sk sk-video' })));
  const more = h('button', { class: 'more-btn', type: 'button', hidden: true });
  body.append(grid, more);

  let videos = [];
  let expanded = false;
  more.addEventListener('click', () => { expanded = !expanded; grid.classList.toggle('is-fitted', false); render(); });

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

  // Hauteur d'une rangée hors vignette (titre, chaîne), mesurée sur une vidéo affichée.
  // Chaque vidéo déborde de 6 px de chaque côté de sa case (marge négative pour le survol) :
  // la case fait 12 px de moins que la vidéo, et la vignette a exactement la largeur de la case.
  let infoHeight = 72;
  // (la plus grande parmi les vidéos affichées : certains titres font deux lignes)
  const measureInfo = () => {
    const heights = [...grid.querySelectorAll('.video')].map((v) => {
      const info = v.querySelector('.video-info');
      return info ? info.getBoundingClientRect().height : 0;
    });
    if (heights.length) infoHeight = Math.max(...heights);
  };

  // Carte de hauteur fixe : on cherche le nombre de colonnes qui remplit le mieux la hauteur
  // (vignettes plus grandes = rangées plus hautes), sans dépasser le nombre de vidéos disponibles.
  function fitFixedHeight() {
    const style = getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 0;
    const rowGap = parseFloat(style.rowGap) || 0;
    const width = grid.clientWidth;
    const buttonSpace = (more.offsetHeight || 36) + (parseFloat(getComputedStyle(more).marginTop) || 16);
    let best = null;
    for (let cols = 1; cols <= 8; cols++) {
      const tile = (width - (cols - 1) * gap) / cols;
      if (cols > 1 && tile < 170) break;
      if (tile > 560) continue;
      const rowHeight = tile * (9 / 16) + infoHeight;
      for (const withButton of [false, true]) {
        const space = body.clientHeight - (withButton ? buttonSpace : 0) - 2; // 2 px de marge pour les arrondis
        const rows = Math.floor((space + rowGap) / (rowHeight + rowGap));
        if (rows < 1) continue;
        const count = Math.min(videos.length, rows * cols);
        if ((videos.length > rows * cols) !== withButton) continue; // bouton seulement s'il reste des vidéos
        const usedRows = Math.ceil(count / cols);
        const empty = space - (usedRows * rowHeight + (usedRows - 1) * rowGap); // vide en bas
        const holes = (usedRows * cols - count) * (rowHeight / cols); // cases vides dans la dernière rangée
        const score = empty + holes;
        if (!best || score < best.score) best = { cols, count, score };
      }
    }
    return best;
  }

  // Combien de vidéos afficher (et sur combien de colonnes en hauteur fixe) : toujours des rangées complètes
  function layout() {
    if (!grid.isConnected || !videos.length) return show;
    if (card.classList.contains('has-height') && !card.classList.contains('is-collapsed')) {
      const fit = fitFixedHeight();
      if (fit) {
        grid.style.gridTemplateColumns = `repeat(${fit.cols}, minmax(0, 1fr))`;
        grid.classList.toggle('is-fitted', !expanded); // les rangées s'étirent pour finir de remplir la carte
        return fit.count;
      }
    }
    grid.style.removeProperty('grid-template-columns');
    grid.classList.remove('is-fitted');
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    return Math.min(videos.length, Math.max(cols, Math.ceil(show / cols) * cols));
  }
  const visibleCount = () => { measureInfo(); return layout(); };

  let shown = 0;
  function render(retry = true) {
    shown = visibleCount();
    const list = expanded ? videos : videos.slice(0, shown);
    grid.replaceChildren(...(list.length ? list.map((v) => videoCard(v, sec)) : [h('p', { class: 'empty' }, sec.channels?.length ? 'Aucune vidéo récente.' : 'Aucune chaîne. Ajoute-en depuis le mode édition.')]));
    more.hidden = videos.length <= shown;
    more.innerHTML = expanded ? `Afficher moins ${svg('chevron')}` : `Afficher ${videos.length - shown} vidéos de plus ${svg('chevron')}`;
    more.classList.toggle('is-open', expanded);
    // la première mesure se fait sur les vidéos rendues : on recale une fois si le compte change
    if (retry && !expanded && videos.length && visibleCount() !== shown) render(false);
  }

  // redimensionnement de la carte (poignée, fenêtre, colonnes) : on recalcule le nombre de vidéos
  let frame;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (!expanded && videos.length && visibleCount() !== shown) render(); });
  }).observe(body);

  load(false);
}

// Vignette en vrai 16:9 (hq720, en HD) : la vignette « hqdefault » est en 4:3 avec des bandes noires
// incrustées, qui apparaissent dès que la case n'est plus exactement en 16:9. Repli : mqdefault (16:9, plus petite).
function thumbnail(v) {
  const img = h('img', { src: `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hq720.jpg`, alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => { img.src = `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`; }, { once: true });
  return img;
}

function videoCard(v, sec) {
  const card = h('a', { class: 'video', href: v.link, target: '_blank', rel: 'noopener noreferrer' },
    h('div', { class: 'thumb' },
      thumbnail(v),
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
