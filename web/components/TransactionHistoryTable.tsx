'use client';

import React, { useMemo, useState, useCallback } from 'react';
import clsx from 'clsx';
import { ExternalLink, Loader2, Download } from 'lucide-react';
import type { TransactionRecord, TransactionStatus } from '../lib/sorobantypes';
import { paginate } from '../lib/paginationUtils';
import { CopyButton } from './CopyButton';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

const PER_PAGE = 10;

function statusBadge(status: TransactionStatus) {
  const style =
    status === 'success'
      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
      : status === 'failed'
        ? 'border-red-500/50 bg-red-500/10 text-red-200'
        : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200';

  const label = status === 'success' ? 'Success' : status === 'failed' ? 'Failed' : 'Pending';

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        style,
      )}
    >
      {label}
    </span>
  );
}

function PaginationButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'min-w-[32px] rounded border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
          : 'border-[#30363d] bg-[#161b22] text-[#8b949e] hover:border-[#8b949e] hover:text-[#c9d1d9]',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {children}
    </button>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3">
        <div className="h-4 w-64 rounded bg-slate-800" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-20 rounded bg-slate-800" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 rounded-full bg-slate-800" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-24 rounded bg-slate-800" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-16 rounded bg-slate-800" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-12 rounded bg-slate-800" />
      </td>
    </tr>
  );
}

interface TransactionHistoryTableProps {
  transactions: TransactionRecord[];
  loading?: boolean;
  /** Whether to use Infinite Scroll pagination for event logs (default: true). */
  enableInfiniteScroll?: boolean;
}

export function TransactionHistoryTable({
  transactions,
  loading = false,
  enableInfiniteScroll = true,
}: TransactionHistoryTableProps) {
  const [page, setPage] = useState(1);
  const [visibleLimit, setVisibleLimit] = useState(PER_PAGE);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isInfiniteMode, setIsInfiniteMode] = useState(enableInfiniteScroll);

  const { items: pageItems, page: currentPage, totalPages, total } = useMemo(
    () => paginate(transactions, page, PER_PAGE),
    [transactions, page],
  );

  const hasMore = visibleLimit < transactions.length;

  const handleLoadMore = useCallback(() => {
    if (isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    setTimeout(() => {
      setVisibleLimit((prev) => Math.min(transactions.length, prev + PER_PAGE));
      setIsFetchingMore(false);
    }, 300);
  }, [isFetchingMore, hasMore, transactions.length]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore: isInfiniteMode && hasMore,
    isLoading: isFetchingMore,
  });

  const visibleTransactions = useMemo(() => {
    return isInfiniteMode ? transactions.slice(0, visibleLimit) : pageItems;
  }, [isInfiniteMode, transactions, visibleLimit, pageItems]);

  const explorerUrl =
    process.env.NEXT_PUBLIC_STELLAR_EXPLORER_URL ?? 'https://stellar.expert/explorer/testnet';

  const exportToCSV = useCallback(() => {
    if (!transactions.length) return;
    const headers = ['Transaction Hash', 'Function', 'Status', 'Timestamp', 'Fee (XLM)'];
    const escape = (val: string) => {
      const clean = val.replace(/"/g, '""');
      return `"${clean}"`;
    };
    const rows = transactions.map((tx) => [
      escape(tx.hash),
      escape(tx.functionName),
      escape(tx.status),
      escape(new Date(tx.timestamp).toISOString()),
      escape(tx.fee ? `${tx.fee}` : '0'),
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetry_events_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transactions]);

  const exportToJSON = useCallback(() => {
    if (!transactions.length) return;
    const jsonContent = JSON.stringify(transactions, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetry_events_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transactions]);

  if (!loading && transactions.length === 0) {
    return (
      <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-6 text-center text-sm text-[#8b949e]">
        No transactions found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#0d1117]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#30363d] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#c9d1d9]">Historical Telemetry & Event Logs</h3>
          <p className="mt-0.5 text-xs text-[#8b949e]">
            Recent contract invocations and telemetry logs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportToCSV}
            title="Export telemetry events as CSV"
            className="flex items-center gap-1.5 rounded border border-[#30363d] bg-[#161b22] px-2.5 py-1 text-xs font-semibold text-[#c9d1d9] hover:border-[#8b949e] hover:text-[#f0f6fc] transition"
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportToJSON}
            title="Export telemetry events as JSON"
            className="flex items-center gap-1.5 rounded border border-[#30363d] bg-[#161b22] px-2.5 py-1 text-xs font-semibold text-[#c9d1d9] hover:border-[#8b949e] hover:text-[#f0f6fc] transition"
          >
            <Download size={13} />
            Export JSON
          </button>
          <div className="h-4 w-[1px] bg-[#30363d] hidden sm:block" />
          <button
            type="button"
            onClick={() => setIsInfiniteMode((prev) => !prev)}
            className="text-xs text-[#00d9ff] hover:underline"
          >
            {isInfiniteMode ? 'Switch to Paged View' : 'Switch to Infinite Scroll'}
          </button>
          <div className="text-xs text-[#8b949e]">
            {isInfiniteMode ? `${visibleTransactions.length} of ${total}` : total} transaction{total === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#161b22] text-xs text-[#8b949e]">
            <tr>
              <th className="px-4 py-3 font-medium">Transaction Hash</th>
              <th className="px-4 py-3 font-medium">Function</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Fee</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363d]">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : visibleTransactions.map((tx) => (
                  <tr key={tx.hash} className="hover:bg-[#0f1621]">
                    <td className="max-w-[220px] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="block truncate font-mono text-xs text-[#c9d1d9]" title={tx.hash}>
                          {tx.hash}
                        </span>
                        <CopyButton text={tx.hash} variant="icon" iconSize={13} tooltipPosition="right" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[#c9d1d9]">{tx.functionName}</span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(tx.status)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[#8b949e]">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#8b949e]">
                      {tx.fee ? `${tx.fee} XLM` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`${explorerUrl}/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#00d9ff] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    </td>
                  </tr>
                ))}

            {isInfiniteMode && (
              <tr ref={sentinelRef} className="border-t-0">
                <td colSpan={6} className="py-4 text-center">
                  {isFetchingMore ? (
                    <div className="inline-flex items-center gap-2 text-xs text-[#8b949e]">
                      <Loader2 className="h-4 w-4 animate-spin text-[#00d9ff]" />
                      Fetching older telemetry event logs...
                    </div>
                  ) : hasMore ? (
                    <div className="text-xs text-[#8b949e]">Scroll down to load more logs</div>
                  ) : (
                    <div className="text-xs text-[#8b949e]">All telemetry event logs loaded ({total} total)</div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isInfiniteMode && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[#30363d] px-4 py-3">
          <div className="text-xs text-[#8b949e]">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-1.5">
            <PaginationButton
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </PaginationButton>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                const range = 2;
                return (
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - currentPage) <= range
                );
              })
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                  acc.push('ellipsis');
                }
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`e-${i}`} className="px-1 text-xs text-[#8b949e]">
                    ...
                  </span>
                ) : (
                  <PaginationButton
                    key={p}
                    active={p === currentPage}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </PaginationButton>
                ),
              )}
            <PaginationButton
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}
