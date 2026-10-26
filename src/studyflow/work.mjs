// Work: shifts per workplace and an estimate of the pay. A shift may cross midnight (22:00–06:00).
// The estimate is gross, before tax: hourly wage, overtime after 8 hours (125%) and after 10 hours (150%), plus tips.
import {toMin, addDays, localDate, duration} from './util.mjs';

export const shiftMinutes = s => { const a = toMin(s.start), b = toMin(s.end); return b > a ? b - a : b + 1440 - a; };
export const overnight = s => toMin(s.end) <= toMin(s.start);

// The parts of a shift on each calendar day, as minute ranges.
export function shiftSegments(s) {
  const a = toMin(s.start), b = toMin(s.end);
  if (b > a) return [{date: s.date, start: a, end: b}];
  return [{date: s.date, start: a, end: 1440}, ...(b > 0 ? [{date: addDays(s.date, 1), start: 0, end: b}] : [])];
}

export function shiftPay(shift, job) {
  const paid = Math.max(0, shiftMinutes(shift) - (shift.breakMinutes || 0)) / 60;
  const wage = job?.wage || 0;
  const base = job?.overtime === false ? paid * wage
    : wage * (Math.min(paid, 8) + Math.min(Math.max(paid - 8, 0), 2) * 1.25 + Math.max(paid - 10, 0) * 1.5);
  return {hours: paid, pay: Math.round(base + (shift.tips || 0))};
}

// "How much did it come to?": the same pay as shiftPay, line by line, before rounding.
export function payLines(shift, job) {
  const paid = Math.max(0, shiftMinutes(shift) - (shift.breakMinutes || 0)) / 60, wage = job?.wage || 0;
  const hours = n => n === 1 ? 'שעה' : n === 2 ? 'שעתיים' : `${Math.round(n * 100) / 100} שעות`;
  const lines = [];
  if (job?.overtime === false) lines.push({label: `${hours(paid)} × ${wage} ₪`, amount: paid * wage});
  else {
    const regular = Math.min(paid, 8), first = Math.min(Math.max(paid - 8, 0), 2), more = Math.max(paid - 10, 0);
    lines.push({label: `${hours(regular)} × ${wage} ₪`, amount: regular * wage});
    if (first) lines.push({label: `${first === 1 ? 'שעה נוספת' : `${hours(first)} נוספות`}, 125%`, amount: first * wage * 1.25});
    if (more) lines.push({label: `${more === 1 ? 'שעה נוספת' : `${hours(more)} נוספות`}, 150%`, amount: more * wage * 1.5});
  }
  if (shift.breakMinutes) lines.push({label: `הפסקה של ${shift.breakMinutes} דק׳, לא בתשלום`, amount: null});
  if (shift.tips) lines.push({label: 'טיפים / בונוס', amount: shift.tips});
  return {lines, hours: paid, total: lines.reduce((n, l) => n + (l.amount || 0), 0)};
}
// Shekels with agorot only when there are any: "304 ₪", "47.50 ₪".
export const money2 = n => { const a = Math.round(n * 100); return `${(a / 100).toLocaleString('he-IL', {minimumFractionDigits: a % 100 ? 2 : 0, maximumFractionDigits: 2})} ₪`; };

// A month ("2026-10") of work: per workplace and in total, split into done so far and still ahead.
export function monthSummary(state, month, now = new Date()) {
  const today = localDate(now), nowMin = now.getHours() * 60 + now.getMinutes();
  // Over when its real end has passed: a night shift from yesterday is still running until its morning end.
  const isPast = s => {
    const end = toMin(s.start) + shiftMinutes(s), endDate = end > 1440 ? addDays(s.date, 1) : s.date, endMin = end > 1440 ? end - 1440 : end;
    return endDate < today || (endDate === today && endMin <= nowMin);
  };
  const shifts = state.shifts.filter(s => s.date.slice(0, 7) === month).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const jobs = state.jobs.map(job => {
    const own = shifts.filter(s => s.jobId === job.id).map(s => ({...s, ...shiftPay(s, job), past: isPast(s)}));
    return {job, shifts: own, hours: sum(own, 'hours'), pay: sum(own, 'pay'), earned: sum(own.filter(s => s.past), 'pay')};
  });
  const all = jobs.flatMap(j => j.shifts);
  return {jobs, shifts: all.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
    hours: sum(all, 'hours'), pay: sum(all, 'pay'), earned: sum(all.filter(s => s.past), 'pay'), ongoing: ongoingShift(state, now)};
}

// The shift happening right now, if any, and what it has earned so far (money joins the total when it ends).
export function ongoingShift(state, now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes(), today = localDate(now), yesterday = addDays(today, -1);
  for (const s of state.shifts) {
    const start = toMin(s.start), length = shiftMinutes(s);
    const elapsed = s.date === today ? minutes - start : s.date === yesterday && overnight(s) ? minutes + 1440 - start : -1;
    if (elapsed > 0 && elapsed < length) {
      const job = state.jobs.find(j => j.id === s.jobId);
      return {shift: s, job, sofar: Math.floor(elapsed / 60 * (job?.wage || 0)), left: length - elapsed};
    }
  }
  return null;
}
const sum = (list, key) => list.reduce((n, x) => n + x[key], 0);

// Weekly repeat: the same shift on the same weekday for a number of weeks.
export function repeatDates(date, weeks) {
  return Array.from({length: Math.max(1, weeks)}, (_, i) => addDays(date, i * 7));
}

export const money = n => `${Math.round(n).toLocaleString('he-IL')} ₪`;
export const hoursLabel = h => duration(Math.round(h * 60));
export const shiftLabel = s => `${s.start}–${s.end}${overnight(s) ? ' (למחרת)' : ''}`;
