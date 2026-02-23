import { PitchDetector } from './PitchDetector';
import { TunerEngine } from './TunerEngine';
import { CanvasGauge } from './CanvasGauge';
import { GlassesDisplay } from './GlassesDisplay';

const pitchDetector = new PitchDetector();
const tunerEngine = new TunerEngine();
const glassesDisplay = new GlassesDisplay();

let phoneGauge: CanvasGauge;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let listening = false;

// DOM elements
const noteNameEl = document.getElementById('note-name')!;
const octaveEl = document.getElementById('octave-number')!;
const centsValueEl = document.getElementById('cents-value')!;
const freqValueEl = document.getElementById('freq-value')!;
const tuningNameEl = document.getElementById('tuning-name')!;
const stringTargetsEl = document.getElementById('string-targets')!;
const startBtn = document.getElementById('start-btn')!;
const prevBtn = document.getElementById('tuning-prev')!;
const nextBtn = document.getElementById('tuning-next')!;
const gaugeCanvas = document.getElementById('gauge') as HTMLCanvasElement;

// Initialize
phoneGauge = new CanvasGauge(gaugeCanvas);
renderStringTargets();

// Glasses: try to connect (non-blocking)
glassesDisplay.init().then((connected) => {
  if (connected) {
    console.log('Glasses connected');
    glassesDisplay.setOnTuningChange(() => {
      tunerEngine.nextTuning();
      updateTuningUI();
    });
  }
});

// Event listeners
startBtn.addEventListener('click', toggleListening);
prevBtn.addEventListener('click', () => {
  tunerEngine.prevTuning();
  updateTuningUI();
});
nextBtn.addEventListener('click', () => {
  tunerEngine.nextTuning();
  updateTuningUI();
});

async function toggleListening(): Promise<void> {
  if (listening) {
    stopListening();
    return;
  }

  try {
    audioContext = new AudioContext({ sampleRate: 48000 });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);

    listening = true;
    startBtn.textContent = 'Listening...';
    startBtn.classList.add('listening');

    phoneGauge.startAnimation();
    detectionLoop();
  } catch (e) {
    console.error('Microphone access denied:', e);
    startBtn.textContent = 'Mic Access Denied';
    setTimeout(() => {
      startBtn.textContent = 'Tap to Start';
    }, 2000);
  }
}

function stopListening(): void {
  listening = false;
  if (audioContext) {
    audioContext.close();
    audioContext = null;
    analyser = null;
  }
  startBtn.textContent = 'Tap to Start';
  startBtn.classList.remove('listening');
  resetDisplay();
}

let lastGlassesUpdate = 0;

function detectionLoop(): void {
  if (!listening || !analyser || !audioContext) return;

  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);

  const frequency = pitchDetector.detect(buffer, audioContext.sampleRate);

  if (frequency !== null && frequency > 50 && frequency < 1000) {
    const result = tunerEngine.analyze(frequency);

    // Update phone UI
    phoneGauge.update(result.centsOff);
    noteNameEl.textContent = result.noteName;
    noteNameEl.className = result.inTune ? 'in-tune' : result.centsOff > 0 ? 'sharp' : 'flat';
    octaveEl.textContent = String(result.octave);
    centsValueEl.textContent = (result.centsOff > 0 ? '+' : '') + String(result.centsOff);
    freqValueEl.textContent = result.frequency.toFixed(1);

    // Highlight active string target
    highlightActiveString(result.nearestString?.note ?? null);

    // Update glasses (throttled to ~10Hz)
    const now = performance.now();
    if (now - lastGlassesUpdate > 100) {
      lastGlassesUpdate = now;
      glassesDisplay.update(result, tunerEngine.currentTuning).catch(() => {});
    }
  }

  requestAnimationFrame(detectionLoop);
}

function renderStringTargets(): void {
  const tuning = tunerEngine.currentTuning;
  stringTargetsEl.innerHTML = '';

  for (const s of tuning.strings) {
    const el = document.createElement('div');
    el.className = 'string-target';
    el.textContent = s.note.replace(/[0-9]/g, '');
    el.dataset.note = s.note;
    stringTargetsEl.appendChild(el);
  }
}

function highlightActiveString(activeNote: string | null): void {
  const targets = stringTargetsEl.querySelectorAll('.string-target');
  targets.forEach((el) => {
    const target = el as HTMLElement;
    if (activeNote && target.dataset.note === activeNote) {
      target.classList.add('active');
    } else {
      target.classList.remove('active');
    }
  });
}

function updateTuningUI(): void {
  tuningNameEl.textContent = tunerEngine.currentTuning.name;
  renderStringTargets();
  glassesDisplay.updateTuningHeader(tunerEngine.currentTuning).catch(() => {});
}

function resetDisplay(): void {
  noteNameEl.textContent = '--';
  noteNameEl.className = '';
  octaveEl.textContent = '';
  centsValueEl.textContent = '0';
  freqValueEl.textContent = '--';
  phoneGauge.update(0);

  const targets = stringTargetsEl.querySelectorAll('.string-target');
  targets.forEach((el) => el.classList.remove('active'));
}
