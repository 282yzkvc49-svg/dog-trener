import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { LuMoon, LuSunrise } from 'react-icons/lu';
import type { ScheduledSession } from '../domain/types';
import { describeItem, ex, levelOf, sessionMinutes } from '../domain/plan';
import { levelFor } from '../db/repo';
import { StatusBadge, PROBLEM_COLOR } from '../ui/common';
import { effectiveStatus } from '../domain/schedule';

export function SessionCard(p: { s: ScheduledSession; dogId: string; todayISO: string; time?: string; reminder?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  const { s } = p;
  const st = effectiveStatus(s, p.todayISO);
  const mins = sessionMinutes(s);
  const Icon = s.timeOfDay === 'morning' ? LuSunrise : LuMoon;
  return (
    <section className="card overflow-hidden" aria-label={s.title}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className={clsx('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', s.timeOfDay === 'morning' ? 'bg-amber-soft text-amber' : 'bg-merle-soft text-merle')}>
          <Icon size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">{s.title ?? (s.timeOfDay === 'morning' ? 'Утренняя тренировка' : 'Вечерняя тренировка')}</h3>
          <p className="text-[0.88rem] text-ink-2">{p.time ? `${p.time} · ` : ''}≈ {mins} мин{s.optional ? ' · по желанию' : ''}</p>
        </div>
        {(st !== 'planned' || s.rescheduledFrom) && <StatusBadge status={st === 'planned' && s.rescheduledFrom ? 'moved' : st} />}
      </div>
      {p.reminder}
      {s.note && <p className="px-4 pt-2 text-[0.9rem] text-ink-2">{s.note}</p>}
      {s.skipReason && st === 'skipped' && <p className="px-4 pt-2 text-[0.9rem] text-rose">Причина: {s.skipReason}</p>}
      <ul className={clsx('px-4', p.compact ? 'py-2' : 'py-3')}>
        {s.items.map((i) => {
          const e = ex(i.exerciseId);
          const lvl = levelFor(p.dogId, i.exerciseId);
          return (
            <li key={i.uid} className="flex items-start gap-3 py-1.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: PROBLEM_COLOR[e.problem] }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="leading-snug"><span className="font-medium">{e.title}</span><span className="text-ink-2">, {describeItem(i, e)}</span></p>
                {!p.compact && <p className="text-[0.82rem] text-ink-3">Уровень {lvl} · {levelOf(e, lvl).title}{i.note ? ` · ${i.note}` : ''}</p>}
                {!p.compact && i.condition && <p className="text-[0.82rem] text-amber">{i.condition}</p>}
              </div>
            </li>
          );
        })}
        {!s.items.length && <li className="py-1.5 text-ink-2">Упражнения не выбраны — добавьте их в плане дня.</li>}
      </ul>
      {p.actions && <div className="flex flex-wrap gap-2 px-4 pb-4">{p.actions}</div>}
    </section>
  );
}
