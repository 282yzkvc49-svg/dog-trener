// Операции приложения над хранилищем. Каждая запись сохраняется сразу (автосохранение).

import * as db from './idb';
import { getState } from './store';
import { DEFAULT_SETTINGS } from './defaults';
import type {
  AppSettings, Attempt, DogProfile, Environment, Exercise, ExerciseResult, ISODate, JournalEntry, LevelChange,
  Mood, PlanItem, ProgramDay, ScheduledSession, SkillLevel, TimeOfDay, TrainingProgram, TrainingSession,
} from '../domain/types';
import { createProgram, statusFromResults, type ProgramBundle } from '../domain/schedule';
import { summarize } from '../domain/training';
import { ex } from '../domain/plan';
import { BACKUP_APP, BACKUP_FORMAT, blobToDataUrl, dataUrlToBlob, type BackupFile } from '../domain/backup';
import { uid } from '../lib/util';
import { today } from '../lib/date';

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// ---------- Настройки, профиль ----------
export async function saveSettings(patch: Partial<AppSettings>) {
  const cur = getState().settings ?? DEFAULT_SETTINGS;
  const next: AppSettings = { ...DEFAULT_SETTINGS, ...cur, ...patch, id: 'app', updatedAt: Date.now() };
  await db.put('settings', next);
  if (patch.theme) applyTheme(patch.theme);
}

export function applyTheme(theme: AppSettings['theme']) {
  const el = document.documentElement;
  if (theme === 'system') delete el.dataset.theme; else el.dataset.theme = theme;
  try { localStorage.setItem('aussie-trainer:theme', theme); } catch { /* приватный режим */ }
}

export async function saveDog(dog: DogProfile) {
  await db.put('dogs', { ...dog, updatedAt: Date.now() });
}

export async function completeOnboarding(dog: DogProfile, startDate: ISODate, morning: string, evening: string) {
  const bundle = createProgram(dog.id, startDate);
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...getState().settings, morningTrainingTime: morning, eveningTrainingTime: evening, onboarded: true, updatedAt: Date.now() };
  await db.batch([
    { type: 'put', store: 'dogs', value: { ...dog, updatedAt: Date.now() } },
    { type: 'put', store: 'programs', value: bundle.program },
    ...bundle.days.map((value) => ({ type: 'put' as const, store: 'days' as const, value })),
    ...bundle.sessions.map((value) => ({ type: 'put' as const, store: 'sessions' as const, value })),
    { type: 'put', store: 'settings', value: settings },
  ]);
  return bundle.program.id;
}

// ---------- Программа ----------
export async function saveBundle(b: ProgramBundle) {
  await db.batch([
    { type: 'put', store: 'programs', value: { ...b.program, updatedAt: Date.now() } },
    ...b.days.map((value) => ({ type: 'put' as const, store: 'days' as const, value })),
    ...b.sessions.map((value) => ({ type: 'put' as const, store: 'sessions' as const, value })),
  ]);
}

export const putSession = (s: ScheduledSession) => db.put('sessions', { ...s, updatedAt: Date.now() });
export const putSessions = (list: ScheduledSession[]) => db.putMany('sessions', list);
export const deleteSession = (id: string) => db.del('sessions', id);
export const putDay = (d: ProgramDay) => db.put('days', d);
export async function putDayWithSessions(day: ProgramDay, sessions: ScheduledSession[]) {
  await db.batch([{ type: 'put', store: 'days', value: day }, ...sessions.map((value) => ({ type: 'put' as const, store: 'sessions' as const, value }))]);
}
export const putProgram = (p: TrainingProgram) => db.put('programs', { ...p, updatedAt: Date.now() });

export async function saveWeekNote(p: TrainingProgram, week: number, text: string) {
  await putProgram({ ...p, settings: { ...p.settings, weekNotes: { ...p.settings.weekNotes, [String(week)]: text } } });
}

// ---------- Уровни ----------
export function levelFor(dogId: string, exerciseId: string): number {
  return getState().levels.find((l) => l.dogId === dogId && l.exerciseId === exerciseId)?.level ?? 1;
}

export async function setLevel(dogId: string, exerciseId: string, to: number, reason: string, manual: boolean) {
  const from = levelFor(dogId, exerciseId);
  if (from === to) return;
  const level: SkillLevel = { id: `${dogId}:${exerciseId}`, dogId, exerciseId, level: to, updatedAt: Date.now() };
  const change: LevelChange = { id: uid('lvl-'), dogId, exerciseId, from, to, reason, manual, at: Date.now() };
  await db.batch([{ type: 'put', store: 'levels', value: level }, { type: 'put', store: 'levelChanges', value: change }]);
}

// ---------- Тренировка ----------
export interface StartOptions {
  dogId: string;
  scheduled?: ScheduledSession;
  title: string;
  items: PlanItem[];
  environment: Environment;
  timeOfDay?: TimeOfDay;
}

export async function startTraining(o: StartOptions): Promise<string> {
  const now = Date.now();
  const t: TrainingSession = {
    id: uid('trn-'), scheduledSessionId: o.scheduled?.id, programId: o.scheduled?.programId, dogId: o.dogId,
    date: today(), timeOfDay: o.timeOfDay ?? o.scheduled?.timeOfDay, title: o.title,
    items: o.items.map((i) => ({ ...i })), startedAt: now, status: 'active', environment: o.environment,
    notes: '', currentIndex: 0, pausedTotalMs: 0, updatedAt: now,
    trainedBy: getState().settings.ownerName?.trim() || undefined,
  };
  await db.put('trainings', t);
  return t.id;
}

export const resultId = (trainingId: string, itemUid: string) => `${trainingId}:${itemUid}`;

export async function ensureResult(t: TrainingSession, item: PlanItem): Promise<ExerciseResult> {
  const id = resultId(t.id, item.uid);
  const existing = getState().results.find((r) => r.id === id) ?? (await db.get<ExerciseResult>('results', id));
  if (existing) return existing;
  const now = Date.now();
  const r: ExerciseResult = {
    id, sessionId: t.id, dogId: t.dogId, exerciseId: item.exerciseId, itemUid: item.uid, date: t.date,
    difficultyLevel: levelFor(t.dogId, item.exerciseId), environment: t.environment, target: item.target, upTo: item.upTo,
    steps: item.steps, seconds: item.seconds, attempted: 0, successful: 0, unsuccessful: 0, skipped: false,
    distractionLevel: t.environment, stressIndicators: [], stressed: false, status: 'active',
    startedAt: now, durationSeconds: 0, notes: '', pauseBaseMs: t.pausedTotalMs, updatedAt: now,
  };
  await db.put('results', r);
  return r;
}

function exerciseSeconds(r: ExerciseResult, t: TrainingSession, now: number) {
  const paused = Math.max(0, (t.pausedTotalMs || 0) - (r.pauseBaseMs ?? 0));
  return Math.max(0, Math.round((now - r.startedAt - paused) / 1000));
}

function attemptsOf(resultId: string): Attempt[] {
  return getState().attempts.filter((a) => a.resultId === resultId);
}

/** Сохраняет попытку и пересчитывает результат — сразу, после каждой попытки. */
export async function addAttempt(t: TrainingSession, r: ExerciseResult, a: Omit<Attempt, 'id' | 'resultId' | 'sessionId' | 'exerciseId' | 'index' | 'at'>) {
  const prev = attemptsOf(r.id);
  const index = prev.reduce((m, x) => Math.max(m, x.index), 0) + 1;
  const now = Date.now();
  // Случайный суффикс: два телефона, отмечающие одно упражнение без сети, не получат одинаковых id.
  const attempt: Attempt = { ...a, id: `${r.id}:${index}:${uid().slice(0, 6)}`, resultId: r.id, sessionId: t.id, exerciseId: r.exerciseId, index, at: now };
  const sum = summarize([...prev, attempt], ex(r.exerciseId).measurement);
  const next: ExerciseResult = { ...r, ...sum, noOpportunity: false, durationSeconds: exerciseSeconds(r, t, now), updatedAt: now };
  await db.batch([
    { type: 'put', store: 'attempts', value: attempt },
    { type: 'put', store: 'results', value: next },
    { type: 'put', store: 'trainings', value: { ...t, updatedAt: now } },
  ]);
  return next;
}

export async function undoLastAttempt(r: ExerciseResult) {
  const prev = attemptsOf(r.id).sort((a, b) => b.index - a.index);
  if (!prev.length) return r;
  const [last, ...rest] = prev;
  const sum = summarize(rest, ex(r.exerciseId).measurement);
  const next: ExerciseResult = { ...r, ...sum, status: 'active', updatedAt: Date.now() };
  await db.batch([{ type: 'delete', store: 'attempts', key: last.id }, { type: 'put', store: 'results', value: next }]);
  return next;
}

export async function updateResult(r: ExerciseResult, patch: Partial<ExerciseResult>) {
  await db.put('results', { ...r, ...patch, updatedAt: Date.now() });
}

export async function finishExercise(t: TrainingSession, r: ExerciseResult, patch: Partial<ExerciseResult> = {}) {
  const now = Date.now();
  await db.put('results', { ...r, ...patch, status: patch.skipped ? 'skipped' : 'done', finishedAt: now, durationSeconds: exerciseSeconds(r, t, now), updatedAt: now });
}

export async function updateTraining(t: TrainingSession, patch: Partial<TrainingSession>) {
  await db.put('trainings', { ...t, ...patch, updatedAt: Date.now() });
}

export async function pauseTraining(t: TrainingSession) {
  if (t.pausedAt) return;
  await updateTraining(t, { pausedAt: Date.now() });
}

export async function resumeTraining(t: TrainingSession) {
  if (!t.pausedAt) return;
  await updateTraining(t, { pausedAt: undefined, pausedTotalMs: (t.pausedTotalMs || 0) + (Date.now() - t.pausedAt) });
}

/** Завершение тренировки: фиксирует состояние собаки, обновляет статус занятия в плане. */
export async function finishTraining(t: TrainingSession, o: { mood: Mood; notes: string; environment: Environment }) {
  const now = Date.now();
  const pausedTotalMs = (t.pausedTotalMs || 0) + (t.pausedAt ? now - t.pausedAt : 0);
  const results = getState().results.filter((r) => r.sessionId === t.id);
  const ops: db.Op[] = [];
  const kept: ExerciseResult[] = [];
  for (const r of results) {
    if (r.status === 'active' && r.attempted === 0 && !r.noOpportunity) { ops.push({ type: 'delete', store: 'results', key: r.id }); continue; }
    const next: ExerciseResult = {
      ...r,
      status: r.status === 'active' ? 'done' : r.status,
      finishedAt: r.finishedAt ?? now,
      environment: o.environment, distractionLevel: o.environment,
      // Сильное возбуждение: механически выполненные попытки не считаются успешными.
      stressed: o.mood === 'very' ? true : r.stressed,
      updatedAt: now,
    };
    kept.push(next);
    ops.push({ type: 'put', store: 'results', value: next });
  }
  ops.push({ type: 'put', store: 'trainings', value: { ...t, status: 'completed', finishedAt: now, pausedAt: undefined, pausedTotalMs, mood: o.mood, notes: o.notes, environment: o.environment, updatedAt: now } });
  if (t.scheduledSessionId) {
    const s = getState().sessions.find((x) => x.id === t.scheduledSessionId);
    if (s) {
      const status = statusFromResults(s.items, kept);
      const finalStatus = s.status === 'done' && status !== 'done' ? 'done' : status === 'planned' ? (s.status === 'partial' ? 'partial' : 'planned') : status;
      ops.push({ type: 'put', store: 'sessions', value: { ...s, status: finalStatus, lastTrainingId: t.id, updatedAt: now } });
    }
  }
  await db.batch(ops);
}

/** Удаляет незавершённую тренировку вместе с её попытками. */
export async function discardTraining(t: TrainingSession) {
  const st = getState();
  await db.batch([
    ...st.attempts.filter((a) => a.sessionId === t.id).map((a) => ({ type: 'delete' as const, store: 'attempts' as const, key: a.id })),
    ...st.results.filter((r) => r.sessionId === t.id).map((r) => ({ type: 'delete' as const, store: 'results' as const, key: r.id })),
    { type: 'delete', store: 'trainings', key: t.id },
  ]);
}

// ---------- Дневник и фото ----------
export const saveJournal = (j: JournalEntry) => db.put('journal', { ...j, updatedAt: Date.now() });
export async function deleteJournal(j: JournalEntry) {
  await db.batch([{ type: 'delete', store: 'journal', key: j.id }, ...j.photoIds.map((key) => ({ type: 'delete' as const, store: 'photos' as const, key }))]);
}

export async function savePhoto(blob: Blob, width: number, height: number): Promise<string> {
  const id = uid('pho-');
  await db.put('photos', { id, blob, type: blob.type, width, height, size: blob.size, createdAt: Date.now() });
  return id;
}
export const deletePhoto = (id: string) => db.del('photos', id);

const urlCache = new Map<string, string>();
type PhotoFetcher = (id: string) => Promise<Blob | null>;
let photoFetcher: PhotoFetcher | null = null;
/** Облако регистрирует загрузчик: фото, сделанные другим участником, скачиваются при первом показе. */
export function setPhotoFetcher(f: PhotoFetcher | null) { photoFetcher = f; }
const fetching = new Map<string, Promise<Blob | null>>();

export async function photoUrl(id: string): Promise<string | undefined> {
  if (urlCache.has(id)) return urlCache.get(id);
  const p = await db.get<{ blob?: Blob | null }>('photos', id);
  if (!p) return undefined;
  let blob = p.blob ?? null;
  if (!blob && photoFetcher) {
    if (!fetching.has(id)) fetching.set(id, photoFetcher(id).finally(() => setTimeout(() => fetching.delete(id), 30_000)));
    blob = await fetching.get(id)!;
  }
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

// ---------- Пользовательские упражнения ----------
export const saveCustomExercise = (e: Exercise) => db.put('customExercises', { ...e, custom: true, updatedAt: Date.now() });
export const deleteCustomExercise = (id: string) => db.del('customExercises', id);

export const saveReport = (week: number, text: string) => db.put('reports', { id: uid('rep-'), week, createdAt: Date.now(), text });

// ---------- Резервные копии ----------
export async function exportBackup(includePhotos: boolean): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const s of db.BACKUP_STORES) {
    if (s === 'photos') continue;
    data[s] = await db.all(s);
  }
  const photos = [] as BackupFile['photos'];
  if (includePhotos) {
    for (const p of await db.all<{ id: string; blob: Blob; type: string; width: number; height: number; size: number; createdAt: number }>('photos')) {
      photos.push({ id: p.id, type: p.type, width: p.width, height: p.height, size: p.size, createdAt: p.createdAt, dataUrl: await blobToDataUrl(p.blob) });
    }
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, schemaVersion: db.DB_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data, photos };
}

export async function markBackupDone() {
  await saveSettings({ lastBackupAt: Date.now() });
}

/** Полная замена данных копией — одной транзакцией. */
export async function importBackup(b: BackupFile) {
  if (db.isTracking()) {
    throw new Error('Телефон подключён к общей собаке — данные приходят из облака. Чтобы восстановить копию, сначала отключите синхронизацию в настройках.');
  }
  const ops: db.Op[] = db.BACKUP_STORES.map((store) => ({ type: 'clear' as const, store }));
  for (const [store, rows] of Object.entries(b.data)) {
    if (!(db.BACKUP_STORES as string[]).includes(store) || store === 'photos') continue;
    for (const value of rows) ops.push({ type: 'put', store: store as db.StoreName, value });
  }
  for (const p of b.photos) {
    const blob = dataUrlToBlob(p.dataUrl);
    ops.push({ type: 'put', store: 'photos', value: { id: p.id, blob, type: p.type || blob.type, width: p.width, height: p.height, size: blob.size, createdAt: p.createdAt } });
  }
  if (!b.data.settings?.length) ops.push({ type: 'put', store: 'settings', value: { ...DEFAULT_SETTINGS, onboarded: true, updatedAt: Date.now() } });
  urlCache.clear();
  await db.batch(ops);
  const s = (b.data.settings?.[0] as AppSettings | undefined)?.theme;
  if (s) applyTheme(s);
}

export async function wipeAll() {
  urlCache.clear();
  await db.batch(db.STORES.map((store) => ({ type: 'clear' as const, store })));
  try { localStorage.removeItem('aussie-trainer:theme'); } catch { /* нет доступа */ }
  applyTheme('system');
}
