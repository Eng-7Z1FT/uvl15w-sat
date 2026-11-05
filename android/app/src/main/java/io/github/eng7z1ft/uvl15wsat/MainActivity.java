package io.github.eng7z1ft.uvl15wsat;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Shows the GitHub Pages site in a WebView and gives it native Bluetooth (BLE + classic SPP),
 *  file saving and notifications through two JavaScript bridges (see android-bridge.js on the site). */
public class MainActivity extends Activity {
    static final String SITE = "https://eng-7z1ft.github.io/uvl15w-sat/";
    static final int REQ_FILE = 11, REQ_GEO = 13, REQ_SDR = 1234, SDR_PORT = 14423;
    WebView web;
    BtBridge bt;
    ValueCallback<Uri[]> fileCb;
    GeolocationPermissions.Callback geoCb;
    String geoOrigin;
    final SdrAdsb sdr = new SdrAdsb();
    int sdrGain = -1;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " UVL15WApp/4");
        bt = new BtBridge(this, web);
        web.addJavascriptInterface(bt, "AndroidBT");
        web.addJavascriptInterface(new AppBridge(this, web), "AndroidApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String u = req.getUrl().toString();
                if (u.startsWith(SITE)) return false;
                try {
                    Intent i = u.startsWith("intent:") ? Intent.parseUri(u, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, req.getUrl());
                    startActivity(i);
                } catch (Exception e) { /* nothing can open it */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origin, true, false);
                } else {
                    geoCb = cb; geoOrigin = origin;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO);
                }
            }
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(Intent.createChooser(i, "اختر ملف"), REQ_FILE); }
                catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        if (saved != null) web.restoreState(saved);
        else {
            Uri data = getIntent() != null ? getIntent().getData() : null;
            web.loadUrl(data != null && data.toString().startsWith(SITE) ? data.toString() : SITE);
        }
        bt.ensurePermissions();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_SDR) {
            if (res == RESULT_OK) sdr.start(SDR_PORT, sdrGain, sdrSink);
            else {
                String msg = data != null ? data.getStringExtra("detailed_exception_message") : null;
                sdrStatus("error", msg != null ? msg : "مشغّل RTL-SDR ما قدر يفتح القطعة. تأكد إنها موصّلة بكيبل OTG ووافقت على صلاحية USB.");
            }
            return;
        }
        if (req == REQ_FILE && fileCb != null) {
            Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
            fileCb.onReceiveValue(u != null ? new Uri[]{u} : null);
            fileCb = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == REQ_GEO && geoCb != null) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            geoCb.invoke(geoOrigin, ok, false);
            geoCb = null;
        }
    }

    /** Ask the RTL-SDR driver app (iqsrc://) to open the dongle and serve rtl_tcp on localhost. */
    void startSdr(int gainTenths, double lat, double lon) {
        sdrGain = gainTenths;
        if (!Double.isNaN(lat)) { sdr.refLat = lat; sdr.refLon = lon; }
        if (sdr.isRunning()) { sdrStatus("on", ""); return; }
        Intent i = new Intent(Intent.ACTION_VIEW).setData(Uri.parse("iqsrc://-a 127.0.0.1 -p " + SDR_PORT + " -s 2000000"));
        try { startActivityForResult(i, REQ_SDR); sdrStatus("starting", ""); }
        catch (android.content.ActivityNotFoundException e) { sdrStatus("nodriver", ""); }
    }

    void stopSdr() { sdr.stop(); sdrStatus("off", ""); }

    void sdrStatus(String state, String detail) {
        final String js = "window.__sdrStatus&&window.__sdrStatus(" + org.json.JSONObject.quote(state) + "," + org.json.JSONObject.quote(detail == null ? "" : detail) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    final SdrAdsb.Sink sdrSink = new SdrAdsb.Sink() {
        @Override public void onAircraft(String json) { runOnUiThread(() -> web.evaluateJavascript("window.__sdrAc&&window.__sdrAc(" + json + ")", null)); }
        @Override public void onStatus(String state, String detail) { sdrStatus(state, detail); }
    };

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        bt.shutdown();
        sdr.stop();
        web.destroy();
        super.onDestroy();
    }
}
