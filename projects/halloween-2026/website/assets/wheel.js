class ControlledWheel {
  constructor(canvas, segments) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.segments = segments;
    this.rotation = 0;
    this.spinning = false;
    this.onComplete = null;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 8;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rotation);

    const n = this.segments.length;
    const seg = (2 * Math.PI) / n;

    this.segments.forEach((s, i) => {
      const a1 = i * seg - Math.PI / 2;
      const a2 = a1 + seg;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a1, a2);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.rotate(a1 + seg / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = s.textColor || '#fff';

      const fontSize = Math.max(10, Math.floor(r / 9));
      ctx.font = 'bold ' + fontSize + 'px Tenor Sans, sans-serif';

      const words = s.label.split('\n');
      const lh = fontSize + 2;
      const startY = -(words.length - 1) * lh / 2;
      words.forEach((word, wi) => {
        ctx.fillText(word, r * 0.58, startY + wi * lh);
      });
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = '#C8A08C';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  spinTo(segmentIndex) {
    if (this.spinning) return;
    this.spinning = true;

    const n = this.segments.length;
    const seg = (2 * Math.PI) / n;
    const baseTarget = -(segmentIndex + 0.5) * seg;
    let normalizedTarget = ((baseTarget % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let minDelta = normalizedTarget - ((this.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (minDelta <= 0) minDelta += 2 * Math.PI;

    const extraSpins = (5 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
    const jitter = (Math.random() - 0.5) * seg * 0.35;
    const targetRotation = this.rotation + minDelta + extraSpins + jitter;

    const startRotation = this.rotation;
    const startTime = performance.now();
    const duration = 4000 + Math.random() * 2000;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);

      this.rotation = startRotation + (targetRotation - startRotation) * eased;
      this.draw();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.spinning = false;
        if (this.onComplete) this.onComplete(this.segments[segmentIndex]);
      }
    };

    requestAnimationFrame(animate);
  }

  reset() {
    this.rotation = 0;
    this.spinning = false;
    this.draw();
  }
}
