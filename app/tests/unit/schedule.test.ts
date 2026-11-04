import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDateIndex, changeStartDate, coursePosition, createProgram, dayStatus, effectiveStatus, makeRestDay, moveSession,
  pauseProgram, resumeProgram, skipSession, statusFromResults, undoRestDay, viewForDate,
} from '../../src/domain/schedule';

const START = '2026-11-09'; // понедельник

test('создание программы: даты дней и занятий идут подряд от старта', () => {
  const b = createProgram('dog', START, 0, 'p');
  assert.equal(b.days.length, 84);
  assert.equal(b.days[0].date, START);
  assert.equal(b.days[6].date, '2026-11-15'); // воскресенье — отдых
  assert.equal(b.days[6].kind, 'rest');
  assert.equal(b.days[83].date, '2027-01-31');
  const d1 = b.sessions.filter((s) => s.dayNumber === 1);
  assert.deepEqual(d1.map((s) => s.timeOfDay), ['morning', 'evening']);
  assert.ok(b.sessions.every((s) => s.status === 'planned'));
  assert.ok(b.sessions.filter((s) => s.dayNumber === 14).every((s) => s.optional), 'день 14 — только по желанию');
});

test('статусы дня: сегодня, пропущено, выполнено, частично, отдых', () => {
  const b = createProgram('dog', START, 0, 'p');
  const idx = buildDateIndex(b.days, b.sessions);
  assert.equal(viewForDate(START, idx, START).status, 'today');
  assert.equal(viewForDate(START, idx, '2026-11-11').status, 'missed');
  assert.equal(viewForDate('2026-11-15', idx, '2026-11-20').status, 'rest', 'отдых не считается пропуском');
  const [m, e] = b.sessions.filter((s) => s.dayNumber === 1);
  assert.equal(dayStatus(START, b.days[0], [{ ...m, status: 'done' }, e], [], '2026-11-12'), 'partial');
  assert.equal(dayStatus(START, b.days[0], [{ ...m, status: 'done' }, { ...e, status: 'done' }], [], '2026-11-12'), 'done');
  assert.equal(effectiveStatus(e, '2026-11-12'), 'missed');
});

test('пауза и продолжение: несделанный план сдвигается, долг не копится', () => {
  let b = createProgram('dog', START, 0, 'p');
  b.sessions = b.sessions.map((s) => (s.dayNumber === 1 ? { ...s, status: 'done' as const } : s));
  b = { ...b, program: pauseProgram(b.program, '2026-11-10') };
  assert.equal(b.program.status, 'paused');
  const r = resumeProgram(b, '2026-11-15');
  assert.equal(r.program.status, 'active');
  assert.deepEqual(r.program.pauses, [{ from: '2026-11-10', to: '2026-11-15' }]);
  assert.equal(r.days[0].date, START, 'выполненный день остаётся на своей дате');
  assert.equal(r.days[1].date, '2026-11-15', 'день 2 начинается в день продолжения');
  assert.equal(r.sessions.length, b.sessions.length, 'дополнительные занятия не создаются');
  const day2 = r.sessions.filter((s) => s.dayNumber === 2);
  assert.ok(day2.every((s) => s.plannedDate === '2026-11-15'));
  assert.equal(r.days[83].date, '2027-02-05');
});

test('статус «Пауза» на будущих датах, пока курс на паузе', () => {
  const b = createProgram('dog', START, 0, 'p');
  const p = pauseProgram(b.program, '2026-11-10');
  const idx = buildDateIndex(b.days, b.sessions);
  assert.equal(viewForDate('2026-11-12', idx, '2026-11-10', p).status, 'paused');
});

test('перенос занятия: исходная дата помечается «Перенесено»', () => {
  const b = createProgram('dog', START, 0, 'p');
  const ev = b.sessions.find((s) => s.dayNumber === 2 && s.timeOfDay === 'evening')!;
  const moved = moveSession(ev, '2026-11-12');
  assert.equal(moved.rescheduledFrom, '2026-11-10');
  const sessions = b.sessions.map((s) => (s.id === ev.id ? moved : s));
  const idx = buildDateIndex(b.days, sessions);
  const v10 = viewForDate('2026-11-10', idx, '2026-11-09');
  assert.equal(v10.movedOut.length, 1);
  assert.equal(viewForDate('2026-11-12', idx, '2026-11-09').sessions.filter((s) => s.timeOfDay === 'evening').length, 2);
  const back = moveSession(moved, '2026-11-10');
  assert.equal(back.rescheduledFrom, undefined, 'возврат на исходную дату снимает пометку');
});

test('смена даты старта сдвигает только несделанные занятия', () => {
  const b = createProgram('dog', START, 0, 'p');
  b.sessions = b.sessions.map((s) => (s.dayNumber === 1 && s.timeOfDay === 'morning' ? { ...s, status: 'done' as const } : s));
  const r = changeStartDate(b, '2026-11-16');
  assert.equal(r.program.startDate, '2026-11-16');
  const done = r.sessions.find((s) => s.dayNumber === 1 && s.timeOfDay === 'morning')!;
  assert.equal(done.plannedDate, START, 'история на месте');
  assert.equal(r.sessions.find((s) => s.dayNumber === 2 && s.timeOfDay === 'morning')!.plannedDate, '2026-11-17');
});

test('день отдыха вручную и возврат', () => {
  const b = createProgram('dog', START, 0, 'p');
  const day = b.days[2];
  const ss = b.sessions.filter((s) => s.dayNumber === 3);
  const r = makeRestDay(day, ss);
  assert.ok(r.day.madeRest);
  assert.ok(r.sessions.every((s) => s.status === 'rest'));
  assert.equal(dayStatus(day.date, r.day, r.sessions, [], '2026-11-20'), 'rest', 'не пропуск');
  const u = undoRestDay(r.day, r.sessions);
  assert.ok(u.sessions.every((s) => s.status === 'planned'));
});

test('пропуск с причиной', () => {
  const b = createProgram('dog', START, 0, 'p');
  const s = skipSession(b.sessions[0], 'Собака устала');
  assert.equal(s.status, 'skipped');
  assert.equal(s.skipReason, 'Собака устала');
});

test('статус занятия по результатам: выполнено, частично, «не было встреч»', () => {
  const items = [{ uid: 'e1', exerciseId: 'loose-leash', target: 3, steps: 5 }, { uid: 'e2', exerciseId: 'observe-triggers', target: 5, upTo: true }];
  const done = (u: string, attempted: number, extra = {}) => ({ itemUid: u, status: 'done', skipped: false, attempted, ...extra });
  assert.equal(statusFromResults(items, [done('e1', 3), done('e2', 0, { noOpportunity: true })]), 'done');
  assert.equal(statusFromResults(items, [done('e1', 3), done('e2', 2)]), 'done', '«до 5» — двух наблюдений достаточно');
  assert.equal(statusFromResults(items, [done('e1', 2)]), 'partial');
  assert.equal(statusFromResults(items, []), 'planned');
  assert.equal(statusFromResults(items, [{ itemUid: 'e1', status: 'skipped', skipped: true, attempted: 0 }, done('e2', 1)]), 'partial');
});

test('переход между неделями: позиция в курсе', () => {
  const b = createProgram('dog', START, 0, 'p');
  assert.equal(coursePosition('2026-11-01', b.days).state, 'before');
  assert.equal(coursePosition('2026-11-15', b.days).day!.week, 1);
  assert.equal(coursePosition('2026-11-16', b.days).day!.week, 2);
  assert.equal(coursePosition('2026-11-16', b.days).day!.dayNumber, 8);
  assert.equal(coursePosition('2027-02-01', b.days).state, 'after');
});
