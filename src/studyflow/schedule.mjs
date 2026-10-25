// Places only what the person asked for, inside their free time, and never overlaps anything.
// The timetable and already planned items are obstacles; a short break is kept around each of them.
import {toMin, toClock, weekday, localDate, addDays, weekStart} from './util.mjs';
import {goalProgress} from './progress.mjs';
import {shiftSegments} from './work.mjs';

const jobName = (state, id) => state.jobs.find(j => j.id === id)?.name || 'משמרת';
// Shifts touching a date: the ones that start on it, and night shifts from the day before.
export function shiftsOn(state, date) {
  return state.shifts.filter(s => s.date === date || s.date === addDays(date, -1)).flatMap(s =>
    shiftSegments(s).filter(seg => seg.date === date).map(seg => ({shift: s, start: seg.start, end: seg.end})));
}

const WINDOWS = {morning: [0, 720], noon: [720, 1020], evening: [1020, 1440], night: [1260, 1440]};
export const windowOf = part => WINDOWS[part] || [0, 1440];

export function classesOn(state, date) {
  return state.classes.filter(c => c.days.includes(weekday(date)) && (!c.from || date >= c.from)
    && (!c.until || date <= c.until) && !c.skipDates.includes(date));
}

// Everything that already takes time on a date, as minute ranges, sorted.
export function busyOn(state, date, {ignoreId = ''} = {}) {
  const dayStart = toMin(state.prefs.dayStart), dayEnd = toMin(state.prefs.dayEnd);
  const blocks = classesOn(state, date).map(c => ({start: toMin(c.start), end: toMin(c.end), title: c.title, source: 'class', id: c.id}));
  for (const {shift, start, end} of shiftsOn(state, date)) {
    if (shift.id !== ignoreId) blocks.push({start, end, title: `משמרת ב${jobName(state, shift.jobId)}`, source: 'shift', id: shift.id});
  }
  for (const item of state.items) {
    if (item.date !== date || item.id === ignoreId) continue;
    blocks.push(item.allDay ? {start: Math.min(0, dayStart), end: Math.max(1440, dayEnd), title: item.title, source: 'item', kind: item.kind, id: item.id}
      : {start: toMin(item.start), end: toMin(item.end), title: item.title, source: 'item', kind: item.kind, id: item.id});
  }
  return blocks.sort((a, b) => a.start - b.start);
}

const nowMinutes = now => { const m = now.getHours() * 60 + now.getMinutes(); return Math.ceil(m / 5) * 5; };

// Free ranges of a day inside the person's waking hours, keeping a break before and after busy time.
export function freeRanges(state, date, {now = new Date(), extra = [], ignoreId = ''} = {}) {
  const pause = state.prefs.breakMinutes;
  let from = toMin(state.prefs.dayStart);
  const to = toMin(state.prefs.dayEnd), today = localDate(now);
  if (date < today) return [];
  if (date === today) from = Math.max(from, nowMinutes(now));
  const busy = [...busyOn(state, date, {ignoreId}), ...extra].sort((a, b) => a.start - b.start);
  const ranges = [];
  let cursor = from;
  // Next to a class only a short walk is kept, so the windows between classes stay usable.
  const gapFor = b => b.source === 'class' ? Math.min(pause, 5) : pause;
  for (const b of busy) {
    const start = b.start - gapFor(b);
    if (start > cursor) ranges.push({start: cursor, end: Math.min(start, to)});
    cursor = Math.max(cursor, b.end + gapFor(b));
    if (cursor >= to) break;
  }
  if (cursor < to) ranges.push({start: cursor, end: to});
  return ranges.filter(r => r.end - r.start >= 5);
}

// Earliest slot of the requested length, preferring a part of the day when one was asked for.
export function placeFlexible(state, date, minutes, {part = '', now = new Date(), extra = []} = {}) {
  const ranges = freeRanges(state, date, {now, extra});
  const [lo, hi] = windowOf(part);
  const fit = (r, a, b) => { const start = Math.max(r.start, a); return start + minutes <= Math.min(r.end, b) ? start : null; };
  for (const [a, b] of part ? [[lo, hi], [0, 1440]] : [[0, 1440]]) {
    for (const r of ranges) { const start = fit(r, a, b); if (start !== null) return {date, start: toClock(start), end: toClock(start + minutes), outsidePart: a !== lo || b !== hi}; }
  }
  return null;
}

// What a fixed time would collide with (timetable, planned items, or other new items).
export function conflictsFor(state, item, {extra = []} = {}) {
  if (item.allDay) return [...busyOn(state, item.date, {ignoreId: item.id}), ...extra].filter(b => b.source !== 'allDay');
  const a = toMin(item.start), b = toMin(item.end);
  return [...busyOn(state, item.date, {ignoreId: item.id}), ...extra].filter(x => a < x.end && b > x.start);
}

// Free starting times on the same day, closest to the time that was asked for.
export function alternatives(state, date, minutes, around, {now = new Date(), extra = [], ignoreId = '', limit = 3} = {}) {
  const wanted = toMin(around) ?? toMin(state.prefs.dayStart), options = [];
  for (const r of freeRanges(state, date, {now, extra, ignoreId})) {
    for (let s = Math.ceil(r.start / 15) * 15; s + minutes <= r.end; s += 15) options.push(s);
  }
  // Closest to the wanted time first, but spread out so the choices are really different.
  const chosen = [];
  for (const s of options.sort((x, y) => Math.abs(x - wanted) - Math.abs(y - wanted) || x - y)) {
    if (chosen.length < limit && chosen.every(p => Math.abs(p - s) >= 45)) chosen.push(s);
  }
  return chosen.sort((x, y) => x - y).map(s => ({date, start: toClock(s), end: toClock(s + minutes)}));
}

// "Find me time": a couple of good slots on each of the next days.
export function findTime(state, minutes, {from = localDate(), days = 7, perDay = 2, now = new Date()} = {}) {
  const slots = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const ranges = freeRanges(state, date, {now}).filter(r => r.end - r.start >= minutes);
    for (const r of ranges.slice(0, perDay)) slots.push({date, start: toClock(r.start), end: toClock(r.start + minutes)});
  }
  return slots;
}

// What a shift can't go on top of: lectures in the timetable, another shift, a fixed event.
// Personal study, goals and tasks give way to work.
export function shiftClashes(state, shift, {ignoreId = ''} = {}) {
  return shiftSegments(shift).flatMap(seg => busyOn(state, seg.date, {ignoreId})
    .filter(b => (b.source !== 'item' || b.kind === 'event') && seg.start < b.end && seg.end > b.start));
}

// What is left of a weekly goal this week: one session a day, on days with nothing of it yet, spread out.
export function planRest(state, goal, {today = localDate(), now = new Date()} = {}) {
  const end = addDays(weekStart(today), 6), p = goalProgress(goal, today);
  const planned = state.items.filter(i => i.goalId === goal.id && !i.done && i.date >= today && i.date <= end);
  const rest = Math.max(0, Math.ceil(goal.target - p.done) - planned.length);
  const taken = new Set([...planned.map(i => i.date), ...p.entries.map(l => l.date)]);
  const open = [];
  for (let date = today; date <= end; date = addDays(date, 1)) {
    const slot = !taken.has(date) && placeFlexible(state, date, goal.sessionMinutes, {now});
    if (slot) open.push({date, start: slot.start, end: slot.end});
  }
  const slots = rest >= open.length ? open : Array.from({length: rest}, (_, i) => open[Math.round(i * (open.length - 1) / Math.max(1, rest - 1))]);
  // All the free days are offered; the spread-out suggestion is just what starts selected.
  return {slots: rest ? slots : [], options: rest ? open : [], rest, planned: planned.length};
}
export function plannedMinutes(state, date) {
  return busyOn(state, date).reduce((n, b) => n + Math.max(0, Math.min(b.end, 1440) - Math.max(b.start, 0)), 0);
}

// One list for a day: timetable classes and planned items, with free gaps between them.
export function dayAgenda(state, date, {now = new Date()} = {}) {
  const entries = [
    ...classesOn(state, date).map(c => ({type: 'class', id: c.id, title: c.title, start: c.start, end: c.end, location: c.location, courseId: c.courseId})),
    ...shiftsOn(state, date).map(({shift, start, end}) => ({type: 'shift', id: shift.id, jobId: shift.jobId, title: jobName(state, shift.jobId),
      start: toClock(start), end: end >= 1440 ? '24:00' : toClock(end), continued: shift.date !== date, overnight: end >= 1440, ...(shift.note ? {note: shift.note} : {})})),
    ...state.items.filter(i => i.date === date).map(i => ({type: 'item', ...i})),
  ].sort((a, b) => (a.allDay ? -1 : b.allDay ? 1 : a.start.localeCompare(b.start)));
  // Things the person chose to overlap (a Zoom lecture during a shift) say what they overlap with.
  const range = e => [toMin(e.start), e.end === '24:00' ? 1440 : toMin(e.end)];
  for (const e of entries) {
    if (e.allDay) continue;
    const [a, b] = range(e);
    const others = entries.filter(x => x !== e && !x.allDay && a < range(x)[1] && b > range(x)[0]).map(x => x.title);
    if (others.length) e.overlaps = others;
  }
  const gaps = freeRanges(state, date, {now}).filter(r => r.end - r.start >= 30).map(r => ({type: 'free', date, start: toClock(r.start), end: toClock(r.end), minutes: r.end - r.start}));
  return {entries, gaps};
}
