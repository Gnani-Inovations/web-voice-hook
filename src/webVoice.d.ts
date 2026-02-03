/**
 * GnaniWebVoiceHook — Type definitions
 *
 * Shared types for the WebSocket voice hook and server protocol.
 */

import type { ConstructorOptions } from 'audiomotion-analyzer';

/** Server-sent or client-sent WebSocket message payload (JSON). */
export interface ISocketEventData {
  event: 'media' | 'start' | 'stop' | 'barge' | 'EOC';
  media: {
    payload: string;
  };
  sample_rate?: number;
}

export type ISocketMessage = ISocketEventData | string | Blob;

/** Logger interface; pass your own or use the default (console). */
export interface IWebVoiceLogger {
  info: (arg: unknown, ...args: unknown[]) => void;
  error: (arg: unknown, ...args: unknown[]) => void;
}

/** Options for useWebSocketAudio / useWebVoice hook. */
export interface IUseWebVoiceOptions {
  /** WebSocket URL to connect to (e.g. wss://api.example.com/voice). */
  websocketUrl: string;
  /** Optional; used by your app for correlation (not sent by this hook). */
  conversationId?: string;
  /** Optional; URL for the Audio Worklet. Default: embedded (no hosting). Pass a URL if you serve the worklet yourself. */
  workletPath?: string;
  visualizerOptions?: {
    /** DOM element id for the audiomotion-analyzer canvas. */
    elementId?: string;
    /** Override bar color (e.g. '#9E77ED'). */
    color?: string;
    /** Full audiomotion-analyzer constructor options. */
    options?: ConstructorOptions;
  };
  /** Lifecycle and error callbacks. */
  events?: {
    onOpen?: () => void;
    onClose?: (source: 'server' | 'client') => void;
    onException?: (error: Error) => void;
  };
  /** Optional logger; defaults to console. Pass { info, error } for your app logger. */
  logger?: IWebVoiceLogger;
}
