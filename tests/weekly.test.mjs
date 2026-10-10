import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyPlan,normalizeWeekly,commitmentIntervals,completeWeeklySession,moveWeeklySession,previewNextWeek,acceptNextWeek} from '../src/studyflow/weekly.mjs';
import {validateState} from '../src/studyflow/store.mjs';
import {eventsOverlap,timeMinutes} from '../src/studyflow/planner.mjs';
const now = new Date(2026,9,11,8);
const state = (extra={}) => ({tasks:[],events:[],preferences:{startHour:9,endHour:21,maxDailyMinutes:240,breakMinutes:10},...normalizeWeekly({goals:[{id:'math',title:'Math',minutes:300,repeatWeekly:true}],weekly:{weekStart:'2026-10-11'}},now),...extra});
const savePlan = s => ({...s,weekly:{...s.weekly,sessions:buildWeeklyPlan(s,now).sessions}});

test('weekly goals conserve minutes, share capacity with tasks, and prefer comfortable daytime',()=>{
  const s=state({tasks:[{id:'task',title:'essay',minutes:80,deadline:'2026-10-12'}]});
  const p=buildWeeklyPlan(s,now);
  assert.equal(p.plannedMinutes+p.unscheduled.reduce((a,x)=>a+x.minutes,0),380);
  assert.ok(p.sessions.some(x=>x.taskId==='task'));
  assert.equal(p.sessions[0].start,'10:00');
  for (const a of p.sessions) for (const b of p.sessions) if(a.id!==b.id&&a.date===b.date) assert.ok(timeMinutes(a.end)+10<=timeMinutes(b.start)||timeMinutes(b.end)+10<=timeMinutes(a.start));
});
test('overnight commitments include travel across midnight and reject overlapping series',()=>{
  const event={id:'shift',title:'shift',date:'2026-10-10',start:'22:00',end:'10:00',overnight:true,travelAfter:60};
  const intervals=commitmentIntervals([event],'2026-10-11','2026-10-17');
  assert.ok(intervals.some(x=>x.date==='2026-10-11'&&x.start===0&&x.end===660));
  const p=buildWeeklyPlan(state({events:[event]}),now);
  assert.ok(p.sessions.filter(x=>x.date==='2026-10-11').every(x=>timeMinutes(x.start)>=660));
  assert.equal(eventsOverlap(event,{date:'2026-10-11',start:'10:30',end:'11:00'}),true);
  assert.equal(validateState({events:[event]}).events[0].overnight,true);
});
test('day off affects only that day and low energy reduces load without changing targets',()=>{
  const s=state();s.weekly.overrides=[{date:'2026-10-11',maxMinutes:0,energy:'low'}];
  s.weekly.energy='low';s.goals[0].minutes=5000;
  const p=buildWeeklyPlan(s,now);
  assert.ok(!p.sessions.some(x=>x.date==='2026-10-11'));
  assert.ok(p.sessions.every(x=>x.minutes<=30));
  assert.equal(p.plannedMinutes+p.unscheduled.reduce((a,x)=>a+x.minutes,0),5000);
  assert.equal(s.goals[0].minutes,5000);
});
test('stable replanning preserves sessions and unanswered past work',()=>{
  const s=savePlan(state());
  assert.deepEqual(buildWeeklyPlan(s,now).sessions.map(x=>x.id),s.weekly.sessions.map(x=>x.id));
  const next=buildWeeklyPlan(s,new Date(2026,9,12,8));
  assert.ok(next.sessions.some(x=>x.date==='2026-10-11'&&x.needsUpdate));
  assert.equal(next.plannedMinutes,300);
});
test('partial completion conserves target and rejects duplicate completion',()=>{
  let s=savePlan(state());const first=s.weekly.sessions[0];
  s=completeWeeklySession(s,first.id,20);
  const p=buildWeeklyPlan(s,now);
  assert.equal(p.plannedMinutes+p.unscheduled.reduce((a,x)=>a+x.minutes,0)+20,300);
  assert.throws(()=>completeWeeklySession(s,first.id,20),RangeError);
  assert.equal(s.goals[0].minutes,300);
});
test('manual move rejects commitment collisions and lock survives replan',()=>{
  const s=savePlan(state({events:[{id:'e',date:'2026-10-11',start:'14:00',end:'15:00'}]}));
  const first=s.weekly.sessions[0];
  assert.throws(()=>moveWeeklySession(s,first.id,'2026-10-11','14:00',now),RangeError);
  const moved=moveWeeklySession(s,first.id,'2026-10-11','18:00',now);
  assert.ok(buildWeeklyPlan(moved,now).sessions.some(x=>x.id===first.id&&x.start==='18:00'&&x.locked));
});
test('next week preview is independent, explicit acceptance preserves current week until Sunday',()=>{
  const s=savePlan(state());s.goals.push({id:'once',title:'Once',minutes:60,repeatWeekly:false,weekStart:'2026-10-11'});
  const preview=previewNextWeek(s,new Date(2026,9,17,20));
  assert.equal(s.weekly.weekStart,'2026-10-11');
  assert.equal(preview.weekly.weekStart,'2026-10-18');
  assert.ok(!preview.weekly.sessions.some(x=>x.goalId==='once'));
  const accepted=acceptNextWeek(s,preview,new Date(2026,9,17,20));
  assert.equal(accepted.weekly.weekStart,'2026-10-11');
  assert.equal(accepted.weekly.nextWeek.weekly.weekStart,'2026-10-18');
  assert.equal(normalizeWeekly(accepted,new Date(2026,9,18,8)).weekly.weekStart,'2026-10-18');
});
test('whole week unavailable yields exact deficit; delayed return skips stale weeks',()=>{
  const s=state({preferences:{excludedDays:[0,1,2,3,4,5,6]}});
  const p=buildWeeklyPlan(s,now);
  assert.equal(p.sessions.length,0);assert.equal(p.unscheduled[0].minutes,300);
  assert.equal(previewNextWeek(s,new Date(2026,10,2,8)).weekly.weekStart,'2026-11-01');
});
