// Mode édition : connexion admin, panneaux de modification, ajout, suppression et déplacement des sections.
import { $, $$, h, svg, api, store, renderIcon, toast, modal, ICON_NAMES, THEMES, DEFAULT_THEME, MODES, DEFAULT_MODE, resolveMode, applyTheme } from './lib.js';
import { TYPES, COMMON_FIELDS, GENERAL_FIELDS, SECRET_FIELDS, ESPORT_GAMES, cleanSection, clean } from './schema.js';

const TOKEN_KEY = 'kiosque.token';
let app; // { getConfig(), setConfig(cfg) } fourni par app.js
let session = { needsSetup: false, authenticated: false };
let token = store.get(TOKEN_KEY, null);
let uid = 0;

export const isEditing = () => document.body.classList.contains('is-editing');

export async function initEditor(appApi) {
  app = appApi;
  $('#edit-toggle').addEventListener('click', toggleEdit);
  $('#edit-done').addEventListener('click', exitEdit);
  $('#edit-add').addEventListener('click', () => openNewSection());
  $('#edit-settings').addEventListener('click', () => openSettings());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isEditing() && !$('dialog[open]')) exitEdit();
  });
  document.body.append(h('datalist', { id: 'icon-suggestions' }, ICON_NAMES.map((n) => h('option', { value: `i:${n}` }))));

  // En mode édition, cliquer sur une application ouvre son formulaire au lieu du lien
  $('#grid').addEventListener('click', (e) => {
    if (!isEditing()) return;
    const link = e.target.closest('a.link');
    if (!link) return;
    e.preventDefault();
    openSectionEditor(link.closest('.card').dataset.id, { focusItem: link.dataset.id });
  }, true);
  setupDrag($('#grid'));

  try { session = await api('/api/session', { token }); } catch { /* lecture seule */ }
}

// ---------------------------------------------------------------- entrée / sortie du mode édition

async function toggleEdit() {
  if (isEditing()) return exitEdit();
  if (!(await ensureAuth())) return;
  document.body.classList.add('is-editing');
  $('#edit-bar').hidden = false;
  $('#edit-toggle').setAttribute('aria-pressed', 'true');
}

function exitEdit() {
  document.body.classList.remove('is-editing');
  $('#edit-bar').hidden = true;
  $('#edit-toggle').setAttribute('aria-pressed', 'false');
}

async function ensureAuth() {
  try { session = await api('/api/session', { token }); } catch { /* serveur injoignable : on tente quand même */ }
  if (session.needsSetup) return createPassword();
  if (session.authenticated) return true;
  return askPassword();
}

function setToken(value) {
  token = value;
  store.set(TOKEN_KEY, token);
  session.authenticated = Boolean(token);
}

// Petite fenêtre de formulaire : renvoie une promesse résolue à true si onSubmit a réussi
function formModal({ title, icon, text, fields, submitLabel, onSubmit }) {
  return new Promise((resolve) => {
    let ok = false;
    const error = h('p', { class: 'form-error', hidden: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel);
    const form = h('form', { class: 'modal-form' },
      h('p', { class: 'modal-text' }, text),
      fields,
      error,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Annuler'),
        submit));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.hidden = true;
      try {
        await onSubmit();
        ok = true;
        dialog.close();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        fields[0]?.select?.();
      } finally {
        submit.disabled = false;
      }
    });

    const dialog = modal({ title, icon, body: form });
    dialog.addEventListener('close', () => resolve(ok));
    fields[0]?.focus();
  });
}

const passwordInput = (placeholder, autocomplete = 'current-password') =>
  h('input', { class: 'input', type: 'password', placeholder, autocomplete, required: true });

function askPassword() {
  const input = passwordInput('Mot de passe');
  return formModal({
    title: 'Mode édition',
    icon: 'lock',
    text: 'Entre le mot de passe administrateur pour modifier le dashboard.',
    fields: [input],
    submitLabel: 'Se connecter',
    onSubmit: async () => setToken((await api('/api/login', { method: 'POST', body: { password: input.value } })).token),
  });
}

// Premier lancement : aucun mot de passe n'existe encore
function createPassword() {
  const first = passwordInput('Nouveau mot de passe (8 caractères min.)', 'new-password');
  const second = passwordInput('Confirme le mot de passe', 'new-password');
  return formModal({
    title: 'Bienvenue sur Kiosque',
    icon: 'key',
    text: 'Choisis le mot de passe qui protégera le mode édition. Tu pourras le changer dans Réglages → Clés & accès.',
    fields: [first, second],
    submitLabel: 'Créer et commencer',
    onSubmit: async () => {
      if (first.value !== second.value) throw new Error('Les deux mots de passe ne sont pas identiques');
      setToken((await api('/api/setup', { method: 'POST', body: { password: first.value } })).token);
      session.needsSetup = false;
    },
  });
}

// ---------------------------------------------------------------- enregistrement

const cloneConfig = () => structuredClone(app.getConfig());

// render: false enregistre sans redessiner la page (utile quand l'écran montre déjà le résultat)
async function save(next, message = 'Modifications enregistrées', { render = true } = {}) {
  try {
    app.setConfig(await api('/api/config', { method: 'PUT', body: next, token }), { render });
    toast(message);
    return true;
  } catch (err) {
    if (err.status === 401 && (await askPassword())) return save(next, message, { render });
    toast(err.message, 'error');
    return false;
  }
}

function removeSection(id) {
  const next = cloneConfig();
  const name = next.sections.find((s) => s.id === id)?.name ?? '';
  next.sections = next.sections.filter((s) => s.id !== id);
  save(next, `Section « ${name} » supprimée`);
}

function moveSection(id, dir) {
  const next = cloneConfig();
  const i = next.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= next.sections.length) return;
  [next.sections[i], next.sections[j]] = [next.sections[j], next.sections[i]];
  save(next, 'Ordre enregistré').then(() => $(`.card[data-id="${CSS.escape(id)}"] .drag-handle`)?.focus());
}

// ---------------------------------------------------------------- éléments ajoutés aux cartes

// Outils affichés dans l'en-tête de chaque carte en mode édition
export function sectionTools(sec, card) {
  const grip = h('button', { class: 'icon-btn drag-handle', type: 'button', title: 'Glisser pour déplacer (ou flèches du clavier)', 'aria-label': `Déplacer ${sec.name ?? ''}`, html: svg('grip') });
  grip.addEventListener('pointerdown', () => { card.draggable = true; });
  grip.addEventListener('pointerup', () => { card.draggable = false; });
  grip.addEventListener('keydown', (e) => {
    const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (dir) { e.preventDefault(); moveSection(sec.id, dir); }
  });
  const edit = h('button', { class: 'icon-btn', type: 'button', title: 'Modifier la section', 'aria-label': 'Modifier la section', html: svg('pencil') });
  edit.addEventListener('click', () => openSectionEditor(sec.id));
  return h('div', { class: 'edit-tools' }, grip, edit, armedButton('trash', 'Supprimer la section', () => removeSection(sec.id)));
}

// ---------------------------------------------------------------- redimensionnement des cartes

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const snapHeight = (v) => clamp(Math.round(v / 10) * 10, 120, 2400);

// Quelle largeur on règle selon l'écran : span (grand écran), spanMd (tablette), rien (téléphone)
const widthKey = () => (innerWidth <= 900 ? null : innerWidth <= 1280 ? 'spanMd' : 'span');

// Poignée en bas à droite : glisser pour la hauteur et la largeur, double-clic pour revenir à la hauteur auto,
// flèches du clavier (Maj : plus vite) quand elle a le focus.
export function resizeHandle(sec, card) {
  const tip = h('span', { class: 'resize-tip' });
  const handle = h('div', {
    class: 'resize-handle', tabindex: '0', role: 'slider',
    'aria-label': `Redimensionner ${sec.name ?? 'la section'}`,
    title: 'Glisser pour redimensionner · double-clic : hauteur automatique',
    html: svg('resize'),
  }, tip);

  const columns = () => {
    const grid = card.parentElement;
    const style = getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 0;
    const count = style.gridTemplateColumns.split(' ').length;
    return { step: (grid.clientWidth + gap) / count, gap, count };
  };
  const currentSpan = () => {
    const { step, gap, count } = columns();
    return clamp(Math.round((card.getBoundingClientRect().width + gap) / step), 1, count);
  };
  const show = (height, span) => {
    const key = widthKey();
    const cols = span ?? (card.isConnected ? currentSpan() : sec[key] ?? sec.span);
    tip.textContent = `${key && cols ? `${cols}/12 · ` : ''}${height ? `${height} px` : 'hauteur auto'}`;
    handle.classList.toggle('is-vertical', !key);
  };

  const preview = ({ height, span }) => {
    if (height !== undefined) {
      card.classList.toggle('has-height', height != null);
      if (height == null) card.style.removeProperty('--card-h'); else card.style.setProperty('--card-h', `${height}px`);
    }
    if (span != null) card.style.setProperty(widthKey() === 'spanMd' ? '--span-md' : '--span', span);
    show(height === undefined ? sec.cardHeight : height, span);
  };

  let commitTimer;
  let pending = {};
  const commit = (change, message = 'Taille enregistrée') => {
    clearTimeout(commitTimer);
    const next = cloneConfig();
    const target = next.sections.find((s) => s.id === sec.id);
    if (!target) return;
    if ('height' in change) {
      if (change.height == null) delete target.cardHeight; else target.cardHeight = change.height;
      sec.cardHeight = change.height ?? undefined;
    }
    const key = widthKey();
    if (change.span != null && key) { target[key] = change.span; sec[key] = change.span; }
    save(next, message, { render: false });
  };

  let start = null;
  let current = {};
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const r = card.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, height: r.height, width: r.width, key: widthKey() };
    current = {};
    card.classList.add('is-resizing');
    document.body.classList.add('is-resizing');
    document.body.classList.toggle('is-vertical', !start.key);
    show(snapHeight(r.height), currentSpan());
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start) return;
    current.height = snapHeight(start.height + e.clientY - start.y);
    if (start.key) {
      const { step, gap, count } = columns();
      current.span = clamp(Math.round((start.width + e.clientX - start.x + gap) / step), 2, count);
    }
    preview(current);
  });
  const end = () => {
    if (!start) return;
    const moved = 'height' in current;
    start = null;
    card.classList.remove('is-resizing');
    document.body.classList.remove('is-resizing', 'is-vertical');
    if (moved) commit(current);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('lostpointercapture', end);

  handle.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    preview({ height: null });
    commit({ height: null }, 'Hauteur automatique');
  });

  handle.addEventListener('keydown', (e) => {
    const big = e.shiftKey ? 3 : 1;
    const height = sec.cardHeight ?? snapHeight(card.getBoundingClientRect().height);
    let change;
    if (e.key === 'ArrowDown') change = { height: snapHeight(height + 20 * big) };
    else if (e.key === 'ArrowUp') change = { height: snapHeight(height - 20 * big) };
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && widthKey()) {
      change = { span: clamp(currentSpan() + (e.key === 'ArrowRight' ? 1 : -1), 2, columns().count) };
    } else if (e.key === 'Delete' || e.key === 'Backspace') change = { height: null };
    if (!change) return;
    e.preventDefault();
    preview(change);
    if ('height' in change) sec.cardHeight = change.height ?? undefined;
    pending = { ...pending, ...change };
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => { commit(pending); pending = {}; }, 600);
  });

  show(sec.cardHeight, null);
  return handle;
}

export const addSectionTile = () =>
  h('button', { class: 'add-section', type: 'button', onclick: () => openNewSection() },
    h('span', { class: 'add-section-ico', html: svg('plus') }), 'Ajouter une section');

export const addItemTile = (sec) =>
  h('button', { class: 'link add-tile', type: 'button', onclick: () => openSectionEditor(sec.id, { addItem: true }) },
    h('span', { class: 'ico', html: svg('plus') }),
    h('span', { class: 'link-text' }, h('span', { class: 'link-title' }, 'Ajouter')));

// Bouton en deux temps : le premier clic arme, le second confirme
function armedButton(icon, label, onConfirm, cls = 'icon-btn') {
  const btn = h('button', { class: `${cls} is-danger`, type: 'button', title: label, 'aria-label': label, html: svg(icon) });
  let timer;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.classList.contains('is-armed')) { clearTimeout(timer); onConfirm(); return; }
    btn.classList.add('is-armed');
    btn.title = 'Cliquer encore pour confirmer';
    timer = setTimeout(() => { btn.classList.remove('is-armed'); btn.title = label; }, 2500);
  });
  return btn;
}

// ---------------------------------------------------------------- glisser-déposer des cartes

function setupDrag(grid) {
  let dragged = null;
  let before = '';
  const order = () => $$('.card[data-id]', grid).map((c) => c.dataset.id).join(',');

  grid.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.card[data-id]');
    if (!card || !isEditing() || !card.draggable) return;
    dragged = card;
    before = order();
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });

  grid.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    const over = e.target.closest?.('.card[data-id]');
    if (!over || over === dragged) return;
    const r = over.getBoundingClientRect();
    const wide = r.width > grid.clientWidth * 0.6;
    const after = wide ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    grid.insertBefore(dragged, after ? over.nextSibling : over);
  });

  grid.addEventListener('drop', (e) => { if (dragged) e.preventDefault(); });

  grid.addEventListener('dragend', () => {
    if (!dragged) return;
    dragged.classList.remove('is-dragging');
    dragged.draggable = false;
    dragged = null;
    const ids = order();
    if (ids === before) return;
    const next = cloneConfig();
    const pos = ids.split(',');
    next.sections.sort((a, b) => pos.indexOf(a.id) - pos.indexOf(b.id));
    save(next, 'Ordre enregistré');
  });
}

// ---------------------------------------------------------------- panneau latéral

function drawer({ title, icon }) {
  const body = h('div', { class: 'drawer-body' });
  const foot = h('footer', { class: 'drawer-foot' });
  const titleEl = h('h2', {}, title);
  const iconEl = h('span', { class: 'card-ico', html: svg(icon) });
  const dialog = h('dialog', { class: 'drawer', 'aria-label': title },
    h('header', { class: 'drawer-head' },
      iconEl,
      titleEl,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', html: svg('x'), onclick: () => dialog.close() })),
    body,
    foot);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return {
    dialog, body, foot,
    setTitle: (t) => { titleEl.textContent = t; },
    setIcon: (i) => { iconEl.innerHTML = svg(i); },
  };
}

function formFooter(d, { onSave, extra }) {
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', html: `${svg('check')}<span>Enregistrer</span>` });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const ok = await onSave();
    saveBtn.disabled = false;
    if (ok) d.dialog.close();
  });
  d.dialog.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveBtn.click(); }
  };
  d.foot.replaceChildren(
    extra ?? '',
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onclick: () => d.dialog.close() }, 'Annuler'),
    saveBtn);
}

export function openSectionEditor(id, { addItem = false, focusItem } = {}) {
  const current = app.getConfig().sections.find((s) => s.id === id);
  const type = TYPES[current?.type];
  if (!type) return;

  const draft = structuredClone(current);
  const ctx = { focus: {}, secrets: {} };
  if (addItem) {
    draft.items = [...(draft.items ?? []), { title: '', url: '' }];
    ctx.focus.items = draft.items.length - 1;
  } else if (focusItem) {
    ctx.focus.items = (draft.items ?? []).findIndex((it) => it.id === focusItem);
  }

  const d = drawer({ title: draft.name || type.label, icon: type.icon });
  d.body.append(...renderFields(draft, [...COMMON_FIELDS, ...type.fields], ctx));
  formFooter(d, {
    extra: armedButton('trash', 'Supprimer la section', () => { d.dialog.close(); removeSection(id); }, 'icon-btn'),
    onSave: async () => {
      if (!(await saveSecrets(ctx))) return false;
      const next = cloneConfig();
      const i = next.sections.findIndex((s) => s.id === id);
      if (i < 0) return false;
      next.sections[i] = cleanSection(draft);
      return save(next);
    },
  });
  if (addItem) requestAnimationFrame(() => d.body.querySelector('.list-item:last-of-type input')?.focus());
}

function openNewSection() {
  const d = drawer({ title: 'Ajouter une section', icon: 'layout' });
  d.foot.replaceChildren(h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => d.dialog.close() }, 'Annuler'));
  d.body.append(
    h('p', { class: 'drawer-intro' }, 'Choisis ce que tu veux ajouter au dashboard.'),
    h('div', { class: 'type-grid' }, Object.entries(TYPES).map(([key, t]) =>
      h('button', { class: 'type-card', type: 'button', onclick: () => pick(key) },
        h('span', { class: 'card-ico', style: { '--tint': t.defaults().tint }, html: svg(t.icon) }),
        h('span', { class: 'type-text' }, h('strong', {}, t.label), h('span', {}, t.description))))));

  function pick(key) {
    const t = TYPES[key];
    const draft = { type: key, ...t.defaults() };
    const ctx = { focus: {}, secrets: {} };
    d.setTitle(`Nouvelle section · ${t.label}`);
    d.setIcon(t.icon);
    d.body.replaceChildren(...renderFields(draft, [...COMMON_FIELDS, ...t.fields], ctx));
    formFooter(d, {
      extra: h('button', { class: 'btn', type: 'button', onclick: () => { d.dialog.close(); openNewSection(); } }, 'Retour'),
      onSave: async () => {
        if (!(await saveSecrets(ctx))) return false;
        const next = cloneConfig();
        next.sections.push(cleanSection(draft));
        const ok = await save(next, `Section « ${draft.name || t.label} » ajoutée`);
        if (ok) requestAnimationFrame(() => $$('.card[data-id]').at(-1)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return ok;
      },
    });
    d.body.querySelector('input')?.focus();
  }
}

// Enregistre les clés tapées dans les champs « secret » du formulaire (avant la config)
async function saveSecrets(ctx) {
  if (!Object.keys(ctx.secrets).length) return true;
  try {
    const r = await api('/api/secrets', { method: 'PUT', body: ctx.secrets, token });
    session.esport = r.pandascoreToken.set;
    ctx.secrets = {};
    return true;
  } catch (err) {
    if (err.status === 401 && (await askPassword())) return saveSecrets(ctx);
    toast(err.message, 'error');
    return false;
  }
}

// ---------------------------------------------------------------- réglages

function openSettings(tab = 'general') {
  const d = drawer({ title: 'Réglages', icon: 'sliders' });
  const draft = structuredClone(app.getConfig());
  const ctx = { focus: {}, secrets: {} };

  const panes = {
    general: h('div', { class: 'tab-pane' }, renderFields(draft, GENERAL_FIELDS, ctx)),
    keys: h('div', { class: 'tab-pane' },
      h('h3', { class: 'pane-title' }, 'Clés API'),
      h('p', { class: 'pane-text' }, 'Gardées sur le serveur, jamais dans la configuration exportée (sauf si tu le demandes).'),
      renderFields({}, SECRET_FIELDS, ctx),
      h('h3', { class: 'pane-title' }, 'Mot de passe admin'),
      passwordPane()),
    backup: backupPane(d),
  };
  const labels = { general: 'Général', keys: 'Clés & accès', backup: 'Sauvegarde' };
  const buttons = {};
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, Object.keys(panes).map((k) => {
    buttons[k] = h('button', { class: 'tab', type: 'button', role: 'tab', onclick: () => show(k) }, labels[k]);
    return buttons[k];
  }));

  function show(k) {
    for (const [key, pane] of Object.entries(panes)) pane.hidden = key !== k;
    for (const [key, b] of Object.entries(buttons)) b.setAttribute('aria-selected', String(key === k));
    d.foot.hidden = k === 'backup'; // la sauvegarde a ses propres boutons
  }

  const logout = h('button', { class: 'btn', type: 'button', html: `${svg('logout')}<span>Se déconnecter</span>` });
  logout.addEventListener('click', () => {
    setToken(null);
    d.dialog.close();
    exitEdit();
    toast('Déconnecté');
  });

  d.body.append(tabs, ...Object.values(panes));
  // aperçu en direct du thème : on revient au thème enregistré si on ferme sans enregistrer
  d.dialog.addEventListener('close', () => applyTheme(app.getConfig().theme, app.getConfig().themeMode));
  formFooter(d, {
    extra: logout,
    onSave: async () => {
      if (!(await saveSecrets(ctx))) return false;
      const next = cloneConfig();
      const cleaned = clean(draft);
      for (const k of keysOf(GENERAL_FIELDS)) {
        if (cleaned[k] === undefined) delete next[k]; else next[k] = cleaned[k];
      }
      return save(next, 'Réglages enregistrés');
    },
  });
  show(tab);
}

function passwordPane() {
  const pane = h('div', { class: 'pane-block' }, h('p', { class: 'field-hint' }, 'Chargement…'));
  api('/api/secrets', { token }).then((s) => {
    if (s.adminPassword?.source === 'env') {
      pane.replaceChildren(h('p', { class: 'pane-text' }, 'Défini par la variable d’environnement ADMIN_PASSWORD : modifie-la sur le serveur pour le changer.'));
      return;
    }
    const current = passwordInput('Mot de passe actuel');
    const next = passwordInput('Nouveau mot de passe (8 caractères min.)', 'new-password');
    const confirm = passwordInput('Confirme le nouveau mot de passe', 'new-password');
    const error = h('p', { class: 'form-error', hidden: true });
    const btn = h('button', { class: 'btn', type: 'button', html: `${svg('key')}<span>Changer le mot de passe</span>` });
    btn.addEventListener('click', async () => {
      error.hidden = true;
      if (next.value !== confirm.value) { error.textContent = 'Les deux mots de passe ne sont pas identiques'; error.hidden = false; return; }
      btn.disabled = true;
      try {
        const r = await api('/api/secrets', { method: 'PUT', body: { currentPassword: current.value, adminPassword: next.value }, token });
        setToken(r.token);
        current.value = next.value = confirm.value = '';
        toast('Mot de passe changé');
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
    pane.replaceChildren(current, next, confirm, error, h('div', { class: 'btn-row' }, btn));
  }).catch((err) => pane.replaceChildren(h('p', { class: 'form-error' }, err.message)));
  return pane;
}

// ---------------------------------------------------------------- sauvegarde : télécharger / charger

function backupPane(d) {
  const includeKeys = h('input', { id: `f${++uid}`, class: 'switch', type: 'checkbox' });
  const download = h('button', { class: 'btn btn-primary', type: 'button', html: `${svg('download')}<span>Télécharger ma configuration</span>` });
  download.addEventListener('click', async () => {
    download.disabled = true;
    try {
      const cfg = await api(`/api/export${includeKeys.checked ? '?secrets' : ''}`, { token });
      const url = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2) + '\n'], { type: 'application/json' }));
      h('a', { href: url, download: `kiosque-config-${new Date().toISOString().slice(0, 10)}.json` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Configuration téléchargée');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      download.disabled = false;
    }
  });

  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden' });
  const preview = h('div', { class: 'import-preview', hidden: true });
  const drop = h('label', { class: 'dropzone' },
    h('span', { class: 'dropzone-ico', html: svg('upload') }),
    h('strong', {}, 'Charger une configuration'),
    h('span', {}, 'Glisse un fichier .json ici, ou clique pour le choisir'),
    file);
  file.addEventListener('change', () => { if (file.files[0]) readConfigFile(file.files[0]); file.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    if (e.dataTransfer.files[0]) readConfigFile(e.dataTransfer.files[0]);
  });

  async function readConfigFile(f) {
    let cfg;
    try {
      cfg = JSON.parse(await f.text());
      if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.sections)) throw new Error('il manque la liste « sections »');
      const unknown = cfg.sections.find((s) => !TYPES[s?.type]);
      if (unknown) throw new Error(`type de section inconnu « ${unknown?.type} »`);
    } catch (err) {
      preview.hidden = false;
      preview.replaceChildren(h('p', { class: 'form-error' }, `Ce fichier n’est pas une configuration Kiosque : ${err.message}`));
      return;
    }
    const apply = h('button', { class: 'btn btn-primary', type: 'button', html: `${svg('check')}<span>Remplacer ma configuration</span>` });
    apply.addEventListener('click', async () => {
      apply.disabled = true;
      if (await save(cfg, `Configuration « ${f.name} » chargée`)) d.dialog.close();
      apply.disabled = false;
    });
    preview.hidden = false;
    preview.replaceChildren(...[
      h('div', { class: 'import-head' },
        h('span', { class: 'card-ico', html: svg('file') }),
        h('div', {}, h('strong', {}, f.name), h('p', {}, `${cfg.title || 'Sans titre'} · ${cfg.sections.length} section${cfg.sections.length > 1 ? 's' : ''}`))),
      h('div', { class: 'import-sections' }, cfg.sections.map((s) =>
        h('span', { class: 'chip', style: s.tint ? { '--tint': s.tint } : {} },
          renderIcon(s.icon, null, s.name, 'chip-ico'),
          s.name || TYPES[s.type].label))),
      cfg.secrets?.pandascoreToken ? h('p', { class: 'field-hint is-ok' }, '✓ Contient une clé PandaScore, elle sera enregistrée aussi.') : null,
      h('p', { class: 'field-hint' }, 'Ta configuration actuelle sera remplacée : télécharge-la avant si tu veux la garder.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { preview.hidden = true; } }, 'Annuler'),
        h('span', { class: 'spacer' }),
        apply),
    ].filter(Boolean));
  }

  // Édition directe du JSON, pour les cas avancés
  const json = h('textarea', { class: 'input code-input', rows: 12, spellcheck: 'false', 'aria-label': 'Configuration JSON' });
  json.value = JSON.stringify(app.getConfig(), null, 2);
  const applyJson = h('button', { class: 'btn', type: 'button', html: `${svg('check')}<span>Appliquer ce JSON</span>` });
  applyJson.addEventListener('click', async () => {
    let parsed;
    try { parsed = JSON.parse(json.value); } catch (err) { toast(`JSON invalide : ${err.message}`, 'error'); return; }
    if (await save(parsed, 'Configuration appliquée')) d.dialog.close();
  });

  return h('div', { class: 'tab-pane' },
    h('h3', { class: 'pane-title' }, 'Enregistrer'),
    h('p', { class: 'pane-text' }, 'Télécharge toute ta configuration dans un fichier : sections, applications, flux, chaînes…'),
    h('label', { class: 'field field-toggle', for: includeKeys.id }, h('span', { class: 'field-label' }, 'Inclure les clés API dans le fichier'), includeKeys),
    h('div', { class: 'btn-row' }, download),
    h('h3', { class: 'pane-title' }, 'Charger'),
    drop,
    preview,
    h('details', { class: 'field-group' },
      h('summary', {}, h('span', { class: 'chev', html: svg('chevron') }), 'Modifier le JSON directement'),
      h('div', { class: 'field-group-body' }, json, h('div', { class: 'btn-row' }, h('span', { class: 'spacer' }), applyJson))));
}

function keysOf(fields) {
  return fields.flatMap((f) => (f.row ? keysOf(f.row) : f.group ? keysOf(f.fields) : f.type === 'secret' ? [] : f.modeKey ? [f.key, f.modeKey] : [f.key]));
}

// ---------------------------------------------------------------- génération des formulaires

function renderFields(obj, fields, ctx) {
  return fields.filter((f) => !f.when || f.when(obj)).map((f) => {
    if (f.row) return h('div', { class: 'field-row' }, renderFields(obj, f.row, ctx));
    if (f.group) {
      return h('details', { class: 'field-group' },
        h('summary', {}, h('span', { class: 'chev', html: svg('chevron') }), f.group),
        h('div', { class: 'field-group-body' }, renderFields(obj, f.fields, ctx)));
    }
    if (f.type === 'list') return listField(obj, f, ctx);
    if (f.type === 'note') return h('p', { class: 'field-hint form-note' }, f.text);
    return field(obj, f, ctx);
  });
}

function field(obj, f, ctx) {
  const id = `f${++uid}`;
  const value = obj[f.key] ?? f.default;
  const set = (v) => { obj[f.key] = v; };
  let control;

  switch (f.type) {
    case 'toggle': {
      const input = h('input', { id, class: 'switch', type: 'checkbox', 'data-key': f.key });
      input.checked = Boolean(value);
      input.addEventListener('change', () => set(input.checked));
      return h('label', { class: 'field field-toggle', for: id }, h('span', { class: 'field-label' }, f.label), input);
    }
    case 'select': {
      control = h('select', { id, class: 'input', 'data-key': f.key }, f.options.map((o) => h('option', { value: o.value }, o.label)));
      control.value = String(value ?? '');
      if (control.selectedIndex < 0) control.selectedIndex = 0;
      control.addEventListener('change', () => set(control.value === '' ? undefined : f.number ? Number(control.value) : control.value));
      break;
    }
    case 'number': {
      control = h('input', { id, class: 'input', type: 'number', min: f.min, max: f.max, 'data-key': f.key, placeholder: f.placeholder ?? (f.default != null ? String(f.default) : null) });
      control.value = obj[f.key] ?? '';
      control.addEventListener('input', () => set(control.value === '' ? undefined : Number(control.value)));
      break;
    }
    case 'color': {
      control = h('input', { id, class: 'color-input', type: 'color', 'data-key': f.key });
      control.value = value || '#8b9cff';
      control.addEventListener('input', () => set(control.value));
      break;
    }
    case 'checks': {
      const selected = new Set(value ?? []);
      control = h('div', { class: 'checks', role: 'group', 'aria-label': f.label }, f.options.map((o) => {
        const cb = h('input', { type: 'checkbox', value: o.value });
        cb.checked = selected.has(o.value);
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(o.value); else selected.delete(o.value);
          set(f.options.map((x) => x.value).filter((v) => selected.has(v)));
        });
        return h('label', { class: 'check' }, cb, h('span', {}, o.label));
      }));
      break;
    }
    case 'icon':
      control = iconInput(obj, f, id);
      break;
    case 'game':
      control = gameSelect(obj, f, id);
      break;
    case 'ytchannel':
      return channelField(obj, f, id);
    case 'secret':
      return secretField(f, ctx, id);
    case 'theme':
      return themeField(obj, f);
    case 'radiosearch':
      return radioSearchField(f, ctx, id);
    case 'pricesearch':
      return priceSearchField(f, ctx, id);
    case 'shops':
      return shopsField(obj, f, id);
    case 'datetime': {
      control = h('input', { id, class: 'input', type: 'datetime-local', 'data-key': f.key });
      control.value = obj[f.key] ?? '';
      control.addEventListener('input', () => set(control.value || undefined));
      break;
    }
    default: {
      control = h('input', {
        id, class: 'input', type: f.type === 'url' ? 'url' : 'text', 'data-key': f.key,
        placeholder: f.placeholder ?? f.default ?? null, spellcheck: f.type === 'url' ? 'false' : null,
      });
      control.value = obj[f.key] ?? '';
      control.addEventListener('input', () => set(control.value));
    }
  }

  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, f.label),
    control,
    f.hint ? h('p', { class: 'field-hint' }, f.hint) : null);
}

function iconInput(obj, f, id) {
  const preview = h('span', { class: 'icon-preview' });
  const input = h('input', { id, class: 'input', type: 'text', list: 'icon-suggestions', spellcheck: 'false', 'data-key': f.key, placeholder: 'i:server, di:portainer, 🚀…' });
  input.value = obj[f.key] ?? '';
  const update = () => preview.replaceChildren(renderIcon(input.value.trim() || null, obj.url, obj.title || obj.name, 'ico'));
  input.addEventListener('input', () => { obj[f.key] = input.value; update(); });
  update();
  return h('div', { class: 'input-group' }, preview, input);
}

// Choix du jeu : remplit aussi le nom et la couleur
function gameSelect(obj, f, id) {
  const select = h('select', { id, class: 'input', 'data-key': f.key },
    h('option', { value: '' }, 'Choisir un jeu…'),
    ESPORT_GAMES.map((g) => h('option', { value: g.value }, g.label)));
  if (obj[f.key] && !ESPORT_GAMES.some((g) => g.value === obj[f.key])) select.append(h('option', { value: obj[f.key] }, obj[f.key]));
  select.value = obj[f.key] ?? '';
  select.addEventListener('change', () => {
    obj[f.key] = select.value || undefined;
    const game = ESPORT_GAMES.find((g) => g.value === select.value);
    if (!game) return;
    obj.name = game.short;
    obj.color = game.color;
    const body = select.closest('.list-body');
    const nameInput = body?.querySelector('[data-key="name"]');
    const colorInput = body?.querySelector('[data-key="color"]');
    if (nameInput) nameInput.value = game.short;
    if (colorInput) colorInput.value = game.color;
  });
  return select;
}

// Chaîne YouTube : accepte un @pseudo, un lien ou un ID, et retrouve l'ID via le serveur
function channelField(obj, f, id) {
  const input = h('input', { id, class: 'input', type: 'text', spellcheck: 'false', placeholder: '@pseudo, lien de la chaîne ou ID' });
  input.value = obj[f.key] ?? '';
  const status = h('p', { class: 'field-hint' }, obj[f.key] ? `✓ ${obj[f.key]}` : 'Colle un lien ou un @pseudo : la chaîne est retrouvée automatiquement.');
  status.classList.toggle('is-ok', Boolean(obj[f.key]));
  const btn = h('button', { class: 'btn', type: 'button' }, 'Trouver');

  async function resolve() {
    const q = input.value.trim();
    if (!q || q === obj[f.key]) return;
    btn.disabled = true;
    status.className = 'field-hint';
    status.textContent = 'Recherche de la chaîne…';
    try {
      const r = await api(`/api/youtube/resolve?q=${encodeURIComponent(q)}`, { token });
      obj[f.key] = r.id;
      obj.name = r.name;
      input.value = r.id;
      const nameInput = input.closest('.list-body')?.querySelector('[data-key="name"]');
      if (nameInput) nameInput.value = r.name;
      status.textContent = `✓ ${r.name} · ${r.id}`;
      status.classList.add('is-ok');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) {
      obj[f.key] = undefined;
      status.textContent = err.message;
      status.classList.add('is-error');
    } finally {
      btn.disabled = false;
    }
  }

  input.addEventListener('change', resolve);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); resolve(); } });
  btn.addEventListener('click', resolve);
  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, f.label),
    h('div', { class: 'input-group' }, input, btn),
    status);
}

// Clé secrète : affiche seulement si elle est définie (et ses 4 premiers / derniers caractères).
// Ce qu'on tape va dans ctx.secrets et part sur /api/secrets à l'enregistrement, jamais dans la config.
function secretField(f, ctx, id) {
  const input = h('input', { id, class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Chargement…', disabled: true });
  const reveal = h('button', { class: 'icon-btn', type: 'button', title: 'Afficher / masquer', 'aria-label': 'Afficher ou masquer la clé', html: svg('eye') });
  reveal.addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; });
  const remove = h('button', { class: 'btn', type: 'button', hidden: true }, 'Retirer');
  const status = h('p', { class: 'field-hint' });

  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (v) ctx.secrets[f.key] = v; else delete ctx.secrets[f.key];
  });
  remove.addEventListener('click', () => {
    ctx.secrets[f.key] = '';
    input.value = '';
    input.placeholder = 'Aucune clé';
    status.className = 'field-hint';
    status.textContent = 'La clé sera retirée à l’enregistrement.';
    remove.hidden = true;
  });

  api('/api/secrets', { token }).then((all) => {
    const s = all[f.key] ?? {};
    if (s.source === 'env') {
      input.placeholder = `Définie par la variable ${f.env}`;
      status.textContent = 'Pour la modifier ici, retire d’abord la variable d’environnement du serveur.';
      return;
    }
    input.disabled = false;
    input.placeholder = s.set ? `Enregistrée (${s.hint}) · tape une nouvelle clé pour la remplacer` : (f.placeholder ?? '');
    status.textContent = s.set ? '✓ Clé enregistrée' : (f.hint ?? '');
    status.classList.toggle('is-ok', Boolean(s.set));
    remove.hidden = !s.set;
  }).catch((err) => { status.textContent = err.message; status.classList.add('is-error'); });

  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, h('span', { class: 'field-label-ico', html: svg('key') }), f.label),
    h('div', { class: 'input-group' }, input, reveal, remove),
    status,
    f.link ? h('a', { class: 'field-link', href: f.link, target: '_blank', rel: 'noopener noreferrer', html: `${f.linkLabel} ${svg('external')}` }) : null);
}

// Choix de l'apparence (appareil / clair / sombre) et du thème : cartes avec un aperçu
// dessiné dans les couleurs de chaque thème, pour l'apparence choisie
function themeField(obj, f) {
  const theme = () => obj[f.key] ?? DEFAULT_THEME;
  const mode = () => obj[f.modeKey] ?? DEFAULT_MODE;
  const preview = () => applyTheme(theme(), mode());

  const modeButtons = MODES.map((m) => {
    const btn = h('button', { type: 'button', role: 'radio', 'aria-checked': String(m.value === mode()), html: `${svg(m.icon)}<span>${m.label}</span>` });
    btn.addEventListener('click', () => {
      obj[f.modeKey] = m.value;
      modeButtons.forEach((b, i) => b.setAttribute('aria-checked', String(MODES[i].value === m.value)));
      syncPreviews();
      preview();
    });
    return btn;
  });

  const previews = [];
  const cards = THEMES.map((t) => {
    const thumb = h('span', { class: 'theme-preview', 'data-theme': t.value, 'aria-hidden': 'true' }, h('span'), h('span'), h('span'));
    previews.push(thumb);
    const card = h('button', { class: 'theme-card', type: 'button', role: 'radio', 'aria-checked': String(t.value === theme()) },
      thumb,
      h('strong', {}, t.label),
      h('small', {}, t.description));
    card.addEventListener('click', () => {
      obj[f.key] = t.value;
      cards.forEach((c, i) => c.setAttribute('aria-checked', String(THEMES[i].value === t.value)));
      preview();
    });
    return card;
  });
  const syncPreviews = () => {
    if (previews[0].isConnected === false && previews[0].dataset.mode) { document.removeEventListener('kiosque:mode', syncPreviews); return; }
    for (const p of previews) p.dataset.mode = resolveMode(mode());
  };
  syncPreviews();
  // en mode « Appareil », les aperçus suivent l'appareil s'il bascule pendant que la fenêtre est ouverte
  document.addEventListener('kiosque:mode', syncPreviews);

  return h('div', { class: 'field' },
    h('span', { class: 'field-label' }, f.label),
    h('div', { class: 'mode-switch', role: 'radiogroup', 'aria-label': 'Apparence' }, modeButtons),
    h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': f.label }, cards),
    h('p', { class: 'field-hint' }, 'Aperçu immédiat. Enregistre pour le garder.'));
}

// Recherche dans l'annuaire Radio Browser : un clic sur un résultat l'ajoute à la liste ctx.lists[f.target]
function radioSearchField(f, ctx, id) {
  const input = h('input', { id, class: 'input', type: 'search', placeholder: 'FIP, lofi, jazz, Skyrock…', spellcheck: 'false' });
  const btn = h('button', { class: 'btn', type: 'button', html: `${svg('search')}<span>Chercher</span>` });
  const results = h('div', { class: 'radio-results' });
  const hint = h('p', { class: 'field-hint' }, 'Cherche une radio par son nom ou un style de musique, puis clique pour l’ajouter.');

  async function search() {
    const q = input.value.trim();
    if (!q) return;
    btn.disabled = true;
    hint.textContent = 'Recherche…';
    try {
      const found = await api(`/api/radio/search?q=${encodeURIComponent(q)}`, { token });
      hint.textContent = found.length ? `${found.length} radio${found.length > 1 ? 's' : ''} trouvée${found.length > 1 ? 's' : ''}` : 'Aucune radio trouvée.';
      results.replaceChildren(...found.map((r) => {
        const already = ctx.lists?.[f.target]?.has((s) => s.url === r.url);
        const item = h('button', { class: `radio-result${already ? ' is-added' : ''}`, type: 'button', title: r.tags || r.name },
          renderIcon(r.favicon || 'i:radio', null, r.name, 'ico'),
          h('span', { class: 'radio-result-text' }, h('strong', {}, r.name), h('small', {}, [r.country, r.codec, r.bitrate ? `${r.bitrate} kb/s` : '', r.tags].filter(Boolean).join(' · '))),
          h('span', { class: 'radio-result-add', html: svg(already ? 'check' : 'plus') }));
        item.addEventListener('click', () => {
          if (item.classList.contains('is-added')) return;
          ctx.lists?.[f.target]?.add({ name: r.name, url: r.url, favicon: r.favicon || undefined });
          item.classList.add('is-added');
          item.querySelector('.radio-result-add').innerHTML = svg('check');
        });
        return item;
      }));
    } catch (err) {
      hint.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }
  btn.addEventListener('click', search);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, f.label),
    h('div', { class: 'input-group' }, input, btn),
    hint,
    results);
}

// Boutiques retenues par le comparateur : puces à cocher. D'abord celles qui vendent déjà les produits suivis
// (lues dans les offres de la section), puis les plus connues. Aucune cochée = toutes.
const POPULAR_SHOPS = ['Amazon', 'Cdiscount', 'Fnac', 'Darty', 'Boulanger', 'LDLC', 'Materiel.net', 'TopAchat', 'Rue du Commerce', 'Alternate', 'Rakuten', 'E.Leclerc', 'Carrefour', 'Auchan', 'Kaufland', 'Back Market'];
function shopsField(obj, f, id) {
  if (!Array.isArray(obj[f.key])) obj[f.key] = [];
  const selected = obj[f.key];
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.(com|fr|eu|net)$/, '').replace(/[^a-z0-9]/g, '');
  const indexOf = (name) => selected.findIndex((s) => norm(s) === norm(name));
  let seen = null;
  const chips = h('div', { class: 'shop-chips' });
  const hint = h('p', { class: 'field-hint' });
  const clear = h('button', { class: 'link-btn', type: 'button' }, 'Tout décocher');
  clear.addEventListener('click', () => { selected.splice(0); render(); });

  function render() {
    const names = [];
    const add = (n) => { if (n && !names.some((x) => norm(x) === norm(n))) names.push(n); };
    selected.forEach(add);
    (seen ?? []).forEach(add);
    POPULAR_SHOPS.forEach(add);
    chips.replaceChildren(...names.map((name) => {
      const on = indexOf(name) >= 0;
      const absent = seen && !seen.some((s) => norm(s) === norm(name));
      const chip = h('button', { class: `shop-chip${on ? ' is-on' : ''}${absent ? ' is-absent' : ''}`, type: 'button', 'aria-pressed': String(on),
        title: absent ? 'Ne vend aucun des produits suivis pour l’instant' : null }, on ? h('span', { html: svg('check') }) : null, name);
      chip.addEventListener('click', () => {
        const i = indexOf(name);
        if (i >= 0) selected.splice(i, 1); else selected.push(name);
        render();
      });
      return chip;
    }));
    hint.textContent = selected.length
      ? `Seules les offres de ${selected.length > 1 ? `ces ${selected.length} boutiques` : 'cette boutique'} comptent, sur Idealo comme sur LeDénicheur.`
      : 'Aucune boutique cochée : toutes les offres comptent. Coche celles où tu veux acheter.';
    clear.hidden = !selected.length;
  }

  const input = h('input', { id, class: 'input', type: 'text', placeholder: 'Autre boutique (nom affiché sur Idealo ou LeDénicheur)', spellcheck: 'false' });
  const addBtn = h('button', { class: 'btn', type: 'button', html: `${svg('plus')}<span>Ajouter</span>` });
  const addTyped = () => {
    const name = input.value.trim();
    if (!name) return;
    if (indexOf(name) < 0) selected.push(name);
    input.value = '';
    render();
  };
  addBtn.addEventListener('click', addTyped);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } });

  render();
  if (obj.id) {
    api(`/api/data?section=${encodeURIComponent(obj.id)}`).then((d) => { seen = d.shopsSeen ?? []; render(); }).catch(() => {});
  }
  return h('div', { class: 'field' },
    h('div', { class: 'field-label-row' }, h('span', { class: 'field-label' }, f.label), clear),
    chips,
    h('div', { class: 'input-group' }, input, addBtn),
    hint);
}

// Recherche de produits (Idealo, LeDénicheur) : un clic ajoute le produit à la liste `target`
function priceSearchField(f, ctx, id) {
  const input = h('input', { id, class: 'input', type: 'search', placeholder: 'AirPods Pro 2, Switch 2, RTX 5070…', spellcheck: 'false' });
  const btn = h('button', { class: 'btn', type: 'button', html: `${svg('search')}<span>Chercher</span>` });
  const results = h('div', { class: 'radio-results' });
  const hint = h('p', { class: 'field-hint' }, 'Cherche un produit, puis clique pour le suivre : la fiche LeDénicheur correspondante est ajoutée quand elle est trouvée.');
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

  async function search() {
    const q = input.value.trim();
    if (!q) return;
    btn.disabled = true;
    hint.textContent = 'Recherche sur Idealo et LeDénicheur…';
    try {
      const found = await api(`/api/prices/search?q=${encodeURIComponent(q)}`, { token });
      hint.textContent = found.length ? `${found.length} produit${found.length > 1 ? 's' : ''} trouvé${found.length > 1 ? 's' : ''}` : 'Aucun produit trouvé.';
      results.replaceChildren(...found.map((r) => {
        const already = ctx.lists?.[f.target]?.has((p) => p.idealo === r.url || p.ledenicheur === r.url);
        const item = h('button', { class: `radio-result price-result${already ? ' is-added' : ''}`, type: 'button', title: r.details || r.name },
          h('span', { class: 'ico pr-thumb' }, r.image ? h('img', { src: r.image, alt: '', loading: 'lazy' }) : null),
          h('span', { class: 'radio-result-text' }, h('strong', {}, r.name),
            h('small', {}, [r.shop, r.price ? `dès ${euro.format(r.price)}` : '', r.count ? `${r.count} offre${r.count > 1 ? 's' : ''}` : '',
              r.match ? `+ LeDénicheur${r.match.price ? ` dès ${euro.format(r.match.price)}` : ''}` : '', r.details].filter(Boolean).join(' · '))),
          h('span', { class: 'radio-result-add', html: svg(already ? 'check' : 'plus') }));
        item.addEventListener('click', () => {
          if (item.classList.contains('is-added')) return;
          const isIdealo = r.shop === 'idealo';
          ctx.lists?.[f.target]?.add({ name: r.name, idealo: isIdealo ? r.url : '', ledenicheur: isIdealo ? r.match?.url ?? '' : r.url, image: r.image || undefined });
          item.classList.add('is-added');
          item.querySelector('.radio-result-add').innerHTML = svg('check');
        });
        return item;
      }));
    } catch (err) {
      hint.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }
  btn.addEventListener('click', search);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, f.label),
    h('div', { class: 'input-group' }, input, btn),
    hint,
    results);
}

function listField(obj, f, ctx) {
  if (!Array.isArray(obj[f.key])) obj[f.key] = [];
  const items = obj[f.key];
  const list = h('div', { class: 'list' });
  const count = h('span', { class: 'badge' });

  const move = (i, dir) => {
    const [x] = items.splice(i, 1);
    items.splice(i + dir, 0, x);
    render(i + dir);
  };

  const tool = (name, title, fn, disabled) => {
    const b = h('button', { class: 'icon-btn', type: 'button', title, 'aria-label': title, html: svg(name), disabled });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    return b;
  };

  const listItem = (it, i, open) => {
    const label = h('span', { class: 'list-label' });
    const icon = h('span', { class: 'list-icon' });
    const refresh = () => {
      const text = f.summary?.(it);
      label.textContent = text || 'Nouvel élément';
      label.classList.toggle('is-placeholder', !text);
      if (f.summaryIcon) icon.replaceChildren(renderIcon(f.summaryIcon(it) || null, it.url, text, 'ico'));
    };
    const body = h('div', { class: 'list-body' }, renderFields(it, f.fields, ctx));
    body.addEventListener('input', refresh);
    body.addEventListener('change', refresh);
    refresh();
    return h('details', { class: 'list-item', open },
      h('summary', {},
        h('span', { class: 'chev', html: svg('chevron') }),
        f.summaryIcon ? icon : null,
        label,
        h('span', { class: 'list-tools' },
          tool('up', 'Monter', () => move(i, -1), i === 0),
          tool('down', 'Descendre', () => move(i, 1), i === items.length - 1),
          armedButton('trash', 'Supprimer', () => { items.splice(i, 1); render(); }))),
      body);
  };

  function render(openIndex = -1) {
    list.replaceChildren(...items.map((it, i) => listItem(it, i, i === openIndex)));
    if (!items.length) list.append(h('p', { class: 'list-empty' }, 'Rien pour le moment.'));
    count.textContent = items.length;
  }

  const add = h('button', { class: 'btn btn-ghost', type: 'button', html: `${svg('plus')}<span>${f.addLabel ?? 'Ajouter'}</span>` });
  add.addEventListener('click', () => {
    items.push(f.newItem?.() ?? {});
    render(items.length - 1);
    const last = list.lastElementChild;
    last?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    last?.querySelector('input, select')?.focus();
  });

  ctx.lists ??= {};
  ctx.lists[f.key] = {
    add(item) {
      items.push(item);
      render(items.length - 1);
      list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    has: (predicate) => items.some(predicate),
  };

  const focusIndex = ctx.focus?.[f.key] ?? -1;
  render(focusIndex);
  if (focusIndex >= 0) requestAnimationFrame(() => list.children[focusIndex]?.scrollIntoView({ block: 'center' }));

  return h('div', { class: 'field' },
    h('div', { class: 'field-label' }, f.label, ' ', count),
    list,
    add);
}
