package de.ahnsen.spd;
import android.content.*;
import android.database.*;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;
public class PdfProvider extends ContentProvider {
  public boolean onCreate(){return true;}
  File valid(Uri u)throws FileNotFoundException {
    if(u==null||u.getPathSegments().size()!=1)throw new FileNotFoundException();
    String name=u.getLastPathSegment();
    if(name==null||!name.matches("[A-Za-z0-9_.-]+")||!name.endsWith(".pdf")||name.contains(".."))throw new FileNotFoundException();
    File f=new File(new File(getContext().getCacheDir(),"pdfs"),name);
    if(!f.isFile())f=new File(new File(getContext().getFilesDir(),"sealed"),name);
    if(!f.isFile())throw new FileNotFoundException();return f;
  }
  public String getType(Uri u){return "application/pdf";}
  public ParcelFileDescriptor openFile(Uri u,String mode)throws FileNotFoundException {
    if(!"r".equals(mode))throw new FileNotFoundException();return ParcelFileDescriptor.open(valid(u),ParcelFileDescriptor.MODE_READ_ONLY);
  }
  public Cursor query(Uri u,String[] projection,String selection,String[] args,String order){
    try{File f=valid(u);String[] fields=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
      MatrixCursor out=new MatrixCursor(fields);Object[] row=new Object[fields.length];
      for(int i=0;i<fields.length;i++){if(fields[i].equals(OpenableColumns.DISPLAY_NAME))row[i]=f.getName();if(fields[i].equals(OpenableColumns.SIZE))row[i]=f.length();}
      out.addRow(row);return out;
    }catch(Exception e){return null;}
  }
  public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
  public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
  public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}