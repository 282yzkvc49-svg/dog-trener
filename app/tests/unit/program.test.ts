import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseTemplate, COURSE_DAYS, WEEKS } from '../../src/content/program';
import { EXERCISES } from '../../src/content/exercises';
import { estimateMinutes, ex } from '../../src/domain/plan';

const course = buildCourseTemplate();
const problemsOf = (d: (typeof course)[number]) => new Set(d.sessions.flatMap((s) => s.items.map((i) => ex(i.exerciseId).problem)));

test('курс: 84 дня, 12 недель, каждый седьмой день — отдых', () => {
  assert.equal(course.length, COURSE_DAYS);
  assert.equal(WEEKS.length, 12);
  for (const d of course) {
    assert.equal(d.week, Math.ceil(d.dayNumber / 7));
    assert.equal(d.kind === 'rest', d.dayInWeek === 7, `день ${d.dayNumber}`);
    if (d.kind === 'rest') assert.ok(d.sessions.every((s) => s.items.every((i) => i.optional)), 'в отдых нет обязательных упражнений');
  }
});

test('шаблон детерминирован: две сборки совпадают', () => {
  assert.deepEqual(buildCourseTemplate(), buildCourseTemplate());
});

test('все упражнения плана существуют в библиотеке', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const d of course) for (const s of d.sessions) for (const i of s.items) assert.ok(ids.has(i.exerciseId), `${i.exerciseId} в дне ${d.dayNumber}`);
});

test('библиотека: 20 обязательных упражнений + общее наблюдение, у каждого есть все поля карточки', () => {
  assert.ok(EXERCISES.length >= 20);
  for (const e of EXERCISES) {
    assert.ok(e.title && e.goal && e.steps.length >= 3, e.id);
    assert.ok(e.mistakes.length && e.stressSigns.length && e.successCriterion && e.progression && e.simplify && e.harder, e.id);
    assert.ok(e.levels.length >= 3, `${e.id}: уровни`);
    assert.deepEqual(e.levels.map((l) => l.n), e.levels.map((_, i) => i + 1), `${e.id}: нумерация уровней`);
  }
});

test('недели 1–2 совпадают с подробным планом ТЗ', () => {
  const d1 = course[0];
  assert.equal(d1.title, 'Контакт и диагностика');
  const [m, e] = d1.sessions;
  assert.equal(m.timeOfDay, 'morning');
  assert.deepEqual(m.items.map((i) => [i.exerciseId, i.target]), [['eye-contact', 10]]);
  assert.deepEqual(e.items.map((i) => [i.exerciseId, i.target, i.steps]), [['loose-leash', 3, 5], ['leave-it', 8, undefined]]);
  const d5 = course[4];
  assert.equal(d5.sessions[0].items[0].exerciseId, 'recall');
  assert.ok(d5.sessions[1].items[0].condition, 'день 5: условие перехода на защищённое лакомство');
  const d10 = course[9];
  assert.deepEqual([d10.sessions[0].items[0].exerciseId, d10.sessions[0].items[0].target, d10.sessions[0].items[0].seconds], ['wait', 5, 5]);
  const d3 = course[2];
  const obs = d3.sessions[1].items.find((i) => i.exerciseId === 'observe-triggers')!;
  assert.equal(obs.target, 5);
  assert.equal(obs.upTo, true, 'наблюдения — «до 5», а не обязательные 5');
  assert.equal(course[13].analysis, 'two-weeks');
  assert.equal(course[13].kind, 'rest');
});

test('недели 3–12: шесть содержательных дней, утро и вечер, все три направления каждый день', () => {
  for (let w = 3; w <= 12; w++) {
    const days = course.filter((d) => d.week === w);
    const training = days.filter((d) => d.kind === 'training');
    assert.equal(training.length, 6, `неделя ${w}`);
    for (const d of training) {
      assert.deepEqual(d.sessions.map((s) => s.timeOfDay), ['morning', 'evening'], `день ${d.dayNumber}`);
      const p = problemsOf(d);
      for (const need of ['leash', 'distractions', 'pickup']) assert.ok(p.has(need as never), `день ${d.dayNumber}: нет направления ${need}`);
      const minutes = d.sessions.reduce((a, s) => a + estimateMinutes(s.items), 0);
      assert.ok(minutes >= 12 && minutes <= 28, `день ${d.dayNumber}: ${minutes} мин`);
      assert.ok(d.title && d.goal && d.criteria && d.tip, `день ${d.dayNumber}: описание`);
    }
  }
});

test('шаблон распределения недели соблюдается', () => {
  const w5 = course.filter((d) => d.week === 5);
  assert.match(w5[0].title, /^Диагностика/);
  assert.equal(w5[1].title, 'Поводок и внимание');
  assert.match(w5[2].title, /при отвлечениях$/);
  assert.equal(w5[3].title, 'Подбор и самоконтроль');
  assert.equal(w5[4].title, 'Смешанное закрепление');
  assert.match(w5[5].title, /реальных условиях/);
  assert.equal(w5[6].analysis, 'week');
  assert.equal(course[83].analysis, 'final');
});

test('день 1: целевая длительность близка к 15–20 минутам, вечер дольше утра', () => {
  const [m, e] = course[0].sessions;
  assert.ok(estimateMinutes(m.items) <= estimateMinutes(e.items));
  assert.ok(estimateMinutes(m.items) <= 6);
});
