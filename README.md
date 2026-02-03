# GnaniWebVoiceHook

A **React hook** for real-time bidirectional WebSocket voice: capture microphone → server (STT), play TTS ← server. Published as `@gnani/web-voice-hook`.

---

## Prerequisites

- **SSH key** — You need an SSH key added to your GitLab account to install from the private GitLab repo. See [GitLab: Add an SSH key](https://docs.gitlab.com/ee/user/ssh.html).

---

## Installation

In your application project:

```bash
pnpm add git+ssh://git@gitlab.com:gnani.ai/demo_platform/gnani-web-voice-hook.git#v1.0.4
```

Or with npm:

```bash
npm install git+ssh://git@gitlab.com:gnani.ai/demo_platform/gnani-web-voice-hook.git#v1.0.4
```

Replace `#v1.0.4` with the tag/version you need (e.g. `#v1.0.2`, `#main`).

**Peer dependencies** (install in your app if not already present):

```bash
pnpm add react audiomotion-analyzer
```

- **react** — required.
- **audiomotion-analyzer** — optional; only needed if you use the visualizer.

---

## Quick start

### 1. Serve the Audio Worklet

Copy `audio-processor.js` from this package into your app’s **public** folder, e.g. `public/worklet/audio-processor.js`, so the URL `/worklet/audio-processor.js` serves that file. Or use a custom path and set `workletPath` in the hook options.

### 2. Use the hook

**Option A — Direct use** (you build the WebSocket URL yourself):

```tsx
import { useWebSocketAudio as useWebSocketAudioHook } from '@gnani/web-voice-hook';
import type { IUseWebVoiceOptions } from '@gnani/web-voice-hook';

const {
  isConnected,
  isPlaying,
  connect,
  disconnect,
  reconnect,
  startRecording,
  stopRecording,
  isRecording,
} = useWebSocketAudioHook({
  websocketUrl: 'wss://your-api/voice',
  workletPath: '/worklet/audio-processor.js',
  visualizerOptions: { elementId: 'visualizer-canvas', color: '#9E77ED' },
  events: {
    onOpen: () => console.log('Connected'),
    onClose: (source) => console.log('Closed', source),
    onException: (err) => console.error(err),
  },
  logger: { info: console.log, error: console.error },
} as IUseWebVoiceOptions);
```

**Option B — Wrapper hook** (build URL from app config/auth and pass through):

```tsx
import { useWebSocketAudio as useWebSocketAudioHook } from '@gnani/web-voice-hook';
import type { IUseWebVoiceOptions } from '@gnani/web-voice-hook';
import { useMemo } from 'react';
import { v4 } from 'uuid';

// Example: your app builds websocketUrl from agentId, auth, etc.
export const useWebSocketAudio = ({
  variant,
  agentId,
  onClose,
  isDemoMode = false,
  testerName,
  onConversationIdGenerated,
  visualizerColor,
}) => {
  const callId = useMemo(() => v4(), []);
  const authToken = useGnaniAuth()?.authToken; // your auth hook

  const websocketUrl = useMemo(() => {
    if (!agentId) return undefined;
    return buildVoiceWebSocketUrl(variant, agentId, callId, authToken, isDemoMode, testerName);
  }, [variant, agentId, callId, authToken, isDemoMode, testerName]);

  onConversationIdGenerated?.(callId);

  const hook = useWebSocketAudioHook({
    websocketUrl,
    conversationId: callId,
    visualizerOptions: { elementId: 'visualizer-canvas', color: visualizerColor },
    events: {
      onOpen: () => console.log('WebSocket connected'),
      onClose: (source) => {
        console.log('WebSocket closed', source);
        onClose?.(source);
      },
      onException: (error) => {
        console.error('WebSocket error', error);
        Sentry.captureException(error); // optional
      },
    },
    logger: { info: console.log, error: console.error },
  } as IUseWebVoiceOptions);

  return {
    ...hook,
    conversationId: callId,
  };
};
```

Then in your UI, call your wrapper (e.g. `useWebSocketAudio({ variant, agentId, onClose, ... })`) and use `connect`, `disconnect`, `startRecording`, `stopRecording`, etc.

---

## API

### Hook: `useWebSocketAudio(options)`

**Options** (`IUseWebVoiceOptions`):

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `websocketUrl` | `string` | ✅ | WebSocket URL (e.g. `wss://api.example.com/voice`). |
| `workletPath` | `string` | No | URL for the Audio Worklet. Default: `'/worklet/audio-processor.js'`. |
| `conversationId` | `string` | No | For your app; not sent by the hook. |
| `visualizerOptions` | `object` | No | `elementId`, `color`, `options`. |
| `events` | `object` | No | `onOpen`, `onClose`, `onException`. |
| `logger` | `{ info, error }` | No | Logging; defaults to console. |

**Returns:** `isConnected`, `isPlaying`, `connect`, `disconnect`, `reconnect`, `startRecording`, `stopRecording`, `isRecording`.

---

## WebSocket protocol (reference)

**Client → server:** `start`, `media` (base64 µ-law), `TTS_PLAYING`, `EOC`.  
**Server → client:** `media` (base64 TTS), `barge`/`BARGE`, `EOC`, `stop`.

---

## Pushing changes (release steps)

When publishing a new patch version of this package, from the repo root run:

```bash
pnpm run release:patch
```

This script: builds the package, stages all changes, commits with message `build: v<current-version>` (or skips commit if nothing to commit), bumps the patch version, then pushes commits and tags.

For a **minor** or **major** bump, run the steps manually and use `pnpm version minor` or `pnpm version major` instead of `pnpm version patch` before pushing.

Consumers can then install the new tag, e.g. `#v1.0.2`.

---

## Troubleshooting

- **“Failed to load worklet”** — Serve `audio-processor.js` at `workletPath` (e.g. under `public/worklet/`).
- **No sound / no mic** — Check mic permissions; use `events.onException` and `logger`.
- **Visualizer not showing** — Set `visualizerOptions.elementId` to a mounted element id; install `audiomotion-analyzer`.

---

## TypeScript

```ts
import type { IUseWebVoiceOptions, IWebVoiceLogger, ISocketEventData, ISocketMessage } from '@gnani/web-voice-hook';
```
