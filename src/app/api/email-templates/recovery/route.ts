/**
 * The password-reset e-mail, fetched by GoTrue (GOTRUE_MAILER_TEMPLATES_RECOVERY).
 *
 * GoTrue's own mail links to its /verify endpoint, which hands the session
 * back as a PKCE code — usable only in the very browser that asked for the
 * reset. A reset requested in the iOS app, or in the home-screen web app
 * and opened from Mail in Safari, would fail. Linking straight to
 * /wachtwoord-herstellen with the token hash works from any device: that
 * page verifies it itself.
 *
 * The {{ … }} parts are Go template fields, filled in by GoTrue.
 */
const TEMPLATE = `<!doctype html>
<html lang="nl">
  <body style="margin:0;padding:0;background:#07131f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07131f;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#102638;border-radius:24px;padding:32px;">
            <tr>
              <td style="color:#f4f7f9;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2ee6b0;">Snatzee!</p>
                <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#f4f7f9;">Nieuw wachtwoord kiezen</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#91a4b5;">
                  Je vroeg om een nieuw wachtwoord voor {{ .Email }}. Tik op de knop om er een te kiezen. De link werkt één keer.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="{{ .SiteURL }}/wachtwoord-herstellen?token_hash={{ .TokenHash }}&amp;type=recovery"
                     style="display:inline-block;background:#24c79a;color:#04131f;font-size:16px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:999px;">
                    Nieuw wachtwoord kiezen
                  </a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#667a8a;">
                  Heb je dit niet aangevraagd? Dan kun je deze mail negeren; je wachtwoord blijft hetzelfde.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`

export function GET() {
  return new Response(TEMPLATE, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
