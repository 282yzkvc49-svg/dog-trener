import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { LuPawPrint } from 'react-icons/lu';
import type { DayStatus, DogProfile, SessionStatus } from '../domain/types';
import { photoUrl } from '../db/repo';
import { subscribe } from '../db/idb';

export const STATUS: Record<DayStatus | SessionStatus | 'missed', { label: string; bg: string; fg: string; dot: string }> = {
  done: { label: 'Выполнено', bg: 'bg-sage-soft', fg: 'text-sage', dot: 'var(--sage)' },
  partial: { label: 'Частично', bg: 'bg-amber-soft', fg: 'text-amber', dot: 'var(--amber)' },
  planned: { label: 'Запланировано', bg: 'bg-surface-2', fg: 'text-ink-2', dot: 'var(--ink-3)' },
  today: { label: 'Сегодня', bg: 'bg-merle-soft', fg: 'text-merle', dot: 'var(--merle)' },
  missed: { label: 'Пропущено', bg: 'bg-rose-soft', fg: 'text-rose', dot: 'var(--rose)' },
  skipped: { label: 'Пропущено', bg: 'bg-rose-soft', fg: 'text-rose', dot: 'var(--rose)' },
  rest: { label: 'Отдых', bg: 'bg-copper-soft', fg: 'text-copper', dot: 'var(--copper)' },
  moved: { label: 'Перенесено', bg: 'bg-merle-soft', fg: 'text-merle', dot: 'var(--merle)' },
  paused: { label: 'Пауза', bg: 'bg-surface-2', fg: 'text-ink-3', dot: 'var(--line)' },
};

export function StatusBadge({ status, className }: { status: keyof typeof STATUS; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.78rem] font-semibold', s.bg, s.fg, className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} aria-hidden />{s.label}
    </span>
  );
}

export const PROBLEM_COLOR: Record<string, string> = { leash: 'var(--c-leash)', distractions: 'var(--c-distr)', pickup: 'var(--c-pickup)', general: 'var(--ink-3)' };

/**
 * Адрес фото для показа. Фото другого участника может прийти из облака позже описания —
 * тогда хук попробует снова, как только в базе появятся новые фото.
 */
export function usePhotoUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!id || url) return;
    return subscribe((stores) => { if (stores.has('photos')) setTick((t) => t + 1); });
  }, [id, url]);
  useEffect(() => {
    let alive = true;
    if (id) photoUrl(id).then((u) => alive && setUrl(u)).catch(() => {});
    else setUrl(undefined);
    return () => { alive = false; };
  }, [id, tick]);
  return id ? url : undefined;
}

export function DogAvatar({ dog, size = 44, className }: { dog?: DogProfile; size?: number; className?: string }) {
  const url = usePhotoUrl(dog?.photoId);
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-sage-soft text-sage', className)} style={{ width: size, height: size }}>
      {url ? <img src={url} alt={dog?.name ? `Фото: ${dog.name}` : 'Фото собаки'} className="h-full w-full object-cover" /> : <LuPawPrint size={size * 0.5} aria-hidden />}
    </span>
  );
}

export function PhotoThumb({ id, className, alt }: { id: string; className?: string; alt: string }) {
  const url = usePhotoUrl(id);
  return url ? <img src={url} alt={alt} className={clsx('object-cover', className)} /> : <span className={clsx('block bg-surface-2', className)} />;
}

/** Текущее время, обновляется раз в 30 секунд — для напоминаний внутри приложения. */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    const vis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [intervalMs]);
  return now;
}

/** Тикает раз в секунду, пока смонтирован (таймеры тренировки). */
export function useTick(active = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** Род глагола по полу собаки: «увидела» / «увидел». По умолчанию — женский, как в ТЗ. */
export const g = (dog: DogProfile | undefined, fem: string, masc: string) => (dog?.sex === 'male' ? masc : fem);
