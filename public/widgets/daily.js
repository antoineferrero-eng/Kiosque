// Contenus du jour : éphéméride Wikipédia, état des services web, répliques et blagues.
import { h, svg, dataWidget } from '../lib.js';

// ---------------------------------------------------------------- éphéméride

const fmtLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

export function buildEphemeris(sec, body, actions, card) {
  dataWidget({
    sec, body, actions, card, refresh: 3 * 3600, label: 'Actualiser',
    render: (data) => {
      body.replaceChildren(h('div', { class: 'ephemeris' },
        data.image?.url && sec.showImage !== false ? h('a', { class: 'eph-image', href: data.image.link ?? '#', target: '_blank', rel: 'noopener noreferrer' },
          h('img', { src: data.image.url, alt: data.image.title, loading: 'lazy' }),
          h('span', { class: 'eph-caption' }, h('strong', {}, 'Image du jour'), h('span', {}, data.image.title), data.image.artist ? h('small', {}, `Photo : ${data.image.artist}`) : null)) : null,
        h('div', { class: 'eph-events' },
          h('p', { class: 'eyebrow' }, `Un ${fmtLong.format(new Date(`${data.date}T12:00`))}…`),
          data.events.map((e) => h(e.link ? 'a' : 'div', { class: 'eph-event', href: e.link, target: '_blank', rel: 'noopener noreferrer' },
            h('span', { class: 'eph-year' }, e.year < 0 ? `${-e.year} av. J.-C.` : String(e.year)),
            h('span', { class: 'eph-text' }, e.text))))));
    },
  });
}

// ---------------------------------------------------------------- état des services web

const INDICATOR = {
  none: ['Opérationnel', 'up'],
  minor: ['Perturbations', 'warn'],
  major: ['Panne partielle', 'down'],
  critical: ['Panne majeure', 'down'],
  maintenance: ['Maintenance', 'warn'],
  unknown: ['Statut inconnu', 'unknown'],
};

export function buildWebStatus(sec, body, actions, card) {
  const badge = card.querySelector('.badge');
  dataWidget({
    sec, body, actions, card, refresh: 180, label: 'Revérifier',
    render: (services) => {
      const ok = services.filter((s) => s.indicator === 'none').length;
      badge.hidden = false;
      badge.textContent = `${ok}/${services.length}`;
      badge.dataset.state = ok === services.length ? 'up' : 'down';
      // résumé d'une ligne, affiché à la place de la liste dans le format mini
      const problems = services.filter((s) => s.indicator !== 'none');
      const summary = h('div', { class: `ws-summary is-${problems.length ? 'down' : 'up'}` },
        h('span', { class: 'ws-dot' }),
        h('strong', {}, problems.length ? `${problems.length} service${problems.length > 1 ? 's' : ''} en difficulté` : 'Tout fonctionne'),
        problems.length ? h('small', {}, problems.map((s) => s.name).join(', ')) : h('small', {}, `${services.length} services vérifiés`));
      body.replaceChildren(summary, h('div', { class: 'webstatus' }, services.map((s) => {
        const [label, tone] = INDICATOR[s.indicator] ?? INDICATOR.unknown;
        return h('a', { class: `ws-row is-${tone}`, href: s.url, target: '_blank', rel: 'noopener noreferrer', title: s.description },
          h('span', { class: 'ws-dot' }),
          h('strong', {}, s.name),
          h('span', { class: 'ws-label' }, label));
      })));
    },
  });
}

// ---------------------------------------------------------------- pour rire

export function buildFun(sec, body, actions, card) {
  dataWidget({
    sec, body, actions, card, refresh: 0, label: 'Une autre',
    render: (item) => {
      if (item.kind === 'quote') {
        body.replaceChildren(h('figure', { class: 'fun' },
          h('span', { class: 'fun-mark', html: svg('quote') }),
          h('blockquote', {}, item.text),
          h('figcaption', {}, h('strong', {}, item.author || 'Kaamelott'), item.meta ? h('small', {}, `Kaamelott · ${item.meta}`) : h('small', {}, 'Kaamelott'))));
        return;
      }
      const punch = h('p', { class: 'fun-punch', hidden: true }, item.punchline);
      const reveal = h('button', { class: 'btn', type: 'button' }, 'Voir la chute');
      reveal.addEventListener('click', () => { punch.hidden = false; reveal.remove(); });
      body.replaceChildren(h('figure', { class: 'fun is-joke' },
        h('span', { class: 'fun-mark', html: svg('smile') }),
        h('p', { class: 'fun-setup' }, item.setup),
        item.punchline ? punch : null,
        item.punchline ? reveal : null));
    },
  });
}
