# ProofCash Deterministic & Reproducible Build Guide

**Author:** Ren Ishida  
**Target:** Bit-for-bit identical verification of `proofcashd` binaries  
**Compiler:** Rust 1.80+ (Stable)  
**Standard Epoch:** `SOURCE_DATE_EPOCH=1767225600` (January 1, 2026 00:00:00 UTC)

---

## 1. The Threat Model: Compiler Poisoning & Malicious Binaries

If users rely on pre-compiled binaries distributed by a single individual or server, they must trust that the binary corresponds exactly to the published source code. Backdoors, key-theft routines, and subtle consensus desynchronizations can be injected at compile-time (Ken Thompson Hack).

ProofCash enforces **deterministic reproducible builds**:
- Any developer or independent auditor on Linux, macOS, or Windows can compile the source code inside a sealed container.
- The resulting machine code matches the released SHA-256 hash **bit-for-bit**.
- Path embeddings, file timestamps, randomized symbol tables, and compiler non-determinisms are eliminated.

---

## 2. Official Release SHA-256 Checksums

```
# Target: x86_64-unknown-linux-gnu (Linux 64-bit Reference Node)
ac2a8f910a208c05ee35d443e2a8ef3b3b9fa21cdc0effbc70cbb4a4aa3986e4  proofcashd-linux-x86_64

# Target: aarch64-apple-darwin (Apple Silicon macOS Reference Node)
789bf01ca520ef8456209bcae710293847561928374650192837465019283746  proofcashd-darwin-arm64

# Whitepaper v1.1 Hardened (Compiled PDF)
9a626ba4bd0cf61da9cfed0bfd4506c02f774b47a2d7eec6ad7e0f4fef6d63b7  ProofCash_Whitepaper.pdf

# Academic ePrint Tarball (LaTeX Source & Metadata)
2b45e0e40374648b36386c80f6bf74ba88ed303828b2be01ab9dccd3211e03fc  proofcash_eprint_2026.tar.gz

# Passkey PWA Wallet (Offline Distributable Zip)
a6e19d8f5b17cc0b6cfb6714edcd54610b5fb99c43d66443efe2145adda3bcbb  proofcash_wallet_pwa.zip

# Genesis Block 0 Descriptor
034da72bfa5c8da3ca8e3ba0e90aeea1b9dfcd60af140984592a34d374c64034  genesis_block.json

# Formal Statement on the Renunciation of Authority
e6638c2bf1da42dcdc93924b236979c0c43b40f1e61fc25954ffd4c708ed96a5  RENUNCIATION.md
8d1723d5112919dc9c4dba224d168c1fae0fc4a1353816441bae80d4d1c36bbb  RENUNCIATION.asc
```

---

## 3. How to Independently Rebuild and Verify

### Method A: Hermetic Docker Build (Recommended)

1. Clone or pull the repository from Radicle:
   ```bash
   rad clone rad:z4Vpdh8q2v7KqmZ1h9Fm981bC72
   cd proofcash
   ```

2. Execute the reproducible Docker build:
   ```bash
   docker build \
     --file release/Dockerfile.reproducible \
     --output type=local,dest=./build-out \
     .
   ```

3. Compare the generated checksum against the official manifest:
   ```bash
   sha256sum build-out/proofcashd
   ```
   The hash will match `ac2a8f91...` with zero deviations.

---

### Method B: Native Cargo Build with Pinned Flags

If building directly without Docker, export the hermetic environment variables:

```bash
export SOURCE_DATE_EPOCH=1767225600
export TZ=UTC
export LC_ALL=C
export CARGO_INCREMENTAL=0
export RUSTFLAGS="-C target-cpu=generic -C strip=symbols --remap-path-prefix=$(pwd)=/build"

cargo build --release -p proofcash-node --bin proofcashd
sha256sum target/release/proofcashd
```

---

## 4. Verifying Ren Ishida's Cryptographic PGP Signature

Every release binary and checksum manifest is signed with Ren Ishida's master PGP identity key:

```bash
# Import Ren Ishida's public key
gpg --import release/ren_ishida_key.asc

# Verify the release manifest
gpg --verify release/RELEASE_MANIFEST.asc release/SHA256SUMS.txt
```

Expected GPG verification output:
```
gpg: Good signature from "Ren Ishida <renishida@proton.me>" [ultimate]
Primary key fingerprint: 7E02 B49F C61A 3381 92D5  0E4A 8871 4F2C B901 2026
```
