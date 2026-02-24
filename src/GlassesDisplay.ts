import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { DetectionResult, TuningMode } from './types';

type StatusCallback = (msg: string, ok: boolean) => void;

const DISPLAY_WIDTH = 576;
const DISPLAY_HEIGHT = 288;

export class GlassesDisplay {
  private bridge: EvenAppBridge | null = null;
  private connected = false;
  private startupRendered = false;
  private onTuningChange: (() => void) | null = null;
  private onStatus: StatusCallback | null = null;
  private pushInFlight = false;

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

      const bridge = await withTimeout(waitForEvenAppBridge(), 10_000);
      this.bridge = bridge;
      this.reportStatus('Bridge found, setting up display...', false);

      bridge.onEvenHubEvent((event) => {
        this.onEvent(event);
      });

      const result = await withTimeout(this.createStartupPage(), 8_000);
      if (result !== StartUpPageCreateResult.success) {
        this.reportStatus(`Page create returned ${result}`, false);
        return false;
      }

      this.connected = true;
      this.reportStatus('Connected', true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.reportStatus(`Failed: ${msg}`, false);
      this.connected = false;
      return false;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private async createStartupPage(): Promise<StartUpPageCreateResult> {
    if (!this.bridge) {
      throw new Error('No bridge');
    }

    const config = {
      containerTotalNum: 2,
      textObject: [
        new TextContainerProperty({
          containerID: 1,
          containerName: 'evt',
          content: ' ',
          xPosition: 0,
          yPosition: 0,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          isEventCapture: 1,
          paddingLength: 0,
        }),
        new TextContainerProperty({
          containerID: 2,
          containerName: 'screen',
          content: 'Guitar Tuner\nTap Start on phone',
          xPosition: 0,
          yPosition: 0,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          isEventCapture: 0,
          paddingLength: 0,
        }),
      ],
    };

    const result = await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer(config)
    );
    console.log('[Glasses] createStartUpPageContainer result:', result);
    if (result === StartUpPageCreateResult.success) {
      this.startupRendered = true;
    }
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onEvent(event: any): void {
    // Ignore system events
    if (event.sysEvent) return;

    // Any text/list event triggers tuning change
    const evtType =
      event.textEvent?.eventType ??
      event.listEvent?.eventType;

    if (evtType === 0 || evtType === undefined) {
      if (event.textEvent || event.listEvent) {
        if (this.onTuningChange) this.onTuningChange();
      }
    }
  }

  async update(result: DetectionResult, tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.startupRendered) return;
    if (this.pushInFlight) return;

    this.pushInFlight = true;
    try {
      const gauge = this.buildGaugeText(result.centsOff);
      const status = result.inTune ? '  IN TUNE' : (result.centsOff > 0 ? '  SHARP' : '  FLAT');
      const centsStr = (result.centsOff > 0 ? '+' : '') + result.centsOff;
      const stringNames = tuning.strings.map(s => s.note.replace(/[0-9]/g, '')).join('  ');

      const content = `${tuning.name}  ${stringNames}\n${gauge}\n\n      ${result.noteName}${result.octave}   ${centsStr}c${status}`;

      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 2,
          containerName: 'screen',
          contentOffset: 0,
          contentLength: 2000,
          content,
        })
      );
    } catch {
      // Silently handle update failures
    } finally {
      this.pushInFlight = false;
    }
  }

  async updateTuningHeader(tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.startupRendered) return;
    if (this.pushInFlight) return;

    this.pushInFlight = true;
    try {
      const stringNames = tuning.strings.map(s => s.note.replace(/[0-9]/g, '')).join('  ');
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 2,
          containerName: 'screen',
          contentOffset: 0,
          contentLength: 2000,
          content: `${tuning.name}  ${stringNames}\n\n\n      Tap Start on phone`,
        })
      );
    } catch {
      // Silently handle
    } finally {
      this.pushInFlight = false;
    }
  }

  private buildGaugeText(centsOff: number): string {
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
    if (pos === center) {
      chars[center] = 'O';
    }

    return '  ' + chars.join('');
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
}
