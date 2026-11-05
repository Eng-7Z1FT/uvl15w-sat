package io.github.eng7z1ft.uvl15wsat;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** window.AndroidBT: BLE (programming link) and classic Bluetooth SPP (CI-V / KISS link) for the page.
 *  Results and incoming data go back to JavaScript as events: window.__bt(json). */
@SuppressLint("MissingPermission")
public class BtBridge {
    static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private final Activity act;
    private final WebView web;
    private final BluetoothAdapter ad;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private BluetoothLeScanner scanner;
    private ScanCallback scanCb;
    private volatile BluetoothGatt gatt;
    private volatile boolean connecting;
    private final Map<String, SppLink> links = new ConcurrentHashMap<>();

    BtBridge(Activity a, WebView w) {
        act = a; web = w;
        BluetoothManager bm = (BluetoothManager) a.getSystemService(Context.BLUETOOTH_SERVICE);
        ad = bm == null ? null : bm.getAdapter();
    }

    /* ---------- events to JavaScript ---------- */
    private void emit(JSONObject o) {
        final String js = "window.__bt&&window.__bt(" + JSONObject.quote(o.toString()) + ")";
        ui.post(() -> web.evaluateJavascript(js, null));
    }
    private void emit(String t, Object... kv) {
        try {
            JSONObject o = new JSONObject();
            o.put("t", t);
            for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
            emit(o);
        } catch (Exception e) { /* ignore */ }
    }
    private static String b64(byte[] d, int n) { return Base64.encodeToString(d, 0, n, Base64.NO_WRAP); }

    /* ---------- permissions ---------- */
    @JavascriptInterface
    public boolean available() { return ad != null && ad.isEnabled(); }

    @JavascriptInterface
    public boolean ensurePermissions() {
        String[] need = Build.VERSION.SDK_INT >= 31
                ? new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}
                : new String[]{Manifest.permission.ACCESS_FINE_LOCATION};
        final List<String> missing = new ArrayList<>();
        for (String p : need) if (act.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (missing.isEmpty()) return true;
        ui.post(() -> act.requestPermissions(missing.toArray(new String[0]), 12));
        return false;
    }

    /* ---------- BLE ---------- */
    @JavascriptInterface
    public void bleScan(int ms) {
        if (ad == null || !ad.isEnabled()) return;
        ui.post(() -> {
            stopScanNow();
            scanner = ad.getBluetoothLeScanner();
            if (scanner == null) return;
            scanCb = new ScanCallback() {
                @Override
                public void onScanResult(int type, ScanResult r) {
                    BluetoothDevice d = r.getDevice();
                    String n = d.getName();
                    if (n == null && r.getScanRecord() != null) n = r.getScanRecord().getDeviceName();
                    emit("bleDev", "name", n == null ? "" : n, "address", d.getAddress());
                }
            };
            ScanSettings st = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
            try { scanner.startScan(null, st, scanCb); } catch (Exception e) { scanCb = null; }
            ui.postDelayed(this::stopScanNow, ms);
        });
    }

    @JavascriptInterface
    public void bleStopScan() { ui.post(this::stopScanNow); }

    private void stopScanNow() {
        if (scanner != null && scanCb != null) { try { scanner.stopScan(scanCb); } catch (Exception e) { /* ignore */ } }
        scanCb = null;
    }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) {
                if (!g.requestMtu(517)) g.discoverServices();
            } else if (state == BluetoothProfile.STATE_DISCONNECTED) {
                g.close();
                if (gatt == g) gatt = null;
                if (connecting) { connecting = false; emit("bleConn", "ok", false, "err", "Connection Error: Connection attempt failed."); }
                else emit("bleDisc");
            }
        }
        @Override
        public void onMtuChanged(BluetoothGatt g, int mtu, int status) { g.discoverServices(); }
        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            connecting = false;
            if (status == BluetoothGatt.GATT_SUCCESS) emit("bleConn", "ok", true);
            else { emit("bleConn", "ok", false, "err", "Service discovery failed (" + status + ")"); g.disconnect(); }
        }
        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            emit("bleWrote", "ok", status == BluetoothGatt.GATT_SUCCESS, "err", "GATT write error " + status);
        }
        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
            emit("bleNotify", "ok", status == BluetoothGatt.GATT_SUCCESS, "err", "Notify error " + status);
        }
        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            byte[] v = c.getValue();
            if (v != null && v.length > 0) emit("bleData", "data", b64(v, v.length));
        }
    };

    @JavascriptInterface
    public void bleConnect(final String address) {
        if (ad == null) { emit("bleConn", "ok", false, "err", "Bluetooth is not available"); return; }
        ui.post(() -> {
            stopScanNow();
            if (gatt != null) { try { gatt.close(); } catch (Exception e) { /* ignore */ } gatt = null; }
            connecting = true;
            BluetoothDevice d = ad.getRemoteDevice(address);
            gatt = d.connectGatt(act, false, gattCb, BluetoothDevice.TRANSPORT_LE);
            if (gatt == null) { connecting = false; emit("bleConn", "ok", false, "err", "connectGatt failed"); }
        });
    }

    @JavascriptInterface
    public void bleDisconnect() { BluetoothGatt g = gatt; if (g != null) g.disconnect(); }

    @JavascriptInterface
    public boolean bleHasService(String uuid) {
        BluetoothGatt g = gatt;
        return g != null && g.getService(UUID.fromString(uuid)) != null;
    }

    @JavascriptInterface
    public boolean bleHasChar(String svc, String ch) { return findChar(svc, ch) != null; }

    private BluetoothGattCharacteristic findChar(String svc, String ch) {
        BluetoothGatt g = gatt;
        if (g == null) return null;
        UUID cu = UUID.fromString(ch);
        if (svc != null) {
            BluetoothGattService s = g.getService(UUID.fromString(svc));
            return s == null ? null : s.getCharacteristic(cu);
        }
        for (BluetoothGattService s : g.getServices()) { BluetoothGattCharacteristic c = s.getCharacteristic(cu); if (c != null) return c; }
        return null;
    }

    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public boolean bleNotify(String ch) {
        BluetoothGatt g = gatt;
        BluetoothGattCharacteristic c = findChar(null, ch);
        if (g == null || c == null) { emit("bleNotify", "ok", false, "err", "No characteristic"); return false; }
        g.setCharacteristicNotification(c, true);
        BluetoothGattDescriptor d = c.getDescriptor(CCCD);
        if (d == null) { emit("bleNotify", "ok", true); return true; }
        d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
        boolean ok = g.writeDescriptor(d);
        if (!ok) emit("bleNotify", "ok", false, "err", "writeDescriptor failed");
        return ok;
    }

    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public boolean bleWrite(String ch, String data) {
        BluetoothGatt g = gatt;
        BluetoothGattCharacteristic c = findChar(null, ch);
        if (g == null || c == null) return false;
        c.setValue(Base64.decode(data, Base64.DEFAULT));
        c.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
        return g.writeCharacteristic(c);
    }

    /* ---------- classic Bluetooth SPP ---------- */
    private static class SppLink {
        BluetoothSocket sock; OutputStream out; volatile boolean closing;
        final ExecutorService tx = Executors.newSingleThreadExecutor();
    }

    @JavascriptInterface
    public String sppBonded() {
        JSONArray a = new JSONArray();
        if (ad == null) return a.toString();
        try {
            Set<BluetoothDevice> set = ad.getBondedDevices();
            if (set != null) for (BluetoothDevice d : set) {
                JSONObject o = new JSONObject();
                o.put("name", d.getName() == null ? "" : d.getName());
                o.put("address", d.getAddress());
                a.put(o);
            }
        } catch (Exception e) { /* permission missing */ }
        return a.toString();
    }

    @JavascriptInterface
    public void sppOpen(final String id, final String address) {
        new Thread(() -> {
            if (ad == null) { emit("sppOpen", "id", id, "ok", false, "err", "Bluetooth is not available"); return; }
            try { ad.cancelDiscovery(); } catch (Exception e) { /* ignore */ }
            BluetoothDevice d = ad.getRemoteDevice(address);
            BluetoothSocket s = null;
            String err = "Failed to open serial port.";
            for (int attempt = 0; attempt < 3 && s == null; attempt++) {
                BluetoothSocket t = null;
                try {
                    if (attempt == 0) t = d.createRfcommSocketToServiceRecord(SPP);
                    else if (attempt == 1) t = d.createInsecureRfcommSocketToServiceRecord(SPP);
                    else { Method m = d.getClass().getMethod("createRfcommSocket", int.class); t = (BluetoothSocket) m.invoke(d, 1); }
                    t.connect();
                    s = t;
                } catch (Exception e) {
                    err = "Failed to open serial port. " + e.getMessage();
                    if (t != null) try { t.close(); } catch (IOException x) { /* ignore */ }
                }
            }
            if (s == null) { emit("sppOpen", "id", id, "ok", false, "err", err); return; }
            final SppLink L = new SppLink();
            L.sock = s;
            try { L.out = s.getOutputStream(); } catch (IOException e) { emit("sppOpen", "id", id, "ok", false, "err", err); return; }
            links.put(id, L);
            emit("sppOpen", "id", id, "ok", true);
            byte[] buf = new byte[2048];
            try {
                InputStream in = s.getInputStream();
                int n;
                while ((n = in.read(buf)) > 0) emit("sppData", "id", id, "data", b64(buf, n));
            } catch (IOException e) { /* closed */ }
            links.remove(id);
            if (!L.closing) emit("sppClosed", "id", id, "err", "The device has been lost.");
            try { s.close(); } catch (IOException e) { /* ignore */ }
            L.tx.shutdown();
        }).start();
    }

    @JavascriptInterface
    public boolean sppWrite(final String id, final String data) {
        final SppLink L = links.get(id);
        if (L == null) return false;
        final byte[] b = Base64.decode(data, Base64.DEFAULT);
        L.tx.execute(() -> {
            try { L.out.write(b); L.out.flush(); }
            catch (IOException e) { try { L.sock.close(); } catch (IOException x) { /* ignore */ } }
        });
        return true;
    }

    @JavascriptInterface
    public void sppClose(String id) {
        SppLink L = links.remove(id);
        if (L == null) return;
        L.closing = true;
        try { L.sock.close(); } catch (IOException e) { /* ignore */ }
        L.tx.shutdown();
    }

    void shutdown() {
        for (String id : new ArrayList<>(links.keySet())) sppClose(id);
        BluetoothGatt g = gatt;
        if (g != null) { try { g.close(); } catch (Exception e) { /* ignore */ } }
        stopScanNow();
    }
}
