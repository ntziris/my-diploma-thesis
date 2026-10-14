import { useState } from 'react';
import { Link } from 'react-router';
import type { ObjectId, SourceKind } from '@/adapters';
import {
  firstLoad,
  useEnclave,
  useGalleries,
  useOrphans,
  useOwnedBlobs,
  useParams,
  useRedirected,
  useRole,
  useSources,
  useWalrusEpoch,
} from '@/state/queries';
import type { StoredBlob } from '@/adapters/walrusStorage';
import { ExtendStorageModal, Expiry } from '@/components/StorageCard';
import { useWallet } from '@/adapters/wallet-context';
import { Icon } from '@/components/Icon';
import {
  reassignCustody,
  registerGallery,
  revokeGallery,
  registerSource,
  revokeSource,
  updatePcrs,
  updateRoyalty,
  updateWindow,
  acceptEnclave,
  setEndpoint,
} from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import type { TxResult } from '@/tx/transactions';
import { SOURCE_KIND_LABEL, isSuiAddress } from '@/state/derive';
import {
  Section,
  EmptyState,
  LoadingState,
  WarningNote,
  InfoNote,
  ScrollX,
  Page,
} from '@/components/primitives';
import { TxDone, TxFeedback } from '@/components/TxFeedback';
import { Modal, ConfirmWarning } from '@/components/Modal';
import { shortId } from '@/adapters/types';
import { PageWithNav, NavPane } from '@/components/SectionNav';
import { AddressLink } from '@/components/TxLink';
import { fmtBps, fmtBytes } from '@/components/format';
import { isTerminal } from '@/state/derive';
import { GovTrailSection } from '@/components/GovTrail';
import { ChannelStatusSection, EnclaveSection } from '@/components/EnclaveCard';
import { Button } from '@/components/Button';

export function AdminView() {
  const params = useParams();
  const role = useRole();
  const { address } = useWallet();

  if (params.loading || role.loading) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }

  if (!role.isAuthority || !address) {
    return (
      <Page>
        <EmptyState
          title="Απαιτείται η ρυθμιστική αρχή"
          hint="Η σελίδα διοίκησης είναι διαθέσιμη μόνο στη διεύθυνση της ρυθμιστικής αρχής της τρέχουσας εγκατάστασης."
        />
      </Page>
    );
  }

  return (
    <PageWithNav title="Διοίκηση" sections={ADMIN_SECTIONS}>
      <NavPane id="galleries">
        <GalleryRegistry />
      </NavPane>
      <NavPane id="gallery-register">
        <GalleryRegisterForm />
      </NavPane>
      <NavPane id="custody">
        <OrphanedCustody />
      </NavPane>
      <NavPane id="sources">
        <SourceRegistry />
      </NavPane>
      <NavPane id="source-register">
        <SourceRegisterForm />
      </NavPane>
      <NavPane id="royalty">
        <div className="flex flex-col gap-6">
          <RoyaltyParam
            key={params.data?.royaltyBps ?? 0}
            currentBps={params.data?.royaltyBps ?? 0}
          />
          <WindowParam
            key={params.data?.windowMs ?? 60_000}
            currentMs={params.data?.windowMs ?? 60_000}
          />
        </div>
      </NavPane>
      <NavPane id="enclave-config">
        <div className="flex flex-col gap-6">
          <EndpointParam current={params.data?.endpoint ?? ''} />
          <PcrParam />
        </div>
      </NavPane>
      <NavPane id="enclave">
        <div className="flex flex-col gap-6">
          <AcceptedEnclave accepted={params.data?.acceptedEnclave ?? null} />
          <ChannelStatusSection id="channel-status" />
        </div>
      </NavPane>
      <NavPane id="storage">
        <AuthorityStorage address={address} />
      </NavPane>
      <GovTrailSection
        id="trail"
        note="Τα ίδια δεδομένα είναι ορατά σε οποιονδήποτε μέσω των events."
      />
    </PageWithNav>
  );
}

const ADMIN_SECTIONS = [
  { id: 'galleries', label: 'Μητρώο γκαλερί', icon: 'building-columns' },
  { id: 'gallery-register', label: 'Εγγραφή γκαλερί', icon: 'arrow-right' },
  { id: 'custody', label: 'Έργα χωρίς φύλαξη', icon: 'box-open' },
  { id: 'sources', label: 'Μητρώο πηγών', icon: 'satellite-dish' },
  { id: 'source-register', label: 'Εγγραφή πηγής', icon: 'arrow-right' },
  { id: 'royalty', label: 'Εποπτικές παράμετροι', icon: 'sliders' },
  { id: 'enclave-config', label: 'Ρυθμίσεις Oracle Nautilus', icon: 'file-shield' },
  { id: 'enclave', label: 'Oracle Nautilus', icon: 'shield-halved' },
  { id: 'storage', label: 'Walrus Site', icon: 'box-archive' },
  { id: 'trail', label: 'Ίχνος πράξεων', icon: 'clock-rotate-left' },
] as const;

function RegisterModal({
  subject,
  onClose,
  onDone,
}: {
  subject:
    | { kind: 'gallery'; address: string; name: string }
    | { kind: 'source'; address: string; name: string; sourceKind: SourceKind };
  onClose: () => void;
  onDone: () => void;
}) {
  const tx = useTx();
  const isGallery = subject.kind === 'gallery';
  const title = isGallery ? 'Εγγραφή γκαλερί' : 'Εγγραφή εξωτερικής πηγής';

  if (tx.digest)
    return (
      <Modal open onClose={onDone} title={title}>
        <TxDone message="Η εγγραφή καταγράφηκε στην αλυσίδα." digest={tx.digest} onClose={onDone} />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title={`${title}: ${subject.name}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void tx.run(() =>
            subject.kind === 'gallery'
              ? registerGallery({ address: subject.address, name: subject.name })
              : registerSource({
                  address: subject.address,
                  name: subject.name,
                  kind: subject.sourceKind,
                }),
          );
        }}
      >
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">{isGallery ? 'Επωνυμία' : 'Ονομασία'}</dt>
          <dd>{subject.name}</dd>
          <dt className="text-muted-foreground">
            {isGallery ? 'Διεύθυνση' : 'Ταυτότητα κλειδιού'}
          </dt>
          <dd className="break-all font-mono2 text-xs">{subject.address}</dd>
          {subject.kind === 'source' ? (
            <>
              <dt className="text-muted-foreground">Είδος</dt>
              <dd>{SOURCE_KIND_LABEL[subject.sourceKind]}</dd>
            </>
          ) : null}
        </dl>

        <InfoNote>
          {isGallery
            ? 'Η γκαλερί αποκτά από την επόμενη συναλλαγή το δικαίωμα να παραλαμβάνει έργα, να εκδίδει πιστοποιητικά και να επιβεβαιώνει εξαργυρώσεις. Η εγγραφή είναι δημόσια και μπορεί να ανακληθεί από το μητρώο.'
            : 'Οι αναφορές αυτής της πηγής θα γίνονται δεκτές από την αλυσίδα από την επόμενη συναλλαγή, εφόσον τις υπογράψει το Oracle Nautilus. Η εγγραφή είναι δημόσια και μπορεί να ανακληθεί από το μητρώο.'}
        </InfoNote>

        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button
            type="submit"
            disabled={tx.busy}
            icon={isGallery ? 'building-columns' : 'satellite-dish'}
          >
            Εγγραφή
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ParamChangeModal({
  title,
  label,
  from,
  to,
  run,
  onClose,
  onDone,
  warning,
}: {
  title: string;
  label: string;
  from: string;
  to: string;
  run: () => Promise<TxResult>;
  onClose: () => void;
  onDone: () => void;
  warning?: string;
}) {
  const tx = useTx();

  if (tx.digest)
    return (
      <Modal open onClose={onDone} title={title}>
        <TxDone
          message="Η νέα τιμή καταγράφηκε στην αλυσίδα."
          digest={tx.digest}
          onClose={onDone}
        />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void tx.run(run);
        }}
      >
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">Παράμετρος</dt>
          <dd>{label}</dd>
          <dt className="text-muted-foreground">Ισχύουσα τιμή</dt>
          <dd className="break-all font-mono2">{from}</dd>
          <dt className="text-muted-foreground">Νέα τιμή</dt>
          <dd className="break-all font-mono2 font-medium">{to}</dd>
        </dl>
        <WarningNote>
          {warning ??
            'Η αλλαγή ισχύει από την επόμενη συναλλαγή και εκπέμπει δημόσιο event με την παλιά και τη νέα τιμή, ορατό στο ίχνος πράξεων της σελίδας διαφάνειας.'}
        </WarningNote>
        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button type="submit" disabled={tx.busy} icon="sliders">
            Ενημέρωση
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RevokeModal({
  subject,
  onClose,
}: {
  subject:
    | { kind: 'gallery'; address: string; name: string }
    | { kind: 'source'; address: string; name: string; sourceKind: SourceKind };
  onClose: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const tx = useTx();
  const isGallery = subject.kind === 'gallery';
  const title = isGallery ? 'Ανάκληση γκαλερί' : 'Ανάκληση εξωτερικής πηγής';

  if (tx.digest)
    return (
      <Modal open onClose={onClose} title={title}>
        <TxDone
          message="Η ανάκληση καταγράφηκε στην αλυσίδα."
          digest={tx.digest}
          onClose={onClose}
        />
      </Modal>
    );

  return (
    <Modal open onClose={onClose} title={`${title}: ${subject.name}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void tx.run(() =>
            isGallery ? revokeGallery(subject.address) : revokeSource(subject.address),
          );
        }}
      >
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">Ονομασία</dt>
          <dd>{subject.name}</dd>
          <dt className="text-muted-foreground">
            {isGallery ? 'Διεύθυνση' : 'Ταυτότητα κλειδιού'}
          </dt>
          <dd className="break-all font-mono2 text-xs">
            {isGallery ? <AddressLink address={subject.address} short /> : subject.address}
          </dd>
          {subject.kind === 'source' ? (
            <>
              <dt className="text-muted-foreground">Είδος</dt>
              <dd>{SOURCE_KIND_LABEL[subject.sourceKind]}</dd>
            </>
          ) : null}
        </dl>

        <ConfirmWarning
          checkboxLabel={
            isGallery
              ? 'Βεβαιώνω ότι θέλω να ανακαλέσω αυτή τη γκαλερί'
              : 'Βεβαιώνω ότι θέλω να ανακαλέσω αυτή την πηγή'
          }
          checked={accepted}
          onChecked={setAccepted}
        >
          <WarningNote>
            {isGallery
              ? 'Η γκαλερί παύει από την επόμενη συναλλαγή να παραλαμβάνει έργα, να εκδίδει πιστοποιητικά και να επιβεβαιώνει εξαργυρώσεις. Τα έργα που φυλάσσει μένουν χωρίς φύλαξη μέχρι να ανατεθούν σε άλλη γκαλερί. Η πράξη καταγράφεται δημόσια.'
              : 'Οι αναφορές που προέρχονται από αυτή την πηγή θα απορρίπτονται από την αλυσίδα από την επόμενη συναλλαγή. Οι αναφορές που έχουν ήδη καταγραφεί μένουν ως ιστορικό. Η πράξη καταγράφεται δημόσια.'}
          </WarningNote>
        </ConfirmWarning>

        <TxFeedback {...tx} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="neutral">
            Άκυρο
          </Button>
          <Button
            type="submit"
            disabled={!accepted || tx.busy}
            variant="danger"
            icon="circle-xmark"
          >
            Ανάκληση
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GalleryRegistry() {
  const galleries = useGalleries().data ?? [];
  const [revoking, setRevoking] = useState<{ address: string; name: string } | null>(null);
  return (
    <Section
      id="galleries"
      title="Μητρώο πιστοποιημένων γκαλερί"
      icon="building-columns"
      note="Η ανάκληση ισχύει από την επόμενη συναλλαγή της γκαλερί."
    >
      <ScrollX minWidth="38rem">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Διεύθυνση</th>
              <th className="py-2 pr-4 font-medium">Επωνυμία</th>
              <th className="py-2 pr-4 font-medium">Εγγραφή</th>
              <th className="py-2 pr-4 font-medium">Κατάσταση</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {galleries.map((g) => (
              <tr key={g.address} className="border-b border-border last:border-b-0">
                <td className="py-2.5 pr-4">
                  <AddressLink address={g.address} short />
                </td>
                <td className="py-2.5 pr-4">{g.name}</td>
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs">
                  {g.registeredAt}
                </td>
                <td className="py-2.5 pr-4">
                  {g.active ? (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                      <Icon name="circle-check" size={11} /> Ενεργή
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--destructive))]">
                      <Icon name="circle-xmark" size={11} /> Ανακλήθηκε {g.revokedAt}
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {g.active ? (
                    <Button
                      onClick={() => setRevoking({ address: g.address, name: g.name })}
                      variant="danger-outline"
                      size="xs"
                    >
                      Ανάκληση
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      {revoking ? (
        <RevokeModal subject={{ kind: 'gallery', ...revoking }} onClose={() => setRevoking(null)} />
      ) : null}
    </Section>
  );
}

function GalleryRegisterForm() {
  const [newAddr, setNewAddr] = useState('');
  const [newName, setNewName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const addrOk = isSuiAddress(newAddr.trim());
  const canSubmit = addrOk && newName.trim() !== '';
  return (
    <Section id="gallery-register" title="Εγγραφή γκαλερί" icon="building-columns">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) setConfirming(true);
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Διεύθυνση</span>
          <input
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            placeholder="0x…"
            aria-invalid={newAddr.trim() !== '' && !addrOk}
            className="border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))] aria-[invalid=true]:border-[hsl(var(--destructive))]"
          />
          {newAddr.trim() !== '' && !addrOk ? (
            <span className="text-xs text-[hsl(var(--destructive))]">
              Μορφή διεύθυνσης SUI: 0x και 64 δεκαεξαδικά ψηφία
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Η διεύθυνση του wallet με το οποίο η γκαλερί υπογράφει τις συναλλαγές της.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Επωνυμία</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="π.χ. Gallery D"
            className="border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-[hsl(var(--accent))]"
          />
        </label>
        <div>
          <Button type="submit" disabled={!canSubmit} icon="building-columns">
            Εγγραφή γκαλερί
          </Button>
        </div>
      </form>
      {confirming ? (
        <RegisterModal
          subject={{ kind: 'gallery', address: newAddr.trim(), name: newName.trim() }}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false);
            setNewAddr('');
            setNewName('');
          }}
        />
      ) : null}
    </Section>
  );
}

function OrphanedCustody() {
  const galleries = useGalleries().data ?? [];
  const [target, setTarget] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<{
    artworkId: string;
    title: string;
    from: string;
    gallery: string;
    galleryName: string;
  } | null>(null);
  const orphans = useOrphans(true).data ?? [];
  const redirected = useRedirected(true).data ?? [];
  const active = galleries.filter((g) => g.active);
  const awaiting = redirected.filter((a) => !isTerminal(a));

  if (orphans.length === 0 && awaiting.length === 0 && !assigning) {
    return (
      <Section
        id="custody"
        title="Έργα σε ανακληθείσα γκαλερί"
        icon="triangle-exclamation"
        note="Η ανάκληση δεν μεταφέρει από μόνη της τίποτα. Η αρχή ορίζει τη γκαλερί που παραλαμβάνει το έργο, και η φύλαξη αλλάζει μόνο όταν εκείνη καταχωρίσει την παραλαβή του φυσικού έργου."
      >
        <EmptyState
          title="Κανένα έργο χωρίς φύλαξη"
          hint="Όλα τα έργα σε φύλαξη βρίσκονται σε ενεργές γκαλερί. Αν ανακληθεί γκαλερί που φυλάσσει έργα, τα έργα θα εμφανιστούν εδώ για ανάθεση σε νέα γκαλερί."
        />
      </Section>
    );
  }

  return (
    <Section
      id="custody"
      title="Έργα σε ανακληθείσα γκαλερί"
      icon="triangle-exclamation"
      note="Η ανάκληση δεν μεταφέρει από μόνη της τίποτα. Η αρχή ορίζει τη γκαλερί που παραλαμβάνει το έργο, και η φύλαξη αλλάζει μόνο όταν εκείνη καταχωρίσει την παραλαβή του φυσικού έργου. Η ιδιοκτησία και τα κλάσματα δεν θίγονται σε καμία περίπτωση."
    >
      {orphans.length > 0 ? (
        <ScrollX minWidth="44rem">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Έργο</th>
                <th className="py-2 pr-4 font-medium">Ανακληθείσα γκαλερί</th>
                <th className="py-2 pr-4 font-medium">Νέα γκαλερί φύλαξης</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {orphans.map((a) => {
                const chosen = target[a.id] ?? active[0]?.address ?? '';
                const gallery = active.find((g) => g.address === chosen);
                return (
                  <tr key={a.id} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pr-4">
                      <Link to={`/artwork/${a.id}`} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{a.custody?.galleryName}</td>
                    <td className="py-2.5 pr-4">
                      <select
                        value={chosen}
                        aria-label="Γκαλερί παραλαβής"
                        onChange={(e) => setTarget((t) => ({ ...t, [a.id]: e.target.value }))}
                        className="border border-input bg-card px-2 py-1 outline-none focus:border-[hsl(var(--accent))]"
                      >
                        {active.map((g) => (
                          <option key={g.address} value={g.address}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        onClick={() =>
                          gallery &&
                          setAssigning({
                            artworkId: a.id,
                            title: a.title,
                            from: a.custody?.galleryName ?? '',
                            gallery: gallery.address,
                            galleryName: gallery.name,
                          })
                        }
                        disabled={!gallery}
                        size="xs"
                      >
                        Ανάθεση φύλαξης
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollX>
      ) : null}

      {awaiting.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5 text-[13px]">
          {awaiting.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <Icon
                name="hourglass-half"
                size={12}
                className="shrink-0 text-[hsl(var(--accent))]"
              />
              <Link to={`/artwork/${a.id}`} className="font-medium hover:underline">
                {a.title}
              </Link>
              <span className="text-muted-foreground">
                αναμένει παραλαβή από {a.intendedGallery?.galleryName}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {assigning ? (
        <ParamChangeModal
          title="Ανάθεση φύλαξης"
          label={assigning.title}
          from={assigning.from || 'ανακληθείσα γκαλερί'}
          to={assigning.galleryName}
          warning="Η ανάθεση ορίζει ποια γκαλερί μπορεί να παραλάβει το έργο. Η φύλαξη αλλάζει μόνο όταν εκείνη καταχωρίσει την παραλαβή του φυσικού έργου. Η ιδιοκτησία και τα κλάσματα δεν θίγονται."
          run={() =>
            reassignCustody({
              artworkId: assigning.artworkId,
              gallery: assigning.gallery,
              galleryName: assigning.galleryName,
            })
          }
          onClose={() => setAssigning(null)}
          onDone={() => setAssigning(null)}
        />
      ) : null}
    </Section>
  );
}

function SourceRegistry() {
  const sources = useSources().data ?? [];
  const [revoking, setRevoking] = useState<{
    address: string;
    name: string;
    sourceKind: SourceKind;
  } | null>(null);
  return (
    <Section
      id="sources"
      title="Μητρώο εξωτερικών πηγών"
      icon="satellite-dish"
      note="Η ταυτότητα μιας πηγής είναι η διεύθυνση που παράγεται από το δημόσιο κλειδί της."
    >
      <ScrollX minWidth="46rem">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Ταυτότητα κλειδιού</th>
              <th className="py-2 pr-4 font-medium">Ονομασία</th>
              <th className="py-2 pr-4 font-medium">Είδος</th>
              <th className="py-2 pr-4 font-medium">Κατάσταση</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.address} className="border-b border-border last:border-b-0">
                <td className="py-2.5 pr-4">
                  {/* not a link to the explorer, so the identity is written out in full */}
                  <span className="block w-[15.5rem] break-all font-mono2 text-xs">
                    {s.address}
                  </span>
                </td>
                <td className="py-2.5 pr-4">{s.name}</td>
                <td className="py-2.5 pr-4">{SOURCE_KIND_LABEL[s.kind]}</td>
                <td className="py-2.5 pr-4">
                  {s.active ? (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                      <Icon name="circle-check" size={11} /> Ενεργή
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--destructive))]">
                      <Icon name="circle-xmark" size={11} /> Ανακλήθηκε {s.revokedAt}
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {s.active ? (
                    <Button
                      onClick={() =>
                        setRevoking({ address: s.address, name: s.name, sourceKind: s.kind })
                      }
                      variant="danger-outline"
                      size="xs"
                    >
                      Ανάκληση
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      {revoking ? (
        <RevokeModal subject={{ kind: 'source', ...revoking }} onClose={() => setRevoking(null)} />
      ) : null}
    </Section>
  );
}

function SourceRegisterForm() {
  const [newAddr, setNewAddr] = useState('');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<SourceKind>('inspector');
  const [confirming, setConfirming] = useState(false);
  const addrOk = isSuiAddress(newAddr.trim());
  const canSubmit = addrOk && newName.trim() !== '';
  return (
    <Section
      id="source-register"
      title="Εγγραφή εξωτερικής πηγής"
      icon="satellite-dish"
      note="Η εγγραφή καταγράφει την ταυτότητα του κλειδιού, την ονομασία και το είδος της πηγής, ώστε κάθε αναφορά να αποδίδεται δημόσια σε συγκεκριμένη οντότητα."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) setConfirming(true);
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Ταυτότητα κλειδιού</span>
          <input
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            placeholder="0x…"
            aria-invalid={newAddr.trim() !== '' && !addrOk}
            className="border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))] aria-[invalid=true]:border-[hsl(var(--destructive))]"
          />
          {newAddr.trim() !== '' && !addrOk ? (
            <span className="text-xs text-[hsl(var(--destructive))]">
              Μορφή ταυτότητας: 0x και 64 δεκαεξαδικά ψηφία
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Το αποτύπωμα του δημόσιου κλειδιού της πηγής, όπως το τυπώνει το εργαλείο της
              συσκευής.
            </span>
          )}
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">Ονομασία</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="π.χ. Αισθητήρας αίθουσας Β"
              className="border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-[hsl(var(--accent))]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">Είδος</span>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as SourceKind)}
              className="border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-[hsl(var(--accent))]"
            >
              {Object.entries(SOURCE_KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <Button type="submit" disabled={!canSubmit} icon="satellite-dish">
            Εγγραφή πηγής
          </Button>
        </div>
      </form>
      {confirming ? (
        <RegisterModal
          subject={{
            kind: 'source',
            address: newAddr.trim(),
            name: newName.trim(),
            sourceKind: newKind,
          }}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false);
            setNewAddr('');
            setNewName('');
          }}
        />
      ) : null}
    </Section>
  );
}

function AcceptedEnclave({ accepted }: { accepted: ObjectId | null }) {
  const [pending, setPending] = useState<ObjectId | null>(null);
  return (
    <>
      <EnclaveSection
        id="enclave"
        history
        note="Η αρχή δηλώνει τα PCR της εικόνας και αποδέχεται το Oracle Nautilus που τα φέρει. Η εγγραφή είναι ελεύθερη, αφού η attestation πιστοποιεί τον κώδικα και όχι την εγκατάσταση: χωρίς αποδοχή καμία αναφορά δεν καταγράφεται."
        onAccept={setPending}
      />
      {pending ? (
        <ParamChangeModal
          title="Αποδοχή Oracle Nautilus"
          label="Αποδεκτό Oracle Nautilus"
          from={accepted ?? 'κανείς'}
          to={pending}
          warning="Το προηγούμενο Oracle Nautilus παύει αμέσως να καταγράφει αναφορές. Η πράξη εκπέμπει δημόσιο γεγονός."
          run={() => acceptEnclave(pending)}
          onClose={() => setPending(null)}
          onDone={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

function EndpointParam({ current }: { current: string }) {
  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const next = value.trim();
  const valid = /^https:\/\/[^\s]+$/.test(next) && next.length <= 256;
  return (
    <Section
      id="endpoint"
      title="Σημείο εισόδου του καναλιού"
      icon="satellite-dish"
      note="Η διεύθυνση στην οποία οι εγγεγραμμένες πηγές στέλνουν τις ενδείξεις τους. Δημόσια πληροφορία και όχι σημείο εμπιστοσύνης: ένδειξη που πάει αλλού απλώς δεν γίνεται ποτέ αναφορά, αφού μόνο το αποδεκτό Oracle Nautilus μπορεί να υπογράψει."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && next !== current) setConfirming(true);
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Διεύθυνση</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={current || 'https://art-channel.duckdns.org'}
            className="w-full border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
          />
          <span className="text-xs text-muted-foreground">
            {current ? `τώρα ${current}` : 'δεν έχει δημοσιευτεί ακόμη'}
          </span>
        </label>
        <div>
          <Button type="submit" disabled={!valid || next === current}>
            Ενημέρωση παραμέτρου
          </Button>
        </div>
      </form>
      {confirming ? (
        <ParamChangeModal
          title="Σημείο εισόδου του καναλιού"
          label="Διεύθυνση"
          from={current || 'κενό'}
          to={next}
          run={() => setEndpoint(next)}
          onClose={() => setConfirming(false)}
          onDone={() => setConfirming(false)}
        />
      ) : null}
    </Section>
  );
}

function PcrParam() {
  const enclave = useEnclave();
  const cur = enclave.data;
  const [pcr0, setPcr0] = useState('');
  const [pcr2, setPcr2] = useState('');
  const [confirming, setConfirming] = useState(false);
  const clean = (v: string) => v.trim().toLowerCase().replace(/^0x/, '');
  const isPcr = (v: string) => /^[0-9a-f]{96}$/.test(clean(v));
  const next0 = pcr0 ? clean(pcr0) : (cur?.pcr0 ?? '');
  const next2 = pcr2 ? clean(pcr2) : (cur?.pcr2 ?? '');
  const valid = isPcr(next0) && isPcr(next2);
  const changed = !!cur && (next0 !== cur.pcr0 || next2 !== cur.pcr2);
  return (
    <Section
      id="pcrs"
      title="Αλλαγή μετρήσεων της εικόνας του Oracle Nautilus"
      icon="file-shield"
      note="Τα PCR της εικόνας που έχτισε η αρχή. Η αλυσίδα δέχεται εγγραφή μόνο από Oracle Nautilus που τρέχει ακριβώς αυτή την εικόνα. Κάθε νέα δήλωση ανεβάζει την έκδοση της ρύθμισης, και το Oracle Nautilus πρέπει να ξαναεγγραφεί."
    >
      {enclave.loading ? (
        <LoadingState />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && changed) setConfirming(true);
          }}
        >
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-[13px] sm:grid-cols-[11rem_1fr]">
            <dt className="text-muted-foreground">Έκδοση ρύθμισης</dt>
            <dd className="font-mono2">{cur?.version ?? '…'}</dd>
            <dt className="text-muted-foreground">Ισχύον PCR0 = PCR1</dt>
            <dd className="break-all font-mono2 text-xs">{cur?.pcr0 || 'αδήλωτο'}</dd>
            <dt className="text-muted-foreground">Ισχύον PCR2</dt>
            <dd className="break-all font-mono2 text-xs">{cur?.pcr2 || 'αδήλωτο'}</dd>
          </dl>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">Νέο PCR0 (= PCR1)</span>
            <input
              value={pcr0}
              onChange={(e) => setPcr0(e.target.value)}
              placeholder="96 δεκαεξαδικοί χαρακτήρες, κενό κρατά το ισχύον"
              spellCheck={false}
              className="w-full border border-input bg-card px-3 py-1.5 font-mono2 text-xs outline-none focus:border-[hsl(var(--accent))]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">Νέο PCR2</span>
            <input
              value={pcr2}
              onChange={(e) => setPcr2(e.target.value)}
              placeholder="96 δεκαεξαδικοί χαρακτήρες, κενό κρατά το ισχύον"
              spellCheck={false}
              className="w-full border border-input bg-card px-3 py-1.5 font-mono2 text-xs outline-none focus:border-[hsl(var(--accent))]"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Οι τιμές όπως τις τυπώνει το <span className="font-mono2">nitro-cli build-enclave</span>{' '}
            (αρχείο <span className="font-mono2">out/nitro.pcrs</span>).
          </p>
          <div>
            <Button type="submit" disabled={!valid || !changed}>
              Δήλωση μετρήσεων
            </Button>
          </div>
        </form>
      )}
      {confirming && cur ? (
        <ParamChangeModal
          title="Αλλαγή μετρήσεων της εικόνας του Oracle Nautilus"
          label="PCR0 = PCR1, PCR2"
          from={`${cur.pcr0 || 'αδήλωτα'} / ${cur.pcr2 || 'αδήλωτα'} (έκδοση ${cur.version})`}
          to={`${next0} / ${next2} (έκδοση ${cur.version + 1})`}
          warning="Η έκδοση της ρύθμισης αυξάνεται. Το Oracle Nautilus που τρέχει παύει να θεωρείται εγγεγραμμένο, μέχρι να ξεκινήσει με την εικόνα που δηλώνετε και να εγγραφεί ξανά. Η δήλωση δεν εκπέμπει event, φαίνεται στην έκδοση της ρύθμισης."
          run={() => updatePcrs(next0, next0, next2)}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false);
            setPcr0('');
            setPcr2('');
          }}
        />
      ) : null}
    </Section>
  );
}

function AuthorityStorage({ address }: { address: string }) {
  const blobs = useOwnedBlobs(address);
  const epoch = useWalrusEpoch();
  const [extending, setExtending] = useState<StoredBlob | null>(null);
  const rows = blobs.data ?? [];
  const now = epoch.data;
  return (
    <Section
      id="storage"
      title="Walrus Site"
      icon="box-archive"
      note="Οι πόροι του Walrus Site που φιλοξενεί τη διεπαφή χρήστη ανήκουν στη ρυθμιστική αρχή και παρατείνονται από εδώ."
    >
      {firstLoad(blobs, epoch) ? (
        <LoadingState label="Ανάγνωση από το Walrus…" />
      ) : !now || blobs.error ? (
        <WarningNote>Η ανάγνωση από το Walrus απέτυχε. Δοκιμάστε ξανά σε λίγο.</WarningNote>
      ) : rows.length === 0 ? (
        <EmptyState title="Η ρυθμιστική αρχή δεν κατέχει αντικείμενα Blob." />
      ) : (
        <ScrollX minWidth="40rem">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Blob</th>
                <th className="py-2 pr-4 font-medium">Μέγεθος</th>
                <th className="py-2 pr-4 font-medium">Λήξη</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.objectId} className="border-b border-border last:border-b-0">
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <span className="font-mono2 text-xs" title={b.blobId}>
                      {shortId(b.blobId, 8, 6)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 font-mono2">{fmtBytes(b.size)}</td>
                  <td className="py-2.5 pr-4">
                    <Expiry blob={b} epoch={now} />
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      onClick={() => setExtending(b)}
                      variant="outline"
                      size="xs"
                      icon="clock"
                    >
                      Παράταση
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
      {extending && now ? (
        <ExtendStorageModal
          blob={extending}
          label={shortId(extending.blobId, 8, 6)}
          epoch={now}
          onClose={() => setExtending(null)}
        />
      ) : null}
    </Section>
  );
}

function fmtMinutes(ms: number): string {
  const m = ms / 60_000;
  return Number.isInteger(m) ? String(m) : m.toFixed(1).replace('.', ',');
}

function WindowParam({ currentMs }: { currentMs: number }) {
  const [value, setValue] = useState(String(Math.max(1, Math.round(currentMs / 60_000))));
  const [confirming, setConfirming] = useState(false);

  const minutes = parseInt(value, 10);
  const valid = Number.isFinite(minutes) && minutes >= 1 && minutes <= 1_440;
  const ms = minutes * 60_000;
  return (
    <Section
      id="window"
      title="Παράθυρο συνάθροισης του Oracle Nautilus"
      icon="hourglass-half"
      note="Πόσο διάστημα μαζεύει το Oracle Nautilus τις αναγνώσεις μιας πηγής για ένα έργο πριν υπογράψει και καταγράψει μία αναφορά."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && ms !== currentMs) setConfirming(true);
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Διάρκεια παραθύρου</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1_440}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28 border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
            />
            <span className="text-muted-foreground">
              λεπτά (1 έως 1 440, τώρα {fmtMinutes(currentMs)})
            </span>
          </span>
        </label>
        <div>
          <Button type="submit" disabled={!valid || ms === currentMs}>
            Ενημέρωση παραμέτρου
          </Button>
        </div>
      </form>
      {confirming ? (
        <ParamChangeModal
          title="Παράθυρο συνάθροισης του Oracle Nautilus"
          label="Διάρκεια παραθύρου"
          from={`${fmtMinutes(currentMs)} λεπτά`}
          to={`${minutes} λεπτά`}
          run={() => updateWindow(ms)}
          onClose={() => setConfirming(false)}
          onDone={() => setConfirming(false)}
        />
      ) : null}
    </Section>
  );
}

function RoyaltyParam({ currentBps }: { currentBps: number }) {
  const [value, setValue] = useState(String(currentBps));
  const [confirming, setConfirming] = useState(false);
  const num = parseInt(value, 10);
  const valid = Number.isFinite(num) && num >= 0 && num <= 10_000;
  return (
    <Section id="royalty" title="Εποπτικές παράμετροι" icon="sliders">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && num !== currentBps) setConfirming(true);
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Δικαίωμα παρακολούθησης</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={10000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28 border border-input bg-card px-3 py-1.5 font-mono2 text-sm outline-none focus:border-[hsl(var(--accent))]"
            />
            <span className="text-muted-foreground">
              μονάδες βάσης ({valid ? fmtBps(num) : '…'})
            </span>
          </span>
        </label>
        <div>
          <Button type="submit" disabled={!valid || num === currentBps}>
            Ενημέρωση παραμέτρου
          </Button>
        </div>
      </form>
      {confirming ? (
        <ParamChangeModal
          title="Δικαίωμα παρακολούθησης"
          label="Ποσοστό δικαιώματος παρακολούθησης"
          from={`${fmtBps(currentBps)} (${currentBps} μονάδες βάσης)`}
          to={`${fmtBps(num)} (${num} μονάδες βάσης)`}
          run={() => updateRoyalty(num)}
          onClose={() => setConfirming(false)}
          onDone={() => setConfirming(false)}
        />
      ) : null}
    </Section>
  );
}
