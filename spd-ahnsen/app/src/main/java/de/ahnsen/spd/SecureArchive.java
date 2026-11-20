package de.ahnsen.spd;

import android.content.*;
import org.json.*;
import java.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import java.util.zip.*;

/** Portable encrypted archive. Never exports SMTP passwords or Android Keystore keys. */
final class SecureArchive {
  private static final byte[] MAGIC={'S','P','D','A','2'};
  private static final int ITERATIONS=210000,MAX_TOTAL=80*1024*1024;
  static final String[] PREFS={"email_to","gmail_sender","email_subject","email_body",
    "pdf_header","pdf_subtitle","pdf_footer","pref_lock","backup_last"};

  private static void put(ZipOutputStream zip,String path,byte[] content)throws IOException{
    ZipEntry entry=new ZipEntry(path);zip.putNextEntry(entry);zip.write(content);zip.closeEntry();
  }
  static byte[] makeZip(DataVault db,SharedPreferences prefs,boolean includeData)throws Exception{
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    try(ZipOutputStream zip=new ZipOutputStream(bytes)){
      if(includeData){
        JSONObject state=db.snapshot();
        state.put("backupDate",java.time.ZonedDateTime.now().toString());
        JSONObject config=new JSONObject();
        for(String key:PREFS)if(!key.equals("pref_lock")&&prefs.contains(key))config.put(key,prefs.getString(key,""));
        if(prefs.contains("draft"))state.put("draft",prefs.getString("draft",""));
        state.put("config",config);
        put(zip,"manifest.json",state.toString(2).getBytes(StandardCharsets.UTF_8));
      }
      JSONArray rows=db.meetings();
      StringBuilder csv=new StringBuilder("Datum;Art;Ort;Beginn;Ende;Anwesend;Unterschrieben;Status;Dokument-ID\n");
      for(int i=0;i<rows.length();i++){
        JSONObject item=rows.optJSONObject(i);if(item==null)continue;
        String id=item.optString("id");
        File pdf=db.sealedFile(id);
        if(pdf.isFile()){
          try(InputStream in=new FileInputStream(pdf)){
            ZipEntry entry=new ZipEntry("pdf/"+pdf.getName());zip.putNextEntry(entry);
            byte[] chunk=new byte[8192];int n;
            while((n=in.read(chunk))!=-1)zip.write(chunk,0,n);
            zip.closeEntry();
          }
        }
        JSONArray present=item.optJSONArray("present"),sigs=item.optJSONArray("signatures");
        int count=0,signed=0;
        if(present!=null)for(int m=0;m<present.length();m++)if(present.optBoolean(m)){
          count++;if(sigs!=null&&!sigs.optString(m,"").isEmpty())signed++;
        }
        String[] parts={item.optString("date"),item.optString("type"),item.optString("place"),
          item.optString("start"),item.optString("end"),""+count,""+signed,
          db.deliveryState(id),id};
        for(int p=0;p<parts.length;p++){
          if(p>0)csv.append(';');csv.append(parts[p].replace("; ",", ").replace(";"," ")
            .replace("\n"," ").replace("\r"," "));
        }
        csv.append('\n');
      }
      put(zip,"auswertung.csv",("\uFEFF"+csv).getBytes(StandardCharsets.UTF_8));
    }
    return bytes.toByteArray();
  }
  private static SecretKey key(char[] password,byte[] salt)throws Exception{
    PBEKeySpec spec=new PBEKeySpec(password,salt,ITERATIONS,256);
    try{return new SecretKeySpec(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
      .generateSecret(spec).getEncoded(),"AES");}
    finally{spec.clearPassword();}
  }
  static byte[] encrypt(byte[] plain,char[] password)throws Exception{
    if(password==null||password.length<10)throw new Exception("Backup-Passwort muss mindestens 10 Zeichen haben");
    byte[] salt=new byte[16],iv=new byte[12];
    SecureRandom random=new SecureRandom();random.nextBytes(salt);random.nextBytes(iv);
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE,key(password,salt),new GCMParameterSpec(128,iv));
    byte[] encrypted=cipher.doFinal(plain);
    ByteArrayOutputStream out=new ByteArrayOutputStream();
    out.write(MAGIC);out.write(salt);out.write(iv);out.write(encrypted);
    return out.toByteArray();
  }
  private static byte[] decrypt(byte[] bytes,char[] password)throws Exception{
    if(bytes.length<48)throw new Exception("Ungültige Backup-Datei");
    for(int i=0;i<MAGIC.length;i++)if(bytes[i]!=MAGIC[i])throw new Exception("Unbekanntes Backup-Format");
    byte[] salt=Arrays.copyOfRange(bytes,5,21),iv=Arrays.copyOfRange(bytes,21,33);
    byte[] encrypted=Arrays.copyOfRange(bytes,33,bytes.length);
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE,key(password,salt),new GCMParameterSpec(128,iv));
    try{return cipher.doFinal(encrypted);}
    catch(javax.crypto.AEADBadTagException ex){throw new Exception("Falsches Backup-Passwort oder beschädigte Datei");}
  }
  static int restore(DataVault db,SharedPreferences prefs,byte[] data,char[] password)throws Exception{
    byte[] plain=decrypt(data,password);
    if(plain.length>MAX_TOTAL)throw new Exception("Backup ist zu groß");
    JSONObject manifest=null;Map<String,byte[]> pdfs=new LinkedHashMap<>();
    int total=0;
    try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(plain))){
      ZipEntry entry;
      while((entry=zip.getNextEntry())!=null){
        String name=entry.getName();
        if(name.startsWith("/")||name.contains("..")||name.contains("\\"))
          throw new Exception("Ungültiger Dateiname im Backup");
        ByteArrayOutputStream buffer=new ByteArrayOutputStream();
        byte[] block=new byte[8192];int n;
        while((n=zip.read(block))!=-1){
          total+=n;if(total>MAX_TOTAL)throw new Exception("Backup-Inhalt überschreitet das Größenlimit");
          buffer.write(block,0,n);
        }
        if(name.equals("manifest.json"))manifest=new JSONObject(buffer.toString("UTF-8"));
        if(name.startsWith("pdf/")&&name.endsWith(".pdf")&&name.lastIndexOf('/')==3)
          pdfs.put(name.substring(4),buffer.toByteArray());
        zip.closeEntry();
      }
    }
    if(manifest==null||manifest.optInt("version",-1)!=2)throw new Exception("Die Sicherung ist nicht kompatibel");
    JSONArray sessions=manifest.optJSONArray("meetings");
    if(sessions==null)throw new Exception("Keine Sitzungsdaten gefunden");
    // Validate document hashes before mutating any records.
    for(int i=0;i<sessions.length();i++){
      JSONObject meeting=sessions.optJSONObject(i);if(meeting==null)continue;
      String id=meeting.optString("id");
      String pdfName=id.replaceAll("[^a-zA-Z0-9_-]","_")+".pdf";
      byte[] b=pdfs.get(pdfName);
      if(b==null)throw new Exception("PDF im Backup fehlt: "+id);
      MessageDigest sha=MessageDigest.getInstance("SHA-256");
      byte[] dig=sha.digest(b);StringBuilder hex=new StringBuilder();
      for(byte d:dig)hex.append(String.format("%02x",d&255));
      if(!hex.toString().equalsIgnoreCase(meeting.optString("pdfHash","")))
        throw new Exception("Prüfsumme der PDF stimmt nicht: "+id);
    }
    int inserted=db.mergeSnapshot(manifest);
    for(int i=0;i<sessions.length();i++){
      JSONObject meeting=sessions.optJSONObject(i);if(meeting==null)continue;
      String id=meeting.optString("id");
      File target=db.sealedFile(id);
      if(target.isFile())continue; // Existing finalized originals are never overwritten.
      String pdfName=id.replaceAll("[^a-zA-Z0-9_-]","_")+".pdf";
      byte[] pdf=pdfs.get(pdfName);
      if(pdf!=null)try(OutputStream out=new FileOutputStream(target)){out.write(pdf);}
    }
    JSONObject cfg=manifest.optJSONObject("config");
    if(cfg!=null){
      SharedPreferences.Editor e=prefs.edit();
      for(String k:PREFS)if(!k.equals("pref_lock")&&cfg.has(k)&&!prefs.contains(k))
        e.putString(k,cfg.optString(k));e.apply();
    }
    if(manifest.has("draft")&&!prefs.contains("draft"))
      prefs.edit().putString("draft",manifest.optString("draft")).apply();
    return inserted;
  }
}
