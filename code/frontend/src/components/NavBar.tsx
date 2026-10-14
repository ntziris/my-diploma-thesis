import { useCallback, useId, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { useWallet } from '@/adapters/wallet-context';
import { useNotices, useRole } from '@/state/queries';
import type { Notice, NoticeKind } from '@/state/derive';
import { fmtDate } from './format';
import { Icon, type IconName } from './Icon';
import { AccountMenu } from './AccountMenu';
import { cn } from '@/lib/utils';
import { useDismiss } from '@/lib/useDismiss';
import { Button } from './Button';

function NavItem({ to, end, children }: { to: string; end?: boolean; children: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'shrink-0 whitespace-nowrap px-1 py-1 text-[13px] transition-colors',
          isActive
            ? 'border-b-2 border-[hsl(var(--accent))] font-semibold text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

function PanelItem({
  to,
  end,
  onNavigate,
  children,
}: {
  to: string;
  end?: boolean;
  onNavigate: () => void;
  children: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'border-l-2 px-4 py-2.5 text-sm transition-colors',
          isActive
            ? 'border-[hsl(var(--accent))] bg-secondary/60 font-semibold text-foreground'
            : 'border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

export function NavBar() {
  const role = useRole();
  const { account, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const notices = useNotices();

  const links: { to: string; label: string; end?: boolean }[] = [
    { to: '/', label: 'Αρχική', end: true },
    { to: '/catalogue', label: 'Κατάλογος' },
    { to: '/verify', label: 'Επαλήθευση' },
    { to: '/transparency', label: 'Διαφάνεια' },
  ];
  if (role.connected && !role.isGallery && !role.isAuthority) {
    links.push({ to: '/portfolio', label: 'Χαρτοφυλάκιο' }, { to: '/mint', label: 'Έκδοση' });
  }
  if (role.isGallery) links.push({ to: '/gallery', label: 'Γκαλερί' });
  if (role.isAuthority) links.push({ to: '/admin', label: 'Διοίκηση' });

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/45 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3 lg:gap-6">
          <Link
            to="/"
            className="shrink-0 font-display text-xl font-semibold tracking-tight text-[hsl(var(--accent))]"
          >
            ArtTokenization
          </Link>

          <nav className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1 lg:flex xl:gap-x-4">
            {links.map((l) => (
              <NavItem key={l.to} to={l.to} end={l.end}>
                {l.label}
              </NavItem>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {role.connected && account ? (
              <>
                {notices.length > 0 ? <NoticeBell notices={notices} /> : null}
                <AccountMenu onDisconnect={disconnect} />
              </>
            ) : (
              <Button onClick={connect} icon="wallet" className="shrink-0 px-3 sm:px-4">
                <span className="hidden sm:inline">Σύνδεση wallet</span>
                <span className="sm:hidden">Wallet</span>
              </Button>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Κλείσιμο μενού' : 'Άνοιγμα μενού'}
              className="shrink-0 border border-border bg-card/70 p-2 text-muted-foreground hover:text-foreground lg:hidden"
            >
              <Icon name={menuOpen ? 'xmark' : 'bars'} size={14} />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav className="pop-enter flex flex-col border-t border-border bg-card py-2 lg:hidden">
            {links.map((l) => (
              <PanelItem key={l.to} to={l.to} end={l.end} onNavigate={() => setMenuOpen(false)}>
                {l.label}
              </PanelItem>
            ))}
          </nav>
        ) : null}
      </header>
    </>
  );
}

const NOTICE_ICON: Record<NoticeKind, IconName> = {
  intake: 'inbox',
  redemption: 'box-open',
  report: 'triangle-exclamation',
  orphan: 'building-columns',
  'mint-blocked': 'ban',
};

function NoticeBell({ notices }: { notices: Notice[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);

  const shown = notices.slice(0, 6);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        aria-label={`Ειδοποιήσεις (${notices.length})`}
        title={`${notices.length} ${notices.length === 1 ? 'εκκρεμότητα' : 'εκκρεμότητες'}`}
        className={cn(
          'relative flex items-center border border-border bg-card/70 p-2 transition-colors',
          open ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon name="bell" size={14} />
        <span className="absolute -right-1.5 -top-1.5 min-w-[1.05rem] border border-[hsl(var(--status-destroyed-border))] bg-[hsl(var(--status-destroyed-fg))] px-1 text-center font-mono2 text-[10px] leading-4 text-[hsl(var(--accent-foreground))]">
          {notices.length}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="pop-enter absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-2rem))] border border-border bg-card shadow-xl"
        >
          <p className="micro-label border-b border-border px-4 py-2.5">
            Ειδοποιήσεις ({notices.length})
          </p>
          <ul className="max-h-[60vh] overflow-y-auto">
            {shown.map((n) => (
              <li key={n.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void navigate(n.to);
                  }}
                  className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
                >
                  <Icon
                    name={NOTICE_ICON[n.kind]}
                    size={12}
                    className="mt-1 shrink-0 text-[hsl(var(--status-damaged-fg))]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{n.title}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {n.detail}
                    </span>
                    <span className="mt-0.5 block font-mono2 text-[11px] text-muted-foreground">
                      {fmtDate(n.at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {notices.length > shown.length ? (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              και άλλες {notices.length - shown.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
