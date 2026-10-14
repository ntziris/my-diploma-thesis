import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'outline' | 'neutral' | 'danger' | 'danger-outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-[hsl(var(--accent))] bg-primary font-medium text-primary-foreground hover:opacity-90',
  outline:
    'border-[hsl(var(--accent))] font-medium text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent)/0.08)]',
  neutral: 'border-border hover:bg-secondary',
  danger:
    'border-[hsl(var(--status-destroyed-fg))] bg-[hsl(var(--status-destroyed-fg))] font-medium text-[hsl(var(--accent-foreground))] hover:opacity-90',
  'danger-outline':
    'border-[hsl(var(--status-destroyed-fg))] font-medium text-[hsl(var(--status-destroyed-fg))] hover:bg-[hsl(var(--status-destroyed-bg))]',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'gap-1.5 px-3 py-1 text-xs',
  sm: 'gap-2 px-4 py-1.5 text-[13px]',
  md: 'gap-2 px-5 py-2 text-[13px]',
  lg: 'gap-2.5 px-5 py-3 text-sm',
};

const ICON_SIZE: Record<ButtonSize, number> = { xs: 11, sm: 12, md: 12, lg: 13 };

type Look = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  className?: string;
  children?: ReactNode;
};

function classes({ variant = 'primary', size = 'sm', block, className }: Look) {
  return cn(
    'inline-flex items-center border disabled:cursor-not-allowed disabled:opacity-40',
    VARIANT[variant],
    SIZE[size],
    block && 'flex w-full justify-center',
    className,
  );
}

function content({ size = 'sm', icon, iconRight, children }: Look) {
  const px = ICON_SIZE[size];
  return (
    <>
      {icon ? <Icon name={icon} size={px} className="shrink-0" /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={px} className="shrink-0" /> : null}
    </>
  );
}

export type ButtonProps = Look & Omit<ComponentProps<'button'>, 'className' | 'children'>;

export function Button({
  variant,
  size,
  icon,
  iconRight,
  block,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={classes({ variant, size, block, className })} {...rest}>
      {content({ size, icon, iconRight, children })}
    </button>
  );
}

export type ButtonLinkProps = Look &
  Omit<ComponentProps<'a'>, 'className' | 'children' | 'href'> &
  ({ to: string; href?: never } | { href: string; to?: never });

// Router link when `to` is given, plain anchor when `href` is given
export function ButtonLink({
  variant,
  size,
  icon,
  iconRight,
  block,
  className,
  children,
  to,
  href,
  ...rest
}: ButtonLinkProps) {
  const cls = classes({ variant, size, block, className });
  const body = content({ size, icon, iconRight, children });
  if (to != null) {
    return (
      <Link to={to} className={cls} {...rest}>
        {body}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      {body}
    </a>
  );
}
