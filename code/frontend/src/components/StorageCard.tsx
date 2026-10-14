import { useState } from 'react';
import type { Artwork } from '@/adapters';
import { shortId } from '@/adapters';
import { useWallet } from '@/adapters/wallet-context';
import { extensionCostFrost, type StoredBlob, type WalrusEpoch } from '@/adapters/walrusStorage';
import { config } from '@/config';
import { firstLoad, useSharedBlobs, useWalrusEpoch } from '@/state/queries';
import { useRead } from '@/state/store';
import { extendStorage } from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import { Button } from './Button';
import { fmtBytes, fmtCoin, fmtDays, fmtInt } from './format';
import { Modal } from './Modal';
import { InfoNote, LoadingState, ScrollX, WarningNote } from './primitives';
import { TxDone, TxFeedback } from './TxFeedback';

function remainingMs(blob: StoredBlob, epoch: WalrusEpoch): number {
  return (blob.endEpoch - epoch.epoch) * epoch.epochDurationMs;
}

function fileLabel(artwork: Artwork, blob: StoredBlob): string {
  if (blob.blobId === artwork.imageBlobId) return 'Δημόσια εικόνα';
  if (blob.blobId === artwork.hiresBlobId) return 'Υψηλή ανάλυση (Seal)';
  if (blob.blobId === artwork.certificate?.documentationBlobId) return 'Τεκμηρίωση πιστοποιητικού';
  return 'Αρχείο';
}

export function StorageCard({ artwork }: { artwork: Artwork }) {
  const { address } = useWallet();
  const blobs = useSharedBlobs(artwork.storage);
  const epoch = useWalrusEpoch();
  const [extending, setExtending] = useState<StoredBlob | null>(null);

  if (!artwork.storage.length)
    return (
      <InfoNote>Η αποθήκευση αυτού του έργου δεν είναι συνδεδεμένη με το αντικείμενο.</InfoNote>
    );
  if (firstLoad(blobs, epoch)) return <LoadingState label="Ανάγνωση από το Walrus…" />;
  if (!epoch.data || !blobs.data)
    return <WarningNote>Η ανάγνωση από το Walrus απέτυχε. Δοκιμάστε ξανά σε λίγο.</WarningNote>;
  const now = epoch.data;

  return (
    <div className="flex flex-col gap-4">
      <ScrollX minWidth="40rem">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Αρχείο</th>
              <th className="py-2 pr-4 font-medium">Μέγεθος</th>
              <th className="py-2 pr-4 font-medium">Λήξη</th>
              <th className="py-2 pr-4 font-medium">Κεφάλαιο</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {blobs.data.map((b) => (
              <tr key={b.objectId} className="border-b border-border last:border-b-0">
                <td className="py-2.5 pr-4">
                  <div className="font-medium">{fileLabel(artwork, b)}</div>
                  <div className="font-mono2 text-xs text-muted-foreground" title={b.blobId}>
                    {shortId(b.blobId, 8, 6)}
                  </div>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono2">{fmtBytes(b.size)}</td>
                <td className="py-2.5 pr-4">
                  <Expiry blob={b} epoch={now} />
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono2">
                  {fmtCoin(b.fundsFrost, 'WAL')}
                </td>
                <td className="py-2.5 text-right">
                  {address ? (
                    <Button
                      onClick={() => setExtending(b)}
                      variant="outline"
                      size="xs"
                      icon="clock"
                    >
                      Παράταση
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      <InfoNote>
        {address
          ? 'Η πληρωμή της παράτασης μπαίνει μέσα στο αντικείμενο SharedBlob. Οποιοσδήποτε κάτοχος κλασμάτων ή ο ιδιοκτήτης μπορεί να το συμπληρώσει, χωρίς άδεια από τον καλλιτέχνη.'
          : 'Συνδέστε wallet για να παρατείνετε την αποθήκευση. Η πληρωμή μπαίνει μέσα στο αντικείμενο SharedBlob και οποιοσδήποτε μπορεί να το συμπληρώσει.'}
      </InfoNote>
      {extending ? (
        <ExtendStorageModal
          blob={extending}
          label={fileLabel(artwork, extending)}
          epoch={now}
          onClose={() => setExtending(null)}
        />
      ) : null}
    </div>
  );
}

export function Expiry({ blob, epoch }: { blob: StoredBlob; epoch: WalrusEpoch }) {
  const ms = remainingMs(blob, epoch);
  const soon = ms > 0 && ms < 14 * 86_400_000;
  return (
    <span className="whitespace-nowrap">
      epoch <span className="font-mono2">{fmtInt(blob.endEpoch)}</span>{' '}
      <span
        className={
          ms <= 0
            ? 'text-[hsl(var(--status-destroyed-fg))]'
            : soon
              ? 'text-[hsl(var(--status-damaged-fg))]'
              : 'text-muted-foreground'
        }
      >
        ({ms <= 0 ? fmtDays(ms) : `σε ${fmtDays(ms)}`})
      </span>
    </span>
  );
}

export function ExtendStorageModal({
  blob,
  label,
  epoch,
  onClose,
}: {
  blob: StoredBlob;
  label: string;
  epoch: WalrusEpoch;
  onClose: () => void;
}) {
  const tx = useTx();
  const [value, setValue] = useState(String(config.walrus.storageEpochs));
  const epochs = parseInt(value, 10);
  const valid = Number.isInteger(epochs) && epochs >= 1 && epochs <= 200;
  const costRead = useRead(valid ? `walrus:cost:${blob.size}:${epochs}` : null, () =>
    extensionCostFrost(blob.size, epochs),
  );
  const cost = costRead.data ?? null;
  const costError = costRead.error && cost == null;

  const title = `Παράταση αποθήκευσης: ${label}`;

  if (tx.digest)
    return (
      <Modal open onClose={onClose} title={title}>
        <TxDone
          message="Η αποθήκευση παρατάθηκε."
          digest={tx.digest}
          detail={`Το αρχείο μένει στο Walrus ως το epoch ${fmtInt(blob.endEpoch + epochs)}.`}
          onClose={onClose}
        />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && cost != null)
            void tx.run(() => extendStorage({ blob, epochs, frost: blob.shared ? cost : 0n }));
        }}
      >
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">Blob</dt>
          <dd className="break-all font-mono2 text-xs">{blob.blobId}</dd>
          <dt className="text-muted-foreground">Μέγεθος</dt>
          <dd className="font-mono2">{fmtBytes(blob.size)}</dd>
          <dt className="text-muted-foreground">Λήγει</dt>
          <dd>
            <Expiry blob={blob} epoch={epoch} />
          </dd>
          {blob.shared ? (
            <>
              <dt className="text-muted-foreground">Κεφάλαιο στο αντικείμενο</dt>
              <dd className="font-mono2">{fmtCoin(blob.fundsFrost, 'WAL')}</dd>
            </>
          ) : null}
        </dl>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Παράταση κατά</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={200}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28 border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
            />
            <span className="text-muted-foreground">
              epoch{valid ? ` (${fmtDays(epochs * epoch.epochDurationMs)})` : ''}
            </span>
          </span>
        </label>
        <p className="text-[13px]">
          Κόστος:{' '}
          <span className="font-mono2 font-medium">
            {!valid ? '…' : costError ? 'μη διαθέσιμο' : cost == null ? '…' : fmtCoin(cost, 'WAL')}
          </span>
        </p>
        <InfoNote>
          {blob.shared
            ? 'Το ποσό κατατίθεται στο αντικείμενο SharedBlob και από εκεί πληρώνεται η παράταση. Οποιοσδήποτε μπορεί να συμπληρώσει το κεφάλαιο.'
            : 'Το αντικείμενο Blob ανήκει στο wallet σας και η παράταση πληρώνεται από το WAL του.'}
        </InfoNote>
        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button type="submit" disabled={!valid || cost == null || tx.busy} icon="clock">
            Παράταση
          </Button>
        </div>
      </form>
    </Modal>
  );
}
