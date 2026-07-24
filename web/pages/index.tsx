import Head from "next/head";
import { useCallback, useEffect, useState } from "react";

import { ConnectButton } from "../components/ConnectButton";
import { ContractInteraction } from "../components/ContractInteraction";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { FunctionSidebar } from "../components/FunctionSidebar";
import { GasUsageChart } from "../components/GasUsageChart";
import { InvocationHistory } from "../components/InnovocationHistory";
import { NutritionLabel } from "../components/NutritionLabel";
import { NutritionLabelSkeleton } from "../components/NutritionLabelSkeleton";
import { ResourceHeatmap } from "../components/ResourceHeatmap";
import { ResultViewer } from "../components/Resultviewer";
import { ResultViewerSkeleton } from "../components/ResultViewerSkeleton";
import { UploadZone } from "../components/upload-zone";
import { clearLatestAnalysis } from "../lib/analysisStorage";
import { analyzeService } from "../lib/api";
import {
  MOCK_CONTRACT_FUNCTIONS,
  generateMockResult,
  type ContractFunction,
  type InvocationResult,
} from "../lib/sorobantypes";

export default function Home() {
  const [tab, setTab] = useState<'explorer' | 'history'>('explorer');
  const [contractId, setContractId] = useState(
    "CAEZJVJ4N7P7GRUVD5NG5LYYH23AQHJUKQEUHW54LR5PGQX3V7FXD7Q",
  );
  const [selectedFunction, setSelectedFunction] = useState<ContractFunction>(
    MOCK_CONTRACT_FUNCTIONS[0],
  );
  const [currentResult, setCurrentResult] = useState<InvocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [wasmData, setWasmData] = useState<string | null>(null);
  const [uploadResetKey, setUploadResetKey] = useState(0);

  useEffect(() => {
    setCurrentResult(null);
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
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div>
              <h1 className="text-2xl font-bold text-cyan-400">SoroScope</h1>
              <p className="text-sm text-slate-400">Soroban analysis workspace</p>
            </div>
            <ConnectButton />
          </div>
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setTab('explorer')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === 'explorer'
                  ? 'text-cyan-400 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Result
            </button>
            <button
              onClick={() => setTab('history')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === 'history'
                  ? 'text-cyan-400 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              History
            </button>
          </div>
        </header>

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

          <div className="grid gap-6 lg:grid-cols-2">
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
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Contract ID
                </label>
                <input
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
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
              ) : (
                <InvocationHistory onSelectResult={(result) => {
                  setCurrentResult(result);
                  setTab('explorer');
                }} />
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
