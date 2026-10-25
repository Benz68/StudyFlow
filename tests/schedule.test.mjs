import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, validateState} from '../src/studyflow/store.mjs';
import {freeRanges, placeFlexible, conflictsFor, alternatives, findTime, classesOn, planRest, shiftClashes} from '../src/studyflow/schedule.mjs';
import {goalStats} from '../src/studyflow/progress.mjs';
import {propose, ready, toItems} from '../src/studyflow/propose.mjs';
import {toMin} from '../src/studyflow/util.mjs';

const morning = new Date(2026, 9, 18, 7); // Sunday 18.10.2026, before the day starts
const base = () => validateState({...createState(),
  courses: [{id: 'stats', name: 'סטטיסטיקה'}],
  classes: [{id: 'c1', title: 'סטטיסטיקה', courseId: 'stats', days: [0, 2], start: '10:00', end: '12:00'}],
  items: [{id: 'dinner', title: 'ארוחה', date: '2026-10-18', start: '19:00', end: '20:30', kind: 'event', fixed: true}]});
let n = 0; const id = () => `new-${++n}`;
const overlaps = (a, b) => toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

test('free time skips classes and items, with a break on each side (only a short walk next to a class)', () => {
  const ranges = freeRanges(base(), '2026-10-18', {now: morning});
  // The class (10:00-12:00) keeps 5 minutes on each side, so windows between classes stay usable; other items keep the full break.
  assert.deepEqual(ranges.map(r => [r.start, r.end]), [[480, 595], [725, 1130], [1240, 1320]]);
  assert.deepEqual(freeRanges(base(), '2026-10-17', {now: morning}), [], 'past days have no free time');
});

test('the timetable respects start dates, end dates and skipped days', () => {
  const s = base();
  s.classes[0].until = '2026-10-19';
  s.classes[0].skipDates = ['2026-10-18'];
  assert.equal(classesOn(s, '2026-10-18').length, 0);
  assert.equal(classesOn(s, '2026-10-20').length, 0);
});

test('flexible work goes in the earliest fitting gap, or in the part of day asked for', () => {
  assert.equal(placeFlexible(base(), '2026-10-18', 120, {now: morning}).start, '12:05', 'two hours do not fit before the class');
  assert.equal(placeFlexible(base(), '2026-10-18', 60, {now: morning}).start, '08:00');
  assert.equal(placeFlexible(base(), '2026-10-18', 60, {now: morning, part: 'evening'}).start, '17:00');
  assert.equal(placeFlexible(base(), '2026-10-18', 600, {now: morning}), null);
});

test('a fixed time on top of a class is a conflict, with free alternatives the same day', () => {
  const s = base(), item = {id: 'x', date: '2026-10-18', start: '11:00', end: '12:00'};
  assert.deepEqual(conflictsFor(s, item).map(c => c.title), ['סטטיסטיקה']);
  const options = alternatives(s, '2026-10-18', 60, '11:00', {now: morning});
  assert.equal(options.length, 3);
  for (const o of options) assert.equal(conflictsFor(s, {id: 'x', ...o}).length, 0);
  for (const o of options) for (const p of options) if (o !== p) assert.ok(Math.abs(toMin(o.start) - toMin(p.start)) >= 45);
});

test('the review never overlaps anything, including the new items themselves', () => {
  const s = base();
  const result = propose(s, [
    {title: 'פגישה', date: '2026-10-18', fixed: true, start: '19:30', end: '20:00', kind: 'event'},
    {title: 'ריצה', date: '2026-10-18', fixed: true, start: '13:00', end: '14:00', kind: 'goal'},
    {title: 'ללמוד', date: '2026-10-18', fixed: false, minutes: 120, kind: 'study'},
    {title: 'לקרוא', date: '2026-10-18', fixed: false, minutes: 60, kind: 'study'},
  ], morning);
  assert.equal(result[0].status, 'conflict');
  assert.deepEqual(result[0].conflicts, ['ארוחה']);
  assert.equal(ready(result), false, 'nothing is saved while a conflict is open');
  const placed = result.filter(r => r.status === 'ok');
  for (const a of placed) for (const b of placed) if (a !== b) assert.ok(!overlaps(a, b), `${a.title} overlaps ${b.title}`);
  assert.equal(result[3].start, '08:00');
  assert.equal(result[2].start, '14:10', 'fitted after the fixed run, with a break');
});

test('work with a deadline looks for room on later days, and saved items carry their links', () => {
  const s = base();
  s.prefs.dayEnd = '09:00';
  const [p] = propose(s, [{title: 'סיכום', date: '2026-10-18', deadline: '2026-10-20', fixed: false, minutes: 60, kind: 'study', courseId: 'stats'}], morning);
  assert.equal(p.status, 'ok');
  assert.equal(p.date, '2026-10-18');
  const [late] = propose(s, [{title: 'ארוך', date: '2026-10-18', deadline: '2026-10-19', fixed: false, minutes: 120, kind: 'task'}], morning);
  assert.equal(late.status, 'noroom');
  const [saved] = toItems([p], id);
  assert.deepEqual({courseId: saved.courseId, kind: saved.kind, done: saved.done}, {courseId: 'stats', kind: 'study', done: false});
});

test('find time offers free slots on the coming days', () => {
  const slots = findTime(base(), 90, {from: '2026-10-18', days: 3, now: morning});
  assert.ok(slots.length >= 3);
  for (const slot of slots) assert.equal(conflictsFor(base(), {id: 'x', ...slot}).length, 0);
});

test('what is left of a weekly goal is spread over free days, skipping days already done or planned', () => {
  const s = base();
  s.goals = [{id: 'gym', title: 'חדר כושר', unit: 'times', target: 3, period: 'week', sessionMinutes: 60, log: [{id: 'l1', date: '2026-10-18', amount: 1}]}];
  s.items.push({id: 'g1', title: 'חדר כושר', date: '2026-10-20', start: '18:00', end: '19:00', kind: 'goal', goalId: 'gym'});
  const plan = planRest(validateState(s), validateState(s).goals[0], {today: '2026-10-18', now: morning});
  assert.equal(plan.planned, 1);
  assert.equal(plan.rest, 1);
  assert.equal(plan.slots.length, 1);
  assert.ok(!['2026-10-18', '2026-10-20'].includes(plan.slots[0].date));
  const two = planRest(s, {...s.goals[0], log: []}, {today: '2026-10-18', now: morning});
  assert.equal(two.slots.length, 2);
  assert.equal(new Set(two.slots.map(x => x.date)).size, 2, 'one session a day');
});

test('goal stats count weeks on target in a row', () => {
  const goal = {target: 2, log: ['2026-10-04', '2026-10-06', '2026-10-11', '2026-10-12', '2026-10-18'].map((date, i) => ({id: `${i}`, date, amount: 1}))};
  const s = goalStats(goal, '2026-10-19');
  assert.equal(s.streak, 2, 'this week is not reached yet, so the run counts the two weeks before');
  assert.equal(s.best, 2);
  assert.equal(s.total, 5);
  assert.equal(s.history.length, 8);
  assert.deepEqual(s.days.filter(d => d.done).map(d => d.date), ['2026-10-18']);
});
test('a shift gives way to lectures, other shifts and fixed events, and personal study gives way to it', () => {
  const s = base();
  s.items.push({id: 'study', title: 'ללמוד סטטיסטיקה', date: '2026-10-18', start: '13:00', end: '15:00', kind: 'study'});
  const at = (date, start, end) => shiftClashes(s, {jobId: 'j', date, start, end}).map(b => b.title);
  assert.deepEqual(at('2026-10-18', '09:00', '11:00'), ['סטטיסטיקה'], 'a lecture blocks');
  assert.deepEqual(at('2026-10-18', '12:30', '16:00'), [], 'personal study does not');
  assert.deepEqual(at('2026-10-18', '18:00', '22:00'), ['ארוחה'], 'a fixed event does');
  assert.deepEqual(at('2026-10-19', '23:00', '11:00'), ['סטטיסטיקה'], 'past midnight onto the next day\'s lecture');
});

test('a window between two classes is free time, and every free day is offered for a goal', () => {
  const s = base();
  s.classes.push({...s.classes[0], id: 'c2', title: 'מיקרו', start: '13:00', end: '14:00'});
  const window = freeRanges(s, '2026-10-18', {now: morning}).find(r => r.start >= 720 && r.end <= 780);
  assert.deepEqual(window && [window.start, window.end], [725, 775], 'the hour between 12:00 and 13:00 keeps only a short walk on each side');
  s.goals = [{id: 'gym', title: 'חדר כושר', unit: 'times', target: 2, period: 'week', sessionMinutes: 60, log: []}];
  const plan = planRest(s, s.goals[0], {today: '2026-10-18', now: morning});
  assert.equal(plan.slots.length, 2, 'two are suggested');
  assert.ok(plan.options.length > plan.slots.length, 'but every free day of the week can be chosen');
});
