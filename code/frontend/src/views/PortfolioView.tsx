import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  firstLoad,
  useArtworks,
  useGalleries,
  useHeldWorks,
  useHoldings,
  useNotices,
  useRoyaltiesOf,
  useSellerListings,
  useWorks,
} from '@/state/queries';
import { useWallet } from '@/adapters/wallet-context';
import { isLost, isTerminal } from '@/state/derive';
import { burnFractions, cancelListing, cancelMint, withdrawRedemption } from '@/tx/transactions';
import {
  Section,
  EmptyState,
  LoadingState,
  MoreButton,
  ScrollX,
  Page,
} from '@/components/primitives';
import { usePaged } from '@/components/usePaged';
import { ConfirmAction } from '@/components/ConfirmAction';
import { FractionalizeModal } from '@/components/FractionalizeModal';
import { ConsolidateModal } from '@/components/ConsolidateModal';
import { RedeemRequestModal } from '@/components/RedeemModal';
import { SellModal } from '@/components/TradeModal';
import { StorageList } from '@/components/StorageList';
import { PageWithNav } from '@/components/SectionNav';
import { fmtSUI, fmtInt, fmtPct, fmtDate } from '@/components/format';
import { Icon } from '@/components/Icon';
import { shortId, type Artwork } from '@/adapters';
import { Button, ButtonLink } from '@/components/Button';

type UndoTarget =
  | { kind: 'listing'; id: string; title: string; quantity: number }
  | { kind: 'mint'; id: string; title: string }
  | { kind: 'redemption'; id: string; title: string }
  | { kind: 'burn'; id: string; title: string; fractionIds: string[] };

function undoCopy(t: UndoTarget) {
  switch (t.kind) {
    case 'listing':
      return {
        title: 'Ακύρωση αγγελίας',
        subject: t.title,
        detail:
          `Η αγγελία κλείνει και τα ${fmtInt(t.quantity)} δεσμευμένα κλάσματα επιστρέφουν ` +
          'στο χαρτοφυλάκιό σας ως νέο κλάσμα. Μπορείτε να τα ξαναθέσετε προς πώληση όποτε θέλετε.',
        confirmLabel: 'Ακύρωση αγγελίας',
        doneMessage: 'Η αγγελία ακυρώθηκε και τα κλάσματα επέστρεψαν.',
      };
    case 'mint':
      return {
        title: 'Ακύρωση έκδοσης',
        subject: t.title,
        detail:
          'Το έργο περνά σε τελική κατάσταση και δεν μπορεί να ξαναχρησιμοποιηθεί. ' +
          'Η ακύρωση επιτρέπεται μόνο όσο καμία γκαλερί δεν έχει καταχωρίσει παραλαβή. ' +
          'Τα αρχεία μένουν στο Walrus, το έργο όμως φεύγει οριστικά από τον κατάλογο.',
        confirmLabel: 'Ακύρωση έκδοσης',
        doneMessage: 'Η έκδοση ακυρώθηκε.',
        destructive: true,
      };
    case 'redemption':
      return {
        title: 'Απόσυρση αιτήματος',
        subject: t.title,
        detail:
          'Το αίτημα εξαργύρωσης αποσύρεται και η γκαλερί δεν θα μπορεί να επιβεβαιώσει παράδοση. ' +
          'Το έργο μένει σε φύλαξη και μπορείτε να ζητήσετε εξαργύρωση ξανά.',
        confirmLabel: 'Απόσυρση αιτήματος',
        doneMessage: 'Το αίτημα αποσύρθηκε.',
      };
    case 'burn':
      return {
        title: 'Διαγραφή κλάσματος',
        subject: t.title,
        detail:
          'Το κλάσμα δεν αντιστοιχεί πλέον σε έργο του πραγματικού κόσμου. ' +
          'Η διαγραφή το αφαιρεί οριστικά από το wallet σας. Δεν υπάρχει μηχανισμός αποζημίωσης στην εφαρμογή.',
        confirmLabel: 'Διαγραφή κλάσματος',
        doneMessage: 'Το κλάσμα διαγράφηκε από το wallet σας.',
        destructive: true,
      };
  }
}

export function PortfolioView() {
  const { address } = useWallet();
  const galleries = useGalleries();
  const activeGalleries = useMemo(
    () => new Set((galleries.data ?? []).filter((g) => g.active).map((g) => g.address)),
    [galleries.data],
  );
  const [fractionalizeFor, setFractionalizeFor] = useState<Artwork | null>(null);
  const [sellFor, setSellFor] = useState<Artwork | null>(null);
  const [redeemFor, setRedeemFor] = useState<Artwork | null>(null);
  const [consolidateFor, setConsolidateFor] = useState<Artwork | null>(null);
  const [undoing, setUndoing] = useState<UndoTarget | null>(null);

  const holdings = useHoldings(address);
  const heldWorks = useHeldWorks(address);
  const notices = useNotices();
  const listings = useSellerListings(address);
  const issued = useWorks('artist', address);
  const owned = useWorks('owner', address);
  const royalties = useRoyaltiesOf(address);

  const myWorks = useMemo(() => {
    const map = new Map<string, Artwork>();
    for (const a of [...(issued.data ?? []), ...(owned.data ?? [])]) map.set(a.id, a);
    return [...map.values()].sort((a, b) => b.mintedAt.localeCompare(a.mintedAt));
  }, [issued.data, owned.data]);
  const listedIds = useMemo(
    () => [...new Set((listings.data ?? []).map((l) => l.artworkId))].sort(),
    [listings.data],
  );
  const listedWorks = useArtworks(listedIds);
  // Works whose storage the user has a stake in: own or issued works plus works behind held fractions
  const storageWorks = useMemo(() => {
    const map = new Map<string, Artwork>();
    for (const a of [...myWorks, ...(heldWorks.data ?? [])]) if (!isTerminal(a)) map.set(a.id, a);
    return [...map.values()];
  }, [myWorks, heldWorks.data]);
  const pagedHoldings = usePaged(holdings);
  const pagedListings = usePaged(listings.data ?? []);
  const pagedWorks = usePaged(myWorks);

  const artworkOf = (id: string) =>
    (heldWorks.data ?? []).find((a) => a.id === id) ??
    myWorks.find((a) => a.id === id) ??
    (listedWorks.data ?? []).find((a) => a.id === id);

  if (!address) {
    return (
      <Page>
        <EmptyState
          title="Συνδέστε το wallet σας"
          hint="Το χαρτοφυλάκιο δείχνει τα κλάσματα, τις αγγελίες και τα έργα που σχετίζονται με τη διεύθυνσή σας. Η ταυτοποίηση γίνεται μόνο μέσω wallet, χωρίς εγγραφή."
        />
      </Page>
    );
  }

  if (firstLoad(issued, owned, listings, galleries)) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }

  const myListings = listings.data ?? [];
  const isArtist = (issued.data ?? []).length > 0;

  return (
    <>
      <PageWithNav title="Χαρτοφυλάκιο" sections={PORTFOLIO_SECTIONS}>
        <Section
          id="notifications"
          title="Ειδοποιήσεις"
          icon="bell"
          note="Παράγονται από τα δημόσια events και αντικείμενα της αλυσίδας, για τα έργα που σας αφορούν."
        >
          {notices.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Δεν υπάρχει κάτι που απαιτεί την προσοχή σας.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notices.map((n) => (
                <li
                  key={n.id}
                  className="flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-2.5 text-[13px]"
                >
                  <Icon
                    name="triangle-exclamation"
                    size={12}
                    className="shrink-0 text-[hsl(var(--status-damaged-fg))]"
                  />
                  <Link to={`/artwork/${n.artworkId}`} className="font-medium hover:underline">
                    {n.title}
                  </Link>
                  <span className="text-muted-foreground">
                    {n.detail} ({fmtDate(n.at)})
                  </span>
                  <ButtonLink
                    to={`/artwork/${n.artworkId}`}
                    variant="outline"
                    size="xs"
                    icon="arrow-right"
                    className="ml-auto"
                  >
                    Μετάβαση
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="holdings" title="Τα κλάσματά μου" icon="cubes">
          {holdings.length === 0 ? (
            <EmptyState
              title="Δεν κατέχετε κλάσματα ακόμη"
              hint="Ανοίξτε ένα κλασματοποιημένο έργο από τον κατάλογο και επιλέξτε «Αγορά κλασμάτων». Θα δείτε την ανάλυση πληρωμής πριν υπογράψετε."
              action={
                <ButtonLink
                  to="/catalogue"
                  variant="outline"
                  iconRight="arrow-right"
                  className="mt-2"
                >
                  Μετάβαση στον κατάλογο
                </ButtonLink>
              }
            />
          ) : (
            <ScrollX minWidth="46rem">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Έργο</th>
                    <th className="py-2 pr-4 font-medium">Κλάσματα</th>
                    <th className="py-2 pr-4 font-medium">Μερίδιο</th>
                    <th className="py-2 pr-4 font-medium">Τελευταία τιμή</th>
                    <th className="py-2 pr-4 font-medium">Αξία</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {pagedHoldings.rows.map((h) => {
                    const art = artworkOf(h.artworkId);
                    if (!art) return null;
                    const price = art.market.lastPrice;
                    const total = art.fractions?.total ?? null;
                    const full = total != null && h.amount >= total;
                    const closed = isTerminal(art);
                    return (
                      <tr key={h.artworkId} className="border-b border-border last:border-b-0">
                        <td className="py-2.5 pr-4">
                          <Link to={`/artwork/${art.id}`} className="font-medium hover:underline">
                            {art.title}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 font-mono2">
                          {fmtInt(h.amount)}
                          {total != null ? ` / ${fmtInt(total)}` : ''}
                        </td>
                        <td className="py-2.5 pr-4 font-mono2">
                          {total != null ? fmtPct(h.amount, total) : '-'}
                        </td>
                        <td className="py-2.5 pr-4 font-mono2">
                          {price != null ? fmtSUI(price) : '-'}
                        </td>
                        <td className="py-2.5 pr-4 font-mono2">
                          {price != null && !closed ? fmtSUI(price * BigInt(h.amount)) : '-'}
                        </td>
                        <td className="py-2.5 text-right">
                          {isLost(art) ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[hsl(var(--status-destroyed-fg))]">
                                <Icon name="circle-xmark" size={11} className="shrink-0" />
                                Το έργο δηλώθηκε απολεσθέν
                              </span>
                              <Button
                                onClick={() =>
                                  setUndoing({
                                    kind: 'burn',
                                    id: art.id,
                                    title: art.title,
                                    fractionIds: h.fractionIds,
                                  })
                                }
                                variant="danger-outline"
                                size="xs"
                                icon="xmark"
                              >
                                Διαγραφή κλάσματος
                              </Button>
                            </div>
                          ) : closed ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                              <Icon name="ban" size={11} className="shrink-0" />Η αγορά έκλεισε
                            </span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                onClick={() => setSellFor(art)}
                                variant="outline"
                                size="xs"
                                icon="tag"
                              >
                                Πώληση
                              </Button>
                              {full ? (
                                <Button
                                  onClick={() => setConsolidateFor(art)}
                                  size="xs"
                                  icon="cubes"
                                >
                                  Ενοποίηση
                                </Button>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollX>
          )}
          <MoreButton
            remaining={pagedHoldings.remaining}
            label="Περισσότερα"
            onMore={pagedHoldings.more}
          />
        </Section>

        <Section id="listings" title="Οι αγγελίες μου" icon="tag">
          {myListings.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Δεν έχετε ενεργές αγγελίες. Από τον πίνακα «Τα κλάσματά μου» μπορείτε να θέσετε
              κλάσματα προς πώληση.
            </p>
          ) : (
            <ScrollX minWidth="34rem">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Έργο</th>
                    <th className="py-2 pr-4 font-medium">Ποσότητα</th>
                    <th className="py-2 pr-4 font-medium">Τιμή / κλάσμα</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {pagedListings.rows.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-b-0">
                      <td className="py-2.5 pr-4">
                        <Link
                          to={`/artwork/${l.artworkId}`}
                          className="font-medium hover:underline"
                        >
                          {artworkOf(l.artworkId)?.title ?? shortId(l.artworkId, 10, 6)}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 font-mono2">{fmtInt(l.quantity)}</td>
                      <td className="py-2.5 pr-4 font-mono2">{fmtSUI(l.pricePerFraction)}</td>
                      <td className="py-2.5 text-right">
                        <Button
                          onClick={() =>
                            setUndoing({
                              kind: 'listing',
                              id: l.id,
                              title: artworkOf(l.artworkId)?.title ?? l.artworkId,
                              quantity: l.quantity,
                            })
                          }
                          variant="neutral"
                          size="xs"
                          icon="xmark"
                        >
                          Ακύρωση
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          )}
          <MoreButton
            remaining={pagedListings.remaining}
            label="Περισσότερα"
            onMore={pagedListings.more}
          />
        </Section>

        <Section id="works" title="Τα έργα μου" icon="image">
          {myWorks.length === 0 ? (
            <EmptyState
              title="Δεν έχετε εκδώσει έργα"
              hint="Από τη σελίδα «Έκδοση» μπορείτε να εκδώσετε νέο έργο. Μετά την έκδοση, παραδίδετε το φυσικό έργο σε πιστοποιημένη γκαλερί."
              action={
                <ButtonLink to="/mint" variant="outline" icon="plus" className="mt-2">
                  Έκδοση νέου έργου
                </ButtonLink>
              }
            />
          ) : (
            <ScrollX minWidth="38rem">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Έργο</th>
                    <th className="py-2 pr-4 font-medium">Κατάσταση</th>
                    <th className="py-2 font-medium">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedWorks.rows.map((w) => {
                    const mine = holdings.find((h) => h.artworkId === w.id)?.amount ?? 0;
                    const open = !isTerminal(w);
                    const inCustody = !!w.custody && !w.custody.until && !w.redemption;
                    const canSell = !!w.fractions && mine > 0 && open;
                    const canFractionalize =
                      !w.fractions && !!w.certificate && inCustody && open && w.owner === address;
                    const canRedeem = !w.fractions && inCustody && open && w.owner === address;
                    const canWithdraw = w.redemption?.requestedBy === address && open;
                    const canCancel = w.lifecycle === 'minted' && !w.custody && w.owner === address;
                    return (
                      <tr key={w.id} className="border-b border-border last:border-b-0">
                        <td className="py-2.5 pr-4">
                          <Link to={`/artwork/${w.id}`} className="font-medium hover:underline">
                            {w.title}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4">
                          {w.fractions ? (
                            <span>
                              Κλασματοποιημένο{' '}
                              <span className="text-muted-foreground">
                                (κρατάτε {fmtInt(mine)} κλάσματα, {fmtPct(mine, w.fractions.total)})
                              </span>
                            </span>
                          ) : (
                            lifecycleText(w, activeGalleries)
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-2">
                            {canSell ? (
                              <Button
                                onClick={() => setSellFor(w)}
                                variant="outline"
                                size="xs"
                                icon="tag"
                              >
                                Πώληση
                              </Button>
                            ) : null}
                            {canFractionalize ? (
                              <Button
                                onClick={() => setFractionalizeFor(w)}
                                variant="outline"
                                size="xs"
                              >
                                Κλασματοποίηση
                              </Button>
                            ) : null}
                            {canRedeem ? (
                              <Button
                                onClick={() => setRedeemFor(w)}
                                title="Αίτημα παράδοσης του φυσικού έργου και οριστικό κλείσιμο της καταχώρισής του"
                                variant="neutral"
                                size="xs"
                                icon="box-open"
                              >
                                Αίτημα εξαργύρωσης
                              </Button>
                            ) : null}
                            {canWithdraw ? (
                              <Button
                                onClick={() =>
                                  setUndoing({ kind: 'redemption', id: w.id, title: w.title })
                                }
                                title="Απόσυρση του αιτήματος πριν το επιβεβαιώσει η γκαλερί"
                                variant="neutral"
                                size="xs"
                                icon="ban"
                              >
                                Απόσυρση αιτήματος
                              </Button>
                            ) : null}
                            {canCancel ? (
                              <Button
                                onClick={() =>
                                  setUndoing({ kind: 'mint', id: w.id, title: w.title })
                                }
                                title="Ακύρωση της έκδοσης πριν την παραλαβή από γκαλερί"
                                variant="danger-outline"
                                size="xs"
                                icon="ban"
                              >
                                Ακύρωση έκδοσης
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollX>
          )}
          <MoreButton
            remaining={pagedWorks.remaining}
            label="Περισσότερα"
            onMore={pagedWorks.more}
          />
        </Section>

        <Section id="storage" title="Αποθήκευση Walrus" icon="box-archive">
          <p className="mb-4 text-[13px] text-muted-foreground">
            Παρατείνετε την αποθήκευση των έργων που κατέχετε ή στα οποία έχετε κλάσματα,
            πληρώνοντας σε WAL.
          </p>
          <StorageList artworks={storageWorks} empty="Δεν έχετε έργα ή κλάσματα." />
        </Section>

        {isArtist ? (
          <Section
            id="royalties"
            title="Έσοδα από δικαίωμα παρακολούθησης"
            icon="coins"
            note="Το δικαίωμα παρακολούθησης καταβάλλεται αυτόματα από το συμβόλαιο σε κάθε μεταπώληση κλασμάτων των έργων σας, χωρίς μεσάζοντα. Το σύνολο κρατιέται στους μετρητές της αλυσίδας, ανά καλλιτέχνη."
          >
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              <div>
                <dd className="font-display text-2xl font-semibold tracking-tight">
                  {royalties.loading ? '…' : fmtSUI(royalties.data ?? 0n)}
                </dd>
                <dt className="mt-0.5 text-xs text-muted-foreground">
                  σύνολο από δικαίωμα παρακολούθησης
                </dt>
              </div>
              <div>
                <dd className="font-display text-2xl font-semibold tracking-tight">
                  {fmtInt((issued.data ?? []).reduce((n, a) => n + a.market.trades, 0))}
                </dd>
                <dt className="mt-0.5 text-xs text-muted-foreground">
                  πωλήσεις κλασμάτων των έργων σας
                </dt>
              </div>
              <div>
                <dd className="font-display text-2xl font-semibold tracking-tight">
                  {fmtSUI((issued.data ?? []).reduce((n, a) => n + a.market.volumeMist, 0n))}
                </dd>
                <dt className="mt-0.5 text-xs text-muted-foreground">
                  όγκος συναλλαγών των έργων σας
                </dt>
              </div>
            </dl>
            {(issued.data ?? []).some((a) => a.market.trades > 0) ? (
              <ScrollX minWidth="34rem">
                <table className="mt-5 w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Έργο</th>
                      <th className="py-2 pr-4 font-medium">Πωλήσεις</th>
                      <th className="py-2 pr-4 font-medium">Όγκος</th>
                      <th className="py-2 font-medium">Τελευταία τιμή</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(issued.data ?? [])
                      .filter((a) => a.market.trades > 0)
                      .map((a) => (
                        <tr key={a.id} className="border-b border-border last:border-b-0">
                          <td className="py-2.5 pr-4">
                            <Link
                              to={`/artwork/${a.id}#history`}
                              className="font-medium hover:underline"
                            >
                              {a.title}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-4 font-mono2">{fmtInt(a.market.trades)}</td>
                          <td className="py-2.5 pr-4 font-mono2">{fmtSUI(a.market.volumeMist)}</td>
                          <td className="py-2.5 font-mono2">
                            {a.market.lastPrice != null ? fmtSUI(a.market.lastPrice) : '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </ScrollX>
            ) : (
              <p className="mt-4 text-[13px] text-muted-foreground">
                Δεν υπάρχουν έσοδα από δικαίωμα παρακολούθησης ακόμη. Θα εμφανιστούν εδώ αυτόματα με
                την πρώτη μεταπώληση κλασμάτων έργου σας.
              </p>
            )}
          </Section>
        ) : null}
      </PageWithNav>

      {undoing ? (
        <ConfirmAction
          {...undoCopy(undoing)}
          run={() =>
            undoing.kind === 'listing'
              ? cancelListing({ seller: address, listingId: undoing.id })
              : undoing.kind === 'mint'
                ? cancelMint({ artist: address, artworkId: undoing.id })
                : undoing.kind === 'burn'
                  ? burnFractions({ fractionIds: undoing.fractionIds, artworkId: undoing.id })
                  : withdrawRedemption({ owner: address, artworkId: undoing.id })
          }
          onClose={() => setUndoing(null)}
          onDone={() => setUndoing(null)}
        />
      ) : null}
      <FractionalizeModal
        artwork={fractionalizeFor}
        open={!!fractionalizeFor}
        onClose={() => setFractionalizeFor(null)}
      />
      <RedeemRequestModal
        artwork={redeemFor}
        open={!!redeemFor}
        onClose={() => setRedeemFor(null)}
      />
      <ConsolidateModal
        artwork={consolidateFor}
        owned={holdings.find((h) => h.artworkId === consolidateFor?.id)?.amount ?? 0}
        open={!!consolidateFor}
        onClose={() => setConsolidateFor(null)}
      />
      <SellModal
        artwork={sellFor}
        owned={holdings.find((h) => h.artworkId === sellFor?.id)?.amount ?? 0}
        open={!!sellFor}
        onClose={() => setSellFor(null)}
      />
    </>
  );
}

const PORTFOLIO_SECTIONS = [
  { id: 'notifications', label: 'Ειδοποιήσεις', icon: 'circle-exclamation' },
  { id: 'holdings', label: 'Τα κλάσματά μου', icon: 'circle-nodes' },
  { id: 'listings', label: 'Οι αγγελίες μου', icon: 'cart-shopping' },
  { id: 'works', label: 'Τα έργα μου', icon: 'file-lines' },
  { id: 'storage', label: 'Αποθήκευση Walrus', icon: 'box-archive' },
  { id: 'royalties', label: 'Δικαίωμα παρακολούθησης', icon: 'chart-line' },
] as const;

function lifecycleText(w: Artwork, activeGalleries: Set<string>): string {
  if (w.redemption)
    return `Εκκρεμεί εξαργύρωση (αναμονή επιβεβαίωσης από ${w.custody?.galleryName ?? 'τη γκαλερί'})`;
  switch (w.lifecycle) {
    case 'minted':
      if (!w.intendedGallery) return 'Εκδόθηκε (αναμένει παραλαβή)';
      if (!activeGalleries.has(w.intendedGallery.gallery))
        return `Εκδόθηκε (η ${w.intendedGallery.galleryName} ανακλήθηκε πριν την παραλαβή, ακυρώστε την έκδοση)`;
      return `Εκδόθηκε (αναμένει παραλαβή από ${w.intendedGallery.galleryName})`;
    case 'in_custody':
      return 'Σε φύλαξη (αναμένει πιστοποιητικό)';
    case 'certified':
      return 'Πιστοποιημένο';
    case 'redeemed':
      return 'Εξαργυρωμένο';
    case 'lost':
      return 'Δηλώθηκε απώλεια';
    case 'cancelled':
      return 'Η έκδοση ακυρώθηκε';
    default:
      return '';
  }
}
