import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSpeech} from '../src/studyflow/speech-parse.mjs';

// Wednesday, 14 October 2026.
const now = new Date(2026, 9, 14, 9, 0);
const pick = (said, keys) => Object.fromEntries(keys.map(key => [key, parseSpeech(said, now)[key]]));

test('fixed commitment with a weekday and an hour range in words', () => {
 assert.deepEqual(pick('שיעור סטטיסטיקה ביום שני מעשר עד שתים עשרה', ['title', 'date', 'start', 'end', 'weekly']),
  {title: 'שיעור סטטיסטיקה', date: '2026-10-19', start: '10:00', end: '12:00', weekly: false});
});

test('weekly commitment said with "כל יום"', () => {
 assert.deepEqual(pick('אימון כושר כל יום ראשון בשש בערב עד שמונה', ['title', 'date', 'start', 'end', 'weekly']),
  {title: 'אימון כושר', date: '2026-10-18', start: '18:00', end: '20:00', weekly: true});
});

test('digits as Chrome writes them, with the end time said later', () => {
 assert.deepEqual(pick('מחר ללמוד בשעה 2:00 מתמטיקה עד 4:00', ['title', 'date', 'start', 'end', 'minutes']),
  {title: 'ללמוד מתמטיקה', date: '2026-10-15', start: '14:00', end: '16:00', minutes: 120});
});

test('afternoon is assumed for small hours, morning when said', () => {
 assert.deepEqual(pick('משמרת בעבודה היום מ-4 עד 9', ['date', 'start', 'end']), {date: '2026-10-14', start: '16:00', end: '21:00'});
 assert.deepEqual(pick('פגישה מחרתיים בשמונה בבוקר', ['date', 'start', 'end']), {date: '2026-10-16', start: '08:00', end: '09:00'});
 assert.deepEqual(pick('רופא שיניים ב-15 לאוקטובר בחמש וחצי', ['date', 'start']), {date: '2026-10-15', start: '17:30'});
});

test('a task with how long it takes and a deadline', () => {
 assert.deepEqual(pick('לתרגל למבחן בסטטיסטיקה שעתיים עד יום חמישי', ['title', 'minutes', 'deadline']),
  {title: 'לתרגל למבחן בסטטיסטיקה', minutes: 120, deadline: '2026-10-15'});
 assert.deepEqual(pick('אני צריך לכתוב עבודה בהיסטוריה שעה וחצי עד 20.10', ['title', 'minutes', 'deadline']),
  {title: 'לכתוב עבודה בהיסטוריה', minutes: 90, deadline: '2026-10-20'});
 assert.deepEqual(pick('לקנות מתנה לאמא חצי שעה', ['title', 'minutes']), {title: 'לקנות מתנה לאמא', minutes: 30});
});

test('words that only look like numbers or days stay in the name', () => {
 assert.equal(parseSpeech('לקרוא פרק שני בספר', now).title, 'לקרוא פרק שני בספר');
 assert.equal(parseSpeech('שני ספרים לספרייה', now).title, 'שני ספרים לספרייה');
 assert.equal(parseSpeech('ישיבת צוות בשבוע הבא', now).title, 'ישיבת צוות');
});

test('"הבא" after a weekday is part of the date, not the name', () => {
 assert.deepEqual(pick('ללמוד מתמטיקה ביום שני הבא משעה אחת עד שלוש', ['title', 'date', 'start', 'end']),
  {title: 'ללמוד מתמטיקה', date: '2026-10-19', start: '13:00', end: '15:00'});
 assert.equal(parseSpeech('פגישה ביום רביעי הבא', now).date, '2026-10-21');
});
