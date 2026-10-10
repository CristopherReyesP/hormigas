/**
 * A minimal WebAudio stand-in for node tests. It builds the same graph a
 * browser would and records it, and it is strict where browsers are: an
 * exponential ramp to 0 or a non-finite time throws, a source stopped
 * before it starts throws. Tests read the recorded nodes and automation.
 */

type Automation = [method: string, value: number, time: number];

const finite = (v: number, what: string): void => {
  if (!Number.isFinite(v)) throw new RangeError(`${what} must be finite, got ${v}`);
};

export class FakeParam {
  value: number;
  readonly events: Automation[] = [];
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(value: number, time: number): this {
    finite(value, 'value');
    finite(time, 'time');
    this.events.push(['set', value, time]);
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    finite(value, 'value');
    finite(time, 'time');
    this.events.push(['linear', value, time]);
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    finite(time, 'time');
    if (!(value > 0)) throw new RangeError(`exponential ramp target must be > 0, got ${value}`);
    this.events.push(['exp', value, time]);
    return this;
  }
  setTargetAtTime(value: number, time: number, constant: number): this {
    finite(value, 'value');
    finite(time, 'time');
    finite(constant, 'time constant');
    this.events.push(['target', value, time]);
    return this;
  }
  cancelScheduledValues(time: number): this {
    finite(time, 'time');
    this.events.push(['cancel', 0, time]);
    return this;
  }
  /** Largest level this param is ever set or ramped to */
  peak(): number {
    return this.events.reduce((m, [kind, v]) => (kind === 'cancel' ? m : Math.max(m, v)), this.value);
  }
}

export class FakeNode {
  readonly kind: string;
  readonly outputs: FakeNode[] = [];
  readonly ctx: FakeAudioContext;
  disconnected = false;
  constructor(ctx: FakeAudioContext, kind: string) {
    this.ctx = ctx;
    this.kind = kind;
    ctx.nodes.push(this);
  }
  connect<T>(dest: T): T {
    if (dest instanceof FakeNode) this.outputs.push(dest);
    return dest;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeSource extends FakeNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  onended: (() => void) | null = null;
  start(time = 0): void {
    finite(time, 'start time');
    if (this.startTime !== null) throw new Error('source started twice');
    this.startTime = time;
    this.ctx.sources.push(this);
  }
  stop(time = 0): void {
    finite(time, 'stop time');
    if (this.startTime === null) throw new Error('source stopped before it started');
    if (time < this.startTime) throw new RangeError('stop before start');
    this.stopTime = time;
  }
}

class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam(1);
}

class FakeBiquad extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0);
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
}

class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = 'none';
}

class FakeDelay extends FakeNode {
  readonly delayTime = new FakeParam(0);
}

export class FakeBuffer {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  private readonly channels: Float32Array[];
  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number): Float32Array {
    return this.channels[i];
  }
}

export class FakeAudioContext {
  currentTime = 0;
  /** Low on purpose: noise buffers stay small and tests stay fast */
  readonly sampleRate = 8000;
  state: AudioContextState = 'running';
  readonly nodes: FakeNode[] = [];
  readonly sources: FakeSource[] = [];
  readonly destination: FakeNode = new FakeNode(this, 'destination');

  createGain(): FakeGain {
    return new FakeGain(this, 'gain');
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator(this, 'oscillator');
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this, 'bufferSource');
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad(this, 'biquad');
  }
  createStereoPanner(): FakePanner {
    return new FakePanner(this, 'panner');
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor(this, 'compressor');
  }
  createWaveShaper(): FakeShaper {
    return new FakeShaper(this, 'shaper');
  }
  createDelay(): FakeDelay {
    return new FakeDelay(this, 'delay');
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(channels, length, sampleRate);
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  /** As the engine sees it */
  asContext(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }
  /** Nodes of one kind, in creation order */
  ofKind<T extends FakeNode = FakeNode>(kind: string): T[] {
    return this.nodes.filter((n) => n.kind === kind) as T[];
  }
}

export type { FakeGain, FakeSource, FakeOscillator, FakeBufferSource, FakeBiquad, FakePanner };
