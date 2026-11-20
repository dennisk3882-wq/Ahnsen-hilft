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
  final int RED=Color.rgb(190,20,30), DARK=Color.rgb(35,42,53), MUTED=Color.rgb(94,101,114);
  LinearLayout root, page; EditText place; TextView dateText, startText, endText; TextView[] memberInfo=new TextView[5];
  CheckBox[] presentChecks=new CheckBox[5]; JSONObject session; String section="home"; boolean loading=false, suppressDraft=false;
  android.content.SharedPreferences prefs;

  @Override public void onCreate(Bundle b) {
    super.onCreate(b);getWindow().setStatusBarColor(RED);getWindow().setNavigationBarColor(Color.rgb(40,40,40));
    prefs=getSharedPreferences("spd_ahnsen_native_v1",MODE_PRIVATE);
    showHome();
  }
  int dp(float n){return (int)(getResources().getDisplayMetrics().density*n+.5f);}
  GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
  LinearLayout column(){LinearLayout x=new LinearLayout(this);x.setOrientation(1);return x;}
  TextView text(String value,int size,int color,boolean bold){TextView x=new TextView(this);x.setText(value);x.setTextSize(size);x.setTextColor(color);if(bold)x.setTypeface(null,1);return x;}
  void gap(LinearLayout l,int h){View v=new View(this);l.addView(v,new LinearLayout.LayoutParams(1,dp(h)));}
  void title(String t){TextView v=text(t,27,DARK,true);page.addView(v);gap(page,8);}
  void label(String t){TextView v=text(t,13,MUTED,true);page.addView(v);gap(page,5);}
  void addButton(String caption,Runnable action,boolean primary){
    TextView b=text(caption,16,primary?Color.WHITE:RED,true);b.setGravity(Gravity.CENTER);
    b.setPadding(dp(12),dp(16),dp(12),dp(16));b.setBackground(bg(primary?RED:Color.rgb(251,235,236),13));
    page.addView(b,new LinearLayout.LayoutParams(-1,-2));b.setOnClickListener(v->action.run());gap(page,10);
  }
  void init(String s){
    section=s;root=column();root.setBackgroundColor(Color.rgb(249,250,252));
    setContentView(root);
    TextView head=text("SPD  Ahnsen",21,Color.WHITE,true);head.setPadding(dp(21),dp(20),dp(18),dp(20));head.setBackgroundColor(RED);root.addView(head);
    ScrollView scroll=new ScrollView(this);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
    page=column();page.setPadding(dp(19),dp(23),dp(19),dp(35));scroll.addView(page);
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
  void set(String key,Object v){try{session.put(key,v);}catch(Exception e){}if(!loading)draft();}
  void draft(){if(session!=null&&!suppressDraft)prefs.edit().putString("draft",session.toString()).apply();}
  void clearDraft(){prefs.edit().remove("draft").apply();}
  void showHome() {
    suppressDraft=true;
    init("home");gap(page,8);title("Sitzungen");page.addView(text("Anwesenheit, Unterschriften und PDF-Listen für den Gemeinderat Ahnsen.",15,MUTED,false));gap(page,28);
    addButton("Fraktionssitzung",()->startNew("normal"),true);
    addButton("Gemeinsame Fraktionssitzung",()->startNew("joint"),true);
    if(prefs.contains("draft"))addButton("Entwurf weiterbearbeiten",()->{try{session=new JSONObject(prefs.getString("draft","{}"));suppressDraft=false;edit();}catch(Exception e){toast("Entwurf konnte nicht geladen werden");}},false);
    addButton("Gespeicherte Sitzungen",this::archive,false);
    page.addView(text("Private Daten bleiben lokal in dieser Android-App. Nur beim Teilen einer PDF werden die enthaltenen Daten an die ausgewählte E-Mail-App übergeben.",12,MUTED,false));
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
    init("archive");addButton("‹ Zurück",this::showHome,false);title("Gespeicherte Sitzungen");
    JSONArray a=readArchive();if(a.length()==0){page.addView(text("Noch keine Sitzungen gespeichert.",15,MUTED,false));return;}
    for(int i=a.length()-1;i>=0;i--){JSONObject item=a.optJSONObject(i);if(item==null)continue;
      final String id=item.optString("id");String type=item.optString("type").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung";
      addButton(type+"\n"+showDate(item.optString("date"))+" · "+item.optString("place"),()->{
        session=findSession(id);if(session!=null){suppressDraft=false;draft();edit();}
      },false);
    }
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
    addButton("Speichern & per E-Mail versenden",()->{syncPlace();saveSession();showHome();sharePdf();},true);
    page.addView(text("Die E-Mail öffnet sich in Gmail mit PDF-Anhang. Du prüfst den Empfänger und sendest selbst.",12,MUTED,false));
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
    init("preview");addButton("‹ Weiter bearbeiten",this::edit,false);title("Anwesenheitsliste");
    page.addView(text(val("type","normal").equals("joint")?"Gemeinsame Fraktionssitzung":"Fraktionssitzung",19,RED,true));gap(page,15);
    page.addView(text("Datum: "+showDate(val("date","")),16,DARK,false));
    page.addView(text("Ort: "+val("place","Ahnsen DGH"),16,DARK,false));
    page.addView(text("Beginn: "+val("start","")+"     Ende: "+val("end",""),16,DARK,false));gap(page,12);
    JSONArray a=session.optJSONArray("present"),sg=session.optJSONArray("signatures");
    for(int i=0;i<5;i++)if(a!=null&&a.optBoolean(i)) {page.addView(text("✓ "+names[i]+"   "+(sg!=null&&!sg.optString(i,"").isEmpty()?"(unterschrieben)":"(Unterschrift offen)"),15,DARK,false));gap(page,8);}
    gap(page,22);addButton("PDF erstellen / Öffnen",this::openPdf,true);
    addButton("Speichern & per E-Mail versenden",()->{saveSession();showHome();sharePdf();},false);
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
  Uri uri(File file){return new Uri.Builder().scheme("content").authority("de.ahnsen.spd.v14.pdf").appendPath(file.getName()).build();}
  void openPdf(){try{File f=makePdf();Uri u=uri(f);Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(u,"application/pdf");intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("Anwesenheitsliste",u));startActivity(Intent.createChooser(intent,"PDF öffnen"));}catch(Exception e){toast("PDF konnte nicht geöffnet werden: "+e.getMessage());}}
  void sharePdf(){try{
    File f=makePdf();Uri u=uri(f);
    Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("application/pdf");intent.putExtra(Intent.EXTRA_SUBJECT,"SPD Ahnsen – Anwesenheitsliste "+showDate(val("date","")));
    intent.putExtra(Intent.EXTRA_TEXT,"Anbei die Anwesenheitsliste der "+(val("type","normal").equals("joint")?"gemeinsamen Fraktionssitzung":"Fraktionssitzung")+" vom "+showDate(val("date",""))+".");
    intent.putExtra(Intent.EXTRA_STREAM,u);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.setClipData(ClipData.newRawUri("Anwesenheitsliste",u));
    Intent gmail=new Intent(intent);gmail.setPackage("com.google.android.gm");
    try{startActivity(gmail);}catch(Exception e){startActivity(Intent.createChooser(intent,"PDF per E-Mail versenden"));}
  }catch(Exception e){toast("PDF-Versand nicht möglich: "+e.getMessage());}}
  void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
  @Override public void onBackPressed(){if(section.equals("preview"))edit();else if(section.equals("edit")){syncPlace();showHome();}else showHome();}
}
