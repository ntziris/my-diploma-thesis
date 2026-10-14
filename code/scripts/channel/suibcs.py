import hashlib

ED25519_FLAG = 0x00

def uleb128(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | 0x80 if n else b)
        if not n:
            return bytes(out)

def bcs_u8(n: int) -> bytes:
    return bytes([n])

def bcs_u64(n: int) -> bytes:
    return n.to_bytes(8, "little")

def bcs_address(value: str) -> bytes:
    hex_str = value.removeprefix("0x")
    if not hex_str or len(hex_str) > 64:
        raise ValueError(f"{value} is not a 32 byte hex address")
    return bytes.fromhex(f"{hex_str:0>64}")

def bcs_string(s: str) -> bytes:
    raw = s.encode()
    return uleb128(len(raw)) + raw

def sui_address(public_key: bytes, flag: int = ED25519_FLAG) -> str:
    if len(public_key) != 32:
        raise ValueError("an ed25519 public key is 32 bytes")
    digest = hashlib.blake2b(bytes([flag]) + public_key, digest_size=32).hexdigest()
    return "0x" + digest

def selftest() -> None:
    got = (
        bcs_u8(0)
        + bcs_u64(1744038900000)
        + bcs_string("San Francisco")
        + bcs_u64(13)
    ).hex()
    expected = "0020b1d110960100000d53616e204672616e636973636f0d00000000000000"
    assert got == expected, f"BCS mismatch:\n  got      {got}\n  expected {expected}"

    # 2. The address derivation, against `sui keytool generate ed25519`.
    pk = bytes.fromhex("6a3b727eb875f66eac5ed2b2a84edc2fdac2d87b6225c09b24f76aadebd9564b")
    addr = sui_address(pk)
    expected = "0x36ecee250edfad5879e1c98a574650cefc0d9dc69d66102a3aae09023917b17a"
    assert addr == expected, f"address mismatch:\n  got      {addr}\n  expected {expected}"

    print("suibcs selftest: BCS ok, address derivation ok")

if __name__ == "__main__":
    selftest()
