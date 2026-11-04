// Компактные типы React, достаточные для проверки кода приложения.
// Полные @types/react в окружении сборки недоступны; поведение React от этого не меняется.
// Если поставить @types/react и @types/react-dom, этот файл нужно удалить.

declare namespace JSX {
  type ElementType = any;
  interface Element { type: any; props: any; key: any }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string | number | null }
  /** Обработчики событий типизированы, остальные атрибуты свободные. */
  interface DOMProps {
    onChange?: (e: import('react').ChangeEvent<any>) => void;
    onInput?: (e: import('react').ChangeEvent<any>) => void;
    onClick?: (e: import('react').MouseEvent<any>) => void;
    onKeyDown?: (e: import('react').KeyboardEvent<any>) => void;
    onSubmit?: (e: import('react').FormEvent<any>) => void;
    onPointerDown?: (e: import('react').MouseEvent<any>) => void;
    onPointerEnter?: (e: import('react').MouseEvent<any>) => void;
    onPointerLeave?: (e: import('react').MouseEvent<any>) => void;
    onCancel?: (e: Event) => void;
    onClose?: (e: Event) => void;
    [attr: string]: any;
  }
  interface IntrinsicElements { [name: string]: DOMProps }
}

declare module '*.css';

declare module 'react' {
  export type ReactNode = JSX.Element | string | number | bigint | boolean | null | undefined | Iterable<ReactNode>;
  export type Key = string | number;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface RefObject<T> { current: T }
  export interface MutableRefObject<T> { current: T }
  export type CSSProperties = { [key: string]: string | number | undefined };
  export interface SVGAttributes<T> { [attr: string]: any; _t?: T }
  export interface HTMLAttributes<T> { [attr: string]: any; _t?: T }
  export type PropsWithChildren<P = unknown> = P & { children?: ReactNode };
  export type FC<P = {}> = (props: P) => ReactNode;
  export interface SyntheticEvent<T = Element> { target: any; currentTarget: T; preventDefault(): void; stopPropagation(): void }
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> { target: any }
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface MouseEvent<T = Element> extends SyntheticEvent<T> { clientX: number; clientY: number }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T> { key: string; shiftKey: boolean }
  export interface Context<T> { Provider: any; Consumer: any; _default?: T }

  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useReducer<S, A>(reducer: (s: S, a: A) => S, initial: S): [S, Dispatch<A>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useContext<T>(ctx: Context<T>): T;
  export function useId(): string;
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, get: () => T, getServer?: () => T): T;
  export function createContext<T>(defaultValue: T): Context<T>;
  export function memo<T>(component: T): T;
  export const Fragment: any;
  export const StrictMode: any;
  const React: {
    Fragment: any;
    StrictMode: any;
  };
  export default React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
  export import JSX = globalThis.JSX;
}

declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: any): void; unmount(): void };
}
