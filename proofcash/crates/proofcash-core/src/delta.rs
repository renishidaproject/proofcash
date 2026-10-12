use serde::{Deserialize, Serialize};

mod sig_serde {
    use serde::{Deserializer, Serializer, Deserialize, Serialize};

    pub fn serialize<S>(bytes: &[u8; 64], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        bytes.as_slice().serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<[u8; 64], D::Error>
    where
        D: Deserializer<'de>,
    {
        let v = <Vec<u8>>::deserialize(deserializer)?;
        if v.len() == 64 {
            let mut arr = [0u8; 64];
            arr.copy_from_slice(&v);
            Ok(arr)
        } else {
            Err(serde::de::Error::invalid_length(v.len(), &"exactly 64 bytes"))
        }
    }
}

/// A commutative state mutation targeting a shared state pool/sink
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommutativeDelta {
    /// Target shared state sink output identifier
    pub sink_id: [u8; 32],
    /// Signed balance mutation (positive for deposits, negative for withdrawals)
    pub delta_amount: i128,
    /// Localized state transition parameters
    pub state_mutation: Vec<u8>,
    /// Ephemeral caller signature authorizing the mutation
    #[serde(with = "sig_serde")]
    pub caller_signature: [u8; 64],
    /// Deterministic hash used for canonical resolution precedence (MEV elimination)
    pub precedence_hash: [u8; 32],
}

impl CommutativeDelta {
    pub fn new(
        sink_id: [u8; 32],
        delta_amount: i128,
        state_mutation: Vec<u8>,
        caller_signature: [u8; 64],
        precedence_hash: [u8; 32],
    ) -> Self {
        Self {
            sink_id,
            delta_amount,
            state_mutation,
            caller_signature,
            precedence_hash,
        }
    }
}
