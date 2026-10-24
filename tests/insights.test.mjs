import test from 'node:test';
import assert from 'node:assert/strict';
import {streak, markActive, upcomingExams, moneyGoal, weekSummary, summaryWeek, weekStats} from '../src/studyflow/insights.mjs';
import {validateState} from '../src/studyflow/store.mjs';
import {dayAgenda} from '../src/studyflow/schedule.mjs';
import {propose, toShifts} from '../src/studyflow/propose.mjs';

test('the streak counts days in a row, and today not updated yet does not break it', () => {
  const run = (days, today) => { const s = streak(days, today); return [s.days, s.today, s.best]; };
  assert.deepEqual(run(['2026-10-23', '2026-10-24', '2026-10-25'], '2026-10-25'), [3, true, 3]);
  assert.deepEqual(run(['2026-10-23', '2026-10-24'], '2026-10-25'), [2, false, 2]);
  assert.deepEqual(run(['2026-10-20', '2026-10-24'], '2026-10-25'), [1, false, 1]);
  assert.deepEqual(run(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-22'], '2026-10-25'), [0, false, 4], 'the record is kept after a break');
  assert.deepEqual(streak(['2026-10-24'], '2026-10-25').week.map(d => d.done), [false, false, false, false, false, true, false], 'the last seven days, today last');
  assert.deepEqual(markActive(['2026-10-24'], '2026-10-25'), ['2026-10-24', '2026-10-25']);
  assert.deepEqual(markActive(['2026-10-25'], '2026-10-25'), ['2026-10-25'], 'a second update the same day changes nothing');
});

test('exams closest first, money toward the month goal, notes kept', () => {
  const state = validateState({
    courses: [{id: 'a', name: 'סטטיסטיקה', examDate: '2026-11-10', topics: [{id: 't1', title: 'x', status: 'done'}, {id: 't2', title: 'y'}]},
      {id: 'b', name: 'מיקרו', examDate: '2026-10-28'}, {id: 'c', name: 'ישן', examDate: '2026-09-01'}],
    jobs: [{id: 'j', name: 'קפה', wage: 50}],
    shifts: [{id: 's1', jobId: 'j', date: '2026-10-05', start: '10:00', end: '18:00', note: 'שיעור בזום'}, {id: 's2', jobId: 'j', date: '2026-10-30', start: '10:00', end: '18:00'}],
    profile: {onboarded: true, moneyGoal: 1000, moneyFor: 'טיסה', activeDays: ['2026-10-25', 'nonsense']},
  });
  assert.equal(state.shifts[0].note, 'שיעור בזום');
  assert.deepEqual(state.profile.activeDays, ['2026-10-25'], 'only real dates are kept');
  const exams = upcomingExams(state, '2026-10-25');
  assert.deepEqual(exams.map(x => [x.course.name, x.exam]), [['מיקרו', 3], ['סטטיסטיקה', 16]]);
  assert.equal(exams[1].percent, 50);
  const m = moneyGoal(state, new Date('2026-10-25T12:00:00'));
  assert.deepEqual([m.earned, m.expected, m.left, m.percent, m.reached], [400, 800, 200, 80, false]);
});

test('a week in short: classes sat, study, work and goals, counted up to now', () => {
  const state = validateState({
    courses: [{id: 'a', name: 'סטטיסטיקה', studyLog: [{date: '2026-10-19', minutes: 90}, {date: '2026-10-10', minutes: 60}]}],
    classes: [{id: 'c', title: 'סטטיסטיקה', courseId: 'a', days: [0, 2], start: '10:00', end: '12:00'}],
    jobs: [{id: 'j', name: 'קפה', wage: 40}],
    shifts: [{id: 's', jobId: 'j', date: '2026-10-20', start: '17:00', end: '22:00'}],
    goals: [{id: 'g', title: 'חדר כושר', unit: 'times', target: 2, period: 'week', log: [{id: 'l1', date: '2026-10-19', amount: 1}, {id: 'l2', date: '2026-10-21', amount: 1}]}],
    items: [{id: 'i', title: 'כביסה', date: '2026-10-21', start: '09:00', end: '09:30', kind: 'task', done: true}],
    profile: {onboarded: true, activeDays: ['2026-10-19', '2026-10-20', '2026-10-23']},
  });
  assert.equal(summaryWeek('2026-10-26'), '2026-10-18', 'on Monday the week that ended is shown');
  assert.equal(summaryWeek('2026-10-22'), '2026-10-18', 'on Thursday, the current week');
  const w = weekSummary(state, '2026-10-18', new Date('2026-10-26T09:00:00'));
  assert.deepEqual([w.classMinutes, w.studyMinutes, w.workHours, w.pay, w.goalSessions, w.goalsHit, w.tasks, w.active], [240, 90, 5, 200, 2, 1, 1, 3]);
  assert.deepEqual(weekStats(w).map(s => s.label), ['בשיעורים', 'למידה עצמית', 'עבודה · משמרת אחת', 'הרווחתי', 'ספורט ותחביבים', 'מטרה שבועית הושגה', 'משימות שסיימתי', 'ימים שעדכנתי']);
});

test('an overlap the person said yes to goes in, and the day shows what it overlaps', () => {
  const state = validateState({
    classes: [{id: 'c', title: 'מבוא לכלכלה', days: [0], start: '10:00', end: '12:00'}],
    jobs: [{id: 'j', name: 'קפה', wage: 40}], profile: {onboarded: true},
  });
  const draft = {kind: 'shift', jobId: 'j', title: 'משמרת בקפה', date: '2026-10-25', start: '09:00', end: '15:00', fixed: true};
  const now = new Date('2026-10-25T07:00:00');
  assert.equal(propose(state, [draft], now)[0].status, 'conflict', 'first it asks');
  const [ok] = propose(state, [{...draft, allowOverlap: true, note: 'השיעור בזום'}], now);
  assert.deepEqual([ok.status, ok.overlapsWith], ['ok', ['מבוא לכלכלה']]);
  const [shift] = toShifts([ok], () => 'new');
  assert.equal(shift.note, 'השיעור בזום');
  const day = dayAgenda(validateState({...state, shifts: [shift]}), '2026-10-25', {now}).entries;
  assert.deepEqual(day.map(e => [e.type, e.overlaps]), [['shift', ['מבוא לכלכלה']], ['class', ['קפה']]]);
});
