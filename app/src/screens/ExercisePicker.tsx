import { useState } from 'react';
import type { PlanItem } from '../domain/types';
import { allExercises, ex } from '../domain/plan';
import { CATEGORIES } from '../content/exercises';
import { Sheet } from '../ui/kit';
import { PROBLEM_COLOR } from '../ui/common';

/** Пункт плана с разумными значениями по умолчанию для упражнения. */
export function defaultItemFor(exerciseId: string): Omit<PlanItem, 'uid'> {
  const e = ex(exerciseId);
  switch (e.measurement) {
    case 'segments': return { exerciseId, target: 3, steps: 10 };
    case 'observations': return { exerciseId, target: 3, upTo: true };
    case 'duration': return { exerciseId, target: e.id === 'decompress' || e.id === 'calm-waiting' ? 1 : 5, seconds: e.levels[0]?.seconds ?? 10 };
    default: return { exerciseId, target: e.unit[0] === 'раунд' ? 3 : 8 };
  }
}

export function ExercisePicker({ open, onClose, onPick, multi, selected }: { open: boolean; onClose: () => void; onPick: (id: string) => void; multi?: boolean; selected?: string[] }) {
  const [q, setQ] = useState('');
  const list = allExercises().filter((e) => !q.trim() || e.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title={multi ? 'Выберите упражнения' : 'Выберите упражнение'}>
      <input className="field" type="search" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск упражнения" autoComplete="off" />
      {[...CATEGORIES].map((cat) => {
        const items = list.filter((e) => e.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} className="mt-4">
            <h3 className="mb-1 px-1 text-[0.85rem] font-semibold text-ink-2">{cat}</h3>
            <ul>
              {items.map((e) => {
                const on = selected?.includes(e.id);
                return (
                  <li key={e.id}>
                    <button type="button" onClick={() => onPick(e.id)} aria-pressed={multi ? on : undefined}
                      className={`press flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${on ? 'bg-sage-soft' : ''}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PROBLEM_COLOR[e.problem] }} aria-hidden />
                      <span className="flex-1">{e.title}{e.custom ? ' · своё' : ''}</span>
                      {on && <span className="text-[0.85rem] font-semibold text-sage">выбрано</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Sheet>
  );
}
