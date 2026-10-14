import type { StatusCondition } from '@/adapters';
import { statusLabel } from '@/state/derive';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';

const tone: Record<StatusCondition, { fg: string; bg: string; border: string; icon: IconName }> = {
  ok: {
    fg: 'var(--status-ok-fg)',
    bg: 'var(--status-ok-bg)',
    border: 'var(--status-ok-border)',
    icon: 'circle-check',
  },
  damaged: {
    fg: 'var(--status-damaged-fg)',
    bg: 'var(--status-damaged-bg)',
    border: 'var(--status-damaged-border)',
    icon: 'triangle-exclamation',
  },
  destroyed: {
    fg: 'var(--status-destroyed-fg)',
    bg: 'var(--status-destroyed-bg)',
    border: 'var(--status-destroyed-border)',
    icon: 'circle-xmark',
  },
  missing: {
    fg: 'var(--status-missing-fg)',
    bg: 'var(--status-missing-bg)',
    border: 'var(--status-missing-border)',
    icon: 'circle-question',
  },
};

export function StatusBadge({
  condition,
  className,
  bare = false,
}: {
  condition: StatusCondition;
  className?: string;
  bare?: boolean;
}) {
  const t = tone[condition];
  if (bare) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 whitespace-nowrap font-medium', className)}
        style={{ color: `hsl(${t.fg})` }}
      >
        <Icon name={t.icon} size={12} className="shrink-0" />
        {statusLabel(condition)}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex w-[9.5rem] max-w-full items-center justify-center gap-1.5 whitespace-nowrap border px-2.5 py-1 text-xs font-semibold leading-none',
        className,
      )}
      style={{
        color: `hsl(${t.fg})`,
        backgroundColor: `hsl(${t.bg})`,
        borderColor: `hsl(${t.border})`,
      }}
    >
      <Icon name={t.icon} size={12} className="shrink-0" />
      {statusLabel(condition)}
    </span>
  );
}
