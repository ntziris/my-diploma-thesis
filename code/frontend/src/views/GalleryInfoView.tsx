import { Section, InfoNote, Page } from '@/components/primitives';
import { Icon, type IconName } from '@/components/Icon';
import { ButtonLink } from '@/components/Button';

export function GalleryInfoView() {
  return (
    <Page
      title="Ένταξη γκαλερί στο μητρώο"
      intro="Οι πιστοποιημένες γκαλερί είναι ο φυσικός κρίκος της πλατφόρμας. Φυλάσσουν τα έργα και βεβαιώνουν τη γνησιότητά τους πάνω στην αλυσίδα. Η ένταξη στο μητρώο γίνεται με δημόσια πράξη της ρυθμιστικής αρχής."
    >
      <div className="flex flex-col gap-8">
        <Section title="Ο ρόλος της πιστοποιημένης γκαλερί" icon="building-columns">
          <ul className="grid gap-5 text-[13px] leading-relaxed sm:grid-cols-2">
            <Duty icon="box-archive" title="Φύλαξη">
              Παραλαμβάνετε το φυσικό έργο και καταχωρίζετε τη φύλαξη στην αλυσίδα. Η παραλαβή
              καταγράφεται δημόσια και μόνιμα.
            </Duty>
            <Duty icon="certificate" title="Πιστοποιητικά γνησιότητας">
              Εκδίδετε πιστοποιητικό που προσαρτάται μόνιμα στο αντικείμενο του έργου και δεν μπορεί
              να αφαιρεθεί ή να τροποποιηθεί.
            </Duty>
            <Duty icon="clipboard-list" title="Αναφορές κατάστασης">
              Παρακολουθείτε τις αναφορές των εξωτερικών πηγών για τα έργα που φυλάσσετε και
              ενεργείτε όταν κάτι απαιτεί προσοχή.
            </Duty>
            <Duty icon="triangle-exclamation" title="Δήλωση απώλειας">
              Σε περίπτωση καταστροφής ή απώλειας, δηλώνετε το γεγονός ώστε η αλυσίδα να
              αντικατοπτρίζει πάντα την πραγματική κατάσταση.
            </Duty>
          </ul>
        </Section>

        <Section title="Πώς εντάσσεστε" icon="arrow-right">
          <ol className="grid gap-6 text-[13px] leading-relaxed sm:grid-cols-3">
            <li>
              <p className="font-display text-base font-semibold">
                <span className="mr-2 text-[hsl(var(--accent))]">1.</span>
                Επικοινωνία
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Επικοινωνείτε με την ρυθμιστική αρχή της εγκατάστασης και παρέχετε τα στοιχεία της
                γκαλερί και τη διεύθυνση (address) του wallet σας.
              </p>
            </li>
            <li>
              <p className="font-display text-base font-semibold">
                <span className="mr-2 text-[hsl(var(--accent))]">2.</span>
                Εγγραφή στο μητρώο
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Η αρχή καταχωρίζει τη διεύθυνσή σας στο on-chain μητρώο γκαλερί. Η πράξη εκπέμπει
                δημόσιο event, ορατό στη σελίδα Διαφάνειας.
              </p>
            </li>
            <li>
              <p className="font-display text-base font-semibold">
                <span className="mr-2 text-[hsl(var(--accent))]">3.</span>
                Σύνδεση
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Συνδέεστε με το wallet της γκαλερί και αποκτάτε πρόσβαση στον πίνακα διαχείρισης.
              </p>
            </li>
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink to="/transparency" variant="outline" icon="eye">
              Δείτε το δημόσιο μητρώο
            </ButtonLink>
            <ButtonLink
              href="mailto:ntziris@gmail.com"
              variant="outline"
              iconRight="arrow-up-right-from-square"
            >
              Επικοινωνία με την αρχή
            </ButtonLink>
          </div>
          <div className="mt-4">
            <InfoNote>
              Η εγγραφή δεν γίνεται από αυτή τη σελίδα. Μόνο η ρυθμιστική αρχή μπορεί να προσθέσει ή
              να ανακαλέσει γκαλερί, και κάθε τέτοια πράξη μένει δημόσια στο ιστορικό της αλυσίδας.
            </InfoNote>
          </div>
        </Section>
      </div>
    </Page>
  );
}

function Duty({ icon, title, children }: { icon: IconName; title: string; children: string }) {
  return (
    <li>
      <p className="flex items-center gap-2 font-display text-base font-semibold">
        <Icon name={icon} size={14} className="shrink-0 text-[hsl(var(--accent))]" />
        {title}
      </p>
      <p className="mt-1.5 text-muted-foreground">{children}</p>
    </li>
  );
}
