import {escapeHTML as esc, icon, duration} from './views.mjs';
import {courseProgress, courseLearningMinutes, normalizeTopics, topicsFromText} from './courses.mjs';
import {renderCourseJourney, journeyPage, journeyLabels} from './course-journey.mjs';

const labels = Object.entries(journeyLabels);
const heading = title => `<div class="sheet-top"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;
const error = '<p class="form-error" role="alert" data-course-error></p>';
const button = (action, title, id = '', extra = '') => `<button class="text-button" data-course-action="${action}" data-id="${esc(id)}" ${extra}>${title}</button>`;
function progress(course) {
  const p = courseProgress(course);
  return p.total ? `<p>${p.ready} מתוך ${p.total} נושאים מוכנים · ${p.learning} בלמידה</p><progress max="${p.total}" value="${p.ready}" aria-label="ההתקדמות בקורס ${esc(course.name)}">${p.percent}%</progress>` : '<p class="field-help">מוסיפים נושאים כשנוח לך. אפשר להתחיל גם בלי סילבוס.</p>';
}
const accents = ['#b8452f', '#0b7f84', '#5b6bbf', '#b07a1f', '#8a4f9e', '#3f8a4f'];
const difficultyLabel = {1: 'הולך בקלות', 2: 'צריך תרגול', 3: 'מאתגר כרגע'};
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
function examChip(date) {
  if (!date) return '';
  const days = Math.round((new Date(`${date}T00:00:00`) - today()) / 86400000);
  const label = days < 0 ? 'המבחן עבר' : days === 0 ? 'מבחן היום' : days === 1 ? 'מבחן מחר' : `מבחן בעוד ${days} ימים`;
  return `<span class="course-chip ${days >= 0 && days <= 14 ? 'urgent' : ''}" title="${esc(new Date(`${date}T12:00:00`).toLocaleDateString('he-IL'))}">${label}</span>`;
}
// Display the allocation managed by weekly planning.
const weeklyGoal = (state, id) => (state.goals || []).find(g => g.courseId === id && (g.repeatWeekly || g.weekStart === state.weekly.weekStart));
export function renderCourses(state) {
  const courses = state.courses || [];
  const head = `<section class="page-heading"><div class="eyebrow">כל הקורסים במקום אחד</div><h1>הקורסים</h1></section>`;
  if (!courses.length) return `${head}<section class="welcome"><div class="welcome-icon">${icon('tasks')}</div><h2>עוד אין כאן קורסים</h2><p>מוסיפים קורס ונושאים. את זמן הלמידה בוחרים בתכנון השבועי.</p><button class="primary" data-course-action="edit">${icon('plus')} הוספת קורס ראשון</button></section>`;
  const cards = courses.map((course, index) => {
    const p = courseProgress(course), goal = weeklyGoal(state, course.id), learned = courseLearningMinutes(state, course.id);
    return `<article class="course-card" style="--accent:${accents[index % accents.length]}">
      <div class="course-card-top"><h3>${esc(course.name)}</h3><div class="course-chips"><span class="course-chip">${difficultyLabel[course.difficulty] || difficultyLabel[2]}</span>${examChip(course.examDate)}</div></div>
      ${p.total ? `<div class="course-progress"><div class="mini-bar"><i style="width:${p.percent}%"></i></div><b>${p.percent}%</b></div><p class="course-meta">${p.ready} מתוך ${p.total} נושאים מוכנים${p.learning ? ` · ${p.learning} בלמידה` : ''}</p>`
        : `<p class="course-meta">עוד אין נושאים. ${button('topics', 'להוסיף מהסילבוס', course.id)}</p>`}
      <p class="course-meta">${icon('clock')} ${goal ? `${duration(goal.minutes)} בתכנון השבועי` : 'הזמן נקבע בתכנון השבועי'}${learned ? ` · השבוע: ${duration(learned)}` : ''}</p>
      <div class="course-actions">${button('open', 'נושאים והתקדמות', course.id)}${goal ? '' : button('goal', 'להקדיש זמן השבוע', course.id)}${button('edit', 'עריכה', course.id)}</div>
    </article>`;
  }).join('');
  return `${head}<div class="courses-toolbar"><p class="field-help">ההתקדמות לפי ההרגשה שלך בכל נושא. מבחן קרוב מקבל עדיפות בתכנון.</p><button class="primary" data-course-action="edit">${icon('plus')} קורס חדש</button></div><div class="course-grid">${cards}</div>`;
}

export function setupCoursesUI(ctx) {
  const {getState, open, close, mutate, replace, toast} = ctx;
  function saveCourse(course, message) {
    mutate(() => {
      const state = getState();
      replace({...state, courses: state.courses.some(item => item.id === course.id)
        ? state.courses.map(item => item.id === course.id ? course : item) : [...state.courses, course]});
    }, message);
  }
  const focusByCourse = new Map(), pageByCourse = new Map();
  function details(id, previousId = '') {
    const state = getState(), course = state.courses.find(item => item.id === id); if (!course) return;
    const selectedGoal = (state.goals || []).find(goal => goal.courseId === id && (goal.topicId || goal.topicIds?.length));
    const focus = focusByCourse.get(id) || selectedGoal?.topicIds?.[0] || selectedGoal?.topicId || '';
    const model = journeyPage(course, focus, pageByCourse.get(id));
    focusByCourse.set(id, model.focused?.id || ''); pageByCourse.set(id, model.page);
    open(`${heading(course.name)}${progress(course)}<p class="field-help">${duration(courseLearningMinutes(state, id))} למידה שדיווחת השבוע. ההתקדמות במסלול מבוססת על הבנה, לא על שעות.</p><div class="weekly-actions">${button('topics', 'הוספת נושאים / סילבוס', id)}${button('goal', 'לתכנן למידה בקורס הזה', id)}</div><div data-course-journey>${renderCourseJourney(course, focusByCourse.get(id), model.page, previousId)}</div>${error}`);

  }
  function edit(id) {
    const state = getState(), course = state.courses.find(item => item.id === id) || {};
    const radios = (name, items, value) => `<div class="choice-chips">${items.map(([v, t, sub]) => `<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(value) ? 'checked' : ''}><span>${t}${sub ? `<small>${sub}</small>` : ''}</span></label>`).join('')}</div>`;
    open(`${heading(course.id ? 'עריכת קורס' : 'קורס חדש')}<form id="course-edit" data-id="${esc(id || '')}">
      <label for="course-name">שם הקורס</label><input id="course-name" name="name" maxlength="120" value="${esc(course.name || '')}" required autofocus placeholder="למשל, סטטיסטיקה א׳">
      <fieldset><legend>איך הולך בקורס?</legend>${radios('difficulty', [[1, 'הולך בקלות'], [2, 'צריך תרגול'], [3, 'מאתגר', 'מפגשים קצרים יותר']], course.difficulty || 2)}</fieldset>
      <label for="course-exam">מתי המבחן? (לא חובה)</label><input id="course-exam" name="examDate" type="hidden" data-picker data-optional value="${esc(course.examDate || '')}"><small class="field-help">כשהמבחן מתקרב, הקורס יקבל עדיפות בתכנון.</small>
      ${error}<button class="primary submit-button">${course.id ? 'לשמור שינויים' : 'להוסיף קורס'}</button></form>`);
  }
  function topics(id) {
    const course = getState().courses.find(item => item.id === id); if (!course) return;
    open(`${heading('הנושאים בקורס')}<form id="course-topics" data-id="${esc(id)}"><p class="field-help">אפשר להדביק את רשימת הנושאים מהסילבוס או לטעון קובץ טקסט TXT. כל שורה תהפוך לנושא. כרגע קובצי PDF ו־Word אינם נתמכים ישירות.</p><label for="syllabus-file">טעינת רשימה מקובץ טקסט (לא חובה)</label><input id="syllabus-file" type="file" accept=".txt,text/plain" data-course-file><label for="syllabus-topics">בדיקה ועריכה לפני שמירה — נושא בכל שורה</label><textarea id="syllabus-topics" name="topics" rows="10" maxlength="100000">${esc(normalizeTopics(course.topics).map(topic => topic.title).join('\n'))}</textarea><small class="field-help">נושאים חדשים יתווספו לרשימה. נושאים קיימים וההתקדמות שלהם יישמרו.</small>${error}<button class="primary submit-button">לשמור את הנושאים</button></form>`);
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-course-action]'); if (!target) return;
    const id = target.dataset.id;
    if (target.dataset.courseAction === 'journey-focus') {
      const previous = event.detail ? focusByCourse.get(id) : '';
      focusByCourse.set(id, target.dataset.topicId); details(id, previous);
      document.querySelector('[data-course-journey] .journey-topic.selected')?.focus({preventScroll: true});
    }
    if (target.dataset.courseAction === 'journey-page') {
      pageByCourse.set(id, Number(target.dataset.page)); details(id);
      document.querySelector('[data-course-journey] .journey-topic.selected')?.focus({preventScroll: true});
    }
    if (target.dataset.courseAction === 'open') details(id);
    if (target.dataset.courseAction === 'edit') edit(id);
    if (target.dataset.courseAction === 'topics') topics(id);
    if (target.dataset.courseAction === 'goal') ctx.addGoal(id, target.dataset.topicId || '');
  });
  document.addEventListener('change', async event => {
    const target = event.target;
    if (target.matches('[data-course-status]')) {
      const course = getState().courses.find(item => item.id === target.dataset.courseStatus);
      if (!course || !labels.some(([value]) => value === target.value)) return;
      saveCourse({...course, topics: normalizeTopics(course.topics).map(topic => topic.id === target.dataset.topicId ? {...topic, status: target.value} : topic)}, 'ההתקדמות בקורס נשמרה.');
      const completed = target.value === 'ready';
      const nextTopic = completed && getState().courses.find(c => c.id === course.id)?.topics.find(t => t.id !== target.dataset.topicId && t.status !== 'ready');
      focusByCourse.set(course.id, nextTopic?.id || target.dataset.topicId);
      if(nextTopic)pageByCourse.delete(course.id);
      details(course.id, completed ? target.dataset.topicId : '');
      document.querySelector('#journey-status')?.focus({preventScroll: true});
    }
    if (target.matches('[data-course-file]')) {
      const file = target.files?.[0], form = target.closest('form'); if (!file) return;
      try {
        if (!/\.txt$/i.test(file.name) || file.size > 1000000) throw Error('נבחר קובץ TXT עד 1MB. אפשר גם להעתיק את הנושאים לשדה שמתחת.');
        const text = await file.text(); topicsFromText(text);
        if (!form.isConnected) return;
        const area = form.elements.topics;
        area.value = [area.value.trim(), text.trim()].filter(Boolean).join('\n');
        form.querySelector('[data-course-error]').textContent = '';
        toast('הרשימה נטענה לבדיקה. היא תישמר רק בלחיצה על שמירה.');
      } catch (e) { form.querySelector('[data-course-error]').textContent = e.message; }
      target.value = '';
    }
  });
  document.addEventListener('submit', event => {
    const form = event.target; if (!['course-edit', 'course-topics'].includes(form.id)) return;
    event.preventDefault(); const fd = new FormData(form), previous = getState().courses.find(item => item.id === form.dataset.id);
    try {
      if (form.id === 'course-edit') {
        const name = String(fd.get('name') || '').trim(); if (!name || name.length > 120) throw Error('נבחר שם לקורס, עד 120 תווים.');
        if (!previous && getState().courses.length >= 100) throw Error('אפשר לשמור עד 100 קורסים.');
        const course = {...previous, id: previous?.id || crypto.randomUUID(), name, difficulty: Number(fd.get('difficulty')) || 2, examDate: fd.get('examDate'), topics: previous?.topics || []};
        saveCourse(course, 'הקורס נשמר. את זמן הלמידה בוחרים בתכנון השבועי.');
        close();
      } else {
        if (!previous) throw Error('הקורס לא נמצא.');
        const imported = topicsFromText(String(fd.get('topics') || ''), previous.topics);
        const titles = new Set(imported.map(topic => topic.title));
        const combined = [...normalizeTopics(previous.topics).filter(topic => !titles.has(topic.title)), ...imported];
        if (combined.length > 200) throw Error('אפשר לשמור עד 200 נושאים בקורס.');
        saveCourse({...previous, topics: combined}, 'הנושאים נשמרו. אפשר לעדכן התקדמות בקצב שלך.'); details(previous.id);
      }
    } catch (e) { form.querySelector('[data-course-error]').textContent = e.message; }
  });
  return {edit, details};
}
