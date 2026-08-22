package com.denko.eufymonitor;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;

import org.tensorflow.lite.DataType;
import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.Tensor;

import java.io.FileInputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;

/**
 * Real-ESRGAN-General-x4v3 inference that runs completely on-device.
 * Uses overlapping 128px tiles and discards half of the overlap on each
 * interior tile edge to keep seams out of the visible result.
 */
final class RealEsrganEngine implements AutoCloseable {
    private static final int MAX_INPUT_LONG_EDGE = 448;
    private static final int OVERLAP = 16;

    private final Interpreter interpreter;
    private final Tensor inputTensor;
    private final Tensor outputTensor;
    private final int inW, inH, outW, outH;
    private final int scaleX, scaleY;

    RealEsrganEngine(Context context) throws Exception {
        MappedByteBuffer model = loadModel(context, "real_esrgan_x4v3.tflite");
        Interpreter.Options options = new Interpreter.Options();
        options.setNumThreads(6);
        options.setUseXNNPACK(true);
        interpreter = new Interpreter(model, options);
        inputTensor = interpreter.getInputTensor(0);
        outputTensor = interpreter.getOutputTensor(0);
        int[] in = inputTensor.shape();
        int[] out = outputTensor.shape();
        if (in.length != 4 || out.length != 4 || in[3] != 3 || out[3] != 3) {
            throw new IllegalStateException("Real-ESRGAN Modellform wird nicht unterstützt");
        }
        inH = in[1];
        inW = in[2];
        outH = out[1];
        outW = out[2];
        if (inW < 32 || inH < 32 || outW <= inW || outH <= inH) {
            throw new IllegalStateException("Ungültiges Real-ESRGAN Modell");
        }
        scaleX = outW / inW;
        scaleY = outH / inH;
    }

    Bitmap enhance(Bitmap source) {
        if (source == null) return null;
        Bitmap work = FastEnhancer.fitForAi(source, MAX_INPUT_LONG_EDGE);
        int w = work.getWidth();
        int h = work.getHeight();
        int strideX = Math.max(1, inW - OVERLAP);
        int strideY = Math.max(1, inH - OVERLAP);
        int tilesX = w <= inW ? 1 : 1 + (int) Math.ceil((w - inW) / (double) strideX);
        int tilesY = h <= inH ? 1 : 1 + (int) Math.ceil((h - inH) / (double) strideY);
        int paddedW = inW + (tilesX - 1) * strideX;
        int paddedH = inH + (tilesY - 1) * strideY;
        int canvasW = paddedW * scaleX;
        int canvasH = paddedH * scaleY;
        int[] canvas = new int[canvasW * canvasH];
        int[] src = new int[w * h];
        work.getPixels(src, 0, w, 0, 0, w, h);

        int cropX = (OVERLAP * scaleX) / 2;
        int cropY = (OVERLAP * scaleY) / 2;

        for (int ty = 0; ty < tilesY; ty++) {
            for (int tx = 0; tx < tilesX; tx++) {
                int sx = tx * strideX;
                int sy = ty * strideY;
                ByteBuffer input = buildInput(src, w, h, sx, sy);
                ByteBuffer output = ByteBuffer.allocateDirect(outputTensor.numBytes()).order(ByteOrder.nativeOrder());
                interpreter.run(input, output);
                output.rewind();
                int[] tile = readOutput(output);

                int left = tx == 0 ? 0 : cropX;
                int top = ty == 0 ? 0 : cropY;
                int right = tx == tilesX - 1 ? outW : outW - cropX;
                int bottom = ty == tilesY - 1 ? outH : outH - cropY;
                int dx = sx * scaleX + left;
                int dy = sy * scaleY + top;
                int copyW = right - left;
                for (int y = top; y < bottom; y++) {
                    int srcPos = y * outW + left;
                    int dstPos = (dy + y - top) * canvasW + dx;
                    System.arraycopy(tile, srcPos, canvas, dstPos, copyW);
                }
            }
        }

        Bitmap full = Bitmap.createBitmap(canvasW, canvasH, Bitmap.Config.ARGB_8888);
        full.setPixels(canvas, 0, canvasW, 0, 0, canvasW, canvasH);
        int wantedW = Math.min(canvasW, w * scaleX);
        int wantedH = Math.min(canvasH, h * scaleY);
        Bitmap cropped = Bitmap.createBitmap(full, 0, 0, wantedW, wantedH);
        if (cropped != full) full.recycle();
        if (work != source) work.recycle();
        return cropped;
    }

    private ByteBuffer buildInput(int[] pixels, int width, int height, int startX, int startY) {
        ByteBuffer b = ByteBuffer.allocateDirect(inputTensor.numBytes()).order(ByteOrder.nativeOrder());
        DataType type = inputTensor.dataType();
        Tensor.QuantizationParams qp = inputTensor.quantizationParams();
        for (int y = 0; y < inH; y++) {
            int py = Math.min(height - 1, startY + y);
            for (int x = 0; x < inW; x++) {
                int px = Math.min(width - 1, startX + x);
                int c = pixels[py * width + px];
                putValue(b, type, ((c >> 16) & 255) / 255f, qp);
                putValue(b, type, ((c >> 8) & 255) / 255f, qp);
                putValue(b, type, (c & 255) / 255f, qp);
            }
        }
        b.rewind();
        return b;
    }

    private int[] readOutput(ByteBuffer b) {
        int[] out = new int[outW * outH];
        DataType type = outputTensor.dataType();
        Tensor.QuantizationParams qp = outputTensor.quantizationParams();
        for (int i = 0; i < out.length; i++) {
            int r = toByte(readValue(b, type, qp));
            int g = toByte(readValue(b, type, qp));
            int bl = toByte(readValue(b, type, qp));
            out[i] = 0xff000000 | (r << 16) | (g << 8) | bl;
        }
        return out;
    }

    private static void putValue(ByteBuffer b, DataType type, float value, Tensor.QuantizationParams qp) {
        if (type == DataType.FLOAT32) {
            b.putFloat(value);
        } else if (type == DataType.UINT8) {
            int q = Math.round(value / qp.getScale()) + qp.getZeroPoint();
            b.put((byte) Math.max(0, Math.min(255, q)));
        } else if (type == DataType.INT8) {
            int q = Math.round(value / qp.getScale()) + qp.getZeroPoint();
            b.put((byte) Math.max(-128, Math.min(127, q)));
        } else {
            throw new IllegalStateException("Nicht unterstützter AI-Datentyp: " + type);
        }
    }

    private static float readValue(ByteBuffer b, DataType type, Tensor.QuantizationParams qp) {
        if (type == DataType.FLOAT32) return b.getFloat();
        if (type == DataType.UINT8) return ((b.get() & 255) - qp.getZeroPoint()) * qp.getScale();
        if (type == DataType.INT8) return (b.get() - qp.getZeroPoint()) * qp.getScale();
        throw new IllegalStateException("Nicht unterstützter AI-Datentyp: " + type);
    }

    private static int toByte(float f) {
        return Math.max(0, Math.min(255, Math.round(f * 255f)));
    }

    private static MappedByteBuffer loadModel(Context context, String assetName) throws Exception {
        try (AssetFileDescriptor fd = context.getAssets().openFd(assetName);
             FileInputStream input = new FileInputStream(fd.getFileDescriptor())) {
            return input.getChannel().map(FileChannel.MapMode.READ_ONLY, fd.getStartOffset(), fd.getDeclaredLength());
        }
    }

    @Override
    public void close() {
        interpreter.close();
    }
}
