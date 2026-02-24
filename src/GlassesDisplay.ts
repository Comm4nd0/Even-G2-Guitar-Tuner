import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { DetectionResult, TuningMode } from './types';

type StatusCallback = (msg: string, ok: boolean) => void;

export class GlassesDisplay {
  private bridge: EvenAppBridge | null = null;
  private connected = false;
  private pageCreated = false;
  private onTuningChange: (() => void) | null = null;
  private onStatus: StatusCallback | null = null;
  private updating = false;

  setOnTuningChange(callback: () => void): void {
    this.onTuningChange = callback;
  }

  setOnStatus(callback: StatusCallback): void {
    this.onStatus = callback;
  }

  private reportStatus(msg: string, ok: boolean): void {
    console.log(`[Glasses] ${msg}`);
    if (this.onStatus) this.onStatus(msg, ok);
  }

  async init(): Promise<boolean> {
    try {
      this.reportStatus('Waiting for bridge...', false);

      this.bridge = await withTimeout(waitForEvenAppBridge(), 15000);
      this.reportStatus('Bridge ready, creating page...', false);

      // Text-only layout: 2 containers on a 576x288 canvas
      // Container 1: Header (tuning name + string names)
      // Container 2: Main display (note + cents), receives tap events
      const result = await this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: 2,
          textObject: [
            new TextContainerProperty({
              containerID: 1,
              containerName: 'header',
              xPosition: 0,
              yPosition: 0,
              width: 576,
              height: 80,
              content: 'Guitar Tuner\n  Standard  E A D G B E',
              borderWidth: 0,
              paddingLength: 4,
              isEventCapture: 0,
            }),
            new TextContainerProperty({
              containerID: 2,
              containerName: 'main',
              xPosition: 0,
              yPosition: 80,
              width: 576,
              height: 208,
              content: '\n\n      Tap Start on phone',
              borderWidth: 0,
              paddingLength: 4,
              isEventCapture: 1,
            }),
          ],
        })
      );

      this.reportStatus(`Page result: ${result}`, false);

      if (result !== 0) {
        this.reportStatus(`Page failed (code ${result})`, false);
        return false;
      }

      this.pageCreated = true;
      this.connected = true;
      this.setupEventListeners();
      this.reportStatus('Connected!', true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.reportStatus(`Init failed: ${msg}`, false);
      this.connected = false;
      return false;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private setupEventListeners(): void {
    if (!this.bridge) return;

    this.bridge.onEvenHubEvent((event: any) => {
      if (event.sysEvent) return;
      // Text container tap or scroll triggers tuning change
      if (event.textEvent && this.onTuningChange) {
        const evtType = event.textEvent.eventType;
        if (evtType === 0 || evtType === undefined) {
          this.onTuningChange();
        }
      }
    });
  }

  async update(result: DetectionResult, _tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.pageCreated || this.updating) return;

    this.updating = true;
    try {
      const gauge = this.buildGaugeText(result.centsOff);
      const status = result.inTune ? '  IN TUNE' : (result.centsOff > 0 ? '  SHARP' : '  FLAT');
      const centsStr = (result.centsOff > 0 ? '+' : '') + result.centsOff;

      const content = `${gauge}\n\n      ${result.noteName}${result.octave}   ${centsStr}c${status}`;

      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 2,
          containerName: 'main',
          contentOffset: 0,
          contentLength: 2000,
          content,
        })
      );
    } catch {
      // Silently handle update failures
    } finally {
      this.updating = false;
    }
  }

  async updateTuningHeader(tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.pageCreated) return;

    try {
      const stringNames = tuning.strings.map(s => s.note.replace(/[0-9]/g, '')).join('  ');
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 1,
          containerName: 'header',
          contentOffset: 0,
          contentLength: 2000,
          content: `Guitar Tuner\n  ${tuning.name}  ${stringNames}`,
        })
      );
    } catch {
      // Silently handle
    }
  }

  private buildGaugeText(centsOff: number): string {
    // Build a text-based gauge: 25 positions, center = in-tune
    // Example: "  ◄━━━━━━━━━━━━▼━━━━━━━━━━━━►"
    const width = 25;
    const center = Math.floor(width / 2);
    const clamped = Math.max(-50, Math.min(50, centsOff));
    const pos = center + Math.round((clamped / 50) * center);

    const chars: string[] = [];
    for (let i = 0; i < width; i++) {
      if (i === center) {
        chars.push('|');
      } else if (i === pos) {
        chars.push(Math.abs(centsOff) < 5 ? 'O' : '#');
      } else {
        chars.push('-');
      }
    }
    // If pos === center, mark center as the indicator
    if (pos === center) {
      chars[center] = 'O';
    }

    return '  ' + chars.join('');
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
