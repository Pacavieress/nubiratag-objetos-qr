# PROJECT_SPEC.md — Sistema de recuperación de objetos perdidos con QR

> Especificación técnica inicial. Documento de contexto para Claude Code.
> Estado: **análisis y diseño cerrado, sin código aún.**
> Las decisiones marcadas **[CONFIRMAR]** son forks de producto/arquitectura que el desarrollador debe aprobar u override antes de programar.

---

## 1. Definición formal del problema

Un colegio pierde y acumula continuamente objetos y prendas de sus estudiantes (poleras, chaquetas, mochilas, botellas, calculadoras). El proceso actual de recuperación es informal: los objetos se juntan en Inspectoría/Recepción y dependen de que el estudiante los busque manualmente. Esto genera:

- Pérdida definitiva de objetos que nadie reclama.
- Trabajo manual del personal para identificar dueños.
- Nula trazabilidad de qué se encontró, dónde y cuándo.
- Sin canal proactivo que avise al dueño que su objeto apareció.

**Problema a resolver:** permitir que, al encontrar un objeto marcado, el personal del colegio identifique de forma privada a su dueño y le notifique automáticamente dónde retirarlo, sin exponer datos personales del estudiante ni del apoderado.

---

## 2. Propuesta de solución

Cada estudiante tiene ~5 códigos QR únicos (tokens aleatorios) que pega en sus pertenencias. El QR **no contiene ningún dato personal**, solo un identificador opaco.

Al encontrar un objeto, un funcionario escanea el QR: el sistema resuelve internamente al dueño, permite registrar la ubicación física donde quedó el objeto, y dispara una notificación (correo en MVP) al apoderado indicando dónde retirarlo. Todo el flujo queda registrado para trazabilidad.

**Principio rector:** minimización de datos. El QR es público por naturaleza; por lo tanto la superficie pública nunca expone PII, y las acciones sensibles (registrar hallazgo, notificar) requieren personal autenticado.

---

## 3. Usuarios y roles del sistema

| Rol | Descripción | MVP |
|-----|-------------|-----|
| **Admin colegio** | Gestiona estudiantes, genera/imprime QRs, administra usuarios y ubicaciones, ve historial. | Sí |
| **Funcionario / Inspector** | Escanea QR, registra ubicación del objeto, confirma retiro. Personal autenticado. | Sí |
| **Apoderado / Estudiante** | Recibe notificaciones. En MVP **no tiene cuenta**: solo recibe correo. Panel propio → etapa 2. | Solo como receptor |
| **Persona externa (scanner anónimo)** | Cualquiera que escanee el QR. Ve solo una página neutra sin datos. No puede disparar notificaciones. | Sí (pasivo) |

**[CONFIRMAR]** El apoderado NO tiene cuenta en el MVP. Se agrega en etapa 2.

---

## 4. Flujo completo (creación de estudiante y QR → recuperación de objeto)

1. **Alta de estudiante:** el admin crea el estudiante con datos mínimos (nombre, curso, contacto del apoderado).
2. **Generación de QR:** el sistema genera N tokens aleatorios asociados al estudiante y produce una hoja imprimible con los N QR.
3. **Etiquetado físico:** el estudiante/apoderado pega cada QR en un objeto y, opcionalmente, lo etiqueta en el sistema ("polerón", "mochila").
4. **Pérdida:** el objeto se extravía.
5. **Hallazgo:** un funcionario encuentra el objeto y escanea el QR con la cámara del celular → abre `https://app.../q/<token>`.
6. **Resolución interna:** el backend resuelve el token a un estudiante **sin mostrar datos** en la pantalla pública.
7. **Registro:** el funcionario (autenticado) selecciona la ubicación donde dejó el objeto y agrega nota opcional. Se crea un **hallazgo**.
8. **Notificación:** el sistema envía correo al apoderado: "Se encontró un objeto de [estudiante]. Retíralo en [ubicación]."
9. **Retiro:** el apoderado/estudiante retira el objeto; el funcionario marca el hallazgo como **retirado**.
10. **Trazabilidad:** todo el ciclo queda en el historial.

**Escaneo anónimo (persona externa):** paso 5 abre la página neutra ("Este objeto pertenece a un estudiante del colegio. Por favor déjalo en Inspectoría."). No permite registrar hallazgo ni notificar. Solo el personal autenticado ejecuta los pasos 7–9.

---

## 5. Funcionalidades del MVP

- CRUD de estudiantes (admin).
- Generación de N QR por estudiante + hoja imprimible (PNG/SVG).
- Etiquetado opcional del QR.
- Autenticación de personal (admin + funcionario).
- Página pública de escaneo (neutra, sin PII).
- Registro de hallazgo por funcionario autenticado (ubicación + nota).
- Catálogo de ubicaciones (Recepción, Inspectoría, Portería, etc.).
- Notificación por **correo** al apoderado.
- Estados de hallazgo (reportado → retirado).
- Historial/trazabilidad básico por estudiante y por QR.
- Revocación de QR.

---

## 6. Fuera del MVP (etapa 2+)

- Panel de apoderado/estudiante con login.
- Notificaciones por WhatsApp.
- Notificaciones web/PWA push.
- PWA instalable / scanner propio (innecesario: la cámara nativa abre la URL).
- Reportes/estadísticas avanzadas.
- Multi-colegio (multi-tenant).
- Autoservicio: que el apoderado reporte "encontré esto" desde el escaneo público (abre superficie de abuso; evaluar con moderación por staff).

---

## 7. Modelo de datos inicial

Tablas (MariaDB/MySQL):

**usuario** — personal autenticado
- `id` PK
- `email` UNIQUE
- `password_hash`
- `nombre`
- `rol` (`admin` | `funcionario`)
- `activo` BOOL
- `created_at`

**estudiante**
- `id` PK
- `nombre`
- `curso`
- `apoderado_nombre`
- `apoderado_email`
- `apoderado_telefono` (nullable, para WhatsApp futuro)
- `activo` BOOL
- `created_at`
- *(RUT omitido por minimización. **[CONFIRMAR]** si el colegio lo exige para cruce.)*

**qr_codigo**
- `id` PK
- `estudiante_id` FK → estudiante
- `token` UNIQUE (aleatorio, 128 bits)
- `etiqueta` (nullable: "polerón", "mochila")
- `estado` (`activo` | `revocado`)
- `created_at`

**ubicacion** — catálogo de puntos de retiro
- `id` PK
- `nombre` (Recepción, Inspectoría, Portería…)
- `activo` BOOL

**hallazgo**
- `id` PK
- `qr_codigo_id` FK → qr_codigo
- `ubicacion_id` FK → ubicacion
- `reportado_por` FK → usuario
- `nota` (nullable)
- `estado` (`reportado` | `retirado` | `descartado`)
- `created_at`
- `updated_at`

**notificacion**
- `id` PK
- `hallazgo_id` FK → hallazgo
- `canal` (`email` | `whatsapp` | `web`)
- `destinatario`
- `estado` (`pendiente` | `enviada` | `fallida`)
- `payload` (JSON)
- `enviada_at` (nullable)
- `created_at`

**Relaciones:**
- estudiante 1—N qr_codigo
- qr_codigo 1—N hallazgo
- hallazgo 1—N notificacion
- ubicacion 1—N hallazgo
- usuario 1—N hallazgo (reportado_por)

---

## 8. Arquitectura técnica recomendada (Next.js + MariaDB)

- **Next.js (App Router) + TypeScript** — frontend y backend en el mismo proyecto.
- **Route Handlers / Server Actions** para la lógica de API. Server Actions para mutaciones internas del panel; Route Handler público para el endpoint de escaneo.
- **ORM: Prisma** — tipado fuerte con TS, migraciones versionadas. Alternativa: `mysql2` directo (más control, menos ergonomía). Recomendado Prisma por mantenibilidad.
- **MariaDB** en el VPS de Hostinger.
- **Tailwind CSS** para UI.
- **Despliegue:** Next.js `standalone` + **PM2** detrás de **nginx** (reverse proxy + TLS con Let's Encrypt). Git/GitHub para versionado; deploy por `git pull` + `pm2 reload`.
- **Capa de notificaciones desacoplada** (ver punto 14) para enchufar WhatsApp después sin tocar el core.

Arquitectura deliberadamente simple: monolito Next.js, una base de datos, un proceso PM2. Sin microservicios ni colas en MVP (el envío de correo puede ser síncrono con reintento básico, o un cron liviano que procese `notificacion.estado = pendiente`).

---

## 9. Autenticación y autorización

- **No rodar auth casero.** Usar **Auth.js (NextAuth)** con proveedor Credentials (email + password) para el personal.
- Passwords con **bcrypt/argon2**.
- **Autorización por rol** vía middleware: rutas `/admin/**` solo `admin`; rutas de registro de hallazgo para `admin` + `funcionario`.
- Sesiones con cookies httpOnly + SameSite.
- El endpoint público de escaneo **no** requiere sesión, pero **no expone acciones sensibles** sin ella.

---

## 10. Generación y validación segura de QR

- **Token:** 128 bits de aleatoriedad criptográfica (`crypto.randomBytes`), codificado URL-safe. **Nunca** IDs secuenciales.
- El QR codifica una **URL**: `https://app.colegio.cl/q/<token>`.
- **Generación de imagen:** librería `qrcode` → SVG/PNG. Hoja imprimible con los N QR del estudiante + etiqueta legible ("Estudiante: [nombre] — no incluir en el QR, solo en la hoja del admin").
- **Validación:** al recibir `<token>`, el backend busca `qr_codigo` activo. Si no existe o está revocado → página neutra "código no válido". Nunca revela por qué.
- **Rate limiting** en `/q/<token>` para frenar enumeración y abuso.

---

## 11. Diseño del flujo de escaneo

- URL pública `/q/<token>`:
  - **Sin sesión:** página neutra, cero PII, mensaje de instrucción ("déjalo en Inspectoría").
  - **Con sesión (funcionario/admin):** además muestra formulario para registrar hallazgo (selector de ubicación + nota) y botón para notificar.
- La misma URL sirve a ambos; el contenido se decide server-side según sesión. Esto evita necesitar app o scanner propio: la cámara nativa del teléfono abre la URL.

---

## 12. Protección de la privacidad

- El QR **solo** contiene el token opaco.
- La superficie pública **nunca** muestra nombre, RUT, curso, correo, teléfono ni datos del apoderado.
- **Minimización:** guardar el mínimo de PII. RUT omitido por defecto.
- Datos del apoderado accesibles solo a personal autenticado y solo cuando es necesario para el flujo.
- **Cumplimiento legal (Chile):** Ley 19.628 y Ley 21.719 sobre datos personales; al tratarse de **menores**, se requiere consentimiento informado del apoderado. Definir con el colegio el proceso de consentimiento y quién es el responsable del tratamiento de datos.
- Notificaciones dirigidas al apoderado por defecto (titular del contacto de un menor).

---

## 13. Sistema de notificaciones por correo

- Proveedor SMTP transaccional (ej. servicio SMTP del colegio, o un proveedor tipo Resend/SES/SMTP de Hostinger).
- Al crear un `hallazgo`, se crea un registro `notificacion` (`canal=email`, `estado=pendiente`).
- Un **worker/cron liviano** (o envío síncrono con reintento) procesa pendientes, marca `enviada` o `fallida`, guarda `enviada_at`.
- Plantilla de correo: sin datos sensibles más allá del nombre del estudiante y la ubicación de retiro.
- Registro de todo envío para auditoría.

---

## 14. Preparación de arquitectura para WhatsApp (etapa 2)

- **Interfaz de canal** común: `NotificationChannel { send(notificacion): Promise<Result> }`.
- Implementaciones: `EmailChannel` (MVP), `WhatsappChannel` (etapa 2), `WebPushChannel` (etapa 2).
- Un **dispatcher** selecciona el/los canal(es) según preferencia del destinatario y estado del proveedor.
- La tabla `notificacion` ya contempla `canal` y `payload`, por lo que agregar WhatsApp no toca el modelo de datos ni el core del hallazgo: solo se implementa una nueva clase de canal.

---

## 15. Panel del estudiante/apoderado (etapa 2)

- Login del apoderado (magic link por correo recomendado sobre password, por baja fricción).
- Ver sus QR, etiquetarlos, revocarlos.
- Historial de hallazgos de sus objetos.
- Preferencia de canal de notificación.
- **No** forma parte del MVP.

---

## 16. Panel administrativo del colegio

- CRUD de estudiantes.
- Generación e impresión de QR.
- Gestión de usuarios (funcionarios) y ubicaciones.
- Vista de todos los hallazgos con filtros (estado, ubicación, fecha).
- Revocación de QR.
- Auditoría de notificaciones.

---

## 17. Panel/flujo del funcionario/inspector

- Login.
- Flujo principal = escanear QR → registrar ubicación → confirmar (dispara notificación).
- Lista de hallazgos abiertos para marcar retiro.
- UI móvil-first (escanean desde el celular).

---

## 18. Historial y trazabilidad

- Cada `hallazgo` guarda quién, qué QR, qué ubicación, cuándo, con timestamps de reporte y retiro.
- Cada `notificacion` guarda canal, destinatario, estado y momento de envío.
- Consultable por estudiante y por QR desde el panel admin.

---

## 19. Estados

**QR (`qr_codigo.estado`):**
- `activo` — asignado y en uso.
- `revocado` — dado de baja (estudiante egresó, QR perdido/dañado).

**Hallazgo (`hallazgo.estado`):**
- `reportado` — registrado, objeto en una ubicación, apoderado notificado.
- `retirado` — objeto entregado al dueño.
- `descartado` — falso positivo / duplicado.

---

## 20. Riesgos técnicos y de seguridad

- **Enumeración de tokens** → mitigar con aleatoriedad de 128 bits + rate limiting.
- **Spam de notificaciones** si el escaneo público pudiera notificar → por eso notificar solo con staff autenticado.
- **Fuga de PII** en la superficie pública → diseño neutro estricto, revisado.
- **Cuentas de personal comprometidas** → passwords fuertes, hashing moderno, sesiones seguras, posible 2FA a futuro.
- **Cumplimiento legal de datos de menores** → consentimiento y responsable de datos definidos con el colegio.
- **Deploy en VPS** → hardening del servidor, TLS obligatorio, backups de MariaDB.
- **Reintento/fallo de correo** → estados `pendiente/fallida` + reintento.

---

## 21. Casos de uso y casos excepcionales (probablemente olvidados)

- QR **ilegible/dañado** al escanear.
- Token **revocado** escaneado.
- Objeto encontrado **fuera del colegio** por un externo (escaneo anónimo → página neutra).
- Estudiante **egresado** con QR aún pegados → revocación masiva al dar de baja.
- **Múltiples hallazgos** del mismo QR sin retiro intermedio (mismo objeto reportado dos veces).
- Objeto reportado pero **nunca retirado** (política de expiración/purga a definir con el colegio).
- **QR reutilizado** en otro objeto (el token no está atado a un tipo de objeto: la etiqueta es informativa).
- Apoderado **sin correo válido** → hallazgo queda registrado igual, notificación `fallida`.
- Dos objetos con el **mismo QR** por error de pegado.

---

## 22. Información a solicitar al colegio antes de desarrollar

- Formato y volumen del padrón de estudiantes (cuántos alumnos → escala).
- Quiénes son los "funcionarios autorizados" y cuántos.
- Puntos físicos de retiro reales.
- Proceso y responsable del **consentimiento de datos** de menores (legal).
- Canal SMTP disponible para el envío de correos.
- ¿Requieren RUT u otro identificador para cruzar con sus registros?
- ¿Existe algún sistema interno con el que deba integrarse?
- Política de retención/purga de objetos no retirados.
- Quién es el propietario/responsable de los datos.

---

## 23. Estructura recomendada del proyecto Next.js

```
/app
  /(public)
    /q/[token]/page.tsx        # escaneo público (neutro / con acción si hay sesión)
  /(admin)
    /admin/estudiantes/...
    /admin/qr/...
    /admin/hallazgos/...
    /admin/usuarios/...
    /admin/ubicaciones/...
  /(auth)
    /login/...
  /api
    /q/[token]/route.ts        # resolución de token (si se separa del page)
    /notificaciones/route.ts   # worker/cron endpoint (opcional)
/lib
  /db.ts                       # cliente Prisma
  /auth.ts                     # config Auth.js
  /qr.ts                       # generación de token + imagen
  /notifications
    /channel.ts                # interfaz NotificationChannel
    /email.ts                  # EmailChannel
    /dispatcher.ts             # selección de canal
/prisma
  schema.prisma
  /migrations
/components
/middleware.ts                 # autorización por rol
```

---

## 24. Plan de desarrollo por etapas pequeñas y verificables

**Etapa 0 — Base**
- Proyecto Next.js + TS + Tailwind + Prisma + MariaDB local.
- `schema.prisma` con el modelo del punto 7. Migración inicial.

**Etapa 1 — Auth de personal**
- Auth.js (Credentials), roles, middleware de autorización.
- Login funcional para `admin` y `funcionario`.

**Etapa 2 — Estudiantes y QR**
- CRUD estudiantes.
- Generación de tokens + imágenes QR + hoja imprimible.
- Etiquetado y revocación de QR.

**Etapa 3 — Escaneo**
- Página pública `/q/[token]` neutra.
- Vista con acción para staff autenticado (registrar hallazgo + ubicación).

**Etapa 4 — Hallazgos**
- Registro, estados, historial, marcar retiro.
- Catálogo de ubicaciones.

**Etapa 5 — Notificaciones por correo**
- Interfaz de canal + EmailChannel + dispatcher.
- Registro `notificacion`, worker/cron de envío, reintentos.

**Etapa 6 — Panel admin y trazabilidad**
- Listados con filtros, auditoría de notificaciones.

**Etapa 7 — Deploy**
- VPS Hostinger: MariaDB, Next.js standalone + PM2 + nginx + TLS, backups.

**Etapa 8+ (post-MVP)**
- Panel apoderado, WhatsApp, PWA push.

---

## Decisiones a confirmar antes de programar

1. **[CONFIRMAR]** Escaneo público neutro + acciones sensibles solo con staff autenticado.
2. **[CONFIRMAR]** Apoderado sin cuenta en MVP (solo recibe correo).
3. **[CONFIRMAR]** PWA fuera del MVP (la cámara nativa abre la URL).
4. **[CONFIRMAR]** RUT omitido por minimización, salvo exigencia del colegio.
