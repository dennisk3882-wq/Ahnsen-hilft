package com.denko.eufymonitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Smart dashboard for device controls, Eufy events and local AI rules. */
public class SmartCenterActivity extends Activity {
    private static final String CONTROL = "http://127.0.0.1:8787";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newCachedThreadPool();
    private LinearLayout content;
    private String selectedSn = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        showOverview();
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xff091019);
        root.setPadding(dp(14), dp(10), dp(14), dp(10));

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = label("Eufy Smart Security Center", 22, true);
        TextView sub = label("lokal · HomeBase · AI", 13, false);
        sub.setTextColor(0xff93a4b8);
        LinearLayout titleBox = new LinearLayout(this);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        titleBox.addView(title);
        titleBox.addView(sub);
        head.addView(titleBox, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button back = button("← Live");
        back.setOnClickListener(v -> finish());
        head.addView(back, new LinearLayout.LayoutParams(dp(110), dp(48)));
        root.addView(head);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setPadding(0, dp(8), 0, dp(8));
        addTab(tabs, "Übersicht", v -> showOverview());
        addTab(tabs, "Ereignisse", v -> showEvents());
        addTab(tabs, "Eufy Einstellungen", v -> showSettings());
        addTab(tabs, "Smart Regeln", v -> showRules());
        addTab(tabs, "System", v -> showSystem());
        root.addView(tabs);

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(4), 0, dp(24));
        scroll.addView(content, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void addTab(LinearLayout row, String text, View.OnClickListener listener) {
        Button b = button(text);
        b.setOnClickListener(listener);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(46), 1f);
        p.setMargins(dp(3), 0, dp(3), 0);
        row.addView(b, p);
    }

    private void showOverview() {
        loading("Lade Systemübersicht …");
        io.execute(() -> {
            try {
                JSONObject o = request("GET", "/smart/overview", null);
                ui.post(() -> renderOverview(o));
            } catch (Exception e) {
                ui.post(() -> error("Übersicht", e));
            }
        });
    }

    private void renderOverview(JSONObject o) {
        content.removeAllViews();
        addSectionTitle("Systemstatus");
        addInfo("Verbindung", o.optString("phase", "unbekannt"), o.optString("message", ""));
        addInfo("Lokaler Stream", o.optBoolean("live", false) ? "AKTIV" : "bereit", "Video bleibt im lokalen P2P-Weg");
        addInfo("Smart Vision", "AKTIV", "Objekterkennung, Tracking, Loitering, Priorität und AI-Ereignisse laufen lokal auf dem Tablet");

        JSONArray devices = o.optJSONArray("devices");
        addSectionTitle("Geräte");
        if (devices == null || devices.length() == 0) {
            addInfo("Keine Geräte", "—", "Bitte zuerst im Live-Bild mit Eufy verbinden.");
        } else {
            for (int i = 0; i < devices.length(); i++) {
                JSONObject d = devices.optJSONObject(i);
                if (d == null) continue;
                if (selectedSn.isEmpty()) selectedSn = d.optString("sn", "");
                String detail = "Modell " + d.optString("model", "?") + " · HomeBase " + d.optString("stationSn", "?");
                String health = d.optString("health", "online");
                addInfo(d.optString("name", "Kamera"), health, detail);
            }
        }

        addSectionTitle("Intelligenz");
        JSONObject stats = o.optJSONObject("stats");
        addInfo("Eufy Ereignisse", stats == null ? "0" : String.valueOf(stats.optInt("eufyEvents")), "Bewegung, Klingeln, Person, Tier, Fahrzeug, Paket und weitere unterstützte Events");
        addInfo("Lokale AI Ereignisse", stats == null ? "0" : String.valueOf(stats.optInt("aiEvents")), "Zusätzliche Erkennung unabhängig von Eufys eigener Klassifizierung");
        addInfo("Gerätesteuerung", "DYNAMISCH", "Die App liest die tatsächlich von deinem Gerät freigegebenen Eufy-Eigenschaften und kann schreibbare Einstellungen ändern.");

        addSectionTitle("Was gegenüber der Standard-App zusätzlich passiert");
        addBullet("Multi-Frame Ultra Detail + Real-ESRGAN/ESPCN Super-Resolution");
        addBullet("Person/Auto/Tier-Erkennung auf dem Tablet mit Objekt-Tracking");
        addBullet("20-Sekunden-Loitering-Erkennung und Prioritätsbewertung");
        addBullet("AUTO-Bildmodus kann bei wichtigen Objekten selbst aktiviert werden");
        addBullet("Original/AI-Vergleich und Qualitätsbewertung bleiben erhalten");
    }

    private void showEvents() {
        loading("Lade Ereignisse …");
        io.execute(() -> {
            try {
                JSONObject o = request("GET", "/events", null);
                ui.post(() -> renderEvents(o));
            } catch (Exception e) {
                ui.post(() -> error("Ereignisse", e));
            }
        });
    }

    private void renderEvents(JSONObject o) {
        content.removeAllViews();
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView t = label("Ereignis-Timeline", 20, true);
        header.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button clear = button("Leeren");
        clear.setOnClickListener(v -> io.execute(() -> {
            try { request("POST", "/events/clear", new JSONObject()); } catch (Exception ignored) {}
            ui.post(this::showEvents);
        }));
        header.addView(clear, new LinearLayout.LayoutParams(dp(100), dp(44)));
        content.addView(header);

        JSONArray a = o.optJSONArray("events");
        if (a == null || a.length() == 0) {
            addInfo("Noch keine Ereignisse", "—", "Neue Eufy- oder lokale AI-Erkennungen erscheinen hier automatisch.");
            return;
        }
        SimpleDateFormat fmt = new SimpleDateFormat("dd.MM. HH:mm:ss", Locale.GERMANY);
        for (int i = 0; i < a.length(); i++) {
            JSONObject e = a.optJSONObject(i);
            if (e == null) continue;
            String time = fmt.format(new Date(e.optLong("ts", System.currentTimeMillis())));
            String source = e.optString("source", "eufy");
            String type = e.optString("type", "event");
            String label = e.optString("label", e.optString("device", "Ereignis"));
            String details = e.optString("details", "");
            addInfo(time + " · " + label, source.toUpperCase(Locale.GERMANY), type + (details.isEmpty() ? "" : " · " + details));
        }
    }

    private void showSettings() {
        if (selectedSn.isEmpty()) {
            loading("Suche Kamera …");
            io.execute(() -> {
                try {
                    JSONObject o = request("GET", "/smart/overview", null);
                    JSONArray d = o.optJSONArray("devices");
                    if (d != null && d.length() > 0) selectedSn = d.optJSONObject(0).optString("sn", "");
                    ui.post(this::showSettings);
                } catch (Exception e) { ui.post(() -> error("Einstellungen", e)); }
            });
            return;
        }
        loading("Lade Eufy-Geräteeinstellungen …");
        io.execute(() -> {
            try {
                JSONObject o = request("GET", "/device/properties?sn=" + URLEncoder.encode(selectedSn, "UTF-8"), null);
                ui.post(() -> renderSettings(o));
            } catch (Exception e) {
                ui.post(() -> error("Einstellungen", e));
            }
        });
    }

    private void renderSettings(JSONObject o) {
        content.removeAllViews();
        addSectionTitle("Eufy Einstellungen · " + o.optString("name", selectedSn));
        TextView intro = label("Es werden nur Eigenschaften angezeigt, die dein konkretes Eufy-Gerät tatsächlich meldet. Schreibbare Werte können direkt geändert werden.", 13, false);
        intro.setTextColor(0xff9fb1c5);
        intro.setPadding(0, 0, 0, dp(8));
        content.addView(intro);

        JSONArray items = o.optJSONArray("items");
        if (items == null || items.length() == 0) {
            addInfo("Keine Eigenschaften", "—", "Die Eufy-Bibliothek hat für dieses Gerät keine dynamischen Properties geliefert.");
            return;
        }
        for (int i = 0; i < items.length(); i++) {
            JSONObject p = items.optJSONObject(i);
            if (p == null || !p.optBoolean("readable", true)) continue;
            renderProperty(p);
        }
    }

    private void renderProperty(JSONObject p) {
        LinearLayout card = card();
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout textBox = new LinearLayout(this);
        textBox.setOrientation(LinearLayout.VERTICAL);
        String title = p.optString("label", "");
        if (title.isEmpty()) title = prettyName(p.optString("name", "Eigenschaft"));
        TextView a = label(title, 15, true);
        TextView b = label("Wert: " + valueText(p.opt("value")) + " · " + p.optString("type", ""), 12, false);
        b.setTextColor(0xff9fb1c5);
        textBox.addView(a);
        textBox.addView(b);
        row.addView(textBox, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        if (p.optBoolean("writeable", false)) {
            Button edit = button("Ändern");
            edit.setOnClickListener(v -> editProperty(p));
            row.addView(edit, new LinearLayout.LayoutParams(dp(100), dp(42)));
        } else {
            TextView read = label("nur lesen", 11, false);
            read.setTextColor(0xff718198);
            row.addView(read);
        }
        card.addView(row);
        content.addView(card);
    }

    private void editProperty(JSONObject p) {
        String type = p.optString("type", "string");
        Object value = p.opt("value");
        if ("boolean".equals(type)) {
            boolean next = !(value instanceof Boolean && (Boolean) value);
            saveProperty(p.optString("name"), next);
            return;
        }

        final EditText input = new EditText(this);
        input.setText(value == null || value == JSONObject.NULL ? "" : String.valueOf(value));
        input.setSelectAllOnFocus(true);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(0xff8b98a8);
        input.setBackgroundColor(0xff1c2632);
        if ("number".equals(type)) input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED);
        else input.setInputType(InputType.TYPE_CLASS_TEXT);

        StringBuilder info = new StringBuilder();
        if (p.has("min") || p.has("max")) info.append("Bereich ").append(p.optString("min", "-")).append(" bis ").append(p.optString("max", "-"));
        JSONObject states = p.optJSONObject("states");
        if (states != null && states.length() > 0) info.append(info.length() > 0 ? "\n" : "").append("Zustände: ").append(states.toString());

        new AlertDialog.Builder(this)
                .setTitle(prettyName(p.optString("name", "Einstellung")))
                .setMessage(info.toString())
                .setView(input)
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Speichern", (d, w) -> {
                    String raw = input.getText().toString().trim();
                    Object next = raw;
                    if ("number".equals(type)) {
                        try { next = raw.contains(".") ? Double.parseDouble(raw) : Integer.parseInt(raw); }
                        catch (Exception e) { Toast.makeText(this, "Ungültige Zahl", Toast.LENGTH_SHORT).show(); return; }
                    }
                    saveProperty(p.optString("name"), next);
                }).show();
    }

    private void saveProperty(String name, Object value) {
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("sn", selectedSn).put("name", name).put("value", value);
                request("POST", "/device/property", body);
                ui.post(() -> {
                    Toast.makeText(this, "Einstellung gesendet", Toast.LENGTH_SHORT).show();
                    ui.postDelayed(this::showSettings, 650);
                });
            } catch (Exception e) {
                ui.post(() -> Toast.makeText(this, "Fehler: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private void showRules() {
        content.removeAllViews();
        addSectionTitle("Lokale Smart-Regeln");
        android.content.SharedPreferences sp = getSharedPreferences("smart_security", MODE_PRIVATE);
        addRuleToggle(sp, "vision_enabled", "Lokale Objekterkennung", "Personen, Fahrzeuge, Tiere und weitere Objekte direkt auf dem Tablet erkennen", true);
        addRuleToggle(sp, "auto_mode_on_detection", "Bei wichtigem Objekt AUTO-Bildmodus", "Schaltet bei Person/Fahrzeug automatisch auf den intelligenten AUTO-Modus der Bildverbesserung", true);
        addInfo("Loitering", "20 Sekunden", "Bleibt eine Person lange im Bild, wird ein eigenes lokales AI-Ereignis erzeugt.");
        addInfo("Tracking", "AKTIV", "Objekte erhalten Track-IDs; Aufenthaltsdauer und Priorität werden fortlaufend berechnet.");
        addInfo("Datenschutz", "LOKAL", "Frames für Smart Vision und Bildverbesserung werden nicht an einen eigenen Cloud-/Render-Server geschickt.");
    }

    private void addRuleToggle(android.content.SharedPreferences sp, String key, String title, String desc, boolean def) {
        LinearLayout c = card();
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout tb = new LinearLayout(this);
        tb.setOrientation(LinearLayout.VERTICAL);
        tb.addView(label(title, 15, true));
        TextView d = label(desc, 12, false);
        d.setTextColor(0xff9fb1c5);
        tb.addView(d);
        row.addView(tb, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button toggle = button(sp.getBoolean(key, def) ? "AN" : "AUS");
        toggle.setOnClickListener(v -> {
            boolean next = !sp.getBoolean(key, def);
            sp.edit().putBoolean(key, next).apply();
            toggle.setText(next ? "AN" : "AUS");
        });
        row.addView(toggle, new LinearLayout.LayoutParams(dp(90), dp(42)));
        c.addView(row);
        content.addView(c);
    }

    private void showSystem() {
        loading("Lade Systemdaten …");
        io.execute(() -> {
            try {
                JSONObject o = request("GET", "/capabilities", null);
                ui.post(() -> {
                    content.removeAllViews();
                    addSectionTitle("Funktionsabdeckung");
                    addInfo("Live/P2P", o.optBoolean("livestream", false) ? "JA" : "NEIN", "Lokaler Kamera-Livestream über HomeBase");
                    addInfo("Dynamische Eufy-Settings", o.optBoolean("deviceProperties", false) ? "JA" : "NEIN", "Motion, Audio, Qualität, Benachrichtigungen, Chime und weitere gerätespezifische Properties");
                    addInfo("Eufy Event-Bus", o.optBoolean("events", false) ? "JA" : "NEIN", "Ring, Motion, Person, Tier, Fahrzeug, Paket, Batterie und mehr");
                    addInfo("Lokale Smart Vision", "JA", "EfficientDet + Tracking + eigene Ereignislogik");
                    addInfo("Super Resolution", "JA", "ESPCN + Real-ESRGAN + Multi-Frame Ultra Detail");
                    addInfo("Eufy Cloud-Sonderfunktionen", "TEILWEISE", "Funktionen, die Eufy nicht über den verwendeten Client/API-Pfad freigibt, können nicht zuverlässig 1:1 nachgebaut werden.");
                });
            } catch (Exception e) { ui.post(() -> error("System", e)); }
        });
    }

    private void loading(String text) {
        content.removeAllViews();
        TextView t = label(text, 16, false);
        t.setTextColor(0xff9fb1c5);
        t.setPadding(dp(8), dp(30), dp(8), dp(8));
        content.addView(t);
    }

    private void error(String where, Exception e) {
        content.removeAllViews();
        addInfo(where + " nicht verfügbar", "FEHLER", e.getMessage() == null ? "Unbekannter Fehler" : e.getMessage());
    }

    private void addSectionTitle(String text) {
        TextView t = label(text, 19, true);
        t.setPadding(dp(4), dp(12), dp(4), dp(7));
        content.addView(t);
    }

    private void addInfo(String title, String value, String detail) {
        LinearLayout c = card();
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout tb = new LinearLayout(this);
        tb.setOrientation(LinearLayout.VERTICAL);
        tb.addView(label(title, 15, true));
        TextView d = label(detail, 12, false);
        d.setTextColor(0xff9fb1c5);
        tb.addView(d);
        row.addView(tb, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView v = label(value, 13, true);
        v.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        v.setTextColor(0xffdbe7f3);
        row.addView(v, new LinearLayout.LayoutParams(dp(180), ViewGroup.LayoutParams.WRAP_CONTENT));
        c.addView(row);
        content.addView(c);
    }

    private void addBullet(String text) {
        TextView t = label("• " + text, 14, false);
        t.setTextColor(0xffc9d5e2);
        t.setPadding(dp(12), dp(5), dp(8), dp(5));
        content.addView(t);
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(13), dp(10), dp(13), dp(10));
        c.setBackgroundColor(0xff17212d);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, dp(3), 0, dp(3));
        c.setLayoutParams(p);
        return c;
    }

    private TextView label(String text, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(sp);
        t.setTextColor(Color.WHITE);
        if (bold) t.setTypeface(null, android.graphics.Typeface.BOLD);
        return t;
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(12);
        return b;
    }

    private String prettyName(String name) {
        if (name == null) return "Einstellung";
        String s = name.replace("Device", "").replaceAll("([a-z])([A-Z])", "$1 $2");
        return s.trim().isEmpty() ? name : s.trim();
    }

    private String valueText(Object v) {
        if (v == null || v == JSONObject.NULL) return "—";
        String s = String.valueOf(v);
        return s.length() > 90 ? s.substring(0, 90) + "…" : s;
    }

    private JSONObject request(String method, String path, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(CONTROL + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(2500);
        c.setReadTimeout(15000);
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
                String line; while ((line = r.readLine()) != null) sb.append(line);
            }
        }
        c.disconnect();
        JSONObject result = sb.length() == 0 ? new JSONObject() : new JSONObject(sb.toString());
        if (code >= 400) throw new Exception(result.optString("error", "HTTP " + code));
        return result;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
