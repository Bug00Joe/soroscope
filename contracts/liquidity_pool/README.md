# Liquidity Pool Contract

## Overview

A constant product (x*y=k) AMM with LP share tokens, emergency pause controls, dynamic fee adjustment based on volatility, and **LP deposit/withdrawal fees** to mitigate just-in-time (JIT) liquidity attacks.

## Key Features

### 1. Constant Product AMM
- Automated market maker using the x*y=k formula
- LP shares represent proportional ownership of the pool
- Supports token swaps with configurable trading fees

### 2. LP Deposit/Withdrawal Fees (NEW)

#### Problem Statement
Rapid liquidity deposit/withdrawal cycles allow actors to capture trading fees without incurring inventory risk or protocol friction, diluting returns for long-term liquidity providers.

#### Solution
Configurable LP fees (default 5 bps / 0.05%) charged during:
- **Deposit**: Fee deducted from minted LP shares
- **Withdrawal**: Fee deducted from withdrawn token amounts

The fees stay within the pool reserves, inherently boosting the underlying value per LP token and rewarding long-term liquidity providers.

#### Configuration

**Default Fee**: 5 bps (0.05%) on both deposit and withdrawal

**Storage Key**: `LpFeeBps` stores the fee rate in basis points

**Admin Functions**:
```rust
// Set LP fee rate (0-100 bps, where 10,000 bps = 100%)
pub fn set_lp_fee_bps(e: Env, fee_bps: i128) -> Result<(), Error>

// Get current LP fee rate
pub fn get_lp_fee_bps(e: Env) -> i128
```

**Bounds**:
- Minimum: 0 bps (no fee)
- Maximum: 100 bps (1%)
- Default: 5 bps (0.05%)

#### Deposit Flow with LP Fee

1. User deposits `amount_a` and `amount_b` tokens
2. Contract calculates `gross_shares` using AMM formula
3. LP fee is deducted: `fee_shares = gross_shares * lp_fee_bps / 10000`
4. User receives `net_shares = gross_shares - fee_shares`
5. Full deposit stays in reserves, but only `net_shares` are minted
6. Result: Reserve value per share increases for existing LPs

**Example** (5 bps fee):
- Deposit: 1,000 tokenA + 1,000 tokenB
- Gross shares: 1,000 (sqrt(1000 * 1000))
- Fee: 1,000 * 5 / 10,000 = 0.5 shares
- Net shares minted: 999.5 shares

#### Withdrawal Flow with LP Fee

1. User burns `share_amount` LP shares
2. Contract calculates `gross_amount_a` and `gross_amount_b` proportionally
3. LP fee is deducted from each token:
   - `fee_amount_a = gross_amount_a * lp_fee_bps / 10000`
   - `fee_amount_b = gross_amount_b * lp_fee_bps / 10000`
4. User receives `net_amount_a` and `net_amount_b`
5. Fees remain in reserves, increasing value for remaining LP shares

**Example** (5 bps fee):
- Burn: 1,000 shares (1% of 100,000 total)
- Gross payout: 1,000 tokenA + 1,000 tokenB
- Fee: 1,000 * 5 / 10,000 = 0.5 of each token
- Net payout: 999.5 tokenA + 999.5 tokenB

#### Economic Impact

**JIT Liquidity Penalty**:
- Round-trip cost: ~10 bps (0.10%) with 5 bps fee
- Deposit + immediate withdrawal = net loss
- Makes JIT liquidity unprofitable for small fee capture

**Long-term LP Benefit**:
- Fees compound in reserves over time
- Each JIT cycle increases reserve value per share
- Long-term LPs earn passive yield from JIT penalties

#### Events

**LP Deposit Fee Event**:
```rust
pub struct LpDepositFeeEvent {
    pub depositor: Address,
    pub gross_shares: i128,
    pub fee_shares: i128,
    pub net_shares: i128,
}
```
Topic: `("lp_fee", "deposit")`

**LP Withdrawal Fee Event**:
```rust
pub struct LpWithdrawFeeEvent {
    pub withdrawer: Address,
    pub gross_amount_a: i128,
    pub gross_amount_b: i128,
    pub fee_amount_a: i128,
    pub fee_amount_b: i128,
    pub net_amount_a: i128,
    pub net_amount_b: i128,
}
```
Topic: `("lp_fee", "withdraw")`

### 3. Emergency Pause Controls
- Granular pause controls for deposit, withdrawal, swap, transfer operations
- Multi-signature admin support
- Emergency pause all functionality

### 4. Dynamic Trading Fees
- Base trading fee configurable by admin
- Optional oracle-based dynamic fee adjustment
- Volatility-based fee tiers

### 5. ERC-20 Compatible LP Tokens
- `transfer`, `approve`, `transferFrom` for LP shares
- Standard token interface (name, symbol, decimals, balance, allowance)

## Core Functions

### Initialization
```rust
pub fn initialize(e: Env, admin: Address, token_a: Address, token_b: Address) -> Result<(), Error>
```

### Liquidity Management
```rust
// Deposit tokens, receive LP shares (minus LP fee)
pub fn deposit(e: Env, to: Address, amount_a: i128, amount_b: i128) -> Result<i128, Error>

// Burn LP shares, receive tokens (minus LP fee)
pub fn withdraw(e: Env, to: Address, share_amount: i128) -> Result<(i128, i128), Error>
```

### Trading
```rust
// Swap tokens with slippage protection
pub fn swap(e: Env, to: Address, buy_a: bool, out: i128, in_max: i128) -> Result<i128, Error>
```

### Admin Functions
```rust
// Set trading fee (swap fee)
pub fn set_fee(e: Env, fee_bps: i128) -> Result<(), Error>

// Set LP deposit/withdrawal fee
pub fn set_lp_fee_bps(e: Env, fee_bps: i128) -> Result<(), Error>

// Configure fee oracle for dynamic adjustment
pub fn configure_fee_oracle(e: Env, oracle: Address, base_fee_bps: i128, timelock_ledgers: u32) -> Result<(), Error>

// Emergency controls
pub fn guard_pause(e: Env, admin: Address, operation: u32, paused: bool) -> Result<(), Error>
pub fn emergency_pause(e: Env, approvers: Vec<Address>) -> Result<(), Error>
pub fn resume(e: Env, approvers: Vec<Address>) -> Result<(), Error>
```

## Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `Pool` | PoolState | Main pool state (tokens, reserves, shares, fees, admin) |
| `Balance(Address)` | i128 | Per-user LP share balance |
| `Allowance(AllowanceDataKey)` | AllowanceValue | ERC-20 allowances |
| `LpFeeBps` | i128 | LP deposit/withdrawal fee rate (basis points) |
| `Admin` | Address | Primary admin address |
| `Guard` | GuardState | Emergency pause state and admin list |
| `Oracle` | OracleConfig | Dynamic fee oracle configuration |
| `PendingFeeUpdate` | PendingFeeUpdate | Timelocked fee update |

## Constants

```rust
// Trading fees
pub const MAX_FEE_BPS: i128 = 100;              // 1% max trading fee
pub const DEFAULT_BASE_FEE_BPS: i128 = 30;      // 0.3% default trading fee

// LP fees
pub const DEFAULT_LP_FEE_BPS: i128 = 5;         // 0.05% default LP fee
pub const MAX_LP_FEE_BPS: i128 = 100;           // 1% max LP fee
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 1 | AlreadyInitialized | Contract already initialized |
| 2 | InsufficientLiquidity | Not enough liquidity in pool |
| 3 | SlippageExceeded | Swap slippage tolerance exceeded |
| 4 | InsufficientShares | User doesn't have enough LP shares |
| 5 | NotInitialized | Contract not initialized |
| 6 | InsufficientBalance | Insufficient token balance |
| 7 | Unauthorized | Caller not authorized |
| 8 | InsufficientAllowance | Insufficient token allowance |
| 9 | InvalidFee | Fee rate out of bounds |
| 10 | OracleNotConfigured | Fee oracle not configured |
| 11 | InvalidOraclePrice | Invalid price from oracle |
| 12 | TimelockNotElapsed | Timelock period not elapsed |
| 13 | NoPendingFeeUpdate | No pending fee update exists |
| 14 | Paused | Operation is paused |

## Testing

Run comprehensive test suite:
```bash
cargo test --package liquidity_pool
```

Key test scenarios:
- ✅ LP fee calculation accuracy
- ✅ JIT liquidity round-trip cost
- ✅ Share value compounding for long-term LPs
- ✅ Admin authorization and bounds checking
- ✅ Event emission verification
- ✅ Zero fee edge case
- ✅ Maximum fee edge case

## Security Considerations

1. **Admin Controls**: LP fee can only be set by authorized admin
2. **Fee Bounds**: LP fee capped at 100 bps (1%) to prevent excessive extraction
3. **Arithmetic Safety**: All fee calculations use checked arithmetic
4. **Emergency Pause**: Admin can pause deposits/withdrawals in case of issues
5. **Event Transparency**: All fee deductions are logged via events

## Deployment

1. Deploy contract
2. Initialize with admin and token addresses
3. (Optional) Configure LP fee rate via `set_lp_fee_bps`
4. (Optional) Configure trading fee oracle for dynamic adjustment
5. (Optional) Add additional guard admins for multi-sig emergency controls

## Upgrade Considerations

The LP fee feature is backward compatible:
- Existing deployments without LP fee will use 0 bps (no fee) as default until explicitly configured
- No breaking changes to existing function signatures
- New storage key (`LpFeeBps`) does not conflict with existing keys

## References

- [Uniswap V3 LP Fee Discussion](https://gov.uniswap.org/t/uni-should-become-an-oracle-token/11988)
- [JIT Liquidity Problem](https://www.paradigm.xyz/2021/06/uniswap-v3-the-universal-amm#jit-liquidity)
- [Stellar Soroban Documentation](https://soroban.stellar.org/)
