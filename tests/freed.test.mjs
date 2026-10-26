import test from 'node:test';
import assert from 'node:assert/strict';
import {validateState} from '../src/studyflow/store.mjs';
import {dayAgenda, freeRanges, cancelledOn} from '../src/studyflow/schedule.mjs';
import {freedWindow, freedIdeas, isCancellation, cancellationClasses} from '../src/studyflow/freed.mjs';

// Wednesday 2026-10-28; "now" is the Monday before, in the morning.
const now = new Date('2026-10-26T08:00:00');
const plan = () => validateState({
  courses: [{id: 'st', name: 'סטטיסטיקה', examDate: '2026-11-02', topics: [{id: 't', title: 'אמידה'}]}, {id: 'md', name: 'מודלים סטוכסטיים'}],
  classes: [{id: 'c1', title: 'מודלים סטוכסטיים', courseId: 'md', days: [3], start: '09:00', end: '10:50'},
    {id: 'c2', title: 'סטטיסטיקה', courseId: 'st', days: [3], start: '14:00', end: '15:50', skipDates: ['2026-10-28']}],
  goals: [{id: 'gym', title: 'חדר כושר', unit: 'times', target: 3, period: 'week', sessionMinutes: 60, log: []}],
  items: [{id: 'old', title: 'לסכם הרצאה', date: '2026-10-25', start: '18:00', end: '19:00', kind: 'task'},
    {id: 'later', title: 'כביסה', date: '2026-10-30', start: '10:00', end: '10:45', kind: 'task'}],
  jobs: [{id: 'j', name: 'קפה', wage: 40}],
  profile: {onboarded: true},
});

test('a cancelled class stays in the day, marked, and its time is free', () => {
  const s = plan();
  assert.deepEqual(cancelledOn(s, '2026-10-28').map(c => c.id), ['c2']);
  const day = dayAgenda(s, '2026-10-28', {now}).entries.filter(e => e.type === 'class');
  assert.deepEqual(day.map(e => [e.id, !!e.cancelled]), [['c1', false], ['c2', true]]);
  assert.ok(freeRanges(s, '2026-10-28', {now}).some(r => r.start <= 14 * 60 && r.end >= 15 * 60 + 50), 'the class hours are free time');
  assert.deepEqual(cancelledOn(s, '2026-11-04'), [], 'the next week it is back');
});

test('the freed time is offered for what matters most, nothing is moved by itself', () => {
  const s = plan(), c = s.classes.find(x => x.id === 'c2');
  const w = freedWindow(s, '2026-10-28', c, {now});
  assert.deepEqual([w.start, w.end, w.minutes], ['14:00', '15:50', 110]);
  const ideas = freedIdeas(s, w, {now});
  assert.deepEqual(ideas.map(x => [x.kind, x.title]), [['move', 'לסכם הרצאה'], ['study', 'ללמוד סטטיסטיקה'], ['goal', 'חדר כושר'], ['move', 'כביסה']]);
  assert.deepEqual(ideas[1].slot, {date: '2026-10-28', start: '14:00', end: '15:30'}, 'study for up to an hour and a half');
  assert.match(ideas[1].note, /מבחן בעוד 5 ימים · הבא: אמידה/);
  assert.equal(s.items.find(i => i.id === 'later').date, '2026-10-30', 'still where it was');
  assert.ok(freedIdeas(s, w, {now, wholeDay: true}).some(x => x.kind === 'shift'), 'a whole day off offers an extra shift');
});

test('"מחר אין לימודים" and "השיעור במודלים בוטל" are understood', () => {
  const s = plan();
  assert.ok(isCancellation('ביום רביעי אין לימודים'));
  assert.ok(isCancellation('השיעור במודלים ביום רביעי בוטל'));
  assert.ok(!isCancellation('ללמוד שעתיים סטטיסטיקה'));
  const one = cancellationClasses(s, '2026-10-28', 'השיעור במודלים ביום רביעי בוטל');
  assert.deepEqual([one.named, one.classes.map(c => c.id)], [true, ['c1']]);
  const all = cancellationClasses(s, '2026-10-28', 'ביום רביעי אין לימודים');
  assert.deepEqual([all.named, all.classes.map(c => c.id)], [false, ['c1']], 'every class still on that day (c2 is already cancelled)');
});
