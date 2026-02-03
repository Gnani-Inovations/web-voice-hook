/**
 * useWebVoice — React hook for real-time WebSocket voice (STT/TTS)
 *
 * Handles: mic capture → WebSocket, TTS playback ← WebSocket, optional visualizer,
 * connect / disconnect / reconnect with full cleanup.
 *
 * @see README.md for setup (worklet path, peer deps) and usage examples.
 */
import type { IUseWebVoiceOptions } from './webVoice';
export declare const CHANNELS = 1;
export declare const BITS_PER_SAMPLE = 16;
/**
 * React hook for bidirectional WebSocket voice: mic → server, TTS ← server.
 *
 * @param options - websocketUrl, optional workletPath, visualizerOptions, events, logger.
 * @returns { isConnected, isPlaying, connect, disconnect, reconnect, startRecording, stopRecording, isRecording }
 */
export declare const useWebSocketAudio: ({ websocketUrl, workletPath, visualizerOptions: { elementId: visualizerElementId, color: visualizerColor, options: visualizerOptions, }, events: eventsOption, logger: loggerOption, }: IUseWebVoiceOptions) => {
    isConnected: boolean;
    isPlaying: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    isRecording: boolean;
    connect: () => void;
    disconnect: () => void;
    reconnect: (onConnectionSuccess?: () => void) => void;
};
//# sourceMappingURL=useWebVoice.d.ts.map