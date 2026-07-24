#![allow(dead_code)]

mod auth;
mod benchmarks;
mod cache;
mod comparison;
mod errors;
pub mod fee_analytics;
pub mod fee_collector;
pub mod fee_store;
mod gas_golfing;
pub mod insights;
mod jobs;
mod merkle_tree;
mod parser;
mod routing;
pub mod rpc_provider;
mod runner;
mod simulation;
mod simulation_service;
mod wasm_branch_analysis;
mod ws;

use crate::cache::{ContractCache, SimulationCache};
use crate::comparison::{CompareMode, RegressionFlag, RegressionReport, ResourceDelta};
use crate::errors::AppError;
use crate::fee_analytics::{FeeAnalyticsEngine, MarketConditions, ModelBreakdown};
use crate::fee_collector::{FeeCollector, FeeCollectorConfig};
use crate::fee_store::FeeStore;
use crate::gas_golfing::{GasGolfingAnalyzer, GasGolfingReport};
use crate::insights::InsightsEngine;
use crate::jobs::{JobQueue, JobQueueConfig, JobWorker};
use crate::merkle_tree::MerkleTree;
use crate::rpc_provider::{ProviderRegistry, RegistryConfig, RegistrySnapshot, RpcProvider};
use crate::simulation::{SimulationEngine, SimulationMode, SimulationResult};
use crate::ws::SimulationBus;
use axum::{
    extract::{Json, Multipart, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Extension, Router,
};
use config::{Config, ConfigError};
use prometheus::{Encoder, HistogramVec, IntCounterVec, Opts, Registry, TextEncoder};
use serde::{Deserialize, Serialize};
use simulation_service::{AnalysisResult, SimulationMetric, SimulationService};
use std::collections::HashMap;
use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AppConfig {
    /// Port for the HTTP server
    server_port: u16,
    /// Rust log level (e.g., "info", "debug")
    rust_log: String,
    /// Primary RPC URL — used as a single-provider fallback when
    /// `RPC_PROVIDERS` is not set.
    soroban_rpc_url: String,
    /// Optional RSA Private Key PEM for RS256 JWTs. If missing, a dev key is generated.
    jwt_private_key: Option<String>,
    /// Stellar network passphrase
    network_passphrase: String,
    /// Redis URL reserved for the distributed cache migration (issue #65).
    /// Unused in the MVP in-memory implementation — present so the config
    /// surface is stable when Redis is wired in.
    redis_url: String,
    /// JSON-encoded array of RPC provider objects. Example:
    /// ```json
    /// [
    ///   {"name":"stellar-testnet","url":"[https://soroban-testnet.stellar.org](https://soroban-testnet.stellar.org)"},
    ///   {"name":"blockdaemon","url":"[https://soroban.blockdaemon.com](https://soroban.blockdaemon.com)","auth_header":"X-API-Key","auth_value":"KEY"}
    /// ]
    ///