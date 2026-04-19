import { PitchDetector } from './PitchDetector';
import { TunerEngine } from './TunerEngine';
import { GlassesDisplay } from './GlassesDisplay';

const GLASSES_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 2048;
// 4 Hz — fast enough to feel responsive, slow enough to let the median smooth settle.
const DETECTION_INTERVAL_MS = 250;
// Guitar fundamentals span roughly low-B (~62 Hz in 5-string extended tunings) to E6 (~1318 Hz);
// widen if you later target bass or other instruments.
const GUITAR_MIN_HZ = 50;
const GUITAR_MAX_HZ = 1000;

(window as any).__appStarted = true;
document.getElementById('status')!.textContent = 'App code running...';

console.log('[Main] Guitar Tuner JS loaded');

const pitchDetector = new PitchDetector();
const tunerEngine = new TunerEngine();
const glassesDisplay = new GlassesDisplay();

const audioBuffer = new Float32Array(BUFFER_SIZE);
let bufferWritePos = 0;
let lastDetection = 0;

const statusEl = document.getElementById('status')!;

glassesDisplay.setOnStatus((msg, ok) => {
  statusEl.textContent = msg;
  statusEl.className = ok ? 'connected' : '';
});

glassesDisplay.setOnTuningChange((direction) => {
  if (direction === 'next') tunerEngine.nextTuning();
  else tunerEngine.prevTuning();
  glassesDisplay.updateTuningHeader(tunerEngine.currentTuning).catch(() => {});
});

glassesDisplay.setOnAudioData((pcm: Uint8Array) => {
  const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  for (let i = 0; i < int16.length; i++) {
    audioBuffer[bufferWritePos] = int16[i] / 32768;
    bufferWritePos = (bufferWritePos + 1) % BUFFER_SIZE;
  }

  const now = performance.now();
  if (now - lastDetection < DETECTION_INTERVAL_MS) return;
  lastDetection = now;

  const ordered = new Float32Array(BUFFER_SIZE);
  for (let i = 0; i < BUFFER_SIZE; i++) {
    ordered[i] = audioBuffer[(bufferWritePos + i) % BUFFER_SIZE];
  }

  const frequency = pitchDetector.detect(ordered, GLASSES_SAMPLE_RATE);
  if (frequency === null || frequency < GUITAR_MIN_HZ || frequency > GUITAR_MAX_HZ) return;

  const result = tunerEngine.analyze(frequency);
  if (result) {
    glassesDisplay.update(result, tunerEngine.currentTuning).catch(() => {});
  }
});

window.addEventListener('beforeunload', () => {
  glassesDisplay.stopMic().catch(() => {});
});

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
