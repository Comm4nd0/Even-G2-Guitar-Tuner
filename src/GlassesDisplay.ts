import { DetectionResult, TuningMode } from './types';

// Even Hub SDK types - imported dynamically to allow phone-only mode
let EvenSDK: any = null;

export class GlassesDisplay {
  private bridge: any = null;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private connected = false;
  private pageCreated = false;
  private onTuningChange: (() => void) | null = null;
  private unsubscribeDeviceStatus: (() => void) | null = null;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = 200;
    this.offscreenCanvas.height = 100;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
  }

  setOnTuningChange(callback: () => void): void {
    this.onTuningChange = callback;
  }

  async init(): Promise<boolean> {
    try {
      EvenSDK = await import('@evenrealities/even_hub_sdk');
      this.bridge = await EvenSDK.waitForEvenAppBridge();

      // Verify the glasses are reachable by checking device info
      const device = await this.bridge.getDeviceInfo();
      if (device && device.status?.connectType === 'connected') {
        return await this.setupGlassesDisplay();
      }

      // Glasses not connected yet - wait for connection
      return await this.waitForGlassesConnection();
    } catch (e) {
      console.warn('Glasses not available:', e);
      this.connected = false;
      return false;
    }
  }

  private waitForGlassesConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.bridge) {
        resolve(false);
        return;
      }

      // Timeout after 15 seconds if glasses never connect
      const timeout = setTimeout(() => {
        if (this.unsubscribeDeviceStatus) {
          this.unsubscribeDeviceStatus();
          this.unsubscribeDeviceStatus = null;
        }
        console.warn('Glasses connection timed out');
        resolve(false);
      }, 15000);

      this.unsubscribeDeviceStatus = this.bridge.onDeviceStatusChanged(async (status: any) => {
        if (status?.connectType === 'connected') {
          clearTimeout(timeout);
          if (this.unsubscribeDeviceStatus) {
            this.unsubscribeDeviceStatus();
            this.unsubscribeDeviceStatus = null;
          }
          const success = await this.setupGlassesDisplay();
          resolve(success);
        }
      });
    });
  }

  private async setupGlassesDisplay(): Promise<boolean> {
    try {
      const result = await this.createInitialPage();
      if (result !== 0) {
        console.warn('createStartUpPageContainer failed with result:', result);
        return false;
      }
      this.pageCreated = true;
      this.connected = true;
      this.setupEventListeners();

      // Send initial gauge image so the image container has content
      this.renderGaugeImage(0, false);
      const dataUrl = this.offscreenCanvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      await this.bridge.updateImageRawData({
        containerID: 2,
        containerName: 'gauge',
        imageData: base64,
      });

      return true;
    } catch (e) {
      console.warn('Failed to setup glasses display:', e);
      return false;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private async createInitialPage(): Promise<number> {
    if (!this.bridge || !EvenSDK) return 1;

    // Use plain objects as shown in SDK docs rather than class instances
    const result = await this.bridge.createStartUpPageContainer({
      containerTotalNum: 3,
      textObject: [
        {
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
        },
        {
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
        },
      ],
      imageObject: [
        {
          containerID: 2,
          containerName: 'gauge',
          xPosition: 188,
          yPosition: 55,
          width: 200,
          height: 100,
        },
      ],
    });

    return typeof result === 'number' ? result : 1;
  }

  private setupEventListeners(): void {
    if (!this.bridge) return;

    this.bridge.onEvenHubEvent((event: any) => {
      if (event.sysEvent) {
        // Handle system events (foreground enter/exit)
        return;
      }
      if (event.textEvent && this.onTuningChange) {
        const evtType = event.textEvent.eventType;
        // Click event (0 or undefined due to SDK quirk)
        if (evtType === 0 || evtType === undefined) {
          this.onTuningChange();
        }
      }
    });
  }

  async update(result: DetectionResult, tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.pageCreated) return;

    try {
      // Update gauge image
      this.renderGaugeImage(result.centsOff, result.inTune);
      const dataUrl = this.offscreenCanvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

      await this.bridge.updateImageRawData({
        containerID: 2,
        containerName: 'gauge',
        imageData: base64,
      });

      // Update note text
      const noteText = `     ${result.noteName}${result.octave}\n    ${result.centsOff > 0 ? '+' : ''}${result.centsOff} cents`;
      await this.bridge.textContainerUpgrade({
        containerID: 3,
        containerName: 'noteinfo',
        content: noteText,
      });
    } catch (e) {
      // Silently handle update failures (glasses may disconnect)
    }
  }

  async updateTuningHeader(tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.pageCreated) return;

    try {
      const stringNames = tuning.strings.map(s => s.note.replace(/[0-9]/g, '')).join(' ');
      await this.bridge.textContainerUpgrade({
        containerID: 1,
        containerName: 'header',
        content: `${tuning.name}  ${stringNames}`,
      });
    } catch (e) {
      // Silently handle
    }
  }

  private renderGaugeImage(centsOff: number, inTune: boolean): void {
    const ctx = this.offscreenCtx;
    const w = 200;
    const h = 100;

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h + 15;
    const radius = 80;

    // Arc background
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI + 0.4, -0.4);
    ctx.stroke();

    // In-tune center zone (brighter)
    ctx.strokeStyle = inTune ? '#ffffff' : '#666666';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI + 1.15, Math.PI + 1.45);
    ctx.stroke();

    // Tick marks
    for (let i = -5; i <= 5; i++) {
      const angle = Math.PI + 0.4 + (i + 5) / 10 * (2 * Math.PI - 0.8 - Math.PI - 0.4 + Math.PI);
      const normAngle = -Math.PI / 2 + (i / 5) * 0.9;
      const tickLen = i === 0 ? 12 : 6;
      ctx.strokeStyle = i === 0 ? '#ffffff' : '#666666';
      ctx.lineWidth = i === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(normAngle) * (radius - tickLen), cy + Math.sin(normAngle) * (radius - tickLen));
      ctx.lineTo(cx + Math.cos(normAngle) * radius, cy + Math.sin(normAngle) * radius);
      ctx.stroke();
    }

    // Needle
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

    // Pivot dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
