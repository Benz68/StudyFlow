import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWeekly,buildWeeklyPlan,reviewAvailability,previewNextWeek,acceptNextWeek,adjustWeeklyPlan,releaseFlexibleSessions} from '../src/studyflow/weekly.mjs';

const sunday=new Date(2026,9,11,8), saturday=new Date(2026,9,17,20);
const initial=()=>({tasks:[],events:[],preferences:{startHour:9,endHour:21,maxDailyMinutes:240},...normalizeWeekly({
  goals:[{id:'math',title:'Math',category:'study',minutes:240,repeatWeekly:true},
    {id:'music',title:'Music',category:'personal',minutes:120,repeatWeekly:true}],weekly:{weekStart:'2026-10-11'}},sunday)});

test('review opens Saturday at 20:00 local and remains available when missed',()=>{
  const s=initial();
  assert.equal(reviewAvailability(s,new Date(2026,9,17,19,59)).open,false);
  assert.equal(reviewAvailability(s,saturday).open,true);
  assert.equal(reviewAvailability(s,new Date(2026,9,19,9)).open,true);
  assert.throws(()=>previewNextWeek(s,sunday),RangeError);
});

test('review submits once, pending edits survive, third week is forbidden',()=>{
  const s=initial(), future=previewNextWeek(s,saturday), accepted=acceptNextWeek(s,future,saturday);
  assert.equal(reviewAvailability(accepted,saturday).submitted,true);
  const withoutPending=structuredClone(accepted);delete withoutPending.weekly.nextWeek;
  assert.equal(reviewAvailability(withoutPending,saturday).submitted,true);
  assert.throws(()=>previewNextWeek(accepted,saturday),RangeError);
  const edited=adjustWeeklyPlan({...s,...accepted.weekly.nextWeek},'shorter',saturday);
  const updated=acceptNextWeek(accepted,edited,saturday);
  assert.deepEqual(updated.weekly.nextWeek.weekly.reviews,accepted.weekly.nextWeek.weekly.reviews);
  assert.equal(updated.weekly.nextWeek.goals[0].sessionMinutes,30);
  assert.throws(()=>previewNextWeek({...s,...updated.weekly.nextWeek},saturday),RangeError);
  const third=structuredClone(future);third.weekly.weekStart='2026-10-25';
  assert.throws(()=>acceptNextWeek(accepted,third,saturday),RangeError);
  const promoted=normalizeWeekly(updated,new Date(2026,9,18,8));
  assert.equal(promoted.weekly.weekStart,'2026-10-18');
  assert.equal(reviewAvailability(promoted,new Date(2026,9,18,8)).open,false);
});

test('late review skips empty calendar weeks without creating third-week chains',()=>{
  const s=initial(), late=new Date(2026,10,2,8);
  const future=previewNextWeek(s,late), accepted=acceptNextWeek(s,future,late);
  assert.equal(accepted.weekly.weekStart,'2026-11-01');
  assert.equal(reviewAvailability(accepted,late).open,false);
});

test('adjustments preserve locked placements and redistribute without inflating total goals',()=>{
  const s=initial();s.weekly.sessions=buildWeeklyPlan(s,sunday).retainedSessions;
  const locked=s.weekly.sessions[0];locked.locked=true;
  const original=JSON.stringify(s), sum=x=>x.goals.reduce((n,g)=>n+g.minutes,0);
  const more=adjustWeeklyPlan(s,'study-more',sunday);
  assert.equal(sum(more),sum(s));
  assert.equal(more.goals.find(g=>g.id==='math').minutes,270);
  assert.equal(more.goals.find(g=>g.id==='music').minutes,90);
  assert.ok(more.weekly.sessions.some(x=>x.id===locked.id && x.start===locked.start && x.locked));
  assert.equal(JSON.stringify(s),original);
  const lighter=adjustWeeklyPlan(s,'lighter',sunday);
  assert.ok(sum(lighter)<sum(s));
  assert.ok(lighter.goals.find(g=>g.id===locked.goalId).minutes>=locked.minutes);
  const short=adjustWeeklyPlan(s,'shorter',sunday);
  assert.ok(short.weekly.sessions.filter(x=>!x.locked).every(x=>x.minutes<=30));
});

test('moving time preferences releases flexible sessions while retaining completed work',()=>{
  const s=initial();s.weekly.sessions=buildWeeklyPlan(s,sunday).retainedSessions;
  const done=s.weekly.sessions.shift();
  s.weekly.completions=[{sessionId:done.id,goalId:done.goalId,date:done.date,start:done.start,end:done.end,minutes:Math.min(20,done.minutes)}];
  const evening=adjustWeeklyPlan(s,'evening',sunday);
  assert.deepEqual(evening.weekly.completions,s.weekly.completions);
  assert.ok(evening.weekly.sessions.every(x=>x.start>='17:00'));
  const later=releaseFlexibleSessions(s,new Date(2026,9,12,11));
  assert.ok(later.weekly.sessions.every(x=>x.date<'2026-10-12'||(x.date==='2026-10-12'&&x.start<'11:00')));
});

test('skipping a goal retains locks but does not refill flexible work',()=>{
  const s=initial();s.weekly.sessions=buildWeeklyPlan(s,sunday).retainedSessions;
  const lock=s.weekly.sessions.find(x=>x.goalId==='math');lock.locked=true;s.weekly.skippedGoalIds=['math'];
  const plan=buildWeeklyPlan(s,sunday);
  assert.deepEqual(plan.sessions.filter(x=>x.goalId==='math').map(x=>x.id),[lock.id]);
  assert.equal(plan.unscheduled.filter(x=>x.goalId==='math').length,0);
});
