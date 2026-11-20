package de.ahnsen.spd;

import java.io.File;
import java.util.Date;
import java.util.Properties;
import javax.mail.Authenticator;
import javax.mail.Message;
import javax.mail.MessagingException;
import javax.mail.Multipart;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeBodyPart;
import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeMultipart;

/** Sends only after a direct user tap. Gmail SMTP TLS protects message transport. */
final class GmailSmtpSender {
  private GmailSmtpSender() {}

  static void send(String from,String appPassword,String to,String subject,String body,File attachment) throws Exception {
    Properties p=new Properties();
    p.put("mail.smtp.host","smtp.gmail.com");
    p.put("mail.smtp.port","465");
    p.put("mail.smtp.auth","true");
    p.put("mail.smtp.ssl.enable","true");
    p.put("mail.smtp.ssl.checkserveridentity","true");
    p.put("mail.smtp.ssl.protocols","TLSv1.2 TLSv1.3");
    p.put("mail.smtp.connectiontimeout","15000");
    p.put("mail.smtp.timeout","20000");
    p.put("mail.smtp.writetimeout","20000");

    Session s=Session.getInstance(p,new Authenticator(){
      @Override protected PasswordAuthentication getPasswordAuthentication(){
        return new PasswordAuthentication(from,appPassword);
      }
    });
    MimeMessage email=new MimeMessage(s);
    email.setFrom(new InternetAddress(from));
    email.setRecipient(Message.RecipientType.TO,new InternetAddress(to));
    email.setSubject(subject,"UTF-8");
    email.setSentDate(new Date());

    MimeBodyPart bodyPart=new MimeBodyPart();
    bodyPart.setText(body,"UTF-8");
    MimeBodyPart filePart=new MimeBodyPart();
    filePart.attachFile(attachment);
    filePart.setFileName(attachment.getName());
    Multipart parts=new MimeMultipart();
    parts.addBodyPart(bodyPart);
    parts.addBodyPart(filePart);
    email.setContent(parts);
    email.saveChanges();
    Transport.send(email);
  }
}
