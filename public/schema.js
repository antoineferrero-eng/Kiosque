// Description des types de section et des champs modifiables dans l'éditeur.
//
// Un champ : { key, label, type, default?, hint?, placeholder?, options?, min?, max? }
// Types : text, url, number, toggle, select, color, icon, checks, list, game, ytchannel,
//         secret (clé gardée sur le serveur, jamais dans la config), theme, datetime,
//         radiosearch / pricesearch (recherche de radios / de produits qui remplit la liste `target`),
//         shops (boutiques retenues par le comparateur de prix),
//         note (simple texte d'aide)
// Regroupements : { row: [champs] } (côte à côte) et { group: 'Titre', fields: [champs] } (repliable)
// Une liste : { type: 'list', fields, required (clé ou fonction), summary, summaryIcon, newItem, addLabel }

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

// Formats réduits : sous ces paliers (taille du corps de la carte, en px), la section passe en « compact »
// puis en « mini ». h = hauteur (seulement pour une carte de hauteur fixe), w = largeur. 0 = pas de palier.
export const COMPACT_STEPS = {
  flags: { h: [250, 170], w: [230, 0] },
  pokemon: { h: [300, 190], w: [230, 0] },
  weather: { h: [330, 190], w: [0, 0] },
  radio: { h: [250, 150], w: [0, 0] },
  timer: { h: [300, 180], w: [0, 0] },
  countdown: { h: [230, 150], w: [0, 0] },
  launches: { h: [330, 200], w: [260, 0] },
  webstatus: { h: [260, 150], w: [220, 0] },
  crypto: { h: [220, 140], w: [0, 0] },
  prices: { h: [240, 150], w: [0, 0] },
  fun: { h: [200, 0], w: [0, 0] },
  ephemeris: { h: [380, 230], w: [0, 0] },
  freegames: { h: [320, 0], w: [330, 0] },
  deals: { h: [260, 0], w: [0, 0] },
  esport: { h: [260, 160], w: [0, 0] },
  rss: { h: [320, 0], w: [0, 0] },
  links: { h: [0, 0], w: [0, 0] },
  notes: { h: [0, 0], w: [0, 0] },
};

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
  { row: [
    { key: 'cardHeight', label: 'Hauteur (px)', type: 'number', min: 120, max: 2400, placeholder: 'Auto' },
    { key: 'compact', label: 'Format', type: 'select', when: (o) => Boolean(COMPACT_STEPS[o.type]), options: [
      { value: '', label: 'Automatique' }, { value: 'small', label: 'Compact' }, { value: 'tiny', label: 'Mini' },
    ] },
  ] },
  { type: 'note', text: 'Hauteur vide = elle suit le contenu (ou glisse la poignée en bas à droite de la carte). Format automatique = la section se réduit d’elle-même quand sa carte devient petite.' },
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
      { key: 'pandascoreToken', label: 'Clé API PandaScore', type: 'secret', env: 'PANDASCORE_TOKEN', placeholder: 'Colle ta clé ici',
        hint: 'Commune à toutes les sections e-sport, gardée sur le serveur.', link: 'https://app.pandascore.co/', linkLabel: 'Obtenir une clé gratuite' },
      { key: 'tiers', label: 'Niveau des tournois', type: 'checks', default: ['s', 'a'], hint: 'S = plus grands tournois mondiaux.', options: [
        { value: 's', label: 'S' }, { value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }, { value: 'd', label: 'D' },
      ] },
      { row: [
        { key: 'refresh', label: 'Actualisation (s)', type: 'number', min: 60, max: 3600, default: 300 },
        { key: 'maxHeight', label: 'Hauteur max (px)', type: 'number', min: 150, max: 1000, default: 300 },
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
    defaults: () => ({ name: 'Notes', icon: 'i:note', tint: '#a78bfa', span: 3 }),
    fields: [
      { key: 'maxHeight', label: 'Hauteur max de la liste (px)', type: 'number', min: 150, max: 1200, default: 360 },
    ],
  },

  weather: {
    label: 'Météo',
    description: 'Température, prochaines heures et 5 jours pour la ville de ton choix.',
    icon: 'cloud-sun',
    defaults: () => ({ name: 'Météo', icon: 'i:cloud-sun', tint: '#60a5fa', span: 3, city: 'Paris' }),
    fields: [
      { key: 'city', label: 'Ville', type: 'text', placeholder: 'Paris', hint: 'Le nom suffit, ex. « Lyon » ou « Montréal ».' },
      { row: [
        { key: 'hours', label: 'Heures affichées', type: 'number', min: 3, max: 24, default: 24 },
        { key: 'days', label: 'Jours affichés', type: 'number', min: 1, max: 5, default: 5 },
      ] },
    ],
  },

  radio: {
    label: 'Radio',
    description: 'Lecteur de radios en direct : FIP, lofi, jazz… et recherche parmi 50 000 stations.',
    icon: 'radio',
    defaults: () => ({ name: 'Radio', icon: 'i:radio', tint: '#f472b6', span: 3, stations: [] }),
    fields: [
      { key: 'search', label: 'Ajouter une radio', type: 'radiosearch', target: 'stations' },
      {
        key: 'stations', label: 'Stations', type: 'list', addLabel: 'Ajouter un flux à la main',
        required: 'url',
        summary: (s) => s.name || s.url,
        summaryIcon: (s) => s.favicon || 'i:radio',
        newItem: () => ({ name: '', url: '' }),
        fields: [
          { key: 'name', label: 'Nom', type: 'text' },
          { key: 'url', label: 'Adresse du flux audio', type: 'url', placeholder: 'https://…/flux.mp3' },
          { key: 'favicon', label: 'Logo', type: 'icon' },
        ],
      },
      { type: 'note', text: 'Sans station, le lecteur propose FIP, FIP Groove, FIP Electro, Mouv’ et une radio lofi.' },
    ],
  },

  freegames: {
    label: 'Jeux gratuits',
    description: 'Jeux offerts en ce moment sur Epic Games, Steam, GOG…',
    icon: 'gift',
    defaults: () => ({ name: 'Jeux gratuits', icon: 'i:gift', tint: '#a3e635', span: 6, sources: ['epic', 'steam', 'gog'], limit: 8 }),
    fields: [
      { key: 'sources', label: 'Boutiques', type: 'checks', default: ['epic', 'steam', 'gog'], options: [
        { value: 'epic', label: 'Epic' }, { value: 'steam', label: 'Steam' }, { value: 'gog', label: 'GOG' },
        { value: 'ubisoft', label: 'Ubisoft' }, { value: 'itchio', label: 'itch.io' }, { value: 'ps4', label: 'PlayStation' },
        { value: 'xbox-one', label: 'Xbox' }, { value: 'switch', label: 'Switch' },
      ] },
      { key: 'limit', label: 'Jeux affichés', type: 'number', min: 1, max: 30, default: 12 },
    ],
  },

  deals: {
    label: 'Bons plans PC',
    description: 'Les meilleures promos de jeux PC du moment (prix en dollars).',
    icon: 'tag',
    defaults: () => ({ name: 'Bons plans', icon: 'i:tag', tint: '#fb923c', span: 3, stores: ['1', '7', '25', '11'], maxPrice: 20, limit: 8 }),
    fields: [
      { key: 'stores', label: 'Boutiques', type: 'checks', default: ['1', '7', '25', '11'], options: [
        { value: '1', label: 'Steam' }, { value: '7', label: 'GOG' }, { value: '25', label: 'Epic' }, { value: '11', label: 'Humble' },
        { value: '3', label: 'GreenManGaming' }, { value: '15', label: 'Fanatical' }, { value: '13', label: 'Ubisoft' }, { value: '30', label: 'IndieGala' },
      ] },
      { row: [
        { key: 'maxPrice', label: 'Prix max ($)', type: 'number', min: 0, max: 100, default: 20 },
        { key: 'minRating', label: 'Note Steam min (%)', type: 'number', min: 0, max: 100, placeholder: 'Aucune' },
      ] },
      { row: [
        { key: 'limit', label: 'Promos affichées', type: 'number', min: 1, max: 30, default: 12 },
        { key: 'sort', label: 'Trier par', type: 'select', default: 'Deal Rating', options: [
          { value: 'Deal Rating', label: 'Meilleure affaire' }, { value: 'Savings', label: 'Plus grosse réduction' },
          { value: 'Price', label: 'Prix' }, { value: 'Recent', label: 'Plus récentes' }, { value: 'Reviews', label: 'Mieux notés' },
        ] },
      ] },
    ],
  },

  launches: {
    label: 'Lancements spatiaux',
    description: 'Prochains décollages de fusées avec compte à rebours.',
    icon: 'rocket',
    defaults: () => ({ name: 'Lancements', icon: 'i:rocket', tint: '#818cf8', span: 3, limit: 5 }),
    fields: [
      { row: [
        { key: 'limit', label: 'Lancements affichés', type: 'number', min: 1, max: 10, default: 6 },
        { key: 'provider', label: 'Seulement', type: 'select', options: [
          { value: '', label: 'Toutes les agences' }, { value: 'SpaceX', label: 'SpaceX' }, { value: 'Rocket Lab', label: 'Rocket Lab' },
          { value: 'Arianespace', label: 'Arianespace' }, { value: 'National Aeronautics and Space Administration', label: 'NASA' },
          { value: 'China Aerospace Science and Technology Corporation', label: 'Chine (CASC)' }, { value: 'Blue Origin', label: 'Blue Origin' },
        ] },
      ] },
    ],
  },

  crypto: {
    label: 'Crypto',
    description: 'Cours, variation sur 24 h et mini-graphique sur 7 jours.',
    icon: 'trend',
    defaults: () => ({ name: 'Crypto', icon: 'i:trend', tint: '#facc15', span: 3, currency: 'eur', coins: [{ id: 'bitcoin' }, { id: 'ethereum' }, { id: 'solana' }] }),
    fields: [
      { key: 'currency', label: 'Devise', type: 'select', default: 'eur', options: [{ value: 'eur', label: 'Euro (€)' }, { value: 'usd', label: 'Dollar ($)' }, { value: 'gbp', label: 'Livre (£)' }, { value: 'chf', label: 'Franc suisse' }] },
      {
        key: 'coins', label: 'Cryptomonnaies', type: 'list', addLabel: 'Ajouter une cryptomonnaie',
        required: 'id',
        summary: (c) => c.id,
        newItem: () => ({ id: '' }),
        fields: [{ key: 'id', label: 'Identifiant CoinGecko', type: 'text', placeholder: 'bitcoin', hint: 'Le nom dans l’adresse de la page CoinGecko : bitcoin, ethereum, dogecoin, ripple…' }],
      },
    ],
  },

  prices: {
    label: 'Comparateur de prix',
    description: 'Les offres de tes boutiques préférées réunies depuis Idealo et LeDénicheur, avec la courbe du prix sur 3 mois et un prix cible.',
    icon: 'tag',
    defaults: () => ({ name: 'Prix', icon: 'i:tag', tint: '#2dd4bf', span: 4, products: [], shops: [], marketplace: true }),
    fields: [
      { key: 'search', label: 'Ajouter un produit', type: 'pricesearch', target: 'products' },
      { key: 'shops', label: 'Boutiques', type: 'shops' },
      { row: [
        { key: 'marketplace', label: 'Vendeurs tiers (marketplace)', type: 'toggle', default: true },
        { key: 'maxOffers', label: 'Offres listées', type: 'number', min: 1, max: 20, default: 6 },
      ] },
      {
        key: 'products', label: 'Produits suivis', type: 'list', addLabel: 'Ajouter un produit à la main',
        required: (p) => p.idealo || p.ledenicheur || p.shop,
        summary: (p) => p.name || p.idealo || p.ledenicheur || p.shop,
        summaryIcon: (p) => p.image || 'i:tag',
        newItem: () => ({ name: '', idealo: '', ledenicheur: '' }),
        fields: [
          { key: 'name', label: 'Nom', type: 'text', placeholder: 'Repris de la page si vide' },
          { key: 'idealo', label: 'Page Idealo', type: 'url', placeholder: 'https://www.idealo.fr/prix/…' },
          { key: 'ledenicheur', label: 'Page LeDénicheur', type: 'url', placeholder: 'https://ledenicheur.fr/product.php?p=…' },
          { key: 'shop', label: 'Autre boutique (facultatif)', type: 'url', placeholder: 'https://…', hint: 'La page d’un produit chez un marchand : Fnac, Darty, Boulanger, LDLC… (Amazon bloque souvent la lecture).' },
          { key: 'target', label: 'Prix cible (€)', type: 'number', min: 0, placeholder: 'Aucun', hint: 'Le produit est mis en avant quand le meilleur prix passe dessous.' },
        ],
      },
      { type: 'note', text: 'Les offres sont relues toutes les 3 heures. La courbe reprend l’historique publié par LeDénicheur, complété chaque jour par les relevés de Kiosque pour chaque boutique : mets les deux liens pour un comparatif complet.' },
    ],
  },

  ephemeris: {
    label: 'Éphéméride',
    description: 'Image du jour et « ce jour-là dans l’histoire », d’après Wikipédia.',
    icon: 'book',
    defaults: () => ({ name: 'Éphéméride', icon: 'i:book', tint: '#2dd4bf', span: 6 }),
    fields: [
      { row: [
        { key: 'limit', label: 'Événements affichés', type: 'number', min: 1, max: 12, default: 5 },
        { key: 'showImage', label: 'Image du jour', type: 'toggle', default: true },
      ] },
    ],
  },

  pokemon: {
    label: 'Qui est ce Pokémon ?',
    description: 'Quiz : retrouve le Pokémon caché derrière la silhouette.',
    icon: 'pokeball',
    defaults: () => ({ name: 'Qui est ce Pokémon ?', icon: 'i:pokeball', tint: '#f87171', span: 3, generations: 3 }),
    fields: [
      { key: 'generations', label: 'Jusqu’à la génération', type: 'select', number: true, default: 3, options: [
        { value: 1, label: '1 (151 Pokémon)' }, { value: 2, label: '2 (251)' }, { value: 3, label: '3 (386)' }, { value: 4, label: '4 (493)' },
        { value: 5, label: '5 (649)' }, { value: 6, label: '6 (721)' }, { value: 7, label: '7 (809)' }, { value: 8, label: '8 (905)' }, { value: 9, label: '9 (1025)' },
      ] },
    ],
  },

  webstatus: {
    label: 'État des services web',
    description: 'GitHub, Discord, Cloudflare… sont-ils en panne ?',
    icon: 'activity',
    defaults: () => ({ name: 'Services web', icon: 'i:activity', tint: '#34d399', span: 3, services: [] }),
    fields: [
      { type: 'note', text: 'Sans service, la liste suit GitHub, Discord, Cloudflare, OpenAI, Reddit et Twitch.' },
      {
        key: 'services', label: 'Services', type: 'list', addLabel: 'Ajouter un service',
        required: 'url',
        summary: (s) => s.name || s.url,
        newItem: () => ({ name: '', url: '' }),
        fields: [
          { key: 'name', label: 'Nom', type: 'text', placeholder: 'GitHub' },
          { key: 'url', label: 'Page de statut', type: 'url', placeholder: 'https://www.githubstatus.com', hint: 'Fonctionne avec les pages de statut « Statuspage » (la plupart des grands services).' },
        ],
      },
    ],
  },

  countdown: {
    label: 'Comptes à rebours',
    description: 'Jours, heures et minutes avant tes événements.',
    icon: 'hourglass',
    defaults: () => ({ name: 'Bientôt', icon: 'i:hourglass', tint: '#c084fc', span: 3, events: [] }),
    fields: [
      { key: 'showPast', label: 'Garder les événements passés', type: 'toggle' },
      {
        key: 'events', label: 'Événements', type: 'list', addLabel: 'Ajouter un événement',
        required: 'date',
        summary: (e) => [e.emoji, e.name].filter(Boolean).join(' ') || e.date,
        newItem: () => ({ name: '', date: '', emoji: '🎉' }),
        fields: [
          { row: [
            { key: 'name', label: 'Nom', type: 'text', placeholder: 'Sortie de GTA VI' },
            { key: 'emoji', label: 'Emoji', type: 'text', placeholder: '🎮' },
          ] },
          { row: [
            { key: 'date', label: 'Date et heure', type: 'datetime' },
            { key: 'yearly', label: 'Chaque année', type: 'toggle' },
          ] },
        ],
      },
      { type: 'note', text: 'Sans événement, le widget affiche Halloween, Noël et le Nouvel An.' },
    ],
  },

  fun: {
    label: 'Pour rire',
    description: 'Répliques de Kaamelott et blagues, en français.',
    icon: 'smile',
    defaults: () => ({ name: 'Pour rire', icon: 'i:smile', tint: '#fbbf24', span: 3, source: 'mix' }),
    fields: [
      { key: 'source', label: 'Contenu', type: 'select', default: 'mix', options: [
        { value: 'mix', label: 'Un peu de tout' }, { value: 'kaamelott', label: 'Répliques de Kaamelott' }, { value: 'joke', label: 'Blagues' },
      ] },
    ],
  },

  timer: {
    label: 'Minuteur',
    description: 'Minuteur avec sonnerie, et historique des derniers temps à relancer en un clic.',
    icon: 'clock',
    defaults: () => ({ name: 'Minuteur', icon: 'i:clock', tint: '#22d3ee', span: 3, history: 2 }),
    fields: [
      { key: 'history', label: 'Temps gardés dans l’historique', type: 'number', min: 1, max: 10, default: 2 },
      { row: [
        { key: 'sound', label: 'Sonnerie à la fin', type: 'toggle', default: true },
        { key: 'notify', label: 'Notification', type: 'toggle', default: true },
      ] },
      { type: 'note', text: 'La notification s’affiche quand l’onglet n’est pas au premier plan (le navigateur demande l’autorisation au premier lancement).' },
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
  { key: 'theme', modeKey: 'themeMode', label: 'Thème', type: 'theme' },
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

export const SECRET_FIELDS = [
  { key: 'pandascoreToken', label: 'Clé PandaScore (e-sport)', type: 'secret', env: 'PANDASCORE_TOKEN', placeholder: 'Colle ta clé ici',
    hint: 'Nécessaire pour afficher les matchs des sections e-sport.', link: 'https://app.pandascore.co/', linkLabel: 'Obtenir une clé gratuite' },
];

// Retire les valeurs vides et les éléments de liste incomplets avant d'enregistrer
export function cleanSection(section) {
  const out = clean(section);
  for (const field of listFields(TYPES[section.type]?.fields ?? [])) {
    const keep = typeof field.required === 'function' ? field.required : (it) => it[field.required];
    if (Array.isArray(out[field.key])) out[field.key] = out[field.key].filter(keep);
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
