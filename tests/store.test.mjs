import test from 'node:test';
import assert from 'node:assert/strict';
import {loadState, saveState, validateState, migrateV1, demoState, STORAGE_KEY, OLD_KEY, BACKUP_KEY, UNREADABLE_KEY} from '../src/studyflow/store.mjs';
import {courseProgress, goalProgress, goalSummary} from '../src/studyflow/progress.mjs';

const memory = (initial = {}) => { const data = {...initial}; return {data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; }}; };

test('saved data round-trips and invalid parts are dropped, not the whole state', () => {
  const storage = memory();
  const state = validateState({courses: [{id: 'c', name: 'סטטיסטיקה', topics: [{id: 't', title: 'מבוא', status: 'done'}, {title: 'no id'}]}],
    items: [{id: 'i', title: 'ריצה', date: '2026-10-18', start: '10:00', end: '09:00'}, {id: 'j', title: 'קריאה', date: '2026-10-18', start: '10:00', end: '11:00', courseId: 'missing'}]});
  assert.equal(state.courses[0].topics.length, 1);
  assert.deepEqual(state.items.map(i => i.id), ['j']);
  assert.equal(state.items[0].courseId, undefined, 'links to missing courses are removed');
  assert.ok(saveState(state, storage));
  assert.deepEqual(loadState(storage).state, state);
});

test('unreadable saved data is kept aside instead of being overwritten', () => {
  const storage = memory({[STORAGE_KEY]: '{broken'});
  const {state, notice} = loadState(storage);
  assert.equal(notice, 'unreadable');
  assert.equal(storage.data[UNREADABLE_KEY], '{broken');
  saveState(state, storage);
  assert.equal(storage.data[UNREADABLE_KEY], '{broken');
});

test('version 1 data is migrated, with the original kept as a backup', () => {
  const v1 = {courses: [{id: 'c', name: 'מיקרו', topics: [{id: 't', title: 'ביקוש', status: 'ready'}]}],
    events: [{id: 'e', title: 'הרצאה', date: '2026-10-18', start: '10:00', end: '12:00', repeat: 'weekly', weekdays: [0, 2], repeatUntil: '2027-01-15'}],
    goals: [{id: 'g', title: 'גיטרה', category: 'personal', minutes: 120}, {id: 'm', title: 'לתרגל מיקרו', courseId: 'c', minutes: 60}], tasks: [{id: 'x'}]};
  const storage = memory({[OLD_KEY]: JSON.stringify(v1)});
  const {state, notice} = loadState(storage);
  assert.equal(notice, 'migrated');
  assert.equal(storage.data[BACKUP_KEY], JSON.stringify(v1));
  assert.equal(storage.data[OLD_KEY], undefined);
  assert.equal(state.courses[0].topics[0].status, 'done');
  assert.deepEqual(state.classes[0].days, [0, 2]);
  assert.deepEqual(state.goals.map(g => g.title), ['גיטרה'], 'course study goals are not personal goals');
  assert.deepEqual(migrateV1({}).courses, []);
});

test('progress: one number per course and per goal', () => {
  const s = demoState(new Date(2026, 9, 16, 9));
  const stats = courseProgress(s.courses[0], '2026-10-16');
  assert.deepEqual([stats.done, stats.total, stats.percent, stats.next.title, stats.exam], [3, 6, 50, 'אמידה', 18]);
  const gym = s.goals[0];
  assert.deepEqual([goalProgress(gym, '2026-10-16').done, goalProgress(gym, '2026-10-18').done], [1, 0], 'a weekly goal starts again on Sunday');
  assert.equal(goalSummary(gym, '2026-10-16'), '1 מתוך 3 אימונים השבוע');
  const minutes = {...gym, unit: 'minutes', target: 180, log: [{id: 'l', date: '2026-10-16', amount: 90}]};
  assert.equal(goalSummary(minutes, '2026-10-16'), 'שעה וחצי מתוך 3 שעות השבוע');
});

test('the profile: saves from before it existed skip the first-time questions, new ones start them', () => {
  const old = validateState({classes: [{id: 'c', title: 'סטטיסטיקה', days: [0], start: '10:00', end: '12:00'}]});
  assert.equal(old.profile.onboarded, true);
  assert.equal(validateState({}).profile.onboarded, false);
  const kept = validateState({profile: {name: ' דנה ', areas: ['work', 'nope', 'work'], onboarded: true, tips: ['work', 7], terms: '2026-10-24'}});
  assert.deepEqual(kept.profile, {name: 'דנה', areas: ['work'], onboarded: true, tips: ['work'], terms: '2026-10-24'});
  assert.equal(validateState({profile: {terms: 'yes'}}).profile.terms, '', 'only a real version date counts as agreeing');
});