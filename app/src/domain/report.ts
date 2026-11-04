// Недельный отчёт: выводы только из фактических данных. Текст для ChatGPT/Claude и JSON.

import type { DogProfile, ExerciseResult, ISODate, ProgramDay, ScheduledSession, TrainingProgram } from './types';
import { adherence, inPeriod, LEASH_MAIN, OBSERVATION_IDS, PICKUP_REFUSAL, problemOf, rateOf, trainingSeconds, type DataSet, type Period, type Rate } from './metrics';
import { ENV_SHORT, evalResult, isCounted, recommend } from './adaptation';
import { describeItem, ex, levelOf, maxLevel } from './plan';
import { ageText, fmtDay, fmtDateTime, pl } from '../lib/date';
import { WEEKS } from '../content/program';

const PROBLEMS = [
  { key: 'leash' as const, label: 'Поводок', long: 'Тянет поводок' },
  { key: 'distractions' as const, label: 'Отвлечения', long: 'Отвлекается на собак и людей' },
  { key: 'pickup' as const, label: 'Подбор с земли', long: 'Подбирает предметы и еду с земли' },
];

export interface ProblemSummary {
  key: 'leash' | 'distractions' | 'pickup';
  label: string;
  rate: Rate;
  prev: Rate;
  trend: 'up' | 'down' | 'flat' | 'unknown';
  details: string[];
}

export interface WeekReport {
  week: number;
  period: Period;
  title: string;
  goal: string;
  plan: ReturnType<typeof adherence>;
  trainings: number;
  minutes: number;
  problems: ProblemSummary[];
  envShare: string;
  levels: { exerciseId: string; title: string; level: number; max: number; levelTitle: string }[];
  levelChanges: string[];
  difficulties: string[];
  behaviorChanges: string[];
  unusual: string[];
  recommendations: { title: string; text: string }[];
  conclusions: string[];
}

export function weekPeriod(week: number, days: ProgramDay[]): Period | null {
  const list = days.filter((d) => d.week === week).map((d) => d.date).sort();
  if (!list.length) return null;
  return { from: list[0], to: list[list.length - 1] };
}

const pctText = (r: Rate) => (r.rate === null ? 'нет данных' : `${Math.round(r.rate * 100)}%`);
const MIN_N = 5;

function trendOf(cur: Rate, prev: Rate): ProblemSummary['trend'] {
  if (cur.rate === null || prev.rate === null || cur.evaluated < MIN_N || prev.evaluated < MIN_N) return 'unknown';
  const d = cur.rate - prev.rate;
  if (d >= 0.1) return 'up';
  if (d <= -0.1) return 'down';
  return 'flat';
}

export function buildWeekReport(d: DataSet, week: number, todayISO: ISODate): WeekReport | null {
  const period = weekPeriod(week, d.days);
  if (!period) return null;
  const prevPeriod = weekPeriod(week - 1, d.days);
  const info = WEEKS[week - 1];
  const res = d.results.filter((r) => inPeriod(r.date, period) && isCounted(r));
  const prevRes = prevPeriod ? d.results.filter((r) => inPeriod(r.date, prevPeriod) && isCounted(r)) : [];
  const trainings = d.trainings.filter((t) => t.status === 'completed' && inPeriod(t.date, period));
  const plan = adherence(d.sessions.filter((s) => s.week === week), period, todayISO);

  const problems: ProblemSummary[] = PROBLEMS.map(({ key, label }) => {
    const cur = res.filter((r) => problemOf(r.exerciseId) === key);
    const prv = prevRes.filter((r) => problemOf(r.exerciseId) === key);
    const rate = rateOf(cur), prev = rateOf(prv);
    const details: string[] = [];
    if (key === 'leash') {
      const leash = cur.filter((r) => r.exerciseId === LEASH_MAIN);
      const lr = rateOf(leash);
      if (lr.evaluated) details.push(`Свободный поводок: ${pctText(lr)} отрезков без натяжения (${pl(lr.evaluated, ['отрезок', 'отрезка', 'отрезков'])})`);
      const t = leash.filter((r) => typeof r.tensions === 'number');
      if (t.length) details.push(`Среднее число натяжений за тренировку: ${(t.reduce((s, r) => s + (r.tensions ?? 0), 0) / t.length).toFixed(1).replace('.', ',')}`);
    }
    if (key === 'distractions') {
      const o = cur.filter((r) => OBSERVATION_IDS.has(r.exerciseId));
      const or = rateOf(o);
      if (or.evaluated) details.push(`Спокойные наблюдения: ${pctText(or)} (${pl(or.evaluated, ['наблюдение', 'наблюдения', 'наблюдений'])})`);
      const strong = o.reduce((s, r) => s + (r.strongReactions ?? 0), 0);
      if (o.length) details.push(`Выраженных реакций (лай, рывок, замирание): ${strong}`);
      const calmDist = o.filter((r) => typeof r.distanceToTrigger === 'number' && r.successful > 0).map((r) => r.distanceToTrigger!);
      if (calmDist.length) details.push(`Минимальная дистанция со спокойными наблюдениями: около ${Math.min(...calmDist)} м`);
      const noOpp = o.filter((r) => r.noOpportunity && r.attempted === 0).length;
      if (noOpp) details.push(`Тренировок без подходящих встреч: ${noOpp} (не считаются неудачей)`);
      const sw = o.reduce((s, r) => s + (r.switched ?? 0), 0);
      if (o.length) details.push(`Добровольных переключений на хозяина: ${sw}`);
    }
    if (key === 'pickup') {
      const p = cur.filter((r) => PICKUP_REFUSAL.has(r.exerciseId));
      const pr = rateOf(p);
      if (pr.evaluated) details.push(`Успешные отказы: ${pctText(pr)} (${pl(pr.evaluated, ['попытка', 'попытки', 'попыток'])})`);
      const lv = p.length ? Math.max(...p.map((r) => r.difficultyLevel)) : 0;
      if (lv) details.push(`Максимальный уровень за неделю: ${lv}`);
    }
    return { key, label, rate, prev, trend: trendOf(rate, prev), details };
  });

  const envCount = new Map<number, number>();
  for (const t of trainings) envCount.set(t.environment, (envCount.get(t.environment) ?? 0) + 1);
  const envShare = [...envCount.entries()].sort((a, b) => a[0] - b[0]).map(([e, n]) => `${ENV_SHORT[e as 1]} — ${n}`).join(', ');

  const usedIds = [...new Set(d.results.filter((r) => isCounted(r) && r.date <= period.to).map((r) => r.exerciseId))];
  const levels = usedIds.map((id) => {
    const e = ex(id);
    const level = d.levels.find((l) => l.exerciseId === id)?.level ?? 1;
    return { exerciseId: id, title: e.title, level, max: maxLevel(e), levelTitle: levelOf(e, level).title };
  }).sort((a, b) => a.title.localeCompare(b.title, 'ru'));

  const fromTs = new Date(period.from + 'T00:00:00').getTime(), toTs = new Date(period.to + 'T23:59:59').getTime();
  const levelChanges = d.levelChanges.filter((c) => c.at >= fromTs && c.at <= toTs)
    .map((c) => `${ex(c.exerciseId).title}: уровень ${c.from} → ${c.to}${c.manual ? ' (вручную)' : ''}`);

  const difficulties: string[] = [];
  const byEx = new Map<string, ExerciseResult[]>();
  for (const r of res) (byEx.get(r.exerciseId) ?? byEx.set(r.exerciseId, []).get(r.exerciseId)!).push(r);
  for (const [id, list] of byEx) {
    const rt = rateOf(list);
    if (rt.rate !== null && rt.evaluated >= MIN_N && rt.rate < 0.7) difficulties.push(`${ex(id).title}: ${pctText(rt)} (${rt.evaluated} попыток) — ниже 70%`);
  }
  const stressed = res.filter((r) => evalResult(r).stressed);
  if (stressed.length) difficulties.push(`Упражнений с сильным возбуждением: ${stressed.length} (${[...new Set(stressed.map((r) => ex(r.exerciseId).title))].join(', ')})`);
  const tired = trainings.filter((t) => t.mood === 'tired').length;
  if (tired) difficulties.push(`Тренировок, где собака устала или потеряла интерес: ${tired}`);
  const skippedItems = d.results.filter((r) => inPeriod(r.date, period) && r.skipped);
  if (skippedItems.length) difficulties.push(`Пропущено упражнений внутри тренировок: ${skippedItems.length}`);

  const journal = d.journal.filter((j) => inPeriod(toLocalISO(j.occurredAt), period)).sort((a, b) => a.occurredAt - b.occurredAt);
  const behaviorChanges = journal.filter((j) => j.outcome === 'good').map((j) => `${fmtDateTime(j.occurredAt)} — ${journalLine(j)}`);
  const unusual = journal.filter((j) => j.outcome === 'bad').map((j) => `${fmtDateTime(j.occurredAt)} — ${journalLine(j)}`);
  for (const t of trainings) if (t.notes?.trim()) unusual.push(`Заметка к тренировке ${fmtDay(t.date)}: ${t.notes.trim()}`);

  const recommendations = levels.map((l) => {
    const e = ex(l.exerciseId);
    const rec = recommend(e, l.level, d.results.filter((r) => r.exerciseId === l.exerciseId && r.date <= period.to));
    return { title: e.title, text: `${rec.title}. ${rec.text}`, kind: rec.kind };
  }).filter((r) => r.kind !== 'no-data').map(({ title, text }) => ({ title, text }));

  const conclusions: string[] = [];
  if (plan.due) conclusions.push(`План выполнен на ${plan.pct}%: ${plan.done} из ${plan.due} обязательных занятий${plan.partial ? `, частично — ${plan.partial}` : ''}.`);
  else conclusions.push('Обязательных занятий в этой неделе ещё не наступило.');
  if (plan.missed + plan.skipped >= 3) conclusions.push('Пропусков три и больше — возможно, план недели стоит облегчить или перенести тренировки на удобное время.');
  for (const p of problems) {
    if (p.rate.evaluated < MIN_N) { conclusions.push(`${p.label}: недостаточно данных для вывода (${p.rate.evaluated} попыток).`); continue; }
    const t = p.trend === 'up' ? `лучше прошлой недели (${pctText(p.prev)})` : p.trend === 'down' ? `ниже прошлой недели (${pctText(p.prev)})` : p.trend === 'flat' ? `на уровне прошлой недели (${pctText(p.prev)})` : 'сравнивать пока не с чем';
    conclusions.push(`${p.label}: ${pctText(p.rate)} на ${p.rate.evaluated} попытках, ${t}.`);
  }
  if (levelChanges.length) conclusions.push(`Изменения уровней: ${levelChanges.length}.`);
  if (stressed.length >= 2) conclusions.push('Несколько упражнений прошли при сильном возбуждении — стоит увеличить дистанцию до раздражителей и сократить тренировки.');

  return {
    week, period, title: info?.title ?? `Неделя ${week}`, goal: info?.goal ?? '', plan,
    trainings: trainings.length, minutes: Math.round(trainings.reduce((s, t) => s + trainingSeconds(t), 0) / 60),
    problems, envShare, levels, levelChanges, difficulties, behaviorChanges, unusual, recommendations, conclusions,
  };
}

function toLocalISO(ts: number): ISODate {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function journalLine(j: { situation: string; trigger: string; reaction: string; ownerAction: string; notes: string; location: string }) {
  return [j.situation, j.trigger && `раздражитель: ${j.trigger}`, j.reaction && `реакция: ${j.reaction}`, j.ownerAction && `действия хозяина: ${j.ownerAction}`, j.location && `место: ${j.location}`, j.notes]
    .filter(Boolean).join('; ');
}

function planLines(week: number, days: ProgramDay[], sessions: ScheduledSession[]): string[] {
  const out: string[] = [];
  for (const day of days.filter((d) => d.week === week).sort((a, b) => a.dayNumber - b.dayNumber)) {
    const ss = sessions.filter((s) => s.dayNumber === day.dayNumber && s.status !== 'rest').sort((a, b) => (a.timeOfDay === b.timeOfDay ? 0 : a.timeOfDay === 'morning' ? -1 : 1));
    const body = ss.length
      ? ss.map((s) => `${s.timeOfDay === 'morning' ? 'утро' : 'вечер'}: ${s.items.map((i) => `${ex(i.exerciseId).title} — ${describeItem(i)}`).join(', ')}`).join('; ')
      : (day.restNote ?? 'отдых');
    out.push(`День ${day.dayNumber} (${fmtDay(day.date)}), «${day.title}»: ${body}`);
  }
  return out;
}

export function reportText(r: WeekReport, dog: DogProfile | undefined, program: TrainingProgram | undefined, d: DataSet): string {
  const L: string[] = [];
  const age = dog ? ageText(dog.dateOfBirth, dog.approxAge) : '';
  L.push(`Отчёт Aussie Trainer — неделя ${r.week} из 12 (${fmtDay(r.period.from)} – ${fmtDay(r.period.to)})`);
  if (dog) {
    L.push(`Собака: ${dog.name || 'без имени'}, ${dog.breed}${dog.sex ? (dog.sex === 'female' ? ', девочка' : ', мальчик') : ''}${age ? `, ${age}` : ''}.`);
    if (dog.knownCommands.length) L.push(`Знает команды: ${dog.knownCommands.join(', ')}.`);
    if (dog.notes.trim()) L.push(`Особенности: ${dog.notes.trim()}`);
  }
  L.push(`Тема недели: «${r.title}». ${r.goal}`);
  L.push('');
  L.push('1. Выполнение плана');
  L.push(`Запланировано обязательных занятий: ${r.plan.due}. Выполнено полностью: ${r.plan.done}, частично: ${r.plan.partial}, пропущено: ${r.plan.missed + r.plan.skipped}.`);
  L.push(`Проведено тренировок: ${r.trainings}, общее время упражнений: ${r.minutes} мин.${r.envShare ? ` Обстановка: ${r.envShare}.` : ''}`);
  L.push('');
  L.push('2. Результаты по трём основным проблемам');
  for (const p of r.problems) {
    const long = PROBLEMS.find((x) => x.key === p.key)!.long;
    L.push(`${p.label} («${long}»): ${pctText(p.rate)} успешных попыток (${p.rate.evaluated}); прошлая неделя: ${pctText(p.prev)} (${p.prev.evaluated}).`);
    for (const det of p.details) L.push(`  – ${det}`);
  }
  L.push('');
  L.push('3. Текущие уровни упражнений');
  if (r.levels.length) for (const l of r.levels) L.push(`– ${l.title}: уровень ${l.level} из ${l.max} («${l.levelTitle}»)`);
  else L.push('– пока нет данных');
  if (r.levelChanges.length) L.push(`Изменения уровней за неделю: ${r.levelChanges.join('; ')}.`);
  L.push('');
  L.push('4. Сложности');
  L.push(...(r.difficulties.length ? r.difficulties.map((x) => `– ${x}`) : ['– явных сложностей по данным нет']));
  L.push('');
  L.push('5. Замеченные изменения поведения (из дневника)');
  L.push(...(r.behaviorChanges.length ? r.behaviorChanges.map((x) => `– ${x}`) : ['– записей нет']));
  L.push('');
  L.push('6. Необычные ситуации');
  L.push(...(r.unusual.length ? r.unusual.map((x) => `– ${x}`) : ['– не отмечено']));
  L.push('');
  L.push('7. Рекомендации приложения');
  L.push(...(r.recommendations.length ? r.recommendations.map((x) => `– ${x.title}: ${x.text}`) : ['– пока нет']));
  L.push('');
  L.push('8. Выводы по данным');
  L.push(...r.conclusions.map((x) => `– ${x}`));
  const nextWeek = r.week + 1;
  if (nextWeek <= 12) {
    L.push('');
    L.push(`9. Текущий план недели ${nextWeek}`);
    L.push(...planLines(nextWeek, d.days, d.sessions).map((x) => `– ${x}`));
    const note = program?.settings.weekNotes[String(nextWeek)];
    if (note) L.push(`Мои заметки к неделе ${nextWeek}: ${note}`);
  }
  L.push('');
  L.push('Запрос');
  L.push(nextWeek <= 12
    ? `Проанализируй, пожалуйста, эти данные и предложи корректировку плана на неделю ${nextWeek}: что оставить на текущем уровне, что упростить и где можно аккуратно усложнить один параметр (дистанцию, длительность или отвлечения). Ответь списком изменений по дням: какое упражнение, сколько повторений.`
    : 'Проанализируй, пожалуйста, итоги 12 недель и предложи план поддерживающих тренировок на следующий месяц: какие упражнения оставить, с какой частотой и на каком уровне.');
  L.push('Ограничения: только положительное подкрепление, без рывков, строгих и электроошейников, без принудительного приближения к раздражителям, 15–20 минут упражнений в день, 6 дней активности и 1 день отдыха, подзыв на улице — только на длинном поводке со шлейкой.');
  return L.join('\n');
}

export function reportJson(r: WeekReport, dog: DogProfile | undefined, d: DataSet) {
  return {
    app: 'aussie-trainer', kind: 'weekly-report', format: 1, generatedAt: new Date().toISOString(),
    dog: dog ? { name: dog.name, breed: dog.breed, sex: dog.sex, dateOfBirth: dog.dateOfBirth, approxAge: dog.approxAge, knownCommands: dog.knownCommands } : null,
    week: r.week, period: r.period, theme: r.title, goal: r.goal,
    plan: r.plan, trainings: r.trainings, minutes: r.minutes,
    problems: r.problems.map((p) => ({ key: p.key, label: p.label, rate: p.rate.rate, attempts: p.rate.evaluated, prevRate: p.prev.rate, prevAttempts: p.prev.evaluated, trend: p.trend, details: p.details })),
    levels: r.levels, levelChanges: r.levelChanges, difficulties: r.difficulties,
    journal: { positive: r.behaviorChanges, unusual: r.unusual },
    recommendations: r.recommendations, conclusions: r.conclusions,
    nextWeekPlan: r.week < 12 ? planLines(r.week + 1, d.days, d.sessions) : [],
  };
}
