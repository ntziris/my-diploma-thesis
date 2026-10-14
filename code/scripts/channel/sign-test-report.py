#!/usr/bin/env python3
# Usage: ./sign-test-report.py --artwork 0x.. --source 0x..         --condition 1 --readings 3 --timestamp 4000

import argparse
import pathlib
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from suibcs import bcs_address, bcs_u8, bcs_u64  # noqa: E402

# Fixed seed, so the vectors are reproducible from this file alone.
SEED = bytes([0x2A]) * 32

REPORT_INTENT = 0

def intent_message(artwork: str, source: str, condition: int,
                   readings: int, timestamp_ms: int) -> bytes:
    payload = (
        bcs_address(artwork)
        + bcs_address(source)
        + bcs_u8(condition)
        + bcs_u64(readings)
    )
    return bcs_u8(REPORT_INTENT) + bcs_u64(timestamp_ms) + payload

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artwork", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--condition", type=int, required=True)
    ap.add_argument("--readings", type=int, required=True,
                    help="how many readings the closed window held")
    ap.add_argument("--timestamp", type=int, required=True)
    args = ap.parse_args()

    key = Ed25519PrivateKey.from_private_bytes(SEED)
    pk = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)

    message = intent_message(
        args.artwork, args.source, args.condition, args.readings, args.timestamp
    )
    sig = key.sign(message)

    print(f"artwork      {args.artwork}")
    print(f"source       {args.source}")
    print(f"condition    {args.condition}")
    print(f"readings     {args.readings}")
    print(f"timestamp    {args.timestamp}")
    print()
    print(f"intent bcs   x\"{message.hex()}\"")
    print(f"public key   x\"{pk.hex()}\"")
    print(f"signature    x\"{sig.hex()}\"")

if __name__ == "__main__":
    main()
