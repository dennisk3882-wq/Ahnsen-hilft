package com.denko.eufymonitor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.PointF;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Multi-frame local restoration pipeline for a fixed security camera.
 * It aligns frames, rejects motion outliers, repairs compression artefacts,
 * adapts denoise/deblur to the scene and then runs an on-device SR model.
 */
final class UltraDetailProcessor implements AutoCloseable {
    static final class Result {
        final Bitmap image;
        final Bitmap trackingTemplate;
        final String label;
        final int quality;
        final float motionPercent;
        final boolean lowLight;
        final int usedFrames;

        Result(Bitmap image, Bitmap trackingTemplate, String label, int quality,
               float motionPercent, boolean lowLight, int usedFrames) {
            this.image = image;
            this.trackingTemplate = trackingTemplate;
            this.label = label;
            this.quality = quality;
            this.motionPercent = motionPercent;
            this.lowLight = lowLight;
            this.usedFrames = usedFrames;
        }
    }

    private static final class Metrics {
        float brightness;
        float sharpness;
        float noise;
        float motion;
        int bestIndex;
        int quality;
        boolean lowLight;
    }

    private final Context context;
    private RealEsrganEngine realEsrgan;
    private SuperResolutionEngine fallbackSr;

    UltraDetailProcessor(Context context) {
        this.context = context.getApplicationContext();
    }

    Result process(List<Bitmap> inputFrames, float zoom, float panX, float panY) throws Exception {
        if (inputFrames == null || inputFrames.isEmpty()) throw new Exception("Keine Frames für Ultra Detail");
        List<Bitmap> frames = new ArrayList<>();
        for (Bitmap b : inputFrames) {
            if (b != null && !b.isRecycled()) frames.add(b);
        }
        if (frames.isEmpty()) throw new Exception("Keine gültigen Kameraframes");

        Metrics metrics = analyze(frames);
        int[][] offsets = estimateOffsets(frames, metrics.bestIndex);
        Bitmap fused = fuseMotionAware(frames, metrics.bestIndex, offsets, metrics);
        Bitmap repaired = null;
        Bitmap crop = null;
        Bitmap pre = null;
        Bitmap sr = null;
        Bitmap finalImage = null;
        Bitmap trackingTemplate = null;
        boolean usedReal = false;
        boolean usedFallback = false;
        try {
            repaired = FastEnhancer.repairCompression(fused, metrics.noise, metrics.lowLight);
            crop = FastEnhancer.cropForZoom(repaired, zoom, panX, panY);
            trackingTemplate = crop.copy(Bitmap.Config.ARGB_8888, false);
            float deblur = adaptiveDeblurStrength(metrics, zoom);
            pre = FastEnhancer.enhanceAdaptive(crop, null, deblur, metrics.lowLight, metrics.noise);

            try {
                if (realEsrgan == null) realEsrgan = new RealEsrganEngine(context);
                sr = realEsrgan.enhance(pre);
                usedReal = sr != null;
            } catch (Throwable realError) {
                try {
                    if (fallbackSr == null) fallbackSr = new SuperResolutionEngine(context);
                    sr = fallbackSr.enhance(pre);
                    usedFallback = sr != null;
                } catch (Throwable ignored) {
                    sr = null;
                }
            }

            Bitmap source = sr != null ? sr : pre;
            finalImage = FastEnhancer.upscale4k(source);
            Bitmap polished = FastEnhancer.enhanceAdaptive(finalImage, null,
                    metrics.lowLight ? 0.28f : 0.42f, metrics.lowLight, Math.max(1f, metrics.noise * 0.5f));
            if (polished != null) {
                finalImage.recycle();
                finalImage = polished;
            }

            String engine = usedReal ? "Real-ESRGAN x4" : usedFallback ? "ESPCN x3" : "SR-Fallback";
            String light = metrics.lowLight ? " · Nacht" : "";
            String label = String.format(Locale.GERMANY,
                    "ULTRA · %s · Fusion %d · Q %d%% · Motion %.0f%%%s",
                    engine, frames.size(), metrics.quality, metrics.motion * 100f, light);
            Bitmap resultBitmap = finalImage;
            finalImage = null;
            return new Result(resultBitmap, trackingTemplate, label, metrics.quality,
                    metrics.motion * 100f, metrics.lowLight, frames.size());
        } finally {
            recycle(fused);
            recycle(repaired);
            recycle(crop);
            recycle(pre);
            recycle(sr);
            recycle(finalImage);
            // trackingTemplate is intentionally returned on success.
        }
    }

    /**
     * Tracks the previously selected detail crop in the new raw frame.
     * Returns movement in source pixels; (0,0) means no reliable movement.
     */
    PointF track(Bitmap template, Bitmap current, float zoom, float panX, float panY) {
        if (template == null || current == null || template.isRecycled() || current.isRecycled()) return new PointF();
        int w = current.getWidth(), h = current.getHeight();
        float s = Math.max(1f, zoom);
        int cw = Math.min(w, Math.max(32, Math.round(w / s)));
        int ch = Math.min(h, Math.max(32, Math.round(h / s)));
        float cx = w / 2f - panX / s;
        float cy = h / 2f - panY / s;
        int expectedLeft = Math.max(0, Math.min(w - cw, Math.round(cx - cw / 2f)));
        int expectedTop = Math.max(0, Math.min(h - ch, Math.round(cy - ch / 2f)));

        Bitmap smallTemplate = FastEnhancer.fitForAi(template, 180);
        int tw = smallTemplate.getWidth(), th = smallTemplate.getHeight();
        int[] tp = new int[tw * th];
        smallTemplate.getPixels(tp, 0, tw, 0, 0, tw, th);
        int[] cp = new int[w * h];
        current.getPixels(cp, 0, w, 0, 0, w, h);

        int search = Math.max(12, Math.min(72, Math.min(cw, ch) / 5));
        int step = Math.max(3, search / 12);
        int sampleStep = Math.max(2, Math.min(tw, th) / 42);
        double best = Double.MAX_VALUE;
        double zero = Double.MAX_VALUE;
        int bestDx = 0, bestDy = 0;

        for (int dy = -search; dy <= search; dy += step) {
            for (int dx = -search; dx <= search; dx += step) {
                double sad = 0;
                int count = 0;
                for (int y = 0; y < th; y += sampleStep) {
                    int sy = expectedTop + dy + Math.min(ch - 1, Math.round(y * (ch - 1f) / Math.max(1, th - 1)));
                    if (sy < 0 || sy >= h) continue;
                    for (int x = 0; x < tw; x += sampleStep) {
                        int sx = expectedLeft + dx + Math.min(cw - 1, Math.round(x * (cw - 1f) / Math.max(1, tw - 1)));
                        if (sx < 0 || sx >= w) continue;
                        sad += Math.abs(luma(tp[y * tw + x]) - luma(cp[sy * w + sx]));
                        count++;
                    }
                }
                if (count == 0) continue;
                sad /= count;
                if (dx == 0 && dy == 0) zero = sad;
                if (sad < best) {
                    best = sad;
                    bestDx = dx;
                    bestDy = dy;
                }
            }
        }
        if (smallTemplate != template) recycle(smallTemplate);
        if (zero == Double.MAX_VALUE || best > zero * 0.90 || Math.hypot(bestDx, bestDy) < step) return new PointF();
        return new PointF(bestDx, bestDy);
    }

    private Metrics analyze(List<Bitmap> frames) {
        Metrics m = new Metrics();
        float bestScore = -Float.MAX_VALUE;
        Bitmap refSmall = null;
        int[] ref = null;
        int count = 0;

        for (int i = 0; i < frames.size(); i++) {
            Bitmap small = FastEnhancer.fitForAi(frames.get(i), 280);
            int w = small.getWidth(), h = small.getHeight();
            int[] p = new int[w * h];
            small.getPixels(p, 0, w, 0, 0, w, h);
            float brightness = meanLuma(p);
            float sharp = sharpness(p, w, h);
            float noise = noise(p, w, h);
            float exposurePenalty = Math.abs(brightness - 125f) * 0.18f;
            float score = sharp * 2.4f - noise * 0.7f - exposurePenalty;
            if (score > bestScore) {
                bestScore = score;
                m.bestIndex = i;
            }
            m.brightness += brightness;
            m.sharpness += sharp;
            m.noise += noise;
            count++;
            if (refSmall != null) recycle(refSmall);
            refSmall = small;
            ref = p;
        }
        if (refSmall != null) recycle(refSmall);
        m.brightness /= Math.max(1, count);
        m.sharpness /= Math.max(1, count);
        m.noise /= Math.max(1, count);

        Bitmap bestSmall = FastEnhancer.fitForAi(frames.get(m.bestIndex), 240);
        int bw = bestSmall.getWidth(), bh = bestSmall.getHeight();
        int[] bp = new int[bw * bh];
        bestSmall.getPixels(bp, 0, bw, 0, 0, bw, bh);
        float motionSum = 0;
        int motionN = 0;
        for (int i = 0; i < frames.size(); i++) {
            if (i == m.bestIndex) continue;
            Bitmap s = Bitmap.createScaledBitmap(frames.get(i), bw, bh, true);
            int[] q = new int[bw * bh];
            s.getPixels(q, 0, bw, 0, 0, bw, bh);
            motionSum += frameDifference(bp, q);
            motionN++;
            recycle(s);
        }
        recycle(bestSmall);
        m.motion = motionN == 0 ? 0 : Math.min(1f, (motionSum / motionN) / 70f);
        m.lowLight = m.brightness < 72f;
        float exposure = Math.max(0f, 1f - Math.abs(m.brightness - 120f) / 150f);
        float sharpScore = Math.min(1f, m.sharpness / 28f);
        float noiseScore = Math.max(0f, 1f - m.noise / 30f);
        m.quality = Math.round(100f * (0.42f * sharpScore + 0.24f * noiseScore + 0.20f * exposure + 0.14f * (1f - m.motion)));
        m.quality = Math.max(5, Math.min(99, m.quality));
        return m;
    }

    private int[][] estimateOffsets(List<Bitmap> frames, int refIndex) {
        int[][] offsets = new int[frames.size()][2];
        Bitmap refSmall = FastEnhancer.fitForAi(frames.get(refIndex), 300);
        int sw = refSmall.getWidth(), sh = refSmall.getHeight();
        int[] ref = new int[sw * sh];
        refSmall.getPixels(ref, 0, sw, 0, 0, sw, sh);
        for (int i = 0; i < frames.size(); i++) {
            if (i == refIndex) continue;
            Bitmap cand = Bitmap.createScaledBitmap(frames.get(i), sw, sh, true);
            int[] cp = new int[sw * sh];
            cand.getPixels(cp, 0, sw, 0, 0, sw, sh);
            int bestDx = 0, bestDy = 0;
            double best = Double.MAX_VALUE;
            final int radius = 6;
            for (int dy = -radius; dy <= radius; dy++) {
                for (int dx = -radius; dx <= radius; dx++) {
                    double sad = shiftedSad(ref, cp, sw, sh, dx, dy, radius + 2, 4);
                    if (sad < best) {
                        best = sad;
                        bestDx = dx;
                        bestDy = dy;
                    }
                }
            }
            float fx = frames.get(i).getWidth() / (float) sw;
            float fy = frames.get(i).getHeight() / (float) sh;
            offsets[i][0] = Math.round(bestDx * fx);
            offsets[i][1] = Math.round(bestDy * fy);
            recycle(cand);
        }
        recycle(refSmall);
        return offsets;
    }

    private Bitmap fuseMotionAware(List<Bitmap> frames, int refIndex, int[][] offsets, Metrics metrics) {
        Bitmap refBitmap = frames.get(refIndex);
        int w = refBitmap.getWidth(), h = refBitmap.getHeight();
        int n = w * h;
        int[] ref = new int[n];
        refBitmap.getPixels(ref, 0, w, 0, 0, w, h);
        int[] sumR = new int[n], sumG = new int[n], sumB = new int[n], weight = new int[n];
        for (int i = 0; i < n; i++) {
            int c = ref[i];
            sumR[i] = ((c >> 16) & 255) * 4;
            sumG[i] = ((c >> 8) & 255) * 4;
            sumB[i] = (c & 255) * 4;
            weight[i] = 4;
        }
        int threshold = Math.round(18f + Math.min(24f, metrics.noise * 0.8f) + (metrics.lowLight ? 10f : 0f));
        int[] px = new int[n];
        for (int f = 0; f < frames.size(); f++) {
            if (f == refIndex) continue;
            Bitmap b = frames.get(f);
            if (b.getWidth() != w || b.getHeight() != h) continue;
            b.getPixels(px, 0, w, 0, 0, w, h);
            int dx = offsets[f][0], dy = offsets[f][1];
            for (int y = 0; y < h; y++) {
                int sy = y + dy;
                if (sy < 0 || sy >= h) continue;
                int row = y * w;
                int srow = sy * w;
                for (int x = 0; x < w; x++) {
                    int sx = x + dx;
                    if (sx < 0 || sx >= w) continue;
                    int i = row + x;
                    int c = px[srow + sx];
                    int r0 = (ref[i] >> 16) & 255, g0 = (ref[i] >> 8) & 255, b0 = ref[i] & 255;
                    int r = (c >> 16) & 255, g = (c >> 8) & 255, bl = c & 255;
                    int diff = (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(bl - b0)) / 3;
                    if (diff <= threshold) {
                        int wf = diff < threshold / 2 ? 3 : 1;
                        sumR[i] += r * wf;
                        sumG[i] += g * wf;
                        sumB[i] += bl * wf;
                        weight[i] += wf;
                    }
                }
            }
        }
        int[] out = new int[n];
        for (int i = 0; i < n; i++) {
            int ww = Math.max(1, weight[i]);
            out[i] = 0xff000000 | ((sumR[i] / ww) << 16) | ((sumG[i] / ww) << 8) | (sumB[i] / ww);
        }
        Bitmap result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        result.setPixels(out, 0, w, 0, 0, w, h);
        return result;
    }

    private static float adaptiveDeblurStrength(Metrics m, float zoom) {
        float blurNeed = Math.max(0f, 1f - m.sharpness / 30f);
        float s = 0.45f + blurNeed * 0.85f + Math.min(0.35f, (Math.max(1f, zoom) - 1f) * 0.08f);
        if (m.motion > 0.35f) s *= 0.72f;
        if (m.lowLight) s *= 0.76f;
        return Math.max(0.25f, Math.min(1.35f, s));
    }

    private static float meanLuma(int[] p) {
        long sum = 0;
        int step = Math.max(1, p.length / 45000);
        int n = 0;
        for (int i = 0; i < p.length; i += step) {
            sum += luma(p[i]);
            n++;
        }
        return n == 0 ? 0 : sum / (float) n;
    }

    private static float sharpness(int[] p, int w, int h) {
        long sum = 0;
        int n = 0;
        int step = 2;
        for (int y = 1; y < h - 1; y += step) {
            for (int x = 1; x < w - 1; x += step) {
                int i = y * w + x;
                int c = luma(p[i]);
                int lap = Math.abs(4 * c - luma(p[i - 1]) - luma(p[i + 1]) - luma(p[i - w]) - luma(p[i + w]));
                sum += lap;
                n++;
            }
        }
        return n == 0 ? 0 : sum / (float) n;
    }

    private static float noise(int[] p, int w, int h) {
        long sum = 0;
        int n = 0;
        for (int y = 1; y < h - 1; y += 3) {
            for (int x = 1; x < w - 1; x += 3) {
                int i = y * w + x;
                int c = luma(p[i]);
                int avg = (luma(p[i - 1]) + luma(p[i + 1]) + luma(p[i - w]) + luma(p[i + w])) / 4;
                sum += Math.abs(c - avg);
                n++;
            }
        }
        return n == 0 ? 0 : sum / (float) n;
    }

    private static float frameDifference(int[] a, int[] b) {
        int n = Math.min(a.length, b.length);
        if (n == 0) return 0;
        long sum = 0;
        int count = 0;
        int step = Math.max(1, n / 50000);
        for (int i = 0; i < n; i += step) {
            sum += Math.abs(luma(a[i]) - luma(b[i]));
            count++;
        }
        return sum / (float) Math.max(1, count);
    }

    private static double shiftedSad(int[] a, int[] b, int w, int h, int dx, int dy, int margin, int step) {
        long sum = 0;
        int count = 0;
        for (int y = margin; y < h - margin; y += step) {
            int sy = y + dy;
            if (sy < 0 || sy >= h) continue;
            for (int x = margin; x < w - margin; x += step) {
                int sx = x + dx;
                if (sx < 0 || sx >= w) continue;
                sum += Math.abs(luma(a[y * w + x]) - luma(b[sy * w + sx]));
                count++;
            }
        }
        return count == 0 ? Double.MAX_VALUE : sum / (double) count;
    }

    private static int luma(int c) {
        int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        return (77 * r + 150 * g + 29 * b) >> 8;
    }

    private static void recycle(Bitmap b) {
        if (b != null && !b.isRecycled()) {
            try { b.recycle(); } catch (Exception ignored) {}
        }
    }

    @Override
    public void close() {
        if (realEsrgan != null) {
            try { realEsrgan.close(); } catch (Exception ignored) {}
            realEsrgan = null;
        }
        if (fallbackSr != null) {
            try { fallbackSr.close(); } catch (Exception ignored) {}
            fallbackSr = null;
        }
    }
}
