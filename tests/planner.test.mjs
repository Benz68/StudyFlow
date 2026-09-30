import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, localDate, weekDates, timeMinutes, validDate, normalizePreferences, expandEvents } from '../src/studyflow/planner.mjs';
import { createState, demoState, loadState, saveState, validateState, STORAGE_KEY } from '../src/studyflow/store.mjs';

const now = new Date(2026, 8, 30, 8, 0);
const task = (id, extra = {}) => ({ id, title: id, minutes: 100, deadline: localDate(now), priority: 'normal', completedMinutes: 0, category: 'study', ...extra });

test('sessions respect current time, fixed events, deadlines, daily cap, and breaks', () => {
  const current = new Date(2026, 8, 30, 10, 7, 30);
  const result = buildPlan({ tasks: [task('one', { minutes: 400 })],
    events: [{ date: localDate(now), start: '11:00', end: '13:00' }],
    preferences: { maxDailyMinutes: 165 } }, current);
  assert.equal(result.plannedMinutes, 165);
  assert.equal(result.unscheduled[0].minutes, 235);
  for (const [index, session] of result.sessions.entries()) {
    assert.equal(session.date, localDate(now));
    assert.ok(session.start >= '10:08');
    assert.ok(session.end <= '11:00' || session.start >= '13:00');
    assert.ok(session.minutes <= 50);
    if (index) assert.ok(timeMinutes(session.start) - timeMinutes(result.sessions[index - 1].end) >= 10);
  }
});

test('one hour is split into useful blocks instead of a ten-minute tail', () => {
  const result = buildPlan({ tasks: [task('hour', { minutes: 60 })] }, now);
  assert.deepEqual(result.sessions.map(session => session.minutes), [30, 30]);
  assert.equal(result.unscheduled.length, 0);
});

test('priority resolves competing tasks with the same deadline', () => {
  const result = buildPlan({ tasks: [task('a', { priority: 'low' }), task('z', { priority: 'high' })], preferences: { maxDailyMinutes: 100 } }, now);
  assert.ok(result.sessions.every(session => session.taskId === 'z'));
  assert.equal(result.unscheduled[0].taskId, 'a');
});

test('completed work is retained and finished tasks are excluded', () => {
  const tasks = [task('partial', { completedMinutes: 70 }), task('finished', { done: true })];
  const copy = structuredClone(tasks);
  const result = buildPlan({ tasks }, now);
  assert.equal(result.plannedMinutes, 30);
  assert.deepEqual(tasks, copy);
});

test('today capacity includes recorded work from partial and finished tasks after reload', () => {
  const tasks = [task('partial', { minutes: 300, completedMinutes: 60,
    completionLog: [{ date: localDate(now), minutes: 60 }] }),
  task('finished', { done: true, completedMinutes: 100,
    completionLog: [{ date: localDate(now), minutes: 40 }, { date: '2026-09-29', minutes: 60 }] })];
  let saved;
  saveState({ tasks }, { setItem(key, value) { saved = value; } });
  const state = loadState({ getItem: () => saved });
  assert.deepEqual(state.tasks[0].completionLog, tasks[0].completionLog);
  const result = buildPlan(state, now);
  assert.equal(result.plannedMinutes, 140);
  assert.equal(result.unscheduled[0].minutes, 100);
  const exhausted = buildPlan({ ...state, preferences: { maxDailyMinutes: 100 } }, now);
  assert.equal(exhausted.plannedMinutes, 0);
  assert.equal(exhausted.unscheduled[0].minutes, 240);
});

test('malformed completion history cannot corrupt planning or survive storage validation', () => {
  const invalid = [null, { date: '2026-02-30', minutes: 60 },
    { date: localDate(now), minutes: -1 }, { date: localDate(now), minutes: NaN },
    { date: localDate(now), minutes: Infinity }, { date: localDate(now), minutes: '50' }];
  const state = { tasks: [task('one', { completionLog: invalid })] };
  assert.equal(buildPlan(state, now).plannedMinutes, 100);
  assert.deepEqual(validateState(state).tasks[0].completionLog, []);
});

test('overlapping fixed events form one blocked interval', () => {
  const result = buildPlan({ tasks: [task('one', { minutes: 100 })], events: [
    { date: localDate(now), start: '09:00', end: '11:00' },
    { date: localDate(now), start: '10:00', end: '12:30' },
    { date: localDate(now), start: '09:30', end: '10:30' },
  ] }, now);
  assert.equal(result.sessions[0].start, '12:30');
  assert.equal(result.plannedMinutes, 100);
});

test('weekly events roll into a later month and block planning after storage roundtrip', () => {
  const event = { id: 'lecture', title: 'lecture', date: '2026-09-23', start: '09:00', end: '12:00', repeat: 'weekly' };
  let saved;
  saveState({ events: [event] }, { setItem(key, value) { saved = value; } });
  const events = loadState({ getItem: () => saved }).events;
  assert.equal(events[0].repeat, 'weekly');
  assert.deepEqual(expandEvents(events, now), [{ ...event, date: '2026-09-30' }]);
  const nextWeek = new Date(2026, 9, 5, 8);
  assert.deepEqual(expandEvents(events, nextWeek), [{ ...event, date: '2026-10-07' }]);
  assert.equal(buildPlan({ tasks: [task('one')], events }, now).sessions[0].start, '12:00');
  assert.equal(events[0].date, '2026-09-23');
});

test('recurrence never occurs before its initial date and one-off events stay dated', () => {
  const event = { id: 'future', title: 'future', date: '2026-10-07', start: '09:00', end: '10:00', repeat: 'weekly' };
  assert.deepEqual(expandEvents([event], now), []);
  const initial = new Date(2026, 9, 7, 8);
  assert.equal(expandEvents([event], initial)[0].date, event.date);
  assert.deepEqual(expandEvents([{ ...event, repeat: undefined }], new Date(2026, 9, 14)), []);
  assert.equal(validateState({ events: [{ ...event, repeat: 'daily' }] }).events[0].repeat, undefined);
});

test('invalid completion values do not silently suppress pending work', () => {
  for (const completedMinutes of [NaN, Infinity, -30]) {
    assert.equal(buildPlan({ tasks: [task('one', { completedMinutes })] }, now).plannedMinutes, 100);
  }
});

test('expired deadlines and fully blocked days are explained without overlapping events', () => {
  const result = buildPlan({ tasks: [task('expired', { deadline: '2026-09-29' }), task('blocked')],
    events: [{ date: localDate(now), start: '09:00', end: '21:00' }] }, now);
  assert.equal(result.sessions.length, 0);
  assert.equal(result.unscheduled.length, 2);
  assert.ok(result.unscheduled.every(item => item.reason && item.minutes === 100));
});

test('seven local dates cross month and DST boundaries without duplicates', () => {
  const dates = weekDates(new Date(2026, 9, 23, 23, 30));
  assert.equal(dates[0], '2026-10-23');
  assert.equal(dates[6], '2026-10-29');
  assert.equal(new Set(dates).size, 7);
  assert.equal(weekDates(now)[1], '2026-10-01');
  assert.equal(validDate('2026-02-30'), false);
});

test('excluded days, deferred tasks and session separation across different tasks', () => {
  const result = buildPlan({ tasks: [task('first'), task('next', { notBefore: new Date(2026, 8, 30, 12, 15).toISOString() })] }, now);
  assert.ok(result.sessions.filter(session => session.taskId === 'next').every(session => session.start >= '12:15'));
  for (let index = 1; index < result.sessions.length; index++) {
    assert.ok(timeMinutes(result.sessions[index].start) - timeMinutes(result.sessions[index - 1].end) >= 10);
  }
  assert.equal(buildPlan({ tasks: [task('excluded')], preferences: { excludedDays: [now.getDay()] } }, now).plannedMinutes, 0);
});

test('corrupt, inaccessible, and missing browser storage recover to an empty valid state', () => {
  for (const raw of ['no json', 'null', '[]', '{"tasks":[null]}']) {
    assert.deepEqual(loadState({ getItem: () => raw }).tasks, []);
  }
  assert.deepEqual(loadState({ getItem() { throw Error('denied'); } }), createState());
  assert.equal(saveState(createState(), { setItem() { throw Error('quota'); } }), false);
});

test('persisted boundaries discard malformed entries and clamp preferences and completion', () => {
  for (const endHour of [undefined, NaN, Infinity, 'invalid']) {
    assert.equal(normalizePreferences({ startHour: 22, endHour }).endHour, 23);
  }
  const state = validateState({ tasks: [task('valid', { completedMinutes: 999 }), task('valid'), task('bad', { deadline: '2026-02-30' })],
    events: [{ id: 'bad', title: 'bad', date: localDate(now), start: '13:00', end: '12:00' }],
    preferences: { startHour: 99, endHour: -1, sessionMinutes: -100, excludedDays: [0, 0, 8] } });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].completedMinutes, 100);
  assert.equal(state.events.length, 0);
  assert.ok(state.preferences.endHour > state.preferences.startHour);
  assert.deepEqual(state.preferences.excludedDays, [0]);
  let saved;
  assert.equal(saveState(state, { setItem(key, value) { assert.equal(key, STORAGE_KEY); saved = value; } }), true);
  assert.deepEqual(loadState({ getItem: () => saved }), state);
  assert.equal(createState().tasks.length, 0);
  assert.ok(demoState(now).tasks.length > 0);
});
