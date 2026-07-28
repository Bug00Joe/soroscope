#![cfg(test)]

use crate::{CrossChainVerifier, CrossChainVerifierClient, Payload};
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, Vec};

fn make_payload(env: &Env, nonce: u64) -> Payload {
    let chain_id = 1;
    let dest = Address::generate(env);
    let data = Bytes::from_slice(env, b"test message");
    Payload {
        chain_id,
        destination_contract: dest,
        nonce,
        data,
    }
}

fn compute_leaf(env: &Env, payload: &Payload) -> BytesN<32> {
    CrossChainVerifier::compute_payload_hash(env, payload)
}

#[test]
fn test_initialization() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CrossChainVerifier);
    let client = CrossChainVerifierClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialization() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CrossChainVerifier);
    let client = CrossChainVerifierClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);
    client.initialize(&admin);
}

#[test]
fn test_root_update() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CrossChainVerifier);
    let client = CrossChainVerifierClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    let root = BytesN::from_array(&env, &[1; 32]);
    let block_height = 100;

    client.update_root(&block_height, &root);

    let retrieved = client.get_root(&block_height).unwrap();
    assert_eq!(retrieved, root);
}

#[test]
fn test_verify_message_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CrossChainVerifier);
    let client = CrossChainVerifierClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    let payload = make_payload(&env, 1);
    let leaf = compute_leaf(&env, &payload);

    let sibling1 = BytesN::from_array(&env, &[3; 32]);
    let sibling2 = BytesN::from_array(&env, &[4; 32]);

    // Manually construct the root
    let mut combined_1 = [0u8; 64];
    combined_1[0..32].copy_from_slice(&sibling1.to_array());
    combined_1[32..64].copy_from_slice(&leaf.to_array());
    let hash_1 = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &combined_1))
        .to_array();

    let mut combined_2 = [0u8; 64];
    combined_2[0..32].copy_from_slice(&hash_1);
    combined_2[32..64].copy_from_slice(&sibling2.to_array());
    let final_root = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &combined_2))
        .to_array();

    let expected_root_bytes = BytesN::from_array(&env, &final_root);

    let block_height = 100;
    client.update_root(&block_height, &expected_root_bytes);

    let mut proof = Vec::new(&env);
    proof.push_back(sibling1);
    proof.push_back(sibling2);

    let mut proof_flags = Vec::new(&env);
    proof_flags.push_back(true);
    proof_flags.push_back(false);

    let result = client.verify_message(&block_height, &payload, &proof, &proof_flags);
    assert!(result);
}

#[test]
#[should_panic(expected = "State root not found")]
fn test_verify_message_no_root() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CrossChainVerifier);
    let client = CrossChainVerifierClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    let payload = make_payload(&env, 1);
    let proof = Vec::new(&env);
    let proof_flags = Vec::new(&env);

    client.verify_message(&100, &payload, &proof, &proof_flags);
}

#[test]
#[should_panic(expected = "Nonce already used")]
fn test_verify_message_replay_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CrossChainVerifier);
    let client = CrossChainVerifierClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    let payload = make_payload(&env, 1);
    let leaf = compute_leaf(&env, &payload);

    // Single-node tree: leaf == root
    let block_height = 100;
    client.update_root(&block_height, &leaf);

    let proof = Vec::new(&env);
    let proof_flags = Vec::new(&env);

    // First use succeeds
    assert!(client.verify_message(&block_height, &payload, &proof, &proof_flags));

    // Second use with same nonce should panic
    client.verify_message(&block_height, &payload, &proof, &proof_flags);
}

#[test]
fn test_verify_message_different_nonce_allowed() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CrossChainVerifier);
    let client = CrossChainVerifierClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    let payload1 = make_payload(&env, 1);
    let leaf1 = compute_leaf(&env, &payload1);

    let payload2 = make_payload(&env, 2);
    let leaf2 = compute_leaf(&env, &payload2);

    // Build a root that commits to both leaves (2-level tree)
    // Level 1: combine leaf1 with leaf2
    let mut combined = [0u8; 64];
    combined[0..32].copy_from_slice(&leaf1.to_array());
    combined[32..64].copy_from_slice(&leaf2.to_array());
    let branch = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &combined))
        .to_array();
    let root = BytesN::from_array(&env, &branch);

    let block_height = 100;
    client.update_root(&block_height, &root);

    // Prove leaf1 at position 0 (left child, sibling=leaf2)
    let mut proof1 = Vec::new(&env);
    proof1.push_back(leaf2);
    let mut flags1 = Vec::new(&env);
    flags1.push_back(false);
    assert!(client.verify_message(&block_height, &payload1, &proof1, &flags1));

    // Prove leaf2 at position 0 (right child, sibling=leaf1 on left)
    let mut proof2 = Vec::new(&env);
    proof2.push_back(leaf1);
    let mut flags2 = Vec::new(&env);
    flags2.push_back(true);
    assert!(client.verify_message(&block_height, &payload2, &proof2, &flags2));
}

#[test]
fn test_compute_payload_hash_differs_by_chain_id() {
    let env = Env::default();
    let dest = Address::generate(&env);
    let data = Bytes::from_slice(&env, b"hello");

    let p1 = Payload {
        chain_id: 1,
        destination_contract: dest.clone(),
        nonce: 0,
        data: data.clone(),
    };
    let p2 = Payload {
        chain_id: 2,
        destination_contract: dest.clone(),
        nonce: 0,
        data: data.clone(),
    };

    let h1 = CrossChainVerifier::compute_payload_hash(&env, &p1);
    let h2 = CrossChainVerifier::compute_payload_hash(&env, &p2);
    assert_ne!(h1, h2);
}

#[test]
fn test_compute_payload_hash_differs_by_nonce() {
    let env = Env::default();
    let dest = Address::generate(&env);
    let data = Bytes::from_slice(&env, b"hello");

    let p1 = Payload {
        chain_id: 1,
        destination_contract: dest.clone(),
        nonce: 0,
        data: data.clone(),
    };
    let p2 = Payload {
        chain_id: 1,
        destination_contract: dest.clone(),
        nonce: 1,
        data: data.clone(),
    };

    let h1 = CrossChainVerifier::compute_payload_hash(&env, &p1);
    let h2 = CrossChainVerifier::compute_payload_hash(&env, &p2);
    assert_ne!(h1, h2);
}

#[test]
fn test_compute_payload_hash_differs_by_destination() {
    let env = Env::default();
    let dest1 = Address::generate(&env);
    let dest2 = Address::generate(&env);
    let data = Bytes::from_slice(&env, b"hello");

    let p1 = Payload {
        chain_id: 1,
        destination_contract: dest1,
        nonce: 0,
        data: data.clone(),
    };
    let p2 = Payload {
        chain_id: 1,
        destination_contract: dest2,
        nonce: 0,
        data,
    };

    let h1 = CrossChainVerifier::compute_payload_hash(&env, &p1);
    let h2 = CrossChainVerifier::compute_payload_hash(&env, &p2);
    assert_ne!(h1, h2);
}
