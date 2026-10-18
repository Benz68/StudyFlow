import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, validateState} from '../src/studyflow/store.mjs';
import {shiftPay, payLines, money2, shiftSegments, monthSummary, repeatDates} from '../src/studyflow/work.mjs';
import {busyOn, freeRanges, dayAgenda} from '../src/studyflow/schedule.mjs';
import {parseTell} from '../src/studyflow/tell.mjs';
import {propose, toShifts, toItems} from '../src/studyflow/propose.mjs';

const cafe = {id: 'cafe', name: 'קפה רחביה', wage: 40, overtime: true};
const state = () => validateState({...createState(), jobs: [cafe, {id: 'bar', name: 'בר', wage: 50}],
  classes: [{id: 'c', title: 'סטטיסטיקה', days: [1], start: '10:00', end: '12:00'}],
  shifts: [
    {id: 's1', jobId: 'cafe', date: '2026-10-11', start: '16:00', end: '22:00', tips: 100},
    {id: 's2', jobId: 'bar', date: '2026-10-17', start: '22:00', end: '06:00', breakMinutes: 30},
    {id: 's3', jobId: 'cafe', date: '2026-10-25', start: '08:00', end: '20:00'},
    {id: 'nov', jobId: 'cafe', date: '2026-11-01', start: '10:00', end: '14:00'}]});

test('pay: hourly wage, unpaid break, overtime after 8 and 10 hours, plus tips', () => {
  assert.deepEqual(shiftPay({start: '16:00', end: '22:00', tips: 100}, cafe), {hours: 6, pay: 340});
  assert.deepEqual(shiftPay({start: '22:00', end: '06:00', breakMinutes: 30}, {wage: 50}), {hours: 7.5, pay: 375}, 'a night shift counts across midnight');
  // 12 hours: 8 × 40 + 2 × 50 + 2 × 60
  assert.equal(shiftPay({start: '08:00', end: '20:00'}, cafe).pay, 540);
  assert.equal(shiftPay({start: '08:00', end: '20:00'}, {...cafe, overtime: false}).pay, 480);
});

test('a month summary splits pay per workplace and into done so far', () => {
  const sum = monthSummary(state(), '2026-10', new Date(2026, 9, 20, 12));
  assert.equal(sum.shifts.length, 3, 'only shifts that start in the month');
  assert.equal(sum.hours, 25.5);
  assert.equal(sum.pay, 340 + 375 + 540);
  assert.equal(sum.earned, 340 + 375);
  assert.deepEqual(sum.jobs.map(j => [j.job.name, j.pay]), [['קפה רחביה', 880], ['בר', 375]]);
});

test('a night shift blocks the evening and the next morning', () => {
  assert.deepEqual(shiftSegments({date: '2026-10-17', start: '22:00', end: '06:00'}), [{date: '2026-10-17', start: 1320, end: 1440}, {date: '2026-10-18', start: 0, end: 360}]);
  assert.ok(busyOn(state(), '2026-10-18').some(b => b.source === 'shift' && b.end === 360));
  const morning = freeRanges(state(), '2026-10-18', {now: new Date(2026, 9, 18, 5)});
  assert.equal(morning[0].start, 480, 'the day still starts at 08:00, after the shift ended at 06:00');
  const agenda = dayAgenda(state(), '2026-10-18', {now: new Date(2026, 9, 18, 5)});
  assert.ok(agenda.entries.some(e => e.type === 'shift' && e.continued));
});

test('weekly shifts repeat on the same weekday', () => {
  assert.deepEqual(repeatDates('2026-10-18', 3), ['2026-10-18', '2026-10-25', '2026-11-01']);
});

test('"tell me" turns a named workplace or "משמרת" into a shift, including overnight', () => {
  const ctx = {courses: [], goals: [], jobs: state().jobs}, now = new Date(2026, 9, 16, 9);
  const [named] = parseTell('מחר משמרת בבר מ22 עד 6', ctx, now);
  assert.deepEqual([named.kind, named.jobId, named.start, named.end, named.overnight], ['shift', 'bar', '22:00', '06:00', true]);
  const [plain] = parseTell('משמרת ביום שני מ16 עד 22', ctx, now);
  assert.equal(plain.jobId, 'cafe');
  assert.ok(plain.needs.includes('job'), 'with two workplaces and none named, the person is asked to check');
  const [noTime] = parseTell('משמרת בקפה ביום רביעי', ctx, now);
  assert.equal(noTime.fixed, true);
  assert.ok(noTime.needs.includes('time'));
});

test('a shift on top of a class is a conflict; a free one is saved as a shift', () => {
  const s = state(), now = new Date(2026, 9, 18, 7);
  const [busy, free] = propose(s, [
    {title: 'משמרת', kind: 'shift', jobId: 'cafe', fixed: true, date: '2026-10-19', start: '09:00', end: '13:00'},
    {title: 'משמרת', kind: 'shift', jobId: 'bar', fixed: true, date: '2026-10-20', start: '22:00', end: '02:00'}], now);
  assert.equal(busy.status, 'conflict');
  assert.deepEqual(busy.conflicts, ['סטטיסטיקה']);
  assert.equal(free.status, 'ok');
  assert.equal(free.minutes, 240);
  assert.deepEqual(toShifts([free], () => 'n').map(x => [x.jobId, x.start, x.end]), [['bar', '22:00', '02:00']]);
  assert.equal(toItems([free], () => 'n').length, 0, 'shifts are not schedule items');
});

test('shifts for a deleted workplace are dropped; zero-length shifts are invalid', () => {
  const s = validateState({jobs: [cafe], shifts: [{id: 'a', jobId: 'gone', date: '2026-10-18', start: '10:00', end: '12:00'}, {id: 'b', jobId: 'cafe', date: '2026-10-18', start: '10:00', end: '10:00'}]});
  assert.equal(s.shifts.length, 0);
});

test('the pay card adds up line by line to the same pay', () => {
  const job = {id: 'j', wage: 38, overtime: true}, shift = {jobId: 'j', date: '2026-10-29', start: '17:00', end: '02:00', tips: 120};
  const {lines, total} = payLines(shift, job);
  assert.deepEqual(lines.map(l => l.amount), [304, 47.5, 120]);
  assert.equal(lines[1].label, 'שעה נוספת, 125%');
  assert.equal(total, 471.5);
  assert.equal(Math.round(total), shiftPay(shift, job).pay);
  assert.equal(money2(47.5), '47.50 ₪');
  assert.equal(money2(304), '304 ₪');
  const withBreak = payLines({...shift, breakMinutes: 30, tips: 0}, job);
  assert.equal(withBreak.lines.at(-1).amount, null, 'an unpaid break is a note, not money');
  assert.equal(withBreak.total, 38 * 8 + 38 * 0.5 * 1.25);
});