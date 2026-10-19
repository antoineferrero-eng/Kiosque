// Outils partagés par le dashboard et ses widgets.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Réglages globaux remplis au démarrage depuis la config
export const settings = { openIn: 'sametab' };
export const target = () => (settings.openIn === 'newtab' ? '_blank' : null);

// Icônes au trait (style Lucide), utilisables dans la config avec "i:<nom>"
const SVG = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  newspaper: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
  gamepad: '<path d="M6 12h4"/><path d="M8 10v4"/><path d="M15 13h.01"/><path d="M18 11h.01"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
  play: '<path class="solid" d="M7 4.5v15a1 1 0 0 0 1.52.85l12.2-7.5a1 1 0 0 0 0-1.7L8.52 3.65A1 1 0 0 0 7 4.5z"/>',
  tv: '<rect width="20" height="15" x="2" y="7" rx="2"/><path d="m17 2-5 5-5-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  frame: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 9h20"/><path d="M6 6.5h.01"/><path d="M9 6.5h.01"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  sliders: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  layout: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
};
export const ICON_NAMES = Object.keys(SVG);
export const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[name] ?? ''}</svg>`;

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  },
};

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'style') for (const [p, v] of Object.entries(value)) el.style.setProperty(p, v);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child);
  return el;
}

export function hostOf(url) {
  try {
    const u = new URL(url);
    return /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && u.port ? `:${u.port}` : u.hostname.replace(/^www\./, '');
  } catch { return ''; }
}

// ---------------------------------------------------------------- icônes

function iconSources(icon, url) {
  if (icon === 'favicon') {
    try {
      const host = new URL(url).hostname;
      return [`https://www.google.com/s2/favicons?domain=${host}&sz=128`, `https://icon.horse/icon/${host}`];
    } catch { return []; }
  }
  if (icon.startsWith('di:')) {
    const name = icon.slice(3).trim().toLowerCase();
    // dashboard-icons a souvent une variante -light / -dark : on prend celle qui se voit sur le thème
    const lightTheme = THEMES.find((t) => t.value === document.documentElement.dataset.theme)?.light;
    const variant = lightTheme ? name.replace(/-light$/, '-dark') : name.replace(/-dark$/, '-light');
    const base = name.replace(/-(light|dark)$/, '');
    return [...new Set([variant, base, name])]
      .map((n) => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${n}.png`)
      .concat(`https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${base}.png`);
  }
  if (/^(https?:)?\/\//.test(icon) || icon.startsWith('/')) return [icon];
  return null; // emoji ou texte
}

export function renderIcon(icon, url, label, cls = 'ico') {
  const wrap = h('span', { class: cls, 'aria-hidden': 'true' });
  const letter = () => {
    wrap.textContent = (label || '?').trim().charAt(0).toUpperCase();
    wrap.classList.add('is-letter');
  };
  if (!icon) { letter(); return wrap; }
  if (icon.startsWith('i:')) {
    if (SVG[icon.slice(2)]) wrap.innerHTML = svg(icon.slice(2)); else letter();
    return wrap;
  }

  const sources = iconSources(icon, url);
  if (sources === null) { wrap.textContent = icon; wrap.classList.add('is-emoji'); return wrap; }
  if (!sources.length) { letter(); return wrap; }

  let i = 0;
  const img = h('img', { src: sources[0], alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => {
    if (++i < sources.length) img.src = sources[i];
    else { img.remove(); letter(); }
  });
  wrap.append(img);
  return wrap;
}

export function iconButton(name, label, onClick, cls = 'icon-btn') {
  const btn = h('button', { class: cls, type: 'button', title: label, 'aria-label': label, html: svg(name) });
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(btn); });
  return btn;
}

export const openButton = (url) =>
  h('a', { class: 'icon-btn', href: url, target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir dans un nouvel onglet', 'aria-label': 'Ouvrir dans un nouvel onglet', html: svg('external') });

export const skeletons = (n, cls = 'sk') => Array.from({ length: n }, () => h('div', { class: cls }));

// Zone qui suit la hauteur de son contenu et défile au-delà de maxHeight
export function fillArea(maxHeight, ...children) {
  const scroll = h('div', { class: 'fill-scroll', style: { '--max': `${maxHeight}px` } }, ...children);
  const fill = h('div', { class: 'fill' }, scroll);
  return { fill, scroll };
}

// ---------------------------------------------------------------- dates

const relTime = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
export function ago(iso) {
  let value = (Date.parse(iso) - Date.now()) / 1000;
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return relTime.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}

export const sameDay = (a, b) => a.toDateString() === b.toDateString();

// ---------------------------------------------------------------- thème

export const THEMES = [
  { value: 'graphite', label: 'Graphite', description: 'Sombre, plat et dense' },
  { value: 'aurore', label: 'Aurore', description: 'Sombre, reflets bleutés' },
  { value: 'papier', label: 'Papier', description: 'Clair et éditorial', light: true },
];
export const DEFAULT_THEME = 'graphite';

// Le thème est aussi gardé dans le navigateur pour être posé avant l'affichage (voir index.html)
export function applyTheme(theme) {
  const value = THEMES.some((t) => t.value === theme) ? theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = value;
  store.set('kiosque.theme', value);
}

// ---------------------------------------------------------------- notifications et fenêtres

export function toast(message, kind = 'ok') {
  const box = $('#toasts') ?? document.body.appendChild(h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: `toast is-${kind}`, html: svg(kind === 'error' ? 'x' : 'check') }, h('span', {}, message));
  box.append(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); }, kind === 'error' ? 5000 : 2600);
}

// Fenêtre centrée. Renvoie le <dialog>, retiré du DOM à la fermeture.
export function modal({ title, icon, body, wide = false }) {
  const dialog = h('dialog', { class: `modal${wide ? ' is-wide' : ''}` },
    h('header', { class: 'modal-head' },
      icon ? h('span', { class: 'card-ico', html: svg(icon) }) : null,
      h('h2', {}, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', html: svg('x'), onclick: () => dialog.close() })),
    h('div', { class: 'modal-body' }, body));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
