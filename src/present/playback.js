// Presentation clock. Advances a TU-based clock by real time x speed and dispatches timeline cues
// to a sink. Seeking backwards resets the sink and silently replays cues up to the target.
export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4]);

export class Playback {
  constructor(timeline, sink, { secondsPerTU = 0.4 } = {}) {
    this.timeline = timeline;
    this.sink = sink;
    this.secondsPerTU = secondsPerTU;
    this.speed = 1;
    this.paused = false;
    this.pt = 0;
    this.index = 0;
    sink.reset(timeline);
  }

  get duration() {
    return this.timeline.duration;
  }

  get finished() {
    return this.pt >= this.timeline.duration;
  }

  // Advances by real elapsed seconds; returns the TU-clock delta that was applied.
  update(dtSeconds) {
    if (this.paused || this.finished) return 0;
    const before = this.pt;
    this.advanceTo(Math.min(this.duration, this.pt + (dtSeconds * this.speed) / this.secondsPerTU), false);
    return this.pt - before;
  }

  advanceTo(target, silent) {
    const cues = this.timeline.cues;
    while (this.index < cues.length && cues[this.index].t <= target) this.sink.onCue(cues[this.index++], silent);
    this.pt = target;
  }

  seek(target) {
    const clamped = Math.max(0, Math.min(this.duration, target));
    if (clamped < this.pt) {
      this.sink.reset(this.timeline);
      this.index = 0;
      this.pt = 0;
    }
    this.advanceTo(clamped, true);
  }

  // Pauses and jumps to the start of the next TU window.
  stepTU() {
    this.paused = true;
    this.seek(Math.floor(this.pt + 1e-9) + 1);
  }
}
