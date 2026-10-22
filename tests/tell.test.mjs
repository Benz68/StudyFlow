import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTell, splitParts} from '../src/studyflow/tell.mjs';

const now = new Date(2026, 9, 16, 9); // Friday 16.10.2026
const ctx = {courses: [{id: 'stats', name: 'סטטיסטיקה'}, {id: 'micro', name: 'מבוא למיקרו'}], goals: [{id: 'gym', title: 'חדר כושר', sessionMinutes: 45}]};
const one = (text, i = 0) => parseTell(text, ctx, now)[i];

test('the spec example becomes four items, with the day carried to every part', () => {
  const items = parseTell('מחר אני צריך ללמוד שעתיים לסטטיסטיקה, לסיים עבודה של שעה וחצי, להתאמן בחדר כושר ויש לי בערב ארוחה.', ctx, now);
  assert.deepEqual(items.map(i => i.title), ['ללמוד סטטיסטיקה', 'לסיים עבודה', 'להתאמן בחדר כושר', 'ארוחה']);
  assert.ok(items.every(i => i.date === '2026-10-17'));
  assert.deepEqual(items.map(i => i.fixed), [false, false, false, true]);
  assert.deepEqual(items.map(i => i.minutes), [120, 90, 45, 90]);
  assert.equal(items[0].courseId, 'stats');
  assert.equal(items[2].goalId, 'gym');
  assert.equal(items[3].start, '19:00');
  assert.ok(items[3].needs.includes('time'), 'a guessed time is flagged for the person to check');
});

test('splitting keeps "שעה וחצי" and "מ10 ועד 12" whole', () => {
  assert.deepEqual(splitParts('שעה וחצי לקרוא ולסיים תרגיל'), ['שעה וחצי לקרוא', 'לסיים תרגיל']);
  assert.equal(splitParts('שיעור מ10 ועד 12').length, 1);
});

test('fixed times, ranges and 12-hour speech', () => {
  assert.deepEqual([one('משמרת מחר מ16 עד 22').start, one('משמרת מחר מ16 עד 22').end], ['16:00', '22:00']);
  assert.equal(one('רופא ב-14:30').start, '14:30');
  assert.equal(one('רופא בשעה 4').start, '16:00');
  assert.equal(one('פגישה בשעה שלוש').start, '15:00');
  assert.equal(one('תור לרופא ביום רביעי בשמונה בבוקר').start, '08:00');
  assert.equal(one('תור לרופא ביום רביעי בשמונה בבוקר').date, '2026-10-21');
});

test('next week moves a weekday forward, "until" means a deadline', () => {
  assert.equal(one('ביום שני בשבוע הבא פגישה עם המנחה בשעה 10').date, '2026-10-19');
  const due = one('לכתוב סיכום עד יום חמישי');
  assert.equal(due.date, '2026-10-16');
  assert.equal(due.deadline, '2026-10-22');
  assert.equal(due.fixed, false);
});

test('numbers that are not times stay text', () => {
  const read = one('לקרוא פרקים 3 עד 5 במבוא למיקרו');
  assert.equal(read.fixed, false, 'chapter numbers are not clock times');
  assert.equal(read.courseId, 'micro');
  assert.equal(one('לתרגל מיקרו שעה').courseId, 'micro', 'a distinctive word of the course name is enough');
});

test('reserve duty over a range of days blocks each whole day', () => {
  const days = parseTell('מילואים מראשון עד רביעי', ctx, now);
  assert.deepEqual(days.map(d => d.date), ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
  assert.ok(days.every(d => d.allDay && d.fixed));
});

test('things listed without commas are still separate items', () => {
  assert.deepEqual(parseTell('ללמוד סטטיסטיקה 3 שעות ללכת לחדר כושר', ctx, now).map(i => [i.title, i.minutes, i.courseId || i.goalId]),
    [['ללמוד סטטיסטיקה', 180, 'stats'], ['ללכת לחדר כושר', 45, 'gym']]);
  assert.deepEqual(parseTell('מחר ללמוד מיקרו שעתיים לקנות מתנה פגישה עם המנחה בשעה 4', ctx, now).map(i => i.title), ['ללמוד מבוא למיקרו', 'לקנות מתנה', 'פגישה עם המנחה']);
  assert.equal(parseTell('אימון ריצה חצי שעה', ctx, now).length, 1, 'two activity words in a row are one item');
  assert.equal(parseTell('לצאת לרוץ בערב', ctx, now).length, 1);
  assert.equal(parseTell('יש לי פגישה בשעה 10', ctx, now).length, 1);
});

test('"ארוחת ערב" keeps its name and still means the evening', () => {
  const dinner = one('ארוחת ערב עם המשפחה');
  assert.equal(dinner.title, 'ארוחת ערב עם המשפחה');
  assert.equal(dinner.start, '19:00');
});

test('missing length is flagged instead of silently guessed', () => {
  const gift = one('לקנות מתנה');
  assert.equal(gift.minutes, 60);
  assert.ok(gift.needs.includes('minutes'));
  assert.deepEqual(parseTell('', ctx, now), []);
});

test('a missing day or time becomes a question instead of a silent guess', () => {
  const needs = text => parseTell(text, ctx, now).map(i => (i.needs || []).filter(n => ['day', 'when', 'time'].includes(n)).sort());
  assert.deepEqual(needs('לקנות מתנה'), [['day', 'when']], 'nothing said: ask which day and when');
  assert.deepEqual(needs('מחר בערב לצאת לרוץ'), [[]], 'day and part of the day said: nothing to ask');
  assert.deepEqual(needs('לסיים עבודה עד יום חמישי'), [[]], 'a deadline says enough: find time until then');
  assert.deepEqual(needs('מחר בשעה 5 פגישה עם המנחה'), [[]], 'day and hour said');
  assert.deepEqual(needs('מחר ללמוד שעתיים, לקנות חלב'), [['when'], ['when']], 'the day carries to the next part');
});
