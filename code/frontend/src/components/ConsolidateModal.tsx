import type { Artwork } from '@/adapters';
import { consolidate } from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import { useWallet } from '@/adapters/wallet-context';
import { Modal } from './Modal';
import { TxDone, TxFeedback } from './TxFeedback';
import { InfoNote } from './primitives';
import { Icon } from './Icon';
import { fmtInt } from './format';
import { Button } from './Button';

export function ConsolidateModal({
  artwork,
  owned,
  open,
  onClose,
}: {
  artwork: Artwork | null;
  owned: number;
  open: boolean;
  onClose: () => void;
}) {
  const { address } = useWallet();
  const tx = useTx();

  if (!artwork) return null;
  const total = artwork.fractions?.total ?? 0;
  const whole = total > 0 && owned >= total;

  const submit = () => {
    if (!address) return;
    void tx.run(() => consolidate({ holder: address, artworkId: artwork.id }));
  };

  const close = () => {
    tx.reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={`Ενοποίηση: ${artwork.title}`}>
      {tx.digest ? (
        <TxDone
          message="Η ενοποίηση ολοκληρώθηκε"
          digest={tx.digest}
          onClose={close}
          detail={`Τα ${fmtInt(total)} κλάσματα καταστράφηκαν και το θησαυροφυλάκιο έκλεισε. Το έργο έχει ξανά έναν ιδιοκτήτη, τη διεύθυνσή σας.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="micro-label mb-2">Προϋποθέσεις</p>
            <ul className="flex flex-col gap-1 text-[13px]">
              <li className={whole ? 'text-[hsl(var(--status-ok-fg))]' : 'text-muted-foreground'}>
                <Icon
                  name={whole ? 'circle-check' : 'circle-xmark'}
                  size={12}
                  className="mr-1 inline-block align-[-2px]"
                />
                Κατέχετε το σύνολο των κλασμάτων ({fmtInt(owned)} από {fmtInt(total)})
              </li>
            </ul>
          </div>

          <InfoNote>
            Όλα τα κλάσματά σας συγχωνεύονται μέσα στην ίδια συναλλαγή και καταστρέφονται. Μετά το
            έργο μπορεί να κλασματοποιηθεί ξανά ή να εξαργυρωθεί.
          </InfoNote>

          <TxFeedback {...tx} />

          <div className="flex justify-end gap-2">
            <Button onClick={close} variant="neutral">
              Άκυρο
            </Button>
            <Button onClick={submit} disabled={!whole || tx.busy}>
              Ενοποίηση
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
