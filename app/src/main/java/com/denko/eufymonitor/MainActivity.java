package com.denko.eufymonitor;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.PointF;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Base64;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.PixelCopy;
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

    private enum EnhanceMode { OFF, LIVE, ENHANCED, ULTRA, AUTO }

    public native int startNodeWithArguments(String[] arguments);

    private final ExecutorService io = Executors.newCachedThreadPool();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private TextView status;
    private TextView streamStatus;
    private TextView zoomBadge;
    private TextView enhanceBadge;
    private TextView qualityBadge;
    private EditText email;
    private EditText password;
    private EditText challenge;
    private LinearLayout challengeRow;
    private ImageView captchaImage;
    private ImageView enhancedView;
    private Button connectButton;
    private Button challengeButton;
    private Button liveButton;
    private Button stopButton;
    private Button enhanceButton;
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

    private EnhanceMode enhanceMode = EnhanceMode.OFF;
    private volatile boolean liveActive = false;
    private volatile boolean enhanceBusy = false;
    private volatile boolean compareHeld = false;
    private Bitmap previousRealtime;
    private Bitmap shownEnhanced;
    private Bitmap trackingTemplate;
    private String lastEnhanceLabel = "Original";
    private SuperResolutionEngine fastSuperResolution;
    private UltraDetailProcessor ultraProcessor;
    private long lastZoomInteractionMs = 0L;

    private final Runnable realtimeEnhanceLoop = this::runRealtimeEnhance;
    private final Runnable delayedUltraRefresh = this::captureUltraDetail;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        startEmbeddedNode();
    }

    @Override
    protected void onDestroy() {
        liveActive = false;
        ui.removeCallbacks(realtimeEnhanceLoop);
        ui.removeCallbacks(delayedUltraRefresh);
        if (streamClient != null) streamClient.close();
        if (fastSuperResolution != null) {
            try { fastSuperResolution.close(); } catch (Exception ignored) {}
        }
        if (ultraProcessor != null) {
            try { ultraProcessor.close(); } catch (Exception ignored) {}
        }
        recycle(previousRealtime);
        recycle(shownEnhanced);
        recycle(trackingTemplate);
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
        b.setTextSize(14);
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
        root.addView(head);

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
        enhanceButton = button("Modus: AUS");
        liveButton = button("Live starten");
        stopButton = button("Stop");
        liveButton.setEnabled(false);
        stopButton.setEnabled(false);
        enhanceButton.setEnabled(false);
        camera.addView(deviceSpinner, weight(1f));
        addGap(camera);
        camera.addView(enhanceButton, new LinearLayout.LayoutParams(dp(170), ViewGroup.LayoutParams.WRAP_CONTENT));
        addGap(camera);
        camera.addView(liveButton, new LinearLayout.LayoutParams(dp(140), ViewGroup.LayoutParams.WRAP_CONTENT));
        addGap(camera);
        camera.addView(stopButton, new LinearLayout.LayoutParams(dp(90), ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(camera);

        FrameLayout video = new FrameLayout(this);
        video.setBackgroundColor(Color.BLACK);
        video.setClipChildren(true);
        video.setClipToPadding(true);

        surfaceView = new SurfaceView(this);
        surfaceView.setClickable(true);
        video.addView(surfaceView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        enhancedView = new ImageView(this);
        enhancedView.setScaleType(ImageView.ScaleType.FIT_XY);
        enhancedView.setVisibility(View.GONE);
        enhancedView.setClickable(false);
        enhancedView.setFocusable(false);
        video.addView(enhancedView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        streamStatus = text("Noch kein Livestream", 15);
        streamStatus.setPadding(dp(10), dp(7), dp(10), dp(7));
        streamStatus.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams streamOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        streamOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(streamStatus, streamOverlay);

        qualityBadge = text("Q --", 12);
        qualityBadge.setPadding(dp(9), dp(6), dp(9), dp(6));
        qualityBadge.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams qualityOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.END);
        qualityOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(qualityBadge, qualityOverlay);

        zoomBadge = text("1.0×", 14);
        zoomBadge.setPadding(dp(12), dp(7), dp(12), dp(7));
        zoomBadge.setBackgroundColor(0x99000000);
        zoomBadge.setClickable(true);
        zoomBadge.setContentDescription("Zoom zurücksetzen");
        FrameLayout.LayoutParams zoomOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        zoomOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(zoomBadge, zoomOverlay);

        enhanceBadge = text("Original", 13);
        enhanceBadge.setPadding(dp(10), dp(6), dp(10), dp(6));
        enhanceBadge.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams enhanceOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        enhanceOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(enhanceBadge, enhanceOverlay);

        TextView hint = text("Zoom: 2 Finger · Verschieben: 1 Finger · Doppeltipp: 2× · Gedrückt halten: Original", 12);
        hint.setTextColor(0xffd1dae5);
        hint.setPadding(dp(8), dp(5), dp(8), dp(5));
        hint.setBackgroundColor(0x66000000);
        FrameLayout.LayoutParams hintOverlay = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        hintOverlay.setMargins(dp(8), dp(8), dp(8), dp(8));
        video.addView(hint, hintOverlay);
        hint.animate().alpha(0f).setStartDelay(6500).setDuration(800).withEndAction(() -> hint.setVisibility(View.GONE)).start();

        LinearLayout.LayoutParams videoParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        videoParams.topMargin = dp(8);
        root.addView(video, videoParams);

        setContentView(root);

        connectButton.setOnClickListener(v -> login());
        challengeButton.setOnClickListener(v -> sendChallenge());
        liveButton.setOnClickListener(v -> startLive());
        stopButton.setOnClickListener(v -> stopLive());
        enhanceButton.setOnClickListener(v -> cycleEnhanceMode());
        zoomBadge.setOnClickListener(v -> resetZoom());
        installZoomGestures();
    }

    private void addGap(LinearLayout row) {
        View gap = new View(this);
        row.addView(gap, new LinearLayout.LayoutParams(dp(8), 1));
    }

    private void installZoomGestures() {
        scaleDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScaleBegin(ScaleGestureDetector detector) {
                markZoomInteraction();
                hideUltraWhileMoving();
                return true;
            }

            @Override public boolean onScale(ScaleGestureDetector detector) {
                markZoomInteraction();
                float oldScale = zoomScale;
                float newScale = clamp(oldScale * detector.getScaleFactor(), MIN_ZOOM, MAX_ZOOM);
                if (Math.abs(newScale - oldScale) < 0.001f) return true;
                int width = surfaceView.getWidth(), height = surfaceView.getHeight();
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
            @Override public boolean onDown(MotionEvent e) { return true; }

            @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                toggleImmersive();
                return true;
            }

            @Override public boolean onDoubleTap(MotionEvent e) {
                markZoomInteraction();
                hideUltraWhileMoving();
                if (zoomScale > 1.05f) resetZoom(); else zoomTo(2.0f, e.getX(), e.getY());
                scheduleEnhancementAfterInteraction();
                return true;
            }

            @Override public void onLongPress(MotionEvent e) {
                holdOriginal(true);
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
                    markZoomInteraction();
                    hideUltraWhileMoving();
                    if (event.getPointerCount() > 1) {
                        lastTouchX = event.getX(0);
                        lastTouchY = event.getY(0);
                    }
                    break;
                case MotionEvent.ACTION_MOVE:
                    if (event.getPointerCount() == 1 && !scaleDetector.isInProgress() && zoomScale > 1.001f && !compareHeld) {
                        markZoomInteraction();
                        hideUltraWhileMoving();
                        float x = event.getX(), y = event.getY();
                        panX += x - lastTouchX;
                        panY += y - lastTouchY;
                        lastTouchX = x;
                        lastTouchY = y;
                        constrainPan();
                        applyZoom();
                    }
                    break;
                case MotionEvent.ACTION_POINTER_UP:
                    int upIndex = event.getActionIndex();
                    if (event.getPointerCount() - 1 == 1) {
                        int keep = upIndex == 0 ? 1 : 0;
                        lastTouchX = event.getX(keep);
                        lastTouchY = event.getY(keep);
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (compareHeld) holdOriginal(false);
                    constrainPan();
                    applyZoom();
                    scheduleEnhancementAfterInteraction();
                    break;
                default:
                    break;
            }
            return true;
        });
    }

    private void markZoomInteraction() {
        lastZoomInteractionMs = System.currentTimeMillis();
        ui.removeCallbacks(delayedUltraRefresh);
    }

    private void zoomTo(float newScale, float focusXOnView, float focusYOnView) {
        newScale = clamp(newScale, MIN_ZOOM, MAX_ZOOM);
        float oldScale = zoomScale;
        int width = surfaceView.getWidth(), height = surfaceView.getHeight();
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
        zoomScale = 1f;
        panX = 0f;
        panY = 0f;
        applyZoom();
        scheduleEnhancementAfterInteraction();
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
        int width = surfaceView.getWidth(), height = surfaceView.getHeight();
        if (width > 0 && height > 0) {
            surfaceView.setPivotX(width / 2f);
            surfaceView.setPivotY(height / 2f);
            enhancedView.setPivotX(width / 2f);
            enhancedView.setPivotY(height / 2f);
        }
        surfaceView.setScaleX(zoomScale);
        surfaceView.setScaleY(zoomScale);
        surfaceView.setTranslationX(panX);
        surfaceView.setTranslationY(panY);
        if (isUltraDisplay()) {
            enhancedView.setScaleX(1f);
            enhancedView.setScaleY(1f);
            enhancedView.setTranslationX(0f);
            enhancedView.setTranslationY(0f);
        } else {
            enhancedView.setScaleX(zoomScale);
            enhancedView.setScaleY(zoomScale);
            enhancedView.setTranslationX(panX);
            enhancedView.setTranslationY(panY);
        }
        zoomBadge.setText(String.format(Locale.GERMANY, "%.1f×", zoomScale));
        if (enhanceMode == EnhanceMode.AUTO && liveActive) updateAutoLabel();
    }

    private boolean isUltraDisplay() {
        return enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f);
    }

    private void cycleEnhanceMode() {
        switch (enhanceMode) {
            case OFF: setEnhanceMode(EnhanceMode.LIVE); break;
            case LIVE: setEnhanceMode(EnhanceMode.ENHANCED); break;
            case ENHANCED: setEnhanceMode(EnhanceMode.ULTRA); break;
            case ULTRA: setEnhanceMode(EnhanceMode.AUTO); break;
            default: setEnhanceMode(EnhanceMode.OFF); break;
        }
    }

    private void setEnhanceMode(EnhanceMode mode) {
        enhanceMode = mode;
        ui.removeCallbacks(realtimeEnhanceLoop);
        ui.removeCallbacks(delayedUltraRefresh);
        enhanceBusy = false;
        recycle(previousRealtime);
        previousRealtime = null;
        clearEnhancedBitmap(false);

        switch (mode) {
            case OFF:
                enhanceButton.setText("Modus: AUS");
                setEnhanceLabel("Original");
                qualityBadge.setText("Q --");
                break;
            case LIVE:
                enhanceButton.setText("Modus: LIVE AI");
                setEnhanceLabel("LIVE AI · temporal");
                if (liveActive) ui.post(realtimeEnhanceLoop);
                break;
            case ENHANCED:
                enhanceButton.setText("Modus: AI ENHANCED");
                setEnhanceLabel("AI ENHANCED · SR + Deblur");
                if (liveActive) ui.post(realtimeEnhanceLoop);
                break;
            case ULTRA:
                enhanceButton.setText("Modus: ULTRA");
                setEnhanceLabel("ULTRA · bereit");
                if (liveActive) scheduleUltra(120);
                break;
            case AUTO:
                enhanceButton.setText("Modus: AUTO");
                updateAutoLabel();
                if (liveActive) {
                    if (zoomScale >= 3f) scheduleUltra(400); else ui.post(realtimeEnhanceLoop);
                }
                break;
        }
        applyZoom();
    }

    private void updateAutoLabel() {
        if (enhanceMode != EnhanceMode.AUTO) return;
        if (zoomScale < 1.4f) setEnhanceLabel("AUTO → LIVE AI");
        else if (zoomScale < 3f) setEnhanceLabel("AUTO → AI ENHANCED");
        else setEnhanceLabel("AUTO → ULTRA Detail");
    }

    private void runRealtimeEnhance() {
        if (!liveActive) return;
        boolean enhanced = enhanceMode == EnhanceMode.ENHANCED || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 1.4f && zoomScale < 3f);
        boolean live = enhanceMode == EnhanceMode.LIVE || (enhanceMode == EnhanceMode.AUTO && zoomScale < 1.4f);
        if (!live && !enhanced) {
            if (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f) scheduleUltra(500);
            return;
        }
        if (enhanceBusy || surfaceView.getWidth() < 2 || surfaceView.getHeight() < 2) {
            ui.postDelayed(realtimeEnhanceLoop, enhanced ? 650 : 330);
            return;
        }
        enhanceBusy = true;
        Bitmap capture = Bitmap.createBitmap(surfaceView.getWidth(), surfaceView.getHeight(), Bitmap.Config.ARGB_8888);
        PixelCopy.request(surfaceView, capture, result -> {
            if (result != PixelCopy.SUCCESS) {
                recycle(capture);
                enhanceBusy = false;
                ui.postDelayed(realtimeEnhanceLoop, 450);
                return;
            }
            final boolean strong = enhanced;
            io.execute(() -> processRealtimeFrame(capture, strong));
        }, ui);
    }

    private void processRealtimeFrame(Bitmap capture, boolean strong) {
        Bitmap scaled = null;
        Bitmap restored = null;
        Bitmap ai = null;
        try {
            int maxEdge = strong ? 560 : 1280;
            scaled = FastEnhancer.fitForAi(capture, maxEdge);
            float brightness = estimateBrightness(scaled);
            float noise = estimateNoise(scaled);
            boolean lowLight = brightness < 72f;
            float strength = strong ? 0.95f + Math.min(0.32f, (zoomScale - 1f) * 0.08f) : 0.58f;
            restored = FastEnhancer.enhanceAdaptive(scaled, previousRealtime, strength, lowLight, noise);

            Bitmap nextPrev = scaled.copy(Bitmap.Config.ARGB_8888, false);
            Bitmap oldPrev = previousRealtime;
            previousRealtime = nextPrev;
            recycle(oldPrev);

            if (strong) {
                try {
                    if (fastSuperResolution == null) fastSuperResolution = new SuperResolutionEngine(this);
                    ai = fastSuperResolution.enhance(restored);
                } catch (Throwable ignored) {
                    ai = null;
                }
            }
            Bitmap ready = ai != null ? ai : restored;
            if (ai != null) restored = null;
            int quality = estimateQuality(brightness, noise, zoomScale, strong);
            String light = lowLight ? " · Nacht" : "";
            String label = strong ? "AI ENHANCED · ESPCN SR" + light : "LIVE AI · temporal" + light;
            final Bitmap finalReady = ready;
            final String finalLabel = label;
            ui.post(() -> {
                if (liveActive && (enhanceMode == EnhanceMode.LIVE || enhanceMode == EnhanceMode.ENHANCED || enhanceMode == EnhanceMode.AUTO)) {
                    showEnhancedBitmap(finalReady, finalLabel);
                    qualityBadge.setText("Q " + quality + "%");
                } else recycle(finalReady);
                enhanceBusy = false;
                if (liveActive && (enhanceMode == EnhanceMode.LIVE || enhanceMode == EnhanceMode.ENHANCED || (enhanceMode == EnhanceMode.AUTO && zoomScale < 3f))) {
                    ui.postDelayed(realtimeEnhanceLoop, strong ? 820 : 360);
                }
            });
            ai = null;
            restored = null;
        } catch (Exception e) {
            final String msg = e.getMessage();
            ui.post(() -> {
                setEnhanceLabel("Enhance-Fehler: " + msg);
                enhanceBusy = false;
                if (liveActive) ui.postDelayed(realtimeEnhanceLoop, 700);
            });
        } finally {
            recycle(capture);
            recycle(scaled);
            recycle(restored);
            recycle(ai);
        }
    }

    private void captureUltraDetail() {
        boolean wanted = enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f);
        if (!wanted || !liveActive || enhanceBusy || surfaceView.getWidth() < 2 || surfaceView.getHeight() < 2) return;
        if (System.currentTimeMillis() - lastZoomInteractionMs < 450) {
            scheduleUltra(500);
            return;
        }
        enhanceBusy = true;
        int target = enhanceMode == EnhanceMode.ULTRA ? (zoomScale >= 3.5f ? 12 : 10) : 8;
        setEnhanceLabel("ULTRA · sammle " + target + " Frames …");
        qualityBadge.setText("Analyse …");
        List<Bitmap> frames = new ArrayList<>();
        captureUltraFrame(frames, 0, target);
    }

    private void captureUltraFrame(List<Bitmap> frames, int index, int target) {
        boolean wanted = enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f);
        if (!wanted || !liveActive) {
            recycleList(frames);
            enhanceBusy = false;
            return;
        }
        Bitmap capture = Bitmap.createBitmap(surfaceView.getWidth(), surfaceView.getHeight(), Bitmap.Config.ARGB_8888);
        PixelCopy.request(surfaceView, capture, result -> {
            if (result == PixelCopy.SUCCESS) frames.add(capture); else recycle(capture);
            if (index + 1 < target) {
                ui.postDelayed(() -> captureUltraFrame(frames, index + 1, target), 70);
            } else {
                processUltraFrames(frames);
            }
        }, ui);
    }

    private void processUltraFrames(List<Bitmap> frames) {
        final float requestedScale = zoomScale;
        final float requestedPanX = panX;
        final float requestedPanY = panY;
        io.execute(() -> {
            try {
                if (frames.isEmpty()) throw new Exception("Kein Kamerabild verfügbar");
                if (ultraProcessor == null) ultraProcessor = new UltraDetailProcessor(this);

                float workPanX = requestedPanX;
                float workPanY = requestedPanY;
                Bitmap template = trackingTemplate;
                if (template != null && !template.isRecycled() && frames.get(0) != null) {
                    PointF shift = ultraProcessor.track(template, frames.get(0), requestedScale, requestedPanX, requestedPanY);
                    if (Math.abs(shift.x) > 0.5f || Math.abs(shift.y) > 0.5f) {
                        workPanX -= shift.x * requestedScale;
                        workPanY -= shift.y * requestedScale;
                        final float px = workPanX, py = workPanY;
                        ui.post(() -> {
                            panX = px;
                            panY = py;
                            constrainPan();
                            applyZoom();
                        });
                    }
                }

                UltraDetailProcessor.Result r = ultraProcessor.process(frames, requestedScale, workPanX, workPanY);
                Bitmap oldTemplate = trackingTemplate;
                trackingTemplate = r.trackingTemplate;
                recycle(oldTemplate);
                final Bitmap ready = r.image;
                final String label = r.label + " · " + ready.getWidth() + "×" + ready.getHeight();
                final int quality = r.quality;
                ui.post(() -> {
                    boolean wanted = enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f);
                    if (wanted && liveActive) {
                        showEnhancedBitmap(ready, label);
                        qualityBadge.setText("Q " + quality + "%");
                    } else recycle(ready);
                    enhanceBusy = false;
                    if (wanted && liveActive) scheduleUltra(enhanceMode == EnhanceMode.ULTRA ? 2600 : 3200);
                });
            } catch (Exception e) {
                final String msg = e.getMessage();
                ui.post(() -> {
                    setEnhanceLabel("ULTRA-Fehler: " + msg);
                    enhancedView.setVisibility(View.GONE);
                    enhanceBusy = false;
                    if (liveActive && (enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f))) scheduleUltra(1800);
                });
            } finally {
                recycleList(frames);
            }
        });
    }

    private void scheduleUltra(long delayMs) {
        ui.removeCallbacks(delayedUltraRefresh);
        if (liveActive && (enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f))) {
            ui.postDelayed(delayedUltraRefresh, delayMs);
        }
    }

    private void scheduleEnhancementAfterInteraction() {
        if (!liveActive) return;
        if (enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f)) {
            scheduleUltra(650);
        } else if (enhanceMode == EnhanceMode.AUTO) {
            ui.removeCallbacks(realtimeEnhanceLoop);
            ui.postDelayed(realtimeEnhanceLoop, 150);
        }
    }

    private void hideUltraWhileMoving() {
        if (enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f)) {
            enhancedView.setVisibility(View.GONE);
            setEnhanceLabel("ULTRA · Ausschnitt wird verfolgt …");
        }
    }

    private void holdOriginal(boolean hold) {
        if (hold) {
            if (enhancedView.getVisibility() == View.VISIBLE) {
                compareHeld = true;
                enhancedView.setVisibility(View.GONE);
                enhanceBadge.setText("Original · Vergleich");
            }
        } else if (compareHeld) {
            compareHeld = false;
            if (shownEnhanced != null && !shownEnhanced.isRecycled() && enhanceMode != EnhanceMode.OFF) enhancedView.setVisibility(View.VISIBLE);
            enhanceBadge.setText(lastEnhanceLabel);
        }
    }

    private void showEnhancedBitmap(Bitmap bitmap, String label) {
        if (bitmap == null) return;
        Bitmap old = shownEnhanced;
        shownEnhanced = bitmap;
        enhancedView.setImageBitmap(bitmap);
        enhancedView.setScaleType(isUltraDisplay() ? ImageView.ScaleType.FIT_CENTER : ImageView.ScaleType.FIT_XY);
        if (!compareHeld) enhancedView.setVisibility(View.VISIBLE);
        setEnhanceLabel(label);
        applyZoom();
        if (old != bitmap) recycle(old);
    }

    private void setEnhanceLabel(String label) {
        lastEnhanceLabel = label == null ? "" : label;
        if (!compareHeld) enhanceBadge.setText(lastEnhanceLabel);
    }

    private void clearEnhancedBitmap(boolean resetTracking) {
        enhancedView.setVisibility(View.GONE);
        enhancedView.setImageDrawable(null);
        recycle(shownEnhanced);
        shownEnhanced = null;
        if (resetTracking) {
            recycle(trackingTemplate);
            trackingTemplate = null;
        }
    }

    private float estimateBrightness(Bitmap b) {
        int w = b.getWidth(), h = b.getHeight();
        int sx = Math.max(1, w / 90), sy = Math.max(1, h / 60);
        long sum = 0;
        int count = 0;
        int[] row = new int[w];
        for (int y = 0; y < h; y += sy) {
            b.getPixels(row, 0, w, 0, y, w, 1);
            for (int x = 0; x < w; x += sx) {
                int c = row[x];
                sum += (77 * ((c >> 16) & 255) + 150 * ((c >> 8) & 255) + 29 * (c & 255)) >> 8;
                count++;
            }
        }
        return count == 0 ? 0 : sum / (float) count;
    }

    private float estimateNoise(Bitmap b) {
        int w = b.getWidth(), h = b.getHeight();
        if (w < 3 || h < 3) return 0;
        Bitmap small = FastEnhancer.fitForAi(b, 320);
        int sw = small.getWidth(), sh = small.getHeight();
        int[] p = new int[sw * sh];
        small.getPixels(p, 0, sw, 0, 0, sw, sh);
        long sum = 0;
        int count = 0;
        for (int y = 1; y < sh - 1; y += 3) {
            for (int x = 1; x < sw - 1; x += 3) {
                int i = y * sw + x;
                int c = luma(p[i]);
                int avg = (luma(p[i - 1]) + luma(p[i + 1]) + luma(p[i - sw]) + luma(p[i + sw])) / 4;
                sum += Math.abs(c - avg);
                count++;
            }
        }
        recycle(small);
        return count == 0 ? 0 : sum / (float) count;
    }

    private int estimateQuality(float brightness, float noise, float zoom, boolean ai) {
        float exposure = Math.max(0f, 1f - Math.abs(brightness - 120f) / 150f);
        float noiseScore = Math.max(0f, 1f - noise / 34f);
        float zoomPenalty = Math.min(0.28f, Math.max(0f, zoom - 1f) * 0.055f);
        float score = 100f * (0.46f * exposure + 0.44f * noiseScore + 0.10f) - zoomPenalty * 100f + (ai ? 4f : 0f);
        return Math.max(5, Math.min(99, Math.round(score)));
    }

    private static int luma(int c) {
        return (77 * ((c >> 16) & 255) + 150 * ((c >> 8) & 255) + 29 * (c & 255)) >> 8;
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
                File marker = new File(project, ".eufy-monitor-v04");
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
            } catch (Exception first) {
                // Some HomeBase/Eufy sessions briefly report a passport-profile API
                // error although the client continues connecting. Check the actual
                // state automatically instead of making the user press Connect twice.
                setStatus("Anmeldung wird automatisch geprüft …");
                JSONObject recovered = recoverLoginState();
                if (recovered != null && ("connected".equals(recovered.optString("phase")) ||
                        "tfa".equals(recovered.optString("phase")) || "captcha".equals(recovered.optString("phase")))) {
                    handleState(recovered);
                } else {
                    setStatus("Anmeldung: " + first.getMessage());
                    ui.post(() -> connectButton.setEnabled(true));
                }
            }
        });
    }

    private JSONObject recoverLoginState() {
        for (int i = 0; i < 6; i++) {
            try {
                Thread.sleep(550 + i * 120L);
                JSONObject s = request("GET", "/state", null);
                String phase = s.optString("phase", "");
                if ("connected".equals(phase) || "tfa".equals(phase) || "captcha".equals(phase)) return s;
            } catch (Exception ignored) {}
        }
        return null;
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
                connectButton.setEnabled(false);
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
                enhanceButton.setEnabled(!devices.isEmpty());
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
            enhanceButton.setEnabled(!devices.isEmpty());
            if (devices.isEmpty()) status.setText("Verbunden, aber keine Kamera gefunden");
        });
    }

    private void startLive() {
        Object selected = deviceSpinner.getSelectedItem();
        if (!(selected instanceof DeviceOption)) return;
        DeviceOption d = (DeviceOption) selected;
        resetZoom();
        clearEnhancedBitmap(true);
        recycle(previousRealtime);
        previousRealtime = null;
        liveButton.setEnabled(false);
        setStreamStatus("Verbinde lokal mit " + d.name + " …");
        io.execute(() -> {
            try {
                request("POST", "/live/start", new JSONObject().put("sn", d.sn));
                liveActive = true;
                setStreamStatus("Live – " + d.name);
                ui.post(() -> {
                    if (enhanceMode == EnhanceMode.LIVE || enhanceMode == EnhanceMode.ENHANCED || (enhanceMode == EnhanceMode.AUTO && zoomScale < 3f)) {
                        ui.post(realtimeEnhanceLoop);
                    } else if (enhanceMode == EnhanceMode.ULTRA || (enhanceMode == EnhanceMode.AUTO && zoomScale >= 3f)) {
                        scheduleUltra(300);
                    }
                });
            } catch (Exception e) {
                liveActive = false;
                setStreamStatus("Live-Fehler: " + e.getMessage());
                ui.post(() -> liveButton.setEnabled(true));
            }
        });
    }

    private void stopLive() {
        liveActive = false;
        ui.removeCallbacks(realtimeEnhanceLoop);
        ui.removeCallbacks(delayedUltraRefresh);
        io.execute(() -> {
            try { request("POST", "/live/stop", new JSONObject()); } catch (Exception ignored) {}
            setStreamStatus("Livestream gestoppt");
            ui.post(() -> {
                resetZoom();
                clearEnhancedBitmap(true);
                recycle(previousRealtime);
                previousRealtime = null;
                setEnhanceLabel(enhanceMode == EnhanceMode.OFF ? "Original" : "Enhance wartet auf Livebild");
                qualityBadge.setText("Q --");
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
                if (bmp != null) ui.post(() -> {
                    captchaImage.setImageBitmap(bmp);
                    captchaImage.setVisibility(View.VISIBLE);
                });
            } catch (Exception ignored) {}
        });
    }

    private JSONObject request(String method, String path, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(CONTROL + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(3500);
        c.setReadTimeout(50000);
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = new BufferedOutputStream(c.getOutputStream())) { out.write(bytes); }
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
        int total = 0, n;
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
            if (children != null) for (File c : children) deleteRecursively(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static void recycle(Bitmap b) {
        if (b != null && !b.isRecycled()) {
            try { b.recycle(); } catch (Exception ignored) {}
        }
    }

    private static void recycleList(List<Bitmap> frames) {
        if (frames == null) return;
        for (Bitmap b : frames) recycle(b);
        frames.clear();
    }

    private static class DeviceOption {
        final String name, model, sn;
        DeviceOption(String name, String model, String sn) {
            this.name = name;
            this.model = model;
            this.sn = sn;
        }
        @Override public String toString() {
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

        void start() { io.execute(this); }

        void close() {
            closed = true;
            decoder.close();
            try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        }

        @Override public void run() {
            while (!closed) {
                try {
                    socket = new Socket();
                    socket.connect(new InetSocketAddress("127.0.0.1", 8788), 3000);
                    socket.setTcpNoDelay(true);
                    DataInputStream in = new DataInputStream(new BufferedInputStream(socket.getInputStream(), 512 * 1024));
                    while (!closed) {
                        byte[] h = new byte[16];
                        in.readFully(h);
                        if (h[0] != 'E' || h[1] != 'U' || h[2] != 'F' || h[3] != 'Y') throw new Exception("Ungültige Streamdaten");
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
                        try { Thread.sleep(700); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                    }
                } finally {
                    try { if (socket != null) socket.close(); } catch (Exception ignored) {}
                }
            }
        }
    }
}
