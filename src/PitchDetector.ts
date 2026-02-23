/**
 * YIN pitch detection algorithm.
 * Detects fundamental frequency from a time-domain audio buffer.
 */
export class PitchDetector {
  private threshold: number;

  constructor(threshold = 0.15) {
    this.threshold = threshold;
  }

  detect(buffer: Float32Array, sampleRate: number): number | null {
    // Signal gate: check RMS level
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) return null;

    const halfSize = Math.floor(buffer.length / 2);

    // Step 1: Difference function
    const diff = new Float32Array(halfSize);
    for (let tau = 0; tau < halfSize; tau++) {
      let sum = 0;
      for (let j = 0; j < halfSize; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }

    // Step 2: Cumulative mean normalized difference function
    const cmndf = new Float32Array(halfSize);
    cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = diff[tau] * tau / runningSum;
    }

    // Step 3: Absolute threshold - find first dip below threshold
    let tauEstimate = -1;
    for (let tau = 2; tau < halfSize; tau++) {
      if (cmndf[tau] < this.threshold) {
        // Walk to the local minimum
        while (tau + 1 < halfSize && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate === -1) return null;

    // Step 4: Parabolic interpolation for sub-sample accuracy
    if (tauEstimate > 0 && tauEstimate < halfSize - 1) {
      const s0 = cmndf[tauEstimate - 1];
      const s1 = cmndf[tauEstimate];
      const s2 = cmndf[tauEstimate + 1];
      const betterTau = tauEstimate + (s0 - s2) / (2 * (s0 - 2 * s1 + s2));
      return sampleRate / betterTau;
    }

    return sampleRate / tauEstimate;
  }
}
