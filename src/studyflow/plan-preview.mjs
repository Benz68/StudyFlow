import {commitmentIntervals,addDays} from './weekly.mjs';
import {timeMinutes,validDate} from './planner.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const periods=[['morning','בוקר',0,720],['afternoon','צהריים',720,1080],['evening','ערב',1080,1440]];
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const label=(date,options)=>new Date(`${date}T12:00:00`).toLocaleDateString('he-IL',options);
const integer=(value,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(value)||0)));
const PAGE_SIZE=3;
const pageCount=(count,page)=>!count?'ללא התחייבויות או מטרות':page*PAGE_SIZE>=count?`0 בעמוד זה · ${count} בסך הכול`:`${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,count)} מתוך ${count}`;

// Fixed intervals include travel once, so the occupied time is honest without duplicate events.
export function previewItems(state,plan){
 const start=plan.weekStart||state.weekly?.weekStart;
 if(!validDate(start))return [];
 const end=addDays(start,6),events=state.eventSeries||state.events||[];
 const fixed=commitmentIntervals(events,start,end).map(interval=>{
  const event=events.find(e=>e.id===interval.eventId)||{};
  return {...interval,id:interval.eventId,title:event.title||'התחייבות',fixed:true,travel:Number(event.travelBefore)>0||Number(event.travelAfter)>0};
 });
 const flexible=(plan.sessions||[]).filter(s=>s.date>=start&&s.date<=end).map(s=>({...s,start:timeMinutes(s.start),end:s.end==='24:00'?1440:timeMinutes(s.end)})).filter(s=>s.start!==null&&s.end!==null&&s.end>s.start);
 return [...fixed,...flexible].sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start||Number(b.fixed)-Number(a.fixed));
}

function entry(item,low,high){
 const clipped=item.start<low||item.end>high;
 const type=item.fixed?'קבוע':item.locked?'מטרה · נעולה':'מטרה';
 return `<article class="proposal-event ${item.fixed?'proposal-fixed':'proposal-flexible'}"><span class="proposal-kind">${type}${item.travel?' · כולל נסיעה':''}</span><bdi class="proposal-time">${clock(Math.max(item.start,low))}–${clock(Math.min(item.end,high))}</bdi><strong>${esc(item.title)}</strong>${clipped?`<small>מלא: <bdi>${clock(item.start)}–${clock(item.end)}</bdi></small>`:''}${!item.fixed&&item.goalId?`<button type="button" class="proposal-move" data-wizard="move" data-id="${esc(item.id)}" aria-label="שינוי הזמן של ${esc(item.title)}">שינוי הזמן</button>`:''}</article>`;
}

export function renderPlanPreview(state,plan,{day=0,period='morning',page=0}={}){
 const start=plan.weekStart||state.weekly?.weekStart;
 if(!validDate(start))return '<p role="status">לא נמצא שבוע לתצוגה.</p>';
 const selectedDay=integer(day,0,6),chosen=periods.find(p=>p[0]===period)||periods[0];
 const [key,name,low,high]=chosen,items=previewItems(state,plan);
 const dates=Array.from({length:7},(_,i)=>addDays(start,i));
 const buckets=dates.map(d=>items.filter(item=>item.date===d&&item.start<high&&item.end>low));
 const pages=Math.max(1,...buckets.map(bucket=>Math.ceil(bucket.length/PAGE_SIZE))),current=integer(page,0,pages-1);
 const visibleCount=buckets.reduce((n,b)=>n+b.length,0);
 return `<section class="proposal-board" aria-label="הצעת השבוע בטבלה" data-preview-current-day="${selectedDay}" data-preview-current-period="${key}" data-preview-current-page="${current}">
 <div class="proposal-toolbar"><div class="proposal-periods" role="group" aria-label="חלק ביום">${periods.map(([id,title,a,b])=>`<button type="button" data-preview-period="${id}" aria-pressed="${id===key}">${title}<small><bdi>${clock(a)}–${clock(b)}</bdi></small></button>`).join('')}</div><span class="proposal-key"><i></i> קבוע <i></i> מטרה</span></div>
 <div class="proposal-days" role="group" aria-label="בחירת יום">${dates.map((d,i)=>`<button type="button" data-preview-day="${i}" aria-pressed="${i===selectedDay}">${label(d,{weekday:'short'})}<small>${label(d,{day:'numeric',month:'numeric'})}</small></button>`).join('')}</div>
 <p class="proposal-summary">${name} · ${visibleCount} פריטים בשבוע בחלק הזה של היום<span class="proposal-mobile-summary"> · ${buckets[selectedDay].length} ביום הנבחר</span></p>
 <table class="proposal-table"><caption class="proposal-sr">התחייבויות ומטרות, ${name}. משתמשים בכפתורי חלקי היום והעמודים כדי לראות את כל הפריטים.</caption><thead><tr>${dates.map((d,i)=>`<th scope="col" class="${i===selectedDay?'proposal-selected':''}">${label(d,{weekday:'long'})}<small>${label(d,{day:'numeric',month:'numeric'})}</small></th>`).join('')}</tr></thead><tbody><tr>${buckets.map((bucket,i)=>`<td class="${i===selectedDay?'proposal-selected':''}"><div class="proposal-cell">${bucket.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE).map(item=>entry(item,low,high)).join('')||`<p class="proposal-empty">${bucket.length?'אין פריטים בעמוד הזה':'זמן פנוי'}</p>`}</div><small class="proposal-count">${pageCount(bucket.length,current)}</small></td>`).join('')}</tr></tbody></table>
 <nav class="proposal-pages" aria-label="עמודי ההצעה"><button type="button" data-preview-page="${current-1}" ${current===0?'disabled':''}>הקודם</button><span aria-live="polite">עמוד ${current+1} מתוך ${pages}${pages>1?' · עוד פריטים בעמודים האחרים':''}</span><button type="button" data-preview-page="${current+1}" ${current===pages-1?'disabled':''}>הבא</button></nav>
 </section>`;
}
