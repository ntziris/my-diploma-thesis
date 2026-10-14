import { useState } from 'react';
import { Link } from 'react-router';
import type { Artwork } from '@/adapters';
import type { WalrusEpoch } from '@/adapters/walrusStorage';
import { useSharedBlobs, useWalrusEpoch } from '@/state/queries';
import { Button } from './Button';
import { fmtCoin, fmtInt } from './format';
import { Modal } from './Modal';
import { EmptyState, MoreButton, ScrollX } from './primitives';
import { usePaged } from './usePaged';
import { Expiry, StorageCard } from './StorageCard';

export function StorageList({ artworks, empty }: { artworks: Artwork[]; empty: string }) {
  const epoch = useWalrusEpoch();
  const paged = usePaged(artworks);
  const [storageFor, setStorageFor] = useState<Artwork | null>(null);

  if (!artworks.length) return <EmptyState title={empty} />;

  return (
    <>
      <ScrollX minWidth="40rem">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Έργο</th>
              <th className="py-2 pr-4 font-medium">Αρχεία</th>
              <th className="py-2 pr-4 font-medium">Λήξη</th>
              <th className="whitespace-nowrap py-2 pr-4 font-medium">WAL κατατεθειμένα</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((a) => (
              <StorageRow
                key={a.id}
                artwork={a}
                epoch={epoch.data}
                onExtend={() => setStorageFor(a)}
              />
            ))}
          </tbody>
        </table>
      </ScrollX>
      <MoreButton remaining={paged.remaining} label="Περισσότερα" onMore={paged.more} />
      <Modal
        open={!!storageFor}
        onClose={() => setStorageFor(null)}
        title={`Αποθήκευση στο Walrus: ${storageFor?.title ?? ''}`}
        size="lg"
      >
        {storageFor ? <StorageCard artwork={storageFor} /> : null}
      </Modal>
    </>
  );
}

// Only mounted rows read their blobs, so paging bounds the Walrus requests
function StorageRow({
  artwork,
  epoch,
  onExtend,
}: {
  artwork: Artwork;
  epoch: WalrusEpoch | undefined;
  onExtend: () => void;
}) {
  const blobs = useSharedBlobs(artwork.storage);
  const linked = artwork.storage.length > 0;
  const list = blobs.data;
  const earliest = list?.length
    ? list.reduce((m, b) => (b.endEpoch < m.endEpoch ? b : m), list[0])
    : null;
  const funds = list?.reduce((n, b) => n + b.fundsFrost, 0n);
  const pending = linked && !list && !blobs.error;
  const failed = linked && !list && blobs.error;
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2.5 pr-4">
        <Link to={`/artwork/${artwork.id}`} className="font-medium hover:underline">
          {artwork.title}
        </Link>
        <div className="text-xs text-muted-foreground">{artwork.artistName}</div>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4">
        {linked ? (
          <span className="font-mono2">{fmtInt(artwork.storage.length)}</span>
        ) : (
          <span className="text-muted-foreground">χωρίς σύνδεση</span>
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4">
        {!linked ? (
          <span className="text-muted-foreground">-</span>
        ) : pending ? (
          '…'
        ) : failed || !earliest || !epoch ? (
          <span className="text-muted-foreground">μη διαθέσιμο</span>
        ) : (
          <Expiry blob={earliest} epoch={epoch} />
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4 font-mono2">
        {!linked ? (
          <span className="text-muted-foreground">-</span>
        ) : pending ? (
          '…'
        ) : funds == null ? (
          <span className="text-muted-foreground">μη διαθέσιμο</span>
        ) : (
          fmtCoin(funds, 'WAL')
        )}
      </td>
      <td className="py-2.5 text-right">
        {linked ? (
          <Button onClick={onExtend} variant="outline" size="xs" icon="clock">
            Παράταση
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
