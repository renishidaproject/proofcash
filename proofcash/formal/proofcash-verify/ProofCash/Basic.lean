/-!
  # ProofCash Formal Verification: Foundational Types
  Author: Ren Ishida (October 2026)
-/

namespace ProofCash

/-- The atomic currency denomination: Pico-Joules (1 PCASH = 10^12 pJ) -/
abbrev PicoJoules := Nat

/-- 1 ProofCash = 1,000,000,000,000 Pico-Joules -/
def PICO_JOULES_PER_PCASH : PicoJoules := 1000000000000

/-- The absolute global supply cap: 1,000,000,000 PCASH (10^21 Pico-Joules) -/
def TOTAL_CAP_PCASH : Nat := 1000000000
def MAX_PICO_JOULES : PicoJoules := TOTAL_CAP_PCASH * PICO_JOULES_PER_PCASH

/-- Cryptographic Output representation -/
structure Output where
  value : PicoJoules
  commitment : Nat
  energy_bond : PicoJoules
  birth_height : Nat
  deriving Repr, DecidableEq

/-- A commutative balance/state delta -/
structure CommutativeDelta where
  sink_id : Nat
  delta_amount : Int
  precedence_hash : Nat
  deriving Repr, DecidableEq

/-- A transaction in ProofCash -/
structure Transaction where
  inputs : List Output
  outputs : List Output
  deltas : List CommutativeDelta
  public_fee : PicoJoules
  deriving Repr, DecidableEq

/-- Helper summing values of a list of outputs -/
def sum_values (outs : List Output) : PicoJoules :=
  outs.foldl (fun acc out => acc + out.value) 0

/-- Helper summing signed integer deltas -/
def sum_deltas (ds : List CommutativeDelta) : Int :=
  ds.foldl (fun acc d => acc + d.delta_amount) 0

end ProofCash
