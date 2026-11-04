// Программа: календарь курса — сегодня, неделя, месяц, весь курс. Пауза и продолжение курса.

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { LuChartLine, LuChevronLeft, LuChevronRight, LuCirclePause, LuCirclePlay } from 'react-icons/lu';
import type { DayStatus, ISODate } from '../domain/types';
import { useApp, current } from '../db/store';
import { buildDateIndex, coursePosition, pauseProgram, resumeProgram, viewForDate } from '../domain/schedule';
import { addDays, fmtDay, fromISO, monthName, startOfWeekMonday, today, toISO, weekdayShort, weekday } from '../lib/date';
import { Button, Field, Page, Segmented } from '../ui/kit';
import { StatusBadge, STATUS } from '../ui/common';
import { navigate, useQuery } from '../ui/router';
import { DayView } from './Day';
import { WEEKS } from '../content/program';
import { saveBundle, saveWeekNote } from '../db/repo';
import { confirmDialog, toast, toastError } from '../ui/dialogs';

type View = 'today' | 'week' | 'month' | 'course';
const VIEWS: { id: View; label: string }[] = [
  { id: 'today', label: 'Сегодня' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }, { id: 'course', label: 'Курс' },
];

const CELL: Record<DayStatus, string> = {
  done: 'bg-sage text-sage-ink',
  partial: 'bg-amber text-white',
  planned: 'bg-surface-2 text-ink',
  today: 'bg-surface text-ink ring-2 ring-merle',
  missed: 'bg-rose-soft text-rose',
  rest: 'bg-copper-soft text-copper',
  moved: 'bg-merle-soft text-merle',
  paused: 'bg-surface-2 text-ink-3 opacity-60',
};

export function ProgramScreen() {
  const s = useApp();
  const { program, days, sessions } = current(s);
  const q = useQuery();
  const view = (q.get('view') as View) || 'week';
  const t = today();
  const idx = useMemo(() => buildDateIndex(days, sessions), [days, sessions]);
  const pos = coursePosition(t, days);
  const [week, setWeek] = useState(() => Number(q.get('w')) || pos.day?.week || (pos.state === 'after' ? 12 : 1));
  const [month, setMonth] = useState(() => {
    const ref = pos.state === 'before' && pos.first ? pos.first.date : t;
    const d = fromISO(ref);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const setView = (v: View) => navigate(`program?view=${v}`, { replace: true });

  async function togglePause() {
    if (!program) return;
    try {
      if (program.status === 'paused') {
        await saveBundle(resumeProgram({ program, days, sessions }, t));
        toast('Курс продолжен');
      } else {
        const ok = await confirmDialog({ title: 'Поставить курс на паузу?', text: 'Пока курс на паузе, занятия не назначаются. После продолжения все несделанные дни сдвинутся на время паузы — без долгов и двойной нагрузки.', confirm: 'Пауза' });
        if (!ok) return;
        await saveBundle({ program: pauseProgram(program, t), days, sessions });
        toast('Курс на паузе');
      }
    } catch (e) { toastError(e); }
  }

  const statusOf = (d: ISODate) => viewForDate(d, idx, t, program).status;

  return (
    <Page title="Программа" sub={program?.status === 'paused' ? 'Курс на паузе' : pos.day ? `Неделя ${pos.day.week} из 12` : pos.state === 'before' && pos.first ? `Старт ${fmtDay(pos.first.date)}` : undefined}
      right={program && (
        <Button size="sm" variant={program.status === 'paused' ? 'primary' : 'secondary'} onClick={togglePause}
          icon={program.status === 'paused' ? <LuCirclePlay size={16} aria-hidden /> : <LuCirclePause size={16} aria-hidden />}>
          {program.status === 'paused' ? 'Продолжить' : 'Пауза'}
        </Button>
      )}>
      <Segmented label="Вид календаря" value={view} options={VIEWS} onChange={setView} />

      {view === 'today' && <div className="mt-4"><DayView date={t} /></div>}

      {view === 'week' && (
        <WeekView week={week} setWeek={setWeek} statusOf={statusOf} />
      )}

      {view === 'month' && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Предыдущий месяц" className="press flex h-11 w-11 items-center justify-center rounded-full" onClick={() => setMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}><LuChevronLeft size={22} aria-hidden /></button>
            <p className="text-[1.1rem] font-semibold">{monthName(month.m)} {month.y}</p>
            <button type="button" aria-label="Следующий месяц" className="press flex h-11 w-11 items-center justify-center rounded-full" onClick={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}><LuChevronRight size={22} aria-hidden /></button>
          </div>
          <MonthGrid y={month.y} m={month.m} statusOf={statusOf} inCourse={(d) => !!idx.dayByDate.get(d) || !!idx.byDate.get(d)?.length} />
          <Legend />
        </div>
      )}

      {view === 'course' && (
        <div className="mt-4 space-y-2">
          {WEEKS.map((w) => {
            const wd = days.filter((d) => d.week === w.week).sort((a, b) => a.dayNumber - b.dayNumber);
            return (
              <div key={w.week} className="card p-3">
                <button type="button" className="press flex w-full items-center gap-2 text-left" onClick={() => { setWeek(w.week); setView('week'); }}>
                  <span className="num w-7 text-[0.9rem] font-semibold text-ink-2">{w.week}</span>
                  <span className="flex-1 font-medium">{w.title}</span>
                  <LuChevronRight size={18} className="text-ink-3" aria-hidden />
                </button>
                <div className="mt-2 grid grid-cols-7 gap-1.5 pl-9">
                  {wd.map((d) => {
                    const st = statusOf(d.date);
                    return (
                      <button key={d.id} type="button" onClick={() => navigate(`program/day/${d.date}`)} aria-label={`${fmtDay(d.date)}: ${STATUS[st].label}`}
                        className={clsx('press num flex h-9 items-center justify-center rounded-lg text-[0.8rem] font-semibold', CELL[st])}>
                        {fromISO(d.date).getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <Legend />
        </div>
      )}
    </Page>
  );
}

function Legend() {
  const keys: DayStatus[] = ['done', 'partial', 'planned', 'missed', 'rest', 'moved'];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 px-1 text-[0.82rem] text-ink-2" aria-label="Обозначения">
      {keys.map((k) => <li key={k} className="flex items-center gap-1.5"><span className={clsx('h-3.5 w-3.5 rounded', CELL[k])} />{STATUS[k].label}</li>)}
      <li className="flex items-center gap-1.5"><span className={clsx('h-3.5 w-3.5 rounded', CELL.today)} />Сегодня</li>
    </ul>
  );
}

function MonthGrid({ y, m, statusOf, inCourse }: { y: number; m: number; statusOf: (d: ISODate) => DayStatus; inCourse: (d: ISODate) => boolean }) {
  const first = toISO(new Date(y, m, 1, 12));
  const start = startOfWeekMonday(first);
  const cells: ISODate[] = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const t = today();
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[0.78rem] text-ink-3" aria-hidden>
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => <span key={wd}>{weekdayShort(wd)}</span>)}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((d) => {
          const own = fromISO(d).getMonth() === m;
          const course = inCourse(d);
          const st = course ? statusOf(d) : null;
          return (
            <button key={d} type="button" disabled={!course} onClick={() => navigate(`program/day/${d}`)}
              aria-label={`${fmtDay(d)}${st ? `: ${STATUS[st].label}` : ''}`}
              className={clsx('press num flex aspect-square items-center justify-center rounded-xl text-[0.92rem] font-semibold',
                !own && 'opacity-35', st ? CELL[st] : 'text-ink-3', d === t && st !== 'today' && 'ring-2 ring-merle')}>
              {fromISO(d).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ week, setWeek, statusOf }: { week: number; setWeek: (w: number) => void; statusOf: (d: ISODate) => DayStatus }) {
  const s = useApp();
  const { program, days, sessions } = current(s);
  const info = WEEKS[week - 1];
  const wd = days.filter((d) => d.week === week).sort((a, b) => a.dayNumber - b.dayNumber);
  const [note, setNote] = useState(program?.settings.weekNotes[String(week)] ?? '');
  const [noteWeek, setNoteWeek] = useState(week);
  if (noteWeek !== week) { setNoteWeek(week); setNote(program?.settings.weekNotes[String(week)] ?? ''); }
  const saved = program?.settings.weekNotes[String(week)] ?? '';

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Предыдущая неделя" disabled={week <= 1} className="press flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30" onClick={() => setWeek(week - 1)}><LuChevronLeft size={22} aria-hidden /></button>
        <p className="num text-[1.1rem] font-semibold">Неделя {week} из 12</p>
        <button type="button" aria-label="Следующая неделя" disabled={week >= 12} className="press flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30" onClick={() => setWeek(week + 1)}><LuChevronRight size={22} aria-hidden /></button>
      </div>
      {info && (
        <section className="card mt-2 p-4">
          <h2 className="text-[1.15rem] font-semibold">{info.title}</h2>
          <p className="mt-1 text-ink-2">{info.goal}</p>
          <h3 className="mt-3 text-[0.9rem] font-semibold">Критерии прохождения</h3>
          <ul className="mt-1 space-y-0.5 text-[0.92rem]">{info.passCriteria.map((c) => <li key={c} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />{c}</li>)}</ul>
          <p className="mt-3 text-[0.82rem] text-ink-3">Неделя курса не повышает сложность сама по себе: уровни упражнений меняются только по результатам.</p>
        </section>
      )}
      <ul className="mt-3 space-y-2">
        {wd.map((d) => {
          const st = statusOf(d.date);
          const ss = sessions.filter((x) => x.plannedDate === d.date && !x.optional);
          return (
            <li key={d.id}>
              <button type="button" onClick={() => navigate(`program/day/${d.date}`)} className="card press flex w-full items-center gap-3 p-3 text-left">
                <span className={clsx('num flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none', CELL[st])}>
                  <span className="text-[0.7rem] font-medium opacity-80">{weekdayShort(weekday(d.date))}</span>
                  <span className="text-[1.05rem] font-semibold">{fromISO(d.date).getDate()}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight">День {d.dayNumber}. {d.title}</span>
                  <span className="block truncate text-[0.85rem] text-ink-2">{d.kind === 'rest' || d.madeRest ? 'Отдых' : ss.length ? `${ss.length === 2 ? 'Утро и вечер' : ss.map((x) => (x.timeOfDay === 'morning' ? 'Утро' : 'Вечер')).join(', ')} · ${ss.reduce((a, x) => a + x.items.length, 0)} упр.` : 'Занятия перенесены'}{d.edited ? ' · изменено' : ''}</span>
                </span>
                <span className="hidden sm:block"><StatusBadge status={st} /></span>
                <LuChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {program && (
        <section className="card mt-4 p-4">
          <Field label={`Заметки и рекомендации к неделе ${week}`} hint="Сюда можно вставить советы ChatGPT или Claude по отчёту, а затем поправить дни недели вручную.">
            <textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: оставить «Оставь» на уровне 2, отрезки по 15 шагов" />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={note === saved} onClick={() => saveWeekNote(program, week, note).then(() => toast('Заметка сохранена')).catch(toastError)}>Сохранить заметку</Button>
            <Button size="sm" onClick={() => navigate(`report/${week}`)} icon={<LuChartLine size={16} aria-hidden />}>Отчёт недели</Button>
          </div>
        </section>
      )}
    </div>
  );
}
