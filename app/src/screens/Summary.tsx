// Итоги тренировки: оценка состояния собаки → результаты, рекомендации по уровням, совет на следующий раз.

import { useState } from 'react';
import { clsx } from 'clsx';
import { LuArrowLeft, LuNotebookPen, LuTrash2 } from 'react-icons/lu';
import type { Environment, Mood } from '../domain/types';
import { useApp, current } from '../db/store';
import { discardTraining, finishTraining } from '../db/repo';
import { ENVIRONMENTS, MOODS } from '../domain/training';
import { ENV_LABEL, recommend, sessionAdvice } from '../domain/adaptation';
import { ex, levelOf } from '../domain/plan';
import { trainingSeconds } from '../domain/metrics';
import { fmtDuration } from '../lib/date';
import { Button, Field, Page } from '../ui/kit';
import { Stat } from '../ui/charts';
import { navigate } from '../ui/router';
import { confirmDialog, toast, toastError } from '../ui/dialogs';
import { RecommendationBox } from './RecommendationBox';
import { PROBLEM_COLOR } from '../ui/common';

export function SummaryScreen({ id }: { id: string }) {
  const s = useApp();
  const { dog } = current(s);
  const t = s.trainings.find((x) => x.id === id);
  const [mood, setMood] = useState<Mood | null>(t?.mood ?? null);
  const [env, setEnv] = useState<Environment>(t?.environment ?? 2);
  const [notes, setNotes] = useState(t?.notes ?? '');
  const [busy, setBusy] = useState(false);

  if (!t || !dog) {
    return <Page title="Итоги" back="today"><p className="text-ink-2">Тренировка не найдена.</p></Page>;
  }
  const results = s.results.filter((r) => r.sessionId === t.id);

  if (t.status === 'active') {
    const save = async () => {
      if (!mood) return;
      setBusy(true);
      try {
        await finishTraining(t, { mood, notes: notes.trim(), environment: env });
        toast('Тренировка сохранена');
        window.scrollTo({ top: 0 });
      } catch (e) { toastError(e); }
      setBusy(false);
    };
    const discard = async () => {
      const ok = await confirmDialog({ title: 'Удалить тренировку?', text: 'Все отмеченные попытки этой тренировки будут удалены. Это нельзя отменить.', confirm: 'Удалить', danger: true });
      if (!ok) return;
      try { await discardTraining(t); navigate('today', { replace: true }); toast('Тренировка удалена'); } catch (e) { toastError(e); }
    };
    return (
      <Page title="Как прошла тренировка?" sub={t.title}>
        <fieldset>
          <legend className="mb-2 px-1 font-semibold">Состояние собаки</legend>
          <div className="grid gap-2" role="radiogroup" aria-label="Состояние собаки">
            {MOODS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mood === m.id} onClick={() => setMood(m.id)}
                className={clsx('press min-h-14 rounded-2xl px-4 py-2.5 text-left ring-1 ring-inset', mood === m.id ? (m.id === 'very' ? 'bg-rose-soft ring-rose' : 'bg-sage-soft ring-sage') : 'bg-surface ring-line')}>
                <span className="block font-semibold">{m.label}</span><span className="block text-[0.85rem] text-ink-2">{m.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="mb-2 px-1 font-semibold">Обстановка</legend>
          <div className="grid grid-cols-2 gap-2">
            {ENVIRONMENTS.map((e) => (
              <button key={e.id} type="button" aria-pressed={env === e.id} onClick={() => setEnv(e.id)}
                className={clsx('press min-h-12 rounded-2xl px-3 text-[0.95rem] font-medium ring-1 ring-inset', env === e.id ? 'bg-sage-soft ring-sage' : 'bg-surface ring-line')}>{e.label}</button>
            ))}
          </div>
        </fieldset>
        <Field label="Заметки (по желанию)" className="mt-6">
          <textarea className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Что получилось, что мешало, где тренировались" />
        </Field>
        <Button variant="primary" size="xl" full className="mt-6" disabled={!mood || busy} onClick={save}>Сохранить тренировку</Button>
        {!mood && <p className="mt-2 text-center text-[0.85rem] text-ink-3">Выберите состояние собаки</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="ghost" onClick={() => navigate(`train/${t.id}`, { replace: true })} icon={<LuArrowLeft size={18} aria-hidden />}>Вернуться к тренировке</Button>
          <Button variant="ghost" onClick={discard} icon={<LuTrash2 size={18} aria-hidden />}>Удалить тренировку</Button>
        </div>
      </Page>
    );
  }

  // ---------- Завершённая тренировка ----------
  const counted = results.filter((r) => r.status === 'done' && !r.skipped);
  const successful = counted.reduce((a, r) => a + (r.stressed ? 0 : r.successful), 0);
  const evaluated = counted.reduce((a, r) => a + r.successful + r.unsuccessful, 0);
  const pct = evaluated ? Math.round((successful / evaluated) * 100) : null;
  const recs = counted.map((r) => {
    const e = ex(r.exerciseId);
    return { r, e, rec: recommend(e, r.difficultyLevel, s.results.filter((x) => x.exerciseId === r.exerciseId)) };
  });
  const advice = sessionAdvice(recs.map((x) => ({ title: x.e.title, rec: x.rec })), t.mood);
  const order = new Map(t.items.map((i, k) => [i.uid, k]));
  const ordered = [...results].sort((a, b) => (order.get(a.itemUid) ?? 0) - (order.get(b.itemUid) ?? 0));

  return (
    <Page title="Тренировка завершена" sub={t.title} back="today">
      <div className="flex items-center gap-4 py-2">
        <span className="anim-ring flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sage text-sage-ink">
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden><path className="anim-draw" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <p className="text-ink-2">{MOODS.find((m) => m.id === t.mood)?.label} · {ENV_LABEL[t.environment]}{t.trainedBy ? ` · проводил(а) ${t.trainedBy}` : ''}</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Успешно" value={successful} />
        <Stat label="Не получилось" value={evaluated - successful} />
        <Stat label="Успешность" value={pct === null ? '—' : `${pct}%`} sub={`${evaluated} оцениваемых`} />
        <Stat label="Длительность" value={fmtDuration(trainingSeconds(t))} />
      </div>
      {t.mood === 'very' && <p className="mt-3 rounded-2xl bg-rose-soft p-4 text-[0.95rem]">Собака была сильно возбуждена — удачные попытки этой тренировки не засчитаны как успешные, чтобы не завышать прогресс.</p>}

      <div className="mt-4 rounded-2xl bg-sage-soft p-4">
        <p className="text-[0.85rem] font-semibold text-sage">Совет на следующую тренировку</p>
        <p className="mt-1">{advice}</p>
      </div>

      <h2 className="mb-2 mt-7 px-1 text-[1.05rem] font-semibold">Упражнения</h2>
      <div className="space-y-3">
        {ordered.map((r) => {
          const e = ex(r.exerciseId);
          const ev = r.successful + r.unsuccessful;
          const rec = recs.find((x) => x.r.id === r.id)?.rec;
          return (
            <section key={r.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: PROBLEM_COLOR[e.problem] }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{e.title}</h3>
                  <p className="text-[0.85rem] text-ink-2">Уровень {r.difficultyLevel} · {levelOf(e, r.difficultyLevel).title} · {fmtDuration(r.durationSeconds)}</p>
                </div>
                <span className="num text-[1.2rem] font-semibold">{r.skipped ? '—' : ev ? `${Math.round((r.successful / ev) * 100)}%` : '—'}</span>
              </div>
              <p className="mt-2 text-[0.92rem]">
                {r.skipped ? `Пропущено: ${r.skipReason ?? 'без причины'}` :
                  r.noOpportunity && !ev ? 'Подходящих встреч не было — это не неудача.' :
                  e.measurement === 'observations'
                    ? `Спокойно: ${r.successful}, с реакцией: ${r.unsuccessful}${r.distanceToTrigger ? `, ближайшая дистанция ~${r.distanceToTrigger} м` : ''}, переключений: ${r.switched ?? 0}`
                    : e.measurement === 'duration'
                      ? `${e.successLabel}: ${r.successful} из ${ev}${r.measuredQuantity ? `, в среднем ${r.measuredQuantity} сек` : ''}`
                      : `${e.successLabel}: ${r.successful} из ${ev}${typeof r.tensions === 'number' && e.measurement === 'segments' ? `, натяжений: ${r.tensions}` : ''}`}
              </p>
              {rec && !r.skipped && <RecommendationBox rec={rec} e={e} dogId={dog.id} className="mt-3" />}
            </section>
          );
        })}
        {!ordered.length && <p className="text-ink-2">В этой тренировке нет отмеченных упражнений.</p>}
      </div>

      {t.notes && <p className="mt-4 rounded-2xl bg-surface-2 p-4 text-[0.95rem]"><span className="text-ink-2">Заметки: </span>{t.notes}</p>}

      <div className="mt-6 grid gap-2">
        <Button variant="primary" size="lg" full onClick={() => navigate('today', { replace: true })}>Готово</Button>
        <Button full onClick={() => navigate('journal/new')} icon={<LuNotebookPen size={18} aria-hidden />}>Записать событие в дневник</Button>
      </div>
    </Page>
  );
}
