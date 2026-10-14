import { SuiGrpcClient } from '@mysten/sui/grpc';
import { createDAppKit } from '@mysten/dapp-kit-core';
import { walrus } from '@mysten/walrus';
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';
import { config } from '@/config';

export function createClient() {
  return new SuiGrpcClient({
    network: config.network as 'testnet',
    baseUrl: config.grpcUrl,
  }).$extend(
    walrus({
      wasmUrl: walrusWasmUrl,
      // Browser uploads otherwise fan out into thousands of requests to storage nodes.
      uploadRelay: {
        host: 'https://upload-relay.testnet.walrus.space',
        sendTip: { max: 1_000 },
      },
    }),
  );
}

export const suiClient = createClient();

export const dAppKit = createDAppKit({
  networks: ['testnet'],
  defaultNetwork: 'testnet',
  createClient: () => suiClient,
  // btoa accepts Latin-1 only, and the default is document.title, which is Greek
  slushWalletConfig: { appName: 'ArtTokenization' },
});

declare module '@mysten/dapp-kit-core' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
