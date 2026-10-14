import { useMemo, useState } from 'react';
import { SectionTabs } from '@/components/SectionNav';
import { useParams as useRouteParams } from 'react-router';
import {
  firstLoad,
  useArtwork,
  useGalleries,
  useHistory,
  useHoldingFor,
  useListings,
  useParams,
  useReports,
  NO_PARAMS,
} from '@/state/queries';
import { useWallet } from '@/adapters/wallet-context';
import { shortId } from '@/adapters';
import {
  activeListings,
  lifecycleLabel,
  isGallery,
  isTerminal,
  needsAttention,
  lifecycleTone,
  terminalNote,
  terminalTone,
} from '@/state/derive';
import { StatusBadge } from '@/components/StatusBadge';
import { ProvenanceTimeline } from '@/components/ProvenanceTimeline';
import { BuyModal, SellModal } from '@/components/TradeModal';
import { Modal } from '@/components/Modal';
import { AddressLink, ObjectLink } from '@/components/TxLink';
import { DocumentButton } from '@/components/DocumentViewer';
import { HiresViewer } from '@/components/HiresViewer';
import type { Requester } from '@/adapters/seal';
import type { Artwork } from '@/adapters';
import {
  EmptyState,
  LoadingState,
  Section,
  WarningNote,
  ScrollX,
  Page,
} from '@/components/primitives';
import { fmtSUI, fmtInt, fmtDate, fmtPct } from '@/components/format';
import { Icon, type IconName } from '@/components/Icon';
import { Button, ButtonLink } from '@/components/Button';

export function ArtworkView() {
  const { id } = useRouteParams();
  const { data: artwork, loading: artworkLoading, error: artworkError } = useArtwork(id);
  const galleries = useGalleries();
  const params = useParams();
  const listingsRead = useListings(
    artwork?.fractions && !isTerminal(artwork) ? artwork.id : undefined,
  );
  const { address } = useWallet();
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyListingId, setBuyListingId] = useState<string | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [hiresOpen, setHiresOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const holding = useHoldingFor(address, id);
  const held = holding?.amount ?? 0;
  const owner = artwork?.owner ?? null;
  const fractionId = holding?.fractionIds[0] ?? null;
  const hiresRequester = useMemo<Requester | null>(() => {
    if (address && owner === address) return { kind: 'owner' };
    if (fractionId) return { kind: 'holder', fractionId };
    return null;
  }, [address, owner, fractionId]);

  if (artworkLoading || firstLoad(galleries, params)) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }

  if (artworkError && artwork === undefined) {
    return (
      <Page>
        <WarningNote>Η ανάγνωση από το δίκτυο απέτυχε. Δοκιμάστε ξανά σε λίγο.</WarningNote>
      </Page>
    );
  }

  if (!artwork) {
    return (
      <Page>
        <EmptyState
          title="Το έργο δεν βρέθηκε"
          hint="Ελέγξτε το αναγνωριστικό αντικειμένου στον σύνδεσμο. Η σελίδα κάθε έργου παραμένει προσβάσιμη με το object id του, ακόμη και μετά από εξαργύρωση ή απώλεια."
          action={
            <ButtonLink to="/catalogue" variant="outline" className="mt-2">
              Επιστροφή στον κατάλογο
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  const listings = activeListings(listingsRead.data ?? []);
  const minPrice = listings.length ? listings[0].pricePerFraction : null;
  const last = artwork.lastReport;
  const terminal = isTerminal(artwork);
  const concern = needsAttention(artwork);
  const registry = galleries.data ?? [];
  const custodyActive = !!isGallery(registry, artwork.custody?.gallery ?? null);
  const custodyClosed = !!artwork.custody?.until;
  const issuerActive = !!isGallery(registry, artwork.certificate?.issuer ?? null);
  const canViewHires =
    !!artwork.hiresBlobId && (held > 0 || (!!address && artwork.owner === address));
  // Only a failed read leaves params empty here (firstLoad gates the initial load); buying waits for it
  const protocol = params.data ?? NO_PARAMS;
  const canBuy = !!params.data;

  return (
    <Page>
      {terminal ? (
        <div
          className={`mb-6 border px-5 py-3 ${
            terminalTone(artwork) === 'amber'
              ? 'border-[hsl(var(--status-damaged-border))] bg-[hsl(var(--status-damaged-bg))] text-[hsl(var(--status-damaged-fg))]'
              : 'border-[hsl(var(--status-destroyed-border))] bg-[hsl(var(--status-destroyed-bg))] text-[hsl(var(--status-destroyed-fg))]'
          }`}
        >
          <p className="text-sm font-semibold">Τελική κατάσταση: {lifecycleLabel(artwork)}</p>
          <p className="mt-1 text-[13px] leading-relaxed">{terminalNote(artwork)}</p>
        </div>
      ) : null}

      {artwork.redemption && !terminal ? (
        <div className="mb-6 border border-border bg-secondary/50 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="box-open" size={13} className="shrink-0" />
            Εκκρεμεί αίτημα εξαργύρωσης
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Ο ιδιοκτήτης ζήτησε στις {fmtDate(artwork.redemption.at)} την παράδοση του φυσικού
            έργου. Με την επιβεβαίωση της {artwork.custody?.galleryName ?? 'γκαλερί φύλαξης'} η
            φύλαξη κλείνει και το έργο περνά σε τελική κατάσταση.
          </p>
        </div>
      ) : null}

      <div className="grid gap-8 border border-border bg-card p-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="border border-border">
            <img src={artwork.image} alt={artwork.title} className="w-full object-cover" />
          </div>
          {artwork.hiresBlobId ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => setHiresOpen(true)}
                disabled={!canViewHires}
                variant="outline"
                size="md"
                icon={canViewHires ? 'eye' : 'lock'}
                className="shrink-0 whitespace-nowrap bg-card px-4 disabled:border-input disabled:text-muted-foreground disabled:opacity-100"
              >
                Υψηλή ανάλυση (Seal)
              </Button>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="circle-info" size={12} className="shrink-0" />
                Μόνο για κατόχους κλασμάτων ή τον ιδιοκτήτη του έργου
              </span>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="circle-info" size={12} className="shrink-0" />
              Ο εκδότης δεν ανέβασε αρχείο υψηλής ανάλυσης για αυτό το έργο
            </p>
          )}
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{artwork.title}</h1>
          <dl className="mt-4 grid grid-cols-[7rem_1fr] items-center gap-y-2.5 sm:grid-cols-[10.5rem_1fr] text-[13px]">
            <MetaLabel icon="cube">ID έργου</MetaLabel>
            <dd>
              <ObjectLink id={artwork.id} />
            </dd>
            <MetaLabel icon="palette">Καλλιτέχνης</MetaLabel>
            <dd className="flex flex-wrap items-baseline gap-x-1.5">
              {artwork.artistName && artwork.artistName !== artwork.artist ? (
                <>
                  <span>{artwork.artistName}</span>
                  <span className="text-muted-foreground">
                    (<AddressLink address={artwork.artist} short />)
                  </span>
                </>
              ) : (
                <AddressLink address={artwork.artist} short />
              )}
            </dd>
            {artwork.year || artwork.medium || artwork.dimensions ? (
              <>
                <MetaLabel icon="image">Έργο</MetaLabel>
                <dd className="text-muted-foreground">
                  {[artwork.year, artwork.medium, artwork.dimensions].filter(Boolean).join(', ')}
                </dd>
              </>
            ) : null}
            <MetaLabel icon="building-columns">
              {custodyClosed ? 'Γκαλερί που φύλασσε' : 'Γκαλερί φύλαξης'}
            </MetaLabel>
            <dd>
              {artwork.custody ? (
                <NamedAddress name={artwork.custody.galleryName} address={artwork.custody.gallery}>
                  {custodyClosed ? (
                    <span className="text-muted-foreground">
                      η φύλαξη έκλεισε στις {artwork.custody.until}
                    </span>
                  ) : custodyActive ? (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                      <Icon name="circle-check" size={11} className="shrink-0" /> ενεργή στο μητρώο
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--status-damaged-fg))]">
                      <Icon name="triangle-exclamation" size={11} className="shrink-0" /> δεν είναι
                      πλέον ενεργή στο μητρώο
                    </span>
                  )}
                </NamedAddress>
              ) : (
                <span className="text-muted-foreground">Χωρίς ενεργή φύλαξη</span>
              )}
            </dd>
            <MetaLabel icon="flag">Κατάσταση</MetaLabel>
            <dd className={`font-medium ${lifecycleTone(artwork)}`}>{lifecycleLabel(artwork)}</dd>
            <MetaLabel icon="user">Ιδιοκτήτης</MetaLabel>
            <dd>
              {artwork.owner ? (
                <AddressLink address={artwork.owner} short />
              ) : artwork.fractions ? (
                <span className="text-muted-foreground">
                  οι κάτοχοι των κλασμάτων, μέσω του θησαυροφυλακίου
                </span>
              ) : (
                <span className="text-muted-foreground">κανένας</span>
              )}
            </dd>
            {!artwork.fractions ? (
              <>
                <MetaLabel icon="cubes">Κλάσματα</MetaLabel>
                <dd className="text-muted-foreground">Μη κλασματοποιημένο</dd>
              </>
            ) : null}
            {artwork.fractions ? (
              <>
                <MetaLabel icon="cubes">Συνολικά κλάσματα</MetaLabel>
                <dd className="font-mono2 font-medium">{fmtInt(artwork.fractions.total)}</dd>
                <MetaLabel icon="tag">
                  {terminal ? 'Αγγελίες σε εκκρεμότητα' : 'Ενεργές αγγελίες'}
                </MetaLabel>
                <dd className="font-mono2 font-medium">
                  {terminal ? artwork.market.openListings : listings.length}
                  {!terminal && minPrice != null ? ` (από ${fmtSUI(minPrice)} / κλάσμα)` : ''}
                </dd>
                <MetaLabel icon="chart-line">Πωλήσεις</MetaLabel>
                <dd className="font-mono2">
                  {fmtInt(artwork.market.trades)}
                  {artwork.market.lastPrice != null
                    ? `, τελευταία τιμή ${fmtSUI(artwork.market.lastPrice)} / κλάσμα`
                    : ''}
                </dd>
              </>
            ) : null}
            {last ? (
              <>
                <MetaLabel icon="clipboard-list">Αναφορά κατάστασης</MetaLabel>
                <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge condition={last.condition} />
                  <span className="whitespace-nowrap font-mono2 text-xs text-muted-foreground">
                    {fmtDate(last.at)}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>

          {artwork.description ? (
            <p className="mt-5 border-l-2 border-[hsl(var(--accent)/0.35)] pl-4 font-display text-[15px] italic leading-relaxed text-muted-foreground">
              {artwork.description}
            </p>
          ) : null}

          {!terminal && artwork.fractions ? (
            <>
              <div className="mt-6 flex gap-3">
                <Button
                  onClick={() => setBuyOpen(true)}
                  disabled={!canBuy}
                  size="md"
                  icon="cart-shopping"
                >
                  Αγορά κλασμάτων
                </Button>
                <Button
                  onClick={() => setSellOpen(true)}
                  disabled={held <= 0}
                  variant="outline"
                  size="md"
                  icon="tag"
                >
                  Πώληση κλασμάτων
                </Button>
              </div>
              {concern ? (
                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[hsl(var(--status-damaged-fg))]">
                  <Icon name="triangle-exclamation" size={12} className="mt-0.5 shrink-0" />
                  Εκκρεμεί αναφορά προβλήματος από εγγεγραμμένη πηγή ({fmtDate(concern.at)}).
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-10">
        <SectionTabs sections={ARTWORK_SECTIONS}>
          <Section
            id="certificate"
            title={
              artwork.certificate
                ? 'Πιστοποιητικό γνησιότητας'
                : 'Πιστοποιητικό γνησιότητας: δεν έχει εκδοθεί'
            }
            icon={artwork.certificate ? 'circle-check' : 'circle-xmark'}
            tone={artwork.certificate ? 'ok' : 'alert'}
            note="Προσαρτημένο μόνιμα στο αντικείμενο του έργου. Δεν μπορεί να αφαιρεθεί ή να τροποποιηθεί."
          >
            {artwork.certificate ? (
              <dl className="grid grid-cols-[7rem_1fr] items-start gap-y-2.5 sm:grid-cols-[10rem_1fr] text-[13px]">
                <dt className="text-muted-foreground">Εκδότης</dt>
                <dd>
                  <NamedAddress
                    name={artwork.certificate.issuerName}
                    address={artwork.certificate.issuer}
                  >
                    {issuerActive ? (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                        <Icon name="circle-check" size={11} className="shrink-0" /> ενεργή στο
                        μητρώο
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--status-damaged-fg))]">
                        <Icon name="triangle-exclamation" size={11} className="shrink-0" /> η
                        εγγραφή της έχει ανακληθεί
                      </span>
                    )}
                  </NamedAddress>
                </dd>
                <dt className="text-muted-foreground">Ημερομηνία έκδοσης</dt>
                <dd className="font-mono2">{artwork.certificate.issuedAt}</dd>
                <dt className="text-muted-foreground">Δήλωση</dt>
                <dd className="border border-border bg-secondary/50 px-3 py-2">
                  {artwork.certificate.statement}
                </dd>
                <dt className="text-muted-foreground">Τεκμηρίωση</dt>
                <dd>
                  {artwork.certificate.documentationBlobId ? (
                    <DocumentButton
                      blobId={artwork.certificate.documentationBlobId}
                      label="Προβολή τεκμηρίωσης"
                    />
                  ) : (
                    <span className="text-muted-foreground">Δεν αναρτήθηκε αρχείο τεκμηρίωσης</span>
                  )}
                </dd>
              </dl>
            ) : (
              <EmptyState
                title="Δεν έχει εκδοθεί πιστοποιητικό"
                hint="Το πιστοποιητικό γνησιότητας εκδίδεται από την πιστοποιημένη γκαλερί που φυλάσσει το έργο, μετά την παραλαβή του."
              />
            )}
          </Section>

          {artwork.fractions && !terminal ? (
            <Section
              id="listings"
              title="Αγγελίες κλασμάτων"
              icon="tag"
              note="Κάθε αγγελία είναι ένα δημόσιο αντικείμενο της αλυσίδας. Τα κλάσματα μένουν δεσμευμένα στην αγγελία μέχρι την πώληση ή την ακύρωσή της."
            >
              {concern ? (
                <div className="mb-4">
                  <WarningNote>Εκκρεμεί αναφορά προβλήματος για το έργο.</WarningNote>
                </div>
              ) : null}
              {listingsRead.loading ? (
                <LoadingState />
              ) : listings.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Δεν υπάρχουν ενεργές αγγελίες για αυτό το έργο αυτή τη στιγμή.
                </p>
              ) : (
                <ScrollX minWidth="38rem">
                  <table className={concern ? 'mt-4 w-full text-[13px]' : 'w-full text-[13px]'}>
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Πωλητής</th>
                        <th className="py-2 pr-4 font-medium">Κλάσματα</th>
                        <th className="py-2 pr-4 font-medium">Μερίδιο</th>
                        <th className="py-2 pr-4 font-medium">Τιμή / κλάσμα</th>
                        <th className="py-2 pr-4 font-medium">Συνολικό κόστος</th>
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {listings.map((l) => (
                        <tr key={l.id} className="border-b border-border last:border-b-0">
                          <td className="py-2.5 pr-4">
                            <AddressLink address={l.seller} short />
                            {l.seller === artwork.artist ? (
                              <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">
                                ο καλλιτέχνης
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-4 font-mono2">{fmtInt(l.quantity)}</td>
                          <td className="py-2.5 pr-4 font-mono2 text-muted-foreground">
                            {fmtPct(l.quantity, artwork.fractions!.total)}
                          </td>
                          <td className="py-2.5 pr-4 font-mono2 font-medium">
                            {fmtSUI(l.pricePerFraction)}
                            {minPrice != null && l.pricePerFraction === minPrice ? (
                              <span className="ml-2 whitespace-nowrap text-xs font-normal text-[hsl(var(--status-ok-fg))]">
                                χαμηλότερη
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-4 font-mono2 text-muted-foreground">
                            {fmtSUI(l.pricePerFraction * BigInt(l.quantity))}
                          </td>
                          <td className="py-2.5 text-right">
                            {l.seller === address ? (
                              <span className="whitespace-nowrap text-xs text-muted-foreground">
                                δική σας αγγελία
                              </span>
                            ) : (
                              <Button
                                onClick={() => {
                                  setBuyListingId(l.id);
                                  setBuyOpen(true);
                                }}
                                disabled={!canBuy}
                                size="xs"
                                icon="cart-shopping"
                              >
                                Αγορά
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollX>
              )}
            </Section>
          ) : null}

          <HistorySection id="history" artwork={artwork} />

          <Section id="custody" title="Φύλαξη και αναφορές κατάστασης" icon="box-archive">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 sm:grid-cols-[10rem_1fr] text-[13px]">
              <dt className="text-muted-foreground">Γκαλερί</dt>
              <dd>
                {artwork.custody ? (
                  <NamedAddress
                    name={artwork.custody.galleryName}
                    address={artwork.custody.gallery}
                  >
                    {custodyClosed ? null : custodyActive ? (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                        <Icon name="circle-check" size={11} className="shrink-0" /> ενεργή στο
                        μητρώο
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--status-damaged-fg))]">
                        <Icon name="triangle-exclamation" size={11} className="shrink-0" /> η
                        εγγραφή της έχει ανακληθεί
                      </span>
                    )}
                  </NamedAddress>
                ) : (
                  <span className="text-muted-foreground">Χωρίς ενεργή φύλαξη</span>
                )}
              </dd>
              {artwork.custody ? (
                <>
                  <dt className="text-muted-foreground">Σε φύλαξη από</dt>
                  <dd className="font-mono2">{artwork.custody.since}</dd>
                </>
              ) : null}
              {artwork.custody?.until ? (
                <>
                  <dt className="text-muted-foreground">Η φύλαξη έκλεισε</dt>
                  <dd className="font-mono2">{artwork.custody.until}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Τελευταία αναφορά</dt>
              <dd>
                {last ? (
                  <>
                    <StatusBadge condition={last.condition} bare />{' '}
                    <span className="font-mono2 text-xs text-muted-foreground">
                      {fmtDate(last.at)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Καμία αναφορά ακόμη</span>
                )}
              </dd>
              {artwork.reportLog ? (
                <>
                  <dt className="text-muted-foreground">Αναφορές συνολικά</dt>
                  <dd className="font-mono2">
                    {fmtInt(artwork.reportLog.count)}
                    {artwork.reportLog.notOk ? (
                      <span className="ml-2 text-xs text-[hsl(var(--status-damaged-fg))]">
                        {fmtInt(artwork.reportLog.notOk)} μη ομαλές
                      </span>
                    ) : null}
                  </dd>
                </>
              ) : null}
            </dl>
            {artwork.reportLog && artwork.reportLog.count > 0 ? (
              <div className="mt-4">
                <Button
                  onClick={() => setReportsOpen(true)}
                  variant="outline"
                  icon="clipboard-list"
                >
                  Προβολή όλων των αναφορών
                </Button>
              </div>
            ) : null}
          </Section>
        </SectionTabs>
      </div>

      {reportsOpen ? (
        <ReportsModal artwork={artwork} onClose={() => setReportsOpen(false)} />
      ) : null}

      <Modal
        open={hiresOpen}
        onClose={() => setHiresOpen(false)}
        title="Υψηλή ανάλυση (Seal)"
        size="xl"
      >
        {hiresOpen && address && hiresRequester ? (
          <HiresViewer artwork={artwork} address={address} requester={hiresRequester} />
        ) : null}
      </Modal>

      <BuyModal
        artwork={artwork}
        listings={listings}
        params={protocol}
        open={buyOpen}
        initialListingId={buyListingId}
        onClose={() => {
          setBuyOpen(false);
          setBuyListingId(null);
        }}
      />
      <SellModal
        artwork={artwork}
        owned={held}
        open={sellOpen}
        onClose={() => setSellOpen(false)}
      />
    </Page>
  );
}

// Name and registry standing on the left, the address on the right, always one line
function NamedAddress({
  name,
  address,
  children,
}: {
  name: string;
  address: string;
  children?: React.ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="inline-flex items-baseline gap-1.5">
        {name}
        {children}
      </span>
      <AddressLink address={address} short />
    </span>
  );
}

function MetaLabel({ icon, children }: { icon: IconName; children: string }) {
  return (
    <dt className="flex items-center gap-2 text-muted-foreground">
      <Icon name={icon} size={12} className="shrink-0 text-[hsl(var(--accent))]" />
      {children}
    </dt>
  );
}

const PAGE = 10;

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-4 text-[13px]">
      <Button disabled={page <= 0} onClick={() => onPage(page - 1)} variant="neutral" size="xs">
        ‹ Νεότερα
      </Button>
      <span className="text-muted-foreground">
        Σελίδα {page + 1} από {pages}
      </span>
      <Button
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
        variant="neutral"
        size="xs"
      >
        Παλαιότερα ›
      </Button>
    </div>
  );
}

function ReportsModal({ artwork, onClose }: { artwork: Artwork; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const total = artwork.reportLog?.count ?? 0;
  const reports = useReports(artwork.id, page, PAGE);
  return (
    <Modal
      open
      onClose={onClose}
      title={
        total > PAGE
          ? `Αναφορές κατάστασης (${fmtInt(total)} συνολικά, οι πιο πρόσφατες πρώτα)`
          : 'Αναφορές κατάστασης'
      }
      size="lg"
    >
      {reports.loading ? (
        <LoadingState />
      ) : (reports.data ?? []).length === 0 ? (
        <EmptyState
          title="Δεν υπάρχουν αναφορές"
          hint="Οι εγγεγραμμένες εξωτερικές πηγές υποβάλλουν περιοδικές αναφορές. Κάθε αναφορά εμφανίζεται εδώ."
        />
      ) : (
        <ScrollX minWidth="34rem">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Καταγραφή</th>
                <th className="py-2 pr-4 font-medium">Κατάσταση</th>
                <th className="py-2 pr-4 font-medium">Πηγή</th>
                <th className="py-2 pr-4 font-medium">Ενδείξεις</th>
                <th className="py-2 text-right font-medium">Αναφορά</th>
              </tr>
            </thead>
            <tbody>
              {(reports.data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0 align-middle">
                  <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs text-muted-foreground">
                    {fmtDate(r.at)}
                  </td>
                  <td className="py-2.5 pr-4">
                    {r.condition ? <StatusBadge condition={r.condition} /> : null}
                  </td>
                  <td className="py-2.5 pr-4" title={r.source}>
                    {r.sourceName || shortId(r.source ?? '')}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">
                    {r.readings ? fmtInt(r.readings) : ''}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    <ObjectLink id={r.id} short />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
      <Pager page={page} total={total} onPage={setPage} />
    </Modal>
  );
}

function HistorySection({ artwork }: { id: string; artwork: Artwork }) {
  const [page, setPage] = useState(0);
  const total = artwork.historyLen;
  const history = useHistory(artwork.id, page, PAGE);
  const events = history.data ?? [];
  return (
    <Section
      id="history"
      title={
        total > PAGE ? `Ιστορικό (${fmtInt(total)} πράξεις, οι πιο πρόσφατες πρώτα)` : 'Ιστορικό'
      }
      icon="clock-rotate-left"
      note="Το ημερολόγιο προέλευσης του έργου, όπως το κρατά το ίδιο το αντικείμενο στην αλυσίδα."
    >
      {history.loading ? (
        <LoadingState />
      ) : events.length === 0 ? (
        <EmptyState
          title="Κανένα γεγονός ακόμη"
          hint="Το ιστορικό γεμίζει από το ημερολόγιο του έργου στην αλυσίδα."
        />
      ) : (
        <ProvenanceTimeline events={events} />
      )}
      <Pager page={page} total={total} onPage={setPage} />
    </Section>
  );
}

const ARTWORK_SECTIONS = [
  { id: 'certificate', label: 'Πιστοποιητικό', icon: 'certificate' },
  { id: 'listings', label: 'Αγγελίες κλασμάτων', icon: 'cart-shopping' },
  { id: 'history', label: 'Ιστορικό', icon: 'clock-rotate-left' },
  { id: 'custody', label: 'Φύλαξη και αναφορές', icon: 'box-archive' },
] as const;
