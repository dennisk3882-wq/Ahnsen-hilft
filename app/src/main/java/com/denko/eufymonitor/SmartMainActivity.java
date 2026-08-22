package com.denko.eufymonitor;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.RectF;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.PixelCopy;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Smart shell around the proven live/AI monitor. It keeps all v0.4 features and adds
 * local scene understanding, tracking and a Smart Center without modifying the live core.
 */
public class SmartMainActivity extends MainActivity {
    private static final String CONTROL = "http://127.0.0.1:8787";

    private final Handler smartUi = new Handler(Looper.getMainLooper());
    private final ExecutorService smartIo = Executors.newSingleThreadExecutor();
    private final Map<String, Long> eventCooldown = new HashMap<>();
    private SurfaceView cameraSurface;
    private DetectionOverlay detectionOverlay;
    private SmartVisionEngine visionEngine;
    private TextView aiChip;
    private boolean smartEnabled = true;
    private boolean smartBusy = false;
    private SharedPreferences prefs;

    private final Runnable analysisLoop = new Runnable() {
        @Override public void run() {
            if (!smartEnabled || isFinishing()) return;
            if (cameraSurface == null) cameraSurface = findSurface(getWindow().getDecorView());
            updateTargetRect();
            if (cameraSurface == null || cameraSurface.getWidth() < 64 || cameraSurface.getHeight() < 64 || smartBusy) {
                smartUi.postDelayed(this, 650);
                return;
            }
            smartBusy = true;
            Bitmap frame = Bitmap.createBitmap(cameraSurface.getWidth(), cameraSurface.getHeight(), Bitmap.Config.ARGB_8888);
            PixelCopy.request(cameraSurface, frame, result -> {
                if (result != PixelCopy.SUCCESS) {
                    recycle(frame);
                    smartBusy = false;
                    smartUi.postDelayed(analysisLoop, 800);
                    return;
                }
                smartIo.execute(() -> analyzeFrame(frame));
            }, smartUi);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("smart_security", MODE_PRIVATE);
        smartEnabled = prefs.getBoolean("vision_enabled", true);
        installSmartUi();
        cameraSurface = findSurface(getWindow().getDecorView());
        smartIo.execute(() -> {
            try {
                visionEngine = new SmartVisionEngine(this);
                smartUi.post(() -> {
                    aiChip.setText("KI: AKTIV");
                    if (smartEnabled) smartUi.postDelayed(analysisLoop, 900);
                });
            } catch (Exception e) {
                smartUi.post(() -> {
                    aiChip.setText("KI: MODELLFEHLER");
                    if (detectionOverlay != null) detectionOverlay.setHeadline("KI-Modell konnte nicht geladen werden");
                });
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (prefs != null) {
            smartEnabled = prefs.getBoolean("vision_enabled", true);
            if (aiChip != null) aiChip.setText(smartEnabled ? "KI: AKTIV" : "KI: AUS");
        }
        if (smartEnabled && visionEngine != null) {
            smartUi.removeCallbacks(analysisLoop);
            smartUi.postDelayed(analysisLoop, 500);
        }
    }

    @Override
    protected void onPause() {
        smartUi.removeCallbacks(analysisLoop);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        smartUi.removeCallbacks(analysisLoop);
        smartIo.shutdownNow();
        if (visionEngine != null) {
            try { visionEngine.close(); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    private void installSmartUi() {
        detectionOverlay = new DetectionOverlay(this);
        addContentView(detectionOverlay, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        FrameLayout controls = new FrameLayout(this);
        controls.setClickable(false);

        Button center = new Button(this);
        center.setText("Smart Center");
        center.setAllCaps(false);
        center.setTextSize(12);
        center.setOnClickListener(v -> startActivity(new Intent(this, SmartCenterActivity.class)));
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(dp(132), dp(46), Gravity.BOTTOM | Gravity.END);
        cp.setMargins(dp(8), dp(8), dp(10), dp(58));
        controls.addView(center, cp);

        aiChip = new TextView(this);
        aiChip.setText(smartEnabled ? "KI: STARTET" : "KI: AUS");
        aiChip.setTextColor(0xffffffff);
        aiChip.setTextSize(12);
        aiChip.setGravity(Gravity.CENTER);
        aiChip.setPadding(dp(10), 0, dp(10), 0);
        aiChip.setBackgroundColor(0xb8000000);
        aiChip.setOnClickListener(v -> toggleVision());
        FrameLayout.LayoutParams ap = new FrameLayout.LayoutParams(dp(112), dp(38), Gravity.BOTTOM | Gravity.END);
        ap.setMargins(dp(8), dp(8), dp(150), dp(62));
        controls.addView(aiChip, ap);

        addContentView(controls, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void toggleVision() {
        smartEnabled = !smartEnabled;
        prefs.edit().putBoolean("vision_enabled", smartEnabled).apply();
        aiChip.setText(smartEnabled ? "KI: AKTIV" : "KI: AUS");
        if (detectionOverlay != null) detectionOverlay.setResults(null);
        smartUi.removeCallbacks(analysisLoop);
        if (smartEnabled && visionEngine != null) smartUi.post(analysisLoop);
    }

    private void analyzeFrame(Bitmap frame) {
        try {
            if (visionEngine == null || !smartEnabled) return;
            List<SmartVisionEngine.Result> results = visionEngine.detect(frame);
            smartUi.post(() -> {
                if (detectionOverlay != null) detectionOverlay.setResults(results);
                processSmartRules(results);
            });
        } catch (Exception e) {
            smartUi.post(() -> {
                if (detectionOverlay != null) detectionOverlay.setHeadline("KI Analyse: " + e.getMessage());
            });
        } finally {
            recycle(frame);
            smartBusy = false;
            if (smartEnabled && !isFinishing()) smartUi.postDelayed(analysisLoop, 700);
        }
    }

    private void processSmartRules(List<SmartVisionEngine.Result> results) {
        if (results == null || results.isEmpty()) return;
        boolean autoMode = prefs.getBoolean("auto_mode_on_detection", true);
        long now = System.currentTimeMillis();
        for (SmartVisionEngine.Result r : results) {
            boolean important = "Person".equals(r.label) || "Auto".equals(r.label) || "LKW".equals(r.label) || "Motorrad".equals(r.label);
            if (important && r.score >= 0.48f && r.priority >= 60) {
                if (autoMode) ensureAutoEnhanceMode();
                String key = r.label + ":" + r.trackId;
                long last = eventCooldown.containsKey(key) ? eventCooldown.get(key) : 0L;
                if (now - last > 12000) {
                    eventCooldown.put(key, now);
                    postAiEvent(r, "detected");
                }
                if ("Person".equals(r.label) && r.visibleMs >= 20000) {
                    String loiter = "loiter:" + r.trackId;
                    long l = eventCooldown.containsKey(loiter) ? eventCooldown.get(loiter) : 0L;
                    if (now - l > 60000) {
                        eventCooldown.put(loiter, now);
                        postAiEvent(r, "loitering");
                    }
                }
            } else if (("Hund".equals(r.label) || "Katze".equals(r.label)) && r.score >= 0.58f) {
                String key = r.label + ":" + r.trackId;
                long last = eventCooldown.containsKey(key) ? eventCooldown.get(key) : 0L;
                if (now - last > 20000) {
                    eventCooldown.put(key, now);
                    postAiEvent(r, "detected");
                }
            }
        }
    }

    private void ensureAutoEnhanceMode() {
        Button mode = findModeButton(getWindow().getDecorView());
        if (mode == null) return;
        String text = String.valueOf(mode.getText());
        if (text.contains("AUTO")) return;
        for (int i = 0; i < 5; i++) {
            mode.performClick();
            text = String.valueOf(mode.getText());
            if (text.contains("AUTO")) break;
        }
    }

    private void postAiEvent(SmartVisionEngine.Result r, String kind) {
        smartIo.execute(() -> {
            HttpURLConnection c = null;
            try {
                JSONObject body = new JSONObject()
                        .put("source", "local-ai")
                        .put("kind", kind)
                        .put("label", r.label)
                        .put("score", r.score)
                        .put("trackId", r.trackId)
                        .put("visibleMs", r.visibleMs)
                        .put("priority", r.priority);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                c = (HttpURLConnection) new URL(CONTROL + "/ai/event").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(1000);
                c.setReadTimeout(1500);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = new BufferedOutputStream(c.getOutputStream())) { out.write(bytes); }
                c.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    private void updateTargetRect() {
        if (cameraSurface == null || detectionOverlay == null) return;
        int[] s = new int[2];
        int[] d = new int[2];
        cameraSurface.getLocationOnScreen(s);
        getWindow().getDecorView().getLocationOnScreen(d);
        detectionOverlay.setTarget(new RectF(
                s[0] - d[0], s[1] - d[1],
                s[0] - d[0] + cameraSurface.getWidth(),
                s[1] - d[1] + cameraSurface.getHeight()));
    }

    private SurfaceView findSurface(View v) {
        if (v instanceof SurfaceView) return (SurfaceView) v;
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) {
                SurfaceView found = findSurface(g.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private Button findModeButton(View v) {
        if (v instanceof Button) {
            Button b = (Button) v;
            if (String.valueOf(b.getText()).startsWith("Modus:")) return b;
        }
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) {
                Button found = findModeButton(g.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static void recycle(Bitmap b) {
        if (b != null && !b.isRecycled()) {
            try { b.recycle(); } catch (Exception ignored) {}
        }
    }
}
