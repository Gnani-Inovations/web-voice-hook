/**
 * webVoiceUtils — Audio encoding/decoding and visualizer helpers
 *
 * Used by useWebVoice for: Float32 → PCM → µ-law → base64 (outbound),
 * base64 → PCM16 → Float32 (inbound), resampling, and audiomotion-analyzer options.
 */

import type {
  AudioMotionAnalyzer,
  ConstructorOptions,
} from 'audiomotion-analyzer';

/** Float32 [-1, 1] → Int16 PCM for encoding. */
export function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

export const base64ToPCM16Data = (base64Data: string) => {
  const binaryString = atob(base64Data);
  // Create ArrayBuffer to store binary data
  const buffer = new ArrayBuffer(binaryString.length);
  // Create view to write to buffer
  const view = new Uint8Array(buffer);

  // Copy each byte from binary string to buffer
  for (let i = 0; i < binaryString.length; i++) {
    view[i] = binaryString.charCodeAt(i);
  }

  // Convert buffer to 16-bit PCM format
  const pcm16Data = new Int16Array(buffer);

  return pcm16Data;
};

export function linearToMuLaw(pcm: Int16Array): Uint8Array {
  const BIAS = 0x84;
  const CLIP = 32635;
  const muLawCompressed = new Uint8Array(pcm.length);

  for (let i = 0; i < pcm.length; i++) {
    // Get 16-bit PCM sample
    let sample = pcm[i];

    // Apply bias
    let sign = (sample >> 8) & 0x80;
    if (sign) {
      sample = -sample;
    }

    // Clip sample to max value
    if (sample > CLIP) {
      sample = CLIP;
    }

    sample = sample + BIAS;

    // Convert to mu-law
    let exponent = 7;
    let mantissa;
    for (; exponent > 0; exponent--) {
      if (sample & 0x4000) break;
      sample <<= 1;
    }
    mantissa = (sample >> 9) & 0x0f;
    let ulawByte = ~(sign | (exponent << 4) | mantissa);

    // Clamp to 8 bits
    muLawCompressed[i] = ulawByte & 0xff;
  }

  return muLawCompressed;
}

export const getBase64Audio = (audioData: Float32Array) => {
  const pcmData = floatTo16BitPCM(audioData);
  // Convert to µ-law
  const muLawData = linearToMuLaw(pcmData);
  // Convert to base64
  const base64Data = btoa(
    String.fromCharCode.apply(null, Array.from(muLawData))
  );

  return base64Data;
};

export const resetAudioInput = (stream?: MediaStream) => {
  stream?.getTracks().forEach((track) => track.stop());
};

export const createWavHeader = (dataLength: number) => {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // "RIFF" chunk descriptor
  view.setUint8(0, 'R'.charCodeAt(0));
  view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0));
  view.setUint8(3, 'F'.charCodeAt(0));

  // Total file size
  view.setUint32(4, dataLength + 36, true);

  // "WAVE" format
  view.setUint8(8, 'W'.charCodeAt(0));
  view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0));
  view.setUint8(11, 'E'.charCodeAt(0));

  // "fmt " sub-chunk
  view.setUint8(12, 'f'.charCodeAt(0));
  view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0));
  view.setUint8(15, ' '.charCodeAt(0));

  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, CHANNELS, true); // NumChannels
  view.setUint32(24, SAMPLE_RATE, true); // SampleRate
  view.setUint32(28, SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), true); // ByteRate
  view.setUint16(32, CHANNELS * (BITS_PER_SAMPLE / 8), true); // BlockAlign
  view.setUint16(34, BITS_PER_SAMPLE, true); // BitsPerSample

  // "data" sub-chunk
  view.setUint8(36, 'd'.charCodeAt(0));
  view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0));
  view.setUint8(39, 'a'.charCodeAt(0));

  view.setUint32(40, dataLength, true); // Subchunk2Size

  return buffer;
};

export const getAudioWorkletModule = () =>
  URL.createObjectURL(
    new Blob(
      [
        `
  class AudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs) {
      const input = inputs[0][0];
      if (input) {
        this.port.postMessage(input);
      }
      return true;
    }
  }
  registerProcessor('audio-processor', AudioProcessor);
`,
      ],
      { type: 'text/javascript' }
    )
  );

export const convertPCMDataToFloat32 = (pcm16Data: Int16Array) => {
  const float32Data = new Float32Array(pcm16Data.length);
  for (let i = 0; i < pcm16Data.length; i++) {
    float32Data[i] = pcm16Data[i] / (pcm16Data[i] < 0 ? 0x8000 : 0x7fff);
  }

  return float32Data;
};

export const convertPCMDataWithWavHeaderToFloat32 = (pcm16Data: Int16Array) => {
  const wavHeader = createWavHeader(pcm16Data.byteLength);
  const headerView = new Int16Array(wavHeader);

  // Combine header with PCM data
  const combinedBuffer = new Int16Array(headerView.length + pcm16Data.length);
  combinedBuffer.set(headerView); // Add header first
  combinedBuffer.set(pcm16Data, headerView.length); // Add PCM data after

  // Convert combined data to float32 format (-1.0 to 1.0)
  const float32Data = convertPCMDataToFloat32(combinedBuffer);

  return float32Data;
};

export const SAMPLE_RATE = 44100;
export const CHANNELS = 1;
export const BITS_PER_SAMPLE = 16;

export const WORKLET_NODE_OPTIONS = {
  processorOptions: {
    sampleRate: SAMPLE_RATE,
    channelCount: CHANNELS,
  },
  numberOfInputs: 1,
  numberOfOutputs: 1,
  channelCount: CHANNELS,
};

export const resampleAudio = (
  audioData: Float32Array,
  originalSampleRate: number,
  targetSampleRate: number
): Float32Array => {
  // Calculate the ratio between the two sample rates
  const ratio = targetSampleRate / originalSampleRate;

  // Calculate the length of the downsampled audio
  const newLength = Math.floor(audioData.length * ratio);
  const result = new Float32Array(newLength);

  // Simple linear interpolation for downsampling
  for (let i = 0; i < newLength; i++) {
    // Find the position in the original array
    const position = i / ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    // If we're at the end of the array, just use the last sample
    if (index >= audioData.length - 1) {
      result[i] = audioData[audioData.length - 1];
    } else {
      // Linear interpolation between the two nearest samples
      result[i] =
        audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
    }
  }

  return result;
};

export const getVisualizerOptions = (
  source: AudioBufferSourceNode | MediaStreamAudioSourceNode
): ConstructorOptions => ({
  source: source,
  smoothing: 0.8, // Adjust smoothing for a more fluid wave
  lineWidth: 16,
  maxFreq: 1300,
  mode: 2,
  width: 400,
  height: 200,
  volume: 0,
  showScaleX: false,
  showPeaks: false,
  alphaBars: false,
  ansiBands: false,
  barSpace: 0.75,
  bgAlpha: 1,
  channelLayout: 'single',
  fadePeaks: false,
  fillAlpha: 1,
  frequencyScale: 'log',
  gradient: 'prism',
  gravity: 8,
  ledBars: false,
  linearAmplitude: true,
  linearBoost: 1.6,
  loRes: false,
  lumiBars: false,
  maxDecibels: -35,
  maxFPS: 0,
  minDecibels: -85,
  minFreq: 300,
  mirror: 0,
  noteLabels: false,
  outlineBars: true,
  overlay: true,
  peakFadeTime: 750,
  peakHoldTime: 500,
  peakLine: false,
  radial: false,
  radialInvert: false,
  radius: 0.3,
  reflexAlpha: 1,
  reflexBright: 1,
  reflexFit: true,
  reflexRatio: 0.5,
  roundBars: true,
  showBgColor: false,
  showFPS: false,
  showScaleY: false,
  spinSpeed: 1,
  splitGradient: false,
  trueLeds: false,
  useCanvas: true,
  weightingFilter: 'A',
});

// Custom function to apply custom color to the visualizer
export const applyCustomColor = (
  analyzer: AudioMotionAnalyzer,
  color?: string
) => {
  if (analyzer && analyzer.canvas) {
    const canvas = analyzer.canvas;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Store the original drawImage method
    const originalDrawImage = ctx.drawImage;

    // Override the canvas rendering to use solid red only for the bars
    ctx.drawImage = function (image: CanvasImageSource, ...args: number[]) {
      // First draw the original image
      (originalDrawImage as any).apply(ctx, [image, ...args]);

      // Then apply red color only to non-transparent areas (the bars)
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = color ?? '#9E77ED'; // Solid red with high opacity
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    } as any;
  }
};
