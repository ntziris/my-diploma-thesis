import { Children, isValidElement, useEffect, type ReactElement, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';
import { Page } from './primitives';

export interface NavSection {
  id: string;
  label: string;
  icon: IconName;
}

export function PageWithNav({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro?: ReactNode;
  sections: readonly NavSection[];
  children: ReactNode;
}) {
  return (
    <Page title={title} intro={intro}>
      <SectionTabs sections={sections}>{children}</SectionTabs>
    </Page>
  );
}

export function SectionTabs({
  sections,
  children,
}: {
  sections: readonly NavSection[];
  children: ReactNode;
}) {
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();

  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{
    id?: string;
  }>[];
  const present = new Set(items.map((c) => c.props.id).filter(Boolean));
  const visible = sections.filter((s) => present.has(s.id));
  const wanted = hash.replace(/^#/, '');
  const active = visible.some((s) => s.id === wanted) ? wanted : (visible[0]?.id ?? '');

  useEffect(() => {
    if (active && wanted !== active)
      void navigate({ pathname, hash: `#${active}` }, { replace: true });
  }, [active, wanted, pathname, navigate]);

  const select = (id: string) => void navigate({ pathname, hash: `#${id}` });

  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <nav aria-label="Ενότητες σελίδας" className="mb-6 lg:sticky lg:top-20 lg:mb-0">
        <ol className="flex overflow-x-auto border border-border bg-card lg:flex-col lg:overflow-visible">
          {visible.map((s) => {
            const current = s.id === active;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => select(s.id)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-left text-[13px] leading-snug transition-colors lg:border-b-0 lg:border-l-2',
                    current
                      ? 'border-[hsl(var(--accent))] bg-secondary/60 font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                  )}
                >
                  <Icon
                    name={s.icon}
                    size={13}
                    className={cn(
                      'shrink-0',
                      current ? 'text-[hsl(var(--accent))]' : 'text-muted-foreground',
                    )}
                  />
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="flex min-w-0 flex-col gap-6">
        {items
          .filter((c) => !c.props.id || c.props.id === active)
          .map((c, i) => (
            <div key={c.props.id ?? c.key ?? i} className="pane-enter flex min-w-0 flex-col gap-6">
              {c}
            </div>
          ))}
      </div>
    </div>
  );
}

export function NavPane({ children }: { id: string; children: ReactNode }) {
  return <>{children}</>;
}
