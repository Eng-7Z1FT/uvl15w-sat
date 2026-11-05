/* AFSK 1200 (Bell 202) packet decoder and encoder for the UVL-15W app — APRS and satellite
   beacons from audio, like Direwolf/multimon. Audio in (any rate), AX.25 frames out (FCS checked).
   Each decoder: mark (1200 Hz) and space (2200 Hz) correlators over one bit, a digital PLL for
   the bit clock, NRZI and HDLC (flags, bit stuffing, CRC-16). Three decoders run side by side
   with different mark/space balance, because radio audio is usually de-emphasised (space quieter). */
(function (root) {
  'use strict';
  function crc16(b, n) { let c = 0xFFFF; for (let i = 0; i < n; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0x8408 : c >>> 1; } return (~c) & 0xFFFF; }

  function One(fs, twist, emit) {
    this.fs = fs; this.t = twist; this.emit = emit;
    const N = this.N = Math.max(4, Math.round(fs / 1200));
    this.wm = 2 * Math.PI * 1200 / fs; this.ws = 2 * Math.PI * 2200 / fs;
    this.r = new Float32Array(N * 4); this.k = 0; this.n = 0;
    this.mi = 0; this.mq = 0; this.si = 0; this.sq = 0;
    this.p = 0; this.step = 1200 / fs; this.prev = 0; this.last = 0;
    this.reg = 0; this.ones = 0; this.cur = 0; this.nb = 0; this.fr = null;
  }
  One.prototype.sample = function (x) {
    const N = this.N, n = this.n++, j = this.k * 4, r = this.r;
    const a = x * Math.cos(this.wm * n), b = x * Math.sin(this.wm * n), c = x * Math.cos(this.ws * n), d = x * Math.sin(this.ws * n);
    this.mi += a - r[j]; this.mq += b - r[j + 1]; this.si += c - r[j + 2]; this.sq += d - r[j + 3];
    r[j] = a; r[j + 1] = b; r[j + 2] = c; r[j + 3] = d; this.k = (this.k + 1) % N;
    if ((n & 4095) === 0) { this.mi = this.mq = this.si = this.sq = 0; for (let i = 0; i < N; i++) { this.mi += r[i * 4]; this.mq += r[i * 4 + 1]; this.si += r[i * 4 + 2]; this.sq += r[i * 4 + 3]; } }
    const m = this.mi * this.mi + this.mq * this.mq, s = (this.si * this.si + this.sq * this.sq) * this.t;
    const v = (m - s) / (m + s + 1e-12), sg = v >= 0 ? 1 : -1;
    // PLL: bit boundaries sit where the tone changes; sample in the middle (p crossing 0.5)
    if (sg !== this.prev) { this.p = this.p < 0.5 ? this.p * 0.7 : this.p + (1 - this.p) * 0.3; this.prev = sg; }
    const before = this.p; this.p += this.step; if (this.p >= 1) this.p -= 1;
    if (before < 0.5 && this.p >= 0.5) { const tone = sg; this.bit(tone === this.last ? 1 : 0); this.last = tone; }
  };
  One.prototype.bit = function (bit) {
    this.reg = ((this.reg >> 1) | (bit << 7)) & 0xFF;
    if (this.reg === 0x7E) { // flag: close the frame (if any) and open a new one
      const f = this.fr;
      if (f && f.length >= 18) { const n = f.length, fcs = f[n - 2] | (f[n - 1] << 8); if (crc16(f, n - 2) === fcs) this.emit(f.slice(0, n - 2), this.t); }
      this.fr = []; this.cur = 0; this.nb = 0; this.ones = 0; return;
    }
    if (bit) { if (++this.ones > 6) { this.fr = null; return; } }
    else { if (this.ones === 5) { this.ones = 0; return; } this.ones = 0; } // stuffed zero
    if (!this.fr) return;
    this.cur = (this.cur >> 1) | (bit << 7); if (++this.nb === 8) { this.fr.push(this.cur & 0xFF); this.cur = 0; this.nb = 0; if (this.fr.length > 400) this.fr = null; }
  };

  function Decoder(fs, onFrame) {
    const seen = new Map();
    const emit = (bytes) => { // the same frame from several decoders counts once
      const key = bytes.length + ':' + bytes.slice(-6).join(','), now = Date.now();
      for (const [k, t] of seen) if (now - t > 4000) seen.delete(k);
      if (seen.has(key)) return; seen.set(key, now); this.frames++; onFrame(Uint8Array.from(bytes));
    };
    this.parts = [0.45, 1, 2.6].map(t => new One(fs, t, emit)); this.frames = 0;
  }
  Decoder.prototype.feed = function (x) { const P = this.parts; for (let i = 0; i < x.length; i++) { const v = x[i]; for (let k = 0; k < P.length; k++) P[k].sample(v); } };

  /* encoder: AX.25 bytes (without FCS) -> audio. Used for tests and for sending through the radio's mic. */
  function encode(bytes, fs, opts) {
    opts = opts || {}; const fcs = crc16(bytes, bytes.length), all = [...bytes, fcs & 0xFF, fcs >> 8], bits = [];
    const flag = () => { for (let i = 0; i < 8; i++) bits.push((0x7E >> i) & 1); };
    for (let i = 0; i < (opts.flags || 40); i++) flag();
    let ones = 0; for (const b of all) for (let i = 0; i < 8; i++) { const v = (b >> i) & 1; bits.push(v); if (v) { if (++ones === 5) { bits.push(0); ones = 0; } } else ones = 0; }
    for (let i = 0; i < 4; i++) flag();
    const spb = fs / 1200, out = new Float32Array(Math.ceil(bits.length * spb) + 1); let tone = 1, ph = 0, idx = 0;
    for (let i = 0; i < bits.length; i++) { if (!bits[i]) tone = 1 - tone; const end = Math.round((i + 1) * spb), w = 2 * Math.PI * (tone ? 1200 : 2200) / fs; for (; idx < end; idx++) { out[idx] = 0.6 * Math.sin(ph); ph += w; } }
    return out.subarray(0, idx);
  }
  // AX.25 UI frame bytes from text fields, for tests
  function frame(src, dst, path, info) {
    const a = (c, last) => { const [cs, ss] = c.toUpperCase().split('-'), o = []; for (let i = 0; i < 6; i++) o.push(((cs[i] || ' ').charCodeAt(0)) << 1); o.push(0x60 | ((parseInt(ss || '0') & 15) << 1) | (last ? 1 : 0)); return o; };
    const o = [...a(dst, false), ...a(src, !path.length)]; path.forEach((p, i) => o.push(...a(p, i === path.length - 1)));
    return [...o, 0x03, 0xF0, ...Array.from(info, c => c.charCodeAt(0) & 0xFF)];
  }
  const api = {Decoder, encode, frame, crc16};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AFSK = api;
})(typeof self !== 'undefined' ? self : this);
