// Mode édition : connexion admin, panneaux de modification, ajout, suppression et déplacement des sections.
import { $, $$, h, svg, api, store, renderIcon, toast, modal, ICON_NAMES } from './lib.js';
import { TYPES, COMMON_FIELDS, GENERAL_FIELDS, ESPORT_GAMES, cleanSection, clean } from './schema.js';

const TOKEN_KEY = 'kiosque.token';
let app; // { getConfig(), setConfig(cfg) } fourni par app.js
let session = { editable: false, authenticated: false };
let token = store.get(TOKEN_KEY, null);
let uid = 0;

export const isEditing = () => document.body.classList.contains('is-editing');

export async function initEditor(appApi) {
  app = appApi;
  $('#edit-toggle').addEventListener('click', toggleEdit);
  $('#edit-done').addEventListener('click', exitEdit);
  $('#edit-add').addEventListener('click', () => openNewSection());
  $('#edit-settings').addEventListener('click', openSettings);
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
  if (!session.editable) return showSetupHelp();
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
  if (token) {
    try {
      session = await api('/api/session', { token });
      if (session.authenticated) return true;
    } catch { /* on redemande le mot de passe */ }
  }
  return askPassword();
}

function askPassword() {
  return new Promise((resolve) => {
    let ok = false;
    const input = h('input', { class: 'input', type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password', required: true });
    const error = h('p', { class: 'form-error', hidden: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Se connecter');
    const form = h('form', { class: 'modal-form' },
      h('p', { class: 'modal-text' }, 'Entre le mot de passe administrateur pour modifier le dashboard.'),
      input,
      error,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Annuler'),
        submit));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.hidden = true;
      try {
        ({ token } = await api('/api/login', { method: 'POST', body: { password: input.value } }));
        store.set(TOKEN_KEY, token);
        session.authenticated = true;
        ok = true;
        dialog.close();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        input.select();
      } finally {
        submit.disabled = false;
      }
    });

    const dialog = modal({ title: 'Mode édition', icon: 'lock', body: form });
    dialog.addEventListener('close', () => resolve(ok));
    input.focus();
  });
}

function showSetupHelp() {
  modal({
    title: 'Édition désactivée',
    icon: 'lock',
    body: h('div', { class: 'modal-form' },
      h('p', { class: 'modal-text' }, 'Pour modifier le dashboard depuis la page, définis un mot de passe administrateur :'),
      h('pre', { class: 'code' }, 'ADMIN_PASSWORD=ton-mot-de-passe'),
      h('p', { class: 'modal-text' }, 'dans le fichier .env (ou dans les variables d’environnement de la stack Portainer), puis redémarre le serveur.')),
  });
}

// ---------------------------------------------------------------- enregistrement

const cloneConfig = () => structuredClone(app.getConfig());

async function save(next, message = 'Modifications enregistrées') {
  try {
    app.setConfig(await api('/api/config', { method: 'PUT', body: next, token }));
    toast(message);
    return true;
  } catch (err) {
    if (err.status === 401 && (await askPassword())) return save(next, message);
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
  const focus = {};
  if (addItem) {
    draft.items = [...(draft.items ?? []), { title: '', url: '' }];
    focus.items = draft.items.length - 1;
  } else if (focusItem) {
    focus.items = (draft.items ?? []).findIndex((it) => it.id === focusItem);
  }

  const d = drawer({ title: draft.name || type.label, icon: type.icon });
  d.body.append(...renderFields(draft, [...COMMON_FIELDS, ...type.fields], { focus }));
  formFooter(d, {
    extra: armedButton('trash', 'Supprimer la section', () => { d.dialog.close(); removeSection(id); }, 'icon-btn'),
    onSave: () => {
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
    d.setTitle(`Nouvelle section · ${t.label}`);
    d.setIcon(t.icon);
    d.body.replaceChildren(...renderFields(draft, [...COMMON_FIELDS, ...t.fields], { focus: {} }));
    formFooter(d, {
      extra: h('button', { class: 'btn', type: 'button', onclick: () => { d.dialog.close(); openNewSection(); } }, 'Retour'),
      onSave: async () => {
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

function openSettings() {
  const d = drawer({ title: 'Réglages', icon: 'sliders' });
  const draft = structuredClone(app.getConfig());
  const generalKeys = keysOf(GENERAL_FIELDS);

  // Configuration complète en JSON : sauvegarde, copie vers un autre serveur, import
  const json = h('textarea', { class: 'input code-input', rows: 12, spellcheck: 'false', 'aria-label': 'Configuration JSON' });
  json.value = JSON.stringify(app.getConfig(), null, 2);
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    json.value = await file.files[0].text();
    toast('Fichier chargé : clique sur « Appliquer » pour l’utiliser');
  });
  const exportBtn = h('button', { class: 'btn', type: 'button', html: `${svg('download')}<span>Exporter</span>` });
  exportBtn.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(app.getConfig(), null, 2)], { type: 'application/json' }));
    h('a', { href: url, download: 'kiosque-config.json' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const importBtn = h('button', { class: 'btn', type: 'button', html: `${svg('upload')}<span>Importer</span>`, onclick: () => file.click() });
  const applyBtn = h('button', { class: 'btn btn-primary', type: 'button', html: `${svg('check')}<span>Appliquer</span>` });
  applyBtn.addEventListener('click', async () => {
    let parsed;
    try { parsed = JSON.parse(json.value); } catch (err) { toast(`JSON invalide : ${err.message}`, 'error'); return; }
    if (await save(parsed, 'Configuration appliquée')) d.dialog.close();
  });

  const logout = h('button', { class: 'btn', type: 'button', html: `${svg('logout')}<span>Se déconnecter</span>` });
  logout.addEventListener('click', () => {
    token = null;
    store.set(TOKEN_KEY, null);
    session.authenticated = false;
    d.dialog.close();
    exitEdit();
    toast('Déconnecté');
  });

  d.body.append(
    ...renderFields(draft, GENERAL_FIELDS, { focus: {} }),
    h('details', { class: 'field-group' },
      h('summary', {}, h('span', { class: 'chev', html: svg('chevron') }), 'Configuration complète (JSON)'),
      h('div', { class: 'field-group-body' },
        h('p', { class: 'field-hint' }, 'Exporte-la pour la sauvegarder, ou importe celle d’un autre serveur.'),
        json,
        h('div', { class: 'btn-row' }, exportBtn, importBtn, h('span', { class: 'spacer' }), applyBtn),
        file)));

  formFooter(d, {
    extra: logout,
    onSave: () => {
      const next = cloneConfig();
      const cleaned = clean(draft);
      for (const k of generalKeys) {
        if (cleaned[k] === undefined) delete next[k]; else next[k] = cleaned[k];
      }
      return save(next, 'Réglages enregistrés');
    },
  });
}

function keysOf(fields) {
  return fields.flatMap((f) => (f.row ? keysOf(f.row) : f.group ? keysOf(f.fields) : [f.key]));
}

// ---------------------------------------------------------------- génération des formulaires

function renderFields(obj, fields, ctx) {
  return fields.map((f) => {
    if (f.row) return h('div', { class: 'field-row' }, renderFields(obj, f.row, ctx));
    if (f.group) {
      return h('details', { class: 'field-group' },
        h('summary', {}, h('span', { class: 'chev', html: svg('chevron') }), f.group),
        h('div', { class: 'field-group-body' }, renderFields(obj, f.fields, ctx)));
    }
    if (f.type === 'list') return listField(obj, f, ctx);
    return field(obj, f);
  });
}

function field(obj, f) {
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

  const focusIndex = ctx.focus?.[f.key] ?? -1;
  render(focusIndex);
  if (focusIndex >= 0) requestAnimationFrame(() => list.children[focusIndex]?.scrollIntoView({ block: 'center' }));

  return h('div', { class: 'field' },
    h('div', { class: 'field-label' }, f.label, ' ', count),
    list,
    add);
}
