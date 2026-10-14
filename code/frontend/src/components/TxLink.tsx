import { config } from '@/config';
import { shortId } from '@/adapters';

export function TxLink({ digest, label }: { digest: string; label?: string }) {
  return (
    <a
      href={config.explorer.tx(digest)}
      target="_blank"
      rel="noreferrer"
      className="font-mono2 text-xs text-[hsl(var(--accent))] underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {label ?? shortId(digest)} <span aria-hidden>↗</span>
    </a>
  );
}

export function ObjectLink({ id, short = false }: { id: string; short?: boolean }) {
  return (
    <a
      href={config.explorer.object(id)}
      target="_blank"
      rel="noreferrer"
      className="break-all font-mono2 text-[13px] text-[hsl(var(--accent))] underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {short ? shortId(id) : id}
    </a>
  );
}

export function AddressLink({ address, short = false }: { address: string; short?: boolean }) {
  return (
    <a
      href={config.explorer.address(address)}
      target="_blank"
      rel="noreferrer"
      className="break-all font-mono2 text-[13px] text-[hsl(var(--accent))] underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {short ? shortId(address, 6, 4) : address}
    </a>
  );
}
