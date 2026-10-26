import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, validateState} from '../src/studyflow/store.mjs';
import {calendar, studies} from '../src/studyflow/screens.mjs';
import {dayAgenda} from '../src/studyflow/schedule.mjs';
import {timetableStatus, timetableNotice, updateSemester} from '../src/studyflow/timetable.mjs';

const lesson = {id: 'lesson', title: 'Statistics', courseId: 'course', days: [0, 2], start: '10:00', end: '12:00', from: '2026-03-01', until: '2026-07-01', skipDates: ['2026-10-27']};
const state = () => validateState({...createState(), classes: [lesson], courses: [{id: 'course', name: '<Statistics>'}]});

test('expired timetable is diagnosed and repairing the term restores calendar occurrences without losing cancellations', () => {
  const s = state();
  assert.equal(timetableStatus(s.classes, '2026-10-25').expired, 1);
  assert.match(timetableNotice(s.classes, '2026-10-25'), /semester-dates/);
  assert.equal(dayAgenda(s, '2026-10-25').entries.length, 0);
  s.classes = updateSemester(s.classes, '2026-10-25', '2027-02-01');
  assert.equal(dayAgenda(s, '2026-10-25').entries[0].title, 'Statistics');
  assert.deepEqual(dayAgenda(s, '2026-10-27').entries.map(e => e.cancelled), [true], 'the cancellation is kept: the class shows as cancelled');
  assert.equal(dayAgenda(s, '2027-02-02').entries.length, 0);
  assert.equal(lesson.until, '2026-07-01', 'update leaves original available for undo');
  const html = calendar(s, {week: '2026-10-25'}, new Date(2026, 9, 25, 8));
  assert.ok((html.match(/Statistics/g) || []).length >= 2, 'class appears in both calendar layouts');
});

test('future semesters are distinct from expired terms and dates are validated', () => {
  const classes = updateSemester([lesson], '2027-03-01', '');
  assert.equal(timetableStatus(classes, '2026-10-25').upcoming, 1);
  assert.equal(classes[0].until, undefined);
  assert.throws(() => updateSemester([lesson], 'bad', ''));
  assert.throws(() => updateSemester([lesson], '2026-10-25', '2026-10-24'));
});

test('removing course progress preserves timetable and scheduled items', () => {
  const s = state();
  s.classes = updateSemester(s.classes, '2026-10-25', '');
  s.items = [{id: 'study', title: 'Practice', courseId: 'course', date: '2026-10-25', start: '14:00', end: '15:00', kind: 'study'}];
  const html = studies(s);
  assert.match(html, /data-action="delete-course"/);
  assert.ok(!html.includes('<Statistics>'));
  s.courses = [];
  const clean = validateState(s);
  assert.equal(clean.classes.length, 1);
  assert.equal(clean.items.length, 1);
  assert.equal(dayAgenda(clean, '2026-10-25').entries.length, 2);
});
