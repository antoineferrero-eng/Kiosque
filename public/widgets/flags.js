// Quiz « Devine le pays » : trouver le drapeau d'un pays, ou le pays d'un drapeau.
import { h, svg, store, iconButton } from '../lib.js';

// Nom FR + code ISO 3166-1 alpha-2 (drapeaux servis par flagcdn.com)
const COUNTRIES = [
  ['Afghanistan', 'af'], ['Afrique du Sud', 'za'], ['Albanie', 'al'], ['Algérie', 'dz'], ['Allemagne', 'de'],
  ['Andorre', 'ad'], ['Angola', 'ao'], ['Antigua-et-Barbuda', 'ag'], ['Arabie saoudite', 'sa'], ['Argentine', 'ar'],
  ['Arménie', 'am'], ['Australie', 'au'], ['Autriche', 'at'], ['Azerbaïdjan', 'az'], ['Bahamas', 'bs'],
  ['Bahreïn', 'bh'], ['Bangladesh', 'bd'], ['Barbade', 'bb'], ['Belgique', 'be'], ['Belize', 'bz'],
  ['Bénin', 'bj'], ['Bhoutan', 'bt'], ['Biélorussie', 'by'], ['Birmanie (Myanmar)', 'mm'], ['Bolivie', 'bo'],
  ['Bosnie-Herzégovine', 'ba'], ['Botswana', 'bw'], ['Brésil', 'br'], ['Brunei', 'bn'], ['Bulgarie', 'bg'],
  ['Burkina Faso', 'bf'], ['Burundi', 'bi'], ['Cambodge', 'kh'], ['Cameroun', 'cm'], ['Canada', 'ca'],
  ['Cap-Vert', 'cv'], ['République centrafricaine', 'cf'], ['Chili', 'cl'], ['Chine', 'cn'], ['Chypre', 'cy'],
  ['Colombie', 'co'], ['Comores', 'km'], ['République du Congo', 'cg'], ['République démocratique du Congo', 'cd'],
  ['Corée du Nord', 'kp'], ['Corée du Sud', 'kr'], ['Costa Rica', 'cr'], ["Côte d'Ivoire", 'ci'], ['Croatie', 'hr'],
  ['Cuba', 'cu'], ['Danemark', 'dk'], ['Djibouti', 'dj'], ['Dominique', 'dm'], ['Égypte', 'eg'],
  ['Émirats arabes unis', 'ae'], ['Équateur', 'ec'], ['Érythrée', 'er'], ['Espagne', 'es'], ['Estonie', 'ee'],
  ['Eswatini', 'sz'], ['États-Unis', 'us'], ['Éthiopie', 'et'], ['Fidji', 'fj'], ['Finlande', 'fi'],
  ['France', 'fr'], ['Gabon', 'ga'], ['Gambie', 'gm'], ['Géorgie', 'ge'], ['Ghana', 'gh'],
  ['Grèce', 'gr'], ['Grenade', 'gd'], ['Guatemala', 'gt'], ['Guinée', 'gn'], ['Guinée-Bissau', 'gw'],
  ['Guinée équatoriale', 'gq'], ['Guyana', 'gy'], ['Haïti', 'ht'], ['Honduras', 'hn'], ['Hongrie', 'hu'],
  ['Îles Marshall', 'mh'], ['Îles Salomon', 'sb'], ['Inde', 'in'], ['Indonésie', 'id'], ['Irak', 'iq'],
  ['Iran', 'ir'], ['Irlande', 'ie'], ['Islande', 'is'], ['Israël', 'il'], ['Italie', 'it'],
  ['Jamaïque', 'jm'], ['Japon', 'jp'], ['Jordanie', 'jo'], ['Kazakhstan', 'kz'], ['Kenya', 'ke'],
  ['Kirghizistan', 'kg'], ['Kiribati', 'ki'], ['Koweït', 'kw'], ['Laos', 'la'], ['Lesotho', 'ls'],
  ['Lettonie', 'lv'], ['Liban', 'lb'], ['Liberia', 'lr'], ['Libye', 'ly'], ['Liechtenstein', 'li'],
  ['Lituanie', 'lt'], ['Luxembourg', 'lu'], ['Macédoine du Nord', 'mk'], ['Madagascar', 'mg'], ['Malaisie', 'my'],
  ['Malawi', 'mw'], ['Maldives', 'mv'], ['Mali', 'ml'], ['Malte', 'mt'], ['Maroc', 'ma'],
  ['Maurice', 'mu'], ['Mauritanie', 'mr'], ['Mexique', 'mx'], ['Micronésie', 'fm'], ['Moldavie', 'md'],
  ['Monaco', 'mc'], ['Mongolie', 'mn'], ['Monténégro', 'me'], ['Mozambique', 'mz'], ['Namibie', 'na'],
  ['Nauru', 'nr'], ['Népal', 'np'], ['Nicaragua', 'ni'], ['Niger', 'ne'], ['Nigeria', 'ng'],
  ['Norvège', 'no'], ['Nouvelle-Zélande', 'nz'], ['Oman', 'om'], ['Ouganda', 'ug'], ['Ouzbékistan', 'uz'],
  ['Pakistan', 'pk'], ['Palaos', 'pw'], ['Panama', 'pa'], ['Papouasie-Nouvelle-Guinée', 'pg'], ['Paraguay', 'py'],
  ['Pays-Bas', 'nl'], ['Pérou', 'pe'], ['Philippines', 'ph'], ['Pologne', 'pl'], ['Portugal', 'pt'],
  ['Qatar', 'qa'], ['Roumanie', 'ro'], ['Royaume-Uni', 'gb'], ['Russie', 'ru'], ['Rwanda', 'rw'],
  ['Saint-Kitts-et-Nevis', 'kn'], ['Saint-Marin', 'sm'], ['Saint-Vincent-et-les-Grenadines', 'vc'],
  ['Sainte-Lucie', 'lc'], ['Salvador', 'sv'], ['Samoa', 'ws'], ['Sao Tomé-et-Principe', 'st'], ['Sénégal', 'sn'],
  ['Serbie', 'rs'], ['Seychelles', 'sc'], ['Sierra Leone', 'sl'], ['Singapour', 'sg'], ['Slovaquie', 'sk'],
  ['Slovénie', 'si'], ['Somalie', 'so'], ['Soudan', 'sd'], ['Soudan du Sud', 'ss'], ['Sri Lanka', 'lk'],
  ['Suède', 'se'], ['Suisse', 'ch'], ['Suriname', 'sr'], ['Syrie', 'sy'], ['Tadjikistan', 'tj'],
  ['Tanzanie', 'tz'], ['Tchad', 'td'], ['République tchèque', 'cz'], ['Thaïlande', 'th'], ['Timor oriental', 'tl'],
  ['Togo', 'tg'], ['Tonga', 'to'], ['Trinité-et-Tobago', 'tt'], ['Tunisie', 'tn'], ['Turkménistan', 'tm'],
  ['Turquie', 'tr'], ['Tuvalu', 'tv'], ['Ukraine', 'ua'], ['Uruguay', 'uy'], ['Vanuatu', 'vu'],
  ['Vatican', 'va'], ['Venezuela', 've'], ['Vietnam', 'vn'], ['Yémen', 'ye'], ['Zambie', 'zm'], ['Zimbabwe', 'zw'],
].map(([name, code]) => ({ name, code }));

const flagUrl = (code, size = 'w320') => `https://flagcdn.com/${size}/${code}.png`;

function pickDistinct(n) {
  const picked = new Set();
  while (picked.size < n) picked.add(COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)]);
  return [...picked];
}

export function buildFlags(sec, body, actions) {
  const state = { good: 0, total: 0, streak: 0, best: store.get('kiosque.flags.best', 0), locked: false, timer: null };

  const scoreEl = h('span', { class: 'quiz-stat', title: 'Bonnes réponses' });
  const streakEl = h('span', { class: 'quiz-stat quiz-streak', title: 'Série en cours (record entre parenthèses)' });
  const question = h('div', { class: 'quiz-q' });
  const options = h('div', { class: 'quiz-opts' });
  body.append(h('div', { class: 'quiz' },
    h('div', { class: 'quiz-head' }, scoreEl, streakEl),
    question,
    options));

  actions.append(iconButton('skip', 'Passer la question', () => newRound()));

  function updateStats() {
    scoreEl.textContent = state.total ? `${state.good}/${state.total}` : '0/0';
    streakEl.innerHTML = `${svg('flame')}<span>${state.streak}</span><small>(${state.best})</small>`;
    streakEl.classList.toggle('is-hot', state.streak >= 3);
  }

  function newRound() {
    clearTimeout(state.timer);
    state.locked = false;
    const picks = pickDistinct(3);
    const answer = Math.floor(Math.random() * 3);
    const guessFlag = Math.random() < 0.5;

    if (guessFlag) {
      // Nom du pays affiché → choisir le bon drapeau (sans nom, pas d'indice)
      question.replaceChildren(
        h('p', { class: 'quiz-label' }, 'Quel drapeau correspond à'),
        h('p', { class: 'quiz-country' }, picks[answer].name));
    } else {
      // Drapeau affiché → choisir le bon nom
      question.replaceChildren(
        h('p', { class: 'quiz-label' }, 'À quel pays est ce drapeau ?'),
        h('img', { class: 'quiz-flag', src: flagUrl(picks[answer].code), alt: 'Drapeau à deviner' }));
    }

    options.className = `quiz-opts ${guessFlag ? 'is-flags' : 'is-names'}`;
    options.replaceChildren(...picks.map((c, i) => {
      const btn = h('button', { class: 'quiz-opt', type: 'button', 'aria-label': guessFlag ? `Drapeau ${i + 1}` : c.name },
        guessFlag ? h('img', { src: flagUrl(c.code, 'w160'), srcset: `${flagUrl(c.code, 'w320')} 2x`, alt: '' }) : c.name);
      btn.addEventListener('click', () => answerWith(i === answer, btn, answer));
      return btn;
    }));
  }

  function answerWith(correct, btn, answer) {
    if (state.locked) return;
    state.locked = true;
    state.total++;
    if (correct) {
      state.good++;
      state.streak++;
      if (state.streak > state.best) { state.best = state.streak; store.set('kiosque.flags.best', state.best); }
    } else {
      state.streak = 0;
    }
    updateStats();

    const buttons = [...options.children];
    buttons.forEach((b) => { b.disabled = true; });
    buttons[answer].classList.add('is-correct');
    if (!correct) btn.classList.add('is-wrong');
    state.timer = setTimeout(newRound, correct ? 900 : 1600);
  }

  updateStats();
  newRound();
}
