#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    StateRoot(u32),
    NonceUsed(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payload {
    pub chain_id: u32,
    pub destination_contract: Address,
    pub nonce: u64,
    pub data: Bytes,
}

#[contract]
pub struct CrossChainVerifier;

#[contractimpl]
impl CrossChainVerifier {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn update_root(env: Env, block_height: u32, new_root: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::StateRoot(block_height), &new_root);
    }

    pub fn get_root(env: Env, block_height: u32) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::StateRoot(block_height))
    }

    /// Verifies a cross-chain payload using a Merkle proof.
    /// Includes domain separation via chain_id and destination_contract,
    /// plus sequential nonce tracking to prevent replay attacks.
    pub fn verify_message(
        env: Env,
        block_height: u32,
        payload: Payload,
        proof: Vec<BytesN<32>>,
        proof_flags: Vec<bool>,
    ) -> bool {
        let expected_root: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::StateRoot(block_height))
            .unwrap_or_else(|| panic!("State root not found"));

        if proof.len() != proof_flags.len() {
            panic!("Invalid proof format");
        }

        // Replay protection: nonce must not have been used before
        if env
            .storage()
            .persistent()
            .has(&DataKey::NonceUsed(payload.nonce))
        {
            panic!("Nonce already used");
        }
        env.storage()
            .persistent()
            .set(&DataKey::NonceUsed(payload.nonce), &true);

        // Compute domain-separated leaf hash
        let leaf = Self::compute_payload_hash(&env, &payload);
        let mut current_hash = leaf.to_array();

        for i in 0..proof.len() {
            let sibling = proof.get(i).unwrap().to_array();
            let is_left_sibling = proof_flags.get(i).unwrap();

            let mut combined = [0u8; 64];
            if is_left_sibling {
                combined[0..32].copy_from_slice(&sibling);
                combined[32..64].copy_from_slice(&current_hash);
            } else {
                combined[0..32].copy_from_slice(&current_hash);
                combined[32..64].copy_from_slice(&sibling);
            }

            let combined_bytes = Bytes::from_slice(&env, &combined);
            current_hash = env.crypto().sha256(&combined_bytes).to_array();
        }

        let computed_root = BytesN::from_array(&env, &current_hash);
        computed_root == expected_root
    }
}

/// Helper methods outside #[contractimpl] so they can accept reference parameters.
impl CrossChainVerifier {
    /// Computes a domain-separated payload hash:
    ///   sha256(chain_id || destination_contract || nonce || data)
    /// This binds every message to a specific source chain, destination contract,
    /// and unique nonce, preventing cross-chain replay attacks.
    pub fn compute_payload_hash(env: &Env, payload: &Payload) -> BytesN<32> {
        let mut buf = Bytes::new(env);
        buf.append(&Bytes::from_slice(env, &payload.chain_id.to_be_bytes()));
        buf.append(&payload.destination_contract.clone().to_xdr(env));
        buf.append(&Bytes::from_slice(env, &payload.nonce.to_be_bytes()));
        buf.append(&payload.data.clone());
        env.crypto().sha256(&buf).into()
    }
}

mod test;
