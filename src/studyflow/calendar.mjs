import {expandEvents, localDate, validDate, timeMinutes} from './planner.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateObject = date => new Date(`${date}T12:00:00`);
const shift = (date, days) => {const value=dateObject(date);value.setDate(value.getDate()+days);return localDate(value);};
const dayLabel = date => dateObject(date).toLocaleDateString('he-IL',{weekday:'long'});
const dateLabel = date => dateObject(date).toLocaleDateString('he-IL',{day:'numeric',month:'long'});
const minutes = time => time==='24:00' ? 1440 : timeMinutes(time);
const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const eventSource = state => Array.isArray(state.eventSeries) ? state.eventSeries : state.events || [];

export function calendarMonthDates(month) {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) throw new RangeError('החודש אינו תקין');
  const first=`${month}-01`, last=dateObject(first);last.setMonth(last.getMonth()+1,0);
  const start=shift(first,-dateObject(first).getDay());
  const count=Math.ceil((dateObject(first).getDay()+last.getDate())/7)*7;
  return Array.from({length:count},(_,index)=>shift(start,index));
}

export function calendarEvents(events, dates) {
  if (!dates.length) return [];
  const wanted=new Set(dates), result=[];
  for (let index=0;index<dates.length;index+=7) {
    result.push(...expandEvents(events,dateObject(dates[index])).filter(event=>wanted.has(event.date)));
  }
  return result;
}

// Concurrent events share a column group; touching endpoints are not overlaps.
export function calendarPlacements(items) {
  const sorted=items.map(item=>({...item,from:minutes(item.start),to:minutes(item.end)}))
    .filter(item=>item.from!==null && item.to!==null && item.to>item.from)
    .sort((a,b)=>a.from-b.from || b.to-a.to);
  const result=[];let group=[], end=-1;
  const flush=()=>{
    const columns=[];
    for (const item of group) {
      let lane=columns.findIndex(until=>until<=item.from);
      if(lane<0)lane=columns.length;
      columns[lane]=item.to;item.lane=lane;
    }
    result.push(...group.map(item=>({...item,lanes:columns.length})));
    group=[];
  };
  for(const item of sorted){if(item.from>=end){flush();end=-1;}group.push(item);end=Math.max(end,item.to);}
  flush();return result;
}

function modeControls(mode) {
  return `<div class="calendar-modes" role="group" aria-label="תצוגת היומן"><button data-calendar-mode="week" aria-pressed="${mode==='week'}">שבוע</button><button data-calendar-mode="month" aria-pressed="${mode==='month'}">חודש · זמנים קבועים</button></div>`;
}
function itemAction(item) {
  return item.fixed ? `data-action="edit-event" data-id="${escape(item.id)}"` : item.goalId ? `data-weekly="move" data-id="${escape(item.id)}"` : `data-action="edit-task" data-id="${escape(item.taskId)}"`;
}
const shortDay = date => dateObject(date).toLocaleDateString('he-IL',{weekday:'short'});
const kindLabel = item => item.fixed ? 'זמן קבוע' : item.locked ? 'מטרה נעולה' : 'מטרה';
// On phones the week (and month) is shown as a simple list, day after day.
function agenda(dates,items,today,{skipEmpty=false}={}) {
  const tomorrow=shift(today,1);
  const blocks=dates.map(date=>{
    const list=items.filter(item=>item.date===date).sort((a,b)=>a.start.localeCompare(b.start));
    // Empty days that already passed only take room, so they're left out.
    if(!list.length&&(skipEmpty||date<today))return '';
    const name=date===today?'היום':date===tomorrow?'מחר':dayLabel(date);
    return `<section class="agenda-day-block ${date===today?'is-today':''}"><h3><span>${name}</span><small>${dayLabel(date)===name?'':dayLabel(date)+' · '}${dateLabel(date)}</small></h3>${list.length?list.map(item=>`<button class="agenda-entry ${item.fixed?'is-fixed':'is-goal'}" ${itemAction(item)} aria-label="${escape(`${item.title}, ${item.start}–${item.end}, ${kindLabel(item)}`)}"><bdi>${item.start}<small>${item.end}</small></bdi><span><strong>${escape(item.title)}</strong><em>${kindLabel(item)}</em></span></button>`).join(''):'<p class="agenda-free">יום פנוי</p>'}</section>`;
  }).join('');
  return `<div class="calendar-agenda">${blocks||'<p class="agenda-free">אין התחייבויות קבועות בחודש הזה.</p>'}</div>`;
}
function weekly(state,plan,start) {
  const dates=Array.from({length:7},(_,index)=>shift(start,index));
  const items=[...calendarEvents(eventSource(state),dates).map(event=>({...event,fixed:true})),...(plan.sessions||[]).filter(item=>dates.includes(item.date))];
  const valid=items.filter(item=>minutes(item.start)!==null && minutes(item.end)!==null && minutes(item.end)>minutes(item.start));
  const from=Math.min(8*60,...valid.map(item=>Math.floor(minutes(item.start)/60)*60));
  const to=Math.max(21*60,...valid.map(item=>Math.ceil(minutes(item.end)/60)*60));
  const height=(to-from)*1.2, hours=Array.from({length:(to-from)/60+1},(_,index)=>from+index*60);
  const today=localDate();
  return `<div class="calendar-summary"><p class="calendar-range">${dateLabel(start)} – ${dateLabel(dates[6])}</p><div class="calendar-legend"><span class="calendar-key fixed">זמן קבוע</span><span class="calendar-key goal">מטרה / זמן לקורס</span></div></div><p class="calendar-caption">לחיצה על מפגש פותחת אותו לעריכה.</p>${agenda(dates,valid,today)}<p class="calendar-scroll-hint">אפשר לגלול לצדדים כדי לראות את כל השבוע.</p><div class="calendar-scroll" tabindex="0" role="region" aria-label="יומן שבועי, ימים ושעות"><div class="calendar-week"><div class="calendar-corner">שעה</div>${dates.map(date=>`<div class="calendar-day-heading ${date===today?'is-today':''}" aria-label="${dayLabel(date)}, ${dateLabel(date)}"><b>${shortDay(date)}</b><span>${dateObject(date).getDate()}</span></div>`).join('')}<div class="calendar-hours" style="height:${height}px">${hours.map(hour=>`<span style="top:${(hour-from)*1.2}px">${clock(hour)}</span>`).join('')}</div>${dates.map(date=>`<section class="calendar-day ${date===today?'is-today':''}" aria-label="${dayLabel(date)}, ${dateLabel(date)}" style="height:${height}px">${calendarPlacements(valid.filter(item=>item.date===date)).map(item=>{
    const title=`${item.title}, ${item.start}–${item.end}, ${item.fixed?'זמן קבוע':item.locked?'מטרה נעולה':'מטרה גמישה'}`;
    return `<button class="calendar-event ${item.fixed?'is-fixed':'is-goal'} ${item.to-item.from<30?'is-compact':''}" ${itemAction(item)} aria-label="${escape(title)}" title="${escape(title)}" style="top:${(item.from-from)*1.2}px;height:${(item.to-item.from)*1.2}px;inset-inline-start:calc(${item.lane*100/item.lanes}% + 2px);width:calc(${100/item.lanes}% - 4px)"><strong>${escape(item.title)}</strong><bdi>${item.start}–${item.end}</bdi>${item.locked?'<span class="calendar-locked">נעול</span>':''}</button>`;
  }).join('')}</section>`).join('')}</div></div>`;
}
function monthStep(month,direction){const date=dateObject(`${month}-01`);date.setMonth(date.getMonth()+direction);return localDate(date).slice(0,7);}
function monthly(state,month) {
  const dates=calendarMonthDates(month), events=calendarEvents(eventSource(state),dates), today=localDate();
  const itemHTML=event=>`<button class="calendar-month-event" data-action="edit-event" data-id="${escape(event.id)}" aria-label="${escape(`${event.title}, ${dateLabel(event.date)}, ${event.start}–${event.end}`)}"><bdi>${event.start}–${event.end}</bdi><span>${escape(event.title)}</span></button>`;
  return `<div class="calendar-month-controls"><button class="text-button" data-calendar-month="${monthStep(month,-1)}" aria-label="החודש הקודם">הקודם</button><h2>${dateObject(`${month}-01`).toLocaleDateString('he-IL',{month:'long',year:'numeric'})}</h2><button class="text-button" data-calendar-month="${monthStep(month,1)}" aria-label="החודש הבא">הבא</button></div><p class="calendar-caption">רק התחייבויות בשעות קבועות מוצגות בחודש. מטרות וזמן למידה מופיעים ביומן השבועי.</p>${agenda(dates.filter(date=>date.slice(0,7)===month),events.map(event=>({...event,fixed:true})),today,{skipEmpty:true})}<p class="calendar-scroll-hint">אפשר לגלול לצדדים כדי לראות את כל החודש.</p><div class="calendar-scroll" tabindex="0" role="region" aria-label="יומן חודשי, התחייבויות קבועות בלבד"><div class="calendar-month">${['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'].map(day=>`<div class="calendar-month-weekday">${day}</div>`).join('')}${dates.map(date=>{
    const dayEvents=events.filter(event=>event.date===date);
    return `<section class="calendar-month-day ${date.slice(0,7)!==month?'outside-month':''} ${date===today?'is-today':''}" aria-label="${dateLabel(date)}"><time datetime="${date}">${dateObject(date).getDate()}</time>${dayEvents.slice(0,2).map(itemHTML).join('')}${dayEvents.length>2?`<details class="calendar-more"><summary>עוד ${dayEvents.length-2}</summary>${dayEvents.slice(2).map(itemHTML).join('')}</details>`:''}</section>`;
  }).join('')}</div></div>`;
}
export function renderCalendar({state,plan={},mode='week',month=localDate().slice(0,7),weekStart}) {
  const candidate=weekStart || plan.weekStart || state.weekly?.weekStart || localDate();
  const start=validDate(candidate)?candidate:localDate();
  const safeMonth=/^\d{4}-\d{2}$/.test(month) && validDate(`${month}-01`) ? month : localDate().slice(0,7);
  return `<section class="calendar-view"><div class="page-heading"><h1>היומן שלי</h1></div>${modeControls(mode)}${mode==='month'?monthly(state,safeMonth):weekly(state,plan,start)}</section>`;
}
