package com.denko.eufymonitor;

import android.media.MediaCodec;
import android.media.MediaFormat;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;

import java.nio.ByteBuffer;

final class VideoDecoder implements SurfaceHolder.Callback {
    interface Listener { void onMessage(String message); }

    private final SurfaceView view;
    private final Listener listener;
    private MediaCodec codec;
    private Surface surface;
    private int codecId = 0;
    private int width = 1920;
    private int height = 1080;
    private int fps = 15;
    private boolean haveMetadata = false;
    private long ptsUs = 0;

    VideoDecoder(SurfaceView view, Listener listener) {
        this.view = view;
        this.listener = listener;
        this.surface = view.getHolder().getSurface();
        view.getHolder().addCallback(this);
    }

    synchronized void configure(int codecId, int width, int height, int fps) {
        this.codecId = codecId;
        this.width = Math.max(16, width);
        this.height = Math.max(16, height);
        this.fps = Math.max(1, fps);
        this.haveMetadata = true;
        startCodec();
    }

    private void startCodec() {
        stopCodec();
        if (!haveMetadata || surface == null || !surface.isValid()) return;
        try {
            String mime = codecId == 1 ? MediaFormat.MIMETYPE_VIDEO_HEVC : MediaFormat.MIMETYPE_VIDEO_AVC;
            MediaFormat format = MediaFormat.createVideoFormat(mime, width, height);
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, Math.max(2 * 1024 * 1024, width * height));
            format.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
            if (android.os.Build.VERSION.SDK_INT >= 30) format.setInteger("low-latency", 1);
            codec = MediaCodec.createDecoderByType(mime);
            codec.configure(format, surface, null, 0);
            codec.start();
            ptsUs = 0;
        } catch (Exception e) {
            stopCodec();
            if (listener != null) listener.onMessage("Decoder: " + e.getMessage());
        }
    }

    synchronized void offer(byte[] data) {
        if (data == null || data.length == 0 || codec == null) return;
        try {
            int inIndex = codec.dequeueInputBuffer(10_000);
            if (inIndex >= 0) {
                ByteBuffer in = codec.getInputBuffer(inIndex);
                if (in != null) {
                    in.clear();
                    if (data.length <= in.remaining()) {
                        in.put(data);
                        ptsUs += 1_000_000L / fps;
                        codec.queueInputBuffer(inIndex, 0, data.length, ptsUs, 0);
                    } else {
                        codec.queueInputBuffer(inIndex, 0, 0, ptsUs, 0);
                        if (listener != null) listener.onMessage("Videopaket zu groß – warte auf nächstes Bild");
                    }
                }
            }
            drain();
        } catch (Exception e) {
            if (listener != null) listener.onMessage("Decoder wird neu gestartet …");
            startCodec();
        }
    }

    private void drain() {
        if (codec == null) return;
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (true) {
            int out = codec.dequeueOutputBuffer(info, 0);
            if (out >= 0) {
                codec.releaseOutputBuffer(out, true);
            } else if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED || out == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) {
                continue;
            } else {
                break;
            }
        }
    }

    private void stopCodec() {
        if (codec != null) {
            try { codec.stop(); } catch (Exception ignored) {}
            try { codec.release(); } catch (Exception ignored) {}
            codec = null;
        }
    }

    synchronized void close() {
        stopCodec();
        view.getHolder().removeCallback(this);
    }

    @Override public synchronized void surfaceCreated(SurfaceHolder holder) {
        surface = holder.getSurface();
        if (haveMetadata) startCodec();
    }

    @Override public synchronized void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        surface = holder.getSurface();
    }

    @Override public synchronized void surfaceDestroyed(SurfaceHolder holder) {
        stopCodec();
        surface = null;
    }
}
