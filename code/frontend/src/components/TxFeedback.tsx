import type { ReactNode } from 'react';
import { TxPending } from './Modal';
import { WarningNote } from './primitives';
import { TxLink } from './TxLink';
import { Icon } from './Icon';
import { Button } from './Button';

export function TxFeedback({
  busy,
  digest,
  error,
  pendingLabel,
}: {
  busy: boolean;
  digest: string | null;
  error: string | null;
  pendingLabel?: string;
}) {
  if (busy) return <TxPending label={pendingLabel} />;
  if (error) return <WarningNote tone="red">{error}</WarningNote>;
  if (digest)
    return (
      <p className="fade-enter flex flex-wrap items-center gap-2 text-[13px] text-[hsl(var(--status-ok-fg))]">
        <Icon name="circle-check" size={13} className="shrink-0" />
        Καταγράφηκε στην αλυσίδα. <TxLink digest={digest} label="Προβολή στον SUI Explorer" />
      </p>
    );
  return null;
}

export function TxDone({
  message,
  digest,
  detail,
  action,
  onClose,
}: {
  message: string;
  digest: string;
  detail?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--status-ok-fg))]">
        <Icon name="circle-check" size={14} className="shrink-0" />
        {message}
      </p>
      {typeof detail === 'string' ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
      ) : (
        detail
      )}
      <TxFeedback busy={false} error={null} digest={digest} />
      {onClose || action ? (
        <div className="flex justify-end gap-2">
          {onClose ? (
            <Button variant={action ? 'neutral' : 'primary'} onClick={onClose}>
              Κλείσιμο
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
