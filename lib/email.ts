import nodemailer from "nodemailer";

// Mismo servidor SMTP que usa Nubira.cl.
const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function plantillaVerificacion(opts: {
  nombre: string;
  urlVerificacion: string;
}): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0; padding:0; background-color:#f4f5f7; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 0 32px; text-align:center;">
                <span style="font-size:24px; font-weight:600;">
                  <span style="color:#2c7bc0;">Nubira</span><span style="color:#ff914d;">Tag</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <h1 style="margin:0; font-size:20px; color:#111827;">¡Hola, ${opts.nombre}!</h1>
                <p style="margin:12px 0 0 0; font-size:14px; line-height:1.5; color:#4b5563;">
                  Gracias por registrarte en NubiraTag. Confirma tu correo para
                  activar tu cuenta y empezar a gestionar los objetos de tus
                  hijos.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;" align="center">
                <a href="${opts.urlVerificacion}" style="display:inline-block; background-color:#54A6D8; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; padding:12px 28px; border-radius:8px;">
                  Verificar mi correo
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <p style="margin:0; font-size:12px; line-height:1.5; color:#9ca3af;">
                  Este enlace vence en 24 horas. Si el botón no funciona, copia
                  y pega este link en tu navegador:<br />
                  <a href="${opts.urlVerificacion}" style="color:#54A6D8; word-break:break-all;">${opts.urlVerificacion}</a>
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

export async function enviarCorreoVerificacion(opts: {
  destinatario: string;
  nombre: string;
  token: string;
}): Promise<void> {
  const urlVerificacion = new URL(
    `/verificar/${opts.token}`,
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"
  ).toString();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.destinatario,
    subject: "Confirma tu correo en NubiraTag",
    html: plantillaVerificacion({ nombre: opts.nombre, urlVerificacion }),
  });
}
