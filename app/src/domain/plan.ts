import type { Exercise, PlanItem } from './types';
import { EXERCISES } from '../content/exercises';
import { pl, plural } from '../lib/date';

const BUILT_IN = new Map(EXERCISES.map((e) => [e.id, e]));
let custom = new Map<string, Exercise>();

/** Пользовательские упражнения подмешиваются из базы при загрузке и изменениях. */
export function setCustomExercises(list: Exercise[]) {
  custom = new Map(list.map((e) => [e.id, e]));
}

export function getExercise(id: string): Exercise | undefined {
  return BUILT_IN.get(id) ?? custom.get(id);
}

export function allExercises(): Exercise[] {
  return [...EXERCISES, ...custom.values()];
}

export const FALLBACK_EXERCISE: Exercise = {
  id: 'unknown', title: 'Упражнение', category: 'Внимание', problem: 'general', goal: '', difficulty: 1, durationMin: 3,
  equipment: [], steps: [], mistakes: [], stressSigns: [], successCriterion: '', progression: '', simplify: '', harder: '',
  measurement: 'attempts', unit: ['попытка', 'попытки', 'попыток'], successLabel: 'Успех', failLabel: 'Не получилось',
  levels: [{ n: 1, title: 'Базовый уровень', changes: '', steps: [] }], perUnitMin: 0.5, minEvaluated: 5,
};

export const ex = (id: string) => getExercise(id) ?? { ...FALLBACK_EXERCISE, id, title: 'Удалённое упражнение' };

export function levelOf(e: Exercise, n: number) {
  return e.levels.find((l) => l.n === n) ?? e.levels[0] ?? FALLBACK_EXERCISE.levels[0];
}

export const maxLevel = (e: Exercise) => Math.max(1, ...e.levels.map((l) => l.n));

/** Секунды выдержки для пункта: из плана или из текущего уровня. */
export function secondsFor(item: PlanItem, e: Exercise, level: number): number {
  return item.seconds ?? levelOf(e, level).seconds ?? 10;
}

/** Человекочитаемое описание пункта: «3 отрезка по 8 шагов», «до 5 наблюдений». */
export function describeItem(item: PlanItem, e: Exercise = ex(item.exerciseId)): string {
  const n = item.target;
  const noun = plural(n, e.unit);
  switch (e.measurement) {
    case 'segments':
      return item.steps ? `${n} ${noun} по ${pl(item.steps, ['шагу', 'шага', 'шагов']).replace(/^1 шагу$/, '1 шагу')}` : `${n} ${noun}`;
    case 'observations':
      return item.upTo ? `до ${n} ${plural(n, ['спокойного наблюдения', 'спокойных наблюдений', 'спокойных наблюдений'])}` : `${n} ${noun}`;
    case 'duration':
      return item.seconds ? `${n} ${noun} по ${fmtSec(item.seconds)}` : `${n} ${noun}`;
    default:
      return item.upTo ? `до ${n} ${noun}` : `${n} ${noun}`;
  }
}

function fmtSec(s: number) {
  if (s >= 60 && s % 60 === 0) return pl(s / 60, ['минуте', 'минуты', 'минут']).replace(/^1 минуте$/, '1 минуте');
  return `${s} сек`;
}

export function itemMinutes(item: PlanItem, e: Exercise = ex(item.exerciseId)): number {
  const n = Math.max(0, item.target);
  switch (e.measurement) {
    case 'segments': return n * (e.perUnitMin + (item.steps ?? 10) * 0.03);
    case 'duration': return n * ((item.seconds ?? 10) + 15) / 60;
    default: return n * e.perUnitMin;
  }
}

/** Оценка длительности занятия в минутах (включая короткие паузы). */
export function estimateMinutes(items: PlanItem[]): number {
  if (!items.length) return 0;
  const total = items.reduce((s, i) => s + itemMinutes(i), 0) + 1;
  return Math.max(2, Math.round(total));
}

export function sessionMinutes(s: { items: PlanItem[]; durationOverride?: number }): number {
  return s.durationOverride ?? estimateMinutes(s.items);
}
