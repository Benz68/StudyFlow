import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyPlan, commitmentIntervals, moveWeeklySession, normalizeWeekly, previewNextWeek, acceptNextWeek } from '../src/studyflow/weekly.mjs';
const now = new Date(2026, 9, 11, 8);
const initial = (extra = {}) => ({ tasks: [], events: [], preferences: { startHour: 9, endHour: 21, maxDailyMinutes: 240 },
  ...normalizeWeekly({ goals: [{ id: 'g', title: 'Practice', minutes: 300 }], weekly: { weekStart: '2026-10-11' } }, now), ...extra });
test('external review: every target minute survives high fixed workloads and travel', () => {
  for (let hours = 1; hours <= 10; hours++) {
    const state = initial({ events: [{ id: 'shift', title: 'Shift', date: '2026-10-11', start: '09:00', end: `${String(9 + hours).padStart(2, '0')}:00`, repeat: 'weekly', weekdays: [0,1,2,3,4,5,6], travelBefore: 30, travelAfter: 45 }] });
    const before = JSON.stringify(state), plan = buildWeeklyPlan(state, now);
    assert.equal(JSON.stringify(state), before);
    assert.equal(plan.plannedMinutes + plan.unscheduled.reduce((n,s) => n+s.minutes, 0), 300);
    const fixed = commitmentIntervals(state.events, '2026-10-11', '2026-10-17');
    const minute = t => Number(t.slice(0,2))*60+Number(t.slice(3));
    for (const s of plan.sessions) {
      for (const e of fixed.filter(e => e.date === s.date)) assert.ok(minute(s.end) <= e.start || minute(s.start) >= e.end);
      for (const other of plan.sessions.filter(o => o.date === s.date && o.id !== s.id)) assert.ok(minute(s.end) <= minute(other.start) || minute(s.start) >= minute(other.end));
    }
  }
});
test('external review: previous-night commitment and travel reserve Sunday morning', () => {
  const state = initial({ events: [{ id:'night', date:'2026-10-10', start:'23:00', end:'10:00', overnight:true, travelAfter:60 }] });
  const plan = buildWeeklyPlan(state, now);
  assert.ok(plan.sessions.filter(s => s.date==='2026-10-11').every(s => s.start >= '11:00'));
});
test('external review: viable short gaps can satisfy a longer goal', () => {
  const state = initial({preferences:{ startHour:9,endHour:10,maxDailyMinutes:120,breakMinutes:0 },events:[{id:'fixed',date:'2026-10-11',start:'09:30',end:'10:00',repeat:'weekly',weekdays:[0,1,2,3,4,5,6]}]});
  const plan = buildWeeklyPlan(state, now);
  assert.equal(plan.plannedMinutes, 210);
});
test('external review: moving a future meeting into the past must be rejected', () => {
  const state = initial(); state.weekly.sessions = buildWeeklyPlan(state, now).sessions;
  const s = state.weekly.sessions.find(s=>s.date > '2026-10-11');
  assert.throws(()=>moveWeeklySession(state,s.id,'2026-10-11','09:00',new Date(2026,9,12,8)));
});
test('external review: accepting next week preserves current sessions until Sunday', () => {
  const state = initial(); state.goals[0].repeatWeekly=true; state.weekly.sessions=buildWeeklyPlan(state,now).sessions;
  const future=previewNextWeek(state,new Date(2026,9,17,20)); const accepted=acceptNextWeek(state,future,new Date(2026,9,17,20));
  assert.equal(accepted.weekly.weekStart,'2026-10-11');
  assert.deepEqual(accepted.weekly.sessions,normalizeWeekly(state,now).weekly.sessions);
  assert.equal(normalizeWeekly(accepted,new Date(2026,9,18,8)).weekly.weekStart,'2026-10-18');
});
test('external review: imported duplicate completion records cannot multiply progress', () => {
  const state=initial();
  const record={sessionId:'completed',goalId:'g',date:'2026-10-11',start:'09:00',end:'09:30',minutes:30};
  state.weekly.completions=[record,{...record}];
  const normalized=normalizeWeekly(state,now);
  assert.equal(normalized.weekly.completions.reduce((n,c)=>n+c.minutes,0),30);
});


test('locked conflict remains recoverable after normalization and replanning',()=>{
 const state=initial();state.weekly.sessions=buildWeeklyPlan(state,now).retainedSessions;
 const slot=state.weekly.sessions[0];slot.locked=true;
 state.weekly.overrides=[{date:slot.date,maxMinutes:0}];
 let plan=buildWeeklyPlan(state,now);assert.ok(plan.blockedSessions.some(s=>s.id===slot.id));
 state.weekly.sessions=plan.retainedSessions;
 plan=buildWeeklyPlan({...state,...normalizeWeekly(state,now)},now);
 assert.ok(plan.blockedSessions.some(s=>s.id===slot.id));
 state.weekly.sessions.find(s=>s.id===slot.id).locked=false;
 plan=buildWeeklyPlan(state,now);assert.equal(plan.blockedSessions.length,0);
 assert.equal(plan.plannedMinutes+plan.unscheduled.reduce((n,s)=>n+s.minutes,0),300);
});
test('overnight display includes the previous-day occurrence and respects cancellation',async()=>{
 const {expandEvents}=await import('../src/studyflow/planner.mjs');
 const event={id:'night',date:'2026-10-10',start:'23:00',end:'10:00',overnight:true};
 const shown=expandEvents([event],now);
 assert.equal(shown.length,1);assert.equal(shown[0].date,'2026-10-11');
 assert.equal(shown[0].occurrenceDate,'2026-10-10');assert.equal(shown[0].start,'00:00');
 assert.equal(expandEvents([{...event,excludedDates:['2026-10-10']}],now).length,0);
});
