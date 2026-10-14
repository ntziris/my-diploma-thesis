# Frontend

React 19, Vite, TypeScript, Tailwind. Talks directly to Sui testnet (gRPC), Walrus and the
Seal key servers from the browser; no server of its own. Wallet through the Wallet Standard
(`@mysten/dapp-kit-react`, tested with Slush).

Package manager: **pnpm**.

```
pnpm install
pnpm dev        # http://localhost:5173
pnpm lint
pnpm build      # dist/, ready for a Walrus Site (see public/ws-resources.json)
```

Deployment ids live in `src/config.ts` and are patched by `../scripts/chain/record-publish.sh`.
`packageId` is the original package (namespace of every type, event and Seal identity);
`latestPackageId` is the version transactions call.

Layout: `src/adapters` (chain reads, Walrus, Seal, wallet), `src/tx` (programmable
transaction blocks), `src/state` (derived view model), `src/views` and `src/components`.
The UI is Greek; code, identifiers and comments are English.
