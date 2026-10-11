import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWeekly,buildWeeklyPlan,reviewAvailability,previewNextWeek,acceptNextWeek,adjustWeeklyPlan,releaseFlexibleSessions,planningTarget,preparePlanningWeek,acceptPlanningWeek,currentPlanningState} from '../src/studyflow/weekly.mjs';

const sunday=new Date(2026,9,11,8), saturday=new Date(2026,9,17,20);
const initial=()=>({tasks:[],events:[],preferences:{startHour:9,endHour:21,maxDailyMinutes:240},...normalizeWeekly({
  goals:[{id:'math',title:'Math',category:'study',minutes:240,repeatWeekly:true},
    {id:'music',title:'Music',category:'personal',minutes:120,repeatWeekly:true}],weekly:{weekStart:'2026-10-11'}},sunday)});

test('one questionnaire targets current week until Saturday 19:00, then the next week',()=>{
  assert.equal(planningTarget(new Date(2026,9,17,18,59)),'2026-10-11');
  assert.equal(planningTarget(new Date(2026,9,17,19)),'2026-10-18');
  assert.equal(planningTarget(new Date(2026,9,18,0)),'2026-10-18');
  assert.equal(reviewAvailability(initial(),sunday).open,true);
  assert.equal(preparePlanningWeek(initial(),sunday).weekly.weekStart,'2026-10-11');
});

test('repeated edits are allowed, preserve reports, and cannot create a third week',()=>{
  const s=initial();s.weekly.sessions=buildWeeklyPlan(s,sunday).retainedSessions;
  const done=s.weekly.sessions.shift();s.weekly.completions=[{sessionId:done.id,goalId:done.goalId,date:done.date,start:done.start,end:done.end,minutes:Math.min(20,done.minutes)}];
  let draft=preparePlanningWeek(s,sunday);draft.weekly.completions=[];
  const first=acceptPlanningWeek(s,draft,sunday);
  assert.deepEqual(first.weekly.completions,s.weekly.completions);
  draft=preparePlanningWeek(first,sunday);draft.weekly.load='light';
  const edited=acceptPlanningWeek(first,draft,sunday);assert.equal(edited.weekly.load,'light');
  const future=preparePlanningWeek(edited,saturday),accepted=acceptPlanningWeek(edited,future,saturday);
  assert.deepEqual(accepted.weekly.completions,s.weekly.completions);
  assert.deepEqual(accepted.weekly.nextWeek.weekly.completions,[]);
  assert.equal(accepted.weekly.nextWeek.goals.find(g=>g.id==='math').minutes,240);
  const updated=acceptPlanningWeek(accepted,preparePlanningWeek(accepted,saturday),saturday);
  assert.equal(updated.weekly.nextWeek.weekly.reviews.length,1);
  const third=structuredClone(future);third.weekly.weekStart='2026-10-25';
  assert.throws(()=>acceptPlanningWeek(accepted,third,saturday),RangeError);
  const promoted=preparePlanningWeek(updated,new Date(2026,9,18,8));assert.equal(promoted.weekly.weekStart,'2026-10-18');
});

test('stale dialogs reject a target change, while Sunday keeps the Saturday target',()=>{
  const s=initial(), before=new Date(2026,9,17,18,59),after=new Date(2026,9,17,19);
  assert.throws(()=>acceptPlanningWeek(s,preparePlanningWeek(s,before),after),RangeError);
  const future=preparePlanningWeek(s,after);
  assert.equal(acceptPlanningWeek(s,future,new Date(2026,9,18,8)).weekly.weekStart,'2026-10-18');
  assert.throws(()=>acceptPlanningWeek(s,future,new Date(2026,9,24,19)),RangeError);
});

test('editing the current week preserves an independently prepared next week',()=>{
  const s=initial(), future=preparePlanningWeek(s,saturday);
  s.weekly.nextWeek=normalizeWeekly(future,saturday,true);
  const edited=preparePlanningWeek(s,sunday);edited.weekly.load='heavy';
  const accepted=acceptPlanningWeek(s,edited,sunday);
  assert.deepEqual(accepted.weekly.nextWeek,s.weekly.nextWeek);
  const stale=structuredClone(s);stale.weekly.weekStart='2026-10-04';
  assert.deepEqual(currentPlanningState(stale,sunday).weekly.nextWeek,s.weekly.nextWeek);
});

test('late return resets old placements and retains current course metadata on promotion',()=>{
  const s=initial();s.weekly.sessions=buildWeeklyPlan(s,sunday).retainedSessions;
  const late=new Date(2026,10,2,8),fresh=currentPlanningState(s,late);
  assert.equal(fresh.weekly.weekStart,'2026-11-01');
  assert.ok(fresh.weekly.sessions.every(x=>x.date>='2026-11-01'));
  const accepted=acceptPlanningWeek(s,preparePlanningWeek(s,saturday),saturday);
  accepted.courses=[{id:'c',name:'Latest',topics:[],difficulty:3}];
  assert.equal(currentPlanningState(accepted,new Date(2026,9,18,8)).courses[0].name,'Latest');
  assert.equal(currentPlanningState(s,new Date(2026,10,7,20)).weekly.weekStart,'2026-11-01');
});

test('fresh rollover at 15:00 never invents missed morning sessions',()=>{
  const now=new Date(2026,9,18,15),s=initial();
  const fresh=currentPlanningState(s,now);
  assert.ok(fresh.weekly.sessions.length>0);
  assert.ok(fresh.weekly.sessions.every(x=>x.date>'2026-10-18'||x.date==='2026-10-18'&&x.start>='15:00'));
  const approved=acceptPlanningWeek(s,preparePlanningWeek(s,saturday),saturday);
  const expected=approved.weekly.nextWeek.weekly.sessions;
  assert.deepEqual(currentPlanningState(approved,now).weekly.sessions,expected);
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
