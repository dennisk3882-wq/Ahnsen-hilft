package com.denko.eufymonitor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.RectF;

import org.tensorflow.lite.support.image.TensorImage;
import org.tensorflow.lite.support.label.Category;
import org.tensorflow.lite.task.core.BaseOptions;
import org.tensorflow.lite.task.vision.detector.Detection;
import org.tensorflow.lite.task.vision.detector.ObjectDetector;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Local object recognition + lightweight multi-object tracking.
 * No frame is uploaded. Detection runs entirely on-device.
 */
final class SmartVisionEngine implements AutoCloseable {
    static final class Result {
        final String label;
        final float score;
        final RectF normalizedBox;
        final int trackId;
        final long visibleMs;
        final int priority;

        Result(String label, float score, RectF normalizedBox, int trackId, long visibleMs, int priority) {
            this.label = label;
            this.score = score;
            this.normalizedBox = normalizedBox;
            this.trackId = trackId;
            this.visibleMs = visibleMs;
            this.priority = priority;
        }

        String shortLabel() {
            return label + " " + Math.round(score * 100f) + "%";
        }

        String durationLabel() {
            if (visibleMs < 1500) return "neu";
            return String.format(Locale.GERMANY, "%.0fs", visibleMs / 1000f);
        }
    }

    private static final class Track {
        int id;
        String label;
        RectF box;
        long firstSeen;
        long lastSeen;
    }

    private final ObjectDetector detector;
    private final Map<Integer, Track> tracks = new HashMap<>();
    private final AtomicInteger nextTrackId = new AtomicInteger(1);

    SmartVisionEngine(Context context) throws Exception {
        BaseOptions base = BaseOptions.builder()
                .setNumThreads(4)
                .build();
        ObjectDetector.ObjectDetectorOptions options = ObjectDetector.ObjectDetectorOptions.builder()
                .setBaseOptions(base)
                .setScoreThreshold(0.36f)
                .setMaxResults(12)
                .build();
        detector = ObjectDetector.createFromFileAndOptions(context, "efficientdet_lite0.tflite", options);
    }

    synchronized List<Result> detect(Bitmap frame) {
        List<Result> out = new ArrayList<>();
        if (frame == null || frame.getWidth() < 2 || frame.getHeight() < 2) return out;

        List<Detection> detections = detector.detect(TensorImage.fromBitmap(frame));
        long now = System.currentTimeMillis();
        List<Integer> claimed = new ArrayList<>();

        for (Detection d : detections) {
            if (d.getCategories() == null || d.getCategories().isEmpty()) continue;
            Category c = d.getCategories().get(0);
            String label = normalizeLabel(c.getLabel());
            float score = c.getScore();
            if (!isUseful(label, score)) continue;

            RectF b = d.getBoundingBox();
            RectF n = new RectF(
                    clamp01(b.left / frame.getWidth()),
                    clamp01(b.top / frame.getHeight()),
                    clamp01(b.right / frame.getWidth()),
                    clamp01(b.bottom / frame.getHeight()));
            if (n.width() <= 0.01f || n.height() <= 0.01f) continue;

            Track best = null;
            float bestIou = 0f;
            for (Track t : tracks.values()) {
                if (!t.label.equals(label) || claimed.contains(t.id)) continue;
                float i = iou(t.box, n);
                if (i > 0.20f && i > bestIou) {
                    best = t;
                    bestIou = i;
                }
            }
            if (best == null) {
                best = new Track();
                best.id = nextTrackId.getAndIncrement();
                best.label = label;
                best.firstSeen = now;
                tracks.put(best.id, best);
            }
            best.box = new RectF(n);
            best.lastSeen = now;
            claimed.add(best.id);

            long visible = Math.max(0, now - best.firstSeen);
            int priority = priority(label, score, n, visible);
            out.add(new Result(label, score, n, best.id, visible, priority));
        }

        Iterator<Map.Entry<Integer, Track>> it = tracks.entrySet().iterator();
        while (it.hasNext()) {
            Track t = it.next().getValue();
            if (now - t.lastSeen > 4500) it.remove();
        }
        return out;
    }

    private static String normalizeLabel(String raw) {
        if (raw == null || raw.trim().isEmpty()) return "Objekt";
        String s = raw.trim().toLowerCase(Locale.ROOT);
        switch (s) {
            case "person": return "Person";
            case "car": return "Auto";
            case "truck": return "LKW";
            case "bus": return "Bus";
            case "motorcycle": return "Motorrad";
            case "bicycle": return "Fahrrad";
            case "dog": return "Hund";
            case "cat": return "Katze";
            case "bird": return "Vogel";
            default:
                return Character.toUpperCase(s.charAt(0)) + s.substring(1);
        }
    }

    private static boolean isUseful(String label, float score) {
        if (score < 0.36f) return false;
        switch (label) {
            case "Person":
            case "Auto":
            case "LKW":
            case "Bus":
            case "Motorrad":
            case "Fahrrad":
            case "Hund":
            case "Katze":
            case "Vogel":
                return true;
            default:
                return score >= 0.62f;
        }
    }

    private static int priority(String label, float score, RectF box, long visibleMs) {
        int p = Math.round(score * 35f);
        float area = box.width() * box.height();
        p += Math.min(25, Math.round(area * 100f));
        if ("Person".equals(label)) p += 30;
        else if ("Auto".equals(label) || "LKW".equals(label) || "Motorrad".equals(label)) p += 20;
        else if ("Hund".equals(label) || "Katze".equals(label)) p += 8;
        if (visibleMs > 15000) p += 12;
        return Math.max(0, Math.min(100, p));
    }

    private static float iou(RectF a, RectF b) {
        float l = Math.max(a.left, b.left);
        float t = Math.max(a.top, b.top);
        float r = Math.min(a.right, b.right);
        float bo = Math.min(a.bottom, b.bottom);
        float iw = Math.max(0, r - l), ih = Math.max(0, bo - t);
        float inter = iw * ih;
        float union = a.width() * a.height() + b.width() * b.height() - inter;
        return union <= 0f ? 0f : inter / union;
    }

    private static float clamp01(float v) {
        return Math.max(0f, Math.min(1f, v));
    }

    @Override
    public synchronized void close() {
        detector.close();
        tracks.clear();
    }
}
