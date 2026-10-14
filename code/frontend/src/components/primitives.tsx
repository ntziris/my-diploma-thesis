import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';

const SECTION_TONE = {
  neutral: { header: 'bg-transparent', icon: 'text-[hsl(var(--accent))]' },
  ok: {
    header: 'bg-[hsl(var(--status-ok-bg))] text-[hsl(var(--status-ok-fg))]',
    icon: 'text-[hsl(var(--status-ok-fg))]',
  },
  alert: {
    header: 'bg-[hsl(var(--status-destroyed-bg))] text-[hsl(var(--status-destroyed-fg))]',
    icon: 'text-[hsl(var(--status-destroyed-fg))]',
  },
} as const;

export type SectionTone = keyof typeof SECTION_TONE;

export function Section({
  id,
  title,
  icon,
  note,
  tone = 'neutral',
  children,
  className,
}: {
  id?: string;
  title: string;
  icon?: IconName;
  note?: string;
  tone?: SectionTone;
  children: ReactNode;
  className?: string;
}) {
  const t = SECTION_TONE[tone];
  return (
    <section id={id} className={cn('scroll-mt-20 border border-border bg-card', className)}>
      <header className={cn('border-b border-border px-5 py-3', t.header)}>
        <h2 className="micro-label flex items-center gap-2">
          {icon ? <Icon name={icon} size={13} className={cn('shrink-0', t.icon)} /> : null}
          {title}
        </h2>
      </header>
      <div className="px-5 py-4">
        {children}
        {note ? (
          <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <Icon name="circle-info" size={13} className="mt-0.5 shrink-0" />
            <span>{note}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

// Page shell; without a title it is the bare wrapper for loading and empty screens
export function Page({
  title,
  intro,
  children,
}: {
  title?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {title ? (
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {intro ? (
            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="fade-enter flex flex-col items-center gap-2 border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="font-display text-lg text-foreground">{title}</p>
      {hint ? (
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Φόρτωση από την αλυσίδα…' }: { label?: string }) {
  return (
    <div className="fade-enter flex items-center gap-3 border border-dashed border-border bg-card px-6 py-10">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function WarningNote({
  children,
  tone = 'amber',
}: {
  children: ReactNode;
  tone?: 'amber' | 'red';
}) {
  return (
    <div
      className={cn(
        'fade-enter flex gap-2 border px-3 py-2 text-[13px] leading-relaxed',
        tone === 'amber'
          ? 'border-[hsl(var(--status-damaged-border))] bg-[hsl(var(--status-damaged-bg))] text-[hsl(var(--status-damaged-fg))]'
          : 'border-[hsl(var(--status-destroyed-border))] bg-[hsl(var(--status-destroyed-bg))] text-[hsl(var(--status-destroyed-fg))]',
      )}
    >
      <Icon name="triangle-exclamation" size={14} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
      <Icon name="circle-info" size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ScrollX({
  minWidth = '44rem',
  children,
  className,
}: {
  minWidth?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('-mx-5 overflow-x-auto px-5', className)}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

export function MoreButton({
  remaining,
  label,
  onMore,
  countKnown = true,
}: {
  remaining: number;
  label: string;
  onMore: () => void;
  countKnown?: boolean;
}) {
  if (remaining <= 0) return null;
  return (
    <div className="mt-3">
      <Button onClick={onMore} variant="neutral" icon="arrow-down">
        {countKnown ? `${label} (${remaining} ακόμη)` : label}
      </Button>
    </div>
  );
}
