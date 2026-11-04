// Логика активной тренировки, не зависящая от хранилища.

import type { Attempt, Environment, ExerciseResult, Measurement, Mood } from './types';

export const REACTIONS = [
  { id: 'calm', label: 'Спокойно', strong: false },
  { id: 'tense', label: 'Напряглась', strong: false },
  { id: 'whine', label: 'Скулит', strong: false },
  { id: 'bark', label: 'Лай', strong: true },
  { id: 'lunge', label: 'Рывок', strong: true },
  { id: 'freeze', label: 'Замирание', strong: true },
  { id: 'other', label: 'Другая сильная реакция', strong: true },
] as const;
export const STRONG = new Set<string>(REACTIONS.filter((r) => r.strong).map((r) => r.id));
export const reactionLabel = (id: string) => REACTIONS.find((r) => r.id === id)?.label ?? id;

export const DISTANCES = [3, 5, 10, 15, 20, 30, 50];

export const TRIGGERS = [
  { id: 'dog' as const, label: 'Собака' },
  { id: 'person' as const, label: 'Человек' },
  { id: 'other' as const, label: 'Другое' },
];

export const MOODS: { id: Mood; label: string; hint: string }[] = [
  { id: 'calm', label: 'Спокойная', hint: 'Работала с удовольствием' },
  { id: 'slightly', label: 'Немного возбуждённая', hint: 'Иногда отвлекалась' },
  { id: 'very', label: 'Сильно возбуждённая', hint: 'Результаты не засчитаются как успешные' },
  { id: 'tired', label: 'Устала или потеряла интерес', hint: 'Следующую тренировку стоит сократить' },
];

export const ENVIRONMENTS: { id: Environment; label: string; hint: string }[] = [
  { id: 1, label: 'Дом', hint: 'Квартира, подъезд' },
  { id: 2, label: 'Тихое место', hint: 'Пустой двор, площадка без людей' },
  { id: 3, label: 'Умеренные отвлечения', hint: 'Прохожие и собаки вдалеке' },
  { id: 4, label: 'Сильные отвлечения', hint: 'Людная улица, собаки рядом' },
];

export const SKIP_REASONS = ['Не было подходящих условий', 'Собака устала', 'Не хватило времени', 'Плохая погода', 'Другое'];

/** Наблюдение успешно, если не было выраженной реакции и собака переключилась на хозяина. */
export function observationOutcome(reactions: string[], switched: boolean): 'success' | 'fail' {
  return !reactions.some((r) => STRONG.has(r)) && switched ? 'success' : 'fail';
}

/** Пересчитывает счётчики результата по сохранённым попыткам — единственный источник правды. */
export function summarize(attempts: Attempt[], measurement: Measurement): Pick<ExerciseResult, 'attempted' | 'successful' | 'unsuccessful' | 'switched' | 'strongReactions' | 'distanceToTrigger' | 'measuredQuantity' | 'stressIndicators'> {
  const list = [...attempts].sort((a, b) => a.index - b.index);
  const successful = list.filter((a) => a.outcome === 'success').length;
  const out: ReturnType<typeof summarize> = {
    attempted: list.length, successful, unsuccessful: list.length - successful, stressIndicators: [],
  };
  if (measurement === 'observations') {
    out.switched = list.filter((a) => a.switched).length;
    out.strongReactions = list.filter((a) => (a.reactions ?? []).some((r) => STRONG.has(r))).length;
    const d = list.map((a) => a.distance).filter((x): x is number => typeof x === 'number');
    out.distanceToTrigger = d.length ? Math.min(...d) : undefined;
    out.stressIndicators = [...new Set(list.flatMap((a) => (a.reactions ?? []).filter((r) => STRONG.has(r))))];
  }
  if (measurement === 'duration') {
    const s = list.map((a) => a.seconds).filter((x): x is number => typeof x === 'number');
    out.measuredQuantity = s.length ? Math.round(s.reduce((x, y) => x + y, 0) / s.length) : undefined;
  }
  return out;
}

/** Сколько ещё нужно попыток до плана (для «до N» — до максимума). */
export function remaining(target: number, attempted: number): number {
  return Math.max(0, target - attempted);
}

/** Подсказка безопасности во время наблюдений: две выраженные реакции подряд — закончить упражнение. */
export function safetyPrompt(attempts: Attempt[]): 'increase-distance' | 'stop' | null {
  const last = [...attempts].sort((a, b) => b.index - a.index);
  const strong = (a?: Attempt) => !!a && (a.reactions ?? []).some((r) => STRONG.has(r));
  if (strong(last[0]) && strong(last[1])) return 'stop';
  if (strong(last[0])) return 'increase-distance';
  return null;
}
