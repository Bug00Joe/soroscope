#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

const INITIAL_RATE: i128 = 100_000_000_000_000; // 0.0001 in Fixed (18 decimals)
const EPOCH_DECAY_PERCENT: i128 = 10_000_000_000_000_000; // 0.01 in Fixed (18 decimals) = 1% per epoch
const EPOCH_LENGTH: u32 = 10;
const STAKE_AMOUNT: i128 = 10_000;

fn advance_ledger(e: &Env, by: u32) {
    let mut info = e.ledger().get();
    info.sequence_number += by;
    e.ledger().set(info);
}

fn setup() -> (
    Env,
    StakingRewardsClient<'static>,
    Address, // owner
    Address, // staking_token
    Address, // reward_token
) {
    let e = Env::default();
    e.mock_all_auths();
    e.cost_estimate().budget().reset_unlimited();

    let owner = Address::generate(&e);
    let staking_token_admin = Address::generate(&e);
    let staking_token = e
        .register_stellar_asset_contract_v2(staking_token_admin)
        .address();

    let reward_token_admin = Address::generate(&e);
    let reward_token = e
        .register_stellar_asset_contract_v2(reward_token_admin)
        .address();

    let contract_id = e.register(StakingRewards, ());
    let client = StakingRewardsClient::new(&e, &contract_id);

    client.initialize(
        &owner,
        &staking_token,
        &reward_token,
        &INITIAL_RATE,
        &EPOCH_DECAY_PERCENT,
        &EPOCH_LENGTH,
        &0u32, // start block
    );

    let reward_client = token::StellarAssetClient::new(&e, &reward_token);
    reward_client.mint(&contract_id, &1_000_000_000);

    (e, client, owner, staking_token, reward_token)
}

#[test]
fn test_initialization() {
    let (_, client, owner, staking_token, reward_token) = setup();
    let config = client.get_config();

    assert_eq!(config.owner, owner);
    assert_eq!(config.staking_token, staking_token);
    assert_eq!(config.reward_token, reward_token);
    assert_eq!(config.initial_rate.0, INITIAL_RATE);
    assert_eq!(config.epoch_decay_percent.0, EPOCH_DECAY_PERCENT);
    assert_eq!(config.epoch_length, EPOCH_LENGTH);
    assert_eq!(config.start_block, 0);
    assert!(!config.is_paused);
}

#[test]
fn test_stake_and_yield_accumulation_no_decay() {
    let e = Env::default();
    e.mock_all_auths();
    e.cost_estimate().budget().reset_unlimited();

    let owner = Address::generate(&e);
    let staking_token = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    let reward_token = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();

    let contract_id = e.register(StakingRewards, ());
    let client = StakingRewardsClient::new(&e, &contract_id);

    client.initialize(
        &owner,
        &staking_token,
        &reward_token,
        &INITIAL_RATE,
        &0i128,                    // epoch_decay_percent = 0 (no decay)
        &EPOCH_LENGTH,
        &10u32,                    // start_block = 10
    );

    let user = Address::generate(&e);
    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    advance_ledger(&e, 10);

    // Stake at block 10
    client.stake(&user, &STAKE_AMOUNT);

    assert_eq!(client.get_staked_balance(&user), STAKE_AMOUNT);
    assert_eq!(client.get_accrued_rewards(&user), 0);
    assert_eq!(client.get_pending_rewards(&user), 0);

    // Advance 5 blocks (from 10 to 15) — still in epoch 0
    advance_ledger(&e, 5);

    // Expected: multiplier = exp(r0 * 5) = exp(0.0001 * 5) = exp(0.0005) ≈ 1.00050012502
    // reward = 10,000 * (1.00050012502 - 1) = 5.0012502 → truncated to 5
    let pending = client.get_pending_rewards(&user);
    assert_eq!(pending, 5);
}

#[test]
fn test_stake_and_yield_accumulation_with_decay() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    // Stake at block 0 — epoch 0
    client.stake(&user, &STAKE_AMOUNT);

    // Advance 5 blocks (from 0 to 5) — still epoch 0, rate = r0 = 0.0001
    advance_ledger(&e, 5);

    // Expected: multiplier = exp(r0 * 5) = exp(0.0005) ≈ 1.00050012502
    // reward = 10,000 * 0.00050012502 = 5.0012502 → truncated to 5
    let pending = client.get_pending_rewards(&user);
    assert_eq!(pending, 5);

    // Claim rewards
    client.claim(&user);
    assert_eq!(client.get_accrued_rewards(&user), 0);
    assert_eq!(client.get_pending_rewards(&user), 0);
}

#[test]
fn test_epoch_boundary_decay() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    // Stake at block 0 — epoch 0
    client.stake(&user, &STAKE_AMOUNT);

    // Advance to block 10 — epoch 1 begins
    // Blocks 0-9: epoch 0, rate = r0 = 0.0001
    // Block 10: epoch 1, rate = r0 * (1 - 0.01)^1 = 0.0001 * 0.99 = 0.000099
    // We advance to block 12: 10 blocks epoch 0 + 2 blocks epoch 1
    // exponent = 10 * 0.0001 + 2 * 0.000099 = 0.001 + 0.000198 = 0.001198
    // multiplier = exp(0.001198) ≈ 1.001198718
    // reward = 10,000 * 0.001198718 = 11.98718 → truncated to 11
    advance_ledger(&e, 12);

    let pending = client.get_pending_rewards(&user);
    assert_eq!(pending, 11);

    // Claim to reset
    client.claim(&user);

    // Advance to block 25: remaining 8 blocks epoch 1 + 5 blocks epoch 2
    // epoch 2 rate = r0 * 0.99^2 = 0.0001 * 0.9801 = 0.00009801
    // exponent = 8 * 0.000099 + 5 * 0.00009801 = 0.000792 + 0.00049005 = 0.00128205
    // multiplier = exp(0.00128205) ≈ 1.001282873
    // reward = 10,000 * 0.001282873 = 12.82873 → truncated to 12
    advance_ledger(&e, 13);

    let pending2 = client.get_pending_rewards(&user);
    assert_eq!(pending2, 12);
}

#[test]
fn test_epoch_snapshot_storage() {
    let (e, client, _, staking_token, _) = setup();
    let contract_id = client.address.clone();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    client.stake(&user, &STAKE_AMOUNT);

    // Advance to block 25 — this should create epoch 0, 1, 2 snapshots
    advance_ledger(&e, 25);

    // Trigger snapshot creation via pending_rewards
    let _pending = client.get_pending_rewards(&user);

    e.as_contract(&contract_id, || {
        let snapshot0: EpochSnapshot = e
            .storage()
            .instance()
            .get(&DataKey::EpochSnapshot(0))
            .unwrap();
        assert_eq!(snapshot0.rate.0, INITIAL_RATE);

        let snapshot1: EpochSnapshot = e
            .storage()
            .instance()
            .get(&DataKey::EpochSnapshot(1))
            .unwrap();
        let expected_rate1 = INITIAL_RATE * 99 / 100;
        assert_eq!(snapshot1.rate.0, expected_rate1);

        let snapshot2: EpochSnapshot = e
            .storage()
            .instance()
            .get(&DataKey::EpochSnapshot(2))
            .unwrap();
        let expected_rate2 = INITIAL_RATE * 9801 / 10000;
        assert_eq!(snapshot2.rate.0, expected_rate2);
    });
}

#[test]
fn test_compounding_interest() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &100_000);

    client.stake(&user, &100_000);

    // Advance 10 blocks (from 0 to 10) — one full epoch
    advance_ledger(&e, 10);

    let pending_1 = client.get_pending_rewards(&user);

    // Stake 1 more to trigger write-back
    staking_client.mint(&user, &1);
    client.stake(&user, &1);

    let accrued = client.get_accrued_rewards(&user);
    assert!(accrued > 0);
    assert_eq!(accrued, pending_1);

    // Advance another 10 blocks
    advance_ledger(&e, 10);

    let pending_2 = client.get_pending_rewards(&user);
    assert!(pending_2 > accrued);
}

#[test]
fn test_zero_stake_security() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    client.stake(&user, &STAKE_AMOUNT);
    advance_ledger(&e, 10);

    let pending = client.get_pending_rewards(&user);
    assert!(pending > 0);

    client.withdraw(&user, &STAKE_AMOUNT);
    assert_eq!(client.get_staked_balance(&user), 0);

    let accrued = client.get_accrued_rewards(&user);
    assert_eq!(accrued, pending);

    // Advance another 10 blocks — no compounding since stake = 0
    advance_ledger(&e, 10);

    let pending_after = client.get_pending_rewards(&user);
    assert_eq!(pending_after, accrued);
}

#[test]
fn test_multi_epoch_accumulation() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    client.stake(&user, &STAKE_AMOUNT);

    // Advance 100 blocks = 10 full epochs
    advance_ledger(&e, 100);

    // Rate per epoch:
    // epoch 0: r0 = 0.0001
    // epoch 1: r0 * 0.99
    // epoch 2: r0 * 0.99^2
    // etc.
    // Total exponent = 10 * r0 * sum_{k=0}^{9} 0.99^k
    // sum = (1 - 0.99^10) / (1 - 0.99) = (1 - 0.904382) / 0.01 = 9.5618
    // exponent = 10 * 0.0001 * 9.5618 = 0.0095618
    // multiplier = exp(0.0095618) ≈ 1.009607
    // reward = 10,000 * (1.009607 - 1) = 96.07 → truncated to 96
    let pending = client.get_pending_rewards(&user);
    assert!(pending > 90);
    assert!(pending < 110);
}

#[test]
fn test_emergency_withdraw() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    client.stake(&user, &STAKE_AMOUNT);
    advance_ledger(&e, 10);

    assert!(client.get_pending_rewards(&user) > 0);

    client.set_paused(&true);

    let withdrawn = client.emergency_withdraw(&user);
    assert_eq!(withdrawn, STAKE_AMOUNT);

    assert_eq!(client.get_staked_balance(&user), 0);
    assert_eq!(client.get_accrued_rewards(&user), 0);
    assert_eq!(client.get_pending_rewards(&user), 0);

    let token_balance = token::Client::new(&e, &staking_token).balance(&user);
    assert_eq!(token_balance, STAKE_AMOUNT);
}

#[test]
#[should_panic(expected = "Contract, #14")]
fn test_pause_safeguards_stake() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    client.set_paused(&true);
    client.stake(&user, &STAKE_AMOUNT);
}

#[test]
#[should_panic(expected = "Contract, #14")]
fn test_pause_safeguards_withdraw() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    client.stake(&user, &STAKE_AMOUNT);
    client.set_paused(&true);
    client.withdraw(&user, &STAKE_AMOUNT);
}

#[test]
#[should_panic(expected = "Contract, #14")]
fn test_pause_safeguards_claim() {
    let (e, client, _, staking_token, _) = setup();
    let user = Address::generate(&e);

    let staking_client = token::StellarAssetClient::new(&e, &staking_token);
    staking_client.mint(&user, &STAKE_AMOUNT);

    client.stake(&user, &STAKE_AMOUNT);
    client.set_paused(&true);
    client.claim(&user);
}
