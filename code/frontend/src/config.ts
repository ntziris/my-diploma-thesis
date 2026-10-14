export const config = {
  network: 'testnet',
  grpcUrl: 'https://fullnode.testnet.sui.io:443',
  packageId: '0x3da1733b1b551e8b55851cd82c06ef02acb970e8996988153ba8db1c271d2b5d',
  latestPackageId: '0x3da1733b1b551e8b55851cd82c06ef02acb970e8996988153ba8db1c271d2b5d',
  objects: {
    galleryRegistry: '0x0aa93294d5870088db1c04facd91e2098c6f4cbf57f1df41d3efd0e3f22c9996',
    sourceRegistry: '0xf66e8467a450ac96f5be04c386eb4073127fb9c343e3176150b45ee42b5ca73b',
    params: '0xb534111b62bcdd8e4b5b868e26f7e704d4db556438079ecbb641f292e84ca653',
    channelPolicy: '0x28754cf524f16e108d58a2873f504dc9660d11bce9c422341d945e479437533d',
    catalog: '0x7f144113c432ab823a6e834af298bac86ee9c23fd59abb06d86a4561e2c9da70',
    stats: '0xa5d013c456c22c825d2a0625a3122ed682858e79641145fd89296520d99de43c',
    channelStats: '0x3f63799483e8b3891b429490f6e5540d08a22dc3afa142cc62ad0184a6a1d814',
    adminCap: '0x764efcb248aa000091ac6e768521845d5068950d7513fea4f9a29c7929573b74',
  },
  authority: '0x72c920e112db42c3bc5e0280b4421072370f0ee8086f828f20f268e2e5ee3b35',
  explorer: {
    tx: (digest: string) => `https://suiscan.xyz/testnet/tx/${digest}`,
    object: (id: string) => `https://suiscan.xyz/testnet/object/${id}`,
    address: (addr: string) => `https://suiscan.xyz/testnet/account/${addr}`,
  },
  walrus: {
    aggregator: 'https://aggregator.walrus-testnet.walrus.space',
    url: (id: string) => `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${id}`,
    storageEpochs: 30,
    systemObjectId: '0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af',
    walType: '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL',
  },
  seal: {
    servers: [
      {
        objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
        aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
        weight: 1,
      },
      { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
      { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
    ],
    threshold: 2,
    sessionTtlMinutes: 30,
  },
  enclave: {
    configId: '0x181ea3578f4f2f2337956f84050f2454150e5e4a112832c747686cdf51d85601',
    capId: '0xd9831d67085aba53cbe98d3891c5fe40c9d8737aca245b848d4b36c2493a99ab',
  },
  links: {
    github: '',
    thesis: '',
  },
} as const;
