import type { Mist } from '@/adapters';
import { fmtSUI, fmtBps, fmtInt } from './format';
import { Icon } from './Icon';

export function PaymentBreakdown({
  sellerAmount,
  royaltyAmount,
  royaltyBps,
  primary = false,
  buyerIsArtist = false,
}: {
  sellerAmount: Mist;
  royaltyAmount: Mist;
  royaltyBps: number;
  primary?: boolean;
  buyerIsArtist?: boolean;
}) {
  const total = sellerAmount + royaltyAmount;
  const buyback = buyerIsArtist && !primary && royaltyAmount > 0n;
  return (
    <div className="border border-border bg-card">
      <div className="border-b border-border px-4 py-2">
        <span className="micro-label">Ανάλυση πληρωμής</span>
      </div>
      <dl className="px-4 py-2 text-[13px]">
        <div className="flex items-baseline justify-between py-1.5">
          <dt className="text-muted-foreground">Προς πωλητή</dt>
          <dd className="font-mono2 font-medium">{fmtSUI(sellerAmount)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
          <dt className="text-muted-foreground">
            {primary
              ? 'Δικαίωμα παρακολούθησης (πρωτογενής διάθεση)'
              : `Δικαίωμα παρακολούθησης (${fmtBps(royaltyBps)})`}
          </dt>
          <dd className="font-mono2 font-medium">{fmtSUI(royaltyAmount)}</dd>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <dt className="font-semibold">Σύνολο</dt>
          <dd className="font-mono2 text-base font-semibold">{fmtSUI(total)}</dd>
        </div>
      </dl>
      <p className="border-t border-border px-4 py-2 text-xs leading-relaxed text-muted-foreground">
        <Icon name="circle-info" size={12} className="mr-1 inline-block align-[-2px]" />
        {primary
          ? 'Πουλά ο ίδιος ο καλλιτέχνης του έργου, οπότε πρόκειται για πρωτογενή διάθεση και δεν οφείλεται δικαίωμα παρακολούθησης. Σε κάθε επόμενη μεταπώληση το συμβόλαιο θα το καταβάλλει αυτόματα.'
          : buyback
            ? `Αγοράζετε ως καλλιτέχνης του έργου. Το δικαίωμα παρακολούθησης οφείλεται σε κάθε μεταπώληση, όποιος κι αν αγοράζει. Εδώ επιστρέφει σε εσάς μέσα στην ίδια συναλλαγή. Καθαρό κόστος ${fmtSUI(sellerAmount)}.`
            : 'Το δικαίωμα παρακολούθησης (droit de suite) το καταβάλλει αυτόματα το συμβόλαιο, μέσα στην ίδια συναλλαγή με την πληρωμή του πωλητή.'}
      </p>
    </div>
  );
}

export function PaymentReceipt({
  fractionsReceived,
  fractionShare,
  sellerAmount,
  royaltyAmount,
  primary = false,
}: {
  fractionsReceived: number;
  fractionShare: string;
  sellerAmount: Mist;
  royaltyAmount: Mist;
  primary?: boolean;
}) {
  return (
    <div className="border border-border bg-card">
      <div className="border-b border-border px-4 py-2">
        <span className="micro-label">Απόδειξη συναλλαγής</span>
      </div>
      <div className="px-4 py-3">
        <dl className="text-[13px]">
          <div className="flex items-baseline justify-between border-b border-border py-1.5">
            <dt className="text-muted-foreground">Κλάσματα στον αγοραστή</dt>
            <dd className="font-mono2 font-medium">
              {fmtInt(fractionsReceived)} ({fractionShare})
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-b border-border py-1.5">
            <dt className="text-muted-foreground">
              {primary ? 'Ο καλλιτέχνης έλαβε ως πωλητής' : 'Ο πωλητής έλαβε'}
            </dt>
            <dd className="font-mono2 font-medium">{fmtSUI(sellerAmount)}</dd>
          </div>
          {primary ? null : (
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-muted-foreground">Ο καλλιτέχνης έλαβε ως δικαίωμα</dt>
              <dd className="font-mono2 font-medium">{fmtSUI(royaltyAmount)}</dd>
            </div>
          )}
        </dl>
        {primary ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Πρωτογενής διάθεση από τον ίδιο τον καλλιτέχνη, οπότε δεν οφείλεται δικαίωμα
            παρακολούθησης. Σε κάθε επόμενη μεταπώληση το συμβόλαιο το καταβάλλει αυτόματα.
          </p>
        ) : null}
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Icon name="circle-check" size={11} className="shrink-0" /> Όλα σε μία ατομική συναλλαγή
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="circle-check" size={11} className="shrink-0" /> Κανένας μεσάζοντας, καμία
            εθελοντική συμμόρφωση
          </li>
        </ul>
      </div>
    </div>
  );
}
