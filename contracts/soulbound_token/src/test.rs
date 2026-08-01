use crate::contract::{SoulboundToken, SoulboundTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_mint_and_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    client.mint(&user1);
    assert_eq!(client.balance(&user1), 1);
}

#[test]
#[should_panic(expected = "soulbound tokens cannot be transferred")]
fn test_transfer_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    client.mint(&user1);
    client.transfer(&user1, &user2, &1);
}

#[test]
fn test_admin_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    client.mint(&user1);
    assert_eq!(client.balance(&user1), 1);
    assert_eq!(client.balance(&user2), 0);

    client.admin_transfer(&user1, &user2);
    assert_eq!(client.balance(&user1), 0);
    assert_eq!(client.balance(&user2), 1);
}

#[test]
fn test_burn() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    client.mint(&user1);
    assert_eq!(client.balance(&user1), 1);

    client.burn(&user1);
    assert_eq!(client.balance(&user1), 0);
}

#[test]
#[should_panic(expected = "cannot hold more than one soulbound token")]
fn test_mint_twice_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    client.mint(&user1);
    client.mint(&user1);
}

#[test]
fn test_revoke_by_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    client.mint(&user1);
    assert_eq!(client.balance(&user1), 1);

    client.revoke(&user1);
    assert_eq!(client.balance(&user1), 0);
}

#[test]
#[should_panic(expected = "no token to revoke")]
fn test_revoke_no_token_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);

    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    // No token minted for user1
    client.revoke(&user1);
}

#[test]
#[should_panic(expected = "not authorized")]
fn test_revoke_non_admin_panics() {
    let env = Env::default();
    let contract_id = env.register(SoulboundToken, ());
    let client = SoulboundTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let non_admin = Address::generate(&env);

    // Initialize without mock auth to test real auth
    client.initialize(
        &admin,
        &0,
        &String::from_str(&env, "Soulbound Token"),
        &String::from_str(&env, "SBT"),
    );

    // Mint as admin
    env.mock_all_auths();
    client.mint(&user1);
    assert_eq!(client.balance(&user1), 1);

    // Try to revoke as non-admin - should panic
    // Reset auth and try with non_admin
    env.mock_auths(&[]);
    client.revoke(&user1);
}
