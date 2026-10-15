import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyPage, renderCourseJourney} from '../src/studyflow/course-journey.mjs';

const course = {id: 'math', name: 'מתמטיקה', topics: Array.from({length: 10}, (_, index) => ({id: `t${index}`, title: `נושא ${index}`, status: index === 7 ? 'ready' : 'new'}))};
test('journey focus can skip milestones without completing intervening topics', () => {
  const model = journeyPage(course, 't7');
  assert.equal(model.page, 1);
  assert.equal(model.focused.id, 't7');
  assert.deepEqual(model.visible.map(topic => topic.status), ['new', 'new', 'new', 'ready']);
  const html = renderCourseJourney(course, 't7');
  assert.equal((html.match(/journey-stone ready/g) || []).length, 1);
  assert.match(html, /1 מתוך 10/);
  assert.equal(course.topics[6].status, 'new');
});
test('journey pages are bounded and never drop topics on the final page', () => {
  assert.equal(journeyPage(course, '', -100).page, 0);
  assert.equal(journeyPage(course, '', 100).page, 2);
  assert.deepEqual(journeyPage(course, '', 2).visible.map(topic => topic.id), ['t8', 't9']);
  assert.equal(journeyPage({topics: []}).focused, undefined);
});
test('journey escapes syllabus content and exposes status controls', () => {
  const html = renderCourseJourney({id: 'x', topics: [{id: 'a', title: '<img onerror=alert(1)>', status: 'learning'}]});
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
  assert.match(html, /data-course-status="x"/);
  assert.match(html, /למדתי והבנתי/);
  assert.match(html, /aria-pressed="true"/);
});
test('journey motion is only emitted when changing focus within a page', () => {
  assert.match(renderCourseJourney(course, 't1', 0, 't0'), /journey-person-move/);
  assert.doesNotMatch(renderCourseJourney(course, 't1', 0), /journey-person-move/);
});
