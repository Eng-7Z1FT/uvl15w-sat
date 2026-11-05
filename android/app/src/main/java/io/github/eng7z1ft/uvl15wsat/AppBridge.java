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
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** window.AndroidApp: save downloads, show notifications, keep the screen on while tracking. */
public class AppBridge {
    private final Activity act;
    private int notifId = 100;

    AppBridge(Activity a) { act = a; }

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
