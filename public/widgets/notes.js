// Notes avec tags colorés, recherche, modification et suppression.
// Stockées dans le navigateur (localStorage), comme l'ancien widget.
import { h, svg, store, fillArea } from '../lib.js';

const NOTES_KEY = 'kiosque.notes';
const TAGS_KEY = 'kiosque.notes.tags';
const DEFAULT_COLOR = '#8b9cff';

export function buildNotes(sec, body, actions, card) {
  let notes = store.get(NOTES_KEY, []);
  const tagColors = store.get(TAGS_KEY, {});
  let editingId = null;

  // --- barre de recherche + bouton d'ajout
  const search = h('input', { class: 'input notes-search', type: 'search', placeholder: 'Rechercher une note ou un #tag…', 'aria-label': 'Rechercher' });
  const addBtn = h('button', { class: 'round-btn', type: 'button', title: 'Nouvelle note', 'aria-label': 'Nouvelle note', html: svg('plus') });

  // --- formulaire
  const text = h('textarea', { class: 'input', rows: 3, placeholder: 'Écris ta note ici…' });
  const tagsInput = h('input', { class: 'input', type: 'text', placeholder: 'Tags, séparés par des virgules' });
  const color = h('input', { class: 'color-input', type: 'color', value: DEFAULT_COLOR, title: 'Couleur des nouveaux tags' });
  const suggestions = h('div', { class: 'tags' });
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Enregistrer');
  const form = h('form', { class: 'note-form', hidden: true },
    text,
    h('div', { class: 'note-form-row' }, tagsInput, color),
    suggestions,
    h('div', { class: 'note-form-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => closeForm() }, 'Annuler'),
      saveBtn));

  const { fill, scroll: list } = fillArea(sec.minHeight || 300);
  list.classList.add('notes-list');

  body.append(h('div', { class: 'notes' },
    h('div', { class: 'notes-bar' }, h('span', { class: 'notes-search-wrap', html: svg('search') }, search), addBtn),
    form,
    fill));

  const badge = card.querySelector('.badge');

  // --- interactions
  addBtn.addEventListener('click', () => (form.hidden ? openForm() : closeForm()));
  search.addEventListener('input', render);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); });

  function openForm(note) {
    editingId = note?.id ?? null;
    text.value = note?.contenu ?? '';
    tagsInput.value = note?.tags.join(', ') ?? '';
    color.value = DEFAULT_COLOR;
    saveBtn.textContent = note ? 'Modifier' : 'Enregistrer';
    form.hidden = false;
    addBtn.classList.add('is-open');
    renderSuggestions();
    text.focus();
  }

  function closeForm() {
    form.hidden = true;
    editingId = null;
    addBtn.classList.remove('is-open');
  }

  function save() {
    const contenu = text.value.trim();
    if (!contenu) { text.focus(); return; }
    const tags = [...new Set(tagsInput.value.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))];
    for (const t of tags) tagColors[t] ??= color.value;

    if (editingId != null) notes = notes.map((n) => (n.id === editingId ? { ...n, contenu, tags } : n));
    else notes.unshift({ id: Date.now(), contenu, tags });

    persist();
    closeForm();
    search.value = '';
    render();
  }

  function remove(id) {
    notes = notes.filter((n) => n.id !== id);
    persist();
    render();
  }

  function persist() {
    // on oublie la couleur des tags qui ne servent plus
    const used = new Set(notes.flatMap((n) => n.tags ?? []));
    for (const t of Object.keys(tagColors)) if (!used.has(t)) delete tagColors[t];
    store.set(NOTES_KEY, notes);
    store.set(TAGS_KEY, tagColors);
  }

  // --- rendu
  const tagChip = (tag, prefix = '#') => {
    const c = tagColors[tag] || DEFAULT_COLOR;
    return h('span', { class: 'tag', style: { '--tag': c } }, `${prefix}${tag}`);
  };

  function renderSuggestions() {
    const existing = Object.keys(tagColors);
    suggestions.replaceChildren(...existing.map((t) => {
      const chip = tagChip(t, '+');
      chip.classList.add('is-suggestion');
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      const add = () => {
        const current = tagsInput.value.split(',').map((x) => x.trim()).filter(Boolean);
        if (!current.includes(t)) tagsInput.value = [...current, t].join(', ') + ', ';
        tagsInput.focus();
      };
      chip.addEventListener('click', add);
      chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); } });
      return chip;
    }));
    suggestions.hidden = !existing.length;
  }

  function render() {
    const q = search.value.trim().toLowerCase().replace(/^#/, '');
    const shown = q
      ? notes.filter((n) => n.tags?.some((t) => t.includes(q)) || n.contenu.toLowerCase().includes(q))
      : notes;

    badge.hidden = !notes.length;
    badge.textContent = notes.length;

    if (!shown.length) {
      list.replaceChildren(h('p', { class: 'empty' }, q ? 'Aucune note ne correspond.' : 'Aucune note. Clique sur + pour en ajouter une.'));
      return;
    }
    list.replaceChildren(...shown.map(noteCard));
  }

  function noteCard(note) {
    const del = h('button', { class: 'icon-btn note-del', type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer', html: svg('trash') });
    // suppression en deux temps : premier clic = confirmation
    let armed;
    del.addEventListener('click', () => {
      if (del.classList.contains('is-armed')) { remove(note.id); return; }
      del.classList.add('is-armed');
      del.title = 'Cliquer encore pour supprimer';
      clearTimeout(armed);
      armed = setTimeout(() => { del.classList.remove('is-armed'); del.title = 'Supprimer'; }, 2500);
    });

    return h('article', { class: 'note' },
      h('p', { class: 'note-text' }, note.contenu),
      note.tags?.length ? h('div', { class: 'tags' }, note.tags.map((t) => tagChip(t))) : null,
      h('div', { class: 'note-actions' },
        h('button', { class: 'icon-btn', type: 'button', title: 'Modifier', 'aria-label': 'Modifier', html: svg('pencil'), onclick: () => openForm(note) }),
        del));
  }

  render();
}
