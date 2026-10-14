import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { firstLoad, useReports, useRole, useWorks } from '@/state/queries';
import { useWallet } from '@/adapters/wallet-context';
import { Icon } from '@/components/Icon';
import {
  galleryWorks,
  isTerminal,
  needsAttention,
  pendingIntakes,
  pendingRedemptions,
  statusLabel,
} from '@/state/derive';
import {
  confirmRedemption,
  createIssueCertificate,
  custodyIntake,
  declareLoss,
} from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import type { Artwork, ChainEvent } from '@/adapters';
import { StatusBadge } from '@/components/StatusBadge';
import { AttentionRow } from '@/components/AttentionRow';
import {
  Section,
  EmptyState,
  LoadingState,
  WarningNote,
  InfoNote,
  MoreButton,
  ScrollX,
  Page,
} from '@/components/primitives';
import { usePaged } from '@/components/usePaged';
import { Modal, ConfirmWarning } from '@/components/Modal';
import { TxDone, TxFeedback } from '@/components/TxFeedback';
import { PageWithNav } from '@/components/SectionNav';
import { AddressLink } from '@/components/TxLink';
import { fmtDate } from '@/components/format';
import { shortId } from '@/adapters';
import { Button, ButtonLink } from '@/components/Button';
import { StorageList } from '@/components/StorageList';

type LossTarget = { artworkId: string; reportId?: string };

export function GalleryDashboardView() {
  const role = useRole();
  const { address } = useWallet();
  const custody = useWorks('custodian', role.isGallery ? address : null);
  const intended = useWorks('intended', role.isGallery ? address : null);
  const [intakeFor, setIntakeFor] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [certFor, setCertFor] = useState<string | null>(null);
  const [lossFor, setLossFor] = useState<LossTarget | null>(null);
  const [redeemFor, setRedeemFor] = useState<string | null>(null);
  const inCustody = custody.data ?? [];
  const works = galleryWorks(inCustody, address ?? '');
  const awaiting = pendingIntakes(intended.data ?? []);
  const pagedWorks = usePaged(works);
  const pagedAwaiting = usePaged(awaiting);

  if (role.loading || firstLoad(custody, intended)) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }

  if (!role.isGallery || !role.gallery || !address) {
    return (
      <Page>
        <EmptyState
          title="Απαιτείται πιστοποιημένη γκαλερί"
          hint="Ο πίνακας ανοίγει μόνο σε διευθύνσεις ενεργές στο μητρώο γκαλερί της αλυσίδας. Συνδεθείτε με το wallet της γκαλερί σας."
        />
      </Page>
    );
  }

  const gallery = role.gallery;
  const attention: { event: ChainEvent; artwork: Artwork }[] = works
    .flatMap((w) => {
      const last = needsAttention(w);
      return last
        ? [
            {
              artwork: w,
              event: {
                id: last.id,
                at: last.at,
                type: 'status_report' as const,
                artworkId: w.id,
                condition: last.condition,
                reportId: last.id,
              },
            },
          ]
        : [];
    })
    .sort((a, b) => b.event.at.localeCompare(a.event.at));
  const redemptions = pendingRedemptions(inCustody);
  const artworkOf = (id?: string) => inCustody.find((a) => a.id === id);
  const lossEligible = (w: (typeof works)[number]) => !isTerminal(w);

  return (
    <>
      <PageWithNav title="Διαχείριση γκαλερί" sections={GALLERY_SECTIONS}>
        <Section
          id="attention"
          title="Εκκρεμότητες που απαιτούν προσοχή"
          icon="bell"
          note="Η λίστα παράγεται από τα δημόσια αντικείμενα της αλυσίδας, χωρίς κεντρικό server. Εκκρεμής θεωρείται ένα έργο του οποίου η τελευταία αναφορά κατάστασης δεν είναι καλή, μέχρι νεότερη αναφορά καλής κατάστασης ή δήλωση απώλειας."
        >
          {awaiting.length > 0 ? (
            <div className="mb-6">
              <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                <Icon name="inbox" size={12} className="shrink-0 text-[hsl(var(--accent))]" />
                Έργα σε αναμονή καταχώρισης παραλαβής
              </h3>
              <ScrollX minWidth="34rem">
                <ul className="border border-border">
                  {pagedAwaiting.rows.map((w) => (
                    <li
                      key={w.id}
                      className="grid grid-cols-[6.5rem_1fr_10rem_auto] items-center gap-3 border-b border-border bg-[hsl(var(--status-damaged-bg)/0.35)] px-4 py-3 text-[13px] last:border-b-0"
                    >
                      <span className="font-mono2 text-xs text-muted-foreground">
                        {fmtDate(w.mintedAt)}
                      </span>
                      <Link to={`/artwork/${w.id}`} className="font-medium hover:underline">
                        {w.title}
                      </Link>
                      <span className="text-muted-foreground">{w.artistName}</span>
                      <span className="text-right">
                        <Button onClick={() => setIntakeFor(w.id)} size="xs" icon="box-archive">
                          Καταχώριση παραλαβής
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollX>
              <MoreButton
                remaining={pagedAwaiting.remaining}
                label="Περισσότερα"
                onMore={pagedAwaiting.more}
              />
              <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <Icon name="circle-info" size={12} className="mt-0.5 shrink-0" />Η γκαλερί σας έχει
                οριστεί ως παραλήπτης, από τον καλλιτέχνη κατά την έκδοση ή από την ρυθμιστική αρχή
                μετά την ανάκληση της προηγούμενης γκαλερί. Καταχωρίστε την παραλαβή μόνο αφού
                παραλάβετε το φυσικό έργο.
              </p>
            </div>
          ) : null}

          {redemptions.length > 0 ? (
            <div className="mb-6">
              <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                <Icon name="box-open" size={12} className="shrink-0 text-[hsl(var(--accent))]" />
                Αιτήματα εξαργύρωσης
              </h3>
              <ScrollX minWidth="34rem">
                <ul className="border border-border">
                  {redemptions.map((w) => (
                    <li
                      key={w.id}
                      className="grid grid-cols-[6.5rem_1fr_auto] items-start gap-x-3 gap-y-1 border-b border-border bg-[hsl(var(--status-damaged-bg)/0.35)] px-4 py-3 text-[13px] last:border-b-0"
                    >
                      <span className="whitespace-nowrap font-mono2 text-xs text-muted-foreground">
                        {fmtDate(w.redemption!.at)}
                      </span>
                      <div className="min-w-0">
                        <Link to={`/artwork/${w.id}`} className="font-medium hover:underline">
                          {w.title}
                        </Link>
                        <p className="mt-0.5 text-muted-foreground">
                          <span className="text-xs">Σημείωση: </span>
                          {w.redemption!.note || 'χωρίς σημείωση'}
                        </p>
                      </div>
                      <span className="text-right">
                        <Button onClick={() => setRedeemFor(w.id)} size="xs" icon="box-open">
                          Επιβεβαίωση παράδοσης
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollX>
              <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <Icon name="circle-info" size={12} className="mt-0.5 shrink-0" />Ο ιδιοκτήτης ζητά
                πίσω το φυσικό έργο. Επιβεβαιώστε μόνο αφού του το παραδώσετε. Η επιβεβαίωση κλείνει
                τη φύλαξη και θέτει το έργο σε τελική κατάσταση.
              </p>
            </div>
          ) : null}

          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <Icon
              name="triangle-exclamation"
              size={12}
              className="shrink-0 text-[hsl(var(--accent))]"
            />
            Αναφορές κατάστασης που απαιτούν προσοχή
          </h3>
          {attention.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Δεν υπάρχουν αναφορές που απαιτούν προσοχή για έργα σε φύλαξή σας.
            </p>
          ) : (
            <ScrollX minWidth="48rem">
              <ul className="border border-border">
                {attention.map(({ event: r, artwork: art }) => (
                  <AttentionRow
                    key={r.id}
                    event={r}
                    artworkTitle={art.title}
                    pending
                    action={
                      r.condition === 'destroyed' ? (
                        <Button
                          onClick={() => setLossFor({ artworkId: art.id, reportId: r.reportId })}
                          variant="danger-outline"
                          size="xs"
                          icon="triangle-exclamation"
                        >
                          Δήλωση απώλειας
                        </Button>
                      ) : (
                        <ButtonLink
                          to={`/artwork/${art.id}`}
                          variant="outline"
                          size="xs"
                          icon="eye"
                        >
                          Προβολή έργου
                        </ButtonLink>
                      )
                    }
                  />
                ))}
              </ul>
            </ScrollX>
          )}
        </Section>

        <Section id="custody" title="Έργα σε φύλαξη" icon="box-archive">
          {works.length === 0 ? (
            <EmptyState
              title="Δεν φυλάσσετε έργα ακόμη"
              hint="Τα έργα που σας έχουν ορίσει για φύλαξη εμφανίζονται στις εκκρεμότητες. Καταχωρίστε παραλαβή μόλις παραλάβετε το φυσικό έργο."
            />
          ) : (
            <ScrollX minWidth="40rem">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Έργο</th>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">Σε φύλαξη από</th>
                    <th className="py-2 pr-4 font-medium">Πιστοποιητικό</th>
                    <th className="py-2 pr-4 font-medium">Αναφορά</th>
                    <th className="py-2 text-right font-medium">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedWorks.rows.map((w) => {
                    const last = w.lastReport;
                    return (
                      <tr key={w.id} className="border-b border-border last:border-b-0">
                        <td className="py-2.5 pr-4">
                          <Link to={`/artwork/${w.id}`} className="font-medium hover:underline">
                            {w.title}
                          </Link>
                          <div className="text-xs text-muted-foreground">{w.artistName}</div>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs">
                          {w.custody?.since}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4">
                          {w.certificate ? (
                            <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                              <Icon name="circle-check" size={11} /> {w.certificate.issuedAt}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Icon name="circle-xmark" size={11} /> εκκρεμεί
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          {last?.condition ? (
                            <span className="inline-flex items-center gap-2">
                              <StatusBadge condition={last.condition} bare />
                              <span className="text-xs text-muted-foreground">
                                ({fmtDate(last.at)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">καμία</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            {!w.certificate ? (
                              <Button
                                onClick={() => setCertFor(w.id)}
                                variant="outline"
                                size="xs"
                                icon="certificate"
                                className="whitespace-nowrap"
                              >
                                Έκδοση πιστοποιητικού
                              </Button>
                            ) : null}
                            {lossEligible(w) ? (
                              <Button
                                onClick={() => setLossFor({ artworkId: w.id })}
                                variant="danger-outline"
                                size="xs"
                                icon="triangle-exclamation"
                                className="whitespace-nowrap"
                              >
                                Δήλωση απώλειας
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
          <div className="mt-4">
            <Button
              onClick={() => {
                setIntakeFor(null);
                setIntakeOpen(true);
              }}
              icon="box-archive"
            >
              Καταχώριση παραλαβής
            </Button>
          </div>
        </Section>

        <Section id="storage" title="Αποθήκευση Walrus" icon="box-archive">
          <p className="mb-4 text-[13px] text-muted-foreground">
            Η γκαλερί μπορεί να παρατείνει την αποθήκευση των έργων που φυλάσσει, πληρώνοντας σε
            WAL.
          </p>
          <StorageList artworks={works} empty="Δεν φυλάσσετε έργα." />
        </Section>
      </PageWithNav>

      {redeemFor ? (
        <RedemptionConfirmModal
          onClose={() => setRedeemFor(null)}
          gallery={address}
          artwork={artworkOf(redeemFor)}
        />
      ) : null}

      {intakeOpen || intakeFor !== null ? (
        <CustodyIntakeModal
          onClose={() => {
            setIntakeOpen(false);
            setIntakeFor(null);
          }}
          gallery={address}
          galleryName={gallery.name}
          candidates={awaiting}
          initialArtworkId={intakeFor ?? ''}
        />
      ) : null}
      {certFor !== null ? (
        <CertificateModal
          onClose={() => setCertFor(null)}
          gallery={address}
          galleryName={gallery.name}
          candidates={works.filter((w) => !w.certificate)}
          initialArtworkId={certFor}
        />
      ) : null}
      {lossFor !== null ? (
        <LossModal
          onClose={() => setLossFor(null)}
          gallery={address}
          works={works.filter(lossEligible)}
          initial={lossFor}
        />
      ) : null}
    </>
  );
}

const GALLERY_SECTIONS = [
  { id: 'attention', label: 'Εκκρεμότητες', icon: 'circle-exclamation' },
  { id: 'custody', label: 'Έργα σε φύλαξη', icon: 'box-archive' },
  { id: 'storage', label: 'Αποθήκευση Walrus', icon: 'box-archive' },
] as const;

function CustodyIntakeModal({
  onClose,
  gallery,
  galleryName,
  candidates,
  initialArtworkId,
}: {
  onClose: () => void;
  gallery: string;
  galleryName: string;
  candidates: Artwork[];
  initialArtworkId: string;
}) {
  const [artworkId, setArtworkId] = useState(initialArtworkId);
  const tx = useTx();
  const selected = artworkId || candidates[0]?.id || '';

  if (tx.digest)
    return (
      <Modal open onClose={onClose} title="Καταχώριση παραλαβής σε φύλαξη">
        <TxDone message="Η παραλαβή καταχωρίστηκε" digest={tx.digest} onClose={onClose} />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title="Καταχώριση παραλαβής σε φύλαξη">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void tx.run(() => custodyIntake({ gallery, galleryName, artworkId: selected }));
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Έργο *</span>
          <select
            value={selected}
            onChange={(e) => setArtworkId(e.target.value)}
            className="w-full border border-input bg-card px-3 py-1.5 outline-none focus:border-[hsl(var(--accent))]"
          >
            {candidates.length === 0 ? (
              <option value="">Κανένα έργο σε αναμονή παραλαβής</option>
            ) : null}
            {candidates.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} | {w.artistName} ({shortId(w.id)})
              </option>
            ))}
          </select>
        </label>
        {candidates.length === 0 ? (
          <InfoNote>
            Δεν υπάρχει έργο που να σας έχει ορίσει ως παραλήπτη. Παραλήπτη ορίζει ο καλλιτέχνης
            κατά την έκδοση, ή η ρυθμιστική αρχή όταν μεταφέρει τη φύλαξη από ανακληθείσα γκαλερί.
          </InfoNote>
        ) : null}
        <InfoNote>
          Δηλώνετε ότι παραλάβατε το φυσικό έργο. Η πράξη καταγράφεται δημόσια και μόνιμα στην
          αλυσίδα.
        </InfoNote>
        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button type="submit" disabled={!selected || tx.busy} icon="box-archive">
            Καταχώριση παραλαβής
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RedemptionConfirmModal({
  onClose,
  gallery,
  artwork: artworkProp,
}: {
  onClose: () => void;
  gallery: string;
  artwork: Artwork | undefined;
}) {
  const [accepted, setAccepted] = useState(false);
  const [artwork] = useState(artworkProp);
  const tx = useTx();

  if (tx.digest)
    return (
      <Modal open onClose={onClose} title="Επιβεβαίωση παράδοσης">
        <TxDone message="Η εξαργύρωση ολοκληρώθηκε" digest={tx.digest} onClose={onClose} />
      </Modal>
    );

  if (!artwork) return null;

  return (
    <Modal open onClose={onClose} title={`Επιβεβαίωση παράδοσης: ${artwork.title}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void tx.run(() => confirmRedemption({ gallery, artworkId: artwork.id }));
        }}
      >
        <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">Ιδιοκτήτης</dt>
          <dd className="font-mono2 text-xs">
            <AddressLink address={artwork.redemption?.requestedBy ?? ''} short />
          </dd>
          <dt className="text-muted-foreground">Αίτημα</dt>
          <dd className="font-mono2 text-xs">{fmtDate(artwork.redemption?.at ?? '')}</dd>
          <dt className="text-muted-foreground">Σημείωση</dt>
          <dd>{artwork.redemption?.note || 'χωρίς σημείωση'}</dd>
        </dl>

        <ConfirmWarning
          checkboxLabel="Βεβαιώνω ότι παρέδωσα το φυσικό έργο στον ιδιοκτήτη του"
          checked={accepted}
          onChecked={setAccepted}
        >
          <WarningNote>
            Η φύλαξη κλείνει και το έργο περνά σε τελική κατάσταση: καμία πιστοποίηση,
            κλασματοποίηση ή συναλλαγή δεν είναι πλέον δυνατή. Η σελίδα του παραμένει δημόσια ως
            ιστορικό. Η πράξη δεν αναιρείται.
          </WarningNote>
        </ConfirmWarning>

        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button type="submit" disabled={!accepted || tx.busy} icon="box-open">
            Επιβεβαίωση παράδοσης
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CertificateModal({
  onClose,
  gallery,
  galleryName,
  candidates,
  initialArtworkId,
}: {
  onClose: () => void;
  gallery: string;
  galleryName: string;
  candidates: Artwork[];
  initialArtworkId: string;
}) {
  const [artworkId, setArtworkId] = useState(initialArtworkId);
  const [statement, setStatement] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [hasResume, setHasResume] = useState(false);
  const resume = useRef<ReturnType<typeof createIssueCertificate> | null>(null);
  const tx = useTx();
  const selected = artworkId || candidates[0]?.id || '';

  if (tx.digest)
    return (
      <Modal open onClose={onClose} title="Έκδοση πιστοποιητικού γνησιότητας">
        <TxDone
          message="Το πιστοποιητικό εκδόθηκε"
          digest={tx.digest}
          onClose={onClose}
          detail={
            storageError ? (
              <WarningNote>
                Η σύνδεση της τεκμηρίωσης με το έργο δεν ολοκληρώθηκε ({storageError}). Το
                πιστοποιητικό εκδόθηκε κανονικά και το αρχείο είναι στο Walrus, η παράταση της
                αποθήκευσής του όμως δεν είναι ακόμη διαθέσιμη από τη σελίδα του έργου.
              </WarningNote>
            ) : null
          }
        />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title="Έκδοση πιστοποιητικού γνησιότητας">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!resume.current) {
            resume.current = createIssueCertificate(
              {
                gallery,
                galleryName,
                artworkId: selected,
                statement: statement.trim(),
                documentation: file,
              },
              setStep,
            );
            setHasResume(true);
          }
          const res = await tx.run(resume.current);
          setStep('');
          if (res) setStorageError(res.storageError);
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Έργο *</span>
          <select
            value={selected}
            onChange={(e) => setArtworkId(e.target.value)}
            className="w-full border border-input bg-card px-3 py-1.5 outline-none focus:border-[hsl(var(--accent))]"
          >
            {candidates.length === 0 ? <option value="">Κανένα έργο σε αναμονή</option> : null}
            {candidates.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} (σε φύλαξη)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Δήλωση *</span>
          <input
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Πρωτότυπο έργο, …"
            className="w-full border border-input bg-card px-3 py-1.5 outline-none focus:border-[hsl(var(--accent))]"
          />
        </label>
        <div className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Τεκμηρίωση</span>
          <div className="flex min-w-0 items-center gap-3">
            <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border border-[hsl(var(--accent))] text-[hsl(var(--accent))] px-4 py-1.5 text-[13px] hover:bg-[hsl(var(--accent)/0.08)]">
              <Icon name="arrow-up-from-bracket" size={12} />
              Επιλογή αρχείου…
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <span className="min-w-0 text-xs text-muted-foreground" title={file?.name}>
              {file ? file.name : 'δημόσιο αρχείο στο Walrus, ορατό σε όποιον ελέγχει το έργο'}
            </span>
          </div>
        </div>
        <WarningNote>
          Το πιστοποιητικό προσαρτάται μόνιμα στο έργο και δεν μπορεί να αφαιρεθεί ή να
          τροποποιηθεί.
        </WarningNote>
        <TxFeedback {...tx} pendingLabel={step || undefined} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button
            type="submit"
            disabled={!selected || !statement.trim() || tx.busy}
            icon="certificate"
          >
            {tx.error && hasResume ? 'Συνέχιση έκδοσης' : 'Έκδοση πιστοποιητικού'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function LossModal({
  onClose,
  gallery,
  works,
  initial,
}: {
  onClose: () => void;
  gallery: string;
  works: Artwork[];
  initial: LossTarget | null;
}) {
  const [artworkId, setArtworkId] = useState(initial?.artworkId ?? '');
  const [reportId, setReportId] = useState(initial?.reportId ?? '');
  const [reason, setReason] = useState('');
  const tx = useTx();

  const selected = artworkId || works[0]?.id || '';
  const reports = useReports(selected || undefined, 0, 50);
  const artworkReports = (reports.data ?? []).filter(
    (r) => r.condition && r.condition !== 'ok' && !!r.reportId,
  );
  const selectedReport = artworkReports.some((r) => r.reportId === reportId) ? reportId : '';

  if (tx.digest)
    return (
      <Modal open onClose={onClose} title="Δήλωση απώλειας ή καταστροφής">
        <TxDone message="Η απώλεια δηλώθηκε" digest={tx.digest} onClose={onClose} />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title="Δήλωση απώλειας ή καταστροφής">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void tx.run(() =>
            declareLoss({
              gallery,
              artworkId: selected,
              reportId: selectedReport || undefined,
              reason: reason.trim(),
            }),
          );
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Έργο *</span>
          <select
            value={selected}
            onChange={(e) => {
              setArtworkId(e.target.value);
              setReportId('');
            }}
            className="w-full border border-input bg-card px-3 py-1.5 outline-none focus:border-[hsl(var(--accent))]"
          >
            {works.length === 0 ? <option value="">Κανένα έργο σε φύλαξη</option> : null}
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} (σε φύλαξη)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Αναφορά κατάστασης ως τεκμήριο (προαιρετικό)</span>
          <select
            value={selectedReport}
            onChange={(e) => setReportId(e.target.value)}
            className="w-full border border-input bg-card px-3 py-1.5 font-mono2 outline-none focus:border-[hsl(var(--accent))]"
          >
            <option value="">
              {artworkReports.length ? 'Χωρίς αναφορά' : 'Δεν υπάρχουν αναφορές για το έργο'}
            </option>
            {artworkReports.map((r) => (
              <option key={r.id} value={r.reportId ?? ''}>
                {shortId(r.reportId ?? r.id)} | {r.condition ? statusLabel(r.condition) : ''} (
                {fmtDate(r.at)}, πηγή {shortId(r.source ?? '')})
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Αναφορά εγγεγραμμένης εξωτερικής πηγής (π.χ. επιθεωρητή) που τεκμηριώνει την απώλεια. Το
            αναγνωριστικό της καταγράφεται στο γεγονός της δήλωσης.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Αιτιολογία *</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="π.χ. Πυρκαγιά στον χώρο φύλαξης"
            className="w-full border border-input bg-card px-3 py-1.5 outline-none focus:border-[hsl(var(--accent))]"
          />
        </label>
        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button
            type="submit"
            disabled={!selected || !reason.trim() || tx.busy}
            variant="danger"
            icon="triangle-exclamation"
          >
            Δήλωση απώλειας
          </Button>
        </div>
      </form>
    </Modal>
  );
}
