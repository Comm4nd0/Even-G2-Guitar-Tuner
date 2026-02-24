import { DetectionResult, TuningMode } from './types';

// Even Hub SDK types - imported dynamically to allow phone-only mode
let EvenSDK: any = null;

type StatusCallback = (msg: string, ok: boolean) => void;

export class GlassesDisplay {
  private bridge: any = null;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private connected = false;
  private pageCreated = false;
  private onTuningChange: (() => void) | null = null;
  private onStatus: StatusCallback | null = null;
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

  setOnStatus(callback: StatusCallback): void {
    this.onStatus = callback;
  }

  private reportStatus(msg: string, ok: boolean): void {
    console.log(`[Glasses] ${msg}`);
    if (this.onStatus) this.onStatus(msg, ok);
  }

  async init(): Promise<boolean> {
    try {
      this.reportStatus('Importing SDK...', false);
      EvenSDK = await import('@evenrealities/even_hub_sdk');
      this.reportStatus('SDK loaded, waiting for bridge...', false);

      this.bridge = await EvenSDK.waitForEvenAppBridge();
      this.reportStatus('Bridge ready, checking device...', false);

      // Try to get device info for diagnostic purposes
      let deviceConnected = false;
      try {
        const device = await this.bridge.getDeviceInfo();
        const connectType = device?.status?.connectType;
        this.reportStatus(`Device: ${connectType ?? 'no device info'}`, false);
        deviceConnected = connectType === 'connected';
      } catch (e) {
        this.reportStatus(`getDeviceInfo error: ${e}`, false);
      }

      if (deviceConnected) {
        // Glasses already connected - set up display immediately
        return await this.setupGlassesDisplay();
      }

      // Try creating the page anyway - getDeviceInfo may not reflect
      // the actual glasses state accurately in all firmware versions
      this.reportStatus('Trying page creation anyway...', false);
      const directAttempt = await this.trySetupDirect();
      if (directAttempt) return true;

      // Fall back to waiting for explicit connection event
      this.reportStatus('Waiting for glasses connection...', false);
      return await this.waitForGlassesConnection();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.reportStatus(`Init failed: ${msg}`, false);
      this.connected = false;
      return false;
    }
  }

  private async trySetupDirect(): Promise<boolean> {
    try {
      const result = await this.createInitialPage();
      this.reportStatus(`Direct page create result: ${result}`, false);
      if (result === 0) {
        this.pageCreated = true;
        this.connected = true;
        this.setupEventListeners();
        await this.sendInitialGauge();
        this.reportStatus('Glasses connected!', true);
        return true;
      }
      return false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.reportStatus(`Direct setup error: ${msg}`, false);
      return false;
    }
  }

  private waitForGlassesConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.bridge) {
        this.reportStatus('No bridge available', false);
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        if (this.unsubscribeDeviceStatus) {
          this.unsubscribeDeviceStatus();
          this.unsubscribeDeviceStatus = null;
        }
        this.reportStatus('Connection timed out (15s)', false);
        resolve(false);
      }, 15000);

      this.unsubscribeDeviceStatus = this.bridge.onDeviceStatusChanged(async (status: any) => {
        const ct = status?.connectType;
        this.reportStatus(`Device status changed: ${ct}`, false);
        if (ct === 'connected') {
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
      this.reportStatus('Creating page containers...', false);
      const result = await this.createInitialPage();
      this.reportStatus(`createStartUpPageContainer result: ${result}`, false);

      // Accept result === 0 (success enum)
      if (result !== 0) {
        this.reportStatus(`Page creation failed (${result})`, false);
        return false;
      }
      this.pageCreated = true;
      this.connected = true;
      this.setupEventListeners();

      await this.sendInitialGauge();
      this.reportStatus('Glasses connected!', true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.reportStatus(`Setup failed: ${msg}`, false);
      return false;
    }
  }

  private async sendInitialGauge(): Promise<void> {
    this.renderGaugeImage(0, false);
    const dataUrl = this.offscreenCanvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

    try {
      const imgResult = await this.bridge.updateImageRawData({
        containerID: 2,
        containerName: 'gauge',
        imageData: base64,
      });
      this.reportStatus(`Initial image result: ${imgResult}`, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.reportStatus(`Image send error: ${msg}`, true);
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private async createInitialPage(): Promise<number> {
    if (!this.bridge || !EvenSDK) return 1;

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
        return;
      }
      if (event.textEvent && this.onTuningChange) {
        const evtType = event.textEvent.eventType;
        if (evtType === 0 || evtType === undefined) {
          this.onTuningChange();
        }
      }
    });
  }

  async update(result: DetectionResult, tuning: TuningMode): Promise<void> {
    if (!this.connected || !this.bridge || !this.pageCreated) return;

    try {
      this.renderGaugeImage(result.centsOff, result.inTune);
      const dataUrl = this.offscreenCanvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

      await this.bridge.updateImageRawData({
        containerID: 2,
        containerName: 'gauge',
        imageData: base64,
      });

      const noteText = `     ${result.noteName}${result.octave}\n    ${result.centsOff > 0 ? '+' : ''}${result.centsOff} cents`;
      await this.bridge.textContainerUpgrade({
        containerID: 3,
        containerName: 'noteinfo',
        content: noteText,
      });
    } catch {
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
