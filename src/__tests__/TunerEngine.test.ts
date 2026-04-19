import { describe, it, expect, beforeEach } from 'vitest';
import { TunerEngine } from '../TunerEngine';

describe('TunerEngine', () => {
  let engine: TunerEngine;

  beforeEach(() => {
    engine = new TunerEngine();
  });

  it('reports E2 in tune on the low-E string in Standard tuning', () => {
    const result = engine.analyze(82.41);
    expect(result).not.toBeNull();
    expect(result!.noteName).toBe('E');
    expect(result!.octave).toBe(2);
    expect(Math.abs(result!.centsOff)).toBeLessThan(2);
    expect(result!.inTune).toBe(true);
    expect(result!.nearestString?.note).toBe('E2');
  });

  it('reports cents relative to the target string, not the nearest semitone', () => {
    // 79.9 Hz is ~55¢ flat of E2 (82.41 Hz) but closer in semitone terms to D#2 (~77.78 Hz).
    // Chromatic behaviour would call this D#2; target-string behaviour calls it E2.
    const result = engine.analyze(79.9);
    expect(result).not.toBeNull();
    expect(result!.nearestString?.note).toBe('E2');
    expect(result!.noteName).toBe('E');
    expect(result!.centsOff).toBeLessThan(-40);
    expect(result!.inTune).toBe(false);
  });

  it('falls back to chromatic display when more than 200¢ from any string', () => {
    // 415 Hz (G#4) is >200¢ from every string in Standard tuning
    const result = engine.analyze(415.3);
    expect(result).not.toBeNull();
    expect(result!.nearestString).toBeNull();
    expect(result!.noteName).toBe('G#');
  });

  it('recognizes D2 as the low string in Drop D', () => {
    engine.nextTuning(); // Standard → Drop D
    expect(engine.currentTuning.name).toBe('Drop D');
    const result = engine.analyze(73.42);
    expect(result!.nearestString?.note).toBe('D2');
    expect(Math.abs(result!.centsOff)).toBeLessThan(2);
  });

  it('clears frequency history on tuning-mode change', () => {
    // Seed Standard tuning history with a high-E sample
    engine.analyze(329.63);
    engine.analyze(329.63);
    engine.analyze(329.63);

    // Switch to Drop D and hit D2 — without the clear, median would be skewed
    engine.nextTuning();
    const result = engine.analyze(73.42);
    expect(result!.nearestString?.note).toBe('D2');
    expect(Math.abs(result!.centsOff)).toBeLessThan(2);
  });

  it('returns null for invalid frequencies', () => {
    expect(engine.analyze(0)).toBeNull();
    expect(engine.analyze(-100)).toBeNull();
    expect(engine.analyze(NaN)).toBeNull();
    expect(engine.analyze(Infinity)).toBeNull();
  });

  it('wraps tuning index in both directions', () => {
    const total = engine.tunings.length;
    for (let i = 0; i < total; i++) engine.nextTuning();
    expect(engine.currentTuning.name).toBe('Standard');
    engine.prevTuning();
    expect(engine.currentTuning.name).toBe(engine.tunings[total - 1].name);
  });

  it('median-smooths noisy samples', () => {
    // Feed 6 clean E4 samples plus one wild outlier; median should still land on E4
    for (let i = 0; i < 6; i++) engine.analyze(329.63);
    const result = engine.analyze(900); // outlier
    expect(result!.nearestString?.note).toBe('E4');
    expect(Math.abs(result!.centsOff)).toBeLessThan(5);
  });
});
