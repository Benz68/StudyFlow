// What makes coming back worth it: the run of days the planner was kept up, the exams coming closer,
// the money goal for the month, and the week in a few numbers.
import {localDate, addDays, weekStart, toMin} from './util.mjs';
import {courseProgress} from './progress.mjs';
import {classesOn} from './schedule.mjs';
import {shiftPay, monthSummary, money, hoursLabel} from './work.mjs';

// Days in a row with an update, up to today. A day not updated yet today does not break the run.
// Also the longest run ever, and the last seven days for the row of circles.
export function streak(activeDays, today = localDate()) {
  const days = new Set(activeDays);
  let day = days.has(today) ? today : addDays(today, -1), n = 0;
  while (days.has(day)) { n++; day = addDays(day, -1); }
  let best = 0, run = 0, prev = '';
  for (const d of [...days].sort()) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const week = Array.from({length: 7}, (_, i) => { const date = addDays(today, i - 6); return {date, done: days.has(date)}; });
  return {days: n, today: days.has(today), best, week};
}
export const markActive = (activeDays, today = localDate()) => activeDays.includes(today) ? activeDays : [...activeDays, today].slice(-400);

// Exams in the coming weeks, closest first, with how much of the material is done.
export function upcomingExams(state, today = localDate(), within = 60) {
  return state.courses.map(c => ({course: c, ...courseProgress(c, today)}))
    .filter(x => x.exam !== null && x.exam <= within).sort((a, b) => a.exam - b.exam);
}

// The month's pay against the money goal. "earned" is what came in so far; "expected" counts the planned shifts too.
export function moneyGoal(state, now = new Date()) {
  const sum = monthSummary(state, localDate(now).slice(0, 7), now), goal = state.profile.moneyGoal || 0;
  return {earned: sum.earned, expected: sum.pay, goal, left: Math.max(0, goal - sum.pay), percent: goal ? Math.min(100, Math.round(sum.pay / goal * 100)) : 0,
    reached: goal > 0 && sum.earned >= goal};
}

// A week, Sunday to Saturday, counted up to now: classes sat, study done, work, goals and tasks.
export function weekSummary(state, start, now = new Date()) {
  const today = localDate(now), end = addDays(start, 6), nowMin = now.getHours() * 60 + now.getMinutes();
  const inWeek = d => d >= start && d <= end;
  const over = (date, endClock) => date < today || (date === today && toMin(endClock) <= nowMin);
  let classMinutes = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) for (const c of classesOn(state, d)) if (over(d, c.end)) classMinutes += toMin(c.end) - toMin(c.start);
  const studyMinutes = state.courses.reduce((n, c) => n + c.studyLog.filter(l => inWeek(l.date)).reduce((m, l) => m + l.minutes, 0), 0);
  const shifts = state.shifts.filter(s => inWeek(s.date) && s.date <= today).map(s => shiftPay(s, state.jobs.find(j => j.id === s.jobId)));
  const goals = state.goals.map(g => ({goal: g, done: g.log.filter(l => inWeek(l.date)).reduce((n, l) => n + l.amount, 0)}));
  const tasks = state.items.filter(i => inWeek(i.date) && i.done && !i.goalId).length;
  return {start, end, classMinutes, studyMinutes, workHours: shifts.reduce((n, s) => n + s.hours, 0), pay: shifts.reduce((n, s) => n + s.pay, 0),
    shifts: shifts.length, goalSessions: state.goals.filter(g => g.unit === 'times').reduce((n, g) => n + goals.find(x => x.goal === g).done, 0),
    goalsHit: goals.filter(x => x.goal.period === 'week' && x.done >= x.goal.target).length, tasks,
    active: state.profile.activeDays.filter(inWeek).length};
}
// On Sunday to Tuesday the week that just ended is shown; later in the week, the current one.
export const summaryWeek = (today = localDate()) => {
  const start = weekStart(today), day = new Date(`${today}T12:00:00`).getDay();
  return day <= 2 ? addDays(start, -7) : start;
};
export const hasSomething = w => w.classMinutes || w.studyMinutes || w.shifts || w.goalSessions || w.tasks;

// The numbers worth showing on the week's note, in words.
export function weekStats(w) {
  return [
    w.classMinutes && {value: hoursLabel(w.classMinutes / 60), label: 'בשיעורים'},
    w.studyMinutes && {value: hoursLabel(w.studyMinutes / 60), label: 'למידה עצמית'},
    w.shifts && {value: hoursLabel(w.workHours), label: w.shifts === 1 ? 'עבודה · משמרת אחת' : `עבודה · ${w.shifts} משמרות`},
    w.shifts && {value: money(w.pay), label: 'הרווחתי'},
    w.goalSessions && {value: w.goalSessions === 1 ? 'פעם אחת' : `${w.goalSessions} פעמים`, label: 'ספורט ותחביבים'},
    w.goalsHit && {value: String(w.goalsHit), label: w.goalsHit === 1 ? 'מטרה שבועית הושגה' : 'מטרות שבועיות הושגו'},
    w.tasks && {value: String(w.tasks), label: 'משימות שסיימתי'},
    w.active && {value: `${w.active}/7`, label: 'ימים שעדכנתי'},
  ].filter(Boolean);
}
