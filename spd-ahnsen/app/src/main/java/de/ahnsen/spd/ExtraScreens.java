package de.ahnsen.spd;

import android.app.*;
import android.content.*;
import android.view.*;
import android.widget.*;
import android.graphics.Color;
import org.json.*;
import java.util.*;
import java.time.*;
import java.time.format.*;

/** Administration: people, appointments, council resolutions, statistics and exports. */
final class ExtraScreens {
  final MainActivity a;
  ExtraScreens(MainActivity host){a=host;}
  void subtitle(String msg){a.page.addView(a.text(msg,14,a.MUTED,false));a.gap(a.page,19);}
  void card(String title,String body,Runnable action){
    LinearLayout view=a.column();
    view.setPadding(a.dp(17),a.dp(16),a.dp(17),a.dp(16));
    view.setBackground(a.bg(Color.WHITE,14));
    view.addView(a.text(title,17,a.DARK,true));a.gap(view,7);
    view.addView(a.text(body,14,a.MUTED,false));
    a.page.addView(view);a.gap(a.page,10);
    view.setOnClickListener(v->action.run());
  }
  void people(){
    a.init("members");a.addButton("‹ Übersicht",a::showHome,false);
    a.title("Fraktionsmitglieder");subtitle("Aktive Mitglieder erscheinen in neuen Sitzungen. Bereits abgeschlossene Listen bleiben unverändert.");
    a.addButton("＋ Mitglied hinzufügen",()->memberEditor(null),true);
    JSONArray items=a.vault.members(true);
    for(int i=0;i<items.length();i++){
      JSONObject x=items.optJSONObject(i);if(x==null)continue;
      card(x.optString("name"),x.optBoolean("active",true)?"Aktiv · In neuen Anwesenheitslisten":"Inaktiv · Bleibt in bisherigen Listen",
        ()->memberEditor(x));
    }
  }
  void memberEditor(JSONObject original){
    LinearLayout wrapper=a.column();wrapper.setPadding(a.dp(18),a.dp(6),a.dp(18),a.dp(4));
    EditText name=new EditText(a);name.setSingleLine(true);name.setHint("Vor- und Nachname");
    name.setText(original==null?"":original.optString("name"));wrapper.addView(name);
    CheckBox active=new CheckBox(a);active.setText("Aktives Fraktionsmitglied");
    active.setChecked(original==null||original.optBoolean("active",true));wrapper.addView(active);
    new AlertDialog.Builder(a).setTitle(original==null?"Neues Mitglied":"Mitglied verwalten")
      .setView(wrapper).setNegativeButton("Abbrechen",null)
      .setPositiveButton("Speichern",(d,w)->{
        String n=name.getText().toString().trim();if(n.isEmpty()){a.toast("Ein Name ist erforderlich");return;}
        String id=original==null?UUID.randomUUID().toString():original.optString("id");
        int order=original==null?a.vault.members(true).length():original.optInt("order",0);
        a.vault.upsertMember(id,n,active.isChecked(),order);people();
      }).show();
  }
  void agenda(){
    a.init("appointments");a.addButton("‹ Übersicht",a::showHome,false);a.title("Termine");
    subtitle("Fraktions- und Ratstermine, Ort, Uhrzeit und wichtige Hinweise.");
    a.addButton("＋ Termin eintragen",()->appointmentEditor(null),true);
    JSONArray rows=a.vault.items("appointments");ArrayList<JSONObject> list=new ArrayList<>();
    for(int i=0;i<rows.length();i++)if(rows.optJSONObject(i)!=null)list.add(rows.optJSONObject(i));
    Collections.sort(list,(x,y)->x.optString("date").compareTo(y.optString("date")));
    for(JSONObject x:list){
      card(x.optString("title","Termin"),MainActivity.showDate(x.optString("date"))+" · "+x.optString("time")+" Uhr · "+x.optString("place"),
        ()->appointmentEditor(x));
    }
    if(list.isEmpty())subtitle("Noch keine Termine eingetragen.");
  }
  void appointmentEditor(JSONObject original){
    a.init("appointmentEditor");a.addButton("‹ Termine",this::agenda,false);
    a.title(original==null?"Termin erstellen":"Termin bearbeiten");
    a.label("Bezeichnung");EditText title=a.settingsInput(original==null?"":original.optString("title"),false);
    title.setHint("z. B. SPD-Fraktionssitzung");
    a.label("Datum (JJJJ-MM-TT)");
    EditText date=a.settingsInput(original==null?LocalDate.now().toString():original.optString("date"),false);
    date.setOnClickListener(v->{
      LocalDate selected;try{selected=LocalDate.parse(date.getText().toString());}catch(Exception e){selected=LocalDate.now();}
      new DatePickerDialog(a,(picker,y,m,d)->date.setText(String.format(Locale.GERMANY,"%04d-%02d-%02d",y,m+1,d)),
        selected.getYear(),selected.getMonthValue()-1,selected.getDayOfMonth()).show();
    });
    a.label("Beginn (HH:MM)");EditText time=a.settingsInput(original==null?"18:00":original.optString("time"),false);
    a.label("Ort");EditText place=a.settingsInput(original==null?"Ahnsen DGH":original.optString("place"),false);
    a.label("Hinweise");EditText notes=a.settingsInput(original==null?"":original.optString("notes"),true);
    a.addButton("Termin speichern",()->{
      String t=title.getText().toString().trim();if(t.isEmpty()){title.setError("Bitte Titel eintragen");return;}
      try{LocalDate.parse(date.getText().toString().trim());LocalTime.parse(time.getText().toString().trim());}
      catch(Exception e){a.toast("Bitte Datum und Zeit prüfen");return;}
      JSONObject x=original==null?new JSONObject():original;
      try{x.put("id",original==null?UUID.randomUUID().toString():original.optString("id"));
        x.put("title",t);x.put("date",date.getText().toString().trim());x.put("time",time.getText().toString().trim());
        x.put("place",place.getText().toString().trim());x.put("notes",notes.getText().toString());
      }catch(Exception e){}
      a.vault.saveItem("appointments",x);a.toast("Termin gespeichert");agenda();
    },true);
    if(original!=null){
      a.addButton("Im Android-Kalender öffnen",()->{
        try{LocalDate d=LocalDate.parse(original.optString("date"));
          LocalTime t=LocalTime.parse(original.optString("time"));
          long epoch=LocalDateTime.of(d,t).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
          Intent in=new Intent(Intent.ACTION_INSERT);
          in.setData(android.provider.CalendarContract.Events.CONTENT_URI);
          in.putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME,epoch);
          in.putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME,epoch+3600000);
          in.putExtra(android.provider.CalendarContract.Events.TITLE,original.optString("title"));
          in.putExtra(android.provider.CalendarContract.Events.EVENT_LOCATION,original.optString("place"));
          in.putExtra(android.provider.CalendarContract.Events.DESCRIPTION,original.optString("notes"));a.startActivity(in);
        }catch(Exception e){a.toast("Kalender konnte nicht geöffnet werden");}
      },false);
      a.addButton("Termin löschen",()->new AlertDialog.Builder(a).setTitle("Termin löschen?")
        .setMessage("Nur der Kalendereintrag in SPD Ahnsen wird gelöscht.")
        .setNegativeButton("Abbrechen",null).setPositiveButton("Löschen",(d,w)->{
          a.vault.removeItem("appointments",original.optString("id"));agenda();
        }).show(),false);
    }
  }
  void decisions(){
    a.init("resolutions");a.addButton("‹ Übersicht",a::showHome,false);a.title("Beschlüsse");
    subtitle("Eigenes Beschlussregister für deine Fraktionsarbeit. Abgeschlossene Anwesenheitslisten werden dadurch nicht verändert.");
    a.addButton("＋ Beschluss erfassen",()->resolutionEditor(null),true);
    JSONArray arr=a.vault.items("resolutions");
    for(int i=0;i<arr.length();i++){
      JSONObject x=arr.optJSONObject(i);if(x==null)continue;
      card(x.optString("title"),MainActivity.showDate(x.optString("date"))+" · "+x.optString("status","Offen"),
        ()->resolutionEditor(x));
    }
    if(arr.length()==0)subtitle("Noch keine Beschlüsse eingetragen.");
  }
  void resolutionEditor(JSONObject orig){
    a.init("resolutionEditor");a.addButton("‹ Beschlüsse",this::decisions,false);a.title(orig==null?"Beschluss erfassen":"Beschluss bearbeiten");
    a.label("Thema / Beschluss");EditText title=a.settingsInput(orig==null?"":orig.optString("title"),false);
    a.label("Datum (JJJJ-MM-TT)");EditText date=a.settingsInput(orig==null?LocalDate.now().toString():orig.optString("date"),false);
    date.setOnClickListener(v->{
      LocalDate d;try{d=LocalDate.parse(date.getText().toString());}catch(Exception e){d=LocalDate.now();}
      new DatePickerDialog(a,(p,y,m,day)->date.setText(String.format(Locale.GERMANY,"%04d-%02d-%02d",y,m+1,day)),
        d.getYear(),d.getMonthValue()-1,d.getDayOfMonth()).show();
    });
    a.label("Beschlusstext / Ergebnis");EditText outcome=a.settingsInput(orig==null?"":orig.optString("outcome"),true);
    a.label("Abstimmung (z. B. 5 Ja, 0 Nein, 0 Enthaltungen)");
    EditText votes=a.settingsInput(orig==null?"":orig.optString("votes"),false);
    a.label("Status");
    Spinner status=new Spinner(a);String[] states={"Offen","Beschlossen","In Umsetzung","Erledigt","Vertagt"};
    ArrayAdapter<String> adapter=new ArrayAdapter<>(a,android.R.layout.simple_spinner_dropdown_item,states);
    status.setAdapter(adapter);if(orig!=null){int idx=Arrays.asList(states).indexOf(orig.optString("status"));if(idx>=0)status.setSelection(idx);}
    a.page.addView(status);a.gap(a.page,18);
    a.addButton("Beschluss speichern",()->{
      if(title.getText().toString().trim().isEmpty()){title.setError("Bitte Thema eintragen");return;}
      try{LocalDate.parse(date.getText().toString().trim());}catch(Exception e){date.setError("Bitte Datum prüfen");return;}
      JSONObject x=orig==null?new JSONObject():orig;
      try{x.put("id",orig==null?UUID.randomUUID().toString():orig.optString("id"));x.put("title",title.getText().toString().trim());
        x.put("date",date.getText().toString().trim());x.put("outcome",outcome.getText().toString());
        x.put("votes",votes.getText().toString());x.put("status",status.getSelectedItem().toString());
      }catch(Exception e){}
      a.vault.saveItem("resolutions",x);a.toast("Beschluss gespeichert");decisions();
    },true);
    if(orig!=null)a.addButton("Eintrag löschen",()->new AlertDialog.Builder(a).setTitle("Beschlussregister-Eintrag löschen?")
      .setNegativeButton("Abbrechen",null).setPositiveButton("Löschen",(d,w)->{
        a.vault.removeItem("resolutions",orig.optString("id"));decisions();
      }).show(),false);
  }
  void statistics(){
    a.init("stats");a.addButton("‹ Übersicht",a::showHome,false);a.title("Statistik");
    JSONArray rows=a.vault.meetings();int normal=0,joint=0;
    HashMap<String,int[]> counters=new HashMap<>();
    for(int i=0;i<rows.length();i++){
      JSONObject s=rows.optJSONObject(i);if(s==null)continue;
      if(s.optString("type").equals("joint"))joint++;else normal++;
      JSONArray ids=s.optJSONArray("memberIds"),names=s.optJSONArray("memberNames"),p=s.optJSONArray("present");
      if(names==null||p==null)continue;
      for(int j=0;j<names.length();j++){
        String key=ids==null?names.optString(j):ids.optString(j,names.optString(j));
        int[] values=counters.get(key);if(values==null){values=new int[2];counters.put(key,values);}
        values[1]++;if(p.optBoolean(j))values[0]++;
      }
    }
    subtitle(rows.length()+" abgeschlossene Sitzungen insgesamt.");
    card("Fraktionssitzungen",""+normal+" abgeschlossene Protokolle",()->a.archive());
    card("Gemeinsame Fraktionssitzungen",""+joint+" abgeschlossene Protokolle",()->a.archive());
    a.gap(a.page,10);a.page.addView(a.text("Teilnahmequote",20,a.DARK,true));a.gap(a.page,14);
    JSONArray members=a.vault.members(true);
    for(int i=0;i<members.length();i++){
      JSONObject m=members.optJSONObject(i);if(m==null)continue;
      int[] v=counters.get(m.optString("id"));int arrived=v==null?0:v[0],total=v==null?0:v[1];
      String pct=total==0?"—":String.format(Locale.GERMANY,"%.0f %%",arrived*100.0/total);
      card(m.optString("name"),arrived+" von "+total+" Sitzungen · "+pct,()->{});
    }
    a.gap(a.page,8);
    a.addButton("Alle PDF-Listen als ZIP exportieren",()->a.exportCoordinator.exportPdfZip(),true);
    a.addButton("Teilnahmedaten als CSV exportieren",()->a.exportCoordinator.exportCsv(),false);
    a.page.addView(a.text("Die Prozentwerte beziehen sich auf die jeweils in der Sitzung hinterlegten Fraktionsmitglieder.",12,a.MUTED,false));
  }
}
