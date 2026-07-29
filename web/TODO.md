# Implementation Plan

## Step 1: Create OfflineBanner.tsx
- [ ] Component monitoring navigator.onLine and online/offline events
- [ ] Shows offline warning when disconnected
- [ ] Shows "Back online!" success state with auto-dismiss
- [ ] Dismissible via close button
- [ ] Framer-motion animations
- [ ] Dark theme styling

## Step 2: Create SyntaxHighlighter.tsx
- [ ] Regex-based tokenizer for Rust/Soroban contract source code
- [ ] Regex-based tokenizer for XDR format
- [ ] Colored spans matching dark theme
- [ ] Optional line numbers
- [ ] Copy button integration
- [ ] Dark theme optimized

## Step 3: Edit _app.tsx
- [ ] Import and render OfflineBanner inside theme provider

## Step 4: Edit index.tsx
- [ ] Import SyntaxHighlighter
- [ ] Add contract source and XDR display section

