import { useMemo, useState } from 'react';
import type { Artwork, Listing, Mist } from '@/adapters';
import { shortId } from '@/adapters';
import { buyFractions, createListing } from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import { useWallet } from '@/adapters/wallet-context';
import { isPrimarySale, paymentSplit } from '@/state/derive';
import type { ProtocolParams } from '@/adapters';
import { Modal } from './Modal';
import { PaymentBreakdown, PaymentReceipt } from './PaymentBreakdown';
import { TxDone, TxFeedback } from './TxFeedback';
import { WarningNote } from './primitives';
import { fmtSUI, fmtPct, fmtInt, parseSUI } from './format';
import { Button, ButtonLink } from './Button';

export function BuyModal({
  artwork,
  listings,
  params,
  open,
  onClose,
  initialListingId,
}: {
  artwork: Artwork | null;
  listings: Listing[];
  params: ProtocolParams;
  open: boolean;
  onClose: () => void;
  initialListingId?: string | null;
}) {
  const { address } = useWallet();
  const [listingId, setListingId] = useState<string | null>(null);
  const [qty, setQty] = useState('1');
  const tx = useTx();
  // Snapshot at purchase time, the selected listing may vanish once bought out
  const [receipt, setReceipt] = useState<{
    qty: number;
    sellerAmount: Mist;
    royaltyAmount: Mist;
    primary: boolean;
  } | null>(null);

  const listing = useMemo(() => {
    if (!listings.length) return null;
    return (
      listings.find((l) => l.id === listingId) ??
      listings.find((l) => l.id === initialListingId) ??
      listings[0]
    );
  }, [listings, listingId, initialListingId]);

  const cheapest = listings.length ? listings[0] : null;
  const cheaperExists =
    !!listing && !!cheapest && listing.pricePerFraction > cheapest.pricePerFraction;

  if (!artwork) return null;

  const qtyNum = Math.max(0, parseInt(qty, 10) || 0);
  const total = listing ? BigInt(qtyNum) * listing.pricePerFraction : 0n;
  const primary = !!listing && isPrimarySale(artwork, listing.seller);
  const split = paymentSplit(total, params, { primary });
  const ownListing = !!listing && !!address && listing.seller === address;
  const valid = !!listing && !ownListing && qtyNum > 0 && qtyNum <= listing.quantity;

  const submit = async () => {
    if (!address || !listing) return;
    const snapshot = {
      qty: qtyNum,
      sellerAmount: split.sellerAmount,
      royaltyAmount: split.royaltyAmount,
      primary,
    };
    const res = await tx.run(() =>
      buyFractions({ buyer: address, listingId: listing.id, quantity: qtyNum }),
    );
    if (res) setReceipt(snapshot);
  };

  const close = () => {
    tx.reset();
    setReceipt(null);
    setQty('1');
    setListingId(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={`Αγορά κλασμάτων: ${artwork.title}`}>
      {tx.digest && receipt ? (
        <TxDone
          message="Η αγορά ολοκληρώθηκε"
          digest={tx.digest}
          detail={
            <PaymentReceipt
              fractionsReceived={receipt.qty}
              fractionShare={fmtPct(receipt.qty, artwork.fractions?.total ?? 0)}
              sellerAmount={receipt.sellerAmount}
              royaltyAmount={receipt.royaltyAmount}
              primary={receipt.primary}
            />
          }
          action={
            <ButtonLink to="/portfolio#holdings" onClick={close}>
              Προβολή στο χαρτοφυλάκιο
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {!address ? (
            <WarningNote>Συνδέστε το wallet σας για να ολοκληρώσετε αγορά.</WarningNote>
          ) : null}
          {!listing ? (
            <WarningNote>Δεν υπάρχουν ενεργές αγγελίες για αυτό το έργο.</WarningNote>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="font-medium">Αγγελία</span>
                  <select
                    value={listing.id}
                    onChange={(e) => setListingId(e.target.value)}
                    className="border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
                  >
                    {listings.map((l) => (
                      <option key={l.id} value={l.id}>
                        {shortId(l.seller)} | {fmtInt(l.quantity)} κλάσματα προς{' '}
                        {fmtSUI(l.pricePerFraction)}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <span className="text-muted-foreground">Διαθέσιμα</span>
                  <div className="font-mono2 font-medium">{fmtInt(listing.quantity)} κλάσματα</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Τιμή / κλάσμα</span>
                  <div className="font-mono2 font-medium">{fmtSUI(listing.pricePerFraction)}</div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Ποσότητα *</span>
                  <input
                    type="number"
                    min={1}
                    max={listing.quantity}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-32 border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
                  />
                  {qty.trim() !== '' && qtyNum > listing.quantity ? (
                    <span className="text-xs text-[hsl(var(--destructive))]">
                      Η αγγελία διαθέτει μόνο {fmtInt(listing.quantity)} κλάσματα
                    </span>
                  ) : qty.trim() !== '' && qtyNum < 1 ? (
                    <span className="text-xs text-[hsl(var(--destructive))]">
                      Τουλάχιστον 1 κλάσμα
                    </span>
                  ) : null}
                </label>
              </div>

              {cheaperExists ? (
                <WarningNote>
                  Υπάρχουν φθηνότερες αγγελίες για το ίδιο έργο. Η χαμηλότερη τιμή αυτή τη στιγμή
                  είναι {fmtSUI(cheapest!.pricePerFraction)} ανά κλάσμα, από{' '}
                  {shortId(cheapest!.seller)}.{' '}
                  <button
                    type="button"
                    onClick={() => setListingId(cheapest!.id)}
                    className="font-medium underline decoration-dotted underline-offset-2"
                  >
                    Επιλογή της φθηνότερης
                  </button>
                </WarningNote>
              ) : null}

              {ownListing ? (
                <WarningNote>
                  Η αγγελία είναι δική σας. Αν θέλετε πίσω τα κλάσματα, ακυρώστε την από το
                  χαρτοφυλάκιο. Το συμβόλαιο απορρίπτει την αγορά της δικής σας αγγελίας.
                </WarningNote>
              ) : null}

              <PaymentBreakdown
                sellerAmount={split.sellerAmount}
                royaltyAmount={split.royaltyAmount}
                royaltyBps={params.royaltyBps}
                primary={primary}
                buyerIsArtist={!!address && artwork.artist === address}
              />

              <TxFeedback {...tx} pendingLabel="Υπογραφή στο wallet και εκτέλεση…" />

              <div className="flex justify-end gap-2">
                <Button onClick={close} variant="neutral">
                  Άκυρο
                </Button>
                <Button onClick={submit} disabled={!valid || !address || tx.busy}>
                  Αγορά
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export function SellModal({
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
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const tx = useTx();

  if (!artwork) return null;
  const qtyNum = parseInt(qty, 10) || 0;
  const priceMist = parseSUI(price);
  const priceInvalid = price.trim() !== '' && priceMist === null;
  const valid = qtyNum > 0 && qtyNum <= owned && priceMist !== null;

  const submit = () => {
    if (!address) return;
    void tx.run(() =>
      createListing({
        seller: address,
        artworkId: artwork.id,
        quantity: qtyNum,
        pricePerFraction: priceMist!,
      }),
    );
  };

  const close = () => {
    tx.reset();
    setQty('1');
    setPrice('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={`Πώληση κλασμάτων: ${artwork.title}`}>
      {tx.digest ? (
        <TxDone
          message="Η αγγελία δημιουργήθηκε"
          digest={tx.digest}
          onClose={close}
          detail="Τα κλάσματα δεσμεύτηκαν στην αγγελία. Σε κάθε πώληση το δικαίωμα παρακολούθησης του καλλιτέχνη καταβάλλεται αυτόματα εντός της ίδιας συναλλαγής."
          action={
            <ButtonLink to="/portfolio#listings" onClick={close}>
              Οι αγγελίες μου
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted-foreground">
            Διαθέσιμα προς πώληση:{' '}
            <span className="font-mono2 font-medium text-foreground">{fmtInt(owned)}</span> κλάσματα
          </p>
          <div className="flex gap-4">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">Ποσότητα *</span>
              <input
                type="number"
                min={1}
                max={owned}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-32 border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
              />
              {qty.trim() !== '' && qtyNum > owned ? (
                <span className="text-xs text-[hsl(var(--destructive))]">
                  Κατέχετε μόνο {fmtInt(owned)} κλάσματα
                </span>
              ) : qty.trim() !== '' && qtyNum < 1 ? (
                <span className="text-xs text-[hsl(var(--destructive))]">Τουλάχιστον 1 κλάσμα</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">Τιμή / κλάσμα (SUI) *</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="π.χ. 13,0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-32 border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
              />
              {priceInvalid ? (
                <span className="text-xs text-[hsl(var(--destructive))]">
                  Ποσό σε SUI, έως 9 δεκαδικά
                </span>
              ) : null}
            </label>
          </div>
          <TxFeedback {...tx} />
          <div className="flex justify-end gap-2">
            <Button onClick={close} variant="neutral">
              Άκυρο
            </Button>
            <Button onClick={submit} disabled={!valid || tx.busy}>
              Δημιουργία αγγελίας
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
