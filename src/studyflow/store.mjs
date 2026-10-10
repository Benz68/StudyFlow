import { normalizeWeekly } from './weekly.mjs';
import { localDate, normalizePreferences, normalizeCompletionLog, timeMinutes, validDate } from './planner.mjs';

export const STORAGE_KEY = 'studyflow.fresh.v1';
const text = (value, limit = 120) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function createState() {
  return { tasks: [], events: [], preferences: normalizePreferences(), sessions: [], unscheduled: [], ...normalizeWeekly() };
}

export function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid saved state');
  const state = createState();
  const ids = new Set();
  state.tasks = (Array.isArray(value.tasks) ? value.tasks : []).slice(0, 1000).flatMap(task => {
    if (!task || !text(task.id) || ids.has(text(task.id)) || !text(task.title)
      || !Number.isFinite(task.minutes) || task.minutes <= 0 || task.minutes > 60000 || !validDate(task.deadline)) return [];
    ids.add(text(task.id));
    const minutes = Math.max(1, Math.round(task.minutes));
    const result = { id: text(task.id), title: text(task.title), minutes, deadline: task.deadline,
      priority: ['high', 'normal', 'low'].includes(task.priority) ? task.priority : 'normal',
      category: ['study', 'personal', 'work'].includes(task.category) ? task.category : 'study',
      done: task.done === true, completedMinutes: Number.isFinite(task.completedMinutes)
        ? Math.min(minutes, Math.max(0, Math.round(task.completedMinutes))) : 0 };
    if (typeof task.notBefore === 'string' && !Number.isNaN(Date.parse(task.notBefore))) result.notBefore = new Date(task.notBefore).toISOString();
    if (Array.isArray(task.completionLog)) result.completionLog = normalizeCompletionLog(task.completionLog);
    if (['inherit', 'any', 'morning', 'afternoon', 'evening'].includes(task.preferredTime)) result.preferredTime = task.preferredTime;
    return [result];
  });
  ids.clear();
  state.events = (Array.isArray(value.events) ? value.events : []).slice(0, 2000).flatMap(event => {
    if (!event || !text(event.id) || ids.has(text(event.id)) || !text(event.title) || !validDate(event.date)) return [];
    const start = timeMinutes(event.start);
    const end = timeMinutes(event.end);
    if (start === null || end === null || start === end || (start > end && event.overnight !== true)) return [];
    ids.add(text(event.id));
    const result = { id: text(event.id), title: text(event.title), date: event.date, start: event.start, end: event.end };
    if (event.overnight === true) result.overnight = true;
    for (const key of ['travelBefore', 'travelAfter']) if (Number.isFinite(event[key])) result[key] = Math.min(180, Math.max(0, Math.round(event[key])));
    if (event.repeat === 'weekly') {
      if (event.repeatUntil !== undefined && (!validDate(event.repeatUntil) || event.repeatUntil < event.date)) return [];
      result.repeat = 'weekly';
      if (event.repeatUntil) result.repeatUntil = event.repeatUntil;
      if (Array.isArray(event.weekdays)) {
        const days = [...new Set(event.weekdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))];
        if (days.length) result.weekdays = days;
      }
    }
    if (Array.isArray(event.excludedDates)) result.excludedDates = [...new Set(event.excludedDates.filter(validDate))].slice(0, 2000);
    return [result];
  });
  state.preferences = normalizePreferences(value.preferences);
  Object.assign(state, normalizeWeekly(value));
  // Plans are derived afresh from validated inputs so old times cannot linger.
  return state;
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function loadState(storage = browserStorage()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? validateState(JSON.parse(raw)) : createState();
  } catch { return createState(); }
}

export function saveState(state, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(validateState(state)));
    return true;
  } catch { return false; }
}

export function demoState(now = new Date()) {
  const state = createState();
  const after = days => { const date = new Date(now); date.setDate(date.getDate() + days); return localDate(date); };
  state.tasks = [
    { id: 'demo-math', title: 'תרגול לקראת המבחן בסטטיסטיקה', minutes: 150, deadline: after(3), priority: 'high', category: 'study', done: false, completedMinutes: 0 },
    { id: 'demo-reading', title: 'קריאת מאמר לקורס', minutes: 60, deadline: after(2), priority: 'normal', category: 'study', done: false, completedMinutes: 0 },
    { id: 'demo-walk', title: 'זמן להליכה בחוץ', minutes: 30, deadline: after(1), priority: 'low', category: 'personal', done: false, completedMinutes: 0 },
  ];
  state.events = [{ id: 'demo-lecture', title: 'הרצאה באוניברסיטה', date: after(1), start: '10:00', end: '12:00' }];
  return state;
}

