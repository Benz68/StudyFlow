// Everything is saved in this browser only. Saved data is validated on every load, older versions are
// migrated, and nothing is thrown away silently: unreadable data and the pre-migration copy are kept aside.
import {validDate, toMin, localDate, addDays, uid, colorFor} from './util.mjs';

export const VERSION = 2;
export const STORAGE_KEY = 'studyflow.v2';
export const OLD_KEY = 'studyflow.fresh.v1';
export const BACKUP_KEY = 'studyflow.v1.backup';
export const UNREADABLE_KEY = 'studyflow.v2.unreadable';

const text = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
// At a limit the newest are kept: new things are added at the end, and must never be the ones dropped.
const list = (value, max) => (Array.isArray(value) ? value : []).slice(-max);
const pick = (value, options, fallback) => options.includes(value) ? value : fallback;
const number = (value, fallback, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const days = value => [...new Set(list(value, 7).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
const clock = (value, fallback) => toMin(value) === null ? fallback : value;
const unique = items => { const seen = new Set(); return items.filter(x => !seen.has(x.id) && seen.add(x.id)); };

export const defaultPrefs = Object.freeze({dayStart: '08:00', dayEnd: '22:00', breakMinutes: 10});

export function createState() {
  return {version: VERSION, classes: [], items: [], courses: [], goals: [], jobs: [], shifts: [], prefs: {...defaultPrefs},
    profile: {name: '', areas: [], onboarded: false, tips: [], terms: '', moneyGoal: 0, moneyFor: '', activeDays: []}};
}

function prefs(p = {}) {
  const dayStart = clock(p.dayStart, defaultPrefs.dayStart);
  let dayEnd = clock(p.dayEnd, defaultPrefs.dayEnd);
  if (toMin(dayEnd) <= toMin(dayStart)) dayEnd = defaultPrefs.dayEnd;
  return {dayStart, dayEnd, breakMinutes: number(p.breakMinutes, 10, 0, 60)};
}

export function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid saved state');
  const state = createState();
  state.courses = unique(list(value.courses, 100).filter(c => c && text(c.id) && text(c.name)).map(c => ({
    id: text(c.id), name: text(c.name), ...(validDate(c.examDate) ? {examDate: c.examDate} : {}),
    topics: unique(list(c.topics, 300).filter(t => t && text(t.id) && text(t.title, 160)).map(t => ({id: text(t.id), title: text(t.title, 160), status: pick(t.status, ['new', 'learning', 'done'], 'new')}))),
    deadlines: unique(list(c.deadlines, 100).filter(d => d && text(d.id) && text(d.title) && validDate(d.date)).map(d => ({id: text(d.id), title: text(d.title), date: d.date, done: d.done === true}))),
    studyLog: list(c.studyLog, 2000).filter(l => l && validDate(l.date) && Number.isFinite(l.minutes) && l.minutes > 0).map(l => ({date: l.date, minutes: Math.round(Math.min(l.minutes, 1440))})),
  })));
  const courseIds = new Set(state.courses.map(c => c.id));
  state.goals = unique(list(value.goals, 100).filter(g => g && text(g.id) && text(g.title)).map(g => ({
    id: text(g.id), title: text(g.title), type: pick(g.type, ['sport', 'hobby'], 'hobby'),
    unit: pick(g.unit, ['times', 'pages', 'minutes', 'km'], 'times'), noun: text(g.noun, 30),
    target: number(g.target, 3, 1, 100000), period: pick(g.period, ['week', 'total'], 'week'),
    sessionMinutes: Math.round(number(g.sessionMinutes, 60, 5, 600)),
    log: unique(list(g.log, 5000).filter(l => l && text(l.id) && validDate(l.date) && Number.isFinite(l.amount) && l.amount > 0).map(l => ({id: text(l.id), date: l.date, amount: Math.min(l.amount, 100000), ...(text(l.itemId) ? {itemId: text(l.itemId)} : {})}))),
  })));
  const goalIds = new Set(state.goals.map(g => g.id));
  state.classes = unique(list(value.classes, 300).filter(c => c && text(c.id) && text(c.title) && days(c.days).length
    && toMin(c.start) !== null && toMin(c.end) > toMin(c.start)).map(c => ({
    id: text(c.id), title: text(c.title), days: days(c.days), start: c.start, end: c.end, location: text(c.location, 80),
    ...(courseIds.has(c.courseId) ? {courseId: c.courseId} : {}),
    ...(validDate(c.from) ? {from: c.from} : {}), ...(validDate(c.until) ? {until: c.until} : {}),
    skipDates: [...new Set(list(c.skipDates, 400).filter(validDate))],
  })));
  state.items = unique(list(value.items, 5000).filter(i => i && text(i.id) && text(i.title) && validDate(i.date)
    && (i.allDay === true || (toMin(i.start) !== null && toMin(i.end) > toMin(i.start)))).map(i => ({
    id: text(i.id), title: text(i.title), date: i.date,
    ...(i.allDay === true ? {allDay: true} : {start: i.start, end: i.end}),
    kind: pick(i.kind, ['study', 'task', 'goal', 'event', 'other'], 'other'), fixed: i.fixed === true, done: i.done === true,
    ...(courseIds.has(i.courseId) ? {courseId: i.courseId} : {}), ...(goalIds.has(i.goalId) ? {goalId: i.goalId} : {}),
    ...(text(i.note, 200) ? {note: text(i.note, 200)} : {}),
  })));
  // Each workplace keeps its own color; older saves get one by their place in the list.
  state.jobs = unique(list(value.jobs, 30).filter(j => j && text(j.id) && text(j.name))).map((j, i) => ({
    id: text(j.id), name: text(j.name, 60), wage: Math.round(number(j.wage, 0, 0, 2000) * 100) / 100, overtime: j.overtime !== false, color: colorFor(j, i)}));
  const jobIds = new Set(state.jobs.map(j => j.id));
  // A shift may end after midnight (end earlier than start), but never last zero minutes.
  state.shifts = unique(list(value.shifts, 3000).filter(s => s && text(s.id) && jobIds.has(s.jobId) && validDate(s.date)
    && toMin(s.start) !== null && toMin(s.end) !== null && s.start !== s.end).map(s => ({
    id: text(s.id), jobId: s.jobId, date: s.date, start: s.start, end: s.end,
    breakMinutes: Math.round(number(s.breakMinutes, 0, 0, 240)), tips: Math.round(number(s.tips, 0, 0, 100000)),
    ...(text(s.note, 200) ? {note: text(s.note, 200)} : {})})));
  state.prefs = prefs(value.prefs);
  // Who this is and what they set up first. A planner saved before profiles existed already has its things,
  // so it counts as set up and skips the first-time questions.
  const p = value.profile && typeof value.profile === 'object' ? value.profile : null;
  const hadThings = ['classes', 'items', 'courses', 'goals', 'jobs', 'shifts'].some(k => Array.isArray(value[k]) && value[k].length);
  state.profile = {name: text(p?.name, 40), areas: [...new Set(list(p?.areas, 3).filter(a => ['studies', 'work', 'goals'].includes(a)))],
    onboarded: p ? p.onboarded === true : hadThings, tips: [...new Set(list(p?.tips, 20).filter(t => typeof t === 'string' && t.length <= 20))],
    terms: validDate(p?.terms) ? p.terms : '',
    // A monthly money goal ("3,000 ₪ for the trip"), and the days something was updated, for the streak.
    moneyGoal: Math.round(number(p?.moneyGoal, 0, 0, 1000000)), moneyFor: text(p?.moneyFor, 40),
    activeDays: [...new Set(list(p?.activeDays, 1000).filter(validDate))].sort().slice(-400)};
  return state;
}

// Two copies that both changed (a phone offline on the bus, the laptop at home): nothing either side added is lost.
// Records are joined by id; where both have the same record, this device's version is kept, and what each side
// logged inside it (goal sessions, topics, deadlines, cancelled dates) is joined too. Something deleted on only
// one side comes back: better than losing something added.
export function mergeStates(mine, theirs) {
  const a = validateState(mine), b = validateState(theirs);
  const join = (x = [], y = []) => { const ids = new Set(x.map(i => i.id)); return [...x, ...y.filter(i => !ids.has(i.id))]; };
  const same = (list, id) => list.find(i => i.id === id);
  const out = {...a};
  for (const k of ['classes', 'items', 'courses', 'goals', 'jobs', 'shifts']) out[k] = join(a[k], b[k]);
  out.goals = out.goals.map(g => { const t = same(b.goals, g.id); return t ? {...g, log: join(g.log, t.log)} : g; });
  out.classes = out.classes.map(c => { const t = same(b.classes, c.id); return t ? {...c, skipDates: [...new Set([...c.skipDates, ...t.skipDates])]} : c; });
  out.courses = out.courses.map(c => { const t = same(b.courses, c.id); return t ? {...c, topics: join(c.topics, t.topics), deadlines: join(c.deadlines, t.deadlines)} : c; });
  out.profile = {...a.profile, onboarded: a.profile.onboarded || b.profile.onboarded,
    tips: [...new Set([...a.profile.tips, ...b.profile.tips])], activeDays: [...new Set([...a.profile.activeDays, ...b.profile.activeDays])].sort()};
  return validateState(out);
}

// Version 1 planned weeks automatically. Courses, fixed commitments and personal goals carry over;
// automatically planned sessions and dated tasks have no place in the new model and stay in the backup.
export function migrateV1(old, today = localDate()) {
  const state = createState();
  state.courses = list(old.courses, 100).map(c => ({...c, deadlines: [], studyLog: [],
    topics: list(c.topics, 300).map(t => ({...t, status: t.status === 'ready' ? 'done' : t.status}))}));
  for (const e of list(old.events, 2000)) {
    if (!e || !validDate(e.date) || toMin(e.start) === null || toMin(e.end) === null) continue;
    if (e.repeat === 'weekly') {
      if (toMin(e.end) <= toMin(e.start)) continue;
      state.classes.push({id: e.id || uid(), title: e.title, days: e.weekdays?.length ? e.weekdays : [new Date(`${e.date}T12:00:00`).getDay()],
        start: e.start, end: e.end, from: e.date, ...(e.repeatUntil ? {until: e.repeatUntil} : {}), skipDates: e.excludedDates || []});
    } else if (e.date >= addDays(today, -30) && toMin(e.end) > toMin(e.start)) {
      state.items.push({id: e.id || uid(), title: e.title, date: e.date, start: e.start, end: e.end, kind: 'event', fixed: true});
    }
  }
  state.goals = list(old.goals, 100).filter(g => g && !g.courseId && g.category !== 'study').map(g => ({
    id: g.id, title: g.title, type: 'hobby', unit: 'minutes', target: g.minutes || 60, period: 'week', sessionMinutes: g.sessionMinutes || 60, log: []}));
  return validateState(state);
}

const browserStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };

// Returns the state plus a notice when something needs the person's attention.
export function loadState(storage = browserStorage()) {
  let raw = null;
  try { raw = storage?.getItem(STORAGE_KEY); } catch { return {state: createState(), notice: 'storage'}; }
  if (raw) {
    try { return {state: validateState(JSON.parse(raw)), notice: ''}; }
    catch {
      // Keep the unreadable copy so the next save cannot destroy it.
      try { storage.setItem(UNREADABLE_KEY, raw); storage.removeItem(STORAGE_KEY); } catch { /* keep going */ }
      return {state: createState(), notice: 'unreadable'};
    }
  }
  try {
    const old = storage?.getItem(OLD_KEY);
    if (old) {
      storage.setItem(BACKUP_KEY, old);
      const state = migrateV1(JSON.parse(old));
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      storage.removeItem(OLD_KEY);
      return {state, notice: 'migrated'};
    }
  } catch { /* fall through to a fresh start; the backup copy, if written, stays */ }
  return {state: createState(), notice: ''};
}

export function saveState(state, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(validateState(state)));
    return true;
  } catch { return false; }
}

// Sample data around the current day, never saved.
export function demoState(now = new Date()) {
  const today = localDate(now), at = n => addDays(today, n);
  const stats = uid(), micro = uid(), gym = uid(), guitar = uid(), cafe = uid();
  return validateState({
    courses: [
      {id: stats, name: 'סטטיסטיקה', examDate: at(18), topics: ['מבוא והסתברות', 'משתנים מקריים', 'התפלגות נורמלית', 'אמידה', 'בדיקת השערות', 'רגרסיה לינארית']
        .map((title, i) => ({id: uid(), title, status: i < 3 ? 'done' : i === 3 ? 'learning' : 'new'})), deadlines: [{id: uid(), title: 'תרגיל בית 4', date: at(4)}]},
      {id: micro, name: 'מבוא למיקרו', topics: ['ביקוש והיצע', 'גמישויות', 'תורת הצרכן', 'תורת היצרן'].map((title, i) => ({id: uid(), title, status: i < 1 ? 'done' : 'new'}))},
    ],
    classes: [
      {id: uid(), title: 'סטטיסטיקה', courseId: stats, days: [0, 2], start: '10:00', end: '12:00', location: 'בניין 72'},
      {id: uid(), title: 'מבוא למיקרו', courseId: micro, days: [1, 3], start: '14:00', end: '16:00'},
    ],
    goals: [
      {id: gym, title: 'חדר כושר', type: 'sport', unit: 'times', noun: 'אימונים', target: 3, period: 'week', sessionMinutes: 60, log: [{id: uid(), date: today, amount: 1}]},
      {id: guitar, title: 'גיטרה', type: 'hobby', unit: 'times', noun: 'תרגולים', target: 3, period: 'week', sessionMinutes: 30, log: []},
    ],
    items: [{id: uid(), title: 'ארוחת ערב עם המשפחה', date: today, start: '19:30', end: '21:00', kind: 'event', fixed: true}],
    jobs: [{id: cafe, name: 'קפה רחביה', wage: 38}],
    // Evening shifts, after every class in the sample timetable, and never on the sample dinner.
    shifts: [at(-6), at(-4), at(-1), at(2), at(5)].map((date, i) => ({id: uid(), jobId: cafe, date, start: '17:00', end: i === 3 ? '23:30' : '22:00', tips: i % 2 ? 120 : 60})),
  });
}
