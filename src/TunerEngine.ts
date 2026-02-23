import { TuningMode, TuningString, DetectionResult } from './types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const TUNINGS: TuningMode[] = [
  {
    name: 'Standard',
    strings: [
      { note: 'E2', frequency: 82.41 },
      { note: 'A2', frequency: 110.00 },
      { note: 'D3', frequency: 146.83 },
      { note: 'G3', frequency: 196.00 },
      { note: 'B3', frequency: 246.94 },
      { note: 'E4', frequency: 329.63 },
    ],
  },
  {
    name: 'Drop D',
    strings: [
      { note: 'D2', frequency: 73.42 },
      { note: 'A2', frequency: 110.00 },
      { note: 'D3', frequency: 146.83 },
      { note: 'G3', frequency: 196.00 },
      { note: 'B3', frequency: 246.94 },
      { note: 'E4', frequency: 329.63 },
    ],
  },
  {
    name: 'Half Step Down',
    strings: [
      { note: 'Eb2', frequency: 77.78 },
      { note: 'Ab2', frequency: 103.83 },
      { note: 'Db3', frequency: 138.59 },
      { note: 'Gb3', frequency: 185.00 },
      { note: 'Bb3', frequency: 233.08 },
      { note: 'Eb4', frequency: 311.13 },
    ],
  },
  {
    name: 'Open G',
    strings: [
      { note: 'D2', frequency: 73.42 },
      { note: 'G2', frequency: 98.00 },
      { note: 'D3', frequency: 146.83 },
      { note: 'G3', frequency: 196.00 },
      { note: 'B3', frequency: 246.94 },
      { note: 'D4', frequency: 293.66 },
    ],
  },
  {
    name: 'DADGAD',
    strings: [
      { note: 'D2', frequency: 73.42 },
      { note: 'A2', frequency: 110.00 },
      { note: 'D3', frequency: 146.83 },
      { note: 'G3', frequency: 196.00 },
      { note: 'A3', frequency: 220.00 },
      { note: 'D4', frequency: 293.66 },
    ],
  },
];

export class TunerEngine {
  private tuningIndex = 0;
  private frequencyHistory: number[] = [];
  private readonly historySize = 7;
  private readonly inTuneThreshold = 5; // cents

  get currentTuning(): TuningMode {
    return TUNINGS[this.tuningIndex];
  }

  get tunings(): TuningMode[] {
    return TUNINGS;
  }

  nextTuning(): TuningMode {
    this.tuningIndex = (this.tuningIndex + 1) % TUNINGS.length;
    return this.currentTuning;
  }

  prevTuning(): TuningMode {
    this.tuningIndex = (this.tuningIndex - 1 + TUNINGS.length) % TUNINGS.length;
    return this.currentTuning;
  }

  analyze(frequency: number): DetectionResult {
    // Add to history for median smoothing
    this.frequencyHistory.push(frequency);
    if (this.frequencyHistory.length > this.historySize) {
      this.frequencyHistory.shift();
    }

    const smoothedFreq = this.medianFrequency();
    const { noteName, octave, centsOff } = this.frequencyToNote(smoothedFreq);
    const nearestString = this.findNearestString(smoothedFreq);
    const inTune = Math.abs(centsOff) < this.inTuneThreshold;

    return {
      frequency: smoothedFreq,
      noteName,
      octave,
      centsOff,
      nearestString,
      inTune,
    };
  }

  private medianFrequency(): number {
    const sorted = [...this.frequencyHistory].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  private frequencyToNote(freq: number): { noteName: string; octave: number; centsOff: number } {
    const midiNote = 12 * Math.log2(freq / 440) + 69;
    const roundedMidi = Math.round(midiNote);
    const centsOff = Math.round((midiNote - roundedMidi) * 100);
    const noteName = NOTE_NAMES[((roundedMidi % 12) + 12) % 12];
    const octave = Math.floor(roundedMidi / 12) - 1;
    return { noteName, octave, centsOff };
  }

  private findNearestString(freq: number): TuningString | null {
    let closest: TuningString | null = null;
    let minCentsDiff = Infinity;

    for (const s of this.currentTuning.strings) {
      const cents = Math.abs(1200 * Math.log2(freq / s.frequency));
      if (cents < minCentsDiff) {
        minCentsDiff = cents;
        closest = s;
      }
    }

    return minCentsDiff <= 200 ? closest : null;
  }
}
