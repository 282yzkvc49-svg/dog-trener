// Библиотека упражнений, карточка упражнения с историей и уровнями, пользовательские упражнения.

import { useState } from 'react';
import { clsx } from 'clsx';
import { LuChevronRight, LuPencil, LuPlay, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu';
import type { Category, Exercise, Measurement, Problem } from '../domain/types';
import { useApp, current } from '../db/store';
import { allExercises, getExercise, levelOf, maxLevel } from '../domain/plan';
import { CATEGORIES, MEASUREMENT_LABEL, PROBLEM_LABEL } from '../content/exercises';
import { ENV_SHORT, isCounted, recommend } from '../domain/adaptation';
import { deleteCustomExercise, levelFor, saveCustomExercise, setLevel } from '../db/repo';
import { Button, Chip, Empty, Field, Page, SectionTitle } from '../ui/kit';
import { LineChart } from '../ui/charts';
import { PROBLEM_COLOR } from '../ui/common';
import { navigate } from '../ui/router';
import { confirmDialog, toast, toastError } from '../ui/dialogs';
import { fmtDateTime, fmtDay } from '../lib/date';
import { uid } from '../lib/util';
import { ExerciseDetails } from './ExerciseDetails';
import { RecommendationBox } from './RecommendationBox';
import { StartSheet } from './StartSheet';
import { defaultItemFor } from './ExercisePicker';

export function ExercisesScreen() {
  const s = useApp();
  const { dog } = current(s);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const list = allExercises().filter((e) => (cat === 'all' || e.category === cat) && (!q.trim() || e.title.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <Page title="Упражнения" sub={`${allExercises().length} в библиотеке`} right={<Button size="sm" onClick={() => navigate('exercises/new')} icon={<LuPlus size={16} aria-hidden />}>Своё</Button>}>
      <div className="relative">
        <LuSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" size={18} aria-hidden />
        <input className="field pl-10" type="search" placeholder="Найти упражнение" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск упражнения" autoComplete="off" />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={cat === 'all'} onClick={() => setCat('all')} className="shrink-0">Все</Chip>
        {CATEGORIES.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)} className="shrink-0">{c}</Chip>)}
      </div>
      <ul className="mt-3 space-y-2">
        {list.map((e) => {
          const lvl = dog ? levelFor(dog.id, e.id) : 1;
          const last = s.results.filter((r) => r.exerciseId === e.id && isCounted(r)).sort((a, b) => b.startedAt - a.startedAt)[0];
          const ev = last ? last.successful + last.unsuccessful : 0;
          return (
            <li key={e.id}>
              <button type="button" onClick={() => navigate(`exercises/${e.id}`)} className="card press flex w-full items-center gap-3 p-4 text-left">
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: PROBLEM_COLOR[e.problem] }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight">{e.title}{e.custom ? <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[0.72rem] font-medium text-ink-2">своё</span> : null}</span>
                  <span className="block text-[0.85rem] text-ink-2">{e.category} · уровень {lvl} из {maxLevel(e)}</span>
                  {last && <span className="block text-[0.8rem] text-ink-3">Последний раз {fmtDay(last.date)}: {ev ? `${Math.round((last.successful / ev) * 100)}% из ${ev}` : 'без попыток'}</span>}
                </span>
                <LuChevronRight className="shrink-0 text-ink-3" size={18} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {!list.length && <Empty title="Ничего не найдено" text="Попробуйте другое слово или категорию." />}
    </Page>
  );
}

export function ExerciseDetailScreen({ id }: { id: string }) {
  const s = useApp();
  const { dog } = current(s);
  const e = getExercise(id);
  const [start, setStart] = useState(false);
  if (!e || !dog) return <Page title="Упражнение" back="exercises"><Empty title="Упражнение не найдено" text="Возможно, оно было удалено." /></Page>;
  const lvl = levelFor(dog.id, e.id);
  const history = s.results.filter((r) => r.exerciseId === e.id).sort((a, b) => a.startedAt - b.startedAt);
  const counted = history.filter(isCounted);
  const rec = recommend(e, lvl, history);
  const changes = s.levelChanges.filter((c) => c.exerciseId === e.id).sort((a, b) => b.at - a.at);
  const lastN = counted.slice(-20);

  async function manual(n: number) {
    if (n === lvl) return;
    const ok = await confirmDialog({ title: `Уровень ${n}: ${levelOf(e!, n).title}`, text: n > lvl ? 'Повышать уровень лучше после двух удачных сессий от 80%. Изменить вручную?' : 'Упростить упражнение до этого уровня?', confirm: 'Изменить' });
    if (!ok) return;
    try { await setLevel(dog!.id, e!.id, n, 'Изменено вручную', true); toast('Уровень изменён'); } catch (err) { toastError(err); }
  }

  async function remove() {
    const used = s.sessions.some((x) => x.status === 'planned' && x.items.some((i) => i.exerciseId === e!.id));
    const ok = await confirmDialog({ title: 'Удалить упражнение?', text: used ? 'Оно есть в запланированных занятиях — там оно останется под названием «Удалённое упражнение». История результатов сохранится.' : 'История результатов сохранится.', confirm: 'Удалить', danger: true });
    if (!ok) return;
    try { await deleteCustomExercise(e!.id); navigate('exercises', { replace: true }); toast('Упражнение удалено'); } catch (err) { toastError(err); }
  }

  return (
    <Page title={e.title} sub={`${e.category} · ${PROBLEM_LABEL[e.problem]}`} back="exercises"
      right={e.custom ? <Button size="sm" variant="ghost" onClick={() => navigate(`exercises/${e.id}/edit`)} icon={<LuPencil size={16} aria-hidden />}>Изменить</Button> : undefined}>
      <section className="card p-4">
        <p className="text-[0.85rem] text-ink-2">Текущий уровень</p>
        <p className="mt-0.5 text-[1.2rem] font-semibold"><span className="num">{lvl} из {maxLevel(e)}</span> · {levelOf(e, lvl).title}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Изменить уровень вручную">
          {e.levels.map((l) => <Chip key={l.n} active={l.n === lvl} onClick={() => manual(l.n)}><span className="num">{l.n}</span></Chip>)}
        </div>
        <RecommendationBox rec={rec} e={e} dogId={dog.id} className="mt-4" />
        <Button variant="primary" full className="mt-4" onClick={() => setStart(true)} icon={<LuPlay size={18} aria-hidden />}>Потренировать сейчас</Button>
      </section>

      <SectionTitle>История результатов</SectionTitle>
      {counted.length ? (
        <>
          <section className="card p-4">
            <p className="mb-2 text-[0.9rem] text-ink-2">Доля успешных попыток, последние {lastN.length} сессий</p>
            <LineChart labels={lastN.map((r) => r.date.slice(8) + '.' + r.date.slice(5, 7))} tooltipLabels={lastN.map((r) => `${fmtDay(r.date)} · ур. ${r.difficultyLevel} · ${ENV_SHORT[r.environment]}`)}
              series={[{ name: e.title, color: PROBLEM_COLOR[e.problem], values: lastN.map((r) => { const ev = r.successful + r.unsuccessful; return ev ? Math.round(((r.stressed ? 0 : r.successful) / ev) * 100) : null; }), n: lastN.map((r) => r.successful + r.unsuccessful) }]}
              yMax={100} caption={`График успешности: ${e.title}`} labelTitle="Сессия" />
          </section>
          <ul className="card mt-2 divide-y divide-line">
            {[...counted].reverse().slice(0, 30).map((r) => {
              const ev = r.successful + r.unsuccessful;
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-[0.92rem]">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{fmtDay(r.date)} · уровень {r.difficultyLevel}</span>
                    <span className="block text-[0.82rem] text-ink-2">{ENV_SHORT[r.environment]}{r.stressed ? ' · сильное возбуждение' : ''}{r.noOpportunity && !ev ? ' · не было встреч' : ''}{typeof r.tensions === 'number' && e.measurement === 'segments' ? ` · натяжений ${r.tensions}` : ''}</span>
                  </span>
                  <span className="num text-right">{ev ? <><span className="font-semibold">{Math.round(((r.stressed ? 0 : r.successful) / ev) * 100)}%</span><span className="block text-[0.78rem] text-ink-3">{r.successful} из {ev}</span></> : '—'}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : <Empty title="Пока нет результатов" text="Результаты появятся после первой тренировки с этим упражнением." />}

      {changes.length > 0 && (
        <>
          <SectionTitle>История уровня</SectionTitle>
          <ul className="card divide-y divide-line">
            {changes.map((c) => (
              <li key={c.id} className="px-4 py-3 text-[0.92rem]">
                <span className="font-medium">Уровень {c.from} → {c.to}</span>
                <span className="block text-[0.82rem] text-ink-2">{fmtDateTime(c.at)} · {c.manual ? 'вручную' : c.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Карточка упражнения</SectionTitle>
      <section className="card p-4"><ExerciseDetails e={e} level={lvl} /></section>

      {e.custom && <Button variant="danger" full className="mt-4" onClick={remove} icon={<LuTrash2 size={18} aria-hidden />}>Удалить упражнение</Button>}

      {start && <StartSheet open onClose={() => setStart(false)} dogId={dog.id} title={e.title} items={[{ ...defaultItemFor(e.id), uid: 'f1' }]} />}
    </Page>
  );
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function CustomExerciseScreen({ id }: { id?: string }) {
  const existing = id ? getExercise(id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'Внимание');
  const [problem, setProblem] = useState<Problem>(existing?.problem ?? 'general');
  const [measurement, setMeasurement] = useState<Measurement>(existing?.measurement ?? 'attempts');
  const [goal, setGoal] = useState(existing?.goal ?? '');
  const [steps, setSteps] = useState(existing?.steps.join('\n') ?? '');
  const [equipment, setEquipment] = useState(existing?.equipment.join(', ') ?? 'Лакомство');
  const [criterion, setCriterion] = useState(existing?.successCriterion ?? '');
  const [levels, setLevels] = useState(existing?.levels.map((l) => l.title).join('\n') ?? 'Дома без отвлечений\nТихое место на улице\nПрогулка с отвлечениями');
  const [simplify, setSimplify] = useState(existing?.simplify ?? 'Вернись в более спокойное место и награждай чаще.');
  const [harder, setHarder] = useState(existing?.harder ?? 'Меняй по одному параметру: место, длительность или отвлечения.');
  const [busy, setBusy] = useState(false);

  if (id && (!existing || !existing.custom)) return <Page title="Своё упражнение" back="exercises"><Empty title="Упражнение не найдено" /></Page>;

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    const now = Date.now();
    const lv = lines(levels);
    const unit: Exercise['unit'] = measurement === 'segments' ? ['отрезок', 'отрезка', 'отрезков'] : measurement === 'observations' ? ['наблюдение', 'наблюдения', 'наблюдений'] : ['попытка', 'попытки', 'попыток'];
    const e: Exercise = {
      id: existing?.id ?? uid('custom-'), title: title.trim(), category, problem, goal: goal.trim(), difficulty: 1, durationMin: 4,
      equipment: equipment.split(',').map((x) => x.trim()).filter(Boolean), steps: lines(steps), mistakes: existing?.mistakes ?? [],
      stressSigns: existing?.stressSigns ?? ['Облизывает нос, зевает без усталости', 'Перестаёт брать лакомство', 'Отворачивается, пытается уйти'],
      successCriterion: criterion.trim() || 'Собака выполняет упражнение спокойно и с первого сигнала.',
      progression: 'Две сессии подряд от 80% в похожих условиях — можно усложнить один параметр.',
      simplify: simplify.trim(), harder: harder.trim(), measurement, unit,
      successLabel: measurement === 'observations' ? 'Спокойно' : measurement === 'duration' ? 'Выдержала' : 'Успех',
      failLabel: measurement === 'observations' ? 'Реакция' : measurement === 'duration' ? 'Не выдержала' : 'Не получилось',
      levels: (lv.length ? lv : ['Базовый уровень']).map((t, i) => ({ n: i + 1, title: t, changes: i === 0 ? 'Базовый уровень' : 'Сложнее предыдущего', steps: [], seconds: measurement === 'duration' ? [10, 20, 30, 60, 120][i] ?? 60 : undefined })),
      perUnitMin: measurement === 'observations' ? 2 : 0.5, minEvaluated: measurement === 'attempts' ? 8 : 3,
      custom: true, createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    try {
      await saveCustomExercise(e);
      toast(existing ? 'Упражнение сохранено' : 'Упражнение добавлено');
      navigate(`exercises/${e.id}`, { replace: true });
    } catch (err) { toastError(err); setBusy(false); }
  }

  return (
    <Page title={existing ? 'Изменить упражнение' : 'Своё упражнение'} back="exercises">
      <div className="space-y-4">
        <Field label="Название"><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, «Лапу»" /></Field>
        <div>
          <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Категория</span>
          <div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>)}</div>
        </div>
        <div>
          <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Направление</span>
          <div className="flex flex-wrap gap-2">{(['leash', 'distractions', 'pickup', 'general'] as Problem[]).map((p) => <Chip key={p} active={problem === p} onClick={() => setProblem(p)}>{PROBLEM_LABEL[p]}</Chip>)}</div>
        </div>
        <div>
          <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Как считать результат</span>
          <div className="flex flex-wrap gap-2">{(['attempts', 'segments', 'observations', 'duration'] as Measurement[]).map((m) => <Chip key={m} active={measurement === m} onClick={() => setMeasurement(m)}>{MEASUREMENT_LABEL[m]}</Chip>)}</div>
        </div>
        <Field label="Цель"><input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
        <Field label="Пошаговая инструкция" hint="Каждый шаг — с новой строки"><textarea className={clsx('field min-h-32')} value={steps} onChange={(e) => setSteps(e.target.value)} /></Field>
        <Field label="Необходимые предметы" hint="Через запятую"><input className="field" value={equipment} onChange={(e) => setEquipment(e.target.value)} /></Field>
        <Field label="Критерий успешного выполнения"><input className="field" value={criterion} onChange={(e) => setCriterion(e.target.value)} /></Field>
        <Field label="Уровни сложности" hint="Каждый уровень — с новой строки, от простого к сложному"><textarea className="field" value={levels} onChange={(e) => setLevels(e.target.value)} /></Field>
        <Field label="Как упростить"><input className="field" value={simplify} onChange={(e) => setSimplify(e.target.value)} /></Field>
        <Field label="Как усложнить"><input className="field" value={harder} onChange={(e) => setHarder(e.target.value)} /></Field>
        <p className="rounded-2xl bg-amber-soft p-4 text-[0.9rem]">Используйте только положительное подкрепление: без рывков, наказаний и принудительного приближения к раздражителям.</p>
        <Button variant="primary" size="lg" full disabled={!title.trim() || busy} onClick={save}>{existing ? 'Сохранить' : 'Добавить упражнение'}</Button>
      </div>
    </Page>
  );
}

