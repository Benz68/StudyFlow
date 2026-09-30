import {buildPlan,localDate,weekDates,expandEvents,validDate,timeMinutes} from './planner.mjs';
import {loadState,saveState,demoState,validateState} from './store.mjs';
import {shell,renderMain,icon} from './views.mjs';
import {addForm,settingsForm,proContent} from './forms.mjs';

let state=loadState(), plan, view='today', selected=localDate(), undoState=null;
let realState=null, editing=null, returnFocus=null, toastTimer, storageFailed=false;
const app=document.querySelector('#app');
app.innerHTML=shell();
const sheet=document.querySelector('#sheet');
const main=document.querySelector('#main');
const clone=value=>JSON.parse(JSON.stringify(value));
function render(){
 plan=buildPlan(state);
 const dates=weekDates();if(!dates.includes(selected))selected=localDate();
 main.innerHTML=renderMain({state:{...state,events:expandEvents(state.events)},plan,view,selected,dates,today:localDate()});
 if(storageFailed)main.insertAdjacentHTML('afterbegin','<p class="storage-warning" role="alert">השמירה במכשיר אינה זמינה. כדאי להוריד גיבוי דרך ההעדפות לפני סגירת הדף.</p>');
 document.querySelectorAll('[data-view]').forEach(el=>{
  const active=el.dataset.view===view;el.classList.toggle('active',active);
  if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
 });
}
function toast(message,undo=false){
 clearTimeout(toastTimer); const el=document.querySelector('#toast');el.replaceChildren();
 const span=document.createElement('span');span.textContent=message;el.append(span);
 if(undo){const button=document.createElement('button');button.textContent='ביטול';button.dataset.action='undo';el.append(button);}
 el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),7000);
}
function mutate(change,message){
 undoState=clone(state);change();const saved=state.demo||saveState(state);storageFailed=!saved;render();
 toast(saved?(typeof message==='function'?message():message):'השינוי מוצג, אבל לא נשמר במכשיר. אפשר להוריד גיבוי דרך ההעדפות.',true);
}
function open(content){returnFocus=document.activeElement;sheet.innerHTML=content;if(!sheet.open)sheet.showModal();document.body.classList.add('dialog-open');setTimeout(()=>sheet.querySelector('[autofocus],input,button')?.focus(),0);}
function close(){sheet.close();}
sheet.addEventListener('close',()=>{document.body.classList.remove('dialog-open');editing=null;if(returnFocus?.isConnected)returnFocus.focus();else main.focus();});
sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
function showAdd(tab='task'){editing=null;open(addForm(localDate(),weekDates()[6],tab));}
function editTask(id){
 const task=state.tasks.find(t=>t.id===id);if(!task)return;
 open(addForm(localDate(),task.deadline));editing=id;
 sheet.querySelector('#dialog-title').textContent='נעדכן את המשימה';
 sheet.querySelector('.form-tabs').hidden=true;
 const form=sheet.querySelector('form');for(const key of ['title','minutes','deadline','priority','category'])form.elements[key].value=task[key];
 form.querySelector('.submit-button').textContent='לשמור ולעדכן את התוכנית';
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a.brand');if(!target)return;
 if(target.matches('a.brand')){event.preventDefault();view='today';selected=localDate();render();return;}
 if(target.dataset.view){view=target.dataset.view;if(view==='today')selected=localDate();render();main.focus();return;}
 if(target.dataset.date){selected=target.dataset.date;if(view==='week')view='today';render();return;}
 if(target.dataset.formTab){showAdd(target.dataset.formTab);return;}
 if(target.dataset.minutes){sheet.querySelector('[name=minutes]').value=target.dataset.minutes;sheet.querySelectorAll('[data-minutes]').forEach(b=>b.classList.toggle('active',b===target));return;}
 const id=target.dataset.id;
 switch(target.dataset.action){
  case 'add':showAdd();break;
  case 'close':close();break;
  case 'settings':open(settingsForm(state.preferences));break;
  case 'pro':open(proContent());break;
  case 'edit-task':editTask(id);break;
  case 'demo':if(!state.tasks.length&&!state.events.length){realState=clone(state);state={...demoState(),demo:true};undoState=null;render();}break;
  case 'exit-demo':if(realState){state=realState;realState=null;undoState=null;selected=localDate();render();toast('המרחב שלך מוכן. מתחילים במשימה אחת.');}break;
  case 'replan':render();toast(plan.unscheduled.length?'עדכנו את התוכנית. כמה משימות עדיין צריכות מקום.':'התוכנית מעודכנת לפי הזמן הפנוי שלך.');break;
  case 'complete-session':{
   const session=plan.sessions.find(s=>s.id===id);if(!session)return;
   mutate(()=>{const t=state.tasks.find(t=>t.id===session.taskId);t.completedMinutes=Math.min(t.minutes,(t.completedMinutes||0)+session.minutes);t.completionLog=[...(t.completionLog||[]),{date:localDate(),minutes:session.minutes}];t.done=t.completedMinutes>=t.minutes;},'עוד צעד מאחוריך. כל הכבוד!');break;
  }
  case 'delay':{const session=plan.sessions.find(s=>s.id===id);if(!session)break;mutate(()=>{const t=state.tasks.find(t=>t.id===session.taskId);const later=new Date(Math.max(Date.now(),new Date(`${session.date}T${session.start}`).getTime())+60*60*1000);t.notBefore=later.toISOString();},()=>plan.unscheduled.some(t=>t.taskId===session.taskId)?'דחינו בשעה. חלק מהמשימה לא נכנס לפני היעד — אפשר לעדכן אותו.':'דחינו את המשימה בשעה והתוכנית עודכנה.');break;}
  case 'toggle-task':mutate(()=>{const t=state.tasks.find(t=>t.id===id);t.done=!t.done;t.completedMinutes=t.done?t.minutes:0;if(!t.done)t.completionLog=[];},'המשימה עודכנה והתוכנית הותאמה.');break;
  case 'delete-task':mutate(()=>{state.tasks=state.tasks.filter(t=>t.id!==id);},'המשימה הוסרה.');break;
  case 'delete-event':mutate(()=>{state.events=state.events.filter(t=>t.id!==id);},'הזמן הזה שוב פנוי.');break;
  case 'undo':if(undoState){const before=undoState;undoState=null;state=before;const saved=state.demo||saveState(state);storageFailed=!saved;render();toast(saved?'השינוי האחרון בוטל.':'השינוי בוטל, אבל לא ניתן לשמור במכשיר.');}break;
  case 'export':{
   const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=`StudyFlow-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('הגיבוי מוכן להורדה.');break;
  }
 }
});
document.addEventListener('submit',event=>{
 const form=event.target;if(!['add-form','settings-form'].includes(form.id))return;event.preventDefault();
 const fd=new FormData(form),error=message=>{form.querySelector('#form-error').textContent=message;};
 if(form.id==='settings-form'){
  const p=Object.fromEntries(['startHour','endHour','maxDailyMinutes','sessionMinutes','breakMinutes'].map(k=>[k,Number(fd.get(k))]));
  p.excludedDays=fd.getAll('excludedDays').map(Number);
  if(Object.values(p).slice(0,5).some(n=>!Number.isFinite(n))||p.startHour<0||p.startHour>22||p.startHour>=p.endHour||p.endHour>23)return error('שעת הסיום צריכה להיות אחרי שעת ההתחלה, ולכל המאוחר 23.');
  if(p.excludedDays.length===7)return error('כדי לתכנן, צריך להשאיר לפחות יום אחד פנוי למשימות.');
  mutate(()=>{state.preferences=p;},'הקצב עודכן. התוכנית הותאמה אליך.');close();return;
 }
 const title=String(fd.get('title')||'').trim();if(!title||title.length>120)return error('נבחר שם קצר, עד 120 תווים.');
 if(form.dataset.kind==='task'){
  const minutes=Number(fd.get('minutes')),deadline=String(fd.get('deadline'));
  if(!Number.isFinite(minutes)||minutes<5||minutes>10080)return error('משך המשימה צריך להיות בין 5 ל־10,080 דקות.');
  if(!validDate(deadline)||deadline<localDate())return error('נבחר תאריך יעד מהיום והלאה.');
  const task={id:editing||crypto.randomUUID(),title,minutes,deadline,priority:fd.get('priority'),category:fd.get('category'),done:false,completedMinutes:0};
  if(!editing&&state.tasks.length>=1000)return error('הרשימה מלאה. אפשר לגבות ולמחוק משימות שהושלמו.');
  mutate(()=>{if(editing){const old=state.tasks.find(t=>t.id===editing);task.completedMinutes=Math.min(old.completedMinutes||0,minutes);task.done=task.completedMinutes>=minutes;state.tasks=state.tasks.map(t=>t.id===editing?{...old,...task}:t);}else state.tasks.push(task);},()=>plan.unscheduled.some(t=>t.taskId===task.id)?'המשימה נשמרה. חסר לה זמן פנוי — אפשר להתאים שעות או תאריך יעד.':'המשימה נשמרה והתוכנית עודכנה.');
 }else{
  const start=String(fd.get('start')),end=String(fd.get('end')),date=String(fd.get('date'));
  if(!validDate(date)||date<localDate())return error('נבחר תאריך תקין מהיום והלאה.');
  if(timeMinutes(start)===null||timeMinutes(end)===null||start>=end)return error('שעת הסיום צריכה להיות אחרי שעת ההתחלה.');
  const overlap=expandEvents(state.events,new Date(`${date}T12:00:00`)).some(e=>e.date===date&&e.start<end&&e.end>start);if(overlap)return error('כבר יש התחייבות בחלק מהזמן הזה. כדאי לבחור זמן אחר.');
  if(state.events.length>=2000)return error('רשימת ההתחייבויות מלאה. אפשר לגבות ולמחוק התחייבויות ישנות.');
  mutate(()=>state.events.push({id:crypto.randomUUID(),title,date,start,end,...(fd.get('repeat')?{repeat:'weekly'}:{})}),'הזמן נשמר. המשימות מסביבו הותאמו.');
 }
 close();
});
document.addEventListener('change',async event=>{
 if(event.target.id!=='import-file')return;
 const file=event.target.files[0];if(!file)return;
 if(file.size>2_000_000){toast('הקובץ גדול מדי. יש לבחור גיבוי עד 2 מגה־בייט.');return;}
 try{
  const raw=JSON.parse(await file.text());if(!Array.isArray(raw.tasks)||!Array.isArray(raw.events))throw new Error('shape');
  const imported=validateState(raw);if(imported.tasks.length!==raw.tasks.length||imported.events.length!==raw.events.length)throw new Error('items');
  const ids=new Set(state.tasks.map(t=>t.id)),eventIds=new Set(state.events.map(e=>e.id));
  const tasks=[...state.tasks,...imported.tasks.filter(t=>!ids.has(t.id))],events=[...state.events,...imported.events.filter(e=>!eventIds.has(e.id))];
  if(tasks.length>1000||events.length>2000)throw new Error('capacity');
  mutate(()=>{state.tasks=tasks;state.events=events;},'המשימות וההתחייבויות מהגיבוי נוספו.');close();
 }catch{toast('לא הצלחנו לקרוא את הגיבוי. יש לבחור קובץ JSON תקין של StudyFlow.');}
});
render();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!sheet.open)render();});
