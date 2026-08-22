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
 * On-device super-resolution. The bundled ESPCN model is executed locally;
 * camera images are never uploaded for enhancement.
 */
final class SuperResolutionEngine implements AutoCloseable {
    private final Interpreter interpreter;
    private final Tensor inputTensor;
    private final Tensor outputTensor;
    private final int inW, inH, outW, outH;
    private final boolean inputNhwc, outputNhwc;

    SuperResolutionEngine(Context context) throws Exception {
        MappedByteBuffer model = loadModel(context, "espcn_quant.tflite");
        Interpreter.Options options = new Interpreter.Options();
        options.setNumThreads(4);
        interpreter = new Interpreter(model, options);
        inputTensor = interpreter.getInputTensor(0);
        outputTensor = interpreter.getOutputTensor(0);
        int[] in = inputTensor.shape();
        int[] out = outputTensor.shape();
        if (in.length != 4 || out.length != 4) throw new IllegalStateException("Unerwartete AI-Modellform");
        inputNhwc = in[3] == 3;
        outputNhwc = out[3] == 3;
        inH = inputNhwc ? in[1] : in[2];
        inW = inputNhwc ? in[2] : in[3];
        outH = outputNhwc ? out[1] : out[2];
        outW = outputNhwc ? out[2] : out[3];
        if (inW <= 0 || inH <= 0 || outW <= inW || outH <= inH) {
            throw new IllegalStateException("AI-Modell unterstützt kein Super-Resolution-Scaling");
        }
    }

    Bitmap enhance(Bitmap source) {
        if (source == null) return null;
        Bitmap work = FastEnhancer.fitForAi(source, 512);
        int tilesX = (work.getWidth() + inW - 1) / inW;
        int tilesY = (work.getHeight() + inH - 1) / inH;
        int canvasW = tilesX * outW;
        int canvasH = tilesY * outH;
        int[] stitched = new int[canvasW * canvasH];
        int[] srcPixels = new int[work.getWidth() * work.getHeight()];
        work.getPixels(srcPixels, 0, work.getWidth(), 0, 0, work.getWidth(), work.getHeight());

        for (int ty = 0; ty < tilesY; ty++) {
            for (int tx = 0; tx < tilesX; tx++) {
                ByteBuffer input = buildInput(srcPixels, work.getWidth(), work.getHeight(), tx * inW, ty * inH);
                ByteBuffer output = ByteBuffer.allocateDirect(outputTensor.numBytes()).order(ByteOrder.nativeOrder());
                interpreter.run(input, output);
                output.rewind();
                writeOutput(output, stitched, canvasW, tx * outW, ty * outH);
            }
        }

        Bitmap full = Bitmap.createBitmap(canvasW, canvasH, Bitmap.Config.ARGB_8888);
        full.setPixels(stitched, 0, canvasW, 0, 0, canvasW, canvasH);
        float sx = outW / (float) inW;
        float sy = outH / (float) inH;
        int wantedW = Math.max(1, Math.round(work.getWidth() * sx));
        int wantedH = Math.max(1, Math.round(work.getHeight() * sy));
        Bitmap cropped = Bitmap.createBitmap(full, 0, 0, Math.min(wantedW, full.getWidth()), Math.min(wantedH, full.getHeight()));
        if (cropped != full) full.recycle();
        if (work != source) work.recycle();
        return cropped;
    }

    private ByteBuffer buildInput(int[] pixels, int width, int height, int startX, int startY) {
        ByteBuffer b = ByteBuffer.allocateDirect(inputTensor.numBytes()).order(ByteOrder.nativeOrder());
        DataType type = inputTensor.dataType();
        Tensor.QuantizationParams qp = inputTensor.quantizationParams();
        if (inputNhwc) {
            for (int y = 0; y < inH; y++) {
                int sy = Math.min(height - 1, startY + y);
                for (int x = 0; x < inW; x++) {
                    int sx = Math.min(width - 1, startX + x);
                    int c = pixels[sy * width + sx];
                    putValue(b, type, ((c >> 16) & 255) / 255f, qp);
                    putValue(b, type, ((c >> 8) & 255) / 255f, qp);
                    putValue(b, type, (c & 255) / 255f, qp);
                }
            }
        } else {
            for (int channel = 0; channel < 3; channel++) {
                for (int y = 0; y < inH; y++) {
                    int sy = Math.min(height - 1, startY + y);
                    for (int x = 0; x < inW; x++) {
                        int sx = Math.min(width - 1, startX + x);
                        int c = pixels[sy * width + sx];
                        int v = channel == 0 ? ((c >> 16) & 255) : channel == 1 ? ((c >> 8) & 255) : (c & 255);
                        putValue(b, type, v / 255f, qp);
                    }
                }
            }
        }
        b.rewind();
        return b;
    }

    private void writeOutput(ByteBuffer b, int[] target, int targetW, int dx, int dy) {
        DataType type = outputTensor.dataType();
        Tensor.QuantizationParams qp = outputTensor.quantizationParams();
        if (outputNhwc) {
            for (int y = 0; y < outH; y++) {
                for (int x = 0; x < outW; x++) {
                    int r = toByte(readValue(b, type, qp));
                    int g = toByte(readValue(b, type, qp));
                    int bl = toByte(readValue(b, type, qp));
                    target[(dy + y) * targetW + dx + x] = 0xff000000 | (r << 16) | (g << 8) | bl;
                }
            }
        } else {
            float[][] channels = new float[3][outW * outH];
            for (int c = 0; c < 3; c++) {
                for (int i = 0; i < outW * outH; i++) channels[c][i] = readValue(b, type, qp);
            }
            for (int y = 0; y < outH; y++) {
                for (int x = 0; x < outW; x++) {
                    int i = y * outW + x;
                    int r = toByte(channels[0][i]), g = toByte(channels[1][i]), bl = toByte(channels[2][i]);
                    target[(dy + y) * targetW + dx + x] = 0xff000000 | (r << 16) | (g << 8) | bl;
                }
            }
        }
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
            FileChannel channel = input.getChannel();
            return channel.map(FileChannel.MapMode.READ_ONLY, fd.getStartOffset(), fd.getDeclaredLength());
        }
    }

    @Override
    public void close() {
        interpreter.close();
    }
}
