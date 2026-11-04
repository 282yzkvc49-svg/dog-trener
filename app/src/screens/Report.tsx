// Отчёт для ChatGPT или Claude: текст из фактических данных, копирование, «Поделиться», JSON.

import { useState } from 'react';
import { LuCalendarDays, LuChevronLeft, LuChevronRight, LuCopy, LuFileJson, LuShare2 } from 'react-icons/lu';
import { useApp, current } from '../db/store';
import { buildWeekReport, reportJson, reportText } from '../domain/report';
import { coursePosition } from '../domain/schedule';
import { fmtDateTime, fmtDay, today } from '../lib/date';
import { Button, Field, Page, SectionTitle } from '../ui/kit';
import { copyText, shareFile, shareText, stamp } from '../ui/share';
import { navigate } from '../ui/router';
import { toast, toastError } from '../ui/dialogs';
import { saveReport, saveWeekNote } from '../db/repo';
import { useDataSet } from './Progress';

export function ReportScreen({ week: initial }: { week?: number }) {
  const s = useApp();
  const { dog, program, days } = current(s);
  const d = useDataSet();
  const t = today();
  const pos = coursePosition(t, days);
  const [week, setWeek] = useState(initial ?? pos.day?.week ?? 1);
  const report = buildWeekReport(d, week, t);
  const text = report ? reportText(report, dog, program, d) : '';
  const nextWeek = week + 1;
  const [note, setNote] = useState(program?.settings.weekNotes[String(nextWeek)] ?? '');
  const [noteFor, setNoteFor] = useState(nextWeek);
  if (noteFor !== nextWeek) { setNoteFor(nextWeek); setNote(program?.settings.weekNotes[String(nextWeek)] ?? ''); }
  const history = s.reports.filter((r) => r.week === week).sort((a, b) => b.createdAt - a.createdAt);

  async function remember() { await saveReport(week, text).catch(() => {}); }

  async function copy() {
    if (await copyText(text)) { toast('Отчёт скопирован — вставьте его в чат'); remember(); }
    else toast('Не удалось скопировать. Выделите текст вручную.', 'error');
  }
  async function share() {
    const r = await shareText(`Aussie Trainer — неделя ${week}`, text);
    if (r === 'copied') toast('Отчёт скопирован');
    if (r === 'shared' || r === 'copied') remember();
  }
  async function json() {
    if (!report) return;
    try {
      const r = await shareFile(`aussie-trainer-nedelya-${week}-${stamp()}.json`, JSON.stringify(reportJson(report, dog, d), null, 2), 'application/json');
      if (r !== 'cancelled') toast('JSON сохранён');
    } catch (e) { toastError(e); }
  }

  return (
    <Page title="Отчёт для ИИ" sub={report ? `Неделя ${week} · ${fmtDay(report.period.from)} – ${fmtDay(report.period.to)}` : undefined} back="progress">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Предыдущая неделя" disabled={week <= 1} onClick={() => setWeek(week - 1)} className="press flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30"><LuChevronLeft size={22} aria-hidden /></button>
        <p className="num font-semibold">Неделя {week}</p>
        <button type="button" aria-label="Следующая неделя" disabled={week >= 12} onClick={() => setWeek(week + 1)} className="press flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30"><LuChevronRight size={22} aria-hidden /></button>
      </div>

      {!report ? <p className="text-ink-2">Неделя ещё не создана в программе.</p> : (
        <>
          <p className="mt-1 text-[0.92rem] text-ink-2">Скопируйте текст и вставьте в ChatGPT или Claude. Отчёт собран только из ваших записей — без примерных цифр.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="primary" onClick={copy} icon={<LuCopy size={18} aria-hidden />}>Копировать</Button>
            <Button onClick={share} icon={<LuShare2 size={18} aria-hidden />}>Поделиться</Button>
            <Button onClick={json} icon={<LuFileJson size={18} aria-hidden />}>JSON</Button>
          </div>
          <pre className="card mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-4 font-sans text-[0.9rem] leading-relaxed select-text" aria-label="Текст отчёта" tabIndex={0}>{text}</pre>

          {nextWeek <= 12 && program && (
            <>
              <SectionTitle>Корректировка недели {nextWeek}</SectionTitle>
              <section className="card p-4">
                <Field label="Рекомендации, полученные от ИИ" hint="Сохранятся как заметка к неделе. История тренировок не меняется.">
                  <textarea className="field min-h-28" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Вставьте сюда ответ чата" />
                </Field>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={() => saveWeekNote(program, nextWeek, note).then(() => toast('Заметка сохранена')).catch(toastError)}>Сохранить заметку</Button>
                  <Button size="sm" onClick={() => navigate(`program?view=week&w=${nextWeek}`)} icon={<LuCalendarDays size={16} aria-hidden />}>Править план недели {nextWeek}</Button>
                </div>
                <p className="mt-3 text-[0.82rem] text-ink-3">В плане недели откройте нужный день → «Изменить», чтобы поменять повторения, заменить или добавить упражнение.</p>
              </section>
            </>
          )}

          {history.length > 0 && (
            <>
              <SectionTitle>Ранее отправленные отчёты</SectionTitle>
              <ul className="card divide-y divide-line">
                {history.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    <button type="button" className="press flex min-h-12 w-full items-center justify-between px-4 text-left" onClick={async () => { if (await copyText(r.text)) toast('Отчёт скопирован'); }}>
                      <span>{fmtDateTime(r.createdAt)}</span><span className="text-[0.85rem] text-ink-2">Скопировать</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Page>
  );
}
