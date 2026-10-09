# ProofCash: Decentralized P2P Code Distribution via Radicle

**Protocol Identifier (URN):** `rad:zHqa2hHCU4ARpLvjQCDNxJdc487F`  
**Author Identity (DID):** `did:key:z6MkhAHXtijQunmSBsEfXNYGHLQLYswHq6DGsZ4dSHDmjVrR`  
**Node ID:** `z6MkhAHXtijQunmSBsEfXNYGHLQLYswHq6DGsZ4dSHDmjVrR`  
**Author:** Ren Ishida (`renishida@proton.me`)  
**Release Date:** October 2026  
**License:** MIT-0 / Unlicense (Public Domain Dedication)

---

## 1. Why Radicle? (Immunity from Code Host Censorship)

Centralized code hosting platforms (GitHub, GitLab) are single points of regulatory failure and censorship:
- They can unilaterally seize repositories, delete code, ban developer accounts, and enforce jurisdiction-specific sanctions.
- They require corporate user accounts and phone numbers.

ProofCash uses **Radicle**, a sovereign, peer-to-peer code collaboration network built on Git and cryptographic gossip:
- Repositories are replicated across a decentralized peer-to-peer mesh.
- Repository state is cryptographically signed by maintainer cryptographic identity keys.
- Anyone can seed, track, fork, and propose patches without asking permission from any server or platform.

---

## 2. Public Seed Nodes

The reference implementation and formal verification suites are continuously seeded across the Radicle peer-to-peer network:
- Bootstrap Seeds: `iris.radicle.network:8776`, `rosa.radicle.network:8776`
- Radicle Web App: `https://app.radicle.xyz/nodes/iris.radicle.network/rad:zHqa2hHCU4ARpLvjQCDNxJdc487F`

---

## 3. Cloning and Replicating the Repository

### Prerequisites
Install the Radicle CLI (`rad`):
```bash
curl -sSfL https://radicle.dev/install | sh
rad auth
```

### Clone ProofCash Peer-to-Peer
```bash
# Clone directly from the P2P network using the ProofCash project URN
rad clone rad:zHqa2hHCU4ARpLvjQCDNxJdc487F

# Navigate to codebase
cd proofcash
```

### Track and Seed Locally
To support network decentralization by seeding the repository to peers:
```bash
# Announce seeding to all connected Radicle peers
rad seed rad:zHqa2hHCU4ARpLvjQCDNxJdc487F
rad sync -a
```

---

## 4. Submitting Changes (P2P Patches)

ProofCash accepts patches through cryptographic Radicle patch sets:
```bash
# Create feature branch
git checkout -b feature/kernel-optimization

# Commit changes with GPG/SSH signature
git commit -S -m "circuits: optimize Goldilocks Poseidon2 unrolled rounds"

# Publish patch proposal directly to the P2P network
rad patch open --title "Optimize Goldilocks Poseidon2" --description "Reduces FRI recursive verifier cycle count by 3.2%."
```

No pull requests on web servers. No corporate accounts. Code flows over pure cryptographically signed gossip.
