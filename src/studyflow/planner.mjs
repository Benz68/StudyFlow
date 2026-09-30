const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const defaultPreferences = Object.freeze({
  startHour: 9, endHour: 21, sessionMinutes: 50, breakMinutes: 10,
  maxDailyMinutes: 240, excludedDays: [], preferredDays: [], preferredTime: 'any',
  scheduleStyle: 'early', allowOutsidePreferred: true,
});

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validDate(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

export function weekDates(now = new Date()) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return localDate(date);
  });
}

export function timeMinutes(value) {
  const match = typeof value === 'string' && CLOCK.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function expandEvents(events, now = new Date()) {
  const dates = weekDates(now);
  return (Array.isArray(events) ? events : []).flatMap(event => {
    if (!event || !validDate(event.date)) return [];
    const start = timeMinutes(event.start);
    const end = timeMinutes(event.end);
    if (start === null || end === null || start >= end) return [];
    if (event.repeat !== 'weekly') return dates.filter(date => occursOn(event, date)).map(date => ({ ...event, date }));
    return dates.filter(date => occursOn(event, date))
      .map(date => ({ ...event, date }));
  }).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

const weekdays = value => Array.isArray(value)
  ? [...new Set(value.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))] : [];
const preferredTimes = ['any', 'morning', 'afternoon', 'evening'];

function occursOn(event, date) {
  if (event.excludedDates?.includes(date)) return false;
  if (event.repeat !== 'weekly') return date === event.date;
  if (date < event.date || (event.repeatUntil && (!validDate(event.repeatUntil) || date > event.repeatUntil))) return false;
  const days = weekdays(event.weekdays);
  return (days.length ? days : [new Date(`${event.date}T12:00:00`).getDay()])
    .includes(new Date(`${date}T12:00:00`).getDay());
}

export function eventsOverlap(a, b) {
  if (!a || !b || !validDate(a.date) || !validDate(b.date)) return false;
  const times = [a.start, a.end, b.start, b.end].map(timeMinutes);
  if (times.some(time => time === null) || times[0] >= times[1] || times[2] >= times[3]
    || times[0] >= times[3] || times[2] >= times[1]) return false;
  const start = a.date > b.date ? a.date : b.date;
  const ends = [a, b].map(event => event.repeat === 'weekly' ? event.repeatUntil || '9999-12-31' : event.date);
  if (ends.some(end => !validDate(end) || end < start)) return false;
  // Every seven days the weekday pattern repeats. Each exception can suppress
  // at most one matching date, so this bound proves overlap even far in the future.
  const limit = 7 * (1 + (a.excludedDates?.length || 0) + (b.excludedDates?.length || 0));
  const cursor = new Date(`${start}T12:00:00`);
  for (let offset = 0; offset < limit; offset++) {
    const date = localDate(cursor);
    if (ends.some(end => date > end)) return false;
    if (occursOn(a, date) && occursOn(b, date)) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const finite = (value, fallback, min, max) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : fallback)));

export function normalizePreferences(value = {}) {
  const p = value && typeof value === 'object' ? value : {};
  const startHour = finite(p.startHour, 9, 0, 22);
  return {
    startHour, endHour: finite(p.endHour, 21, startHour + 1, 23),
    sessionMinutes: finite(p.sessionMinutes, 50, 15, 180),
    breakMinutes: finite(p.breakMinutes, 10, 0, 60),
    maxDailyMinutes: finite(p.maxDailyMinutes, 240, 15, 720),
    excludedDays: weekdays(p.excludedDays), preferredDays: weekdays(p.preferredDays),
    preferredTime: preferredTimes.includes(p.preferredTime) ? p.preferredTime : 'any',
    scheduleStyle: p.scheduleStyle === 'balanced' ? 'balanced' : 'early',
    allowOutsidePreferred: p.allowOutsidePreferred !== false,
  };
}

export function normalizeCompletionLog(value) {
  return (Array.isArray(value) ? value : []).slice(0, 2000).flatMap(entry => {
    if (!entry || !validDate(entry.date) || !Number.isFinite(entry.minutes)
      || entry.minutes <= 0 || entry.minutes > 60000) return [];
    return [{ date: entry.date, minutes: Math.max(1, Math.round(entry.minutes)) }];
  });
}

export function buildPlan({ tasks = [], events = [], preferences = {} } = {}, now = new Date()) {
  const p = normalizePreferences(preferences);
  const dates = weekDates(now);
  const today = localDate(now);
  const sessions = [];
  const unscheduled = [];
  const daily = new Map(dates.map(date => [date, { minutes: 0, busy: [] }]));
  // Completed sessions still consume their day's capacity, including finished tasks.
  for (const task of Array.isArray(tasks) ? tasks : []) {
    for (const entry of normalizeCompletionLog(task?.completionLog)) {
      if (daily.has(entry.date)) daily.get(entry.date).minutes += entry.minutes;
    }
  }
  for (const event of expandEvents(events, now)) {
    const start = timeMinutes(event.start);
    const end = timeMinutes(event.end);
    if (start !== null && end !== null && start < end) daily.get(event.date).busy.push({ start, end });
  }
  const priority = { high: 0, normal: 1, low: 2 };
  const pending = (Array.isArray(tasks) ? tasks : []).filter(task => task && !task.done
    && typeof task.id === 'string' && typeof task.title === 'string'
    && Number.isFinite(task.minutes) && task.minutes > 0 && validDate(task.deadline))
    .slice().sort((a, b) => a.deadline.localeCompare(b.deadline)
      || (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1) || a.id.localeCompare(b.id));

  for (const task of pending) {
    const completed = Number.isFinite(task.completedMinutes) ? Math.max(0, Math.round(task.completedMinutes)) : 0;
    let remaining = Math.max(0, Math.round(task.minutes) - completed);
    const notBefore = task.notBefore ? new Date(task.notBefore) : null;
    if (notBefore && Number.isNaN(notBefore.getTime())) {
      unscheduled.push({ taskId: task.id, title: task.title, minutes: remaining, reason: 'זמן ההתחלה אינו תקין. יש לעדכן את המשימה.' });
      continue;
    }
    const preferredTime = preferredTimes.includes(task.preferredTime) ? task.preferredTime : p.preferredTime;
    const timeWindow = { any: [0, 1440], morning: [0, 720], afternoon: [720, 1020], evening: [1020, 1440] }[preferredTime];
    const hasPreference = preferredTime !== 'any' || p.preferredDays.length > 0;
    const candidate = (date, preferredOnly) => {
      if (date > task.deadline || p.excludedDays.includes(new Date(`${date}T12:00:00`).getDay())
        || (notBefore && date < localDate(notBefore))) return null;
      const preferredDay = !p.preferredDays.length || p.preferredDays.includes(new Date(`${date}T12:00:00`).getDay());
      if (preferredOnly && !preferredDay) return null;
      const day = daily.get(date);
      if (day.minutes >= p.maxDailyMinutes) return null;
      let cursor = Math.max(p.startHour * 60, preferredOnly ? timeWindow[0] : 0);
      const finish = Math.min(p.endHour * 60, preferredOnly ? timeWindow[1] : 1440);
      if (date === today) cursor = Math.max(cursor, now.getHours() * 60 + now.getMinutes() + (now.getSeconds() || now.getMilliseconds() ? 1 : 0));
      if (notBefore && date === localDate(notBefore)) cursor = Math.max(cursor,
        notBefore.getHours() * 60 + notBefore.getMinutes() + (notBefore.getSeconds() || notBefore.getMilliseconds() ? 1 : 0));
      day.busy.sort((a, b) => a.start - b.start);
      while (cursor < finish) {
        const obstacle = day.busy.find(item => item.end > cursor);
        if (obstacle && obstacle.start <= cursor) { cursor = obstacle.end; continue; }
        const gapEnd = Math.min(finish, obstacle?.start ?? Infinity);
        const available = Math.min(gapEnd - cursor, p.maxDailyMinutes - day.minutes);
        let minutes = Math.min(remaining, p.sessionMinutes, available);
        // Split a slightly oversized session evenly rather than leave a tiny tail.
        if (remaining > minutes && remaining - minutes < 15 && minutes >= 30) {
          minutes = Math.min(minutes, Math.ceil(remaining / 2));
        }
        // Avoid filling a tiny gap with an impractically short study session.
        if (minutes < Math.min(15, remaining)) { cursor = obstacle ? obstacle.end : finish; continue; }
        return { date, cursor, minutes, day, preferredDay };
      }
      return null;
    };
    // Fill preferred periods across the whole horizon before considering fallback.
    for (const preferredOnly of hasPreference && p.allowOutsidePreferred ? [true, false] : [hasPreference]) {
      while (remaining > 0) {
        const choices = dates.map(date => candidate(date, preferredOnly)).filter(Boolean);
        if (!choices.length) break;
        if (p.scheduleStyle === 'balanced') choices.sort((a, b) => a.day.minutes - b.day.minutes || a.date.localeCompare(b.date));
        const { date, cursor, minutes, day, preferredDay } = choices[0];
        const end = cursor + minutes;
        const preferenceFallback = !preferredDay || cursor < timeWindow[0] || end > timeWindow[1];
        sessions.push({ id: `${task.id}-${date}-${cursor}`, taskId: task.id,
          title: task.title, date, start: clock(cursor), end: clock(end), minutes,
          preferenceFallback,
          ...(preferenceFallback ? { preferenceFallbackReason: 'הזמן המועדף לא הספיק עד למועד ההגשה, אז נמצא זמן פנוי נוסף.' } : {}),
          category: ['study', 'personal', 'work'].includes(task.category) ? task.category : 'study' });
        // Reserve a break on both sides so later tasks cannot abut this session.
        day.busy.push({ start: Math.max(0, cursor - p.breakMinutes), end: end + p.breakMinutes });
        day.minutes += minutes;
        remaining -= minutes;
      }
    }
    if (remaining > 0) unscheduled.push({ taskId: task.id, title: task.title, minutes: remaining,
      reason: hasPreference && !p.allowOutsidePreferred && task.deadline >= today ? 'אין מספיק זמן בשעות ובימים המועדפים. אפשר לאפשר זמן חלופי או לשנות העדפות.'
        : task.deadline < today ? 'מועד ההגשה עבר. אפשר לעדכן אותו ולתכנן שוב.'
        : task.deadline > dates[6] ? 'הזמן הפנוי בשבעת הימים הקרובים מלא. אפשר להרחיב את שעות הלמידה או לתכנן בהמשך.'
          : 'אין מספיק זמן פנוי עד למועד ההגשה. אפשר להרחיב את שעות הלמידה או לעדכן את המשימה.' });
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return { sessions, unscheduled, plannedMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0) };
}
