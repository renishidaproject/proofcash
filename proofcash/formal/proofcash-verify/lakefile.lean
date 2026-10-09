import Lake
open Lake DSL

package «proofcash-verify» where
  -- Formal verification suite for ProofCash v1.1
  authors := #["Ren Ishida <ren.ishida@protonmail.ch>"]

@[default_target]
lean_lib «ProofCash» where
  -- Libraries covering Basic, Conservation, Nullifier, Monoid, and SupplyCap
