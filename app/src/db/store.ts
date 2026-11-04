// Состояние приложения в памяти: загружается из IndexedDB и обновляется после каждой записи.
// Объём данных одной собаки за курс невелик (тысячи записей), поэтому держим всё в памяти.

import { useSyncExternalStore } from 'react';
import { all, get, subscribe, type StoreName } from './idb';
import type {
  AppSettings, Attempt, DogProfile, Exercise, ExerciseResult, JournalEntry, LevelChange, ProgramDay,
  SavedReport, ScheduledSession, SkillLevel, TrainingProgram, TrainingSession,
} from '../domain/types';
import { setCustomExercises } from '../domain/plan';
import { DEFAULT_SETTINGS } from './defaults';

export interface AppState {
  loaded: boolean;
  error?: string;
  settings: AppSettings;
  dogs: DogProfile[];
  programs: TrainingProgram[];
  days: ProgramDay[];
  sessions: ScheduledSession[];
  trainings: TrainingSession[];
  results: ExerciseResult[];
  attempts: Attempt[];
  levels: SkillLevel[];
  levelChanges: LevelChange[];
  journal: JournalEntry[];
  customExercises: Exercise[];
  reports: SavedReport[];
}

let state: AppState = {
  loaded: false, settings: DEFAULT_SETTINGS, dogs: [], programs: [], days: [], sessions: [], trainings: [], results: [],
  attempts: [], levels: [], levelChanges: [], journal: [], customExercises: [], reports: [],
};
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

const KEYS: Partial<Record<StoreName, keyof AppState>> = {
  dogs: 'dogs', programs: 'programs', days: 'days', sessions: 'sessions', trainings: 'trainings', results: 'results',
  attempts: 'attempts', levels: 'levels', levelChanges: 'levelChanges', journal: 'journal', customExercises: 'customExercises', reports: 'reports',
};

async function reload(stores?: Set<StoreName>) {
  const next: Partial<AppState> = {};
  const jobs: Promise<void>[] = [];
  for (const [store, key] of Object.entries(KEYS) as [StoreName, keyof AppState][]) {
    if (stores && !stores.has(store)) continue;
    jobs.push(all(store).then((rows) => { (next as Record<string, unknown>)[key] = rows; }));
  }
  if (!stores || stores.has('settings')) {
    jobs.push(get<AppSettings>('settings', 'app').then((s) => { next.settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) }; }));
  }
  await Promise.all(jobs);
  if (next.customExercises) setCustomExercises(next.customExercises as Exercise[]);
  if (next.dogs) (next.dogs as DogProfile[]).sort((a, b) => a.createdAt - b.createdAt);
  if (next.programs) (next.programs as TrainingProgram[]).sort((a, b) => b.createdAt - a.createdAt);
  state = { ...state, ...next, loaded: true, error: undefined };
  notify();
}

let started = false;
export function startStore() {
  if (started) return;
  started = true;
  subscribe((changed) => { reload(changed).catch((e) => { state = { ...state, error: String(e?.message ?? e) }; notify(); }); });
  reload().catch((e) => { state = { ...state, loaded: true, error: String(e?.message ?? e) }; notify(); });
}

export const getState = () => state;

export function useApp(): AppState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

/** Текущая собака и программа (первая версия рассчитана на одну собаку). */
export function current(s: AppState) {
  const dog = s.dogs[0];
  const program = dog ? s.programs.find((p) => p.dogId === dog.id) : undefined;
  const days = program ? s.days.filter((d) => d.programId === program.id) : [];
  const sessions = program ? s.sessions.filter((x) => x.programId === program.id) : [];
  return { dog, program, days, sessions };
}
