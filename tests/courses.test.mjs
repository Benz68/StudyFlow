import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTopics, topicsFromText, courseProgress, courseLearningMinutes} from '../src/studyflow/courses.mjs';

test('course topics validate statuses, deduplicate IDs and limit imported state', () => {
  assert.deepEqual(normalizeTopics([null, {id:'a', title:' Topic ',status:'ready'}, {id:'a',title:'duplicate'}, {id:'b',title:'Second',status:'bad'}]),
    [{id:'a',title:'Topic',status:'ready'}, {id:'b',title:'Second',status:'new'}]);
  assert.equal(normalizeTopics(Array.from({length:250},(_,i)=>({id:String(i),title:'Topic'}))).length,200);
});
test('syllabus text supports Hebrew and preserves existing topic progress', () => {
  const previous = [{id:'old',title:'אינטגרלים',status:'learning'}]; let id = 0;
  const result = topicsFromText('1. אינטגרלים\n• נגזרות\n\n- נגזרות',previous,()=>`new-${++id}`);
  assert.deepEqual(result,[...previous,{id:'new-1',title:'נגזרות',status:'new'}]);
  assert.equal(previous.length,1);
});
test('oversized syllabus is rejected rather than silently truncated', () => {
  assert.throws(()=>topicsFromText(Array.from({length:201},(_,i)=>`Topic ${i}`).join('\n')));
  assert.throws(()=>topicsFromText('x'.repeat(161)));
});
test('readiness progress never substitutes study minutes for understanding', () => {
  const topics=[{id:'a',title:'A',status:'ready'},{id:'b',title:'B',status:'learning'},{id:'c',title:'C',status:'new'}];
  assert.deepEqual(courseProgress({topics}),{ready:1,total:3,learning:1,percent:33});
  assert.equal(courseProgress({}).percent,0);
  const state={goals:[{id:'g',courseId:'course'}],weekly:{completions:[{goalId:'g',minutes:90},{goalId:'other',minutes:100}]}};
  assert.equal(courseLearningMinutes(state,'course'),90);
  assert.equal(courseLearningMinutes(state,'different'),0);
});
