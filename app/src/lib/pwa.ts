// Регистрация service worker, баннер обновления и признак установки на экран «Домой».

import { useSyncExternalStore } from 'react';

let waiting: ServiceWorker | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (w: ServiceWorker) => { waiting = w; emit(); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});

  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => !!waiting);
}

/** Данные хранятся в IndexedDB и не затрагиваются: обновляется только код приложения. */
export function applyUpdate() {
  waiting?.postMessage('skipWaiting');
}
