import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ChainEvent } from '@/adapters';
import { StatusBadge } from './StatusBadge';
import { AddressLink } from './TxLink';
import { fmtDate } from './format';
import { cn } from '@/lib/utils';

export function AttentionRow({
  event,
  artworkTitle,
  pending,
  action,
}: {
  event: ChainEvent;
  artworkTitle: string;
  pending: boolean;
  action?: ReactNode;
}) {
  return (
    <li
      className={cn(
        'grid grid-cols-[6.5rem_1fr_10rem_9.5rem_auto] items-center gap-3 border-b border-border px-4 py-3 text-[13px] last:border-b-0',
        pending && 'bg-[hsl(var(--status-damaged-bg)/0.35)]',
      )}
    >
      <span className="font-mono2 text-xs text-muted-foreground">{fmtDate(event.at)}</span>
      {event.artworkId ? (
        <Link to={`/artwork/${event.artworkId}`} className="font-medium hover:underline">
          {artworkTitle}
        </Link>
      ) : (
        <span className="font-medium">{artworkTitle}</span>
      )}
      <span>{event.condition ? <StatusBadge condition={event.condition} /> : null}</span>
      <span className="font-mono2 text-xs">
        {event.source ? <AddressLink address={event.source} short /> : null}
      </span>
      <span className="text-right">{action}</span>
    </li>
  );
}
