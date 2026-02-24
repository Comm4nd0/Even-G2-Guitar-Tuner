import { PitchDetector } from './PitchDetector';
import { TunerEngine } from './TunerEngine';
import { GlassesDisplay } from './GlassesDisplay';

console.log('[Main] Guitar Tuner JS loaded');

const pitchDetector = new PitchDetector();
const tunerEngine = new TunerEngine();
const glassesDisplay = new GlassesDisplay();

// Audio buffer for accumulating PCM chunks from glasses mic
const GLASSES_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 2048;
const audioBuffer = new Float32Array(BUFFER_SIZE);
let bufferWritePos = 0;
let lastDetection = 0;

const statusEl = document.getElementById('status')!;

// Status display on phone (minimal)
glassesDisplay.setOnStatus((msg, ok) => {
  statusEl.textContent = msg;
  statusEl.className = ok ? 'connected' : '';
});

// Ring / glasses tap → change tuning
glassesDisplay.setOnTuningChange((direction) => {
  if (direction === 'next') tunerEngine.nextTuning();
  else tunerEngine.prevTuning();
  glassesDisplay.updateTuningHeader(tunerEngine.currentTuning).catch(() => {});
});

// Glasses mic audio → pitch detection
glassesDisplay.setOnAudioData((pcm: Uint8Array) => {
  // Convert 16-bit signed PCM to Float32
  const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  for (let i = 0; i < int16.length; i++) {
    audioBuffer[bufferWritePos] = int16[i] / 32768;
    bufferWritePos = (bufferWritePos + 1) % BUFFER_SIZE;
  }

  // Throttle detection to ~4Hz
  const now = performance.now();
  if (now - lastDetection < 250) return;
  lastDetection = now;

  // Build contiguous buffer ordered by time for YIN
  const ordered = new Float32Array(BUFFER_SIZE);
  for (let i = 0; i < BUFFER_SIZE; i++) {
    ordered[i] = audioBuffer[(bufferWritePos + i) % BUFFER_SIZE];
  }

  const frequency = pitchDetector.detect(ordered, GLASSES_SAMPLE_RATE);
  if (frequency !== null && frequency > 50 && frequency < 1000) {
    const result = tunerEngine.analyze(frequency);
    glassesDisplay.update(result, tunerEngine.currentTuning).catch(() => {});
  }
});

// Connect to glasses and auto-start mic
glassesDisplay.init().then(async (connected) => {
  if (!connected) return;

  const micOk = await glassesDisplay.startMic();
  if (micOk) {
    statusEl.textContent = 'Tuner active on glasses';
    statusEl.className = 'connected';
    glassesDisplay.updateTuningHeader(tunerEngine.currentTuning).catch(() => {});
  } else {
    statusEl.textContent = 'Failed to start glasses mic';
    statusEl.className = '';
  }
}).catch((err) => {
  console.error('[Main] Glasses init error:', err);
});
