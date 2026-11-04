import { useState } from 'react';
import { clsx } from 'clsx';
import { LuArrowDown, LuArrowUp, LuTriangleAlert } from 'react-icons/lu';
import type { Exercise } from '../domain/types';
import type { Recommendation } from '../domain/adaptation';
import { levelOf } from '../domain/plan';
import { levelFor, setLevel } from '../db/repo';
import { Button } from '../ui/kit';
import { toast, toastError } from '../ui/dialogs';

const TONE: Record<string, string> = {
  stress: 'bg-rose-soft', simplify: 'bg-amber-soft', 'level-up': 'bg-sage-soft', mastered: 'bg-sage-soft',
  repeat: 'bg-surface-2', insufficient: 'bg-surface-2', success: 'bg-sage-soft', 'no-data': 'bg-surface-2', 'no-opportunity': 'bg-surface-2',
};

/** Рекомендация по сложности с кнопками: уровень меняет пользователь, приложение только предлагает. */
export function RecommendationBox({ rec, e, dogId, className, readOnly }: { rec: Recommendation; e: Exercise; dogId: string; className?: string; readOnly?: boolean }) {
  const [applied, setApplied] = useState<number | null>(null);
  const cur = levelFor(dogId, e.id);
  const canApply = !readOnly && rec.toLevel !== undefined && rec.toLevel !== cur && applied === null;

  async function apply() {
    if (rec.toLevel === undefined) return;
    try {
      await setLevel(dogId, e.id, rec.toLevel, rec.kind === 'level-up' ? 'Рекомендация: две успешные сессии от 80%' : 'Рекомендация: результат ниже 70%', false);
      setApplied(rec.toLevel);
      toast(`Уровень ${rec.toLevel}: ${levelOf(e, rec.toLevel).title}`);
    } catch (err) { toastError(err); }
  }

  return (
    <div className={clsx('rounded-2xl p-4', TONE[rec.kind], className)}>
      <p className="flex items-center gap-2 font-semibold">
        {rec.kind === 'stress' && <LuTriangleAlert className="text-rose" size={18} aria-hidden />}
        {rec.title}
      </p>
      <p className="mt-1 text-[0.95rem]">{rec.text}</p>
      {rec.basis && <p className="mt-1 text-[0.8rem] text-ink-3">Основание: {rec.basis}</p>}
      {canApply && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant={rec.kind === 'level-up' ? 'primary' : 'secondary'} onClick={apply}
            icon={rec.kind === 'level-up' ? <LuArrowUp size={16} aria-hidden /> : <LuArrowDown size={16} aria-hidden />}>
            {rec.kind === 'level-up' ? `Перейти на уровень ${rec.toLevel}` : `Вернуться на уровень ${rec.toLevel}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setApplied(cur)}>Остаться на уровне {cur}</Button>
        </div>
      )}
      {applied !== null && applied === rec.toLevel && <p className="mt-2 text-[0.85rem] font-medium text-sage">Новый уровень сохранён.</p>}
    </div>
  );
}
