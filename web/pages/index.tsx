import Head from "next/head";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { UploadZone } from "../components/upload-zone";
import { CopyButton } from "../components/CopyButton";
import { useNetwork } from "../context/NetworkContext";
import { clearLatestAnalysis } from "../lib/analysisStorage";
import { analyzeService } from "../lib/api";
import Head from 'next/head';
import React, { useEffect, useState } from 'react';

import { ConnectButton } from '../components/ConnectButton';
import { ContractInteraction } from '../components/ContractInteraction';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FunctionSidebar } from '../components/FunctionSidebar';
import { GasGolfingSuggestionsTable } from '../components/GasGolfingSuggestionsTable';
import { GasUsageChart } from '../components/GasUsageChart';
import { InvocationHistory, useInvocationHistory } from '../components/InnovocationHistory';
import { NutritionLabel } from '../components/NutritionLabel';
import { NutritionLabelSkeleton } from '../components/NutritionLabelSkeleton';
import { ResourceHeatmap } from '../components/ResourceHeatmap';
import { ResultViewer } from '../components/Resultviewer';
import { ResultViewerSkeleton } from '../components/ResultViewerSkeleton';
import { UploadZone } from '../components/upload-zone';

import { ApiError, analyzeService, apiUrl } from '../lib/api';
import { loadLatestAnalysis, saveLatestAnalysis } from '../lib/analysisStorage';
import { createUserFriendlyMessage, extractErrorDetails, formatError } from '../lib/errorHandling';
import type { GasGolfingSuggestion } from '../lib/gasGolfingSort';
import {
  MOCK_CONTRACT_FUNCTIONS,
  generateMockResult,
  generateMockTransactions,
  type ContractFunction,
  type InvocationResult,
} from '../lib/sorobantypes';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof window !== 'undefined' ? window.btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

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
  const [contractId, setContractId] = useState(
    'CAEZJVJ4N7P7GRUVD5NG5LYYH23AQHJUKQEUHW54LR5PGQX3V7FXD7Q'
  );
  const [selectedFunction, setSelectedFunction] = useState<ContractFunction>(
    MOCK_CONTRACT_FUNCTIONS[0]
  );
  const [currentResult, setCurrentResult] = useState<InvocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [wasmFile, setWasmFile] = useState<File | null>(null);
  const [wasmData, setWasmData] = useState<string | null>(null);
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const mockTransactions = useMemo(() => generateMockTransactions(47), []);

  useEffect(() => {
    setContractId(network.defaultContractId);
  }, [network]);
  const [tab, setTab] = useState<'explorer' | 'history'>('explorer');

  // Gas golfing state
  const [gasGolfingSuggestions, setGasGolfingSuggestions] = useState<GasGolfingSuggestion[]>([]);
  const [gasGolfingLoading, setGasGolfingLoading] = useState(false);
  const [gasGolfingError, setGasGolfingError] = useState<string | null>(null);

  // History hook
  const { history, addToHistory } = useInvocationHistory();

  // Restore the latest analysis result on initial page load
  useEffect(() => {
    const restored = loadLatestAnalysis();
    if (restored) {
      setCurrentResult(restored);
    }
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
    let errorType: string | undefined;

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
        callGraphMermaid: report.call_graph_mermaid ?? undefined,
        timestamp: Date.now(),
        success: true,
      };

      setCurrentResult(result);
      addToHistory(result);
      saveLatestAnalysis(result);
    } catch (error) {
      if (error instanceof ApiError) {
        errorType = error.body?.error;
      }

      const formatted = formatError(error);

      const errorResult: InvocationResult = {
        id: Math.random().toString(36).substring(7),
        functionName: selectedFunction.name,
        inputs,
        error: formatted.message || 'Analysis failed',
        errorType: errorType || 'ANALYSIS_ERROR',
        timestamp: Date.now(),
        success: false,
      };

      setCurrentResult(errorResult);
      addToHistory(errorResult);
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
  const handleWasmReady = async (file: File) => {
    setGasGolfingLoading(true);
    setGasGolfingError(null);
    setGasGolfingSuggestions([]);

    try {
      const bytes = await file.arrayBuffer();
      const base64Bytes = arrayBufferToBase64(bytes);

      const res = await fetch(apiUrl('/analyze/gas-golfing'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wasm_bytes: base64Bytes,
          contract_name: file.name.replace(/\.wasm$/i, ''),
        }),
      });

      if (!res.ok) {
        const err = await extractErrorDetails(res);
        throw new Error(createUserFriendlyMessage(err));
      }

      const data = await res.json();
      setGasGolfingSuggestions(
        (data?.report?.suggestions ?? []) as GasGolfingSuggestion[]
      );
    } catch (e) {
      setGasGolfingError(e instanceof Error ? e.message : 'Failed to analyze WASM');
    } finally {
      setGasGolfingLoading(false);
  };

  const analysisReport = currentResult?.analysisReport ?? currentResult?.resourceCost;

  return (
    <>
      <Head>
        <title>SoroScope - Soroban Smart Contract Resource Analyzer</title>
        <meta
          name="description"
          content="Explore, test, and analyze the CPU, RAM, and ledger footprint of Soroban smart contracts with absolute precision, utilizing live node queries and direct WASM bytecode analysis."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <HeaderNav tab={tab} setTab={setTab} />

      <div style={{ minHeight: '100vh', backgroundColor: '#0f1117' }}>
        {/* Header */}
        <header className="sticky top-0 z-[100] flex flex-col gap-4 border-b border-[#30363d] bg-[#1a1f26] px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:pl-[140px] lg:pr-[125px]">
          <div className="max-w-[1200px]">
            <h1 style={{ margin: '0 0 12px 0', fontSize: '28px', fontWeight: '700', color: '#00d9ff', letterSpacing: '0.5px' }}>
              SoroScope
            </h1>
            <p style={{ margin: '0', color: '#8b949e', fontSize: '14px' }}>
              Explore and test Soroban smart contracts with precision
            </p>
          </div>

          {/* Wallet Connection */}
          <div>
            <ConnectButton />
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">

          {/* WASM Upload Zone */}
          <div
            style={{
              backgroundColor: '#161b22',
              borderRadius: '12px',
              padding: '28px',
              marginBottom: '24px',
              border: '1px solid #30363d',
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600', color: '#c9d1d9' }}>
                Upload Contract
              </h2>
              <p style={{ margin: '0', fontSize: '13px', color: '#8b949e' }}>
                Drop a compiled Soroban contract (.wasm) to analyze its resource usage
              </p>
            </div>

            <ErrorBoundary
              fallback={(error, reset) => (
                <div className="rounded-lg border border-red-800/60 bg-red-950/30 p-6 text-center text-red-100">
                  <p className="text-sm font-semibold">Upload failed unexpectedly</p>
                  <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-red-200/80">
                    {error.message}
                  </p>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-4 rounded-md border border-red-700/70 px-4 py-2 text-sm text-red-100 hover:bg-red-900/40"
                  >
                    Try another file
                  </button>
                </div>
              )}
            >
              <UploadZone
                key={uploadResetKey}
                onFileReady={(file) => {
                  void file;
                backendUrl={apiUrl('/analyze/wasm')}
                enableBackendValidation={true}
                onFileReady={async (file) => {
                  setWasmFile(file);
                  const arrayBuffer = await file.arrayBuffer();
                  const base64 = arrayBufferToBase64(arrayBuffer);
                  setWasmData(base64);

                  // Trigger gas golfing analysis & simulation
                  await handleWasmReady(file);
                  await handleSimulate({}, base64);
                }}
                onReset={() => {
                  setWasmFile(null);
                  setWasmData(null);
                  setCurrentResult(null);
                  setGasGolfingSuggestions([]);
                  setGasGolfingError(null);
                }}
              />
            </ErrorBoundary>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
          {/* Gas Golfing Suggestions Table */}
          <div style={{ marginBottom: '24px' }}>
            {gasGolfingLoading ? (
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4 text-sm text-[#8b949e]">
                Analyzing WASM for Gas Golfing suggestions…
              </div>
            ) : gasGolfingError ? (
              <div className="rounded-lg border border-[#fb8500] bg-[#0d1117] p-4 text-sm text-[#f0883e]">
                {gasGolfingError}
            ) : gasGolfingSuggestions.length > 0 ? (
              <GasGolfingSuggestionsTable suggestions={gasGolfingSuggestions} />
            ) : null}

          {/* Contract ID Input */}
          <div
            style={{
              backgroundColor: '#161b22',
              borderRadius: '8px',
              padding: '24px',
              marginBottom: '24px',
              border: '1px solid #30363d',
            }}
          >
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#c9d1d9' }}>
              Contract ID
            </label>
            <input
              type="text"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              placeholder="Enter Soroban contract ID"
                width: '100%',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'monospace',
                boxSizing: 'border-box',
                backgroundColor: '#0d1117',
                color: '#c9d1d9',
            />
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#8b949e' }}>
              Contract ID: <code style={{ color: '#00d9ff' }}>{contractId.substring(0, 20)}...</code>
            </p>
            {wasmFile && (
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: 'rgba(52, 211, 153, 0.08)',
                  border: '1px solid rgba(52, 211, 153, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                <span style={{ color: '#34d399', fontSize: '12px', fontWeight: '600' }}>Active WASM:</span>
                <code style={{ color: '#c9d1d9', fontSize: '12px', fontFamily: 'monospace' }}>{wasmFile.name}</code>
                <span style={{ color: '#8b949e', fontSize: '11px' }}>({(wasmFile.size / 1024).toFixed(1)} KB)</span>
            )}

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left Column - Function Selection & Form */}
            <div>
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
                onSubmit={handleSimulate}
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
                    )}
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <NutritionLabel
                          cpu_instructions={analysisReport.cpu_instructions}
                          ram_bytes={analysisReport.ram_bytes}
                          ledger_read_bytes={analysisReport.ledger_read_bytes}
                          ledger_write_bytes={analysisReport.ledger_write_bytes}
                          transaction_size_bytes={analysisReport.transaction_size_bytes}
                        />
                        <GasUsageChart
                          cost_stroops={(analysisReport as any).cost_stroops}
                          testnetAverages={(analysisReport as any).testnet_averages}
                    <button
                      type="button"
                      onClick={handleClearAnalysis}
                      className="mt-4 px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition"
                    >
                      Clear analysis
                    </button>
                ) : (
                  <p className="text-slate-500 text-center py-8">
                    Run an analysis to see results
                  </p>
                )
              ) : tab === 'schema' ? (
                <SchemaVisualizer report={analysisReport} />
              ) : tab === 'transactions' ? (
                <TransactionHistoryTable transactions={mockTransactions} />
                <InvocationHistory onSelectResult={(result) => {
                  setCurrentResult(result);
                  setTab('explorer');
            {/* Right Column - Results & History Tabs */}
            <div>
              {/* Tabs Header */}
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #30363d',
                  marginBottom: '24px',
                  backgroundColor: '#161b22',
                  borderRadius: '8px 8px 0 0',
                }}
                  onClick={() => setTab('explorer')}
                    flex: 1,
                    padding: '12px 16px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: tab === 'explorer' ? '2px solid #00d9ff' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: tab === 'explorer' ? '600' : '500',
                    color: tab === 'explorer' ? '#00d9ff' : '#8b949e',
                    transition: 'color 0.2s, border-bottom-color 0.2s',
                  Result
                  onClick={() => setTab('history')}
                    borderBottom: tab === 'history' ? '2px solid #00d9ff' : '2px solid transparent',
                    fontWeight: tab === 'history' ? '600' : '500',
                    color: tab === 'history' ? '#00d9ff' : '#8b949e',
                  History ({history.length})

              {/* Tab Content Body */}
                  borderRadius: '0 0 8px 8px',
                  padding: '24px',
                  border: '1px solid #30363d',
                  borderTop: 'none',
                      {currentResult?.resourceCost && (
                          <ResourceHeatmap
                            resourceCost={{
                              cpu_instructions: currentResult.resourceCost.cpu_instructions,
                              ram_bytes: currentResult.resourceCost.ram_bytes,
                              ledger_read_bytes: currentResult.resourceCost.ledger_read_bytes,
                              ledger_write_bytes: currentResult.resourceCost.ledger_write_bytes,
                              transaction_size_bytes: currentResult.resourceCost.transaction_size_bytes,
                              cost_stroops: (currentResult.resourceCost as any).cost_stroops,
                              state_snapshot: currentResult.stateSnapshot,

                            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                                cpu_instructions={currentResult.resourceCost.cpu_instructions}
                                ram_bytes={currentResult.resourceCost.ram_bytes}
                                ledger_read_bytes={currentResult.resourceCost.ledger_read_bytes}
                                ledger_write_bytes={currentResult.resourceCost.ledger_write_bytes}
                                transaction_size_bytes={currentResult.resourceCost.transaction_size_bytes}
                                cost_stroops={currentResult.resourceCost.cost_stroops}
                                testnetAverages={currentResult.resourceCost.testnet_averages}

                            onClick={() => {
                              setCurrentResult(null);
                              setWasmFile(null);
                              setWasmData(null);
                            className="mt-4 rounded bg-slate-800 px-4 py-2 text-slate-300 transition hover:bg-slate-700"
                  <InvocationHistory
                    onSelectResult={(result) => {

          {/* Info Cards */}
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
                borderRadius: '8px',
                padding: '16px',
                borderLeft: '4px solid #00d9ff',
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#00d9ff' }}>
                Simulate
              </h3>
              <p style={{ margin: '0', fontSize: '13px', color: '#8b949e' }}>
                Preview contract execution without signing or spending XLM

                borderLeft: '4px solid #a371f7',
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#a371f7' }}>
                Invoke
                Execute real transactions via your connected wallet (Freighter/xBull)

                borderLeft: '4px solid #fb8500',
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#fb8500' }}>
                History
                Track all function calls with full details and resource costs
            </div>
          </div>
        </main>
      </div>
    </>
  );
}