// Адаптация сложности. Правило перехода — рекомендация, а не гарантия; уровень меняет пользователь.
//   < 70%   — предложить упрощение
//   70–79%  — повторить текущий уровень
//   ≥ 80%   — успешно в этих условиях; переход на следующий уровень после двух таких сессий
//             на текущем уровне в сопоставимой обстановке и при достаточном числе попыток.
// Сильный стресс никогда не засчитывается как успех. Пропуски и «не было встреч» — не неудачи.

import type { Environment, Exercise, ExerciseResult } from './types';
import { levelOf, maxLevel } from './plan';

export const THRESHOLD_SIMPLIFY = 0.7;
export const THRESHOLD_SUCCESS = 0.8;

export interface ResultEval {
  evaluated: number;
  successful: number;
  rate: number | null;
  stressed: boolean;
  noOpportunity: boolean;
}

export function evalResult(r: ExerciseResult): ResultEval {
  const evaluated = r.successful + r.unsuccessful;
  return {
    evaluated,
    successful: r.successful,
    rate: evaluated > 0 ? r.successful / evaluated : null,
    stressed: r.stressed || (r.strongReactions ?? 0) >= 2,
    noOpportunity: !!r.noOpportunity && evaluated === 0,
  };
}

/** Результат пригоден для анализа: упражнение выполнялось, а не было пропущено. */
export const isCounted = (r: ExerciseResult) => r.status === 'done' && !r.skipped;

export type RecKind = 'no-data' | 'no-opportunity' | 'stress' | 'simplify' | 'repeat' | 'insufficient' | 'success' | 'level-up' | 'mastered';

export interface Recommendation {
  kind: RecKind;
  title: string;
  text: string;
  toLevel?: number;
  /** Чем подкреплён вывод: «8 из 10 · 2 сессии в тихом месте». */
  basis?: string;
}

export const ENV_LABEL: Record<Environment, string> = { 1: 'Дом', 2: 'Тихое место', 3: 'Умеренные отвлечения', 4: 'Сильные отвлечения' };
export const ENV_SHORT: Record<Environment, string> = { 1: 'дом', 2: 'тихое место', 3: 'умеренные отвлечения', 4: 'сильные отвлечения' };

function isQualifying(r: ExerciseResult, e: Exercise): boolean {
  const ev = evalResult(r);
  return !ev.stressed && ev.rate !== null && ev.rate >= THRESHOLD_SUCCESS && ev.evaluated >= e.minEvaluated;
}

/**
 * Рекомендация по упражнению на основе истории результатов на текущем уровне.
 * @param history все результаты этого упражнения для собаки (порядок не важен)
 */
export function recommend(e: Exercise, currentLevel: number, history: ExerciseResult[]): Recommendation {
  const atLevel = history
    .filter((r) => isCounted(r) && r.difficultyLevel === currentLevel)
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
  const latest = atLevel[0];
  if (!latest) return { kind: 'no-data', title: 'Пока нет данных', text: 'После первой тренировки на этом уровне здесь появится рекомендация.' };

  const ev = evalResult(latest);
  const isObs = e.measurement === 'observations';
  const basis = ev.evaluated ? `${ev.successful} из ${ev.evaluated} · ${ENV_SHORT[latest.environment]}` : undefined;

  if (ev.noOpportunity) {
    return { kind: 'no-opportunity', title: 'Не было подходящих встреч', text: 'Это не неудача и не влияет на статистику. Попробуй на следующей прогулке в месте, где раздражители видны издалека.' };
  }
  if (ev.stressed) {
    return {
      kind: 'stress', title: 'Сначала спокойствие', basis,
      text: isObs
        ? 'Собака была сильно возбуждена — результат не засчитывается как успешный. В следующий раз увеличь дистанцию до раздражителя, сократи наблюдение и закончи раньше. Не подходи ближе.'
        : 'Собака была сильно возбуждена — результат не засчитывается как успешный. Уменьши отвлечения, тренируйся там, где спокойнее, или закончи занятие раньше.',
    };
  }
  if (ev.rate === null) return { kind: 'no-data', title: 'Нет оцениваемых попыток', text: 'Отметь хотя бы несколько попыток, чтобы получить рекомендацию.' };

  if (ev.rate < THRESHOLD_SIMPLIFY) {
    if (currentLevel > 1) {
      const prev = levelOf(e, currentLevel - 1);
      return {
        kind: 'simplify', title: 'Пока не усложняем', basis, toLevel: currentLevel - 1,
        text: isObs
          ? `Вернись к уровню «${prev.title}» и увеличь дистанцию. Работай там, где собака замечает раздражитель, но остаётся спокойной.`
          : `Вернись к варианту «${prev.title}» и тренируйся в спокойной обстановке.`,
      };
    }
    return {
      kind: 'simplify', title: 'Пока не усложняем', basis,
      text: isObs ? `Увеличь дистанцию до раздражителя и сократи время наблюдения. ${e.simplify}` : `Упрости условия: ${lowerFirst(e.simplify)}`,
    };
  }
  if (ev.rate < THRESHOLD_SUCCESS) {
    return { kind: 'repeat', title: 'Повторить текущий уровень', basis, text: 'Результат близок к цели. Повтори этот уровень в тех же условиях — без усложнения.' };
  }

  // ≥ 80%
  if (ev.evaluated < e.minEvaluated) {
    return {
      kind: 'insufficient', title: 'Хорошо, но попыток мало', basis,
      text: `Для решения о переходе нужно минимум ${e.minEvaluated} оцениваемых попыток за сессию. Продолжай на этом уровне.`,
    };
  }
  // Две последние сессии на этом уровне в той же обстановке.
  const comparable = atLevel.filter((r) => r.environment === latest.environment && evalResult(r).rate !== null);
  const lastTwo = comparable.slice(0, 2);
  const ready = lastTwo.length === 2 && lastTwo.every((r) => isQualifying(r, e));
  const max = maxLevel(e);

  if (!ready) {
    const next = currentLevel < max ? levelOf(e, currentLevel + 1) : undefined;
    return {
      kind: 'success', title: 'Хорошо получается!', basis,
      text: next
        ? `Навык выполнен успешно в этих условиях. Ещё одна такая сессия в похожей обстановке — и можно пробовать уровень «${next.title}».`
        : 'Навык выполнен успешно в этих условиях. Закрепляй и переноси в новые места.',
    };
  }
  if (currentLevel >= max) {
    return { kind: 'mastered', title: 'Уровень освоен', basis: `2 сессии от 80% · ${ENV_SHORT[latest.environment]}`, text: 'Это последний уровень упражнения. Переноси навык в новые места по одному: сначала знакомые маршруты, затем новые.' };
  }
  const next = levelOf(e, currentLevel + 1);
  return {
    kind: 'level-up', title: 'Можно переходить на следующий уровень', toLevel: currentLevel + 1,
    basis: `2 сессии от 80% · ${ENV_SHORT[latest.environment]}`,
    text: isObs
      ? `Хорошо получается! Можно попробовать «${next.title}» — меняется только одно: ${lowerFirst(next.changes)}. При первых признаках напряжения вернись на прежнюю дистанцию.`
      : `Хорошо получается! Можно попробовать следующий уровень: «${next.title}». Меняется только одно: ${lowerFirst(next.changes)}.`,
  };
}

function lowerFirst(s: string) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

const PRIORITY: RecKind[] = ['stress', 'simplify', 'level-up', 'repeat', 'insufficient', 'success', 'mastered', 'no-opportunity', 'no-data'];

/** Главный совет на следующую тренировку из рекомендаций по упражнениям сессии. */
export function sessionAdvice(recs: { title: string; rec: Recommendation }[], mood?: string): string {
  if (mood === 'very') return 'Собака была сильно возбуждена. В следующий раз начни в более спокойном месте, сократи тренировку и чаще делай нюхательные паузы.';
  if (mood === 'tired') return 'Собака устала или потеряла интерес. Сократи следующую тренировку, начни с самого любимого упражнения и закончи на успехе.';
  const sorted = [...recs].sort((a, b) => PRIORITY.indexOf(a.rec.kind) - PRIORITY.indexOf(b.rec.kind));
  const top = sorted[0];
  if (!top) return 'Отличная работа. Продолжай по плану.';
  switch (top.rec.kind) {
    case 'stress': return `«${top.title}»: ${top.rec.text}`;
    case 'simplify': return `«${top.title}»: упрости. ${top.rec.text}`;
    case 'level-up': return `«${top.title}» готово к следующему уровню — реши в карточке упражнения.`;
    case 'repeat': return `«${top.title}»: повтори текущий уровень в тех же условиях.`;
    default: return 'Хорошая тренировка. Продолжай по плану, без резкого усложнения.';
  }
}
