import test from 'node:test';
import assert from 'node:assert/strict';
import {saveGoalReport,reportGoalSession,removeGoalReport,updateGoalJournal} from '../src/studyflow/goal-progress.mjs';
import {normalizeWeekly} from '../src/studyflow/weekly.mjs';
const now=new Date(2026,9,14,14);
const state=()=>({goals:[{id:'g',title:'Study',minutes:120,journal:[{date:'2026-10-13',text:'old',feel:'ok'}]},{id:'other',title:'Other',minutes:120}],courses:[],weekly:{weekStart:'2026-10-11',completions:[],sessions:[{id:'s',goalId:'g',date:'2026-10-14',start:'10:00',end:'10:50',minutes:50},{id:'locked',goalId:'other',date:'2026-10-15',start:'10:00',end:'10:50',minutes:50,locked:true}]}});
const report={goalId:'g',sessionId:'manual-one',date:'2026-10-14',start:'11:00',end:'12:00',minutes:45};
test('report correction replaces identity and survives normalization without double counting',()=>{
 const s=state(),saved=saveGoalReport(s,report,now),edited=saveGoalReport(saved,{...report,minutes:30},now);
 assert.equal(s.weekly.completions.length,0);
 assert.equal(edited.weekly.completions.length,1);
 assert.equal(normalizeWeekly(edited,now).weekly.completions[0].minutes,30);
 assert.deepEqual(edited.weekly.sessions,s.weekly.sessions);
 assert.equal(removeGoalReport(edited,'g','manual-one').weekly.completions.length,0);
 assert.equal(removeGoalReport(edited,'other','manual-one').weekly.completions.length,1);
});
test('reject future, overlapping, invalid and excessive work instead of silently altering reports',()=>{
 const s=saveGoalReport(state(),report,now);
 for(const change of [{date:'2026-10-15'},{end:'15:00'},{minutes:61},{start:'bad'},{date:'2026-10-04'}])assert.throws(()=>saveGoalReport(state(),{...report,...change},now),RangeError);
 assert.throws(()=>saveGoalReport(s,{...report,sessionId:'new'},now),/כבר יש דיווח/);
 assert.throws(()=>saveGoalReport(s,{...report,sessionId:'new',start:'12:00',end:'14:00',minutes:100},now),/יעד הזמן/);
 assert.throws(()=>saveGoalReport(s,{...report,goalId:'other'},now),/אחרת/);
});
test('partial session counts actual minutes and preserves other locked sessions',()=>{
 const s=reportGoalSession(state(),'s',20,now);
 assert.equal(s.weekly.completions[0].end,'10:20');
 assert.equal(s.weekly.completions[0].minutes,20);
 assert.equal(s.weekly.sessions[0].id,'locked');
 assert.equal(s.weekly.sessions[0].locked,true);
 assert.throws(()=>reportGoalSession(s,'s',20,now),RangeError);
 assert.throws(()=>reportGoalSession(state(),'locked',50,now),RangeError);
});
test('journal edit and delete preserve original date and unrelated goals',()=>{
 const s=state(),edited=updateGoalJournal(s,'g',0,{text:'corrected',feel:'good'});
 assert.equal(edited.goals[0].journal.length,1);
 assert.equal(edited.goals[0].journal[0].date,'2026-10-13');
 assert.equal(edited.goals[0].journal[0].text,'corrected');
 assert.equal(s.goals[0].journal[0].text,'old');
 assert.deepEqual(edited.goals[1],s.goals[1]);
 assert.equal(updateGoalJournal(edited,'g',0,null).goals[0].journal.length,0);
 assert.throws(()=>updateGoalJournal(s,'g',9,null),RangeError);
});
