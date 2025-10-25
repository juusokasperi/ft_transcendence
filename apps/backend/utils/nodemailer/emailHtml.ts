type EmailTemplateOptions = {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  validityText: string;
  frontendUrl: string;
};

const renderEmailTemplate = ({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaUrl,
  validityText,
  frontendUrl,
}: EmailTemplateOptions): string => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#020617;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;color:#e2e8f0;">
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="width:100%;background-color:#020617;padding:20px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="max-width:600px;width:100%;background-color:#0f172a;border-radius:18px;padding:28px 36px;border:1px solid rgba(99,102,241,0.35);box-shadow:0 16px 40px rgba(2,6,23,0.65);">
            <tr>
              <td style="text-align:left;">
                <div style="display:inline-flex;padding:4px 12px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#fbbf24;background-color:rgba(251,191,36,0.08);border-radius:999px;margin-bottom:10px;">
                  Arcade Transcendence
                </div>
                <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#818cf8;font-weight:600;">${eyebrow}</p>
                <h1 style="margin:0 0 14px;font-size:22px;line-height:30px;color:#f8fafc;">${title}</h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#cbd5f5;">${description}</p>
                <div style="margin-bottom:22px;">
                  <a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;color:#f8fafc;background-image:linear-gradient(135deg,#2363eb,#8b5cf6);box-shadow:0 12px 28px rgba(35,99,235,0.45);">
                    ${ctaLabel}
                  </a>
                </div>
                <p style="margin:0 0 14px;font-size:12px;line-height:18px;color:#94a3b8;">${validityText}</p>
                <p style="margin:0 0 20px;font-size:12px;line-height:18px;color:#94a3b8;">If the button above does not work, copy and paste this secure link in your browser:<br /><a href="${ctaUrl}" style="color:#fbbf24;text-decoration:none;">${ctaUrl}</a></p>
                <hr style="border:none;height:1px;background-image:linear-gradient(90deg,rgba(99,102,241,0),rgba(99,102,241,0.7),rgba(99,102,241,0));margin:0 0 20px;" />
                <p style="margin:0;font-size:12px;line-height:18px;color:#94a3b8;">Need help? Visit <a href="${frontendUrl}" style="color:#f8fafc;text-decoration:none;font-weight:600;">Arcade Transcendence</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const confirmationEmailHtml = (confirmUrl: string, frontendUrl: string): string =>
  renderEmailTemplate({
    eyebrow: 'Ready Player One',
    title: 'Confirm your email to enter the arcade',
    description:
      'Thanks for creating an Arcade Transcendence account. Confirm your email so we can keep your games, stats, and friends safe.',
    ctaLabel: 'Confirm email',
    ctaUrl: confirmUrl,
    validityText: "This link stays active for 24 hours. If you didn't create this account, please ignore this email.",
    frontendUrl,
  });

export const resetPasswordHtml = (resetUrl: string, frontendUrl: string): string =>
  renderEmailTemplate({
    eyebrow: 'Security Check',
    title: 'Reset your Arcade Transcendence password',
    description:
      'We received a request to reset your password. Use the secure button below to choose a new one and get back to the action.',
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
    validityText: "This link is valid for 30 minutes. If you didn’t request a reset, you can safely ignore this message.",
    frontendUrl,
  });

export const deleteUserHtml = (deleteUrl: string, frontendUrl: string): string =>
  renderEmailTemplate({
    eyebrow: 'Account Safety',
    title: 'Confirm your account deletion request',
    description:
      'You asked us to permanently delete your Arcade Transcendence profile. This action removes all data and cannot be undone.',
    ctaLabel: 'Delete my account',
    ctaUrl: deleteUrl,
    validityText: "The confirmation link works for 24 hours. If you didn’t ask for this, please change your password and ignore the email.",
    frontendUrl,
  });

export const emailChangeHtml = (confirmUrl: string, frontendUrl: string): string =>
  renderEmailTemplate({
    eyebrow: 'Stay Secure',
    title: 'Confirm your new email address',
    description:
      'We just need you to confirm that this new email belongs to you. Once approved, it will replace the address on your Arcade Transcendence account.',
    ctaLabel: 'Confirm new email',
    ctaUrl: confirmUrl,
    validityText: "This link remains active for 24 hours. If you didn’t request the change, please secure your account immediately.",
    frontendUrl,
  });
