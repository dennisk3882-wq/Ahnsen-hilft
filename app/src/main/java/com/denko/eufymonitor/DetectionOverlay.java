package com.denko.eufymonitor;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/** Draws local AI recognition results over the camera SurfaceView. */
final class DetectionOverlay extends View {
    private final Paint boxPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final List<SmartVisionEngine.Result> detections = new ArrayList<>();
    private RectF target = new RectF();
    private String headline = "KI wartet auf Livebild";

    DetectionOverlay(Context context) {
        super(context);
        setClickable(false);
        setFocusable(false);
        boxPaint.setStyle(Paint.Style.STROKE);
        boxPaint.setStrokeWidth(dp(2.2f));
        boxPaint.setColor(0xff00e6a8);
        textPaint.setTextSize(dp(13f));
        textPaint.setColor(Color.WHITE);
        textPaint.setFakeBoldText(true);
        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(0xb8000000);
    }

    void setTarget(RectF rect) {
        target = rect == null ? new RectF() : new RectF(rect);
        invalidate();
    }

    void setResults(List<SmartVisionEngine.Result> list) {
        detections.clear();
        if (list != null) detections.addAll(list);
        if (detections.isEmpty()) {
            headline = "KI aktiv · keine relevanten Objekte";
        } else {
            SmartVisionEngine.Result best = detections.get(0);
            for (SmartVisionEngine.Result r : detections) if (r.priority > best.priority) best = r;
            headline = "KI: " + best.shortLabel() + " · Priorität " + best.priority;
        }
        invalidate();
    }

    void setHeadline(String text) {
        headline = text == null ? "" : text;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (target.width() <= 1f || target.height() <= 1f) return;

        float pad = dp(7f);
        float h = dp(29f);
        float w = Math.min(target.width() - dp(12f), textPaint.measureText(headline) + pad * 2f);
        RectF head = new RectF(target.left + dp(8f), target.top + dp(8f), target.left + dp(8f) + Math.max(dp(120f), w), target.top + dp(8f) + h);
        canvas.drawRoundRect(head, dp(5f), dp(5f), fillPaint);
        canvas.drawText(headline, head.left + pad, head.centerY() - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint);

        for (SmartVisionEngine.Result r : detections) {
            RectF n = r.normalizedBox;
            RectF b = new RectF(
                    target.left + n.left * target.width(),
                    target.top + n.top * target.height(),
                    target.left + n.right * target.width(),
                    target.top + n.bottom * target.height());
            boxPaint.setColor(r.priority >= 75 ? 0xffffb300 : 0xff00e6a8);
            canvas.drawRoundRect(b, dp(4f), dp(4f), boxPaint);

            String label = r.shortLabel() + " · #" + r.trackId + " · " + r.durationLabel();
            float tw = textPaint.measureText(label) + pad * 2f;
            float th = dp(25f);
            float top = Math.max(target.top, b.top - th);
            RectF tag = new RectF(b.left, top, Math.min(target.right, b.left + tw), top + th);
            canvas.drawRoundRect(tag, dp(4f), dp(4f), fillPaint);
            canvas.drawText(label, tag.left + pad, tag.centerY() - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint);
        }
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }
}
