// Расписание курса: создание дней и занятий из шаблона, паузы, переносы, смена даты старта, статусы.
// Все функции чистые: принимают записи и возвращают новые записи для сохранения.

import type { DayStatus, ISODate, PlanItem, ProgramDay, ScheduledSession, SessionStatus, TrainingProgram } from './types';
import { buildCourseTemplate, PROGRAM_VERSION } from '../content/program';
import { addDays, diffDays } from '../lib/date';
import { uid } from '../lib/util';

export interface ProgramBundle {
  program: TrainingProgram;
  days: ProgramDay[];
  sessions: ScheduledSession[];
}

export function createProgram(dogId: string, startDate: ISODate, now = Date.now(), id = uid('prog-')): ProgramBundle {
  const program: TrainingProgram = {
    id, dogId, startDate, status: 'active', pauses: [], settings: { weekNotes: {} },
    version: PROGRAM_VERSION, createdAt: now, updatedAt: now,
  };
  const days: ProgramDay[] = [];
  const sessions: ScheduledSession[] = [];
  for (const t of buildCourseTemplate()) {
    const date = addDays(startDate, t.dayNumber - 1);
    days.push({
      id: `${id}:d${t.dayNumber}`, programId: id, dayNumber: t.dayNumber, week: t.week, dayInWeek: t.dayInWeek, date,
      kind: t.kind, title: t.title, goal: t.goal, criteria: t.criteria, tip: t.tip, focus: t.focus, restNote: t.restNote, analysis: t.analysis,
    });
    for (const s of t.sessions) {
      sessions.push({
        id: `${id}:d${t.dayNumber}:${s.timeOfDay}`, programId: id, dayNumber: t.dayNumber, week: t.week,
        plannedDate: date, timeOfDay: s.timeOfDay, title: s.title, note: s.note,
        items: s.items.map((i) => ({ ...i })), status: 'planned', optional: t.kind === 'rest' ? true : undefined, updatedAt: now,
      });
    }
  }
  return { program, days, sessions };
}

/** Статус занятия с учётом даты: запланированное в прошлом считается пропущенным. */
export function effectiveStatus(s: ScheduledSession, todayISO: ISODate): SessionStatus | 'missed' {
  if (s.status === 'planned' && s.plannedDate < todayISO) return s.optional ? 'rest' : 'missed';
  return s.status;
}

export const isRequired = (s: ScheduledSession) => !s.optional && s.status !== 'rest';

export interface DateView {
  date: ISODate;
  day?: ProgramDay;
  sessions: ScheduledSession[];
  movedOut: ScheduledSession[];
  status: DayStatus;
}

export function dayStatus(date: ISODate, day: ProgramDay | undefined, sessions: ScheduledSession[], movedOut: ScheduledSession[], todayISO: ISODate, program?: TrainingProgram): DayStatus {
  if (program?.status === 'paused' && program.pausedAt && date >= program.pausedAt && date >= todayISO) return 'paused';
  const required = sessions.filter(isRequired);
  if (!required.length) {
    if (day && (day.kind === 'rest' || day.madeRest)) return 'rest';
    if (movedOut.length) return 'moved';
    if (sessions.some((s) => s.status === 'rest')) return 'rest';
    return day ? 'rest' : 'planned';
  }
  const done = required.filter((s) => s.status === 'done').length;
  const partial = required.some((s) => s.status === 'partial');
  if (done === required.length) return 'done';
  if (done > 0 || partial) return 'partial';
  if (date < todayISO) return 'missed';
  if (date === todayISO) return 'today';
  return 'planned';
}

export function buildDateIndex(days: ProgramDay[], sessions: ScheduledSession[]) {
  const dayByDate = new Map<ISODate, ProgramDay>();
  const dayByNumber = new Map<number, ProgramDay>();
  for (const d of days) { dayByDate.set(d.date, d); dayByNumber.set(d.dayNumber, d); }
  const byDate = new Map<ISODate, ScheduledSession[]>();
  const movedFrom = new Map<ISODate, ScheduledSession[]>();
  for (const s of sessions) {
    (byDate.get(s.plannedDate) ?? byDate.set(s.plannedDate, []).get(s.plannedDate)!).push(s);
    if (s.rescheduledFrom && s.rescheduledFrom !== s.plannedDate) {
      (movedFrom.get(s.rescheduledFrom) ?? movedFrom.set(s.rescheduledFrom, []).get(s.rescheduledFrom)!).push(s);
    }
  }
  for (const list of byDate.values()) list.sort((a, b) => (a.timeOfDay === b.timeOfDay ? a.dayNumber - b.dayNumber : a.timeOfDay === 'morning' ? -1 : 1));
  return { dayByDate, dayByNumber, byDate, movedFrom };
}

export function viewForDate(date: ISODate, idx: ReturnType<typeof buildDateIndex>, todayISO: ISODate, program?: TrainingProgram): DateView {
  const day = idx.dayByDate.get(date);
  const sessions = idx.byDate.get(date) ?? [];
  const movedOut = idx.movedFrom.get(date) ?? [];
  return { date, day, sessions, movedOut, status: dayStatus(date, day, sessions, movedOut, todayISO, program) };
}

/** Позиция в курсе для даты. */
export function coursePosition(date: ISODate, days: ProgramDay[]): { state: 'before' | 'during' | 'after' | 'none'; day?: ProgramDay; first?: ProgramDay; last?: ProgramDay } {
  if (!days.length) return { state: 'none' };
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const first = sorted[0], last = sorted[sorted.length - 1];
  if (date < first.date) return { state: 'before', first, last };
  if (date > last.date) return { state: 'after', first, last };
  const exact = sorted.find((d) => d.date === date);
  // Если ровно на эту дату дня нет (например, сразу после паузы), берём последний прошедший день курса.
  const day = exact ?? [...sorted].reverse().find((d) => d.date < date);
  return { state: 'during', day, first, last };
}

// ---------- Пауза ----------
export function pauseProgram(p: TrainingProgram, todayISO: ISODate, now = Date.now()): TrainingProgram {
  if (p.status === 'paused') return p;
  return { ...p, status: 'paused', pausedAt: todayISO, updatedAt: now };
}

/**
 * Продолжение после паузы: все несделанные занятия и дни, начиная с даты паузы,
 * сдвигаются на длительность паузы. Пропущенное время не превращается в «долг».
 */
export function resumeProgram(b: ProgramBundle, todayISO: ISODate, now = Date.now()): ProgramBundle {
  const p = b.program;
  if (p.status !== 'paused' || !p.pausedAt) return b;
  const from = p.pausedAt;
  const delta = Math.max(0, diffDays(todayISO, from));
  const doneDays = new Set(b.sessions.filter((s) => s.status === 'done' || s.status === 'partial').map((s) => s.dayNumber));
  const days = b.days.map((d) => (delta && d.date >= from && !doneDays.has(d.dayNumber) ? { ...d, date: addDays(d.date, delta) } : d));
  const sessions = b.sessions.map((s) => (delta && s.status === 'planned' && s.plannedDate >= from
    ? { ...s, plannedDate: addDays(s.plannedDate, delta), rescheduledFrom: undefined, updatedAt: now }
    : s));
  const program: TrainingProgram = { ...p, status: 'active', pausedAt: undefined, pauses: [...p.pauses, { from, to: todayISO }], updatedAt: now };
  return { program, days, sessions };
}

// ---------- Смена даты старта ----------
/** Сдвигает все несделанные дни и занятия. Выполненные тренировки остаются в истории на своих датах. */
export function changeStartDate(b: ProgramBundle, newStart: ISODate, now = Date.now()): ProgramBundle {
  const delta = diffDays(newStart, b.program.startDate);
  if (!delta) return b;
  const doneDays = new Set(b.sessions.filter((s) => s.status !== 'planned').map((s) => s.dayNumber));
  const days = b.days.map((d) => (doneDays.has(d.dayNumber) ? d : { ...d, date: addDays(d.date, delta) }));
  const sessions = b.sessions.map((s) => (s.status === 'planned'
    ? { ...s, plannedDate: addDays(s.plannedDate, delta), rescheduledFrom: s.rescheduledFrom ? addDays(s.rescheduledFrom, delta) : undefined, updatedAt: now }
    : s));
  return { program: { ...b.program, startDate: newStart, updatedAt: now }, days, sessions };
}

// ---------- Действия с занятиями ----------
export function moveSession(s: ScheduledSession, newDate: ISODate, now = Date.now()): ScheduledSession {
  const origin = s.rescheduledFrom ?? s.plannedDate;
  return { ...s, plannedDate: newDate, rescheduledFrom: origin === newDate ? undefined : origin, status: s.status === 'skipped' ? 'planned' : s.status, skipReason: undefined, edited: true, updatedAt: now };
}

export function skipSession(s: ScheduledSession, reason: string, now = Date.now()): ScheduledSession {
  return { ...s, status: 'skipped', skipReason: reason, updatedAt: now };
}

export function restoreSession(s: ScheduledSession, now = Date.now()): ScheduledSession {
  return { ...s, status: 'planned', skipReason: undefined, updatedAt: now };
}

export function makeRestDay(day: ProgramDay, sessions: ScheduledSession[], now = Date.now()): { day: ProgramDay; sessions: ScheduledSession[] } {
  return {
    day: { ...day, madeRest: true, edited: true },
    sessions: sessions.map((s) => (s.status === 'planned' ? { ...s, status: 'rest' as const, skipReason: 'День сделан днём отдыха', updatedAt: now } : s)),
  };
}

export function undoRestDay(day: ProgramDay, sessions: ScheduledSession[], now = Date.now()): { day: ProgramDay; sessions: ScheduledSession[] } {
  return {
    day: { ...day, madeRest: false },
    sessions: sessions.map((s) => (s.status === 'rest' && !s.optional ? { ...s, status: 'planned' as const, skipReason: undefined, updatedAt: now } : s)),
  };
}

export function updateItems(s: ScheduledSession, items: PlanItem[], now = Date.now()): ScheduledSession {
  return { ...s, items, edited: true, updatedAt: now };
}

export function newExtraSession(programId: string, date: ISODate, dayNumber: number, week: number, timeOfDay: 'morning' | 'evening', now = Date.now()): ScheduledSession {
  return {
    id: uid('ses-'), programId, dayNumber, week, plannedDate: date, timeOfDay,
    title: timeOfDay === 'morning' ? 'Дополнительная утренняя тренировка' : 'Дополнительная тренировка',
    items: [], status: 'planned', extra: true, edited: true, updatedAt: now,
  };
}

/** Статус запланированного занятия по результатам тренировки. */
export function statusFromResults(items: PlanItem[], results: { itemUid: string; status: string; skipped: boolean; attempted: number; noOpportunity?: boolean }[]): SessionStatus {
  const required = items.filter((i) => !i.optional);
  const list = required.length ? required : items;
  if (!list.length) return 'done';
  let done = 0, any = 0;
  for (const i of list) {
    const r = results.find((x) => x.itemUid === i.uid);
    if (!r) continue;
    // Пункт выполнен полностью, если сделан весь план; для «до N» — хотя бы одно наблюдение
    // или отметка «не было подходящих встреч».
    const enough = i.upTo ? r.attempted > 0 || !!r.noOpportunity : r.attempted >= i.target;
    const completed = r.status === 'done' && !r.skipped && enough;
    if (completed) { done++; any++; } else if (r.attempted > 0) any++;
  }
  if (done === list.length) return 'done';
  if (any > 0) return 'partial';
  return 'planned';
}
