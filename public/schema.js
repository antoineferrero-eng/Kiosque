// Description des types de section et des champs modifiables dans l'éditeur.
//
// Un champ : { key, label, type, default?, hint?, placeholder?, options?, min?, max? }
// Types : text, url, number, toggle, select, color, icon, checks, list, game, ytchannel
// Regroupements : { row: [champs] } (côte à côte) et { group: 'Titre', fields: [champs] } (repliable)
// Une liste : { type: 'list', fields, required, summary, summaryIcon, newItem, addLabel }

export const SPANS = [
  { value: 3, label: '1/4' },
  { value: 4, label: '1/3' },
  { value: 6, label: '1/2' },
  { value: 8, label: '2/3' },
  { value: 9, label: '3/4' },
  { value: 12, label: 'Pleine largeur' },
];

export const ESPORT_GAMES = [
  { value: 'csgo', label: 'Counter-Strike 2', short: 'CS2', color: '#ff9800' },
  { value: 'lol', label: 'League of Legends', short: 'LoL', color: '#4caf50' },
  { value: 'valorant', label: 'Valorant', short: 'Valorant', color: '#b26bff' },
  { value: 'rl', label: 'Rocket League', short: 'Rocket League', color: '#3b9dff' },
  { value: 'dota2', label: 'Dota 2', short: 'Dota 2', color: '#e53935' },
  { value: 'ow', label: 'Overwatch', short: 'Overwatch', color: '#f99e1a' },
  { value: 'r6siege', label: 'Rainbow Six Siege', short: 'R6', color: '#a3a3a3' },
  { value: 'pubg', label: 'PUBG', short: 'PUBG', color: '#f2a900' },
  { value: 'codmw', label: 'Call of Duty', short: 'CoD', color: '#8bc34a' },
  { value: 'fifa', label: 'EA Sports FC', short: 'EA FC', color: '#00bcd4' },
  { value: 'mlbb', label: 'Mobile Legends', short: 'MLBB', color: '#5c6bc0' },
  { value: 'starcraft-2', label: 'StarCraft II', short: 'SC2', color: '#26c6da' },
];

const ICON_HINT = 'i:nom (icône intégrée), di:nom (dashboardicons.com), lien d’image, emoji ou « favicon ».';

// Champs communs à toutes les sections
export const COMMON_FIELDS = [
  { row: [
    { key: 'name', label: 'Titre', type: 'text', placeholder: 'Nom de la section' },
    { key: 'tint', label: 'Couleur', type: 'color', default: '#8b9cff' },
  ] },
  { key: 'icon', label: 'Icône', type: 'icon', hint: ICON_HINT },
  { row: [
    { key: 'span', label: 'Largeur', type: 'select', options: SPANS, number: true, default: 4 },
    { key: 'spanMd', label: 'Largeur sur tablette', type: 'select', options: [{ value: '', label: 'Auto' }, ...SPANS], number: true },
  ] },
];

export const TYPES = {
  links: {
    label: 'Applications',
    description: 'Liens vers tes services et sites, avec pastille en ligne / hors ligne.',
    icon: 'server',
    defaults: () => ({ name: 'Applications', icon: 'i:server', tint: '#8b9cff', span: 6, display: 'list', cols: 3, items: [] }),
    fields: [
      { row: [
        { key: 'display', label: 'Affichage', type: 'select', default: 'list', options: [
          { value: 'list', label: 'Liste' },
          { value: 'grid', label: 'Grille d’icônes' },
        ] },
        { key: 'cols', label: 'Colonnes', type: 'number', min: 1, max: 6, default: 3 },
      ] },
      { key: 'statusCheck', label: 'Vérifier si les services sont en ligne', type: 'toggle', default: true },
      {
        key: 'items', label: 'Applications', type: 'list', addLabel: 'Ajouter une application',
        required: 'url',
        summary: (it) => it.title || it.url,
        summaryIcon: (it) => it.icon,
        newItem: () => ({ title: '', url: '' }),
        fields: [
          { row: [
            { key: 'title', label: 'Nom', type: 'text', placeholder: 'Portainer' },
            { key: 'description', label: 'Description', type: 'text', placeholder: 'Optionnel' },
          ] },
          { key: 'url', label: 'Adresse', type: 'url', placeholder: 'https://…' },
          { key: 'icon', label: 'Icône', type: 'icon', hint: ICON_HINT },
          { group: 'Vérification du statut', fields: [
            { key: 'statusCheck', label: 'Vérifier ce service', type: 'toggle', default: true },
            { key: 'allowInsecure', label: 'Accepter les certificats auto-signés', type: 'toggle' },
            { row: [
              { key: 'acceptCodes', label: 'Codes HTTP acceptés en plus', type: 'text', placeholder: 'ex. 401, 403' },
              { key: 'statusUrl', label: 'Adresse à tester', type: 'url', placeholder: 'Si différente' },
            ] },
          ] },
        ],
      },
    ],
  },

  iframe: {
    label: 'Page intégrée',
    description: 'Affiche une page web ou une de tes apps perso dans une carte.',
    icon: 'frame',
    defaults: () => ({ name: 'Ma page', icon: 'i:frame', tint: '#38bdf8', span: 6, url: '', height: 400 }),
    fields: [
      { key: 'url', label: 'Adresse de la page', type: 'url', placeholder: 'http://…', hint: 'Certains sites (Google, YouTube…) refusent d’être intégrés.' },
      { row: [
        { key: 'height', label: 'Hauteur (px)', type: 'number', min: 100, max: 2000, default: 400 },
        { key: 'transparent', label: 'Fond transparent', type: 'toggle', default: true },
      ] },
    ],
  },

  rss: {
    label: 'Actualités',
    description: 'Flux RSS affichés côte à côte.',
    icon: 'newspaper',
    defaults: () => ({ name: 'Actualités', icon: 'i:newspaper', tint: '#fb7185', span: 9, limit: 20, maxHeight: 420, feeds: [] }),
    fields: [
      { row: [
        { key: 'limit', label: 'Articles par flux', type: 'number', min: 1, max: 50, default: 20 },
        { key: 'maxHeight', label: 'Hauteur max (px)', type: 'number', min: 150, max: 1200, default: 420 },
      ] },
      { key: 'showDates', label: 'Afficher la date des articles', type: 'toggle' },
      {
        key: 'feeds', label: 'Flux', type: 'list', addLabel: 'Ajouter un flux',
        required: 'url',
        summary: (f) => f.name || f.url,
        summaryIcon: (f) => f.icon || 'favicon',
        newItem: () => ({ name: '', url: '' }),
        fields: [
          { key: 'name', label: 'Nom', type: 'text', placeholder: 'Les Numériques' },
          { key: 'url', label: 'Adresse du flux RSS', type: 'url', placeholder: 'https://…/rss.xml' },
          { key: 'icon', label: 'Icône', type: 'icon', hint: 'Laisse vide pour utiliser l’icône du site.' },
        ],
      },
    ],
  },

  youtube: {
    label: 'YouTube',
    description: 'Dernières vidéos de tes chaînes, lecture dans la page.',
    icon: 'youtube',
    defaults: () => ({ name: 'YouTube', icon: 'i:youtube', tint: '#f87171', span: 9, limit: 16, show: 8, perChannel: 2, hideShorts: true, player: 'modal', channels: [] }),
    fields: [
      { row: [
        { key: 'show', label: 'Vidéos visibles', type: 'number', min: 1, max: 50, default: 8 },
        { key: 'limit', label: 'Vidéos au total', type: 'number', min: 1, max: 60, default: 16 },
      ] },
      { row: [
        { key: 'perChannel', label: 'Max par chaîne', type: 'number', min: 1, max: 15, placeholder: 'Illimité' },
        { key: 'player', label: 'Au clic', type: 'select', default: 'modal', options: [
          { value: 'modal', label: 'Lire dans la page' },
          { value: 'tab', label: 'Ouvrir YouTube' },
        ] },
      ] },
      { key: 'hideShorts', label: 'Masquer les Shorts', type: 'toggle', default: true },
      {
        key: 'channels', label: 'Chaînes', type: 'list', addLabel: 'Ajouter une chaîne',
        required: 'id',
        summary: (c) => c.name || c.id,
        newItem: () => ({ name: '', id: '' }),
        fields: [
          { key: 'id', label: 'Chaîne', type: 'ytchannel' },
          { key: 'name', label: 'Nom affiché', type: 'text' },
        ],
      },
    ],
  },

  esport: {
    label: 'E-sport',
    description: 'Matchs majeurs du jour, scores en direct (clé PandaScore).',
    icon: 'trophy',
    defaults: () => ({
      name: 'E-sport', icon: 'i:trophy', tint: '#fbbf24', span: 3, tiers: ['s', 'a'], refresh: 300,
      games: ESPORT_GAMES.slice(0, 4).map((g) => ({ id: g.value, name: g.short, color: g.color })),
    }),
    fields: [
      { key: 'tiers', label: 'Niveau des tournois', type: 'checks', default: ['s', 'a'], hint: 'S = plus grands tournois mondiaux.', options: [
        { value: 's', label: 'S' }, { value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }, { value: 'd', label: 'D' },
      ] },
      { row: [
        { key: 'refresh', label: 'Actualisation (s)', type: 'number', min: 60, max: 3600, default: 300 },
        { key: 'minHeight', label: 'Hauteur min (px)', type: 'number', min: 150, max: 1000, default: 240 },
      ] },
      {
        key: 'games', label: 'Jeux', type: 'list', addLabel: 'Ajouter un jeu',
        required: 'id',
        summary: (g) => g.name || g.id,
        newItem: () => ({ id: '' }),
        fields: [
          { row: [
            { key: 'id', label: 'Jeu', type: 'game' },
            { key: 'color', label: 'Couleur', type: 'color', default: '#8b9cff' },
          ] },
          { key: 'name', label: 'Nom affiché', type: 'text' },
        ],
      },
    ],
  },

  notes: {
    label: 'Notes',
    description: 'Notes avec tags colorés, gardées dans ton navigateur.',
    icon: 'note',
    defaults: () => ({ name: 'Notes', icon: 'i:note', tint: '#a78bfa', span: 3, minHeight: 320 }),
    fields: [
      { key: 'minHeight', label: 'Hauteur minimale (px)', type: 'number', min: 150, max: 1200, default: 320 },
    ],
  },

  flags: {
    label: 'Devine le pays',
    description: 'Petit quiz sur les drapeaux du monde.',
    icon: 'flag',
    defaults: () => ({ name: 'Devine le pays', icon: 'i:flag', tint: '#34d399', span: 3 }),
    fields: [],
  },
};

export const GENERAL_FIELDS = [
  { row: [
    { key: 'title', label: 'Titre de l’onglet', type: 'text', default: 'Kiosque' },
    { key: 'favicon', label: 'Favicon', type: 'url', placeholder: 'Lien d’une image' },
  ] },
  { key: 'openIn', label: 'Ouverture des liens', type: 'select', default: 'sametab', options: [
    { value: 'sametab', label: 'Dans le même onglet' },
    { value: 'newtab', label: 'Dans un nouvel onglet' },
  ] },
  { row: [
    { key: 'statusCheck', label: 'Vérifier les services', type: 'toggle', default: true },
    { key: 'statusInterval', label: 'Toutes les (s)', type: 'number', min: 10, max: 3600, default: 60 },
  ] },
];

// Retire les valeurs vides et les éléments de liste incomplets avant d'enregistrer
export function cleanSection(section) {
  const out = clean(section);
  for (const field of listFields(TYPES[section.type]?.fields ?? [])) {
    if (Array.isArray(out[field.key])) out[field.key] = out[field.key].filter((it) => it[field.required]);
  }
  return out;
}

export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v);
      if (c === '' || c == null || Number.isNaN(c)) continue;
      out[k] = c;
    }
    return out;
  }
  return typeof value === 'string' ? value.trim() : value;
}

function listFields(fields) {
  return fields.flatMap((f) => (f.row ? listFields(f.row) : f.group ? listFields(f.fields) : f.type === 'list' ? [f] : []));
}
