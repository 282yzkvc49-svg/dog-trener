// Лаконичные SVG-графики: одна ось, тонкие линии, разрывы на днях без данных,
// подсказка по касанию, легенда для нескольких рядов и табличный вид для VoiceOver.

import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';

export interface Series { name: string; color: string; values: (number | null)[]; n?: (number | null)[] }

const W = 340;
const PAD = { l: 30, r: 12, t: 12, b: 22 };

function xTicks(n: number) {
  const step = Math.max(1, Math.ceil(n / 7));
  return (i: number) => i % step === 0 || i === n - 1;
}

function Legend({ series }: { series: { name: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem] text-ink-2" aria-hidden>
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ labels, series, unit, labelTitle }: { labels: string[]; series: Series[]; unit: string; labelTitle: string }) {
  return (
    <details className="mt-2 text-[0.85rem]">
      <summary className="press inline-flex min-h-10 cursor-pointer items-center rounded-lg px-1 text-ink-2">Показать таблицу</summary>
      <div className="mt-1 max-h-64 overflow-auto rounded-xl bg-surface-2">
        <table className="w-full text-left">
          <thead><tr className="text-ink-2"><th className="px-3 py-2 font-medium">{labelTitle}</th>{series.map((s) => <th key={s.name} className="px-3 py-2 font-medium">{s.name}</th>)}</tr></thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l + i} className="border-t border-line">
                <td className="px-3 py-1.5">{l}</td>
                {series.map((s) => <td key={s.name} className="num px-3 py-1.5">{s.values[i] === null ? '—' : `${s.values[i]}${unit}`}{s.n?.[i] ? <span className="text-ink-3"> · {s.n[i]}</span> : null}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Tooltip({ x, label, rows }: { x: number; label: string; rows: ReactNode[] }) {
  const left = Math.min(Math.max(x / W * 100, 18), 82);
  return (
    <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-[0.8rem] leading-tight text-paper shadow-card" style={{ left: `${left}%` }}>
      <div className="font-semibold">{label}</div>
      {rows}
    </div>
  );
}

export function LineChart(p: { labels: string[]; series: Series[]; yMax?: number; unit?: string; height?: number; caption: string; tooltipLabels?: string[]; labelTitle?: string }) {
  const H = p.height ?? 150;
  const unit = p.unit ?? '%';
  const n = p.labels.length;
  const allVals = p.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const yMax = p.yMax ?? Math.max(2, Math.ceil(Math.max(0, ...allVals) * 1.15 / 2) * 2);
  const ix = (i: number) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const iy = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const [sel, setSel] = useState<number | null>(null);
  const tick = xTicks(n);
  const grid = [0, yMax / 2, yMax];
  const empty = !allVals.length;

  return (
    <figure className="relative m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full touch-pan-y" role="img" aria-label={p.caption}
        onPointerLeave={() => setSel(null)}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={iy(g)} y2={iy(g)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.l - 6} y={iy(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)">{Math.round(g)}{unit === '%' ? '' : ''}</text>
          </g>
        ))}
        {p.labels.map((l, i) => tick(i) && <text key={i} x={ix(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{l}</text>)}
        {sel !== null && <line x1={ix(sel)} x2={ix(sel)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />}
        {p.series.map((s) => {
          const segs: string[] = [];
          let cur = '';
          s.values.forEach((v, i) => {
            if (v === null) { if (cur) segs.push(cur); cur = ''; return; }
            cur += `${cur ? 'L' : 'M'}${ix(i).toFixed(1)},${iy(v).toFixed(1)}`;
          });
          if (cur) segs.push(cur);
          return (
            <g key={s.name}>
              {segs.map((d, k) => <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
              {s.values.map((v, i) => v === null ? null : (
                <circle key={i} cx={ix(i)} cy={iy(v)} r={sel === i ? 5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          );
        })}
        {p.labels.map((_, i) => (
          <rect key={i} x={ix(i) - (W - PAD.l - PAD.r) / Math.max(1, n - 1) / 2} y={0} width={(W - PAD.l - PAD.r) / Math.max(1, n - 1)} height={H} fill="transparent"
            onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i)} />
        ))}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--ink-3)">Нет данных за период</text>}
      </svg>
      {sel !== null && (
        <Tooltip x={ix(sel)} label={p.tooltipLabels?.[sel] ?? p.labels[sel]}
          rows={p.series.map((s) => (
            <div key={s.name} className="mt-0.5 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {p.series.length > 1 && <span className="opacity-80">{s.name}:</span>}
              <span className="num">{s.values[sel] === null ? 'нет данных' : `${s.values[sel]}${unit}`}</span>
              {s.n?.[sel] ? <span className="opacity-70">· {s.n[sel]} попыт.</span> : null}
            </div>
          ))} />
      )}
      <Legend series={p.series} />
      <DataTable labels={p.tooltipLabels ?? p.labels} series={p.series} unit={unit} labelTitle={p.labelTitle ?? 'Дата'} />
    </figure>
  );
}

export function BarChart(p: { labels: string[]; series: Series[]; stacked?: boolean; unit?: string; height?: number; caption: string; tooltipLabels?: string[]; labelTitle?: string; yMax?: number }) {
  const H = p.height ?? 150;
  const unit = p.unit ?? '';
  const n = p.labels.length;
  const totals = p.labels.map((_, i) => p.stacked ? p.series.reduce((s, x) => s + (x.values[i] ?? 0), 0) : Math.max(0, ...p.series.map((x) => x.values[i] ?? 0)));
  const yMax = p.yMax ?? Math.max(2, Math.ceil(Math.max(0, ...totals) * 1.15 / 2) * 2);
  const band = (W - PAD.l - PAD.r) / Math.max(1, n);
  const bw = Math.max(3, Math.min(22, band * (p.stacked ? 0.62 : 0.8) / (p.stacked ? 1 : p.series.length)));
  const iy = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const base = iy(0);
  const [sel, setSel] = useState<number | null>(null);
  const tick = xTicks(n);
  const empty = totals.every((t) => t === 0);

  const rounded = (x: number, y: number, w: number, h: number, round: boolean) => {
    if (h <= 0) return '';
    const r = round ? Math.min(4, w / 2, h) : 0;
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };

  return (
    <figure className="relative m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full touch-pan-y" role="img" aria-label={p.caption} onPointerLeave={() => setSel(null)}>
        {[0, yMax / 2, yMax].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={iy(g)} y2={iy(g)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.l - 6} y={iy(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)">{Math.round(g)}</text>
          </g>
        ))}
        {p.labels.map((l, i) => {
          const cx = PAD.l + band * i + band / 2;
          let acc = 0;
          const parts = p.series.map((s, k) => {
            const v = s.values[i] ?? 0;
            if (p.stacked) {
              const y0 = iy(acc), y1 = iy(acc + v);
              acc += v;
              const isTop = p.series.slice(k + 1).every((x) => !(x.values[i] ?? 0));
              const gap = k > 0 && v > 0 ? 2 : 0;
              return <path key={s.name} d={rounded(cx - bw / 2, y1, bw, y0 - y1 - gap, isTop)} fill={s.color} />;
            }
            const x = cx - (bw * p.series.length + 2 * (p.series.length - 1)) / 2 + k * (bw + 2);
            return <path key={s.name} d={rounded(x, iy(v), bw, base - iy(v), true)} fill={s.color} />;
          });
          return (
            <g key={i} opacity={sel === null || sel === i ? 1 : 0.55}>
              {parts}
              {tick(i) && <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{l}</text>}
              <rect x={cx - band / 2} y={0} width={band} height={H} fill="transparent" onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i)} />
            </g>
          );
        })}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--ink-3)">Нет данных за период</text>}
      </svg>
      {sel !== null && (
        <Tooltip x={PAD.l + band * sel + band / 2} label={p.tooltipLabels?.[sel] ?? p.labels[sel]}
          rows={p.series.map((s) => (
            <div key={s.name} className="mt-0.5 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="opacity-80">{s.name}:</span><span className="num">{s.values[sel] === null ? 'нет данных' : `${s.values[sel]}${unit}`}</span>
            </div>
          ))} />
      )}
      <Legend series={p.series} />
      <DataTable labels={p.tooltipLabels ?? p.labels} series={p.series} unit={unit} labelTitle={p.labelTitle ?? 'Дата'} />
    </figure>
  );
}

export function Stat(p: { label: string; value: ReactNode; sub?: ReactNode; className?: string; color?: string }) {
  return (
    <div className={clsx('card p-4', p.className)}>
      <div className="text-[0.82rem] leading-tight text-ink-2">{p.label}</div>
      <div className="num mt-1 text-[1.6rem] font-semibold leading-none" style={p.color ? { color: p.color } : undefined}>{p.value}</div>
      {p.sub && <div className="mt-1 text-[0.78rem] leading-tight text-ink-3">{p.sub}</div>}
    </div>
  );
}
