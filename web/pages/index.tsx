import Head from "next/head";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Code, FileCode, ChevronDown, ChevronRight } from "lucide-react";

import { HeaderNav, type NavTab } from "../components/HeaderNav";
import { SEARCH_COMMAND_EVENT } from "../components/GlobalSearchModal";
import { ConnectButton } from "../components/ConnectButton";
import { ContractInteraction } from "../components/ContractInteraction";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { FunctionSidebar } from "../components/FunctionSidebar";
import { TransactionHistoryTable } from "../components/TransactionHistoryTable";
import { GasUsageChart } from "../components/GasUsageChart";
import { InvocationHistory } from "../components/InnovocationHistory";
import { NutritionLabel } from "../components/NutritionLabel";
import { NutritionLabelSkeleton } from "../components/NutritionLabelSkeleton";
import { ResourceHeatmap } from "../components/ResourceHeatmap";
import { ResultViewer } from "../components/Resultviewer";
import { ResultViewerSkeleton } from "../components/ResultViewerSkeleton";
import { SyntaxHighlighter } from "../components/SyntaxHighlighter";
import { UploadZone } from "../components/upload-zone";
import { CopyButton } from "../components/CopyButton";
import { useNetwork } from "../context/NetworkContext";
import { clearLatestAnalysis } from "../lib/analysisStorage";
import { analyzeService } from "../lib/api";
import {
  MOCK_CONTRACT_FUNCTIONS,
  generateMockResult,
  generateMockTransactions,
  type ContractFunction,
  type InvocationResult,
} from "../lib/sorobantypes";

// React Flow measures real DOM nodes, so the visualizer is client-only.
const SchemaVisualizer = dynamic(
  () => import("../components/SchemaVisualizer").then((mod) => mod.SchemaVisualizer),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
    ),
  },
);

const VALID_TABS: NavTab[] = ["explorer", "schema", "history", "transactions"];

export default function Home() {
  const router = useRouter();
  const { network } = useNetwork();
  const [tab, setTab] = useState<NavTab>('explorer');
  const [contractId, setContractId] = useState(network.defaultContractId);
  const [selectedFunction, setSelectedFunction] = useState<ContractFunction>(
    MOCK_CONTRACT_FUNCTIONS[0],
  );
  const [currentResult, setCurrentResult] = useState<InvocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [wasmData, setWasmData] = useState<string | null>(null);
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const mockTransactions = useMemo(() => generateMockTransactions(47), []);

  useEffect(() => {
    setContractId(network.defaultContractId);
  }, [network]);

  useEffect(() => {
    setCurrentResult(null);
  }, []);

  // Keep the active tab in sync with `?tab=` so the Cmd+K palette (and plain
  // links) can deep-link straight to a panel.
  useEffect(() => {
    const requested = router.query.tab;
    const value = Array.isArray(requested) ? requested[0] : requested;
    if (value && VALID_TABS.includes(value as NavTab)) {
      setTab(value as NavTab);
    }
  }, [router.query.tab]);

  // Non-navigation commands from the global search overlay.
  useEffect(() => {
    const handleCommand = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { action?: string; payload?: { name?: string } }
        | undefined;
      if (detail?.action !== "select-function" || !detail.payload?.name) return;

      const match = MOCK_CONTRACT_FUNCTIONS.find((fn) => fn.name === detail.payload?.name);
      if (!match) return;

      setSelectedFunction(match);
      setCurrentResult(null);
      setTab("explorer");
    };

    window.addEventListener(SEARCH_COMMAND_EVENT, handleCommand);
    return () => window.removeEventListener(SEARCH_COMMAND_EVENT, handleCommand);
  }, []);

  const handleSimulate = async (inputs: Record<string, any>, customWasmData?: string) => {
    setLoading(true);
    try {
      const activeWasmData = customWasmData ?? wasmData;
      const report = activeWasmData
        ? await analyzeService.analyzeWasm({
            wasm_bytes: activeWasmData,
            function_name: selectedFunction.name,
            args: Object.values(inputs).map((value) => String(value)),
          })
        : await analyzeService.analyze({
            contract_id: contractId,
            function_name: selectedFunction.name,
          });

      const result: InvocationResult = {
        id: Math.random().toString(36).slice(2),
        functionName: selectedFunction.name,
        inputs,
        result: generateMockResult(selectedFunction.name, inputs),
        analysisReport: report,
        resourceCost: report,
        stateSnapshot: report.state_snapshot,
        callGraphMermaid: report.call_graph_mermaid,
        timestamp: Date.now(),
        success: true,
      };

      setCurrentResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed";
      setCurrentResult({
        id: Math.random().toString(36).slice(2),
        functionName: selectedFunction.name,
        inputs,
        error: message,
        errorType: "ANALYSIS_ERROR",
        timestamp: Date.now(),
        success: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearAnalysis = useCallback(() => {
    setCurrentResult(null);
    setWasmData(null);
    clearLatestAnalysis();
    setUploadResetKey((k) => k + 1);
  }, []);

  const analysisReport = currentResult?.analysisReport;

  return (
    <>
      <Head>
        <title>SoroScope - Soroban Smart Contract Resource Analyzer</title>
        <meta
          name="description"
          content="Explore, test, and analyze the CPU, RAM, and ledger footprint of Soroban smart contracts."
        />
      </Head>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <HeaderNav tab={tab} setTab={setTab} />

        <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <ErrorBoundary fallback={() => <div>Upload failed</div>}>
              <UploadZone
                key={uploadResetKey}
                onFileReady={(file) => {
                  void file;
                  setWasmData(null);
                }}
              />
            </ErrorBoundary>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <FunctionSidebar
                functions={MOCK_CONTRACT_FUNCTIONS}
                selectedFunction={selectedFunction}
                onSelect={(func) => {
                  setSelectedFunction(func);
                  setCurrentResult(null);
                }}
              />
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">
                    Contract ID
                  </label>
                  <CopyButton text={contractId} label="Copy ID" tooltipPosition="left" />
                </div>
                <input
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <ContractInteraction
                selectedFunction={selectedFunction}
                loading={loading}
                onSubmit={(inputs) => void handleSimulate(inputs)}
              />
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              {tab === 'explorer' ? (
                loading ? (
                  <>
                    <ResultViewerSkeleton />
                    <div className="mt-4">
                      <NutritionLabelSkeleton />
                    </div>
                  </>
                ) : currentResult ? (
                  <>
                    <ResultViewer result={currentResult} />
                    {analysisReport && (
                      <div className="mt-4 flex flex-col gap-4">
                        <ResourceHeatmap resourceCost={{
                          cpu_instructions: analysisReport.cpu_instructions,
                          ram_bytes: analysisReport.ram_bytes,
                          ledger_read_bytes: analysisReport.ledger_read_bytes,
                          ledger_write_bytes: analysisReport.ledger_write_bytes,
                          transaction_size_bytes: analysisReport.transaction_size_bytes,
                          cost_stroops: (analysisReport as any).cost_stroops,
                          state_snapshot: currentResult.stateSnapshot
                        }} />
                      </div>
                    )}
                    {analysisReport && (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <NutritionLabel
                          cpu_instructions={analysisReport.cpu_instructions}
                          ram_bytes={analysisReport.ram_bytes}
                          ledger_read_bytes={analysisReport.ledger_read_bytes}
                          ledger_write_bytes={analysisReport.ledger_write_bytes}
                          transaction_size_bytes={analysisReport.transaction_size_bytes}
                        />
                        <GasUsageChart
                          cpu_instructions={analysisReport.cpu_instructions}
                          ram_bytes={analysisReport.ram_bytes}
                          ledger_read_bytes={analysisReport.ledger_read_bytes}
                          ledger_write_bytes={analysisReport.ledger_write_bytes}
                          transaction_size_bytes={analysisReport.transaction_size_bytes}
                          cost_stroops={(analysisReport as any).cost_stroops}
                          testnetAverages={(analysisReport as any).testnet_averages}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleClearAnalysis}
                      className="mt-4 px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition"
                    >
                      Clear analysis
                    </button>
                  </>
                ) : (
                  <p className="text-slate-500 text-center py-8">
                    Run an analysis to see results
                  </p>
                )
              ) : tab === 'schema' ? (
                <SchemaVisualizer report={analysisReport} />
              ) : tab === 'transactions' ? (
                <TransactionHistoryTable transactions={mockTransactions} />
              ) : (
                <InvocationHistory onSelectResult={(result) => {
                  setCurrentResult(result);
                  setTab('explorer');
                }} />
              )}
            </div>
          </div>

          {/* Contract Source & XDR Viewer Section */}
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <SourceCodeViewer currentResult={currentResult} />
          </div>
        </section>
      </main>
    </>
  );
}

// ──────────────────────────────────────────────
// Source Code & XDR Viewer Sub-component
// ──────────────────────────────────────────────

interface SourceCodeViewerProps {
  currentResult: InvocationResult | null;
}

function SourceCodeViewer({ currentResult }: SourceCodeViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"contract" | "xdr">("contract");

  // Sample contract source code for demonstration
  const sampleContractSource = `use soroban_sdk::{contract, contractimpl, Env, Address, Symbol, symbol_short, vec, Vec};

pub trait LiquidityPool {
    fn deposit(e: Env, from: Address, amount: u128) -> bool;
    fn withdraw(e: Env, to: Address, amount: u128) -> bool;
    fn swap(e: Env, from: Address, token_in: Address, token_out: Address, amount_in: u128) -> u128;
    fn get_balance(e: Env, account: Address) -> u128;
    fn get_reserves(e: Env) -> (u128, u128);
}

#[contract]
pub struct LiquidityPoolContract;

#[contractimpl]
impl LiquidityPoolContract {
    pub fn deposit(env: Env, from: Address, amount: u128) -> bool {
        // Validate the caller
        from.require_auth();

        // Transfer tokens from user to pool
        let token = TokenClient::new(&env, &env.current_contract_address());
        token.transfer(&from, &env.current_contract_address(), &amount);

        // Mint LP tokens proportional to deposit
        let total_supply = Self::total_supply(&env);
        let lp_amount = if total_supply == 0 {
            amount
        } else {
            let reserves = Self::get_reserves(&env);
            (amount * total_supply) / reserves.0
        };

        Self::mint_lp_tokens(&env, &from, &lp_amount);
        true
    }

    pub fn get_reserves(env: Env) -> (u128, u128) {
        let reserve_a: u128 = env.storage().instance().get(&symbol_short!("res_a")).unwrap_or(0);
        let reserve_b: u128 = env.storage().instance().get(&symbol_short!("res_b")).unwrap_or(0);
        (reserve_a, reserve_b)
    }
}

fn calculate_swap_output(
    amount_in: u128,
    reserve_in: u128,
    reserve_out: u128,
) -> u128 {
    // Constant product formula: x * y = k
    let amount_in_with_fee = amount_in * 997;
    let numerator = amount_in_with_fee * reserve_out;
    let denominator = (reserve_in * 1000) + amount_in_with_fee;
    numerator / denominator
}`;

  const sampleXdrData = `AAAAAgAAAABzdPocx0i4sJzFqNfRqI7Lq4G5GQ2xX0hYjK6Y5JXZzQAAAAoAAAAQAAAA
AAAAAQAAAAAAAAAAAAAAAFz8rXsAAAAAMgAAAAAAAAABAAAABFRSQU5TRkVSAAAAAAAAAAEA
AAAFAAAAAQAAABdUZXN0IFNvcm9iYW4gVHJhbnNmZXIAAAAAAAoAAAAEVXNkYwAAAAAAAAAA
AAAAAAAFAAAAAQAAABdUZXN0IFNvcm9iYW4gVHJhbnNmZXIAAAAAAAoAAAAFeFNvbAAAAAAA
AAAAAAFlZfTAAAAAAAAAAAIAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFz8ra0AAAAAAAAAAQAA
AARUUkFOU0ZFUgAAAAAAAAABAAAABQAAAAEAAAAXVGVzdCBTb3JvYmFuIFRyYW5zZmVyAAAA
AAAKAAAABFVzZGMAAAAAAAAAAAAAAAAAAAAABQAAAAEAAAAXVGVzdCBTb3JvYmFuIFRyYW5z
ZmVyAAAAAAAKAAAABXhTb2wAAAAAAAAAAAAAAAABZWX0wAAAAAAAAAACAAAAAAAAAAAAAAEA
AAAAAAAAAAAAAABc/K2QAAAAAAAAAAEAAAAEVFJBTlNGRVIAAAAAAAAAAQAAAAUAAAABAAAA
F1Rlc3QgU29yb2JhbiBUcmFuc2ZlcgAAAAAACgAAAARVc2RjAAAAAAAAAAAAAAAAAAAAAAUA
AAABAAAAF1Rlc3QgU29yb2JhbiBUcmFuc2ZlcgAAAAAACgAAAAV4U29sAAAAAAAAAAAAAAAA
AWVl9MAAAAAAAAAAAgAAAAAAAAAAAAABAAAAAAAAAAAAAAAAXPytoAAAAAAAAAABAAAABFRS
QU5TRkVSAAAAAAAAAAEAAAAFAAAAAQAAABdUZXN0IFNvcm9iYW4gVHJhbnNmZXIAAAAAAAAK
AAAABFVzZGMAAAAAAAAAAAAAAAAAAAAABQAAAAEAAAAXVGVzdCBTb3JvYmFuIFRyYW5zZmVy
AAAAAAAKAAAABXhTb2wAAAAAAAAAAAAAAAABZWX0wAAAAAAAAAACAAAAAAAAAAAAAAEAAAAA
AAAAAABc/K1gAAAAAAAAAAEAAAAEVFJBTlNGRVIAAAAAAAAAAQAAAAUAAAABAAAAF1Rlc3Qg
U29yb2JhbiBUcmFuc2ZlcgAAAAAACgAAAARVc2RjAAAAAAAAAAAAAAAAAAAAAAUAAAABAAAA
F1Rlc3QgU29yb2JhbiBUcmFuc2ZlcgAAAAAACgAAAAV4U29sAAAAAAAAAAAAAAAAAWVl9MAA`;

  // Use result state snapshot or sample data
  const displayCode = currentResult?.analysisReport?.state_snapshot
    ? JSON.stringify(currentResult.analysisReport.state_snapshot.ledger_entries, null, 2)
    : viewMode === "contract"
      ? sampleContractSource
      : sampleXdrData;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={expanded}
        aria-controls="source-code-panel"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
            <Code className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Contract Source &amp; XDR
            </h3>
            <p className="text-xs text-slate-500">
              View contract source code and raw XDR transaction data
            </p>
          </div>
        </div>
        <span className="text-slate-500">
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </span>
      </button>

      {expanded && (
        <div id="source-code-panel" className="mt-4 space-y-4">
          {/* View toggle */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setViewMode("contract")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "contract"
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-300 border border-transparent"
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              Contract Source
            </button>
            <button
              type="button"
              onClick={() => setViewMode("xdr")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "xdr"
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-300 border border-transparent"
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              XDR View
            </button>
          </div>

          {/* Syntax highlighted code */}
          <SyntaxHighlighter
            code={displayCode}
            language={viewMode}
            showLineNumbers
            maxHeight="480px"
          />
        </div>
      )}
    </div>
  );
}
