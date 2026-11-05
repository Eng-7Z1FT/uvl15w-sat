/* SSTV (slow-scan television) decoder and encoder for the UVL-15W app.
   Decoder: audio samples in (any rate), images out, line by line. It finds the mode from the VIS
   header, or, if the header was missed, from the spacing of the sync pulses (like the Robot36 app),
   and keeps the picture straight by fitting a line through the sync pulses it actually hears.
   Encoder: an image in, the SSTV audio out (VIS header + lines), like the SSTV Encoder app.
   Modes: Robot 36/72, Martin M1/M2, Scottie S1/S2/DX, PD 50/90/120/160/180/240. */
(function (root) {
  'use strict';
  const MODES = {
    robot36:   {vis: 8,  name: 'Robot 36',   w: 320, h: 240, kind: 'robot36', sync: 9, porch: 3, y: 88,  sep: 4.5, sp: 1.5, c: 44},
    robot72:   {vis: 12, name: 'Robot 72',   w: 320, h: 240, kind: 'robot72', sync: 9, porch: 3, y: 138, sep: 4.5, sp: 1.5, c: 69},
    martin1:   {vis: 44, name: 'Martin M1',  w: 320, h: 256, kind: 'martin',  sync: 4.862, porch: 0.572, c: 146.432, sep: 0.572},
    martin2:   {vis: 40, name: 'Martin M2',  w: 320, h: 256, kind: 'martin',  sync: 4.862, porch: 0.572, c: 73.216,  sep: 0.572},
    scottie1:  {vis: 60, name: 'Scottie S1', w: 320, h: 256, kind: 'scottie', sync: 9, porch: 1.5, c: 138.24, sep: 1.5},
    scottie2:  {vis: 56, name: 'Scottie S2', w: 320, h: 256, kind: 'scottie', sync: 9, porch: 1.5, c: 88.064, sep: 1.5},
    scottiedx: {vis: 76, name: 'Scottie DX', w: 320, h: 256, kind: 'scottie', sync: 9, porch: 1.5, c: 345.6,  sep: 1.5},
    pd50:      {vis: 93, name: 'PD 50',  w: 320, h: 256, kind: 'pd', sync: 20, porch: 2.08, c: 91.52},
    pd90:      {vis: 99, name: 'PD 90',  w: 320, h: 256, kind: 'pd', sync: 20, porch: 2.08, c: 170.24},
    pd120:     {vis: 95, name: 'PD 120', w: 640, h: 496, kind: 'pd', sync: 20, porch: 2.08, c: 121.6},
    pd160:     {vis: 98, name: 'PD 160', w: 512, h: 400, kind: 'pd', sync: 20, porch: 2.08, c: 195.584},
    pd180:     {vis: 96, name: 'PD 180', w: 640, h: 496, kind: 'pd', sync: 20, porch: 2.08, c: 183.04},
    pd240:     {vis: 97, name: 'PD 240', w: 640, h: 496, kind: 'pd', sync: 20, porch: 2.08, c: 244.48}
  };
  // line period (ms), rows per line, and where the sync pulse starts inside a line
  for (const k in MODES) {
    const m = MODES[k]; m.key = k;
    if (m.kind === 'robot36') { m.line = m.sync + m.porch + m.y + m.sep + m.sp + m.c; m.rows = 1; m.syncAt = 0; }
    else if (m.kind === 'robot72') { m.line = m.sync + m.porch + m.y + 2 * (m.sep + m.sp + m.c); m.rows = 1; m.syncAt = 0; }
    else if (m.kind === 'martin') { m.line = m.sync + m.porch + 3 * (m.c + m.sep); m.rows = 1; m.syncAt = 0; }
    else if (m.kind === 'scottie') { m.line = 3 * m.c + 2 * m.sep + m.sync + m.porch; m.rows = 1; m.syncAt = 2 * (m.sep + m.c); }
    else { m.line = m.sync + m.porch + 4 * m.c; m.rows = 2; m.syncAt = 0; }
    m.lines = m.h / m.rows;
  }
  const BY_VIS = {}; for (const k in MODES) BY_VIS[MODES[k].vis] = MODES[k];

  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
  // BT.601 studio-range Y/R-Y/B-Y, as MMSSTV and the Robot36 app use
  function yuv2rgb(Y, V, U) {
    const y = 1.164 * (Y - 16), v = V - 128, u = U - 128;
    return [clamp(Math.round(y + 1.596 * v)), clamp(Math.round(y - 0.813 * v - 0.391 * u)), clamp(Math.round(y + 2.018 * u))];
  }
  function rgb2yuv(r, g, b) {
    return [16 + (65.738 * r + 129.057 * g + 25.064 * b) / 256,
            128 + (112.439 * r - 94.154 * g - 18.285 * b) / 256,
            128 + (-37.945 * r - 74.494 * g + 112.439 * b) / 256];
  }
  const f2v = f => clamp((f - 1500) / 800 * 255);
  const v2f = v => 1500 + v / 255 * 800;

  /* ------------------------------ decoder ------------------------------ */
  function Decoder(fs, opts) {
    opts = opts || {};
    this.fs = fs; this.on = opts; this.force = opts.mode || null; // force a mode (no VIS needed)
    const N = (Math.round(fs * 0.0016) | 1), fc = 1050 / fs; this.h = new Float32Array(N);
    let sum = 0;
    for (let n = 0; n < N; n++) { const x = n - (N - 1) / 2, s = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x); this.h[n] = s * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1))); sum += this.h[n]; }
    for (let n = 0; n < N; n++) this.h[n] /= sum;
    this.br = new Float32Array(2 * N); this.bi = new Float32Array(2 * N); this.bp = 0;
    this.ph = 0; this.dph = 2 * Math.PI * 1900 / fs; this.pr = 1; this.pi = 0;
    this.cap = Math.ceil(fs * 12); this.F = new Float32Array(this.cap); this.n = 0; // ring of frequencies, absolute index n
    this.sw = Math.max(3, Math.round(fs * 0.001)); this.ss = 0; this.gap = Math.round(fs * 0.0006); this.runLast = 0;
    this.run = 0; this.runStart = 0; this.syncs = []; this.state = 'idle'; this.img = null; this.fsm = 0;
  }
  Decoder.prototype.f = function (i) { return this.F[i % this.cap]; };
  Decoder.prototype.mean = function (a, b) { // mean frequency over absolute samples [a,b)
    a = Math.max(a | 0, this.n - this.cap + 1); b = Math.min(b | 0, this.n); if (b <= a) return this.f(Math.max(0, Math.min(this.n - 1, a)));
    let s = 0; for (let i = a; i < b; i++) s += this.F[i % this.cap]; return s / (b - a);
  };
  Decoder.prototype.ms = function (ms) { return ms * this.fs / 1000; };
  Decoder.prototype.feed = function (x) {
    const N = this.h.length, h = this.h;
    for (let k = 0; k < x.length; k++) {
      // mix to baseband around 1900 Hz, low-pass, then frequency from the phase step
      this.ph += this.dph; if (this.ph > 6.283185307) this.ph -= 6.283185307;
      const s = x[k], r = s * Math.cos(this.ph), q = -s * Math.sin(this.ph);
      this.br[this.bp] = this.br[this.bp + N] = r; this.bi[this.bp] = this.bi[this.bp + N] = q; this.bp = (this.bp + 1) % N;
      let ar = 0, ai = 0; for (let t = 0; t < N; t++) { ar += this.br[this.bp + t] * h[t]; ai += this.bi[this.bp + t] * h[t]; }
      const dr = ar * this.pr + ai * this.pi, di = ai * this.pr - ar * this.pi; this.pr = ar; this.pi = ai;
      let f = 1900 + Math.atan2(di, dr) * this.fs / (2 * Math.PI);
      if (!(f > 900 && f < 2700)) f = f > 2700 ? 2700 : 900;
      this.F[this.n % this.cap] = f;
      // sync pulses: runs near 1200 Hz on a 1 ms average, tolerating short noise spikes
      this.ss += f - (this.n >= this.sw ? this.F[(this.n - this.sw) % this.cap] : 0);
      const fm = this.ss / Math.min(this.n + 1, this.sw), half = this.sw >> 1;
      if (fm > 1140 && fm < 1260) { if (!this.run) { this.run = 1; this.runStart = this.n - half; } this.runLast = this.n - half; }
      else if (this.run && this.n - half - this.runLast > this.gap) { this.endRun(this.runStart, this.runLast - this.runStart + 1); this.run = 0; }
      this.n++;
      if ((this.n & 63) === 0) { if (this.pending && this.pending()) this.pending = null; if (this.state === 'image') this.lines(); }
    }
    if (this.pending && this.pending()) this.pending = null;
    if (this.state === 'image') this.lines();
  };
  Decoder.prototype.endRun = function (start, len) {
    const ms = len * 1000 / this.fs;
    if (ms >= 3.2) { this.syncs.push([start, ms]); if (this.syncs.length > 400) this.syncs.splice(0, 100); }
    if (this.state === 'idle' && ms > 22 && ms < 40) this.tryVis(start);
    if (this.state === 'idle') this.tryAuto();
  };
  Decoder.prototype.tryVis = function (st) {
    const b = this.ms(30), lead = this.mean(st - this.ms(250), st - this.ms(30));
    if (Math.abs(lead - 1900) > 120) return;
    // bits are read when they have arrived: defer until 9 more bit times are in the buffer
    this.visAt = st; this.state = 'vis';
    const self = this, need = st + b * 10 + 10;
    const check = () => {
      if (self.n < need) return false;
      let code = 0, ones = 0;
      for (let i = 0; i < 8; i++) { const f = self.mean(st + b * (1 + i) + b * 0.2, st + b * (2 + i) - b * 0.2); const bit = f < 1200 ? 1 : 0; if (bit) { ones++; if (i < 7) code |= 1 << i; } }
      const stop = self.mean(st + b * 9 + b * 0.2, st + b * 10 - b * 0.2);
      const m = BY_VIS[code];
      if (m && ones % 2 === 0 && Math.abs(stop - 1200) < 150 && (!self.force || self.force === m.key)) { self.start(m, st + b * 10, 'VIS'); }
      else { self.state = 'idle'; if (self.on.status) self.on.status('VIS غير معروف (' + code + ')'); }
      return true;
    };
    this.pending = check;
  };
  Decoder.prototype.tryAuto = function () { // no VIS: three line periods in a row that match a mode
    const S = this.syncs, L = S.length; if (L < 4) return;
    const cands = this.force ? [MODES[this.force]] : Object.values(MODES);
    for (const m of cands) {
      const per = this.ms(m.line); let ok = true;
      for (let i = L - 3; i < L; i++) {
        const d = S[i][0] - S[i - 1][0], sm = S[i][1];
        if (Math.abs(d - per) > per * 0.006 || sm < m.sync * 0.55 || sm > m.sync * 1.6) { ok = false; break; }
      }
      if (ok) { this.start(m, S[L - 4][0] - this.ms(m.syncAt), 'auto'); return; }
    }
  };
  Decoder.prototype.start = function (m, t0, how) {
    // Scottie sends one extra sync pulse before the first line
    if (how === 'VIS' && m.kind === 'scottie') t0 += this.ms(m.sync);
    this.state = 'image'; this.mode = m; this.t0 = t0; this.per = this.ms(m.line); this.next = 0; this.fit = []; this.miss = 0;
    this.img = new Uint8ClampedArray(m.w * m.h * 4); for (let i = 3; i < this.img.length; i += 4) this.img[i] = 255;
    this.chroma = new Float32Array(m.w); // Robot 36 keeps the last line's other colour difference
    this.how = how; if (this.on.start) this.on.start(m, how);
  };
  Decoder.prototype.lineStart = function (n) { // fitted start of line n, refined by the sync pulse heard near it
    const m = this.mode, exp = this.t0 + n * this.per, sAt = exp + this.ms(m.syncAt), win = Math.min(this.ms(Math.max(3, m.sync * 0.6)) * (1 + Math.min(this.miss, 8)), this.per * 0.06);
    let best = null;
    for (let i = this.syncs.length - 1; i >= 0; i--) {
      const s = this.syncs[i]; if (s[0] < sAt - win * 2) break;
      if (Math.abs(s[0] - sAt) < win && s[1] > m.sync * 0.5 && s[1] < m.sync * 1.8) { best = s; break; }
    }
    if (best) {
      const at = best[0] - this.ms(m.syncAt); this.fit.push([n, at]); if (this.fit.length > 60) this.fit.shift(); this.miss = 0;
      if (this.fit.length < 2) this.t0 = at - n * this.per; // first pulse heard: fix the phase right away
    } else this.miss++;
    if (this.fit.length >= 2) { // least squares: start = a + b*n  (removes slant from a sound-card clock that runs fast or slow)
      let sx = 0, sy = 0, sxx = 0, sxy = 0; const F = this.fit, k = F.length;
      for (const [x, y] of F) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const den = k * sxx - sx * sx; if (den) { const b = (k * sxy - sx * sy) / den, a = (sy - b * sx) / k; if (Math.abs(b - this.per) < this.per * 0.02) { this.per = b; this.t0 = a; } }
    }
    return this.t0 + n * this.per;
  };
  Decoder.prototype.seg = function (t, ms, w, out, off, stride) { // w pixels from a segment starting at t lasting ms
    const pd = this.ms(ms) / w;
    for (let i = 0; i < w; i++) { const a = t + i * pd, b = a + pd; out[off + i * stride] = f2v(this.mean(a + pd * 0.15, Math.max(a + pd * 0.15 + 1, b - pd * 0.15))); }
  };
  Decoder.prototype.lines = function () {
    if (this.pending && this.pending()) this.pending = null;
    const m = this.mode; if (!m) return;
    while (this.state === 'image' && this.next < m.lines) {
      const n = this.next, need = this.t0 + (n + 1) * this.per + this.ms(m.sync) + 4;
      if (this.n < need) return;
      const L = this.lineStart(n), w = m.w, rowY = new Float32Array(w), a = new Float32Array(w), b = new Float32Array(w), c = new Float32Array(w);
      const put = (y, R, G, B) => { const o = y * w * 4; for (let i = 0; i < w; i++) { this.img[o + i * 4] = R[i]; this.img[o + i * 4 + 1] = G[i]; this.img[o + i * 4 + 2] = B[i]; } };
      const ms = v => this.ms(v);
      if (m.kind === 'martin') {
        let t = L + ms(m.sync + m.porch); this.seg(t, m.c, w, a, 0, 1); t += ms(m.c + m.sep); this.seg(t, m.c, w, b, 0, 1); t += ms(m.c + m.sep); this.seg(t, m.c, w, c, 0, 1);
        put(n, c, a, b);
      } else if (m.kind === 'scottie') {
        let t = L + ms(m.sep); this.seg(t, m.c, w, a, 0, 1); t += ms(m.c + m.sep); this.seg(t, m.c, w, b, 0, 1); t += ms(m.c + m.sync + m.porch); this.seg(t, m.c, w, c, 0, 1);
        put(n, c, a, b);
      } else if (m.kind === 'pd') {
        let t = L + ms(m.sync + m.porch); const y0 = a, V = b, U = c, y1 = rowY;
        this.seg(t, m.c, w, y0, 0, 1); t += ms(m.c); this.seg(t, m.c, w, V, 0, 1); t += ms(m.c); this.seg(t, m.c, w, U, 0, 1); t += ms(m.c); this.seg(t, m.c, w, y1, 0, 1);
        const R0 = [], G0 = [], B0 = [], R1 = [], G1 = [], B1 = [];
        for (let i = 0; i < w; i++) { const p = yuv2rgb(y0[i], V[i], U[i]), q = yuv2rgb(y1[i], V[i], U[i]); R0[i] = p[0]; G0[i] = p[1]; B0[i] = p[2]; R1[i] = q[0]; G1[i] = q[1]; B1[i] = q[2]; }
        put(2 * n, R0, G0, B0); put(2 * n + 1, R1, G1, B1);
      } else if (m.kind === 'robot72') {
        let t = L + ms(m.sync + m.porch); this.seg(t, m.y, w, rowY, 0, 1); t += ms(m.y + m.sep + m.sp); this.seg(t, m.c, w, b, 0, 1); t += ms(m.c + m.sep + m.sp); this.seg(t, m.c, w, c, 0, 1); for (let i = w - 5; i < w; i++) c[i] = c[w - 6];
        const R = [], G = [], B = []; for (let i = 0; i < w; i++) { const p = yuv2rgb(rowY[i], b[i], c[i]); R[i] = p[0]; G[i] = p[1]; B[i] = p[2]; } put(n, R, G, B);
      } else { // Robot 36: Y, then R-Y on even lines and B-Y on odd lines (told apart by the separator tone)
        let t = L + ms(m.sync + m.porch); this.seg(t, m.y, w, rowY, 0, 1); t += ms(m.y);
        const sepF = this.mean(t + ms(0.8), t + ms(m.sep - 0.8)), odd = sepF > 1900 ? 1 : sepF < 1900 ? 0 : n & 1;
        t += ms(m.sep + m.sp); this.seg(t, m.c, w, a, 0, 1); for (let i = w - 5; i < w; i++) a[i] = a[w - 6];
        if (!this.ry) { this.ry = new Float32Array(w).fill(128); this.by = new Float32Array(w).fill(128); }
        if (odd) this.by.set(a); else this.ry.set(a);
        const R = [], G = [], B = []; for (let i = 0; i < w; i++) { const p = yuv2rgb(rowY[i], this.ry[i], this.by[i]); R[i] = p[0]; G[i] = p[1]; B[i] = p[2]; } put(n, R, G, B);
      }
      this.next++;
      if (this.on.line) this.on.line(n, m, this.img);
      if (this.miss > 25) { this.finish('lost'); return; }
    }
    if (this.state === 'image' && this.next >= m.lines) this.finish('done');
  };
  Decoder.prototype.finish = function (why) {
    const m = this.mode, rows = Math.min(m.h, this.next * m.rows);
    if (this.on.end && rows > 8) this.on.end(m, this.img, rows, why);
    this.state = 'idle'; this.mode = null; this.ry = this.by = null; this.syncs = [];
  };
  Decoder.prototype.stop = function () { if (this.state === 'image') this.finish('stopped'); };

  /* ------------------------------ encoder ------------------------------ */
  // rgba: Uint8ClampedArray of exactly mode.w x mode.h. Returns Float32Array audio at fs.
  function encode(rgba, key, fs) {
    const m = MODES[key], w = m.w, segs = [];
    const tone = (f, ms) => segs.push([f, ms]);
    tone(1900, 300); tone(1200, 10); tone(1900, 300); tone(1200, 30);
    let ones = 0; for (let i = 0; i < 7; i++) { const bit = (m.vis >> i) & 1; ones += bit; tone(bit ? 1100 : 1300, 30); }
    tone(ones % 2 ? 1100 : 1300, 30); tone(1200, 30);
    const px = (y, i) => { const o = (y * w + i) * 4; return [rgba[o], rgba[o + 1], rgba[o + 2]]; };
    const scan = (ms, vals) => { const d = ms / w; for (let i = 0; i < w; i++) tone(v2f(vals[i]), d); };
    const ch = (y, c) => { const a = []; for (let i = 0; i < w; i++) a.push(px(y, i)[c]); return a; };
    const yuvRow = y => { const Y = [], V = [], U = []; for (let i = 0; i < w; i++) { const q = rgb2yuv(...px(y, i)); Y.push(q[0]); V.push(q[1]); U.push(q[2]); } return [Y, V, U]; };
    if (m.kind === 'scottie') tone(1200, m.sync);
    for (let n = 0; n < m.lines; n++) {
      if (m.kind === 'martin') { tone(1200, m.sync); tone(1500, m.porch); scan(m.c, ch(n, 1)); tone(1500, m.sep); scan(m.c, ch(n, 2)); tone(1500, m.sep); scan(m.c, ch(n, 0)); tone(1500, m.sep); }
      else if (m.kind === 'scottie') { tone(1500, m.sep); scan(m.c, ch(n, 1)); tone(1500, m.sep); scan(m.c, ch(n, 2)); tone(1200, m.sync); tone(1500, m.porch); scan(m.c, ch(n, 0)); }
      else if (m.kind === 'pd') {
        const a = yuvRow(2 * n), b = yuvRow(2 * n + 1), V = a[1].map((v, i) => (v + b[1][i]) / 2), U = a[2].map((v, i) => (v + b[2][i]) / 2);
        tone(1200, m.sync); tone(1500, m.porch); scan(m.c, a[0]); scan(m.c, V); scan(m.c, U); scan(m.c, b[0]);
      } else if (m.kind === 'robot72') {
        const [Y, V, U] = yuvRow(n); tone(1200, m.sync); tone(1500, m.porch); scan(m.y, Y); tone(1500, m.sep); tone(1900, m.sp); scan(m.c, V); tone(2300, m.sep); tone(1500, m.sp); scan(m.c, U);
      } else {
        const [Y, V, U] = yuvRow(n), nx = n + 1 < m.h ? yuvRow(n + 1) : [Y, V, U], odd = n & 1;
        tone(1200, m.sync); tone(1500, m.porch); scan(m.y, Y); tone(odd ? 2300 : 1500, m.sep); tone(1900, m.sp);
        scan(m.c, odd ? U.map((v, i) => (v + nx[2][i]) / 2) : V.map((v, i) => (v + nx[1][i]) / 2));
      }
    }
    let total = 0; for (const s of segs) total += s[1];
    const out = new Float32Array(Math.ceil(total / 1000 * fs) + 1); let ph = 0, t = 0, idx = 0;
    for (const [f, ms] of segs) { t += ms; const end = Math.round(t / 1000 * fs), dp = 2 * Math.PI * f / fs; for (; idx < end && idx < out.length; idx++) { out[idx] = 0.7 * Math.sin(ph); ph += dp; if (ph > 6.283185307) ph -= 6.283185307; } }
    return out.subarray(0, idx);
  }
  function wav(samples, fs) { // 16-bit mono WAV
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, fs, true); v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return buf;
  }
  const api = {MODES, Decoder, encode, wav, yuv2rgb, rgb2yuv};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SSTV = api;
})(typeof self !== 'undefined' ? self : this);
