import nodemailer, { type Transporter } from 'nodemailer';
import { confirmationEmailHtml, resetPasswordHtml, deleteUserHtml } from './emailHtml.ts';
import { FRONTEND_URL, MAIL_TRANSPORT_CONFIG, MAIL_FROM } from '../config.ts';

/*
	Falls back to nodemailer's Ethereal test account when no SMTP
	credentials are configured. Ethereal only prints preview URLs, so
	production must provide MAIL_* environment variables.
*/
async function createTestTransporter() {
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

let transporterPromise: Promise<Transporter> | null = null;

async function createTransporter() {
  if (MAIL_TRANSPORT_CONFIG) {
    return nodemailer.createTransport(MAIL_TRANSPORT_CONFIG);
  }
  return createTestTransporter();
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter();
  }
  return transporterPromise;
}

async function dispatchEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    html,
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('\x1b[0;32mPreview URL\x1b[0m: %s', previewUrl);
  }
  return info.accepted.length > 0;
}

export async function sendConfirmationEmail(recipientEmail: string, token: string) {
  try {
    const url = `${FRONTEND_URL}/confirm/${token}`;
    const html = confirmationEmailHtml(url, FRONTEND_URL);
    return await dispatchEmail({
      to: recipientEmail,
      subject: 'Confirm your email for BabylonPong',
      html,
    });
  } catch (error) {
    console.error('\x1b[0;31mError sending confirmation email\x1b[0m:', error);
    return false;
  }
}

export async function sendResetPasswordEmail(recipientEmail: string, token: string) {
  try {
    const url = `${FRONTEND_URL}/reset-password/${token}`;
    const html = resetPasswordHtml(url, FRONTEND_URL);
    return await dispatchEmail({
      to: recipientEmail,
      subject: 'Reset your password for BabylonPong',
      html,
    });
  } catch (error) {
    console.error('\x1b[0;31mError sending reset password email\x1b[0m:', error);
    return false;
  }
}

export async function sendDeleteEmail(recipientEmail: string, token: string) {
  try {
    const url = `${FRONTEND_URL}/delete-user/${token}`;
    const html = deleteUserHtml(url, FRONTEND_URL);
    return await dispatchEmail({
      to: recipientEmail,
      subject: 'Delete your BabylonPong account',
      html,
    });
  } catch (error) {
    console.error('\x1b[0;31mError sending delete account email\x1b[0m:', error);
    return false;
  }
}
