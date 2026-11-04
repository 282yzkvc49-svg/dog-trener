import type { Environment, ExerciseResult } from '../../src/domain/types';

let n = 0;
export function result(p: Partial<ExerciseResult> & { exerciseId: string; successful: number; unsuccessful: number }): ExerciseResult {
  n++;
  const at = p.startedAt ?? 1_700_000_000_000 + n * 60_000;
  return {
    id: p.id ?? `r${n}`, sessionId: p.sessionId ?? `s${n}`, dogId: 'dog', itemUid: 'e1', date: p.date ?? '2026-11-10',
    difficultyLevel: 1, environment: 2 as Environment, target: 10, attempted: p.successful + p.unsuccessful,
    skipped: false, distractionLevel: 2 as Environment, stressIndicators: [], stressed: false, status: 'done',
    startedAt: at, finishedAt: at + 1000, durationSeconds: 60, notes: '', updatedAt: at,
    ...p,
  };
}
