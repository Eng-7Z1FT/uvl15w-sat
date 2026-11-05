package io.github.eng7z1ft.uvl15wsat;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;

/**
 * ADS-B receiver for an RTL-SDR dongle. The "RTL-SDR driver" app (marto.rtl_tcp_andro) owns the USB
 * device and serves raw I/Q over rtl_tcp on localhost; this class reads it at 2 MS/s on 1090 MHz,
 * finds Mode S preambles, checks the CRC and decodes DF17/DF18 extended squitters
 * (call sign, position, altitude, speed, track) like dump1090 does.
 * Plain Java on purpose: the decoder is tested off-device with synthetic signals.
 */
public final class SdrAdsb {
    public interface Sink {
        void onAircraft(String json);
        void onStatus(String state, String detail);
    }

    // ---------------- decoder state ----------------
    static final class Ac {
        final int icao; String flight = ""; double lat = Double.NaN, lon = Double.NaN;
        int alt = Integer.MIN_VALUE; double gs = -1, trk = -1; int vr = Integer.MIN_VALUE;
        long seen, seenPos; int msgs;
        int evenLat = -1, evenLon = -1, oddLat = -1, oddLon = -1; long evenT, oddT;
        Ac(int i) { icao = i; }
    }
    final HashMap<Integer, Ac> acs = new HashMap<>();
    public volatile double refLat = Double.NaN, refLon = Double.NaN;
    long msgsOk, preambles;
    private short[] mag = new short[0];
    private static final short[] MAG_LUT = new short[65536];
    static {
        for (int i = 0; i < 256; i++) for (int q = 0; q < 256; q++) {
            double fi = (i - 127.4) / 128.0, fq = (q - 127.4) / 128.0;
            MAG_LUT[(i << 8) | q] = (short) Math.min(32767, Math.round(Math.sqrt(fi * fi + fq * fq) * 360));
        }
    }
    private static final int PRE = 16, LONG_BITS = 112, FULL = PRE + LONG_BITS * 2;
    private final int[] bits = new int[LONG_BITS];
    private final int[] work = new int[LONG_BITS];
    private static final int[] GEN = new int[25];
    static { int g = 0x1FFF409; for (int k = 0; k < 25; k++) GEN[k] = (g >> (24 - k)) & 1; }

    /** Feed interleaved unsigned 8-bit I/Q. Keeps a tail between calls so messages across buffers are found. */
    private short[] tail = new short[0];
    public void feed(byte[] iq, int len, long now) {
        int n = len / 2, t = tail.length;
        if (mag.length < t + n) mag = new short[t + n];
        System.arraycopy(tail, 0, mag, 0, t);
        long sum = 0; int mx = magMax;
        for (int k = 0; k < n; k++) { short v = MAG_LUT[((iq[2 * k] & 0xFF) << 8) | (iq[2 * k + 1] & 0xFF)]; mag[t + k] = v; sum += v; if (v > mx) mx = v; }
        magSum += sum; magN += n; magMax = mx;
        int total = t + n, end = total - FULL, j = 0;
        while (j < end) {
            if (preamble(j)) {
                preambles++;
                if (demod(j + PRE) && handle(now)) { j += FULL; continue; }
            }
            j++;
        }
        int keep = Math.min(total, FULL);
        tail = new short[keep];
        System.arraycopy(mag, total - keep, tail, 0, keep);
    }

    // dump1090's 2 MHz preamble test: pulses at 0, 1, 3.5 and 4.5 us
    private boolean preamble(int j) {
        short[] m = mag;
        if (!(m[j] > m[j + 1] && m[j + 1] < m[j + 2] && m[j + 2] > m[j + 3] && m[j + 3] < m[j]
                && m[j + 4] < m[j] && m[j + 5] < m[j] && m[j + 6] < m[j]
                && m[j + 7] > m[j + 8] && m[j + 8] < m[j + 9] && m[j + 9] > m[j + 6])) return false;
        int high = (m[j] + m[j + 2] + m[j + 7] + m[j + 9]) / 6;
        if (m[j + 4] >= high || m[j + 5] >= high) return false;
        return m[j + 11] < high && m[j + 12] < high && m[j + 13] < high && m[j + 14] < high;
    }

    private boolean demod(int s) {
        short[] m = mag;
        for (int i = 0; i < LONG_BITS; i++) { int a = m[s + 2 * i], b = m[s + 2 * i + 1]; bits[i] = a > b ? 1 : 0; }
        int df = get(0, 5);
        if (df != 17 && df != 18) return false;
        int syn = syndrome(bits, work);
        if (syn == 0) return true;
        // one wrong bit (common with real signals): its syndrome tells which bit, like dump1090 does
        for (int i = 5; i < LONG_BITS; i++) if (SYN[i] == syn) { bits[i] ^= 1; fixed++; return true; }
        return false;
    }

    /** CRC-24 remainder of the 112-bit frame (0 = valid). */
    private static int syndrome(int[] b, int[] w) {
        System.arraycopy(b, 0, w, 0, LONG_BITS);
        for (int i = 0; i < LONG_BITS - 24; i++) if (w[i] == 1) for (int k = 0; k < 25; k++) w[i + k] ^= GEN[k];
        int r = 0; for (int i = LONG_BITS - 24; i < LONG_BITS; i++) r = (r << 1) | w[i];
        return r;
    }
    private static final int[] SYN = new int[LONG_BITS];
    static { int[] b = new int[LONG_BITS], w = new int[LONG_BITS]; for (int i = 0; i < LONG_BITS; i++) { b[i] = 1; SYN[i] = syndrome(b, w); b[i] = 0; } }
    public long fixed, magSum, magN; public int magMax;

    private boolean crcOk() { return syndrome(bits, work) == 0; }

    private int get(int start, int len) { int v = 0; for (int i = 0; i < len; i++) v = (v << 1) | bits[start + i]; return v; }

    /** Decode the frame now in bits[]. Public for tests through decodeHex. */
    boolean handle(long now) {
        msgsOk++;
        int icao = get(8, 24), tc = get(32, 5);
        Ac a = acs.get(icao);
        if (a == null) { a = new Ac(icao); acs.put(icao, a); }
        a.seen = now; a.msgs++;
        if (tc >= 1 && tc <= 4) {
            final String cs = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ##### ###############0123456789######";
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) { char c = cs.charAt(get(40 + 6 * i, 6)); if (c != '#') sb.append(c); }
            a.flight = sb.toString().trim();
        } else if ((tc >= 9 && tc <= 18) || (tc >= 20 && tc <= 22)) {
            if (tc <= 18) {
                int a12 = get(40, 12);
                if ((a12 & 0x10) != 0) { int nn = ((a12 & 0xFE0) >> 1) | (a12 & 0xF); a.alt = nn * 25 - 1000; }
            }
            int odd = bits[53], lat = get(54, 17), lon = get(71, 17);
            if (odd == 1) { a.oddLat = lat; a.oddLon = lon; a.oddT = now; } else { a.evenLat = lat; a.evenLon = lon; a.evenT = now; }
            double[] p = null;
            if (a.evenLat >= 0 && a.oddLat >= 0 && Math.abs(a.evenT - a.oddT) < 10000) p = globalCpr(a, odd == 1);
            if (p == null && !Double.isNaN(refLat)) p = localCpr(lat, lon, odd == 1, refLat, refLon);
            if (p != null && (Double.isNaN(refLat) || distKm(p[0], p[1], refLat, refLon) < 700)) { a.lat = p[0]; a.lon = p[1]; a.seenPos = now; }
        } else if (tc == 19) {
            int st = get(37, 3);
            if (st == 1 || st == 2) {
                int vew = get(46, 10), vns = get(57, 10);
                if (vew > 0 && vns > 0) {
                    double vx = (vew - 1) * (bits[45] == 1 ? -1 : 1), vy = (vns - 1) * (bits[56] == 1 ? -1 : 1);
                    if (st == 2) { vx *= 4; vy *= 4; }
                    a.gs = Math.hypot(vx, vy);
                    a.trk = (Math.toDegrees(Math.atan2(vx, vy)) + 360) % 360;
                }
                int v = get(69, 9);
                if (v > 0) a.vr = (v - 1) * 64 * (bits[68] == 1 ? -1 : 1);
            }
        }
        return true;
    }

    // ---------------- CPR position decoding ----------------
    static int nl(double lat) {
        double a = Math.abs(lat);
        if (a < 1e-9) return 59;
        if (a > 87) return 1;
        if (Math.abs(a - 87) < 1e-9) return 2;
        double x = 1 - (1 - Math.cos(Math.PI / 30)) / Math.pow(Math.cos(Math.PI / 180 * a), 2);
        return (int) Math.floor(2 * Math.PI / Math.acos(x));
    }
    static double mod(double a, double b) { double r = a % b; return r < 0 ? r + b : r; }

    static double[] globalCpr(Ac a, boolean newestOdd) {
        double le = a.evenLat / 131072.0, lo = a.oddLat / 131072.0, ne = a.evenLon / 131072.0, no = a.oddLon / 131072.0;
        double j = Math.floor(59 * le - 60 * lo + 0.5);
        double rle = 360.0 / 60 * (mod(j, 60) + le), rlo = 360.0 / 59 * (mod(j, 59) + lo);
        if (rle >= 270) rle -= 360;
        if (rlo >= 270) rlo -= 360;
        if (nl(rle) != nl(rlo)) return null;
        double lat = newestOdd ? rlo : rle;
        int nlv = nl(lat), ni = Math.max(newestOdd ? nlv - 1 : nlv, 1);
        double m = Math.floor(ne * (nlv - 1) - no * nlv + 0.5);
        double lon = 360.0 / ni * (mod(m, ni) + (newestOdd ? no : ne));
        if (lon >= 180) lon -= 360;
        return new double[]{lat, lon};
    }

    static double[] localCpr(int latC, int lonC, boolean odd, double refLat, double refLon) {
        double dLat = 360.0 / (odd ? 59 : 60), y = latC / 131072.0, x = lonC / 131072.0;
        double j = Math.floor(refLat / dLat) + Math.floor(0.5 + mod(refLat, dLat) / dLat - y);
        double lat = dLat * (j + y);
        int ni = Math.max(nl(lat) - (odd ? 1 : 0), 1);
        double dLon = 360.0 / ni;
        double m = Math.floor(refLon / dLon) + Math.floor(0.5 + mod(refLon, dLon) / dLon - x);
        double lon = dLon * (m + x);
        if (lon >= 180) lon -= 360;
        return new double[]{lat, lon};
    }

    static double distKm(double a, double b, double c, double d) {
        double r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
        return 2 * 6371 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
    }

    /** Test hook: decode one frame given as 28 hex digits. */
    boolean decodeHex(String hex, long now) {
        for (int i = 0; i < LONG_BITS; i++) bits[i] = (Integer.parseInt(hex.substring(i / 4, i / 4 + 1), 16) >> (3 - i % 4)) & 1;
        if (!crcOk()) return false;
        return handle(now);
    }

    /** Aircraft seen in the last 60 s as JSON, in the field names the page already uses (readsb style). */
    public String json(long now) {
        StringBuilder sb = new StringBuilder("{\"src\":\"sdr\",\"msgs\":").append(msgsOk).append(",\"ac\":[");
        boolean first = true;
        for (Iterator<Ac> it = acs.values().iterator(); it.hasNext(); ) {
            Ac a = it.next();
            if (now - a.seen > 60000) { it.remove(); continue; }
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"hex\":\"").append(String.format(Locale.US, "%06x", a.icao)).append('"');
            sb.append(",\"flight\":\"").append(a.flight.replaceAll("[^A-Z0-9 ]", "")).append('"');
            if (!Double.isNaN(a.lat)) sb.append(String.format(Locale.US, ",\"lat\":%.5f,\"lon\":%.5f,\"seen_pos\":%.1f", a.lat, a.lon, (now - a.seenPos) / 1000.0));
            if (a.alt != Integer.MIN_VALUE) sb.append(",\"alt_baro\":").append(a.alt);
            if (a.gs >= 0) sb.append(String.format(Locale.US, ",\"gs\":%.0f,\"track\":%.1f", a.gs, a.trk));
            if (a.vr != Integer.MIN_VALUE) sb.append(",\"baro_rate\":").append(a.vr);
            sb.append(String.format(Locale.US, ",\"seen\":%.1f,\"messages\":%d,\"sdr\":1}", (now - a.seen) / 1000.0, a.msgs));
        }
        return sb.append("]}").toString();
    }

    // ---------------- rtl_tcp client ----------------
    /** When set, the stream goes to the voice receiver instead of the ADS-B decoder (same dongle, same connection). */
    private volatile SdrRx rx;
    private final java.util.concurrent.ConcurrentLinkedQueue<long[]> cmdQ = new java.util.concurrent.ConcurrentLinkedQueue<>();
    public void post(int c, long v) { cmdQ.add(new long[]{c, v}); }
    public void setRx(SdrRx r) {
        rx = r;
        if (r != null) { post(0x02, SdrRx.FS); post(0x01, r.centerHz); }
        else { post(0x02, 2000000L); post(0x01, 1090000000L); tail = new short[0]; }
    }
    public SdrRx getRx() { return rx; }
    public void setGain(int gainTenths) {
        if (gainTenths < 0) { post(0x03, 0); post(0x08, 1); } else { post(0x03, 1); post(0x08, 0); post(0x04, gainTenths); }
    }
    private volatile boolean running;
    private Thread thread;
    private Socket sock;

    public synchronized void start(final int port, final int gainTenths, final Sink sink) {
        stop();
        running = true;
        thread = new Thread(() -> run(port, gainTenths, sink), "sdr-adsb");
        thread.start();
    }

    public synchronized void stop() {
        running = false;
        try { if (sock != null) sock.close(); } catch (Exception ignored) { }
        sock = null;
        if (thread != null) thread.interrupt();
        thread = null;
    }

    public boolean isRunning() { return running; }

    private static void cmd(OutputStream o, int c, long v) throws Exception {
        o.write(new byte[]{(byte) c, (byte) (v >> 24), (byte) (v >> 16), (byte) (v >> 8), (byte) v});
        o.flush();
    }

    private void run(int port, int gainTenths, Sink sink) {
        Socket s = null;
        try {
            s = new Socket();
            for (int tries = 0; ; tries++) {
                try { s.connect(new InetSocketAddress("127.0.0.1", port), 3000); break; }
                catch (Exception e) { if (tries >= 10 || !running) throw e; Thread.sleep(400); s.close(); s = new Socket(); }
            }
            sock = s;
            s.setReceiveBufferSize(1 << 20);
            OutputStream o = s.getOutputStream();
            SdrRx r0 = rx;
            cmd(o, 0x02, r0 != null ? SdrRx.FS : 2000000L);              // sample rate
            cmd(o, 0x01, r0 != null ? r0.centerHz : 1090000000L);         // frequency
            cmdQ.clear();
            if (gainTenths < 0) { cmd(o, 0x03, 0); cmd(o, 0x08, 1); }          // auto gain
            else { cmd(o, 0x03, 1); cmd(o, 0x08, 0); cmd(o, 0x04, gainTenths); } // manual gain
            InputStream in = s.getInputStream();
            byte[] buf = new byte[262144];
            // rtl_tcp starts with a 12-byte "RTL0" header; skip it when present (4 bytes keep I/Q aligned either way)
            int got = 0; while (got < 4) { int r = in.read(buf, got, 4 - got); if (r < 0) throw new Exception("closed"); got += r; }
            if (buf[0] == 'R' && buf[1] == 'T' && buf[2] == 'L' && buf[3] == '0') { int skip = 8; while (skip > 0) { long k = in.skip(skip); if (k <= 0) { if (in.read() < 0) throw new Exception("closed"); k = 1; } skip -= k; } }
            sink.onStatus("on", "");
            long lastOut = 0, bytes = 0, lastMsgs = 0, lastPre = 0, lastStatT = System.currentTimeMillis();
            while (running) {
                int r = in.read(buf, 0, buf.length & ~1);
                if (r < 0) break;
                if ((r & 1) == 1) { int r2 = in.read(buf, r, 1); if (r2 < 0) break; r++; }
                long now = System.currentTimeMillis();
                for (long[] c; (c = cmdQ.poll()) != null; ) cmd(o, (int) c[0], c[1]);
                SdrRx cur = rx;
                if (cur != null) cur.process(buf, r, now); else feed(buf, r, now);
                bytes += r;
                if (now - lastOut >= 1000) {
                    lastOut = now;
                    String j = json(now);
                    double secs = Math.max(0.5, (now - lastStatT) / 1000.0);
                    String stat = cur != null ? String.format(Locale.US, "RX · %.2f MS/s", bytes / 2e6 / secs)
                        : String.format(Locale.US, "ADS-B · %.1f MS/s · %.0f msg/s · %d ac · sig %d/%d · pre %.0f/s · fix %d", bytes / 2e6 / secs, (msgsOk - lastMsgs) / secs, acs.size(),
                            magN > 0 ? magSum / magN : 0, magMax, (preambles - lastPre) / secs, fixed);
                    lastPre = preambles; magSum = 0; magN = 0; magMax = 0;
                    bytes = 0; lastMsgs = msgsOk; lastStatT = now;
                    if (cur == null) sink.onAircraft(j);
                    sink.onStatus("on", stat);
                }
            }
            sink.onStatus("off", running ? "انقطع الاتصال بمشغّل RTL-SDR" : "");
        } catch (Exception e) {
            sink.onStatus("error", running ? String.valueOf(e.getMessage()) : "");
        } finally {
            running = false;
            try { if (s != null) s.close(); } catch (Exception ignored) { }
        }
    }

    // ---------------- off-device test helpers ----------------
    /** Build 2 MS/s I/Q (unsigned 8-bit) for one 112-bit frame, with noise. */
    public static byte[] synth(String hex, double amp, double noise, java.util.Random rnd, int padSamples) {
        int[] b = new int[112];
        for (int i = 0; i < 112; i++) b[i] = (Integer.parseInt(hex.substring(i / 4, i / 4 + 1), 16) >> (3 - i % 4)) & 1;
        ArrayList<Double> env = new ArrayList<>();
        for (int i = 0; i < padSamples; i++) env.add(0.0);
        int[] pre = {1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0};
        for (int p : pre) env.add(p * amp);
        for (int i = 0; i < 112; i++) { env.add(b[i] == 1 ? amp : 0.0); env.add(b[i] == 1 ? 0.0 : amp); }
        for (int i = 0; i < padSamples; i++) env.add(0.0);
        byte[] out = new byte[env.size() * 2];
        double ph = 0;
        for (int k = 0; k < env.size(); k++) {
            ph += 0.3;
            double i = env.get(k) * Math.cos(ph) + rnd.nextGaussian() * noise, q = env.get(k) * Math.sin(ph) + rnd.nextGaussian() * noise;
            out[2 * k] = (byte) Math.max(0, Math.min(255, Math.round(127.4 + i * 127)));
            out[2 * k + 1] = (byte) Math.max(0, Math.min(255, Math.round(127.4 + q * 127)));
        }
        return out;
    }
}
