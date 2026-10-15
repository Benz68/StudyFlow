import test from 'node:test';
import assert from 'node:assert/strict';
import {previewItems,renderPlanPreview} from '../src/studyflow/plan-preview.mjs';
const state={events:[],weekly:{weekStart:'2026-12-27'}};
const plan={weekStart:'2026-12-27',sessions:[]};
const session=(i,extra={})=>({id:`s${i}`,goalId:'g',title:`Topic ${i}`,date:'2026-12-27',start:'09:00',end:'09:30',...extra});

test('preview offers all seven days, including a year boundary, and keeps empty days explicit',()=>{
 const html=renderPlanPreview(state,plan);
 assert.equal((html.match(/data-preview-day=/g)||[]).length,7);
 assert.match(html,/2\.1|2\/1/);
 assert.match(html,/זמן פנוי/);
 assert.match(html,/עמוד 1 מתוך 1/);
});

test('preview pages every item without overflow silently disappearing',()=>{
 const populated={...plan,sessions:Array.from({length:7},(_,i)=>session(i))};
 const first=renderPlanPreview(state,populated),second=renderPlanPreview(state,populated,{page:1}),last=renderPlanPreview(state,populated,{page:999});
 assert.match(first,/Topic 0/);assert.doesNotMatch(first,/Topic 3/);assert.match(first,/עמוד 1 מתוך 3/);
 assert.match(second,/Topic 3/);assert.match(second,/Topic 5/);assert.doesNotMatch(second,/Topic 6/);
 assert.match(last,/Topic 6/);assert.match(last,/עמוד 3 מתוך 3/);
 assert.equal((first.match(/data-wizard="move"/g)||[]).length,3);
});

test('fixed time includes travel once and cannot become a move action',()=>{
 const input={...state,events:[{id:'e',title:'Lecture <safe>',date:'2026-12-27',start:'10:00',end:'11:00',travelBefore:30,travelAfter:30}]};
 const items=previewItems(input,plan),html=renderPlanPreview(input,plan);
 assert.equal(items.length,1);assert.equal(items[0].start,570);assert.equal(items[0].end,690);
 assert.match(html,/כולל נסיעה/);assert.match(html,/Lecture &lt;safe&gt;/);assert.doesNotMatch(html,/data-wizard="move"/);
});

test('overnight commitments split across days and periods without showing events outside the week',()=>{
 const input={...state,events:[{id:'night',title:'Night',date:'2026-12-26',start:'23:00',end:'01:00',overnight:true}]};
 assert.deepEqual(previewItems(input,plan).map(i=>[i.date,i.start,i.end]),[['2026-12-27',0,60]]);
 const crossing={...plan,sessions:[session(0,{start:'11:30',end:'12:30'})]};
 assert.match(renderPlanPreview(state,crossing),/11:30–12:00/);
 assert.match(renderPlanPreview(state,crossing,{period:'afternoon'}),/12:00–12:30/);
 assert.doesNotMatch(renderPlanPreview(state,crossing,{period:'evening'}),/Topic 0/);
});

test('preview clamps external controls and escapes flexible titles and ids',()=>{
 const html=renderPlanPreview(state,{...plan,sessions:[session(0,{title:'<img onerror="x">',id:'" bad="x'})]},{day:99,page:-8,period:'<bad>'});
 assert.match(html,/data-preview-current-day="6"/);assert.match(html,/data-preview-current-period="morning"/);
 assert.match(html,/&lt;img onerror=&quot;x&quot;&gt;/);assert.doesNotMatch(html,/<img|id="" bad/);
 assert.match(renderPlanPreview({},{}),/לא נמצא שבוע/);
});
