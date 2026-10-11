import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonthDates,calendarEvents,calendarPlacements,renderCalendar} from '../src/studyflow/calendar.mjs';

test('month dates cover complete Sunday to Saturday rows across year boundaries',()=>{
  const dates=calendarMonthDates('2027-01');
  assert.equal(dates[0],'2026-12-27');assert.equal(dates.at(-1),'2027-02-06');
  assert.equal(dates.length,42);assert.throws(()=>calendarMonthDates('2026-13'));
});
test('monthly calendar contains only fixed commitments, even when a goal is locked',()=>{
  const state={events:[{id:'fixed',title:'Lecture',date:'2026-10-11',start:'10:00',end:'11:00'}],weekly:{weekStart:'2026-10-11'}};
  const plan={sessions:[{id:'goal',goalId:'g',title:'Flexible secret',locked:true,date:'2026-10-11',start:'12:00',end:'13:00'}]};
  const html=renderCalendar({state,plan,mode:'month',month:'2026-10'});
  assert.match(html,/Lecture/);assert.doesNotMatch(html,/Flexible secret|data-weekly=/);
  assert.match(html,/data-calendar-month="2026-11"/);
});
test('monthly expansion honors recurrence end and exceptions without duplicating overnight segments',()=>{
  const events=[{id:'night',date:'2026-09-30',start:'23:00',end:'01:00',overnight:true},
    {id:'recurring',date:'2026-10-01',start:'08:00',end:'09:00',repeat:'weekly',weekdays:[0],excludedDates:['2026-10-11'],repeatUntil:'2026-10-18'}];
  const result=calendarEvents(events,calendarMonthDates('2026-10'));
  assert.deepEqual(result.filter(e=>e.id==='recurring').map(e=>e.date),['2026-10-04','2026-10-18']);
  assert.deepEqual(result.filter(e=>e.id==='night').map(e=>[e.date,e.start,e.end]),[['2026-09-30','23:00','24:00'],['2026-10-01','00:00','01:00']]);
});
test('calendar uses real times and separates concurrent event columns',()=>{
  const result=calendarPlacements([{id:'a',start:'10:00',end:'12:00'},{id:'b',start:'11:00',end:'11:30'},{id:'c',start:'12:00',end:'13:00'}]);
  assert.deepEqual(result.map(x=>[x.id,x.lane,x.lanes]),[['a',0,2],['b',1,2],['c',0,1]]);
  const html=renderCalendar({state:{events:[]},plan:{weekStart:'2026-10-11',sessions:[{id:'g',goalId:'g',title:'<Study>',date:'2026-10-11',start:'10:15',end:'11:00'}]}});
  assert.match(html,/top:162px;height:54px/);assert.match(html,/data-weekly="move"/);assert.match(html,/&lt;Study&gt;/);
});
test('month shows every commitment beyond compact preview through expandable details',()=>{
  const events=Array.from({length:5},(_,i)=>({id:`e${i}`,title:`Event ${i}`,date:'2026-10-11',start:'10:00',end:'11:00'}));
  const html=renderCalendar({state:{events},mode:'month',month:'2026-10'});
  assert.match(html,/<details class="calendar-more"><summary>עוד 3/);
  for(let i=0;i<5;i++)assert.match(html,new RegExp(`data-id="e${i}"`));
});
