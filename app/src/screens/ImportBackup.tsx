// Восстановление из резервной копии: проверка структуры → предпросмотр → подтверждение → замена данных.

import { useState } from 'react';
import { clsx } from 'clsx';
import { LuUpload } from 'react-icons/lu';
import { importBackup } from '../db/repo';
import { DB_VERSION } from '../db/idb';
import { validateBackup, type BackupFile, type BackupPreview } from '../domain/backup';
import { fmtDateTime, fmtDay } from '../lib/date';
import { Button, Sheet } from '../ui/kit';
import { navigate } from '../ui/router';
import { confirmDialog, toast, toastError } from '../ui/dialogs';

export function ImportBackup({ className, label = 'Восстановить из копии', hasData }: { className?: string; label?: string; hasData: boolean }) {
  const [pending, setPending] = useState<{ backup: BackupFile; preview: BackupPreview; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const v = validateBackup(raw, DB_VERSION);
      if (!v.ok) { toast(v.error, 'error'); return; }
      setPending({ backup: v.backup, preview: v.preview, warnings: v.warnings });
    } catch {
      toast('Файл не читается как JSON. Выберите файл резервной копии Aussie Trainer.', 'error');
    }
  }

  async function apply() {
    if (!pending) return;
    if (hasData) {
      const ok = await confirmDialog({ title: 'Заменить все данные?', text: 'Текущие данные на этом устройстве будут заменены данными из копии. Если они нужны, сначала сохраните отдельную резервную копию.', confirm: 'Заменить', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await importBackup(pending.backup);
      setPending(null);
      toast('Данные восстановлены из копии');
      navigate('today', { replace: true });
    } catch (e) { toastError(e); }
    setBusy(false);
  }

  return (
    <>
      <label className={clsx('press inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-surface font-semibold ring-1 ring-inset ring-line', className)}>
        <LuUpload size={18} aria-hidden />{label}
        <input type="file" accept="application/json,.json" className="sr-only" data-testid="import-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <Sheet open={!!pending} onClose={() => setPending(null)} title="Восстановить из копии?"
        footer={<Button variant="primary" size="lg" full disabled={busy} onClick={apply}>{hasData ? 'Заменить данные' : 'Восстановить'}</Button>}>
        {pending && (
          <div className="space-y-1 text-[0.95rem]">
            <p><span className="text-ink-2">Создана: </span>{pending.preview.exportedAt ? fmtDateTime(Date.parse(pending.preview.exportedAt)) : 'неизвестно'}{pending.preview.appVersion ? ` · версия ${pending.preview.appVersion}` : ''}</p>
            <p><span className="text-ink-2">Собака: </span>{pending.preview.dogName}</p>
            {pending.preview.startDate && <p><span className="text-ink-2">Старт курса: </span>{fmtDay(pending.preview.startDate)}</p>}
            <p><span className="text-ink-2">Тренировок: </span>{pending.preview.trainings} · результатов упражнений: {pending.preview.results}</p>
            <p><span className="text-ink-2">Записей дневника: </span>{pending.preview.journal} · фото: {pending.preview.photos}</p>
            {pending.preview.customExercises > 0 && <p><span className="text-ink-2">Своих упражнений: </span>{pending.preview.customExercises}</p>}
            {pending.warnings.map((w) => <p key={w} className="text-amber">{w}</p>)}
            {hasData && <p className="pt-2 text-ink-2">Текущие данные на устройстве будут полностью заменены.</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}
