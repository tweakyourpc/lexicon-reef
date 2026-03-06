import type { SimState } from "../types";

export class Sonify {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;

  init(ctx: AudioContext): void {
    if (this.audioContext !== null) {
      return;
    }

    this.audioContext = ctx;
    this.oscillator = ctx.createOscillator();
    this.gainNode = ctx.createGain();

    this.oscillator.type = "triangle";
    this.oscillator.frequency.value = 110;
    this.gainNode.gain.value = 0.016;

    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);
    this.oscillator.start();
  }

  update(state: SimState): void {
    if (this.audioContext === null || this.oscillator === null || this.gainNode === null) {
      return;
    }

    const population = state.lexemes.length;
    if (population === 0) {
      this.oscillator.frequency.setTargetAtTime(80, this.audioContext.currentTime, 0.15);
      this.gainNode.gain.setTargetAtTime(0.005, this.audioContext.currentTime, 0.2);
      return;
    }

    let totalEnergy = 0;
    for (const lexeme of state.lexemes) {
      totalEnergy += lexeme.energy;
    }
    const meanEnergy = totalEnergy / population;
    const clampedEnergy = Math.max(0, Math.min(2.5, meanEnergy));
    const targetFrequency = 90 + clampedEnergy * 120;
    const targetGain = 0.01 + Math.min(0.03, (population / 450) * 0.03);

    this.oscillator.frequency.setTargetAtTime(targetFrequency, this.audioContext.currentTime, 0.08);
    this.gainNode.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.12);
  }
}
