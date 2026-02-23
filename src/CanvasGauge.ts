export class CanvasGauge {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentAngle = 0;
  private targetAngle = 0;
  private animating = false;
  private dpr: number;

  // Gauge geometry
  private readonly arcStartAngle = Math.PI + 0.4; // ~203 degrees
  private readonly arcEndAngle = -0.4;             // ~337 degrees
  private readonly arcSpan: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.arcSpan = this.arcEndAngle - this.arcStartAngle + 2 * Math.PI;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  update(centsOff: number): void {
    // Map cents (-50 to +50) to angle range
    const normalized = Math.max(-50, Math.min(50, centsOff)) / 50;
    this.targetAngle = normalized * (this.arcSpan / 2);
  }

  startAnimation(): void {
    if (this.animating) return;
    this.animating = true;
    this.render();
  }

  private render = (): void => {
    if (!this.animating) return;

    // Smooth interpolation toward target
    this.currentAngle += (this.targetAngle - this.currentAngle) * 0.18;

    this.draw();
    requestAnimationFrame(this.render);
  };

  private draw(): void {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.85;
    const radius = Math.min(w, h) * 0.55;

    // Draw arc background
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, this.arcStartAngle, this.arcEndAngle);
    ctx.stroke();

    // Draw colored zones
    this.drawZone(ctx, cx, cy, radius, -50, -20, '#ff4444', 0.3);  // very flat - red
    this.drawZone(ctx, cx, cy, radius, -20, -5, '#ffaa00', 0.3);   // slightly flat - yellow
    this.drawZone(ctx, cx, cy, radius, -5, 5, '#00ff88', 0.5);     // in tune - green
    this.drawZone(ctx, cx, cy, radius, 5, 20, '#ffaa00', 0.3);     // slightly sharp - yellow
    this.drawZone(ctx, cx, cy, radius, 20, 50, '#ff4444', 0.3);    // very sharp - red

    // Draw tick marks
    for (let cents = -50; cents <= 50; cents += 10) {
      const normalized = cents / 50;
      const angle = this.centsToAngle(normalized);
      const isMajor = cents === 0;
      const tickLen = isMajor ? 18 : 10;
      const outerR = radius + 6;
      const innerR = outerR - tickLen;

      ctx.strokeStyle = isMajor ? '#ffffff' : '#555555';
      ctx.lineWidth = isMajor ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.stroke();
    }

    // Draw needle
    const needleAngle = this.centsToAngle(this.currentAngle / (this.arcSpan / 2));
    const needleLen = radius - 10;

    // Needle shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(needleAngle) * needleLen,
      cy + Math.sin(needleAngle) * needleLen
    );
    ctx.stroke();

    // Needle
    const inTune = Math.abs(this.currentAngle) < (5 / 50) * (this.arcSpan / 2);
    ctx.strokeStyle = inTune ? '#00ff88' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(needleAngle) * needleLen,
      cy + Math.sin(needleAngle) * needleLen
    );
    ctx.stroke();

    // Center pivot dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    // Inner dot
    ctx.fillStyle = inTune ? '#00ff88' : '#333333';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawZone(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, radius: number,
    fromCents: number, toCents: number,
    color: string, alpha: number
  ): void {
    const startAngle = this.centsToAngle(fromCents / 50);
    const endAngle = this.centsToAngle(toCents / 50);

    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private centsToAngle(normalized: number): number {
    // normalized: -1 (flat) to +1 (sharp), 0 = center
    // Map to arc: center of arc is at top (270 deg = -PI/2)
    const centerAngle = -Math.PI / 2;
    return centerAngle + normalized * (this.arcSpan / 2);
  }
}
