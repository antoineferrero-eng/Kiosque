// Minuteur : durée libre ou préréglée, pause, ±1 min, historique des derniers temps à relancer en un clic.
// L'état est gardé dans le navigateur : un minuteur lancé continue même si on recharge la page.
import { h, svg, store, iconButton } from '../lib.js';

const PRESETS = [60, 5 * 60, 10 * 60, 25 * 60];

// « 5 » = 5 min, « 5:30 » = 5 min 30, « 1:05:00 » = 1 h 5 min, « 90s », « 1h30 », « 2m15s »…
export function parseDuration(text) {
  const seconds = parseRaw(text);
  return seconds > 0 ? seconds : null; // une durée nulle n'a pas de sens pour un minuteur
}

function parseRaw(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60);
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const m = t.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:m|min))?\s*(?:(\d+)\s*s)?$|^(\d+)\s*h\s*(\d+)$/);
  if (!m || !m[0]) return null;
  if (m[4]) return Number(m[4]) * 3600 + Number(m[5]) * 60;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0) || null;
}

export function formatDuration(seconds, { short = false } = {}) {
  const s = Math.max(0, Math.round(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (short) {
    if (hh) return mm ? `${hh} h ${pad(mm)}` : `${hh} h`;
    if (mm) return ss ? `${mm} min ${pad(ss)}` : `${mm} min`;
    return `${ss} s`;
  }
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

// Petite sonnerie générée (pas de fichier audio)
let audioCtx;
function unlockAudio() {
  audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function ring() {
  if (!audioCtx) return;
  const start = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    for (const [offset, freq] of [[0, 880], [0.16, 1175]]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const at = start + i * 0.7 + offset;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    }
  }
}

// Titre de l'onglet qui clignote quand un minuteur est fini et que l'onglet n'est pas regardé
let titleTimer;
function flashTitle(text) {
  if (titleTimer) return;
  const original = document.title;
  let on = false;
  titleTimer = setInterval(() => { on = !on; document.title = on ? text : original; }, 900);
  const stop = () => { clearInterval(titleTimer); titleTimer = null; document.title = original; };
  window.addEventListener('focus', stop, { once: true });
  document.addEventListener('pointerdown', stop, { once: true });
}

export function buildTimer(sec, body, actions, card) {
  const KEY = `kiosque.timer.${sec.id}`;
  const HISTORY_KEY = `kiosque.timer.history.${sec.id}`;
  const historySize = sec.history || 2;
  const label = sec.name || 'Minuteur';

  // status : idle | running | paused | done
  let t = { duration: 5 * 60, status: 'idle', endAt: 0, remaining: 5 * 60, ...store.get(KEY, {}) };
  let history = store.get(HISTORY_KEY, []);
  const save = () => store.set(KEY, t);

  const remaining = () => (t.status === 'running' ? Math.max(0, (t.endAt - Date.now()) / 1000) : t.remaining);

  // --- éléments
  const R = 45;
  const CIRC = 2 * Math.PI * R;
  const ringEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ringEl.setAttribute('viewBox', '0 0 100 100');
  ringEl.setAttribute('class', 'tm-ring');
  ringEl.setAttribute('aria-hidden', 'true');
  ringEl.innerHTML = `<circle class="tm-track" cx="50" cy="50" r="${R}"/><circle class="tm-progress" cx="50" cy="50" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>`;
  const progress = ringEl.querySelector('.tm-progress');

  const display = h('input', { class: 'tm-display', type: 'text', inputmode: 'numeric', spellcheck: 'false', 'aria-label': 'Durée du minuteur (ex. 5, 5:30, 1h30)' });
  const stateEl = h('span', { class: 'tm-state' });
  const main = h('button', { class: 'tm-main', type: 'button' });
  const minus = h('button', { class: 'btn tm-adjust', type: 'button', title: 'Retirer une minute' }, '−1 min');
  const plus = h('button', { class: 'btn tm-adjust', type: 'button', title: 'Ajouter une minute' }, '+1 min');
  const reset = iconButton('refresh', 'Remettre à zéro', () => resetTimer(), 'icon-btn tm-reset');
  const presets = h('div', { class: 'tm-chips' });
  const recent = h('div', { class: 'tm-chips' });
  const recentBlock = h('div', { class: 'tm-history' }, h('p', { class: 'eyebrow' }, 'Récents'), recent);

  body.append(h('div', { class: 'timer' },
    h('div', { class: 'tm-dial' }, ringEl, h('div', { class: 'tm-center' }, display, stateEl)),
    h('div', { class: 'tm-controls' }, minus, main, plus, reset),
    recentBlock,
    h('div', { class: 'tm-presets' }, h('p', { class: 'eyebrow' }, 'Rapide'), presets)));

  // --- actions
  function startWith(seconds) {
    unlockAudio();
    if (sec.notify !== false && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    t = { duration: seconds, status: 'running', endAt: Date.now() + seconds * 1000, remaining: seconds };
    history = [seconds, ...history.filter((s) => s !== seconds)].slice(0, historySize);
    store.set(HISTORY_KEY, history);
    save();
    render();
  }

  function toggle() {
    unlockAudio();
    if (t.status === 'running') {
      t = { ...t, status: 'paused', remaining: remaining() };
    } else if (t.status === 'paused') {
      t = { ...t, status: 'running', endAt: Date.now() + t.remaining * 1000 };
    } else {
      const typed = parseDuration(display.value);
      startWith(typed ?? t.duration);
      return;
    }
    save();
    render();
  }

  function adjust(delta) {
    if (t.status === 'running') t.endAt = Math.max(Date.now() + 1000, t.endAt + delta * 1000);
    else {
      const base = t.status === 'done' ? t.duration : (parseDuration(display.value) ?? t.remaining);
      t.remaining = Math.max(1, base + delta);
      if (t.status !== 'paused') { t.duration = t.remaining; t.status = 'idle'; }
    }
    if (t.status === 'running') t.duration = Math.max(t.duration, (t.endAt - Date.now()) / 1000);
    save();
    render();
  }

  function resetTimer() {
    t = { duration: t.duration, status: 'idle', endAt: 0, remaining: t.duration };
    save();
    render();
  }

  function finish() {
    t = { ...t, status: 'done', remaining: 0 };
    save();
    render();
    if (sec.sound !== false) ring();
    if (sec.notify !== false && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(`⏰ ${label} terminé`, { body: `${formatDuration(t.duration, { short: true })} écoulées`, tag: KEY });
    }
    if (document.hidden) flashTitle(`⏰ ${label} terminé !`);
  }

  main.addEventListener('click', toggle);
  minus.addEventListener('click', () => adjust(-60));
  plus.addEventListener('click', () => adjust(60));
  display.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); display.blur(); toggle(); } });
  display.addEventListener('focus', () => { if (t.status === 'idle' || t.status === 'done') display.select(); });
  display.addEventListener('change', () => {
    const typed = parseDuration(display.value);
    if (typed && (t.status === 'idle' || t.status === 'done')) { t = { ...t, duration: typed, remaining: typed, status: 'idle' }; save(); }
    render();
  });

  const chip = (seconds, cls = '') => {
    const c = h('button', { class: `tm-chip ${cls}`, type: 'button', title: `Lancer ${formatDuration(seconds, { short: true })}` }, formatDuration(seconds, { short: true }));
    c.addEventListener('click', () => startWith(seconds));
    return c;
  };

  // --- affichage
  function render() {
    const left = remaining();
    const ratio = t.duration ? left / t.duration : 0;
    progress.setAttribute('stroke-dashoffset', String(CIRC * (1 - Math.min(1, Math.max(0, ratio)))));
    if (document.activeElement !== display || t.status === 'running') display.value = formatDuration(t.status === 'done' ? 0 : left);
    display.readOnly = t.status === 'running' || t.status === 'paused';
    card.dataset.timer = t.status;
    stateEl.textContent = { idle: 'Prêt', running: 'En cours', paused: 'En pause', done: 'Terminé !' }[t.status];
    main.innerHTML = svg(t.status === 'running' ? 'pause' : 'play');
    main.setAttribute('aria-label', { idle: 'Démarrer', running: 'Pause', paused: 'Reprendre', done: 'Relancer' }[t.status]);
    main.title = main.getAttribute('aria-label');
    reset.disabled = t.status === 'idle';
    presets.replaceChildren(...PRESETS.map((s) => chip(s)));
    recent.replaceChildren(...history.map((s) => chip(s, 'is-recent')));
    recentBlock.hidden = !history.length;
  }

  // --- horloge
  const tick = () => {
    if (!card.isConnected && card.dataset.rendered) { clearInterval(timer); return; }
    if (t.status === 'running' && Date.now() >= t.endAt) finish();
    else if (t.status === 'running') render();
  };
  const timer = setInterval(tick, 250);
  // un minuteur fini pendant que la page était fermée
  if (t.status === 'running' && Date.now() >= t.endAt) { t = { ...t, status: 'done', remaining: 0 }; save(); }
  render();
  queueMicrotask(() => { card.dataset.rendered = '1'; });
}
