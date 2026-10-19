// Quiz « Qui est ce Pokémon ? » : une silhouette, quatre noms (PokeAPI, interrogée directement par le navigateur).
import { h, svg, store, iconButton } from '../lib.js';

// Dernier numéro de chaque génération
const GENERATIONS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const art = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const nameCache = new Map(Object.entries(store.get('kiosque.pokemon.names', {})));
async function frenchName(id) {
  if (nameCache.has(String(id))) return nameCache.get(String(id));
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) throw new Error('PokeAPI injoignable');
  const data = await res.json();
  const name = data.names.find((n) => n.language.name === 'fr')?.name ?? data.name;
  nameCache.set(String(id), name);
  store.set('kiosque.pokemon.names', Object.fromEntries([...nameCache].slice(-400)));
  return name;
}

function pickIds(max, n) {
  const ids = new Set();
  while (ids.size < n) ids.add(1 + Math.floor(Math.random() * max));
  return [...ids];
}

export function buildPokemon(sec, body, actions) {
  const max = GENERATIONS[Math.min(GENERATIONS.length, Math.max(1, sec.generations || 3)) - 1];
  const state = { good: 0, total: 0, streak: 0, best: store.get('kiosque.pokemon.best', 0), locked: true, next: null };

  const scoreEl = h('span', { class: 'quiz-stat' });
  const streakEl = h('span', { class: 'quiz-stat quiz-streak' });
  const img = h('img', { class: 'poke-img is-hidden', alt: 'Pokémon mystère', draggable: 'false' });
  const reveal = h('p', { class: 'poke-name' }, ' ');
  const options = h('div', { class: 'quiz-opts is-names poke-opts' });
  body.append(h('div', { class: 'quiz poke' },
    h('div', { class: 'quiz-head' }, scoreEl, streakEl),
    h('div', { class: 'poke-stage' }, img),
    reveal,
    options));
  actions.append(iconButton('skip', 'Pokémon suivant', () => round()));

  function stats() {
    scoreEl.textContent = `${state.good}/${state.total}`;
    streakEl.innerHTML = `${svg('flame')}<span>${state.streak}</span><small>(${state.best})</small>`;
    streakEl.classList.toggle('is-hot', state.streak >= 3);
  }

  async function prepare() {
    const ids = pickIds(max, 4);
    const names = await Promise.all(ids.map(frenchName));
    const answer = Math.floor(Math.random() * 4);
    // on précharge l'image pour qu'elle apparaisse d'un coup
    await new Promise((resolve) => { const pre = new Image(); pre.onload = pre.onerror = resolve; pre.src = art(ids[answer]); });
    return { ids, names, answer };
  }

  async function round() {
    state.locked = true;
    try {
      const q = (await state.next) ?? (await prepare()); // si la préparation d'avance a échoué, on en refait une
      state.next = prepare().catch(() => null); // la suivante se prépare pendant qu'on joue
      img.className = 'poke-img is-hidden'; // d'abord la silhouette, ensuite la nouvelle image
      img.src = art(q.ids[q.answer]);
      reveal.textContent = ' ';
      options.replaceChildren(...q.names.map((name, i) => {
        const btn = h('button', { class: 'quiz-opt', type: 'button' }, name);
        btn.addEventListener('click', () => answer(i, q, btn));
        return btn;
      }));
      state.locked = false;
    } catch (err) {
      options.replaceChildren(h('p', { class: 'empty' }, err.message));
    }
  }

  function answer(i, q, btn) {
    if (state.locked) return;
    state.locked = true;
    const correct = i === q.answer;
    state.total++;
    if (correct) {
      state.good++;
      state.streak++;
      if (state.streak > state.best) { state.best = state.streak; store.set('kiosque.pokemon.best', state.best); }
    } else {
      state.streak = 0;
    }
    stats();
    img.className = 'poke-img is-revealed';
    reveal.textContent = `C’est ${q.names[q.answer]} !`;
    const buttons = [...options.children];
    buttons.forEach((b) => { b.disabled = true; });
    buttons[q.answer].classList.add('is-correct');
    if (!correct) btn.classList.add('is-wrong');
    setTimeout(round, correct ? 1300 : 2000);
  }

  stats();
  round();
}
