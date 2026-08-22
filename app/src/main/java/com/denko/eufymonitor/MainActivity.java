package com.denko.eufymonitor;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Base64;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    private static volatile boolean nodeStarted = false;
    private static final String CONTROL = "http://127.0.0.1:8787";
    private static final float MIN_ZOOM = 1.0f;
    private static final float MAX_ZOOM = 6.0f;

    public native int startNodeWithArguments(String[] arguments);

    private final ExecutorService io = Executors.newCachedThreadPool();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private TextView status;
    private TextView streamStatus;
    private TextView zoomBadge;
    private EditText email;
    private EditText password;
    private EditText challenge;
    private LinearLayout challengeRow;
    private ImageView captchaImage;
    private Button connectButton;
    private Button challengeButton;
    private Button liveButton;
    private Button stopButton;
    private Spinner deviceSpinner;
    private SurfaceView surfaceView;
    private LocalStreamClient streamClient;
    private final List<DeviceOption> devices = new ArrayList<>();

    private ScaleGestureDetector scaleDetector;
    private GestureDetector gestureDetector;
    private float zoomScale = 1.0f;
    private float panX = 0f;
    private float panY = 0f;
    private float lastTouchX = 0f;
    private float lastTouchY = 0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        startEmbeddedNode();
    }

    @Override
    protected void onDestroy() {
        if (streamClient != null) streamClient.close();
        io.shutdownNow();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView text(String value, int sp) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextColor(Color.WHITE);
        t.setTextSize(sp);
        return t;
    }

    private EditText field(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(0xff8b98a8);
        e.setTextColor(Color.WHITE);
        e.setSingleLine(true);
        e.setBackgroundColor(0xff1d2632);
        e.setPadding(dp(12), dp(8), dp(12), dp(8));
        return e;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(15);
        return b;
    }

    private LinearLayout.LayoutParams weight(float w) {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, w);
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(10), dp(14), dp(12));
        root.setBackgroundColor(0xff0a0f16);

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("Eufy Local Monitor", 21);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        status = text("Interne Kamera-Engine startet …", 14);
        status.setTextColor(0xff9fb1c5);
        head.addView(title, weight(1f));
        head.addView(status, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout login = new LinearLayout(this);
        login.setOrientation(LinearLayout.HORIZONTAL);
        login.setPadding(0, dp(8), 0, dp(8));
        email = field("Eufy E-Mail");
        email.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        password = field("Eufy Passwort");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        connectButton = button("Verbinden");
        connectButton.setEnabled(false);
        login.addView(email, weight(1.3f));
        addGap(login);
        login.addView(password, weight(1.3f));
        addGap(login);
        login.addView(connectButton, weight(0.7f));
        root.addView(login);

        challengeRow = new LinearLayout(this);
        challengeRow.setOrientation(LinearLayout.HORIZONTAL);
        challengeRow.setGravity(Gravity.CENTER_VERTICAL);
        challengeRow.setVisibility(View.GONE);
        captchaImage = new ImageView(this);
        captchaImage.setAdjustViewBounds(true);
        captchaImage.setVisibility(View.GONE);
        challenge = field("Bestätigungscode");
        challengeButton = button("Code senden");
        challengeRow.addView(captchaImage, new LinearLayout.LayoutParams(dp(150), dp(70)));
        challengeRow.addView(challenge, weight(1f));
        addGap(challengeRow);
        challengeRow.addView(challengeButton, new LinearLayout.LayoutParams(dp(140), ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(challengeRow);

        LinearLayout camera = new LinearLayout(this);
        camera.setOrientation(LinearLayout.HORIZONTAL);
        camera.setGravity(Gravity.CENTER_VERTICAL);
        deviceSpinner = new Spinner(this);
        deviceSpinner.setBackgroundColor(0xff1d2632);
        liveButton = button("Live starten");
        stopButton = button("Stop");
        liveButton.setEnabled(false);
        stopButton.setEnabled(false);
        camera.addView(deviceSpinner, weight(1f));
        addGap(camera);
        camera.addView(liveButton, new LinearLayout.LayoutParams(dp(150), ViewGroup.LayoutParams.WRAP_CONTENT));
        addGap(camera);
        camera.addView(stopButton, new LinearLayout.LayoutParams(dp(100), ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(camera);

        FrameLayout video = new FrameLayout(this);
        video.setBackgroundColor(Color.BLACK);
        video.setClipChildren(true);
        video.setClipToPadding(true);

        surfaceView = new SurfaceView(this);
        surfaceView.setClickable(true);
        video.addView(surfaceView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        streamStatus = text("Noch kein Livestream", 15);
        streamStatus.setPadding(dp(10), dp(7), dp(10), dp(7));
        streamStatus.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams streamOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        streamOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(streamStatus, streamOverlay);

        zoomBadge = text("1.0×", 14);
        zoomBadge.setPadding(dp(12), dp(7), dp(12), dp(7));
        zoomBadge.setBackgroundColor(0x99000000);
        zoomBadge.setClickable(true);
        zoomBadge.setContentDescription("Zoom zurücksetzen");
        FrameLayout.LayoutParams zoomOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        zoomOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(zoomBadge, zoomOverlay);

        TextView zoomHint = text("Zwei Finger: Zoom · Ziehen: Ausschnitt · Doppeltipp: 2×/1×", 12);
        zoomHint.setTextColor(0xffd1dae5);
        zoomHint.setPadding(dp(8), dp(5), dp(8), dp(5));
        zoomHint.setBackgroundColor(0x66000000);
        FrameLayout.LayoutParams hintOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        hintOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(zoomHint, hintOverlay);
        zoomHint.animate().alpha(0f).setStartDelay(4500).setDuration(800).withEndAction(() -> zoomHint.setVisibility(View.GONE)).start();

        LinearLayout.LayoutParams videoParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        videoParams.topMargin = dp(8);
        root.addView(video, videoParams);

        setContentView(root);

        connectButton.setOnClickListener(v -> login());
        challengeButton.setOnClickListener(v -> sendChallenge());
        liveButton.setOnClickListener(v -> startLive());
        stopButton.setOnClickListener(v -> stopLive());
        zoomBadge.setOnClickListener(v -> resetZoom());
        installZoomGestures();
    }

    private void addGap(LinearLayout row) {
        View gap = new View(this);
        row.addView(gap, new LinearLayout.LayoutParams(dp(8), 1));
    }

    private void installZoomGestures() {
        scaleDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScaleBegin(ScaleGestureDetector detector) {
                return true;
            }

            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                float oldScale = zoomScale;
                float newScale = clamp(oldScale * detector.getScaleFactor(), MIN_ZOOM, MAX_ZOOM);
                if (Math.abs(newScale - oldScale) < 0.001f) return true;

                int width = surfaceView.getWidth();
                int height = surfaceView.getHeight();
                if (width > 0 && height > 0) {
                    float focusX = detector.getFocusX() - width / 2f;
                    float focusY = detector.getFocusY() - height / 2f;
                    float ratio = newScale / oldScale;
                    panX = focusX - (focusX - panX) * ratio;
                    panY = focusY - (focusY - panY) * ratio;
                }
                zoomScale = newScale;
                constrainPan();
                applyZoom();
                return true;
            }
        });

        gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) {
                return true;
            }

            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                toggleImmersive();
                return true;
            }

            @Override
            public boolean onDoubleTap(MotionEvent e) {
                if (zoomScale > 1.05f) {
                    resetZoom();
                } else {
                    zoomTo(2.0f, e.getX(), e.getY());
                }
                return true;
            }
        });

        surfaceView.setOnTouchListener((v, event) -> {
            scaleDetector.onTouchEvent(event);
            gestureDetector.onTouchEvent(event);

            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    lastTouchX = event.getX();
                    lastTouchY = event.getY();
                    break;
                case MotionEvent.ACTION_POINTER_DOWN:
                    if (event.getPointerCount() > 1) {
                        lastTouchX = event.getX(0);
                        lastTouchY = event.getY(0);
                    }
                    break;
                case MotionEvent.ACTION_MOVE:
                    if (event.getPointerCount() == 1 && !scaleDetector.isInProgress() && zoomScale > 1.001f) {
                        float x = event.getX();
                        float y = event.getY();
                        panX += x - lastTouchX;
                        panY += y - lastTouchY;
                        lastTouchX = x;
                        lastTouchY = y;
                        constrainPan();
                        applyZoom();
                    }
                    break;
                case MotionEvent.ACTION_POINTER_UP:
                    int remaining = event.getPointerCount() - 1;
                    if (remaining == 1) {
                        int upIndex = event.getActionIndex();
                        int keepIndex = upIndex == 0 ? 1 : 0;
                        lastTouchX = event.getX(keepIndex);
                        lastTouchY = event.getY(keepIndex);
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    constrainPan();
                    applyZoom();
                    break;
                default:
                    break;
            }
            return true;
        });
    }

    private void zoomTo(float newScale, float focusXOnView, float focusYOnView) {
        newScale = clamp(newScale, MIN_ZOOM, MAX_ZOOM);
        float oldScale = zoomScale;
        int width = surfaceView.getWidth();
        int height = surfaceView.getHeight();
        if (width > 0 && height > 0 && oldScale > 0f) {
            float focusX = focusXOnView - width / 2f;
            float focusY = focusYOnView - height / 2f;
            float ratio = newScale / oldScale;
            panX = focusX - (focusX - panX) * ratio;
            panY = focusY - (focusY - panY) * ratio;
        }
        zoomScale = newScale;
        constrainPan();
        applyZoom();
    }

    private void resetZoom() {
        zoomScale = 1.0f;
        panX = 0f;
        panY = 0f;
        applyZoom();
    }

    private void constrainPan() {
        if (zoomScale <= 1.001f) {
            panX = 0f;
            panY = 0f;
            return;
        }
        float maxX = surfaceView.getWidth() * (zoomScale - 1f) / 2f;
        float maxY = surfaceView.getHeight() * (zoomScale - 1f) / 2f;
        panX = clamp(panX, -maxX, maxX);
        panY = clamp(panY, -maxY, maxY);
    }

    private float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private void applyZoom() {
        if (surfaceView == null) return;
        int width = surfaceView.getWidth();
        int height = surfaceView.getHeight();
        if (width > 0 && height > 0) {
            surfaceView.setPivotX(width / 2f);
            surfaceView.setPivotY(height / 2f);
        }
        surfaceView.setScaleX(zoomScale);
        surfaceView.setScaleY(zoomScale);
        surfaceView.setTranslationX(panX);
        surfaceView.setTranslationY(panY);
        if (zoomBadge != null) zoomBadge.setText(String.format(Locale.GERMANY, "%.1f×", zoomScale));
    }

    private void toggleImmersive() {
        int flags = getWindow().getDecorView().getSystemUiVisibility();
        boolean hidden = (flags & View.SYSTEM_UI_FLAG_FULLSCREEN) != 0;
        getWindow().getDecorView().setSystemUiVisibility(hidden ? View.SYSTEM_UI_FLAG_VISIBLE :
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void setStatus(String value) {
        ui.post(() -> status.setText(value));
    }

    private void setStreamStatus(String value) {
        ui.post(() -> streamStatus.setText(value));
    }

    private void startEmbeddedNode() {
        connectButton.setEnabled(false);
        io.execute(() -> {
            try {
                File project = new File(getFilesDir(), "nodejs-project");
                File marker = new File(project, ".eufy-monitor-v01");
                if (!marker.exists()) {
                    deleteRecursively(project);
                    if (!project.mkdirs() && !project.isDirectory()) throw new Exception("App-Verzeichnis konnte nicht erstellt werden");
                    unzipAsset("nodejs-project.zip", project);
                    new FileOutputStream(marker).close();
                }
                File main = new File(project, "main.js");
                if (!main.isFile()) throw new Exception("Interne Kamera-Engine fehlt");
                if (!nodeStarted) {
                    synchronized (MainActivity.class) {
                        if (!nodeStarted) {
                            nodeStarted = true;
                            new Thread(() -> startNodeWithArguments(new String[]{"node", main.getAbsolutePath()}), "embedded-node").start();
                        }
                    }
                }
                waitForBridge();
            } catch (Exception e) {
                setStatus("Startfehler: " + e.getMessage());
            }
        });
    }

    private void waitForBridge() throws Exception {
        Exception last = null;
        for (int i = 0; i < 90; i++) {
            try {
                JSONObject health = request("GET", "/health", null);
                if (health.optBoolean("ok")) {
                    ui.post(() -> {
                        status.setText("Bereit – Stream bleibt lokal im WLAN");
                        connectButton.setEnabled(true);
                        if (streamClient == null) {
                            streamClient = new LocalStreamClient(surfaceView);
                            streamClient.start();
                        }
                    });
                    return;
                }
            } catch (Exception e) {
                last = e;
            }
            Thread.sleep(500);
        }
        throw last != null ? last : new Exception("Interne Kamera-Engine antwortet nicht");
    }

    private void login() {
        final String mail = email.getText().toString().trim();
        final String pass = password.getText().toString();
        if (mail.isEmpty() || pass.isEmpty()) {
            setStatus("E-Mail und Passwort eingeben");
            return;
        }
        connectButton.setEnabled(false);
        setStatus("Eufy wird angemeldet …");
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("email", mail).put("password", pass);
                handleState(request("POST", "/login", body));
            } catch (Exception e) {
                setStatus("Anmeldung: " + e.getMessage());
                ui.post(() -> connectButton.setEnabled(true));
            }
        });
    }

    private void sendChallenge() {
        final String code = challenge.getText().toString().trim();
        if (code.isEmpty()) return;
        challengeButton.setEnabled(false);
        io.execute(() -> {
            try {
                handleState(request("POST", "/challenge", new JSONObject().put("code", code)));
            } catch (Exception e) {
                setStatus("Code: " + e.getMessage());
            } finally {
                ui.post(() -> challengeButton.setEnabled(true));
            }
        });
    }

    private void handleState(JSONObject s) {
        final String phase = s.optString("phase", "");
        final String message = s.optString("message", phase);
        ui.post(() -> status.setText(message));

        if ("tfa".equals(phase) || "captcha".equals(phase)) {
            ui.post(() -> {
                challengeRow.setVisibility(View.VISIBLE);
                challenge.setText("");
                challenge.setHint("captcha".equals(phase) ? "Captcha-Lösung" : "Eufy Bestätigungscode");
                captchaImage.setVisibility(View.GONE);
            });
            if ("captcha".equals(phase)) showCaptcha(s.optString("captcha", ""));
            return;
        }

        if ("connected".equals(phase)) {
            JSONArray a = s.optJSONArray("devices");
            updateDevices(a == null ? new JSONArray() : a);
            ui.post(() -> {
                challengeRow.setVisibility(View.GONE);
                connectButton.setEnabled(false);
                liveButton.setEnabled(!devices.isEmpty());
                stopButton.setEnabled(true);
            });
        } else {
            ui.post(() -> connectButton.setEnabled(true));
        }
    }

    private void updateDevices(JSONArray a) {
        List<DeviceOption> next = new ArrayList<>();
        for (int i = 0; i < a.length(); i++) {
            JSONObject d = a.optJSONObject(i);
            if (d == null) continue;
            next.add(new DeviceOption(d.optString("name", "Kamera"), d.optString("model", ""), d.optString("sn", "")));
        }
        ui.post(() -> {
            devices.clear();
            devices.addAll(next);
            ArrayAdapter<DeviceOption> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, devices);
            deviceSpinner.setAdapter(adapter);
            liveButton.setEnabled(!devices.isEmpty());
            if (devices.isEmpty()) status.setText("Verbunden, aber keine Kamera gefunden");
        });
    }

    private void startLive() {
        Object selected = deviceSpinner.getSelectedItem();
        if (!(selected instanceof DeviceOption)) return;
        DeviceOption d = (DeviceOption) selected;
        resetZoom();
        liveButton.setEnabled(false);
        setStreamStatus("Verbinde lokal mit " + d.name + " …");
        io.execute(() -> {
            try {
                request("POST", "/live/start", new JSONObject().put("sn", d.sn));
                setStreamStatus("Live – " + d.name);
            } catch (Exception e) {
                setStreamStatus("Live-Fehler: " + e.getMessage());
                ui.post(() -> liveButton.setEnabled(true));
            }
        });
    }

    private void stopLive() {
        io.execute(() -> {
            try {
                request("POST", "/live/stop", new JSONObject());
            } catch (Exception ignored) {
            }
            setStreamStatus("Livestream gestoppt");
            ui.post(() -> {
                resetZoom();
                liveButton.setEnabled(!devices.isEmpty());
            });
        });
    }

    private void showCaptcha(String data) {
        if (data == null || data.isEmpty()) return;
        io.execute(() -> {
            try {
                byte[] bytes;
                if (data.startsWith("http://") || data.startsWith("https://")) {
                    try (InputStream in = new BufferedInputStream(new URL(data).openStream())) {
                        bytes = readAll(in, 2 * 1024 * 1024);
                    }
                } else {
                    String b64 = data.contains(",") ? data.substring(data.indexOf(',') + 1) : data;
                    bytes = Base64.decode(b64, Base64.DEFAULT);
                }
                Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bmp != null) {
                    ui.post(() -> {
                        captchaImage.setImageBitmap(bmp);
                        captchaImage.setVisibility(View.VISIBLE);
                    });
                }
            } catch (Exception ignored) {
            }
        });
    }

    private JSONObject request(String method, String path, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(CONTROL + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(3000);
        c.setReadTimeout(45000);
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = new BufferedOutputStream(c.getOutputStream())) {
                out.write(bytes);
            }
        }
        int code = c.getResponseCode();
        InputStream raw = code >= 400 ? c.getErrorStream() : c.getInputStream();
        StringBuilder sb = new StringBuilder();
        if (raw != null) {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(raw, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
        }
        c.disconnect();
        JSONObject result = sb.length() == 0 ? new JSONObject() : new JSONObject(sb.toString());
        if (code >= 400) throw new Exception(result.optString("error", "HTTP " + code));
        return result;
    }

    private byte[] readAll(InputStream in, int max) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int total = 0;
        int n;
        while ((n = in.read(b)) >= 0) {
            total += n;
            if (total > max) throw new Exception("Bild zu groß");
            out.write(b, 0, n);
        }
        return out.toByteArray();
    }

    private void unzipAsset(String asset, File target) throws Exception {
        String root = target.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(getAssets().open(asset)))) {
            ZipEntry e;
            byte[] buffer = new byte[64 * 1024];
            while ((e = zip.getNextEntry()) != null) {
                File out = new File(target, e.getName());
                String canonical = out.getCanonicalPath();
                if (!canonical.startsWith(root)) throw new SecurityException("Ungültiges App-Archiv");
                if (e.isDirectory()) {
                    if (!out.mkdirs() && !out.isDirectory()) throw new Exception("Ordnerfehler");
                } else {
                    File parent = out.getParentFile();
                    if (parent != null && !parent.mkdirs() && !parent.isDirectory()) throw new Exception("Ordnerfehler");
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        int n;
                        while ((n = zip.read(buffer)) > 0) fos.write(buffer, 0, n);
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private void deleteRecursively(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) deleteRecursively(c);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static class DeviceOption {
        final String name;
        final String model;
        final String sn;

        DeviceOption(String name, String model, String sn) {
            this.name = name;
            this.model = model;
            this.sn = sn;
        }

        @Override
        public String toString() {
            return model.isEmpty() ? name : name + "  (" + model + ")";
        }
    }

    private class LocalStreamClient implements Runnable {
        private final VideoDecoder decoder;
        private volatile boolean closed;
        private Socket socket;

        LocalStreamClient(SurfaceView view) {
            decoder = new VideoDecoder(view, MainActivity.this::setStreamStatus);
        }

        void start() {
            io.execute(this);
        }

        void close() {
            closed = true;
            decoder.close();
            try {
                if (socket != null) socket.close();
            } catch (Exception ignored) {
            }
        }

        @Override
        public void run() {
            while (!closed) {
                try {
                    socket = new Socket();
                    socket.connect(new InetSocketAddress("127.0.0.1", 8788), 3000);
                    socket.setTcpNoDelay(true);
                    DataInputStream in = new DataInputStream(new BufferedInputStream(socket.getInputStream(), 512 * 1024));
                    while (!closed) {
                        byte[] h = new byte[16];
                        in.readFully(h);
                        if (h[0] != 'E' || h[1] != 'U' || h[2] != 'F' || h[3] != 'Y') {
                            throw new Exception("Ungültige Streamdaten");
                        }
                        int type = h[4] & 0xff;
                        int len = ((h[8] & 0xff) << 24) | ((h[9] & 0xff) << 16) | ((h[10] & 0xff) << 8) | (h[11] & 0xff);
                        if (len < 0 || len > 8 * 1024 * 1024) throw new Exception("Ungültige Streamgröße");
                        byte[] payload = new byte[len];
                        in.readFully(payload);
                        if (type == 1) {
                            JSONObject m = new JSONObject(new String(payload, StandardCharsets.UTF_8));
                            decoder.configure(m.optInt("codec", 0), m.optInt("width", 1920), m.optInt("height", 1080), m.optInt("fps", 15));
                            setStreamStatus("Live " + m.optInt("width") + "×" + m.optInt("height") + " – lokales P2P");
                        } else if (type == 2) {
                            decoder.offer(payload);
                        } else if (type == 3) {
                            setStreamStatus(new String(payload, StandardCharsets.UTF_8));
                        }
                    }
                } catch (Exception e) {
                    if (!closed) {
                        try {
                            Thread.sleep(700);
                        } catch (InterruptedException ignored) {
                            Thread.currentThread().interrupt();
                        }
                    }
                } finally {
                    try {
                        if (socket != null) socket.close();
                    } catch (Exception ignored) {
                    }
                }
            }
        }
    }
}
