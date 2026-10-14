import { fmtInt } from '@/components/format';
import { useState } from 'react';
import type { Artwork } from '@/adapters';
import { fractionalize } from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import { useWallet } from '@/adapters/wallet-context';
import { Modal, ConfirmWarning } from './Modal';
import { TxDone, TxFeedback } from './TxFeedback';
import { WarningNote } from './primitives';
import { Icon } from './Icon';
import { Button } from './Button';

export function FractionalizeModal({
  artwork,
  open,
  onClose,
}: {
  artwork: Artwork | null;
  open: boolean;
  onClose: () => void;
}) {
  const { address } = useWallet();
  const [total, setTotal] = useState('1000');
  const [accepted, setAccepted] = useState(false);
  const tx = useTx();

  if (!artwork) return null;
  const inCustody = !!artwork.custody;
  const certified = !!artwork.certificate;
  const totalNum = parseInt(total, 10);
  const totalValid = Number.isFinite(totalNum) && totalNum > 0;

  const submit = () => {
    if (!address) return;
    void tx.run(() => fractionalize({ artist: address, artworkId: artwork.id, total: totalNum }));
  };

  const close = () => {
    tx.reset();
    setAccepted(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={`Κλασματοποίηση: ${artwork.title}`}>
      {tx.digest ? (
        <TxDone
          message="Η κλασματοποίηση ολοκληρώθηκε"
          digest={tx.digest}
          onClose={close}
          detail={`Εκδόθηκαν ${fmtInt(totalNum)} κλάσματα.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="micro-label mb-2">Προϋποθέσεις</p>
            <ul className="flex flex-col gap-1 text-[13px]">
              <li
                className={inCustody ? 'text-[hsl(var(--status-ok-fg))]' : 'text-muted-foreground'}
              >
                <Icon
                  name={inCustody ? 'circle-check' : 'circle-xmark'}
                  size={12}
                  className="mr-1 inline-block align-[-2px]"
                />
                Σε φύλαξη{artwork.custody ? ` (${artwork.custody.galleryName})` : ''}
              </li>
              <li
                className={certified ? 'text-[hsl(var(--status-ok-fg))]' : 'text-muted-foreground'}
              >
                <Icon
                  name={certified ? 'circle-check' : 'circle-xmark'}
                  size={12}
                  className="mr-1 inline-block align-[-2px]"
                />
                Έχει εκδοθεί πιστοποιητικό γνησιότητας
              </li>
            </ul>
          </div>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">Πλήθος κλασμάτων *</span>
            <input
              type="number"
              min={1}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="w-40 border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
            />
            <span className="text-xs text-muted-foreground">
              <Icon name="circle-info" size={12} className="mr-1 inline-block align-[-2px]" />
              Το πλήθος ορίζεται μία φορά και δεν αλλάζει ποτέ.
            </span>
          </label>

          <ConfirmWarning
            checkboxLabel="Κατανοώ τους όρους αναστροφής της κλασματοποίησης"
            checked={accepted}
            onChecked={setAccepted}
          >
            <WarningNote>
              Η αναστροφή απαιτεί το σύνολο των κλασμάτων. Το έργο δεν θα έχει πλέον έναν ιδιοκτήτη.
              Η ενοποίηση και η εξαργύρωση θα είναι δυνατές μόνο για όποιον συγκεντρώσει το 100% των
              κλασμάτων, και ένας μεμονωμένος κάτοχος μπορεί να την εμποδίσει.
            </WarningNote>
          </ConfirmWarning>

          <TxFeedback {...tx} />

          <div className="flex justify-end gap-2">
            <Button onClick={close} variant="neutral">
              Άκυρο
            </Button>
            <Button
              onClick={submit}
              disabled={!accepted || !totalValid || !inCustody || !certified || tx.busy}
            >
              Κλασματοποίηση
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
