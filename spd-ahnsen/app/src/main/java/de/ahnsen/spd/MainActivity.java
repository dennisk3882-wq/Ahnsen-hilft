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
  static final String DEFAULT_EMAIL_BODY="Hallo zusammen,\n\nanbei übersende ich die Anwesenheitsliste der {sitzungsart} vom {datum} aus dem {ort}.\n\nBeginn: {beginn} Uhr\nEnde: {ende} Uhr\nAnwesende SPD-Fraktionsmitglieder: {anzahl} von {gesamt}\n\nMit freundlichen Grüßen\nSPD-Fraktion Ahnsen";

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
      s.put("id",java.util.UUID.randomUUID().toString());s.put("type",type);
      s.put("date",LocalDate.now().toString());s.put("place","Ahnsen DGH");
      s.put("start","17:00");s.put("end","19:00");
      s.put("agenda","");s.put("notes","");s.put("decisions","");s.put("sealed",false);
      JSONArray active=vault.members(false),ids=new JSONArray(),names=new JSONArray();
      JSONArray attendance=new JSONArray(),signatures=new JSONArray();
      for(int i=0;i<active.length();i++){
        JSONObject member=active.optJSONObject(i);if(member==null)continue;
        ids.put(member.optString("id"));names.put(member.optString("name"));
        attendance.put(false);signatures.put("");
      }
      s.put("memberIds",ids);s.put("memberNames",names);
      s.put("present",attendance);s.put("signatures",signatures);
    }catch(Exception e){}return s;
  }
  String[] sessionNames(){
    JSONArray arr=session==null?null:session.optJSONArray("memberNames");
    if(arr==null)return names.clone();
    String[] out=new String[arr.length()];
    for(int i=0;i<arr.length();i++)out[i]=arr.optString(i,"Mitglied");
    return out;
  }
  String[] sessionMemberIds(){
    JSONArray arr=session==null?null:session.optJSONArray("memberIds");
    String[] memberNames=sessionNames();
    String[] out=new String[memberNames.length];
    for(int i=0;i<out.length;i++)out[i]=arr==null?memberNames[i]:arr.optString(i,memberNames[i]);
    return out;
  }
  String val(String k,String def){return session==null?def:session.optString(k,def);}
  void set(String key,Object v){if(archiveReadOnly)return;try{session.put(key,v);}catch(Exception e){}if(!loading)draft();}
  void draft(){if(session!=null&&!suppressDraft&&!archiveReadOnly)prefs.edit().putString("draft",session.toString()).apply();}
  void clearDraft(){prefs.edit().remove("draft").apply();}
  void showHome() {
    archiveReadOnly=false;suppressDraft=true;
    init("home");gap(page,4);
    title("Guten Tag!");
    page.addView(text("Deine digitale SPD-Fraktionsverwaltung",15,MUTED,false));
    gap(page,19);
    JSONArray completed=vault.meetings();
    String latest=prefs.getString("backup_last","");
    infoPanel("Sitzungsübersicht",completed.length()+" abgeschlossen  ·  "
      +vault.items("appointments").length()+" Termine geplant");
    page.addView(text("NEUE SITZUNG",12,RED,true));gap(page,9);
    addButton("＋ Fraktionssitzung",()->startNew("normal"),true);
    addButton("＋ Gemeinsame Fraktionssitzung",()->startNew("joint"),false);
    if(prefs.contains("draft")){
      gap(page,7);
      addButton("✎ Offenen Entwurf weiterbearbeiten",()->{
        try{session=new JSONObject(prefs.getString("draft","{}"));suppressDraft=false;edit();}
        catch(Exception e){toast("Entwurf konnte nicht geladen werden");}
      },true);
    }
    gap(page,15);
    page.addView(text("ORGANISATION",12,RED,true));gap(page,9);
    addButton("Archiv und Anwesenheitslisten",this::archive,false);
    addButton("Termine und Tagesordnung",()->extras.agenda(),false);
    addButton("Beschlussregister",()->extras.decisions(),false);
    addButton("Mitglieder und Statistik",()->extras.statistics(),false);
    gap(page,10);
    page.addView(text("Daten werden lokal gespeichert. Backup: "+(latest.isEmpty()?"Noch keines erstellt":latest.replace('T',' ')),12,MUTED,false));
  }
  String meetingTitle(){
    return val("type","normal").equals("joint")?"gemeinsamen Fraktionssitzung":"Fraktionssitzung";
  }
  int attendanceCount(){
    int count=0;JSONArray a=session==null?null:session.optJSONArray("present");
    if(a!=null)for(int i=0;i<a.length();i++)if(a.optBoolean(i,false))count++;
    return count;
  }
  String renderMailTemplate(String pattern){
    return pattern.replace("{sitzungsart}",meetingTitle()).replace("{datum}",showDate(val("date","")))
      .replace("{ort}",val("place","Ahnsen DGH")).replace("{beginn}",val("start",""))
      .replace("{ende}",val("end","")).replace("{anzahl}",String.valueOf(attendanceCount()))
      .replace("{gesamt}",String.valueOf(sessionNames().length));
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
    page.addView(text("Platzhalter: {sitzungsart}, {datum}, {ort}, {beginn}, {ende}, {anzahl}, {gesamt}.",13,MUTED,false));
    gap(page,19);
    page.addView(text("PDF-BRIEFKOPF UND VORLAGE",12,RED,true));gap(page,12);
    label("PDF-Briefkopf");
    EditText pdfHeader=settingsInput(prefs.getString("pdf_header","SPD-FRAKTION  |  GEMEINDERAT AHNSEN"),false);
    label("PDF-Fußzeile");
    EditText pdfFooter=settingsInput(prefs.getString("pdf_footer","SPD-FRAKTION  ·  GEMEINDE AHNSEN"),false);
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
        .putString("email_subject",sub).putString("email_body",msg)
        .putString("pdf_header",pdfHeader.getText().toString().trim())
        .putString("pdf_footer",pdfFooter.getText().toString().trim()).apply();
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
  void showDataSettings(){
    suppressDraft=true;init("dataSettings");
    addButton("‹ Weitere Bereiche",this::showMore,false);title("Datensicherung");
    infoPanel("Schutz für Fraktionsunterlagen","Verschlüsselte Sicherungen, Wiederherstellung und Sperre beim App-Start.");
    CheckBox lock=new CheckBox(this);lock.setText("Android-Gerätesperre beim App-Start verwenden");
    lock.setTextSize(15);lock.setTextColor(DARK);lock.setChecked(securityGate.enabled());
    page.addView(lock);gap(page,12);
    lock.setOnCheckedChangeListener((b,checked)->{
      securityGate.setEnabled(checked);
      b.setChecked(securityGate.enabled());
    });
    page.addView(text("Die Systemabfrage nutzt deine Geräte-PIN bzw. verfügbare biometrische Entsperrung. Die App kennt diese Daten nicht.",13,MUTED,false));gap(page,25);
    page.addView(text("VERSCHLÜSSELTE DATENSICHERUNG",12,RED,true));gap(page,10);
    addButton("Backup erstellen (.spda)",()->exportCoordinator.backup(),true);
    addButton("Backup wiederherstellen",()->exportCoordinator.restore(),false);
    page.addView(text("Enthält Mitglieder, Sitzungen, Unterschriften, Original-PDFs, Termine, Beschlüsse und Vorlagen. Ein Backup ist mit einem eigenen Passwort geschützt. Gmail-App-Passwörter werden nicht exportiert.",13,MUTED,false));
    gap(page,23);
    page.addView(text("AUSWERTUNGEN UND DOKUMENTE",12,RED,true));gap(page,10);
    addButton("Alle PDF-Dokumente als ZIP exportieren",()->exportCoordinator.exportPdfZip(),false);
    addButton("Anwesenheitsstatistik als CSV exportieren",()->exportCoordinator.exportCsv(),false);
    String last=prefs.getString("backup_last","");
    gap(page,10);
    page.addView(text("Letztes Backup: "+(last.isEmpty()?"Noch nicht durchgeführt":last.replace('T',' ')),12,MUTED,false));
  }
  void startNew(String type){
    if(prefs.contains("draft")){
      new AlertDialog.Builder(this).setTitle("Ungespeicherter Entwurf")
       .setMessage("Neues Formular beginnen und bisherigen Entwurf verwerfen?")
       .setNegativeButton("Abbrechen",null).setPositiveButton("Neu beginnen",(d,w)->{session=newSession(type);suppressDraft=false;draft();edit();}).show();
    }else {session=newSession(type);suppressDraft=false;draft();edit();}
  }
  void archive() {
    suppressDraft=true;archiveReadOnly=false;init("archive");
    title("Sitzungsarchiv");
    page.addView(text("Endgültige Originale · unveränderbare PDFs",14,MUTED,false));gap(page,17);
    label("Suche nach Sitzung, Ort oder Datum");
    EditText find=settingsInput("",false);find.setHint("Sitzung suchen ...");
    LinearLayout selectors=new LinearLayout(this);selectors.setGravity(Gravity.CENTER_VERTICAL);
    Spinner type=new Spinner(this);
    ArrayAdapter<String> types=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,
      new String[]{"Alle Arten","Fraktionssitzung","Gemeinsame Sitzung"});type.setAdapter(types);
    selectors.addView(type,new LinearLayout.LayoutParams(0,dp(49),1));
    Spinner year=new Spinner(this);
    LinkedHashSet<String> years=new LinkedHashSet<>();years.add("Alle Jahre");
    JSONArray all=vault.meetings();
    for(int i=0;i<all.length();i++){JSONObject m=all.optJSONObject(i);
      if(m!=null&&m.optString("date").length()>=4)years.add(m.optString("date").substring(0,4));}
    ArrayAdapter<String> yearOptions=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,new ArrayList<>(years));
    year.setAdapter(yearOptions);selectors.addView(year,new LinearLayout.LayoutParams(0,dp(49),1));
    page.addView(selectors);gap(page,12);
    LinearLayout results=column();page.addView(results);
    Runnable update=()->renderArchive(results,find.getText().toString(),type.getSelectedItemPosition(),year.getSelectedItem().toString());
    find.addTextChangedListener(new android.text.TextWatcher(){
      public void beforeTextChanged(CharSequence s,int st,int count,int after){}
      public void onTextChanged(CharSequence s,int st,int before,int count){update.run();}
      public void afterTextChanged(android.text.Editable e){}
    });
    android.widget.AdapterView.OnItemSelectedListener listener=new android.widget.AdapterView.OnItemSelectedListener(){
      public void onNothingSelected(android.widget.AdapterView<?> p){}
      public void onItemSelected(android.widget.AdapterView<?> p,View v,int pos,long id){update.run();}
    };
    type.setOnItemSelectedListener(listener);year.setOnItemSelectedListener(listener);update.run();
  }
  void renderArchive(LinearLayout target,String filter,int type,String year){
    target.removeAllViews();int hits=0;
    String q=filter.toLowerCase(Locale.GERMANY).trim();
    JSONArray list=vault.meetings();
    for(int i=0;i<list.length();i++){
      JSONObject item=list.optJSONObject(i);if(item==null)continue;
      String kind=item.optString("type","normal");
      if(type==1&&kind.equals("joint")||type==2&&!kind.equals("joint"))continue;
      if(!year.equals("Alle Jahre")&&!item.optString("date").startsWith(year))continue;
      String title=kind.equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung";
      String hay=(title+" "+item.optString("place")+" "+item.optString("date")
        +" "+showDate(item.optString("date"))).toLowerCase(Locale.GERMANY);
      if(!q.isEmpty()&&!hay.contains(q))continue;hits++;
      final String id=item.optString("id");
      String state=vault.deliveryState(id);
      String mail=state.equals("accepted")?" · VERSENDET":state.equals("failed")?" · VERSANDFEHLER":"";
      LinearLayout card=column();card.setPadding(dp(16),dp(15),dp(16),dp(15));
      card.setBackground(bg(Color.WHITE,15));card.setElevation(dp(1));
      card.addView(text(title,16,DARK,true));gap(card,5);
      card.addView(text(showDate(item.optString("date"))+" · "+item.optString("place")+mail,13,MUTED,false));
      target.addView(card);gap(target,10);card.setOnClickListener(v->showArchivedSession(id));
    }
    if(hits==0)target.addView(text("Keine Sitzungen für diese Auswahl gefunden.",15,MUTED,false));
  }
  void showArchivedSession(String id){
    JSONObject stored=vault.meeting(id);
    if(stored==null){toast("Sitzung wurde nicht gefunden.");archive();return;}
    session=stored;archiveReadOnly=true;suppressDraft=true;init("archiveDetail");
    addButton("‹ Archiv",this::archive,false);title("Sitzungsakte");
    TextView chip=text("ABGESCHLOSSEN  ·  ORIGINAL",12,RED,true);
    chip.setPadding(dp(13),dp(12),dp(13),dp(12));chip.setBackground(bg(Color.rgb(253,236,239),12));
    page.addView(chip);gap(page,18);
    page.addView(text(val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung",20,DARK,true));gap(page,14);
    page.addView(text("Datum   "+showDate(val("date","")),15,DARK,false));gap(page,5);
    page.addView(text("Ort   "+val("place","Ahnsen DGH"),15,DARK,false));gap(page,5);
    page.addView(text("Beginn   "+val("start","")+" Uhr     Ende   "+val("end","")+" Uhr",15,DARK,false));gap(page,12);
    if(!val("revisionOf","").isEmpty())
      page.addView(text("Korrekturfassung zu: "+val("revisionOf",""),12,RED,true));
    infoPanel("Anwesenheit",attendanceCount()+" von "+sessionNames().length+" Mitgliedern");
    JSONArray present=session.optJSONArray("present"),sigs=session.optJSONArray("signatures");
    String[] labels=sessionNames();
    for(int i=0;i<labels.length;i++){
      if(present==null||!present.optBoolean(i,false))continue;
      LinearLayout card=column();card.setPadding(dp(15),dp(13),dp(15),dp(13));card.setBackground(bg(Color.WHITE,13));
      card.addView(text(labels[i],15,DARK,true));String encoded=sigs==null?"":sigs.optString(i,"");
      if(encoded.isEmpty()){gap(card,6);card.addView(text("Unterschrift fehlt",12,MUTED,false));}
      else try{
        Bitmap bitmap=BitmapFactory.decodeByteArray(Base64.decode(encoded,Base64.DEFAULT),0,Base64.decode(encoded,Base64.DEFAULT).length);
        if(bitmap!=null){ImageView image=new ImageView(this);image.setImageBitmap(bitmap);
          image.setScaleType(ImageView.ScaleType.FIT_CENTER);
          card.addView(image,new LinearLayout.LayoutParams(-1,dp(81)));}
      }catch(Exception e){card.addView(text("Unterschrift gespeichert",12,MUTED,false));}
      page.addView(card);gap(page,9);
    }
    if(!val("agenda","").trim().isEmpty())infoPanel("Tagesordnung",val("agenda",""));
    if(!val("notes","").trim().isEmpty())infoPanel("Sitzungsnotizen",val("notes",""));
    if(!val("decisions","").trim().isEmpty())infoPanel("Beschlüsse",val("decisions",""));
    gap(page,12);
    addButton("Original-PDF öffnen",this::openPdf,true);
    addButton("Original-PDF in Gmail versenden",this::sharePdf,false);
    addButton("Original-PDF direkt senden",this::confirmResend,false);
    addButton("Korrekturfassung erstellen",this::createCorrection,false);
    JSONArray logs=vault.logs(id);
    if(logs.length()>0){gap(page,12);page.addView(text("VERSANDPROTOKOLL",12,RED,true));gap(page,12);}
    for(int i=0;i<logs.length();i++){
      JSONObject log=logs.optJSONObject(i);if(log==null)continue;
      String status=log.optString("state"),time=log.optString("time");
      String label=status.equals("accepted")?"Vom Server angenommen":status.equals("failed")?"Fehlgeschlagen":"Versand gestartet";
      page.addView(text(label+" · "+time.replace('T',' '),13,DARK,true));gap(page,3);
      page.addView(text("Empfänger: "+log.optString("recipient"),12,MUTED,false));gap(page,9);
    }
    gap(page,12);
    page.addView(text("Originaldaten und Unterschriften sind schreibgeschützt. Korrekturen werden als eigene Fassung archiviert.",12,MUTED,false));
  }
  void createCorrection(){
    if(!archiveReadOnly||session==null)return;
    final String previous=session.optString("id");
    new AlertDialog.Builder(this).setTitle("Korrekturfassung erstellen?")
      .setMessage("Es wird ein neuer bearbeitbarer Entwurf mit denselben Angaben erstellt. Das Original und dessen PDF bleiben erhalten.")
      .setNegativeButton("Abbrechen",null).setPositiveButton("Erstellen",(d,w)->{
        try{
          JSONObject copy=new JSONObject(session.toString());
          copy.put("id",java.util.UUID.randomUUID().toString());
          copy.put("revisionOf",previous);copy.put("sealed",false);
          copy.remove("sealedAt");copy.remove("pdfHash");copy.remove("sentAt");copy.remove("sentTo");
          session=copy;archiveReadOnly=false;suppressDraft=false;
          draft();edit();
        }catch(Exception e){toast("Korrekturfassung konnte nicht erstellt werden");}
      }).show();
  }
  void confirmResend(){
    if(!archiveReadOnly){sendDirect();return;}
    String id=val("id","");
    new AlertDialog.Builder(this).setTitle("Original-PDF erneut senden?")
      .setMessage("Die Sitzung bleibt unverändert. Ein neuer Versandversuch wird protokolliert."+
        (vault.deliveryAccepted(id)?" Für diese Sitzung wurde bereits eine erfolgreiche Übergabe an Gmail bestätigt.":""))
      .setNegativeButton("Abbrechen",null).setPositiveButton("Jetzt senden",(d,w)->sendDirect()).show();
  }
  JSONArray readArchive(){return vault.meetings();}
  JSONObject findSession(String id){return vault.meeting(id);}
  void saveSession(){
    if(session==null)return;
    if(session.optBoolean("sealed",false))return;
    String id=session.optString("id","");
    if(vault.hasFinal(id)){toast("Diese Sitzung ist bereits abgeschlossen");return;}
    File temporary=null;
    try{
      temporary=makePdf();
      vault.installPdf(id,temporary);
      session.put("pdfHash",DataVault.sha256(vault.sealedFile(id)));
      session.put("sealed",true);session.put("sealedAt",java.time.ZonedDateTime.now().toString());
      if(!vault.insertFinal(session))throw new Exception("Sitzungsakte existiert bereits");
      prefs.edit().remove("draft").apply();suppressDraft=true;
      toast("Sitzung unveränderbar abgeschlossen");
    }catch(Exception e){
      try{session.put("sealed",false);}catch(Exception ignored){}
      toast("Abschluss fehlgeschlagen: "+e.getMessage());
    }
  }
  void confirmFinalize(Runnable after){
    if(session==null)return;
    if(session.optBoolean("sealed",false)){after.run();return;}
    if(section.equals("edit"))syncPlace();
    JSONArray present=session.optJSONArray("present"),sigs=session.optJSONArray("signatures");
    int missing=0;
    for(int i=0;present!=null&&i<present.length();i++)
      if(present.optBoolean(i,false)&&(sigs==null||sigs.optString(i,"").isEmpty()))missing++;
    final int signaturesMissing=missing;
    String body="Sitzung: "+(val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung")+
      "\nDatum: "+showDate(val("date",""))+"\nOrt: "+val("place","")+
      "\nZeit: "+val("start","")+"–"+val("end","")+" Uhr"+
      "\nAnwesende: "+attendanceCount()+" von "+sessionNames().length+
      (signaturesMissing>0?"\n\nACHTUNG: "+signaturesMissing+" Unterschrift(en) fehlen.":"")+
      "\n\nNach dem Abschluss kann die Sitzung nicht mehr verändert werden.";
    new AlertDialog.Builder(this).setTitle("Verbindlich abschließen?")
      .setMessage(body).setNegativeButton("Weiter bearbeiten",null)
      .setPositiveButton("Abschließen",(d,w)->{
        saveSession();
        if(session!=null&&session.optBoolean("sealed",false))after.run();
      }).show();
  }
  void edit(){
    if(archiveReadOnly){showArchivedSession(val("id",""));return;}
    suppressDraft=false;
    init("edit");loading=true;
    agendaField=null;notesField=null;decisionsField=null;
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
    String[] members=sessionNames();memberInfo=new TextView[members.length];presentChecks=new CheckBox[members.length];
    for(int i=0;i<members.length;i++){final int j=i;
      LinearLayout card=column();card.setPadding(dp(14),dp(14),dp(14),dp(14));card.setBackground(bg(Color.WHITE,13));
      LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);card.addView(row);
      CheckBox cb=new CheckBox(this);cb.setText(members[i]);cb.setTextSize(16);cb.setTextColor(DARK);cb.setChecked(pres!=null&&pres.optBoolean(i,false));row.addView(cb,new LinearLayout.LayoutParams(0,-2,1));presentChecks[i]=cb;
      TextView status=text(sigs!=null&&!sigs.optString(i,"").isEmpty()?"✓":"",14,RED,true);row.addView(status);memberInfo[i]=status;
      TextView btn=text("Unterschreiben / ändern",14,RED,true);btn.setPadding(dp(6),dp(10),dp(6),dp(4));
      card.addView(btn);btn.setVisibility(cb.isChecked()?View.VISIBLE:View.GONE);
      btn.setOnClickListener(v->signatureDialog(j));
      cb.setOnCheckedChangeListener((button,checked)->{try{session.getJSONArray("present").put(j,checked);}catch(Exception e){}btn.setVisibility(checked?View.VISIBLE:View.GONE);draft();});
      page.addView(card);gap(page,9);
    }
    gap(page,18);
    page.addView(text("TAGESORDNUNG UND PROTOKOLL",12,RED,true));gap(page,10);
    label("Tagesordnung");
    agendaField=settingsInput(val("agenda",""),true);
    label("Sitzungsnotizen");
    notesField=settingsInput(val("notes",""),true);
    label("Beschlüsse / Abstimmungsergebnisse");
    decisionsField=settingsInput(val("decisions",""),true);
    gap(page,15);
    addButton("Liste ansehen / Vorschau",()->{syncPlace();preview();},false);
    addButton("Sitzung prüfen und abschließen",()->confirmFinalize(this::showHome),true);
    addButton("Abschließen & sofort per E-Mail senden",this::sendDirect,true);
    addButton("Abschließen & in Gmail öffnen",this::sharePdf,false);
    page.addView(text("Nach dem Abschluss werden PDF, Namen, Zeiten und Unterschriften schreibgeschützt gespeichert. Änderungen sind dann nur noch als neue Korrekturfassung möglich.",12,MUTED,false));
    loading=false;
  }
  void syncPlace(){
    if(archiveReadOnly)return;
    if(place!=null)set("place",place.getText().toString().trim().isEmpty()?"Ahnsen DGH":place.getText().toString().trim());
    if(agendaField!=null)set("agenda",agendaField.getText().toString());
    if(notesField!=null)set("notes",notesField.getText().toString());
    if(decisionsField!=null)set("decisions",decisionsField.getText().toString());
  }
  TextView fieldText(String v){TextView t=text(v+"   ▾",17,DARK,false);t.setPadding(dp(13),dp(15),dp(13),dp(15));t.setBackground(bg(Color.WHITE,10));page.addView(t);return t;}
  void pickTime(String key,TextView target){String v=val(key,"17:00");int h=17,m=0;try{String[] p=v.split(":");h=Integer.parseInt(p[0]);m=Integer.parseInt(p[1]);}catch(Exception e){}
    new TimePickerDialog(this,(tp,hour,minute)->{String s=String.format(Locale.GERMANY,"%02d:%02d",hour,minute);set(key,s);target.setText(s+"   ▾");},h,m,true).show();}
  void signatureDialog(int i){
    LinearLayout wrap=column();wrap.setPadding(dp(12),dp(12),dp(12),dp(5));
    SignView pad=new SignView(this);wrap.addView(pad,new LinearLayout.LayoutParams(-1,dp(230)));
    TextView desc=text("Mit dem Finger im Feld unterschreiben.",13,MUTED,false);wrap.addView(desc);
    AlertDialog dialog=new AlertDialog.Builder(this).setTitle(sessionNames()[i]).setView(wrap)
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
    init("preview");
    addButton("‹ Weiter bearbeiten",this::edit,false);
    title("Abschlussvorschau");
    infoPanel(val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung",
      showDate(val("date",""))+" · "+val("place","Ahnsen DGH")+" · "+val("start","")+"–"+val("end","")+" Uhr");
    page.addView(text("ANWESENHEIT",12,RED,true));gap(page,12);
    JSONArray present=session.optJSONArray("present"),sigs=session.optJSONArray("signatures");
    String[] labels=sessionNames();
    for(int i=0;i<labels.length;i++)if(present!=null&&present.optBoolean(i,false)){
      page.addView(text("✓ "+labels[i]+(sigs!=null&&!sigs.optString(i,"").isEmpty()?"  · unterschrieben":"  · Unterschrift fehlt"),15,DARK,false));gap(page,9);
    }
    if(!val("agenda","").isEmpty())infoPanel("Tagesordnung",val("agenda",""));
    if(!val("notes","").isEmpty())infoPanel("Notizen",val("notes",""));
    if(!val("decisions","").isEmpty())infoPanel("Beschlüsse",val("decisions",""));
    gap(page,17);
    addButton("PDF als Vorschau öffnen",this::openPdf,false);
    addButton("Verbindlich abschließen",()->confirmFinalize(this::showHome),true);
    addButton("Abschließen & direkt versenden",this::sendDirect,false);
  }
  File makePdf() throws Exception {
    PdfDocument document=new PdfDocument();
    Paint paint=new Paint(3);
    String[] labels=sessionNames();
    JSONArray present=session.optJSONArray("present"),signatures=session.optJSONArray("signatures");
    ArrayList<Integer> attendees=new ArrayList<>();
    if(present!=null)for(int i=0;i<labels.length;i++)if(present.optBoolean(i,false))attendees.add(i);
    int perPage=7;
    int totalPages=Math.max(1,(attendees.size()+perPage-1)/perPage);
    String category=val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung";
    String header=prefs.getString("pdf_header","SPD-FRAKTION  |  GEMEINDERAT AHNSEN");
    String footer=prefs.getString("pdf_footer","SPD-FRAKTION  ·  GEMEINDE AHNSEN");
    for(int number=0;number<totalPages;number++){
      PdfDocument.Page page=document.startPage(new PdfDocument.PageInfo.Builder(595,842,number+1).create());
      Canvas canvas=page.getCanvas();canvas.drawColor(Color.WHITE);
      paint.setColor(RED);canvas.drawRect(0,0,595,16,paint);
      drawFit(canvas,header,44,56,14,RED,true,505);
      draw(canvas,"ANWESENHEITSLISTE",44,116,25,DARK,true);
      draw(canvas,category,44,145,16,MUTED,false);
      paint.setColor(Color.rgb(246,247,250));canvas.drawRoundRect(44,166,551,263,9,9,paint);
      draw(canvas,"Datum",57,188,10,MUTED,true);
      draw(canvas,showDate(val("date","")),57,211,13,DARK,true);
      draw(canvas,"Sitzungsort",218,188,10,MUTED,true);
      drawFit(canvas,val("place","Ahnsen DGH"),218,211,13,DARK,true,315);
      draw(canvas,"Beginn",57,244,10,MUTED,true);
      draw(canvas,val("start","")+" Uhr",112,244,12,DARK,false);
      draw(canvas,"Ende",242,244,10,MUTED,true);
      draw(canvas,val("end","")+" Uhr",284,244,12,DARK,false);
      paint.setColor(RED);canvas.drawRoundRect(44,285,551,327,5,5,paint);
      draw(canvas,"Nr.",56,311,11,Color.WHITE,true);
      draw(canvas,"Vor- und Nachname",97,311,11,Color.WHITE,true);
      draw(canvas,"Unterschrift",345,311,11,Color.WHITE,true);
      int first=number*perPage,last=Math.min(attendees.size(),first+perPage);
      for(int n=first;n<last;n++){
        int idx=attendees.get(n),row=n-first,y=327+row*56;
        paint.setColor(row%2==0?Color.rgb(250,251,253):Color.WHITE);
        canvas.drawRect(44,y,551,y+56,paint);
        paint.setColor(Color.rgb(226,229,235));paint.setStrokeWidth(.8f);
        canvas.drawLine(44,y+56,551,y+56,paint);
        draw(canvas,String.valueOf(n+1),56,y+34,12,DARK,false);
        drawFit(canvas,labels[idx],97,y+34,12,DARK,true,230);
        String encoded=signatures==null?"":signatures.optString(idx,"");
        if(encoded.isEmpty())draw(canvas,"Unterschrift offen",345,y+33,10,MUTED,false);
        else try{
          byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
          Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
          if(bitmap!=null){
            paint.setColor(Color.WHITE);
            canvas.drawBitmap(bitmap,new Rect(0,0,bitmap.getWidth(),bitmap.getHeight()),
              new Rect(345,y+5,532,y+51),paint);
            bitmap.recycle();
          }
        }catch(Exception ignored){}
      }
      draw(canvas,"Anwesende SPD-Mitglieder: "+attendees.size()+" von "+labels.length,44,755,12,DARK,true);
      paint.setColor(Color.rgb(227,231,236));canvas.drawLine(44,773,551,773,paint);
      drawFit(canvas,footer,44,792,10,MUTED,true,470);
      draw(canvas,"Seite "+(number+1),497,810,9,MUTED,false);
      document.finishPage(page);
    }
    String[] sectionTitles={"TAGESORDNUNG","SITZUNGSNOTIZEN","BESCHLÜSSE"};
    String[] content={val("agenda",""),val("notes",""),val("decisions","")};
    ArrayList<String> lines=new ArrayList<>();
    for(int i=0;i<content.length;i++){
      if(content[i].trim().isEmpty())continue;
      lines.add("## "+sectionTitles[i]);
      lines.addAll(wrapPdfLines(content[i],82));
      lines.add("");
    }
    if(!lines.isEmpty()){
      final int maxLines=34;
      int pages=(lines.size()+maxLines-1)/maxLines;
      for(int part=0;part<pages;part++){
        PdfDocument.Page page=document.startPage(new PdfDocument.PageInfo.Builder(595,842,totalPages+part+1).create());
        Canvas c=page.getCanvas();c.drawColor(Color.WHITE);
        paint.setColor(RED);c.drawRect(0,0,595,16,paint);
        drawFit(c,header,44,52,14,RED,true,505);
        draw(c,"SITZUNGSDOKUMENTATION",44,101,23,DARK,true);
        draw(c,category+"  ·  "+showDate(val("date","")),44,127,13,MUTED,false);
        int from=part*maxLines,to=Math.min(lines.size(),from+maxLines);
        int y=173;
        for(int i=from;i<to;i++){
          String line=lines.get(i);
          if(line.startsWith("## ")){draw(c,line.substring(3),44,y,14,RED,true);y+=22;}
          else if(line.isEmpty()){y+=8;}
          else{drawFit(c,line,44,y,12,DARK,false,505);y+=17;}
        }
        paint.setColor(Color.rgb(225,228,232));c.drawLine(44,773,551,773,paint);
        drawFit(c,footer,44,795,10,MUTED,true,470);
        draw(c,"Seite "+(totalPages+part+1),497,810,9,MUTED,false);
        document.finishPage(page);
      }
    }
    File folder=new File(getCacheDir(),"pdfs");if(!folder.exists())folder.mkdirs();
    File output=new File(folder,"SPD_Ahnsen_"+val("type","normal")+"_"+val("date",LocalDate.now().toString())+"_"+val("id","").replaceAll("[^a-zA-Z0-9_-]","")+".pdf");
    try(FileOutputStream stream=new FileOutputStream(output)){document.writeTo(stream);}
    document.close();return output;
  }
  ArrayList<String> wrapPdfLines(String input,int maxChars){
    ArrayList<String> result=new ArrayList<>();
    for(String paragraph:input.replace("\r","").split("\n",-1)){
      StringBuilder current=new StringBuilder();
      for(String word:paragraph.trim().split("\\s+")){
        if(word.isEmpty())continue;
        while(word.length()>maxChars){
          if(current.length()>0){result.add(current.toString());current.setLength(0);}
          result.add(word.substring(0,maxChars));word=word.substring(maxChars);
        }
        if(current.length()>0&&current.length()+1+word.length()>maxChars){result.add(current.toString());current.setLength(0);}
        if(current.length()>0)current.append(" ");
        current.append(word);
      }
      result.add(current.toString());
    }
    return result;
  }
  void drawFit(Canvas c,String value,int x,int y,int size,int color,boolean bold,float width){
    Paint p=new Paint(3);p.setColor(color);p.setTypeface(Typeface.create("sans-serif",bold?Typeface.BOLD:Typeface.NORMAL));p.setTextSize(size);
    while(p.measureText(value)>width&&p.getTextSize()>8)p.setTextSize(p.getTextSize()-.5f);
    String out=value;
    while(p.measureText(out)>width&&out.length()>1)out=out.substring(0,out.length()-1);
    c.drawText(out,x,y,p);
  }
  void draw(Canvas c,String s,int x,int y,int size,int color,boolean bold){Paint p=new Paint(3);p.setColor(color);p.setTextSize(size);p.setTypeface(bold?Typeface.create("sans-serif",Typeface.BOLD):Typeface.create("sans-serif",Typeface.NORMAL));c.drawText(s,x,y,p);}
  Uri uri(File file){return new Uri.Builder().scheme("content").authority("de.ahnsen.spd.v16.pdf").appendPath(file.getName()).build();}
  void openPdf(){try{File f=finalPdf();Uri u=uri(f);Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(u,"application/pdf");intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("Anwesenheitsliste",u));startActivity(Intent.createChooser(intent,"PDF öffnen"));}catch(Exception e){toast("PDF konnte nicht geöffnet werden: "+e.getMessage());}}
  File finalPdf() throws Exception {
    File f;
    if(session!=null&&session.optBoolean("sealed",false)){
      f=vault.sealedFile(val("id",""));
      if(!f.isFile())throw new Exception("Original-PDF fehlt. Bitte ein Backup wiederherstellen.");
      String expected=val("pdfHash","");
      if(expected.isEmpty()||!expected.equalsIgnoreCase(DataVault.sha256(f)))
        throw new Exception("Die Prüfsumme der Archiv-PDF stimmt nicht. Versand gesperrt.");
    }else f=makePdf();
    return f;
  }
  void sendDirect(){
    if(sending){toast("Ein E-Mail-Versand läuft bereits");return;}
    String recipient=prefs.getString("email_to","").trim(), sender=prefs.getString("gmail_sender","").trim();
    if(recipient.isEmpty()||sender.isEmpty()||!SecurePasswordStore.configured(prefs)){
      new AlertDialog.Builder(this).setTitle("Direktversand einrichten")
        .setMessage("Lege unter Einstellungen Empfänger, Gmail-Absender und ein Google-App-Passwort fest.")
        .setNegativeButton("Abbrechen",null).setPositiveButton("Einstellungen",(d,w)->showSettings()).show();
      return;
    }
    if(!android.util.Patterns.EMAIL_ADDRESS.matcher(recipient).matches()||
       !android.util.Patterns.EMAIL_ADDRESS.matcher(sender).matches()){
      toast("Ungültige E-Mail-Adresse in den Einstellungen");return;
    }
    if(session==null)return;
    if(!session.optBoolean("sealed",false)){
      confirmFinalize(this::sendDirect);
      return;
    }
    final String password;
    try{password=SecurePasswordStore.load(prefs);if(password==null||password.isEmpty())throw new Exception("No app password");}
    catch(Exception e){toast("App-Passwort nicht verfügbar – bitte unter Einstellungen neu hinterlegen");return;}
    final File pdf;
    try{pdf=finalPdf();}catch(Exception e){toast(e.getMessage());return;}
    final String sid=val("id",""),sub=renderMailTemplate(prefs.getString("email_subject",DEFAULT_EMAIL_SUBJECT));
    final String body=renderMailTemplate(prefs.getString("email_body",DEFAULT_EMAIL_BODY));
    vault.log(sid,"started",recipient,"Direktversand gestartet");
    sending=true;
    final ProgressDialog dialog=new ProgressDialog(this);dialog.setCancelable(false);dialog.setIndeterminate(true);
    dialog.setTitle("PDF wird versendet");dialog.setMessage("Verbindung zum Gmail-Server wird aufgebaut ...");dialog.show();
    new Thread(()->{
      try{
        GmailSmtpSender.send(sender,password,recipient,sub,body,pdf);
        vault.log(sid,"accepted",recipient,"Gmail-SMTP hat die Nachricht angenommen");
        runOnUiThread(()->{
          sending=false;dialog.dismiss();archiveReadOnly=false;showHome();
          new AlertDialog.Builder(this).setTitle("Versand bestätigt")
            .setMessage("Der Gmail-Server hat die Nachricht an "+recipient+" angenommen. Die Sitzung bleibt unverändert; der Empfang durch den Adressaten ist damit nicht garantiert.")
            .setPositiveButton("OK",null).show();
        });
      }catch(Exception error){
        vault.log(sid,"failed",recipient,error.getClass().getSimpleName());
        final boolean badPassword=error instanceof javax.mail.AuthenticationFailedException;
        runOnUiThread(()->{
          sending=false;dialog.dismiss();archiveReadOnly=false;showHome();
          new AlertDialog.Builder(this).setTitle("Versand nicht bestätigt")
            .setMessage((badPassword?"Gmail hat die Anmeldung abgelehnt. Bitte das App-Passwort prüfen.":"Verbindung oder Versand fehlgeschlagen. Prüfe vor einem erneuten Versuch den Gmail-Postausgang, um Duplikate zu vermeiden.")+
              "\n\nDie unveränderbare Sitzung ist im Archiv gesichert.")
            .setNegativeButton("Schließen",null).setPositiveButton("Gmail manuell öffnen",(dd,w)->sharePdf()).show();
        });
      }
    },"spd-ahnsen-direct-mail").start();
  }
  void sharePdf(){
    if(session==null)return;
    if(!session.optBoolean("sealed",false)){confirmFinalize(this::sharePdf);return;}
    try{
      File f=finalPdf();Uri u=uri(f);
      Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("application/pdf");
      String to=prefs.getString("email_to","").trim();
      if(!to.isEmpty())intent.putExtra(Intent.EXTRA_EMAIL,new String[]{to});
      intent.putExtra(Intent.EXTRA_SUBJECT,renderMailTemplate(prefs.getString("email_subject",DEFAULT_EMAIL_SUBJECT)));
      intent.putExtra(Intent.EXTRA_TEXT,renderMailTemplate(prefs.getString("email_body",DEFAULT_EMAIL_BODY)));
      intent.putExtra(Intent.EXTRA_STREAM,u);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      intent.setClipData(ClipData.newRawUri("SPD-Anwesenheitsliste",u));
      Intent gmail=new Intent(intent);gmail.setPackage("com.google.android.gm");
      vault.log(val("id",""),"manual",to,"Gmail geöffnet (tatsächlicher Versand unbestätigt)");
      try{startActivity(gmail);}catch(Exception e){startActivity(Intent.createChooser(intent,"PDF per E-Mail versenden"));}
    }catch(Exception e){toast("PDF-Versand nicht möglich: "+e.getMessage());}
  }
  void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
  @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
    super.onActivityResult(requestCode,resultCode,data);
    if(requestCode==SecurityGate.REQUEST_UNLOCK){securityGate.onResult(resultCode);return;}
    if(requestCode==ExportCoordinator.BACKUP_SAVE||requestCode==ExportCoordinator.ZIP_SAVE||
       requestCode==ExportCoordinator.CSV_SAVE||requestCode==ExportCoordinator.BACKUP_LOAD){
      exportCoordinator.onResult(requestCode,resultCode,data);return;
    }
  }
  @Override public void onBackPressed(){
    if(section.equals("archiveDetail"))archive();
    else if(section.equals("preview"))edit();
    else if(section.equals("edit")){syncPlace();showHome();}
    else showHome();
  }
}
