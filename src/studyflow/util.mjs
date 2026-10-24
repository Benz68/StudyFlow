// Small shared helpers: escaping, icons, dates and clock times. Dates are local "YYYY-MM-DD" strings,
// always handled at noon so daylight-saving changes never shift a day.

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

const icons = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18M11 12.5v2h2v-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  arrow: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  back: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3.5 0h7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.6c-.6.3-1 .8-1 1.5v.4M12 16.8v.2"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4m0 3v.2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/>',
  file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9 13h6m-6 4h6"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>',
  cloud: '<path d="M7 18h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.3A4.7 4.7 0 0 0 7 18Z"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sun}</svg>`;

export const duration = minutes => {
  const m = Math.max(0, Math.round(minutes)), hours = Math.floor(m / 60), rest = m % 60;
  if (!hours) return `${m} דקות`;
  const whole = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`;
  return rest === 30 ? `${whole} וחצי` : rest ? `${whole} ו־${rest} דקות` : whole;
};

export const uid = () => (globalThis.crypto?.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const pad = n => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const noon = date => new Date(`${date}T12:00:00`);
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(noon(value)) === value;
export const addDays = (date, n) => { const d = noon(date); d.setDate(d.getDate() + n); return localDate(d); };
export const weekday = date => noon(date).getDay();
export const weekStart = date => addDays(date, -weekday(date));
export const daysBetween = (from, to) => Math.round((noon(to) - noon(from)) / 86400000);

export const toMin = clock => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const toClock = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// A list of times in 15-minute steps, always shown as 24-hour clock (a native time field can show
// 12-hour time with the AM/PM part cut off, depending on the computer's settings).
export function timeSelect(attrs, value, {from = 0, to = 24 * 60 - 15} = {}) {
  const times = [];
  for (let m = from; m <= to; m += 15) times.push(toClock(m));
  if (toMin(value) !== null && !times.includes(value)) times.push(value);
  times.sort();
  return `<select ${attrs}>${times.map(t => `<option value="${t}" ${t === value ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
}

// Colors for things the person names (a workplace, a course, a goal): ink-like, readable on paper.
export const PALETTE = ['#5b4ea8', '#2a8a7e', '#c4612a', '#b03a6b', '#3a6da3', '#7a8a22', '#9a6b2e', '#6b4f8f'];
export const soft = color => `${color}24`;
export const colorFor = (item, index) => PALETTE.includes(item?.color) ? item.color : PALETTE[index % PALETTE.length];

export const DAY_NAMES =['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const dateLabel = date => noon(date).toLocaleDateString('he-IL', {day: 'numeric', month: 'long'});
export const dayLabel = (date, today = localDate()) => date === today ? 'היום' : date === addDays(today, 1) ? 'מחר' : `יום ${DAY_NAMES[weekday(date)]}`;
export const fullDayLabel = (date, today = localDate()) => `${dayLabel(date, today)}, ${dateLabel(date)}`;

export const greeting = (hour = new Date().getHours()) => hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';
