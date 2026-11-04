// Экран активной тренировки — главный экран приложения на прогулке.
// Каждая попытка сохраняется сразу; закрытие приложения не теряет прогресс.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import {
  LuBookOpen, LuCheck, LuChevronRight, LuListChecks, LuPause, LuPlay, LuPlus, LuSkipForward, LuTriangleAlert, LuUndo2, LuX, LuMinus,
} from 'react-icons/lu';
import type { Attempt, Exercise, ExerciseResult, PlanItem, TrainingSession, Trigger } from '../domain/types';
import { useApp, current } from '../db/store';
import {
  addAttempt, ensureResult, finishExercise, pauseTraining, resumeTraining, undoLastAttempt, updateResult, updateTraining, levelFor,
} from '../db/repo';
import { describeItem, ex, levelOf, secondsFor } from '../domain/plan';
import { recommend } from '../domain/adaptation';
import { DISTANCES, REACTIONS, SKIP_REASONS, STRONG, TRIGGERS, observationOutcome, reactionLabel, safetyPrompt } from '../domain/training';
import { fmtClock } from '../lib/date';
import { Button, Chip, IconButton, Sheet } from '../ui/kit';
import { useTick, PROBLEM_COLOR } from '../ui/common';
import { navigate } from '../ui/router';
import { confirmDialog, toastError } from '../ui/dialogs';
import { RecommendationBox } from './RecommendationBox';
import { ExerciseDetails } from './ExerciseDetails';

const buzz = () => { try { navigator.vibrate?.(12); } catch { /* нет вибрации */ } };

export function TrainingScreen({ id }: { id: string }) {
  const s = useApp();
  const { dog } = current(s);
  const t = s.trainings.find((x) => x.id === id);

  useEffect(() => {
    if (t && t.status !== 'active') navigate(`train/${id}/summary`, { replace: true });
  }, [t?.status]);

  if (!t || !dog) {
    return (
      <div className="safe-top safe-x mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 text-center">
        <p className="text-[1.2rem] font-semibold">Тренировка не найдена</p>
        <p className="text-ink-2">Возможно, она уже завершена или удалена.</p>
        <Button variant="primary" onClick={() => navigate('today', { replace: true })}>На главный экран</Button>
      </div>
    );
  }
  if (t.status !== 'active') return null;
  return <ActiveTraining t={t} dogId={dog.id} />;
}

function ActiveTraining({ t, dogId }: { t: TrainingSession; dogId: string }) {
  const s = useApp();
  const idx = Math.min(Math.max(0, t.currentIndex), Math.max(0, t.items.length - 1));
  const item = t.items[idx];
  const e = ex(item.exerciseId);
  const rid = `${t.id}:${item.uid}`;
  const r = s.results.find((x) => x.id === rid);
  const attempts = useMemo(() => s.attempts.filter((a) => a.resultId === rid).sort((a, b) => a.index - b.index), [s.attempts, rid]);
  const paused = !!t.pausedAt;
  const [showPlan, setShowPlan] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const creating = useRef<string | null>(null);
  useTick(!paused);

  useEffect(() => {
    if (!r && creating.current !== rid) {
      creating.current = rid;
      ensureResult(t, item).catch(toastError);
    }
  }, [rid, !!r]);

  const now = Date.now();
  const elapsed = (now - t.startedAt - (t.pausedTotalMs || 0) - (t.pausedAt ? now - t.pausedAt : 0)) / 1000;
  const level = r?.difficultyLevel ?? levelFor(dogId, e.id);
  const L = levelOf(e, level);
  const isLast = idx >= t.items.length - 1;
  const resultsById = new Map(s.results.filter((x) => x.sessionId === t.id).map((x) => [x.itemUid, x]));

  async function goNext() {
    try {
      if (r && r.status === 'active') await finishExercise(t, r);
      if (isLast) navigate(`train/${t.id}/summary`);
      else await updateTraining(t, { currentIndex: idx + 1 });
      window.scrollTo({ top: 0 });
    } catch (err) { toastError(err); }
  }

  async function jump(i: number) {
    setShowPlan(false);
    try { await updateTraining(t, { currentIndex: i }); window.scrollTo({ top: 0 }); } catch (err) { toastError(err); }
  }

  async function skip(reason: string) {
    setShowSkip(false);
    if (!r) return;
    try {
      await finishExercise(t, r, { skipped: true, skipReason: reason });
      if (isLast) navigate(`train/${t.id}/summary`);
      else await updateTraining(t, { currentIndex: idx + 1 });
    } catch (err) { toastError(err); }
  }

  async function finishTrainingFlow() {
    const done = t.items.filter((i) => { const x = resultsById.get(i.uid); return x && (x.attempted > 0 || x.status !== 'active' || x.noOpportunity); }).length;
    if (done < t.items.length) {
      const ok = await confirmDialog({
        title: 'Завершить тренировку?',
        text: `Выполнено упражнений: ${done} из ${t.items.length}. Невыполненные останутся в плане как несделанные — это не считается неудачей.`,
        confirm: 'Завершить',
      });
      if (!ok) return;
    }
    if (r && r.status === 'active' && r.attempted > 0) await finishExercise(t, r).catch(toastError);
    navigate(`train/${t.id}/summary`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Верхняя панель */}
      <header className="safe-top sticky top-0 z-30 bg-paper/95 backdrop-blur-md">
        <div className="safe-x mx-auto flex max-w-2xl items-center gap-1 pt-1">
          <IconButton label="Выйти из тренировки" className="-ml-2 text-ink" onClick={() => setShowExit(true)}><LuX size={24} aria-hidden /></IconButton>
          <button type="button" onClick={() => setShowPlan(true)} className="press flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl font-semibold" aria-label="План тренировки">
            Упражнение {idx + 1} из {t.items.length}<LuListChecks size={18} className="text-ink-3" aria-hidden />
          </button>
          <span className="num min-w-[3.4rem] text-right text-[1.02rem] text-ink-2" aria-label="Время тренировки">{fmtClock(elapsed)}</span>
          <IconButton label={paused ? 'Продолжить' : 'Пауза'} className="-mr-2 text-ink" onClick={() => (paused ? resumeTraining(t) : pauseTraining(t)).catch(toastError)}>
            {paused ? <LuPlay size={22} aria-hidden /> : <LuPause size={22} aria-hidden />}
          </IconButton>
        </div>
        <div className="safe-x mx-auto flex max-w-2xl gap-1 pb-2">
          {t.items.map((i, k) => {
            const x = resultsById.get(i.uid);
            const st = x?.skipped ? 'skip' : x && x.status === 'done' ? 'done' : k === idx ? 'cur' : 'todo';
            return <span key={i.uid} className={clsx('h-1.5 flex-1 rounded-full', st === 'done' ? 'bg-sage' : st === 'skip' ? 'bg-ink-3' : st === 'cur' ? 'bg-merle' : 'bg-line')} />;
          })}
        </div>
      </header>

      <main key={rid} className="safe-x anim-fade mx-auto w-full max-w-2xl flex-1 pb-6">
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PROBLEM_COLOR[e.problem] }} aria-hidden />
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight">{e.title}</h1>
            <p className="mt-1 text-ink-2">{e.goal}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sage-soft px-3 py-1 text-[0.85rem] font-semibold text-sage">Уровень {level} · {L.title}</span>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-[0.85rem] text-ink-2">План: {describeItem(item, e)}</span>
          <button type="button" onClick={() => setShowDetails(true)} className="press inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[0.85rem] font-semibold text-merle ring-1 ring-inset ring-line">
            <LuBookOpen size={15} aria-hidden />Подробнее
          </button>
        </div>
        {item.note && <p className="mt-2 px-1 text-[0.95rem]"><span className="text-ink-2">Условия: </span>{item.note}</p>}
        {item.condition && <p className="mt-2 rounded-2xl bg-amber-soft px-4 py-2.5 text-[0.92rem]">{item.condition}</p>}
        {e.measurement === 'segments' && item.steps && L.steps_hint && item.steps > L.steps_hint[1] && (
          <p className="mt-3 rounded-2xl bg-amber-soft px-4 py-2.5 text-[0.92rem]">
            По плану отрезки по {item.steps} шагов, а текущий уровень — {L.steps_hint[0]}–{L.steps_hint[1]} шагов. Если длинные отрезки пока трудны, работай на своём уровне: неделя курса не повод усложнять.
          </p>
        )}

        <ol className="mt-4 space-y-2">
          {(L.steps.length ? L.steps : e.steps.slice(0, 4)).map((st, k) => (
            <li key={k} className="flex gap-3">
              <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.8rem] font-semibold text-ink-2">{k + 1}</span>
              <span className="text-[1.02rem] leading-snug">{st}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setShowSkip(true)} icon={<LuSkipForward size={16} aria-hidden />}>Пропустить упражнение</Button>
          {!(isLast && r && (r.status !== 'active' || attempts.length >= item.target)) && <Button size="sm" onClick={finishTrainingFlow} icon={<LuCheck size={16} aria-hidden />}>Завершить тренировку</Button>}
        </div>

        {r ? (
          e.measurement === 'observations'
            ? <ObservationPanel t={t} r={r} e={e} item={item} attempts={attempts} onNext={goNext} isLast={isLast} dogId={dogId} />
            : e.measurement === 'duration'
              ? <DurationPanel t={t} r={r} e={e} item={item} attempts={attempts} level={level} onNext={goNext} isLast={isLast} dogId={dogId} paused={paused} />
              : <CountPanel t={t} r={r} e={e} item={item} attempts={attempts} onNext={goNext} isLast={isLast} dogId={dogId} countTensions={s.settings.countTensions} />
        ) : <p className="mt-8 text-center text-ink-3" role="status">Готовим упражнение…</p>}

      </main>

      {paused && (
        <div className="anim-fade fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-paper/95 px-6 text-center backdrop-blur" role="dialog" aria-modal="true" aria-label="Пауза">
          <LuPause size={48} className="text-ink-3" aria-hidden />
          <div>
            <p className="text-[1.8rem] font-bold">Пауза</p>
            <p className="mt-1 text-ink-2">Время не идёт. Дайте собаке понюхать и отдохнуть.</p>
          </div>
          <Button variant="primary" size="xl" className="w-full max-w-xs" onClick={() => resumeTraining(t).catch(toastError)} icon={<LuPlay size={22} aria-hidden />}>Продолжить</Button>
          <Button variant="ghost" onClick={() => resumeTraining(t).then(finishTrainingFlow).catch(toastError)}>Завершить тренировку</Button>
        </div>
      )}

      <Sheet open={showPlan} onClose={() => setShowPlan(false)} title={t.title}>
        <ul className="space-y-2">
          {t.items.map((i, k) => {
            const x = resultsById.get(i.uid);
            const ee = ex(i.exerciseId);
            return (
              <li key={i.uid}>
                <button type="button" onClick={() => jump(k)} className={clsx('press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 ring-inset', k === idx ? 'bg-sage-soft ring-sage' : 'bg-surface ring-line')}>
                  <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.9rem] font-semibold">{x?.status === 'done' ? <LuCheck size={16} className="text-sage" aria-label="Выполнено" /> : k + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{ee.title}</span>
                    <span className="block text-[0.85rem] text-ink-2">{describeItem(i, ee)}{x ? ` · ${x.skipped ? 'пропущено' : `${x.successful} из ${x.attempted}`}` : ''}</span>
                  </span>
                  <LuChevronRight className="text-ink-3" size={18} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      <Sheet open={showDetails} onClose={() => setShowDetails(false)} title={e.title}>
        <ExerciseDetails e={e} level={level} />
      </Sheet>

      <Sheet open={showSkip} onClose={() => setShowSkip(false)} title="Пропустить упражнение">
        <p className="mb-3 text-[0.92rem] text-ink-2">Пропуск не считается неудачной попыткой и не портит статистику.</p>
        <div className="grid gap-2">
          {SKIP_REASONS.map((reason) => <Button key={reason} full onClick={() => skip(reason)}>{reason}</Button>)}
        </div>
      </Sheet>

      <Sheet open={showExit} onClose={() => setShowExit(false)} title="Выйти из тренировки?">
        <p className="mb-4 text-ink-2">Все попытки уже сохранены. Тренировку можно продолжить позже с главного экрана.</p>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" full onClick={() => { setShowExit(false); navigate('today'); }}>Продолжить позже</Button>
          <Button size="lg" full onClick={() => { setShowExit(false); finishTrainingFlow(); }}>Завершить тренировку</Button>
          <Button variant="ghost" full onClick={() => setShowExit(false)}>Остаться</Button>
        </div>
      </Sheet>
    </div>
  );
}

interface PanelProps { t: TrainingSession; r: ExerciseResult; e: Exercise; item: PlanItem; attempts: Attempt[]; onNext: () => void; isLast: boolean; dogId: string }

function Dots({ attempts, target }: { attempts: Attempt[]; target: number }) {
  const n = Math.max(target, attempts.length);
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-1.5" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = attempts[i];
        return <span key={i} className={clsx('h-2.5 w-2.5 rounded-full', !a ? 'bg-line' : a.outcome === 'success' ? 'bg-sage' : 'bg-rose')} />;
      })}
    </div>
  );
}

function Completion({ r, e, attempts, onNext, isLast, onMore, dogId }: PanelProps & { onMore: () => void }) {
  const s = useApp();
  const history = s.results.filter((x) => x.exerciseId === e.id && x.id !== r.id);
  const rec = recommend(e, r.difficultyLevel, [...history, { ...r, status: 'done', finishedAt: Date.now() }]);
  const ev = r.successful + r.unsuccessful;
  return (
    <div className="anim-sheet mt-6 rounded-[1.5rem] bg-surface p-5 shadow-card" role="status">
      <div className="flex items-center gap-4">
        <span className="anim-ring flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sage text-sage-ink">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden><path className="anim-draw" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div>
          <p className="text-[1.15rem] font-semibold">Упражнение выполнено</p>
          <p className="num text-ink-2">{r.noOpportunity && !ev ? 'Встреч не было' : `${r.successful} из ${ev} · ${ev ? Math.round((r.successful / ev) * 100) : 0}%`}</p>
        </div>
      </div>
      <RecommendationBox rec={rec} e={e} dogId={dogId} className="mt-4" readOnly />
      {rec.toLevel !== undefined && <p className="mt-2 text-[0.82rem] text-ink-3">Решение об уровне — в итогах тренировки, после оценки состояния собаки.</p>}
      <div className="mt-4 grid gap-2">
        <Button variant="primary" size="xl" full onClick={onNext} icon={isLast ? <LuCheck size={22} aria-hidden /> : <LuChevronRight size={22} aria-hidden />}>
          {isLast ? 'Завершить тренировку' : 'Следующее упражнение'}
        </Button>
        {!r.noOpportunity && <Button variant="ghost" onClick={onMore} icon={<LuPlus size={18} aria-hidden />}>Ещё {e.measurement === 'segments' ? 'отрезок' : e.measurement === 'observations' ? 'наблюдение' : 'попытка'}</Button>}
      </div>
      {attempts.length > 0 && <p className="sr-only">Попыток: {attempts.length}</p>}
    </div>
  );
}

// ---------- Попытки и отрезки ----------
function CountPanel(p: PanelProps & { countTensions: boolean }) {
  const { t, r, e, item, attempts } = p;
  const [more, setMore] = useState(false);
  const [bump, setBump] = useState(0);
  const reached = attempts.length >= item.target && !more;
  const isSeg = e.measurement === 'segments';
  const current = Math.min(attempts.length + 1, Math.max(item.target, attempts.length + 1));

  async function mark(outcome: 'success' | 'fail') {
    buzz();
    setBump((x) => x + 1);
    try {
      await addAttempt(t, r, { outcome });
      if (more && attempts.length + 1 >= item.target) setMore(false);
    } catch (err) { toastError(err); }
  }
  async function tension(delta: number) {
    buzz();
    const v = Math.max(0, (r.tensions ?? 0) + delta);
    await updateResult(r, { tensions: v }).catch(toastError);
  }

  const tensionRow = isSeg && p.countTensions && (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[0.92rem] font-medium">Натяжения поводка</span>
      <button type="button" aria-label="Убрать натяжение" onClick={() => tension(-1)} className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface-2"><LuMinus size={18} aria-hidden /></button>
      <span className="num w-8 text-center text-[1.25rem] font-semibold" aria-live="polite">{r.tensions ?? 0}</span>
      <button type="button" aria-label="Добавить натяжение" onClick={() => tension(1)} className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface-2"><LuPlus size={18} aria-hidden /></button>
    </div>
  );

  if (reached) {
    return (
      <div className="mt-6">
        <Completion {...p} onMore={() => setMore(true)} />
        {tensionRow && <div className="mt-3 rounded-2xl bg-surface px-4 py-2 ring-1 ring-inset ring-line">{tensionRow}</div>}
        {attempts.length > 0 && <div className="mt-2 flex justify-center"><Button variant="ghost" size="sm" onClick={() => undoLastAttempt(r).catch(toastError)} icon={<LuUndo2 size={16} aria-hidden />}>Отменить последнюю</Button></div>}
      </div>
    );
  }

  // Счётчик и большие кнопки — в нижней панели под большим пальцем, на одном месте при прокрутке.
  return (
    <Dock>
      <div className="flex items-end justify-between gap-3" aria-live="polite">
        <div>
          <p className="text-[0.85rem] text-ink-2">{isSeg ? 'Отрезок' : e.unit[0] === 'раунд' ? 'Раунд' : 'Попытка'}</p>
          <p key={bump} className={clsx('num text-[3rem] font-semibold leading-none', bump && 'anim-pop')}>
            {current}<span className="text-[1.5rem] text-ink-3"> из {item.target}</span>
          </p>
        </div>
        <p className="num pb-1 text-right text-[0.88rem] leading-tight">
          <span className="block text-sage">{e.successLabel}: {r.successful}</span>
          <span className="block text-rose">{e.failLabel}: {r.unsuccessful}</span>
        </p>
      </div>
      <Dots attempts={attempts} target={item.target} />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => mark('success')} className="press flex min-h-[5.5rem] flex-col items-center justify-center gap-0.5 rounded-[1.6rem] bg-sage px-2 text-[1.12rem] font-semibold leading-tight text-sage-ink">
          <LuCheck size={28} aria-hidden />{e.successLabel}
        </button>
        <button type="button" onClick={() => mark('fail')} className="press flex min-h-[5.5rem] flex-col items-center justify-center gap-0.5 rounded-[1.6rem] bg-surface px-2 text-[1.12rem] font-semibold leading-tight text-rose ring-2 ring-inset ring-rose/40">
          <LuX size={28} aria-hidden />{e.failLabel}
        </button>
      </div>
      {tensionRow && <div className="mt-2">{tensionRow}</div>}
      {attempts.length > 0 && (
        <div className="mt-1 flex justify-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => undoLastAttempt(r).catch(toastError)} icon={<LuUndo2 size={16} aria-hidden />}>Отменить</Button>
          <Button variant="ghost" size="sm" onClick={p.onNext}>Закончить упражнение</Button>
        </div>
      )}
    </Dock>
  );
}

/** Нижняя панель управления; под ней в контенте оставляется место такой же высоты. */
function Dock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState(280);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div style={{ height: h }} aria-hidden />
      <div ref={ref} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md">
        <div className="safe-x mx-auto max-w-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{children}</div>
      </div>
    </>
  );
}

// ---------- Наблюдения за раздражителями ----------
function ObservationPanel(p: PanelProps) {
  const { t, r, e, item, attempts } = p;
  const last = attempts[attempts.length - 1];
  const [trigger, setTrigger] = useState<Trigger>(e.id === 'calm-people' ? 'person' : last?.trigger ?? 'dog');
  const [distance, setDistance] = useState<number>(last?.distance ?? 20);
  const [reactions, setReactions] = useState<string[]>(['calm']);
  const [switched, setSwitched] = useState<boolean | null>(null);
  const [more, setMore] = useState(false);
  const finished = r.status !== 'active' || r.noOpportunity;
  const reached = (attempts.length >= item.target || finished) && !more;
  const safety = safetyPrompt(attempts);

  function toggle(id: string) {
    if (id === 'calm') { setReactions(['calm']); return; }
    setReactions((cur) => {
      const base = cur.filter((x) => x !== 'calm');
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      return next.length ? next : ['calm'];
    });
  }

  async function save() {
    if (switched === null) return;
    buzz();
    try {
      await addAttempt(t, r, { outcome: observationOutcome(reactions, switched), trigger, distance, reactions, switched });
      setReactions(['calm']);
      setSwitched(null);
      if (more) setMore(false);
    } catch (err) { toastError(err); }
  }

  async function noOpportunity() {
    try { await finishExercise(t, r, { noOpportunity: true }); } catch (err) { toastError(err); }
  }

  if (reached) {
    return (
      <div className="mt-6">
        <ObsList attempts={attempts} r={r} />
        <Completion {...p} onMore={() => setMore(true)} />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="text-center">
        <p className="text-[0.95rem] text-ink-2">Наблюдение</p>
        <p className="num text-[3.4rem] font-semibold leading-none">{attempts.length + 1}<span className="text-[1.6rem] text-ink-3"> · до {item.target}</span></p>
        <p className="num mt-1 text-[0.95rem] text-ink-2"><span className="text-sage">{r.successful} спокойно</span> · <span className="text-rose">{r.unsuccessful} с реакцией</span></p>
      </div>

      {safety && (
        <div className={clsx('mt-4 flex gap-3 rounded-2xl p-4', safety === 'stop' ? 'bg-rose-soft' : 'bg-amber-soft')} role="alert">
          <LuTriangleAlert className={clsx('mt-0.5 shrink-0', safety === 'stop' ? 'text-rose' : 'text-amber')} size={20} aria-hidden />
          <div className="text-[0.95rem]">
            {safety === 'stop'
              ? <>Две сильные реакции подряд. Лучше закончить упражнение: уйди в спокойное место и рассыпь лакомство в траву.</>
              : <>Была выраженная реакция. Увеличь дистанцию и подожди, пока собака снова начнёт брать лакомство. Не подходи ближе.</>}
            {safety === 'stop' && <div className="mt-3"><Button size="sm" variant="danger" onClick={p.onNext}>Закончить упражнение</Button></div>}
          </div>
        </div>
      )}

      <fieldset className="mt-5">
        <legend className="mb-2 px-1 text-[0.9rem] font-medium text-ink-2">Кто</legend>
        <div className="flex flex-wrap gap-2">{TRIGGERS.map((x) => <Chip key={x.id} active={trigger === x.id} tone="merle" onClick={() => setTrigger(x.id)}>{x.label}</Chip>)}</div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="mb-2 px-1 text-[0.9rem] font-medium text-ink-2">Примерная дистанция, м</legend>
        <div className="flex flex-wrap gap-2">{DISTANCES.map((d) => <Chip key={d} active={distance === d} tone="merle" onClick={() => setDistance(d)}><span className="num">{d}{d === 50 ? '+' : ''}</span></Chip>)}</div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="mb-2 px-1 text-[0.9rem] font-medium text-ink-2">Реакция</legend>
        <div className="flex flex-wrap gap-2">{REACTIONS.map((x) => <Chip key={x.id} active={reactions.includes(x.id)} tone={x.strong ? 'rose' : 'sage'} onClick={() => toggle(x.id)}>{x.label}</Chip>)}</div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="mb-2 px-1 text-[0.9rem] font-medium text-ink-2">Удалось переключить внимание на тебя?</legend>
        <div className="grid grid-cols-2 gap-2">
          <Chip active={switched === true} onClick={() => setSwitched(true)} className="min-h-12">Да</Chip>
          <Chip active={switched === false} tone="rose" onClick={() => setSwitched(false)} className="min-h-12">Нет</Chip>
        </div>
      </fieldset>

      <Button variant="primary" size="xl" full className="mt-5" disabled={switched === null} onClick={save}>Сохранить наблюдение</Button>
      {switched === null && <p className="mt-2 text-center text-[0.85rem] text-ink-3">Отметьте, удалось ли переключить внимание</p>}

      <div className="mt-3 grid gap-2">
        {attempts.length === 0
          ? <Button onClick={noOpportunity}>Не было подходящих встреч</Button>
          : <Button onClick={p.onNext}>Встреч больше не будет — дальше</Button>}
      </div>
      <ObsList attempts={attempts} r={r} />
    </div>
  );
}

function ObsList({ attempts, r }: { attempts: Attempt[]; r: ExerciseResult }) {
  if (!attempts.length) return null;
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between px-1">
        <p className="text-[0.9rem] font-medium text-ink-2">Записано</p>
        {r.status === 'active' && <Button variant="ghost" size="sm" onClick={() => undoLastAttempt(r).catch(toastError)} icon={<LuUndo2 size={16} aria-hidden />}>Отменить последнее</Button>}
      </div>
      <ul className="mt-1 space-y-1.5">
        {[...attempts].reverse().map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 text-[0.9rem] ring-1 ring-inset ring-line">
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', a.outcome === 'success' ? 'bg-sage' : 'bg-rose')} aria-label={a.outcome === 'success' ? 'Спокойно' : 'С реакцией'} />
            <span className="flex-1">{TRIGGERS.find((x) => x.id === a.trigger)?.label ?? 'Раздражитель'}, ~{a.distance} м · {(a.reactions ?? []).map(reactionLabel).join(', ').toLowerCase()}</span>
            <span className="text-ink-3">{a.switched ? 'переключилась' : 'без переключения'}</span>
          </li>
        ))}
      </ul>
      {attempts.some((a) => (a.reactions ?? []).some((x) => STRONG.has(x))) && <p className="mt-2 px-1 text-[0.82rem] text-ink-3">Наблюдения с лаем, рывком или замиранием не считаются успешными.</p>}
    </div>
  );
}

// ---------- Выдержка по времени ----------
function DurationPanel(p: PanelProps & { level: number; paused: boolean }) {
  const { t, r, e, item, attempts } = p;
  const target = secondsFor(item, e, p.level);
  const key = `aussie-trainer:hold:${r.id}`;
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    try { const v = sessionStorage.getItem(key); return v ? Number(v) : null; } catch { return null; }
  });
  const [more, setMore] = useState(false);
  useTick(startedAt !== null && !p.paused);
  const reached = attempts.length >= item.target && !more;
  const held = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const isRelax = e.id === 'decompress';

  function begin() {
    buzz();
    const now = Date.now();
    setStartedAt(now);
    try { sessionStorage.setItem(key, String(now)); } catch { /* нет доступа */ }
  }
  async function stop(outcome: 'success' | 'fail') {
    if (startedAt === null) return;
    buzz();
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    setStartedAt(null);
    try { sessionStorage.removeItem(key); } catch { /* нет доступа */ }
    try {
      await addAttempt(t, r, { outcome, seconds });
      if (more) setMore(false);
    } catch (err) { toastError(err); }
  }

  if (reached && startedAt === null) return <div className="mt-6"><Completion {...p} onMore={() => setMore(true)} /></div>;

  const progress = Math.min(1, held / target);
  const R = 70, C = 2 * Math.PI * R;
  return (
    <div className="mt-6">
      <p className="text-center text-[0.95rem] text-ink-2">Повтор {Math.min(attempts.length + 1, Math.max(item.target, attempts.length + 1))} из {item.target} · {isRelax ? `до ${fmtClock(target)}` : `цель ${target} сек`}</p>
      <div className="relative mx-auto mt-3 h-[11rem] w-[11rem]">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
          <circle cx="80" cy="80" r={R} fill="none" stroke={progress >= 1 ? 'var(--sage)' : 'var(--merle)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-live="polite">
          <span className="num text-[2.6rem] font-semibold leading-none">{fmtClock(held)}</span>
          {startedAt !== null && !isRelax && progress >= 1 && <span className="mt-1 text-[0.85rem] font-semibold text-sage">Можно отпускать</span>}
        </div>
      </div>
      <Dots attempts={attempts} target={item.target} />
      {startedAt === null ? (
        <Button variant="primary" size="xl" full className="mt-5" onClick={begin} icon={<LuPlay size={22} aria-hidden />}>{isRelax ? 'Засечь время' : 'Старт выдержки'}</Button>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => stop('success')} className="press flex min-h-[6rem] flex-col items-center justify-center gap-1 rounded-[1.75rem] bg-sage text-[1.15rem] font-semibold text-sage-ink"><LuCheck size={28} aria-hidden />{e.successLabel}</button>
          <button type="button" onClick={() => stop('fail')} className="press flex min-h-[6rem] flex-col items-center justify-center gap-1 rounded-[1.75rem] bg-surface text-[1.15rem] font-semibold text-rose ring-2 ring-inset ring-rose/40"><LuX size={28} aria-hidden />{e.failLabel}</button>
        </div>
      )}
      <div className="mt-3 flex justify-center gap-2">
        {attempts.length > 0 && startedAt === null && <Button variant="ghost" size="sm" onClick={() => undoLastAttempt(r).catch(toastError)} icon={<LuUndo2 size={16} aria-hidden />}>Отменить последний</Button>}
        {!reached && attempts.length > 0 && startedAt === null && <Button variant="ghost" size="sm" onClick={p.onNext}>Закончить упражнение</Button>}
      </div>
    </div>
  );
}
