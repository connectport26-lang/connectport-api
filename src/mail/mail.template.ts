import type { EmailDetailRow } from './mail.context';

export function brandedEmailHtml(input: {
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Optional large OTP / code block */
  code?: string;
  /** Short highlighted needs blurb (already truncated by caller) */
  snippet?: string;
  /** Structured request context rows */
  details?: EmailDetailRow[];
}) {
  const codeBlock = input.code
    ? `<p style="margin:24px 0 0;letter-spacing:0.28em;font-size:28px;font-weight:700;color:#111111;text-align:center;background:#ffffff;border-radius:16px;padding:18px 12px;border:1px solid rgba(17,17,17,0.08);">
          ${escapeHtml(input.code)}
        </p>`
    : '';

  const snippetBlock = input.snippet
    ? `<div style="margin:20px 0 0;background:#ffffff;border-radius:16px;padding:14px 16px;border:1px solid rgba(17,17,17,0.08);">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6560;font-weight:600;">
            Your ask
          </p>
          <p style="margin:0;font-size:15px;line-height:1.45;color:#111111;font-weight:600;">
            ${escapeHtml(input.snippet)}
          </p>
        </div>`
    : '';

  const detailsBlock =
    input.details && input.details.length > 0
      ? `<div style="margin:20px 0 0;">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6560;font-weight:600;">
            Request details
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid rgba(17,17,17,0.08);overflow:hidden;">
            ${input.details
              .map(
                (row, index) => `
              <tr>
                <td style="padding:12px 16px;${index > 0 ? 'border-top:1px solid rgba(17,17,17,0.06);' : ''}vertical-align:top;width:34%;">
                  <span style="font-size:12px;color:#6b6560;">${escapeHtml(row.label)}</span>
                </td>
                <td style="padding:12px 16px;${index > 0 ? 'border-top:1px solid rgba(17,17,17,0.06);' : ''}vertical-align:top;">
                  <span style="font-size:13px;line-height:1.4;color:#111111;font-weight:600;word-break:break-word;">${escapeHtml(row.value)}</span>
                </td>
              </tr>`,
              )
              .join('')}
          </table>
        </div>`
      : '';

  const cta =
    input.ctaLabel && input.ctaUrl
      ? `<p style="margin:28px 0 0;">
          <a href="${escapeHtml(input.ctaUrl)}"
             style="display:inline-block;background:#3d5afe;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px;">
            ${escapeHtml(input.ctaLabel)}
          </a>
        </p>`
      : '';

  const bodyHtml = escapeHtml(input.body).replace(/\n/g, '<br />');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#b8c4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#b8c4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#f7f3ec;border-radius:28px;overflow:hidden;">
          <tr>
            <td style="padding:32px 28px 8px;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#111111;letter-spacing:-0.02em;">
                connectport
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 36px;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#111111;font-weight:600;">
                ${escapeHtml(input.headline)}
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.55;color:#6b6560;">
                ${bodyHtml}
              </p>
              ${snippetBlock}
              ${detailsBlock}
              ${codeBlock}
              ${cta}
              <p style="margin:32px 0 0;font-size:12px;color:#6b6560;">
                Tell us what you want. We'll handle the rest.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
