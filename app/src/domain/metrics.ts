// Аналитика. Четыре разных показателя не смешиваются:
//   1) выполнение плана (adherence), 2) доля правильных попыток (rate),
//   3) текущий уровень навыка (levels), 4) прогресс в разных условиях (по обстановке).

import type { Attempt, Environment, ExerciseResult, ISODate, JournalEntry, LevelChange, Problem, ProgramDay, ScheduledSession, SkillLevel, TrainingSession } from './types';
import { evalResult, isCounted } from './adaptation';
import { ex } from './plan';
import { addDays, diffDays } from '../lib/date';

export interface Period { from: ISODate; to: ISODate }

export interface DataSet {
  results: ExerciseResult[];
  attempts: Attempt[];
  trainings: TrainingSession[];
  sessions: ScheduledSession[];
  days: ProgramDay[];
  levels: SkillLevel[];
  levelChanges: LevelChange[];
  journal: JournalEntry[];
}

export const inPeriod = (date: ISODate, p: Period) => date >= p.from && date <= p.to;

export const PICKUP_REFUSAL = new Set(['leave-it', 'ground-refusal']);
export const LEASH_MAIN = 'loose-leash';
export const OBSERVATION_IDS = new Set(['calm-dogs', 'calm-people', 'observe-triggers']);

export const problemOf = (exerciseId: string): Problem => ex(exerciseId).problem;

export interface Rate { successful: number; evaluated: number; rate: number | null }

export function rateOf(results: ExerciseResult[]): Rate {
  let successful = 0, evaluated = 0;
  for (const r of results) {
    if (!isCounted(r)) continue;
    const e = evalResult(r);
    // При сильном стрессе удачные попытки не считаются успехом.
    successful += e.stressed ? 0 : e.successful;
    evaluated += e.evaluated;
  }
  return { successful, evaluated, rate: evaluated ? successful / evaluated : null };
}

export interface Adherence { due: number; done: number; partial: number; missed: number; skipped: number; pct: number | null }

/** Выполнение плана: только обязательные занятия, дата которых уже наступила (сегодняшнее — если начато). */
export function adherence(sessions: ScheduledSession[], p: Period, todayISO: ISODate): Adherence {
  let due = 0, done = 0, partial = 0, missed = 0, skipped = 0;
  for (const s of sessions) {
    if (s.optional || s.status === 'rest' || !inPeriod(s.plannedDate, p)) continue;
    if (s.plannedDate > todayISO) continue;
    if (s.plannedDate === todayISO && s.status === 'planned') continue;
    due++;
    if (s.status === 'done') done++;
    else if (s.status === 'partial') partial++;
    else if (s.status === 'skipped') skipped++;
    else missed++;
  }
  return { due, done, partial, missed, skipped, pct: due ? Math.round(((done + partial * 0.5) / due) * 100) : null };
}

export const trainingSeconds = (t: TrainingSession) =>
  t.finishedAt ? Math.max(0, Math.round((t.finishedAt - t.startedAt - (t.pausedTotalMs || 0)) / 1000)) : 0;

export interface Kpis {
  trainings: number;
  adherence: Adherence;
  overall: Rate;
  byProblem: Record<'leash' | 'distractions' | 'pickup', Rate>;
  levelUps: number;
  exercisesAboveStart: number;
  avgTensions: number | null;
  tensionSessions: number;
  switches: number;
  refusals: number;
  totalSeconds: number;
  trainingDays: number;
}

export function kpis(d: DataSet, p: Period, todayISO: ISODate): Kpis {
  const res = d.results.filter((r) => inPeriod(r.date, p) && isCounted(r));
  const trainings = d.trainings.filter((t) => t.status === 'completed' && inPeriod(t.date, p));
  const leashTension = res.filter((r) => r.exerciseId === LEASH_MAIN && typeof r.tensions === 'number');
  const switches = res.reduce((s, r) => s + (OBSERVATION_IDS.has(r.exerciseId) ? (r.switched ?? 0) : r.exerciseId === 'attention-switch' && !r.stressed ? r.successful : 0), 0);
  const refusals = res.reduce((s, r) => s + (PICKUP_REFUSAL.has(r.exerciseId) && !r.stressed ? r.successful : 0), 0);
  const fromTs = new Date(p.from + 'T00:00:00').getTime(), toTs = new Date(p.to + 'T23:59:59').getTime();
  return {
    trainings: trainings.length,
    adherence: adherence(d.sessions, p, todayISO),
    overall: rateOf(res),
    byProblem: {
      leash: rateOf(res.filter((r) => problemOf(r.exerciseId) === 'leash')),
      distractions: rateOf(res.filter((r) => problemOf(r.exerciseId) === 'distractions')),
      pickup: rateOf(res.filter((r) => problemOf(r.exerciseId) === 'pickup')),
    },
    levelUps: d.levelChanges.filter((c) => c.to > c.from && c.at >= fromTs && c.at <= toTs).length,
    exercisesAboveStart: d.levels.filter((l) => l.level > 1).length,
    avgTensions: leashTension.length ? Math.round((leashTension.reduce((s, r) => s + (r.tensions ?? 0), 0) / leashTension.length) * 10) / 10 : null,
    tensionSessions: leashTension.length,
    switches,
    refusals,
    totalSeconds: trainings.reduce((s, t) => s + trainingSeconds(t), 0),
    trainingDays: new Set(trainings.map((t) => t.date)).size,
  };
}

// ---------- Ряды для графиков ----------
export interface Point { label: string; date?: ISODate; value: number | null; n: number; extra?: number | null }

export function datesOf(p: Period): ISODate[] {
  const out: ISODate[] = [];
  const n = diffDays(p.to, p.from);
  for (let i = 0; i <= n; i++) out.push(addDays(p.from, i));
  return out;
}

/** Дневной ряд доли успеха. Дни без данных — null (на графике это разрыв, а не ноль). */
export function dailyRate(results: ExerciseResult[], p: Period, filter: (r: ExerciseResult) => boolean): Point[] {
  const byDate = new Map<ISODate, ExerciseResult[]>();
  for (const r of results) if (isCounted(r) && filter(r) && inPeriod(r.date, p)) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
  return datesOf(p).map((date) => {
    const list = byDate.get(date) ?? [];
    const rt = rateOf(list);
    return { label: date.slice(8), date, value: rt.rate === null ? null : Math.round(rt.rate * 100), n: rt.evaluated };
  });
}

export function dailyLeash(results: ExerciseResult[], p: Period): Point[] {
  const byDate = new Map<ISODate, ExerciseResult[]>();
  for (const r of results) if (isCounted(r) && r.exerciseId === LEASH_MAIN && inPeriod(r.date, p)) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
  return datesOf(p).map((date) => {
    const list = byDate.get(date) ?? [];
    const rt = rateOf(list);
    const t = list.filter((r) => typeof r.tensions === 'number');
    return {
      label: date.slice(8), date, value: rt.rate === null ? null : Math.round(rt.rate * 100), n: rt.evaluated,
      extra: t.length ? Math.round((t.reduce((s, r) => s + (r.tensions ?? 0), 0) / t.length) * 10) / 10 : null,
    };
  });
}

export function dailyReactions(results: ExerciseResult[], p: Period): { date: ISODate; label: string; calm: number; reactions: number; minDistance: number | null }[] {
  return datesOf(p).map((date) => {
    const list = results.filter((r) => isCounted(r) && OBSERVATION_IDS.has(r.exerciseId) && r.date === date);
    const d = list.map((r) => r.distanceToTrigger).filter((x): x is number => typeof x === 'number');
    return {
      date, label: date.slice(8),
      calm: list.reduce((s, r) => s + (r.stressed ? 0 : r.successful), 0),
      reactions: list.reduce((s, r) => s + r.unsuccessful + (r.stressed ? r.successful : 0), 0),
      minDistance: d.length ? Math.min(...d) : null,
    };
  });
}

export function weekOfDate(date: ISODate, days: ProgramDay[]): number | null {
  if (!days.length) return null;
  let best: ProgramDay | null = null;
  for (const d of days) if (d.date <= date && (!best || d.date > best.date)) best = d;
  return best ? best.week : null;
}

export function weeklyRate(results: ExerciseResult[], days: ProgramDay[], filter: (r: ExerciseResult) => boolean, weeks = 12): Point[] {
  const byWeek = new Map<number, ExerciseResult[]>();
  for (const r of results) {
    if (!isCounted(r) || !filter(r)) continue;
    const w = weekOfDate(r.date, days);
    if (w) (byWeek.get(w) ?? byWeek.set(w, []).get(w)!).push(r);
  }
  const out: Point[] = [];
  for (let w = 1; w <= weeks; w++) {
    const list = byWeek.get(w) ?? [];
    const rt = rateOf(list);
    const lv = list.length ? Math.round((list.reduce((s, r) => s + r.difficultyLevel, 0) / list.length) * 10) / 10 : null;
    out.push({ label: String(w), value: rt.rate === null ? null : Math.round(rt.rate * 100), n: rt.evaluated, extra: lv });
  }
  return out;
}

/** Успех по обстановке для каждого направления: сравниваются только похожие условия. */
export function conditionsTable(results: ExerciseResult[], p: Period) {
  const envs: Environment[] = [1, 2, 3, 4];
  const problems = ['leash', 'distractions', 'pickup'] as const;
  return problems.map((problem) => ({
    problem,
    cells: envs.map((env) => {
      const rt = rateOf(results.filter((r) => inPeriod(r.date, p) && r.environment === env && problemOf(r.exerciseId) === problem));
      return { env, ...rt };
    }),
  }));
}

export const DISTANCE_BANDS: { label: string; min: number; max: number }[] = [
  { label: 'до 5 м', min: 0, max: 5 },
  { label: '5–10 м', min: 5, max: 10 },
  { label: '10–20 м', min: 10, max: 20 },
  { label: '20–30 м', min: 20, max: 30 },
  { label: '30 м и больше', min: 30, max: Infinity },
];

/** Спокойные наблюдения по дистанции до раздражителя. */
export function distanceTable(attempts: Attempt[], results: ExerciseResult[], p: Period) {
  const ids = new Set(results.filter((r) => inPeriod(r.date, p) && OBSERVATION_IDS.has(r.exerciseId) && isCounted(r)).map((r) => r.id));
  const list = attempts.filter((a) => ids.has(a.resultId) && typeof a.distance === 'number');
  return DISTANCE_BANDS.map((b) => {
    const inBand = list.filter((a) => a.distance! >= b.min && a.distance! < b.max);
    const calm = inBand.filter((a) => a.outcome === 'success').length;
    return { ...b, n: inBand.length, calm, rate: inBand.length ? calm / inBand.length : null, dogs: inBand.filter((a) => a.trigger === 'dog').length, people: inBand.filter((a) => a.trigger === 'person').length };
  });
}

export function periodFor(kind: '7' | '14' | '30' | 'all', todayISO: ISODate, days: ProgramDay[], results: ExerciseResult[]): Period {
  if (kind === 'all') {
    const first = [days.map((d) => d.date).sort()[0], results.map((r) => r.date).sort()[0]].filter(Boolean).sort()[0] ?? todayISO;
    const from = first < todayISO ? first : todayISO;
    return { from, to: todayISO };
  }
  const n = Number(kind);
  // Не показываем «дни без данных» до начала курса и до первой тренировки.
  const earliest = [days.map((d) => d.date).sort()[0], results.map((r) => r.date).sort()[0]].filter(Boolean).sort()[0];
  let from = addDays(todayISO, -(n - 1));
  if (earliest && earliest > from && earliest <= todayISO) from = earliest;
  return { from, to: todayISO };
}
