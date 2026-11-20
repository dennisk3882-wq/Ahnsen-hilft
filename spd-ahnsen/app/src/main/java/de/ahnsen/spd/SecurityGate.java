package de.ahnsen.spd;

import android.app.*;
import android.content.*;
import android.os.Build;
import android.view.*;
import android.widget.*;

/** Optional Android device-credential lock. Device PIN / biometrics are verified by Android, not the app. */
final class SecurityGate {
  static final int REQUEST_UNLOCK=7912;
  private final MainActivity a;
  private boolean authenticating=false;
  SecurityGate(MainActivity host){a=host;}
  boolean available(){
    KeyguardManager manager=(KeyguardManager)a.getSystemService(Context.KEYGUARD_SERVICE);
    return manager!=null&&manager.isDeviceSecure();
  }
  boolean enabled(){return a.prefs.getBoolean("pref_lock",false);}
  void setEnabled(boolean enabled){
    if(enabled&&!available()){
      new AlertDialog.Builder(a).setTitle("Gerätesperre erforderlich")
        .setMessage("Lege zuerst eine Geräte-PIN oder ein Passwort in Android fest. Danach kannst du die App-Sperre einschalten.")
        .setPositiveButton("OK",null).show();
      return;
    }
    a.prefs.edit().putBoolean("pref_lock",enabled).apply();
    a.toast(enabled?"App-Sperre aktiviert":"App-Sperre deaktiviert");
  }
  void startup(){
    if(!enabled()){a.showHome();return;}
    a.init("locked");a.title("SPD Ahnsen");
    a.page.addView(a.text("Die Fraktionsdaten sind geschützt. Entsperre dein Smartphone, um die App zu öffnen.",16,a.MUTED,false));
    a.gap(a.page,18);
    a.addButton("Mit Gerätesperre entsperren",this::requestUnlock,true);
    requestUnlock();
  }
  void requestUnlock(){
    if(authenticating)return;
    KeyguardManager manager=(KeyguardManager)a.getSystemService(Context.KEYGUARD_SERVICE);
    if(manager==null||!manager.isDeviceSecure()){
      a.toast("Gerätesperre nicht eingerichtet");return;
    }
    if(Build.VERSION.SDK_INT>=30){
      try{
        android.hardware.biometrics.BiometricPrompt prompt=
          new android.hardware.biometrics.BiometricPrompt.Builder(a)
          .setTitle("SPD Ahnsen entsperren")
          .setSubtitle("Mit Fingerabdruck, Gesicht oder Geräte-PIN bestätigen")
          .setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG
            |android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL)
          .build();
        authenticating=true;
        prompt.authenticate(new android.os.CancellationSignal(),a.getMainExecutor(),
          new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback(){
            @Override public void onAuthenticationSucceeded(
              android.hardware.biometrics.BiometricPrompt.AuthenticationResult result){
              authenticating=false;a.showHome();
            }
            @Override public void onAuthenticationError(int code,CharSequence message){
              authenticating=false;startupWithoutPopup();
            }
          });
        return;
      }catch(Exception ignored){authenticating=false;}
    }
    Intent intent=manager.createConfirmDeviceCredentialIntent("SPD Ahnsen entsperren","Geschützte Fraktionsunterlagen öffnen");
    if(intent==null){a.toast("System konnte die Entsperrung nicht starten");return;}
    authenticating=true;
    try{a.startActivityForResult(intent,REQUEST_UNLOCK);}
    catch(Exception e){authenticating=false;startupWithoutPopup();}
  }
  void onResult(int result){
    authenticating=false;
    if(result==Activity.RESULT_OK)a.showHome();
    else startupWithoutPopup();
  }
  void startupWithoutPopup(){
    a.init("locked");a.title("SPD Ahnsen · gesperrt");
    a.page.addView(a.text("Bitte mit deiner Android-PIN bzw. der verfügbaren Geräteauthentifizierung entsperren.",16,a.MUTED,false));
    a.gap(a.page,20);
    a.addButton("Jetzt entsperren",this::requestUnlock,true);
  }
}
