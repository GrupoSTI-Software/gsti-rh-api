# Restaurar la unicidad de la credencial de acceso — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que dos cuentas vivas nunca compartan el correo de acceso, que la baja libere el correo, que el conflicto se rechace con 400 `{title, detail, key, code}` y que el login no emita la sesión de una fila distinta a la que verificó la contraseña.

**Architecture:** Columna generada VIRTUAL `users.user_email_active` (`CASE WHEN user_deleted_at IS NULL THEN TRIM(user_email) ELSE NULL END`) + UNIQUE `users_email_active_unique` (hereda `utf8mb4_0900_ai_ci`: case y accent insensitive por construcción). Censo previo en `this.defer` registrado primero que aborta sin tocar el esquema y sin proyectar correos. El formato de error sale del patrón `isX/respondX` ya existente en `user_access_email_api_error.ts` + catálogo `USR.MAIL.002`. El login se endurece comparando la fila que verificó la contraseña contra la que emite la sesión. Sin `await` sobre `this.schema`, sin `COLLATE` explícito, sin declarar la columna en el modelo, sin tocar validators ni espejo.

**Tech Stack:** AdonisJS 6 · Lucid MySQL (`mysql2`, `naturalSort: false`) · VineJS (`.unique()`) · i18n (`resources/langs/es.json`, `en.json`) · Japa (`node ace test`) · BD desechable `sae_pruebas`

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1789698261611-unicidad-credencial-acceso` (en trabajo; el spec pide `feature/USRH1789698261611-restaurar-unicidad-credencial-acceso` sobre `feature/USRH1789698261609-marcar-empresa-duena-persona` — validar con `git branch --show-current` y `git log --oneline -5` al empezar; si la rama base es otra, no se cambia de rama en silencio: se reporta a Wilvardo). **No se crea ningún PR**: el trabajo se entrega en la rama, revisado con este plan y su manual de QA. No se hace push sin petición explícita.

**HU:** USRH1789698261611 — *Restaurar la unicidad de la credencial de acceso* · **Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1789698261611.md` (validado contra código el 2026-09-18, rama `multitenant` @ `09a6fe7`; los anexos A–D viven en `anexos-USRH1789698261611/` y no fueron accesibles desde esta sesión — todo el código de este plan sale del repo, revalidado el 2026-09-22 abajo en "Estado actual verificado").

---

## Global Constraints

Copiadas del spec (§4, §9, §12, §14, §15). Cada tarea las hereda.

- **Regla 1.** Dos cuentas vivas no pueden tener el mismo correo de acceso.
- **Regla 2.** El correo de una cuenta dada de baja queda libre desde la baja y puede reusarse, incluida la misma persona al reincorporarse.
- **Regla 3.** Varias cuentas dadas de baja pueden compartir el mismo correo sin conflicto.
- **Regla 4.** Desactivar (`user_active = 0`) NO libera el correo; solo la baja (`user_deleted_at`) lo libera. El índice se condiciona sobre `user_deleted_at`, NUNCA sobre `user_active`.
- **Regla 5.** Mayúsculas y acentos no distinguen: `Juan@empresa.com` = `juan@empresa.com`; `José@empresa.com` = `jose@empresa.com` (lo da `utf8mb4_0900_ai_ci`, sin `COLLATE` explícito).
- **Regla 6.** Alta o edición con correo de otra cuenta viva → **400** `{title, detail, key:'correo-de-acceso-ya-registrado', code:'USR.MAIL.002'}`; la cuenta existente no cambia. Status 400, no 409 (el backoffice tiene su rama sobre 400).
- **Regla 7.** Verificación previa: si hay vivas compartiendo correo, la migración **no aplica nada** y reporta `user_id`/`person_id`/`user_active` + conteos. **Nunca proyecta el correo** (ni completo ni enmascarado), ni `business_unit_id`. No corrige, no borra, no fusiona.
- **Regla 8.** No se depura ni se corrige información existente ni se cambia el correo de nadie. Sin backfill ni saneo.
- **Migración con `node ace make:migration add_email_active_unique_to_users`**, prefijo de **EXACTAMENTE 13 dígitos** posterior a `1789700400000` (verificar con `ls database/migrations | tail`). Nunca escribir el timestamp a mano. **Nunca `await this.schema`** (el getter registra builders y Lucid los ejecuta al terminar `up()`; el `await` ejecuta el SQL dos veces → "Duplicate column name"). Sin `await`, el orden entre llamadas se respeta.
- **Molde:** `database/migrations/1787932877000000_add_slug_active_unique_to_business_units.ts` (131 líneas) con cinco diferencias deliberadas: `TRIM(user_email)` en la expresión, `VARCHAR(200)` no 250, bloque `CSV_TABLES` **eliminado** (`user_email` no está denormalizado en ningún CSV), `SET SESSION group_concat_max_len` antes del censo, prefijo de 13 dígitos.
- **Censo en `this.defer` registrado PRIMERO**, porque en MySQL cada `ALTER TABLE` hace commit implícito y un aborto posterior dejaría la tabla a medias. `down()` tolerante vía `information_schema` (funciona aunque `up()` haya abortado a medias).
- **La columna generada NO se declara en `app/models/user.ts`** (MySQL rechaza escrituras sobre generadas y Lucid la metería en el INSERT). **VIRTUAL, no STORED** (el índice secundario materializa igual; STORED reconstruiría toda `users` sin comprar nada).
- **`key` fijo no traducible:** `correo-de-acceso-ya-registrado` (slug del título en español kebab-case). **`code`:** `USR.MAIL.002` (campo aparte). Nunca se escribe el `code` como `key`. i18n sí: dos claves en `es.json` **y** `en.json` (los dos idiomas o ninguno), porque `user_access_email_api_error.ts:30-31` ya usa `ctx.i18n.t`.
- **El 400 nunca lleva:** traza de MySQL, nombre del índice, el correo, ni `verifyInfo.data` (que trae `userPassword` hash scrypt, `userToken`, `pinCode`). Solo `{title, detail, key, code}`.
- **No se tocan:** `app/models/user.ts` · `app/validators/user.ts` · `platform_auth_controller.ts`, `platform_recovery_controller.ts`, `passkey_controller.ts`, `platform_magic_link_service.ts` · `person_controller.ts`, `employee_controller.ts`, `signup_draft_service.ts` (HU par *Blindar el espejo*) · `database/seeders/0008_user_seeder.ts` (`firstOrCreate`, idempotente) · `system_modules.constant.ts` · rutas y middlewares · `valanserh-bo`. Si aparece un archivo editado fuera de §13 del spec, se reporta antes de absorberlo.
- **TypeScript estricto, cero `any`:** detectores reciben `unknown` y estrechan con guards, nunca con aserción. `logger` de Adonis, nunca `console.*`.
- **Tests contra `sae_pruebas`:** `node ace test` fija `NODE_ENV=test` y lee `.env.test` solo; `node ace migration:*` NO — siempre `NODE_ENV=test DB_DATABASE=sae_pruebas` delante. Nunca dos migraciones a la vez (lock global `GET_LOCK('1',0)` → `E_UNABLE_ACQUIRE_LOCK`). Solo `migration:fresh --seed` reproduce el orden de un entorno nuevo; `migration:run` incremental no detecta errores de orden.
- **Nada se retira a `__TO_DELETE__/` en esta HU.** Cada commit lista sus archivos; nunca `git add -A`. No commitear `pnpm-lock.yaml` ni `pnpm-workspace.yaml` si están sucios por causas ajenas.
- **Ubicar por nombre de función, no por número de línea.** Los números son del estado al 2026-09-22 y sirven para orientarse.

---

## Estado actual verificado (2026-09-22, rama `feature/USRH1789698261611-unicidad-credencial-acceso`)

Cada ancla del spec coincide con el código:

| # | Ancla | Evidencia | Veredicto |
|---|---|---|---|
| 1 | Login emite sesión de `:263-274` (`where user_email + where user_active=1 + first`) y verifica en `:392-394` (`verifyCredentials`, descarta resultado) | `user_controller.ts:263-274`, `:391-409` leídos | Coincide. D11 aplica en `:392-400` |
| 2 | `verifyInfo` única rama `status !== 200` = correo repetido entre vivos excluyendo propio id | `user_service.ts:232-252` leído | Coincide. Un solo llamador en update (`:2066`) |
| 3 | `createUserValidator.unique()` con `whereNull(user_deleted_at).where(user_email, value)` | `validators/user.ts:21-27` leído | Coincide, no se toca |
| 4 | Alta responde 500 crudo (`:1736-1749`), edición responde legacy `{type,title,message}` (`:2066-2074`, catch `:2125-2134`) | `user_controller.ts:1700-1749`, `:2066-2074`, `:2123-2135` leídos | Coincide |
| 5 | Guarda fail-open `if (existEmail && user.userEmail)` en `:249` | `user_service.ts:241` leído | Coincide, `''` es falsy |
| 6 | Catálogo `USR.MAIL.001` + helper `isX/respondX` con `ctx.i18n.t('user_access_email_masked_*')` | `user_access_email_error_codes.ts`, `user_access_email_api_error.ts` leídos | Coincide. `USR.MAIL.002` no existe aún: lo crea la Tarea 2 |
| 7 | Molde migración 16 dígitos con `defer` primero + `CSV_TABLES` + `VIRTUAL` + `down()` tolerante | `1787932877000000_add_slug_active_unique_to_business_units.ts` leído entero | Coincide. No copiar el prefijo de 16 dígitos |
| 8 | `config/database.ts` `naturalSort: false` | `config/database.ts:19-27` leído | Coincide |
| 9 | `tenant_actor.ts` arma correos únicos (`uniqueStamp`) | `tests/helpers/tenant_actor.ts:57,75` leído | Coincide: cero tests existentes se rompen |
| 10 | Claves `user_access_email_masked_title/detail` en `es.json:3007-3008` | grep leído | Coincide: las nuevas van al lado |
| 11 | Anexos `anexos-USRH1789698261611/` | No accesibles desde esta sesión (glob en `~/Downloads` vacío) | Todo el código del plan sale del repo + descriptivos del spec §§7,9,13. Al implementar, si los anexos aparecen, el verbatim del anexo manda sobre este plan en caso de diferencia literal |

---

## Estructura de archivos

| | Archivo | Responsabilidad |
|---|---|---|
| N1 | `database/migrations/<13dígitos>_add_email_active_unique_to_users.ts` | Censo `defer` + columna generada + índice + `down()` tolerante |
| N2 | `tests/functional/user_access_email_uniqueness.spec.ts` | CA-1 a CA-9 con su nombre |
| N3 | `tests/unit/helpers/user_access_email_duplicated_error.spec.ts` | Detectores + responder con errores sintéticos (CA-11) |
| E1 | `app/constants/user_access_email_error_codes.ts` | `DUPLICATED: 'USR.MAIL.002'` + definición + registro |
| E2 | `app/helpers/user_access_email_api_error.ts` | `is…ValidationError`, `is…IndexError`, `respond…Duplicated` |
| E3 | `app/controllers/user_controller.ts` | `:2066-2074` respuesta estándar · catch `~:1736` · catch `~:2125` · `:392-400` endurecimiento · JSDoc `@swagger` del 400 en `store` y `update` |
| E4 | `app/services/user_service.ts` | Una línea: guarda fail-open `:249` |
| E5 | `resources/langs/es.json` | `user_access_email_duplicated_title` / `…_detail` |
| E6 | `resources/langs/en.json` | Las mismas dos claves en inglés |
| QA | `docs/superpowers/plans/2026-09-22-restaurar-unicidad-credencial-acceso-qa-api.md` | Playbook manual API (regla manual-qa-api): 6 escenarios HTTP + línea de no observables; lo recorre una persona, no el agente |

---

### Task 1: Migración — censo que aborta + columna generada + índice

**Files:**
- Create: `database/migrations/<13dígitos>_add_email_active_unique_to_users.ts` (nombre real lo da `node ace make:migration`; el plan usa `<MIG>` como placeholder del prefijo)

**Interfaces:**
- Consumes: molde `1787932877000000_add_slug_active_unique_to_business_units.ts`; `config/database.ts` (`naturalSort: false`)
- Produces: tabla `users` con columna `user_email_active` + índice `users_email_active_unique`; mensaje de aborto sin correos que la Tarea 5 verifica a mano

- [ ] **Step 1: Generar la migración con el prefijo correcto**

```bash
node ace make:migration add_email_active_unique_to_users
ls database/migrations | tail -n 5
```

Expected: archivo nuevo `database/migrations/<13dígitos>_add_email_active_unique_to_users.ts` con prefijo de exactamente 13 dígitos y mayor que `1789700400000`. Si sale de 16 dígitos, detenerse y reportar (R7).

- [ ] **Step 2: Escribir la migración (sin `await` sobre `this.schema`, sin `CSV_TABLES`, con `TRIM` y `group_concat_max_len`)**

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Unicidad de la credencial de acceso entre cuentas vivas (USRH1789698261611).
 *
 * Agrega la columna generada VIRTUAL `user_email_active` y el índice UNIQUE
 * `users_email_active_unique` sobre ella. Patrón columna generada + UNIQUE,
 * nunca UNIQUE plano: un UNIQUE plano sobre `user_email` dejaría el correo
 * ocupado para siempre al dar de baja al usuario (la fila conserva su valor);
 * es el defecto que hizo retirar la regla en 2024. La expresión devuelve NULL
 * en las borradas y MySQL trata cada NULL como distinto, así que N borradas
 * con el mismo correo conviven (regla 3) mientras dos vivas no pueden (regla 1).
 *
 * VIRTUAL, no STORED: el índice secundario materializa igual el valor y el
 * ALTER es solo metadatos, sin reconstruir `users`.
 *
 * El índice se condiciona sobre `user_deleted_at`, NO sobre `user_active`:
 * desactivar es reversible y liberaría el correo para una reactivación con
 * duplicado (regla 4). Sin cláusula COLLATE: se hereda `utf8mb4_0900_ai_ci`
 * de la expresión, case y accent insensitive por construcción (regla 5).
 * `TRIM` porque la collation es NO PAD y sin él `'a@x.com '` conviviría con
 * `'a@x.com'` (CA-9).
 *
 * El censo va en `this.defer` registrado PRIMERO: en MySQL cada ALTER TABLE
 * hace commit implícito y un aborto posterior dejaría la tabla a medias.
 * El aborto no proyecta ningún correo (ni completo ni enmascarado) ni
 * `business_unit_id`: lista `user_id`, `person_id`, `user_active` y conteos.
 */

const TABLE = 'users'
const EMAIL_COL = 'user_email'
const ACTIVE_COL = 'user_email_active'
const DELETED_AT = 'user_deleted_at'
const INDEX = 'users_email_active_unique'

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    // Paso 1 — censo de vivas duplicadas (ANTES de cualquier DDL).
    this.defer(async (db) => {
      await db.rawQuery(`SET SESSION group_concat_max_len = 1000000`)
      type DupRow = { total: number; cuentas: string }
      const [rows] = await db.rawQuery<[DupRow[]]>(
        `SELECT
           COUNT(*) AS total,
           GROUP_CONCAT(
             CONCAT('user_id=', \`user_id\`, ' person_id=', \`person_id\`, ' user_active=', \`user_active\`)
             ORDER BY \`user_id\`
             SEPARATOR ', '
           ) AS cuentas
         FROM \`${TABLE}\`
         WHERE \`${DELETED_AT}\` IS NULL
         GROUP BY ${ACTIVE_COL_PLACEHOLDER()}
         HAVING COUNT(*) > 1
         ORDER BY total DESC`
          .replace('${ACTIVE_COL_PLACEHOLDER()}', `TRIM(\`${EMAIL_COL}\`)`)
      )
      if (rows.length === 0) return
      const lines = rows.map((r) => `  - x${r.total} -> ${r.cuentas}`).join('\n')
      throw new Error(
        '[USRH1789698261611] Cuentas vivas compartiendo correo de acceso — resolver manualmente antes de continuar:\n' +
          `${lines}\n` +
          'Consultas de diagnóstico (sin proyectar correos):\n' +
          `  SELECT user_id, person_id, user_active, COUNT(*) OVER (PARTITION BY TRIM(${EMAIL_COL})) AS repetidos FROM ${TABLE} WHERE ${DELETED_AT} IS NULL ORDER BY user_id;`
      )
    })

    // Paso 2 — columna generada VIRTUAL.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD COLUMN \`${ACTIVE_COL}\` VARCHAR(200)
        GENERATED ALWAYS AS (
          CASE WHEN \`${DELETED_AT}\` IS NULL
               THEN TRIM(\`${EMAIL_COL}\`)
               ELSE NULL END
        ) VIRTUAL
    `)

    // Paso 3 — índice UNIQUE sobre la generada.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD UNIQUE KEY \`${INDEX}\` (\`${ACTIVE_COL}\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: verifica information_schema antes de cada DROP.
    this.defer(async (db) => {
      type CountRow = { cnt: number }
      const [idxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND index_name = '${INDEX}'`
      )
      if ((idxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``)
      }
      const [colRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND column_name = '${ACTIVE_COL}'`
      )
      if ((colRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${ACTIVE_COL}\``)
      }
    })
  }
}
```

Nota: el `GROUP BY TRIM(user_email)` agrupa por el mismo valor que indexará la columna generada (la columna aún no existe durante el censo). No se agrupa por el correo crudo (los espacios burlarían el censo, CA-9) y no se proyecta ningún correo en el mensaje.

- [ ] **Step 3: Verificar que `fresh --seed` pasa en verde sobre base desechable**

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
```

Expected: termina en verde; el seeder raíz (`0008_user_seeder.ts:48`, `firstOrCreate`) no choca con el índice (CA-13).

- [ ] **Step 4: Commit**

```bash
git add database/migrations/<13dígitos>_add_email_active_unique_to_users.ts
git commit -m "feat: Agregar unicidad de correo de acceso entre cuentas vivas"
```

---

### Task 2: Catálogo, i18n y helper de error duplicado + unitario de detectores

**Files:**
- Modify: `app/constants/user_access_email_error_codes.ts`
- Modify: `app/helpers/user_access_email_api_error.ts`
- Modify: `resources/langs/es.json`
- Modify: `resources/langs/en.json`
- Test: `tests/unit/helpers/user_access_email_duplicated_error.spec.ts`

**Interfaces:**
- Consumes: `USER_ACCESS_EMAIL_ERROR_CODES.MASKED`, `respondUserAccessEmailMasked` (patrón a calcar); claves `user_access_email_masked_*` en langs
- Produces: `USER_ACCESS_EMAIL_ERROR_CODES.DUPLICATED`, `USER_ACCESS_EMAIL_ERRORS.DUPLICATED`, `isUserAccessEmailDuplicatedValidationError(error: unknown)`, `isUserAccessEmailDuplicatedIndexError(error: unknown)`, `respondUserAccessEmailDuplicated(ctx)` — que la Tarea 3 llama en los tres puntos del controlador

- [ ] **Step 1: Fijar el `rule` real de VineJS (10 minutos, R4, antes de escribir el detector)**

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace repl
```

Dentro del REPL, provocar un alta duplicada y volcar `error.messages[0]` para anotar el `rule` exacto que emite `.unique()` (se espera `database.unique`). El valor real se escribe en el detector del Step 4; el `includes('unique')` queda como red laxa pero el código cita el valor observado en comentario.

- [ ] **Step 2: Escribir el test unitario que falla (CA-11 sin montar concurrencia: errores sintéticos)**

```typescript
// tests/unit/helpers/user_access_email_duplicated_error.spec.ts
import { test } from '@japa/runner'
import {
  isUserAccessEmailDuplicatedValidationError,
  isUserAccessEmailDuplicatedIndexError,
  respondUserAccessEmailDuplicated,
} from '#helpers/user_access_email_api_error'

test.group('Detector de correo de acceso duplicado (CA-11)', () => {
  test('detecta el error de validación VineJS del .unique() de createUserValidator', ({ assert }) => {
    const error = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ field: 'userEmail', rule: 'database.unique', message: 'crudo' }],
    }
    assert.isTrue(isUserAccessEmailDuplicatedValidationError(error))
  })

  test('detecta el ER_DUP_ENTRY del índice users_email_active_unique', ({ assert }) => {
    const error = {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      message: "Duplicate entry 'x' for key 'users.users_email_active_unique'",
    }
    assert.isTrue(isUserAccessEmailDuplicatedIndexError(error))
  })

  test('el responder devuelve solo title, detail, key, code con status 400', ({ assert }) => {
    const statuses: number[] = []
    const ctx = {
      response: { status: (s: number) => { statuses.push(s) } },
      i18n: { t: (k: string) => k },
    } as any
    const body = respondUserAccessEmailDuplicated(ctx)
    assert.deepEqual(statuses, [400])
    assert.deepEqual(Object.keys(body).sort(), ['code', 'detail', 'key', 'title'])
    assert.equal(body.key, 'correo-de-acceso-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.002')
  })
})
```

Run: `node ace test --files="tests/unit/helpers/user_access_email_duplicated_error.spec.ts"`
Expected: FAIL (funciones no existen).

- [ ] **Step 3: Ampliar el catálogo (E1)**

```typescript
// app/constants/user_access_email_error_codes.ts
/**
 * Códigos estables para rechazo de correo de acceso (USRH1789328027034, USRH1789698261611).
 * Prefijo USR = Users.
 */
export const USER_ACCESS_EMAIL_ERROR_CODES = {
  /** El correo de acceso contiene el carácter de máscara U+2022. */
  MASKED: 'USR.MAIL.001',
  /** El correo de acceso ya lo usa otra cuenta viva. */
  DUPLICATED: 'USR.MAIL.002',
} as const

export type UserAccessEmailErrorCode =
  (typeof USER_ACCESS_EMAIL_ERROR_CODES)[keyof typeof USER_ACCESS_EMAIL_ERROR_CODES]

export type UserAccessEmailErrorDefinition = {
  key: string
  code: UserAccessEmailErrorCode
  status: number
}

export const USER_ACCESS_EMAIL_ERRORS: Record<'MASKED' | 'DUPLICATED', UserAccessEmailErrorDefinition> = {
  MASKED: { key: 'no-fue-posible-guardar-el-correo-de-acceso', code: USER_ACCESS_EMAIL_ERROR_CODES.MASKED, status: 422 },
  DUPLICATED: { key: 'correo-de-acceso-ya-registrado', code: USER_ACCESS_EMAIL_ERROR_CODES.DUPLICATED, status: 400 },
}
```

Verificar que el registro `MASKED` conserva el `key`/`status` que `respondUserAccessEmailMasked` ya devuelve (422 + `no-fue-posible-guardar-el-correo-de-acceso`): si el archivo original no exportaba `USER_ACCESS_EMAIL_ERRORS`, el `MASKED` de arriba es aditivo y `respondUserAccessEmailMasked` no se toca.

- [ ] **Step 4: Agregar claves i18n (E5, E6 — los dos idiomas o ninguno)**

```json
// resources/langs/es.json (junto a user_access_email_masked_*)
"user_access_email_duplicated_title": "Este correo de acceso ya está en uso",
"user_access_email_duplicated_detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
```

```json
// resources/langs/en.json (misma posición)
"user_access_email_duplicated_title": "This access email is already in use",
"user_access_email_duplicated_detail": "Another active account uses this access email; use a different one or deactivate the account holding it. No changes were saved.",
```

- [ ] **Step 5: Implementar detectores + responder (E2 — calcar el patrón `isX/respondX`, con `ctx.i18n.t`, cero `any`)**

```typescript
// Adición a app/helpers/user_access_email_api_error.ts (el resto del archivo no se toca)
import { USER_ACCESS_EMAIL_ERROR_CODES } from '#constants/user_access_email_error_codes'

type VineValidationMessage = { field?: unknown; rule?: unknown; message?: unknown }
type VineValidationError = { code?: unknown; messages?: unknown }

function isVineValidationError(error: unknown): error is VineValidationError {
  return typeof error === 'object' && error !== null && 'code' in error && 'messages' in error
}

/** El .unique() inline de createUserValidator (validators/user.ts:21-27). Rule observado: 'database.unique' (ver Tarea 2 Step 1). */
export function isUserAccessEmailDuplicatedValidationError(error: unknown): boolean {
  if (!isVineValidationError(error)) return false
  if (error.code !== 'E_VALIDATION_ERROR') return false
  if (!Array.isArray(error.messages)) return false
  return (error.messages as VineValidationMessage[]).some(
    (m) =>
      m.field === 'userEmail' &&
      typeof m.rule === 'string' &&
      m.rule.includes('unique')
  )
}

/** La perdedora de una carrera entre dos altas concurrentes (CA-11): MySQL 1062 sobre el índice. */
export function isUserAccessEmailDuplicatedIndexError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { code?: unknown; errno?: unknown; message?: unknown }
  if (e.code !== 'ER_DUP_ENTRY' && e.errno !== 1062) return false
  return typeof e.message === 'string' && e.message.includes('users_email_active_unique')
}

export function respondUserAccessEmailDuplicated(ctx: HttpContext): UserAccessEmailErrorBody {
  ctx.response.status(400)
  return {
    title: ctx.i18n.t('user_access_email_duplicated_title'),
    detail: ctx.i18n.t('user_access_email_duplicated_detail'),
    key: 'correo-de-acceso-ya-registrado',
    code: USER_ACCESS_EMAIL_ERROR_CODES.DUPLICATED,
  }
}
```

Prohibido: meter el correo, el nombre del índice o `verifyInfo.data` en el cuerpo.

- [ ] **Step 6: Correr el unitario en verde + typecheck del helper**

```bash
node ace test --files="tests/unit/helpers/user_access_email_duplicated_error.spec.ts"
npm run typecheck
```

Expected: PASS, `tsc --noEmit` limpio.

- [ ] **Step 7: Commit**

```bash
git add app/constants/user_access_email_error_codes.ts app/helpers/user_access_email_api_error.ts resources/langs/es.json resources/langs/en.json tests/unit/helpers/user_access_email_duplicated_error.spec.ts
git commit -m "feat: Agregar error USR.MAIL.002 de correo de acceso duplicado"
```

---

### Task 3: Controlador (4 puntos) + guarda de correo vacío + Swagger

**Files:**
- Modify: `app/controllers/user_controller.ts` (puntos: `:2066-2074` respuesta estándar · catch `~:1736` · catch `~:2125` · `:392-400` endurecimiento · JSDoc `@swagger` del 400 en `store` y `update`)
- Modify: `app/services/user_service.ts` (una línea en `:249`, nada más)

**Interfaces:**
- Consumes: `isUserAccessEmailDuplicatedValidationError`, `isUserAccessEmailDuplicatedIndexError`, `respondUserAccessEmailDuplicated` (Tarea 2); `UserService.verifyInfo` (contrato intacto)
- Produces: `POST /api/users` y `PUT /api/users/:userId` con 400 estándar en duplicado, carrera y `''`; login que responde 404 cuando `user === null && userVerify === true`

- [ ] **Step 1: Cerrar la guarda fail-open (E4 — una línea, D14, R6)**

```typescript
// app/services/user_service.ts:241 — antes:
if (existEmail && user.userEmail) {
// después:
if (existEmail && user.userEmail !== undefined && user.userEmail !== null && user.userEmail !== '') {
```

Antes de cerrarla, grepear consumidores que envíen `userEmail: ''` legítimamente: si los hay, el 400 es correcto pero se declara en el resumen de cierre (R6). `validators/user.ts:15,47` (`.minLength(0)`) hace de `''` una entrada válida hoy; tras el cambio es 400.

- [ ] **Step 2: Respuesta estándar en edición (`:2066-2074` — sin reenviar `verifyInfo.data`)**

```typescript
// app/controllers/user_controller.ts — bloque update, antes:
const verifyInfo = await userService.verifyInfo(user)
if (verifyInfo.status !== 200) {
  response.status(verifyInfo.status)
  return {
    type: verifyInfo.type,
    title: verifyInfo.title,
    message: verifyInfo.message,
    data: { ...data },
  }
}
// después:
const verifyInfo = await userService.verifyInfo(user)
if (verifyInfo.status !== 200) {
  return respondUserAccessEmailDuplicated(ctx)
}
```

`verifyInfo.data` trae el modelo completo (`userPassword` hash, `userToken`, `pinCode`): no se reenvía. `ctx` ya está desestructurado en `update(ctx)` (`const { auth, request, response, i18n, scopedUser } = ctx`): pasar `ctx` entero al responder.

- [ ] **Step 3: Tercer guard en cada catch (una línea por catch, `~:1736` store y `~:2125` update)**

```typescript
// En ambos catch, después de los dos guards existentes:
if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
if (isUserAccessEmailMaskedError(error)) return respondUserAccessEmailMasked(ctx, error)
// NUEVO (una línea por catch):
if (isUserAccessEmailDuplicatedValidationError(error) || isUserAccessEmailDuplicatedIndexError(error)) return respondUserAccessEmailDuplicated(ctx)
```

Cubre el camino de validación (VineJS) y la carrera (índice). El 500 genérico queda debajo, intacto para lo demás.

- [ ] **Step 4: Endurecimiento del login (D11 — con la decisión escrita, no sobre la marcha)**

Decisión (va al resumen de cierre): el estado nuevo `user === null && userVerify === true` —hoy inalcanzable, alcanzable tras el cambio— resuelve como **404 con el mismo cuerpo de credencial inválida**. Ningún intento legítimo cambia de respuesta.

```typescript
// app/controllers/user_controller.ts — bloque login, antes:
let userVerify = false
try {
  await User.verifyCredentials(userEmail, userPassword)
  userVerify = true
} catch (error) {
  if (error.code !== 'E_INVALID_CREDENTIALS') {
    throw error
  }
}

if (!userVerify) {
  response.status(404)
  return {
    type: 'warning',
    title: 'Login',
    message: 'Incorrect email or password',
    data: { user: {} },
  }
}
// después:
let verifiedUserId: number | null = null
try {
  const verified = await User.verifyCredentials(userEmail, userPassword)
  verifiedUserId = (verified as unknown as { userId?: unknown }).userId as number
  // verifyCredentials devuelve el modelo; si la forma cambiara, el comparador de abajo cae a 404 (fail-closed)
} catch (error) {
  const e = error as { code?: unknown }
  if (e.code !== 'E_INVALID_CREDENTIALS') {
    throw error
  }
}

if (verifiedUserId === null || user === null || user.userId !== verifiedUserId) {
  response.status(404)
  return {
    type: 'warning',
    title: 'Login',
    message: 'Incorrect email or password',
    data: { user: {} },
  }
}
```

Es el patrón que `platform_auth_controller.ts:114-117` ya usa (re-consulta por `user_id`): el correcto ya existe en el repo y aquí se traslada al login principal. Cierra el bypass por lógica en la ventana entre el merge y el `migration:run` de producción. Si `verifyCredentials` no devolviera el modelo en esta versión de Adonis, alternativa fail-closed: comparar por re-consulta `User.query().where('user_id', verified.userId)`; validar la forma del retorno antes de commitear (si difiere, se ajusta el estrechamiento, nunca con `any`).

- [ ] **Step 5: JSDoc `@swagger` del 400 en `store` y `update` (mismo formato de los bloques `detail`/`key` ya declarados en `:1629-1641` y `:2026-2038`)**

Agregar en ambos bloques una entrada `400` con `{title, detail, key:'correo-de-acceso-ya-registrado', code:'USR.MAIL.002'}`. Solo documentación; cero rutas, cero validadores, cero permisos.

- [ ] **Step 6: Imports (sin mover la validación al validator)**

```typescript
import {
  isUserAccessEmailDuplicatedIndexError,
  isUserAccessEmailDuplicatedValidationError,
  respondUserAccessEmailDuplicated,
} from '#helpers/user_access_email_api_error'
```

`app/validators/user.ts` no se toca (el `updateUserValidator` no recibe `user_id`; `verifyInfo` ya excluye el propio id).

- [ ] **Step 7: Commit**

```bash
git add app/controllers/user_controller.ts app/services/user_service.ts
git commit -m "fix: Rechazar correo de acceso duplicado con error estándar y endurecer login"
```

---

### Task 4: Nueve casos funcionales CA-1 a CA-9 con su nombre

**Files:**
- Create: `tests/functional/user_access_email_uniqueness.spec.ts`

**Interfaces:**
- Consumes: endpoints `POST /api/users`, `PUT /api/users/:userId`; `tests/helpers/tenant_actor.ts` (`createTenantActor`, `grantModulePermissions`, `businessUnitHeaders`); moldes `business_unit_competency_level_label_uniqueness.spec.ts`, `role_business_unit_uniqueness.spec.ts`
- Produces: evidencia de reglas 1-6; los tres casos con siembra fuera de HTTP (CA-5, CA-6, CA-9) que el DoD exige por nombre

Pre-requisito: correr contra `sae_pruebas` recién sembrada (`NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`). Los correos de actor ya son únicos por `uniqueStamp()`, así que ningún test existente se rompe. Cada caso usa su propio actor con permiso de alta/edición de usuarios y header `X-Business-Unit-Id`; el orden de Middlewares (401/400/403 antes de la unicidad, SEC-5) se hereda del gate y no se re-prueba aquí.

- [ ] **Step 1: Esqueleto del spec con los 9 nombres (falla: archivo no existe aún)**

```typescript
// tests/functional/user_access_email_uniqueness.spec.ts
import { test } from '@japa/runner'
import User from '#models/user'
import {
  createTenantActor,
  cleanupTenantActor,
  grantModulePermissions,
  businessUnitHeaders,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Unicidad de la credencial de acceso (USRH1789698261611).
 * Nueve casos del spec §5, uno por nombre. Tres siembran fuera de HTTP
 * (CA-5, CA-6, CA-9) y son los que no se recortan (riesgo R2).
 */
test.group('Unicidad del correo de acceso', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createTenantActor('mailuniq')
    await grantModulePermissions(actor, 'usuarios', ['crear', 'editar'])
    return async () => cleanupTenantActor(actor)
  })

  test('CA-1 alta-con-correo-de-usuario-vivo', async ({ assert, client }) => {})
  test('CA-2 edicion-con-correo-de-otro-usuario-vivo', async ({ assert, client }) => {})
  test('CA-3 edicion-conservando-el-propio-correo', async ({ assert, client }) => {})
  test('CA-4 alta-con-correo-de-usuario-dado-de-baja', async ({ assert, client }) => {})
  test('CA-5 n-borrados-con-el-mismo-correo-conviven', async ({ assert }) => {})
  test('CA-6 alta-con-correo-de-usuario-inactivo-no-borrado', async ({ assert, client }) => {})
  test('CA-7 variante-de-mayusculas', async ({ assert, client }) => {})
  test('CA-8 variante-de-acento', async ({ assert, client }) => {})
  test('CA-9 espacios-alrededor-del-correo', async ({ assert }) => {})
})
```

Ajustar los slugs de módulo/permiso (`'usuarios'`, `['crear','editar']`) a los reales del catálogo (`system_modules.constant.ts` + `grantModulePermissions` exige que existan en BD; si difieren, usar los que el molde `role_business_unit_uniqueness.spec.ts` usa para usuarios).

- [ ] **Step 2: CA-1, CA-2, CA-3, CA-4 (caminos HTTP)**

```typescript
test('CA-1 alta-con-correo-de-usuario-vivo', async ({ assert, client }) => {
  const a = actor!
  // Dado: usuario vivo con correo único
  const existing = await client.post('/api/users')
    .headers(businessUnitHeaders(a)).loginAs(a.user).json({})
  // ... crear vía helper del molde o directo; Cuando: POST con el mismo correo
  // Entonces: 400 {title, detail, key:'correo-de-acceso-ya-registrado', code:'USR.MAIL.002'}, sin fila nueva, existente intacto en BD
})
```

Montaje concreto por caso (seguir el molde `business_unit_competency_level_label_uniqueness.spec.ts` para la forma de crear el usuario inicial y de loguearse; si el molde usa `createBypassActor('owner', …)`, usar ese):

- **CA-1** *(reglas 1, 6)*: alta con el correo de un vivo → 400 + cuerpo exacto; `User.query().where('user_email', correo).whereNull('user_deleted_at')` sigue devolviendo una sola fila y con los mismos campos.
- **CA-2** *(reglas 1, 6)*: dos vivos A y B; `PUT /api/users/:id(A)` con correo de B → 400 + mismo cuerpo; **verificar en BD** que ninguna de las dos filas cambió (`$original` vs re-leído o `SELECT` comparando `user_email`).
- **CA-3** *(regla 1)*: editar cualquier campo conservando el propio correo → 200 (atrapa el `whereNot('user_id', …)` ausente).
- **CA-4** *(regla 2)*: borrar lógicamente al titular (`user.delete()` con SoftDeletes) y dar de alta el mismo correo → 201.

- [ ] **Step 3: CA-5, CA-6, CA-9 (siembra fuera de HTTP — no recortables)**

```typescript
// CA-5 (regla 3): tres borradas con el mismo correo conviven; una viva entra; la segunda viva revienta con ER_DUP_ENTRY; resucitar una borrada (user_deleted_at = NULL) también revienta.
// CA-6 (regla 4): fila user_active=0, user_deleted_at NULL sembrada directo; POST con su correo → 400.
// CA-9 (regla 5, D14): fila viva sembrada directo con 'pref-ca9-<stamp>@gsti-tests.local ' (espacio final); sembrar otra viva con el correo sin espacio → ER_DUP_ENTRY (el TRIM de la generada las iguala).
```

Para "revienta con `ER_DUP_ENTRY`" capturar el error del `save()`/`create()` y asertar `code === 'ER_DUP_ENTRY' || errno === 1062` (no por HTTP: es la capa del índice, CA-11 la traduce a 400 en el unitario). Limpiar las filas sembradas en el teardown del grupo (borrado físico por `user_id` + personas) para no contaminar otros specs.

- [ ] **Step 4: CA-7, CA-8 (variantes de collation por HTTP)**

- **CA-7** *(regla 5)*: vivo con `juan-<stamp>@gsti-tests.local`; alta con el mismo en mayúsculas → 400.
- **CA-8** *(regla 5)*: vivo con `jose-<stamp>@gsti-tests.local`; alta con `josé-<stamp>@gsti-tests.local` → 400. Raro en correos reales y real; va escrito para que no llegue a soporte como sorpresa.

- [ ] **Step 5: Correr el archivo en verde**

```bash
node ace test --files="tests/functional/user_access_email_uniqueness.spec.ts"
```

Expected: 9 PASS. Si un slug de permiso difiere, el fallo es 403 del gate (no del caso): corregir el setup, no el aserto.

- [ ] **Step 6: Commit**

```bash
git add tests/functional/user_access_email_uniqueness.spec.ts
git commit -m "test: Cubrir unicidad de correo de acceso con nueve casos"
```

---

### Task 5: Verificación manual en base + suite completa + cierre

**Files:** Ninguno (evidencia al resumen de cierre). Si el triage de la suite exige tocar fixtures compartidos, se reporta antes de absorberlos (§14: archivo editado fuera de §13 se reporta).

**Interfaces:**
- Consumes: todo lo anterior
- Produces: DoD completo marcado con outputs pegados al resumen de cierre; `permissions:check-consistency` en 0; residuales de §12 escritos en el resumen de cierre

- [ ] **Step 1: Seis ítems del DoD con output pegado (Japa no los automatiza: solo existen si se corren y se dejan por escrito, R3)**

```bash
# 1. Base vacía + siembra completa en verde
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
# 2. Sembrar a mano dos vivos duplicados (incluida variante de mayúsculas) y correr migration:run → ABORTA, mensaje sin ningún correo
# 3. Tras el aborto, node ace migration:rollback corre limpio (down() tolerante)
# 4. SHOW COLUMNS FROM users LIKE 'user_email_active' → cero filas tras el aborto; tras la corrida buena, SHOW FULL COLUMNS muestra utf8mb4_0900_ai_ci
# 5. SHOW INDEX FROM users WHERE Key_name = 'users_email_active_unique' → cero filas tras el aborto, presente tras la corrida buena
# 6. SELECT * FROM adonis_schema WHERE name LIKE '%email_active_unique%' → cero filas tras el aborto
```

El mensaje del ítem 2 se inspecciona literalmente: sin dirección de correo (ni completa ni enmascarada) y sin `business_unit_id`. Resuelto el conflicto a mano, la re-corrida pasa.

- [ ] **Step 2: CA-10 (abuso) demostrado a mano en la misma sesión del ítem 2, antes de aplicar la migración**

Sobre `sae_pruebas` con la migración aún no aplicada: dos vivos con el mismo correo (A activo, B inactivo con contraseña conocida); login con el correo y la contraseña de B → **hoy emite sesión de A**; tras el endurecimiento (Tarea 3) → **404**. Evidencia al resumen de cierre. Tras aplicar la migración ese estado es inalcanzable (el censo aborta si existe y el índice impide crearlo).

- [ ] **Step 3: Suite completa + typecheck + lint + consistencia de catálogo**

```bash
node ace test
npm run typecheck
npm run lint
NODE_ENV=test DB_DATABASE=sae_pruebas node ace permissions:check-consistency
```

Expected: suite en verde con el índice puesto; `tsc --noEmit` y lint limpios; `permissions:check-consistency` con código 0 (esta HU no toca catálogo, pero la regla lo exige tras cada `fresh --seed`). Triage pegado al resumen de cierre si algo cambia. Verificar además: respuesta de conflicto sin `verifyInfo.data` y cuerpo del 400 sin correo ni nombre del índice; `signup_draft_service.ts:377` (escribe `userEmail`: si no valida, el detector ER_DUP_ENTRY lo cubre con 400 — se declara lo observado).

- [ ] **Step 4: Escribir los residuales de §12 en el resumen de cierre (no se venden como cerrados)**

`platform_auth_controller.ts:109-122` (admin de plataforma desactivado sigue entrando a la consola landlord — HU aparte ~1 SP, el `if (!verifiedUser.userActive)` junto al `isPlatformAdmin` de `:111`); passkey ×4 / magic link / recuperación de plataforma (el índice las cubre sin tocar línea, más el 404/200 distinguible de `passkey_controller.ts:93` vs `:598`); homoglifos (la collation no los pliega); `user_deleted_at` + auth (cerrado con evidencia de `node_modules`); sin limiter en `POST`/`PUT /api/users` (declarado, no arreglado aquí).

- [ ] **Step 5: Verificación de par indivisible y ventana de lanzamiento**

Confirmar por escrito en el resumen de cierre: *Blindar el espejo* va al mismo sprint o no va ninguna (si solo cabe una, no entra ésta — el espejo es la vía de fabricación del duplicado y sin él el índice convierte el defecto silencioso en 500 ruidoso). Supuesto vigente: la base arranca limpia el 2026-09-28 (decisión de Wilvardo del 2026-09-17); la verificación previa queda igual y su resultado esperado en la ventana es no encontrar nada.

---

### Task 6: Manual de prueba manual API (regla manual-qa-api, sin inferencia)

**Files:**
- Create: `docs/superpowers/plans/2026-09-22-restaurar-unicidad-credencial-acceso-qa-api.md`

**Interfaces:**
- Consumes: Tareas 1-3 (contrato 400 `{title, detail, key, code}`, endpoints `POST /api/users` y `PUT /api/users/:userId`); constantes del repo y del manual anterior (abajo)
- Produces: playbook recorrible por una persona con cliente API. El recorrido es manual y humano: el agente solo prepara ambiente + seeder y entrega el playbook; no lo camina ni lo automatiza (regla manual-qa-execution: sin Playwright ni `webapp-testing` salvo que se pida explícito para esa vez). Lo único automatizado son los tests Japa (Tareas 2 y 4, `node ace test`)

Constantes tomadas del repo y del manual anterior del mismo API (regla: la regla fija el formato, los valores salen del repo):
- URL base local: `http://127.0.0.1:3333` (manual anterior `2026-09-21-marcar-empresa-duena-persona-qa-api.md:10`)
- Auth: se asume resuelta por el cliente (`Authorization: Bearer <token>`); más `X-Business-Unit-Id` donde el endpoint lo exige. El login no se documenta como escenario (la HU no cambia el camino legítimo).
- Seeder QA (el mismo archivo, no se crea uno nuevo): `database/seeders/_tmp_do_not_commit_qa_seeder.ts`, comando `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`; dominio `gsti-tests.local`, contraseña `password` (cabecera del seeder).
- Módulo y permisos (constante viva): módulo `users` (`system_modules.constant.ts:240-241`), permisos `create` (crear usuarios) y `update` (editar usuarios).
- Rutas (código): `POST /api/users` y `PUT /api/users/:userId` (prefijo en `start/routes/user_routes.ts:54`).

- [ ] **Step 1: Extender el seeder QA (no versionado, mismo archivo) con el pack de esta HU**

Agregar al mismo `_tmp_do_not_commit_qa_seeder.ts` (sin crear archivo nuevo) un bloque idempotente `seedCredencialAccesoQa()` llamado desde el `run()` principal, que deja: un admin `qa-credencial-admin@gsti-tests.local` / `password` con rol con `users:create,update` en su empresa; dos vivos `qa-credencial-titular@gsti-tests.local` y `qa-credencial-vecino@gsti-tests.local`; una cuenta dada de baja `qa-credencial-reingreso@gsti-tests.local` (fila con `user_deleted_at` puesto); un vivo `qa-credencial-juan@gsti-tests.local`; un vivo `qa-credencial-jose@gsti-tests.local`; y seis personas libres `QA-CRED-PERSONA-01..06` sin usuario (para los bodies de alta). Todo con `firstOrCreate`/guarda de existencia como el resto del archivo; volver a correr restaura lo modificado.

- [ ] **Step 2: Escribir el manual con la estructura mínima de la regla (1-5) y su ejemplo**

Crear `docs/superpowers/plans/2026-09-22-restaurar-unicidad-credencial-acceso-qa-api.md` con este contenido exacto (ajustar solo los ids resueltos por SQL al momento de recorrer):

```markdown
# Prueba manual API — Dos cuentas vivas nunca comparten el correo de acceso

**Problema:** El correo con el que una persona entra al sistema es su credencial, no un dato de contacto más. Hoy el sistema deja guardar dos cuentas vivas con el mismo correo de acceso, y al entrar comprueba la contraseña contra una cuenta pero deja entrar a otra: una persona puede terminar dentro de la cuenta de otra, con sus permisos y su empresa, y la segunda persona se queda sin poder entrar con su contraseña correcta sin que ninguna pantalla explique por qué.

**Solución:** Desde esta historia dos cuentas vivas no pueden guardar el mismo correo de acceso: dar de alta o editar una cuenta con el correo de otra cuenta viva se rechaza con un mensaje claro, y el correo de una cuenta dada de baja queda libre para reusarse. Quien hoy entra con un correo único sigue entrando igual.

Ejemplo: es como si en la escuela dos alumnos tuvieran el mismo número de casillero y la llave de uno abriera el casillero del otro; ahora cada número es de un solo alumno, y cuando uno se va su número queda libre para el siguiente.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-credencial-admin@gsti-tests.local` | `password` | Administrador con permiso de crear y editar usuarios |

Los ids no se inventan: se resuelven con estas consultas (los correos de acceso se guardan y se buscan tal cual):

```sql
SELECT user_id FROM users WHERE user_email = 'qa-credencial-titular@gsti-tests.local' AND user_deleted_at IS NULL;
SELECT user_id FROM users WHERE user_email = 'qa-credencial-vecino@gsti-tests.local' AND user_deleted_at IS NULL;
SELECT person_id FROM people WHERE person_firstname = 'QACred' AND person_lastname IN ('Persona01','Persona02','Persona03','Persona04','Persona05','Persona06');
SELECT role_id FROM roles WHERE role_slug = '<rol con users:create,update del seeder>';
```

Casos que no se pueden provocar en este ambiente y no se recorren aquí: la revisión previa que aborta la migración ante duplicados, la convivencia de varias cuentas dadas de baja con el mismo correo, el correo de una cuenta desactivada pero no dada de baja, los espacios alrededor del correo sembrados directo en base, el ingreso con dos cuentas que ya comparten correo y dos altas simultáneas con el mismo correo.

## 2. Escenario 1 — Alta con el correo de otra cuenta viva: se rechaza con mensaje claro

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-credencial-titular@gsti-tests.local",
  "userActive": true,
  "roleId": 3,
  "personId": 101,
  "userEmailType": "institutional"
}
```

(`roleId` y `personId`: los resueltos en Preparar; `userEmailType` puede valer `institutional` o `personal`.)

**Response exacto:** `400`

```json
{
  "title": "Este correo de acceso ya está en uso",
  "detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
  "key": "correo-de-acceso-ya-registrado",
  "code": "USR.MAIL.002"
}
```

Qué significa cada dato:
- `title`: el encabezado corto del rechazo: ese correo ya tiene dueña entre las cuentas vivas.
- `detail`: la explicación y qué hacer: usar otro correo o dar de baja la cuenta que lo ocupa; nada se guardó.
- `key`: la clave fija del rechazo en español con guiones; siempre vale `correo-de-acceso-ya-registrado` y no cambia con el idioma.
- `code`: el identificador punteado del rechazo; siempre vale `USR.MAIL.002`.

## 3. Escenario 2 — Editar una cuenta para ponerle el correo de otra cuenta viva: se rechaza igual

Usuario: **A**. Identificador: el `user_id` de `qa-credencial-vecino@gsti-tests.local` (resuelto en Preparar).

**Endpoint:** `PUT /api/users/<user_id del vecino>`

```json
{
  "userEmail": "qa-credencial-titular@gsti-tests.local",
  "userActive": true,
  "roleId": 3,
  "userEmailType": "institutional"
}
```

**Response exacto:** `400` con el mismo cuerpo del Escenario 1. (Los datos son los ya explicados en el Escenario 1.) Comprobar en la base que ninguna de las dos cuentas cambió:

```sql
SELECT user_email FROM users WHERE user_email IN ('qa-credencial-titular@gsti-tests.local','qa-credencial-vecino@gsti-tests.local') AND user_deleted_at IS NULL;
```

Deben seguir las dos filas con su correo de antes.

## 4. Escenario 3 — Editar una cuenta conservando su propio correo: procede

Usuario: **A**. Identificador: el `user_id` de `qa-credencial-vecino@gsti-tests.local`.

**Endpoint:** `PUT /api/users/<user_id del vecino>`

```json
{
  "userEmail": "qa-credencial-vecino@gsti-tests.local",
  "userActive": true,
  "roleId": 3,
  "userEmailType": "institutional"
}
```

**Response exacto:** `200` con la cuenta actualizada. (Los datos son los ya explicados en el Escenario 1 para el rechazo; aquí no hay rechazo: el sistema reconoce el correo propio y no se autobloquea.)

## 5. Escenario 4 — Alta con el correo de una cuenta dada de baja: procede, el correo quedó libre

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-credencial-reingreso@gsti-tests.local",
  "userActive": true,
  "roleId": 3,
  "personId": 102,
  "userEmailType": "institutional"
}
```

**Response exacto:** `201` con la cuenta creada.

Qué significa lo nuevo aquí:
- El `201`: la baja liberó el correo y puede reusarse, incluida la misma persona al reincorporarse.

## 6. Escenario 5 — Alta con el mismo correo en mayúsculas: se rechaza igual

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "QA-CREDENCIAL-JUAN@gsti-tests.local",
  "userActive": true,
  "roleId": 3,
  "personId": 103,
  "userEmailType": "institutional"
}
```

**Response exacto:** `400` con el mismo cuerpo del Escenario 1. (Los datos son los ya explicados en el Escenario 1: para el sistema las mayúsculas no distinguen un correo de otro.)

## 7. Escenario 6 — Alta con el mismo correo con acento: se rechaza igual

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-credencial-josé@gsti-tests.local",
  "userActive": true,
  "roleId": 3,
  "personId": 104,
  "userEmailType": "institutional"
}
```

**Response exacto:** `400` con el mismo cuerpo del Escenario 1. (Los datos son los ya explicados en el Escenario 1: para el sistema los acentos tampoco distinguen un correo de otro.)

## 8. Checklist

- [ ] Escenario 1 — Alta con correo de otra viva: 400 con título, detalle, clave y código
- [ ] Escenario 2 — Edición con correo de otra viva: 400 igual y ninguna cuenta cambia
- [ ] Escenario 3 — Edición con el propio correo: 200
- [ ] Escenario 4 — Alta con correo de baja: 201
- [ ] Escenario 5 — Alta en mayúsculas: 400 igual
- [ ] Escenario 6 — Alta con acento: 400 igual
```

Sin paso de limpieza: el recorrido no enciende ningún interruptor global (no toca banderas de instancia; lo sembrado se restaura recorriendo el seeder).

- [ ] **Step 3: Verificar el manual contra la regla (checklist de la regla, no inferencia)**

Releer `manual-qa-api.mdc` y marcar: un escenario por variante con endpoint + response exacto (sí); bodies completos y pegables (sí); cada dato explicado una sola vez, remitiendo a donde ya se explicó (sí); valores fijos (`key`, `code`, `userEmailType`) enumerados con su traducción en su primera aparición (sí); alcance solo la HU + línea de no observables en ambiente sembrado (sí); un solo comando de seeder sobre el mismo archivo no versionado con tabla de usuarios `qa-<feature>-<variante>@<dominio>` (sí); ejemplo cotidiano de 2-4 líneas tras Problema/Solución (sí); cero rutas de archivos, clases, servicios, validadores, middlewares o lenguaje del backend en el manual (revisar: el manual no nombra ninguno); ids por consulta SQL, no hardcodeados (sí).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-22-restaurar-unicidad-credencial-acceso-qa-api.md
git commit -m "docs: Agregar manual QA API de unicidad de credencial de acceso"
```

---

## Self-Review (corrida por el autor del plan, no delegable)

1. **Cobertura del spec:** §5 CA-1→T4.S2, CA-2→T4.S2, CA-3→T4.S2, CA-4→T4.S2, CA-5→T4.S3, CA-6→T4.S3, CA-7→T4.S4, CA-8→T4.S4, CA-9→T4.S3, CA-10→T5.S2, CA-11→T2 (unitario con sintético, fijado contra R5) + T3.S3 (cableado), CA-12→T1 (censo) + T5.S1, CA-13→T1.S3 + T5.S1. §9 (columna+índice+TRIM+VIRTUAL+sin COLLATE+no en modelo)→T1. §10 (dos 400 + 400 de carrera + 404 login + Swagger)→T3. §12 (censo sin correos, oráculo acotado, bordes, residuales)→T1+T2+T3+T5.S4. §15 DoD (6 ítems + rule VineJS + 13 dígitos + 9 nombres + CA-10 a mano + suite + no-reenvío + typecheck/lint + residuales)→T5. Sin huecos.
2. **Placeholder scan:** sin `TBD/TODO`, sin "manejo apropiado de errores", sin "tests similares a la Tarea N" (cada caso lleva su montaje), sin tipos o funciones sin definir (cada `Produces` tiene su `Consumes`). `<MIG>` y `<stamp>` son valores de corrida, no placeholders de diseño (los da `make:migration` / `uniqueStamp()`). La Tarea 6 no infiere: cada constante del manual cita su fuente (URL base y auth del manual anterior del mismo API, seeder/dominio/contraseña de la cabecera del seeder, módulo `users` y permisos `create`/`update` de la constante viva, rutas de `start/routes`).
3. **Consistencia de tipos:** `DUPLICATED: 'USR.MAIL.002'` (E1) = `code` del responder (E2) = aserto del unitario (N3) = aserto de CA-1/CA-2 (N2); `key: 'correo-de-acceso-ya-registrado'` idéntico en catálogo, helper y tests; índice `users_email_active_unique` idéntico en migración, detector y DoD; `user === null || user.userId !== verifiedUserId → 404` no cambia el cuerpo de credencial inválida.
