/**
 * webVoiceUtils — Audio encoding/decoding and visualizer helpers
 *
 * Used by useWebVoice for: Float32 → PCM → µ-law → base64 (outbound),
 * base64 → PCM16 → Float32 (inbound), resampling, and audiomotion-analyzer options.
 */
import type { AudioMotionAnalyzer, ConstructorOptions } from 'audiomotion-analyzer';
/** Float32 [-1, 1] → Int16 PCM for encoding. */
export declare function floatTo16BitPCM(float32Array: Float32Array): Int16Array;
export declare const base64ToPCM16Data: (base64Data: string) => Int16Array;
export declare function linearToMuLaw(pcm: Int16Array): Uint8Array;
export declare const getBase64Audio: (audioData: Float32Array) => string;
export declare const resetAudioInput: (stream?: MediaStream) => void;
export declare const createWavHeader: (dataLength: number) => ArrayBuffer;
export declare const getAudioWorkletModule: () => string;
export declare const convertPCMDataToFloat32: (pcm16Data: Int16Array) => Float32Array;
export declare const convertPCMDataWithWavHeaderToFloat32: (pcm16Data: Int16Array) => Float32Array;
export declare const SAMPLE_RATE = 44100;
export declare const CHANNELS = 1;
export declare const BITS_PER_SAMPLE = 16;
export declare const WORKLET_NODE_OPTIONS: {
    processorOptions: {
        sampleRate: number;
        channelCount: number;
    };
    numberOfInputs: number;
    numberOfOutputs: number;
    channelCount: number;
};
export declare const resampleAudio: (audioData: Float32Array, originalSampleRate: number, targetSampleRate: number) => Float32Array;
export declare const getVisualizerOptions: (source: AudioBufferSourceNode | MediaStreamAudioSourceNode) => ConstructorOptions;
export declare const applyCustomColor: (analyzer: AudioMotionAnalyzer, color?: string) => void;
//# sourceMappingURL=webVoiceUtils.d.ts.map