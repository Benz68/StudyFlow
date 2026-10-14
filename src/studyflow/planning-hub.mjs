import {escapeHTML as esc,icon,duration,eventList,taskList} from './views.mjs';
import {addDays,planningTarget} from './weekly.mjs';
const date=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{day:'numeric',month:'long'});
export function renderPlanningHub(state){
 const start=state.weekly.weekStart,target=planningTarget();
 const goals=state.goals.filter(g=>g.repeatWeekly||g.weekStart===start);
 const row=g=>`<article class="task-item"><div><h3>${esc(g.title)}</h3><p>${duration(g.minutes)} לשבוע${state.weekly.skippedGoalIds?.includes(g.id)?' · בהפסקה השבוע':''}${g.courseId?' · '+esc(state.courses.find(c=>c.id===g.courseId)?.name||''):''}</p></div><button class="text-button" data-weekly="goal" data-id="${esc(g.id)}">עריכה</button></article>`;
 const step=(n,kind,title,text,content,action)=>`<li class="hub-step ${kind==='fixed'?'is-fixed':'is-flex'}"><div class="hub-step-head"><span class="hub-num" aria-hidden="true">${n}</span><div><h2>${title}</h2><span class="hub-tag">${kind==='fixed'?'זמן קבוע · לא זז':'זמן גמיש · המערכת מוצאת מקום'}</span></div></div><p class="hub-desc">${text}</p>${content}${action}</li>`;
 const empty=text=>`<p class="hub-empty">${text}</p>`;
 return `<section class="page-heading"><h1>התכנון שלי</h1><p>מוסיפים כאן מה יש לך השבוע, והיומן מסדר את הכול.</p></section>
 <div class="hub-hero"><div class="hub-hero-text"><span class="eyebrow">${target===start?'השבוע הנוכחי':'השבוע הבא'}</span><h2>${date(target)} – ${date(addDays(target,6))}</h2><p>כמה שאלות קצרות, והשבוע שלך מוכן.</p></div><button class="primary" data-weekly="pace">שאלון התכנון ${icon('arrow')}</button><small>עד שבת ב־19:00 השאלון מעדכן את השבוע הנוכחי. אחר כך הוא מתכנן את השבוע הבא.</small></div>
 <ol class="hub-steps">
 ${step(1,'fixed','מה כבר תפוס','שיעורים, עבודה, נסיעות ופגישות. בשעות האלה לא נשבץ כלום.',eventList(state.events)||empty('עוד אין כאן כלום. כדאי להתחיל מכאן.'),`<button class="hub-add" data-action="add-fixed">${icon('plus')} הוספת התחייבות</button>`)}
 ${step(2,'flex','זמן ללימודים','כמה זמן להשקיע בכל קורס השבוע, בלי לקבוע שעה.',goals.filter(g=>g.category==='study').map(row).join('')||empty('עוד לא נבחר זמן לקורסים.'),`<button class="hub-add" data-weekly="pace">${icon('plus')} לבחור קורסים וזמני למידה</button>`)}
 ${step(3,'flex','מטרות אישיות','אימון, תחביב או פרויקט שחשוב לך לקדם.',goals.filter(g=>g.category!=='study').map(row).join('')||empty('עוד אין מטרות אישיות.'),`<button class="hub-add" data-weekly="goal">${icon('plus')} מטרה אישית חדשה</button>`)}
 ${step(4,'flex','משימות עם תאריך יעד','עבודות, הגשות וסידורים. המערכת מוצאת להם זמן לפני התאריך.',state.tasks.length?taskList(state):empty('עוד אין משימות עם תאריך יעד.'),`<button class="hub-add" data-action="add-task">${icon('plus')} משימה עם תאריך יעד</button>`)}
 </ol>`;
}
