import {escapeHTML as esc,icon,duration} from './views.mjs';
import {localDate} from './planner.mjs';
import {buildWeeklyPlan,acceptNextWeek,adjustWeeklyPlan,moveWeeklySession} from './weekly.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const heading=t=>`<div class="sheet-top"><h2 id="dialog-title" tabindex="-1">${t}</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;
const choices=(items,value)=>items.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('');
const date=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{weekday:'short',day:'numeric',month:'short'});
const active=(g,s)=>g.repeatWeekly||g.weekStart===s.weekly.weekStart;
const started=s=>s.date<localDate()||(s.date===localDate()&&s.start<new Date().toTimeString().slice(0,5));
export function setupWeeklyWizard(ctx){
 const {getState,open,close,mutate,replace,toast}=ctx;
 let draft,step=0,future=false,history=[],explanation='';
 const floor=g=>draft.weekly.completions.filter(c=>c.goalId===g.id).reduce((n,c)=>n+c.minutes,0)+draft.weekly.sessions.filter(s=>s.goalId===g.id&&(s.locked||started(s))).reduce((n,s)=>n+s.minutes,0);
 function start(value=getState(),next=false){
  draft=clone(value);future=next;step=0;history=[];explanation='';
  draft.weekly.skippedGoalIds ||= [];
  for(const c of draft.courses){
   if(!draft.goals.some(g=>g.courseId===c.id&&active(g,draft)))draft.goals.push({id:crypto.randomUUID(),title:`לתרגל ${c.name}`,courseId:c.id,minutes:60,priority:'normal',category:'study',sessionMinutes:50,preferredTime:'any',repeatWeekly:true,weekStart:draft.weekly.weekStart});
  }
  show();
 }
 const rows=kind=>draft.goals.filter(g=>active(g,draft)&&(kind==='study'?g.category==='study':g.category!=='study'));
 function goalRow(g){
  const c=draft.courses.find(c=>c.id===g.courseId);
  return `<div class="wizard-goal" data-goal-row="${esc(g.id)}"><label class="wizard-check"><input type="checkbox" name="selected" value="${esc(g.id)}" ${draft.weekly.skippedGoalIds.includes(g.id)?'':'checked'}> ${esc(c?.name||g.title)}</label>${c?`<small>${esc(g.title)}</small>`:''}<div class="wizard-inline"><label>שעות השבוע<input aria-label="שעות עבור ${esc(g.title)}" name="hours:${esc(g.id)}" type="number" min="${floor(g)/60}" max="168" step="any" value="${g.minutes/60}" required></label>${c?.topics?.length?`<label>נושא למיקוד<select name="topic:${esc(g.id)}"><option value="">כללי</option>${c.topics.map(t=>`<option value="${esc(t.id)}" ${t.id===g.topicId?'selected':''}>${esc(t.title)}</option>`).join('')}</select></label>`:''}</div></div>`;
 }
 function show(){
  const w=draft.weekly;
  let content='';
  if(step===0)content=`<p class="field-help">ההתחייבויות הקבועות כבר בפנים. נבחר קצב שמתאים לשבוע שמתחיל ב־${date(w.weekStart)}.</p><label for="wizard-load">כמה מתאים להשקיע?</label><select id="wizard-load" name="load">${choices([['light','קל · יותר מקום לנשום'],['balanced','מאוזן'],['heavy','מלא · יותר התקדמות']],w.load)}</select><label for="wizard-energy">איך האנרגיה שלך?</label><select id="wizard-energy" name="energy">${choices([['low','נמוכה'],['normal','רגילה'],['high','גבוהה']],w.energy)}</select>`;
  if(step===1)content=`<p class="field-help">בוחרים קורסים וכמה להשקיע בכל אחד. אפשר לדלג השבוע בלי למחוק את הקורס או את ההתקדמות.</p>${rows('study').map(goalRow).join('')||'<p>אין עדיין קורסים. אפשר להוסיף אותם באזור הקורסים ולחזור לכאן.</p>'}${rows('study').length?'<button type="button" class="text-button" data-wizard="suggest">תציעו לי חלוקת זמן</button>':''}`;
  if(step===2)content=`<p class="field-help">תחביב, אימון או רעיון משלך. אפשר גם להמשיך בלי להוסיף דבר.</p>${rows('personal').map(goalRow).join('')}<details class="advanced" ${rows('personal').length?'':'open'}><summary>להוסיף מטרה אישית</summary><label for="personal-title">מה תרצה לקדם?</label><input id="personal-title" name="personalTitle" maxlength="120" placeholder="אימון, גיטרה, פרויקט אישי"><label for="personal-hours">כמה שעות השבוע?</label><input id="personal-hours" name="personalHours" type="number" min="0.25" max="168" step="0.25" value="1"><button type="button" class="text-button" data-wizard="add-personal">להוסיף עוד מטרה</button></details>`;
  open(`${heading(['איך נראה השבוע שלך?','באילו קורסים נתקדם?','ומה חשוב לך בשביל עצמך?'][step])}<p class="wizard-step">שלב ${step+1} מתוך 3</p><form id="wizard-form">${content}<p id="wizard-error" role="alert"></p><div class="weekly-actions"><button class="primary" type="submit">${step===2?'לבנות את ההצעה':'להמשיך'}</button>${step?'<button class="text-button" type="button" data-wizard="back">חזרה</button>':''}</div></form>`);
  document.querySelector('#dialog-title')?.focus();
 }
 function collect(form,addPersonal=true){
  const fd=new FormData(form);
  if(step===0){draft.weekly.load=fd.get('load');draft.weekly.energy=fd.get('energy');return;}
  const selected=fd.getAll('selected');
  for(const g of rows(step===1?'study':'personal')){
   const hours=Number(fd.get(`hours:${g.id}`)),minimum=floor(g);
   if(!Number.isFinite(hours)||hours*60<minimum||hours>168||(selected.includes(g.id)&&hours*60<5))throw Error('יש לבחור זמן תקין, לפחות הזמן שכבר בוצע או ננעל.');
   if(!selected.includes(g.id)&&minimum>0)throw Error('כדי לדלג על מטרה שכבר בוצעה או ננעלה, צריך קודם לשחרר את המפגשים שלה.');
   g.minutes=Math.max(5,Math.round(hours*60));
   draft.weekly.skippedGoalIds=draft.weekly.skippedGoalIds.filter(id=>id!==g.id);
   if(!selected.includes(g.id))draft.weekly.skippedGoalIds.push(g.id);
   if(fd.has(`topic:${g.id}`)){
    g.topicId=fd.get(`topic:${g.id}`);
    const course=draft.courses.find(c=>c.id===g.courseId),topic=course?.topics?.find(t=>t.id===g.topicId);
    if(topic)g.title=`${course.name} · ${topic.title}`;
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
 function preview(value,next=false){draft=clone(value);future=next;history=[];explanation='';showPreview();}
 function showPreview(){
  const plan=buildWeeklyPlan(draft);draft.weekly.sessions=plan.retainedSessions;
  open(`${heading('זו ההצעה לשבוע שלך')}<p>${date(plan.weekStart)}–${date(plan.weekEnd)} · ${duration(plan.plannedMinutes)} בתוכנית</p><p class="field-help">ההצעה נשמרת רק אחרי אישור. התחייבויות ומפגשים שנעלת נשמרים.</p>${explanation?`<p class="weekly-gap" role="status">${esc(explanation)}</p>`:''}${plan.unscheduled.length?`<div class="weekly-gap"><b>מה עדיין לא נכנס?</b>${plan.unscheduled.map(g=>`<p>${esc(g.title)} · ${duration(g.minutes)}<br>${esc(g.reason)}</p>`).join('')}</div>`:''}<div class="weekly-preview">${plan.sessions.map(s=>`<div><span>${date(s.date)} · <bdi>${s.start}–${s.end}</bdi>${s.locked?' · נעול':''}</span><b>${esc(s.title)}</b>${s.goalId?`<button class="text-button" data-wizard="move" data-id="${esc(s.id)}">לשנות את הזמן הזה</button>`:''}</div>`).join('')||'<p>אין מפגשים לשיבוץ. אפשר לחזור לבחירת המטרות.</p>'}</div><div class="weekly-actions"><button class="primary" data-wizard="approve">לאשר את התוכנית</button><button class="text-button" data-wizard="adjust">בואו נתאים את זה</button><button class="text-button" data-wizard="edit">עריכה עצמית של המטרות</button>${history.length?'<button class="text-button" data-wizard="undo">להצעה הקודמת</button>':''}</div>`);
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
   case 'approve':{const next=future?acceptNextWeek(getState(),draft):draft;mutate(()=>replace(next),'התוכנית אושרה. אפשר לערוך אותה בכל רגע.',true);close();break;}
   case 'move':{const s=draft.weekly.sessions.find(s=>s.id===b.dataset.id);if(!s)break;open(`${heading('מתי מתאים לך?')}<form id="wizard-move" data-id="${esc(s.id)}"><label>תאריך<input name="date" type="date" value="${s.date}" required></label><label>שעה<input name="start" type="time" value="${s.start}" required></label><p role="alert"></p><button class="primary" type="submit">להעביר ולנעול</button><button type="button" class="text-button" data-wizard="preview">חזרה</button></form>`);break;}
  }}catch(e){toast(e.message);}
 });
 return {start,preview};
}
