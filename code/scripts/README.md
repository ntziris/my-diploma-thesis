# Deployment and operation

Everything needed to put the platform on Sui testnet and to operate it. The single source of
truth is `deployment.testnet.json` (package and object ids, addresses, digests, enclave
measurements); the scripts read it and write back to it, and `chain/record-publish.sh` patches
`../frontend/src/config.ts` from it. Every command runs **from this directory**.

```
scripts/
  deployment.testnet.json   what is deployed: ids, addresses, digests, PCRs
  chain/                    publish, one-time setup, Display templates
  enclave/                  the Nautilus enclave: on-chain config, secrets, EC2 bootstrap,
                            and the public entrance devices post their readings to
  channel/                  external sources and status reports: device keys, readings, BCS
  site/                     the Walrus Site (frontend hosting)
  logs/                     raw CLI output of every transaction the scripts sent
```

## What is deployed (testnet)

| | id |
|---|---|
| Package `art_tokenization` (with the bundled `enclave` package) | `0x264a7a0c…4c0e` |
| Catalog (the on-chain index), Stats, ChannelStats | `0x04a5470c…93a0`, `0x3a95e52c…b9a5`, `0xa9b55e1c…1bda` |
| Registries (galleries, sources) | `0x697ec6eb…fb15`, `0x442167c6…b51f` |
| Params (royalty), ChannelPolicy (window) | `0xccefa07b…1190`, `0x15839ea1…d4b1` |
| EnclaveConfig, its Cap | `0xaf175298…9b2b`, `0x668728ee…77c4` |
| Walrus Site | https://art-tokenization.duckdns.org |

Full ids in `deployment.testnet.json`.

### Wallets and keys

- **authority**: publishes, owns `AdminCap` and the enclave `Cap`, registers galleries and
  sources, sets the parameters. Alias `authority` in the local Sui keystore.
- **gallery-a**, **gallery-b**, **artist**, **investor-1**: demo roles, under `addresses`.
- **enclave-payer**: the wallet the operator lends to the enclave to pay gas. It only pays;
  every report is signed by the enclave's own key.
- **Sources** are keypairs, not wallets (`channel/device.py`). They hold no SUI and never talk to
  the chain. The demo devices are under `devices`: `inspector` (registered by `chain/setup-testnet.sh registries`)
  and `sensor-hall-3` (registered live from the admin page).

## Prerequisites

- `sui` 1.78 or newer (`suiup`), `jq`, `python3` with the `cryptography` package
- `node` + `pnpm` for the frontend; `site-builder` and `walrus` for the site
- Docker Desktop, to build the enclave image reproducibly
- an EC2 instance with Nitro Enclaves (`enclave/ec2-user-data.sh` bootstraps it) and the ssh key
  `~/.ssh/nautilus-key.pem`

The public full node rate-limits (HTTP 429); a failed script can simply be re-run, except the
two marked *not idempotent* below.

## From zero: a fresh deployment

The step-by-step installation, with the checks between the steps, is `../README.md`; this is
the same procedure in short.

1. **Publish** the package (as the authority). `Published.toml` must not exist from an earlier
   deployment on the same network, or the CLI treats the publish as an upgrade.

   ```
   cd ../smart-contracts && sui move test && rm -f Published.toml
   sui client switch --address authority
   sui client publish --with-unpublished-dependencies --json > ../scripts/logs/publish.testnet.json
   cd ../scripts && chain/record-publish.sh
   ```

   `record-publish.sh` rewrites `deployment.testnet.json` (keeping `addresses`, `devices` and
   `enclavePcrs`) and patches `config.ts`.

2. **One-time setup** (*not idempotent*: `register` aborts on an existing entry and
   `display::register` would mint a second pair of Display objects):

   ```
   chain/setup-testnet.sh registries    # galleries, the inspector device, royalty 4 %
   chain/setup-testnet.sh display       # Display<Artwork>, Display<Fraction>
   chain/record-publish.sh display      # records the Display ids
   ```

3. **Enclave image**, built locally, with Docker Desktop running:

   ```
   (cd ../enclave && make ENCLAVE_APP=art-tokenization)   # out/nitro.eif, out/nitro.pcrs
   enclave/enclave-setup.sh measure     # reads ../enclave/out/nitro.pcrs, no transaction
   ```

   In this image PCR0 = PCR1 (the application lives in the boot ramdisk) and PCR2 is a constant
   of the build pipeline. Any code change changes PCR0, so this step repeats after a rebuild,
   and the new measurements are then declared with `enclave/enclave-setup.sh pcrs`.

4. **Enclave configuration on chain**, with the measurements of that image:

   ```
   enclave/enclave-setup.sh config      # Cap + EnclaveConfig declaring the PCRs; patches config.ts
   ```

   The image comes first on purpose. A configuration created with zeros accepts an enclave built
   in debug mode, whose measurements are zeros too, from anyone at all, and `update_pcrs` does
   not invalidate what registered in the meantime.

5. **Start the enclave** on the instance (start it, refresh the "My IP" rule of its security
   group, note the public IP):

   ```
   scp -i ~/.ssh/nautilus-key.pem ../enclave/out/nitro.eif ../enclave/expose_enclave.sh \
       ../enclave/host-egress.sh ec2-user@IP:~/
   enclave/enclave-secrets.sh IP enclave-payer     # secrets.json: ids + the lent payer's seed
   ssh -i ~/.ssh/nautilus-key.pem ec2-user@IP
     sh host-egress.sh                                # vsock-proxy to graphql.testnet.sui.io
     nitro-cli run-enclave --cpu-count 2 --memory 1024 --eif-path nitro.eif
     nitro-cli describe-enclaves                      # PCRs must equal out/nitro.pcrs
     setsid nohup sh expose_enclave.sh > expose.log 2>&1 < /dev/null &
     curl -s localhost:3000/status | jq
   ```

   Within a minute the enclave registers itself (`register_enclave` with its own attestation,
   paid by `enclave-payer`). Record it:

   ```
   ssh -f -N -i ~/.ssh/nautilus-key.pem -L 3100:localhost:3000 ec2-user@IP
   ENCLAVE_URL=http://localhost:3100 enclave/enclave-setup.sh record
   enclave/enclave-setup.sh accept                  # the authority names it; nothing counts before
   enclave/enclave-setup.sh endpoint https://…      # where devices send their readings
   ```

   The frontend needs nothing from this step: it reads the registered enclave (object, key,
   time, payer) from the `register_enclave` transactions on the node, so a restart of the
   enclave is a new registration and nothing else.

6. **Frontend and site**. `cd ../frontend && pnpm dev` for development; the catalogue is empty
   until works are minted from the UI. When the content
   is in place, `site/deploy-site.sh` builds and publishes the Walrus Site (the site object id
   lives in `../frontend/public/ws-resources.json`, so every deploy updates the same site).

## Day to day

- **Parameters** (royalty, aggregation window, enclave PCRs) change from the admin page as the
  authority; `enclave/enclave-setup.sh window <ms>` and `... pcrs` are the script equivalents.
- **Readings and reports**. A device signs a reading and posts it to the enclave; the enclave
  files it into a window per (source, artwork), closes the window when it expires and submits
  one signed `record_report` itself:

  ```
  channel/device.py generate <name>            # key under ~/.art-tokenization/devices/, prints the address to register
  channel/submit-report.sh read sensor-hall-3 --artwork <id> --condition 1
  curl -s $ENCLAVE_URL/status | jq .recent     # one report per window, with its digest
  ```

  The device signs the current time into the reading; the enclave refuses readings older than
  10 minutes or ahead of its clock by more than 60 s. `submit-report.sh close` exists for an
  enclave run without a chain connection (it then submits as a relayer wallet).
- **The enclave the channel accepts**. Registration is permissionless, so the authority names
  the deployment whose reports count: `enclave/enclave-setup.sh accept` (or the admin page).
  A restart of the enclave produces a new object and needs this act again, and declaring new
  PCRs retires whatever registered against the old ones. Once accepted, the enclave deletes the
  older registrations its wallet paid for (`deploy_old_enclave_by_owner`), so the chain keeps
  one `Enclave` object per channel; `/status` reports `pruned_registrations`.
- **The endpoint**. Devices are not operators and have no ssh key, so the channel has a public
  entrance: `enclave/ingress.sh up <ip> <domain>` puts Caddy on the parent instance, terminating
  TLS and forwarding exactly one route, `POST /process_data`, to the enclave on the loopback.
  `/status`, `/close_window` and the Seal admin endpoints stay behind ssh. It needs an Elastic IP,
  a DNS name pointing at it, and inbound 80 and 443. Then
  `enclave/enclave-setup.sh endpoint https://…` publishes the address on chain, so a source needs
  nothing but the package id to find the channel.
- **The same thing with a window to watch**. `../source-simulator/` is a separate desktop
  program that plays the sources: it creates device keys, signs readings, posts them to the
  published endpoint and reads back from the chain what became of them. It is not part of the
  deployment and needs nothing from this directory, only a package id.
- **Site URL**. `chain/update-site-url.sh <url>` rewrites `link` and `project_url` in both
  Display templates if the site ever moves.
- **Upgrade** (function bodies only; struct layouts and public signatures are frozen):

  ```
  cd ../smart-contracts && sui move test
  sui client upgrade --upgrade-capability $(jq -r .upgradeCap ../scripts/deployment.testnet.json) \
      --with-unpublished-dependencies --skip-verify-compatibility --json > ../scripts/logs/upgrade.testnet.json
  cd ../scripts && chain/record-publish.sh upgrade
  ```

  `--skip-verify-compatibility` is needed because the bundled `enclave` module is invisible to
  the CLI's local check; the chain runs its own. `packageId` stays the namespace of every type;
  `latestPackageId` is the version transactions call.

## The channel in one paragraph

The enclave has exactly one egress, Sui's GraphQL service, and uses it for the application's own
state (is this source registered? which report log does this artwork have?) and to submit its
own transactions; it never fetches data about the world. Its configuration arrives in
`secrets.json`, handed over by the parent instance at boot. All of it is public deployment data
except the payer seed, read from the local keystore, sent over ssh from a mode-600 temporary
file and never stored in the repository. `channel/suibcs.py` is the BCS encoding shared by the
device script, the enclave and the Move tests: these bytes are the contract between the three,
and `channel/sign-test-report.py` produces the fixed signatures the Move tests carry.
