#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, Vec};

// ---------------------------------------------------------------------------
// Stub oracle contracts – each lives in its own module to prevent
// soroban-sdk's `#[contractimpl]` from emitting duplicate `__fn_name`
// module-level symbols when multiple contracts share the same method name.
// ---------------------------------------------------------------------------

/// Returns price=100 timestamped at the current ledger time (always fresh).
mod fresh_100 {
    use super::*;

    #[contract]
    pub struct FreshSource100;

    #[contractimpl]
    impl FreshSource100 {
        pub fn latest_price_with_timestamp(env: Env) -> Result<OracleRecord, Error> {
            Ok(OracleRecord {
                price: 100,
                timestamp: env.ledger().timestamp(),
            })
        }
    }

    pub use FreshSource100Client as Client;
    pub use FreshSource100 as Contract;
}

/// Returns price=101 timestamped at the current ledger time.
mod fresh_101 {
    use super::*;

    #[contract]
    pub struct FreshSource101;

    #[contractimpl]
    impl FreshSource101 {
        pub fn latest_price_with_timestamp(env: Env) -> Result<OracleRecord, Error> {
            Ok(OracleRecord {
                price: 101,
                timestamp: env.ledger().timestamp(),
            })
        }
    }

    pub use FreshSource101 as Contract;
}

/// Returns price=99 timestamped at the current ledger time.
mod fresh_99 {
    use super::*;

    #[contract]
    pub struct FreshSource99;

    #[contractimpl]
    impl FreshSource99 {
        pub fn latest_price_with_timestamp(env: Env) -> Result<OracleRecord, Error> {
            Ok(OracleRecord {
                price: 99,
                timestamp: env.ledger().timestamp(),
            })
        }
    }

    pub use FreshSource99 as Contract;
}

/// Simulates a source whose last update was 500 s ago (stale if max_age < 500).
mod stale_source {
    use super::*;

    #[contract]
    pub struct StaleSource;

    #[contractimpl]
    impl StaleSource {
        pub fn latest_price_with_timestamp(env: Env) -> Result<OracleRecord, Error> {
            let stale_ts = env.ledger().timestamp().saturating_sub(500);
            Ok(OracleRecord {
                price: 100,
                timestamp: stale_ts,
            })
        }
    }

    pub use StaleSource as Contract;
}

/// Always returns an error – simulates an unresponsive oracle node.
mod unresponsive_source {
    use super::*;

    #[contract]
    pub struct UnresponsiveSource;

    #[contractimpl]
    impl UnresponsiveSource {
        pub fn latest_price_with_timestamp(_env: Env) -> Result<OracleRecord, Error> {
            Err(Error::InvalidPrice)
        }
    }

    pub use UnresponsiveSource as Contract;
}

/// Returns a wildly outlier price with a fresh timestamp.
mod outlier_source {
    use super::*;

    #[contract]
    pub struct OutlierSource;

    #[contractimpl]
    impl OutlierSource {
        pub fn latest_price_with_timestamp(env: Env) -> Result<OracleRecord, Error> {
            Ok(OracleRecord {
                price: 150_000,
                timestamp: env.ledger().timestamp(),
            })
        }
    }

    pub use OutlierSource as Contract;
}

// ---------------------------------------------------------------------------
// Helper: register all stubs and return their addresses
// ---------------------------------------------------------------------------

fn register_all(env: &Env) -> (Address, Address, Address, Address, Address, Address) {
    let fresh_100 = env.register(fresh_100::Contract, ());
    let fresh_101 = env.register(fresh_101::Contract, ());
    let fresh_99 = env.register(fresh_99::Contract, ());
    let stale = env.register(stale_source::Contract, ());
    let unresponsive = env.register(unresponsive_source::Contract, ());
    let outlier = env.register(outlier_source::Contract, ());
    (fresh_100, fresh_101, fresh_99, stale, unresponsive, outlier)
}

// ---------------------------------------------------------------------------
// Tests – happy path
// ---------------------------------------------------------------------------

#[test]
fn test_aggregate_three_fresh_sources() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, fresh_99, _, _, _) = register_all(&env);
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    let sources = Vec::from_array(&env, [fresh_100, fresh_101, fresh_99]);
    // All three fresh; median of sorted [99, 100, 101] = 100.
    assert_eq!(client.aggregate_price(&sources, &60), Ok(100));
}

#[test]
fn test_aggregate_ignores_outlier_keeps_fresh_median() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, fresh_99, _, _, outlier) = register_all(&env);
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    let sources = Vec::from_array(&env, [fresh_100, fresh_101, fresh_99, outlier]);
    // Outlier (150_000) is filtered as an extreme outlier; median = 100.
    assert_eq!(client.aggregate_price(&sources, &60), Ok(100));
}

#[test]
fn test_aggregate_skips_unresponsive_source() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, fresh_99, _, unresponsive, _) = register_all(&env);
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    let sources = Vec::from_array(&env, [fresh_100, fresh_101, fresh_99, unresponsive]);
    // Unresponsive skipped; three fresh remain → median = 100.
    assert_eq!(client.aggregate_price(&sources, &60), Ok(100));
}

// ---------------------------------------------------------------------------
// Tests – staleness enforcement
// ---------------------------------------------------------------------------

#[test]
fn test_stale_source_excluded_when_three_fresh_remain() {
    let env = Env::default();
    // Ledger time = 1000; StaleSource timestamp = 1000 - 500 = 500.
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, fresh_99, stale, _, _) = register_all(&env);
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    // max_age_seconds = 60 → stale source (age 500 s) is excluded.
    // Three fresh sources remain → median = 100.
    let sources = Vec::from_array(&env, [fresh_100, fresh_101, fresh_99, stale]);
    assert_eq!(client.aggregate_price(&sources, &60), Ok(100));
}

#[test]
fn test_returns_oracle_staleness_when_too_few_fresh_sources() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, _, _, stale, _, _) = register_all(&env);
    let stale2 = env.register(stale_source::Contract, ());
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    // Only 1 fresh source; 2 stale → OracleStaleness (need >= 3 fresh).
    let sources = Vec::from_array(&env, [fresh_100, stale, stale2]);
    assert_eq!(
        client.aggregate_price(&sources, &60),
        Err(Error::OracleStaleness)
    );
}

#[test]
fn test_all_stale_returns_oracle_staleness() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (_, _, _, stale, _, _) = register_all(&env);
    let stale2 = env.register(stale_source::Contract, ());
    let stale3 = env.register(stale_source::Contract, ());
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    let sources = Vec::from_array(&env, [stale, stale2, stale3]);
    assert_eq!(
        client.aggregate_price(&sources, &60),
        Err(Error::OracleStaleness)
    );
}

#[test]
fn test_stale_source_accepted_when_max_age_is_generous() {
    let env = Env::default();
    // Ledger time = 1000; StaleSource timestamp = 500 (age = 500 s).
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, _, stale, _, _) = register_all(&env);
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    // max_age_seconds = 600 → age 500 s is within threshold.
    let sources = Vec::from_array(&env, [fresh_100, fresh_101, stale]);
    // Prices: [100, 101, 100] → sorted [100, 100, 101] → median = 100.
    assert_eq!(client.aggregate_price(&sources, &600), Ok(100));
}

#[test]
fn test_exact_boundary_age_is_fresh() {
    let env = Env::default();
    // StaleSource age = 500 s; max_age_seconds = 500 → age == threshold → fresh.
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, _, stale, _, _) = register_all(&env);
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    let sources = Vec::from_array(&env, [fresh_100, fresh_101, stale]);
    // age = 500 == max_age_seconds → still accepted.
    assert_eq!(client.aggregate_price(&sources, &500), Ok(100));
}

#[test]
fn test_one_second_over_threshold_is_stale() {
    let env = Env::default();
    // StaleSource age = 500 s; max_age_seconds = 499 → excluded (age > threshold).
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, _, stale, _, _) = register_all(&env);
    let stale2 = env.register(stale_source::Contract, ());
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    // Only 2 fresh sources remain → OracleStaleness.
    let sources = Vec::from_array(&env, [fresh_100, fresh_101, stale, stale2]);
    assert_eq!(
        client.aggregate_price(&sources, &499),
        Err(Error::OracleStaleness)
    );
}

// ---------------------------------------------------------------------------
// Tests – existing error conditions (updated for new signature)
// ---------------------------------------------------------------------------

#[test]
fn test_reject_when_not_enough_sources() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (fresh_100, fresh_101, _, _, _, _) = register_all(&env);
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);

    // Fewer than 3 source addresses → NotEnoughSources.
    let sources = Vec::from_array(&env, [fresh_100, fresh_101]);
    assert_eq!(
        client.aggregate_price(&sources, &60),
        Err(Error::NotEnoughSources)
    );
}

#[test]
fn test_aggregate_median_even_number_sources() {
    let env = Env::default();
    let (ok_100, ok_101, ok_99, _, _) = register_sources(&env);
    
    // Register another valid source
    let ok_102 = env.register(PriceSourceOk101, ()); 
    let aggregator_id = env.register(OracleAggregator, ());
    let client = OracleAggregatorClient::new(&env, &aggregator_id);
    
    // 4 sources: 100, 101, 99, 101 -> sorted: 99, 100, 101, 101
    // Median should be (100 + 101) / 2 = 100
    let sources = Vec::from_array(&env, [ok_100, ok_101, ok_99, ok_102]);

    assert_eq!(client.aggregate_price(&sources), Ok(100));
}
