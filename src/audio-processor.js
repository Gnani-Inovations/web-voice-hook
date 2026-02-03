/**
 * Audio Worklet: captures mic input and posts 400ms chunks to the main thread.
 * Must be served from a path reachable by the app (e.g. public/worklet/audio-processor.js).
 * Main thread sends base64 µ-law over WebSocket (see useWebVoice.ts).
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { sampleRate = 44100 } = options.processorOptions ?? {};
    this.bufferSize = Math.floor((sampleRate * 400) / 1000);
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];

    // Fill the buffer with new samples
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIndex] = samples[i];
      this.bufferIndex++;

      // When buffer is full (200ms of audio), send it
      if (this.bufferIndex >= this.bufferSize) {
        // Send the filled buffer
        this.port.postMessage({
          type: 'audio-data',
          data: this.buffer.slice(),
          timestamp: currentTime,
        });

        // Reset buffer index to start filling again
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
