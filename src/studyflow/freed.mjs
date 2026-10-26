// A class that was cancelled stays in its place, faded, and the time it frees is offered for something worth doing:
// what was not done, the exam that is coming, a weekly goal, something from later in the week, or an extra shift.
// Nothing moves by itself; the person picks, or leaves the time free.
import {toMin, toClock, localDate, addDays} from './util.mjs';
import {freeRanges, classesOn} from './schedule.mjs';
import {goalProgress} from './progress.mjs';
import {upcomingExams} from './insights.mjs';

// The largest free stretch inside the cancelled class's hours (something else may already sit there), 20 minutes or more.
export function freedWindow(state, date, cls, {now = new Date()} = {}) {
  const a = toMin(cls.start), b = toMin(cls.end);
  const parts = freeRanges(state, date, {now}).map(r => ({start: Math.max(r.start, a), end: Math.min(r.end, b)}))
    .filter(r => r.end - r.start >= 20).sort((x, y) => (y.end - y.start) - (x.end - x.start));
  const w = parts[0];
  return w ? {date, start: toClock(w.start), end: toClock(w.end), minutes: w.end - w.start} : null;
}

const length = i => toMin(i.end) - toMin(i.start);
const fitsIn = (w, minutes) => ({date: w.date, start: w.start, end: toClock(toMin(w.start) + Math.min(minutes, w.minutes))});

// Ideas for the freed time, most useful first. Each says what it is and where it would go.
export function freedIdeas(state, w, {now = new Date(), wholeDay = false} = {}) {
  const today = localDate(now), nowMin = now.getHours() * 60 + now.getMinutes(), ideas = [];
  const timed = i => !i.allDay && !i.done && i.kind !== 'event';
  // 1. What was not done: it can be caught up now.
  const missed = state.items.filter(i => timed(i) && (i.date < today || (i.date === today && toMin(i.end) <= nowMin)) && length(i) <= w.minutes)
    .sort((x, y) => y.date.localeCompare(x.date)).slice(0, 2);
  for (const i of missed) ideas.push({kind: 'move', id: i.id, title: i.title, note: 'לא הספקת', slot: fitsIn(w, length(i))});
  // 2. The closest exam within a month.
  const exam = upcomingExams(state, w.date, 30)[0];
  if (exam && w.minutes >= 30) {
    ideas.push({kind: 'study', courseId: exam.course.id, title: `ללמוד ${exam.course.name}`,
      note: `${exam.exam === 0 ? 'המבחן היום' : exam.exam === 1 ? 'המבחן מחר' : `מבחן בעוד ${exam.exam} ימים`}${exam.next ? ` · הבא: ${exam.next.title}` : ''}`, slot: fitsIn(w, 90)});
  }
  // 3. Weekly goals not reached yet, with nothing of them planned on that day.
  for (const g of state.goals.filter(g => g.period === 'week' && g.sessionMinutes <= w.minutes)) {
    const p = goalProgress(g, w.date);
    if (p.reached || state.items.some(i => i.goalId === g.id && i.date === w.date)) continue;
    if (ideas.filter(x => x.kind === 'goal').length >= 2) break;
    const amount = n => Math.round((g.unit === 'minutes' ? n / 60 : n) * 10) / 10;
    ideas.push({kind: 'goal', goalId: g.id, title: g.title, note: `${amount(p.done)} מתוך ${amount(g.target)}${g.unit === 'minutes' ? ' שעות' : ''} השבוע`, slot: fitsIn(w, g.sessionMinutes)});
  }
  // 4. Something flexible from later in the week can come earlier.
  const later = state.items.filter(i => timed(i) && !i.fixed && i.date > w.date && i.date <= addDays(w.date, 6) && length(i) <= w.minutes)
    .sort((x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start)).slice(0, 2);
  for (const i of later) ideas.push({kind: 'move', id: i.id, title: i.title, note: 'להקדים', from: i.date, slot: fitsIn(w, length(i))});
  // 5. A whole day off: room for an extra shift.
  if (wholeDay && state.jobs.length) ideas.push({kind: 'shift', title: 'משמרת נוספת', note: 'יום שלם התפנה', slot: {date: w.date, start: w.start, end: w.end}});
  return ideas;
}

// "מחר אין לימודים", "השיעור בסטטיסטיקה ביום רביעי בוטל": which day, and which course (none = the whole day).
const CANCEL = /(אין\s+(?:לי\s+)?(?:לימודים|שיעורים|הרצאות|לימוד|שיעור|הרצאה)|בוטל|בוטלה|בוטלו|מבוטל|מבוטלת|מבוטלים|ביטלו|לא\s+יתקיים|לא\s+תתקיים|לא\s+מתקיים|לא\s+יהיה\s+(?:שיעור|הרצאה|תרגול))/;
export const isCancellation = text => CANCEL.test(String(text || ''));
export function cancellationClasses(state, date, text) {
  const all = classesOn(state, date);
  const named = all.filter(c => {
    const course = state.courses.find(x => x.id === c.courseId);
    return [c.title, course?.name].filter(Boolean).some(n => mentions(text, n));
  });
  return {named: named.length > 0, classes: named.length ? named : all};
}
function mentions(text, name) {
  const words = name.replace(/["׳']/g, '').split(/\s+/).map(w => w.replace(/^[לבהו](?=\S{3})/, '')).filter(w => w.length >= 3 && !['מבוא', 'תרגול', 'הרצאה', 'שיעור', 'יסודות'].includes(w));
  const plain = ` ${String(text).replace(/["׳']/g, '')} `;
  return words.some(w => new RegExp(`\\s(?:ו?[לבהמש]?)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,.?!])`).test(plain));
}
