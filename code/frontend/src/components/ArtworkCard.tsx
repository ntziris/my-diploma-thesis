import { shortId } from '@/adapters';
import { Link } from 'react-router';
import type { Artwork, StatusCondition } from '@/adapters';
import { lifecycleLabel, lifecycleTone } from '@/state/derive';
import { StatusBadge } from './StatusBadge';
import { fmtSUI } from './format';
import { Icon, type IconName } from './Icon';
import { Button, ButtonLink } from './Button';

export function ArtworkCard({
  artwork,
  terminal,
  condition,
  onBuy,
}: {
  artwork: Artwork;
  terminal?: boolean;
  condition?: StatusCondition | null;
  onBuy?: (artwork: Artwork) => void;
}) {
  const concern = !!condition && condition !== 'ok';
  const open = artwork.market.openListings;
  const canBuy = !!onBuy && !terminal && open > 0;

  return (
    <article className="group flex w-full flex-col border border-border bg-card transition-shadow duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:shadow-md">
      <Link to={`/artwork/${artwork.id}`} className="block overflow-hidden bg-secondary">
        <img
          src={artwork.image}
          alt={artwork.title}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
        <h3 className="font-display text-lg font-semibold leading-snug">{artwork.title}</h3>
        <Meta icon="user">
          {artwork.artistName && artwork.artistName !== artwork.artist
            ? artwork.artistName
            : shortId(artwork.artist, 6, 4)}
        </Meta>
        <Meta icon="flag" className={lifecycleTone(artwork)}>
          {lifecycleLabel(artwork)}
        </Meta>
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <Icon name="cubes" size={12} className="shrink-0 text-[hsl(var(--accent))]" />
          {terminal
            ? 'Ιστορικό διαθέσιμο'
            : artwork.fractions
              ? open > 0
                ? `${open} ${open === 1 ? 'αγγελία' : 'αγγελίες'}${artwork.market.lastPrice != null ? `, τελευταία ${fmtSUI(artwork.market.lastPrice)}` : ''}`
                : 'Χωρίς ενεργές αγγελίες'
              : 'Μη κλασματοποιημένο'}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[13px]">
          <Icon
            name="clipboard-list"
            size={12}
            className="shrink-0 text-[hsl(var(--accent))]"
            aria-hidden
          />
          {condition ? (
            <StatusBadge condition={condition} bare className="text-[13px]" />
          ) : (
            <span className="text-muted-foreground">Καμία αναφορά κατάστασης</span>
          )}
        </div>

        {concern && !terminal ? (
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[hsl(var(--status-damaged-fg))]">
            <Icon name="triangle-exclamation" size={11} className="mt-0.5 shrink-0" />
            Εκκρεμεί αναφορά προβλήματος.
          </p>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <ButtonLink
            to={`/artwork/${artwork.id}`}
            variant="outline"
            size="xs"
            icon="eye"
            className="hover:bg-primary hover:text-primary-foreground"
          >
            Προβολή
          </ButtonLink>
          {canBuy ? (
            <Button onClick={() => onBuy(artwork)} size="xs" icon="cart-shopping">
              Αγορά
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Meta({
  icon,
  children,
  className,
}: {
  icon: IconName;
  children: string;
  className?: string;
}) {
  return (
    <p className={`flex items-center gap-2 text-[13px] ${className || 'text-muted-foreground'}`}>
      <Icon
        name={icon}
        size={12}
        className={`shrink-0 ${className ? '' : 'text-[hsl(var(--accent))]'}`}
      />
      {children}
    </p>
  );
}
