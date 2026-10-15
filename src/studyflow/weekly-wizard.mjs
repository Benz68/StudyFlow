import {escapeHTML as esc,icon,duration} from './views.mjs';
import {renderPlanPreview} from './plan-preview.mjs';
import {localDate} from './planner.mjs';
import {buildWeeklyPlan,acceptNextWeek,adjustWeeklyPlan,moveWeeklySession,preparePlanningWeek,acceptPlanningWeek} from './weekly.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const heading=t=>`<div class="sheet-top"><h2 id="dialog-title" tabindex="-1">${t}</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;
const choices=(items,value)=>items.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('');
const cards=(name,items,value)=>`<div class="choice-chips wizard-cards">${items.map(([v,t,sub])=>`<label><input type="radio" name="${name}" value="${v}" ${v===value?'checked':''}><span>${t}<small>${sub}</small></span></label>`).join('')}</div>`;
const date=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{weekday:'short',day:'numeric',month:'short'});
const active=(g,s)=>g.repeatWeekly||g.weekStart===s.weekly.weekStart;
const started=s=>s.date<localDate()||(s.date===localDate()&&s.start<new Date().toTimeString().slice(0,5));
export function setupWeeklyWizard(ctx){
 const {getState,open,close,mutate,replace,toast}=ctx;
 let draft,step=0,future=false,history=[],explanation='',questionnaire=false,firstStep=0;
 let previewState={day:0,period:'morning',page:0};
 const floor=g=>draft.weekly.completions.filter(c=>c.goalId===g.id).reduce((n,c)=>n+c.minutes,0)+draft.weekly.sessions.filter(s=>s.goalId===g.id&&(s.locked||started(s))).reduce((n,s)=>n+s.minutes,0);
 function start(value=getState(),next=false){
  draft=clone(value);future=next;step=0;history=[];explanation='';
  previewState={day:next?0:new Date().getDay(),period:'morning',page:0};
  draft.weekly.skippedGoalIds ||= [];
  for(const c of draft.courses){
   if(!draft.goals.some(g=>g.courseId===c.id&&active(g,draft)))draft.goals.push({id:crypto.randomUUID(),title:`לתרגל ${c.name}`,courseId:c.id,minutes:60,priority:'normal',category:'study',sessionMinutes:50,preferredTime:'any',repeatWeekly:true,weekStart:draft.weekly.weekStart});
  }
  show();
 }
 const rows=kind=>draft.goals.filter(g=>active(g,draft)&&(kind==='study'?g.category==='study':g.category!=='study'));
 function goalRow(g){
  const c=draft.courses.find(c=>c.id===g.courseId);
  return `<div class="wizard-goal" data-goal-row="${esc(g.id)}"><label class="wizard-check"><input type="checkbox" name="selected" value="${esc(g.id)}" ${draft.weekly.skippedGoalIds.includes(g.id)?'':'checked'}> ${esc(c?.name||g.title)}</label>${c?`<small>${esc(g.title)}</small>`:''}<div class="wizard-inline"><label>כמה שעות ללמוד השבוע<input aria-label="שעות עבור ${esc(g.title)}" name="hours:${esc(g.id)}" type="number" min="${floor(g)/60}" max="168" step="any" value="${g.minutes/60}" required></label>${c?.topics?.length?`<fieldset class="topic-picks"><legend>מה נרצה לקדם? אפשר לבחור כמה נושאים</legend>${c.topics.map(t=>`<label><input type="checkbox" name="topics:${esc(g.id)}" value="${esc(t.id)}" ${(g.topicIds||[g.topicId]).includes(t.id)?'checked':''}>${esc(t.title)}${t.status==='ready'?' · לחזרה':''}</label>`).join('')}<small>ללא בחירה נתכנן תרגול כללי בקורס. זהו זמן משותף לנושאים שבחרת, לא יעד שעות נוסף לכל נושא.</small></fieldset>`:''}</div></div>`;
 }
 function show(){
  const w=draft.weekly;
  if(step===-1){showPreparation();return;}
  let content='';
  if(step===0)content=`<p class="field-help">אחרי בדיקת ההתחייבויות, בוחרים כמה זמן ביום להקדיש ללימודים ולמטרות, בשבוע שמתחיל ב־${date(w.weekStart)}.</p><p class="wizard-q">כמה זמן ביום ללימודים ולמטרות?</p>${cards('load',[['light','קליל','עד כשעתיים ביום'],['balanced','מאוזן','עד כ־4 שעות ביום'],['heavy','אינטנסיבי','עד כ־6 שעות ביום']],w.load)}<p class="wizard-q">איך ההרגשה השבוע?</p>${cards('energy',[['low','עייפות','מפגשים קצרים של חצי שעה, ופחות זמן ביום'],['normal','רגילה','כמו שבחרת למעלה'],['high','מלאים כוח','קצת יותר זמן ביום']],w.energy)}<small class="field-help">זה רק קובע את התקרה. ימים עמוסים בשעות קבועות יקבלו פחות, ותמיד יש הפסקות.</small>`;
  if(step===0&&w.weekStart>getState().weekly.weekStart){
   const previous=getState(),done=previous.weekly.completions.reduce((n,c)=>n+c.minutes,0);
   const carry=previous.goals.filter(g=>!g.repeatWeekly&&g.weekStart===previous.weekly.weekStart&&g.minutes>previous.weekly.completions.filter(c=>c.goalId===g.id).reduce((n,c)=>n+c.minutes,0));
   content=`<p class="field-help">השבוע דיווחת על ${duration(done)} של התקדמות. נשתמש במה שלמדת כדי לבחור קצב לשבוע הבא.</p>`+content+(carry.length?`<details class="advanced"><summary>מטרות חד־פעמיות להמשך</summary>${carry.map(g=>`<label class="wizard-check"><input type="checkbox" name="carry" value="${esc(g.id)}" ${draft.goals.some(x=>x.id===g.id&&x.weekStart===w.weekStart)?'checked':''}>${esc(g.title)}</label>`).join('')}</details>`:'');
  }
  if(step===1)content=`<p class="field-help">בוחרים קורסים וכמה להשקיע בכל אחד. אפשר לדלג השבוע בלי למחוק את הקורס או את ההתקדמות.</p>${rows('study').map(goalRow).join('')||'<p>עוד אין קורסים. אפשר להוסיף עכשיו או להמשיך עם מטרות אישיות בלבד.</p>'}<button type="button" class="text-button" data-wizard="add-course">+ הוספת קורס וחזרה לכאן</button>${rows('study').length?'<div class="wizard-suggest"><button type="button" class="text-button" data-wizard="suggest">'+icon('spark')+' לחלק לי את הזמן אוטומטית</button><small class="field-help">בודקים כמה זמן פנוי יש לך השבוע, ומחלקים אותו בין הקורסים שסימנת: קורס מאתגר מקבל יותר, קורס שהולך בקלות מקבל פחות. אפשר לשנות כל מספר אחר כך.</small></div>':''}`;
  if(step===2)content=`<p class="field-help">תחביב, אימון או רעיון משלך. אפשר גם להמשיך בלי להוסיף דבר.</p>${rows('personal').map(goalRow).join('')}<details class="advanced" ${rows('personal').length?'':'open'}><summary>להוסיף מטרה אישית</summary><label for="personal-title">מה תרצה לקדם?</label><input id="personal-title" name="personalTitle" maxlength="120" placeholder="אימון, גיטרה, פרויקט אישי"><label for="personal-hours">כמה שעות השבוע?</label><input id="personal-hours" name="personalHours" type="number" min="0.25" max="168" step="0.25" value="1"><button type="button" class="text-button" data-wizard="add-personal">להוסיף עוד מטרה</button></details>`;
  open(`${heading(['איך נראה השבוע שלך?','באילו קורסים נתקדם?','ומה חשוב לך בשביל עצמך?'][step])}<p class="wizard-step">שלב ${step+1} מתוך 3</p><form id="wizard-form">${content}<p id="wizard-error" role="alert"></p><div class="weekly-actions"><button class="primary" type="submit">${step===2?'לבנות את ההצעה':'להמשיך'}</button>${step?'<button class="text-button" type="button" data-wizard="back">חזרה</button>':''}</div></form>`);
  document.querySelector('#dialog-title')?.focus();
 }
 function showPreparation(){
  const state=getState();
  open(`${heading('לפני שמסדרים את השבוע')}<p class="field-help">הבסיס נשמר משבוע לשבוע. רק בודקים אם משהו השתנה.</p><form id="planning-ready"><section class="ready-section"><h3>ההתחייבויות הקבועות</h3><p>${state.events.length?`${state.events.length} התחייבויות שמורות`:'עוד לא הוספת התחייבויות'}</p><details><summary>לראות מה שמור</summary>${state.events.map(e=>`<p>${esc(e.title)} · <bdi>${e.start}–${e.end}</bdi></p>`).join('')||'<p>אפשר להמשיך גם ללא התחייבויות.</p>'}</details><button type="button" class="text-button" data-wizard="add-fixed">+ הוספת התחייבות וחזרה לכאן</button><label class="wizard-check"><input name="fixedChecked" type="checkbox" required>${state.events.length?'בדקתי — השעות הקבועות מעודכנות':'אין לי כרגע שעות קבועות להוסיף'}</label></section><section class="ready-section"><h3>הקורסים וההתקדמות</h3>${state.courses.map(c=>`<div class="ready-course"><span>${esc(c.name)}</span><button type="button" class="text-button" data-wizard="review-course" data-id="${esc(c.id)}">לעדכן מה למדתי והבנתי</button></div>`).join('')||'<p>אפשר להתחיל מקורס אחד, גם בלי סילבוס.</p>'}<button type="button" class="text-button" data-wizard="add-course">+ הוספת קורס וחזרה לכאן</button><label class="wizard-check"><input name="coursesChecked" type="checkbox" required>${state.courses.length?'אלה הקורסים שלי לשבוע הזה':'להמשיך כרגע בלי קורסים'}</label></section><button class="primary submit-button" type="submit">הכול מעודכן, לתכנון השבוע</button></form>`);
 }
 function resume(){
  const state=getState();draft.courses=clone(state.courses);draft.events=clone(state.events);
  for(const c of draft.courses)if(!draft.goals.some(g=>g.courseId===c.id&&active(g,draft)))draft.goals.push({id:crypto.randomUUID(),title:`לתרגל ${c.name}`,courseId:c.id,minutes:60,priority:'normal',category:'study',sessionMinutes:50,preferredTime:'any',repeatWeekly:true,weekStart:draft.weekly.weekStart});
  show();
 }
 document.addEventListener('submit',event=>{if(event.target.id!=='planning-ready')return;event.preventDefault();step=firstStep;show();});
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-preview-day],[data-preview-period],[data-preview-page]');if(!b)return;
  if(b.dataset.previewDay!==undefined){previewState.day=Number(b.dataset.previewDay);previewState.page=0;}
  if(b.dataset.previewPeriod!==undefined){previewState.period=b.dataset.previewPeriod;previewState.page=0;}
  if(b.dataset.previewPage!==undefined)previewState.page=Number(b.dataset.previewPage);
  showPreview();
 });
 function collect(form,addPersonal=true){
  const fd=new FormData(form);
  if(step===0){
   draft.weekly.load=fd.get('load');draft.weekly.energy=fd.get('energy');
   const previous=getState();
   if(draft.weekly.weekStart>previous.weekly.weekStart){
    for(const g of previous.goals.filter(g=>!g.repeatWeekly&&g.weekStart===previous.weekly.weekStart)){
     const pending=draft.goals.find(x=>x.id===g.id);if(!pending)continue;
     if(fd.getAll('carry').includes(g.id)){pending.weekStart=draft.weekly.weekStart;pending.minutes=Math.max(5,g.minutes-previous.weekly.completions.filter(c=>c.goalId===g.id).reduce((n,c)=>n+c.minutes,0));}
     else pending.weekStart=g.weekStart;
    }
   }
   return;
  }
  const selected=fd.getAll('selected');
  for(const g of rows(step===1?'study':'personal')){
   const hours=Number(fd.get(`hours:${g.id}`)),minimum=floor(g);
   if(!Number.isFinite(hours)||hours*60<minimum||hours>168||(selected.includes(g.id)&&hours*60<5))throw Error('יש לבחור זמן תקין, לפחות הזמן שכבר בוצע או ננעל.');
   if(!selected.includes(g.id)&&minimum>0)throw Error('כדי לדלג על מטרה שכבר בוצעה או ננעלה, צריך קודם לשחרר את המפגשים שלה.');
   g.minutes=Math.max(5,Math.round(hours*60));
   draft.weekly.skippedGoalIds=draft.weekly.skippedGoalIds.filter(id=>id!==g.id);
   if(!selected.includes(g.id))draft.weekly.skippedGoalIds.push(g.id);
   if(step===1&&g.courseId){
    const course=draft.courses.find(c=>c.id===g.courseId);
    g.topicIds=fd.getAll(`topics:${g.id}`).filter(id=>course?.topics.some(t=>t.id===id));
    g.topicId=g.topicIds[0]||'';
    const names=course?.topics.filter(t=>g.topicIds.includes(t.id)).map(t=>t.title)||[];
    g.title=names.length?`${course.name} · ${names.join(' / ')}`:`לתרגל ${course?.name||g.title}`;
   }
  }
  const title=String(fd.get('personalTitle')||'').trim();
  if(step===2&&addPersonal&&title){
   const minutes=Number(fd.get('personalHours'))*60;
   if(!Number.isFinite(minutes)||minutes<15||minutes>10080)throw Error('בחר יעד זמן בין רבע שעה ל־168 שעות.');
   draft.goals.push({id:crypto.randomUUID(),title,minutes,category:'personal',priority:'normal',sessionMinutes:50,preferredTime:'any',repeatWeekly:true,weekStart:draft.weekly.weekStart});
  }
 }
 function release(){draft.weekly.sessions=draft.weekly.sessions.filter(s=>s.locked||started(s));}
 function preview(value,next=false){questionnaire=false;draft=clone(value);future=next;history=[];explanation='';showPreview();}
 function showPreview(){
  const plan=buildWeeklyPlan(draft);draft.weekly.sessions=plan.retainedSessions;
  open(`${heading('זו ההצעה לשבוע שלך')}<p class="proposal-summary">${date(plan.weekStart)}–${date(plan.weekEnd)} · ${duration(plan.plannedMinutes)} למטרות</p>${explanation?`<p class="field-help" role="status">${esc(explanation)}</p>`:''}${plan.unscheduled.length?`<button class="text-button" data-wizard="gaps">${plan.unscheduled.length} מטרות לא נכנסו במלואן — לבדיקה</button>`:''}${renderPlanPreview(draft,plan,previewState)}<div class="weekly-actions proposal-actions"><button class="primary" data-wizard="approve">לאשר את התוכנית</button><button class="text-button" data-wizard="adjust">לא מתאים לי</button><button class="text-button" data-wizard="edit">עריכת המטרות</button>${history.length?'<button class="text-button" data-wizard="undo">להצעה הקודמת</button>':''}</div><small class="field-help">רק האישור שומר את ההצעה. התחייבויות ומפגשים נעולים נשמרים.</small>`);
  document.querySelector('#sheet').classList.add('proposal-sheet');
 }
 function adjustMenu(){
  const options=[['lighter','יותר זמן פנוי'],['shorter','מפגשים קצרים יותר'],['study-more','יותר זמן ללימודים'],['personal-more','יותר זמן למטרות אישיות'],['fewer-switches','פחות מעברים בין נושאים'],['morning','להעדיף בוקר'],['evening','להעדיף ערב']];
  open(`${heading('מה פחות מתאים לך?')}<p class="field-help">חלוקת זמן מחדש לא מוסיפה שעות לשבוע. אם אין מקום, נציג מה נשאר בחוץ.</p><div class="wizard-adjust">${options.map(([key,label])=>`<button class="text-button" data-wizard="adjust-option" data-option="${key}">${label}${icon('arrow')}</button>`).join('')}</div><form id="wizard-day"><label for="wizard-day">איזה יום להשאיר פנוי ממטרות?</label><select name="date">${Array.from({length:7},(_,i)=>{const d=new Date(draft.weekly.weekStart+'T12:00:00');d.setDate(d.getDate()+i);const key=localDate(d);return `<option value="${key}">${date(key)}</option>`;}).join('')}</select><button class="text-button" type="submit">לפנות את היום</button></form><button class="text-button" data-wizard="preview">לחזור להצעה</button>`);
 }
 document.addEventListener('submit',event=>{
  const f=event.target;if(!['wizard-form','wizard-day','wizard-move'].includes(f.id))return;event.preventDefault();
  try{
   if(f.id==='wizard-form'){collect(f);if(step<2){step++;show();}else{release();showPreview();}}
   if(f.id==='wizard-day'){history.push(clone(draft));const key=new FormData(f).get('date');draft.weekly.overrides=draft.weekly.overrides.filter(o=>o.date!==key).concat({date:key,maxMinutes:0,energy:draft.weekly.energy});release();explanation=`פינינו את ${date(key)} ממטרות גמישות. מפגש נעול שמתנגש מוצג לבדיקה.`;showPreview();}
   if(f.id==='wizard-move'){const fd=new FormData(f),next=moveWeeklySession(draft,f.dataset.id,fd.get('date'),fd.get('start'));history.push(clone(draft));draft=next;explanation='המפגש הועבר וננעל בזמן שבחרת.';showPreview();}
  }catch(e){const error=f.querySelector('[role=alert]');if(error)error.textContent=e.message;else toast(e.message);}
 });
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-wizard]');if(!b)return;
  try{switch(b.dataset.wizard){
   case 'add-course':if(step>=0)collect(document.querySelector('#wizard-form'),false);ctx.openCourse(resume);break;
   case 'add-fixed':ctx.openCommitment(resume);break;
   case 'review-course':ctx.openCourseProgress(b.dataset.id,resume);break;
   case 'gaps':{const p=buildWeeklyPlan(draft);open(`${heading('מה עדיין לא נכנס?')}${p.unscheduled.map(g=>`<p><b>${esc(g.title)} · ${duration(g.minutes)}</b><br>${esc(g.reason)}</p>`).join('')}<button class="primary" data-wizard="preview">לחזור להצעה</button>`);break;}
   case 'back':collect(document.querySelector('#wizard-form'));step--;show();break;
   case 'add-personal':collect(document.querySelector('#wizard-form'));show();break;
   case 'suggest':{
    collect(document.querySelector('#wizard-form'));const goals=rows('study').filter(g=>!draft.weekly.skippedGoalIds.includes(g.id));
    if(!goals.length)throw Error('בחר לפחות קורס אחד לחלוקת הזמן.');
    const probe=clone(draft);probe.weekly.sessions=probe.weekly.sessions.filter(s=>s.locked||started(s));
    const id=crypto.randomUUID();probe.goals=probe.goals.filter(g=>!goals.some(x=>x.id===g.id)||floor(g)>0).concat({id,title:'חלוקה',minutes:10080,category:'study',sessionMinutes:50,weekStart:probe.weekly.weekStart});
    const budget=buildWeeklyPlan(probe).sessions.filter(s=>s.goalId===id).reduce((n,s)=>n+s.minutes,0);
    const weights=goals.map(g=>draft.courses.find(c=>c.id===g.courseId)?.difficulty||1),total=weights.reduce((a,b)=>a+b,0);
    goals.forEach((g,i)=>{g.minutes=Math.max(15,floor(g),Math.floor(budget*weights[i]/total/15)*15);});show();toast('הצענו חלוקה לפי הזמן הזמין והקושי שסימנת. אפשר לשנות כל מספר.');break;
   }
   case 'preview':showPreview();break;
   case 'adjust':adjustMenu();break;
   case 'edit':step=1;show();break;
   case 'adjust-option':{
    const before=clone(draft),option=b.dataset.option,next=adjustWeeklyPlan(draft,option);
    history.push(before);draft=next;
    const total=s=>s.goals.filter(g=>active(g,s)&&!s.weekly.skippedGoalIds.includes(g.id)).reduce((n,g)=>n+g.minutes,0);
    const study=s=>s.goals.filter(g=>active(g,s)&&g.category==='study').reduce((n,g)=>n+g.minutes,0);
    explanation={lighter:`הפחתנו ${duration(Math.max(0,total(before)-total(draft)))} מיעדי השבוע כדי להשאיר יותר זמן פנוי.`,shorter:'קיצרנו מפגשים גמישים לעד חצי שעה. יעד הזמן הכולל נשאר כמו שבחרת.','study-more':`העברנו ${duration(Math.max(0,study(draft)-study(before)))} ממטרות אחרות ללימודים, בלי להוסיף עומס כולל.`,'personal-more':'העברנו עד חצי שעה ממטרות אחרות למטרות האישיות, בלי להוסיף עומס כולל.',morning:'נתנו עדיפות לשעות הבוקר, במסגרת הזמינות שלך.',evening:'נתנו עדיפות לשעות הערב, במסגרת הזמינות שלך.','fewer-switches':'נתנו עדיפות לריכוז נושאים באותו יום כדי לצמצם מעברים.'}[option];
    showPreview();break;
   }
   case 'undo':if(history.length){draft=history.pop();explanation='חזרנו להצעה הקודמת.';showPreview();}break;
   case 'approve':{const next=questionnaire?acceptPlanningWeek(getState(),draft):future?acceptNextWeek(getState(),draft):draft;if(next.weekly.nextWeek&&future)next.weekly.nextWeek.weekly.approvedAt=new Date().toISOString();else next.weekly.approvedAt=new Date().toISOString();mutate(()=>replace(next),'התוכנית אושרה. אפשר לערוך אותה בכל רגע.',true);close();break;}
   case 'move':{const s=draft.weekly.sessions.find(s=>s.id===b.dataset.id);if(!s)break;open(`${heading('מתי מתאים לך?')}<form id="wizard-move" data-id="${esc(s.id)}"><label>תאריך<input name="date" type="hidden" data-picker value="${s.date}"></label><label>שעה<input name="start" type="time" value="${s.start}" required></label><p role="alert"></p><button class="primary" type="submit">להעביר ולנעול</button><button type="button" class="text-button" data-wizard="preview">חזרה</button></form>`);break;}
  }}catch(e){toast(e.message);}
 });
 return {start,preview,startPlanning(initialStep=0){questionnaire=true;firstStep=initialStep;const value=preparePlanningWeek(getState());start(value,value.weekly.weekStart>getState().weekly.weekStart);step=-1;show();},adjustCurrent(){questionnaire=false;draft=clone(getState());future=false;history=[];explanation='';adjustMenu();}};
}
