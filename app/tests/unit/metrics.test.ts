import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adherence, conditionsTable, dailyRate, kpis, rateOf, weekOfDate, weeklyRate, type DataSet } from '../../src/domain/metrics';
import { createProgram } from '../../src/domain/schedule';
import { buildWeekReport, reportJson, reportText } from '../../src/domain/report';
import { defaultDog } from '../../src/db/defaults';
import { summarize, observationOutcome, safetyPrompt } from '../../src/domain/training';
import { result } from './helpers';
import type { Attempt } from '../../src/domain/types';

const START = '2026-11-09';

test('выполнение плана: отдых, «по желанию», будущее и несделанное сегодня не считаются', () => {
  const b = createProgram('dog', START, 0, 'p');
  const s = b.sessions.map((x) => {
    if (x.dayNumber === 1) return { ...x, status: 'done' as const };
    if (x.dayNumber === 2 && x.timeOfDay === 'morning') return { ...x, status: 'partial' as const };
    return x;
  });
  const a = adherence(s, { from: START, to: '2026-11-15' }, '2026-11-11');
  // Дни 1 и 2 прошли (4 занятия), день 3 — сегодня и не начат.
  assert.equal(a.due, 4);
  assert.equal(a.done, 2);
  assert.equal(a.partial, 1);
  assert.equal(a.missed, 1);
  assert.equal(a.pct, 63);
});

test('доля успеха: при сильном стрессе удачные попытки не засчитываются', () => {
  const r = rateOf([result({ exerciseId: 'leave-it', successful: 8, unsuccessful: 2 }), result({ exerciseId: 'leave-it', successful: 10, unsuccessful: 0, stressed: true })]);
  assert.equal(r.evaluated, 20);
  assert.equal(r.successful, 8);
});

test('графики: дни без данных — null, а не ноль', () => {
  const pts = dailyRate([result({ exerciseId: 'loose-leash', successful: 3, unsuccessful: 1, date: '2026-11-10' })], { from: '2026-11-09', to: '2026-11-11' }, () => true);
  assert.deepEqual(pts.map((p) => p.value), [null, 75, null]);
  assert.deepEqual(pts.map((p) => p.n), [0, 4, 0]);
});

test('неделя по дате и недельный ряд', () => {
  const b = createProgram('dog', START, 0, 'p');
  assert.equal(weekOfDate('2026-11-17', b.days), 2);
  const w = weeklyRate([result({ exerciseId: 'leave-it', successful: 4, unsuccessful: 1, date: '2026-11-18', difficultyLevel: 2 })], b.days, () => true);
  assert.equal(w[1].value, 80);
  assert.equal(w[1].extra, 2);
  assert.equal(w[0].value, null);
});

test('успех по обстановке считается раздельно', () => {
  const t = conditionsTable([
    result({ exerciseId: 'loose-leash', successful: 4, unsuccessful: 0, environment: 1 }),
    result({ exerciseId: 'loose-leash', successful: 1, unsuccessful: 3, environment: 3 }),
  ], { from: '2026-11-01', to: '2026-11-30' });
  const leash = t.find((r) => r.problem === 'leash')!;
  assert.equal(leash.cells[0].rate, 1);
  assert.equal(leash.cells[2].rate, 0.25);
  assert.equal(leash.cells[1].rate, null);
});

function dataSet(): DataSet {
  const b = createProgram('dog', START, 0, 'p');
  return {
    days: b.days, sessions: b.sessions.map((s) => (s.week === 1 && s.dayNumber <= 3 ? { ...s, status: 'done' as const } : s)),
    results: [
      result({ exerciseId: 'loose-leash', successful: 6, unsuccessful: 4, date: '2026-11-09', tensions: 3 }),
      result({ exerciseId: 'leave-it', successful: 8, unsuccessful: 2, date: '2026-11-10' }),
      result({ exerciseId: 'observe-triggers', successful: 3, unsuccessful: 1, date: '2026-11-11', distanceToTrigger: 20, switched: 3, strongReactions: 1 }),
    ],
    attempts: [], trainings: [], levels: [], levelChanges: [],
    journal: [{ id: 'j', dogId: 'dog', occurredAt: new Date('2026-11-12T10:00:00').getTime(), location: 'Парк', situation: 'Прошла мимо человека спокойно', trigger: 'Человек', reaction: 'Спокойно', ownerAction: '', outcome: 'good', notes: '', photoIds: [], createdAt: 0, updatedAt: 0 }],
  };
}

test('показатели: переключения, отказы, натяжения', () => {
  const k = kpis(dataSet(), { from: START, to: '2026-11-15' }, '2026-11-16');
  assert.equal(k.switches, 3);
  assert.equal(k.refusals, 8);
  assert.equal(k.avgTensions, 3);
  assert.equal(k.byProblem.pickup.rate, 0.8);
});

test('недельный отчёт для ИИ: все разделы из ТЗ и только фактические данные', () => {
  const d = dataSet();
  const r = buildWeekReport(d, 1, '2026-11-16')!;
  assert.equal(r.plan.due, 12);
  assert.equal(r.plan.done, 6);
  const text = reportText(r, { ...defaultDog(0), name: 'Луна', sex: 'female' }, undefined, d);
  for (const part of ['неделя 1 из 12', 'Выполнение плана', 'Результаты по трём основным проблемам', 'Текущие уровни упражнений', 'Сложности', 'Замеченные изменения поведения', 'Необычные ситуации', 'Рекомендации приложения', 'Текущий план недели 2', 'Запрос', 'Луна']) {
    assert.ok(text.includes(part), `нет раздела «${part}»`);
  }
  assert.match(text, /Прошла мимо человека спокойно/);
  assert.match(text, /Минимальная дистанция со спокойными наблюдениями: около 20 м/);
  const json = reportJson(r, undefined, d);
  assert.equal(json.week, 1);
  assert.equal(json.nextWeekPlan.length, 7);
});

test('пустая неделя: отчёт честно говорит «недостаточно данных»', () => {
  const d = { ...dataSet(), results: [] };
  const r = buildWeekReport(d, 3, '2026-11-30')!;
  assert.ok(r.conclusions.some((c) => c.includes('недостаточно данных')));
});

test('попытки: пересчёт результата, наблюдения и подсказка безопасности', () => {
  const mk = (i: number, outcome: 'success' | 'fail', extra: Partial<Attempt> = {}): Attempt => ({ id: String(i), resultId: 'r', sessionId: 's', exerciseId: 'calm-dogs', index: i, outcome, at: i, ...extra });
  const list = [mk(1, 'success', { distance: 20, switched: true, reactions: ['calm'] }), mk(2, 'fail', { distance: 10, switched: false, reactions: ['bark'] })];
  const s = summarize(list, 'observations');
  assert.deepEqual([s.attempted, s.successful, s.unsuccessful, s.switched, s.strongReactions, s.distanceToTrigger], [2, 1, 1, 1, 1, 10]);
  assert.equal(observationOutcome(['calm'], true), 'success');
  assert.equal(observationOutcome(['tense'], true), 'success');
  assert.equal(observationOutcome(['lunge'], true), 'fail', 'рывок — не успех, даже если переключилась');
  assert.equal(observationOutcome(['calm'], false), 'fail');
  assert.equal(safetyPrompt(list), 'increase-distance');
  assert.equal(safetyPrompt([...list, mk(3, 'fail', { reactions: ['lunge'] })]), 'stop');
  const d = summarize([mk(1, 'success', { seconds: 10 }), mk(2, 'fail', { seconds: 4 })], 'duration');
  assert.equal(d.measuredQuantity, 7);
});
