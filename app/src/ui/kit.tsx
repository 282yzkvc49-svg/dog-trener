// Базовые компоненты дизайн-системы Aussie Trainer.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { LuChevronLeft, LuMinus, LuPlus, LuX } from 'react-icons/lu';
import { goBack } from './router';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type BtnSize = 'md' | 'lg' | 'xl' | 'sm';

export function Button(p: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant; size?: BtnSize; className?: string;
  disabled?: boolean; type?: 'button' | 'submit'; icon?: ReactNode; full?: boolean; label?: string;
}) {
  const v = p.variant ?? 'secondary';
  const s = p.size ?? 'md';
  return (
    <button type={p.type ?? 'button'} onClick={p.onClick} disabled={p.disabled} aria-label={p.label}
      className={clsx('press inline-flex items-center justify-center gap-2 font-semibold select-none disabled:opacity-40 disabled:pointer-events-none',
        s === 'sm' && 'min-h-10 rounded-xl px-3 text-[0.9rem]',
        s === 'md' && 'min-h-12 rounded-2xl px-4',
        s === 'lg' && 'min-h-14 rounded-2xl px-5 text-[1.05rem]',
        s === 'xl' && 'min-h-[4.5rem] rounded-3xl px-5 text-[1.15rem]',
        v === 'primary' && 'bg-sage text-sage-ink',
        v === 'secondary' && 'bg-surface text-ink ring-1 ring-line ring-inset',
        v === 'soft' && 'bg-sage-soft text-sage',
        v === 'ghost' && 'text-ink-2',
        v === 'danger' && 'bg-rose-soft text-rose',
        p.full && 'w-full', p.className)}>
      {p.icon}{p.children}
    </button>
  );
}

export function IconButton(p: { label: string; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={p.label} title={p.label} onClick={p.onClick}
      className={clsx('press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2', p.className)}>
      {p.children}
    </button>
  );
}

export function Card(p: { children: ReactNode; className?: string; onClick?: () => void; as?: 'div' | 'section' | 'button'; label?: string }) {
  if (p.onClick) {
    return (
      <button type="button" onClick={p.onClick} aria-label={p.label} className={clsx('card press block w-full text-left', p.className)}>{p.children}</button>
    );
  }
  return <section className={clsx('card', p.className)}>{p.children}</section>;
}

export function Page(p: { title: string; children: ReactNode; back?: string | true; right?: ReactNode; sub?: ReactNode; wide?: boolean }) {
  return (
    <div className="pb-28">
      <header className="safe-top sticky top-0 z-30 bg-paper/90 backdrop-blur-md">
        <div className={clsx('safe-x mx-auto flex min-h-14 items-center gap-1', p.wide ? 'max-w-5xl' : 'max-w-2xl')}>
          {p.back && (
            <IconButton label="Назад" className="-ml-2 text-ink" onClick={() => goBack(typeof p.back === 'string' ? p.back : 'today')}>
              <LuChevronLeft size={26} aria-hidden />
            </IconButton>
          )}
          <div className="min-w-0 flex-1 py-2">
            <h1 className="truncate text-[1.35rem] font-bold tracking-tight">{p.title}</h1>
            {p.sub && <div className="truncate text-[0.85rem] text-ink-2">{p.sub}</div>}
          </div>
          {p.right}
        </div>
      </header>
      <main className={clsx('safe-x mx-auto pt-2', p.wide ? 'max-w-5xl' : 'max-w-2xl')}>{p.children}</main>
    </div>
  );
}

export function SectionTitle(p: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-2 mt-7 flex items-end justify-between gap-3 px-1', p.className)}>
      <h2 className="text-[1.05rem] font-semibold">{p.children}</h2>
      {p.right}
    </div>
  );
}

/** Нижний лист / диалог на <dialog>: фокус и VoiceOver работают из коробки. */
export function Sheet(p: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.open && !d.open) d.showModal();
    if (!p.open && d.open) d.close();
  }, [p.open]);
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={() => p.open && p.onClose()} onCancel={(e: Event) => { e.preventDefault(); p.onClose(); }}
      onClick={(e: { target: unknown; currentTarget: unknown }) => { if (e.target === e.currentTarget) p.onClose(); }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[1.75rem] bg-surface p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:w-[min(36rem,calc(100vw-2rem))] sm:rounded-[1.75rem]">
      {p.open && (
        <div className="anim-sheet flex max-h-[92dvh] flex-col">
          <div className="flex items-center gap-2 px-5 pb-2 pt-4">
            <h2 id={id} className="flex-1 text-[1.15rem] font-semibold">{p.title}</h2>
            <IconButton label="Закрыть" onClick={p.onClose} className="-mr-2 bg-surface-2"><LuX size={20} aria-hidden /></IconButton>
          </div>
          <div className="overflow-y-auto px-5 pb-4">{p.children}</div>
          {p.footer && <div className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{p.footer}</div>}
          {!p.footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
        </div>
      )}
    </dialog>
  );
}

export function Chip(p: { children: ReactNode; active?: boolean; onClick?: () => void; className?: string; tone?: 'sage' | 'merle' | 'copper' | 'rose' }) {
  const tone = p.tone ?? 'sage';
  return (
    <button type="button" aria-pressed={p.active} onClick={p.onClick}
      className={clsx('press min-h-10 rounded-full px-3.5 text-[0.92rem] font-medium ring-1 ring-inset',
        p.active
          ? tone === 'rose' ? 'bg-rose text-white ring-rose' : tone === 'merle' ? 'bg-merle text-white ring-merle' : tone === 'copper' ? 'bg-copper text-white ring-copper' : 'bg-sage text-sage-ink ring-sage'
          : 'bg-surface text-ink ring-line',
        p.className)}>
      {p.children}
    </button>
  );
}

export function Segmented<T extends string>(p: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={p.label} className={clsx('flex gap-1 rounded-2xl bg-surface-2 p-1', p.className)}>
      {p.options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={p.value === o.id} onClick={() => p.onChange(o.id)}
          className={clsx('press min-h-10 flex-1 rounded-xl px-2 text-[0.9rem] font-semibold',
            p.value === o.id ? 'bg-surface text-ink shadow-card' : 'text-ink-2')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper(p: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; suffix?: string }) {
  const min = p.min ?? 0, max = p.max ?? 999, step = p.step ?? 1;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={p.label}>
      <button type="button" aria-label={`Уменьшить: ${p.label}`} onClick={() => p.onChange(Math.max(min, p.value - step))}
        className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface-2"><LuMinus size={18} aria-hidden /></button>
      <span className="num min-w-[3.5rem] text-center text-[1.1rem] font-semibold" aria-live="polite">{p.value}{p.suffix ? ` ${p.suffix}` : ''}</span>
      <button type="button" aria-label={`Увеличить: ${p.label}`} onClick={() => p.onChange(Math.min(max, p.value + step))}
        className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface-2"><LuPlus size={18} aria-hidden /></button>
    </div>
  );
}

export function Field(p: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx('block', p.className)}>
      <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">{p.label}</span>
      {p.children}
      {p.hint && <span className="mt-1 block px-1 text-[0.82rem] text-ink-3">{p.hint}</span>}
    </label>
  );
}

export function Toggle(p: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={p.checked} onClick={() => p.onChange(!p.checked)}
      className="press flex w-full items-center gap-3 py-3 text-left">
      <span className="flex-1">
        <span className="block font-medium">{p.label}</span>
        {p.hint && <span className="block text-[0.85rem] text-ink-2">{p.hint}</span>}
      </span>
      <span className={clsx('relative h-8 w-[3.2rem] shrink-0 rounded-full transition-colors', p.checked ? 'bg-sage' : 'bg-line')}>
        <span className={clsx('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform', p.checked ? 'translate-x-[1.45rem]' : 'translate-x-1')} />
      </span>
    </button>
  );
}

export function ProgressRing(p: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label?: string }) {
  const size = p.size ?? 64, stroke = p.stroke ?? 7;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, p.value));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={p.label ?? `${Math.round(v * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color ?? 'var(--sage)'} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{p.children}</div>
    </div>
  );
}

export function ProgressBar(p: { value: number; color?: string; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, p.value));
  return (
    <div className={clsx('h-2 overflow-hidden rounded-full bg-surface-2', p.className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={p.label}>
      <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: p.color ?? 'var(--sage)', transition: 'width .4s ease' }} />
    </div>
  );
}

export function Empty(p: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      {p.icon && <div className="mb-3 text-sage">{p.icon}</div>}
      <p className="text-[1.05rem] font-semibold">{p.title}</p>
      {p.text && <p className="mt-1 max-w-sm text-ink-2">{p.text}</p>}
      {p.action && <div className="mt-5">{p.action}</div>}
    </div>
  );
}

export function Row(p: { children: ReactNode; className?: string; onClick?: () => void; label?: string }) {
  const cls = clsx('flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left', p.className);
  return p.onClick
    ? <button type="button" onClick={p.onClick} aria-label={p.label} className={clsx(cls, 'press')}>{p.children}</button>
    : <div className={cls}>{p.children}</div>;
}

export function Divider() { return <div className="mx-4 h-px bg-line" />; }
