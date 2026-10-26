import test from 'node:test';
import assert from 'node:assert/strict';
import {parseICS, courseNameOf} from '../src/studyflow/ics.mjs';
import {readSyllabus, documentXmlText} from '../src/studyflow/syllabus.mjs';

const ics = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'SUMMARY:הרצאה - סטטיסטיקה א׳', 'LOCATION:בניין 72\\, חדר 3',
  'DTSTART;TZID=Asia/Jerusalem:20261018T100000', 'DTEND;TZID=Asia/Jerusalem:20261018T120000',
  'RRULE:FREQ=WEEKLY;BYDAY=SU,TU;UNTIL=20270115T235959Z', 'EXDATE;TZID=Asia/Jerusalem:20261020T100000', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:פגישה עם המנחה', 'DTSTART:20261022T140000', 'DTEND:20261022T150000', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:בוטל', 'STATUS:CANCELLED', 'DTSTART:20261023T090000', 'DTEND:20261023T100000', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:חג', 'DTSTART;VALUE=DATE:20261025', 'DTEND;VALUE=DATE:20261026', 'END:VEVENT',
  ...['20261019', '20261026', '20261102'].flatMap(d => ['BEGIN:VEVENT', 'SUMMARY:תרגול מיקרו', `DTSTART:${d}T160000`, `DTEND:${d}T170000`, 'END:VEVENT']),
  'END:VCALENDAR'].join('\r\n');

test('a calendar file becomes weekly classes and one-time events', () => {
  const {classes, once} = parseICS(ics);
  const stats = classes.find(c => c.title.includes('סטטיסטיקה'));
  assert.deepEqual(stats.days, [0, 2]);
  assert.deepEqual([stats.start, stats.end, stats.from, stats.until], ['10:00', '12:00', '2026-10-18', '2027-01-15']);
  assert.equal(stats.location, 'בניין 72, חדר 3');
  assert.deepEqual(stats.skipDates, ['2026-10-20']);
  assert.ok(classes.some(c => c.title === 'תרגול מיקרו' && c.days[0] === 1), 'a class exported once per week is merged into one weekly class');
  assert.deepEqual(once.map(o => o.title), ['פגישה עם המנחה'], 'cancelled and all-day events are left out');
});

test('every other week, a set number of meetings, and a class past midnight come in right', () => {
  const event = (rule, start = '20261018T100000', end = '20261018T120000', title = 'תרגול') =>
    `BEGIN:VEVENT\nSUMMARY:${title}\nDTSTART:${start}\nDTEND:${end}\nRRULE:${rule}\nEND:VEVENT`;
  const file = `BEGIN:VCALENDAR\n${event('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;UNTIL=20261115T000000Z')}\n${event('FREQ=WEEKLY;COUNT=3;BYDAY=TU', '20261020T100000', '20261020T110000', 'מעבדה')}\n${event('FREQ=WEEKLY;BYDAY=WE', '20261021T230000', '20261022T003000', 'לילה')}\nEND:VCALENDAR`;
  const [biweekly, three, late] = parseICS(file).classes;
  assert.deepEqual([biweekly.from, biweekly.until, biweekly.skipDates], ['2026-10-18', '2026-11-15', ['2026-10-25', '2026-11-08']], 'meets on 18.10, 1.11 and 15.11');
  assert.deepEqual([three.until, three.skipDates], ['2026-11-03', []], 'three Tuesdays: 20.10, 27.10, 3.11');
  assert.deepEqual([late.start, late.end], ['23:00', '23:59'], 'kept, ending at the end of its day instead of being dropped');
});

test('a syllabus date that does not exist is not turned into another day', () => {
  assert.deepEqual(readSyllabus('מבחן סופי 31.11', {today: '2026-10-16'}).deadlines, []);
});

test('lecture and tutorial of the same course share one course name', () => {
  assert.equal(courseNameOf('הרצאה - סטטיסטיקה א׳'), 'סטטיסטיקה א׳');
  assert.equal(courseNameOf('תרגול מיקרו'), 'מיקרו');
  assert.equal(courseNameOf('פיזיקה 1'), 'פיזיקה 1');
});

test('a syllabus splits into topics and dated assignments', () => {
  const {topics, deadlines} = readSyllabus([
    'סילבוס סטטיסטיקה', 'שבוע 1: מבוא והסתברות', '2. משתנים מקריים', '• התפלגות נורמלית', '',
    'מבחן אמצע 12.11', 'הגשת תרגיל 3 - 20/11/2026', 'שבוע 4', 'התפלגות נורמלית'].join('\n'), {today: '2026-10-16'});
  assert.deepEqual(topics, ['מבוא והסתברות', 'משתנים מקריים', 'התפלגות נורמלית'], 'the title line is a course detail, not a topic');
  assert.deepEqual(deadlines, [{title: 'מבחן אמצע', date: '2026-11-12'}, {title: 'הגשת תרגיל 3', date: '2026-11-20'}]);
});

test('course details are not topics', () => {
  const {topics} = readSyllabus(['מרצה: ד״ר נועה לוי', 'שעות קבלה: יום ב׳ 12:00', 'דוא״ל: noa@uni.ac.il', 'הרכב הציון: 30% תרגילים, 70% מבחן', 'נושאי הקורס', 'רגרסיה לינארית',
    'מטלות ומועדים', 'תרגילי בית 15% · מבחן סופי 85%', 'לוי, נ. (2024). סטטיסטיקה למדעי החברה.'].join('\n'));
  assert.deepEqual(topics, ['רגרסיה לינארית']);
});

test('a date before today with no year means next year', () => {
  assert.equal(readSyllabus('מבחן סופי 10.2', {today: '2026-10-16'}).deadlines[0].date, '2027-02-10');
});

test('Word document text keeps one line per paragraph and table rows readable', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>מבוא</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>שבוע 2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>רגרסיה &amp; מתאם</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  assert.deepEqual(documentXmlText(xml).split('\n'), ['מבוא', 'שבוע 2', '· רגרסיה & מתאם']);
});
