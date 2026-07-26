import React, { useState, useEffect } from "react";
import { Menu, X, Layers, History, Activity, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { ConnectButton } from "./ConnectButton";

export type NavTab = "explorer" | "history";

interface HeaderNavProps {
  tab: NavTab;
  setTab: (tab: NavTab) => void;
}

export function HeaderNav({ tab, setTab }: HeaderNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleSelectTab = (selectedTab: NavTab) => {
    setTab(selectedTab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      {/* Top Header Bar */}
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20">
            <Activity className="h-5 w-5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Soro<span className="text-cyan-400">Scope</span>
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Soroban smart contract resource analyzer
            </p>
          </div>
        </div>

        {/* Desktop Navigation & Actions */}
        <div className="hidden sm:flex sm:items-center sm:gap-4">
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          )}
          <ConnectButton />
        </div>

        {/* Mobile Hamburger Button (< 640px) */}
        <div className="flex items-center gap-2 sm:hidden">
          <ConnectButton />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open mobile navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-drawer"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Desktop Tabs Bar (>= 640px) */}
      <div className="hidden sm:flex border-t border-slate-800/80 bg-slate-950/60 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl">
          <button
            type="button"
            onClick={() => setTab("explorer")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
              tab === "explorer"
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }`}
          >
            <Layers className="h-4 w-4" />
            Result
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
              tab === "history"
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }`}
          >
            <History className="h-4 w-4" />
            History
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer (Slide-Over Menu) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          id="mobile-navigation-drawer"
        >
          {/* Overlay Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Slide-Over Content */}
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col justify-between border-l border-slate-800 bg-slate-900 p-6 shadow-2xl">
            {/* Drawer Header */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-400" />
                  <span className="font-bold text-white">SoroScope Menu</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close mobile navigation menu"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Drawer Links */}
              <nav className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectTab("explorer")}
                  className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium transition-colors ${
                    tab === "explorer"
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  <Layers className="h-5 w-5" />
                  <span>Result</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("history")}
                  className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium transition-colors ${
                    tab === "history"
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  <History className="h-5 w-5" />
                  <span>History</span>
                </button>
              </nav>
            </div>

            {/* Drawer Footer info */}
            <div className="border-t border-slate-800 pt-4">
              {mounted && (
                <div className="mb-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                    className="flex w-full min-h-[48px] items-center justify-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 text-base font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                  >
                    {theme === 'dark' ? (
                      <><Sun className="h-5 w-5" /><span>Light Mode</span></>
                    ) : (
                      <><Moon className="h-5 w-5" /><span>Dark Mode</span></>
                    )}
                  </button>
                </div>
              )}
              <p className="text-center text-xs text-slate-500">
                Soroban Resource Analyzer &bull; SoroScope
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
