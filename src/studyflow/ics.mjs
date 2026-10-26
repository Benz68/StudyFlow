// Reads a calendar file (.ics, as exported by Google Calendar, Outlook or a university portal) into
// weekly timetable classes and one-time events. Plain parsing of a standard format; nothing leaves the device.
import {localDate, toClock, weekday, weekStart, addDays} from './util.mjs';

const BYDAY = {SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6};

// Lines can be folded (continued on the next line starting with a space).
const unfold = text => String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
const unescape = value => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function parseDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  if (!m[4]) return {date: `${m[1]}-${m[2]}-${m[3]}`, allDay: true};
  // UTC times are shown in the device's time zone; local/TZID times are taken as written.
  const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return {date: localDate(d), minutes: d.getHours() * 60 + d.getMinutes(), allDay: params.includes('VALUE=DATE') && !m[4]};
}

export function parseICS(text) {
  const events = [];
  let current = null;
  for (const line of unfold(text).split('\n')) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    if (name === 'SUMMARY') current.title = unescape(value);
    else if (name === 'LOCATION') current.location = unescape(value);
    else if (name === 'DTSTART') current.start = parseDate(value, params);
    else if (name === 'DTEND') current.end = parseDate(value, params);
    else if (name === 'RRULE') current.rule = Object.fromEntries(value.split(';').map(p => p.split('=')));
    else if (name === 'EXDATE') (current.skip ||= []).push(...value.split(',').map(v => parseDate(v, params)?.date).filter(Boolean));
    else if (name === 'STATUS' && value.trim() === 'CANCELLED') current.cancelled = true;
  }
  const classes = [], once = [];
  for (const e of events) {
    if (e.cancelled || !e.title || !e.start || e.start.allDay || !e.end || e.end.minutes === undefined) continue;
    // A class running past midnight ends at 23:59 that day (the planner's day ends there); one starting after 23:44 is left out.
    if (e.start.minutes > 1424) continue;
    const endMinutes = e.end.date > e.start.date ? 1439 : Math.max(e.end.minutes, e.start.minutes + 15);
    const start = toClock(e.start.minutes), end = toClock(Math.min(endMinutes, 1439));
    if (e.rule?.FREQ === 'WEEKLY') {
      const days = [...new Set(e.rule.BYDAY ? e.rule.BYDAY.split(',').map(d => BYDAY[d.slice(-2)]).filter(d => d !== undefined) : [weekday(e.start.date)])];
      // The end date as written: "until 15.1 23:59 UTC" means the 15th, even where that is already the 16th.
      const u = /^(\d{4})(\d{2})(\d{2})/.exec(e.rule.UNTIL || ''), written = u ? `${u[1]}-${u[2]}-${u[3]}` : undefined;
      const {until, off} = repeats(e.start.date, days, Number(e.rule.INTERVAL) || 1, Number(e.rule.COUNT) || 0, written);
      classes.push({title: e.title.slice(0, 120), days, start, end, location: (e.location || '').slice(0, 80),
        from: e.start.date, ...(until ? {until} : {}), skipDates: [...new Set([...(e.skip || []), ...off])]});
    } else if (!e.rule) {
      once.push({title: e.title.slice(0, 120), date: e.start.date, start, end});
    }
  }
  // The same class exported once per week becomes one weekly class.
  return {classes: mergeRepeats(classes, once), once: once.filter(o => !o.merged)};
}

// "Every two weeks" or "10 times": a weekly class whose off weeks are skipped and which ends at its last meeting.
// Every week with no end stays as it is; every other week with no end is laid out for a year.
function repeats(from, days, interval, count, until) {
  if (interval === 1 && !count) return {until, off: []};
  const start = weekStart(from), last = until || addDays(from, 365), on = new Set(), off = [];
  for (let w = 0; ; w++) {
    const sunday = addDays(start, w * 7);
    if (sunday > last || (count && on.size >= count)) break;
    for (const d of [...days].sort()) {
      const date = addDays(sunday, d);
      if (date < from || date > last || (count && on.size >= count)) continue;
      if (w % interval === 0) on.add(date); else off.push(date);
    }
  }
  const end = [...on].sort().at(-1);
  return {until: end, off: off.filter(d => d <= end)};
}

function mergeRepeats(classes, once) {
  const groups = new Map();
  for (const o of once) {
    const key = `${o.title}|${weekday(o.date)}|${o.start}|${o.end}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(o);
  }
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    group.sort((a, b) => a.date.localeCompare(b.date));
    group.forEach(o => { o.merged = true; });
    const first = group[0];
    classes.push({title: first.title, days: [weekday(first.date)], start: first.start, end: first.end, location: '', from: first.date, until: group.at(-1).date, skipDates: []});
  }
  return classes;
}

// "הרצאה - סטטיסטיקה א׳" and "תרגול סטטיסטיקה א׳" belong to the same course.
export function courseNameOf(title) {
  return title.replace(/^\s*(?:הרצאה|תרגול|תרגיל|מעבדה|סדנה|שיעור|סמינר|lecture|tutorial|lab|recitation)\s*[-:–|,]?\s*/i, '')
    .replace(/\s*[-–|(].*?(?:הרצאה|תרגול|מעבדה|\d{3,}).*$/i, '').trim() || title.trim();
}
