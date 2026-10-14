import { MIST_PER_SUI, type Mist } from '@/adapters';

const intFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 });

export function fmtSUI(mist: Mist): string {
  return fmtCoin(mist, 'SUI');
}

// SUI and WAL both use nine decimals (MIST and FROST)
export function fmtCoin(units: bigint, symbol: string): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / MIST_PER_SUI;
  const frac = (abs % MIST_PER_SUI).toString().padStart(9, '0').replace(/0+$/, '');
  const decimals = frac.length ? frac : '0';
  return `${negative ? '-' : ''}${intFmt.format(whole)},${decimals} ${symbol}`;
}

export function parseSUI(input: string): Mist | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,9})?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  const mist = BigInt(whole) * MIST_PER_SUI + BigInt(frac.padEnd(9, '0'));
  return mist > 0n ? mist : null;
}

export function fmtInt(v: number): string {
  return intFmt.format(v);
}

export function fmtPct(part: number, total: number): string {
  if (!total) return '0%';
  const pct = (part / total) * 100;
  const rounded =
    Math.abs(pct - Math.round(pct)) < 0.05 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(rounded)}%`;
}

export function fmtBps(bps: number): string {
  return `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 }).format(bps / 100)}%`;
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

// Local time, in the same ISO-like shape as fmtDate: "2026-08-30 18:57"
export function fmtDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtAgo(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 60) return s === 1 ? 'πριν 1 δευτερόλεπτο' : `πριν ${s} δευτερόλεπτα`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? 'πριν 1 λεπτό' : `πριν ${m} λεπτά`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'πριν 1 ώρα' : `πριν ${h} ώρες`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'πριν 1 ημέρα' : `πριν ${d} ημέρες`;
}

export function fmtWindow(ms: number): string {
  const m = ms / 60_000;
  if (m >= 1) return m === 1 ? '1 λεπτό' : `${Number.isInteger(m) ? m : m.toFixed(1)} λεπτά`;
  const sec = Math.round(ms / 1000);
  return sec === 1 ? '1 δευτερόλεπτο' : `${sec} δευτερόλεπτα`;
}

export function fmtDays(ms: number): string {
  if (ms <= 0) return 'έληξε';
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return 'λιγότερο από 1 ημέρα';
  return d === 1 ? '1 ημέρα' : `${intFmt.format(d)} ημέρες`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${intFmt.format(n)} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(v)} ${units[i]}`;
}
