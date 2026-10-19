// Lecteur de radios en direct. Un seul lecteur audio pour toute la page : la musique continue
// quand la page est redessinée (config modifiée), et suit les touches multimédia du système.
import { h, svg, store, renderIcon } from '../lib.js';

export const DEFAULT_STATIONS = [
  { name: 'FIP', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3', favicon: 'https://www.google.com/s2/favicons?domain=radiofrance.fr&sz=128' },
  { name: 'FIP Groove', url: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3', favicon: 'https://www.google.com/s2/favicons?domain=radiofrance.fr&sz=128' },
  { name: 'FIP Electro', url: 'https://icecast.radiofrance.fr/fipelectro-midfi.mp3', favicon: 'https://www.google.com/s2/favicons?domain=radiofrance.fr&sz=128' },
  { name: 'Mouv’', url: 'https://icecast.radiofrance.fr/mouv-midfi.mp3', favicon: 'https://www.google.com/s2/favicons?domain=mouv.fr&sz=128' },
  { name: 'Lofi 24/7', url: 'https://0nlineradio.radioho.st/0r-lo-fi?', favicon: null },
];

// ---------------------------------------------------------------- lecteur partagé

const audio = new Audio();
audio.preload = 'none';
audio.volume = store.get('kiosque.radio.volume', 0.7);
const player = { station: null, state: 'idle' }; // idle | loading | playing | paused | error
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const setState = (state) => { player.state = state; notify(); };
audio.addEventListener('playing', () => setState('playing'));
audio.addEventListener('waiting', () => setState('loading'));
audio.addEventListener('pause', () => setState('paused'));
audio.addEventListener('error', () => { if (player.station) setState('error'); });

function play(station) {
  if (player.station?.url === station.url && player.state === 'playing') { audio.pause(); return; }
  if (player.station?.url !== station.url) {
    audio.src = station.url;
    player.station = station;
    store.set('kiosque.radio.last', station);
  }
  setState('loading');
  audio.play().catch(() => setState('error'));
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: 'Radio en direct',
      artwork: station.favicon ? [{ src: station.favicon, sizes: '128x128' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => play(player.station));
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  }
}

const STATE_LABEL = { idle: 'Choisis une radio', loading: 'Connexion…', playing: 'En direct', paused: 'En pause', error: 'Flux indisponible' };

// ---------------------------------------------------------------- widget

export function buildRadio(sec, body, actions, card) {
  const stations = sec.stations?.length ? sec.stations.filter((s) => s.url) : DEFAULT_STATIONS;
  const shown = () => player.station ?? store.get('kiosque.radio.last', null) ?? stations[0];

  const cover = h('span', { class: 'radio-cover' });
  const name = h('strong', { class: 'radio-name' });
  const status = h('span', { class: 'radio-status' }, h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', { class: 'radio-state' }));
  const toggle = h('button', { class: 'radio-play', type: 'button' });
  toggle.addEventListener('click', () => play(shown()));

  const volume = h('input', { class: 'radio-volume', type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': 'Volume' });
  volume.value = audio.volume;
  volume.addEventListener('input', () => { audio.volume = Number(volume.value); store.set('kiosque.radio.volume', audio.volume); });

  const list = h('div', { class: 'radio-list', role: 'list' }, stations.map((s) => {
    const btn = h('button', { class: 'radio-station', type: 'button', role: 'listitem', title: s.name },
      renderIcon(s.favicon || 'i:radio', null, s.name, 'ico'),
      h('span', {}, s.name));
    btn.addEventListener('click', () => play(s));
    btn.dataset.url = s.url;
    return btn;
  }));

  body.append(h('div', { class: 'radio' },
    h('div', { class: 'radio-now' },
      cover,
      h('div', { class: 'radio-info' }, name, status),
      toggle),
    h('label', { class: 'radio-vol', html: svg('volume') }, volume),
    list));

  function update() {
    if (!card.isConnected && card.dataset.rendered) { listeners.delete(update); return; }
    const s = shown();
    const active = player.station?.url === s?.url;
    const state = active ? player.state : 'idle';
    cover.replaceChildren(renderIcon(s?.favicon || 'i:radio', null, s?.name, 'ico'));
    name.textContent = s?.name ?? 'Radio';
    status.dataset.state = state;
    status.querySelector('.radio-state').textContent = state === 'idle' && s ? 'Prêt à écouter' : STATE_LABEL[state];
    toggle.innerHTML = svg(state === 'playing' || state === 'loading' ? 'pause' : 'play');
    toggle.setAttribute('aria-label', state === 'playing' ? 'Mettre en pause' : `Écouter ${s?.name ?? ''}`);
    for (const b of list.children) b.classList.toggle('is-active', b.dataset.url === player.station?.url && player.state !== 'paused');
  }
  listeners.add(update);
  update();
  // la carte est insérée dans la page juste après sa construction : passé ce moment, une carte absente a été retirée
  queueMicrotask(() => { card.dataset.rendered = '1'; });
}
