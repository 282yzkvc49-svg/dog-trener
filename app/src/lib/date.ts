import type { ISODate } from '../domain/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Полдень местного времени — так переходы на летнее время не сдвигают дату. */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function today(now: Date = new Date()): ISODate {
  return toISO(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}

/** 0 — воскресенье … 6 — суббота. */
export function weekday(s: ISODate): number {
  return fromISO(s).getDay();
}

export function isValidISO(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(fromISO(s)) === s;
}

/** Ближайший понедельник (сегодня, если сегодня понедельник). */
export function nextMonday(from: ISODate = today()): ISODate {
  const wd = weekday(from);
  const delta = (8 - wd) % 7;
  return addDays(from, delta);
}

export function startOfWeekMonday(s: ISODate): ISODate {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export const weekdayShort = (wd: number) => WD_SHORT[wd];
export const weekdayFull = (wd: number) => WD_FULL[wd];
export const monthName = (m: number) => MONTHS_NOM[m];

/** «4 ноября» */
export function fmtDay(s: ISODate): string {
  const d = fromISO(s);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «среда, 4 ноября» */
export function fmtDayLong(s: ISODate): string {
  return `${WD_FULL[weekday(s)]}, ${fmtDay(s)}`;
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} сек`;
  if (r === 0) return `${m} мин`;
  return `${m} мин ${r} сек`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Минуты от полуночи для 'HH:MM'. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function ageText(dob: ISODate | undefined, approx: string | undefined, ref: ISODate = today()): string {
  if (dob && isValidISO(dob)) {
    const a = fromISO(dob), b = fromISO(ref);
    let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months -= 1;
    if (months < 0) return '';
    const y = Math.floor(months / 12), m = months % 12;
    const parts: string[] = [];
    if (y) parts.push(`${y} ${plural(y, ['год', 'года', 'лет'])}`);
    if (m) parts.push(`${m} ${plural(m, ['месяц', 'месяца', 'месяцев'])}`);
    return parts.join(' ') || 'меньше месяца';
  }
  return approx || '';
}

export function plural(n: number, forms: readonly [string, string, string]): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const pl = (n: number, forms: readonly [string, string, string]) => `${n} ${plural(n, forms)}`;
