export class TicketAudio {
  context?: AudioContext;
  muted = false;
  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }
  snap(column: number) {
    if (this.muted || !this.context) return;
    const ctx = this.context, t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * .065, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * .17));
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    noise.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = 1350 + column / 24 * 1450; filter.Q.value = 1.2;
    gain.gain.setValueAtTime(.22, t); gain.gain.exponentialRampToValueAtTime(.001, t + .065);
    noise.connect(filter).connect(gain).connect(ctx.destination); noise.start(t); noise.stop(t + .07);
  }
  verified() {
    if (this.muted || !this.context) return;
    const ctx = this.context, t = ctx.currentTime;
    for (const [i, frequency] of [174.61, 220, 261.63, 329.63, 392].entries()) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.065, t + .035 + i * .018); gain.gain.exponentialRampToValueAtTime(.001, t + 1.8);
      osc.connect(gain).connect(ctx.destination); osc.start(t + i * .018); osc.stop(t + 2);
    }
  }
  dispose() { void this.context?.close(); }
}
