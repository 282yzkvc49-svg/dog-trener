// Глобальные уведомления (toast) и диалоги подтверждения без window.confirm.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clsx } from 'clsx';
import { LuCircleAlert, LuCircleCheck, LuInfo } from 'react-icons/lu';

type ToastKind = 'ok' | 'error' | 'info';
interface ToastState { id: number; text: string; kind: ToastKind; action?: { label: string; run: () => void } }

let toastState: ToastState | null = null;
const toastSubs = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

export function toast(text: string, kind: ToastKind = 'ok', action?: ToastState['action']) {
  toastState = { id: ++seq, text, kind, action };
  toastSubs.forEach((f) => f());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastState = null; toastSubs.forEach((f) => f()); }, action ? 5000 : 3200);
}

export function toastError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  toast(msg || 'Что-то пошло не так. Попробуйте ещё раз.', 'error');
}

export function ToastHost() {
  const t = useSyncExternalStore((cb) => { toastSubs.add(cb); return () => toastSubs.delete(cb); }, () => toastState);
  if (!t) return <div role="status" aria-live="polite" className="sr-only" />;
  const Icon = t.kind === 'error' ? LuCircleAlert : t.kind === 'info' ? LuInfo : LuCircleCheck;
  return (
    <div className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none" style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
      <div key={t.id} role="status" aria-live="polite"
        className={clsx('anim-sheet pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-card text-[0.95rem]',
          t.kind === 'error' ? 'bg-rose text-white' : 'bg-ink text-paper')}>
        <Icon size={20} aria-hidden className="shrink-0" />
        <span className="flex-1">{t.text}</span>
        {t.action && (
          <button className="press -my-1 rounded-xl px-3 py-2 font-semibold underline-offset-2 hover:underline"
            onClick={() => { t.action!.run(); toastState = null; toastSubs.forEach((f) => f()); }}>
            {t.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Подтверждение ----------
interface ConfirmOpts { title: string; text?: string; confirm?: string; cancel?: string; danger?: boolean; requireText?: string }
interface ConfirmState extends ConfirmOpts { resolve: (v: boolean) => void }
let confirmState: ConfirmState | null = null;
const confirmSubs = new Set<() => void>();

export function confirmDialog(o: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = { ...o, resolve };
    confirmSubs.forEach((f) => f());
  });
}

export function ConfirmHost() {
  const c = useSyncExternalStore((cb) => { confirmSubs.add(cb); return () => confirmSubs.delete(cb); }, () => confirmState);
  const ref = useRef<HTMLDialogElement | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (c && !d.open) { setTyped(''); d.showModal(); }
    if (!c && d.open) d.close();
  }, [c]);
  const done = (v: boolean) => {
    const cur = confirmState;
    confirmState = null;
    confirmSubs.forEach((f) => f());
    cur?.resolve(v);
  };
  const blocked = !!c?.requireText && typed.trim().toUpperCase() !== c.requireText.toUpperCase();
  return (
    <dialog ref={ref} onCancel={(e: Event) => { e.preventDefault(); done(false); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl bg-surface p-0 text-ink backdrop:bg-black/40" aria-labelledby="confirm-title">
      {c && (
        <div className="anim-fade p-6">
          <h2 id="confirm-title" className="text-[1.2rem] font-semibold leading-snug">{c.title}</h2>
          {c.text && <p className="mt-2 text-ink-2 whitespace-pre-line">{c.text}</p>}
          {c.requireText && (
            <label className="mt-4 block text-[0.9rem] text-ink-2">Чтобы подтвердить, введите «{c.requireText}»
              <input className="field mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />
            </label>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button className="press h-12 rounded-2xl bg-surface-2 font-semibold" onClick={() => done(false)}>{c.cancel ?? 'Отмена'}</button>
            <button disabled={blocked} className={clsx('press h-12 rounded-2xl font-semibold disabled:opacity-40', c.danger ? 'bg-rose text-white' : 'bg-sage text-sage-ink')} onClick={() => done(true)}>
              {c.confirm ?? 'Подтвердить'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
