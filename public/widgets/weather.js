// Météo du moment, prochaines heures et 5 jours (Open-Meteo via /api/data).
import { h, svg, dataWidget } from '../lib.js';

// Codes météo WMO → libellé, icône de jour, icône de nuit
const WMO = [
  [[0], 'Ciel dégagé', 'sun', 'moon'],
  [[1, 2], 'Éclaircies', 'cloud-sun', 'cloud-moon'],
  [[3], 'Couvert', 'cloud'],
  [[45, 48], 'Brouillard', 'cloud-fog'],
  [[51, 53, 55, 56, 57], 'Bruine', 'cloud-drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Pluie', 'cloud-rain'],
  [[71, 73, 75, 77, 85, 86], 'Neige', 'cloud-snow'],
  [[95, 96, 99], 'Orage', 'cloud-lightning'],
];
export function describeWeather(code, isDay = true) {
  const [, label, day, night] = WMO.find(([codes]) => codes.includes(code)) ?? [[], 'Variable', 'cloud'];
  return { label, icon: !isDay && night ? night : day };
}

const deg = (v) => `${Math.round(v)}°`;
const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const icon = (name, cls) => h('span', { class: `${cls} wx-${name}`, html: svg(name), 'aria-hidden': 'true' });

export function buildWeather(sec, body, actions, card) {
  dataWidget({
    sec, body, actions, card, refresh: 900, label: 'Actualiser la météo',
    render: (w) => {
      const now = describeWeather(w.current.code, w.current.isDay);
      const days = w.daily.slice(1, 1 + (sec.days || 5));
      const low = Math.min(...days.map((d) => d.min));
      const high = Math.max(...days.map((d) => d.max));
      const span = Math.max(1, high - low);

      body.replaceChildren(h('div', { class: 'weather' },
        h('div', { class: 'wx-now' },
          icon(now.icon, 'wx-icon'),
          h('div', { class: 'wx-temp' },
            h('strong', {}, deg(w.current.temp)),
            h('span', {}, now.label)),
          h('div', { class: 'wx-meta' },
            h('span', { class: 'wx-place', title: [w.place.region, w.place.country].filter(Boolean).join(', ') }, w.place.name),
            h('span', {}, `Ressenti ${deg(w.current.feels)}`),
            h('span', { html: `${svg('wind')}${Math.round(w.current.wind)} km/h` }),
            h('span', { html: `${svg('droplet')}${w.current.humidity} %` }),
            w.sunrise ? h('span', { class: 'wx-sun', html: `${svg('sun')}${fmtTime.format(new Date(w.sunrise))} – ${fmtTime.format(new Date(w.sunset))}` }) : null)),

        h('div', { class: 'wx-hours', role: 'list', 'aria-label': 'Prochaines heures' }, w.hourly.slice(0, sec.hours || 12).map((hr, i) => {
          const d = describeWeather(hr.code, hr.isDay);
          return h('div', { class: 'wx-hour', role: 'listitem', title: d.label },
            h('span', {}, i === 0 ? 'Maint.' : `${hr.time.slice(11, 13)}h`),
            icon(d.icon, 'wx-mini'),
            h('strong', {}, deg(hr.temp)),
            h('small', { class: hr.rain >= 30 ? 'is-wet' : '' }, hr.rain ? `${hr.rain}%` : ''));
        })),

        h('div', { class: 'wx-days' }, days.map((d) => {
          const desc = describeWeather(d.code);
          return h('div', { class: 'wx-day', title: desc.label },
            h('span', { class: 'wx-dayname' }, fmtDay.format(new Date(`${d.date}T12:00`))),
            icon(desc.icon, 'wx-mini'),
            h('span', { class: 'wx-min' }, deg(d.min)),
            h('span', { class: 'wx-range' }, h('span', { style: { left: `${((d.min - low) / span) * 100}%`, right: `${((high - d.max) / span) * 100}%` } })),
            h('span', { class: 'wx-max' }, deg(d.max)));
        }))));
    },
  });
}
