import { clsx } from 'clsx';
import { LuShieldCheck } from 'react-icons/lu';
import type { Exercise } from '../domain/types';
import { MEASUREMENT_LABEL, PROBLEM_LABEL } from '../content/exercises';

function List({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (!items.length) return null;
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <section className="mt-5">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <Tag className="space-y-1.5">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2.5">
            {ordered ? <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.8rem] font-semibold text-ink-2">{i + 1}</span> : <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" />}
            <span>{x}</span>
          </li>
        ))}
      </Tag>
    </section>
  );
}

export function ExerciseDetails({ e, level }: { e: Exercise; level?: number }) {
  return (
    <div className="pb-2">
      <p className="text-ink-2">{e.goal}</p>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-[0.9rem]">
        <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Категория</dt><dd className="font-medium">{e.category}</dd></div>
        <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Направление</dt><dd className="font-medium">{PROBLEM_LABEL[e.problem]}</dd></div>
        <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Сложность</dt><dd className="font-medium">{['', 'Начальная', 'Средняя', 'Высокая'][e.difficulty]}</dd></div>
        <div className="rounded-xl bg-surface-2 p-3"><dt className="text-ink-3">Длительность</dt><dd className="font-medium">≈ {e.durationMin} мин · {MEASUREMENT_LABEL[e.measurement].toLowerCase()}</dd></div>
      </dl>
      {e.equipment.length > 0 && <p className="mt-4 text-[0.95rem]"><span className="text-ink-2">Понадобится: </span>{e.equipment.join(', ')}</p>}
      <List title="Пошаговая инструкция" items={e.steps} ordered />
      <section className="mt-5 rounded-2xl bg-sage-soft p-4">
        <h3 className="font-semibold">Успешное выполнение</h3>
        <p className="mt-1">{e.successCriterion}</p>
        <h3 className="mt-3 font-semibold">Переход на следующий уровень</h3>
        <p className="mt-1">{e.progression}</p>
      </section>
      <List title="Типичные ошибки хозяина" items={e.mistakes} />
      <List title="Признаки перегрузки или стресса" items={e.stressSigns} />
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-2 p-4"><h3 className="font-semibold">Как упростить</h3><p className="mt-1 text-[0.95rem]">{e.simplify}</p></div>
        <div className="rounded-2xl bg-surface-2 p-4"><h3 className="font-semibold">Как усложнить</h3><p className="mt-1 text-[0.95rem]">{e.harder}</p></div>
      </div>
      {e.safety?.length ? (
        <div className="mt-5 flex gap-3 rounded-2xl bg-amber-soft p-4">
          <LuShieldCheck className="mt-0.5 shrink-0 text-amber" size={20} aria-hidden />
          <div className="space-y-1 text-[0.95rem]">{e.safety.map((x) => <p key={x}>{x}</p>)}</div>
        </div>
      ) : null}
      <section className="mt-5">
        <h3 className="mb-2 font-semibold">Уровни</h3>
        <ol className="space-y-2">
          {e.levels.map((l) => (
            <li key={l.n} className={clsx('rounded-2xl p-3 ring-1 ring-inset', l.n === level ? 'bg-sage-soft ring-sage' : 'ring-line')}>
              <p className="font-semibold"><span className="num">{l.n}.</span> {l.title}{l.n === level ? ' — текущий' : ''}</p>
              <p className="text-[0.85rem] text-ink-2">{l.changes}</p>
              {l.steps.length > 0 && <p className="mt-1 text-[0.9rem]">{l.steps.join(' ')}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
