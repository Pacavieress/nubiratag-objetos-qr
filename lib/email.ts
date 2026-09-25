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
  // Timeouts acotados: un SMTP colgado no debe bloquear indefinidamente a
  // quien está esperando la respuesta (afecta a los dos usos de este
  // transporter compartido, verificación de registro incluida).
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 8000,
});

function escapeHtml(valor: string): string {
  const mapa: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return valor.replace(/[&<>"']/g, (c) => mapa[c] ?? c);
}

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

function plantillaBienvenidaAdmin(opts: {
  nombreAdmin: string;
  nombreColegio: string;
  urlLogin: string;
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
                <h1 style="margin:0; font-size:20px; color:#111827;">¡Hola, ${escapeHtml(opts.nombreAdmin)}!</h1>
                <p style="margin:12px 0 0 0; font-size:14px; line-height:1.5; color:#4b5563;">
                  Ya eres administrador de NubiraTag en <strong>${escapeHtml(opts.nombreColegio)}</strong>.
                </p>
                <p style="margin:12px 0 0 0; font-size:14px; line-height:1.5; color:#4b5563;">
                  Tu función principal es agregar o quitar a los funcionarios
                  encargados de escanear los objetos encontrados en el colegio.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;" align="center">
                <a href="${opts.urlLogin}" style="display:inline-block; background-color:#54A6D8; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; padding:12px 28px; border-radius:8px;">
                  Iniciar sesión
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function enviarCorreoBienvenidaAdmin(opts: {
  destinatario: string;
  nombreAdmin: string;
  nombreColegio: string;
}): Promise<void> {
  const urlLogin = new URL(
    "/login",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"
  ).toString();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.destinatario,
    subject: "Ya eres administrador en NubiraTag",
    html: plantillaBienvenidaAdmin({
      nombreAdmin: opts.nombreAdmin,
      nombreColegio: opts.nombreColegio,
      urlLogin,
    }),
  });
}

function botonMapa(latitud: number | null, longitud: number | null): string {
  if (latitud == null || longitud == null) return "";
  return `<div style="margin:16px 0 0 0; text-align:center;">
    <a href="https://www.google.com/maps?q=${latitud},${longitud}" style="display:inline-block; background-color:#54A6D8; color:#ffffff; text-decoration:none; font-size:13px; font-weight:600; padding:10px 20px; border-radius:8px;">
      Ver ubicación en el mapa
    </a>
  </div>`;
}

function plantillaHallazgo(opts: {
  nombreEstudiante: string;
  etiqueta: string | null;
  ubicacion: string;
  colegio: string;
  fecha: Date;
  nota: string | null;
  codigoRetiro: string;
  latitud: number | null;
  longitud: number | null;
}): string {
  const objeto = opts.etiqueta ? escapeHtml(opts.etiqueta) : "un objeto";
  const fechaTexto = opts.fecha.toLocaleString("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
  });

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
              <td style="padding:24px 32px 32px 32px;">
                <h1 style="margin:0; font-size:20px; color:#111827;">Encontramos un objeto</h1>
                <p style="margin:12px 0 0 0; font-size:14px; line-height:1.5; color:#4b5563;">
                  Encontramos ${objeto} de <strong>${escapeHtml(opts.nombreEstudiante)}</strong>
                  y quedó en <strong>${escapeHtml(opts.ubicacion)}</strong>,
                  ${escapeHtml(opts.colegio)}, el ${fechaTexto}.
                </p>
                <div style="margin:20px 0; padding:16px; background-color:#f4f5f7; border-radius:8px; text-align:center;">
                  <p style="margin:0 0 4px 0; font-size:12px; color:#6b7280;">Código de retiro</p>
                  <p style="margin:0; font-size:28px; font-weight:700; letter-spacing:6px; color:#111827;">${escapeHtml(opts.codigoRetiro)}</p>
                </div>
                <p style="margin:0; font-size:14px; line-height:1.5; color:#4b5563;">
                  Para retirar, muestra este código en <strong>${escapeHtml(opts.ubicacion)}</strong>: ${escapeHtml(opts.codigoRetiro)}
                </p>
                ${
                  opts.nota
                    ? `<p style="margin:12px 0 0 0; font-size:14px; line-height:1.5; color:#4b5563;">Nota del funcionario: ${escapeHtml(opts.nota)}</p>`
                    : ""
                }
                ${botonMapa(opts.latitud, opts.longitud)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function enviarCorreoHallazgo(opts: {
  destinatario: string;
  nombreEstudiante: string;
  etiqueta: string | null;
  ubicacion: string;
  colegio: string;
  fecha: Date;
  nota: string | null;
  codigoRetiro: string;
  latitud: number | null;
  longitud: number | null;
}): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.destinatario,
    subject: `Encontramos un objeto de ${opts.nombreEstudiante}`,
    html: plantillaHallazgo(opts),
  });
}

function plantillaRetiro(opts: {
  nombreEstudiante: string;
  etiqueta: string | null;
  ubicacion: string;
  colegio: string;
  fecha: Date;
  latitud: number | null;
  longitud: number | null;
}): string {
  const objeto = opts.etiqueta ? escapeHtml(opts.etiqueta) : "un objeto";
  const fechaTexto = opts.fecha.toLocaleString("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
  });

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
              <td style="padding:24px 32px 32px 32px;">
                <h1 style="margin:0; font-size:20px; color:#111827;">Retiraron un objeto</h1>
                <p style="margin:12px 0 0 0; font-size:14px; line-height:1.5; color:#4b5563;">
                  ${objeto} de <strong>${escapeHtml(opts.nombreEstudiante)}</strong> fue retirado
                  desde <strong>${escapeHtml(opts.ubicacion)}</strong>, ${escapeHtml(opts.colegio)},
                  el ${fechaTexto}.
                </p>
                ${botonMapa(opts.latitud, opts.longitud)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function enviarCorreoRetiro(opts: {
  destinatario: string;
  nombreEstudiante: string;
  etiqueta: string | null;
  ubicacion: string;
  colegio: string;
  fecha: Date;
  latitud: number | null;
  longitud: number | null;
}): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.destinatario,
    subject: `Retiraron un objeto de ${opts.nombreEstudiante}`,
    html: plantillaRetiro(opts),
  });
}
