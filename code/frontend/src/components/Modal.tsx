import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const width = size;
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Read through a ref so the focus effect depends on open only
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((el) => el.offsetParent !== null);

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="overlay-enter fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4 sm:p-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'dialog-enter my-auto w-full border border-border bg-card shadow-xl',
          width === 'xl' ? 'max-w-5xl' : width === 'lg' ? 'max-w-2xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id={titleId} className="micro-label">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="px-2 text-lg leading-none text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmWarning({
  checkboxLabel,
  checked,
  onChecked,
  children,
}: {
  checkboxLabel: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] leading-relaxed text-foreground">{children}</div>
      <label className="flex cursor-pointer items-start gap-2 border border-border bg-secondary/50 px-3 py-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]"
          checked={checked}
          onChange={(e) => onChecked(e.target.checked)}
        />
        <span className="font-medium">{checkboxLabel}</span>
      </label>
    </div>
  );
}

export function TxPending({ label }: { label?: string }) {
  return (
    <div
      className="fade-enter flex items-center gap-3 border border-dashed border-border bg-card px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
      <span className="text-sm text-muted-foreground">
        {label || 'Αναμονή υπογραφής και επιβεβαίωσης…'}
      </span>
    </div>
  );
}
