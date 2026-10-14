import { useState } from 'react';
import type { Artwork } from '@/adapters';
import { requestRedemption } from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import { useWallet } from '@/adapters/wallet-context';
import { Modal, ConfirmWarning } from './Modal';
import { TxDone, TxFeedback } from './TxFeedback';
import { InfoNote, WarningNote } from './primitives';
import { Icon } from './Icon';
import { Button } from './Button';

export function RedeemRequestModal({
  artwork,
  open,
  onClose,
}: {
  artwork: Artwork | null;
  open: boolean;
  onClose: () => void;
}) {
  const { address } = useWallet();
  const [note, setNote] = useState('');
  const [accepted, setAccepted] = useState(false);
  const tx = useTx();

  if (!artwork) return null;
  const custodyOpen = !!artwork.custody && !artwork.custody.until;
  const notFractionalized = !artwork.fractions;

  const submit = () => {
    if (!address) return;
    void tx.run(() =>
      requestRedemption({ owner: address, artworkId: artwork.id, note: note.trim() }),
    );
  };

  const close = () => {
    tx.reset();
    setAccepted(false);
    setNote('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={`Αίτημα εξαργύρωσης: ${artwork.title}`}>
      {tx.digest ? (
        <TxDone
          message="Το αίτημα καταχωρίστηκε"
          digest={tx.digest}
          onClose={close}
          detail={`Η ${artwork.custody?.galleryName ?? 'γκαλερί φύλαξης'} βλέπει το αίτημα στον πίνακά της. Το έργο παραμένει δικό σας και σε φύλαξη μέχρι να επιβεβαιώσει την παράδοση. Μέχρι τότε τίποτα δεν έχει αλλάξει στην αλυσίδα πέρα από το ίδιο το αίτημα.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="micro-label mb-2">Προϋποθέσεις</p>
            <ul className="flex flex-col gap-1 text-[13px]">
              <li
                className={
                  notFractionalized ? 'text-[hsl(var(--status-ok-fg))]' : 'text-muted-foreground'
                }
              >
                <Icon
                  name={notFractionalized ? 'circle-check' : 'circle-xmark'}
                  size={12}
                  className="mr-1 inline-block align-[-2px]"
                />
                Μη κλασματοποιημένο έργο
              </li>
              <li
                className={
                  custodyOpen ? 'text-[hsl(var(--status-ok-fg))]' : 'text-muted-foreground'
                }
              >
                <Icon
                  name={custodyOpen ? 'circle-check' : 'circle-xmark'}
                  size={12}
                  className="mr-1 inline-block align-[-2px]"
                />
                Σε ενεργή φύλαξη
                {artwork.custody ? ` (${artwork.custody.galleryName})` : ''}
              </li>
            </ul>
          </div>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">Σημείωση προς τη γκαλερί</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="π.χ. παραλαβή από τον χώρο της γκαλερί, εντός του μήνα"
              className="border border-input bg-card px-3 py-2 outline-none focus:border-[hsl(var(--accent))]"
            />
            <span className="text-xs text-muted-foreground">
              <Icon name="circle-info" size={12} className="mr-1 inline-block align-[-2px]" />
              Καταγράφεται δημόσια στην αλυσίδα μαζί με το αίτημα.
            </span>
          </label>

          <InfoNote>
            Η παράδοση γίνεται εκτός αλυσίδας. Η γκαλερί επιβεβαιώνει ότι σας παρέδωσε το φυσικό
            έργο, και μόνο τότε κλείνει η φύλαξη.
          </InfoNote>

          <ConfirmWarning
            checkboxLabel="Κατανοώ ότι η εξαργύρωση κλείνει οριστικά την καταχώριση του έργου"
            checked={accepted}
            onChecked={setAccepted}
          >
            <WarningNote>
              Με την επιβεβαίωση της γκαλερί το έργο περνά σε τελική κατάσταση: δεν
              κλασματοποιείται, δεν πωλείται και δεν δέχεται καμία άλλη πράξη. Η σελίδα του
              παραμένει δημόσια ως ιστορικό, με το πιστοποιητικό και όλη την προέλευση.
            </WarningNote>
          </ConfirmWarning>

          <TxFeedback {...tx} />

          <div className="flex justify-end gap-2">
            <Button onClick={close} variant="neutral">
              Άκυρο
            </Button>
            <Button
              onClick={submit}
              disabled={!accepted || !custodyOpen || !notFractionalized || tx.busy}
            >
              Υποβολή αιτήματος
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
