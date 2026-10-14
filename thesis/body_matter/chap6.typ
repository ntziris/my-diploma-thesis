#import "@local/ntua-thesis-greek:0.1.0": *
#import "../helpers.typ": field-table, fn-card, role-legend, role-matrix, sec, todo, todo-figure

#blank-pagebreak(to: "odd")

= Αξιολόγηση

#histinit[
    Στο κεφάλαιο αυτό αξιολογούμε την εφαρμογή σε τρεις άξονες. Αρχικά, εξετάζουμε τους κανόνες
    ορθότητας και ασφάλειας των συμβολαίων και του oracle μέσω αυτοματοποιημένων δοκιμών. Στη
    συνέχεια, αναλύουμε το κόστος επιλεγμένων πράξεων στο δοκιμαστικό δίκτυο. Τέλος,
    αντιστοιχίζουμε τις λειτουργικές απαιτήσεις με την υλοποίηση, τις επιδείξεις και τους ελέγχους.
]

Η αξιολόγηση αφορά το λειτουργικό πρωτότυπο της πειραματικής διάταξης. Το δημόσιο testnet δεν μας
παρέχει έλεγχο του φόρτου των υπηρεσιών ή σταθερές συνθήκες για επαναλήψιμη μέτρηση της μέγιστης
κλιμάκωσης. Γι' αυτό δεν εξάγουμε όρια παραγωγικής απόδοσης από τη χρήση του.

== Έλεγχος ορθότητας <sec-checks>

Η επαλήθευση των επιχειρησιακών κανόνων και των ορίων ασφαλείας γίνεται με μια σουίτα
αυτοματοποιημένων δοκιμών στο πακέτο Move. Οι αρνητικές δοκιμές επιχειρούν μη εξουσιοδοτημένες ή
άκυρες μεταβάσεις καταστάσεων και επιβεβαιώνουν τον αναμενόμενο κωδικό σφάλματος (`abort code`),
ενώ οι θετικές δοκιμές επικυρώνουν κρίσιμες αναλλοίωτες συνθήκες. Ακολουθούν οι έλεγχοι που
επιβάλλονται εκτός συμβολαίου και οι δοκιμές του oracle σε Rust.

#let pass = table.cell(fill: rgb("#dff2e3"), align: center + horizon)[
    #text(fill: rgb("#1e6f34"), weight: "bold", size: 10pt)[#sym.checkmark]
]

#let kind(v) = if v == "+" {
    table.cell(align: center + horizon)[#text(fill: rgb("#1e6f34"), size: 7.5pt)[θετική]]
} else {
    table.cell(align: center + horizon)[#text(fill: rgb("#a62626"), size: 7.5pt)[αρνητική]]
}

#let checks(rows) = {
    set par(justify: false, leading: 0.45em)
    set text(size: 8pt, hyphenate: false)
    let h(name) = table.cell(fill: luma(235), align: center + horizon)[*#name*]
    table(
        columns: (1fr, auto, auto, auto, auto),
        align: (
            left + horizon,
            left + horizon,
            left + horizon,
            center + horizon,
            center + horizon,
        ),
        stroke: 0.4pt + luma(170),
        inset: (x: 5pt, y: 4pt),
        table.header(h[Περίπτωση], h[Κωδικός], h[Δοκιμή], h[Είδος], h[Επιτυχία]),
        ..rows
            .map(r => (
                [#r.at(0)],
                [#raw(r.at(1))],
                [#text(size: 6.5pt)[#raw(r.at(2))]],
                kind(r.at(3)),
                pass,
            ))
            .flatten(),
    )
}


#[
    #show figure: set block(breakable: true)
    #figure(
        checks((
            (
                "Εγγραφή διεύθυνσης που είναι ήδη ενεργή",
                "EAlreadyActive",
                "register_twice_aborts",
                "-",
            ),
            (
                "Ανάκληση διεύθυνσης που δεν εγγράφηκε ποτέ",
                "ENotRegistered",
                "revoke_unknown_aborts",
                "-",
            ),
            (
                "Δεύτερη ανάκληση της ίδιας διεύθυνσης",
                "EAlreadyRevoked",
                "revoke_twice_aborts",
                "-",
            ),
            ("Εγγραφή χωρίς επωνυμία", "EEmptyName", "register_without_name_aborts", "-"),
            (
                "Ποσοστό δικαιώματος πάνω από το 100%",
                "EInvalidBps",
                "set_royalty_rejects_more_than_whole",
                "-",
            ),
            (
                "Παράθυρο συνάθροισης εκτός ορίων",
                "EInvalidWindow",
                "a_window_below_one_second_is_refused",
                "-",
            ),
            (
                "Αποδοχή oracle με παλιότερες μετρήσεις",
                "EStaleEnclave",
                "an_enclave_of_retired_measurements_aborts",
                "-",
            ),
            ("Τα δύο μητρώα είναι ανεξάρτητα μεταξύ τους", "-", "registries_are_independent", "+"),
        )),
        caption: short-caption([Έλεγχοι ορθότητας για την αρχική ρύθμιση της αγοράς])[
            Αυτοματοποιημένοι έλεγχοι Move για τη διαχείριση μητρώων και παραμέτρων (#sec(
                <sec-uc-genesis>,
            )).
        ],
    )<tab-checks-genesis>
]


#[
    #show figure: set block(breakable: true)
    #figure(
        checks((
            (
                "Ονομασία γκαλερί εκτός μητρώου",
                "EGalleryNotActive",
                "mint_naming_unregistered_gallery_aborts",
                "-",
            ),
            (
                "Ονομασία ανακληθείσας γκαλερί",
                "EGalleryNotActive",
                "mint_naming_revoked_gallery_aborts",
                "-",
            ),
            ("Έκδοση χωρίς τίτλο", "EEmptyTitle", "mint_without_title_aborts", "-"),
            (
                "Δεύτερη έκδοση με την ίδια εικόνα και το ίδιο salt",
                "EIdentityAlreadyBound",
                "copying_the_image_and_the_salt_cannot_be_minted",
                "-",
            ),
            (
                "Παραλαβή από γκαλερί που δεν ορίστηκε",
                "ENotDesignated",
                "intake_by_other_registered_gallery_aborts",
                "-",
            ),
            (
                "Δεύτερη παραλαβή του ίδιου έργου τέχνης",
                "ENotDesignated",
                "second_intake_while_held_aborts",
                "-",
            ),
            (
                "Παραλαβή από διεύθυνση εκτός μητρώου",
                "ENotActive",
                "intake_by_unregistered_address_aborts",
                "-",
            ),
            (
                "Ανάθεση όσο η γκαλερί είναι ενεργή",
                "ECustodianActive",
                "reassign_while_custodian_active_aborts",
                "-",
            ),
            (
                "Ανάθεση σε ανακληθείσα γκαλερί",
                "EGalleryNotActive",
                "reassign_to_revoked_gallery_aborts",
                "-",
            ),
            (
                "Ανάθεση πριν από οποιαδήποτε παραλαβή",
                "ENoCustody",
                "reassign_before_any_intake_aborts",
                "-",
            ),
            ("Πιστοποίηση πριν από την παραλαβή", "ENoCustody", "issue_before_intake_aborts", "-"),
            (
                "Πιστοποίηση από γκαλερί που δεν κρατά το έργο τέχνης",
                "ENotCustodian",
                "issue_by_registered_non_holder_aborts",
                "-",
            ),
            (
                "Πιστοποίηση από ανακληθείσα γκαλερί",
                "ENotActive",
                "issue_by_revoked_holder_aborts",
                "-",
            ),
            (
                "Δεύτερο πιστοποιητικό στο ίδιο έργο τέχνης",
                "EAlreadyCertified",
                "issue_twice_aborts",
                "-",
            ),
            ("Πιστοποίηση απολεσθέντος έργου τέχνης", "ETerminal", "issue_after_loss_aborts", "-"),
        )),
        caption: short-caption([Έλεγχοι ορθότητας για έκδοση, φύλαξη και πιστοποίηση])[
            Αυτοματοποιημένοι έλεγχοι Move για τον κύκλο έκδοσης, ανάθεσης φύλαξης και πιστοποίησης
            (#sec(<sec-uc-mint>)).
        ],
    )<tab-checks-mint>
]


#[
    #show figure: set block(breakable: true)
    #figure(
        checks((
            (
                "Κλασματοποίηση χωρίς καταχωρημένη φύλαξη",
                "ENoCustody",
                "fractionalize_without_custody_aborts",
                "-",
            ),
            (
                "Κλασματοποίηση χωρίς πιστοποιητικό",
                "ENoCertificate",
                "fractionalize_without_certificate_aborts",
                "-",
            ),
            (
                "Κλασματοποίηση από μη ιδιοκτήτη",
                "ENotOwner",
                "fractionalize_by_non_owner_aborts",
                "-",
            ),
            (
                "Μηδενική συνολική προσφορά",
                "EZeroSupply",
                "fractionalize_with_zero_supply_aborts",
                "-",
            ),
            (
                "Δεύτερη κλασματοποίηση του ίδιου έργου τέχνης",
                "EAlreadyFractionalised",
                "fractionalize_twice_aborts",
                "-",
            ),
            (
                "Διαχωρισμός που αφήνει μηδέν σε μία πλευρά",
                "EInvalidSplit",
                "split_zero_aborts",
                "-",
            ),
            (
                "Συγχώνευση κλασμάτων διαφορετικών θησαυροφυλακίων",
                "EWrongVault",
                "merge_across_vaults_aborts",
                "-",
            ),
            (
                "Το άθροισμα των κλασμάτων μένει η αρχική προσφορά",
                "-",
                "supply_is_conserved_across_many_operations",
                "+",
            ),
        )),
        caption: short-caption([Έλεγχοι ορθότητας για την κλασματοποίηση])[
            Αυτοματοποιημένοι έλεγχοι Move για την κλασματοποίηση, διαίρεση, συγχώνευση και
            ενοποίηση (#sec(<sec-uc-fraction>)).
        ],
    )<tab-checks-frac>
]


#[
    #show figure: set block(breakable: true)
    #figure(
        checks((
            ("Αγορά της δικής σου αγγελίας", "ESelfPurchase", "buying_own_listing_aborts", "-"),
            ("Πληρωμή μικρότερη από το τίμημα", "EWrongPayment", "underpaying_aborts", "-"),
            ("Πληρωμή μεγαλύτερη από το τίμημα", "EWrongPayment", "overpaying_aborts", "-"),
            (
                "Ποσότητα μεγαλύτερη από τη διαθέσιμη",
                "EInsufficientQuantity",
                "buying_more_than_listed_aborts",
                "-",
            ),
            (
                "Αγορά από κλειστή αγγελία",
                "EListingClosed",
                "buying_from_closed_listing_aborts",
                "-",
            ),
            ("Αγγελία με μηδενική τιμή", "EZeroPrice", "list_at_zero_price_aborts", "-"),
            ("Ακύρωση αγγελίας από άλλον", "ENotSeller", "cancel_by_non_seller_aborts", "-"),
            (
                "Αγορά σε έργο τέχνης που δηλώθηκε απολεσθέν",
                "ETerminal",
                "buying_on_lost_artwork_aborts",
                "-",
            ),
            (
                "Σε μεταπώληση δικαίωμα και υπόλοιπο αθροίζουν στην τιμή",
                "-",
                "resale_pays_royalty_to_artist_and_rest_to_seller",
                "+",
            ),
            (
                "Στρογγυλοποίηση δικαιώματος (2,5% στα 333 MIST)",
                "-",
                "royalty_rounds_down_and_remainder_goes_to_seller",
                "+",
            ),
            (
                "Η ακύρωση αγγελίας πετυχαίνει και σε απολεσθέν έργο τέχνης",
                "-",
                "cancel_on_lost_artwork_still_returns_fractions",
                "+",
            ),
        )),
        caption: short-caption([Έλεγχοι ορθότητας για την αγορά κλασμάτων])[
            Αυτοματοποιημένοι έλεγχοι Move για δημιουργία αγγελιών, αγορές και δικαιώματα
            μεταπώλησης (#sec(<sec-uc-market>)).
        ],
    )<tab-checks-market>
]


#[
    #show figure: set block(breakable: true)
    #figure(
        checks((
            (
                "Αλλαγή πεδίου μετά την υπογραφή",
                "EInvalidSignature",
                "a_tampered_condition_aborts",
                "-",
            ),
            (
                "Αναφορά μιας πηγής με το όνομα άλλης",
                "EInvalidSignature",
                "a_report_moved_onto_another_source_aborts",
                "-",
            ),
            ("Αναφορά από ανακληθείσα πηγή", "ENotActiveSource", "a_revoked_source_aborts", "-"),
            (
                "Αναφορά από πηγή εκτός μητρώου",
                "ENotActiveSource",
                "an_unregistered_source_aborts",
                "-",
            ),
            (
                "Κατάσταση εκτός των τεσσάρων τιμών",
                "EUnknownCondition",
                "an_unknown_condition_aborts",
                "-",
            ),
            (
                "Αναφορά χωρίς καμία ανάγνωση",
                "EEmptyReport",
                "a_report_of_no_readings_aborts",
                "-",
            ),
            (
                "Log άλλου έργου τέχνης",
                "EWrongLog",
                "a_report_into_another_artworks_log_aborts",
                "-",
            ),
            (
                "Oracle που δεν έχει γίνει αποδεκτό",
                "EWrongEnclave",
                "an_enclave_the_authority_has_not_accepted_aborts",
                "-",
            ),
            (
                "Αναφορά παλιότερη από το παράθυρο φρεσκάδας",
                "EStaleReport",
                "a_report_submitted_after_the_window_aborts",
                "-",
            ),
            (
                "Αναφορά σφραγισμένη στο μέλλον",
                "EFutureReport",
                "a_report_stamped_ahead_of_the_chain_aborts",
                "-",
            ),
            (
                "Η ίδια αναφορά δεύτερη φορά",
                "EReplayedReport",
                "the_same_report_cannot_be_recorded_twice",
                "-",
            ),
            (
                "Δήλωση απώλειας από ανακληθείσα γκαλερί",
                "ENotActive",
                "loss_by_revoked_custodian_aborts",
                "-",
            ),
            (
                "Άσχετος λογαριασμός υποβάλλει, η πηγή μένει αυτή που υπέγραψε",
                "-",
                "anyone_may_submit_and_the_report_names_the_signing_source",
                "+",
            ),
            (
                "Αναφορά στο όριο του χρονικού παραθύρου",
                "-",
                "a_report_at_the_edge_of_the_window_is_recorded",
                "+",
            ),
            (
                "Αναφορά εντός ανεκτής απόκλισης ρολογιού",
                "-",
                "a_report_within_the_tolerated_skew_is_recorded",
                "+",
            ),
        )),
        caption: short-caption([Έλεγχοι ορθότητας για αναφορές και απώλεια])[
            Αυτοματοποιημένοι έλεγχοι Move για αναφορές κατάστασης του oracle και δήλωση απώλειας
            (#sec(<sec-uc-report>)).
        ],
    )<tab-checks-report>
]


#[
    #show figure: set block(breakable: true)
    #figure(
        checks((
            (
                "Αίτημα από διεύθυνση χωρίς κλάσμα",
                "ENoAccess",
                "stranger_may_not_decrypt_full_res",
                "-",
            ),
            (
                "Ο καλλιτέχνης αφού πούλησε όλα τα κλάσματα",
                "ENoAccess",
                "artist_loses_owner_access_once_fractionalised",
                "-",
            ),
            (
                "Κλάσμα άλλου θησαυροφυλακίου ως απόδειξη",
                "ENoAccess",
                "fraction_of_another_vault_is_rejected",
                "-",
            ),
            ("Ταυτότητα με επίθεμα", "EWrongIdentity", "identity_with_suffix_is_rejected", "-"),
            (
                "Ταυτότητα άλλου έργου τέχνης",
                "EWrongIdentity",
                "identity_of_another_artwork_is_rejected",
                "-",
            ),
            (
                "Δόλωμα με δικό του salt",
                "EWrongIdentity",
                "a_decoy_with_its_own_salt_cannot_unlock_the_original",
                "-",
            ),
            (
                "Ο ιδιοκτήτης αποκρυπτογραφεί την εικόνα υψηλής ανάλυσης",
                "-",
                "owner_may_decrypt_full_res",
                "+",
            ),
            (
                "Ο κάτοχος κλάσματος αποκρυπτογραφεί",
                "-",
                "fraction_holder_may_decrypt_full_res",
                "+",
            ),
            (
                "Η ίδια εικόνα εκδίδεται δεύτερη φορά με άλλο salt",
                "-",
                "the_same_image_can_be_issued_twice_under_two_salts",
                "+",
            ),
        )),
        caption: short-caption([Έλεγχοι ορθότητας για την πολιτική Seal])[
            Αυτοματοποιημένοι έλεγχοι Move για την πολιτική πρόσβασης στο κρυπτογραφημένο πρωτότυπο
            (#sec(<sec-uc-verify>)).
        ],
    )<tab-checks-seal>
]

Ο @tab-checks-outside καταγράφει περιπτώσεις που απορρίπτονται σε προγενέστερα επίπεδα από τον
μεταγλωττιστή Move, το runtime του SUI, το wallet ή τους διακομιστές του Seal.

#[
    #show figure: set block(breakable: true)
    #figure(
        {
            set par(justify: false, leading: 0.45em)
            set text(size: 8pt, hyphenate: false)
            let h(name) = table.cell(fill: luma(235), align: center + horizon)[*#name*]
            table(
                columns: (1fr, auto, 1.2fr),
                align: (left + horizon, left + horizon, left + horizon),
                stroke: 0.4pt + luma(170),
                inset: (x: 5pt, y: 4pt),
                table.header(h[Περίπτωση], h[Ποιος απορρίπτει], h[Γιατί]),
                [Πράξη διαχείρισης από διεύθυνση χωρίς το `AdminCap`, από τη σελίδα `/admin` που
                    ανοίγει για όλους],
                [Το SUI, στην προσομοίωση],
                [Αντικείμενο άλλου κατόχου δεν μπορεί να δοθεί ως είσοδος στη συναλλαγή
                    @SuiObjectOwnership],

                [Μεταβίβαση κλάσματος από το wallet],
                [Ο μεταγλωττιστής και ο επαληθευτής bytecode],
                [Το `Fraction` δεν έχει `store`, οπότε μόνο το module `fraction` μπορεί να το
                    μεταφέρει],

                [Μεταβίβαση του ίδιου του έργου τέχνης],
                [Ο μεταγλωττιστής και ο επαληθευτής bytecode],
                [Το `Artwork` δεν έχει `store`],

                [Αναφορά για έργο τέχνης που δεν παραλήφθηκε ποτέ],
                [Η σύνταξη της συναλλαγής],
                [Δεν υπάρχει log αναφορών να δοθεί ως όρισμα],

                [Ξένο κλάσμα ως απόδειξη κατοχής στο Seal],
                [Ο διακομιστής κλειδιών, στο dry-run],
                [Ελέγχει την κατοχή των owned εισόδων όπως μια κανονική συναλλαγή],

                [Ληγμένο κλειδί συνεδρίας του Seal],
                [Ο διακομιστής κλειδιών, πριν από την εκτέλεση της πολιτικής],
                [Το κλειδί ισχύει 30 λεπτά, η διεπαφή χρήστη ζητά νέα υπογραφή],

                [Πλαστογράφηση της οθόνης έγκρισης από κακόβουλη σελίδα],
                [Το extension του wallet],
                [Η οθόνη και τα κλειδιά ανήκουν στο extension, ο χρήστης βλέπει τι υπογράφει],
            )
        },
        caption: short-caption([Έλεγχοι εκτός έξυπνων συμβολαίων])[
            Έλεγχοι εγκυρότητας και ασφάλειας που επιβάλλονται πριν από την εκτέλεση στην αλυσίδα.
        ],
    )<tab-checks-outside>
]

Ο @tab-checks-enclave παρουσιάζει τις δοκιμές μονάδας του oracle σε Rust. Οι δοκιμές επικυρώνουν
την απόρριψη άκυρων ή εκπρόθεσμων αναγνώσεων και τη διαχείριση των παραθύρων συνάθροισης.

#let rust-checks(rows) = {
    set par(justify: false, leading: 0.45em)
    set text(size: 8pt, hyphenate: false)
    let h(name) = table.cell(fill: luma(235), align: center + horizon)[*#name*]
    table(
        columns: (1fr, auto, auto, auto),
        align: (left + horizon, left + horizon, center + horizon, center + horizon),
        stroke: 0.4pt + luma(170),
        inset: (x: 5pt, y: 4pt),
        table.header(h[Περίπτωση], h[Δοκιμή], h[Είδος], h[Επιτυχία]),
        ..rows
            .map(r => ([#r.at(0)], [#text(size: 6.5pt)[#raw(r.at(1))]], kind(r.at(2)), pass))
            .flatten(),
    )
}

#figure(
    rust-checks((
        ("Πλαστή υπογραφή ή υπογραφή άλλου κλειδιού", "a_forged_signature_is_refused", "-"),
        (
            "Ανάγνωση που άλλαξε μετά την υπογραφή, σε οποιοδήποτε πεδίο",
            "a_tampered_reading_is_refused",
            "-",
        ),
        ("Επανάληψη ή αναδιάταξη του nonce", "a_replayed_or_reordered_nonce_is_refused", "-"),
        (
            "Ανάγνωση παλαιότερη από 10 λεπτά ή μπροστά από το ρολόι",
            "a_stale_or_future_reading_is_refused",
            "-",
        ),
        ("Κατάσταση εκτός των τεσσάρων τιμών", "an_unknown_condition_is_refused", "-"),
        ("Κακοσχηματισμένο κλειδί ή υπογραφή", "malformed_keys_and_signatures_are_refused", "-"),
        (
            "Αίτημα με δηλωμένη διεύθυνση δεν μπορεί να αποσειριοποιηθεί",
            "a_claimed_address_cannot_be_expressed",
            "-",
        ),
        (
            "Κλείσιμο παραθύρου που δεν υπάρχει",
            "closing_a_window_that_does_not_exist_is_refused",
            "-",
        ),
        (
            "Ένα παράθυρο κλείνει σε μία υπογεγραμμένη αναφορά, όχι πριν από την ώρα του",
            "a_window_closes_into_one_signed_report",
            "+",
        ),
        (
            "Σε ισοπαλία επιλέγεται η χειρότερη κατάσταση και η μεμονωμένη απόκλιση μειοψηφεί",
            "ties_go_to_the_worse_condition_and_glitches_are_outvoted",
            "+",
        ),
        (
            "Παράθυρα χωριστά ανά πηγή και ανά έργο τέχνης",
            "windows_are_per_source_and_per_artwork",
            "+",
        ),
        (
            "Η διάρκεια ορίζεται από την πολιτική και μένει σταθερή μετά το άνοιγμα",
            "the_window_follows_the_policy_and_is_fixed_at_opening",
            "+",
        ),
        (
            "Τα bytes της αναφοράς ταυτίζονται με το BCS της Move",
            "report_bytes_match_the_move_payload",
            "+",
        ),
        (
            "Η Rust επαληθεύει υπογραφή που παράγει το script Python",
            "device_message_matches_device_py",
            "+",
        ),
    )),
    caption: short-caption([Δοκιμές μονάδας του oracle])[
        Δοκιμές μονάδας του oracle σε Rust για την επικύρωση αναγνώσεων και παραθύρων, καθώς και
        για τη συμβατότητα των μηνυμάτων μεταξύ Python, Rust και Move.
    ],
)<tab-checks-enclave>

== Κόστος των πράξεων <sec-cost>

Οι μετρήσεις κόστους (@tab-gas) προέρχονται από 18 επιλεγμένες συναλλαγές στο δοκιμαστικό δίκτυο,
με τιμή αναφοράς gas 1.000 MIST. Κάθε ενέργεια περιλαμβάνει χρεώσεις υπολογισμού και αποθήκευσης
στο SUI, καθώς και κόστος αποθήκευσης αρχείων στο Walrus σε WAL. Για την ενδεικτική αποτίμηση σε
δολάρια χρησιμοποιούνται τιμές 0,70 USD ανά SUI και 0,03 USD ανά WAL.

Οι τιμές περιγράφουν μία καταγεγραμμένη εκτέλεση ανά πράξη και δεν είναι μέσοι όροι
επαναλαμβανόμενων πειραμάτων. Το κόστος Walrus αφορά τα συγκεκριμένα αρχεία και τη διάρκεια
αποθήκευσης των 30 epochs της εγκατάστασης.

#figure(
    {
        set par(justify: false, leading: 0.45em)
        set text(size: 8pt, hyphenate: false)
        include "../assets/figures/chap6/gas-table.typ"
    },
    caption: short-caption([Το κόστος κάθε πράξης στο δοκιμαστικό δίκτυο])[
        Το κόστος κάθε πράξης, σε SUI για το blockchain δίκτυο και σε WAL για τα αρχεία.
    ],
)<tab-gas>

Τρία συμπεράσματα προκύπτουν από τον παραπάνω πίνακα:

+ *Ίδια χρέωση υπολογισμού στις περισσότερες μετρήσεις.* Δώδεκα από τις 18 συναλλαγές χρεώθηκαν
    ακριβώς 0,001 SUI, δηλαδή το ελάχιστο gas bucket @SuiGasFees. Η ίδια χρέωση σημαίνει ότι οι
    συγκεκριμένες εκτελέσεις ανήκουν στην ίδια βαθμίδα κόστους.

+ *Κόστος έκδοσης.* Η έκδοση απαιτεί 0,068 SUI, περίπου το 56% του συνολικού κόστους της
    εξεταζόμενης ροής έως την πρώτη πώληση, καθώς ενημερώνει άμεσα τον κατάλογο, το index λέξεων
    και το ιστορικό προέλευσης στο blockchain δίκτυο (#sec(<sec-index>)).

+ *Επιστροφή αποθήκευσης κατά την ενοποίηση.* Η `consolidate` έχει καθαρό κόστος 0,000560 SUI. Η
    καταστροφή του θησαυροφυλακίου και των κλασμάτων αποδεσμεύει αποθηκευτικό χώρο, αποδίδοντας
    επιστροφή 0,032436 SUI @SuiStorageDocs.

Η έκδοση ενός έργου τέχνης απαιτεί τρεις διακριτές συναλλαγές για την καταχώριση στο Walrus, την
κλήση του έξυπνου συμβολαίου και τη σύνδεση των αντικειμένων αποθήκευσης (#sec(<sec-data-model>)).
Στην έκδοση, το 71,6% του κόστους αποθήκευσης επιστρέφεται άμεσα με την κατανάλωση των προσωρινών
αντικειμένων @SuiStorageDocs. Με τις τιμές της μέτρησης, το κόστος Walrus (0,0259 WAL) αντιστοιχεί
σε λιγότερο από 0,001 USD.

Συνολικά, η εξεταζόμενη ροή από την έκδοση έως την πρώτη πώληση κοστίζει 0,121 SUI και 0,026 WAL,
δηλαδή περίπου 0,085 USD με τις ενδεικτικές τιμές της μέτρησης.

== Ιχνηλάτηση απαιτήσεων <sec-traceability>

Ο @tab-traceability αντιστοιχίζει κάθε λειτουργική απαίτηση με την περίπτωση χρήσης που την
επιδεικνύει, τη μονάδα Move που την υλοποιεί και τον σχετικό πίνακα ελέγχων ορθότητας.

#[
    #show figure: set block(breakable: true)
    #figure(
        {
            set par(justify: false, leading: 0.45em)
            set text(size: 8.5pt, hyphenate: false)
            let h(name) = table.cell(fill: luma(235), align: center + horizon)[*#name*]
            table(
                columns: (auto, 1fr, auto, auto, auto),
                align: (
                    center + horizon,
                    left + horizon,
                    center + horizon,
                    left + horizon,
                    center + horizon,
                ),
                stroke: 0.4pt + luma(170),
                inset: (x: 5pt, y: 4pt),
                table.header(
                    h[Κωδ.], h[Απαίτηση], h[Περίπτωση χρήσης], h[Μονάδα Move], h[Έλεγχος]
                ),
                [ΛΑ-01], [Σύνδεση wallet και ρόλος], [#sec(<sec-uc-wallet>)], [-], [-],
                [ΛΑ-02],
                [Πλοήγηση και αναζήτηση στον κατάλογο],
                [#sec(<sec-uc-catalogue>)],
                [artwork],
                [-],

                [ΛΑ-03],
                [Δημόσια επαλήθευση προέλευσης και φύλαξης],
                [#sec(<sec-uc-verify>)],
                [-],
                [-],

                [ΛΑ-04],
                [Δημόσια διαφάνεια],
                [#sec(<sec-uc-genesis>), #sec(<sec-uc-report>) και #sec(<sec-uc-verify>)],
                [admin, registry, report, stats],
                [-],

                [ΛΑ-05], [Ειδοποιήσεις ανά ρόλο], [#sec(<sec-uc-notifications>)], [-], [-],
                [ΛΑ-06],
                [Έκδοση έργου τέχνης],
                [#sec(<sec-uc-mint>)],
                [artwork],
                [#ref(<tab-checks-mint>, supplement: [Πίν.])],

                [ΛΑ-07],
                [Κρυπτογράφηση της εικόνας υψηλής ανάλυσης],
                [#sec(<sec-uc-mint>) και #sec(<sec-uc-verify>)],
                [policy],
                [#ref(<tab-checks-seal>, supplement: [Πίν.])],

                [ΛΑ-08],
                [Ακύρωση της έκδοσης],
                [-],
                [artwork],
                [#ref(<tab-checks-mint>, supplement: [Πίν.])],

                [ΛΑ-09],
                [Καταχώριση παραλαβής σε φύλαξη],
                [#sec(<sec-uc-mint>)],
                [custody],
                [#ref(<tab-checks-mint>, supplement: [Πίν.])],

                [ΛΑ-10],
                [Έκδοση πιστοποιητικού γνησιότητας],
                [#sec(<sec-uc-mint>)],
                [certificate],
                [#ref(<tab-checks-mint>, supplement: [Πίν.])],

                [ΛΑ-11],
                [Δήλωση απώλειας],
                [#sec(<sec-uc-report>)],
                [custody],
                [#ref(<tab-checks-report>, supplement: [Πίν.])],

                [ΛΑ-12],
                [Κλασματοποίηση],
                [#sec(<sec-uc-fraction>)],
                [fraction],
                [#ref(<tab-checks-frac>, supplement: [Πίν.])],

                [ΛΑ-13],
                [Αγορά και πώληση κλασμάτων],
                [#sec(<sec-uc-market>)],
                [market],
                [#ref(<tab-checks-market>, supplement: [Πίν.])],

                [ΛΑ-14],
                [Ενοποίηση όλων των κλασμάτων],
                [#sec(<sec-uc-fraction>)],
                [fraction],
                [#ref(<tab-checks-frac>, supplement: [Πίν.])],

                [ΛΑ-15],
                [Αποστολή αναγνώσεων στο oracle],
                [#sec(<sec-uc-report>)],
                [report],
                [#ref(<tab-checks-report>, supplement: [Πίν.])],

                [ΛΑ-16],
                [Μετρήσεις, εγγραφή και αποδοχή του oracle],
                [-],
                [report],
                [#ref(<tab-checks-genesis>, supplement: [Πίν.])],

                [ΛΑ-17],
                [Εγγραφή και ανάκληση στα μητρώα],
                [#sec(<sec-uc-genesis>)],
                [admin, registry],
                [#ref(<tab-checks-genesis>, supplement: [Πίν.])],

                [ΛΑ-18],
                [Ανάθεση νέας γκαλερί φύλαξης],
                [-],
                [custody],
                [#ref(<tab-checks-mint>, supplement: [Πίν.])],

                [ΛΑ-19],
                [Ορισμός εποπτικών παραμέτρων],
                [#sec(<sec-uc-genesis>)],
                [admin, report],
                [#ref(<tab-checks-genesis>, supplement: [Πίν.])],
            )
        },
        caption: short-caption([Ιχνηλάτηση των λειτουργικών απαιτήσεων])[
            Κάθε λειτουργική απαίτηση, η αντίστοιχη περίπτωση χρήσης, η μονάδα Move που την
            υλοποιεί και ο πίνακας ελέγχων ορθότητας.
        ],
    )<tab-traceability>
]

Η παύλα στη στήλη «Περίπτωση χρήσης» δηλώνει ότι η απαίτηση δεν περιλαμβάνεται στις επιλεγμένες
ροές του κεφαλαίου 5, αλλά ελέγχεται από τον πίνακα δοκιμών της τελευταίας στήλης. Οι απαιτήσεις με
παύλα στη στήλη της μονάδας Move αφορούν αναγνώσεις της διεπαφής μέσω RPC client, χωρίς μεταβολή
της κατάστασης στην αλυσίδα, και γι' αυτό δεν έχουν αντίστοιχες δοκιμές συμβολαίων.

Για τις λειτουργίες της διεπαφής, το κεφάλαιο 5 παρέχει επίδειξη επιλεγμένων ροών και στιγμιότυπα.
Η αντιστοίχιση δεν ισοδυναμεί με αυτοματοποιημένη δοκιμή κάθε λειτουργικής απαίτησης από τον
browser έως τις εξωτερικές υπηρεσίες.
