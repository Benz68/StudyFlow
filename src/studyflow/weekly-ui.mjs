import {escapeHTML as esc,icon,duration} from './views.mjs';
import {setupWeeklyWizard} from './weekly-wizard.mjs';
import {localDate} from './planner.mjs';
import {buildWeeklyPlan,previewNextWeek,acceptNextWeek,completeWeeklySession,moveWeeklySession,setSessionLocked,addDays,reviewAvailability,planningTarget,preparePlanningWeek,applyChange} from './weekly.mjs';
const FEELS=[['good','😊','הולך טוב'],['ok','😐','ככה ככה'],['hard','😕','קשה לי']];
const shortDate=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{weekday:'short',day:'numeric',month:'short'});
const clone=x=>JSON.parse(JSON.stringify(x));
const loads=[['light','קל · יותר מקום לנשום'],['balanced','מאוזן'],['heavy','מלא · קצת יותר התקדמות']];
const energies=[['low','נמוכה · מפגשים קצרים'],['normal','רגילה'],['high','גבוהה']];
const options=(values,value)=>values.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('');
const heading=t=>`<div class="sheet-top"><h2 id="dialog-title">${t}</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div>`;
const error='<p id="weekly-error" class="form-error" role="alert"></p>';
const submit=t=>`${error}<button class="primary submit-button" type="submit">${t}</button>`;
const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{day:'numeric',month:'long'});
const pace=w=>`<label for="weekly-load">איזה עומס מתאים לך?</label><select id="weekly-load" name="load">${options(loads,w.load)}</select><label for="weekly-energy">איך האנרגיה שלך כרגע?</label><select id="weekly-energy" name="energy">${options(energies,w.energy)}</select><small class="field-help">זו בחירה שלך, לא ניחוש שלנו. תמיד משאירים הפסקות ומכבדים שעות קבועות.</small>`;
export function weeklyPanel(state,plan,view){
 const target=planningTarget(),label=target===state.weekly.weekStart?'לתכנן את השבוע':'לתכנן את השבוע הבא';
 return `<section class="weekly-intro"><div class="weekly-bar"><button class="primary" data-weekly="pace">${label}</button><button class="weekly-bar-button" data-weekly="adjust">לא אהבתי את הסידור</button><button class="weekly-bar-button is-unexpected" data-weekly="unexpected">${icon('spark')} קרה משהו לא צפוי?</button></div></section>${plan.blockedSessions.map(s=>`<p class="weekly-gap" role="status">המפגש הנעול ״${esc(s.title)}״ לא מתאים לזמינות. <button class="text-button" data-weekly="move" data-id="${esc(s.id)}">לבחור זמן אחר</button><button class="text-button" data-weekly="lock" data-id="${esc(s.id)}">לשחרר נעילה</button></p>`).join('')}`;
}
export function setupWeeklyUI(ctx){
 let proposal=null,nextWeek=false;const wizard=setupWeeklyWizard(ctx);
 const {getState,getPlan,open,close,mutate,replace,toast}=ctx;
 const commit=(value,message)=>{mutate(()=>replace(value),message);close();};
 const preview=(value,next=false)=>wizard.preview(value,next);
 function showGoal(id,courseId='',topicId=''){
  const state=getState(),g=state.goals.find(g=>g.id===id)||{minutes:120,category:courseId?'study':'personal',priority:'normal',sessionMinutes:50,preferredTime:'any',courseId,topicId,title:state.courses.find(c=>c.id===courseId)?.topics?.find(t=>t.id===topicId)?.title||''};
  const courseName=state.courses.find(c=>c.id===(g.courseId||courseId))?.name;
  open(`${heading(id?'עדכון המטרה':courseName?`כמה זמן ללמוד ${esc(courseName)} השבוע?`:'מה חשוב לך לקדם השבוע?')}<form id="weekly-goal" data-id="${esc(id||'')}" data-topic-id="${esc(g.topicId||'')}"><label for="goal-title">המטרה שלי</label><input id="goal-title" name="title" value="${esc(g.title||'')}" maxlength="120" required autofocus placeholder="לתרגל נושא קשה, להתאמן, לעבוד על רעיון"><label for="goal-hours">כמה שעות להקדיש השבוע?</label><input id="goal-hours" name="hours" type="number" min="0.25" max="168" step="0.25" value="${g.minutes/60}" required><label class="repeat-option"><input name="repeatWeekly" type="checkbox" ${g.repeatWeekly?'checked':''}> אותה מטרה גם בשבועות הבאים</label><details class="advanced"><summary>מקצוע, חשיבות ושעות נוחות</summary><label for="goal-course">מקצוע (לא חובה)</label><select id="goal-course" name="courseId"><option value="">ללא מקצוע</option>${state.courses.map(c=>`<option value="${esc(c.id)}" ${g.courseId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><label for="goal-category">סוג מטרה</label><select id="goal-category" name="category">${options([['study','לימודים'],['personal','אישי ואימונים'],['work','עבודה ויזמות']],g.category)}</select><label for="goal-priority">חשיבות</label><select id="goal-priority" name="priority">${options([['normal','רגילה'],['high','גבוהה'],['low','כשיש זמן']],g.priority)}</select><label for="goal-time">שעות נוחות</label><select id="goal-time" name="preferredTime">${options([['any','לפי ההעדפות שלי'],['morning','בוקר'],['afternoon','צהריים'],['evening','ערב']],g.preferredTime)}</select><label for="goal-session">משך מפגש נוח (דקות)</label><input id="goal-session" name="sessionMinutes" type="number" min="15" max="180" step="5" value="${g.sessionMinutes}"></details>${submit('לראות איך זה משתלב')}</form>${id?`<button class="text-button muted" data-weekly="remove-goal" data-id="${esc(id)}">להסיר את המטרה השבועית</button>`:''}`);
 }
 document.addEventListener('click',event=>{
  const t=event.target.closest('[data-weekly]');if(!t)return;
  const state=getState(),id=t.dataset.id;
  try{switch(t.dataset.weekly){
   case 'goal':showGoal(id);break;
   case 'goal-progress':showProgress(id);break;
   case 'courses-time':wizard.startPlanning(1);break;
   case 'unexpected':showUnexpected();break;
   case 'approve':if(proposal)commit(nextWeek?acceptNextWeek(state,proposal):proposal,'התוכנית אושרה. אפשר לשנות אותה בכל רגע.');proposal=null;break;
   case 'pace':wizard.startPlanning();break;
   case 'adjust':wizard.adjustCurrent();break;
   case 'view-next':if(state.weekly.nextWeek)wizard.preview({...state,...state.weekly.nextWeek},true);break;
   case 'change':open(`${heading('מה מתאים לך היום?')}<form id="weekly-change"><label for="changed-date">באיזה יום?</label><input id="changed-date" name="date" type="hidden" data-picker min="${state.weekly.weekStart}" max="${addDays(state.weekly.weekStart,6)}" value="${localDate()}"><label for="changed-minutes">כמה דקות אפשר להקדיש למטרות?</label><input id="changed-minutes" name="maxMinutes" type="number" min="0" max="720" step="5" value="30" required><small class="field-help">0 = היום לא מסתדר. ההתחייבויות הקבועות נשארות.</small><label for="changed-energy">האנרגיה שלי</label><select id="changed-energy" name="energy">${options(energies,'normal')}</select>${submit('לראות התאמה לשבוע')}</form>`);break;
   case 'course':{const c=state.courses.find(c=>c.id===id)||{};open(`${heading('המקצועות שלי')}<form id="weekly-course" data-id="${esc(id||'')}"><label for="course-name">שם המקצוע</label><input id="course-name" name="name" maxlength="120" value="${esc(c.name||'')}" required><label for="course-difficulty">איך הולך כרגע?</label><select id="course-difficulty" name="difficulty">${options([['1','די נוח'],['2','צריך תרגול'],['3','מאתגר — עדיף מקטעים קצרים']],String(c.difficulty||2))}</select><label for="course-exam">מועד מבחן (לא חובה)</label><input id="course-exam" name="examDate" type="hidden" data-picker data-optional value="${esc(c.examDate||'')}">${submit('לשמור מקצוע')}</form>`);break;}
   case 'complete':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)commit(completeWeeklySession(state,id,s.minutes),'ההתקדמות נשמרה. כל צעד נחשב.');break;}
   case 'partial':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)open(`${heading('כמה הספקת?')}<form id="weekly-partial" data-id="${esc(id)}"><label for="done-minutes">דקות שבוצעו מתוך ${s.minutes}</label><input id="done-minutes" name="minutes" type="number" min="0" max="${s.minutes}" step="1" value="${Math.floor(s.minutes/2)}" required><small class="field-help">השאר יישאר במטרה ונחפש לו מקום. 0 פירושו שלא הסתדר.</small>${submit('לעדכן התקדמות')}</form>`);break;}
   case 'move':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)open(`${heading('המפגש בזמן שמתאים לך')}<form id="weekly-move" data-id="${esc(id)}"><label for="move-date">תאריך</label><input id="move-date" name="date" type="hidden" data-picker min="${state.weekly.weekStart}" max="${addDays(state.weekly.weekStart,6)}" value="${s.date}"><label for="move-time">שעה</label><input id="move-time" name="start" type="time" value="${s.start}" required><p class="field-help">נבדוק שאין התנגשות. הבחירה שלך תינעל כדי לשמור עליה.</p>${submit('להעביר ולנעול')}</form>`);break;}
   case 'lock':{const s=getState().weekly.sessions.find(s=>s.id===id);if(s)commit(setSessionLocked(state,id,!s.locked),s.locked?'המפגש פתוח לתכנון מחדש.':'המפגש נעול בזמן שבחרת.');break;}
   case 'remove-goal':{const next=clone(state);next.goals=next.goals.filter(g=>g.id!==id);next.weekly.sessions=next.weekly.sessions.filter(s=>s.goalId!==id);preview(next);break;}
  }}catch(e){toast(e.message);}
 });
 document.addEventListener('submit',event=>{
  const f=event.target;if(!f.id.startsWith('weekly-'))return;event.preventDefault();const fd=new FormData(f),state=getState(),next=clone(state);
  try{switch(f.id){
   case 'weekly-goal':{const title=String(fd.get('title')||'').trim(),minutes=Number(fd.get('hours'))*60;if(!title||!Number.isFinite(minutes)||minutes<15||minutes>10080)throw Error('נבחר שם ויעד זמן תקינים.');const g={id:f.dataset.id||crypto.randomUUID(),title,minutes,category:fd.get('category'),courseId:fd.get('courseId'),topicId:f.dataset.topicId||'',priority:fd.get('priority'),preferredTime:fd.get('preferredTime'),sessionMinutes:Number(fd.get('sessionMinutes')),repeatWeekly:fd.has('repeatWeekly'),weekStart:state.weekly.weekStart};next.goals=next.goals.filter(x=>x.id!==g.id).concat(g);next.weekly.sessions=next.weekly.sessions.filter(s=>s.goalId!==g.id||s.locked||s.date<localDate()||(s.date===localDate()&&s.start<new Date().toTimeString().slice(0,5)));preview(next);break;}
   case 'weekly-pace':next.weekly.sessions=next.weekly.sessions.filter(s=>s.locked||s.date<localDate()||(s.date===localDate()&&s.start<new Date().toTimeString().slice(0,5)));next.weekly.load=fd.get('load');next.weekly.energy=fd.get('energy');preview(next);break;
   case 'weekly-change':next.weekly.overrides=next.weekly.overrides.filter(x=>x.date!==fd.get('date')).concat({date:fd.get('date'),maxMinutes:Number(fd.get('maxMinutes')),energy:fd.get('energy')});preview(next);break;
   case 'weekly-course':{const name=String(fd.get('name')||'').trim();if(!name)throw Error('צריך שם למקצוע.');const c={...state.courses.find(c=>c.id===f.dataset.id),id:f.dataset.id||crypto.randomUUID(),name,difficulty:Number(fd.get('difficulty')),examDate:fd.get('examDate')};next.courses=next.courses.filter(x=>x.id!==c.id).concat(c);commit(next,'המקצוע נשמר. אפשר לשייך אליו מטרות.');break;}
   case 'weekly-unexpected':{
    const first=String(fd.get('date')),count=Number(fd.get('days'))||1,mode=String(fd.get('mode'));
    const days=Array.from({length:count},(_,i)=>addDays(first,i));
    preview(applyChange(state,days,mode));break;
   }
   case 'weekly-journal':{
    const text=String(fd.get('text')||'').trim();if(!text)throw Error('כותבים כמה מילים על איך הולך.');
    const g=next.goals.find(g=>g.id===f.dataset.id);if(!g)break;
    g.journal=[...(g.journal||[]),{date:localDate(),text:text.slice(0,2000),feel:fd.get('feel')||'ok'}];
    mutate(()=>replace(next),'נשמר ביומן של המטרה.');showProgress(g.id);break;
   }
   case 'weekly-partial':commit(completeWeeklySession(state,f.dataset.id,Number(fd.get('minutes'))),'ההתקדמות נשמרה והשאר נשאר בתוכנית.');break;
   case 'weekly-move':commit(moveWeeklySession(state,f.dataset.id,fd.get('date'),fd.get('start')),'המפגש הועבר וננעל.');break;
  }}catch(e){f.querySelector('#weekly-error').textContent=e.message;}
 });
 // Something unexpected: pick the day(s) and what changed, then see the rearranged week before saving.
 function showUnexpected(){
  const state=getState(),today=localDate();
  const chips=(name,items,value)=>`<div class="choice-chips wizard-cards">${items.map(([v,t,sub])=>`<label><input type="radio" name="${name}" value="${v}" ${v===value?'checked':''}><span>${t}${sub?`<small>${sub}</small>`:''}</span></label>`).join('')}</div>`;
  open(`${heading('קרה משהו לא צפוי?')}<form id="weekly-unexpected"><p class="field-help">קורה. מספרים מה השתנה, ומסדרים מחדש את שאר השבוע. השעות הקבועות ומה שכבר עשית לא זזים, ושום דבר לא נשמר לפני שמאשרים.</p><p class="wizard-q">מה קרה?</p>${chips('mode',[['off','לא מסתדר בכלל','מפנים את היום ממשימות'],['less','יש לי פחות זמן','עד שעה למטרות'],['tired','אני עייף/ה','מפגשים קצרים ועדינים'],['more','התפנה לי זמן','אפשר להספיק יותר']],'off')}<label for="unexpected-date">מאיזה יום?</label><input id="unexpected-date" name="date" type="hidden" data-picker data-quick min="${today}" max="${addDays(state.weekly.weekStart,13)}" value="${today}"><p class="wizard-q">לכמה ימים?</p>${chips('days',[['1','יום אחד',''],['2','יומיים',''],['3','שלושה ימים','']],'1')}${submit('לסדר מחדש את השבוע')}</form>`);
 }
 // A goal's own page: this week's progress, the next sessions, and a personal journal.
 function showProgress(id){
  const state=getState(),g=state.goals.find(g=>g.id===id);if(!g)return;
  const w=state.weekly,done=w.completions.filter(c=>c.goalId===id).reduce((n,c)=>n+c.minutes,0),pct=Math.min(100,Math.round(done/Math.max(1,g.minutes)*100));
  const now=localDate(),upcoming=w.sessions.filter(s=>s.goalId===id&&s.date>=now).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).slice(0,3);
  const entries=[...(g.journal||[])].reverse();
  open(`${heading(esc(g.title))}<div class="goal-progress"><div class="goal-progress-top"><span>השבוע</span><b>${duration(done)} מתוך ${duration(g.minutes)}</b></div><div class="progress-track"><i style="width:${pct}%"></i></div><p class="field-help">${upcoming.length?'הפעמים הבאות: '+upcoming.map(s=>`${shortDate(s.date)} ב־${s.start}`).join(' · '):'אין כרגע זמן מתוכנן השבוע. אפשר לתכנן מחדש את השבוע.'}</p></div>
  <form id="weekly-journal" data-id="${esc(id)}" class="goal-journal-form"><p class="wizard-q">איך הולך עם ${esc(g.title)}?</p><div class="choice-chips feel-chips">${FEELS.map(([v,e,t],i)=>`<label><input type="radio" name="feel" value="${v}" ${i===0?'checked':''}><span>${e}<small>${t}</small></span></label>`).join('')}</div><label for="journal-text">יומן אישי</label><textarea id="journal-text" name="text" rows="3" maxlength="2000" placeholder="מה עשית, מה הרגשת, מה הצעד הבא?"></textarea>${submit('לשמור ביומן')}</form>
  ${entries.length?`<section class="goal-journal"><h3>מה כתבת עד עכשיו</h3>${entries.map(e=>`<article><header><span>${FEELS.find(f=>f[0]===e.feel)?.[1]||''}</span><time>${shortDate(e.date)}</time></header><p>${esc(e.text)}</p></article>`).join('')}</section>`:''}
  <button class="text-button goal-edit-link" data-weekly="goal" data-id="${esc(id)}">לשנות את המטרה (שם, שעות)</button>`);
 }
 return {addGoal:(courseId,topicId)=>showGoal(null,courseId,topicId)};
}
