package de.ahnsen.spd;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.*;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.view.*;
import android.widget.*;
import android.text.InputType;
import android.graphics.drawable.GradientDrawable;
import android.util.Base64;
import org.json.*;
import java.util.*;
import java.io.*;
import java.time.*;
import java.time.format.DateTimeFormatter;

public class MainActivity extends Activity {
  final String[] names={"Matthias Hinse","Ole Grimmig","Dennis Koch","Thorben Hartmann","Frank Struckmeier"};
  final int RED=Color.rgb(198,23,41), DARK=Color.rgb(29,39,56), MUTED=Color.rgb(99,113,132);
  LinearLayout root, page; EditText place, agendaField, notesField, decisionsField; TextView dateText, startText, endText; TextView[] memberInfo=new TextView[5];
  CheckBox[] presentChecks=new CheckBox[5]; JSONObject session; String section="home"; boolean loading=false, suppressDraft=false, sending=false, archiveReadOnly=false;
  android.content.SharedPreferences prefs;
  DataVault vault;
  ExtraScreens extras;
  ExportCoordinator exportCoordinator;
  SecurityGate securityGate;
  static final String DEFAULT_EMAIL_SUBJECT="SPD Ahnsen – Anwesenheitsliste zur {sitzungsart} vom {datum}";
  static final String DEFAULT_EMAIL_BODY="Hallo zusammen,\n\nanbei übersende ich die Anwesenheitsliste der {sitzungsart} vom {datum} aus dem {ort}.\n\nBeginn: {beginn} Uhr\nEnde: {ende} Uhr\nAnwesende SPD-Fraktionsmitglieder: {anzahl} von 5\n\nMit freundlichen Grüßen\nSPD-Fraktion Ahnsen";

  @Override public void onCreate(Bundle b) {
    super.onCreate(b);getWindow().setStatusBarColor(RED);getWindow().setNavigationBarColor(Color.rgb(40,40,40));
    prefs=getSharedPreferences("spd_ahnsen_v2",MODE_PRIVATE);
    vault=new DataVault(this);
    exportCoordinator=new ExportCoordinator(this);
    extras=new ExtraScreens(this);
    securityGate=new SecurityGate(this);
    securityGate.startup();
  }
  int dp(float n){return (int)(getResources().getDisplayMetrics().density*n+.5f);}
  GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
  LinearLayout column(){LinearLayout x=new LinearLayout(this);x.setOrientation(1);return x;}
  TextView text(String value,int size,int color,boolean bold){TextView x=new TextView(this);x.setText(value);x.setTextSize(size);x.setTextColor(color);if(bold)x.setTypeface(null,1);return x;}
  void gap(LinearLayout l,int h){View v=new View(this);l.addView(v,new LinearLayout.LayoutParams(1,dp(h)));}
  void title(String t){TextView v=text(t,27,DARK,true);page.addView(v);gap(page,8);}
  void label(String t){TextView v=text(t,13,MUTED,true);page.addView(v);gap(page,5);}
  void addButton(String caption,Runnable action,boolean primary){
    TextView b=text(caption,15,primary?Color.WHITE:RED,true);
    b.setGravity(Gravity.CENTER);b.setMinHeight(dp(51));
    b.setPadding(dp(14),dp(15),dp(14),dp(15));
    b.setBackground(bg(primary?RED:Color.rgb(253,236,239),14));
    b.setElevation(dp(1.3f));
    page.addView(b,new LinearLayout.LayoutParams(-1,-2));b.setOnClickListener(v->action.run());gap(page,10);
  }
  void init(String screen){
    section=screen;root=column();root.setBackgroundColor(Color.rgb(246,248,252));setContentView(root);
    LinearLayout bar=column();
    bar.setPadding(dp(22),dp(14),dp(19),dp(17));
    android.graphics.drawable.GradientDrawable gradient=new android.graphics.drawable.GradientDrawable(
      android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
      new int[]{Color.rgb(143,14,30),RED,Color.rgb(223,50,65)});
    bar.setBackground(gradient);
    TextView upper=text("SPD  ·  GEMEINDE AHNSEN",11,Color.rgb(255,218,224),true);
    upper.setLetterSpacing(.12f);bar.addView(upper);
    gap(bar,5);
    bar.addView(text("Fraktionsverwaltung",23,Color.WHITE,true));
    root.addView(bar,new LinearLayout.LayoutParams(-1,-2));
    ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
    root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
    page=column();page.setPadding(dp(18),dp(20),dp(18),dp(30));scroll.addView(page);
    if(!screen.equals("locked"))bottomNavigation();
  }
  void bottomNavigation(){
    LinearLayout nav=new LinearLayout(this);nav.setGravity(Gravity.CENTER);
    nav.setPadding(dp(2),dp(8),dp(2),dp(8));nav.setBackgroundColor(Color.WHITE);
    String[] choices={"START","SITZUNGEN","TERMINE","BESCHLÜSSE","MEHR"};
    Runnable[] actions={this::showHome,this::archive,()->extras.agenda(),()->extras.decisions(),this::showMore};
    for(int i=0;i<choices.length;i++){
      final int j=i;TextView item=text(choices[i],10,
        (i==0&&section.equals("home"))?RED:MUTED,true);
      item.setGravity(Gravity.CENTER);item.setPadding(dp(2),dp(9),dp(2),dp(9));
      nav.addView(item,new LinearLayout.LayoutParams(0,-2,1));
      item.setOnClickListener(v->actions[j].run());
    }
    root.addView(nav,new LinearLayout.LayoutParams(-1,-2));
  }
  void showMore(){
    suppressDraft=true;init("more");title("Weitere Bereiche");
    page.addView(text("Organisation, Auswertungen und sichere Datenverwaltung",14,MUTED,false));
    gap(page,21);
    addButton("Mitglieder verwalten",()->extras.people(),true);
    addButton("Teilnahme und Statistik",()->extras.statistics(),false);
    addButton("E-Mail & PDF-Vorlagen",this::showSettings,false);
    addButton("Sicherheit und Datensicherung",this::showDataSettings,false);
  }
  void infoPanel(String titleText,String detail){
    LinearLayout card=column();card.setPadding(dp(17),dp(16),dp(17),dp(16));
    card.setBackground(bg(Color.WHITE,15));card.setElevation(dp(1.4f));
    card.addView(text(titleText,17,DARK,true));gap(card,5);
    card.addView(text(detail,13,MUTED,false));page.addView(card);gap(page,13);
  }
  JSONObject newSession(String type) {
    JSONObject s=new JSONObject();try {
      s.put("id",String.valueOf(System.currentTimeMillis()));s.put("type",type);
      s.put("date",LocalDate.now().toString());s.put("place","Ahnsen DGH");
      s.put("start","17:00");s.put("end","19:00");
      JSONArray a=new JSONArray();for(int i=0;i<5;i++)a.put(false);s.put("present",a);
      JSONArray sig=new JSONArray();for(int i=0;i<5;i++)sig.put("");s.put("signatures",sig);
    }catch(Exception e){}return s;
  }
  String val(String k,String def){return session==null?def:session.optString(k,def);}
  void set(String key,Object v){if(archiveReadOnly)return;try{session.put(key,v);}catch(Exception e){}if(!loading)draft();}
  void draft(){if(session!=null&&!suppressDraft&&!archiveReadOnly)prefs.edit().putString("draft",session.toString()).apply();}
  void clearDraft(){prefs.edit().remove("draft").apply();}
  void showHome() {
    archiveReadOnly=false;suppressDraft=true;
    init("home");gap(page,8);title("Sitzungen");page.addView(text("Anwesenheit, Unterschriften und PDF-Listen für den Gemeinderat Ahnsen.",15,MUTED,false));gap(page,28);
    addButton("Fraktionssitzung",()->startNew("normal"),true);
    addButton("Gemeinsame Fraktionssitzung",()->startNew("joint"),true);
    if(prefs.contains("draft"))addButton("Entwurf weiterbearbeiten",()->{try{session=new JSONObject(prefs.getString("draft","{}"));suppressDraft=false;edit();}catch(Exception e){toast("Entwurf konnte nicht geladen werden");}},false);
    addButton("Gespeicherte Sitzungen",this::archive,false);
    addButton("⚙  Einstellungen",this::showSettings,false);
    page.addView(text("Die Sitzungsdaten bleiben lokal. Beim direkten E-Mail-Versand wird die fertige PDF verschlüsselt an den Gmail-Mailserver übergeben.",12,MUTED,false));
  }
  String meetingTitle(){
    return val("type","normal").equals("joint")?"gemeinsamen Fraktionssitzung":"Fraktionssitzung";
  }
  int attendanceCount(){
    int count=0;JSONArray a=session==null?null:session.optJSONArray("present");
    if(a!=null)for(int i=0;i<5;i++)if(a.optBoolean(i,false))count++;
    return count;
  }
  String renderMailTemplate(String pattern){
    return pattern.replace("{sitzungsart}",meetingTitle()).replace("{datum}",showDate(val("date","")))
      .replace("{ort}",val("place","Ahnsen DGH")).replace("{beginn}",val("start",""))
      .replace("{ende}",val("end","")).replace("{anzahl}",String.valueOf(attendanceCount()));
  }
  EditText settingsInput(String value, boolean multi){
    EditText field=new EditText(this);field.setText(value);field.setTextSize(16);field.setTextColor(DARK);
    field.setBackground(bg(Color.WHITE,10));field.setPadding(dp(12),dp(13),dp(12),dp(13));
    if(multi){field.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
      field.setGravity(Gravity.TOP|Gravity.START);field.setMinLines(9);}
    else {field.setSingleLine(true);}
    page.addView(field,new LinearLayout.LayoutParams(-1,-2));gap(page,14);return field;
  }
  void showSettings(){
    suppressDraft=true;init("settings");
    addButton("‹ Zurück zu Sitzungen",this::showHome,false);title("Einstellungen");
    page.addView(text("Hier legst du einmalig fest, an welche Adresse die Anwesenheitsliste geschickt werden soll und wie die vorbereitete E-Mail aussieht.",14,MUTED,false));
    gap(page,22);
    label("Empfängeradresse");
    EditText recipient=settingsInput(prefs.getString("email_to",""),false);
    recipient.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    recipient.setHint("name@beispiel.de");
    label("Gmail-Absenderadresse (für Direktversand)");
    EditText sender=settingsInput(prefs.getString("gmail_sender",""),false);
    sender.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    sender.setHint("dein.name@gmail.com");
    label("Gmail-App-Passwort (nicht dein normales Passwort)");
    EditText appSecret=settingsInput("",false);
    appSecret.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
    appSecret.setHint(SecurePasswordStore.configured(prefs)?"Gespeichert – leer lassen zum Behalten":"16 Zeichen von Google eingeben");
    page.addView(text("Für den automatischen Versand ist einmalig ein Google-App-Passwort nötig. Voraussetzung: Bestätigung in zwei Schritten. Das Passwort wird nur auf diesem Handy verschlüsselt im Android Keystore gespeichert.",12,MUTED,false));
    gap(page,13);
    addButton("Google-App-Passwort einrichten",()->{
      Intent browser=new Intent(Intent.ACTION_VIEW,Uri.parse("https://myaccount.google.com/apppasswords"));
      startActivity(browser);
    },false);
    label("Standard-Betreff");
    EditText subject=settingsInput(prefs.getString("email_subject",DEFAULT_EMAIL_SUBJECT),false);
    label("Standard-Nachricht");
    EditText body=settingsInput(prefs.getString("email_body",DEFAULT_EMAIL_BODY),true);
    page.addView(text("Automatische Platzhalter: {sitzungsart}, {datum}, {ort}, {beginn}, {ende} und {anzahl}. Sie werden beim Versand mit den Sitzungsdaten ersetzt.",13,MUTED,false));
    gap(page,18);
    addButton("Einstellungen speichern",()->{
      String address=recipient.getText().toString().trim();
      if(!address.isEmpty()&&!android.util.Patterns.EMAIL_ADDRESS.matcher(address).matches()){
        recipient.setError("Bitte eine gültige E-Mail-Adresse eintragen");
        recipient.requestFocus();return;
      }
      String from=sender.getText().toString().trim();
      if(!from.isEmpty()&&!android.util.Patterns.EMAIL_ADDRESS.matcher(from).matches()){
        sender.setError("Bitte eine gültige Gmail-Absenderadresse eingeben");return;
      }
      String newPassword=appSecret.getText().toString().replace(" ","").trim();
      if(!newPassword.isEmpty()&&newPassword.length()!=16){
        appSecret.setError("Google-App-Passwörter haben 16 Zeichen");return;
      }
      if(!newPassword.isEmpty()&&from.isEmpty()){
        sender.setError("Bitte zuerst deine Gmail-Adresse eintragen");return;
      }
      String sub=subject.getText().toString().trim();
      String msg=body.getText().toString();
      if(sub.isEmpty()){subject.setError("Bitte einen Betreff eingeben");return;}
      if(msg.trim().isEmpty()){body.setError("Bitte einen Nachrichtentext eingeben");return;}
      try {
        if(!newPassword.isEmpty())SecurePasswordStore.save(prefs,newPassword);
      }catch(Exception ex){
        new AlertDialog.Builder(this).setTitle("Passwort nicht gespeichert")
          .setMessage("Der sichere Android-Keystore konnte das App-Passwort nicht speichern.").setPositiveButton("OK",null).show();
        return;
      }
      prefs.edit().putString("email_to",address).putString("gmail_sender",from)
        .putString("email_subject",sub).putString("email_body",msg).apply();
      toast("E-Mail-Einstellungen gespeichert");showHome();
    },true);
    addButton("Standardtext wiederherstellen",()->new AlertDialog.Builder(this)
      .setTitle("Standardtext wiederherstellen?")
      .setMessage("Betreff und Nachricht werden zurückgesetzt. Die Empfängeradresse bleibt erhalten.")
      .setNegativeButton("Abbrechen",null)
      .setPositiveButton("Wiederherstellen",(d,w)->{
        subject.setText(DEFAULT_EMAIL_SUBJECT);body.setText(DEFAULT_EMAIL_BODY);
      }).show(),false);
    addButton("App-Passwort löschen",()->new AlertDialog.Builder(this)
      .setTitle("Gespeichertes App-Passwort löschen?")
      .setMessage("Danach funktioniert der automatische Versand erst nach erneutem Einrichten.")
      .setNegativeButton("Abbrechen",null)
      .setPositiveButton("Löschen",(d,w)->{SecurePasswordStore.delete(prefs);appSecret.setText("");
        appSecret.setHint("16 Zeichen von Google eingeben");toast("App-Passwort lokal gelöscht");}).show(),false);
    page.addView(text("Direktversand: Die E-Mail wird nach Antippen des Buttons sofort über den Gmail-SMTP-Server versendet. Alternativ kannst du wie bisher Gmail zum manuellen Senden öffnen.",12,MUTED,false));
  }
  void startNew(String type){
    if(prefs.contains("draft")){
      new AlertDialog.Builder(this).setTitle("Ungespeicherter Entwurf")
       .setMessage("Neues Formular beginnen und bisherigen Entwurf verwerfen?")
       .setNegativeButton("Abbrechen",null).setPositiveButton("Neu beginnen",(d,w)->{session=newSession(type);suppressDraft=false;draft();edit();}).show();
    }else {session=newSession(type);suppressDraft=false;draft();edit();}
  }
  void archive() {
    suppressDraft=true;
    archiveReadOnly=false;
    init("archive");addButton("‹ Zurück",this::showHome,false);title("Gespeicherte Sitzungen");
    page.addView(text("Abgeschlossene Sitzungen sind schreibgeschützt. Du kannst sie ansehen und als PDF öffnen, aber nicht mehr bearbeiten.",14,MUTED,false));
    gap(page,16);
    JSONArray a=readArchive();if(a.length()==0){page.addView(text("Noch keine Sitzungen gespeichert.",15,MUTED,false));return;}
    for(int i=a.length()-1;i>=0;i--){JSONObject item=a.optJSONObject(i);if(item==null)continue;
      final String id=item.optString("id");String type=item.optString("type").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung";
      String sentLabel=item.optString("sentAt","").isEmpty()?"":" · ✓ Direkt versendet";
      addButton("Ansehen: "+type+"\n"+showDate(item.optString("date"))+" · "+item.optString("place")+sentLabel,()->showArchivedSession(id),false);
    }
  }
  void showArchivedSession(String id){
    JSONObject stored=findSession(id);
    if(stored==null){toast("Diese Sitzung wurde im Archiv nicht gefunden.");archive();return;}
    session=stored;
    archiveReadOnly=true;
    suppressDraft=true;
    init("archiveDetail");
    addButton("‹ Zum Sitzungsarchiv",this::archive,false);
    title("Gespeicherte Sitzung");
    TextView notice=text("ABGESCHLOSSEN  ·  NUR LESEN",13,RED,true);
    notice.setPadding(dp(12),dp(12),dp(12),dp(12));
    notice.setBackground(bg(Color.rgb(251,235,236),12));
    page.addView(notice);
    gap(page,18);
    page.addView(text(val("type","normal").equals("joint")?
      "Gemeinsame Fraktionssitzung":"Fraktionssitzung",20,DARK,true));
    gap(page,14);
    page.addView(text("Datum: "+showDate(val("date","")),16,DARK,false));gap(page,5);
    page.addView(text("Sitzungsort: "+val("place","Ahnsen DGH"),16,DARK,false));gap(page,5);
    page.addView(text("Beginn: "+val("start","")+" Uhr",16,DARK,false));gap(page,5);
    page.addView(text("Ende: "+val("end","")+" Uhr",16,DARK,false));gap(page,12);
    page.addView(text("Anwesende SPD-Mitglieder: "+attendanceCount()+" von 5",15,DARK,true));gap(page,18);
    JSONArray present=session.optJSONArray("present");
    JSONArray sigs=session.optJSONArray("signatures");
    for(int i=0;i<names.length;i++){
      if(present==null||!present.optBoolean(i,false))continue;
      LinearLayout card=column();
      card.setPadding(dp(14),dp(13),dp(14),dp(13));
      card.setBackground(bg(Color.WHITE,13));
      TextView name=text(names[i],16,DARK,true);card.addView(name);
      String encoded=sigs==null?"":sigs.optString(i,"");
      if(encoded.isEmpty()){
        gap(card,8);card.addView(text("Keine Unterschrift hinterlegt",13,MUTED,false));
      }else{
        try{
          byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
          Bitmap signature=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
          if(signature!=null){
            gap(card,8);
            ImageView image=new ImageView(this);
            image.setImageBitmap(signature);
            image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            image.setAdjustViewBounds(true);
            image.setBackground(bg(Color.rgb(250,250,250),8));
            card.addView(image,new LinearLayout.LayoutParams(-1,dp(95)));
          }
        }catch(Exception e){card.addView(text("Unterschrift vorhanden (Vorschau nicht verfügbar)",12,MUTED,false));}
      }
      page.addView(card);gap(page,10);
    }
    gap(page,16);
    addButton("Anwesenheitsliste als PDF öffnen",this::openPdf,true);
    page.addView(text("Die ursprünglichen Angaben und Unterschriften können hier nicht verändert werden.",13,MUTED,false));
  }
  JSONArray readArchive(){try{return new JSONArray(prefs.getString("archive","[]"));}catch(Exception e){return new JSONArray();}}
  JSONObject findSession(String id){JSONArray a=readArchive();for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null&&x.optString("id").equals(id))return x;}return null;}
  void saveSession(){if(session==null)return;
    suppressDraft=true;
    JSONArray a=readArchive();JSONArray out=new JSONArray();boolean found=false;
    for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null){if(x.optString("id").equals(val("id",""))){out.put(session);found=true;}else out.put(x);}}
    if(!found)out.put(session);
    prefs.edit().putString("archive",out.toString()).remove("draft").apply();
    toast("Sitzung gespeichert");
  }
  void edit(){
    if(archiveReadOnly){showArchivedSession(val("id",""));return;}
    suppressDraft=false;
    init("edit");loading=true;
    addButton("‹ Sitzungen",this::showHome,false);
    title(val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung");
    page.addView(text("Anwesenheitsliste der SPD-Fraktion",14,MUTED,false));gap(page,20);
    label("Datum");dateText=fieldText(showDate(val("date","")));
    dateText.setOnClickListener(v->{LocalDate now;try{now=LocalDate.parse(val("date",""));}catch(Exception e){now=LocalDate.now();}
      DatePickerDialog dlg=new DatePickerDialog(this,(picker,y,m,d)->{set("date",String.format(Locale.GERMANY,"%04d-%02d-%02d",y,m+1,d));dateText.setText(showDate(val("date","")));},now.getYear(),now.getMonthValue()-1,now.getDayOfMonth());dlg.show();});gap(page,12);
    label("Sitzungsort");place=new EditText(this);place.setText(val("place","Ahnsen DGH"));place.setSingleLine(true);place.setTextSize(17);place.setPadding(dp(13),dp(14),dp(13),dp(14));place.setBackground(bg(Color.WHITE,10));page.addView(place);place.setOnFocusChangeListener((v,focus)->{if(!focus)set("place",place.getText().toString());});gap(page,12);
    label("Beginn");startText=fieldText(val("start","17:00"));startText.setOnClickListener(v->pickTime("start",startText));gap(page,12);
    label("Ende");endText=fieldText(val("end","19:00"));endText.setOnClickListener(v->pickTime("end",endText));gap(page,22);
    page.addView(text("Anwesenheit und Unterschriften",19,DARK,true));gap(page,5);
    page.addView(text("Mitglied auswählen und danach auf „Unterschreiben“ tippen.",13,MUTED,false));gap(page,12);
    JSONArray pres=session.optJSONArray("present"),sigs=session.optJSONArray("signatures");
    for(int i=0;i<5;i++){final int j=i;
      LinearLayout card=column();card.setPadding(dp(14),dp(14),dp(14),dp(14));card.setBackground(bg(Color.WHITE,13));
      LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);card.addView(row);
      CheckBox cb=new CheckBox(this);cb.setText(names[i]);cb.setTextSize(16);cb.setTextColor(DARK);cb.setChecked(pres!=null&&pres.optBoolean(i,false));row.addView(cb,new LinearLayout.LayoutParams(0,-2,1));presentChecks[i]=cb;
      TextView status=text(sigs!=null&&!sigs.optString(i,"").isEmpty()?"✓":"",14,RED,true);row.addView(status);memberInfo[i]=status;
      TextView btn=text("Unterschreiben / ändern",14,RED,true);btn.setPadding(dp(6),dp(10),dp(6),dp(4));
      card.addView(btn);btn.setVisibility(cb.isChecked()?View.VISIBLE:View.GONE);
      btn.setOnClickListener(v->signatureDialog(j));
      cb.setOnCheckedChangeListener((button,checked)->{try{session.getJSONArray("present").put(j,checked);}catch(Exception e){}btn.setVisibility(checked?View.VISIBLE:View.GONE);draft();});
      page.addView(card);gap(page,9);
    }
    gap(page,18);
    addButton("Liste ansehen / PDF",()->{syncPlace();preview();},true);
    addButton("Sitzung speichern",()->{syncPlace();saveSession();showHome();},false);
    addButton("Speichern & sofort per E-Mail senden",this::sendDirect,true);
    addButton("Speichern & in Gmail öffnen",()->{syncPlace();saveSession();showHome();sharePdf();},false);
    page.addView(text("Direktversand: Die PDF wird sofort nach dem Tippen gesendet. Der manuelle Gmail-Versand bleibt als Alternative erhalten.",12,MUTED,false));
    loading=false;
  }
  void syncPlace(){if(place!=null)set("place",place.getText().toString().trim().isEmpty()?"Ahnsen DGH":place.getText().toString().trim());}
  TextView fieldText(String v){TextView t=text(v+"   ▾",17,DARK,false);t.setPadding(dp(13),dp(15),dp(13),dp(15));t.setBackground(bg(Color.WHITE,10));page.addView(t);return t;}
  void pickTime(String key,TextView target){String v=val(key,"17:00");int h=17,m=0;try{String[] p=v.split(":");h=Integer.parseInt(p[0]);m=Integer.parseInt(p[1]);}catch(Exception e){}
    new TimePickerDialog(this,(tp,hour,minute)->{String s=String.format(Locale.GERMANY,"%02d:%02d",hour,minute);set(key,s);target.setText(s+"   ▾");},h,m,true).show();}
  void signatureDialog(int i){
    LinearLayout wrap=column();wrap.setPadding(dp(12),dp(12),dp(12),dp(5));
    SignView pad=new SignView(this);wrap.addView(pad,new LinearLayout.LayoutParams(-1,dp(230)));
    TextView desc=text("Mit dem Finger im Feld unterschreiben.",13,MUTED,false);wrap.addView(desc);
    AlertDialog dialog=new AlertDialog.Builder(this).setTitle(names[i]).setView(wrap)
       .setNegativeButton("Abbrechen",null).setNeutralButton("Löschen",null)
       .setPositiveButton("Unterschrift übernehmen",null).create();
    dialog.setOnShowListener(v->{
      dialog.getButton(-3).setOnClickListener(w->pad.clear());
      dialog.getButton(-1).setOnClickListener(w->{
        if(!pad.drawn){toast("Bitte zuerst unterschreiben");return;}
        try{Bitmap b=pad.toBitmap();ByteArrayOutputStream bytes=new ByteArrayOutputStream();b.compress(Bitmap.CompressFormat.PNG,100,bytes);
          session.getJSONArray("signatures").put(i,Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP));
          draft();memberInfo[i].setText("✓");dialog.dismiss();toast("Unterschrift übernommen");
        }catch(Exception e){toast("Unterschrift konnte nicht gespeichert werden");}
      });
    });dialog.show();
  }
  class SignView extends View {
    Paint pen=new Paint(3),frame=new Paint(3);Path path=new Path();boolean drawn=false;
    SignView(Context c){super(c);pen.setColor(Color.BLACK);pen.setStrokeWidth(dp(2.8f));pen.setStrokeCap(Paint.Cap.ROUND);pen.setStrokeJoin(Paint.Join.ROUND);pen.setStyle(Paint.Style.STROKE);
      frame.setColor(Color.WHITE);}
    @Override protected void onDraw(Canvas c){c.drawColor(Color.WHITE);c.drawPath(path,pen);
      Paint border=new Paint(3);border.setColor(Color.rgb(220,225,230));border.setStyle(Paint.Style.STROKE);border.setStrokeWidth(dp(1));c.drawRect(1,1,getWidth()-1,getHeight()-1,border);}
    @Override public boolean onTouchEvent(android.view.MotionEvent e){float x=e.getX(),y=e.getY();switch(e.getActionMasked()){
      case MotionEvent.ACTION_DOWN:path.moveTo(x,y);invalidate();return true;
      case MotionEvent.ACTION_MOVE:path.lineTo(x,y);drawn=true;invalidate();return true;
      case MotionEvent.ACTION_UP:path.lineTo(x+.1f,y+.1f);drawn=true;invalidate();return true;
    }return true;}
    void clear(){path.reset();drawn=false;invalidate();}
    Bitmap toBitmap(){Bitmap b=Bitmap.createBitmap(Math.max(getWidth(),1),Math.max(getHeight(),1),Bitmap.Config.ARGB_8888);draw(new Canvas(b));return b;}
  }
  static String showDate(String iso){try{return LocalDate.parse(iso).format(DateTimeFormatter.ofPattern("dd.MM.yyyy",Locale.GERMANY));}catch(Exception e){return iso;}}
  void preview(){
    if(archiveReadOnly){showArchivedSession(val("id",""));return;}
    init("preview");addButton("‹ Weiter bearbeiten",this::edit,false);title("Anwesenheitsliste");
    page.addView(text(val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung",19,RED,true));gap(page,15);
    page.addView(text("Datum: "+showDate(val("date","")),16,DARK,false));
    page.addView(text("Ort: "+val("place","Ahnsen DGH"),16,DARK,false));
    page.addView(text("Beginn: "+val("start","")+"     Ende: "+val("end",""),16,DARK,false));gap(page,12);
    JSONArray a=session.optJSONArray("present"),sg=session.optJSONArray("signatures");
    for(int i=0;i<5;i++)if(a!=null&&a.optBoolean(i)) {page.addView(text("✓ "+names[i]+"   "+(sg!=null&&!sg.optString(i,"").isEmpty()?"(unterschrieben)":"(Unterschrift offen)"),15,DARK,false));gap(page,8);}
    gap(page,22);addButton("PDF erstellen / Öffnen",this::openPdf,true);
    addButton("Speichern & sofort per E-Mail senden",this::sendDirect,true);
    addButton("Speichern & in Gmail öffnen",()->{saveSession();showHome();sharePdf();},false);
  }
  File makePdf() throws Exception {
    PdfDocument pdf=new PdfDocument();PdfDocument.PageInfo info=new PdfDocument.PageInfo.Builder(595,842,1).create();PdfDocument.Page page=pdf.startPage(info);Canvas c=page.getCanvas();
    Paint p=new Paint(3);p.setColor(Color.WHITE);c.drawColor(Color.WHITE);
    p.setColor(RED);c.drawRect(0,0,595,16,p);
    draw(c,"SPD-FRAKTION  |  GEMEINDERAT AHNSEN",45,56,15,RED,true);
    draw(c,"ANWESENHEITSLISTE",45,117,26,DARK,true);
    draw(c,val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung",45,147,16,MUTED,false);
    p.setColor(Color.rgb(246,247,248));c.drawRoundRect(45,177,550,266,8,8,p);
    draw(c,"Datum",59,200,10,MUTED,true);draw(c,showDate(val("date","")),59,222,13,DARK,true);
    draw(c,"Sitzungsort",230,200,10,MUTED,true);draw(c,val("place","Ahnsen DGH"),230,222,13,DARK,true);
    draw(c,"Beginn",59,246,10,MUTED,true);draw(c,val("start",""),110,246,12,DARK,false);
    draw(c,"Ende",240,246,10,MUTED,true);draw(c,val("end",""),285,246,12,DARK,false);
    p.setColor(RED);c.drawRoundRect(45,290,550,330,5,5,p);
    draw(c,"Nr.",57,317,11,Color.WHITE,true);draw(c,"Vor- und Nachname",100,317,11,Color.WHITE,true);draw(c,"Unterschrift",340,317,11,Color.WHITE,true);
    JSONArray a=session.optJSONArray("present"),sg=session.optJSONArray("signatures");int count=0;
    for(int i=0;i<5;i++)if(a!=null&&a.optBoolean(i)){
      int y=330+count*70;p.setColor(count%2==0?Color.rgb(250,250,251):Color.WHITE);c.drawRect(45,y,550,y+70,p);
      p.setColor(Color.rgb(223,226,230));p.setStrokeWidth(0.7f);c.drawLine(45,y+70,550,y+70,p);
      draw(c,String.valueOf(++count),58,y+40,12,DARK,false);draw(c,names[i],100,y+40,13,DARK,true);
      String encoded=sg==null?"":sg.optString(i,"");if(!encoded.isEmpty())try{
        byte[] data=Base64.decode(encoded,Base64.DEFAULT);Bitmap bmp=BitmapFactory.decodeByteArray(data,0,data.length);
        if(bmp!=null){Rect src=new Rect(0,0,bmp.getWidth(),bmp.getHeight());Rect dst=new Rect(341,y+4,531,y+64);p.setColor(Color.WHITE);c.drawBitmap(bmp,src,dst,p);bmp.recycle();}
      }catch(Exception e){}
    }
    draw(c,"Anwesende SPD-Fraktionsmitglieder: "+count+" von 5",45,730,12,DARK,true);
    p.setColor(Color.rgb(226,229,232));c.drawLine(45,765,550,765,p);
    draw(c,"SPD-FRAKTION  ·  GEMEINDE AHNSEN",45,786,10,MUTED,true);
    draw(c,"Dokumentation der Teilnahme an der Fraktionssitzung",45,806,9,MUTED,false);
    pdf.finishPage(page);
    File dir=new File(getCacheDir(),"pdfs");if(!dir.exists())dir.mkdirs();
    File output=new File(dir,"SPD_Ahnsen_"+val("type","normal")+"_"+val("date",LocalDate.now().toString())+".pdf");
    try(FileOutputStream stream=new FileOutputStream(output)){pdf.writeTo(stream);}pdf.close();return output;
  }
  void draw(Canvas c,String s,int x,int y,int size,int color,boolean bold){Paint p=new Paint(3);p.setColor(color);p.setTextSize(size);p.setTypeface(bold?Typeface.create("sans-serif",Typeface.BOLD):Typeface.create("sans-serif",Typeface.NORMAL));c.drawText(s,x,y,p);}
  Uri uri(File file){return new Uri.Builder().scheme("content").authority("de.ahnsen.spd.v16.pdf").appendPath(file.getName()).build();}
  void openPdf(){try{File f=makePdf();Uri u=uri(f);Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(u,"application/pdf");intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("Anwesenheitsliste",u));startActivity(Intent.createChooser(intent,"PDF öffnen"));}catch(Exception e){toast("PDF konnte nicht geöffnet werden: "+e.getMessage());}}
  void sendDirect(){
    if(sending){toast("Ein E-Mail-Versand läuft bereits.");return;}
    String recipient=prefs.getString("email_to","").trim();
    String sender=prefs.getString("gmail_sender","").trim();
    if(recipient.isEmpty()||sender.isEmpty()||!SecurePasswordStore.configured(prefs)){
      new AlertDialog.Builder(this).setTitle("Direktversand noch nicht eingerichtet")
        .setMessage("Bitte trage unter Einstellungen den Empfänger, deine Gmail-Absenderadresse und ein Google-App-Passwort ein. Die bisherige Gmail-Funktion bleibt verfügbar.")
        .setNegativeButton("Abbrechen",null).setPositiveButton("Einstellungen öffnen",(d,w)->showSettings()).show();
      return;
    }
    if(!android.util.Patterns.EMAIL_ADDRESS.matcher(recipient).matches()||
       !android.util.Patterns.EMAIL_ADDRESS.matcher(sender).matches()){
      new AlertDialog.Builder(this).setTitle("Ungültige E-Mail-Adresse")
        .setMessage("Bitte die Absender- und Empfängeradresse in den Einstellungen prüfen.")
        .setPositiveButton("Einstellungen", (d,w)->showSettings()).setNegativeButton("Abbrechen",null).show();
      return;
    }
    final String password;
    try {password=SecurePasswordStore.load(prefs);if(password==null||password.isEmpty())throw new Exception("Missing credential");}
    catch(Exception e){
      new AlertDialog.Builder(this).setTitle("App-Passwort nicht verfügbar")
        .setMessage("Das verschlüsselte App-Passwort konnte nicht gelesen werden. Bitte hinterlege es in den Einstellungen erneut.")
        .setPositiveButton("Einstellungen", (d,w)->showSettings()).show();return;
    }
    if(section.equals("edit"))syncPlace();
    final File pdf;
    final String emailSubject=renderMailTemplate(prefs.getString("email_subject",DEFAULT_EMAIL_SUBJECT));
    final String emailBody=renderMailTemplate(prefs.getString("email_body",DEFAULT_EMAIL_BODY));
    try{pdf=makePdf();}
    catch(Exception e){toast("PDF konnte nicht erstellt werden – keine E-Mail versendet.");return;}
    saveSession();showHome();
    sending=true;
    final ProgressDialog progress=new ProgressDialog(this);
    progress.setTitle("E-Mail wird gesendet");
    progress.setMessage("Verschlüsselte Verbindung zum Gmail-Mailserver...");
    progress.setIndeterminate(true);progress.setCancelable(false);progress.show();
    new Thread(()->{
      try{
        GmailSmtpSender.send(sender,password,recipient,emailSubject,emailBody,pdf);
        runOnUiThread(()->{
          sending=false;progress.dismiss();
          try{session.put("sentAt",java.time.ZonedDateTime.now().toString());session.put("sentTo",recipient);}catch(Exception ignored){}
          saveSession();showHome();
          new AlertDialog.Builder(this).setTitle("E-Mail erfolgreich übergeben")
            .setMessage("Gmail hat die Nachricht mit PDF-Anhang an "+recipient+" zur Zustellung angenommen. Der tatsächliche Eingang beim Empfänger kann nicht garantiert werden.")
            .setPositiveButton("OK",null).show();
        });
      }catch(Exception ex){
        final boolean authFailure=ex instanceof javax.mail.AuthenticationFailedException;
        runOnUiThread(()->{
          sending=false;progress.dismiss();
          new AlertDialog.Builder(this).setTitle("Direktversand nicht bestätigt")
            .setMessage((authFailure?"Gmail hat die Anmeldung abgelehnt. Bitte Gmail-Adresse und Google-App-Passwort prüfen.":"Der Versand konnte nicht bestätigt werden. Bitte Internetverbindung und Gmail-Einstellungen prüfen. Vor einem erneuten Versuch den Postausgang kontrollieren, um doppelte Nachrichten zu vermeiden.")
              +"\\n\\nDie Sitzung wurde trotzdem im Archiv gespeichert.")
            .setNegativeButton("Schließen",null)
            .setPositiveButton("Manuell mit Gmail", (d,w)->sharePdf()).show();
        });
      }
    },"spd-gmail-sender").start();
  }
  void sharePdf(){try{
    File f=makePdf();Uri u=uri(f);
    Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("application/pdf");
    String to=prefs.getString("email_to","").trim();
    if(!to.isEmpty())intent.putExtra(Intent.EXTRA_EMAIL,new String[]{to});
    intent.putExtra(Intent.EXTRA_SUBJECT,renderMailTemplate(prefs.getString("email_subject",DEFAULT_EMAIL_SUBJECT)));
    intent.putExtra(Intent.EXTRA_TEXT,renderMailTemplate(prefs.getString("email_body",DEFAULT_EMAIL_BODY)));
    intent.putExtra(Intent.EXTRA_STREAM,u);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.setClipData(ClipData.newRawUri("Anwesenheitsliste",u));
    Intent gmail=new Intent(intent);gmail.setPackage("com.google.android.gm");
    try{startActivity(gmail);}catch(Exception e){startActivity(Intent.createChooser(intent,"PDF per E-Mail versenden"));}
  }catch(Exception e){toast("PDF-Versand nicht möglich: "+e.getMessage());}}
  void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
  @Override public void onBackPressed(){
    if(section.equals("archiveDetail"))archive();
    else if(section.equals("preview"))edit();
    else if(section.equals("edit")){syncPlace();showHome();}
    else showHome();
  }
}
