import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  ImageContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { DetectionResult, TuningMode } from './types';

type StatusCallback = (msg: string, ok: boolean) => void;

export class GlassesDisplay {
  private bridge: EvenAppBridge | null = null;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private connected = false;
  private pageCreated = false;
  private onTuningChange: (() => void) | null = null;
  private onStatus: StatusCallback | null = null;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = 200;
    this.offscreenCanvas.height = 100;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
  }

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

      // Wait for the Even App to inject the bridge (with 8s timeout)
      this.bridge = await withTimeout(waitForEvenAppBridge(), 8000);
      this.reportStatus('Bridge ready, creating display...', false);

      // Immediately create the page — matching the pattern used by working apps
      const result = await this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: 3,
          textObject: [
            new TextContainerProperty({
              containerID: 1,
              containerName: 'header',
              xPosition: 0,
              yPosition: 0,
              width: 576,
              height: 50,
              content: 'Standard  E A D G B E',
              borderWidth: 0,
              paddingLength: 4,
              isEventCapture: 0,
            }),
            new TextContainerProperty({
              containerID: 3,
              containerName: 'noteinfo',
              xPosition: 0,
              yPosition: 180,
              width: 576,
              height: 108,
              content: '         --\n       0 cents',
              borderWidth: 0,
              paddingLength: 4,
              isEventCapture: 1,
            }),
          ],
          imageObject: [
            new ImageContainerProperty({
              containerID: 2,
              containerName: 'gauge',
              xPosition: 188,
              yPosition: 55,
              width: 200,
              height: 100,
            }),
          ],
        })
      );

      this.reportStatus(`Page created (result: ${result})`, false);

      if (result !== 0) {
        this.reportStatus(`Page creation failed: ${result}`, false);
        return false;
      }

      this.pageCreated = true;
      this.connected = true;
      this.setupEventListeners();

      // Send initial gauge image
      await this.sendGaugeImage(0, false);
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
      if (event.textEvent && this.onTuningChange) {
        const evtType = event.textEvent.eventType;
        if (evtType === 0 || evtType === undefined) {
          this.onTuningChange();
        }
      }
    });
  }

  private async canvasToPngBytes(): Promise<number[]> {
    const blob = await new Promise<Blob>((resolve) =>
      this.offscreenCanvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const buf = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buf));
  }

  private async sendGaugeImage(centsOff: number, inTune: boolean): Promise<void> {
    if (!this.bridge) return;
    this.renderGaugeImage(centsOff, inTune);
    const imageData = await this.canvasToPngBytes();

    await this.bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: 2,
        containerName: 'gauge',
        imageData,
      })
    );
  }

  async update(result: DetectionResult, _tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.pageCreated) return;

    try {
      await this.sendGaugeImage(result.centsOff, result.inTune);

      const noteText = `     ${result.noteName}${result.octave}\n    ${result.centsOff > 0 ? '+' : ''}${result.centsOff} cents`;
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 3,
          containerName: 'noteinfo',
          contentOffset: 0,
          contentLength: 2000,
          content: noteText,
        })
      );
    } catch {
      // Silently handle update failures (glasses may disconnect)
    }
  }

  async updateTuningHeader(tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.pageCreated) return;

    try {
      const stringNames = tuning.strings.map(s => s.note.replace(/[0-9]/g, '')).join(' ');
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 1,
          containerName: 'header',
          contentOffset: 0,
          contentLength: 2000,
          content: `${tuning.name}  ${stringNames}`,
        })
      );
    } catch {
      // Silently handle
    }
  }

  private renderGaugeImage(centsOff: number, inTune: boolean): void {
    const ctx = this.offscreenCtx;
    const w = 200;
    const h = 100;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h + 15;
    const radius = 80;

    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI + 0.4, -0.4);
    ctx.stroke();

    ctx.strokeStyle = inTune ? '#ffffff' : '#666666';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI + 1.15, Math.PI + 1.45);
    ctx.stroke();

    for (let i = -5; i <= 5; i++) {
      const normAngle = -Math.PI / 2 + (i / 5) * 0.9;
      const tickLen = i === 0 ? 12 : 6;
      ctx.strokeStyle = i === 0 ? '#ffffff' : '#666666';
      ctx.lineWidth = i === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(normAngle) * (radius - tickLen), cy + Math.sin(normAngle) * (radius - tickLen));
      ctx.lineTo(cx + Math.cos(normAngle) * radius, cy + Math.sin(normAngle) * radius);
      ctx.stroke();
    }

    const clampedCents = Math.max(-50, Math.min(50, centsOff));
    const needleAngle = -Math.PI / 2 + (clampedCents / 50) * 0.9;
    const needleLen = radius - 15;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(needleAngle) * needleLen,
      cy + Math.sin(needleAngle) * needleLen
    );
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
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
