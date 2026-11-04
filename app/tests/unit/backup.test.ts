import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blobToDataUrl, dataUrlToBlob, validateBackup, BACKUP_FORMAT } from '../../src/domain/backup';
import { buildCsv, buildIcs } from '../../src/domain/exporters';
import { createProgram } from '../../src/domain/schedule';
import { result } from './helpers';

const sections = { settings: [{ id: 'app' }], dogs: [{ id: 'd', name: 'Луна' }], programs: [{ id: 'p', startDate: '2026-11-09' }], days: [], sessions: [], trainings: [{ id: 't', status: 'completed' }], results: [{ id: 'r' }], attempts: [], levels: [], levelChanges: [], journal: [] };
const valid = { app: 'aussie-trainer', format: 1, schemaVersion: 1, appVersion: '1.0.0', exportedAt: '2026-11-04T10:00:00Z', data: sections, photos: [] };

test('корректная копия проходит проверку и даёт предпросмотр', () => {
  const v = validateBackup(valid, 1);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.preview.dogName, 'Луна');
  assert.equal(v.preview.trainings, 1);
  assert.equal(v.preview.results, 1);
  assert.deepEqual(v.backup.data.customExercises, []);
});

test('чужой файл, новый формат, повреждённые разделы отклоняются с понятной причиной', () => {
  const cases: [unknown, RegExp][] = [
    [null, /JSON-объект/],
    [{ ...valid, app: 'other' }, /другого приложения/],
    [{ ...valid, format: BACKUP_FORMAT + 1 }, /более новой версией приложения/],
    [{ ...valid, schemaVersion: 99 }, /более новой версией базы/],
    [{ ...valid, data: { ...sections, dogs: undefined } }, /обязательного раздела «dogs»/],
    [{ ...valid, data: { ...sections, results: {} } }, /ожидался список/],
    [{ ...valid, data: { ...sections, journal: [{ text: 'без id' }] } }, /нет идентификатора/],
  ];
  for (const [raw, re] of cases) {
    const v = validateBackup(raw, 1);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.error, re);
  }
});

test('фото: Blob ↔ data URL без потерь', async () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
  const url = await blobToDataUrl(new Blob([bytes], { type: 'image/jpeg' }));
  assert.match(url, /^data:image\/jpeg;base64,/);
  const back = new Uint8Array(await dataUrlToBlob(url).arrayBuffer());
  assert.deepEqual([...back], [...bytes]);
});

test('ICS: события только для запланированных занятий в выбранные дни, с напоминанием', () => {
  const b = createProgram('dog', '2026-11-09', 0, 'p');
  const ics = buildIcs(b.sessions, { morning: '08:00', evening: '19:30', trainingDays: [1, 2, 3, 4, 5, 6], from: '2026-11-09', now: new Date('2026-11-04T10:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  const events = ics.match(/BEGIN:VEVENT/g)!.length;
  assert.equal(events, 6 * 12 * 2 - 0, '72 тренировочных дня × 2 занятия');
  assert.match(ics, /DTSTART:20261109T080000/);
  assert.match(ics, /DTSTART:20261109T193000/);
  assert.match(ics, /BEGIN:VALARM/);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75), 'строки сложены по RFC 5545');
});

test('CSV: BOM, разделитель «;», экранирование', () => {
  const csv = buildCsv([result({ exerciseId: 'leave-it', successful: 7, unsuccessful: 3, notes: 'Сказал "Да!"; потом ещё' })], []);
  assert.ok(csv.startsWith('﻿'));
  const [head, row] = csv.slice(1).split('\r\n');
  assert.ok(head.startsWith('Дата;'));
  assert.match(row, /Команда «Оставь»/);
  assert.match(row, /;70;/);
  assert.match(row, /"Сказал ""Да!""; потом ещё"/);
});
