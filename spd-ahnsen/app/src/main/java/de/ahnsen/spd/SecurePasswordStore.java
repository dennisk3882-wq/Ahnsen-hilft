package de.ahnsen.spd;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;

/** Stores the separate Gmail app password encrypted with a non-exportable Android Keystore key. */
final class SecurePasswordStore {
  private static final String KEY_ALIAS="spd_ahnsen_gmail_smtp_key_v1";
  private static final String ENCRYPTED="smtp_password_encrypted";
  private static final String IV="smtp_password_iv";

  private SecurePasswordStore() {}

  private static SecretKey key() throws Exception {
    KeyStore store=KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if(store.containsAlias(KEY_ALIAS)) {
      KeyStore.SecretKeyEntry entry=(KeyStore.SecretKeyEntry)store.getEntry(KEY_ALIAS,null);
      return entry.getSecretKey();
    }
    KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256).build());
    return generator.generateKey();
  }

  static boolean configured(SharedPreferences prefs) {
    return prefs.contains(ENCRYPTED)&&prefs.contains(IV);
  }

  static void save(SharedPreferences prefs,String plaintext) throws Exception {
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE,key());
    byte[] encrypted=cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
    prefs.edit()
      .putString(ENCRYPTED,Base64.encodeToString(encrypted,Base64.NO_WRAP))
      .putString(IV,Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
      .apply();
  }

  static String load(SharedPreferences prefs) throws Exception {
    if(!configured(prefs))return null;
    byte[] encrypted=Base64.decode(prefs.getString(ENCRYPTED,""),Base64.DEFAULT);
    byte[] iv=Base64.decode(prefs.getString(IV,""),Base64.DEFAULT);
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
    return new String(cipher.doFinal(encrypted),StandardCharsets.UTF_8);
  }

  static void delete(SharedPreferences prefs) {
    prefs.edit().remove(ENCRYPTED).remove(IV).apply();
  }
}
