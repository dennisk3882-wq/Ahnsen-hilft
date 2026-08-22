package com.denko.eufymonitor;

import android.graphics.Bitmap;

import java.util.List;

/**
 * Local image enhancement helpers. No image data leaves the device.
 * Realtime mode uses temporal denoise + an edge preserving unsharp pass.
 */
final class FastEnhancer {
    private FastEnhancer() {}

    static Bitmap enhance(Bitmap current, Bitmap previous, float strength) {
        if (current == null) return null;
        Bitmap src = current.getConfig() == Bitmap.Config.ARGB_8888
                ? current.copy(Bitmap.Config.ARGB_8888, true)
                : current.copy(Bitmap.Config.ARGB_8888, true);
        int w = src.getWidth();
        int h = src.getHeight();
        int[] p = new int[w * h];
        src.getPixels(p, 0, w, 0, 0, w, h);

        if (previous != null && previous.getWidth() == w && previous.getHeight() == h) {
            int[] q = new int[w * h];
            previous.getPixels(q, 0, w, 0, 0, w, h);
            // Temporal denoise: retain most of the newest frame to avoid ghosting.
            for (int i = 0; i < p.length; i++) {
                int a = p[i];
                int b = q[i];
                int r = (((a >> 16) & 255) * 3 + ((b >> 16) & 255)) >> 2;
                int g = (((a >> 8) & 255) * 3 + ((b >> 8) & 255)) >> 2;
                int bl = ((a & 255) * 3 + (b & 255)) >> 2;
                p[i] = 0xff000000 | (r << 16) | (g << 8) | bl;
            }
        }

        int[] out = p.clone();
        float s = Math.max(0.15f, Math.min(1.6f, strength));
        for (int y = 1; y < h - 1; y++) {
            int row = y * w;
            for (int x = 1; x < w - 1; x++) {
                int i = row + x;
                int c = p[i];
                int l = p[i - 1];
                int r = p[i + 1];
                int u = p[i - w];
                int d = p[i + w];

                int cr = (c >> 16) & 255, cg = (c >> 8) & 255, cb = c & 255;
                int br = (((l >> 16) & 255) + ((r >> 16) & 255) + ((u >> 16) & 255) + ((d >> 16) & 255)) >> 2;
                int bg = (((l >> 8) & 255) + ((r >> 8) & 255) + ((u >> 8) & 255) + ((d >> 8) & 255)) >> 2;
                int bb = ((l & 255) + (r & 255) + (u & 255) + (d & 255)) >> 2;

                // Unsharp mask with a small local-contrast lift.
                int nr = clamp(Math.round(cr + (cr - br) * s));
                int ng = clamp(Math.round(cg + (cg - bg) * s));
                int nb = clamp(Math.round(cb + (cb - bb) * s));
                out[i] = 0xff000000 | (nr << 16) | (ng << 8) | nb;
            }
        }
        Bitmap result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        result.setPixels(out, 0, w, 0, 0, w, h);
        src.recycle();
        return result;
    }

    static Bitmap average(List<Bitmap> frames) {
        if (frames == null || frames.isEmpty()) return null;
        Bitmap first = frames.get(0);
        int w = first.getWidth(), h = first.getHeight(), n = frames.size();
        long[] rr = new long[w * h];
        long[] gg = new long[w * h];
        long[] bb = new long[w * h];
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
        }
        for (int i = 0; i < px.length; i++) {
            int r = (int) (rr[i] / n), g = (int) (gg[i] / n), b = (int) (bb[i] / n);
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
        int cw = Math.max(32, Math.round(w / s));
        int ch = Math.max(32, Math.round(h / s));
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
        int targetW;
        int targetH;
        if (aspect >= 1.6f) {
            targetW = 3840;
            targetH = Math.min(2160, Math.round(targetW / aspect));
        } else {
            targetH = 2160;
            targetW = Math.min(3840, Math.round(targetH * aspect));
        }
        targetW = Math.max(64, targetW);
        targetH = Math.max(64, targetH);
        return Bitmap.createScaledBitmap(source, targetW, targetH, true);
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(255, v));
    }
}
