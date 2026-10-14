import { config } from '@/config';
import { Icon } from './Icon';

export function Footer() {
  return (
    <footer className="bg-[hsl(var(--accent))] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 sm:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="flex items-start gap-3">
            <img
              src={`${import.meta.env.BASE_URL}pyrforos.svg`}
              alt="Σήμα ΕΜΠ"
              className="h-20 w-20 shrink-0 [filter:brightness(0)_invert(1)]"
            />
            <div className="text-[13px] leading-snug">
              <p className="text-[17px] font-semibold tracking-[0.02em]">
                ΕΘΝΙΚΟ ΜΕΤΣΟΒΙΟ ΠΟΛΥΤΕΧΝΕΙΟ
              </p>
              <p className="mt-1 text-[15px] text-white/70">
                Σχολή Ηλεκτρολόγων Μηχανικών και Μηχανικών Υπολογιστών
              </p>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-snug tracking-[0.02em] sm:whitespace-nowrap">
            ΤΟΜΕΑΣ ΤΕΧΝΟΛΟΓΙΑΣ ΠΛΗΡΟΦΟΡΙΚΗΣ ΚΑΙ ΥΠΟΛΟΓΙΣΤΩΝ
          </p>
        </div>

        <div className="text-[13px] leading-relaxed">
          <p className="micro-label mb-1.5 !text-white/60">Διπλωματική εργασία</p>
          <p>
            Σχεδίαση και υλοποίηση αποκεντρωμένης εφαρμογής για Tokenization έργων τέχνης στο
            οικοσύστημα SUI Blockchain
          </p>
          <p className="mt-2 text-white/70">του Νικολάου Τζίρη</p>
          <p className="text-white/70">Αθήνα 2026</p>
        </div>

        <div className="text-[13px]">
          <p className="micro-label mb-2 !text-white/60">Επαλήθευση</p>
          <div className="flex flex-col items-start gap-1.5">
            <a
              href={config.explorer.object(config.packageId)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 border border-white/50 px-3 py-1 text-xs font-medium transition-colors hover:bg-white hover:text-[hsl(var(--accent))]"
            >
              <Icon name="arrow-up-right-from-square" size={11} />
              Πακέτο στον SUI Explorer
            </a>
            {config.links.github ? (
              <a
                href={config.links.github}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 border border-white/50 px-3 py-1 text-xs font-medium transition-colors hover:bg-white hover:text-[hsl(var(--accent))]"
              >
                <Icon name="github" size={12} />
                Κώδικας στο GitHub
              </a>
            ) : null}
            {config.links.thesis ? (
              <a
                href={config.links.thesis}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 border border-white/50 px-3 py-1 text-xs font-medium transition-colors hover:bg-white hover:text-[hsl(var(--accent))]"
              >
                <Icon name="file-lines" size={12} />
                Κείμενο της εργασίας
              </a>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-white/70">Δίκτυο: {config.network}</p>
          <p className="text-xs text-white/70">Επικοινωνία: ntziris@gmail.com</p>
        </div>
      </div>

      <div className="border-t border-white/20 bg-[hsl(214_100%_16.8%)]">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-6 gap-y-1 px-6 py-3 text-xs text-white/70">
          <p>Ερευνητικό πρωτότυπο σε δίκτυο δοκιμών. Δεν αποτελεί επενδυτική υπηρεσία.</p>
          <p>© 2026 Νικόλαος Τζίρης. Με επιφύλαξη παντός δικαιώματος.</p>
        </div>
      </div>
    </footer>
  );
}
