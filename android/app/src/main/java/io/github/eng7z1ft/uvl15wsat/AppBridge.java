package io.github.eng7z1ft.uvl15wsat;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** window.AndroidApp: save downloads, show notifications, keep the screen on while tracking,
 *  and fetch open ADS-B feeds (they send no CORS header, so the page cannot read them itself). */
public class AppBridge {
    private final Activity act;
    private final WebView web;
    private int notifId = 100;
    // Only these hosts can be fetched through the bridge.
    private static final String[] HTTP_HOSTS = {"api.adsb.lol", "opendata.adsb.fi", "api.airplanes.live", "adsbexchange-com1.p.rapidapi.com", "api.adsbdb.com", "api.planespotters.net"};

    AppBridge(Activity a, WebView w) { act = a; web = w; }

    /** RTL-SDR ADS-B receiver: gain in tenths of dB (-1 = automatic), receiver position for CPR decoding. */
    @JavascriptInterface
    public void sdrStart(final int gainTenths, final double lat, final double lon) {
        act.runOnUiThread(() -> ((MainActivity) act).startSdr(gainTenths, lat, lon));
    }

    /** Voice receiver: frequency in Hz, demod 0 NFM / 1 AM / 2 WFM. Starts the dongle if needed. */
    @JavascriptInterface
    public void sdrListen(final double hz, final int demod, final int gainTenths) {
        act.runOnUiThread(() -> ((MainActivity) act).sdrListen(Math.round(hz), demod, gainTenths));
    }

    @JavascriptInterface
    public void sdrTune(double hz) { SdrRx r = ((MainActivity) act).rx; if (r != null) r.tune(Math.round(hz)); }

    @JavascriptInterface
    public void sdrDemod(int m) { SdrRx r = ((MainActivity) act).rx; if (r != null) r.mode = m; }

    @JavascriptInterface
    public void sdrSquelch(float db) { MainActivity m = (MainActivity) act; m.sqDb = db; if (m.rx != null) m.rx.squelchDb = db; }

    @JavascriptInterface
    public void sdrVolume(float v) { MainActivity m = (MainActivity) act; m.vol = v; if (m.rx != null) m.rx.volume = v; }

    @JavascriptInterface
    public void sdrGain(int g) { MainActivity m = (MainActivity) act; m.sdrGain = g; if (m.sdr.isRunning()) m.sdr.setGain(g); }

    /** SSTV: send the receiver's audio to the page too. */
    @JavascriptInterface
    public void sdrTap(boolean on) { ((MainActivity) act).tapOn = on; }

    @JavascriptInterface
    public void sdrStop() { act.runOnUiThread(() -> ((MainActivity) act).stopSdr()); }

    @JavascriptInterface
    public void sdrRef(double lat, double lon) { ((MainActivity) act).sdr.refLat = lat; ((MainActivity) act).sdr.refLon = lon; }

    @JavascriptInterface
    public boolean sdrRunning() { return ((MainActivity) act).sdr.isRunning(); }

    /** GET a JSON feed from an allowed host; the result comes back through window.__appHttp(id, status, body). */
    @JavascriptInterface
    public void httpGet(final String id, final String url) { get(id, url, null); }

    /** Same, with the user's own RapidAPI key (ADS-B Exchange). The key is sent only to the RapidAPI host. */
    @JavascriptInterface
    public void httpGetKey(final String id, final String url, final String key) { get(id, url, key); }

    private void get(final String id, final String url, final String key) {
        new Thread(() -> {
            int code = 0; String body;
            try {
                URL u = new URL(url);
                boolean ok = "https".equals(u.getProtocol());
                boolean hostOk = false;
                for (String h : HTTP_HOSTS) if (h.equals(u.getHost())) hostOk = true;
                if (!ok || !hostOk) throw new Exception("host not allowed");
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(10000);
                c.setRequestProperty("User-Agent", "UVL15W-sat/3 (7Z1FT amateur radio app)");
                c.setRequestProperty("Accept", "application/json");
                if (key != null && !key.isEmpty() && u.getHost().endsWith(".p.rapidapi.com")) {
                    c.setRequestProperty("X-RapidAPI-Key", key.trim());
                    c.setRequestProperty("X-RapidAPI-Host", u.getHost());
                }
                code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0 && bo.size() < 4_000_000) bo.write(buf, 0, n); in.close(); }
                body = bo.toString("UTF-8");
                c.disconnect();
            } catch (Exception e) {
                body = String.valueOf(e.getMessage());
            }
            final String js = "window.__appHttp&&window.__appHttp(" + JSONObject.quote(id) + "," + code + "," + JSONObject.quote(body) + ")";
            act.runOnUiThread(() -> web.evaluateJavascript(js, null));
        }).start();
    }

    private void toast(final String t) { act.runOnUiThread(() -> Toast.makeText(act, t, Toast.LENGTH_LONG).show()); }

    private static String mime(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".txt") || n.endsWith(".pf")) return "text/plain";
        return "application/octet-stream";
    }

    @JavascriptInterface
    public void saveFile(final String name, final String b64) {
        final byte[] data = Base64.decode(b64, Base64.DEFAULT);
        new Thread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime(name));
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri u = act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) throw new Exception("MediaStore");
                    try (OutputStream o = act.getContentResolver().openOutputStream(u)) { o.write(data); }
                    toast("انحفظ في التنزيلات: " + name);
                } else {
                    File dir = act.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, name);
                    try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
                    toast("انحفظ في: " + f.getAbsolutePath());
                }
            } catch (Exception e) {
                toast("تعذر حفظ الملف: " + e.getMessage());
            }
        }).start();
    }

    @JavascriptInterface
    public boolean notifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return true;
        if (act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return true;
        act.runOnUiThread(() -> act.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 14));
        return false;
    }

    @JavascriptInterface
    public void notify(String title, String body) {
        NotificationManager nm = (NotificationManager) act.getSystemService(Activity.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("passes", "مرور الأقمار", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(act, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(act, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new android.app.Notification.Builder(act, "passes")
                : new android.app.Notification.Builder(act);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
         .setContentTitle(title)
         .setContentText(body)
         .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
         .setAutoCancel(true)
         .setContentIntent(pi);
        try { nm.notify(notifId++, b.build()); } catch (SecurityException e) { /* permission not granted */ }
    }

    @JavascriptInterface
    public void keepScreenOn(final boolean on) {
        act.runOnUiThread(() -> {
            if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
}
