import { chain } from '@/adapters';
import type { ChainEvent } from '@/adapters';
import { useFeed } from '@/state/queries';
import { TxLink, AddressLink, ObjectLink } from './TxLink';
import { fmtBps, fmtDate, fmtWindow } from './format';
import { LoadingState, MoreButton, ScrollX, Section } from './primitives';

const TRAIL_TITLE = 'Δημόσιο ίχνος πράξεων της ρυθμιστικής αρχής';

export function GovTrailSection({ note }: { id: string; note?: string }) {
  const feed = useFeed('gov', (cursor) => chain.govTrail(cursor));
  return (
    <Section id="trail" title={TRAIL_TITLE} icon="clock-rotate-left" note={note}>
      {feed.loading && feed.items.length === 0 ? (
        <LoadingState />
      ) : (
        <GovTrail events={feed.items} />
      )}
      <MoreButton
        remaining={feed.more ? 1 : 0}
        label="Περισσότερες"
        onMore={feed.loadMore}
        countKnown={false}
      />
    </Section>
  );
}

export function GovTrail({ events }: { events: ChainEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Δεν επιστράφηκαν πράξεις. Ο κόμβος που διαβάζει η εφαρμογή κρατά περιορισμένο ιστορικό
        events, οπότε παλαιότερες πράξεις μπορεί να λείπουν.
      </p>
    );
  }
  return (
    <ScrollX minWidth="34rem">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Ημερομηνία</th>
            <th className="py-2 pr-4 font-medium">Πράξη</th>
            <th className="py-2 pr-4 font-medium">Λεπτομέρειες</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <GovRow key={e.id} e={e} />
          ))}
        </tbody>
      </table>
    </ScrollX>
  );
}

function GovRow({ e }: { e: ChainEvent }) {
  const label =
    e.type === 'gallery_registered'
      ? 'Εγγραφή γκαλερί'
      : e.type === 'gallery_revoked'
        ? 'Ανάκληση γκαλερί'
        : e.type === 'source_registered'
          ? 'Εγγραφή πηγής'
          : e.type === 'source_revoked'
            ? 'Ανάκληση πηγής'
            : e.type === 'window_updated'
              ? 'Αλλαγή παραθύρου συνάθροισης'
              : e.type === 'enclave_accepted'
                ? 'Αποδοχή Oracle Nautilus'
                : e.type === 'enclave_cleared'
                  ? 'Ανάκληση Oracle Nautilus'
                  : e.type === 'endpoint_updated'
                    ? 'Αλλαγή σημείου εισόδου'
                    : e.type === 'custody_reassigned'
                      ? 'Ανάθεση φύλαξης'
                      : 'Αλλαγή δικαιώματος παρακολούθησης';
  const detail =
    e.type === 'royalty_updated' ? (
      `Από ${fmtBps(e.oldValue ?? 0)} σε ${fmtBps(e.newValue ?? 0)}`
    ) : e.type === 'window_updated' ? (
      `Από ${fmtWindow(e.oldValue ?? 0)} σε ${fmtWindow(e.newValue ?? 0)}`
    ) : e.type === 'endpoint_updated' ? (
      `Από ${e.oldText || 'κενό'} σε ${e.newText || 'κενό'}`
    ) : e.type === 'enclave_accepted' ? (
      <>
        {e.reference ? <ObjectLink id={e.reference} short /> : null}
        <span className="ml-2 text-xs text-muted-foreground">
          έκδοση ρύθμισης {e.newValue ?? 0}
          {e.note ? ', αντικατέστησε προηγούμενο' : ''}
        </span>
      </>
    ) : e.type === 'custody_reassigned' ? (
      <>
        {e.artworkId ? <ObjectLink id={e.artworkId} short /> : null}
        <span className="mx-1 text-muted-foreground">προς</span>
        {e.targetName ?? ''}
        {e.target ? (
          <>
            {e.targetName ? ' (' : ''}
            <AddressLink address={e.target} short />
            {e.targetName ? ')' : ''}
          </>
        ) : null}
      </>
    ) : e.type === 'enclave_cleared' ? (
      <span className="text-muted-foreground">
        {e.note
          ? 'το κανάλι έμεινε χωρίς αποδεκτό Oracle Nautilus'
          : 'δεν υπήρχε αποδεκτό Oracle Nautilus'}
      </span>
    ) : (
      <>
        {e.targetName ?? ''}
        {e.target ? (
          <>
            {e.targetName ? ' (' : ''}
            <AddressLink address={e.target} short />
            {e.targetName ? ')' : ''}
          </>
        ) : null}
      </>
    );
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2.5 pr-4 font-mono2 text-xs text-muted-foreground">{fmtDate(e.at)}</td>
      <td className="py-2.5 pr-4 font-medium">{label}</td>
      <td className="py-2.5 pr-4">{detail}</td>
      <td className="py-2.5 text-right">{e.txDigest ? <TxLink digest={e.txDigest} /> : null}</td>
    </tr>
  );
}
