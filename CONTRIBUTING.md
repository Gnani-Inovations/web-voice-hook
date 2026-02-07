# Contributing to Web Voice Hook

We welcome contributions from the community. Whether it's fixing edge cases, improving code clarity, or adding tests—every contribution helps.

---

## How to contribute

- **Report bugs** — Open an issue describing the bug, steps to reproduce, and your environment.
- **Suggest improvements** — Ideas for edge cases, API ergonomics, or documentation are welcome.
- **Submit pull requests** — Fixes, refactors, and small features. For larger changes, open an issue first to align on approach.

---

## Development setup

### Prerequisites

- Node.js 18+
- pnpm (or npm)

### Setup

```bash
# Clone the repo (or your fork)
git clone git@github.com:Gnani-Innovations/web-voice-hook.git
cd web-voice-hook

# Install dependencies
pnpm install
```

### Build and typecheck

```bash
# Generate embedded worklet + compile TypeScript + minify
pnpm run build

# Type-check only (no emit)
pnpm run typecheck
```

The build script runs `embed-worklet.mjs` (embeds `src/audio-processor.js` into generated source), then `tsc`, then minification. Always run `pnpm run typecheck` or `pnpm run build` before submitting a PR.

### Testing the package locally

From another app that uses this hook:

```bash
# In web-voice-hook: build and link
pnpm run build
pnpm link --global

# In your app: use the linked package
pnpm link --global @gnani.ai/web-voice-hook
```

Or install from path: `pnpm add file:../path/to/web-voice-hook` (after running `pnpm run build` in the package).

---

## What we welcome

- **Edge cases** — Unusual WebSocket/audio/browser scenarios, reconnection, cleanup, memory leaks, Safari/FF differences.
- **Cleaner code** — Simplifications, better naming, splitting large functions, removing duplication.
- **Documentation** — README, JSDoc, and type definitions.
- **Tests** — Unit or integration tests (e.g. with Vitest/Jest) if you’d like to add a test setup.

---

## Pull request guidelines

1. **Keep changes focused** — One logical change per PR when possible.
2. **Run typecheck** — Ensure `pnpm run typecheck` and `pnpm run build` pass.
3. **Describe the change** — Use the PR description to explain what and why; reference issues if any.
4. **No unnecessary dependencies** — Prefer the current stack (TypeScript, React, audiomotion-analyzer as peer). Discuss first if you want to add tooling (e.g. a test runner).

---

## Code style

- TypeScript strict mode; types for public API in `src/webVoice.d.ts`.
- Prefer clear names and small functions over clever one-liners.
- Use the existing patterns in the codebase (e.g. `useCallback`/`useMemo`/`useRef` usage in the hook).

---

## Questions?

Open a GitHub issue with the **question** label, or start a discussion. We’re happy to help.

Thank you for contributing.
