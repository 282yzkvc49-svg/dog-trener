// Формат резервной копии и его проверка. Не зависит от IndexedDB — проверяется модульными тестами.

export const BACKUP_APP = 'aussie-trainer';
/** Версия формата файла резервной копии. */
export const BACKUP_FORMAT = 1;

export interface BackupPhoto { id: string; type: string; width: number; height: number; size: number; createdAt: number; dataUrl: string }

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: Record<string, unknown[]>;
  photos: BackupPhoto[];
}

export interface BackupPreview {
  exportedAt: string;
  appVersion: string;
  dogName: string;
  startDate?: string;
  trainings: number;
  results: number;
  journal: number;
  photos: number;
  customExercises: number;
}

export type ValidationResult =
  | { ok: true; backup: BackupFile; preview: BackupPreview; warnings: string[] }
  | { ok: false; error: string };

const REQUIRED = ['settings', 'dogs', 'programs', 'days', 'sessions', 'trainings', 'results', 'attempts', 'levels', 'levelChanges', 'journal'];
const OPTIONAL = ['customExercises', 'reports'];

/** Проверяет структуру файла и приводит старые форматы к текущему. */
export function validateBackup(raw: unknown, currentSchema: number): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Файл не похож на резервную копию: ожидался JSON-объект.' };
  const o = raw as Record<string, unknown>;
  if (o.app !== BACKUP_APP) return { ok: false, error: 'Это резервная копия другого приложения или другой файл.' };
  const format = Number(o.format);
  if (!Number.isInteger(format) || format < 1) return { ok: false, error: 'Не указана версия формата резервной копии.' };
  if (format > BACKUP_FORMAT) return { ok: false, error: 'Копия создана более новой версией приложения. Сначала обновите приложение.' };
  const schema = Number(o.schemaVersion ?? 1);
  if (schema > currentSchema) return { ok: false, error: 'Копия создана более новой версией базы данных. Сначала обновите приложение.' };
  if (!o.data || typeof o.data !== 'object') return { ok: false, error: 'В копии нет раздела с данными.' };
  const data = o.data as Record<string, unknown>;
  const warnings: string[] = [];
  const clean: Record<string, unknown[]> = {};
  for (const key of [...REQUIRED, ...OPTIONAL]) {
    const v = data[key];
    if (v === undefined) {
      if (REQUIRED.includes(key)) return { ok: false, error: `В копии нет обязательного раздела «${key}».` };
      clean[key] = [];
      continue;
    }
    if (!Array.isArray(v)) return { ok: false, error: `Раздел «${key}» повреждён: ожидался список.` };
    const bad = v.findIndex((x) => !x || typeof x !== 'object' || typeof (x as { id?: unknown }).id !== 'string' || !(x as { id: string }).id);
    if (bad >= 0) return { ok: false, error: `Раздел «${key}», запись ${bad + 1}: нет идентификатора.` };
    const ids = new Set(v.map((x) => (x as { id: string }).id));
    if (ids.size !== v.length) warnings.push(`В разделе «${key}» есть повторяющиеся записи — останется последняя.`);
    clean[key] = v;
  }
  const dogs = clean.dogs as { name?: string }[];
  if (!dogs.length) warnings.push('В копии нет профиля собаки.');
  const photos = Array.isArray(o.photos) ? (o.photos as BackupPhoto[]).filter((p) => p && typeof p.id === 'string' && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:')) : [];
  if (Array.isArray(o.photos) && photos.length !== o.photos.length) warnings.push('Часть фотографий повреждена и не будет восстановлена.');

  const backup: BackupFile = migrateBackup({
    app: BACKUP_APP, format, schemaVersion: schema, appVersion: String(o.appVersion ?? ''), exportedAt: String(o.exportedAt ?? ''),
    data: clean, photos,
  });
  const programs = backup.data.programs as { startDate?: string }[];
  return {
    ok: true, backup, warnings,
    preview: {
      exportedAt: backup.exportedAt, appVersion: backup.appVersion,
      dogName: dogs[0]?.name || 'без имени', startDate: programs[0]?.startDate,
      trainings: (backup.data.trainings as { status?: string }[]).filter((t) => t.status === 'completed').length,
      results: backup.data.results.length, journal: backup.data.journal.length, photos: photos.length,
      customExercises: backup.data.customExercises.length,
    },
  };
}

/** Миграции формата резервной копии: format N → N+1. Сейчас формат один. */
export function migrateBackup(b: BackupFile): BackupFile {
  // if (b.format < 2) { ...преобразования...; b.format = 2; }
  return b;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
