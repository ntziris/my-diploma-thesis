const MESSAGES: Record<string, string> = {
  'admin::EInvalidBps': 'Το ποσοστό πρέπει να είναι από 0 έως 10000 μονάδες βάσης.',
  'registry::EAlreadyActive': 'Η διεύθυνση είναι ήδη ενεργή εγγραφή αυτού του μητρώου.',
  'registry::ENotRegistered': 'Η διεύθυνση δεν είναι εγγεγραμμένη σε αυτό το μητρώο.',
  'registry::EAlreadyRevoked': 'Η εγγραφή έχει ήδη ανακληθεί.',
  'registry::EEmptyName': 'Η εγγραφή χρειάζεται επωνυμία.',
  'artwork::EGalleryNotActive': 'Η γκαλερί παράδοσης δεν είναι ενεργή στο μητρώο.',
  'artwork::EEmptyTitle': 'Το έργο χρειάζεται τίτλο.',
  'artwork::EEmptyImage': 'Το έργο χρειάζεται δημόσια εικόνα.',
  'artwork::ENotMinted': 'Το έργο έχει ήδη παραληφθεί σε φύλαξη ή έχει ακυρωθεί.',
  'artwork::ETerminal': 'Το έργο βρίσκεται σε τελική κατάσταση και δεν δέχεται άλλες πράξεις.',
  'artwork::ENotOwner': 'Η διεύθυνση δεν είναι ο ιδιοκτήτης του έργου.',
  'artwork::ETooManyKeywords': 'Το πολύ δώδεκα λέξεις-κλειδιά ανά έργο.',
  'artwork::EKeywordTooLong': 'Κάθε λέξη-κλειδί έχει το πολύ 32 bytes.',
  'artwork::EEmptyKeyword': 'Μια λέξη-κλειδί δεν μπορεί να είναι κενή.',
  'artwork::ENotInCatalog': 'Το έργο δεν υπάρχει στον κατάλογο.',
  'artwork::EIdentityAlreadyBound':
    'Άλλο έργο έχει ήδη αυτή την ταυτότητα Seal. Δοκιμάστε ξανά την έκδοση.',
  'artwork::EEmptySalt': 'Η ταυτότητα Seal χρειάζεται αλάτι.',
  'custody::ENotActive': 'Η διεύθυνση δεν είναι ενεργή γκαλερί.',
  'custody::ENotDesignated': 'Η γκαλερί δεν είναι αυτή που ορίστηκε να παραλάβει το έργο.',
  'custody::EAlreadyInCustody': 'Το έργο φυλάσσεται ήδη από ενεργή γκαλερί.',
  'custody::ENoCustody': 'Δεν υπάρχει ανοιχτή καταχώριση φύλαξης για το έργο.',
  'custody::ECustodianActive':
    'Η τρέχουσα γκαλερί φύλαξης είναι ενεργή. Η ανάθεση προϋποθέτει ανάκληση.',
  'custody::EGalleryNotActive': 'Η γκαλερί που ορίζεται δεν είναι ενεργή.',
  'custody::ENotCustodian': 'Η διεύθυνση δεν είναι η γκαλερί που φυλάσσει το έργο.',
  'custody::EFractionalised': 'Κλασματοποιημένο έργο δεν εξαργυρώνεται. Προηγείται η ενοποίηση.',
  'custody::ERequestPending': 'Εκκρεμεί ήδη αίτημα εξαργύρωσης.',
  'custody::ENoRequest': 'Δεν εκκρεμεί αίτημα εξαργύρωσης.',
  'custody::ENotRequester': 'Μόνο όποιος υπέβαλε το αίτημα μπορεί να το αποσύρει.',
  'certificate::ENotActive': 'Η διεύθυνση δεν είναι ενεργή γκαλερί.',
  'certificate::EAlreadyCertified': 'Το έργο έχει ήδη πιστοποιητικό.',
  'certificate::EEmptyStatement': 'Το πιστοποιητικό χρειάζεται δήλωση.',
  'certificate::ENoCertificate': 'Το έργο δεν έχει πιστοποιητικό.',
  'fraction::ENoCustody': 'Το έργο δεν βρίσκεται σε φύλαξη γκαλερί.',
  'fraction::ENoCertificate': 'Το έργο δεν έχει πιστοποιητικό.',
  'fraction::ERedemptionPending': 'Εκκρεμεί αίτημα εξαργύρωσης. Αποσύρετέ το πρώτα.',
  'fraction::EAlreadyFractionalised': 'Το έργο είναι ήδη κλασματοποιημένο.',
  'fraction::EZeroSupply': 'Η συνολική προσφορά πρέπει να είναι θετική.',
  'fraction::EWrongVault': 'Το κλάσμα ανήκει σε άλλο θησαυροφυλάκιο.',
  'fraction::ENotFullSupply': 'Η ενοποίηση απαιτεί ολόκληρη την προσφορά σε ένα κλάσμα.',
  'fraction::EInvalidSplit': 'Ο διαχωρισμός πρέπει να αφήνει θετική ποσότητα και στις δύο πλευρές.',
  'fraction::EWrongArtwork': 'Το θησαυροφυλάκιο ανήκει σε άλλο έργο.',
  'market::EZeroPrice': 'Η τιμή ανά κλάσμα πρέπει να είναι θετική.',
  'market::EWrongVault': 'Η αγγελία, το θησαυροφυλάκιο και το έργο δεν ταιριάζουν.',
  'market::EListingClosed': 'Η αγγελία έχει κλείσει.',
  'market::ENotSeller': 'Μόνο ο πωλητής μπορεί να ακυρώσει την αγγελία.',
  'market::ESelfPurchase': 'Ο πωλητής δεν μπορεί να αγοράσει τη δική του αγγελία.',
  'market::EInsufficientQuantity': 'Η ποσότητα είναι μηδενική ή μεγαλύτερη από τη διαθέσιμη.',
  'market::EWrongPayment': 'Η πληρωμή πρέπει να ισούται με ποσότητα επί τιμή.',
  'report::ENotActiveSource': 'Η αναφορά προέρχεται από πηγή που δεν είναι ενεργή στο μητρώο.',
  'report::EInvalidSignature':
    'Η αναφορά δεν φέρει την υπογραφή του εγγεγραμμένου Oracle Nautilus.',
  'report::EUnknownCondition':
    'Άγνωστη κατάσταση. Επιτρέπονται: καλή, φθορά, καταστροφή, αγνοείται.',
  'report::EWrongLog': 'Το ημερολόγιο αναφορών ανήκει σε άλλο έργο.',
  'report::EStaleReport': 'Η αναφορά υπογράφηκε πολύ παλιά για να καταγραφεί τώρα.',
  'report::EInvalidWindow':
    'Το παράθυρο συνάθροισης πρέπει να είναι από 1 δευτερόλεπτο έως 1 ημέρα.',
  'report::EWrongEnclave':
    'Η αναφορά υπογράφηκε από Oracle Nautilus που η αρχή δεν έχει αποδεχθεί.',
  'report::EStaleEnclave': 'Το Oracle Nautilus εγγράφηκε με μετρήσεις που δεν ισχύουν πια.',
  'report::EReplayedReport': 'Η πηγή έχει ήδη αναφέρει για αυτή ή για νεότερη χρονική στιγμή.',
  'report::EFutureReport': 'Η αναφορά φέρει χρονοσφραγίδα πιο μπροστά από όσο επιτρέπει το ρολόι.',
  'report::EEmptyReport': 'Μια αναφορά στέκεται σε τουλάχιστον μία ένδειξη.',
  'report::EEndpointTooLong': 'Το σημείο εισόδου του καναλιού είναι πολύ μεγάλο.',
  'report::ECustodyClosed': 'Το έργο δεν βρίσκεται σε φύλαξη γκαλερί.',
  'policy::ENoAccess': 'Η διεύθυνση δεν έχει δικαίωμα αποκρυπτογράφησης.',
  'policy::EWrongIdentity': 'Η ταυτότητα του αρχείου δεν ανήκει σε αυτό το έργο.',
};

export interface AbortInfo {
  module?: string;
  constantName?: string;
  value?: string;
}

export function explainAbort(abort: AbortInfo): string {
  const key = `${abort.module ?? ''}::${abort.constantName ?? ''}`;
  const known = MESSAGES[key];
  if (known) return known;
  const byName = Object.entries(MESSAGES).find(([k]) => k.endsWith(`::${abort.constantName}`))?.[1];
  if (byName) return byName;
  return abort.value
    ? `${abort.value} (${abort.constantName ?? 'abort'})`
    : 'Το συμβόλαιο απέρριψε τη συναλλαγή.';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function explainFailure(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('reject') || m.includes('user denied') || m.includes('user cancel'))
    return 'Η υπογραφή απορρίφθηκε στο wallet.';
  if (
    m.includes('insufficient') &&
    (m.includes('gas') || m.includes('balance') || m.includes('coin'))
  )
    return 'Ανεπαρκές υπόλοιπο SUI για το κόστος εκτέλεσης.';
  return message || 'Η συναλλαγή απέτυχε.';
}

export function explainConnectError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('reject') || m.includes('denied') || m.includes('cancel'))
    return 'Η σύνδεση απορρίφθηκε στο wallet.';
  if (m.includes('no account') || m.includes('not found'))
    return 'Το wallet δεν εξέθεσε κανέναν λογαριασμό.';
  if (m.includes('popup') || m.includes('window'))
    return 'Ο browser μπλόκαρε το παράθυρο του wallet. Επιτρέψτε τα αναδυόμενα παράθυρα και δοκιμάστε ξανά.';
  return message ? `Η σύνδεση απέτυχε: ${message}` : 'Η σύνδεση απέτυχε.';
}
