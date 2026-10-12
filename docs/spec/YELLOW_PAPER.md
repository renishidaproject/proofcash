# ProofCash Protocol — Formal Yellow Paper Specification
**The Mathematical and Cryptographic Specification of the ProofCash Layer-1 Autonomous Settlement Protocol**  
*Document Version: 1.0 (Formal Canonical Specification)*  
*Author: Ren Ishida (October 2026)*

---

## 1. Mathematical Foundations & Prime Fields

### 1.1 The Goldilocks Prime Field $\mathbb{F}_p$
ProofCash executes all arithmetic circuits, Merkle Mountain Range accumulators, and Poseidon2 state transitions over the Goldilocks prime field:
$$\mathbb{F}_p \quad \text{where} \quad p = 2^{64} - 2^{32} + 1 = 18{,}446{,}744{,}069{,}414{,}584{,}321$$

#### Field Invariants:
* Fast modular reduction: Since $2^{64} \equiv 2^{32} - 1 \pmod p$, reduction of an unsigned 128-bit product requires only bitwise shifts, additions, and subtractions without division instructions.
* Two-adicity: $p - 1 = 2^{32} \cdot 3 \cdot 5 \cdot 17 \cdot 257 \cdot 65537$, granting a multiplicative subgroup of order $2^{32}$, facilitating fast Number Theoretic Transforms (NTT) for Plonky3 STARK proving.

### 1.2 The BabyJubjub Twisted Edwards Curve
In-circuit ephemeral spend authorizations use the twisted Edwards curve birationally equivalent to Montgomery Curve-25519:
$$a \cdot x^2 + y^2 = 1 + d \cdot x^2 \cdot y^2$$
* Base field order: $q = 21888242871839275222246405745257275088548364400416034343698204186575808495617$
* Subgroup order $r$: Prime order scalar field with embedding degree suitable for zero non-native field simulation penalties.
* Identity element: $\mathcal{O} = (0, 1)$

### 1.3 The Poseidon2 Algebraic Sponge Permutation
Poseidon2 operates with width $t = 4$ state elements in $\mathbb{F}_p^4$:
* **S-box:** $S(x) = x^7 \pmod p$
* **Round structure:** 8 full rounds ($R_F = 8$), 56 partial rounds ($R_P = 56$).
* **Linear Layer:** Maximum Distance Separable (MDS) circulant matrix multiplication $M \in \mathbb{F}_p^{4 \times 4}$.

---

## 2. Commutative Delta-UTXO Monoid Algebra

State execution bypasses account-based sequential locks by formalizing state transitions as an associative commutative monoid:
$$\mathcal{M} = (\Delta, \oplus, \mathbf{0})$$

### 2.1 Delta State Representation
Each transaction delta $\delta \in \Delta$ is a tuple:
$$\delta = \langle \Delta_{\text{pJ}}, \nu_{\text{nullifier}}, \sigma_{\text{nonce}} \rangle$$
* $\Delta_{\text{pJ}} \in [-10^{21}, 10^{21}]$: Net Pico-Joules state shift ($1\text{ PCASH} = 10^{12}\text{ pJ}$).
* $\nu_{\text{nullifier}} \in \{0, 1\}^{256} \cup \{\bot\}$: Spent eUTXO nullifier.
* $\sigma_{\text{nonce}} \in \mathbb{N}$: Monotonically increasing account epoch nonce.

### 2.2 Associative Reduction Law
For any three transaction state deltas $\delta_1, \delta_2, \delta_3 \in \Delta$:
$$(\delta_1 \oplus \delta_2) \oplus \delta_3 = \delta_1 \oplus (\delta_2 \oplus \delta_3)$$
$$\delta \oplus \mathbf{0} = \delta$$

Because the monoid operation is strictly associative, validator cores reduce $N$ transactions in parallel over a balanced binary reduction tree in:
$$T_{\text{reduction}} = \mathcal{O}(\log_2 N) \quad \text{time}$$

---

## 3. Canonical Binary Wire Serialization Formats

All data structures serialize in deterministic, bit-for-bit canonical little-endian byte ordering without dynamic padding.

### 3.1 BlockHeader (Exact Size: 136 Bytes)
```
+---------------+--------------+-------------------------------------------------+
| Field Offset  | Type         | Description                                     |
+---------------+--------------+-------------------------------------------------+
| 0x00 - 0x03   | u32          | Protocol Version (e.g., 0x00000001)             |
| 0x04 - 0x0B   | u64          | Block Height b (Genesis = 0)                    |
| 0x0C - 0x2B   | [u8; 32]     | Previous Block Header Hash (Blake3)             |
| 0x2C - 0x4B   | [u8; 32]     | Commutative State Delta Root (Poseidon2)        |
| 0x4C - 0x6B   | [u8; 32]     | Merkle Mountain Range (MMR) Accumulator Root    |
| 0x6C - 0x73   | u64          | PoSW Nonce Solution                             |
| 0x74 - 0x7B   | u64          | POSIX Timestamp (UTC Seconds)                   |
| 0x7C - 0x83   | u64          | PID Thermodynamic Difficulty Target             |
| 0x84 - 0x87   | u32          | Cumulative Transaction Count                    |
+---------------+--------------+-------------------------------------------------+
Total Size: 136 Bytes (0x88)
```

### 3.2 Shielded Transaction Wire Format
```
+---------------+--------------+-------------------------------------------------+
| Field Offset  | Type         | Description                                     |
+---------------+--------------+-------------------------------------------------+
| 0x00 - 0x1F   | [u8; 32]     | Spend Nullifier N = Poseidon2(sk, leaf_idx)     |
| 0x20 - 0x3F   | [u8; 32]     | Output Commitment C = Poseidon2(vk, amount)     |
| 0x40 - 0x47   | u64          | Fee in Pico-Joules (50% burned / 50% reservoir) |
| 0x48 - 0x67   | [u8; 32]     | Ephemeral BabyJubjub Session Public Key         |
| 0x68 - 0x87   | [u8; 32]     | Enclave Delegation Certificate Hash             |
| 0x88 - 0xAF   | [u8; 40]     | BabyJubjub In-Circuit Schnorr Signature (R, s)  |
| 0xB0 - 0x1B7  | [u8; 264]    | Plonky3 AIR STARK Proof (FRI Leaf Fold)         |
+---------------+--------------+-------------------------------------------------+
```

---

## 4. Consensus & Thermodynamic Economics

### 4.1 Proof of Sampling Work (PoSW)
Block mining solves an asymmetric verification problem that combines Blake3 hashing with memory-hard matrix sampling:
$$H_{\text{PoSW}}(B, \text{nonce}) = \text{Blake3}\left( B \parallel \text{nonce} \parallel \mathcal{S}_{\text{RAM}}(B, \text{nonce}) \right) < \frac{2^{256}}{D(b)}$$

Where:
* $B$ is the 136-byte BlockHeader preimage.
* $\mathcal{S}_{\text{RAM}}$ is a pseudo-random 4 MB cache sampling stride designed to equalize consumer phones and servers.
* $D(b)$ is the active thermodynamic difficulty.

### 4.2 Continuous Exponential Decay Subsidy Law
Block subsidies do not jump at 4-year halving cliffs. Instead, block reward $R(b)$ decays continuously per block:
$$R(b) = R_0 \cdot e^{-\lambda \cdot b}$$
* Initial Genesis Subsidy: $R_0 = 100\text{ PCASH} = 10^{14}\text{ pJ}$
* Decay Constant: $\lambda = 10^{-7} \approx 0.0000001$ per block

#### Total Supply Cap Mathematical Proof:
$$\text{Max Supply} = \int_{0}^{\infty} R_0 \cdot e^{-\lambda \cdot b} \, db = \left[ -\frac{R_0}{\lambda} \cdot e^{-\lambda \cdot b} \right]_0^{\infty} = 0 - \left( -\frac{100}{10^{-7}} \right) = \frac{100}{10^{-7}} = 1{,}000{,}000{,}000\text{ PCASH}$$
$$\text{Max Supply (pico-Joules)} = 10^{9} \times 10^{12} = 10^{21}\text{ pJ}$$

### 4.3 The Proportional-Integral-Derivative (PID) Difficulty Controller
Difficulty retargets every block $b$ to maintain a 600-second target block interval ($\tau = 600\text{s}$):
$$e(b) = \Delta t(b) - \tau$$
$$\ln D(b+1) = \ln D(b) - \left( K_P \cdot e(b) + K_I \sum_{k=b-144}^{b} e(k) + K_D \cdot (e(b) - e(b-1)) \right)$$
* $K_P = 1.2 \times 10^{-4}$ (Proportional Gain)
* $K_I = 3.5 \times 10^{-6}$ (Integral Gain: Dampens macro hashrate migration)
* $K_D = 8.0 \times 10^{-5}$ (Derivative Gain: Dampens sudden botnet bursts)

### 4.4 Deflationary 50% Fee Burn Mechanism
Every transaction fee $F$ is divided by the consensus state transition engine:
$$F_{\text{burned}} = \lfloor 0.5 \cdot F \rfloor \quad \longrightarrow \quad \text{Nullifier } \mathbf{0}_{256} \text{ (Permanently Destroyed)}$$
$$F_{\text{reservoir}} = F - F_{\text{burned}} \quad \longrightarrow \quad \text{On-Chain Thermodynamic PID Buffer}$$

---

## 5. Zero-Knowledge AIR Constraints (Plonky3 STARK)

### 5.1 Two-Tier Enclave Delegation AIR ($1{,}842$ Constraints)
To eliminate the 350,000 non-native constraint penalty of WebAuthn NIST P-256 in ZK, client hardware signs an ephemeral BabyJubjub certificate:
$$\mathcal{C} = \text{Sign}_{\text{Enclave}}\left( \text{"ProofCash\_Delegation\_v1"} \parallel PK_{\text{session}} \parallel b_{\text{expire}} \right)$$

#### In-Circuit Constraints:
1. **Limb Decomposition Expiration Check (64 constraints):**
   $$\Delta_{\text{height}} = b_{\text{expire}} - b_{\text{current}} = \sum_{i=0}^{3} L_i \cdot 2^{16 \cdot i}$$
   $$\forall i \in \{0, 1, 2, 3\}: \quad L_i \in [0, 2^{16}-1]$$
2. **Session Key Non-Identity Check (2 constraints):**
   $$PK_{\text{session}} \neq (0, 1)$$
3. **BabyJubjub Schnorr Signature Verification ($1{,}456$ constraints):**
   $$s \cdot G = R + H(R \parallel PK_{\text{session}} \parallel m) \cdot PK_{\text{session}}$$
4. **Poseidon2 Merkle Path Inclusion ($320$ constraints):**
   Path verification of leaf commitment to accumulator root across 32 levels.

$$\text{Total In-Circuit Cost} = 64 + 2 + 1{,}456 + 320 = 1{,}842\text{ Constraints}$$
$$\text{Proving Time on Apple A17 / Snapdragon 8 Gen 3} < 45\text{ ms}$$

### 5.2 Shielded Value Conservation Law
$$\sum_{j=1}^{m} \text{Input}_j = \sum_{k=1}^{n} \text{Output}_k + F + \Delta_{\text{net}}$$
Any witness producing $\sum \text{Input} \neq \sum \text{Output} + F + \Delta_{\text{net}}$ generates a non-zero quotient polynomial residue $Q(X) \neq 0$, causing immediate mathematical proof rejection.

---

## 6. Formal Verification Theorems (Lean 4)

All fundamental invariants are mechanically proven in the ProofCash Lean 4 formal suite (`proofcash/formal/proofcash-verify/`):

1. **Theorem `no_counterfeit_inflation`:**
   $$\forall (T: \text{Transaction}), \quad \text{sum}(\text{outputs}(T)) + \text{fee}(T) \le \text{sum}(\text{inputs}(T))$$
2. **Theorem `distinct_outputs_distinct_nullifiers`:**
   $$\forall (sk_1, i_1) \neq (sk_2, i_2), \quad \text{Poseidon2}(sk_1, i_1) \neq \text{Poseidon2}(sk_2, i_2)$$
3. **Theorem `delta_monoid_associativity`:**
   $$\forall (\delta_1, \delta_2, \delta_3 \in \Delta), \quad (\delta_1 \oplus \delta_2) \oplus \delta_3 = \delta_1 \oplus (\delta_2 \oplus \delta_3)$$
4. **Theorem `supply_integral_equals_one_billion`:**
   $$\int_0^{\infty} 100 \cdot e^{-10^{-7} \cdot b} \, db = 1{,}000{,}000{,}000\text{ PCASH} = 10^{21}\text{ pJ}$$

---

*This document serves as the canonical mathematical reference for independent auditors, core node developers, and formal theorem verifiers.*
