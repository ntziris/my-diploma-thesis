import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { isValidSuiObjectId, normalizeSuiObjectId } from '@mysten/sui/utils';
import { useArtwork, useGalleries } from '@/state/queries';
import {
  isGallery,
  isTerminal,
  lifecycleLabel,
  lifecycleTone,
  needsAttention,
  terminalNote,
  terminalTone,
} from '@/state/derive';
import { LoadingState, Page, WarningNote } from '@/components/primitives';
import { StatusBadge } from '@/components/StatusBadge';
import { DocumentButton } from '@/components/DocumentViewer';
import { Icon, type IconName } from '@/components/Icon';
import { AddressLink, ObjectLink } from '@/components/TxLink';
import { fmtDate, fmtInt } from '@/components/format';
import type { Artwork } from '@/adapters';
import { ButtonLink } from '@/components/Button';

export function VerifyView() {
  const { id } = useParams();
  const galleries = useGalleries();
  const query = id?.trim() ?? '';
  const validId = !!query && isValidSuiObjectId(query);
  const {
    data: found,
    loading: artworkLoading,
    error: artworkError,
  } = useArtwork(validId ? normalizeSuiObjectId(query) : undefined);
  const artwork = found ?? undefined;
  // The active registry entry of the custodian, null when the gallery was revoked
  const custodian = isGallery(galleries.data ?? [], artwork?.custody?.gallery ?? null);
  const last = artwork?.lastReport ?? null;
  const concern = artwork ? needsAttention(artwork) : null;
  const custodyClosed = !!artwork?.custody?.until;
  const verdict = artwork
    ? verdictFor(artwork, {
        concern: !!concern,
        custodyRevoked: !!artwork.custody && !custodyClosed && !custodian,
      })
    : null;

  return (
    <Page
      title="Επαλήθευση έργου"
      intro="Εισάγετε το αναγνωριστικό (object id) ενός έργου. Η απάντηση διαβάζεται απευθείας από τα δημόσια αντικείμενα της αλυσίδας, χωρίς να απαιτείται σύνδεση wallet."
    >
      <SearchForm key={query} initial={query} />

      <div className="mt-8">
        {!query ? null : !validId ? (
          <WarningNote>
            Μη έγκυρο αναγνωριστικό. Ένα object id είναι 0x και 64 δεκαεξαδικοί χαρακτήρες.
          </WarningNote>
        ) : galleries.loading || artworkLoading ? (
          <LoadingState />
        ) : artworkError && found === undefined ? (
          <WarningNote>Η ανάγνωση από το δίκτυο απέτυχε. Δοκιμάστε ξανά σε λίγο.</WarningNote>
        ) : artwork ? (
          <section className="border border-border bg-card">
            <header
              className={`flex items-center gap-2 border-b border-border px-5 py-3 ${VERDICT_TONE[verdict!.tone]}`}
            >
              <Icon name={verdict!.icon} size={15} className="shrink-0" />
              <h2 className="text-sm font-semibold">{verdict!.title}</h2>
            </header>
            {isTerminal(artwork) ? (
              <p
                className={`border-b px-5 py-3 text-[13px] leading-relaxed ${
                  terminalTone(artwork) === 'amber'
                    ? 'border-[hsl(var(--status-damaged-border))] bg-[hsl(var(--status-damaged-bg))] text-[hsl(var(--status-damaged-fg))]'
                    : 'border-[hsl(var(--status-destroyed-border))] bg-[hsl(var(--status-destroyed-bg))] text-[hsl(var(--status-destroyed-fg))]'
                }`}
              >
                {terminalNote(artwork)}
              </p>
            ) : null}
            <dl className="grid grid-cols-[7rem_1fr] items-center gap-y-2.5 sm:grid-cols-[10.5rem_1fr] px-5 py-4 text-[13px]">
              <dt className="text-muted-foreground">Τίτλος</dt>
              <dd>
                <Link to={`/artwork/${artwork.id}`} className="font-medium hover:underline">
                  {artwork.title}
                </Link>
              </dd>
              <dt className="text-muted-foreground">ID έργου</dt>
              <dd>
                <ObjectLink id={artwork.id} />
              </dd>
              <dt className="text-muted-foreground">Καλλιτέχνης</dt>
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
              <dt className="text-muted-foreground">
                {custodyClosed ? 'Γκαλερί που φύλασσε' : 'Γκαλερί φύλαξης'}
              </dt>
              <dd>
                {artwork.custody ? (
                  <>
                    {artwork.custody.galleryName}{' '}
                    {custodyClosed ? (
                      <span className="text-muted-foreground">
                        (η φύλαξη έκλεισε στις {artwork.custody.until})
                      </span>
                    ) : custodian ? (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                        (<Icon name="circle-check" size={11} className="shrink-0" /> ενεργή στο
                        μητρώο)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--status-damaged-fg))]">
                        (<Icon name="triangle-exclamation" size={11} className="shrink-0" /> η
                        εγγραφή της έχει ανακληθεί)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Χωρίς ενεργή φύλαξη</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Κατάσταση</dt>
              <dd className={`font-medium ${lifecycleTone(artwork)}`}>{lifecycleLabel(artwork)}</dd>
              <dt className="text-muted-foreground">Πιστοποιητικό</dt>
              <dd>
                {artwork.certificate ? (
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                    <Icon name="certificate" size={12} className="shrink-0" /> εκδόθηκε{' '}
                    {artwork.certificate.issuedAt} από {artwork.certificate.issuerName}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--status-destroyed-fg))]">
                    <Icon name="circle-xmark" size={12} className="shrink-0" /> δεν έχει εκδοθεί
                  </span>
                )}
              </dd>
              {artwork.certificate ? (
                <>
                  <dt className="text-muted-foreground">Τεκμηρίωση</dt>
                  <dd>
                    {artwork.certificate.documentationBlobId ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <DocumentButton
                          blobId={artwork.certificate.documentationBlobId}
                          label="Προβολή τεκμηρίωσης"
                        />
                        <span className="text-xs text-muted-foreground">
                          δημόσιο αρχείο στο Walrus, χωρίς wallet
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        Δεν αναρτήθηκε αρχείο τεκμηρίωσης
                      </span>
                    )}
                  </dd>
                </>
              ) : null}
              {artwork.fractions ? (
                <>
                  <dt className="text-muted-foreground">Κλάσματα</dt>
                  <dd className="font-mono2 font-medium">{fmtInt(artwork.fractions.total)}</dd>
                </>
              ) : null}
              {last ? (
                <>
                  <dt className="text-muted-foreground">Αναφορά κατάστασης</dt>
                  <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusBadge condition={last.condition} />
                    <span className="whitespace-nowrap font-mono2 text-xs text-muted-foreground">
                      {fmtDate(last.at)}
                      {artwork.reportLog
                        ? `, ${fmtInt(artwork.reportLog.count)} αναφορές συνολικά`
                        : ''}
                    </span>
                  </dd>
                </>
              ) : null}
            </dl>
            <div className="border-t border-border px-5 py-3">
              <ButtonLink to={`/artwork/${artwork.id}`} icon="eye">
                Πλήρης προβολή και ιστορικό
              </ButtonLink>
            </div>
          </section>
        ) : (
          <section className="border border-border bg-card">
            <header className="flex items-center gap-2 border-b border-border bg-[hsl(var(--status-destroyed-bg))] px-5 py-3 text-[hsl(var(--status-destroyed-fg))]">
              <Icon name="circle-xmark" size={15} className="shrink-0" />
              <h2 className="text-sm font-semibold">Δεν βρέθηκε έργο με αυτό το αναγνωριστικό</h2>
            </header>
            <div className="px-5 py-4 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                Το <span className="break-all font-mono2">{query}</span> δεν αντιστοιχεί σε έργο της
                πλατφόρμας. Ελέγξτε ότι αντιγράψατε ολόκληρο το object id. Αν το πρόβλημα επιμένει,
                το αντικείμενο δεν υπάρχει ή δεν εκδόθηκε από τα συμβόλαια της πλατφόρμας. Τότε δεν
                φέρει επαληθεύσιμη γνησιότητα.
              </p>
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}

const VERDICT_TONE = {
  ok: 'bg-[hsl(var(--status-ok-bg))] text-[hsl(var(--status-ok-fg))]',
  warn: 'bg-[hsl(var(--status-damaged-bg))] text-[hsl(var(--status-damaged-fg))]',
  bad: 'bg-[hsl(var(--status-destroyed-bg))] text-[hsl(var(--status-destroyed-fg))]',
} as const;

interface Verdict {
  tone: keyof typeof VERDICT_TONE;
  icon: IconName;
  title: string;
}

function verdictFor(a: Artwork, flags: { concern: boolean; custodyRevoked: boolean }): Verdict {
  if (a.lifecycle === 'lost')
    return {
      tone: 'bad',
      icon: 'triangle-exclamation',
      title: 'Καταχωρισμένο έργο, δηλώθηκε απώλεια',
    };
  if (a.lifecycle === 'cancelled')
    return {
      tone: 'bad',
      icon: 'circle-xmark',
      title: 'Η έκδοση του έργου ακυρώθηκε από τον καλλιτέχνη',
    };
  if (flags.concern)
    return {
      tone: 'bad',
      icon: 'triangle-exclamation',
      title: 'Καταχωρισμένο έργο, με εκκρεμή αναφορά προβλήματος',
    };
  if (flags.custodyRevoked)
    return {
      tone: 'bad',
      icon: 'triangle-exclamation',
      title: 'Καταχωρισμένο έργο, η γκαλερί φύλαξης έχει ανακληθεί',
    };
  if (!a.certificate)
    return {
      tone: 'warn',
      icon: 'circle-exclamation',
      title: 'Καταχωρισμένο έργο, χωρίς πιστοποιητικό γνησιότητας',
    };
  if (a.lifecycle === 'redeemed')
    return {
      tone: 'warn',
      icon: 'box-open',
      title: 'Πιστοποιημένο έργο, εξαργυρωμένο από τον ιδιοκτήτη',
    };
  if (a.fractions)
    return {
      tone: 'ok',
      icon: 'circle-check',
      title: 'Πιστοποιημένο έργο σε φύλαξη, κλασματοποιημένο',
    };
  return { tone: 'ok', icon: 'circle-check', title: 'Πιστοποιημένο γνήσιο έργο σε φύλαξη γκαλερί' };
}

function SearchForm({ initial }: { initial: string }) {
  const navigate = useNavigate();
  const [input, setInput] = useState(initial);
  return (
    <form
      className="flex items-stretch border border-input bg-card transition-colors focus-within:border-[hsl(var(--accent))]"
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim()) navigate(`/verify/${input.trim()}`);
      }}
    >
      <span className="flex items-center pl-3 text-muted-foreground/60">
        <Icon name="magnifying-glass" size={13} />
      </span>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="0x…"
        aria-label="Αναγνωριστικό έργου"
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono2 text-sm outline-none placeholder:text-muted-foreground/60"
      />
      <button
        type="submit"
        className="flex shrink-0 items-center gap-2 border-l border-input px-4 text-sm font-medium text-[hsl(var(--accent))] transition-colors hover:bg-[hsl(var(--accent)/0.08)]"
      >
        <Icon name="shield-halved" size={13} />
        Επαλήθευση
      </button>
    </form>
  );
}
