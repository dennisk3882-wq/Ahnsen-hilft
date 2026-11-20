package de.ahnsen.spd;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.view.*;
import android.widget.*;
import android.text.InputType;
import org.json.*;
import java.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Uses the Android document picker; no external storage permission required. */
final class ExportCoordinator {
  static final int BACKUP_SAVE=7091,ZIP_SAVE=7092,CSV_SAVE=7093,BACKUP_LOAD=7094;
  private final MainActivity a;
  private byte[] pendingBytes;
  private String pendingName;
  ExportCoordinator(MainActivity host){a=host;}
  private void showError(String message){
    new AlertDialog.Builder(a).setTitle("Dateiaktion fehlgeschlagen").setMessage(message)
      .setPositiveButton("OK",null).show();
  }
  private void saveDocument(int request,String name,String mime,byte[] bytes){
    pendingBytes=bytes;pendingName=name;
    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.setType(mime);intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.putExtra(Intent.EXTRA_TITLE,name);
    a.startActivityForResult(intent,request);
  }
  private EditText passwordInput(){
    EditText field=new EditText(a);
    field.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
    field.setHint("Mindestens 10 Zeichen");
    field.setPadding(a.dp(18),a.dp(14),a.dp(18),a.dp(14));return field;
  }
  void backup(){
    EditText secret=passwordInput();
    LinearLayout wrapper=a.column();wrapper.setPadding(a.dp(15),0,a.dp(15),0);wrapper.addView(secret);
    new AlertDialog.Builder(a).setTitle("Verschlüsseltes Backup erstellen")
      .setMessage("Sichere Sitzungen, Original-PDFs, Mitglieder, Termine, Beschlüsse und Vorlagen. Das Google-App-Passwort wird nicht exportiert. Merke dir das Backup-Passwort.")
      .setView(wrapper).setNegativeButton("Abbrechen",null)
      .setPositiveButton("Backup-Datei auswählen",(d,w)->{
        char[] password=secret.getText().toString().toCharArray();
        if(password.length<10){a.toast("Mindestens 10 Zeichen erforderlich");return;}
        try{
          byte[] data=SecureArchive.encrypt(SecureArchive.makeZip(a.vault,a.prefs,true),password);
          saveDocument(BACKUP_SAVE,"SPD_Ahnsen_Backup_"+java.time.LocalDate.now()+".spda","application/octet-stream",data);
        }catch(Exception e){showError(e.getMessage());}
        finally{Arrays.fill(password,'\0');}
      }).show();
  }
  void restore(){
    new AlertDialog.Builder(a).setTitle("Backup wiederherstellen")
      .setMessage("Sicherungsdaten werden eingelesen. Vorhandene endgültige Sitzungen bleiben unverändert; neue Datensätze werden ergänzt. Das App-Passwort für Gmail musst du danach gegebenenfalls separat einrichten.")
      .setNegativeButton("Abbrechen",null)
      .setPositiveButton("Backup auswählen",(d,w)->{
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("*/*");intent.addCategory(Intent.CATEGORY_OPENABLE);
        a.startActivityForResult(intent,BACKUP_LOAD);
      }).show();
  }
  void exportPdfZip(){
    try{saveDocument(ZIP_SAVE,"SPD_Ahnsen_Archiv_"+java.time.LocalDate.now()+".zip",
      "application/zip",SecureArchive.makeZip(a.vault,a.prefs,false));}
    catch(Exception e){showError(e.getMessage());}
  }
  void exportCsv(){
    StringBuilder csv=new StringBuilder("\uFEFFDatum;Sitzungsart;Ort;Beginn;Ende;Name;Anwesend;Unterschrift;Dokument-ID\r\n");
    JSONArray rows=a.vault.meetings();
    for(int i=0;i<rows.length();i++){
      JSONObject s=rows.optJSONObject(i);if(s==null)continue;
      JSONArray names=s.optJSONArray("memberNames"),p=s.optJSONArray("present"),sign=s.optJSONArray("signatures");
      if(names==null||p==null)continue;
      for(int j=0;j<names.length();j++){
        String[] columns={s.optString("date"),s.optString("type"),s.optString("place"),s.optString("start"),
          s.optString("end"),names.optString(j),p.optBoolean(j)?"Ja":"Nein",
          sign!=null&&!sign.optString(j,"").isEmpty()?"Ja":"Nein",s.optString("id")};
        for(int k=0;k<columns.length;k++){
          if(k>0)csv.append(';');
          csv.append('"').append(columns[k].replace("\n"," ").replace("\r"," ").replace("\"","\"\"")).append('"');
        }
        csv.append("\r\n");
      }
    }
    saveDocument(CSV_SAVE,"SPD_Ahnsen_Anwesenheit_"+java.time.LocalDate.now()+".csv",
      "text/csv",csv.toString().getBytes(StandardCharsets.UTF_8));
  }
  void onResult(int req,int result,Intent data){
    if(result!=Activity.RESULT_OK||data==null||data.getData()==null){pendingBytes=null;return;}
    Uri uri=data.getData();
    if(req==BACKUP_LOAD){requestRestorePassword(uri);return;}
    if(pendingBytes==null)return;
    try(OutputStream stream=a.getContentResolver().openOutputStream(uri)){
      if(stream==null)throw new IOException("Ausgabedatei nicht geöffnet");
      stream.write(pendingBytes);stream.flush();
      if(req==BACKUP_SAVE)a.prefs.edit().putString("backup_last",java.time.ZonedDateTime.now().toString()).apply();
      a.toast("Datei erfolgreich gespeichert");
    }catch(Exception e){showError(e.getMessage());}
    finally{pendingBytes=null;pendingName=null;}
  }
  void requestRestorePassword(Uri uri){
    EditText secret=passwordInput();
    LinearLayout wrapper=a.column();wrapper.setPadding(a.dp(15),0,a.dp(15),0);wrapper.addView(secret);
    new AlertDialog.Builder(a).setTitle("Backup-Passwort eingeben")
      .setMessage("Das Passwort wird nur zum Entschlüsseln dieser Datei verwendet.")
      .setView(wrapper).setNegativeButton("Abbrechen",null)
      .setPositiveButton("Wiederherstellen",(d,w)->{
        char[] password=secret.getText().toString().toCharArray();
        try(InputStream in=a.getContentResolver().openInputStream(uri)){
          if(in==null)throw new IOException("Backup konnte nicht geöffnet werden");
          ByteArrayOutputStream out=new ByteArrayOutputStream();
          byte[] chunk=new byte[8192];int n;
          while((n=in.read(chunk))!=-1){if(out.size()+n>85*1024*1024)throw new IOException("Backup ist zu groß");out.write(chunk,0,n);}
          int count=SecureArchive.restore(a.vault,a.prefs,out.toByteArray(),password);
          new AlertDialog.Builder(a).setTitle("Wiederherstellung abgeschlossen")
            .setMessage(count+" neue abgeschlossene Sitzungen übernommen. Vorhandene Originale wurden nicht überschrieben.")
            .setPositiveButton("OK",(dlg,which)->a.showHome()).show();
        }catch(Exception e){showError(e.getMessage());}
        finally{Arrays.fill(password,'\0');}
      }).show();
  }
}
