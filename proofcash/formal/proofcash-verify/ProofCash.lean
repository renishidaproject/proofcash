/-!
  # ProofCash Formal Verification Suite
  Author: Ren Ishida (October 2026)
  
  Comprehensive machine-checked proofs for ProofCash v1.1:
  - Basic: Domain types and structural invariants
  - Conservation: Value conservation and anti-inflation theorem
  - Nullifier: Injectivity and anti-double-spend theorem
  - Monoid: Parallel Delta reduction associativity and commutativity
  - SupplyCap: Analytical ceiling bounded at 1,000,000,000 PCASH
-/

import ProofCash.Basic
import ProofCash.Conservation
import ProofCash.Nullifier
import ProofCash.Monoid
import ProofCash.SupplyCap
