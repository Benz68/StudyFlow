import {escapeHTML as esc,icon,duration} from './views.mjs';
import {setupWeeklyWizard} from './weekly-wizard.mjs';
import {localDate} from './planner.mjs';
import {buildWeeklyPlan,previewNextWeek,acceptNextWeek,completeWeeklySession,moveWeeklySession,setSessionLocked,addDays,weekStart,reviewAvailability,applyChange} from './weekly.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const loads=[['light','קל · יותר מקום לנשום'],['balanced','מאוזן'],['heavy','מלא · קצת יותר התקדמות']];
const paces=[['low','רגוע · מפגשים קצרים'],['normal','רגיל'],['high','מלא מרץ']];
const options=(values,value)=>values.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('');
// Pill-shaped radio/checkbox choices: one tap instead of a dropdown.
const chips=(name,items,value,type='radio')=>`<div class="choice-chips">${items.map(([v,t,sub])=>`<label><input type="${type}" name="${name}" value="${esc(v)}" ${(Array.isArray(value)?value.includes(v):v===value)?'checked':''}><span>${t}${sub?`<small>${sub}</small>`:''}</span></label>`).join('')}</div>`;
const heading=t=>`<div class="sheet-top"><h2 id="dialog-title">${t}</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;
const error='<p id="weekly-error" class="form-error" role="alert"></p>';
const submit=t=>`${error}<button class="primary submit-button" type="submit">${t}</button>`;
const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{day:'numeric',month:'long'});
const dayShort=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{weekday:'short'});
const dayChips=(name,dates,checked,today)=>`<div class="choice-chips day-chips">${dates.map(d=>`<label><input type="checkbox" name="${name}" value="${d}" ${checked.includes(d)?'checked':''}><span>${d===today?'היום':dayShort(d)}<small>${new Date(d+'T12:00:00').getDate()}</small></span></label>`).join('')}</div>`;
const changes=[['off','אין לי זמן בכלל','מילואים, מחלה, יום עבודה מלא'],['less','פחות זמן מהרגיל','עד שעה ביום'],['tired','צריך קצב רגוע','מפגשים קצרים ופחות עומס'],['more','יש לי יותר זמן','אפשר להתקדם יותר'],['normal','חוזר לשגרה','מבטל שינוי קודם']];
const changeLabel={off:'יום בלי משימות',less:'יום עם פחות זמן',tired:'יום בקצב רגוע',more:'יום עם יותר זמן'};
const pace=w=>`<label for="weekly-load">כמה להשקיע השבוע?</label><select id="weekly-load" name="load">${options(loads,w.load)}</select><label for="weekly-energy">איזה קצב מתאים לך?</label><select id="weekly-energy" name="energy">${options(paces,w.energy)}</select><small class="field-help">קצב רגוע = מפגשים של עד חצי שעה. תמיד משאירים הפסקות ומכבדים שעות קבועות.</small>`;
const goalDone=(w,g)=>w.completions.filter(c=>c.goalId===g.id).reduce((a,c)=>a+c.minutes,0);
export function weeklyPanel(state,plan,view){
 const availability=reviewAvailability(state);const w=state.weekly,goals=state.goals.filter(g=>g.repeatWeekly||g.weekStart===w.weekStart),today=localDate();
 const blocked=plan.blockedSessions.map(s=>`<p class="weekly-gap" role="status">המפגש הנעול ״${esc(s.title)}״ מתנגש בזמינות החדשה. <button class="text-button" data-weekly="move" data-id="${esc(s.id)}">לבחור זמן אחר</button><button class="text-button" data-weekly="lock" data-id="${esc(s.id)}">לשחרר ולתכנן מחדש</button></p>`).join('');
 const nextWeek=w.nextWeek?`<p role="status">התוכנית לשבוע שמתחיל ב־${dateLabel(w.nextWeek.weekly.weekStart)} אושרה. היא תיפתח כאן בתחילת השבוע.</p>`:'';
 const changed=w.overrides.filter(o=>o.mode&&o.date>=today&&plan.dates.includes(o.date));
 if(view==='today'){
  // The home screen offers one next step that fits the moment, not the whole toolbox.
  if(!state.tasks.length&&!state.goals.length&&!state.events.length)return blocked;
  const step=(text,button)=>`<section class="next-step"><p>${text}</p>${button}</section>`;
  const todayChange=changed.find(o=>o.date===today);
  const next=w.nextWeek?step('השבוע הבא כבר מתוכנן. אפשר לנשום.','<button class="text-button" data-weekly="edit-next">לראות ולערוך</button>')
   :availability.open?step('השבוע נגמר. נסכם אותו ונכין את הבא?',`<button class="primary" data-weekly="review">${icon('spark')} לסכם ולתכנן את הבא</button>`)
   :todayChange?step(`היום מסומן כ${changeLabel[todayChange.mode]}${changed.length>1?` (ועוד ${changed.length-1} ימים)`:''}. התוכנית כבר מותאמת.`,'<button class="text-button" data-weekly="change">לשנות</button>')
   :!goals.length?step('עוד לא בחרת מה חשוב לך השבוע.',`<button class="primary" data-weekly="pace">${icon('spark')} לתכנן את השבוע</button>`)
   :step('משהו השתנה? התוכנית תתארגן מחדש.','<button class="text-button" data-weekly="change">משהו השתנה</button>');
  return next+blocked;
 }
 const list=view==='tasks'?`<section class="weekly-goals"><h2>המטרות שלי השבוע</h2>${goals.map(g=>{const done=goalDone(w,g);return `<article class="task-item"><div><h3>${esc(g.title)}</h3><p>${duration(done)} מתוך ${duration(g.minutes)}${g.repeatWeekly?' · חוזרת כל שבוע':''}</p></div><button class="text-button" data-weekly="goal" data-id="${esc(g.id)}">עריכה</button></article>`;}).join('')||'<p class="field-help">לימודים, אימון או רעיון משלך. בוחרים כמה זמן להקדיש, ואנחנו מוצאים לזה מקום.</p>'}<button class="text-button" data-weekly="goal">${icon('plus')} מטרה לשבוע</button></section>`:'';
 const tools=view==='week'?`<section class="weekly-intro"><p>${dateLabel(plan.dates[0])}–${dateLabel(plan.dates[6])}${changed.length?` · ${changed.length===1?'יום אחד מותאם':changed.length+' ימים מותאמים'}`:''}</p>${plan.needsReview?'<p role="status">השבוע הסתיים. אפשר לסכם ולהכין את הבא, בלי לאבד את המטרות.</p>':''}<div class="weekly-actions"><button class="primary" data-weekly="goal">${icon('plus')} מטרה לשבוע</button><button class="text-button" data-weekly="pace">לתכנן את השבוע</button><button class="text-button" data-weekly="change">משהו השתנה</button>${w.nextWeek?'<button class="text-button" data-weekly="edit-next">עריכת השבוע הבא</button>':`<button class="text-button" data-weekly="review" ${availability.open?'':'disabled'}>${availability.submitted?'הסיכום נשמר':availability.open?'סיכום ושבוע הבא':'הסיכום נפתח במוצ״ש ב־20:00'}</button>`}</div></section>${nextWeek}`:'';
 return tools+blocked+list;
}
function reviewContent(state){
 const w=state.weekly,today=localDate(),now=new Date();
 const goals=state.goals.filter(g=>g.repeatWeekly||g.weekStart===w.weekStart);
 const start=addDays(w.weekStart,7)<weekStart(now)?weekStart(now):addDays(w.weekStart,7);
 const nextDates=Array.from({length:7},(_,i)=>addDays(start,i));
 const doneTasks=state.tasks.filter(t=>t.done).length,total=w.completions.reduce((a,c)=>a+c.minutes,0);
 const lastNote=[...w.reviews].reverse().find(r=>r.note)?.note;
 const rows=goals.map(g=>{const done=Math.min(goalDone(w,g),g.minutes),pct=Math.round(done/g.minutes*100);return `<div class="review-goal"><div><b>${esc(g.title)}</b><span>${duration(done)} מתוך ${duration(g.minutes)}</span></div><div class="mini-bar"><i style="width:${pct}%"></i></div></div>`;}).join('');
 const carry=goals.filter(g=>g.repeatWeekly||goalDone(w,g)<g.minutes);
 return `${heading('סיכום השבוע')}<p class="field-help">שתי דקות, ונכנסים לשבוע הבא בראש שקט.</p>
 ${lastNote?`<p class="review-note">כתבת לעצמך בשבוע שעבר: ״${esc(lastNote)}״</p>`:''}
 <section class="review-summary"><h3>מה עשית השבוע</h3>${rows||''}<p>${total||doneTasks?`${total?`${duration(total)} של התקדמות במטרות`:''}${total&&doneTasks?' · ':''}${doneTasks?`${doneTasks} משימות הושלמו`:''}. כל הכבוד.`:'לא דיווחת השבוע על התקדמות, וזה בסדר. מה שלא עודכן אינו נחשב כישלון.'}</p></section>
 <form id="weekly-review">
 <fieldset><legend>איך הרגיש השבוע?</legend>${chips('feel',[['too-much','עמוס מדי'],['right','בדיוק'],['too-little','היה מקום ליותר']],'right')}<small class="field-help">לפי זה נתאים כמה זמן לתכנן בשבוע הבא.</small></fieldset>
 <fieldset><legend>מה ממשיך לשבוע הבא?</legend>${carry.length?chips('keep',carry.map(g=>[g.id,esc(g.title),g.repeatWeekly?'חוזרת כל שבוע':`נשארו ${duration(g.minutes-goalDone(w,g))}`]),carry.map(g=>g.id),'checkbox'):'<p class="field-help">אין מטרות להעביר. אפשר להוסיף חדשות בשלב הבא.</p>'}</fieldset>
 <fieldset><legend>יש ימים שכבר ידוע שלא תהיה פנוי?</legend>${dayChips('off',nextDates,[],today)}<small class="field-help">מילואים, משמרות, אירוע משפחתי. בימים האלה לא נשבץ כלום.</small></fieldset>
 <label for="review-note">משהו לזכור לשבוע הבא? (לא חובה)</label><input id="review-note" name="note" maxlength="500" placeholder="למשל: להתחיל מוקדם את העבודה בסטטיסטיקה">
 ${submit('להמשיך לתכנון השבוע הבא')}</form>`;
}
export function setupWeeklyUI(ctx){
 let proposal=null,nextWeek=false;const wizard=setupWeeklyWizard(ctx);
 const {getState,getPlan,open,close,mutate,replace,toast}=ctx;
 const commit=(value,message)=>{mutate(()=>replace(value),message);close();};
 const preview=(value,next=false,explanation='')=>wizard.preview(value,next,explanation);
 function showGoal(id,courseId='',topicId=''){
  const state=getState(),g=state.goals.find(g=>g.id===id)||{minutes:120,category:'study',priority:'normal',sessionMinutes:50,preferredTime:'any',courseId,topicId,title:state.courses.find(c=>c.id===courseId)?.topics?.find(t=>t.id===topicId)?.title||(courseId?`לתרגל ${state.courses.find(c=>c.id===courseId)?.name||''}`:'')};
  const hours=g.minutes/60;
  open(`${heading(id?'עדכון המטרה':'מטרה חדשה לשבוע')}<p class="form-kind-help">משהו שרוצים להקדיש לו זמן, בלי תאריך הגשה: לתרגל, להתאמן, לקדם פרויקט. יש תאריך הגשה? עדיף להוסיף משימה.</p>
  <form id="weekly-goal" data-id="${esc(id||'')}" data-topic-id="${esc(g.topicId||'')}">
  <label for="goal-title">מה רוצים לקדם?</label><input id="goal-title" name="title" value="${esc(g.title||'')}" maxlength="120" required autofocus placeholder="לתרגל אינפי, אימון כושר, גיטרה">
  <fieldset><legend>איזה תחום?</legend>${chips('category',[['study','לימודים'],['personal','אישי ואימונים'],['work','עבודה ויזמות']],g.category)}</fieldset>
  <label for="goal-hours">כמה זמן השבוע?</label><div class="duration-options">${[1,2,3,5].map(n=>`<button type="button" data-goal-hours="${n}" class="${n===hours?'active':''}">${n===1?'שעה':n===2?'שעתיים':n+' שעות'}</button>`).join('')}<div class="minutes-box"><input id="goal-hours" name="hours" type="number" min="0.25" max="168" step="0.25" value="${hours}" required aria-label="שעות בשבוע"><span aria-hidden="true">שעות</span></div></div>
  <small class="field-help">נחלק את הזמן למפגשים נוחים לאורך השבוע.</small>
  <label class="repeat-option"><input name="repeatWeekly" type="checkbox" ${g.repeatWeekly?'checked':''}> מטרה קבועה, חוזרת כל שבוע</label><small class="field-help">מתאים לאימון, לחזרה שבועית על קורס או לתחביב.</small>
  <fieldset><legend>מתי הכי נוח לך?</legend>${chips('preferredTime',[['any','מתי שפנוי'],['morning','בוקר'],['afternoon','צהריים'],['evening','ערב']],['any','morning','afternoon','evening'].includes(g.preferredTime)?g.preferredTime:'any')}</fieldset>
  <details class="advanced"><summary>קורס, חשיבות ואורך מפגש</summary><label for="goal-course">קשור לקורס? (לא חובה)</label><select id="goal-course" name="courseId"><option value="">לא קשור לקורס</option>${state.courses.map(c=>`<option value="${esc(c.id)}" ${g.courseId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><label for="goal-priority">כמה זה חשוב?</label><select id="goal-priority" name="priority">${options([['normal','רגיל'],['high','חשוב מאוד, לשבץ קודם'],['low','כשיש זמן']],g.priority)}</select><label for="goal-session">אורך מפגש נוח (דקות)</label><input id="goal-session" name="sessionMinutes" type="number" min="15" max="180" step="5" value="${g.sessionMinutes}"></details>
  ${submit('לראות איך זה משתלב')}</form>${id?`<button class="text-button muted" data-weekly="remove-goal" data-id="${esc(id)}">להסיר את המטרה</button>`:''}`);
 }
 function showChange(){
  const state=getState(),plan=getPlan(),today=localDate();
  const dates=plan.dates.filter(d=>d>=today),current=state.weekly.overrides.find(o=>o.date===today&&o.mode)?.mode;
  open(`${heading('משהו השתנה?')}<p class="form-kind-help">ספר מה קרה, והתוכנית תתארגן מחדש. שעות קבועות כמו שיעורים ועבודה נשארות כמו שהן.</p>
  <form id="weekly-change"><fieldset><legend>באילו ימים?</legend><div class="quick-picks"><button type="button" class="text-button" data-change-days="today">רק היום</button><button type="button" class="text-button" data-change-days="all">כל הימים הקרובים</button></div>${dayChips('days',dates,[today],today)}</fieldset>
  <fieldset><legend>מה המצב?</legend>${chips('mode',changes,current||'',)}</fieldset>${submit('לראות את התוכנית המעודכנת')}</form>`);
 }
 document.addEventListener('click',event=>{
  const hours=event.target.closest('[data-goal-hours]');
  if(hours){const box=hours.closest('form').elements.hours;box.value=hours.dataset.goalHours;hours.parentElement.querySelectorAll('[data-goal-hours]').forEach(b=>b.classList.toggle('active',b===hours));return;}
  const pick=event.target.closest('[data-change-days]');
  if(pick){const boxes=[...pick.closest('form').querySelectorAll('[name=days]')];boxes.forEach((b,i)=>{b.checked=pick.dataset.changeDays==='all'||i===0;});return;}
  const t=event.target.closest('[data-weekly]');if(!t)return;
  const state=getState(),id=t.dataset.id;
  try{switch(t.dataset.weekly){
   case 'goal':showGoal(id);break;
   case 'approve':if(proposal)commit(nextWeek?acceptNextWeek(state,proposal):proposal,'התוכנית אושרה. אפשר לשנות אותה בכל רגע.');proposal=null;break;
   case 'pace':wizard.start();break;
   case 'edit-next':if(state.weekly.nextWeek)wizard.start({...state,...state.weekly.nextWeek},true);break;
   case 'legacy-pace':open(`${heading('תוכנית שמתאימה לחיים שלך')}<form id="weekly-pace">${pace(state.weekly)}${submit('להכין הצעה')}</form><button class="text-button" data-action="settings">שעות נוחות, ימים והפסקות</button>`);break;
   case 'change':showChange();break;
   case 'review':if(!reviewAvailability(state).open){toast('סיכום השבוע נפתח במוצ״ש ב־20:00, ואפשר להשלים אותו גם באיחור.');break;}open(reviewContent(state));break;
   case 'course':{const c=state.courses.find(c=>c.id===id)||{};open(`${heading('המקצועות שלי')}<form id="weekly-course" data-id="${esc(id||'')}"><label for="course-name">שם המקצוע</label><input id="course-name" name="name" maxlength="120" value="${esc(c.name||'')}" required><label for="course-difficulty">איך הולך כרגע?</label><select id="course-difficulty" name="difficulty">${options([['1','די נוח'],['2','צריך תרגול'],['3','מאתגר — עדיף מקטעים קצרים']],String(c.difficulty||2))}</select><label for="course-exam">מועד מבחן (לא חובה)</label><input id="course-exam" name="examDate" type="date" value="${esc(c.examDate||'')}">${submit('לשמור מקצוע')}</form>`);break;}
   case 'complete':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)commit(completeWeeklySession(state,id,s.minutes),'ההתקדמות נשמרה. כל צעד נחשב.');break;}
   case 'partial':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)open(`${heading('כמה הספקת?')}<form id="weekly-partial" data-id="${esc(id)}"><label for="done-minutes">דקות שבוצעו מתוך ${s.minutes}</label><input id="done-minutes" name="minutes" type="number" min="0" max="${s.minutes}" step="1" value="${Math.floor(s.minutes/2)}" required><small class="field-help">השאר יישאר במטרה ונחפש לו מקום. 0 פירושו שלא הסתדר.</small>${submit('לעדכן התקדמות')}</form>`);break;}
   case 'move':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)open(`${heading('המפגש בזמן שמתאים לך')}<form id="weekly-move" data-id="${esc(id)}"><label for="move-date">תאריך</label><input id="move-date" name="date" type="date" min="${state.weekly.weekStart}" max="${addDays(state.weekly.weekStart,6)}" value="${s.date}" required><label for="move-time">שעה</label><input id="move-time" name="start" type="time" value="${s.start}" required><p class="field-help">נבדוק שאין התנגשות. הבחירה שלך תינעל כדי לשמור עליה.</p>${submit('להעביר ולנעול')}</form>`);break;}
   case 'lock':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)commit(setSessionLocked(state,id,!s.locked),s.locked?'המפגש פתוח לתכנון מחדש.':'המפגש נעול בזמן שבחרת.');break;}
   case 'remove-goal':{const next=clone(state);next.goals=next.goals.filter(g=>g.id!==id);next.weekly.sessions=next.weekly.sessions.filter(s=>s.goalId!==id);preview(next);break;}
  }}catch(e){toast(e.message);}
 });
 document.addEventListener('submit',event=>{
  const f=event.target;if(!f.id.startsWith('weekly-'))return;event.preventDefault();const fd=new FormData(f),state=getState(),next=clone(state);
  try{switch(f.id){
   case 'weekly-goal':{const title=String(fd.get('title')||'').trim(),minutes=Number(fd.get('hours'))*60;if(!title||!Number.isFinite(minutes)||minutes<15||minutes>10080)throw Error('נבחר שם ויעד זמן תקינים.');const g={id:f.dataset.id||crypto.randomUUID(),title,minutes,category:fd.get('category'),courseId:fd.get('courseId'),topicId:f.dataset.topicId||'',priority:fd.get('priority'),preferredTime:fd.get('preferredTime'),sessionMinutes:Number(fd.get('sessionMinutes')),repeatWeekly:fd.has('repeatWeekly'),weekStart:state.weekly.weekStart};next.goals=next.goals.filter(x=>x.id!==g.id).concat(g);next.weekly.sessions=next.weekly.sessions.filter(s=>s.goalId!==g.id||s.locked||s.date<localDate()||(s.date===localDate()&&s.start<new Date().toTimeString().slice(0,5)));preview(next);break;}
   case 'weekly-pace':next.weekly.sessions=next.weekly.sessions.filter(s=>s.locked||s.date<localDate()||(s.date===localDate()&&s.start<new Date().toTimeString().slice(0,5)));next.weekly.load=fd.get('load');next.weekly.energy=fd.get('energy');preview(next);break;
   case 'weekly-change':{
    const mode=fd.get('mode'),days=fd.getAll('days');if(!days.length)throw Error('נבחר לפחות יום אחד.');if(!mode)throw Error('נבחר מה המצב.');
    const label=days.length===1?(days[0]===localDate()?'היום':dateLabel(days[0])):`${days.length} ימים`;
    preview(applyChange(state,days,mode),false,mode==='normal'?`${label} חזר לשגרה.`:`התאמנו את התוכנית: ${label}, ${changes.find(c=>c[0]===mode)[1]}. מה שלא נכנס יחכה לימים אחרים.`);break;
   }
   case 'weekly-review':{
    const order=['light','balanced','heavy'],step={'too-much':-1,right:0,'too-little':1}[fd.get('feel')]??0;
    const load=order[Math.min(2,Math.max(0,order.indexOf(state.weekly.load)+step))],keep=fd.getAll('keep');
    const goals=state.goals.filter(g=>g.repeatWeekly||g.weekStart===state.weekly.weekStart);
    wizard.start(previewNextWeek(state,new Date(),{carryGoalIds:keep,skipGoalIds:goals.filter(g=>g.repeatWeekly&&!keep.includes(g.id)).map(g=>g.id),offDays:fd.getAll('off'),load,energy:'normal',note:fd.get('note')}),true,1);break;
   }
   case 'weekly-course':{const name=String(fd.get('name')||'').trim();if(!name)throw Error('צריך שם למקצוע.');const c={...state.courses.find(c=>c.id===f.dataset.id),id:f.dataset.id||crypto.randomUUID(),name,difficulty:Number(fd.get('difficulty')),examDate:fd.get('examDate')};next.courses=next.courses.filter(x=>x.id!==c.id).concat(c);commit(next,'המקצוע נשמר. אפשר לשייך אליו מטרות.');break;}
   case 'weekly-partial':commit(completeWeeklySession(state,f.dataset.id,Number(fd.get('minutes'))),'ההתקדמות נשמרה והשאר נשאר בתוכנית.');break;
   case 'weekly-move':commit(moveWeeklySession(state,f.dataset.id,fd.get('date'),fd.get('start')),'המפגש הועבר וננעל.');break;
  }}catch(e){f.querySelector('#weekly-error').textContent=e.message;}
 });
 return {addGoal:(courseId,topicId)=>showGoal(null,courseId,topicId)};
}
