// One clear number per course and per personal goal, as in the product spec.
import {localDate, weekStart, addDays, daysBetween, duration} from './util.mjs';

export function courseProgress(course, today = localDate()) {
  const total = course.topics.length, done = course.topics.filter(t => t.status === 'done').length;
  const next = course.topics.find(t => t.status === 'learning') || course.topics.find(t => t.status === 'new');
  const exam = course.examDate && course.examDate >= today ? daysBetween(today, course.examDate) : null;
  const upcoming = course.deadlines.filter(d => !d.done && d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const week = weekStart(today);
  const studiedThisWeek = course.studyLog.filter(l => l.date >= week && l.date <= addDays(week, 6)).reduce((n, l) => n + l.minutes, 0);
  return {total, done, percent: total ? Math.round(done / total * 100) : 0, next, exam, nextDeadline: upcoming[0], studiedThisWeek};
}

export const UNITS = {
  times: {label: 'פעמים', step: 1},
  pages: {label: 'עמודים', step: 10},
  minutes: {label: 'דקות', step: 30},
  km: {label: 'ק״מ', step: 1},
};
export const unitLabel = goal => goal.unit === 'times' ? (goal.noun || 'פעמים') : UNITS[goal.unit].label;

export function goalProgress(goal, today = localDate()) {
  const from = goal.period === 'week' ? weekStart(today) : '0000-01-01';
  const to = goal.period === 'week' ? addDays(from, 6) : '9999-12-31';
  const entries = goal.log.filter(l => l.date >= from && l.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const done = entries.reduce((n, l) => n + l.amount, 0);
  return {done, target: goal.target, percent: Math.min(100, Math.round(done / goal.target * 100)), entries, reached: done >= goal.target};
}

export function goalSummary(goal, today = localDate()) {
  const p = goalProgress(goal, today), unit = unitLabel(goal);
  const amount = goal.unit === 'minutes' ? `${duration(p.done)} מתוך ${duration(goal.target)}` : `${round(p.done)} מתוך ${round(goal.target)} ${unit}`;
  return `${amount}${goal.period === 'week' ? ' השבוע' : ''}`;
}
const round = n => Math.round(n * 10) / 10;

// How much one finished session adds to a goal.
export function amountForSession(goal, minutes) {
  return goal.unit === 'times' ? 1 : goal.unit === 'minutes' ? minutes : null;
}
