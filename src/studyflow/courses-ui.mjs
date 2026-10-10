import {escapeHTML as esc, icon, duration} from './views.mjs';
import {courseProgress, courseLearningMinutes, normalizeTopics, topicsFromText} from './courses.mjs';

const labels = [['new', 'עוד לא התחלתי'], ['learning', 'בלמידה'], ['ready', 'מרגיש מוכן']];
const heading = title => `<div class="sheet-top"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;
const error = '<p class="form-error" role="alert" data-course-error></p>';
const button = (action, title, id = '', extra = '') => `<button class="text-button" data-course-action="${action}" data-id="${esc(id)}" ${extra}>${title}</button>`;
function progress(course) {
  const p = courseProgress(course);
  return p.total ? `<p>${p.ready} מתוך ${p.total} נושאים מוכנים · ${p.learning} בלמידה</p><progress max="${p.total}" value="${p.ready}" aria-label="ההתקדמות בקורס ${esc(course.name)}">${p.percent}%</progress>` : '<p class="field-help">מוסיפים נושאים כשנוח לך. אפשר להתחיל גם בלי סילבוס.</p>';
}
export function renderCourses(state) {
  return `<section class="weekly-goals courses-area"><div class="weekly-actions"><h2>הקורסים שלי</h2>${button('edit', `${icon('plus')} קורס חדש`)}</div><p class="field-help">ההתקדמות לפי ההרגשה שלך בכל נושא. זמן הלמידה מוצג בנפרד.</p>${(state.courses || []).map(course => `<article class="course-row"><h3>${esc(course.name)}</h3>${progress(course)}<small class="field-help">${duration(courseLearningMinutes(state, course.id))} למידה שדיווחת השבוע${course.examDate ? ` · מבחן ב־${esc(course.examDate)}` : ''}</small><div class="weekly-actions">${button('open', 'לנושאים ולהתקדמות', course.id)}${button('goal', 'להוסיף למטרות השבוע', course.id)}${button('edit', 'עריכת קורס', course.id)}</div></article>`).join('') || '<p>הקורס הראשון שלך מתחיל כאן. מספיק שם כדי לצאת לדרך.</p>'}</section>`;
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
  function details(id) {
    const state = getState(), course = state.courses.find(item => item.id === id); if (!course) return;
    open(`${heading(course.name)}${progress(course)}<p class="field-help">${duration(courseLearningMinutes(state, id))} למידה שדיווחת השבוע. סימון נושא אינו תלוי בכמות השעות.</p><div class="weekly-actions">${button('topics', 'הוספת נושאים / סילבוס', id)}${button('goal', 'להוסיף למטרות השבוע', id)}</div>${normalizeTopics(course.topics).map(topic => `<div class="course-topic"><label for="topic-${esc(topic.id)}">${esc(topic.title)}</label><select id="topic-${esc(topic.id)}" data-course-status="${esc(id)}" data-topic-id="${esc(topic.id)}">${labels.map(([value, title]) => `<option value="${value}" ${value === topic.status ? 'selected' : ''}>${title}</option>`).join('')}</select>${button('goal', 'להקדיש לזה זמן השבוע', id, `data-topic-id="${esc(topic.id)}"`)}</div>`).join('')}${error}`);
  }
  function edit(id) {
    const course = getState().courses.find(item => item.id === id) || {};
    open(`${heading(course.id ? 'עריכת קורס' : 'קורס חדש')}<form id="course-edit" data-id="${esc(id || '')}"><label for="course-name">שם הקורס</label><input id="course-name" name="name" maxlength="120" value="${esc(course.name || '')}" required autofocus><label for="course-difficulty">איך הולך כרגע?</label><select id="course-difficulty" name="difficulty">${[['1','די נוח'],['2','צריך תרגול'],['3','מאתגר כרגע']].map(([v,t])=>`<option value="${v}" ${Number(v)===(course.difficulty || 2)?'selected':''}>${t}</option>`).join('')}</select><label for="course-exam">מועד מבחן (לא חובה)</label><input id="course-exam" name="examDate" type="date" value="${esc(course.examDate || '')}">${error}<button class="primary submit-button">לשמור קורס</button></form>`);
  }
  function topics(id) {
    const course = getState().courses.find(item => item.id === id); if (!course) return;
    open(`${heading('הנושאים בקורס')}<form id="course-topics" data-id="${esc(id)}"><p class="field-help">אפשר להדביק את רשימת הנושאים מהסילבוס או לטעון קובץ טקסט TXT. כל שורה תהפוך לנושא. כרגע קובצי PDF ו־Word אינם נתמכים ישירות.</p><label for="syllabus-file">טעינת רשימה מקובץ טקסט (לא חובה)</label><input id="syllabus-file" type="file" accept=".txt,text/plain" data-course-file><label for="syllabus-topics">בדיקה ועריכה לפני שמירה — נושא בכל שורה</label><textarea id="syllabus-topics" name="topics" rows="10" maxlength="100000">${esc(normalizeTopics(course.topics).map(topic => topic.title).join('\n'))}</textarea><small class="field-help">נושאים חדשים יתווספו לרשימה. נושאים קיימים וההתקדמות שלהם יישמרו.</small>${error}<button class="primary submit-button">לשמור את הנושאים</button></form>`);
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-course-action]'); if (!target) return;
    const id = target.dataset.id;
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
      const dialog = target.closest('dialog') || target.parentElement.parentElement;
      const bar = dialog.querySelector('progress');
      const updated = getState().courses.find(item => item.id === course.id);
      if (bar) { const p = courseProgress(updated); bar.value = p.ready; bar.textContent = `${p.percent}%`; bar.previousElementSibling.textContent = `${p.ready} מתוך ${p.total} נושאים מוכנים · ${p.learning} בלמידה`; }
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
        saveCourse({...previous, id: previous?.id || crypto.randomUUID(), name, difficulty: Number(fd.get('difficulty')), examDate: fd.get('examDate'), topics: previous?.topics || []}, 'הקורס נשמר.'); close();
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
}
