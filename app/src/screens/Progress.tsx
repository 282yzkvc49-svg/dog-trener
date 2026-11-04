// Прогресс: показатели не смешиваются — выполнение плана, доля успешных попыток, уровни, успех по обстановке.

import { useMemo, useState } from 'react';
import { LuBot, LuFileSpreadsheet } from 'react-icons/lu';
import { useApp, current } from '../db/store';
import {
  conditionsTable, dailyLeash, dailyRate, dailyReactions, distanceTable, kpis, OBSERVATION_IDS, PICKUP_REFUSAL, periodFor, problemOf, weeklyRate,
  type DataSet,
} from '../domain/metrics';
import { buildWeekReport } from '../domain/report';
import { ENV_LABEL } from '../domain/adaptation';
import { coursePosition } from '../domain/schedule';
import { ex, levelOf, maxLevel } from '../domain/plan';
import { buildCsv } from '../domain/exporters';
import { fmtDay, pl, today } from '../lib/date';
import { Button, Chip, Empty, Page, SectionTitle, Segmented } from '../ui/kit';
import { BarChart, LineChart, Stat } from '../ui/charts';
import { PROBLEM_COLOR } from '../ui/common';
import { navigate } from '../ui/router';
import { shareFile, stamp } from '../ui/share';
import { toast, toastError } from '../ui/dialogs';

type P = '7' | '14' | '30' | 'all';
const PERIODS: { id: P; label: string }[] = [{ id: '7', label: '7 дней' }, { id: '14', label: '14 дней' }, { id: '30', label: '30 дней' }, { id: 'all', label: 'Весь курс' }];

export function useDataSet(): DataSet {
  const s = useApp();
  const { days, sessions } = current(s);
  return useMemo(() => ({
    results: s.results, attempts: s.attempts, trainings: s.trainings, sessions, days,
    levels: s.levels, levelChanges: s.levelChanges, journal: s.journal,
  }), [s.results, s.attempts, s.trainings, sessions, days, s.levels, s.levelChanges, s.journal]);
}

const fmtPct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

export function ProgressScreen() {
  const s = useApp();
  const { days } = current(s);
  const d = useDataSet();
  const t = today();
  const [period, setPeriod] = useState<P>('14');
  const p = periodFor(period, t, days, d.results);
  const k = kpis(d, p, t);
  const pos = coursePosition(t, days);
  const curWeek = pos.day?.week ?? (pos.state === 'after' ? 12 : 1);
  const [week, setWeek] = useState(curWeek);
  const report = buildWeekReport(d, week, t);
  const daily = period !== 'all';
  const hasAny = d.results.some((r) => r.status === 'done');

  const leash = dailyLeash(d.results, p);
  const reactions = dailyReactions(d.results, p);
  const pickupDaily = dailyRate(d.results, p, (r) => PICKUP_REFUSAL.has(r.exerciseId));
  const wLeash = weeklyRate(d.results, d.days, (r) => problemOf(r.exerciseId) === 'leash');
  const wDistr = weeklyRate(d.results, d.days, (r) => problemOf(r.exerciseId) === 'distractions');
  const wPickup = weeklyRate(d.results, d.days, (r) => PICKUP_REFUSAL.has(r.exerciseId));
  const wObs = weeklyRate(d.results, d.days, (r) => OBSERVATION_IDS.has(r.exerciseId));
  const cond = conditionsTable(d.results, p);
  const dist = distanceTable(d.attempts, d.results, p);
  const usedLevels = [...new Set(d.results.filter((r) => r.status === 'done').map((r) => r.exerciseId))].map((id) => ({ e: ex(id), lvl: s.levels.find((l) => l.exerciseId === id)?.level ?? 1 }));
  const dayLabels = (pts: { date?: string }[]) => pts.map((x) => (x.date ? fmtDay(x.date) : ''));
  const noDataDays = leash.filter((x) => x.value === null).length;

  async function csv() {
    try {
      const r = await shareFile(`aussie-trainer-statistika-${stamp()}.csv`, buildCsv(d.results, d.trainings), 'text/csv');
      if (r !== 'cancelled') toast('Статистика выгружена в CSV');
    } catch (e) { toastError(e); }
  }

  return (
    <Page title="Прогресс" right={<Button size="sm" onClick={csv} icon={<LuFileSpreadsheet size={16} aria-hidden />}>CSV</Button>}>
      <Segmented label="Период" value={period} options={PERIODS} onChange={setPeriod} />
      <p className="mt-2 px-1 text-[0.82rem] text-ink-3">{fmtDay(p.from)} – {fmtDay(p.to)}. Пропуски и «не было встреч» не считаются неудачами.</p>

      {!hasAny && (
        <div className="mt-4"><Empty title="Пока нет данных" text="Проведите первую тренировку — здесь появятся графики. Приложение не показывает примерные или выдуманные цифры." action={<Button variant="primary" onClick={() => navigate('today')}>К тренировке</Button>} /></div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Тренировок" value={k.trainings} sub={`дней с занятиями: ${k.trainingDays}`} />
        <Stat label="Выполнение плана" value={k.adherence.pct === null ? '—' : `${k.adherence.pct}%`} sub={`${k.adherence.done} из ${k.adherence.due}${k.adherence.partial ? `, частично ${k.adherence.partial}` : ''}`} />
        <Stat label="Успешные попытки" value={fmtPct(k.overall.rate)} sub={`из ${k.overall.evaluated} оцениваемых`} />
        <Stat label="Новых уровней" value={k.levelUps} sub={`упражнений выше 1-го: ${k.exercisesAboveStart}`} />
        <Stat label="Натяжений за тренировку" value={k.avgTensions === null ? '—' : String(k.avgTensions).replace('.', ',')} sub={k.tensionSessions ? `по ${pl(k.tensionSessions, ['тренировке', 'тренировкам', 'тренировкам'])}` : 'не отмечались'} />
        <Stat label="Переключений внимания" value={k.switches} sub="на хозяина при отвлечениях" />
        <Stat label="Отказов от подбора" value={k.refusals} sub="«Оставь» и предметы на земле" />
        <Stat label="Время упражнений" value={`${Math.round(k.totalSeconds / 60)} мин`} />
      </div>

      <SectionTitle>Поводок</SectionTitle>
      <section className="card p-4">
        <p className="text-[0.9rem] text-ink-2">Отрезки без натяжения, % · {pl(k.byProblem.leash.evaluated, ['попытка', 'попытки', 'попыток'])} по направлению</p>
        {daily
          ? <LineChart labels={leash.map((x) => x.label)} tooltipLabels={dayLabels(leash)} series={[{ name: 'Свободный поводок', color: 'var(--c-leash)', values: leash.map((x) => x.value), n: leash.map((x) => x.n) }]} yMax={100} caption="Доля отрезков без натяжения по дням" />
          : <LineChart labels={wLeash.map((x) => x.label)} tooltipLabels={wLeash.map((x) => `Неделя ${x.label}`)} labelTitle="Неделя" series={[{ name: 'Поводок', color: 'var(--c-leash)', values: wLeash.map((x) => x.value), n: wLeash.map((x) => x.n) }]} yMax={100} caption="Поводок по неделям" />}
        {daily && noDataDays > 0 && <p className="mt-1 text-[0.8rem] text-ink-3">Дней без данных: {noDataDays} — на графике это разрывы, а не ноль.</p>}
        {daily && leash.some((x) => x.extra !== null && x.extra !== undefined) && (
          <>
            <p className="mt-5 text-[0.9rem] text-ink-2">Натяжения за тренировку (если отмечались)</p>
            <LineChart labels={leash.map((x) => x.label)} tooltipLabels={dayLabels(leash)} unit="" series={[{ name: 'Натяжения', color: 'var(--c-leash)', values: leash.map((x) => x.extra ?? null) }]} caption="Среднее число натяжений по дням" />
          </>
        )}
      </section>

      <SectionTitle>Реакция на собак и людей</SectionTitle>
      <section className="card p-4">
        <p className="text-[0.9rem] text-ink-2">Спокойные наблюдения и реакции · {fmtPct(k.byProblem.distractions.rate)} успешных по направлению</p>
        {daily
          ? <BarChart labels={reactions.map((x) => x.label)} tooltipLabels={reactions.map((x) => fmtDay(x.date))} stacked series={[
              { name: 'Спокойно', color: 'var(--c-distr)', values: reactions.map((x) => x.calm) },
              { name: 'С реакцией', color: 'var(--c-bad)', values: reactions.map((x) => x.reactions) },
            ]} caption="Наблюдения по дням: спокойные и с реакцией" />
          : <LineChart labels={wObs.map((x) => x.label)} tooltipLabels={wObs.map((x) => `Неделя ${x.label}`)} labelTitle="Неделя" series={[{ name: 'Спокойные наблюдения', color: 'var(--c-distr)', values: wObs.map((x) => x.value), n: wObs.map((x) => x.n) }]} yMax={100} caption="Спокойные наблюдения по неделям" />}
        <h3 className="mt-5 text-[0.9rem] font-semibold">Дистанция до раздражителя</h3>
        <table className="mt-2 w-full text-left text-[0.9rem]">
          <thead><tr className="text-ink-2"><th className="py-1 font-medium">Дистанция</th><th className="py-1 font-medium">Спокойно</th><th className="py-1 font-medium">Собаки / люди</th></tr></thead>
          <tbody>
            {dist.map((b) => (
              <tr key={b.label} className="border-t border-line">
                <td className="py-1.5">{b.label}</td>
                <td className="num py-1.5">{b.n ? `${Math.round((b.rate ?? 0) * 100)}% (${b.calm} из ${b.n})` : '—'}</td>
                <td className="num py-1.5 text-ink-2">{b.n ? `${b.dogs} / ${b.people}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <SectionTitle>Подбор с земли</SectionTitle>
      <section className="card p-4">
        <p className="text-[0.9rem] text-ink-2">Успешные отказы по неделям курса · подпись в подсказке — средний уровень</p>
        <BarChart labels={wPickup.map((x) => x.label)} tooltipLabels={wPickup.map((x) => `Неделя ${x.label}${x.extra ? ` · ср. уровень ${String(x.extra).replace('.', ',')}` : ''}${x.n ? ` · ${x.n} попыт.` : ''}`)} labelTitle="Неделя"
          series={[{ name: 'Отказы', color: 'var(--c-pickup)', values: wPickup.map((x) => x.value) }]} unit="%" yMax={100} caption="Доля успешных отказов от подбора по неделям" />
        {daily && pickupDaily.some((x) => x.value !== null) && (
          <p className="mt-2 text-[0.85rem] text-ink-2">За выбранный период: {fmtPct(k.byProblem.pickup.rate)} на {k.byProblem.pickup.evaluated} попытках.</p>
        )}
      </section>

      <SectionTitle>Общий прогресс</SectionTitle>
      <section className="card p-4">
        <p className="text-[0.9rem] text-ink-2">Доля успешных попыток по трём направлениям, по неделям курса</p>
        <LineChart labels={wLeash.map((x) => x.label)} tooltipLabels={wLeash.map((x) => `Неделя ${x.label}`)} labelTitle="Неделя" yMax={100} caption="Динамика трёх направлений по неделям"
          series={[
            { name: 'Поводок', color: 'var(--c-leash)', values: wLeash.map((x) => x.value), n: wLeash.map((x) => x.n) },
            { name: 'Отвлечения', color: 'var(--c-distr)', values: wDistr.map((x) => x.value), n: wDistr.map((x) => x.n) },
            { name: 'Подбор', color: 'var(--c-pickup)', values: wPickup.map((x) => x.value), n: wPickup.map((x) => x.n) },
          ]} />
        {usedLevels.length > 0 && (
          <>
            <h3 className="mt-5 text-[0.9rem] font-semibold">Уровни навыков</h3>
            <ul className="mt-2 space-y-2">
              {usedLevels.sort((a, b) => a.e.title.localeCompare(b.e.title, 'ru')).map(({ e, lvl }) => (
                <li key={e.id}>
                  <button type="button" onClick={() => navigate(`exercises/${e.id}`)} className="press w-full text-left">
                    <div className="flex items-baseline justify-between gap-2 text-[0.92rem]"><span>{e.title}</span><span className="num text-ink-2">{lvl} из {maxLevel(e)}</span></div>
                    <div className="mt-1 flex gap-1" aria-hidden>
                      {e.levels.map((l) => <span key={l.n} className="h-1.5 flex-1 rounded-full" style={{ background: l.n <= lvl ? PROBLEM_COLOR[e.problem] : 'var(--surface-2)' }} />)}
                    </div>
                    <span className="sr-only">{levelOf(e, lvl).title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <SectionTitle>Успех в разных условиях</SectionTitle>
      <section className="card overflow-x-auto p-4">
        <table className="w-full min-w-[20rem] text-left text-[0.88rem]">
          <thead><tr className="text-ink-2"><th className="py-1 font-medium" />{([1, 2, 3, 4] as const).map((e) => <th key={e} className="px-1 py-1 font-medium">{ENV_LABEL[e]}</th>)}</tr></thead>
          <tbody>
            {cond.map((row) => (
              <tr key={row.problem} className="border-t border-line">
                <td className="py-2 pr-2 font-medium">{{ leash: 'Поводок', distractions: 'Отвлечения', pickup: 'Подбор' }[row.problem]}</td>
                {row.cells.map((c) => <td key={c.env} className="num px-1 py-2">{c.rate === null ? <span className="text-ink-3">—</span> : <>{Math.round(c.rate * 100)}%<span className="block text-[0.75rem] text-ink-3">{c.evaluated} попыт.</span></>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[0.8rem] text-ink-3">Сравнивайте результаты внутри одного столбца: успех дома и на людной улице — разные навыки.</p>
      </section>

      <SectionTitle>Недельный отчёт</SectionTitle>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((w) => <Chip key={w} active={week === w} onClick={() => setWeek(w)} className="shrink-0"><span className="num">Неделя {w}</span></Chip>)}
      </div>
      <section className="card mt-2 p-4">
        {report ? (
          <>
            <p className="font-semibold">{report.title}</p>
            <p className="text-[0.85rem] text-ink-2">{fmtDay(report.period.from)} – {fmtDay(report.period.to)}</p>
            <ul className="mt-3 space-y-1.5">{report.conclusions.map((c) => <li key={c} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />{c}</li>)}</ul>
            <Button variant="primary" full className="mt-4" onClick={() => navigate(`report/${week}`)} icon={<LuBot size={18} aria-hidden />}>Сформировать отчёт для ИИ</Button>
          </>
        ) : <p className="text-ink-2">Неделя ещё не создана в программе.</p>}
      </section>
    </Page>
  );
}
