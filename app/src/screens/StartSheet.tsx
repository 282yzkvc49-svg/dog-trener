// Выбор обстановки перед началом тренировки — нужен, чтобы сравнивать успех в похожих условиях.

import { useState } from 'react';
import { clsx } from 'clsx';
import type { Environment, PlanItem, ScheduledSession, TimeOfDay } from '../domain/types';
import { Button, Sheet } from '../ui/kit';
import { ENVIRONMENTS } from '../domain/training';
import { getState } from '../db/store';
import { startTraining } from '../db/repo';
import { navigate } from '../ui/router';
import { toastError } from '../ui/dialogs';

export function lastEnvironment(timeOfDay?: TimeOfDay): Environment {
  const list = getState().trainings.filter((t) => t.status === 'completed' && (!timeOfDay || t.timeOfDay === timeOfDay)).sort((a, b) => b.startedAt - a.startedAt);
  return list[0]?.environment ?? (timeOfDay === 'morning' ? 1 : 2);
}

export function StartSheet(p: {
  open: boolean; onClose: () => void; dogId: string; title: string; items: PlanItem[]; scheduled?: ScheduledSession; timeOfDay?: TimeOfDay;
}) {
  const [env, setEnv] = useState<Environment>(() => lastEnvironment(p.timeOfDay ?? p.scheduled?.timeOfDay));
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const id = await startTraining({ dogId: p.dogId, scheduled: p.scheduled, title: p.title, items: p.items, environment: env, timeOfDay: p.timeOfDay });
      p.onClose();
      navigate(`train/${id}`);
    } catch (e) { toastError(e); }
    setBusy(false);
  }

  return (
    <Sheet open={p.open} onClose={p.onClose} title="Где тренируетесь?"
      footer={<Button variant="primary" size="lg" full onClick={go} disabled={busy || !p.items.length}>Начать тренировку</Button>}>
      <p className="mb-3 text-[0.92rem] text-ink-2">Обстановка нужна, чтобы сравнивать результаты в похожих условиях. Её можно поправить в конце.</p>
      <div className="grid gap-2" role="radiogroup" aria-label="Обстановка">
        {ENVIRONMENTS.map((e) => (
          <button key={e.id} type="button" role="radio" aria-checked={env === e.id} onClick={() => setEnv(e.id)}
            className={clsx('press flex min-h-14 items-center gap-3 rounded-2xl px-4 py-2.5 text-left ring-1 ring-inset',
              env === e.id ? 'bg-sage-soft ring-sage' : 'bg-surface ring-line')}>
            <span className={clsx('num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-semibold', env === e.id ? 'bg-sage text-sage-ink' : 'bg-surface-2 text-ink-2')}>{e.id}</span>
            <span><span className="block font-semibold">{e.label}</span><span className="block text-[0.85rem] text-ink-2">{e.hint}</span></span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
