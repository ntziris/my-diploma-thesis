import type { TxResult } from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import { Modal } from './Modal';
import { TxDone, TxFeedback } from './TxFeedback';
import { Button } from './Button';

export function ConfirmAction({
  title,
  subject,
  detail,
  confirmLabel,
  doneMessage,
  destructive = false,
  run,
  onClose,
  onDone,
}: {
  title: string;
  subject: string;
  detail: string;
  confirmLabel: string;
  doneMessage: string;
  destructive?: boolean;
  run: () => Promise<TxResult>;
  onClose: () => void;
  onDone: () => void;
}) {
  const tx = useTx();

  if (tx.digest)
    return (
      <Modal open onClose={onDone} title={title}>
        <TxDone message={doneMessage} digest={tx.digest} onClose={onDone} />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title={`${title}: ${subject}`}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed">{detail}</p>
        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button
            variant={destructive ? 'danger-outline' : 'primary'}
            onClick={() => void tx.run(run)}
            disabled={tx.busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
