# PROJECT_SPEC.md — Sistema de recuperación de objetos perdidos con QR

> Especificación técnica inicial. Documento de contexto para Claude Code.
> Estado: **análisis y diseño cerrado, sin código aún.**
> Las decisiones marcadas **[CONFIRMAR]** son forks de producto/arquitectura que el desarrollador debe aprobar u override antes de programar. Las marcadas **[CONFIRMADO]** ya fueron resueltas y sobrescriben una decisión anterior.
>
> **Revisión 2026-09-16 (1):** se invierte el modelo de apoderado (pasa a tener cuenta propia) y se incorpora multi-colegio a nivel de datos. Ver el detalle en cada sección afectada y el resumen de reordenamiento en el punto 24.
> **Revisión 2026-09-16 (2):** se elimina el "admin por colegio" — el rol `admin` pasa a ser un administrador único y global de la plataforma (`colegio_id` NULL), dueño del sistema. Crea colegios, cuentas de funcionario y ubicaciones por colegio; no accede a PII nominal de menores. Ver puntos 3, 7, 9, 12, 16, 17, 23 y 24.
> **Revisión 2026-09-21:** excepción puntual al punto 6 — se agrega un escáner de cámara **dentro del panel** del funcionario (`/funcionario/escanear`), aunque el punto 6 marcaba "scanner propio" como innecesario/fuera del MVP. Motivo: agiliza el flujo sin depender de que el celular abra la app de cámara del sistema operativo. No reemplaza ni duplica la validación de `/q/[token]`: el escáner solo decodifica el QR y navega a esa misma URL, que sigue siendo el único lugar donde se valida pertenencia por colegio y se registra el hallazgo. Ver puntos 6, 11 y 17.

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
| **Administrador de plataforma** (`admin`) | **Único y global** — es el dueño/desarrollador del sistema, no pertenece a ningún colegio (`colegio_id` NULL). Gestiona colegios, sus códigos de registro, crea y administra las cuentas de `funcionario` de cada colegio, y configura las ubicaciones por colegio. **No** accede a la lista nominal de estudiantes ni apoderados (ver punto 12). No existe un rol de admin del lado del colegio — el colegio solo aporta los funcionarios que escanean. | Sí |
| **Funcionario / Inspector** | Escanea QR, registra ubicación del objeto, confirma retiro. Personal autenticado, con cuenta creada por el admin, ligado a un colegio (`colegio_id` no nulo). | Sí |
| **Apoderado** | Rol logueable, con cuenta propia. Se registra con el código de registro de un colegio y queda ligado a él. Agrega a sus hijos (estudiantes), genera y asigna sus códigos QR, recibe notificaciones. | Sí |
| **Persona externa (scanner anónimo)** | Cualquiera que escanee el QR. Ve solo una página neutra sin datos. No puede disparar notificaciones. | Sí (pasivo) |

**[CONFIRMADO]** El apoderado **SÍ** tiene cuenta en el MVP (rol logueable) — se invierte la decisión anterior de "apoderado sin cuenta".

**[CONFIRMADO]** Se elimina el concepto de "admin por colegio". El `admin` es un administrador **global de plataforma**, único — no hay un admin del lado de cada colegio.

---

## 4. Flujo completo (registro de apoderado → recuperación de objeto)

1. **Registro del apoderado:** se registra con el **código de registro del colegio** (un código por colegio, no por curso) y queda ligado a ese colegio.
2. **Alta de estudiante:** el **apoderado** agrega a su(s) hijo(s) con datos mínimos (nombre, curso opcional/autodeclarado).
3. **Generación de QR:** el **apoderado** genera N tokens aleatorios asociados al estudiante y descarga una hoja/PDF imprimible con los N QR. El token lleva el `colegio_id` en la base de datos, **no** en la URL.
4. **Etiquetado físico:** el apoderado/estudiante pega cada QR en un objeto y, opcionalmente, lo etiqueta en el sistema ("polerón", "mochila").
5. **Pérdida:** el objeto se extravía.
6. **Hallazgo:** un funcionario encuentra el objeto y escanea el QR con la cámara del celular → abre `https://app.../q/<token>`.
7. **Resolución interna:** el backend resuelve el token a un estudiante (y su colegio) **sin mostrar datos** en la pantalla pública.
8. **Registro:** el funcionario (autenticado) selecciona la ubicación donde dejó el objeto y agrega nota opcional. **El sistema valida server-side que el `colegio_id` del funcionario coincida con el `colegio_id` del `qr_codigo`; si no coincide, la acción se rechaza.** Se crea un **hallazgo**.
9. **Notificación:** el sistema envía correo al apoderado: "Se encontró un objeto de [estudiante]. Retíralo en [ubicación]."
10. **Retiro:** el apoderado/estudiante retira el objeto; el funcionario marca el hallazgo como **retirado**.
11. **Trazabilidad:** todo el ciclo queda en el historial.

**Escaneo anónimo (persona externa):** el paso 6 abre la página neutra ("Este objeto pertenece a un estudiante del colegio. Por favor déjalo en Inspectoría."). No permite registrar hallazgo ni notificar. Solo el personal autenticado ejecuta los pasos 8–10.

---

## 5. Funcionalidades del MVP

- Registro de apoderado con código de registro del colegio (login propio).
- CRUD de estudiantes (apoderado, sobre sus propios hijos).
- Generación de N QR por estudiante (apoderado) + hoja/PDF imprimible.
- Etiquetado opcional del QR.
- Autenticación de personal (admin + funcionario) y de apoderados.
- Página pública de escaneo (neutra, sin PII).
- Registro de hallazgo por funcionario autenticado (ubicación + nota), con validación de `colegio_id`.
- Catálogo de ubicaciones (Recepción, Inspectoría, Portería, etc.).
- Notificación por **correo** al apoderado.
- Estados de hallazgo (reportado → retirado).
- Historial/trazabilidad básico por estudiante y por QR (vista admin).
- Revocación de QR.
- Multi-colegio a nivel de datos (aislamiento server-side por `colegio_id`).
- Gestión de colegio y su código de registro (admin).

---

## 6. Fuera del MVP (etapa 2+)

- Notificaciones por WhatsApp.
- Notificaciones web/PWA push.
- PWA instalable (sigue fuera del MVP). *(**Excepción, revisión 2026-09-21:** el escáner de cámara **sí** se implementa dentro del panel del funcionario en `/funcionario/escanear` — ver punto 11 —, como atajo adicional; la cámara nativa del sistema operativo abriendo `/q/<token>` directamente sigue funcionando igual y sin cambios.)*
- Reportes/estadísticas avanzadas.
- Autoservicio: que el apoderado reporte "encontré esto" desde el escaneo público (abre superficie de abuso; evaluar con moderación por staff).
- Vista de **historial de hallazgos dentro del panel del apoderado** — el evento de escaneo/hallazgo se persiste desde el día uno en la base de datos; lo que se difiere es únicamente la superficie de consulta para el apoderado.

---

## 7. Modelo de datos inicial

Tablas (MariaDB/MySQL):

**colegio** *(entidad nueva)*
- `id` PK
- `nombre`
- `codigo_registro` UNIQUE
- `activo` BOOL
- `created_at`

**usuario** — personal autenticado y apoderados (unificados en la misma tabla)
- `id` PK
- `email` UNIQUE
- `password_hash`
- `nombre`
- `rol` (`admin` | `funcionario` | `apoderado`)
- `colegio_id` FK → colegio, **nullable**: `NULL` únicamente para `rol = admin` (administrador global de plataforma, no pertenece a ningún colegio); **obligatorio** (not null) para `funcionario` y `apoderado`. A nivel de aplicación (o `CHECK` constraint si el motor lo soporta): `rol = 'admin' ⇒ colegio_id IS NULL`, `rol IN ('funcionario', 'apoderado') ⇒ colegio_id IS NOT NULL`.
- `activo` BOOL
- `created_at`

**estudiante**
- `id` PK
- `nombre`
- `curso` (opcional, autodeclarado por el apoderado)
- `apoderado_id` FK → usuario
- `colegio_id` FK → colegio
- `activo` BOOL
- `created_at`
- *(RUT omitido por minimización. **[CONFIRMAR]** si el colegio lo exige para cruce. Campos `apoderado_nombre`/`apoderado_email`/`apoderado_telefono` del modelo anterior se eliminan: esos datos ahora viven en `usuario` vía `apoderado_id`.)*

**qr_codigo**
- `id` PK
- `estudiante_id` FK → estudiante
- `colegio_id` FK → colegio
- `token` UNIQUE (aleatorio, 128 bits, **totalmente opaco, sin prefijo visible**)
- `etiqueta` (nullable: "polerón", "mochila")
- `estado` (`activo` | `revocado`)
- `created_at`

**ubicacion** — catálogo de puntos de retiro, **por colegio**
- `id` PK
- `colegio_id` FK → colegio
- `nombre` (Recepción, Inspectoría, Portería…)
- `activo` BOOL
- *(Antes era un catálogo único compartido; con el admin de plataforma configurando ubicaciones por colegio, cada colegio tiene su propio set — resuelve un punto que había quedado abierto en una revisión anterior de esta spec.)*

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
- colegio 1—N usuario
- colegio 1—N estudiante
- colegio 1—N qr_codigo
- colegio 1—N ubicacion
- usuario (apoderado) 1—N estudiante
- estudiante 1—N qr_codigo
- qr_codigo 1—N hallazgo
- hallazgo 1—N notificacion
- ubicacion 1—N hallazgo
- usuario (reportado_por) 1—N hallazgo

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

- **No rodar auth casero.** Usar **Auth.js (NextAuth)** con proveedor Credentials (email + password) para el personal y los apoderados.
- Passwords con **bcrypt/argon2**.
- **Autorización por rol** vía middleware:
  - Rutas `/admin/**` solo rol `admin` — y a diferencia de todos los demás roles, el admin **no** se filtra por `colegio_id`: tiene acceso global a todos los colegios. Es la única excepción al aislamiento por colegio de todo el sistema.
  - Rutas de registro de hallazgo para `admin` + `funcionario`.
  - Rutas `/apoderado/**` solo rol `apoderado`.
  - El **funcionario**, dentro de su propio panel, ve únicamente los hallazgos de **su `colegio_id`** (filtro server-side, mismo criterio que la validación ya descrita en el punto 4/5 al registrar un hallazgo).
- **[CRÍTICO DE SEGURIDAD] Aislamiento por dueño (no solo por colegio):** toda query que un apoderado haga sobre sus hijos, sus QR o los hallazgos de esos QR debe filtrarse server-side por el `apoderado_id` del estudiante/QR consultado, comparado contra el `id` del `usuario` en sesión. Un apoderado **nunca** puede ver ni modificar datos de estudiantes o QR de otro apoderado, ni aunque adivine o enumere IDs — son datos de menores de familias distintas. Esto es un chequeo aparte y más estricto que el aislamiento por `colegio_id` del punto 4/5: dos apoderados del **mismo** colegio siguen sin poder verse entre sí.
- Sesiones con cookies httpOnly + SameSite.
- El endpoint público de escaneo **no** requiere sesión, pero **no expone acciones sensibles** sin ella.

---

## 10. Generación y validación segura de QR

- **Token:** 128 bits de aleatoriedad criptográfica (`crypto.randomBytes`), codificado URL-safe. **Nunca** IDs secuenciales. **Totalmente opaco, sin prefijo visible de colegio ni de ningún otro tipo.**
- El QR codifica una **URL**: `https://app.colegio.cl/q/<token>` — la URL **no** lleva segmento ni prefijo de colegio; el colegio se resuelve server-side vía `qr_codigo.colegio_id`, nunca a partir de la URL.
- **Generación de imagen:** librería `qrcode` → SVG/PNG. El **apoderado** descarga una hoja/PDF imprimible con los N QR del estudiante + etiqueta legible ("Estudiante: [nombre]" — no incluir en el QR, solo en la hoja/PDF).
- **Validación:** al recibir `<token>`, el backend busca `qr_codigo` activo. Si no existe o está revocado → página neutra "código no válido". Nunca revela por qué.
- **Rate limiting** en `/q/<token>` para frenar enumeración y abuso.

---

## 11. Diseño del flujo de escaneo

- URL pública `/q/<token>`:
  - **Sin sesión:** página neutra, cero PII, mensaje de instrucción ("déjalo en Inspectoría").
  - **Con sesión (funcionario/admin):** además muestra formulario para registrar hallazgo (selector de ubicación + nota) y botón para notificar.
- La misma URL sirve a ambos; el contenido se decide server-side según sesión. Esto evita necesitar app o scanner propio: la cámara nativa del teléfono abre la URL.
- **Entrada adicional (revisión 2026-09-21):** el funcionario también puede escanear desde un lector de cámara embebido en su propio panel, `/funcionario/escanear`. Ese lector no reimplementa ninguna validación: decodifica el QR (o recibe el código por ingreso manual, requerido porque `getUserMedia` exige HTTPS o `localhost`), y navega a `/q/<token>` — la misma URL de siempre, con la misma resolución server-side de colegio y el mismo formulario de registro.

---

## 12. Protección de la privacidad

- El QR **solo** contiene el token opaco.
- La superficie pública **nunca** muestra nombre, RUT, curso, correo, teléfono ni datos del apoderado.
- **Minimización:** guardar el mínimo de PII. RUT omitido por defecto.
- Datos del apoderado accesibles solo a personal autenticado y solo cuando es necesario para el flujo.
- **Cumplimiento legal (Chile):** Ley 19.628 y Ley 21.719 sobre datos personales; al tratarse de **menores**, se requiere consentimiento informado del apoderado. En este modelo, es el propio **apoderado (tutor legal)** quien ingresa los datos del menor y otorga el consentimiento al crear la ficha del estudiante — no el colegio. Esto mejora la posición de responsabilidad del tratamiento respecto al modelo anterior, aunque el colegio sigue siendo responsable de la plataforma que aloja esos datos.
- Notificaciones dirigidas al apoderado por defecto (titular del contacto de un menor).
- **Alcance del administrador de plataforma:** pese a tener acceso global (todos los colegios), el admin **no** accede a la lista nominal de estudiantes ni a los datos de los apoderados (nombres de menores, contactos de familias). Su alcance es de gestión y operación — colegios, cuentas de funcionarios, ubicaciones, estados y conteos de hallazgos —, nunca el listado nominal de menores. Esto preserva el principio de minimización de este documento y evita concentrar datos de menores de múltiples colegios en una sola cuenta.

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

## 15. Panel del apoderado (MVP)

> **Cambió de sección:** este panel estaba descrito como "Panel del estudiante/apoderado (etapa 2)" y fuera del MVP. Con la inversión de la decisión de cuentas de apoderado, pasa a ser parte del núcleo del MVP.

- Registro con el código de registro del colegio; el apoderado queda ligado a ese colegio (ver subsección "Registro (sign-up)" abajo).
- CRUD de sus hijos (estudiante): alta, edición, baja lógica.
- Generación, asignación y descarga de QR como PDF imprimible por estudiante.
- Etiquetado y revocación de sus propios QR.
- Recepción de notificaciones (correo, MVP).
- **Fuera de esta fase del rol** (el evento de escaneo/hallazgo igual se persiste desde el día uno en la base): vista de historial de hallazgos dentro del panel del apoderado — se habilita como segunda fase, reutilizando datos ya guardados desde el MVP.

### Registro (sign-up) del apoderado

La spec anterior decía "el apoderado se registra con el código" sin definir el mecanismo — falta porque Auth.js Credentials, tal como está descrito en el punto 9, solo resuelve **login** de usuarios ya existentes; no crea cuentas por sí solo. Esto define ese flujo:

- **Página pública** `/registro` (fuera de `/apoderado/**` — ese árbol exige sesión con rol `apoderado` ya creada, así que el sign-up no puede vivir ahí; tampoco requiere sesión de ningún tipo, igual que `/login`).
- El formulario pide: **email, password, nombre** y el **código de registro del colegio**.
- **Validación del código:** el backend busca `colegio` por `codigo_registro`. Si existe y el colegio está `activo`, se crea el `usuario` con `rol = 'apoderado'` y `colegio_id` del colegio encontrado.
- **Código inválido** (no existe, o el colegio está `activo = false`): se rechaza el registro con un mensaje de error. A diferencia del escaneo de QR (punto 10), acá no hace falta ocultar el motivo exacto — no hay un tercero cuya privacidad proteger, es el propio usuario intentando crear su cuenta.
- **Email ya existente:** se rechaza el registro ("Ya existe una cuenta con este email."). No se permite duplicar ni pisar la cuenta existente — si el usuario cree que la cuenta es suya, el camino correcto es `/login`, no un nuevo registro.
- Password: mismo hashing que el resto del sistema (bcrypt/argon2, punto 9).
- **Verificación de correo — [CONFIRMAR] (recomendación, no decisión cerrada):** dado que es un proyecto académico y el canal de correo transaccional recién se implementa en la Etapa 5 (Notificaciones), se recomienda **no** exigir verificación de email al registrarse — bloquearía el sign-up antes de tener SMTP funcionando. El formato del email sí se valida en el form. Si más adelante se quiere reforzar (evitar registros con un email ajeno), conviene agregar verificación por link una vez lista la Etapa 5, cuando el costo marginal de esa verificación baja porque el sistema ya envía correos.

---

## 16. Panel del administrador de plataforma

> Renombrado desde "Panel administrativo del colegio": ya no es un panel por colegio, es el panel único del administrador global (punto 3).

- CRUD de **colegios** + generación de sus códigos de registro.
- Creación y gestión de cuentas de **funcionario**, de cualquier colegio (no hay auto-registro de funcionario — las cuentas las crea el admin).
- Gestión de **ubicaciones por colegio**.
- Vista **global** de todos los hallazgos (de todos los colegios), con filtros (estado, ubicación, fecha, colegio).
- Revocación de QR.
- Auditoría de notificaciones.

*(El admin no tiene CRUD de estudiantes ni genera QR — ese flujo es del apoderado, ver punto 15. Tampoco administra nada "el colegio" en sí mismo como entidad con login propio: no existe un rol de admin del lado del colegio.)*

*(El admin global nace por **seed** — es el primer usuario del sistema, con `colegio_id` NULL. No se crea desde la UI, porque es quien crea todo lo demás; ver también Etapa 1 en el punto 24.)*

---

## 17. Panel/flujo del funcionario/inspector

- Login (cuenta creada por el admin, ver punto 16).
- Flujo principal = escanear QR → registrar ubicación → confirmar (dispara notificación). El escaneo puede ser con la cámara nativa del sistema operativo (abre `/q/<token>` directo) o con el escáner embebido en `/funcionario/escanear` (revisión 2026-09-21, ver punto 11) — ambos terminan en la misma pantalla.
- Lista de hallazgos abiertos **de su colegio** (filtrada por `colegio_id`) para marcar retiro.
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
  /(admin)                      # solo rol 'admin' (global, sin filtro de colegio_id)
    /admin/colegios/...        # CRUD de colegios + códigos de registro
    /admin/funcionarios/...    # crear/gestionar cuentas de funcionario, de cualquier colegio
    /admin/ubicaciones/...     # ubicaciones por colegio
    /admin/hallazgos/...       # vista global, todos los colegios
  /(apoderado)                 # solo rol 'apoderado' (ver punto 9); aislado por
                                # apoderado_id, no solo por colegio_id
    /apoderado/hijos/...       # CRUD de estudiantes (antes /admin/estudiantes)
    /apoderado/qr/...          # generar/etiquetar/revocar QR (antes /admin/qr)
  /(auth)
    /login/...
    /registro/...              # sign-up del apoderado (público, código de
                                # colegio — NO va bajo /apoderado/**, ver punto 15)
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

> **Reorden respecto al modelo anterior:** los puntos marcados con `[ORDEN CAMBIÓ]` se movieron o se redefinieron por la inversión del modelo de apoderado y la entrada de multi-colegio al MVP. Revisar antes de tomarlo como definitivo.

**Etapa 0 — Base**
- Proyecto Next.js + TS + Tailwind + Prisma + MariaDB local.
- `schema.prisma` con el modelo del punto 7 (ahora incluye `colegio` y los campos nuevos de `usuario`/`estudiante`/`qr_codigo`). Migración inicial.

**Etapa 1 — Auth de personal** `[AJUSTADO: admin ahora es global/de plataforma, no por colegio]`
- Auth.js (Credentials), roles, middleware de autorización.
- El **admin global** nace por **seed**: primer usuario del sistema, `colegio_id` NULL. No se crea desde la UI, porque es quien crea todo lo demás.
- Login funcional para `admin` y `funcionario`. Las cuentas de `funcionario` las crea el admin (no hay auto-registro de funcionario). *(El registro de `apoderado` sí es auto-servicio, un flujo propio, ver Etapa 2.)*

**Etapa 2 — Colegio, apoderado y QR** `[ORDEN CAMBIÓ]`
- Antes era "Estudiantes y QR" con CRUD a cargo del admin; ahora ese flujo lo ejecuta el apoderado, y se suma el modelo `colegio`.
- CRUD de `colegio` (admin) + código de registro.
- Registro de apoderado con código de colegio (Auth.js Credentials extendido al rol `apoderado`).
- Apoderado agrega/edita/da de baja a sus hijos (`estudiante`).
- Apoderado genera tokens QR + descarga hoja/PDF imprimible.
- Etiquetado y revocación de QR por el apoderado.

**Etapa 3 — Escaneo**
- Página pública `/q/[token]` neutra.
- Vista con acción para staff autenticado (registrar hallazgo + ubicación).

**Etapa 4 — Hallazgos** `[ORDEN CAMBIÓ: se agrega explícitamente la validación de colegio]`
- Registro — **con validación server-side de `colegio_id` del funcionario contra el `colegio_id` del QR** —, estados, historial, marcar retiro.
- Catálogo de ubicaciones.

**Etapa 5 — Notificaciones por correo**
- Interfaz de canal + EmailChannel + dispatcher.
- Registro `notificacion`, worker/cron de envío, reintentos.

**Etapa 6 — Panel admin y trazabilidad** `[ORDEN CAMBIÓ + AJUSTADO: admin es global/multi-colegio de plataforma]`
- Ya no incluye CRUD de estudiantes/QR (se movió a la Etapa 2 vía apoderado).
- CRUD de colegios + generación de sus códigos de registro.
- Creación y gestión de cuentas de `funcionario`, de cualquier colegio.
- Gestión de ubicaciones por colegio.
- Vista **global** de todos los hallazgos (todos los colegios), con filtros.
- Auditoría de notificaciones.

**Etapa 7 — Panel del apoderado: historial** `[NUEVA — antes vivía en "Etapa 8+ (post-MVP)"]`
- El panel base del apoderado (registro, hijos, QR) ya se construyó en la Etapa 2, como parte del MVP.
- Acá solo queda la vista de historial de hallazgos dentro de ese panel — el dato ya se viene guardando desde la Etapa 4, esto es solo exponerlo.
- **A confirmar:** si conviene antes o después de Deploy (Etapa 8); se dejó antes por continuidad de producto, pero es discutible.

**Etapa 8 — Deploy** `[antes era Etapa 7]`
- VPS Hostinger: MariaDB, Next.js standalone + PM2 + nginx + TLS, backups.

**Etapa 9+ (post-MVP)** `[antes Etapa 8+; se achica: panel apoderado y multi-colegio ya entraron al MVP]`
- WhatsApp, PWA push.

---

## Decisiones a confirmar antes de programar

**Siguen abiertas:**
1. **[CONFIRMAR]** Escaneo público neutro + acciones sensibles solo con staff autenticado.
2. **[CONFIRMAR]** PWA fuera del MVP (la cámara nativa abre la URL).
3. **[CONFIRMAR]** RUT omitido por minimización, salvo exigencia del colegio.

**Ya confirmadas (sobrescriben el modelo anterior):**
4. **[CONFIRMADO]** Apoderado **con cuenta** en el MVP (rol logueable) — se invierte la decisión previa de "apoderado sin cuenta".
5. **[CONFIRMADO]** Código de registro **por colegio**, no por curso.
6. **[CONFIRMADO]** Token del QR totalmente opaco, 128 bits, sin prefijo visible; el colegio se resuelve por base de datos (`qr_codigo.colegio_id`), nunca por la URL.
7. **[CONFIRMADO]** Multi-colegio a nivel de datos, incluido en el MVP (antes estaba fuera de alcance).
8. **[CONFIRMADO]** El rol `admin` es un administrador **global de plataforma**, único (el dueño/desarrollador del sistema) — no existe un admin por colegio.
9. **[CONFIRMADO]** El admin crea y gestiona las cuentas de `funcionario` de cada colegio; no hay auto-registro de funcionario.
10. **[CONFIRMADO]** Las ubicaciones son por colegio (`ubicacion.colegio_id`), configuradas por el admin.
11. **[CONFIRMADO]** El admin no accede a la PII nominal de estudiantes ni apoderados, pese a su alcance global sobre todos los colegios.
