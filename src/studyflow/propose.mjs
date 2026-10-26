// Builds the review card for what the person said: where each item goes, what it would collide with,
// and which free times could replace it. Nothing is saved until they confirm.
import {toMin, addDays, localDate} from './util.mjs';
import {placeFlexible, busyOn, alternatives, classesOn} from './schedule.mjs';
import {shiftSegments} from './work.mjs';

export function propose(state, drafts, now = new Date()) {
  const today = localDate(now), placed = [];
  // New items also block each other, but only on their own day.
  const extraOn = date => placed.filter(b => b.date === date);
  const segmentsOf = p => p.kind === 'shift' ? shiftSegments(p) : [{date: p.date, start: toMin(p.start), end: toMin(p.end)}];
  // Work comes before personal study, goals and tasks already planned; lectures and fixed events still block it.
  const yields = (p, x) => p.kind === 'shift' && x.source === 'item' && x.kind !== 'event';
  const hitsFor = p => segmentsOf(p).flatMap(seg => [...busyOn(state, seg.date), ...extraOn(seg.date)].filter(x => !yields(p, x) && seg.start < x.end && seg.end > x.start));
  const block = p => segmentsOf(p).forEach(seg => placed.push({...seg, title: p.title, source: 'new'}));
  const out = drafts.map(d => ({...d}));
  // Fixed times first: they cannot move, so flexible items are fitted around them.
  for (const p of out) {
    if (p.allDay) {
      Object.assign(p, {status: p.date < today ? 'past' : 'ok', hides: classesOn(state, p.date).map(c => c.title),
        overlaps: state.items.filter(i => i.date === p.date).map(i => i.title)});
      continue;
    }
    if (!p.fixed) continue;
    const a = toMin(p.start), b = toMin(p.end);
    if (a === null || b === null || (a === b) || (b < a && p.kind !== 'shift')) { p.status = 'invalid'; continue; }
    p.minutes = b > a ? b - a : b + 1440 - a;
    if (p.date < today) { p.status = 'past'; continue; }
    const hits = hitsFor(p);
    // The person said yes to the overlap (a lecture on Zoom during a shift): it goes in, and says what it overlaps.
    if (hits.length && p.allowOverlap) { Object.assign(p, {status: 'ok', overlapsWith: [...new Set(hits.map(h => h.title))]}); block(p); continue; }
    if (hits.length) {
      Object.assign(p, {status: 'conflict', conflicts: [...new Set(hits.map(h => h.title))],
        options: b > a ? alternatives(state, p.date, p.minutes, p.start, {now, extra: extraOn(p.date)}) : []});
    } else { p.status = 'ok'; block(p); }
  }
  for (const p of out) {
    if (p.allDay || p.fixed) continue;
    const first = p.date < today ? today : p.date;
    const last = p.deadline && p.deadline > first ? p.deadline : first;
    let slot = null;
    for (let d = first; d <= last && !slot; d = addDays(d, 1)) slot = placeFlexible(state, d, p.minutes, {part: p.part, now, extra: extraOn(d)});
    if (slot) { Object.assign(p, {status: 'ok', date: slot.date, start: slot.start, end: slot.end, outsidePart: slot.outsidePart}); block(p); continue; }
    const options = [];
    for (let i = 1; i <= 7 && options.length < 3; i++) {
      const d = addDays(last, i), s = placeFlexible(state, d, p.minutes, {part: p.part, now, extra: extraOn(d)});
      if (s) options.push(s);
    }
    Object.assign(p, {status: 'noroom', options});
  }
  return out;
}

export const ready = proposals => proposals.length > 0 && proposals.every(p => p.status === 'ok');

// What gets saved when the person confirms: schedule items, and shifts for the work area.
export function toItems(proposals, makeId) {
  return proposals.filter(p => p.status === 'ok' && p.kind !== 'shift').map(p => ({
    id: makeId(), title: p.title, date: p.date, kind: p.kind, fixed: !!(p.fixed || p.allDay), done: false,
    ...(p.allDay ? {allDay: true} : {start: p.start, end: p.end}),
    ...(p.courseId ? {courseId: p.courseId} : {}), ...(p.goalId ? {goalId: p.goalId} : {}), ...(p.note ? {note: p.note} : {}),
  }));
}
export function toShifts(proposals, makeId) {
  return proposals.filter(p => p.status === 'ok' && p.kind === 'shift' && p.jobId && p.start && p.end)
    .map(p => ({id: makeId(), jobId: p.jobId, date: p.date, start: p.start, end: p.end, breakMinutes: 0, tips: 0, ...(p.note ? {note: p.note} : {})}));
}
