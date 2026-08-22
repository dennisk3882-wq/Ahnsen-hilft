package com.denko.eufymonitor;

import android.graphics.Bitmap;

import java.util.List;

/** Local image enhancement helpers. No image data leaves the device. */
final class FastEnhancer {
    private FastEnhancer() {}

    static Bitmap enhance(Bitmap current, Bitmap previous, float strength) {
        if (current == null) return null;
        Bitmap src = current.copy(Bitmap.Config.ARGB_8888, true);
        int w = src.getWidth();
        int h = src.getHeight();
        int[] p = new int[w * h];
        src.getPixels(p, 0, w, 0, 0, w, h);

        if (previous != null && previous.getWidth() == w && previous.getHeight() == h) {
            int[] q = new int[w * h];
            previous.getPixels(q, 0, w, 0, 0, w, h);
            for (int i = 0; i < p.length; i++) {
                int a = p[i], b = q[i];
                int dr = Math.abs(((a >> 16) & 255) - ((b >> 16) & 255));
                int dg = Math.abs(((a >> 8) & 255) - ((b >> 8) & 255));
                int db = Math.abs((a & 255) - (b & 255));
                int diff = (dr + dg + db) / 3;
                // Only fuse temporal data where pixels are likely static. Moving
                // people/cars stay anchored to the newest frame, avoiding ghosts.
                if (diff < 24) {
                    int oldWeight = diff < 10 ? 2 : 1;
                    int div = 4 + oldWeight;
                    int r = (((a >> 16) & 255) * 4 + ((b >> 16) & 255) * oldWeight) / div;
                    int g = (((a >> 8) & 255) * 4 + ((b >> 8) & 255) * oldWeight) / div;
                    int bl = ((a & 255) * 4 + (b & 255) * oldWeight) / div;
                    p[i] = 0xff000000 | (r << 16) | (g << 8) | bl;
                }
            }
        }

        int[] out = p.clone();
        float s = Math.max(0.10f, Math.min(1.65f, strength));
        for (int y = 1; y < h - 1; y++) {
            int row = y * w;
            for (int x = 1; x < w - 1; x++) {
                int i = row + x;
                int c = p[i], l = p[i - 1], r = p[i + 1], u = p[i - w], d = p[i + w];
                int cr = (c >> 16) & 255, cg = (c >> 8) & 255, cb = c & 255;
                int br = (((l >> 16) & 255) + ((r >> 16) & 255) + ((u >> 16) & 255) + ((d >> 16) & 255)) >> 2;
                int bg = (((l >> 8) & 255) + ((r >> 8) & 255) + ((u >> 8) & 255) + ((d >> 8) & 255)) >> 2;
                int bb = ((l & 255) + (r & 255) + (u & 255) + (d & 255)) >> 2;

                int edge = Math.abs(cr - br) + Math.abs(cg - bg) + Math.abs(cb - bb);
                float localS = edge > 150 ? s * 0.72f : edge < 18 ? s * 0.45f : s;
                int nr = clamp(Math.round(cr + (cr - br) * localS));
                int ng = clamp(Math.round(cg + (cg - bg) * localS));
                int nb = clamp(Math.round(cb + (cb - bb) * localS));
                out[i] = 0xff000000 | (nr << 16) | (ng << 8) | nb;
            }
        }
        Bitmap result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        result.setPixels(out, 0, w, 0, 0, w, h);
        src.recycle();
        return result;
    }

    /**
     * Scene-adaptive restoration. In low light we favor denoise and gentle local
     * contrast; in daylight we retain more micro-detail and use stronger deblur.
     */
    static Bitmap enhanceAdaptive(Bitmap current, Bitmap previous, float strength, boolean lowLight, float noise) {
        if (current == null) return null;
        Bitmap base = enhance(current, previous, lowLight ? strength * 0.72f : strength);
        if (base == null) return null;
        int w = base.getWidth(), h = base.getHeight();
        int[] p = new int[w * h];
        base.getPixels(p, 0, w, 0, 0, w, h);

        float noiseNorm = Math.max(0f, Math.min(1f, noise / 32f));
        if (noiseNorm > 0.18f || lowLight) {
            int[] src = p.clone();
            float blend = Math.min(0.45f, 0.12f + noiseNorm * 0.26f + (lowLight ? 0.08f : 0f));
            for (int y = 1; y < h - 1; y++) {
                for (int x = 1; x < w - 1; x++) {
                    int i = y * w + x;
                    int c = src[i];
                    int lumC = luma(c);
                    int rr = 0, gg = 0, bb = 0, count = 0;
                    for (int yy = -1; yy <= 1; yy++) {
                        for (int xx = -1; xx <= 1; xx++) {
                            int n = src[(y + yy) * w + (x + xx)];
                            if (Math.abs(luma(n) - lumC) <= (lowLight ? 26 : 18)) {
                                rr += (n >> 16) & 255;
                                gg += (n >> 8) & 255;
                                bb += n & 255;
                                count++;
                            }
                        }
                    }
                    if (count > 0) {
                        int r0 = (c >> 16) & 255, g0 = (c >> 8) & 255, b0 = c & 255;
                        int r = clamp(Math.round(r0 * (1f - blend) + (rr / (float) count) * blend));
                        int g = clamp(Math.round(g0 * (1f - blend) + (gg / (float) count) * blend));
                        int b = clamp(Math.round(b0 * (1f - blend) + (bb / (float) count) * blend));
                        p[i] = 0xff000000 | (r << 16) | (g << 8) | b;
                    }
                }
            }
        }

        if (lowLight) {
            float gamma = 0.78f;
            int[] lut = new int[256];
            for (int i = 0; i < 256; i++) lut[i] = clamp(Math.round((float) Math.pow(i / 255.0, gamma) * 255f));
            for (int i = 0; i < p.length; i++) {
                int c = p[i];
                int r = lut[(c >> 16) & 255], g = lut[(c >> 8) & 255], b = lut[c & 255];
                // Keep chroma from exploding in shadows.
                int y = (77 * r + 150 * g + 29 * b) >> 8;
                r = clamp(Math.round(y + (r - y) * 0.88f));
                g = clamp(Math.round(y + (g - y) * 0.88f));
                b = clamp(Math.round(y + (b - y) * 0.88f));
                p[i] = 0xff000000 | (r << 16) | (g << 8) | b;
            }
        }

        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(p, 0, w, 0, 0, w, h);
        base.recycle();
        return out;
    }

    /** Repairs mild H.264 block boundaries before SR so the model does not magnify them. */
    static Bitmap repairCompression(Bitmap source, float noise, boolean lowLight) {
        if (source == null) return null;
        Bitmap out = source.copy(Bitmap.Config.ARGB_8888, true);
        int w = out.getWidth(), h = out.getHeight();
        int[] p = new int[w * h];
        out.getPixels(p, 0, w, 0, 0, w, h);
        int threshold = Math.round(15f + Math.min(14f, noise * 0.45f) + (lowLight ? 5f : 0f));

        // Vertical codec block boundaries.
        for (int block : new int[]{8, 16}) {
            for (int x = block; x < w; x += block) {
                for (int y = 0; y < h; y++) {
                    int a = y * w + x - 1, b = y * w + x;
                    if (colorDiff(p[a], p[b]) <= threshold) {
                        int ca = p[a], cb = p[b];
                        p[a] = blend(ca, cb, 0.22f);
                        p[b] = blend(cb, ca, 0.22f);
                    }
                }
            }
            // Horizontal codec block boundaries.
            for (int y = block; y < h; y += block) {
                for (int x = 0; x < w; x++) {
                    int a = (y - 1) * w + x, b = y * w + x;
                    if (colorDiff(p[a], p[b]) <= threshold) {
                        int ca = p[a], cb = p[b];
                        p[a] = blend(ca, cb, 0.22f);
                        p[b] = blend(cb, ca, 0.22f);
                    }
                }
            }
        }
        out.setPixels(p, 0, w, 0, 0, w, h);
        return out;
    }

    static Bitmap average(List<Bitmap> frames) {
        if (frames == null || frames.isEmpty()) return null;
        Bitmap first = frames.get(0);
        int w = first.getWidth(), h = first.getHeight();
        int valid = 0;
        long[] rr = new long[w * h], gg = new long[w * h], bb = new long[w * h];
        int[] px = new int[w * h];
        for (Bitmap f : frames) {
            if (f == null || f.getWidth() != w || f.getHeight() != h) continue;
            f.getPixels(px, 0, w, 0, 0, w, h);
            for (int i = 0; i < px.length; i++) {
                int c = px[i];
                rr[i] += (c >> 16) & 255;
                gg[i] += (c >> 8) & 255;
                bb[i] += c & 255;
            }
            valid++;
        }
        valid = Math.max(1, valid);
        for (int i = 0; i < px.length; i++) {
            int r = (int) (rr[i] / valid), g = (int) (gg[i] / valid), b = (int) (bb[i] / valid);
            px[i] = 0xff000000 | (r << 16) | (g << 8) | b;
        }
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(px, 0, w, 0, 0, w, h);
        return out;
    }

    static Bitmap cropForZoom(Bitmap source, float scale, float panX, float panY) {
        if (source == null) return null;
        int w = source.getWidth(), h = source.getHeight();
        float s = Math.max(1f, scale);
        int cw = Math.min(w, Math.max(32, Math.round(w / s)));
        int ch = Math.min(h, Math.max(32, Math.round(h / s)));
        float cx = w / 2f - panX / s;
        float cy = h / 2f - panY / s;
        int left = Math.round(cx - cw / 2f);
        int top = Math.round(cy - ch / 2f);
        left = Math.max(0, Math.min(w - cw, left));
        top = Math.max(0, Math.min(h - ch, top));
        return Bitmap.createBitmap(source, left, top, cw, ch);
    }

    static Bitmap fitForAi(Bitmap source, int maxLongEdge) {
        if (source == null) return null;
        int w = source.getWidth(), h = source.getHeight();
        int longEdge = Math.max(w, h);
        if (longEdge <= maxLongEdge) return source.copy(Bitmap.Config.ARGB_8888, false);
        float factor = maxLongEdge / (float) longEdge;
        return Bitmap.createScaledBitmap(source, Math.max(64, Math.round(w * factor)), Math.max(64, Math.round(h * factor)), true);
    }

    static Bitmap upscale4k(Bitmap source) {
        if (source == null) return null;
        int w = source.getWidth(), h = source.getHeight();
        float aspect = w / (float) h;
        int targetW, targetH;
        if (aspect >= 1.6f) {
            targetW = 3840;
            targetH = Math.min(2160, Math.round(targetW / aspect));
        } else {
            targetH = 2160;
            targetW = Math.min(3840, Math.round(targetH * aspect));
        }
        targetW = Math.max(64, targetW);
        targetH = Math.max(64, targetH);
        if (w == targetW && h == targetH) return source.copy(Bitmap.Config.ARGB_8888, false);
        return Bitmap.createScaledBitmap(source, targetW, targetH, true);
    }

    private static int blend(int a, int b, float amount) {
        float inv = 1f - amount;
        int r = clamp(Math.round(((a >> 16) & 255) * inv + ((b >> 16) & 255) * amount));
        int g = clamp(Math.round(((a >> 8) & 255) * inv + ((b >> 8) & 255) * amount));
        int bl = clamp(Math.round((a & 255) * inv + (b & 255) * amount));
        return 0xff000000 | (r << 16) | (g << 8) | bl;
    }

    private static int colorDiff(int a, int b) {
        return (Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) +
                Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) +
                Math.abs((a & 255) - (b & 255))) / 3;
    }

    private static int luma(int c) {
        return (77 * ((c >> 16) & 255) + 150 * ((c >> 8) & 255) + 29 * (c & 255)) >> 8;
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(255, v));
    }
}
