// Маршрутизация на hash (#/today): работает на GitHub Pages без настройки сервера,
// кнопка «Назад» в браузере и жест «назад» ведут себя предсказуемо.

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const stack: string[] = [];

function currentHash(): string {
  const h = location.hash.replace(/^#\/?/, '');
  return h || 'today';
}

function onChange() {
  const h = currentHash();
  if (stack.length >= 2 && stack[stack.length - 2] === h) stack.pop();
  else if (stack[stack.length - 1] !== h) stack.push(h);
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  stack.push(currentHash());
  window.addEventListener('hashchange', onChange);
}

export function usePath(): string {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, currentHash);
}

export function useSegments(): string[] {
  return usePath().split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

export function useQuery(): URLSearchParams {
  const p = usePath();
  return new URLSearchParams(p.includes('?') ? p.slice(p.indexOf('?') + 1) : '');
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const target = '#/' + path.replace(/^#?\/?/, '');
  if (opts.replace) {
    history.replaceState(null, '', target);
    stack[stack.length - 1] = currentHash();
    for (const l of listeners) l();
  } else if (location.hash !== target) {
    location.hash = target;
  }
  window.scrollTo({ top: 0 });
}

/** Назад внутри приложения; если истории нет — на указанный экран. */
export function goBack(fallback = 'today') {
  if (stack.length > 1) history.back();
  else navigate(fallback, { replace: true });
}
