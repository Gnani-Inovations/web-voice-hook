/**
 * useWebVoice — React hook for real-time WebSocket voice (STT/TTS)
 *
 * Handles: mic capture → WebSocket, TTS playback ← WebSocket, optional visualizer,
 * connect / disconnect / reconnect with full cleanup.
 *
 * @see README.md for setup (worklet path, peer deps) and usage examples.
 */

import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { ISocketEventData, IUseWebVoiceOptions } from './webVoice';
import {
  applyCustomColor,
  base64ToPCM16Data,
  convertPCMDataToFloat32,
  getBase64Audio,
  getVisualizerOptions,
  resampleAudio,
  resetAudioInput,
} from './webVoiceUtils';

/** Default sample rate for capture and playback (Hz). */
const SAMPLE_RATE = 44100;
export const CHANNELS = 1;
export const BITS_PER_SAMPLE = 16;

/** Default logger when none is provided (console; safe for package use). */
const defaultLogger = {
  info: (arg: unknown, ...args: unknown[]) =>
    // eslint-disable-next-line no-console
    console.log('[GnaniWebVoice]', arg, ...args),
  error: (arg: unknown, ...args: unknown[]) =>
    // eslint-disable-next-line no-console
    console.error('[GnaniWebVoice]', arg, ...args),
};

const DEFAULT_WORKLET_PATH = '/worklet/audio-processor.js';

/**
 * React hook for bidirectional WebSocket voice: mic → server, TTS ← server.
 *
 * @param options - websocketUrl, optional workletPath, visualizerOptions, events, logger.
 * @returns { isConnected, isPlaying, connect, disconnect, reconnect, startRecording, stopRecording, isRecording }
 */
export const useWebSocketAudio = ({
  websocketUrl,
  workletPath = DEFAULT_WORKLET_PATH,
  visualizerOptions: {
    elementId: visualizerElementId,
    color: visualizerColor,
    options: visualizerOptions,
  } = {},
  events: eventsOption,
  logger: loggerOption,
}: IUseWebVoiceOptions) => {
  const { onOpen, onClose, onException } = eventsOption ?? {};
  const logger = loggerOption ?? defaultLogger;

  const [isPlaying, setIsPlaying] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const isFirstChunk = useRef(true);
  const streamRef = useRef<MediaStream>();
  const isAudioNodesConnected = useRef(false);
  const isCleanedUp = useRef(false);
  const backendSampleRate = useRef(SAMPLE_RATE);
  const isStopReceived = useRef(false);
  const lastSentTTSEvent = useRef(false);
  const chunkReceivedAt = useRef(0);

  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const isPlayingAudio = useRef(false);

  const BUFFER_DURATION = 1; // Buffer duration in seconds
  const bufferSize = SAMPLE_RATE * CHANNELS * BUFFER_DURATION; // Calculate buffer size based on sample rate and channels

  const audioBufferRef = useRef<Float32Array[]>([]);

  // Create a single AudioContext instance
  const getOrCreateAudioContext = useCallback(() => {
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === 'closed'
    ) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
        latencyHint: 'playback',
      });
    }
    return audioContextRef.current;
  }, []);

  const initializeVisualizer = useCallback(
    (source: AudioBufferSourceNode | MediaStreamAudioSourceNode) => {
      if (visualizerElementId && !analyzerRef.current && !isCleanedUp.current) {
        const analyzer = new AudioMotionAnalyzer(
          document.getElementById(visualizerElementId)!,
          {
            ...(visualizerOptions ?? getVisualizerOptions(source)),
          }
        );

        // Start the analyzer
        analyzer.start();

        if (visualizerColor) {
          applyCustomColor(analyzer, visualizerColor);
        }

        analyzerRef.current = analyzer;
      } else {
        analyzerRef.current?.connectInput(source);
      }
    },
    []
  );

  const setupAudioStream = useCallback(async () => {
    if (isAudioNodesConnected.current) return;

    resetAudioInput(streamRef.current);

    try {
      // Enhanced audio constraints with stronger echo cancellation
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: CHANNELS,
          echoCancellation: {
            ideal: true,
          },
          noiseSuppression: {
            ideal: true,
          },
          autoGainControl: {
            ideal: true,
          },
        },
      });

      const audioContext = getOrCreateAudioContext();

      const source = audioContext.createMediaStreamSource(streamRef.current);

      // Adjusted compressor settings for echo reduction
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.knee.value = 40;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.1;

      // Reduced gain to prevent feedback
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.2;

      // Don't connect to destination to prevent feedback loop
      source.connect(compressor).connect(gainNode);

      initializeVisualizer(source);

      isAudioNodesConnected.current = true;
    } catch (e) {
      logger.error('Error setting up audio stream:', e);
      onException?.(e as unknown as Error);
      throw e;
    }
  }, [getOrCreateAudioContext, initializeVisualizer]);

  const { startProcessing, stopProcessing, isProcessing } = useMemo(() => {
    let audioWorkletNode: AudioWorkletNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;

    const start = async () => {
      if (!streamRef.current) return;

      try {
        const audioContext = getOrCreateAudioContext();

        // Load the Audio Worklet (path configurable via workletPath option)
        await audioContext.audioWorklet.addModule(workletPath);

        sourceNode = audioContext.createMediaStreamSource(streamRef.current);

        audioWorkletNode = new AudioWorkletNode(
          audioContext,
          'audio-processor',
          {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
            processorOptions: {
              sampleRate: audioContext.sampleRate,
            },
          }
        );

        // Update message handling to match the worklet's message format
        audioWorkletNode.port.onmessage = (event) => {
          if (websocketRef.current?.readyState === WebSocket.OPEN) {
            const { data, timestamp } = event.data;
            const base64Data = getBase64Audio(data);

            websocketRef.current.send(
              JSON.stringify({
                event: 'media',
                media: {
                  payload: base64Data,
                  timestamp,
                },
              })
            );
          }
        };

        sourceNode.connect(audioWorkletNode);
      } catch (error) {
        logger.error('Failed to start audio processing:', error);
        onException?.(error as unknown as Error);
      }
    };

    const stop = () => {
      if (audioWorkletNode) {
        audioWorkletNode.disconnect();
        audioWorkletNode = null;
      }
      if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
      }
    };

    return {
      startProcessing: start,
      stopProcessing: stop,
      isProcessing: !!audioWorkletNode,
    };
  }, [getOrCreateAudioContext, workletPath]);

  const processAudioChunk = useCallback(
    (payload: string) => {
      // Use the existing AudioContext instead of creating a new one
      getOrCreateAudioContext();

      try {
        // Convert base64 to 16-bit PCM format
        const pcm16Data = base64ToPCM16Data(payload);
        const float32Data = convertPCMDataToFloat32(pcm16Data);

        // Resample audio data if necessary
        const rightSampled =
          backendSampleRate.current === SAMPLE_RATE
            ? float32Data
            : resampleAudio(
                float32Data,
                backendSampleRate.current,
                SAMPLE_RATE
              );

        audioBufferRef.current.push(rightSampled);

        // Start playback if we have enough data
        if (
          audioBufferRef.current.reduce(
            (acc, chunk) => acc + chunk.length,
            0
          ) >= bufferSize
        ) {
          playNextChunk();
        }
      } catch (error) {
        logger.error('Error processing audio chunk:', error);
      }
    },
    [getOrCreateAudioContext]
  );

  const playNextChunk = useCallback(() => {
    // Check if audio context exists
    const audioContext = getOrCreateAudioContext();
    if (!audioContext || isPlayingAudio.current) return; // Prevent multiple calls

    // Declare variable to hold our audio data
    let audioData: Float32Array;

    if (audioBufferRef.current.length === 0) {
      isPlayingAudio.current = false;
      setIsPlaying(false);

      websocketRef.current?.send(
        JSON.stringify({
          event: 'TTS_PLAYING',
          media: {
            tts_playing: false,
          },
        })
      );

      lastSentTTSEvent.current = false;

      // Create 1 second of silence
      const silenceLength = Math.floor(
        backendSampleRate.current * BUFFER_DURATION * 2
      );
      audioData = new Float32Array(silenceLength).fill(0);
    } else {
      if (!lastSentTTSEvent.current) {
        websocketRef.current?.send(
          JSON.stringify({
            event: 'TTS_PLAYING',
            media: {
              tts_playing: true,
            },
          })
        );
        lastSentTTSEvent.current = true;
      }

      isPlayingAudio.current = true; // Set to true to indicate playback is in progress
      setIsPlaying(true);
      // Take chunks from the buffer until we have enough data
      let totalLength = 0;
      const chunks: Float32Array[] = [];

      while (audioBufferRef.current.length > 0 && totalLength < bufferSize) {
        const chunk = audioBufferRef.current.shift()!;
        chunks.push(chunk);
        totalLength += chunk.length;
      }

      // Concatenate the chunks into a single Float32Array
      audioData = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        audioData.set(chunk, offset);
        offset += chunk.length;
      }
    }

    // Create a new audio buffer with our desired specifications
    const audioBuffer = audioContext.createBuffer(
      1, // Change to 2 channels for stereo
      audioData.length, // Length of our chunk
      SAMPLE_RATE // 44100 Hz
    );

    // Copy our audio data into both channels of the newly created buffer
    audioBuffer.getChannelData(0).set(audioData); // Left channel

    // Create a new audio source node for playing this buffer
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    // Connect the source to the audio output
    source.connect(audioContext.destination);

    // Initialize the AudioMotionAnalyzer with the MediaStreamAudioSourceNode
    initializeVisualizer(source);

    // When this chunk finishes playing, immediately play the next one
    source.onended = () => {
      isPlayingAudio.current = false; // Reset playback state
      // Check if there are more chunks to play
      if (audioBufferRef.current.length > 0) {
        playNextChunk(); // Play the next chunk in the queue
      } else {
        setIsPlaying(false); // No more audio to play
        websocketRef.current?.send(
          JSON.stringify({
            event: 'TTS_PLAYING',
            media: {
              tts_playing: false,
            },
          })
        );
        lastSentTTSEvent.current = false;

        if (isStopReceived.current) {
          websocketRef.current?.close();
        }
      }
    };

    // Start playing this chunk
    source.start();
    // Keep track of current source node
    sourceNodeRef.current = source;
    // Update playing state
    isPlayingRef.current = true;
  }, [getOrCreateAudioContext, initializeVisualizer]);

  const processAudioMessage = useCallback(async (message: ISocketEventData) => {
    try {
      if (message.event === 'media' && message.media?.payload) {
        if (chunkReceivedAt.current === 0) {
          chunkReceivedAt.current = Date.now();
          logger.info('Chunk received at:', chunkReceivedAt.current);
        }
        backendSampleRate.current = message.sample_rate ?? SAMPLE_RATE;
        processAudioChunk(message.media.payload);
      } else if (['barge', 'BARGE'].includes(message.event)) {
        logger.info('Barged');
        audioBufferRef.current = [];
      } else if (message.event === 'EOC') {
        logger.info('EOC event occurred');
        websocketRef.current?.send(JSON.stringify({ event: 'EOC' }));
      } else if (message.event === 'stop') {
        logger.info('Stop event occurred');
        if (websocketRef.current?.readyState === WebSocket.OPEN) {
          isStopReceived.current = true;
        }
      } else {
        logger.info('Unhandled message type:', message);
      }
    } catch (error) {
      logger.error('Error processing audio message:', error);
    }
  }, []);

  const cleanup = useCallback(
    (source: 'server' | 'client') => {
      if (isCleanedUp.current) return;
      isCleanedUp.current = true;

      // Stop recording first
      stopProcessing();

      // Clean up WebSocket with additional state check
      if (websocketRef.current) {
        if (
          websocketRef.current.readyState === WebSocket.OPEN ||
          websocketRef.current.readyState === WebSocket.CONNECTING
        ) {
          websocketRef.current.close();
        }
        websocketRef.current = null;
      }

      analyzerRef.current?.stop();
      analyzerRef.current?.destroy();

      // Clean up audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Clean up audio source
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }

      // Clean up media stream - Enhanced cleanup
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach((track) => {
          track.stop(); // Stop the track
          track.enabled = false; // Disable the track
          streamRef.current?.removeTrack(track); // Remove from stream
        });
        streamRef.current = undefined;
      }

      // Reset all buffers and states
      audioBufferRef.current = [];
      isPlayingRef.current = false;
      isAudioNodesConnected.current = false;
      isFirstChunk.current = true;
      isPlayingAudio.current = false;
      isStopReceived.current = false;
      setIsPlaying(false);

      // Reset UI states
      setIsConnected(false);

      // Only call onClose if it wasn't already cleaned up
      onClose?.(source);
    },
    [stopProcessing, onClose]
  );

  const connect = useCallback(() => {
    // Prevent multiple connection attempts
    if (
      !websocketUrl ||
      websocketRef.current ||
      isCleanedUp.current ||
      isConnected
    ) {
      return;
    }
    // Reset all state flags
    isCleanedUp.current = false;
    isFirstChunk.current = true;

    const ws = new WebSocket(websocketUrl);

    websocketRef.current = ws;

    ws.onopen = async () => {
      if (isCleanedUp.current) {
        ws.close();
        return;
      }
      setIsConnected(true);

      await setupAudioStream();
      await startProcessing();
      ws.send(JSON.stringify({ event: 'start' }));
    };

    ws.onmessage = (event) => {
      if (isCleanedUp.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data) {
          processAudioMessage(data);
        }
      } catch (error) {
        logger.error('Error parsing websocket message:', error);
      }
    };

    ws.onclose = (e) => {
      const reason = e.reason;
      if (reason === 'LINK_EXPIRED') {
        logger.info('Link expired');
        location.reload();
      }
      // Only trigger cleanup if it wasn't manually initiated
      if (!isCleanedUp.current) {
        cleanup('server');
      }
      // Stop processing audio when WebSocket closes
      stopProcessing(); // Ensure audio processing stops
    };

    ws.onerror = (error) => {
      logger.error('WebSocket error:', error);
      onException?.(error as unknown as Error);
      // Ensure we're not in a cleanup state before triggering another cleanup
      if (!isCleanedUp.current) {
        cleanup('server');
      }
    };
  }, [
    websocketUrl,
    onOpen,
    onClose,
    onException,
    setupAudioStream,
    startProcessing,
    isConnected,
  ]);

  const disconnect = useCallback(() => {
    cleanup('client');
  }, [cleanup]);

  const reconnect = useCallback(
    (onConnectionSuccess?: () => void) => {
      // Force cleanup any existing connection first
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }

      // Reset all state flags to ensure clean reconnection
      isCleanedUp.current = false;
      isFirstChunk.current = true;
      isPlayingRef.current = false;
      isAudioNodesConnected.current = false;
      isPlayingAudio.current = false;
      isStopReceived.current = false;

      // Reset UI states
      setIsConnected(false);
      setIsPlaying(false);

      // Clear audio buffer
      audioBufferRef.current = [];

      // Clean up audio context if it exists
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Clean up audio source
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }

      // Clean up analyzer
      if (analyzerRef.current) {
        analyzerRef.current.stop();
        analyzerRef.current.destroy();
        analyzerRef.current = null;
      }

      // Clean up media stream
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach((track) => {
          track.stop();
          track.enabled = false;
          streamRef.current?.removeTrack(track);
        });
        streamRef.current = undefined;
      }

      // Stop any ongoing processing
      stopProcessing();

      // Now create a new connection
      if (!websocketUrl) {
        logger.error('Cannot reconnect: websocketUrl is required');
        return;
      }

      const ws = new WebSocket(websocketUrl);

      websocketRef.current = ws;

      ws.onopen = async () => {
        if (isCleanedUp.current) {
          ws.close();
          return;
        }
        setIsConnected(true);

        await setupAudioStream();
        await startProcessing();
        ws.send(JSON.stringify({ event: 'start' }));
        onConnectionSuccess?.();
      };

      ws.onmessage = (event) => {
        if (isCleanedUp.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data) {
            processAudioMessage(data);
          }
        } catch (error) {
          logger.error('Error parsing websocket message:', error);
          onException?.(error as unknown as Error);
        }
      };

      ws.onclose = (e) => {
        const reason = e.reason;
        if (reason === 'LINK_EXPIRED') {
          logger.info('Link expired');
          location.reload();
        }
        // Only trigger cleanup if it wasn't manually initiated
        if (!isCleanedUp.current) {
          cleanup('server');
        }
        // Stop processing audio when WebSocket closes
        stopProcessing();
      };

      ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        onException?.(error as unknown as Error);
        // Ensure we're not in a cleanup state before triggering another cleanup
        if (!isCleanedUp.current) {
          cleanup('server');
        }
      };
    },
    [
      websocketUrl,
      onOpen,
      onClose,
      onException,
      setupAudioStream,
      startProcessing,
      stopProcessing,
      cleanup,
    ]
  );

  return {
    isConnected,
    isPlaying,
    startRecording: startProcessing,
    stopRecording: stopProcessing,
    isRecording: isProcessing,
    connect,
    disconnect,
    reconnect,
  };
};
