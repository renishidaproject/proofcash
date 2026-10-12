<div align="center">

# ProofCash (PCASH)

### Autonomous Thermodynamic Settlement Protocol for Humans and Machine Intelligence

[![License: MIT-0](https://img.shields.io/badge/License-MIT--0%20%2F%20Unlicense-blue.svg)](https://opensource.org/licenses/MIT-0)
[![Genesis Block](https://img.shields.io/badge/Genesis_Block-Mined_%230-emerald.svg)](release/genesis_block.json)
[![Formal Proofs](https://img.shields.io/badge/Formal_Verification-Lean_4-purple.svg)](proofcash/formal/proofcash-verify/)
[![ZK Circuits](https://img.shields.io/badge/ZK_AIR-Plonky3_%26_Binius-cyan.svg)](proofcash/crates/proofcash-circuits/)
[![Radicle P2P](https://img.shields.io/badge/Radicle_URN-rad%3AzHqa2hHC...-orange.svg)](release/RADICLE_SEED.md)
[![PWA Wallet](https://img.shields.io/badge/Passkey_Wallet-WebAuthn_PWA-emerald.svg)](wallet/)
[![Public Explorer](https://img.shields.io/badge/Public_Ledger-Block_Explorer-cyan.svg)](explorer/)
[![Release: v1.4](https://img.shields.io/badge/Release-v1.4_Public_Ledger-blue.svg)](https://github.com/Renishidaproject/proofcash/releases/tag/v1.4)

**Author:** Ren Ishida (`renishida@proton.me`)  
**Canonical P2P Radicle URN:** `rad:zHqa2hHCU4ARpLvjQCDNxJdc487F`  
**GitHub Mirror:** [https://github.com/Renishidaproject/proofcash](https://github.com/Renishidaproject/proofcash)  
**Academic Whitepaper:** [PDF Edition](ProofCash_Whitepaper_v1.1.pdf) • [HTML Source](proofcash_whitepaper.html)  
**Latest Version:** **v1.4 (Public Ledger Explorer & In-Browser AIR Verifier)**

</div>

---

## 1. Overview

**ProofCash** is a Layer-1 monetary settlement protocol designed from first principles in October 2026 to resolve the structural crises of early digital cash:

1. **The Autonomous AI Machine Economy:** Autonomous artificial intelligence clusters and software agents cannot hold fractional-reserve bank accounts, pass biometric CAPTCHAs, or wait 10–60 minutes for Layer-1 block confirmations. ProofCash delivers continuous, zero-latency sub-cent micro-payment streaming ($0.000001\text{ PCASH}$ per token) with off-chain energy bonds.
2. **Elimination of Halving Shocks:** Abrupt 4-year halving cliffs destabilize hashrate capital expenditure and leave networks vulnerable to terminal security failure. ProofCash implements a **continuous thermodynamic exponential decay** subsidy ($R(b) = 100 \cdot e^{-10^{-7}b}$), automatically stabilized by an on-chain Proportional-Integral-Derivative (PID) Fee Reservoir and a permanent 50% deflationary fee burn.
3. **MEV-Free Parallel Execution:** Account-based architectures serialize state transitions, inviting predatory Maximal Extractable Value (MEV) frontrunning. ProofCash introduces **Commutative Delta-UTXOs** reducing over an associative monoid tree $(\Delta, \oplus)$ in $\mathcal{O}(\log N)$ parallel time without lock contention.
4. **$O(1)$ State Succinctness (~43.2 KB):** Replaces linear history bloat with recursive STARK validity proofs over binary tower fields ($\mathbb{F}_{2^8}, \mathbb{F}_{2^{64}}$). A fresh node or mobile phone syncs the entire historical chain from Genesis in under $10\text{ ms}$.
5. **Seed-Phrase-Free Biometric Security:** Traditional 24-word seed phrases written on paper create catastrophic user loss. ProofCash uses **Two-Tier Enclave Delegation**: native hardware platform biometrics (WebAuthn NIST P-256) sign an ephemeral BabyJubjub in-circuit session key at an evaluation cost of only $1{,}842$ constraints ($<45\text{ ms}$ on mobile, bypassing the $350{,}000$ non-native P-256 ZK penalty).

---

## 2. Core Protocol Parameters

| Parameter | Value | Description |
| :--- | :--- | :--- |
| **Native Ticker** | `PCASH` | Native unit of settlement |
| **Base Integer Unit** | *Pico-Joule* (`pJ`) | $1\text{ PCASH} = 10^{12}\text{ pico-Joules}$ |
| **Total Supply Cap** | **$1,000,000,000\text{ PCASH}$** | Asymptotic ceiling: $10^{21}\text{ pJ}$ |
| **Genesis Pre-Mine** | **0.0000 PCASH** | 100% burned to nullifier `0x00...00` |
| **Genesis Block Hash** | `0xef77394f...` | Mined on laptop with PoSW Nonce `7,111` |
| **Genesis Headline** | *"Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids"* | Canonical real-world timestamp |
| **Block Target Time** | 600 seconds (10 min) | PID retargeted thermodynamic difficulty |
| **Recursive Proof Size** | $\approx 43.2\text{ KB}$ | Constant $\mathcal{O}(1)$ state verification proof |
| **In-Circuit Spend Budget** | $1,842\text{ constraints}$ | Two-Tier Delegation + Schnorr Spend |
| **GPU Prover Memory** | $< 12\text{ GB}$ VRAM | Binius Fast Walsh-Hadamard Transform (RTX 3060/4070) |

---

## 3. Architecture & Repository Layout

```
proofcash/
├── proofcash/                  # Core Rust Consensus & Cryptography (7 crates)
│   ├── crates/
│   │   ├── proofcash-crypto/   # Blake3 PoSW, Goldilocks Poseidon2, BabyJubjub, P-256
│   │   ├── proofcash-core/     # BlockHeader, eUTXO, Delta-UTXO, MMR Accumulator
│   │   ├── proofcash-circuits/ # Plonky3/Binius AIR (Two-Tier Delegation, FRI Folding)
│   │   ├── proofcash-engine/   # Commutative Monoid Reducer & PID Fee Reservoir
│   │   ├── proofcash-storage/  # Nullifier Bloom Filter, Merkle Mountain Range DB
│   │   ├── proofcash-node/     # proofcashd daemon: P2P, PoSW miner, JSON-RPC
│   │   └── proofcash-prover/   # Binius binary tower field prover (F_2^8), FWHT GPU pipeline
│   └── formal/
│       └── proofcash-verify/   # Formal verification suite in Lean 4
│
├── agent_proofcash/            # Zero-dependency Python SDK for AI Agent streaming
├── chaosnet/                   # 5-node adversarial cluster testbed (partition & reorg recovery)
├── wallet/                     # WebAuthn Biometric Passkey Wallet (Offline PWA + Edge Miner)
├── explorer/                   # Public Ledger Block Explorer & In-Browser AIR Verifier
├── release/                    # Signed release manifest, Radicle configs, reproducible builds
├── proofcash_sim/              # Regression suites & Genesis ceremony miner
├── index.html                  # Interactive Consensus & Protocol Explorer
├── proofcash_whitepaper.html   # Academic Whitepaper Source
└── ProofCash_Whitepaper_v1.1.pdf # Compiled Publication-Ready PDF (6 pages)
```

---

## 4. Quickstart Guide

### A. Run Regression & Verification Suites
Verify formal proofs, circuits, memory bounds, and adversarial chaosnet resilience:

```bash
# Formal verification theorems (Lean 4)
python proofcash_sim/verify_formal.py

# Zero-knowledge circuits & Plonky3 AIR constraints
python proofcash_sim/verify_circuits.py

# Commutative Delta-UTXO monoids & PID fee reservoir
python proofcash_sim/verify_engine.py

# Binius GPU prover memory ceiling (< 12 GB VRAM)
python proofcash_sim/verify_prover.py

# Chaosnet 5-node partition & Nakamoto reorg recovery
python proofcash_sim/verify_node.py

# WebAuthn Passkey Wallet & Mobile Edge Miner
python proofcash_sim/verify_wallet.py

# Bit-for-bit SHA-256 checksums & quarantine audit
python proofcash_sim/verify_release.py
```

---

### B. Autonomous AI Agent Sub-Cent Streaming (Python SDK)

Interact with ProofCash payment channels from an autonomous AI agent or inference pipeline:

```python
from agent_proofcash import ProofCashAgent, StreamChannel

# Initialize client with ephemeral session key
agent = ProofCashAgent(rpc_url="http://127.0.0.1:8332")

# Open high-velocity off-chain inference channel (0.000001 PCASH / token)
channel = agent.open_streaming_channel(
    target_agent_uri="agent://deepseek-v3.inference.cluster.pcash",
    energy_bond_pj=10_000_000_000 # 10,000 pJ bonded
)

# Stream inference tokens with real-time settlement
for token in generate_llm_stream():
    channel.tick_token(rate_pcash="0.000001")

# Close and settle final net delta to Layer-1
channel.settle()
```

---

### C. WebAuthn Passkey Wallet & Mobile Edge Miner

Open `wallet/index.html` in Safari (iOS) or Chrome (Android/Desktop) or install as a standalone PWA:
1. **Biometric Enclave Authentication:** Authorize an in-circuit BabyJubjub session key in $<45\text{ ms}$.
2. **Mobile Edge Miner:** One-tap PoSW mining directly in the browser via multi-threaded Web Workers. Includes thermal duty-cycle throttling (*Eco*, *Standard*, and *Nightstand Charger* modes).
3. **Consensus Switcher:** Seamlessly toggle between Testnet simulation (Height `#104,281`) and Mainnet Genesis anchor (Block `#0`).

---

### D. Public Ledger Explorer & In-Browser AIR Verifier

Open `explorer/index.html` to audit chain state, live block streams, and cryptographic invariants without trusted intermediaries:
1. **Live PoSW Block & Subsidy Stream:** Real-time visualization of block propagation, difficulty, and continuous exponential decay rewards ($R(b) = 100 \cdot e^{-10^{-7}b}$).
2. **Shielded Delta-UTXO Ledger:** Searchable feed of spend transactions showing Blake3 nullifiers, Goldilocks Poseidon2 commitments, and burned thermodynamic fees (preserving total privacy while proving conservation of energy).
3. **Client-Side Plonky3 AIR Verifier:** Run the mathematical polynomial verification in-browser, validating all $1{,}842$ AIR constraints with 0 residuals.
4. **Canonical Genesis #0 Audit:** Invariant verification card displaying proof receipts of the 100% burned pre-mine ($0.0000\text{ PCASH}$) and real-world timestamp headline.

---

## 5. Peer-to-Peer Sovereign Distribution (Radicle)

While mirrored on public code platforms for accessibility, the primary, sovereign code repository is hosted peer-to-peer on **Radicle**:

```bash
# Clone directly over P2P gossip
rad clone rad:zHqa2hHCU4ARpLvjQCDNxJdc487F
```

**Active Distributed Seed Mesh:**
- `iris.radicle.network:8776` (Radicle Bootstrap Seed)
- `rosa.radicle.network:8776` (Radicle Bootstrap Seed)
- `seed.proofcash.xyz:8776` (Primary Community Seed)

---

## 6. Operational & Implementation Guides

Comprehensive reference guides for operators, miners, and community contributors:

* 📖 [**Mining & Account Recovery Guide**](docs/MINING_AND_RECOVERY_GUIDE.md): Detailed walkthroughs for Mobile Edge Mining, CPU Reference Mining, GPU Prover Rigs, AI Agent Streaming, and the 4 biometric passkey account recovery mechanisms (Zero seed phrases).
* 🌐 [**Official Domain Setup & Integration Guide**](docs/DOMAIN_INTEGRATION_GUIDE.md): Complete deployment blueprint for `proofcash.xyz`, including DNS records, GitHub Pages SSL binding, WebAuthn Relying Party domain security, P2P seed nodes (`seed.proofcash.xyz`), and high-speed JSON-RPC gateways (`rpc.proofcash.xyz`).

---

## 7. Deterministic Reproducible Builds

Verify the bit-for-bit SHA-256 hash of the release binaries using the hermetic container:

```bash
docker build \
  --file release/Dockerfile.reproducible \
  --output type=local,dest=./build-out \
  .

sha256sum build-out/proofcashd
```

Verify Ren Ishida's master PGP signature against the official manifest:
```bash
gpg --import release/ren_ishida_key.asc
gpg --verify release/RELEASE_MANIFEST.asc release/SHA256SUMS.txt
```

Expected output:
```
gpg: Good signature from "Ren Ishida <renishida@proton.me>" [ultimate]
Primary key fingerprint: 7E02 B49F C61A 3381 92D5  0E4A 8871 4F2C B901 2026
```

---

## 8. Renunciation of Authority

On October 9, 2026, the creator **Ren Ishida** permanently stepped away from the project:
* **Zero Pre-Mine:** 100% of Genesis Block 0 reward is burned to nullifier `0x00...00`.
* **Zero Admin Keys:** There are no developer multi-sigs, emergency pause switches, or upgrade backdoors in `proofcashd`.
* **Zero Foundations:** No corporate foundation, legal entity, or trademark exists.

Read the signed farewell statement: [`release/RENUNCIATION.md`](release/RENUNCIATION.md).

> *"Verify, do not trust. Run your own nodes."* — Ren Ishida

---

## 9. License

Dedicated to the public domain under the [Unlicense / MIT-0](https://opensource.org/licenses/MIT-0). Use, modify, verify, and run without restriction.
