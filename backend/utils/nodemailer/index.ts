import nodemailer from 'nodemailer';
import { confirmationEmailHtml, resetPasswordHtml, deleteUserHtml } from './emailHtml.ts';
import { FRONTEND_URL } from '../config.ts';

/*
	Uses testAccount - mail doesn't really get sent, but instead prints
	an URL to console to preview the email.
*/
async function createTestTransporter() {
	const testAccount = await nodemailer.createTestAccount();
	return nodemailer.createTransport({
			host: testAccount.smtp.host,
			port: testAccount.smtp.port,
			secure: testAccount.smtp.secure,
			auth: {
				user: testAccount.user,
				pass: testAccount.pass
			}
	});
};

export async function sendConfirmationEmail(recipientEmail: string, token: string)
{
	try {
		const transporter = await createTestTransporter();
		const url = `${FRONTEND_URL}/confirm/${token}`;
		const html = confirmationEmailHtml(url, FRONTEND_URL);
		const info = await transporter.sendMail({
			from: '"No Reply" <no-reply@babylonpong.com>',
			to: recipientEmail,
			subject: "Confirm your email for BabylonPong",
			html: html
		});
		console.log('\x1b[0;32mPreview URL\x1b[0m: %s', nodemailer.getTestMessageUrl(info));
		return info.accepted.length > 0;
	} catch (error) {
		console.error('\x1b[0;31mError sending confirmation email\x1b[0m:', error);
		return false;
	}
};

export async function sendResetPasswordEmail(recipientEmail: string, token: string)
{
	try {
		const transporter = await createTestTransporter();
		const url = `${FRONTEND_URL}/reset-password/${token}`;
		const html = resetPasswordHtml(url, FRONTEND_URL);
		const info = await transporter.sendMail({
			from: '"No Reply" <no-reply@babylonpong.com>',
			to: recipientEmail,
			subject: "Reset your password for BabylonPong",
			html: html
		});
		console.log('\x1b[0;32mPreview URL\x1b[0m: %s', nodemailer.getTestMessageUrl(info));
		return info.accepted.length > 0;
	} catch (error) {
		console.error('\x1b[0;31mError sending confirmation email\x1b[0m:', error);
		return false;
	}
};

export async function sendDeleteEmail(recipientEmail: string, token: string)
{
	try {
		const transporter = await createTestTransporter();
		const url = `${FRONTEND_URL}/delete-user/${token}`;
		const html = deleteUserHtml(url, FRONTEND_URL);
		const info = await transporter.sendMail({
			from: '"No Reply" <no-reply@babylonpong.com>',
			to: recipientEmail,
			subject: "Reset your password for BabylonPong",
			html: html
		});
		console.log('\x1b[0;32mPreview URL\x1b[0m: %s', nodemailer.getTestMessageUrl(info));
		return info.accepted.length > 0;
	} catch (error) {
		console.error('\x1b[0;31mError sending confirmation email\x1b[0m:', error);
	}
}
