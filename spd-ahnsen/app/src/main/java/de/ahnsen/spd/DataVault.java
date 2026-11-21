package de.ahnsen.spd;

import android.content.*;
import android.database.*;
import android.database.sqlite.*;
import org.json.*;
import java.util.*;
import java.io.*;

/** Durable private SQLite storage. Finalized meeting records are insert-only. */
final class DataVault extends SQLiteOpenHelper {
  private final Context context;
  DataVault(Context c){super(c,"spd_ahnsen_v2.db",null,1);context=c.getApplicationContext();ensureInitialMembers();}
  @Override public void onCreate(SQLiteDatabase db){
    db.execSQL("CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created TEXT NOT NULL)");
    db.execSQL("CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL,ord INTEGER NOT NULL)");
    db.execSQL("CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY,payload TEXT NOT NULL)");
    db.execSQL("CREATE TABLE IF NOT EXISTS resolutions(id TEXT PRIMARY KEY,payload TEXT NOT NULL)");
    db.execSQL("CREATE TABLE IF NOT EXISTS mail_log(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,time TEXT,state TEXT,recipient TEXT,detail TEXT)");
  }
  @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){}
  void ensureInitialMembers(){
    SQLiteDatabase db=getWritableDatabase();
    try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM members",null)){
      if(c.moveToFirst()&&c.getInt(0)>0)return;
    }
    String[] names={"Matthias Hinse","Ole Grimmig","Dennis Koch","Thorben Hartmann","Frank Struckmeier"};
    String[] ids={"matthias-hinse","ole-grimmig","dennis-koch","thorben-hartmann","frank-struckmeier"};
    for(int i=0;i<names.length;i++)upsertMember(ids[i],names[i],true,i);
  }
  void upsertMember(String id,String name,boolean active,int order){
    ContentValues v=new ContentValues();v.put("id",id);v.put("name",name);v.put("active",active?1:0);v.put("ord",order);
    getWritableDatabase().insertWithOnConflict("members",null,v,SQLiteDatabase.CONFLICT_REPLACE);
  }
  JSONArray members(boolean includeInactive){
    JSONArray result=new JSONArray();
    String query="SELECT id,name,active,ord FROM members"+(includeInactive?"":" WHERE active=1")+" ORDER BY ord,name";
    try(Cursor c=getReadableDatabase().rawQuery(query,null)){
      while(c.moveToNext()){
        JSONObject x=new JSONObject();
        x.put("id",c.getString(0));x.put("name",c.getString(1));x.put("active",c.getInt(2)!=0);x.put("order",c.getInt(3));result.put(x);
      }
    }catch(Exception e){}return result;
  }
  /**
   * Explicit permanent archive deletion. Other finalized meetings remain immutable.
   * Stage the PDF before the database transaction, restoring it if the transaction fails.
   */
  boolean deleteArchivedMeeting(String id) throws IOException {
    if(id==null||!id.matches("[a-zA-Z0-9_-]{1,128}"))
      throw new IOException("Ungültige Sitzungskennung");
    SQLiteDatabase db=getWritableDatabase();
    if(!hasFinal(id))return false;
    File original=sealedFile(id);
    File staging=new File(original.getParentFile(),original.getName()+".pending-delete");
    if(staging.exists()&&!staging.delete())
      throw new IOException("Eine frühere Löschdatei konnte nicht entfernt werden");
    boolean moved=original.isFile();
    if(moved&&!original.renameTo(staging))
      throw new IOException("Die Original-PDF konnte nicht zum Löschen vorbereitet werden");
    boolean committed=false,transactionStarted=false;
    try{
      db.beginTransaction();transactionStarted=true;
      int removed=db.delete("sessions","id=?",new String[]{id});
      if(removed!=1)throw new IOException("Sitzung konnte nicht aus der Datenbank gelöscht werden");
      db.delete("mail_log","session_id=?",new String[]{id});
      db.setTransactionSuccessful();committed=true;
    }finally{
      if(transactionStarted)db.endTransaction();
      if(!committed&&moved&&staging.exists())staging.renameTo(original);
    }
    if(moved&&staging.exists()&&!staging.delete())
      throw new IOException("Sitzung gelöscht, aber die PDF-Restdatei konnte nicht entfernt werden");
    return true;
  }

  boolean hasFinal(String id){
    try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM sessions WHERE id=?",new String[]{id})){return c.moveToFirst();}
  }
  /** Refuse changes to existing archived meeting; only new finalized IDs may be inserted. */
  boolean insertFinal(JSONObject session){
    String id=session.optString("id","");if(id.isEmpty()||hasFinal(id))return false;
    ContentValues v=new ContentValues();v.put("id",id);v.put("payload",session.toString());
    v.put("created",session.optString("sealedAt",""));
    return getWritableDatabase().insertWithOnConflict("sessions",null,v,SQLiteDatabase.CONFLICT_IGNORE)!=-1;
  }
  JSONObject meeting(String id){
    try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM sessions WHERE id=?",new String[]{id})){
      if(c.moveToFirst())return new JSONObject(c.getString(0));
    }catch(Exception e){}return null;
  }
  JSONArray meetings(){
    JSONArray items=new JSONArray();
    try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM sessions ORDER BY created DESC",null)){
      while(c.moveToNext())items.put(new JSONObject(c.getString(0)));
    }catch(Exception e){}return items;
  }
  boolean exists(String table,String id){
    if(!table.equals("appointments")&&!table.equals("resolutions"))return false;
    try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM "+table+" WHERE id=?",new String[]{id})){return c.moveToFirst();}
  }
  void saveItem(String table,JSONObject item){
    if(!table.equals("appointments")&&!table.equals("resolutions"))throw new IllegalArgumentException("Unknown table");
    ContentValues v=new ContentValues();v.put("id",item.optString("id"));v.put("payload",item.toString());
    getWritableDatabase().insertWithOnConflict(table,null,v,SQLiteDatabase.CONFLICT_REPLACE);
  }
  void removeItem(String table,String id){
    if(table.equals("appointments")||table.equals("resolutions"))getWritableDatabase().delete(table,"id=?",new String[]{id});
  }
  JSONArray items(String table){
    JSONArray result=new JSONArray();
    if(!table.equals("appointments")&&!table.equals("resolutions"))return result;
    try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM "+table+" ORDER BY id DESC",null)){
      while(c.moveToNext())result.put(new JSONObject(c.getString(0)));
    }catch(Exception e){}return result;
  }
  JSONObject item(String table,String id){
    if(!table.equals("appointments")&&!table.equals("resolutions"))return null;
    try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM "+table+" WHERE id=?",new String[]{id})){
      if(c.moveToFirst())return new JSONObject(c.getString(0));
    }catch(Exception e){}return null;
  }
  void log(String sid,String state,String recipient,String detail){
    ContentValues v=new ContentValues();v.put("session_id",sid);
    v.put("time",java.time.ZonedDateTime.now().toString());
    v.put("state",state);v.put("recipient",recipient);v.put("detail",detail);
    getWritableDatabase().insert("mail_log",null,v);
  }
  JSONArray logs(String sid){
    JSONArray result=new JSONArray();
    String sql="SELECT time,state,recipient,detail FROM mail_log"+
      (sid==null?"":" WHERE session_id=?")+" ORDER BY id DESC";
    try(Cursor c=getReadableDatabase().rawQuery(sql,sid==null?null:new String[]{sid})){
      while(c.moveToNext()){JSONObject x=new JSONObject();x.put("time",c.getString(0));
        x.put("state",c.getString(1));x.put("recipient",c.getString(2));x.put("detail",c.getString(3));
        result.put(x);}
    }catch(Exception e){}return result;
  }
  boolean deliveryAccepted(String id){
    try(Cursor c=getReadableDatabase().rawQuery(
      "SELECT 1 FROM mail_log WHERE session_id=? AND state='accepted' LIMIT 1",new String[]{id})){
      return c.moveToFirst();
    }
  }
  String deliveryState(String id){
    try(Cursor c=getReadableDatabase().rawQuery(
      "SELECT state FROM mail_log WHERE session_id=? ORDER BY id DESC LIMIT 1",new String[]{id})){
      return c.moveToFirst()?c.getString(0):"unsent";
    }
  }
  File sealedFile(String id){
    File folder=new File(context.getFilesDir(),"sealed");if(!folder.exists())folder.mkdirs();
    // meeting IDs are UUID or timestamps, never user-controlled path components
    String safe=id.replaceAll("[^a-zA-Z0-9_-]","_");
    return new File(folder,safe+".pdf");
  }
  void installPdf(String id,File temporary)throws IOException {
    File target=sealedFile(id);
    File partial=new File(target.getParentFile(),target.getName()+".partial");
    try(InputStream in=new FileInputStream(temporary);OutputStream out=new FileOutputStream(partial)){
      byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))>0)out.write(chunk,0,n);
    }
    if(!partial.renameTo(target)){partial.delete();throw new IOException("PDF-Speicherung fehlgeschlagen");}
  }
  static String sha256(File f)throws Exception{
    java.security.MessageDigest md=java.security.MessageDigest.getInstance("SHA-256");
    try(InputStream in=new FileInputStream(f)){
      byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)md.update(b,0,n);
    }
    StringBuilder sb=new StringBuilder();for(byte b:md.digest())sb.append(String.format("%02x",b&255));return sb.toString();
  }
  JSONObject snapshot(){
    JSONObject out=new JSONObject();
    try{
      out.put("version",2);out.put("meetings",meetings());out.put("members",members(true));
      out.put("appointments",items("appointments"));out.put("resolutions",items("resolutions"));
      JSONArray logs=new JSONArray();
      try(Cursor c=getReadableDatabase().rawQuery("SELECT session_id,time,state,recipient,detail FROM mail_log ORDER BY id",null)){
        while(c.moveToNext()){
          JSONObject x=new JSONObject();x.put("sid",c.getString(0));x.put("time",c.getString(1));
          x.put("state",c.getString(2));x.put("to",c.getString(3));x.put("detail",c.getString(4));
          logs.put(x);
        }
      }
      out.put("logs",logs);
    }catch(Exception e){}return out;
  }
  int mergeSnapshot(JSONObject dump)throws Exception{
    if(dump.optInt("version",-1)!=2)throw new Exception("Nicht unterstütztes Sicherungsformat");
    int inserted=0;
    JSONArray members=dump.optJSONArray("members");
    if(members!=null)for(int i=0;i<members.length();i++){
      JSONObject x=members.optJSONObject(i);if(x==null)continue;
      String id=x.optString("id");if(id.isEmpty())continue;
      upsertMember(id,x.optString("name",""),x.optBoolean("active",true),x.optInt("order",i));
    }
    JSONArray sessions=dump.optJSONArray("meetings");
    if(sessions!=null)for(int i=0;i<sessions.length();i++){
      JSONObject x=sessions.optJSONObject(i);
      if(x!=null&&x.optBoolean("sealed",false)&&insertFinal(x))inserted++;
    }
    for(String table:new String[]{"appointments","resolutions"}){
      JSONArray data=dump.optJSONArray(table);
      if(data==null)continue;
      for(int i=0;i<data.length();i++){
        JSONObject x=data.optJSONObject(i);if(x!=null&&!exists(table,x.optString("id",""))&&!x.optString("id","").isEmpty())saveItem(table,x);
      }
    }
    JSONArray logs=dump.optJSONArray("logs");
    if(logs!=null)for(int i=0;i<logs.length();i++){
      JSONObject l=logs.optJSONObject(i);if(l==null)continue;
      ContentValues v=new ContentValues();
      v.put("session_id",l.optString("sid"));v.put("time",l.optString("time"));
      v.put("state",l.optString("state"));v.put("recipient",l.optString("to"));
      v.put("detail","Import: "+l.optString("detail"));
      getWritableDatabase().insert("mail_log",null,v);
    }
    return inserted;
  }
}
