package io.github.eng7z1ft.uvl15wsat;

/**
 * Voice receiver DSP for the RTL-SDR: 1.024 MS/s unsigned 8-bit I/Q in, 32 kHz 16-bit audio out.
 * The dongle is tuned 256 kHz below the wanted frequency (keeps the DC spike out of the channel);
 * a numerically controlled oscillator brings the channel to 0 Hz, so Doppler corrections are just
 * NCO changes until the signal drifts too far and the tuner is moved.
 * Modes: NFM (satellites, repeaters), AM (airband), WFM (broadcast). Also produces a 256-bin
 * spectrum of the whole 1 MHz for the waterfall, and the channel level for the squelch.
 * Plain Java: tested off-device with synthetic FM/AM signals.
 */
public final class SdrRx {
    public interface Out {
        void audio(short[] pcm, int n);
        void spectrum(byte[] bins, long centerHz, int rate);
        void level(float dbfs, boolean open);
        void retune(long centerHz);
    }

    public static final int FS = 1024000, OFF = 256000, AUD = 32000;
    public static final int NFM = 0, AM = 1, WFM = 2;

    private final Out out;
    public volatile long targetHz;
    public volatile long centerHz;
    public volatile int mode = NFM;
    public volatile float squelchDb = -200f; // off
    public volatile float volume = 0.8f;

    public SdrRx(Out o, long freqHz, int m) { out = o; mode = m; targetHz = freqHz; centerHz = freqHz - OFF; }

    /** Change the wanted frequency (Doppler or a new channel). Moves the tuner only when the NCO would leave the band. */
    public void tune(long hz) {
        targetHz = hz;
        long d = hz - centerHz;
        if (d < 60000 || d > 440000) { centerHz = hz - OFF; out.retune(centerHz); }
    }

    // ---------- filters ----------
    private static float[] lowpass(int taps, double cutoff, double fs) {
        float[] h = new float[taps]; double sum = 0, fc = cutoff / fs; int m = taps - 1;
        for (int n = 0; n < taps; n++) {
            double x = n - m / 2.0, s = x == 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
            double w = 0.42 - 0.5 * Math.cos(2 * Math.PI * n / m) + 0.08 * Math.cos(4 * Math.PI * n / m); // Blackman
            h[n] = (float) (s * w); sum += h[n];
        }
        for (int n = 0; n < taps; n++) h[n] /= sum;
        return h;
    }
    private static final float[] H1 = lowpass(40, 48000, FS);          // 1.024 M -> 128 k
    private static final float[] H2N = lowpass(64, 9000, FS / 8.0);    // 128 k -> 32 k, NFM channel
    private static final float[] H2A = lowpass(64, 5500, FS / 8.0);    // AM channel
    private static final float[] H2W = lowpass(32, 15000, FS / 8.0);   // WFM audio after demod
    private static final float[] MAGI = new float[256];
    static { for (int i = 0; i < 256; i++) MAGI[i] = (i - 127.4f) / 128f; }

    // stage-1 delay line (complex), stage-2 delay line
    private final float[] d1r = new float[H1.length * 2], d1i = new float[H1.length * 2]; private int p1, ph1;
    private final float[] d2r = new float[64 * 2], d2i = new float[64 * 2]; private int p2, ph2;
    private final float[] dwa = new float[32 * 2]; private int pw, phw;
    // NCO
    private double ncoR = 1, ncoI = 0; private long ncoFor = Long.MIN_VALUE; private double stepR = 1, stepI = 0; private int renorm;
    // demod state
    private float lastR = 1, lastI = 0, deem, dcAvg, agc = 0.05f, hpf, hpfPrev;
    private final short[] pcm = new short[4096]; private int pcmN;
    private double powAcc; private int powN; private boolean open;
    // spectrum
    private final float[] fr = new float[1024], fi = new float[1024]; private int specN; private long specLast; private int specSkip;
    private static final float[] HANN = new float[1024];
    static { for (int i = 0; i < 1024; i++) HANN[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / 1023)); }

    /** Process interleaved unsigned 8-bit I/Q at FS. */
    public void process(byte[] iq, int len, long nowMs) {
        long f = targetHz - centerHz;
        if (f != ncoFor) { ncoFor = f; double w = -2 * Math.PI * f / FS; stepR = Math.cos(w); stepI = Math.sin(w); }
        final float[] h1 = H1; final int L1 = h1.length; final int m = mode;
        for (int k = 0; k + 1 < len; k += 2) {
            float xr = MAGI[iq[k] & 0xFF], xi = MAGI[iq[k + 1] & 0xFF];
            // spectrum capture: 1024 raw samples about 10 times a second
            if (specN < 1024) { if (specSkip > 0) specSkip--; else { fr[specN] = xr * HANN[specN]; fi[specN] = xi * HANN[specN]; specN++; } }
            // mix the channel down to 0 Hz
            float yr = (float) (xr * ncoR - xi * ncoI), yi = (float) (xr * ncoI + xi * ncoR);
            double nr = ncoR * stepR - ncoI * stepI; ncoI = ncoR * stepI + ncoI * stepR; ncoR = nr;
            if (++renorm >= 4096) { renorm = 0; double g = 1 / Math.hypot(ncoR, ncoI); ncoR *= g; ncoI *= g; }
            d1r[p1] = d1r[p1 + L1] = yr; d1i[p1] = d1i[p1 + L1] = yi; p1 = (p1 + 1) % L1;
            if (++ph1 < 8) continue;
            ph1 = 0;
            float ar = 0, ai = 0;
            for (int t = 0; t < L1; t++) { float c = h1[t]; ar += d1r[p1 + t] * c; ai += d1i[p1 + t] * c; }
            stage2(ar, ai, m);
        }
        if (specN >= 1024 && nowMs - specLast >= 100) { specLast = nowMs; spectrum(); specN = 0; specSkip = FS / 20; }
        else if (specN >= 1024 && nowMs - specLast < 100) { specN = 0; specSkip = FS / 50; }
    }

    // 128 kHz complex sample
    private void stage2(float ar, float ai, int m) {
        if (m == WFM) {
            float dr = ar * lastR + ai * lastI, di = ai * lastR - ar * lastI; lastR = ar; lastI = ai;
            float v = (float) Math.atan2(di, dr) * 0.6f;
            powAcc += ar * ar + ai * ai; powN++;
            int L = H2W.length; dwa[pw] = dwa[pw + L] = v; pw = (pw + 1) % L;
            if (++phw < 4) return; phw = 0;
            float s = 0; for (int t = 0; t < L; t++) s += dwa[pw + t] * H2W[t];
            deem += (s - deem) * 0.49f;                    // 50 us de-emphasis at 32 kHz
            emit(deem * 0.9f);
            return;
        }
        final float[] h = m == AM ? H2A : H2N; int L = h.length;
        d2r[p2] = d2r[p2 + L] = ar; d2i[p2] = d2i[p2 + L] = ai; p2 = (p2 + 1) % L;
        if (++ph2 < 4) return; ph2 = 0;
        float br = 0, bi = 0;
        for (int t = 0; t < L; t++) { float c = h[t]; br += d2r[p2 + t] * c; bi += d2i[p2 + t] * c; }
        powAcc += br * br + bi * bi; powN++;
        float v;
        if (m == AM) {
            float a = (float) Math.sqrt(br * br + bi * bi);
            dcAvg += (a - dcAvg) * 0.0005f;                // carrier level
            agc += (Math.max(dcAvg, 1e-4f) - agc) * 0.002f;
            v = (a - dcAvg) / (agc * 1.1f);
        } else {
            float dr = br * lastR + bi * lastI, di = bi * lastR - br * lastI; lastR = br; lastI = bi;
            v = (float) Math.atan2(di, dr) * 2.1f;         // +-5 kHz deviation ~ +-1
            deem += (v - deem) * 0.35f;                    // gentle NFM de-emphasis / audio low-pass
            v = deem;
        }
        // DC block
        float y = v - hpfPrev + 0.995f * hpf; hpfPrev = v; hpf = y;
        emit(y);
    }

    private void emit(float v) {
        if (powN >= AUD / 10) {
            float db = (float) (10 * Math.log10(powAcc / powN + 1e-12));
            boolean o = db >= squelchDb;
            if (o != open) open = o;
            out.level(db, open);
            powAcc = 0; powN = 0;
        }
        float s = open || squelchDb <= -199 ? v * volume : 0;
        int x = Math.round(s * 22000);
        pcm[pcmN++] = (short) Math.max(-32767, Math.min(32767, x));
        if (pcmN == pcm.length) { out.audio(pcm, pcmN); pcmN = 0; }
    }

    // ---------- spectrum (radix-2 FFT of 1024 points -> 256 bins, 0..255 over -100..-20 dBFS) ----------
    private final byte[] bins = new byte[256];
    private void spectrum() {
        int n = 1024;
        for (int i = 1, j = 0; i < n; i++) { int bit = n >> 1; for (; (j & bit) != 0; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { float t = fr[i]; fr[i] = fr[j]; fr[j] = t; t = fi[i]; fi[i] = fi[j]; fi[j] = t; } }
        for (int len = 2; len <= n; len <<= 1) {
            double ang = -2 * Math.PI / len; float wr = (float) Math.cos(ang), wi = (float) Math.sin(ang);
            for (int i = 0; i < n; i += len) {
                float cr = 1, ci = 0;
                for (int j = 0; j < len / 2; j++) {
                    int a = i + j, b = a + len / 2;
                    float tr = fr[b] * cr - fi[b] * ci, ti = fr[b] * ci + fi[b] * cr;
                    fr[b] = fr[a] - tr; fi[b] = fi[a] - ti; fr[a] += tr; fi[a] += ti;
                    float nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
                }
            }
        }
        for (int b = 0; b < 256; b++) {
            float mx = 0;
            for (int q = 0; q < 4; q++) { int i = (b * 4 + q + 512) & 1023; float p = fr[i] * fr[i] + fi[i] * fi[i]; if (p > mx) mx = p; }
            float db = (float) (10 * Math.log10(mx / (1024f * 1024f * 0.25f) + 1e-14));
            int v = Math.round((db + 100) / 80 * 255);
            bins[b] = (byte) Math.max(0, Math.min(255, v));
        }
        out.spectrum(bins, centerHz, FS);
    }

    // ---------- off-device test helper ----------
    /** I/Q at FS with a carrier at offHz from the tuner centre: FM (devHz) or AM (depth) by a tone. */
    public static byte[] synth(int samples, double offHz, boolean am, double toneHz, double dev, double amp, double noise, java.util.Random r) {
        byte[] o = new byte[samples * 2]; double ph = 0;
        for (int n = 0; n < samples; n++) {
            double t = (double) n / FS, mod = Math.sin(2 * Math.PI * toneHz * t), a = amp;
            if (am) { a = amp * (1 + dev * mod); ph += 2 * Math.PI * offHz / FS; }
            else ph += 2 * Math.PI * (offHz + dev * mod) / FS;
            double i = a * Math.cos(ph) + r.nextGaussian() * noise, q = a * Math.sin(ph) + r.nextGaussian() * noise;
            o[2 * n] = (byte) Math.max(0, Math.min(255, Math.round(127.4 + i * 127)));
            o[2 * n + 1] = (byte) Math.max(0, Math.min(255, Math.round(127.4 + q * 127)));
        }
        return o;
    }
}
