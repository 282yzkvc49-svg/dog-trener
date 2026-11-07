// Экспорт расписания (ICS) и статистики (CSV).

import type { ExerciseResult, ISODate, ScheduledSession, TrainingSession } from './types';
import { describeItem, ex, sessionMinutes } from './plan';
import { ENV_SHORT } from './adaptation';
import { addDays } from '../lib/date';

const MOOD: Record<string, string> = { calm: 'спокойная', slightly: 'немного возбуждённая', very: 'сильно возбуждённая', tired: 'устала' };

function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Складывание строк ICS по 74 символа (RFC 5545). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
  out.push(rest);
  return out.join('\r\n');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(sessions: ScheduledSession[], opts: { morning: string; evening: string; trainingDays: number[]; from: ISODate; alarmMinutes?: number; now?: Date }): string {
  const now = opts.now ?? new Date();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aussie Trainer//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Aussie Trainer'];
  const list = sessions
    .filter((s) => s.status === 'planned' && !s.optional && s.plannedDate >= opts.from && s.items.length)
    .filter((s) => opts.trainingDays.includes(new Date(s.plannedDate + 'T12:00:00').getDay()))
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || (a.timeOfDay === b.timeOfDay ? 0 : a.timeOfDay === 'morning' ? -1 : 1));
  for (const s of list) {
    const time = (s.timeOfDay === 'morning' ? opts.morning : opts.evening).replace(':', '') + '00';
    const date = s.plannedDate.replace(/-/g, '');
    const mins = sessionMinutes(s);
    const desc = s.items.map((i) => `• ${ex(i.exerciseId).title}: ${describeItem(i)}`).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id.replace(/[^A-Za-z0-9:-]/g, '')}@aussie-trainer`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${date}T${time}`,
      `DURATION:PT${mins}M`,
      fold(`SUMMARY:${icsEscape(`Aussie Trainer: ${s.timeOfDay === 'morning' ? 'утренняя' : 'вечерняя'} тренировка, ${mins} мин`)}`),
      fold(`DESCRIPTION:${icsEscape(desc)}`),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${opts.alarmMinutes ?? 0}M`, fold(`DESCRIPTION:${icsEscape('Пора на тренировку с собакой')}`), 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** Напоминание о недельном отчёте — по дням отдыха. */
export function buildReportReminderIcs(restDates: ISODate[], time: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aussie Trainer//RU', 'METHOD:PUBLISH'];
  for (const d of restDates) {
    lines.push('BEGIN:VEVENT', `UID:report-${d}@aussie-trainer`, `DTSTAMP:${stamp(now)}`, `DTSTART:${d.replace(/-/g, '')}T${time.replace(':', '')}00`, 'DURATION:PT15M',
      fold(`SUMMARY:${icsEscape('Aussie Trainer: недельный отчёт')}`), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV для Excel/Numbers: разделитель «;», BOM для кириллицы. */
export function buildCsv(results: ExerciseResult[], trainings: TrainingSession[]): string {
  const byId = new Map(trainings.map((t) => [t.id, t]));
  const header = ['Дата', 'Время суток', 'Тренировка', 'Упражнение', 'Направление', 'Уровень', 'Обстановка', 'План', 'Попыток', 'Успешно', 'Неудачно', 'Успешность, %', 'Пропущено', 'Не было встреч', 'Натяжения', 'Мин. дистанция, м', 'Сильные реакции', 'Переключения', 'Сильный стресс', 'Состояние собаки', 'Кто проводил', 'Длительность, сек', 'Заметки'];
  const rows = [...results].sort((a, b) => a.startedAt - b.startedAt).map((r) => {
    const t = byId.get(r.sessionId);
    const e = ex(r.exerciseId);
    const ev = r.successful + r.unsuccessful;
    return [
      r.date, t?.timeOfDay === 'morning' ? 'утро' : t?.timeOfDay === 'evening' ? 'вечер' : '', t?.title ?? '', e.title,
      { leash: 'поводок', distractions: 'отвлечения', pickup: 'подбор', general: 'общие' }[e.problem], r.difficultyLevel, ENV_SHORT[r.environment],
      r.target, r.attempted, r.successful, r.unsuccessful, ev ? Math.round((r.successful / ev) * 100) : '',
      r.skipped ? 'да' : '', r.noOpportunity ? 'да' : '', r.tensions ?? '', r.distanceToTrigger ?? '', r.strongReactions ?? '', r.switched ?? '',
      r.stressed ? 'да' : '', t?.mood ? MOOD[t.mood] : '', t?.trainedBy ?? '', r.durationSeconds, r.notes,
    ].map(csvCell).join(';');
  });
  return '\uFEFF' + [header.join(';'), ...rows].join('\r\n') + '\r\n';
}

export function upcomingWindow(from: ISODate, days = 84): { from: ISODate; to: ISODate } {
  return { from, to: addDays(from, days) };
}
