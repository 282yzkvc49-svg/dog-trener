import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, sessionAdvice, evalResult } from '../../src/domain/adaptation';
import { ex } from '../../src/domain/plan';
import { result } from './helpers';

const leave = ex('leave-it');
const dogs = ex('calm-dogs');

test('4 из 10 на уровне «Открытая ладонь» → вернуться к закрытому кулаку', () => {
  const r = recommend(leave, 2, [result({ exerciseId: 'leave-it', successful: 4, unsuccessful: 6, difficultyLevel: 2 })]);
  assert.equal(r.kind, 'simplify');
  assert.equal(r.toLevel, 1);
  assert.match(r.text, /Закрытый кулак/);
  assert.match(r.text, /спокойной обстановке/);
});

test('4 из 10 на первом уровне → упрощение условий без понижения уровня', () => {
  const r = recommend(leave, 1, [result({ exerciseId: 'leave-it', successful: 4, unsuccessful: 6 })]);
  assert.equal(r.kind, 'simplify');
  assert.equal(r.toLevel, undefined);
});

test('70–79% → повторить текущий уровень', () => {
  const r = recommend(leave, 1, [result({ exerciseId: 'leave-it', successful: 3, unsuccessful: 1, target: 4 }), result({ exerciseId: 'leave-it', successful: 7, unsuccessful: 3 })]);
  assert.equal(r.kind, 'repeat');
});

test('9 из 10 впервые → успех, но для перехода нужна вторая такая сессия', () => {
  const r = recommend(leave, 1, [result({ exerciseId: 'leave-it', successful: 9, unsuccessful: 1 })]);
  assert.equal(r.kind, 'success');
  assert.equal(r.toLevel, undefined);
  assert.match(r.text, /Открытая ладонь/);
});

test('две сессии от 80% в одной обстановке → предложить следующий уровень', () => {
  const r = recommend(leave, 1, [
    result({ exerciseId: 'leave-it', successful: 8, unsuccessful: 2 }),
    result({ exerciseId: 'leave-it', successful: 9, unsuccessful: 1 }),
  ]);
  assert.equal(r.kind, 'level-up');
  assert.equal(r.toLevel, 2);
  assert.match(r.text, /Хорошо получается/);
});

test('успешные сессии в разной обстановке не сравниваются', () => {
  const r = recommend(leave, 1, [
    result({ exerciseId: 'leave-it', successful: 9, unsuccessful: 1, environment: 1 }),
    result({ exerciseId: 'leave-it', successful: 9, unsuccessful: 1, environment: 3 }),
  ]);
  assert.equal(r.kind, 'success');
});

test('мало оцениваемых попыток → без вывода о переходе', () => {
  const r = recommend(leave, 1, [result({ exerciseId: 'leave-it', successful: 5, unsuccessful: 0, target: 5 })]);
  assert.equal(r.kind, 'insufficient');
});

test('сильный стресс никогда не засчитывается как успех', () => {
  const earlier = result({ exerciseId: 'leave-it', successful: 9, unsuccessful: 1, startedAt: 1000 });
  const stressed = result({ exerciseId: 'leave-it', successful: 10, unsuccessful: 0, stressed: true, startedAt: 2000 });
  assert.equal(recommend(leave, 1, [earlier, stressed]).kind, 'stress');
  // Две сессии от 80%, но последняя со стрессом — переход не предлагается.
  assert.notEqual(recommend(leave, 1, [earlier, stressed]).kind, 'level-up');
});

test('наблюдения: две выраженные реакции → стресс и совет увеличить дистанцию, без приближения', () => {
  const r = recommend(dogs, 1, [result({ exerciseId: 'calm-dogs', successful: 3, unsuccessful: 2, strongReactions: 2, target: 5, upTo: true })]);
  assert.equal(r.kind, 'stress');
  assert.match(r.text, /увеличь дистанцию/);
  assert.match(r.text, /Не подходи ближе/);
});

test('наблюдения: «не было встреч» — не неудача', () => {
  const r = recommend(dogs, 1, [result({ exerciseId: 'calm-dogs', successful: 0, unsuccessful: 0, noOpportunity: true })]);
  assert.equal(r.kind, 'no-opportunity');
  assert.equal(evalResult(result({ exerciseId: 'calm-dogs', successful: 0, unsuccessful: 0, noOpportunity: true })).rate, null);
});

test('наблюдения: 3 спокойных из 3 дважды → переход без требования 10 встреч', () => {
  const r = recommend(dogs, 1, [
    result({ exerciseId: 'calm-dogs', successful: 3, unsuccessful: 0, target: 5, upTo: true }),
    result({ exerciseId: 'calm-dogs', successful: 4, unsuccessful: 0, target: 5, upTo: true }),
  ]);
  assert.equal(r.kind, 'level-up');
  assert.match(r.text, /вернись на прежнюю дистанцию/);
});

test('пропущенные упражнения не учитываются', () => {
  const r = recommend(leave, 1, [result({ exerciseId: 'leave-it', successful: 0, unsuccessful: 0, skipped: true, status: 'skipped' })]);
  assert.equal(r.kind, 'no-data');
});

test('последний уровень освоен → перенос в новые места', () => {
  const max = leave.levels.length;
  const r = recommend(leave, max, [
    result({ exerciseId: 'leave-it', successful: 9, unsuccessful: 1, difficultyLevel: max }),
    result({ exerciseId: 'leave-it', successful: 10, unsuccessful: 0, difficultyLevel: max }),
  ]);
  assert.equal(r.kind, 'mastered');
});

test('совет на следующую тренировку учитывает состояние собаки', () => {
  assert.match(sessionAdvice([], 'very'), /сильно возбуждена/);
  assert.match(sessionAdvice([], 'tired'), /устала/);
  const adv = sessionAdvice([{ title: '«Оставь»', rec: { kind: 'simplify', title: 'Пока не усложняем', text: 'Вернись.' } }], 'calm');
  assert.match(adv, /упрости/);
});
