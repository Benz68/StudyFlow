import {normalizeTopics, courseProgress} from './courses.mjs';
import {escapeHTML as esc} from './views.mjs';

export const journeyLabels = {new: 'עוד לא התחלתי', learning: 'למדתי, עדיין מתרגל/ת', ready: 'למדתי והבנתי'};
export function journeyPage(course, focusId = '', requestedPage) {
  const topics = normalizeTopics(course?.topics);
  const focus = topics.findIndex(topic => topic.id === focusId);
  const pageCount = Math.max(1, Math.ceil(topics.length / 4));
  const page = Math.max(0, Math.min(pageCount - 1, Number.isInteger(requestedPage) ? requestedPage : Math.floor(Math.max(0, focus) / 4)));
  const visible = topics.slice(page * 4, page * 4 + 4);
  return {topics, visible, page, pageCount, focused: visible.find(topic => topic.id === focusId) || visible.find(topic => topic.status === 'learning') || visible.find(topic => topic.status !== 'ready') || visible[0]};
}

export function renderCourseJourney(course, focusId = '', requestedPage, previousId = '') {
  const model = journeyPage(course, focusId, requestedPage), {visible, page, pageCount, focused} = model;
  if (!visible.length) return '<p class="journey-empty">המסלול שלך מתחיל בנושא הראשון. אפשר להוסיף אותו עכשיו ולהשלים את הסילבוס בהמשך.</p>';
  const points = visible.map((topic, index) => ({x: index % 2 ? 305 : 55, y: 55 + index * 88}));
  const focusedIndex = visible.indexOf(focused), point = points[focusedIndex];
  const oldIndex = visible.findIndex(topic => topic.id === previousId), old = points[oldIndex];
  const p = courseProgress(course);
  const path = points.map((point, index) => index ? `C ${points[index - 1].x} ${point.y - 30}, ${point.x} ${point.y - 58}, ${point.x} ${point.y}` : `M ${point.x} ${point.y}`).join(' ');
  const motion = old && oldIndex !== focusedIndex ? ` style="--journey-from-x:${old.x - point.x}px;--journey-from-y:${old.y - point.y}px" class="journey-person journey-person-move"` : ' class="journey-person"';
  return `<section class="course-journey" aria-label="מסלול ההתקדמות בקורס">
    <p class="journey-summary"><strong>${p.ready} מתוך ${p.total}</strong> אבני דרך הושלמו לפי הדיווח שלך</p>
    <p class="field-help">אפשר ללמוד בכל סדר. הדמות מסמנת את הנושא שבחרת; רק אבן עם ✓ הושלמה.</p>
    <div class="journey-map" style="--journey-height:${88 * visible.length + 10}px">
      <svg viewBox="0 0 360 ${88 * visible.length + 10}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path class="journey-trail" d="${path}"/>
        ${visible.map((topic, index) => `<g class="journey-stone ${topic.status}" transform="translate(${points[index].x} ${points[index].y})"><circle r="19"/><text text-anchor="middle" dy="6">${topic.status === 'ready' ? '✓' : page * 4 + index + 1}</text></g>`).join('')}
        <g transform="translate(${point.x} ${point.y - 34})"><g${motion}><circle cy="-12" r="7"/><path d="M0 -4 L0 10 M0 0 L-9 6 M0 0 L9 4 M0 10 L-7 20 M0 10 L7 20"/></g></g>
      </svg>
      <div class="journey-topics">${visible.map((topic, index) => `<button class="journey-topic ${topic.id === focused.id ? 'selected' : ''}" style="top:${points[index].y - 26}px" data-course-action="journey-focus" data-id="${esc(course.id)}" data-topic-id="${esc(topic.id)}" aria-pressed="${topic.id === focused.id}"><strong>${esc(topic.title)}</strong><small>${journeyLabels[topic.status]}</small></button>`).join('')}</div>
    </div>
    ${pageCount > 1 ? `<nav class="journey-pages" aria-label="חלקי המסלול"><button class="text-button" data-course-action="journey-page" data-id="${esc(course.id)}" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>הקודמים</button><span>חלק ${page + 1} מתוך ${pageCount}</span><button class="text-button" data-course-action="journey-page" data-id="${esc(course.id)}" data-page="${page + 1}" ${page === pageCount - 1 ? 'disabled' : ''}>הבאים</button></nav>` : ''}
    <div class="journey-review"><h3>עדכון ההתקדמות השבועית</h3><label for="journey-status">איך התקדם הנושא „${esc(focused.title)}”?</label><select id="journey-status" data-course-status="${esc(course.id)}" data-topic-id="${esc(focused.id)}">${Object.entries(journeyLabels).map(([value, label]) => `<option value="${value}" ${focused.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select><small class="field-help">גם אם צריך עוד תרגול, זמן הלמידה שהשקעת נשמר. אפשר לתקן את הסימון בכל רגע.</small></div>
  </section>`;
}
