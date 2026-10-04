import {buildPlan,localDate,weekDates,expandEvents,validDate,timeMinutes,eventsOverlap} from './planner.mjs';
import {loadState,saveState,demoState,validateState} from './store.mjs';
import {shell,renderMain,icon,duration} from './views.mjs';
import {addForm,settingsForm,proContent} from './forms.mjs';
import {celebrateCompletion} from './motion.mjs';
import {startTour} from './tour.mjs';
import {enhanceDates} from './datepicker.mjs';
import {helperForm,setupHelper} from './helper.mjs';

let state=loadState(), plan, view='today', selected=localDate(), undoState=null;
let realState=null, editing=null, returnFocus=null, toastTimer, storageFailed=false;
const app=document.querySelector('#app');
app.innerHTML=shell();
const sheet=document.querySelector('#sheet');
const main=document.querySelector('#main');
const clone=value=>JSON.parse(JSON.stringify(value));
function render(){
 plan=buildPlan(state);main.classList.remove('fade');
 const dates=weekDates();if(!dates.includes(selected))selected=localDate();
 main.innerHTML=renderMain({state:{...state,eventSeries:state.events,events:expandEvents(state.events)},plan,view,selected,dates,today:localDate()});
 if(storageFailed)main.insertAdjacentHTML('afterbegin','<p class="storage-warning" role="alert">השמירה במכשיר אינה זמינה. כדאי להוריד גיבוי דרך ההעדפות לפני סגירת הדף.</p>');
 document.querySelectorAll('[data-view]').forEach(el=>{
  const active=el.dataset.view===view;el.classList.toggle('active',active);
  if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
 });
}
// Animate only on navigation, so saving a change doesn't make the page flicker.
function fadeIn(){main.classList.remove('fade');void main.offsetWidth;main.classList.add('fade');}
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
function open(content){returnFocus=document.activeElement;sheet.innerHTML=content;enhanceDates(sheet);if(!sheet.open)sheet.showModal();document.body.classList.add('dialog-open');setTimeout(()=>sheet.querySelector('[autofocus],input,button')?.focus(),0);}
function close(){sheet.close();}
sheet.addEventListener('close',()=>{document.body.classList.remove('dialog-open');editing=null;if(returnFocus?.isConnected)returnFocus.focus();else main.focus();});
sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
function showAdd(tab='task'){editing=null;open(addForm(localDate(),weekDates()[6],tab));if(tab==='event')updateRepeat();}
function editTask(id){
 const task=state.tasks.find(t=>t.id===id);if(!task)return;
 open(addForm(localDate(),task.deadline));editing=id;
 sheet.querySelector('#dialog-title').textContent='נעדכן את המשימה';
 sheet.querySelector('.form-tabs').hidden=true;
 const form=sheet.querySelector('form');for(const key of ['title','minutes','deadline','priority','category','preferredTime'])form.elements[key].value=task[key]||(key==='preferredTime'?'inherit':'');
 form.querySelector('.submit-button').textContent='לשמור ולעדכן את התוכנית';
 enhanceDates(form);syncDuration();
}
function syncDuration(){const box=sheet.querySelector('[name=minutes]');if(box)sheet.querySelectorAll('[data-minutes]').forEach(b=>b.classList.toggle('active',b.dataset.minutes===box.value));}
document.addEventListener('input',event=>{if(event.target.name==='minutes')syncDuration();});
function recurrenceEnd(date,mode,weeks=4){
 const end=new Date(`${date}T12:00:00`);
 if(mode==='weeks')end.setDate(end.getDate()+Number(weeks)*7-1);
 else {const month=end.getMonth();end.setFullYear(end.getFullYear()+1);if(end.getMonth()!==month)end.setDate(0);end.setDate(end.getDate()-1);}
 return localDate(end);
}
function updateRepeat(){
 const form=sheet.querySelector('#add-form');if(form?.dataset.kind!=='event')return;
 const mode=form.elements.repeatMode.value,date=form.elements.date.value;
 form.querySelector('#repeat-fields').hidden=mode==='once';
 form.querySelector('#weeks-field').hidden=mode!=='weeks';
 form.querySelector('#until-field').hidden=mode!=='custom';
 form.elements.weeksCount.disabled=mode!=='weeks';form.elements.repeatUntil.disabled=mode!=='custom';
 form.elements.repeatUntil.required=mode==='custom';
 if(validDate(date)){
  form.elements.repeatUntil.min=date;
  if(!form.elements.repeatUntil.value)form.elements.repeatUntil.value=recurrenceEnd(date,'year');
  enhanceDates(form);
  const until=mode==='custom'?form.elements.repeatUntil.value:recurrenceEnd(date,mode,form.elements.weeksCount.value);
  const labels=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const weekdays=[...form.querySelectorAll('[name=weekdays]:checked')].map(el=>Number(el.value));
  const selectedDays=weekdays.map(day=>labels[day]);
  const format=value=>validDate(value)?new Date(`${value}T12:00:00`).toLocaleDateString('he-IL'):value;
  const summary=form.querySelector('#repeat-summary');
  if(mode==='once')summary.textContent=`פעם אחת בלבד, ב־${format(date)}. הפעילות לא תחזור בשבוע הבא.`;
  else if(!weekdays.length)summary.textContent='בחר לפחות יום אחד בשבוע כדי לראות מתי הפעילות מסתיימת.';
  else if(!validDate(until)||until<date)summary.textContent='בחר תאריך סיום ביום ההתחלה או אחריו.';
  else {
   const cursor=new Date(`${until}T12:00:00`),excluded=state.events.find(e=>e.id===editing)?.excludedDates||[];
   while(localDate(cursor)>=date&&(!weekdays.includes(cursor.getDay())||excluded.includes(localDate(cursor))))cursor.setDate(cursor.getDate()-1);
   const last=localDate(cursor);
   summary.textContent=last<date?'אין מועד פעיל בטווח שבחרת. אפשר לשנות ימים או תאריך סיום.':`בכל שבוע בימים ${selectedDays.join(', ')}, מ־${format(date)} עד ${format(until)}${mode==='year'?' — שנה מתאריך ההתחלה':''}. המועד האחרון: ${format(last)}. אחריו הפעילות תיפסק אוטומטית. אפשר להפסיק מוקדם דרך עריכת הפעילות.`;
  }
 }
}
function editEvent(id){
 const item=state.events.find(e=>e.id===id);if(!item)return;
 open(addForm(localDate(),weekDates()[6],'event'));editing=id;
 sheet.querySelector('#dialog-title').textContent=item.repeat==='weekly'?'נעדכן את הפעילות החוזרת':'נעדכן את הפעילות';
 sheet.querySelector('.form-tabs').hidden=true;
 const form=sheet.querySelector('form');for(const key of ['title','date','start','end'])form.elements[key].value=item[key];
 form.elements.date.min=item.date<localDate()?item.date:localDate();
 form.elements.repeatMode.value=item.repeat==='weekly'?'custom':'once';
 form.elements.repeatUntil.value=item.repeatUntil||recurrenceEnd(item.date,'year');
 const weekdays=item.weekdays?.length?item.weekdays:[new Date(`${item.date}T12:00:00`).getDay()];
 form.querySelectorAll('[name=weekdays]').forEach(el=>{el.checked=weekdays.includes(Number(el.value));});
 form.querySelector('.submit-button').textContent='לשמור ולעדכן את התוכנית';
 if(item.repeat==='weekly'&&(!item.repeatUntil||item.repeatUntil>=localDate())){
  const stop=document.createElement('button');stop.type='button';stop.className='text-button stop-series-button';stop.dataset.action='stop-series';stop.dataset.id=id;stop.textContent='להפסיק את הפעילות מהיום';form.append(stop);
 }
 updateRepeat();
}
// The AI helper's items come back loosely filled; turn each into a task or fixed event the planner accepts,
// and explain anything that can't be added as-is.
const pad2=n=>String(n).padStart(2,'0');
const dayName=date=>new Date(`${date}T12:00:00`).toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'});
function helperItem(item,taken){
 const today=localDate(),title=String(item.title||'').trim().slice(0,120);
 const date=validDate(item.date)?item.date:'',time=timeMinutes(item.time)!==null?item.time:'';
 if(item.kind==='event'){
  if(!date)return {problem:'לא ברור באיזה יום. אפשר להוסיף ידנית.',label:'שעה קבועה'};
  if(timeMinutes(item.start)===null)return {problem:'לא ברור באיזו שעה. אפשר להוסיף ידנית.',label:`שעה קבועה · ${dayName(date)}`};
  let end=timeMinutes(item.end)!==null&&item.end>item.start?item.end:'';
  if(!end){const m=Math.min(timeMinutes(item.start)+60,23*60+59);end=`${pad2(Math.floor(m/60))}:${pad2(m%60)}`;}
  const event={id:crypto.randomUUID(),title,date,start:item.start,end};
  if(item.weekly)Object.assign(event,{repeat:'weekly',weekdays:[new Date(`${date}T12:00:00`).getDay()],repeatUntil:recurrenceEnd(date,'year'),excludedDates:[]});
  const label=`שעה קבועה · ${dayName(date)} · ${item.start}–${end}${item.weekly?' · כל שבוע':''}`;
  if(date<today)return {problem:'התאריך הזה כבר עבר.',label};
  const clash=[...state.events,...taken].find(e=>eventsOverlap(e,event));
  if(clash)return {problem:`חופף ל״${clash.title}״.`,label};
  return {label,data:{kind:'event',event}};
 }
 const minutes=Math.min(Math.max(Number(item.minutes)||60,5),10080);
 let deadline=[item.deadline,date].filter(validDate).sort().pop()||weekDates()[6];
 if(deadline<today)deadline=today;
 const task={id:crypto.randomUUID(),title,minutes,deadline,priority:'normal',category:['study','personal','work'].includes(item.category)?item.category:'study',preferredTime:'inherit',done:false,completedMinutes:0};
 if(date&&date>=today){const start=new Date(`${date}T${time||'00:00'}`);if(start>new Date())task.notBefore=start.toISOString();}
 const label=`משימה · ${duration(minutes)} · ${date?dayName(date)+(time?` ב־${time}`:''):'עד '+dayName(deadline)}`;
 if(date&&date<today)return {problem:'היום הזה כבר עבר. נשבץ עד סוף השבוע אם מסמנים.',label,data:{kind:'task',task}};
 return {label,data:{kind:'task',task}};
}
function showHelper(){
 open(helperForm());
 const taken=[];
 setupHelper(sheet,{
  today:localDate(),
  weekday:new Date().toLocaleDateString('en-US',{weekday:'long'}),
  describe:item=>{const result=helperItem(item,taken);if(result.data?.kind==='event'&&!result.problem)taken.push(result.data.event);return result;},
  add:chosen=>{
   const usable=chosen.filter(item=>item.data);
   mutate(()=>{for(const {data,title} of usable){const name=title.trim().slice(0,120);if(data.kind==='task')state.tasks.push({...data.task,title:name});else state.events.push({...data.event,title:name});}},usable.length===1?'נוסף לתוכנית.':`נוספו ${usable.length} פריטים לתוכנית.`);
   close();
  }
 });
}
function stopSeries(id){
 const item=state.events.find(e=>e.id===id&&e.repeat==='weekly');if(!item)return;
 open(`<div class="sheet-top"><h2 id="dialog-title">להפסיק מהיום?</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div><p>הפעילות לא תופיע מהיום והלאה. המועדים שכבר עברו יישמרו, והזמן שהתפנה יהיה זמין למשימות.</p><button class="primary submit-button" data-action="confirm-stop-series">כן, להפסיק מהיום</button><button class="text-button" data-action="cancel-stop-series">לחזור לעריכה</button>`);
 sheet.dataset.stopId=id;
}
function removeEvent(id,date){
 const item=state.events.find(e=>e.id===id);if(!item)return;
 if(item.repeat!=='weekly'){mutate(()=>{state.events=state.events.filter(e=>e.id!==id);},'הזמן הזה שוב פנוי.');return;}
 open(`<div class="sheet-top"><h2 id="dialog-title">מה לבטל?</h2><button class="icon-button" data-action="close" aria-label="סגירה">${icon('close')}</button></div><p>${validDate(date)?"זו התחייבות שחוזרת מדי שבוע. אפשר לפנות רק את הפעם הזאת או את כל הסדרה.":"ביטול הסדרה יפנה את כל המועדים שלה. כדי לבטל מועד אחד, בחר אותו בתוכנית היומית."}</p>${validDate(date)?'<button class="primary submit-button" data-action="remove-occurrence">רק את המועד הזה</button>':''}<button class="text-button" data-action="remove-series">את כל הסדרה</button>`);
 sheet.dataset.removalId=id;sheet.dataset.removalDate=validDate(date)?date:item.date;
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a.brand');if(!target)return;
 if(target.matches('a.brand')){event.preventDefault();view='today';selected=localDate();render();return;}
 if(target.dataset.view){view=target.dataset.view;if(view==='today')selected=localDate();render();fadeIn();main.focus();return;}
 if(target.dataset.date&&!target.dataset.action){selected=target.dataset.date;if(view==='week')view='today';render();fadeIn();return;}
 if(target.dataset.formTab){showAdd(target.dataset.formTab);return;}
 if(target.dataset.minutes){sheet.querySelector('[name=minutes]').value=target.dataset.minutes;syncDuration();return;}
 const id=target.dataset.id;
 switch(target.dataset.action){
  case 'add':showAdd();break;
  case 'close':close();break;
  case 'settings':open(settingsForm(state.preferences));break;
  case 'helper':showHelper();break;
  case 'tour':if(sheet.open)close();view='today';selected=localDate();render();startTour();break;
  case 'pro':open(proContent());break;
  case 'edit-task':editTask(id);break;
  case 'edit-event':editEvent(id);break;
  case 'stop-series':stopSeries(id);break;
  case 'cancel-stop-series':editEvent(sheet.dataset.stopId);break;
  case 'confirm-stop-series':{
   const stopId=sheet.dataset.stopId,today=localDate(),yesterday=new Date(`${today}T12:00:00`);yesterday.setDate(yesterday.getDate()-1);
   mutate(()=>{state.events=state.events.flatMap(item=>item.id!==stopId?[item]:item.date>=today?[]:[{...item,repeatUntil:item.repeatUntil&&item.repeatUntil<today?item.repeatUntil:localDate(yesterday)}]);},'הפעילות הופסקה מהיום. התוכנית עודכנה.');close();break;
  }
  case 'demo':if(!state.tasks.length&&!state.events.length){realState=clone(state);state={...demoState(),demo:true};undoState=null;render();
   // Late in the day today can be empty, so open the sample on the first day that has something in it.
   const busy=weekDates().find(date=>plan.sessions.some(s=>s.date===date));if(busy&&busy!==selected){selected=busy;render();}}break;
  case 'exit-demo':if(realState){state=realState;realState=null;undoState=null;selected=localDate();render();toast('המרחב שלך מוכן. מתחילים במשימה אחת.');}break;
  case 'replan':render();toast(plan.unscheduled.length?'עדכנו את התוכנית. כמה משימות עדיין צריכות מקום.':'התוכנית מעודכנת לפי הזמן הפנוי שלך.');break;
  case 'complete-session':{
   const session=plan.sessions.find(s=>s.id===id);if(!session)return;
   celebrateCompletion(target);
   mutate(()=>{const t=state.tasks.find(t=>t.id===session.taskId);t.completedMinutes=Math.min(t.minutes,(t.completedMinutes||0)+session.minutes);t.completionLog=[...(t.completionLog||[]),{date:localDate(),minutes:session.minutes}];t.done=t.completedMinutes>=t.minutes;},'עוד צעד מאחוריך. כל הכבוד!');break;
  }
  case 'delay':{const session=plan.sessions.find(s=>s.id===id);if(!session)break;mutate(()=>{const t=state.tasks.find(t=>t.id===session.taskId);const later=new Date(Math.max(Date.now(),new Date(`${session.date}T${session.start}`).getTime())+60*60*1000);t.notBefore=later.toISOString();},()=>plan.unscheduled.some(t=>t.taskId===session.taskId)?'דחינו בשעה. חלק מהמשימה לא נכנס לפני היעד — אפשר לעדכן אותו.':'דחינו את המשימה בשעה והתוכנית עודכנה.');break;}
  case 'toggle-task':mutate(()=>{const t=state.tasks.find(t=>t.id===id);t.done=!t.done;t.completedMinutes=t.done?t.minutes:0;if(!t.done)t.completionLog=[];},'המשימה עודכנה והתוכנית הותאמה.');break;
  case 'delete-task':mutate(()=>{state.tasks=state.tasks.filter(t=>t.id!==id);},'המשימה הוסרה.');break;
  case 'delete-event':removeEvent(id,target.dataset.date);break;
  case 'remove-occurrence':mutate(()=>{const item=state.events.find(e=>e.id===sheet.dataset.removalId);if(item)item.excludedDates=[...new Set([...(item.excludedDates||[]),sheet.dataset.removalDate])];},'המועד הזה בוטל. שאר הסדרה נשארה.');close();break;
  case 'remove-series':mutate(()=>{state.events=state.events.filter(e=>e.id!==sheet.dataset.removalId);},'הסדרה הוסרה והמשימות הותאמו.');close();break;
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
  p.preferredDays=fd.getAll('preferredDays').map(Number);p.preferredTime=fd.get('preferredTime');
  p.scheduleStyle=fd.get('scheduleStyle');p.allowOutsidePreferred=fd.has('allowOutsidePreferred');
  if(Object.values(p).slice(0,5).some(n=>!Number.isFinite(n))||p.startHour<0||p.startHour>22||p.startHour>=p.endHour||p.endHour>23)return error('שעת הסיום צריכה להיות אחרי שעת ההתחלה, ולכל המאוחר 23.');
  if(p.excludedDays.length===7)return error('כדי לתכנן, צריך להשאיר לפחות יום אחד פנוי למשימות.');
  mutate(()=>{state.preferences=p;},'הקצב עודכן. התוכנית הותאמה אליך.');close();return;
 }
 const title=String(fd.get('title')||'').trim();if(!title||title.length>120)return error('נבחר שם קצר, עד 120 תווים.');
 if(form.dataset.kind==='task'){
  const minutes=Number(fd.get('minutes')),deadline=String(fd.get('deadline'));
  if(!Number.isFinite(minutes)||minutes<5||minutes>10080)return error('משך המשימה צריך להיות בין 5 ל־10,080 דקות.');
  if(!validDate(deadline)||deadline<localDate())return error('נבחר תאריך יעד מהיום והלאה.');
  const task={id:editing||crypto.randomUUID(),title,minutes,deadline,priority:fd.get('priority'),category:fd.get('category'),preferredTime:fd.get('preferredTime'),done:false,completedMinutes:0};
  if(!editing&&state.tasks.length>=1000)return error('הרשימה מלאה. אפשר לגבות ולמחוק משימות שהושלמו.');
  mutate(()=>{if(editing){const old=state.tasks.find(t=>t.id===editing);task.completedMinutes=Math.min(old.completedMinutes||0,minutes);task.done=task.completedMinutes>=minutes;state.tasks=state.tasks.map(t=>t.id===editing?{...old,...task}:t);}else state.tasks.push(task);},()=>plan.unscheduled.some(t=>t.taskId===task.id)?'המשימה נשמרה. חסר לה זמן פנוי — אפשר להתאים שעות או תאריך יעד.':'המשימה נשמרה והתוכנית עודכנה.');
 }else{
  const start=String(fd.get('start')),end=String(fd.get('end')),date=String(fd.get('date'));
  const old=editing?state.events.find(e=>e.id===editing):null;
  if(!validDate(date)||(date<localDate()&&date!==old?.date))return error('נבחר תאריך תקין מהיום והלאה.');
  if(timeMinutes(start)===null||timeMinutes(end)===null||start>=end)return error('שעת הסיום צריכה להיות אחרי שעת ההתחלה.');
  const item={id:editing||crypto.randomUUID(),title,date,start,end};
  const mode=String(fd.get('repeatMode'));
  if(!['once','weeks','year','custom'].includes(mode))return error('נבחר משך תקין להתחייבות.');
  if(mode!=='once'){
   const weeks=Number(fd.get('weeksCount'));
   if(mode==='weeks'&&(!Number.isInteger(weeks)||weeks<1||weeks>52))return error('אפשר לבחור בין שבוע אחד ל־52 שבועות.');
   const weekdays=fd.getAll('weekdays').map(Number);
   if(!weekdays.length||weekdays.some(day=>!Number.isInteger(day)||day<0||day>6))return error('נבחר לפחות יום אחד בשבוע.');
   const repeatUntil=mode==='custom'?String(fd.get('repeatUntil')):recurrenceEnd(date,mode,weeks);
   if(!validDate(repeatUntil)||repeatUntil<date)return error('תאריך הסיום צריך להיות ביום ההתחלה או אחריו.');
   const firstWeek=weekDates(new Date(`${date}T12:00:00`));
   if(!firstWeek.some(day=>day<=repeatUntil&&weekdays.includes(new Date(`${day}T12:00:00`).getDay())))return error('הימים שבחרת לא מופיעים בטווח הזה. נרחיב את הטווח או נבחר יום אחר.');
   Object.assign(item,{repeat:'weekly',weekdays,repeatUntil,excludedDates:old?.excludedDates||[]});
  }
  const overlap=state.events.find(e=>e.id!==item.id&&eventsOverlap(e,item));
  if(overlap)return error(`יש חפיפה עם ״${overlap.title}״. אפשר לשנות יום או שעות ולנסות שוב.`);
  if(!editing&&state.events.length>=2000)return error('רשימת ההתחייבויות מלאה. אפשר לגבות ולמחוק התחייבויות ישנות.');
  mutate(()=>{if(editing)state.events=state.events.map(e=>e.id===editing?item:e);else state.events.push(item);},'הזמן נשמר. המשימות מסביבו הותאמו.');
 }
 close();
});
document.addEventListener('change',async event=>{
 if(event.target.closest('#add-form')?.dataset.kind==='event'){
  if(event.target.name==='date'&&!editing){const day=new Date(`${event.target.value}T12:00:00`).getDay();sheet.querySelectorAll('[name=weekdays]').forEach(el=>{el.checked=Number(el.value)===day;});}
  updateRepeat();return;
 }
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
 }catch{toast('לא הצלחנו לקרוא את הגיבוי. יש לבחור קובץ גיבוי תקין של StudyFlow.');}
});
render();
// The AI helper needs the local server; on a plain web host (GitHub Pages) its buttons are hidden.
fetch('api/assistant').then(r=>r.ok?r.json():null).catch(()=>null).then(info=>{if(!info?.available)document.body.classList.add('no-helper');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!sheet.open)render();});
