# ProofCash Protocol — Mainnet Transition Roadmap & Master Action Plan
**From Testnet Prototype to Fully Autonomous Zero-Knowledge Layer-1**  
*Author: Core Engineering & Security Council | Ren Ishida (2026)*  
*Document Version: 1.0 (Confidential Internal Architecture Document)*

---

## Executive Overview & Architectural Philosophy

This roadmap formalizes the three-stage transition plan to launch **ProofCash (PCASH)** from its current browser-based testnet prototype into an autonomous, mathematically immutable Layer-1 zero-knowledge currency.

### Why Not an Immediate Open Mainnet?
Launching a real-money zero-knowledge currency without a hardened native node network and external cryptographic audit invites catastrophic economic failure:
1. **Circuit Soundness Risk:** A single under-constrained variable in the Plonky3 AIR STARK circuits allows bad actors to mint counterfeit coins or double-spend shielded eUTXOs.
2. **Botnet Sybil Flooding:** Without calibrated Proof of Sampling Work (PoSW) difficulty and hardware attestation, datacenter botnets would monopolize >90% of the coin supply within 48 hours.
3. **P2P Consensus Hardening:** Client browsers cannot replace a distributed quorum of native validator daemons running on independent physical nodes.

### Why a "Guarded Pioneer Mainnet" Instead of a "Secret Hidden Mainnet"?
Hiding the mainnet code or keeping access secret creates severe reputational and legal risks:
* In decentralized finance, "security through obscurity" creates suspicion of insider pre-mining, secret developer allocations, and central backdoors.
* The industry standard—pioneered by **Ethereum (Frontier/Homestead), Arbitrum, Optimism, Solana, and Polygon zkEVM**—is a **Public Guarded Mainnet Beta**:
  - The code and ledger are 100% public, verifiable, and open source.
  - Hard economic guardrails (deposit caps, max transaction value limits, whitelisted initial validator quorums) prevent systemic risk during the calibration phase.
  - The guardrails are progressively relaxed and permanently removed once network stability is proven.

```
       MONTHS 1 - 3                       MONTHS 4 - 9                      MONTHS 10 - 12
 ┌──────────────────────┐           ┌──────────────────────┐           ┌──────────────────────┐
 │       STAGE 1        │           │       STAGE 2        │           │       STAGE 3        │
 │  Incentivized        │  ──────►  │  Guarded Pioneer     │  ──────►  │  Full Autonomous     │
 │  Chaosnet Testnet    │           │  Mainnet Beta        │           │  Public Mainnet      │
 └──────────────────────┘           └──────────────────────┘           └──────────────────────┘
   • Simulated tokens                 • Real Genesis Block #0            • Zero transaction caps
   • $250k Bug Bounty                 • Economic value caps              • Permissionless mining
   • Attack & Stress tests            • 25-50 Pioneer nodes              • Admin key renunciation
   • libp2p Rust node setup           • Gradual cap escalation           • Global immutable ledger
```

---

## Transition Gate Criteria (Exit / Entry Milestones)

Advancement between stages requires satisfying strict quantitative gates:

### Gate 1: Stage 1 ➔ Stage 2 (Testnet ➔ Guarded Mainnet)
* [ ] Zero unresolved Critical or High vulnerabilities across all ZK circuits and passkey enclaves.
* [ ] Minimum of 30 independent physical native validator nodes operating on `testnet` with 99.9% uptime over 30 consecutive days.
* [ ] Automated botnet stress simulation successfully resisted: Mobile PoSW difficulty algorithm dynamic response time < 3 blocks under 1,000x hashrate surge.
* [ ] Successful completion of the 8-week public security bug bounty program with all reported findings mitigated.
* [ ] Clean execution of 5 simulated network split (Byzantine split) re-org drills with zero double-spends.

### Gate 2: Stage 2 ➔ Stage 3 (Guarded Beta ➔ Autonomous Mainnet)
* [ ] Zero state-reversions or emergency circuit freezes during the entire 24-week Guarded Beta period.
* [ ] Over 100,000 transactions settled with 100% zero-knowledge proof verification success.
* [ ] Over 250 active independent node operators across at least 25 countries.
* [ ] Formal completion and publication of two independent third-party cryptographic audits.
* [ ] Safe execution of all value-cap escalation phases ($100 ➔ $1,000 ➔ $10,000 ➔ Uncapped) without invariant deviations.

---

# STAGE 1: Public Incentivized Chaosnet
**Duration:** Weeks 1 – 12 (Months 1 – 3)  
**Primary Focus:** Protocol Hardening, Node Daemon Distribution, Sybil Resistance, and Red-Teaming.  
**Token Status:** Testnet simulated coins (Zero fiat value).

---

### Weeks 1 – 2: Native Node Daemon Packaging & Validator Bootstrap
* **Core Deliverables:**
  * Package the native Rust/C++ Layer-1 daemon (`proofcashd`) with pre-compiled binaries for Ubuntu 22.04/24.04, Debian 12, macOS (ARM64), and Windows Server.
  * Implement native `libp2p` gossipsub network protocol to replace browser WebSocket relays for node-to-node block propagation.
  * Deploy 15 seed bootstrap nodes across North America, Europe, East Asia, and South America on diverse hosting providers (AWS, Hetzner, OVH, Equinix Metal).
* **Weekly Checklist:**
  * [ ] Finalize CLI interface: `proofcashd --datadir=/var/lib/proofcash --rpc-port=8332 --p2p-port=9333`.
  * [ ] Provide 1-line Docker setup: `docker run -d -p 9333:9333 -p 8332:8332 proofcash/node:testnet`.
  * [ ] Verify block header sync speed: < 2 seconds for fresh nodes synchronizing 100,000 historical headers.

---

### Weeks 3 – 4: Plonky3 AIR Circuit Constraint Hardening
* **Core Deliverables:**
  * Formalize algebraic intermediate representation (AIR) constraints for:
    1. Nullifier derivation from Goldilocks field secret scalars.
    2. Range checks on eUTXO amounts ($0 \le \Delta \le 2^{64}-1$).
    3. BabyJubjub Edwards curve signature validity inside the circuit.
  * Implement GPU-accelerated STARK prover (Metal for Apple Silicon, CUDA for NVIDIA) to benchmark proof generation speed on commodity hardware.
* **Weekly Checklist:**
  * [ ] Execute circuit fuzzing using automated SAT solvers to test for under-constrained polynomials.
  * [ ] Benchmark proof generation: Browser WebAssembly < 150 ms; Native CPU < 25 ms; Native GPU < 5 ms.
  * [ ] Verify proof succinctness: STARK proof size verified strictly below 45 KB.

---

### Weeks 5 – 6: Proof of Sampling Work (PoSW) Difficulty & Botnet Resistance
* **Core Deliverables:**
  * Implement the continuous PID (Proportional-Integral-Derivative) difficulty controller to stabilize block times at exactly 60 seconds regardless of total hashrate swings.
  * Implement memory-hard sampling challenges in the WebWorker miner to penalize CPU-only headless server farms and favor consumer devices with low latency cache/RAM.
  * Implement mobile device thermal throttling safety in [`wallet/wallet-engine.js`](file:///c:/xampp/htdocs/2026/wallet/wallet-engine.js) to prevent battery degradation on phones.
* **Weekly Checklist:**
  * [ ] Launch simulated botnet attack (100 cloud instances hashing simultaneously) and measure difficulty adjustment response time.
  * [ ] Ensure mobile battery drain remains < 3% per hour on standard mining profile.
  * [ ] Verify fair distribution across commodity hardware vs datacenter virtual machines.

---

### Weeks 7 – 8: Public Bug Bounty Launch & Immunefi Security Program
* **Core Deliverables:**
  * Launch public **ProofCash Chaosnet Bug Bounty** with tiered rewards:
    * **Critical (Double-spend, counterfeit minting, key theft):** $100,000 USD / Bounty pool allocation.
    * **High (Consensus split, remote node crash, unhandled circuit panic):** $25,000 USD.
    * **Medium (RPC denial of service, memory leak, sync stall):** $5,000 USD.
  * Publish full formal specifications of the State Transition Function, MMR accumulators, and enclave delegation protocols in `docs/spec/`.
* **Weekly Checklist:**
  * [ ] Set up dedicated vulnerability disclosure email and PGP encryption key (`security@proofcash.org`).
  * [ ] Invite top zero-knowledge audit firms and whitehat teams to audit Plonky3 AIR constraints.
  * [ ] Review, triage, and patch incoming vulnerability reports within 48-hour SLA.

---

### Weeks 9 – 10: High-Throughput Stress Testing & Network Partition Drills
* **Core Deliverables:**
  * Run **Chaos Drill 1: Transaction Storm:** Flood the testnet mempool with 10,000 concurrent shielded transactions per minute to evaluate fee burn and mempool eviction.
  * Run **Chaos Drill 2: Network Split Simulation:** Artificially isolate the European and Asian nodes for 30 minutes, generate competing chain tips, and verify that the chain cleanly converges on the highest MMR weight upon reconnection without double-spending.
* **Weekly Checklist:**
  * [ ] Measure peak transaction throughput: Target sustained > 1,500 shielded TPS.
  * [ ] Confirm that 50% PID fee burn executes accurately in all stress blocks.
  * [ ] Confirm that in-flight eUTXO vouchers survive partition events and settle upon node convergence.

---

### Weeks 11 – 12: Stage 1 Retrospective & Stage 2 Transition Readiness Gate
* **Core Deliverables:**
  * Formal audit sign-off report reviewing all patches applied during Chaosnet.
  * Selection and onboarding of the **50 Pioneer Cohort Validators** for Stage 2.
  * Production freeze of the Genesis Block parameters (block hash, headline timestamp, difficulty baseline).
* **Weekly Checklist:**
  * [ ] Verify all Gate 1 criteria have passed.
  * [ ] Distribute the Stage 2 Guarded Mainnet node binaries to the 50 Pioneer operators.
  * [ ] Publish public announcement of the Pioneer Mainnet launch date and economic safety terms.

---

# STAGE 2: Guarded Pioneer Mainnet Beta
**Duration:** Weeks 13 – 36 (Months 4 – 9)  
**Primary Focus:** Production Genesis, Guarded Value Caps, Pioneer Node Consensus, and Real-World Telemetry.  
**Token Status:** Real Production PCASH Tokens (Subject to strict protocol guardrails).

---

### Weeks 13 – 14: Canonical Genesis Block #0 & Pioneer Validator Launch
* **Core Deliverables:**
  * Mine the **Canonical Genesis Block #0** using real thermodynamic entropy and a verifiable headline timestamp:
    * `Headline: "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids"`
    * `Pre-mine: 0.0000 PCASH (100% fair launch, zero founder allocation)`.
  * Pioneer validators establish cryptographic consensus on Genesis Block #0.
  * Release official PWA update pointing wallet and explorer to Mainnet Beta RPC endpoints.
* **Weekly Checklist:**
  * [ ] Verify Genesis block hash consistency across all 50 Pioneer nodes worldwide.
  * [ ] Confirm explorer displays live Mainnet Tip Height starting at #0 with zero pre-mine balance.
  * [ ] Verify that passkey enclaves generate native Mainnet-tagged session certificates.

---

### Weeks 15 – 16: Economic Guardrails Activation (Tier 1 Caps)
* **Core Deliverables:**
  * Activate protocol-level **Tier 1 Safety Guardrails**:
    * **Maximum per-transaction transfer limit:** 50.0 PCASH (~$50 equivalent).
    * **Maximum wallet vault balance limit:** 500.0 PCASH.
    * **Daily network burn ceiling:** Safety circuit trips if burn rate exceeds 50,000 PCASH/day (indicating runaway spam).
  * Deploy automated invariant monitor bots querying node MMR roots every 10 seconds for anomalies.
* **Weekly Checklist:**
  * [ ] Attempt transactions exceeding 50.0 PCASH; verify rejection by consensus engine with error `ERR_GUARDED_CAP_EXCEEDED`.
  * [ ] Confirm emergency pause mechanism is operational in node software (only actionable by 40-of-50 Pioneer consensus).
  * [ ] Confirm public explorer transparently displays active guardrail limits.

---

### Weeks 17 – 20: Thermodynamic PoSW Telemetry & Energy Anchoring
* **Core Deliverables:**
  * Calibrate the real-world thermodynamic energy coefficient ($E_{\text{block}}$) based on real hardware sensor telemetry submitted with PoSW solutions.
  * Verify that edge mining rewards follow the continuous exponential decay formula:
    $$R(b) = 100 \cdot e^{-10^{-7} \cdot b}$$
  * Verify that block rewards distribute fairly across edge smartphones, laptops, and low-power Raspberry Pi edge servers.
* **Weekly Checklist:**
  * [ ] Confirm subsidy smoothly decays from 98.96 PCASH down through subsequent block intervals without discrete halving shocks.
  * [ ] Review miner address distribution to ensure no single entity controls > 10% of block creation.
  * [ ] Publish weekly Network Health & Energy Verifiability Reports.

---

### Weeks 21 – 24: Mobile Edge Mining Scale-up & Safe Consumer Onboarding
* **Core Deliverables:**
  * Enable public consumer onboarding into the Guarded Mainnet via the PWA wallet.
  * Expand validator cohort from 50 to 100 independent nodes (adding universities, open-source DAOs, and infrastructure providers).
  * Introduce hardware health safety monitor in the mobile client (suspends hashing when device battery drops below 20% or thermal sensor reaches 42°C).
* **Weekly Checklist:**
  * [ ] Track PWA installation and active mining sessions: Target > 5,000 active mobile miners.
  * [ ] Monitor memory footprint: Wallet PWA background worker strictly < 65 MB RAM.
  * [ ] Zero reported battery swelling or overheating incidents across user fleet.

---

### Weeks 25 – 28: AI Agent Autonomous Streaming Pilot
* **Core Deliverables:**
  * Launch pilot integration for autonomous AI agents paying each other via continuous commutative state deltas.
  * Integrate machine-to-machine streaming payments for API access, compute renting, and decentralized storage.
  * Stress-test high-frequency micro-payments (0.0001 PCASH per second) over shielded channels.
* **Weekly Checklist:**
  * [ ] Validate that micro-transactions settle with zero identity leakage and zero bloat to the Layer-1 state root.
  * [ ] Verify that commutative batching reduces gas/energy fees by > 94% compared to linear transaction settlement.
  * [ ] Publish AI Developer SDK (`@proofcash/agent-sdk`) for Python and Node.js.

---

### Weeks 29 – 32: Guardrail Escalation (Tier 2 & Tier 3 Caps)
* **Core Deliverables:**
  * **Escalation Phase A (Week 29):** Increase per-transaction cap to 500.0 PCASH (~$500).
  * **Escalation Phase B (Week 31):** Increase per-transaction cap to 5,000.0 PCASH (~$5,000); remove wallet maximum balance ceilings.
  * Run full regression tests on node memory pools and recursive proof composition engines under higher economic loads.
* **Weekly Checklist:**
  * [ ] Confirm seamless consensus on cap escalation across all active nodes.
  * [ ] Monitor fee reservoir and permanent burn metrics under increased transaction values.
  * [ ] Confirm that zero invariant bugs or state corruptions occurred.

---

### Weeks 33 – 36: Final Security Audit & Stage 3 Gate Review
* **Core Deliverables:**
  * Commission and complete two comprehensive independent third-party cryptographic audits on all production node code and circuits.
  * Conduct the formal **Gate 2 Transition Review** with the Pioneer Validator Council.
  * Draft the immutable Renunciation Ceremony parameters.
* **Weekly Checklist:**
  * [ ] Publish full unredacted audit reports with 100% remediated findings.
  * [ ] Verify that all Gate 2 criteria have been completely satisfied.
  * [ ] Lock the Stage 3 Genesis Autonomy hardfork block height (e.g. Block #525,600).

---

# STAGE 3: Autonomous Public Mainnet & Protocol Renunciation
**Duration:** Weeks 37 – 52 (Months 10 – 12)  
**Primary Focus:** Complete Decentralization, Zero Guardrails, Protocol Renunciation, and Permanent Global Operations.  
**Token Status:** Fully sovereign, decentralized, uncapped zero-knowledge currency.

---

### Weeks 37 – 40: Removal of Guardrails (Permissionless Autonomy)
* **Core Deliverables:**
  * Trigger the Autonomy Hardfork at the predetermined block height:
    * **Permanently remove all transaction value caps and transfer limits.**
    * **Permanently remove the validator whitelist; node participation is 100% permissionless.**
    * **Permanently disable emergency circuit breakers; the network runs purely on algorithmic consensus.**
  * Enable permissionless block proposals based strictly on thermodynamic PoSW difficulty.
* **Weekly Checklist:**
  * [ ] Verify that all nodes smoothly activate the autonomy hardfork without chain split.
  * [ ] Monitor network hashrate and block propagation times under permissionless conditions.
  * [ ] Verify that transaction throughput scales gracefully without central coordination.

---

### Weeks 41 – 44: Global Multi-Platform Ecosystem Distribution
* **Core Deliverables:**
  * Release native application wrappers for iOS (App Store via WebAuthn API), Android (Google Play Store), macOS, Windows, and Linux.
  * Deploy official open-source block explorer mirrors hosted across IPFS, Arweave, and decentralized pinning services.
  * Publish the definitive ProofCash Protocol Documentation, developer portal, and RPC indexer specifications.
* **Weekly Checklist:**
  * [ ] Ensure mobile apps connect directly to local P2P nodes or decentralized RPC providers.
  * [ ] Verify that wallet PWA remains fully functional offline and independent of any centralized domain.
  * [ ] Publish verified builds with reproducible cryptographic checksums.

---

### Weeks 45 – 48: The Protocol Renunciation Ceremony
* **Core Deliverables:**
  * Execute the immutable **Founder Renunciation Ceremony** as codified in [`release/RENUNCIATION.md`](file:///c:/xampp/htdocs/2026/release/RENUNCIATION.md):
    * Zero administrator keys exist.
    * Zero multi-sig developer backdoors exist.
    * Zero upgrade keys exist in the consensus software.
    * GitHub repository ownership transferred to a multi-organization decentralized archive or renounced.
* **Weekly Checklist:**
  * [ ] Cryptographically prove the destruction of any deployment keys or temporary setup parameters.
  * [ ] Publish signed attestation statements from all 50 Pioneer Council node operators confirming zero central controls remain.
  * [ ] Issue public cryptographic proof of zero pre-mine and zero founder royalty fees.

---

### Weeks 49 – 52: Permanent Decentralized Operation & Retrospective
* **Core Deliverables:**
  * The network marks 1 year of continuous operation with 100% mathematical autonomy.
  * ProofCash functions permanently as a public thermodynamic utility for humanity and autonomous AI agents:
    * Constant $O(1)$ recursive proof state ($< 45\text{ KB}$).
    * Zero seed phrase reliance (100% hardware passkey enclaves).
    * Zero discrete halving shocks (smooth exponential decay to 1.0B max cap).
    * Deflationary stability via 50% permanent burn of transaction fees into the PID reservoir.
* **Weekly Checklist:**
  * [ ] Archive all historical testnet and audit records permanently on decentralized storage.
  * [ ] Confirm independent community developer grants and open-source tooling projects are thriving.
  * [ ] Project transition complete: ProofCash is fully sovereign, immutable, and unstoppable.

---

## Summary Matrix: Stage Comparison

| Dimension | Stage 1: Chaosnet | Stage 2: Guarded Pioneer | Stage 3: Autonomous Mainnet |
| :--- | :--- | :--- | :--- |
| **Duration** | Weeks 1–12 (Months 1–3) | Weeks 13–36 (Months 4–9) | Weeks 37–52+ (Months 10–12+) |
| **Token Real Value** | None (Simulated Energy) | Real Value (Guarded) | Real Value (Uncapped) |
| **Transaction Cap** | None (Sandbox) | $50 ➔ $500 ➔ $5,000 | **None (100% Uncapped)** |
| **Genesis Block** | Ephemeral Testnet | **Canonical Block #0** | Continues Canonical Chain |
| **Validators** | Internal + Whitehats | 50–100 Pioneer Nodes | **100% Permissionless** |
| **Admin Controls** | Testing Controls | Emergency 40/50 Threshold | **0% (100% Renounced)** |
| **Audits** | Red-team & Bug Bounty | 2 Independent Audits | Continuous Community Review |
| **End State** | Readiness for Genesis | Scaled Economic Pilot | **Permanent Sovereign L1** |

---
*Document Location: [`docs/MAINNET_TRANSITION_ROADMAP.md`](file:///c:/xampp/htdocs/2026/docs/MAINNET_TRANSITION_ROADMAP.md)*  
*Note: Saved locally. NOT committed or pushed to remote repository as instructed.*
