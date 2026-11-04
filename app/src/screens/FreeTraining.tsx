// Свободная тренировка вне плана — в том числе для продолжения занятий после окончания курса.

import { useState } from 'react';
import { LuPlay, LuPlus, LuTrash2 } from 'react-icons/lu';
import type { PlanItem } from '../domain/types';
import { useApp, current } from '../db/store';
import { describeItem, estimateMinutes, ex } from '../domain/plan';
import { Button, Empty, Page, Stepper } from '../ui/kit';
import { ExercisePicker, defaultItemFor } from './ExercisePicker';
import { StartSheet } from './StartSheet';
import { uid } from '../lib/util';

const PRESETS: { title: string; ids: string[] }[] = [
  { title: 'Три направления за 15 минут', ids: ['eye-contact', 'loose-leash', 'observe-triggers', 'leave-it'] },
  { title: 'Короткое утро', ids: ['eye-contact', 'recall'] },
  { title: 'Голова и спокойствие', ids: ['treat-search', 'wait', 'decompress'] },
];

export function FreeTrainingScreen() {
  const s = useApp();
  const { dog } = current(s);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [picker, setPicker] = useState(false);
  const [start, setStart] = useState(false);
  if (!dog) return null;
  const add = (id: string) => setItems((l) => [...l, { ...defaultItemFor(id), uid: uid('f') }]);

  return (
    <Page title="Свободная тренировка" back="today" sub={items.length ? `≈ ${estimateMinutes(items)} мин` : 'Вне плана курса'}>
      {!items.length && (
        <>
          <p className="px-1 text-ink-2">Выберите готовый набор или соберите тренировку сами. Результаты попадут в историю и графики, но не изменят статусы дней плана.</p>
          <div className="mt-3 grid gap-2">
            {PRESETS.map((p) => (
              <button key={p.title} type="button" className="card press p-4 text-left" onClick={() => setItems(p.ids.map((id) => ({ ...defaultItemFor(id), uid: uid('f') })))}>
                <span className="block font-semibold">{p.title}</span>
                <span className="block text-[0.88rem] text-ink-2">{p.ids.map((id) => ex(id).title).join(', ')}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <ul className="mt-4 space-y-2">
        {items.map((i) => {
          const e = ex(i.exerciseId);
          return (
            <li key={i.uid} className="card flex flex-wrap items-center gap-3 p-4">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{e.title}</span><span className="block text-[0.85rem] text-ink-2">{describeItem(i, e)}</span></span>
              <Stepper label={`Количество: ${e.title}`} value={i.target} min={1} max={30} onChange={(v) => setItems((l) => l.map((x) => (x.uid === i.uid ? { ...x, target: v } : x)))} />
              <button type="button" aria-label={`Убрать: ${e.title}`} className="press flex h-11 w-11 items-center justify-center rounded-full text-rose" onClick={() => setItems((l) => l.filter((x) => x.uid !== i.uid))}><LuTrash2 size={18} aria-hidden /></button>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && <div className="mt-4"><Empty title="Упражнения не выбраны" text="Добавьте одно или несколько упражнений." /></div>}
      <div className="mt-4 grid gap-2">
        <Button full onClick={() => setPicker(true)} icon={<LuPlus size={18} aria-hidden />}>Добавить упражнение</Button>
        <Button variant="primary" size="lg" full disabled={!items.length} onClick={() => setStart(true)} icon={<LuPlay size={20} aria-hidden />}>Начать тренировку</Button>
      </div>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(id) => { add(id); setPicker(false); }} />
      {start && <StartSheet open onClose={() => setStart(false)} dogId={dog.id} title="Свободная тренировка" items={items} />}
    </Page>
  );
}
