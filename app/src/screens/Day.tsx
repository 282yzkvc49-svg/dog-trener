// План дня: просмотр и редактирование занятий, перенос, пропуск с причиной, день отдыха.

import { useMemo, useState } from 'react';
import { LuArrowLeftRight, LuCalendarPlus, LuCoffee, LuPencil, LuPlay, LuPlus, LuRotateCcw, LuSkipForward, LuTrash2 } from 'react-icons/lu';
import type { PlanItem, ScheduledSession } from '../domain/types';
import { useApp, current } from '../db/store';
import { buildDateIndex, effectiveStatus, makeRestDay, moveSession, newExtraSession, restoreSession, skipSession, undoRestDay, updateItems, viewForDate } from '../domain/schedule';
import { addDays, fmtDay, fmtDayLong, isValidISO, today } from '../lib/date';
import { Button, Chip, Field, Page, Sheet, Stepper } from '../ui/kit';
import { StatusBadge } from '../ui/common';
import { SessionCard } from './SessionCard';
import { StartSheet } from './StartSheet';
import { deleteSession, putDayWithSessions, putSession, putSessions } from '../db/repo';
import { confirmDialog, toast, toastError } from '../ui/dialogs';
import { navigate } from '../ui/router';
import { describeItem, estimateMinutes, ex } from '../domain/plan';
import { SKIP_REASONS } from '../domain/training';
import { ExercisePicker, defaultItemFor } from './ExercisePicker';
import { WEEKS } from '../content/program';
import { uid } from '../lib/util';

export function DayScreen({ date }: { date: string }) {
  if (!isValidISO(date)) return <Page title="План дня" back="program"><p className="text-ink-2">Неверная дата.</p></Page>;
  return (
    <Page title={capital(fmtDayLong(date))} back="program">
      <DayView date={date} />
    </Page>
  );
}

function capital(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function DayView({ date }: { date: string }) {
  const s = useApp();
  const { dog, program, days, sessions } = current(s);
  const t = today();
  const idx = useMemo(() => buildDateIndex(days, sessions), [days, sessions]);
  const v = viewForDate(date, idx, t, program);
  const [start, setStart] = useState<ScheduledSession | null>(null);
  const [edit, setEdit] = useState<ScheduledSession | null>(null);
  const [move, setMove] = useState<ScheduledSession | null>(null);
  const [skip, setSkip] = useState<ScheduledSession | null>(null);
  const trainings = s.trainings.filter((x) => x.date === date && x.status === 'completed');
  const day = v.day ?? (v.sessions[0] ? idx.dayByNumber.get(v.sessions[0].dayNumber) : undefined);
  const paused = program?.status === 'paused' && program.pausedAt && date >= program.pausedAt && date >= t;

  if (!dog) return null;

  async function toggleRest() {
    if (!v.day) return;
    try {
      if (v.day.madeRest) {
        const r = undoRestDay(v.day, v.sessions.filter((x) => x.dayNumber === v.day!.dayNumber));
        await putDayWithSessions(r.day, r.sessions);
        toast('Занятия дня возвращены');
      } else {
        const ok = await confirmDialog({ title: 'Сделать днём отдыха?', text: 'Невыполненные занятия этого дня отменятся и не будут считаться пропуском. Это можно вернуть.', confirm: 'Сделать отдыхом' });
        if (!ok) return;
        const r = makeRestDay(v.day, v.sessions.filter((x) => x.dayNumber === v.day!.dayNumber));
        await putDayWithSessions(r.day, r.sessions);
        toast('День отдыха');
      }
    } catch (e) { toastError(e); }
  }

  async function addExtra(tod: 'morning' | 'evening') {
    if (!program) return;
    const ref = day ?? [...days].sort((a, b) => a.date.localeCompare(b.date)).reverse().find((d) => d.date <= date) ?? days[0];
    if (!ref) return;
    const sNew = newExtraSession(program.id, date, ref.dayNumber, ref.week, tod);
    setEdit(sNew);
  }

  async function restore(x: ScheduledSession) {
    try { await putSession(restoreSession(x)); toast('Занятие возвращено в план'); } catch (e) { toastError(e); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        {day && <span className="num font-semibold">Неделя {day.week} · День {day.dayNumber}</span>}
        <StatusBadge status={v.status} />
        {day && <span className="text-[0.9rem] text-ink-2">{WEEKS[day.week - 1]?.title}</span>}
      </div>

      {day && (
        <section className="card p-4">
          <h2 className="text-[1.15rem] font-semibold">{day.title}</h2>
          <p className="mt-1"><span className="text-ink-2">Цель: </span>{day.goal}</p>
          <p className="mt-1"><span className="text-ink-2">Критерий: </span>{day.criteria}</p>
          <p className="mt-3 rounded-xl bg-sage-soft px-3 py-2 text-[0.92rem]">{day.tip}</p>
        </section>
      )}

      {paused && <p className="rounded-2xl bg-surface-2 p-4 text-ink-2">Курс на паузе. После продолжения этот день сдвинется на время паузы.</p>}

      {(v.status === 'rest' || day?.madeRest) && (
        <section className="card flex gap-3 p-4">
          <LuCoffee className="mt-0.5 shrink-0 text-copper" size={22} aria-hidden />
          <p>{day?.madeRest ? 'Этот день сделан днём отдыха.' : day?.restNote ?? 'День отдыха — без обязательных упражнений.'}</p>
        </section>
      )}

      {v.movedOut.map((m) => (
        <p key={m.id} className="rounded-2xl bg-merle-soft px-4 py-3 text-[0.95rem]">
          {m.timeOfDay === 'morning' ? 'Утренняя' : 'Вечерняя'} тренировка перенесена на{' '}
          <button className="font-semibold underline underline-offset-2" onClick={() => navigate(`program/day/${m.plannedDate}`)}>{fmtDay(m.plannedDate)}</button>.
        </p>
      ))}

      {v.sessions.map((x) => {
        const st = effectiveStatus(x, t);
        const from = x.rescheduledFrom ? ` (перенесено с ${fmtDay(x.rescheduledFrom)})` : '';
        const isFuture = x.plannedDate > t;
        return (
          <div key={x.id}>
            {from && <p className="mb-1 px-1 text-[0.85rem] text-merle">{from.trim()}</p>}
            <SessionCard s={x} dogId={dog.id} todayISO={t}
              time={x.timeOfDay === 'morning' ? s.settings.morningTrainingTime : s.settings.eveningTrainingTime}
              actions={st === 'rest' ? null : (
                <>
                  {!isFuture && st !== 'skipped' && <Button variant="primary" onClick={() => setStart(x)} disabled={!x.items.length || !!paused} icon={<LuPlay size={18} aria-hidden />}>{st === 'done' ? 'Повторить' : 'Начать'}</Button>}
                  {isFuture && <Button variant="soft" onClick={async () => { try { await putSession(moveSession(x, t)); toast('Перенесено на сегодня'); navigate('today'); } catch (e) { toastError(e); } }}>Сделать сегодня</Button>}
                  <Button onClick={() => setEdit(x)} icon={<LuPencil size={16} aria-hidden />}>Изменить</Button>
                  {st !== 'done' && <Button onClick={() => setMove(x)} icon={<LuArrowLeftRight size={16} aria-hidden />}>Перенести</Button>}
                  {(st === 'planned' || st === 'missed' || st === 'partial') && !x.optional && <Button onClick={() => setSkip(x)} icon={<LuSkipForward size={16} aria-hidden />}>Пропуск</Button>}
                  {st === 'skipped' && <Button onClick={() => restore(x)} icon={<LuRotateCcw size={16} aria-hidden />}>Вернуть в план</Button>}
                  {x.extra && st !== 'done' && <Button variant="ghost" onClick={async () => { if (await confirmDialog({ title: 'Удалить добавленную тренировку?', confirm: 'Удалить', danger: true })) deleteSession(x.id).catch(toastError); }} icon={<LuTrash2 size={16} aria-hidden />}>Удалить</Button>}
                </>
              )} />
          </div>
        );
      })}

      {!v.sessions.length && v.status !== 'rest' && !day && <p className="rounded-2xl bg-surface-2 p-4 text-ink-2">Эта дата вне курса.</p>}

      {trainings.length > 0 && (
        <section className="card p-4">
          <h3 className="font-semibold">Проведённые тренировки</h3>
          <ul className="mt-2 space-y-1">
            {trainings.map((tr) => {
              const rs = s.results.filter((r) => r.sessionId === tr.id && r.status === 'done' && !r.skipped);
              const ok = rs.reduce((a, r) => a + (r.stressed ? 0 : r.successful), 0), all = rs.reduce((a, r) => a + r.successful + r.unsuccessful, 0);
              return (
                <li key={tr.id}>
                  <button className="press flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-left" onClick={() => navigate(`train/${tr.id}/summary`)}>
                    <span>{tr.title}{tr.trainedBy ? <span className="text-ink-2"> · {tr.trainedBy}</span> : null}</span><span className="num text-ink-2">{all ? `${Math.round((ok / all) * 100)}% · ${all} попыт.` : 'без попыток'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {program && day && (
        <div className="grid gap-2 pt-2 sm:grid-cols-2">
          {v.day && v.day.kind === 'training' && (
            <Button full onClick={toggleRest} icon={<LuCoffee size={18} aria-hidden />}>{v.day.madeRest ? 'Вернуть занятия дня' : 'Сделать днём отдыха'}</Button>
          )}
          <Button full onClick={() => addExtra(v.sessions.some((x) => x.timeOfDay === 'morning') ? 'evening' : 'morning')} icon={<LuCalendarPlus size={18} aria-hidden />}>Добавить тренировку</Button>
        </div>
      )}

      {start && <StartSheet open onClose={() => setStart(null)} dogId={dog.id} scheduled={start} title={start.title ?? 'Тренировка'} items={start.items} timeOfDay={start.timeOfDay} />}
      {edit && <EditSessionSheet s={edit} onClose={() => setEdit(null)} />}
      {move && <MoveSheet s={move} onClose={() => setMove(null)} />}
      <Sheet open={!!skip} onClose={() => setSkip(null)} title="Причина пропуска">
        <p className="mb-3 text-[0.92rem] text-ink-2">Пропуск не создаёт долг на следующие дни и не считается неудачной попыткой.</p>
        <div className="grid gap-2">
          {SKIP_REASONS.map((r) => (
            <Button key={r} full onClick={async () => { if (!skip) return; try { await putSession(skipSession(skip, r)); setSkip(null); toast('Отмечено как пропуск'); } catch (e) { toastError(e); } }}>{r}</Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function MoveSheet({ s, onClose }: { s: ScheduledSession; onClose: () => void }) {
  const t = today();
  const [date, setDate] = useState(s.plannedDate < t ? t : addDays(s.plannedDate, 1));
  const [tod, setTod] = useState(s.timeOfDay);
  async function save() {
    try {
      await putSession({ ...moveSession(s, date), timeOfDay: tod });
      toast(`Перенесено на ${fmtDay(date)}`);
      onClose();
    } catch (e) { toastError(e); }
  }
  return (
    <Sheet open onClose={onClose} title="Перенести тренировку" footer={<Button variant="primary" size="lg" full onClick={save} disabled={!isValidISO(date)}>Перенести на {isValidISO(date) ? fmtDay(date) : '…'}</Button>}>
      <div className="flex flex-wrap gap-2">
        <Chip active={date === t} onClick={() => setDate(t)}>Сегодня</Chip>
        <Chip active={date === addDays(t, 1)} onClick={() => setDate(addDays(t, 1))}>Завтра</Chip>
        <Chip active={date === addDays(t, 2)} onClick={() => setDate(addDays(t, 2))}>Послезавтра</Chip>
      </div>
      <Field label="Дата" className="mt-4"><input className="field" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      <div className="mt-4 flex gap-2">
        <Chip active={tod === 'morning'} onClick={() => setTod('morning')}>Утром</Chip>
        <Chip active={tod === 'evening'} onClick={() => setTod('evening')}>Вечером</Chip>
      </div>
      <p className="mt-4 text-[0.88rem] text-ink-2">Результаты прошлых тренировок сохраняются. В календаре исходная дата будет отмечена как «Перенесено».</p>
    </Sheet>
  );
}

export function EditSessionSheet({ s, onClose }: { s: ScheduledSession; onClose: () => void }) {
  const [items, setItems] = useState<PlanItem[]>(() => s.items.map((i) => ({ ...i })));
  const [override, setOverride] = useState<number | undefined>(s.durationOverride);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'replace'; uid: string } | null>(null);
  const auto = estimateMinutes(items);

  const patch = (u: string, p: Partial<PlanItem>) => setItems((list) => list.map((i) => (i.uid === u ? { ...i, ...p } : i)));

  async function save() {
    try {
      const next = { ...updateItems(s, items), durationOverride: override };
      await putSessions([next]);
      toast('План занятия сохранён');
      onClose();
    } catch (e) { toastError(e); }
  }

  return (
    <Sheet open onClose={onClose} title={s.extra && !s.items.length ? 'Новая тренировка' : 'Изменить занятие'}
      footer={<Button variant="primary" size="lg" full onClick={save} disabled={!items.length}>Сохранить</Button>}>
      <ul className="space-y-3">
        {items.map((i) => {
          const e = ex(i.exerciseId);
          return (
            <li key={i.uid} className="rounded-2xl p-3 ring-1 ring-inset ring-line">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.title}</p>
                  <p className="text-[0.85rem] text-ink-2">{describeItem(i, e)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setPicker({ mode: 'replace', uid: i.uid })}>Заменить</Button>
                <button type="button" aria-label={`Убрать: ${e.title}`} onClick={() => setItems((l) => l.filter((x) => x.uid !== i.uid))} className="press flex h-10 w-10 items-center justify-center rounded-full text-rose"><LuTrash2 size={18} aria-hidden /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.9rem] text-ink-2">{i.upTo ? 'Максимум' : e.measurement === 'segments' ? 'Отрезков' : 'Количество'}</span>
                <Stepper label={`Количество: ${e.title}`} value={i.target} min={1} max={50} onChange={(v) => patch(i.uid, { target: v })} />
              </div>
              {e.measurement === 'segments' && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.9rem] text-ink-2">Шагов в отрезке</span>
                  <Stepper label={`Шагов: ${e.title}`} value={i.steps ?? 10} min={3} max={60} onChange={(v) => patch(i.uid, { steps: v })} />
                </div>
              )}
              {e.measurement === 'duration' && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.9rem] text-ink-2">Секунд на повтор</span>
                  <Stepper label={`Секунд: ${e.title}`} value={i.seconds ?? 10} min={3} max={600} step={i.seconds && i.seconds >= 60 ? 15 : 5} onChange={(v) => patch(i.uid, { seconds: v })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button full className="mt-3" onClick={() => setPicker({ mode: 'add' })} icon={<LuPlus size={18} aria-hidden />}>Добавить упражнение</Button>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3">
        <span><span className="block font-medium">Длительность</span><span className="block text-[0.82rem] text-ink-2">{override ? 'задана вручную' : `автоматически ≈ ${auto} мин`}</span></span>
        <div className="flex items-center gap-2">
          <Stepper label="Длительность, минут" value={override ?? auto} min={1} max={90} onChange={(v) => setOverride(v)} suffix="мин" />
        </div>
      </div>
      {override !== undefined && <Button variant="ghost" size="sm" className="mt-1" onClick={() => setOverride(undefined)}>Считать автоматически</Button>}
      <ExercisePicker open={!!picker} onClose={() => setPicker(null)} onPick={(id) => {
        if (!picker) return;
        if (picker.mode === 'add') setItems((l) => [...l, { ...defaultItemFor(id), uid: uid('u') }]);
        else setItems((l) => l.map((x) => (x.uid === picker.uid ? { ...defaultItemFor(id), uid: x.uid, note: undefined } : x)));
        setPicker(null);
      }} />
    </Sheet>
  );
}
