// Small, dependency-free interpolation helpers. Everything in the experience is
// a pure function of scroll progress `p` (0..1), so these are the only math we
// need to turn the scene config into on-screen state.

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function invlerp(a: number, b: number, v: number): number {
  return a === b ? 0 : clamp((v - a) / (b - a), 0, 1)
}

export interface NumKey {
  at: number
  value: number
}

// Piecewise-linear sample over keyframes sorted by `at`. Clamps at both ends.
export function sampleNumber(keys: NumKey[], p: number): number {
  if (keys.length === 0) return 0
  if (p <= keys[0].at) return keys[0].value
  const last = keys[keys.length - 1]
  if (p >= last.at) return last.value
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (p >= a.at && p <= b.at) {
      return a.value + (b.value - a.value) * invlerp(a.at, b.at, p)
    }
  }
  return last.value
}

export interface StepKey<T> {
  at: number
  value: T
}

// Discrete sample: the value of the last keyframe whose `at` <= p. Used for
// poses, which snap rather than tween.
export function sampleStep<T>(keys: StepKey<T>[], p: number, fallback: T): T {
  let v = fallback
  for (const k of keys) {
    if (p >= k.at) v = k.value
    else break
  }
  return v
}

// Opacity for a [start, end] scroll window, with soft fades at the edges.
// Fade is deliberately tight so adjacent beats don't stack their text on screen.
export function windowOpacity(win: [number, number], p: number, fade = 0.013): number {
  const [s, e] = win
  if (p < s - fade || p > e + fade) return 0
  if (p < s) return invlerp(s - fade, s, p)
  if (p > e) return 1 - invlerp(e, e + fade, p)
  return 1
}
