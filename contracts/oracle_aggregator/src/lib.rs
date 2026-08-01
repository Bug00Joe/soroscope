#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotEnoughSources = 1,
    NotEnoughValidPrices = 2,
    NotEnoughReliableSources = 3,
    InvalidPrice = 4,
    /// Returned when fewer than three non-stale oracle records are available
    /// after applying the `max_age_seconds` threshold.
    OracleStaleness = 5,
}

/// A price record returned by an oracle source, including a Unix timestamp
/// (seconds) indicating when the price was last updated.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleRecord {
    /// The current price (must be > 0).
    pub price: i128,
    /// Unix timestamp (seconds) of the last price update.
    pub timestamp: u64,
}

/// Oracle interface that returns only a price (legacy / simple sources).
pub trait PriceOracle {
    fn latest_price(env: Env) -> Result<i128, Error>;
}

soroban_sdk::contractclient!(name = "PriceOracleClient", trait = PriceOracle);

/// Oracle interface that returns both a price and the timestamp of the last
/// update, enabling staleness validation by the aggregator.
pub trait PriceOracleWithTimestamp {
    fn latest_price_with_timestamp(env: Env) -> Result<OracleRecord, Error>;
}

soroban_sdk::contractclient!(
    name = "PriceOracleWithTimestampClient",
    trait = PriceOracleWithTimestamp
);

#[contract]
pub struct OracleAggregator;

#[contractimpl]
impl OracleAggregator {
    /// Aggregates prices from multiple oracle sources, rejecting any source
    /// whose price timestamp is older than `max_age_seconds` relative to the
    /// current ledger timestamp.
    ///
    /// # Parameters
    /// - `sources`:         Addresses of oracle contracts implementing
    ///                      `PriceOracleWithTimestamp`.
    /// - `max_age_seconds`: Maximum allowed age (in seconds) of a price record
    ///                      before it is considered stale and ignored.
    ///
    /// # Errors
    /// - `NotEnoughSources`        – fewer than 3 source addresses provided.
    /// - `OracleStaleness`         – fewer than 3 sources returned a fresh price.
    /// - `NotEnoughValidPrices`    – fewer than 3 sources returned a valid (> 0) price.
    /// - `NotEnoughReliableSources`– after outlier filtering, fewer than 3 prices remain.
    pub fn aggregate_price(
        env: Env,
        sources: Vec<Address>,
        max_age_seconds: u64,
    ) -> Result<i128, Error> {
        if sources.len() < 3 {
            return Err(Error::NotEnoughSources);
        }

        let now = env.ledger().timestamp();
        let mut fresh_count: u32 = 0;
        let mut prices = Vec::new(&env);

        for idx in 0..sources.len() {
            let source = sources.get(idx).unwrap();
            let client = PriceOracleWithTimestampClient::new(&env, &source);

            if let Ok(record) = client.latest_price_with_timestamp() {
                // Reject stale prices: price is stale if its timestamp is older
                // than `max_age_seconds` before the current ledger time.
                let age = now.saturating_sub(record.timestamp);
                if age > max_age_seconds {
                    // Count this source as seen but stale; do not add to prices.
                    continue;
                }

                fresh_count += 1;

                if record.price > 0 {
                    prices.push_back(record.price);
                }
            }
        }

        // Need at least 3 fresh (non-stale) sources even before validity check.
        if fresh_count < 3 {
            return Err(Error::OracleStaleness);
        }

        if prices.len() < 3 {
            return Err(Error::NotEnoughValidPrices);
        }

        let sorted = Self::sort_prices(prices);
        let median = Self::median(&sorted);
        let filtered = Self::filter_outliers(&env, &sorted, median);

        if filtered.len() < 3 {
            return Err(Error::NotEnoughReliableSources);
        }

        Ok(Self::median(&filtered))
    }

    fn sort_prices(mut prices: Vec<i128>) -> Vec<i128> {
        let n = prices.len();
        for i in 0..n {
            for j in 0..n - i - 1 {
                let current = prices.get(j).unwrap();
                let next = prices.get(j + 1).unwrap();
                if current > next {
                    prices.set(j, next);
                    prices.set(j + 1, current);
                }
            }
        }
        prices
    }

    fn median(prices: &Vec<i128>) -> i128 {
        let len = prices.len();
        let mid = len / 2;
        if len % 2 == 1 {
            prices.get(mid).unwrap()
        } else {
            let low = prices.get(mid - 1).unwrap();
            let high = prices.get(mid).unwrap();
            (low + high) / 2
        }
    }

    fn filter_outliers(env: &Env, prices: &Vec<i128>, median: i128) -> Vec<i128> {
        let mut filtered = Vec::new(env);
        let threshold = median.saturating_mul(5);

        for idx in 0..prices.len() {
            let price = prices.get(idx).unwrap();
            if Self::abs_diff(price, median).saturating_mul(100) <= threshold {
                filtered.push_back(price);
            }
        }

        filtered
    }

    fn abs_diff(left: i128, right: i128) -> i128 {
        if left > right {
            left - right
        } else {
            right - left
        }
    }
}

#[cfg(test)]
mod test;
