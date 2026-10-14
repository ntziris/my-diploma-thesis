#import "@local/ntua-thesis-greek:0.1.0": *

#numless[= Περίληψη]

#perilipsi(
    [
        Η παραδοσιακή αγορά τέχνης αντιμετωπίζει εδώ και δεκαετίες πέντε θεμελιώδη προβλήματα,
        συγκεκριμένα την αδιαφάνεια των τιμών, την αβέβαιη πιστοποίηση της γνησιότητας, τη χαμηλή
        ρευστότητα, τα υψηλά όρια εισόδου για τους μικρούς επενδυτές και τη χαμηλή αμοιβή των
        καλλιτεχνών από τις μεταπωλήσεις των έργων τέχνης τους.

        Η παρούσα διπλωματική εργασία προτείνει μια εφαρμογή tokenization έργων τέχνης, με
        μηχανισμούς για την αντιμετώπιση των παραπάνω προβλημάτων. Η διαφάνεια υποστηρίζεται με τη
        δημόσια και αμετάβλητη καταγραφή κάθε συναλλαγής και του ιστορικού ιδιοκτησίας κάθε έργου
        τέχνης εντός της εφαρμογής. Η αυθεντικοποίηση των έργων εξασφαλίζεται μέσω ψηφιακών
        πιστοποιητικών γνησιότητας, που προσαρτώνται μόνιμα σε κάθε έργο και δεν μπορούν ούτε να
        παραποιηθούν ούτε να αποσπαστούν από αυτό. Η κλασματική ιδιοκτησία επιτρέπει την αγορά
        μεριδίων και τη διαπραγμάτευσή τους σε αποκεντρωμένη αγορά. Η δυνατότητα αυτή μπορεί να
        διευκολύνει τη συμμετοχή και τη ρευστότητα. Τέλος, σε κάθε μεταπώληση κλασμάτων μέσω της
        εφαρμογής, τα έξυπνα συμβόλαια καταβάλλουν αυτόματα στον καλλιτέχνη το δικαίωμα
        παρακολούθησης (royalty).

        Στο θεωρητικό μέρος της εργασίας μελετάμε την τεχνολογία blockchain, το tokenization
        πραγματικών περιουσιακών στοιχείων, τα oracles και τις τεχνολογίες του οικοσυστήματος SUI.
        Στο πρακτικό μέρος σχεδιάζουμε, υλοποιούμε και αξιολογούμε την εφαρμογή. Τα έξυπνα
        συμβόλαια είναι γραμμένα στη γλώσσα Move και εκτελούνται στο SUI. Τα αρχεία των έργων
        τέχνης αποθηκεύονται στο αποκεντρωμένο δίκτυο Walrus, ενώ η διεπαφή χρήστη φιλοξενείται
        αποκεντρωμένα ως Walrus Site. Το Seal επιτρέπει τη λήψη του κλειδιού αποκρυπτογράφησης του
        αρχείου υψηλής ανάλυσης κάθε έργου τέχνης στον ιδιοκτήτη και στους κατόχους κλασμάτων του.
        Η επικοινωνία των έξυπνων συμβολαίων με τον φυσικό κόσμο, δηλαδή οι αναφορές για την
        κατάσταση των έργων τέχνης, γίνεται μέσα από ένα oracle που σχεδιάσαμε πάνω στο Nautilus. Η
        εφαρμογή αναπτύχθηκε χωρίς παραδοσιακό backend στο δοκιμαστικό δίκτυο του SUI και
        αξιολογήθηκε ως προς την ορθότητα και το κόστος των συναλλαγών της. Η υλοποίηση συνδυάζει
        τα παραπάνω στοιχεία του οικοσυστήματος SUI σε μια ενιαία εφαρμογή για την αγορά τέχνης.
    ],
    [
        Tokenization πραγματικών περιουσιακών στοιχείων, Αποκεντρωμένες εφαρμογές, Αγορά τέχνης,
        Blockchain, SUI, Move, Έξυπνα συμβόλαια, Πιστοποιητικά γνησιότητας, Κλασματική ιδιοκτησία,
        Δικαίωμα παρακολούθησης, Αποκεντρωμένη αποθήκευση, Αποκεντρωμένη φιλοξενία, Walrus, Seal,
        Nautilus, Oracles, Περιβάλλοντα αξιόπιστης εκτέλεσης
    ],
    histinit_gap: -5pt,
)

#blank-pagebreak(to: "odd")

#numless[= Abstract]
#abstract(
    [
        For decades, the traditional art market has faced five fundamental problems, namely price
        opacity, uncertain authentication, low liquidity, high entry barriers for small investors,
        and low earnings for artists from the resale of their artworks.

        This thesis proposes an application for artwork tokenization with mechanisms to address
        these problems. Transparency is supported by the public and immutable recording of every
        transaction and each artwork's ownership history within the application. Artwork
        authentication is ensured through digital certificates of authenticity that are permanently
        attached to each artwork and cannot be forged or detached from it. Fractional ownership
        allows users to buy shares and trade them on a decentralised market. This capability may
        facilitate participation and liquidity. Finally, on every resale of fractions through the
        application, the smart contracts automatically pay the artist a resale royalty.

        In the theoretical part of the thesis, we study blockchain technology, the tokenization of
        real-world assets, oracles and the technologies of the SUI ecosystem. In the practical
        part, we design, implement and evaluate the application. The smart contracts are written in
        the Move language and run on SUI. Artwork files are stored on the decentralised Walrus
        network, while the user interface is hosted in a decentralised manner as a Walrus Site.
        Seal allows the owner and the holders of an artwork's fractions to obtain the decryption
        key for its high-resolution file. Communication between the smart contracts and the
        physical world, namely reports on the condition of the artworks, takes place through an
        oracle that we designed on top of Nautilus. The application was developed without a
        traditional backend on the SUI testnet and was evaluated in terms of correctness and
        transaction costs. The implementation combines these components of the SUI ecosystem into a
        single application for the art market.
    ],
    [
        Real-world asset tokenization, Decentralised applications, Art market, Blockchain, SUI,
        Move, Smart contracts, Certificates of authenticity, Fractional ownership, Resale royalty,
        Decentralised storage, Decentralised hosting, Walrus, Seal, Nautilus, Oracles, Trusted
        execution environments
    ],
    histinit_gap: 2pt,
)
