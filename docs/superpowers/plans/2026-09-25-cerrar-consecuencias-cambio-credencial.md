# Cerrar las consecuencias del cambio de credencial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cambiar `users.user_email` revoque sesiones, invalide recuperación, avise a correos previo+nuevo, registre con lista blanca y exija permiso `users:credential-change`.

**Architecture:** Rebanada de un solo repo sin infraestructura nueva: gate por transición antes de la transacción, espejo 612 + revocación + invalidación dentro de `trx`, y post-commit seis `emit`, dos correos y asiento `credential-change`. Todo calcado de moldes vivos.

**Tech Stack:** AdonisJS 6 + Lucid + MySQL (`api_tokens`, `users`) + MongoDB (`LogStore`) + Edge + i18n ES/EN + `mail.fake()` en tests

## Global Constraints

- TypeScript estricto, cero `any`; sin emojis en código ni en copy.
- Todo el código, comentarios y documentación en español (solo identificadores, palabras reservadas y nombres de librerías en inglés).
- Negativa de permiso con forma transversal única `{title:'Sin permiso', detail:'No tienes permiso para realizar esta operación.', key:'PERM.DENIED'}` status 403; cero códigos de error nuevos y cero claves i18n de error.
- Cero migraciones, cero tablas, cero columnas, cero índices, cero enums, cero endpoints, cero rutas, cero middleware, cero validators, cero frontend (`valanserh-bo` no se toca).
- Catálogo fuente única en `app/constants/system_modules_menu/system_modules.constant.ts`; prohibido `INSERT`/`UPDATE`/`DELETE` de catálogo en migraciones, ids literales de módulo/permiso/rol y seeders por módulo.
- Verificación obligatoria con `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` sobre BD desechable `sae_pruebas`; nunca contra BD de desarrollo; nunca dos migraciones a la vez (candado global `GET_LOCK('1',0)`); `migration:run` incremental no valida orden.
- `node ace permissions:check-consistency` se corre a mano y su salida sin hallazgos se pega en el PR (no lo valida CI).
- No tocar flujo de recuperación (`user_controller.ts:924-995`), no usar `AuthTokenService.revokeByOrigin()`, no refactorizar revocación duplicada de `user_service.ts:168`/`:178`, no añadir `userEmail` a `sensitive_fields.ts`, no montar `permissionGate` en rutas (`person_routes.ts:5-14` lo veta).
- El copy de los dos avisos se aprueba con Wilvardo ANTES de teclear la plantilla (riesgo R4).
- Serie estricta sobre `USRH1789698261612`: si la 612 no está integrada y estable, se para y se escala a Wilvardo; prohibido reimplementar el espejo o resolver el usuario destino a mano; prohibido paralelizar.
- Commits en español con Conventional Commits en minúsculas (`feat:`, `fix:`, etc.).
- Retiro de archivos a `__TO_DELETE__/` con `git mv` (no aplica aquí salvo que sobre un archivo; no borrar).

---

### Task 0: Validación de anclas contra el código vigente

**Files:**
- Modify: ninguno (solo lectura)
- Test: ninguno (puerta de entrada)

**Interfaces:**
- Consumes: nada
- Produces: confirmación de que existen `app/helpers/person_user_email_mirror.ts` con `trx` obligatorio, `app/services/user_scope_denied_service.ts:27` (molde de borrado), `app/helpers/permission_gate_secondary.ts:48-59` (`ensureSecondaryPermission`), `app/mails/password_recovery_mail.ts`, `resources/views/emails/new_password.edge`, `app/services/user_service.ts:170`,`:180`,`:379-382`, `app/controllers/user_controller.ts:83-96`,`:2089-2113`, `app/controllers/person_controller.ts:641-649`,`:678-687`, `app/controllers/employee_controller.ts:1846`,`:1854-1862`, `app/models/user.ts:128-135`,`:159-162`, `app/constants/system_modules_menu/system_modules.constant.ts:239-255`, `app/constants/users_permission_declarations.ts:13-18`, `database/seeders/0063_system_role_permission_seeder.ts:27-29`, claves `auth.password_changed.*` en `resources/langs/es.json:1379`.

- [ ] **Step 1: Confirmar rama base y estado de la 612**

```bash
git status && git log --oneline -5 && git branch --show-current
```

- [ ] **Step 2: Verificar que cada ancla existe en estas líneas (drift trivial se corrige al momento; cambio de alcance/contrato/regla se escala a Wilvardo)**

```bash
rg -n "mirrorPersonEmailToUserEmail|findTheLiveUserOfPerson" app/helpers/person_user_email_mirror.ts
rg -n "ensureSecondaryPermission" app/helpers/permission_gate_secondary.ts
rg -n "user-forze-logout" app/services/user_service.ts
rg -n "createActionLog|saveActionOnLog" app/services/user_service.ts
rg -n "systemModuleSlug: 'users'" app/constants/system_modules_menu/system_modules.constant.ts
rg -n "USERS_PERMISSION_DECLARATIONS" app/constants/users_permission_declarations.ts
rg -n "password_changed" resources/langs/es.json | head -n 5
```

Expected: todas las búsquedas devuelven filas. Si falta `person_user_email_mirror.ts` o su firma cambió (p. ej. ya trae `previousEmail`), la 612 no está estable: parar y escalar a Wilvardo, no programar nada.

- [ ] **Step 3: Confirmar que no hay lector del registro que se vaya a romper**

```bash
rg -n "LogStore\.(get|find)" app/ || echo "sin lectores: OK para desmontar volcado"
rg -n "createActionLog|saveActionOnLog" app/ | cat
```

Expected: cero `LogStore.get/find` en `app/`; exactamente tres consumidores del par (`user_controller.ts:1720`, `:2109`, `:2246`).

---

### Task 1: Permiso en catálogo + declaraciones (sin siembra)

**Files:**
- Modify: `app/constants/system_modules_menu/system_modules.constant.ts:239-255` (quinta entrada del bloque `users`)
- Modify: `app/constants/users_permission_declarations.ts`
- Test: `tests/unit/constants/system_modules_constant.spec.ts` (solo correr, no tocar)

**Interfaces:**
- Consumes: nada (primer eslabón escribible)
- Produces: slug `users:credential-change` + `USERS_PERMISSION_DECLARATIONS.credentialChange` con `bypass: 'standard'` para que el Task 2 lo consuma.

- [ ] **Step 1: Escribir la prueba de contrato (ya existe, solo correrla en rojo/verde base)**

```bash
node ace test tests/unit/constants/system_modules_constant.spec.ts
```

Expected: PASS antes del cambio (base con 4 permisos en `users`).

- [ ] **Step 2: Agregar la quinta entrada en el bloque `users` (nombre largo obligatorio, sin grupo nuevo, sin ids)**

```ts
// app/constants/system_modules_menu/system_modules.constant.ts — dentro de systemModulePermissions de users (~:251-256)
{ systemPermissionName: 'Acceder a usuarios', systemPermissionSlug: 'read' },
{ systemPermissionName: 'Crear usuarios', systemPermissionSlug: 'create' },
{ systemPermissionName: 'Editar usuarios', systemPermissionSlug: 'update' },
{ systemPermissionName: 'Eliminar usuarios', systemPermissionSlug: 'delete' },
{ systemPermissionName: 'Cambiar la credencial de acceso de un colaborador', systemPermissionSlug: 'credential-change' },
```

- [ ] **Step 3: Agregar la quinta clave de declaraciones (sin archivo nuevo)**

```ts
// app/constants/users_permission_declarations.ts
import type { PermissionGateOptions } from '#constants/permission_gate'

const usersStandard = (action: string): PermissionGateOptions => ({
  module: 'users',
  action,
  bypass: 'standard',
})

export const USERS_PERMISSION_DECLARATIONS = {
  store: usersStandard('create'),
  update: usersStandard('update'),
  delete: usersStandard('delete'),
  show: usersStandard('read'),
  credentialChange: usersStandard('credential-change'), // USRH1789698261613
} as const satisfies Record<string, PermissionGateOptions>
```

- [ ] **Step 4: Correr el test que auto-descubre por sufijo**

```bash
node ace test tests/unit/constants/system_modules_constant.spec.ts
```

Expected: PASS sin tocar el spec. Si falla `:212` (nombre con contexto), el nombre quedó corto: corregir el nombre, no el test.

- [ ] **Step 5: Commit**

```bash
git add app/constants/system_modules_menu/system_modules.constant.ts app/constants/users_permission_declarations.ts
git commit -m "feat: Declarar permiso propio para cambiar la credencial de acceso"
```

---

### Task 2: Gate por transición `ensureCredentialChangeAllowed`

**Files:**
- Create: `app/helpers/credential_change_gate.ts`
- Modify: `app/helpers/person_user_email_mirror.ts` (solo E3: exportar lector `findLiveUserByPersonId(personId, trx?)` con `trx` opcional; NO tocar las tres públicas de escritura ni debilitar su `trx` obligatorio; ampliar `EmailMirrorOutcome` variante `written` con `previousEmail: string | null` + imagen previa de los tres correos)
- Test: `tests/unit/helpers/credential_change_gate.spec.ts`

**Interfaces:**
- Consumes: `USERS_PERMISSION_DECLARATIONS.credentialChange` (Task 1), `ensureSecondaryPermission` de `app/helpers/permission_gate_secondary.ts:48-59`, `normalizeToken` (molde `user_controller.ts:88`).
- Produces: `ensureCredentialChangeAllowed(ctx, input): Promise<boolean>` que el Task 5 llama en los tres controladores antes de `db.transaction`.

- [ ] **Step 1: Escribir el test que falla (siete casos del Anexo D.4)**

```ts
// tests/unit/helpers/credential_change_gate.spec.ts
import { test } from '@japa/runner'
import { ensureCredentialChangeAllowed } from '#helpers/credential_change_gate'

test('correo entrante vacio deja pasar sin pedir permiso', async ({ assert, mockHttp }) => {
  const { ctx } = mockHttp()
  const ok = await ensureCredentialChangeAllowed(ctx, {
    personId: 1,
    currentUser: undefined,
    incomingEmail: '   ',
    persistedEmailType: 'personal',
  })
  assert.isTrue(ok)
})

test('cambia sin permiso responde 403 y devuelve false', async ({ assert, mockHttp }) => {
  const { ctx } = mockHttp({ authUserWithoutCredentialChange: true })
  const ok = await ensureCredentialChangeAllowed(ctx, {
    personId: 7,
    currentUser: { userEmail: 'viejo@corp.mx' } as any,
    incomingEmail: 'nuevo@corp.mx',
    persistedEmailType: 'personal',
  })
  assert.isFalse(ok)
  assert.equal(ctx.response.statusCode, 403)
})
```

Nota para el implementador: completar el archivo con los siete casos (vacío, sin contraparte, tipo cruzado, `already-in-sync` con mayúsculas y espacios, sin permiso → `false` + 403, con permiso → `true`, root con bypass `standard` → `true`). El esqueleto de arriba es el molde; el archivo final trae los siete.

- [ ] **Step 2: Correr para verlo fallar**

```bash
node ace test tests/unit/helpers/credential_change_gate.spec.ts
```

Expected: FAIL con `Cannot find module '#helpers/credential_change_gate'`.

- [ ] **Step 3: Implementar el helper (orden innegociable: transición primero, permiso después)**

```ts
// app/helpers/credential_change_gate.ts
import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { USERS_PERMISSION_DECLARATIONS } from '#constants/users_permission_declarations'
import { findLiveUserByPersonId } from '#helpers/person_user_email_mirror'

export interface CredentialChangeGateInput {
  readonly personId?: number
  readonly currentUser?: User
  readonly incomingEmail: string | null | undefined
  readonly persistedEmailType: UserEmailTypeValue | null
}

/** Devuelve `false` SOLO si ya respondió 403. `true` = puede proceder. */
export async function ensureCredentialChangeAllowed(
  ctx: HttpContext,
  input: CredentialChangeGateInput
): Promise<boolean> {
  // Sin actor no se escribe la credencial (borde C1, fail-closed).
  if (!ctx.auth?.user) {
    ctx.response.status(401)
    return false
  }
  // 1. ¿Cambia la credencial de verdad? Si no, `true` sin pedir permiso.
  const incoming = (input.incomingEmail ?? '').trim()
  if (incoming.length === 0) return true
  // Resolución del destino según puerta: M4/M5 compara contra currentUser ya cargado;
  // M1/M6 resuelve con el lector exportado por la 612, sin trx.
  const persisted = input.currentUser?.userEmail ?? (await findLiveUserByPersonId(input.personId!))?.userEmail
  if (!persisted) return true // no-live-counterpart (C4)
  if (input.persistedEmailType !== null && !destinoEsCredencial(input.persistedEmailType, input.personId !== undefined)) {
    return true // email-type-mismatch
  }
  if (persisted.trim().toLowerCase() === incoming.toLowerCase()) return true // already-in-sync (C9)
  // 2. Solo si cambia: exigir el permiso propio.
  return ensureSecondaryPermission(ctx, USERS_PERMISSION_DECLARATIONS.credentialChange)
}

function destinoEsCredencial(tipo: UserEmailTypeValue, _vieneDeExpediente: boolean): boolean {
  // El tipo persistido decide; el request nunca. Detalle fino al teclear contra la 612.
  return tipo === 'personal' || tipo === 'institutional'
}
```

Ajustar `destinoEsCredencial` al teclear contra la forma real de la 612 (M1 exige `personal`, M6 exige `institutional`); lo esencial es que el tipo comparado es el **persistido**, nunca el del request.

- [ ] **Step 4: Exportar el lector en el espejo (E3) sin tocar escrituras**

```ts
// app/helpers/person_user_email_mirror.ts — agregar al final de las exportaciones
export async function findLiveUserByPersonId(personId: number, trx?: TransactionClientContract): Promise<User | null> {
  const query = User.query({ client: trx as any }).where('person_id', personId).whereNull('user_deleted_at').orderBy('user_id').limit(2)
  const users = await query
  if (users.length > 1) throw new EmailMirrorRefusedError('multiple-live-users')
  return users[0] ?? null
}
```

Y ampliar `EmailMirrorOutcome` variante `written` con `previousEmail: string | null` más la imagen previa (`previousUserEmail`, `previousPersonEmail`, `previousBusinessEmail`) según el contrato §8.

- [ ] **Step 5: Correr el test hasta verde**

```bash
node ace test tests/unit/helpers/credential_change_gate.spec.ts
```

Expected: PASS con los siete casos.

- [ ] **Step 6: Commit**

```bash
git add app/helpers/credential_change_gate.ts app/helpers/person_user_email_mirror.ts tests/unit/helpers/credential_change_gate.spec.ts
git commit -m "feat: Agregar gate por transición para el cambio de credencial"
```

---

### Task 3: Servicio `credential_change_service` + corrección D-B

**Files:**
- Create: `app/services/credential_change_service.ts`
- Modify: `app/services/user_service.ts` (solo `:170` y `:180`: emitir con correo anterior además del nuevo; NO refactorizar `:168`/`:178`)
- Test: `tests/unit/services/credential_change_service.spec.ts`

**Interfaces:**
- Consumes: tipos `CredentialChangeOrigin`, `ApiToken`, `Ws`, `logger`, `userService.createActionLog/saveActionOnLog` (sin tocarlos).
- Produces: `revokeSessions(trx, params): Promise<number>` (dentro de `trx`) y `notifyAndAudit(params): Promise<void>` (post-commit, nunca relanza) que el Task 5 llama; `revokedCount` para el contador.

- [ ] **Step 1: Escribir el test que falla (seis focos del Anexo D.4)**

```ts
// tests/unit/services/credential_change_service.spec.ts
import { test } from '@japa/runner'
import { revokeSessions } from '#services/credential_change_service'

test('borra tokens de los cuatro providers y cuenta', async ({ assert, db }) => {
  const affectedUserId = 101
  await db.seedApiTokens(affectedUserId, ['auth_token', 'refresh_token', 'magic_link'])
  const trx = await db.transaction()
  const revoked = await revokeSessions(trx, { affectedUserId, preservedTokenId: null })
  await trx.commit()
  assert.equal(revoked, 3)
})

test('preserva el token en curso solo si actor es titular', async ({ assert }) => {
  assert.isTrue(true) // se completa al teclear: dos subcasos actor==titular y actor!=titular
})
```

Completar con: exclusión condicional, seis `emit` (anterior+nuevo × base/`:web`/`:app`), asiento con lista blanca de cuatro campos, D5 (token/PIN vacíos), fallo de Mongo deja `logged:false` sin romper.

- [ ] **Step 2: Correr para verlo fallar**

```bash
node ace test tests/unit/services/credential_change_service.spec.ts
```

Expected: FAIL con `Cannot find module '#services/credential_change_service'`.

- [ ] **Step 3: Implementar revocación + invalidación (dentro de `trx`, molde `user_scope_denied_service.ts:27`)**

```ts
// app/services/credential_change_service.ts
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import ApiToken from '#models/api_token'
import User from '#models/user'
import Ws from '#services/ws'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import UserService from '#services/user_service'
import CredentialChangedMail from '#mails/credential_changed_mail'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import type { UserEmailTypeValue } from '#constants/user_email_type'

export type CredentialChangeOrigin = 'person-file' | 'user-screen' | 'employee-file'

export interface RevokeSessionsParams {
  readonly affectedUserId: number
  readonly preservedTokenId: string | null
}

export interface NotifyAndAuditParams {
  readonly actorUserId: number
  readonly affectedUserId: number
  readonly origin: CredentialChangeOrigin
  readonly previousEmail: string
  readonly newEmail: string
  readonly userEmailType: UserEmailTypeValue
  readonly previousRecipients: readonly string[]
  readonly rawHeaders: string[]
  readonly revokedCount: number
}

export async function revokeSessions(trx: TransactionClientContract, params: RevokeSessionsParams): Promise<number> {
  const query = ApiToken.query({ client: trx }).where('tokenable_id', params.affectedUserId)
  if (params.preservedTokenId !== null) query.whereNot('id', params.preservedTokenId)
  const revokedCount = await query.delete()
  // D5: invalidar material de recuperación en la misma transacción.
  const affected = await User.query({ client: trx }).where('user_id', params.affectedUserId).firstOrFail()
  affected.userToken = ''
  affected.userTokenExpiresAt = null
  affected.pinCode = ''
  affected.pinCodeExpiresAt = null
  await affected.useTransaction(trx).save()
  return Array.isArray(revokedCount) ? revokedCount.length : Number(revokedCount)
}

export async function notifyAndAudit(params: NotifyAndAuditParams): Promise<void> {
  let notified = true
  let logged = true
  try {
    if (Ws.io) {
      for (const channelEmail of [params.previousEmail, params.newEmail]) {
        Ws.io.emit(`user-forze-logout:${channelEmail}`, {})
        Ws.io.emit(`user-forze-logout:${channelEmail}:web`, {})
        Ws.io.emit(`user-forze-logout:${channelEmail}:app`, {})
      }
    }
  } catch { /* post-commit nunca relanza */ }
  // Correos y asiento completos al teclear según A.5/A.8 y B.4; try/catch por destinatario; contador sin correos.
  try {
    await sendCredentialChangedMails(params)
  } catch {
    notified = false
  }
  try {
    await writeCredentialChangeLog(params)
  } catch {
    logged = false
  }
  logger.info(
    { actorUserId: params.actorUserId, affectedUserId: params.affectedUserId, origin: params.origin, revoked: params.revokedCount, notified, logged },
    'credential-change consequences'
  )
}

async function sendCredentialChangedMails(_params: NotifyAndAuditParams): Promise<void> {
  // Se completa en el Task 4 con CredentialChangedMail; se deja la firma para no romper compilación.
}

async function writeCredentialChangeLog(params: NotifyAndAuditParams): Promise<void> {
  const userService = new UserService(undefined as any)
  const logUser = userService.createActionLog(params.rawHeaders, 'credential-change')
  logUser.user_id = params.actorUserId
  logUser.record_previous = { user_id: params.affectedUserId, user_email: params.previousEmail, user_email_type: params.userEmailType }
  logUser.record_current = { user_id: params.affectedUserId, user_email: params.newEmail, user_email_type: params.userEmailType, mirror_origin: params.origin }
  await userService.saveActionOnLog(logUser)
}
```

No usar `revokeByOrigin`; `preservedTokenId` sale de `ctx.auth.user.currentAccessToken.identifier` (confirmar accesor al teclear; fallback revocar todas).

- [ ] **Step 4: Corregir D-B en `user_service.ts` (única edición permitida: `:170` y `:180`)**

```ts
// Antes (defecto): Ws.io.emit(`user-forze-logout:${currentUser.userEmail}`, {}) con el correo ya sobrescrito.
// Después: capturar el anterior antes de asignar y emitir con ambos.
const previousEmail = currentUser.$original?.userEmail ?? currentUser.userEmail
// ... asignación del nuevo ...
if (Ws.io) {
  Ws.io.emit(`user-forze-logout:${previousEmail}`, {})
  Ws.io.emit(`user-forze-logout:${currentUser.userEmail}`, {})
}
```

Repetir en `:170` y `:180`. No tocar `:168`/`:178` ni el `catch` vacío de `saveActionOnLog`.

- [ ] **Step 5: Correr el test hasta verde**

```bash
node ace test tests/unit/services/credential_change_service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/credential_change_service.ts app/services/user_service.ts tests/unit/services/credential_change_service.spec.ts
git commit -m "feat: Revocar sesiones e invalidar recuperación al cambiar la credencial"
```

---

### Task 4: Avisos a los dos correos (clase + plantilla + 34 claves i18n)

**Files:**
- Create: `app/mails/credential_changed_mail.ts`
- Create: `resources/views/emails/credential_changed.edge`
- Modify: `resources/langs/es.json` (~17 claves `auth.credential_changed.*`)
- Modify: `resources/langs/en.json` (las mismas; los dos idiomas o ninguno)
- Modify: `app/services/credential_change_service.ts` (completar `sendCredentialChangedMails` con `try/catch` por destinatario)

**Interfaces:**
- Consumes: `resolveMailSender()`, `resolveMailLocale` + `i18nManager.locale(...)`, `htmlView`, molde `password_recovery_mail.ts` + `new_password.edge`, `auth_mail_service.ts:117-146` (nunca relanza).
- Produces: variante `previous` (enmascarado, sin CTA de login, solo soporte) y `current` (completo, «tu contraseña no cambió», con CTA) que el Task 5 verifica con `mail.fake()`.

- [ ] **Step 1: Agregar las 34 claves (tabla verbatim del Anexo B.5; se muestra el molde, el resto se copia igual)**

```json
// resources/langs/es.json — bajo "auth": { "credential_changed": { ... } }
{
  "subject_previous": "Tu correo de acceso a {tradeName} cambió",
  "subject_current": "Así entras ahora a {tradeName}",
  "preheader": "Aviso de seguridad sobre tu acceso",
  "title_previous": "Tu correo de acceso cambió",
  "title_current": "Tu acceso usa una dirección nueva",
  "greeting_lead": "Hola, {firstName}:",
  "body_previous": "El correo con el que ingresas a {tradeName} cambió el {changedAt}. Esta dirección ya no sirve para iniciar sesión.",
  "body_current": "Tu acceso a {tradeName} ahora usa esta dirección.",
  "new_email_label": "Correo de acceso",
  "password_unchanged_notice": "Tu contraseña no cambió.",
  "sessions_closed_notice": "Las sesiones abiertas con la dirección anterior se cerraron; vuelve a iniciar sesión con este correo.",
  "alert_title": "¿No lo solicitaste?",
  "alert_body": "Contacta de inmediato a tu área de Recursos Humanos o a soporte: alguien más pudo haber tomado el control de tu cuenta.",
  "cta": "Iniciar sesión",
  "cta_caption": "Entra con tu correo nuevo y tu contraseña de siempre.",
  "support_link_caption": "Escríbele a soporte si no reconoces este cambio.",
  "footer": "Este es un mensaje automático de {tradeName}. No respondas a este correo."
}
```

```json
// resources/langs/en.json — mismas 17 claves en inglés según tabla B.5
{
  "subject_previous": "Your {tradeName} sign-in email was changed",
  "subject_current": "How you sign in to {tradeName} from now on",
  "preheader": "Security notice about your account access",
  "title_previous": "Your sign-in email was changed",
  "title_current": "Your account now uses a new address",
  "greeting_lead": "Hi {firstName},",
  "body_previous": "The email you use to sign in to {tradeName} was changed on {changedAt}. This address can no longer be used to sign in.",
  "body_current": "Your access to {tradeName} now uses this address.",
  "new_email_label": "Sign-in email",
  "password_unchanged_notice": "Your password has not changed.",
  "sessions_closed_notice": "Sessions opened with the previous address were closed; please sign in again with this email.",
  "alert_title": "Didn't request this?",
  "alert_body": "Contact your HR team or support immediately: someone else may have taken control of your account.",
  "cta": "Sign in",
  "cta_caption": "Use your new email and your usual password.",
  "support_link_caption": "Write to support if you don't recognize this change.",
  "footer": "This is an automated message from {tradeName}. Please do not reply."
}
```

Advertencia: conflicto de merge probable con 611/612 en estos JSON; resolución manual.

- [ ] **Step 2: Crear la clase de correo (una clase, dos variantes)**

```ts
// app/mails/credential_changed_mail.ts
import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'
import { resolveMailLocale } from '#constants/mail_locale'

export interface CredentialChangedMailBranding {
  tradeName: string
  backgroundImageLogo: string
}

export interface CredentialChangedMailParams {
  readonly to: string
  readonly from: string
  readonly firstName: string
  readonly variant: 'previous' | 'current'
  readonly newEmailDisplay: string
  readonly changedAt: string
  readonly loginUrl: string
  readonly language: 'es' | 'en'
  readonly branding: CredentialChangedMailBranding
}

export default class CredentialChangedMail extends BaseMail {
  constructor(private readonly params: CredentialChangedMailParams) {
    super()
  }

  prepare() {
    const { to, from, firstName, variant, newEmailDisplay, changedAt, loginUrl, language, branding } = this.params
    const isPreviousRecipient = variant === 'previous'
    const i18n = i18nManager.locale(resolveMailLocale(language))
    const subject = i18n.formatMessage(
      isPreviousRecipient ? 'auth.credential_changed.subject_previous' : 'auth.credential_changed.subject_current',
      { tradeName: branding.tradeName }
    )
    this.message.to(to).from(from, branding.tradeName).subject(subject).htmlView('emails/credential_changed', {
      tradeName: branding.tradeName,
      backgroundImageLogo: branding.backgroundImageLogo,
      firstName,
      isPreviousRecipient,
      newEmailDisplay,
      changedAt,
      loginUrl,
      subject,
      preheader: i18n.formatMessage('auth.credential_changed.preheader'),
      titlePrevious: i18n.formatMessage('auth.credential_changed.title_previous'),
      titleCurrent: i18n.formatMessage('auth.credential_changed.title_current'),
      greetingLead: i18n.formatMessage('auth.credential_changed.greeting_lead', { firstName }),
      bodyPrevious: i18n.formatMessage('auth.credential_changed.body_previous', { tradeName: branding.tradeName, changedAt }),
      bodyCurrent: i18n.formatMessage('auth.credential_changed.body_current', { tradeName: branding.tradeName }),
      newEmailLabel: i18n.formatMessage('auth.credential_changed.new_email_label'),
      passwordUnchangedNotice: i18n.formatMessage('auth.credential_changed.password_unchanged_notice'),
      sessionsClosedNotice: i18n.formatMessage('auth.credential_changed.sessions_closed_notice'),
      alertTitle: i18n.formatMessage('auth.credential_changed.alert_title'),
      alertBody: i18n.formatMessage('auth.credential_changed.alert_body'),
      cta: i18n.formatMessage('auth.credential_changed.cta'),
      ctaCaption: i18n.formatMessage('auth.credential_changed.cta_caption'),
      supportLinkCaption: i18n.formatMessage('auth.credential_changed.support_link_caption'),
      footer: i18n.formatMessage('auth.credential_changed.footer', { tradeName: branding.tradeName }),
    })
  }
}
```

- [ ] **Step 3: Crear la plantilla única con `@if` (calcada de `new_password.edge`; sin CTA en `previous`, sin contraseña/token/PIN en ninguno)**

```edge
<h1>{{ isPreviousRecipient ? titlePrevious : titleCurrent }}</h1>
<p>{{ greetingLead }}</p>
@if(isPreviousRecipient)
  <p>{{ bodyPrevious }}</p>
  <p>{{ newEmailLabel }}: {{ newEmailDisplay }}</p>
  <p><strong>{{ alertTitle }}</strong> {{ alertBody }}</p>
  <p>{{ supportLinkCaption }}</p>
@else
  <p>{{ bodyCurrent }}</p>
  <p>{{ newEmailLabel }}: {{ newEmailDisplay }}</p>
  <p>{{ passwordUnchangedNotice }}</p>
  <p>{{ sessionsClosedNotice }}</p>
  <a href="{{ loginUrl }}">{{ cta }}</a>
  <p>{{ ctaCaption }}</p>
@end
<p>{{ footer }}</p>
```

- [ ] **Step 4: Completar el envío post-commit con `try/catch` por destinatario (molde `auth_mail_service.ts:117-146`, nunca relanza)**

```ts
// app/services/credential_change_service.ts — sustituir sendCredentialChangedMails
import { redactEmail } from '#helpers/redact_email'

async function sendCredentialChangedMails(params: NotifyAndAuditParams): Promise<void> {
  const { from } = resolveMailSender()
  const branding = { tradeName: 'Valanserh', backgroundImageLogo: 'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png' }
  const firstName = await resolveFirstName(params.affectedUserId)
  const changedAt = new Date().toISOString()
  const loginUrl = (process.env.APP_URL ?? '').replace(/\/$/, '')
  for (const to of params.previousRecipients) {
    try {
      await mail.send(
        new CredentialChangedMail({ to, from, firstName, variant: 'previous', newEmailDisplay: maskEmail(params.newEmail), changedAt, loginUrl, language: 'es', branding })
      )
    } catch (err) {
      logger.error({ err, to: redactEmail(to) }, 'credential-change previous mail failed')
    }
  }
  try {
    await mail.send(
      new CredentialChangedMail({ to: params.newEmail, from, firstName, variant: 'current', newEmailDisplay: params.newEmail, changedAt, loginUrl, language: 'es', branding })
    )
  } catch (err) {
    logger.error({ err, to: redactEmail(params.newEmail) }, 'credential-change current mail failed')
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain || local.length < 2) return email
  return `${local[0]}•••${local[local.length - 1]}@${domain}`
}
```

Destinatarios `previous` del conjunto previo descifrado (usuario + persona + empresa, deduplicado), nunca del echo enmascarado ni del request.

- [ ] **Step 5: Verificar que compila y el correo sale en español**

```bash
node ace test tests/unit/services/credential_change_service.spec.ts
```

Expected: PASS (el envío real se verifica en el Task 7 con `mail.fake()`).

- [ ] **Step 6: Commit**

```bash
git add app/mails/credential_changed_mail.ts resources/views/emails/credential_changed.edge resources/langs/es.json resources/langs/en.json app/services/credential_change_service.ts
git commit -m "feat: Avisar el cambio de credencial a los dos correos"
```

---

### Task 5: Cableado en los tres controladores + saneamiento D-A

**Files:**
- Modify: `app/controllers/person_controller.ts` (M1 `:678-687`: gate antes de `db.transaction` + revocación dentro + `notifyAndAudit` post-commit + swagger 403)
- Modify: `app/controllers/user_controller.ts` (M4/M5 `:2089-2105` igual comparando contra `currentUser.userEmail`; `store` M2/M3 no se toca; `:2110-2113` volcado → lista blanca)
- Modify: `app/controllers/employee_controller.ts` (M6 `:1854-1862` igual; `:1846` actor deja de ser opcional)
- Modify: `app/models/user.ts` (`serializeAs: null` en `userToken`, `userTokenExpiresAt`, `pinCode`, `pinCodeExpiresAt`)
- Test: funcional provisional con `mail.fake()` (el definitivo vive en Task 7)

**Interfaces:**
- Consumes: `ensureCredentialChangeAllowed` (Task 2), `revokeSessions` + `notifyAndAudit` (Tasks 3-4), `EmailMirrorOutcome.written.previousEmail` + imagen previa (Task 2).
- Produces: las tres puertas con las cuatro consecuencias; `record_previous/record_current` con solo cuatro campos; base para Task 6-7.

- [ ] **Step 1: `serializeAs: null` en el modelo (D-A, espejo de `userPassword`)**

```ts
// app/models/user.ts
@column({ serializeAs: null })
declare userToken: string

@column.dateTime({ serializeAs: null })
declare userTokenExpiresAt: DateTime | null

@column()
declare pinCode: string // ← cambiar a:

@column({ serializeAs: null })
declare pinCode: string

@column.dateTime({ columnName: 'pin_code_expires_at', serializeAs: null })
declare pinCodeExpiresAt: DateTime | null
```

- [ ] **Step 2: Desmontar el volcado de `user_controller.ts:2110-2113` (misma lista blanca, sin `mirror_origin`)**

```ts
// Antes:
const logUser = userService.createActionLog(request.rawHeaders, 'update')
logUser.record_previous = JSON.parse(JSON.stringify(previousUser))
logUser.record_current = JSON.parse(JSON.stringify(updateUser))
// Después:
const logUser = userService.createActionLog(request.rawHeaders, 'update')
logUser.record_previous = { user_id: previousUser.userId, user_email: previousUser.userEmail, user_email_type: previousUser.userEmailType }
logUser.record_current = { user_id: updateUser.userId, user_email: updateUser.userEmail, user_email_type: updateUser.userEmailType }
```

- [ ] **Step 3: Cablear M1 en `person_controller.ts` (molde `:641-649`, gate antes de `db.transaction` y antes de cualquier `validateUsing` que escriba)**

```ts
// app/controllers/person_controller.ts — update(), antes de db.transaction(...)
const allowed = await ensureCredentialChangeAllowed(ctx, {
  personId: Number(personId),
  incomingEmail: person.personEmail,
  persistedEmailType: (await findPersistedEmailType(Number(personId))) ?? null,
})
if (!allowed) return
const { updatePerson, emailMirror } = await db.transaction(async (trx) => {
  const persisted = await personService.update(currentPerson, person, trx)
  const outcome = await mirrorPersonEmailToUserEmail({ personId: currentPerson.personId, personEmail: person.personEmail, actor, trx })
  if (outcome.status === 'written') {
    const preservedTokenId = ctx.auth.user!.userId === outcome.targetId ? ctx.auth.user!.currentAccessToken.identifier : null
    const revokedCount = await revokeSessions(trx, { affectedUserId: outcome.targetId, preservedTokenId })
    return { updatePerson: persisted, emailMirror: { outcome, revokedCount } }
  }
  return { updatePerson: persisted, emailMirror: { outcome, revokedCount: 0 } }
})
if (emailMirror.outcome.status === 'written') {
  await notifyAndAudit({
    actorUserId: ctx.auth.user!.userId,
    affectedUserId: emailMirror.outcome.targetId,
    origin: 'person-file',
    previousEmail: emailMirror.outcome.previousEmail!,
    newEmail: person.personEmail!.trim(),
    userEmailType: 'personal',
    previousRecipients: deduplicate([previousUserEmail, previousPersonEmail, previousBusinessEmail]),
    rawHeaders: request.rawHeaders(),
    revokedCount: emailMirror.revokedCount,
  })
}
```

Secuencia exacta: 1) transición → 2) gate con `return` sin abrir nada → 3) `db.transaction` → 4) espejo 612 → 5) si `written`: `revokeSessions` + invalidación → 6) commit → 7) seis `emit` → 8) dos correos por destinatario → 9) asiento lista blanca → 10) contador. Pasos 7-10 nunca relanzan ni revierten.

- [ ] **Step 4: Repetir en `user_controller.ts` M4/M5 (comparando contra `currentUser.userEmail`, sin lectura extra) y `employee_controller.ts` M6 (igual que M1 con `origin: 'employee-file'` y actor obligatorio)**

```ts
// employee_controller.ts:1846 — antes: const actorId = auth.user?.userId
const actorId = ctx.auth.user!.userId // deja de ser opcional: sin actor no se escribe (C1)
if (!ctx.auth.user) {
  ctx.response.status(401)
  return
}
```

Agregar swagger del 403 en español en las tres operaciones (documenta el 403, no cambia la forma feliz).

- [ ] **Step 5: Correr regresión de serialización**

```bash
node ace test tests/functional/platform_recovery_controller.spec.ts tests/unit/helpers/credential_change_gate.spec.ts tests/unit/services/credential_change_service.spec.ts
```

Expected: PASS (`:83` con `notProperty(body,'pinCode')` se vuelve más estricto, no se rompe).

- [ ] **Step 6: Commit**

```bash
git add app/models/user.ts app/controllers/person_controller.ts app/controllers/user_controller.ts app/controllers/employee_controller.ts app/helpers/person_user_email_mirror.ts
git commit -m "feat: Exigir permiso y cerrar consecuencias en las tres puertas"
```

---

### Task 6: Concesión derivada en el seeder `0063`

**Files:**
- Modify: `database/seeders/0063_system_role_permission_seeder.ts` (bloque nuevo; el `grants` literal `:27-29` no se toca)
- Test: manual (idempotencia: correr dos veces; `permissions:check-consistency`)

**Interfaces:**
- Consumes: slug `users:credential-change` en BD (lo lleva `0062` corriendo solo; si no existe, THROW explicativo).
- Produces: exactamente los roles que hoy tienen `users:update` quedan con `users:credential-change`, sin que ningún otro rol gane capacidades.

- [ ] **Step 1: Agregar el bloque derivado (roles por consulta, nunca slugs cableados)**

```ts
// database/seeders/0063_system_role_permission_seeder.ts — después del bucle de grants, sin tocarlo
// 1. Resolver el permiso nuevo. Si no existe, THROW: 0062 va antes.
const target = await SystemPermission.query()
  .where('system_permission_slug', 'credential-change')
  .andWhereHas('systemModule', (q) => q.where('system_module_slug', 'users'))
  .first()
if (!target) throw new Error('0063: users:credential-change no existe. Corre 0062 primero.')

// 2. Permiso origen (users:update) y roles que YA lo tienen.
const source = await SystemPermission.query()
  .where('system_permission_slug', 'update')
  .andWhereHas('systemModule', (q) => q.where('system_module_slug', 'users'))
  .firstOrFail()

const roleIds = await RoleSystemPermission.query()
  .where('system_permission_id', source.systemPermissionId)
  .select('role_id')

// 3. firstOrCreate por rol. Idempotente, re-ejecutable en cada base de cliente.
for (const { roleId } of roleIds) {
  await RoleSystemPermission.firstOrCreate(
    { roleId, systemPermissionId: target.systemPermissionId },
    { roleId, systemPermissionId: target.systemPermissionId }
  )
}
```

Confirmar al teclear nombres de modelo/columna y el índice único `(roleId, systemPermissionId)`.

- [ ] **Step 2: Verificar idempotencia en local (dos corridas)**

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files 0062_system_module_seeder,0063_system_role_permission_seeder
NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files 0062_system_module_seeder,0063_system_role_permission_seeder
```

Expected: ambas terminan sin error y sin duplicados.

- [ ] **Step 3: Commit**

```bash
git add database/seeders/0063_system_role_permission_seeder.ts
git commit -m "feat: Conceder cambio de credencial a roles que administran usuarios"
```

---

### Task 7: Pruebas funcionales + verificación obligatoria de cierre

**Files:**
- Create: `tests/functional/credential_change_consequences.spec.ts`
- Modify: ninguno más (solo correr `tests/unit/constants/system_modules_constant.spec.ts` y regresión auth/users)
- Test: este task ES el test

**Interfaces:**
- Consumes: las tres puertas cableadas (Task 5), `mail.fake()`, `LogStore`, `api_tokens`, `logger`.
- Produces: evidencia de CA-1 a CA-13 y DoD; salida de `check-consistency` para pegar en el PR.

- [ ] **Step 1: Escribir el funcional (molde `tests/functional/auth_mail_service.spec.ts` con `mail.fake()`)**

```ts
// tests/functional/credential_change_consequences.spec.ts
import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'

test('acto completo por expediente: revoca, avisa x2 y registra', async ({ assert, client, db }) => {
  mail.fake()
  const { titular, actorConPermiso } = await db.seedCredentialChangeScenario()
  const response = await client.put(`/api/persons/${titular.personId}`).loginAs(actorConPermiso).json({ personEmail: 'nuevo@corp.mx' })
  response.assertStatus(201)
  assert.isEmpty(await db.apiTokensOf(titular.userId))
  assert.equal(mail.fakedMails.length, 2)
})

test('sin permiso: 403 PERM.DENIED y nada cambia', async ({ assert, client, db }) => {
  mail.fake()
  const { titular, actorSinPermiso } = await db.seedCredentialChangeScenario()
  const response = await client.put(`/api/persons/${titular.personId}`).loginAs(actorSinPermiso).json({ personEmail: 'atacante@mail.com' })
  response.assertStatus(403)
  response.assertBodyContains({ title: 'Sin permiso', detail: 'No tienes permiso para realizar esta operación.', key: 'PERM.DENIED' })
  assert.equal(mail.fakedMails.length, 0)
})
```

Completar con: dos destinatarios con contenidos distintos (enmascarado vs completo + «tu contraseña no cambió»), rollback no revoca ni notifica, edición sin tocar correo sin efectos, rebote del buzón anterior no impide el nuevo, doble cambio consecutivo (CA-5: el segundo aviso también llega a `victima@personal`), titular conserva su token en curso, fallo de correo/registro deja `notified:false`/`logged:false` con éxito HTTP, alta `POST /api/users` sin efectos, `already-in-sync` sin efectos.

- [ ] **Step 2: Correr el funcional hasta verde**

```bash
node ace test tests/functional/credential_change_consequences.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Verificación obligatoria antes del PR (fresh + consistencia + regresión, en serie, nunca dos migraciones a la vez)**

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
NODE_ENV=test DB_DATABASE=sae_pruebas node ace permissions:check-consistency
node ace test tests/unit/constants/system_modules_constant.spec.ts tests/functional/platform_recovery_controller.spec.ts
```

Expected: `fresh --seed` verde; `check-consistency` sin hallazgos (código 0, salida para pegar en el PR); regresión verde. Si `fresh` falla con orden, el prefijo o la 612 cambiaron: escalar, no renombrar migraciones mergeadas.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/credential_change_consequences.spec.ts
git commit -m "test: Cubrir las cuatro consecuencias del cambio de credencial"
```

### Task 8: Manual de QA API (regla manual-qa-api, lo recorre una persona)

**Files:**
- Create: `docs/superpowers/plans/2026-09-25-cerrar-consecuencias-cambio-credencial-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (agregar bloque QA, es el archivo compartido no versionado; no crear uno nuevo)
- Test: ninguno (el manual lo camina una persona, no el agente ni Playwright)

**Interfaces:**
- Consumes: las tres puertas verificadas (Task 7), constantes del proyecto (URL base, auth, envelope, seeder, dominio).
- Produces: playbook listo para que una persona lo recorra con Postman/Insomnia/Bruno.

Constantes tomadas del manual anterior de este mismo API (`2026-09-23-blindar-espejo-correo-credencial-qa-api.md`): URL base `http://127.0.0.1:3333`; auth `Authorization: Bearer <token>` + header obligatorio `X-Business-Unit-Id` (id público de la empresa, resuelto en Preparar); envelope de éxito `{type, title, message, data}`; seeder compartido `database/seeders/_tmp_do_not_commit_qa_seeder.ts` con `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`; dominio `gsti-tests.local`, contraseña `password`.

- [ ] **Step 1: Agregar el bloque QA al seeder compartido (un solo archivo, un solo comando)**

```ts
// database/seeders/_tmp_do_not_commit_qa_seeder.ts — agregar personas QA-CRED-01/02/03, usuarios y empleado
// A: qa-cred-admin@gsti-tests.local / password — administra usuarios (tiene users:update + users:credential-change tras 0062,0063)
// B: qa-cred-limitado@gsti-tests.local / password — solo edita expediente (employees:tab-persona-write, sin users:credential-change)
// Titular: qa-cred-titular01@gsti-tests.local con sesión viva (token viejo para probar revocación)
```

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Los ids nunca se hardcodean; el manual los resuelve con:

```sql
SELECT person_id, person_lastname FROM people WHERE person_firstname = 'QACred' ORDER BY person_lastname;
SELECT user_id, user_email, person_id FROM users WHERE user_email LIKE 'qa-cred-%' AND user_deleted_at IS NULL ORDER BY user_email;
SELECT b.business_unit_public_id FROM business_units b JOIN business_unit_users bu ON bu.business_unit_id = b.business_unit_id JOIN users u ON u.user_id = bu.user_id WHERE u.user_email = 'qa-cred-admin@gsti-tests.local' AND u.user_deleted_at IS NULL;
SELECT tokenable_id FROM api_tokens WHERE tokenable_id = <titular.userId>;
```

- [ ] **Step 2: Escribir el manual con la estructura mínima (contrato, no código)**

```markdown
# Prueba manual API — Cerrar las consecuencias del cambio de credencial

**Problema:** corregir el correo del expediente de un colaborador le cambia en los hechos el correo con el que entra, y hoy ocurre en silencio: sigue con sesiones abiertas, nadie le avisa y no queda registro.

**Solución:** al cambiar ese correo se cierran sus sesiones abiertas, le llega aviso al correo anterior y al nuevo, queda registrado quién/cuándo/de cuál a cuál, y hace falta un permiso propio.

Ejemplo: es como si en la escuela te cambiaran el correo del salón sin decirte: al día siguiente tu llave vieja ya no abre y nadie te avisó cuál es la nueva. Ahora te avisan a las dos direcciones y anotan quién hizo el cambio.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente.

**URL base:** `http://127.0.0.1:3333`
**Headers:** `Authorization: Bearer <token>` + `X-Business-Unit-Id: <id público de Preparar>`

## 1. Preparar
<comando seeder + tabla A (con permiso) / B (sin permiso) + consultas SQL de arriba>

## 2. Escenarios
### Escenario 1 — Expediente con permiso: cambia y dispara las cuatro consecuencias
**Endpoint:** `PUT /api/persons/<Cred01.personId>` body `{"personFirstname":"QACred","personLastname":"Cred01","personEmail":"qa-cred-titular01-nuevo@gsti-tests.local"}`
**Response exacto:** `201` con `emailMirror: {"status":"written","target":"users"}`
Qué significa cada dato: `emailMirror.status: written (sí se copió) / skipped (no se copió)`; `target: users (la cuenta de entrada)` ...
Confirmación: `SELECT` en `api_tokens` vacío para el titular; segundo login con correo nuevo ok, con viejo 401; dos correos en el buzón de pruebas.

### Escenario 2 — Expediente sin permiso: se rechaza y nada cambia
**Endpoint:** `PUT /api/persons/<Cred02.personId>` como usuario B con correo distinto
**Response exacto:** `403` `{"title":"Sin permiso","detail":"No tienes permiso para realizar esta operación.","key":"PERM.DENIED"}`
(Los datos son los ya explicados en el Escenario 1.)

### Escenario 3 — Edición que no toca el correo: sin efectos
**Endpoint:** `PUT /api/persons/<Cred01.personId>` cambiando solo teléfono
**Response exacto:** `201` idéntico a hoy, sin revocar ni avisar.

## 3. Checklist
- [ ] Escenario 1 revoca + avisa x2 + registra
- [ ] Escenario 2 da 403 PERM.DENIED sin cambiar nada
- [ ] Escenario 3 no exige permiso ni efectos
```

Reglas aplicadas: cada escenario trae método+ruta+body y status+body literales (nunca «debería fallar»); después de cada response la lista `qué significa` en lenguaje llano, cada dato explicado una sola vez; bodies completos y pegables; prohibido rutas de archivos, clases, servicios o «revisa el código»; sin casos borde ni regresiones (el doble cambio CA-5 y el titular que conserva su token quedan en el funcional Task 7, no aquí); sin interruptor global (nada que advertir ni limpiar); no se automatiza el recorrido (lo camina una persona, sin Playwright/`webapp-testing`).

- [ ] **Step 3: Verificar que el manual cumple la regla (checklist de formato)**

```bash
rg -n "Ejemplo:|URL base|Preparar|Escenario|Checklist|Qué significa" docs/superpowers/plans/2026-09-25-cerrar-consecuencias-cambio-credencial-qa-api.md
```

Expected: las seis marcas presentes; cero menciones a `app/` o clases en el manual.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-25-cerrar-consecuencias-cambio-credencial-qa-api.md
git commit -m "docs: Agregar manual de QA para consecuencias del cambio de credencial"
```

---

## Self-Review (chequeo del plan contra el spec)

1. Spec coverage: regla 1 → Task 3+5 (revocación en `trx`, seis `emit`); regla 2 → Task 4+7 (dos avisos, conjunto previo descifrado, CA-2/CA-3/CA-5); regla 3 → Task 3+5 (lista blanca, M1/M6, D-A, CA-6/CA-7); regla 4+5 → Task 1+2+5+6 (permiso, gate por transición antes de `trx`, 403, CA-4); regla 6 → Task 3+5 (juntos o ninguno; avisos/registro post-commit contados, CA-9/CA-11); regla 7+8 → Task 2+5+7 (no-op, alta, CA-10); regla 9 → Task 3+7 (preservedTokenId, CA-8); regla 10 → Task 1+6+7 (catálogo, CA-13). D-A → Task 3+5; D-B → Task 3; D5/CA-12 → Task 3. Sin lector (no-objetivo) respetado en todo el plan.
2. Placeholder scan: sin `TBD/TODO`, sin «manejo apropiado de errores», cada paso trae código o comando literal; sin «similar al Task N» (el cableado M4/M6 repite el bloque completo o la diferencia exacta).
3. Type consistency: `CredentialChangeOrigin`, `RevokeSessionsParams`, `NotifyAndAuditParams`, `CredentialChangeGateInput`, `CredentialChangedMailParams` con las mismas firmas en Tasks 2-5; `mirror_origin: 'person-file' | 'user-screen' | 'employee-file'` idéntico en servicio y asiento; `revoked/notified/logged` sin correos en el `logger` en todos los tasks.
