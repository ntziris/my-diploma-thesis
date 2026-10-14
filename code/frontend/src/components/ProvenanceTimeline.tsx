import type { ChainEvent } from '@/adapters';
import { StatusBadge } from './StatusBadge';
import { TxLink } from './TxLink';
import { fmtDate, fmtInt, fmtSUI } from './format';
import { ScrollX } from './primitives';

function eventTitle(e: ChainEvent): string {
  switch (e.type) {
    case 'mint':
      return 'Έκδοση έργου';
    case 'custody_intake':
      return 'Παραλαβή σε φύλαξη';
    case 'custody_reassigned':
      return 'Ανάθεση νέας γκαλερί';
    case 'certificate_issued':
      return 'Πιστοποιητικό γνησιότητας';
    case 'fractionalized':
      return e.totalFractions
        ? `Κλασματοποίηση σε ${fmtInt(e.totalFractions)} κλάσματα`
        : 'Κλασματοποίηση';
    case 'sale':
      return `Πώληση ${e.quantity != null ? fmtInt(e.quantity) : ''} κλασμάτων`;
    case 'status_report':
      return 'Αναφορά κατάστασης';
    case 'loss_declared':
      return 'Δήλωση απώλειας';
    case 'mint_cancelled':
      return 'Ακύρωση έκδοσης';
    case 'redeem_requested':
      return 'Αίτημα εξαργύρωσης';
    case 'redeem_withdrawn':
      return 'Απόσυρση αιτήματος εξαργύρωσης';
    case 'redeemed':
      return 'Εξαργύρωση';
    case 'consolidated':
      return 'Ενοποίηση κλασμάτων';
    case 'listing_created':
      return 'Νέα αγγελία';
    case 'listing_cancelled':
      return 'Ακύρωση αγγελίας';
    default:
      return 'Γεγονός';
  }
}

function eventDetail(e: ChainEvent): string | null {
  switch (e.type) {
    case 'mint':
    case 'custody_intake':
    case 'custody_reassigned':
    case 'certificate_issued':
    case 'fractionalized':
    case 'consolidated':
    case 'redeem_requested':
    case 'redeem_withdrawn':
    case 'redeemed':
      return e.note ?? null;
    case 'sale':
      if (e.note) return e.note;
      if (e.sellerAmount != null && e.royaltyAmount != null)
        return `${fmtSUI(e.sellerAmount + e.royaltyAmount)}, δικαίωμα παρακολούθησης ${fmtSUI(e.royaltyAmount)}`;
      if (e.amount != null)
        return `${fmtSUI(e.amount)}${e.pricePerFraction != null ? ` (${fmtSUI(e.pricePerFraction)} / κλάσμα)` : ''}`;
      return null;
    case 'listing_created':
      return e.quantity != null && e.pricePerFraction != null
        ? `${fmtInt(e.quantity)} κλάσματα προς ${fmtSUI(e.pricePerFraction)} / κλάσμα`
        : null;
    case 'listing_cancelled':
      return e.quantity != null ? `${fmtInt(e.quantity)} κλάσματα επέστρεψαν στον πωλητή` : null;
    case 'status_report':
      return e.source ? `πηγή ${e.source}` : null;
    case 'loss_declared':
      return e.reason ?? null;
    case 'mint_cancelled':
      return e.note ?? null;
    default:
      return e.note ?? null;
  }
}

export function ProvenanceTimeline({ events }: { events: ChainEvent[] }) {
  return (
    <ScrollX minWidth="38rem">
      <ol className="divide-y divide-border border border-border bg-card">
        {events.map((e) => (
          <li
            key={e.id}
            className="grid grid-cols-[7.5rem_14rem_1fr_auto] items-baseline gap-3 px-4 py-2.5 text-[13px]"
          >
            <span className="font-mono2 text-xs text-muted-foreground">{fmtDate(e.at)}</span>
            <span className="font-medium">{eventTitle(e)}</span>
            <span className="text-muted-foreground">
              {e.type === 'status_report' && e.condition ? (
                <span className="inline-flex items-center gap-2">
                  <StatusBadge condition={e.condition} bare />
                  <span>{eventDetail(e)}</span>
                </span>
              ) : (
                eventDetail(e)
              )}
            </span>
            <span>{e.txDigest ? <TxLink digest={e.txDigest} /> : null}</span>
          </li>
        ))}
      </ol>
    </ScrollX>
  );
}
