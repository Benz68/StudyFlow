import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, weekDates, timeMinutes } from '../src/studyflow/planner.mjs';

test('varied weekly workloads conserve work and never overlap commitments or daily limits', () => {
  let seed = 43191;
  const random = max => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
  const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const now = new Date(2026, 8, 30, 11, 12);
  const dates = weekDates(now);
  for (let sample = 0; sample < 80; sample++) {
    const tasks = Array.from({ length: 12 }, (_, id) => ({ id: `task-${id}`, title: `Task ${id}`,
      minutes: 15 + random(480), completedMinutes: 0, deadline: dates[random(7)],
      priority: ['high', 'normal', 'low'][random(3)], done: false }));
    const events = Array.from({ length: 18 }, (_, id) => {
      const start = 8 * 60 + random(600);
      return { id: `event-${id}`, title: 'Fixed', date: dates[random(7)], start: clock(start), end: clock(start + 15 + random(120)) };
    });
    const preferences = { startHour: 8, endHour: 21, sessionMinutes: 25 + random(66), breakMinutes: random(21), maxDailyMinutes: 60 + random(301), excludedDays: sample % 2 ? [6] : [] };
    const input = { tasks, events, preferences };
    const original = JSON.stringify(input);
    const result = buildPlan(input, now);
    assert.equal(JSON.stringify(input), original, 'Planning does not mutate data');
    assert.equal(result.plannedMinutes + result.unscheduled.reduce((sum, task) => sum + task.minutes, 0), tasks.reduce((sum, task) => sum + task.minutes, 0), 'Every minute is scheduled or explicitly left over');
    for (const date of dates) {
      const sessions = result.sessions.filter(session => session.date === date);
      assert.ok(sessions.reduce((sum, session) => sum + session.minutes, 0) <= preferences.maxDailyMinutes);
      for (const [index, session] of sessions.entries()) {
        const start = timeMinutes(session.start), end = timeMinutes(session.end);
        assert.equal(end - start, session.minutes);
        assert.ok(start >= 8 * 60 && end <= 21 * 60);
        assert.ok(session.date <= tasks.find(task => task.id === session.taskId).deadline);
        if (date === dates[0]) assert.ok(start >= 11 * 60 + 12);
        if (index) assert.ok(start >= timeMinutes(sessions[index - 1].end) + preferences.breakMinutes);
        for (const event of events.filter(event => event.date === date)) {
          assert.ok(end <= timeMinutes(event.start) || start >= timeMinutes(event.end));
        }
      }
    }
  }
});
