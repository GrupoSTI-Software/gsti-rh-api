# Unicidad de RFC, CURP y NSS por empresa — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el RFC, la CURP y el NSS sean únicos dentro de cada empresa cliente (no en todo el sistema), con el correo personal intacto como único global, errores en formato del equipo sin datos internos, y huella liberada al vaciar o dar de baja.

**Architecture:** Tres columnas generadas VIRTUAL (`person_*_active` = huella viva o NULL) + tres UNIQUE compuestos `(business_unit_id, *_active)` — NULL significa "no compite" y MySQL lo trata como distinto, así que bajas, vaciados y filas sin empresa quedan libres por construcción. Censo previo en `this.defer` que aborta sin tocar el esquema. `verifyInfo` y los `.unique()` de VineJS comparan por empresa explícita; el correo no se toca; el controller traduce los tres caminos de rechazo (validación, verificación, carrera en índice) al formato `{title, detail, key, code}`.

**Tech Stack:** AdonisJS 6 · Lucid MySQL (`naturalSort: false`, BD desechable `sae_pruebas`) · VineJS · i18n (`resources/langs/es.json`, `en.json`) · Japa (`node ace test`)

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1789698261610-unicidad-identidad-por-empresa` (verificar con `git branch --show-current` al empezar). **No se abre PR ni se hace push sin petición explícita.**

**HU:** USRH1789698261610 — *Unicidad de identidad por empresa* · **Spec:** `spec-USRH1789698261610.md` (versión viva enlazada en la HU; si el spec se corrige, el enlace manda sobre este plan en el literal que difiera). Los anexos A–D no fueron accesibles desde esta sesión: todo el código del plan sale del repo, revalidado el 2026-09-22 abajo en "Estado actual verificado".

---

## Global Constraints

Copiadas de la HU (§Reglas de negocio). Cada tarea las hereda.

- **Regla 1.** RFC, CURP y NSS únicos dentro de cada empresa cliente. Dos empresas distintas pueden tener cada una su expediente del mismo trabajador con los tres datos iguales.
- **Regla 2.** Dentro de una empresa, dos expedientes vivos no comparten RFC, CURP ni NSS.
- **Regla 3.** Por empresa, no por cliente: el mismo trabajador puede estar una vez en cada empresa de un grupo. Fuera de esta historia.
- **Regla 4.** La baja libera los tres datos desde ese momento. Varias bajas de la misma empresa pueden compartirlos.
- **Regla 5.** El correo personal sigue único global. Ni directo ni por arrastre se acota por empresa. Punto de máxima atención en revisión.
- **Regla 6.** Dato repetido → rechazo con título, detalle y clave del formato del equipo, en términos de negocio, sin datos internos. Dice qué dato está repetido y nada más.
- **Regla 7.** Vaciar uno de los tres datos lo libera de inmediato. La huella huérfana actual se corrige aquí.
- **Regla 8.** Expedientes sin empresa (sync biométrico, signup) fuera de la regla. No se fuerza.
- **Regla 9.** Verificación previa: vivos de una misma empresa compartiendo dato → no aplica nada y reporta para resolver a mano. No corrige, no borra, no fusiona.
- **Regla 10.** Operación sin empresa → se rechaza por ese motivo y nunca responde si el dato está repetido. El criterio que distingue la regla funcionando de la regla aparentando funcionar.
- **Regla 11.** No sanea, no corrige, no cambia información capturada (los valores en claro). Poner a NULL una huella huérfana es dato derivado, no información del expediente: se permite solo vía receta manual del mensaje de aborto, nunca automática.
- **Migración con `node ace make:migration`**, prefijo de **EXACTAMENTE 13 dígitos** posterior a `1790089196691` (el último hoy). Nunca escribir el timestamp a mano. **Nunca `await this.schema`** (CLAUDE.md).
- **TypeScript estricto, cero `any` nuevo.** `logger` de Adonis, nunca `console.*`. Código y comentarios en español; identificadores en inglés.
- **Tests contra `sae_pruebas`:** `node ace test` fija `NODE_ENV=test` solo; `node ace migration:*` NO — siempre `NODE_ENV=test DB_DATABASE=sae_pruebas` delante. Nunca dos migraciones a la vez (`GET_LOCK` global). Solo `migration:fresh --seed` reproduce el orden de un entorno nuevo.
- **Nada se retira a `__TO_DELETE__/` en esta HU.** Cada commit lista sus archivos; nunca `git add -A`. No commitear `pnpm-lock.yaml` ni `pnpm-workspace.yaml` si están sucios por causas ajenas.
- **Ubicar por nombre de función, no por número de línea.** Los números son del estado al 2026-09-22 y sirven para orientarse.

---

## Estado actual verificado (2026-09-22, rama @ `a09eb980`)

| # | Ancla | Evidencia | Veredicto |
|---|---|---|---|
| 1 | `Person` ya trae `businessUnitId` nullable + scope fail-closed + hook tolerante | `app/models/person.ts:80-113, 317-322` leídos | Base lista (HU 609). Esta HU la consume, no la crea. |
| 2 | Alta (`store`) valida con `createPersonValidator` (unique global por huella) y **no** llama `verifyInfo` | `person_controller.ts:343-393`, `validators/person.ts:20-75` leídos | El alta se acota en el `.unique()` (Tarea 4). |
| 3 | Edición (`update`) **no** tiene unique en `updatePersonValidator`; valida duplicados solo vía `verifyInfo` (global, 422 `Dato duplicado`) | `validators/person.ts:79-91`, `person_controller.ts:666-675`, `person_service.ts:197-252` leídos | La edición se acota en `verifyInfo` (Tarea 4). |
| 4 | Carga masiva solo comprueba CURP vía `personWithCurpExists` (global, salta la fila) | `employee_service.ts:3002-3009, 3249-3256` leídos | Se acota pasando la empresa de la fila (Tarea 5). |
| 5 | `calculateIdentifierHashes` solo **pone** huellas, nunca las **quita**: vaciar el campo conserva la huella anterior | `person.ts:293-300` leído | Es el defecto de la regla 7 (Tarea 2). |
| 6 | Sin UNIQUE en BD sobre huellas: solo `string(...,64).nullable()` | `grep database/migrations` sin `unique` en personas | La BD no respalda nada hoy; la carrera entre dos altas pasa (Tarea 1 + traducción en Tarea 4). |
| 7 | Formato del equipo = `{title, detail, key, code}` + catálogo `USR.MAIL.002` + helper `isX/respondX` + i18n es/en | `user_access_email_api_error.ts`, `user_access_email_error_codes.ts`, `langs/es.json:3010-3011` leídos | Molde de la regla 6 (Tarea 3). Status del duplicado de credencial: 400; aquí se conserva **422** (mismo status que hoy en personas) y solo cambia el cuerpo — decisión documentada, se verifica con BO en Tarea 7. |
| 8 | `/api/persons` y lugares de nacimiento ya montan `businessScope()` | `person_routes.ts:36-54` leído | Sin empresa la HTTP ya se rechaza (400 `BU.VAL.000` / 404 `BU.NOT.001`). La regla 10 se cierra en `verifyInfo`/validadores/controller para que ningún camino conteste sin empresa. |
| 9 | Bulk resuelve `businessUnitId` por fila (`finalBusinessUnitId`, rechaza la fila si es null) | `employee_service.ts:2934-2958` leído | La empresa de la fila existe en el loop; solo hay que pasarla (Tarea 5). |
| 10 | Última migración `1790089196691_add_email_active_unique_to_users.ts` (13 dígitos, censo en `defer` + generada VIRTUAL + `down()` tolerante) | leída entera | Molde de la Tarea 1. |
| 11 | Helpers de spec: `createBypassActor('owner'|'root', prefix)`, `cleanupTenantActor`, `businessUnitHeaders(actor)` | `tests/helpers/tenant_actor.ts` leído | Base de la spec funcional (Tarea 4). `owner` pasa el gate; `businessScope` lo acota a su empresa. |

---

## Estructura de archivos

| | Archivo | Responsabilidad |
|---|---|---|
| N1 | `database/migrations/<13dígitos>_add_person_identity_active_uniques_to_people_table.ts` | Censo `defer` + 3 generadas VIRTUAL + 3 UNIQUE compuestos + `down()` tolerante |
| N2 | `tests/unit/migrations/person_identity_company_unique_migration.spec.ts` | Contenido de N1 (censo primero, sin PII, 13 dígitos, sin `await this.schema`) |
| E1 | `app/utils/blind_index.ts` | `blindIndexOrNull` (blanco → NULL) |
| E2 | `app/models/person.ts` | `calculateIdentifierHashes` libera huellas (regla 7) |
| N3 | `tests/unit/models/person_identity_hash_release.spec.ts` | Blanco libera, valor pone, case/trim insensible |
| N4 | `app/constants/person_identity_error_codes.ts` | `PERSON.IDENTITY.001-004` + llaves + status |
| N5 | `app/helpers/person_identity_api_error.ts` | Detectores (validación / índice) + `respond…` |
| N6 | `tests/unit/helpers/person_identity_api_error.spec.ts` | Detectores con errores sintéticos + cuerpos sin datos internos |
| E3 | `resources/langs/es.json`, `resources/langs/en.json` | 4 títulos + 4 detalles (los dos idiomas o ninguno) |
| N7 | `app/helpers/person_identity_lookup.ts` | Primitiva `livePersonWithIdentityExists` (por empresa, nunca sin empresa) |
| N8 | `tests/unit/helpers/person_identity_lookup.spec.ts` | Alcance por empresa, exclusión propia, sin-empresa = falso, correo fuera |
| E4 | `app/services/person_service.ts` | `verifyInfo(person, businessUnitId)` acotado + guardia sin-empresa; correo global intacto |
| E5 | `app/validators/person.ts` | `.unique()` de CURP/RFC/NSS acotados + fail-open sin scope; correo intacto |
| E6 | `app/controllers/person_controller.ts` | Guardia sin-empresa + `businessUnitId` al verificar + traducción de los 3 rechazos |
| N9 | `tests/functional/person_identity_company_scope.spec.ts` | Criterios 1-6 de la HU por HTTP |
| E7 | `app/services/employee_service.ts` | `personWithCurpExists(curp, businessUnitId)` + paso de la empresa de la fila |
| QA | `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-qa-api.md` | Playbook manual API (lo recorre una persona) |
| C | `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-cierre.md` | Resumen de cierre (sin PR) |

**Decisión del plan, revertible:** `verifyInfo` cambia de forma (devuelve `{status, field?}` y el controller arma el cuerpo). El único llamador es `person_controller.update` y ningún spec la cita (grep en Tarea 4 paso 0 lo confirma antes de tocar). Si Wilvardo lo rechaza, se conserva la forma actual y el controller traduce el mensaje viejo — solo cambia ese paso.

---

## Preparación (una sola vez)

- [ ] Confirmar rama y árbol (salvo los dos yaml sucios por causas ajenas):

```bash
git branch --show-current && git status --short
```

Expected: `feature/USRH1789698261610-unicidad-identidad-por-empresa`, solo `M pnpm-lock.yaml` y `?? pnpm-workspace.yaml`.

- [ ] Sembrar la BD desechable:

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
```

Expected: termina sin error (hoy: 680 migraciones).

- [ ] Confirmar que ningún spec cita `verifyInfo` de persona y copiar el import exacto del helper de actores:

```bash
grep -rn "verifyInfo" tests/ | grep -iv "employee\|shift\|exception" | head; echo ---; grep -n "tenant_actor" tests/functional/employees/person_store_subject_type_permission_gate.spec.ts | head -3
```

Expected: cero citas a `verifyInfo` de persona; la segunda línea muestra el import a copiar en la spec N9 (misma ruta de alias).

---

### Task 1: Migración — censo que aborta + 3 generadas + 3 UNIQUE por empresa

**Files:**
- Create: `database/migrations/<13dígitos>_add_person_identity_active_uniques_to_people_table.ts` (vía `node ace make:migration`)
- Test: `tests/unit/migrations/person_identity_company_unique_migration.spec.ts`

**Interfaces:**
- Consumes: molde `1790089196691_add_email_active_unique_to_users.ts`; columnas `person_{rfc,curp,imss_nss}_hash VARCHAR(64)`, `people.business_unit_id`, `people.person_deleted_at`.
- Produces: `person_{rfc,curp,imss_nss}_active VARCHAR(64)` VIRTUAL + UNIQUE `people_{rfc,curp,imss_nss}_company_unique (business_unit_id, *_active)`. NULL = "no compite": bajas, vaciados y sin-empresa quedan libres por construcción (reglas 4, 7, 8).

- [ ] **Step 1: Escribir el test de contenido que falla**

Crear `tests/unit/migrations/person_identity_company_unique_migration.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789698261610 — unicidad de RFC, CURP y NSS por empresa entre vivos.
 * El censo aborta ANTES de cualquier DDL (cada ALTER hace commit implícito).
 * El reporte nunca proyecta valores en claro: solo empresa, conteo y person_id.
 */

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'database/migrations')
const MIGRATION_SLUG = 'add_person_identity_active_uniques_to_people_table'
const PREVIOUS_LAST_PREFIX = '1790089196691'

function readMigration(): { name: string; content: string } {
  const name = readdirSync(MIGRATIONS_DIR).find((file) => file.includes(MIGRATION_SLUG))
  if (!name) {
    throw new Error(`No existe la migración *_${MIGRATION_SLUG}.ts`)
  }
  return { name, content: readFileSync(join(MIGRATIONS_DIR, name), 'utf-8') }
}

test.group('unicidad identidad por empresa — migración', () => {
  test('existe, con prefijo de 13 dígitos posterior a la última del repo', ({ assert }) => {
    const { name } = readMigration()
    const prefix = name.slice(0, 13)
    assert.match(name, /^[0-9]{13}_add_person_identity_active_uniques_to_people_table\.ts$/)
    assert.isTrue(prefix > PREVIOUS_LAST_PREFIX, `${prefix} debe ordenar después de ${PREVIOUS_LAST_PREFIX}`)
  })

  test('el censo va en defer y corre antes que cualquier DDL', ({ assert }) => {
    const { content } = readMigration()
    const upBody = content.slice(content.indexOf('async up()'), content.indexOf('async down()'))
    const deferIdx = upBody.indexOf('this.defer')
    assert.isAbove(deferIdx, -1, 'el censo vive en this.defer')
    assert.isBelow(deferIdx, upBody.indexOf('ADD COLUMN'), 'el censo se registra antes que el DDL')
    assert.notMatch(content, /await\s+this\.schema/, 'nunca await sobre this.schema (CLAUDE.md)')
    assert.notMatch(upBody, /\bUPDATE\b|\.update\(/i, 'sin backfill ni saneo: regla 11')
  })

  test('tres generadas VIRTUAL condicionadas a vivo + tres UNIQUE compuestos', ({ assert }) => {
    const { content } = readMigration()
    for (const hash of ['person_rfc_hash', 'person_curp_hash', 'person_imss_nss_hash']) {
      const active = hash.replace('_hash', '_active')
      assert.include(content, `ADD COLUMN \`${active}\` VARCHAR(64)`)
      assert.include(content, 'GENERATED ALWAYS AS')
      assert.include(content, ') VIRTUAL')
    }
    assert.include(content, 'ADD UNIQUE KEY `people_rfc_company_unique` (`business_unit_id`, `person_rfc_active`)')
    assert.include(content, 'ADD UNIQUE KEY `people_curp_company_unique` (`business_unit_id`, `person_curp_active`)')
    assert.include(content, 'ADD UNIQUE KEY `people_imss_nss_company_unique` (`business_unit_id`, `person_imss_nss_active`)')
  })

  test('el reporte lista person_id y empresa, nunca valores en claro', ({ assert }) => {
    const { content } = readMigration()
    assert.include(content, 'person_id=')
    assert.notInclude(content, '`person_rfc`')
    assert.notInclude(content, '`person_curp`')
    assert.notInclude(content, '`person_imss_nss`')
    assert.notInclude(content, '`person_email`')
  })

  test('down() tolerante a estado parcial vía information_schema', ({ assert }) => {
    const { content } = readMigration()
    const downBody = content.slice(content.indexOf('async down()'))
    assert.include(downBody, 'information_schema.STATISTICS')
    assert.include(downBody, 'information_schema.COLUMNS')
    assert.include(downBody, 'people_rfc_company_unique')
    assert.include(downBody, 'people_curp_company_unique')
    assert.include(downBody, 'people_imss_nss_company_unique')
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
node ace test unit --files="person_identity_company_unique_migration"
```

Expected: FAIL con `No existe la migración *_add_person_identity_active_uniques_to_people_table.ts`.

- [ ] **Step 3: Generar con el CLI y verificar el prefijo**

```bash
node ace make:migration add_person_identity_active_uniques_to_people_table && ls database/migrations | tail -2
```

Expected: `DONE: create database/migrations/1790…_add_person_identity_active_uniques_to_people_table.ts`, 13 dígitos y mayor que `1790089196691`.

- [ ] **Step 4: Sobrescribir con la migración real**

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Unicidad de RFC, CURP y NSS por empresa entre expedientes vivos (USRH1789698261610).
 *
 * Patrón columna generada + UNIQUE compuesto, nunca UNIQUE plano: un UNIQUE plano
 * sobre la huella dejaría el dato ocupado para siempre al dar de baja (la fila
 * conserva su huella); es el defecto que hizo retirar reglas en 2024. La expresión
 * devuelve NULL en borradas, en vacías y la columna empresa ya es NULL en filas
 * sin empresa; MySQL trata cada NULL como distinto, así que N borradas comparten
 * dato (regla 4), vaciar libera (regla 7) y las filas sin empresa quedan fuera
 * de la regla (regla 8), todo por construcción y sin código.
 *
 * VIRTUAL, no STORED: el índice secundario materializa igual y el ALTER es solo
 * metadatos. Sin COLLATE explícito: se hereda el de la huella.
 *
 * El censo va en `this.defer` registrado PRIMERO: en MySQL cada ALTER TABLE hace
 * commit implícito y un aborto posterior dejaría la tabla a medias. El aborto no
 * proyecta ningún valor en claro (ni completo ni enmascarado): lista empresa,
 * conteo y person_id. No corrige, no borra, no fusiona (regla 9).
 *
 * Resolución manual si aborta: identificar cada grupo por person_id, descifrar
 * por REPL (solo lectura) y decidir del lado del cliente. Si el valor en claro
 * está vacío pero la huella no es NULL, es una huella huérfana del defecto que
 * corrige `calculateIdentifierHashes`: poner esa columna `person_*_hash` a NULL
 * por SQL (es dato derivado, no información del expediente) y reintentar.
 */

const TABLE = 'people'

const GENERATED: ReadonlyArray<{ active: string; hash: string }> = [
  { active: 'person_rfc_active', hash: 'person_rfc_hash' },
  { active: 'person_curp_active', hash: 'person_curp_hash' },
  { active: 'person_imss_nss_active', hash: 'person_imss_nss_hash' },
]

const UNIQUES: ReadonlyArray<{ index: string; active: string }> = [
  { index: 'people_rfc_company_unique', active: 'person_rfc_active' },
  { index: 'people_curp_company_unique', active: 'person_curp_active' },
  { index: 'people_imss_nss_company_unique', active: 'person_imss_nss_active' },
]

const LABELS: Record<string, string> = {
  person_rfc_hash: 'RFC',
  person_curp_hash: 'CURP',
  person_imss_nss_hash: 'NSS',
}

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    // Paso 1 — censo de vivos de una misma empresa compartiendo huella (ANTES de cualquier DDL).
    this.defer(async (db) => {
      await db.rawQuery('SET SESSION group_concat_max_len = 1000000')
      type DupRow = { empresa: number; total: number; personas: string }
      const conflicts: string[] = []
      for (const { hash } of GENERATED) {
        const [rows] = await db.rawQuery<[DupRow[]]>(
          `SELECT \`business_unit_id\` AS empresa,
                  COUNT(*) AS total,
                  GROUP_CONCAT(CONCAT('person_id=', \`person_id\`) ORDER BY \`person_id\` SEPARATOR ', ') AS personas
           FROM \`${TABLE}\`
           WHERE \`person_deleted_at\` IS NULL
             AND \`business_unit_id\` IS NOT NULL
             AND \`${hash}\` IS NOT NULL
             AND \`${hash}\` != ''
           GROUP BY \`business_unit_id\`, \`${hash}\`
           HAVING COUNT(*) > 1
           ORDER BY empresa`
        )
        for (const row of rows) {
          conflicts.push(`  - x${row.total} ${LABELS[hash]} empresa=${row.empresa} -> ${row.personas}`)
        }
      }
      if (conflicts.length === 0) return
      throw new Error(
        '[USRH1789698261610] Expedientes vivos de una misma empresa compartiendo RFC, CURP o NSS — resolver manualmente antes de continuar:\n' +
          `${conflicts.join('\n')}\n` +
          'No se aplicó ningún cambio. Diagnóstico sin proyectar valores (solo ids):\n' +
          '  SELECT person_id, business_unit_id, person_deleted_at FROM `people` WHERE person_id IN (...);'
      )
    })

    // Paso 2 — columnas generadas VIRTUAL.
    for (const { active, hash } of GENERATED) {
      this.schema.raw(`
        ALTER TABLE \`${TABLE}\`
        ADD COLUMN \`${active}\` VARCHAR(64)
          GENERATED ALWAYS AS (
            CASE WHEN \`person_deleted_at\` IS NULL
                  AND \`${hash}\` IS NOT NULL
                  AND \`${hash}\` != ''
                 THEN \`${hash}\`
                 ELSE NULL END
          ) VIRTUAL
      `)
    }

    // Paso 3 — índices UNIQUE compuestos por empresa.
    for (const { index, active } of UNIQUES) {
      this.schema.raw(`
        ALTER TABLE \`${TABLE}\`
        ADD UNIQUE KEY \`${index}\` (\`business_unit_id\`, \`${active}\`)
      `)
    }
  }

  async down() {
    // Tolerante a estado parcial: verifica information_schema antes de cada DROP.
    this.defer(async (db) => {
      type CountRow = { cnt: number }
      for (const { index } of UNIQUES) {
        const [idxRows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.STATISTICS
           WHERE table_schema = DATABASE()
             AND table_name = '${TABLE}'
             AND index_name = '${index}'`
        )
        if ((idxRows[0]?.cnt ?? 0) > 0) {
          await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${index}\``)
        }
      }
      for (const { active } of GENERATED) {
        const [colRows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE table_schema = DATABASE()
             AND table_name = '${TABLE}'
             AND column_name = '${active}'`
        )
        if ((colRows[0]?.cnt ?? 0) > 0) {
          await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${active}\``)
        }
      }
    })
  }
}
```

- [ ] **Step 5: Contenido en verde + `fresh --seed` limpio (criterio 8 de la HU)**

```bash
node ace test unit --files="person_identity_company_unique_migration" && NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
```

Expected: PASS y 681 migraciones + siembra sin error. Las personas sembradas nacen sin contexto (empresa NULL) o con empresa propia sin colisiones: la carga inicial no choca con la regla nueva.

```bash
mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASSWORD" sae_pruebas -e "SHOW CREATE TABLE people\G" | grep -E "person_rfc_active|people_rfc_company_unique"
```

(Tomar host/usuario/contraseña de `.env.test`.) Expected: la columna generada y el índice compuesto.

- [ ] **Step 6: Probar el `down()` en la BD de desarrollo (donde la migración es su propio batch)**

```bash
node ace migration:run && node ace migration:rollback && node ace migration:run
```

Expected: aplica solo la nueva, la revierte sin errores y la vuelve a aplicar. Un comando a la vez (candado global).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/*_add_person_identity_active_uniques_to_people_table.ts tests/unit/migrations/person_identity_company_unique_migration.spec.ts
git commit -m "feat(USRH1789698261610): censar duplicados y respaldar unicidad de identidad por empresa en BD"
```

---

### Task 2: La huella se libera al vaciar el campo (regla 7)

**Files:**
- Modify: `app/utils/blind_index.ts` (agregar `blindIndexOrNull`)
- Modify: `app/models/person.ts` (`calculateIdentifierHashes`, `:293-300`)
- Test: `tests/unit/models/person_identity_hash_release.spec.ts`

**Interfaces:**
- Consumes: `blindIndex(value: string)` (normaliza trim+upper, HMAC).
- Produces: `blindIndexOrNull(value: string | null | undefined): string | null` — blanco → NULL. `Person.calculateIdentifierHashes` la usa en los cuatro campos (CURP, RFC, NSS y correo: el correo también se beneficia y su unicidad no cambia).

- [ ] **Step 1: Escribir el spec que falla**

Crear `tests/unit/models/person_identity_hash_release.spec.ts`:

```ts
import { test } from '@japa/runner'
import Person from '#models/person'
import { blindIndex, blindIndexOrNull } from '#utils/blind_index'

/**
 * USRH1789698261610 regla 7 — vaciar el campo libera la huella.
 * Antes: `calculateIdentifierHashes` solo ponía huellas; un RFC vaciado
 * conservaba la anterior y bloqueaba su reúso sin que nada lo mostrara.
 */

test.group('blindIndexOrNull — puro, sin BD', () => {
  test('nulo, indefinido, vacío y espacios devuelven NULL', ({ assert }) => {
    assert.isNull(blindIndexOrNull(null))
    assert.isNull(blindIndexOrNull(undefined))
    assert.isNull(blindIndexOrNull(''))
    assert.isNull(blindIndexOrNull('   '))
  })

  test('un valor devuelve su huella y es insensible a caja y espacios', ({ assert }) => {
    assert.equal(blindIndexOrNull('gode800101hdf'), blindIndex('GODE800101HDF'))
    assert.equal(blindIndexOrNull('  GODE800101HDF  '), blindIndex('GODE800101HDF'))
  })
})

test.group('Person.calculateIdentifierHashes — puro, sin BD', () => {
  test('pone huellas con valor y las quita al vaciar', ({ assert }) => {
    const person = new Person()
    person.personRfc = 'GODE800101HDF'
    person.personCurp = null
    Person.calculateIdentifierHashes(person)
    assert.equal(person.personRfcHash, blindIndex('GODE800101HDF'))
    assert.isNull(person.personCurpHash)

    person.personRfc = ''
    Person.calculateIdentifierHashes(person)
    assert.isNull(person.personRfcHash)
  })
})

test.group('Person — vaciado real contra BD', (group) => {
  const personIds: number[] = []

  group.teardown(async () => {
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }
  })

  test('guardar con RFC vacío deja la huella en NULL', async ({ assert }) => {
    const person = await Person.create({
      personFirstname: 'Hash',
      personLastname: 'Libera',
      personSecondLastname: 'Spec',
      personRfc: 'HASHLIBERA01',
    })
    personIds.push(person.personId)
    assert.equal(person.personRfcHash, blindIndex('HASHLIBERA01'))

    person.personRfc = ''
    await person.save()
    const reloaded = await Person.query().where('person_id', person.personId).firstOrFail()
    assert.isNull(reloaded.personRfcHash)
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
node ace test unit --files="person_identity_hash_release"
```

Expected: FAIL (`blindIndexOrNull is not a function` o TS equivalente).

- [ ] **Step 3: Agregar `blindIndexOrNull` en `app/utils/blind_index.ts`**

Al final del archivo:

```ts
/**
 * Variante que libera la huella cuando el campo queda vacío (USRH1789698261610,
 * regla 7). Un campo vaciado debe dejar de ocupar lugar: NULL no compite en los
 * UNIQUE compuestos por empresa. Cadenas en blanco se tratan como vacías.
 */
export function blindIndexOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null
  return blindIndex(value)
}
```

- [ ] **Step 4: Reescribir `calculateIdentifierHashes` en `app/models/person.ts`**

Sustituir el cuerpo actual (`:293-300`) por:

```ts
  /**
   * Calcula las huellas de los identificadores antes de persistir.
   * Se ejecuta sobre los valores en claro (antes de que `prepare` los cifre).
   * Las huellas permiten validar unicidad sin descifrar (blind-index).
   *
   * Vaciar el campo libera la huella (USRH1789698261610, regla 7): antes solo
   * se ponían y un RFC vaciado conservaba la anterior, bloqueando su reúso
   * sin que ninguna pantalla lo mostrara. NULL tampoco compite en los UNIQUE
   * compuestos por empresa, así que la baja también libera (regla 4).
   */
  @beforeSave()
  static calculateIdentifierHashes(person: Person) {
    person.personCurpHash = blindIndexOrNull(person.personCurp)
    person.personRfcHash = blindIndexOrNull(person.personRfc)
    person.personImssNssHash = blindIndexOrNull(person.personImssNss)
    person.personEmailHash = blindIndexOrNull(person.personEmail)
  }
```

Y ampliar el import de `:8` a `import { blindIndex, blindIndexOrNull } from '#utils/blind_index'`.

- [ ] **Step 5: Verde + typecheck**

```bash
node ace test unit --files="person_identity_hash_release" && npm run typecheck
```

Expected: PASS y `tsc` limpio.

- [ ] **Step 6: Commit**

```bash
git add app/utils/blind_index.ts app/models/person.ts tests/unit/models/person_identity_hash_release.spec.ts
git commit -m "feat(USRH1789698261610): liberar la huella de identidad al vaciar el campo"
```

---

### Task 3: Catálogo de errores y traductor al formato del equipo (regla 6)

**Files:**
- Create: `app/constants/person_identity_error_codes.ts`
- Create: `app/helpers/person_identity_api_error.ts`
- Modify: `resources/langs/es.json`, `resources/langs/en.json` (4 títulos + 4 detalles, ambos idiomas)
- Test: `tests/unit/helpers/person_identity_api_error.spec.ts`

**Interfaces:**
- Consumes: molde `user_access_email_api_error.ts` / `user_access_email_error_codes.ts`; `ctx.i18n.t`, `ctx.response.status`.
- Produces:
  - `PERSON_IDENTITY_ERRORS`: `DUPLICATED_RFC/CURP/NSS` (422) + `MISSING_COMPANY` (400), cada uno `{key, code, status}`.
  - `personIdentityDuplicatedFieldFromValidationError(error): 'curp' | 'rfc' | 'nss' | null`
  - `personIdentityDuplicatedIndexFromError(error): 'curp' | 'rfc' | 'nss' | null`
  - `respondPersonIdentityDuplicated(ctx, field)` y `respondPersonIdentityMissingCompany(ctx)` → `{title, detail, key, code}`.

- [ ] **Step 1: Crear la constante `app/constants/person_identity_error_codes.ts`**

```ts
/**
 * Códigos estables para rechazo de identidad duplicada por empresa (USRH1789698261610).
 * Prefijo PERSON.IDENTITY. El status conserva el 422 que personas ya responde hoy
 * en duplicados (el backoffice tiene su rama sobre ese status); solo el cuerpo
 * cambia al formato del equipo. Sin-empresa es 400, como el header requerido.
 */
export const PERSON_IDENTITY_ERROR_CODES = {
  /** El RFC ya lo usa otro expediente vivo de la misma empresa. */
  DUPLICATED_RFC: 'PERSON.IDENTITY.001',
  /** La CURP ya la usa otro expediente vivo de la misma empresa. */
  DUPLICATED_CURP: 'PERSON.IDENTITY.002',
  /** El NSS ya lo usa otro expediente vivo de la misma empresa. */
  DUPLICATED_NSS: 'PERSON.IDENTITY.003',
  /** La operación llegó sin la empresa desde la que se trabaja. */
  MISSING_COMPANY: 'PERSON.IDENTITY.004',
} as const

export type PersonIdentityErrorCode =
  (typeof PERSON_IDENTITY_ERROR_CODES)[keyof typeof PERSON_IDENTITY_ERROR_CODES]

export type PersonIdentityErrorDefinition = {
  key: string
  code: PersonIdentityErrorCode
  status: number
}

export const PERSON_IDENTITY_ERRORS: Record<
  'DUPLICATED_RFC' | 'DUPLICATED_CURP' | 'DUPLICATED_NSS' | 'MISSING_COMPANY',
  PersonIdentityErrorDefinition
> = {
  DUPLICATED_RFC: { key: 'rfc-ya-registrado-en-la-empresa', code: PERSON_IDENTITY_ERROR_CODES.DUPLICATED_RFC, status: 422 },
  DUPLICATED_CURP: { key: 'curp-ya-registrada-en-la-empresa', code: PERSON_IDENTITY_ERROR_CODES.DUPLICATED_CURP, status: 422 },
  DUPLICATED_NSS: { key: 'nss-ya-registrado-en-la-empresa', code: PERSON_IDENTITY_ERROR_CODES.DUPLICATED_NSS, status: 422 },
  MISSING_COMPANY: { key: 'empresa-de-trabajo-requerida', code: PERSON_IDENTITY_ERROR_CODES.MISSING_COMPANY, status: 400 },
}

export type PersonIdentityField = 'curp' | 'rfc' | 'nss'
```

- [ ] **Step 2: Crear el helper `app/helpers/person_identity_api_error.ts`**

```ts
import type { HttpContext } from '@adonisjs/core/http'
import {
  PERSON_IDENTITY_ERRORS,
  type PersonIdentityField,
} from '#constants/person_identity_error_codes'

export type PersonIdentityErrorBody = {
  title: string
  detail: string
  key: string
  code: string
}

const VALIDATION_FIELD: Record<string, PersonIdentityField> = {
  personCurp: 'curp',
  personRfc: 'rfc',
  personImssNss: 'nss',
}

const INDEX_NAME: Record<PersonIdentityField, string> = {
  curp: 'people_curp_company_unique',
  nss: 'people_imss_nss_company_unique',
  rfc: 'people_rfc_company_unique',
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * El `.unique()` acotado por empresa de `validators/person.ts`. El correo no
 * aparece aquí a propósito: su unicidad sigue global y su mensaje es de otra
 * historia (regla 5).
 */
export function personIdentityDuplicatedFieldFromValidationError(
  error: unknown
): PersonIdentityField | null {
  if (!isObjectRecord(error)) return null
  if (error.code !== 'E_VALIDATION_ERROR') return null
  if (!Array.isArray(error.messages)) return null
  for (const message of error.messages) {
    if (!isObjectRecord(message)) continue
    const field = VALIDATION_FIELD[message.field as string]
    if (field && typeof message.rule === 'string' && message.rule.includes('unique')) {
      return field
    }
  }
  return null
}

/** La perdedora de una carrera entre dos altas concurrentes: MySQL 1062 sobre el UNIQUE compuesto. */
export function personIdentityDuplicatedIndexFromError(error: unknown): PersonIdentityField | null {
  if (!isObjectRecord(error)) return null
  if (error.code !== 'ER_DUP_ENTRY' && error.errno !== 1062) return null
  if (typeof error.message !== 'string') return null
  const found = (Object.keys(INDEX_NAME) as PersonIdentityField[]).find((field) =>
    error.message.includes(INDEX_NAME[field])
  )
  return found ?? null
}

const TITLE_KEY: Record<PersonIdentityField, string> = {
  curp: 'person_identity_duplicated_curp_title',
  nss: 'person_identity_duplicated_nss_title',
  rfc: 'person_identity_duplicated_rfc_title',
}

const DETAIL_KEY: Record<PersonIdentityField, string> = {
  curp: 'person_identity_duplicated_curp_detail',
  nss: 'person_identity_duplicated_nss_detail',
  rfc: 'person_identity_duplicated_rfc_detail',
}

const DEFINITION_KEY: Record<PersonIdentityField, 'DUPLICATED_CURP' | 'DUPLICATED_NSS' | 'DUPLICATED_RFC'> = {
  curp: 'DUPLICATED_CURP',
  nss: 'DUPLICATED_NSS',
  rfc: 'DUPLICATED_RFC',
}

/** Rechazo en términos de negocio: dice qué dato está repetido y nada más (regla 6). */
export function respondPersonIdentityDuplicated(
  ctx: HttpContext,
  field: PersonIdentityField
): PersonIdentityErrorBody {
  const definition = PERSON_IDENTITY_ERRORS[DEFINITION_KEY[field]]
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t(TITLE_KEY[field]),
    detail: ctx.i18n.t(DETAIL_KEY[field]),
    key: definition.key,
    code: definition.code,
  }
}

/** Sin empresa no hay veredicto sobre duplicados (regla 10). */
export function respondPersonIdentityMissingCompany(ctx: HttpContext): PersonIdentityErrorBody {
  const definition = PERSON_IDENTITY_ERRORS.MISSING_COMPANY
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t('person_identity_missing_company_title'),
    detail: ctx.i18n.t('person_identity_missing_company_detail'),
    key: definition.key,
    code: definition.code,
  }
}
```

- [ ] **Step 3: Agregar las 8 claves a cada idioma, junto a las de credencial**

En `resources/langs/es.json`, después de estas dos líneas exactas (verificadas en `:3010-3011`):

```json
  "user_access_email_duplicated_title": "Este correo de acceso ya está en uso",
  "user_access_email_duplicated_detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
```

insertar:

```json
  "person_identity_duplicated_rfc_title": "Este RFC ya está registrado en tu empresa",
  "person_identity_duplicated_rfc_detail": "Otro expediente activo de tu empresa usa este RFC; revisa el dato o da de baja el expediente que lo tiene. No se guardó ningún cambio.",
  "person_identity_duplicated_curp_title": "Esta CURP ya está registrada en tu empresa",
  "person_identity_duplicated_curp_detail": "Otro expediente activo de tu empresa usa esta CURP; revisa el dato o da de baja el expediente que lo tiene. No se guardó ningún cambio.",
  "person_identity_duplicated_nss_title": "Este número de seguro social ya está registrado en tu empresa",
  "person_identity_duplicated_nss_detail": "Otro expediente activo de tu empresa usa este número; revisa el dato o da de baja el expediente que lo tiene. No se guardó ningún cambio.",
  "person_identity_missing_company_title": "Empresa de trabajo requerida",
  "person_identity_missing_company_detail": "La operación necesita la empresa desde la que trabajas. No se guardó ningún cambio y no se verificó ningún dato.",
```

En `resources/langs/en.json`, después de (`:3007-3008`):

```json
  "user_access_email_duplicated_title": "This access email is already in use",
  "user_access_email_duplicated_detail": "Another active account uses this access email; use a different one or deactivate the account holding it. No changes were saved.",
```

insertar sus espejos en inglés:

```json
  "person_identity_duplicated_rfc_title": "This RFC is already registered in your company",
  "person_identity_duplicated_rfc_detail": "Another active record in your company uses this RFC; check the data or deactivate the record holding it. No changes were saved.",
  "person_identity_duplicated_curp_title": "This CURP is already registered in your company",
  "person_identity_duplicated_curp_detail": "Another active record in your company uses this CURP; check the data or deactivate the record holding it. No changes were saved.",
  "person_identity_duplicated_nss_title": "This social security number is already registered in your company",
  "person_identity_duplicated_nss_detail": "Another active record in your company uses this number; check the data or deactivate the record holding it. No changes were saved.",
  "person_identity_missing_company_title": "Working company required",
  "person_identity_missing_company_detail": "The operation needs the company you work from. No changes were saved and no data was checked.",
```

- [ ] **Step 4: Escribir el spec de detectores `tests/unit/helpers/person_identity_api_error.spec.ts`**

```ts
import { test } from '@japa/runner'
import {
  personIdentityDuplicatedFieldFromValidationError,
  personIdentityDuplicatedIndexFromError,
  respondPersonIdentityDuplicated,
  respondPersonIdentityMissingCompany,
} from '#helpers/person_identity_api_error'
import { PERSON_IDENTITY_ERRORS } from '#constants/person_identity_error_codes'

/** USRH1789698261610 regla 6 — el rechazo habla de negocio, nunca de BD. */

function fakeCtx() {
  let status = 0
  return {
    ctx: {
      response: { status: (code: number) => { status = code } },
      i18n: { t: (key: string) => `[${key}]` },
    } as any,
    getStatus: () => status,
  }
}

test.group('detectores de duplicado de identidad', () => {
  test('validation: mapea personRfc/personCurp/personImssNss con rule unique', ({ assert }) => {
    const rfc = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personRfc', rule: 'database.unique' }] }
    const curp = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personCurp', rule: 'database.unique' }] }
    const nss = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personImssNss', rule: 'database.unique' }] }
    assert.equal(personIdentityDuplicatedFieldFromValidationError(rfc), 'rfc')
    assert.equal(personIdentityDuplicatedFieldFromValidationError(curp), 'curp')
    assert.equal(personIdentityDuplicatedFieldFromValidationError(nss), 'nss')
  })

  test('validation: ignora el correo y las reglas no-unique', ({ assert }) => {
    const email = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personEmail', rule: 'database.unique' }] }
    const other = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personRfc', rule: 'minLength' }] }
    assert.isNull(personIdentityDuplicatedFieldFromValidationError(email))
    assert.isNull(personIdentityDuplicatedFieldFromValidationError(other))
    assert.isNull(personIdentityDuplicatedFieldFromValidationError(null))
  })

  test('índice: mapea ER_DUP_ENTRY por nombre de índice compuesto', ({ assert }) => {
    const rfc = { code: 'ER_DUP_ENTRY', errno: 1062, message: "Duplicate entry '7-abc' for key 'people.people_rfc_company_unique'" }
    const other = { code: 'ER_DUP_ENTRY', errno: 1062, message: "Duplicate entry 'x' for key 'users.users_email_active_unique'" }
    assert.equal(personIdentityDuplicatedIndexFromError(rfc), 'rfc')
    assert.isNull(personIdentityDuplicatedIndexFromError(other))
    assert.isNull(personIdentityDuplicatedIndexFromError({ code: 'E_VALIDATION_ERROR', messages: [] }))
  })
})

test.group('cuerpos de respuesta', () => {
  test('duplicado: 422 con título, detalle, clave y código, sin rastro de BD', ({ assert }) => {
    const { ctx, getStatus } = fakeCtx()
    const body = respondPersonIdentityDuplicated(ctx, 'rfc')
    assert.equal(getStatus(), 422)
    assert.equal(body.key, PERSON_IDENTITY_ERRORS.DUPLICATED_RFC.key)
    assert.equal(body.code, PERSON_IDENTITY_ERRORS.DUPLICATED_RFC.code)
    const raw = JSON.stringify(body)
    assert.notMatch(raw, /people_rfc_company_unique|ER_DUP_ENTRY|person_rfc_hash|[0-9a-f]{64}/)
  })

  test('sin empresa: 400 con su clave propia', ({ assert }) => {
    const { ctx, getStatus } = fakeCtx()
    const body = respondPersonIdentityMissingCompany(ctx)
    assert.equal(getStatus(), 400)
    assert.equal(body.key, PERSON_IDENTITY_ERRORS.MISSING_COMPANY.key)
    assert.equal(body.code, PERSON_IDENTITY_ERRORS.MISSING_COMPANY.code)
  })
})
```

- [ ] **Step 5: Verde + typecheck**

```bash
node ace test unit --files="person_identity_api_error" && npm run typecheck
```

Expected: PASS y `tsc` limpio.

- [ ] **Step 6: Commit**

```bash
git add app/constants/person_identity_error_codes.ts app/helpers/person_identity_api_error.ts resources/langs/es.json resources/langs/en.json tests/unit/helpers/person_identity_api_error.spec.ts
git commit -m "feat(USRH1789698261610): catálogo y traductor de errores de identidad al formato del equipo"
```

---

### Task 4: Los tres caminos comparan por empresa (alta, edición, verificación)

**Files:**
- Create: `app/helpers/person_identity_lookup.ts`
- Test: `tests/unit/helpers/person_identity_lookup.spec.ts`
- Modify: `app/services/person_service.ts` (`verifyInfo`, `:197-252`)
- Modify: `app/validators/person.ts` (`.unique()` de CURP/RFC/NSS; el de correo NO se toca)
- Modify: `app/controllers/person_controller.ts` (guardia sin-empresa + empresa al verificar + traducción en `store` y `update`)
- Test: `tests/functional/person_identity_company_scope.spec.ts`

**Interfaces:**
- Consumes: `livePersonWithIdentityExists(field, hash, businessUnitId, excludePersonId?)` (N7); `TenantContext.getScope()`; helpers de la Tarea 3.
- Produces: `verifyInfo(person, businessUnitId)` → `{status: 200} | {status: 400, missingCompany: true} | {status: 422, field: 'curp'|'rfc'|'nss'|'email'}`. Correo: rama global intacta, cuerpo legado intacto (otra historia).

- [ ] **Step 1: Crear la primitiva `app/helpers/person_identity_lookup.ts`**

```ts
import Person from '#models/person'
import type { PersonIdentityField } from '#constants/person_identity_error_codes'

const HASH_COLUMN: Record<PersonIdentityField, string> = {
  curp: 'person_curp_hash',
  nss: 'person_imss_nss_hash',
  rfc: 'person_rfc_hash',
}

/**
 * ¿Hay OTRO expediente vivo de esta empresa con la misma huella? (USRH1789698261610)
 *
 * La empresa es parámetro explícito, no contexto implícito: así el mismo chequeo
 * sirve con contexto HTTP, sin contexto (REPL, jobs) y en validadores. Sin empresa
 * devuelve falso y NUNCA un veredicto (regla 10): el 400 lo pone quien llama.
 * El correo no pasa por aquí: sigue global (regla 5).
 */
export async function livePersonWithIdentityExists(
  field: PersonIdentityField,
  hash: string,
  businessUnitId: number | null | undefined,
  excludePersonId: number = 0
): Promise<boolean> {
  if (!businessUnitId) return false
  const found = await Person.query()
    .whereNull('person_deleted_at')
    .where('business_unit_id', businessUnitId)
    .where(HASH_COLUMN[field], hash)
    .if(excludePersonId > 0, (query) => query.whereNot('person_id', excludePersonId))
    .first()
  return !!found
}
```

- [ ] **Step 2: Spec de la primitiva `tests/unit/helpers/person_identity_lookup.spec.ts`**

```ts
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'
import { livePersonWithIdentityExists } from '#helpers/person_identity_lookup'

/** USRH1789698261610 reglas 1, 2, 4 y 10 a nivel de consulta. */

test.group('livePersonWithIdentityExists', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  const personIds: number[] = []
  const CURP = 'IDENTCURP01'

  async function createUnit(slug: string): Promise<BusinessUnit> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    return BusinessUnit.create({
      businessUnitName: `Ident ${slug} ${stamp}`,
      businessUnitSlug: `ident-${slug}-${stamp}`,
      businessUnitLegalName: `Ident ${slug} legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
  }

  group.setup(async () => {
    unitA = await createUnit('a')
    unitB = await createUnit('b')
    const personA = await Person.create({
      personFirstname: 'Ident',
      personLastname: 'EmpresaA',
      personSecondLastname: 'Spec',
      personCurp: CURP,
      businessUnitId: unitA.businessUnitId,
    })
    const personB = await Person.create({
      personFirstname: 'Ident',
      personLastname: 'EmpresaB',
      personSecondLastname: 'Spec',
      personCurp: CURP,
      businessUnitId: unitB.businessUnitId,
    })
    personIds.push(personA.personId, personB.personId)
  })

  group.teardown(async () => {
    await Person.query().whereIn('person_id', personIds).delete()
    await BusinessUnit.query()
      .whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId])
      .delete()
  })

  test('cada empresa ve solo su propio expediente con la misma CURP (reglas 1 y 2)', async ({ assert }) => {
    const hash = blindIndex(CURP)
    assert.isTrue(await livePersonWithIdentityExists('curp', hash, unitA.businessUnitId))
    assert.isTrue(await livePersonWithIdentityExists('curp', hash, unitB.businessUnitId))
    assert.isFalse(await livePersonWithIdentityExists('rfc', hash, unitA.businessUnitId))
  })

  test('excluye al propio expediente al editar', async ({ assert }) => {
    const own = await Person.query().where('person_lastname', 'EmpresaA').firstOrFail()
    const hash = blindIndex(CURP)
    assert.isFalse(
      await livePersonWithIdentityExists('curp', hash, unitA.businessUnitId, own.personId)
    )
  })

  test('sin empresa nunca hay veredicto (regla 10)', async ({ assert }) => {
    const hash = blindIndex(CURP)
    assert.isFalse(await livePersonWithIdentityExists('curp', hash, null))
    assert.isFalse(await livePersonWithIdentityExists('curp', hash, undefined))
  })
})
```

Correr: `node ace test unit --files="person_identity_lookup"` → FAIL (`livePersonWithIdentityExists is not a function`) hasta el Step 1 aplicado; luego PASS. (Si el Step 1 ya se aplicó, el rojo se vio al crear el spec primero: el orden es spec → correr → implementar.)

- [ ] **Step 3: Reescribir `verifyInfo` en `app/services/person_service.ts`**

Sustituir el método completo (`:197-252`) por:

```ts
  /**
   * Verifica duplicados de identidad antes de guardar (USRH1789698261610).
   *
   * RFC, CURP y NSS se comparan SOLO dentro de la empresa indicada (reglas 1 y 2);
   * el correo personal se compara en todo el sistema, como hoy (regla 5). Sin
   * empresa no hay veredicto: se informa y quien llama responde 400 (regla 10).
   * Solo cuentan los vivos: la baja libera (regla 4). Ante varios choques se
   * informa el primero (CURP, RFC, NSS, correo): el mensaje dice un dato y nada más.
   */
  async verifyInfo(
    person: Person,
    businessUnitId: number | null | undefined
  ): Promise<
    | { status: 200 }
    | { status: 400; missingCompany: true }
    | { status: 422; field: 'curp' | 'rfc' | 'nss' | 'email' }
  > {
    if (!businessUnitId) return { status: 400, missingCompany: true }

    const excludePersonId = person.personId > 0 ? person.personId : 0

    if (person.personCurp && person.personCurp.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'curp',
        blindIndex(person.personCurp),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'curp' }
    }

    if (person.personRfc && person.personRfc.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'rfc',
        blindIndex(person.personRfc),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'rfc' }
    }

    if (person.personImssNss && person.personImssNss.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'nss',
        blindIndex(person.personImssNss),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'nss' }
    }

    if (person.personEmail && person.personEmail.trim() !== '') {
      const existing = await Person.query()
        .whereNull('person_deleted_at')
        .where('person_email_hash', blindIndex(person.personEmail))
        .if(excludePersonId > 0, (query) => query.whereNot('person_id', excludePersonId))
        .first()
      if (existing) return { status: 422, field: 'email' }
    }

    return { status: 200 }
  }
```

Agregar el import: `import { livePersonWithIdentityExists } from '#helpers/person_identity_lookup'` junto al de `blindIndex` (`:3`).

- [ ] **Step 4: Acotar los `.unique()` de CURP/RFC/NSS en `app/validators/person.ts`**

En cada uno de los tres `.unique()` de `createPersonValidator` (`:36-43` CURP, `:52-59` RFC, `:66-73` NSS), sustituir la consulta global por la primitiva acotada. Ejemplo para CURP (los otros dos idénticos cambiando `'curp'` por `'rfc'` / `'nss'`):

```ts
      .unique(async (_db, value) => {
        if (!value || value.trim() === '') return true
        // USRH1789698261610: se compara solo dentro de la empresa activa. Sin
        // contexto o sin empresa no hay veredicto (regla 10): el controller ya
        // rechazó con 400 antes de validar, así que aquí se deja pasar.
        if (!TenantContext.isActive()) return true
        const [businessUnitId] = TenantContext.getScope()
        if (!businessUnitId) return true
        const exists = await livePersonWithIdentityExists('curp', blindIndex(value), businessUnitId)
        return !exists
      })
```

Agregar los imports arriba (`:1-4`):

```ts
import { TenantContext } from '#utils/tenant_context'
import { livePersonWithIdentityExists } from '#helpers/person_identity_lookup'
```

El `.unique()` del correo (`:20-27`) NO se toca (regla 5). `updatePersonValidator` NO se toca (nunca tuvo unique; la edición verifica en `verifyInfo`).

- [ ] **Step 5: Cablear el controller `app/controllers/person_controller.ts`**

5a. Imports: agregar (verificar con `grep -n "TenantContext\|person_identity" app/controllers/person_controller.ts` que falten):

```ts
import { TenantContext } from '#utils/tenant_context'
import {
  personIdentityDuplicatedFieldFromValidationError,
  personIdentityDuplicatedIndexFromError,
  respondPersonIdentityDuplicated,
  respondPersonIdentityMissingCompany,
} from '#helpers/person_identity_api_error'
```

5b. En `store`, después del bloque de permiso por tipo de sujeto (`:347-355`) y antes de leer los inputs, insertar la guardia (regla 10):

```ts
      // USRH1789698261610: sin empresa no hay veredicto de duplicados (regla 10).
      // En HTTP el middleware ya la exige; esta guardia cubre cualquier otro camino.
      const storeCompanyId = ctx.businessUnitScope?.[0] ?? TenantContext.getScope()[0] ?? null
      if (!storeCompanyId) {
        return respondPersonIdentityMissingCompany(ctx)
      }
```

y en el literal `person` (`:370-381`) agregar `businessUnitId: storeCompanyId,`.

5c. En el `catch` de `store` (ancla: `if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)`), insertar inmediatamente después, antes del `E_VALIDATION_ERROR` genérico:

```ts
      // USRH1789698261610 regla 6: el rechazo habla de negocio, nunca de BD.
      const duplicatedField = personIdentityDuplicatedFieldFromValidationError(error)
      if (duplicatedField) {
        return respondPersonIdentityDuplicated(ctx, duplicatedField)
      }
      const racedField = personIdentityDuplicatedIndexFromError(error)
      if (racedField) {
        return respondPersonIdentityDuplicated(ctx, racedField)
      }
```

5d. En `update`, después del chequeo de formato de `personId` (`:633-640`) y antes de `personIsCollaborator`, insertar:

```ts
      const updateCompanyId = ctx.businessUnitScope?.[0] ?? TenantContext.getScope()[0] ?? null
      if (!updateCompanyId) {
        return respondPersonIdentityMissingCompany(ctx)
      }
```

en el literal `person` (`:614-631`) agregar `businessUnitId: updateCompanyId,`, y sustituir el bloque `verifyInfo` (`:666-675`) por:

```ts
      const data = await request.validateUsing(updatePersonValidator)
      const identityCheck = await personService.verifyInfo(person, updateCompanyId)
      if (identityCheck.status === 400) {
        return respondPersonIdentityMissingCompany(ctx)
      }
      if (identityCheck.status === 422 && identityCheck.field !== 'email') {
        return respondPersonIdentityDuplicated(ctx, identityCheck.field)
      }
      if (identityCheck.status === 422) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Dato duplicado',
          message: 'Ya existe un trabajador con el mismo valor en: correo electrónico',
          data: { ...data },
        }
      }
```

(El cuerpo legado del correo queda byte a byte como hoy salvo que ya no lista campos de identidad: solo el correo puede llegar aquí. Es de otra historia.)

5e. En el `catch` de `update` (misma ancla que 5c), insertar el mismo bloque de traducción para la carrera en índice (el `E_VALIDATION_ERROR` de update no trae unique de identidad, pero el `ER_DUP_ENTRY` sí puede llegar del `save()`).

- [ ] **Step 6: Escribir la spec funcional `tests/functional/person_identity_company_scope.spec.ts`**

Usar `createBypassActor('owner', prefix)` + `cleanupTenantActor` + `businessUnitHeaders` de `#tests/helpers/tenant_actor` (import copiado en Preparación). `owner` pasa el gate; el header acota a su empresa. Payload mínimo de alta:

```ts
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import User from '#models/user'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1789698261610 — criterios 1-6 de la HU por HTTP.
 * Limpieza: las personas del caso salen ANTES que los actores (FK RESTRICT).
 */

const PASSWORD = 'TenantActorGate123!'

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

function personPayload(tag: string, identity: { rfc: string; curp: string; nss: string; email: string }) {
  return {
    personFirstname: 'Ident',
    personLastname: tag,
    personSecondLastname: 'Scope',
    personGender: '',
    personRfc: identity.rfc,
    personCurp: identity.curp,
    personImssNss: identity.nss,
    personEmail: identity.email,
  }
}

test.group('unicidad de identidad por empresa', (group) => {
  let actorA: TenantActor
  let actorB: TenantActor
  const personIds: number[] = []

  group.setup(async () => {
    actorA = await createBypassActor('owner', 'IdentA')
    actorB = await createBypassActor('owner', 'IdentB')
  })

  group.teardown(async () => {
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  async function createPerson(
    client: any,
    actor: TenantActor,
    tag: string,
    identity: { rfc: string; curp: string; nss: string; email: string }
  ) {
    const response = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actor))
      .loginAs(actor.user)
      .json(personPayload(tag, identity))
    const personId = response.body()?.data?.person?.personId as number
    if (personId) personIds.push(personId)
    return response
  }

  test('criterio 1 — mismo trabajador en A y en B: ambas altas proceden y no se mencionan terceros', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const identity = {
      rfc: `IDENTRFC${stamp}`.slice(0, 20),
      curp: `IDENTCURP${stamp}`.slice(0, 20),
      nss: `IDENTNSS${stamp}`.slice(0, 20),
      email: `ident-a-${stamp}@gsti-tests.local`,
    }
    const first = await createPerson(client, actorA, 'MismaA', identity)
    assert.equal(first.status(), 201)

    const second = await createPerson(client, actorB, 'MismaB', { ...identity, email: `ident-b-${stamp}@gsti-tests.local` })
    assert.equal(second.status(), 201)

    const raw = JSON.stringify(second.body())
    assert.notMatch(raw, /otra empresa|ya existe en|ya registrado en otra/i)
    const personB = await Person.query().where('person_id', second.body().data.person.personId).firstOrFail()
    assert.equal(personB.businessUnitId, actorB.businessUnit.businessUnitId)
  })

  test('criterio 2 — segunda alta con el mismo RFC en la empresa: 422 de negocio sin datos internos', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const identity = {
      rfc: `DUPRFC${stamp}`.slice(0, 20),
      curp: `DUPCURP${stamp}`.slice(0, 20),
      nss: `DUPNSS${stamp}`.slice(0, 20),
      email: `dup-a-${stamp}@gsti-tests.local`,
    }
    const first = await createPerson(client, actorA, 'DupA', identity)
    assert.equal(first.status(), 201)

    const second = await createPerson(client, actorA, 'DupA2', { ...identity, email: `dup-a2-${stamp}@gsti-tests.local` })
    assert.equal(second.status(), 422)
    assert.equal(second.body()?.key, 'rfc-ya-registrado-en-la-empresa')
    assert.equal(second.body()?.code, 'PERSON.IDENTITY.001')
    assert.isString(second.body()?.title)
    assert.isString(second.body()?.detail)
    const raw = JSON.stringify(second.body())
    assert.notMatch(raw, /people_rfc_company_unique|ER_DUP_ENTRY|person_rfc_hash|[0-9a-f]{64}/)
  })

  test('criterio 2 — editar para tomar el RFC de otro vivo de la empresa: 422 de negocio', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const first = await createPerson(client, actorA, 'EditA', {
      rfc: `EDITRFC1${stamp}`.slice(0, 20),
      curp: `EDITCURP1${stamp}`.slice(0, 20),
      nss: `EDITNSS1${stamp}`.slice(0, 20),
      email: `edit-a1-${stamp}@gsti-tests.local`,
    })
    assert.equal(first.status(), 201)
    const second = await createPerson(client, actorA, 'EditB', {
      rfc: `EDITRFC2${stamp}`.slice(0, 20),
      curp: `EDITCURP2${stamp}`.slice(0, 20),
      nss: `EDITNSS2${stamp}`.slice(0, 20),
      email: `edit-a2-${stamp}@gsti-tests.local`,
    })
    assert.equal(second.status(), 201)

    const response = await client
      .put(`/api/persons/${second.body().data.person.personId}`)
      .headers(businessUnitHeaders(actorA))
      .loginAs(actorA.user)
      .json({ personFirstname: 'Ident', personLastname: 'EditB', personRfc: `EDITRFC1${stamp}`.slice(0, 20) })
    assert.equal(response.status(), 422)
    assert.equal(response.body()?.key, 'rfc-ya-registrado-en-la-empresa')
  })

  test('criterio 3 — el correo sigue global: dos empresas no pueden repetirlo', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const sharedEmail = `shared-${stamp}@gsti-tests.local`
    const first = await createPerson(client, actorA, 'MailA', {
      rfc: `MAILRFC1${stamp}`.slice(0, 20),
      curp: `MAILCURP1${stamp}`.slice(0, 20),
      nss: `MAILNSS1${stamp}`.slice(0, 20),
      email: sharedEmail,
    })
    assert.equal(first.status(), 201)

    const second = await createPerson(client, actorB, 'MailB', {
      rfc: `MAILRFC2${stamp}`.slice(0, 20),
      curp: `MAILCURP2${stamp}`.slice(0, 20),
      nss: `MAILNSS2${stamp}`.slice(0, 20),
      email: sharedEmail,
    })
    assert.equal(second.status(), 422)
  })

  test('criterio 4 — RFC vaciado queda libre en la misma empresa', async ({ assert, client }) => {
    const stamp = uniqueStamp()
    const rfc = `FREERFC${stamp}`.slice(0, 20)
    const first = await createPerson(client, actorA, 'FreeA', {
      rfc,
      curp: `FREECURP${stamp}`.slice(0, 20),
      nss: `FREEnSS${stamp}`.slice(0, 20),
      email: `free-a-${stamp}@gsti-tests.local`,
    })
    assert.equal(first.status(), 201)

    const emptied = await client
      .put(`/api/persons/${first.body().data.person.personId}`)
      .headers(businessUnitHeaders(actorA))
      .loginAs(actorA.user)
      .json({ personFirstname: 'Ident', personLastname: 'FreeA', personRfc: '' })
    assert.equal(emptied.status(), 201)

    const reused = await createPerson(client, actorA, 'FreeB', {
      rfc,
      curp: `FREECURP2${stamp}`.slice(0, 20),
      nss: `FREENSS2${stamp}`.slice(0, 20),
      email: `free-b-${stamp}@gsti-tests.local`,
    })
    assert.equal(reused.status(), 201)
  })

  test('criterio 5 — la baja libera: el RFC del dado de baja se reutiliza y dos bajas conviven', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const rfc = `LEAVERFC${stamp}`.slice(0, 20)
    const first = await createPerson(client, actorA, 'LeaveA', {
      rfc,
      curp: `LEAVECURP${stamp}`.slice(0, 20),
      nss: `LEAVENSS${stamp}`.slice(0, 20),
      email: `leave-a-${stamp}@gsti-tests.local`,
    })
    assert.equal(first.status(), 201)

    const deleted = await client
      .delete(`/api/persons/${first.body().data.person.personId}`)
      .headers(businessUnitHeaders(actorA))
      .loginAs(actorA.user)
    assert.isBelow(deleted.status(), 300)

    const reused = await createPerson(client, actorA, 'LeaveB', {
      rfc,
      curp: `LEAVECURP2${stamp}`.slice(0, 20),
      nss: `LEAVENSS2${stamp}`.slice(0, 20),
      email: `leave-b-${stamp}@gsti-tests.local`,
    })
    assert.equal(reused.status(), 201)
  })

  test('criterio 6 — sin empresa no hay veredicto: falta el header y no se dice si el dato existe', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const rfc = `NOHEADER${stamp}`.slice(0, 20)
    const seeded = await createPerson(client, actorA, 'NoHead', {
      rfc,
      curp: `NOHEADCURP${stamp}`.slice(0, 20),
      nss: `NOHEADNSS${stamp}`.slice(0, 20),
      email: `nohead-${stamp}@gsti-tests.local`,
    })
    assert.equal(seeded.status(), 201)

    const response = await client
      .post('/api/persons')
      .loginAs(actorA.user)
      .json(personPayload('NoHead2', { rfc, curp: `X${stamp}`.slice(0, 20), nss: `Y${stamp}`.slice(0, 20), email: `nohead2-${stamp}@gsti-tests.local` }))
    assert.equal(response.status(), 400)
    assert.equal(response.body()?.key, 'BU.VAL.000')
  })
})
```

Notas de la spec (no son opcionales): `headers()` en plural es el helper de `@japa/api-client` que acepta el objeto de `businessUnitHeaders` (precedente: specs de gate lo usan así; si el IDE marca `headers` en rojo, usar `.header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)`). `PASSWORD` no se usa para login (`loginAs` no necesita contraseña) y se deja fuera: no declararlo. El `PUT` manda solo los campos que cambian más los obligatorios del validador (`personFirstname`, `personLastname` son requeridos en `updatePersonValidator`). El `DELETE` responde 200/201 según el controller; se aserta `< 300` y no un código exacto.

- [ ] **Step 7: Correr la spec y el typecheck**

```bash
node ace test functional --files="person_identity_company_scope" && npm run typecheck
```

Expected: PASS (7 casos) y `tsc` limpio. Si un caso falla por 403 del gate, el actor `owner` no pasó: revisar `ensureRole('owner')` sembrado (correr `fresh --seed` de Preparación) antes de tocar código.

- [ ] **Step 8: Corrida completa de la suite y triage**

```bash
node ace test 2>&1 | tail -30
```

Expected: verde. Triage: cualquier spec que cree personas con RFC/CURP/NSS repetidos entre empresas distintas (antes imposible, ahora legal) o que aserte el cuerpo viejo `Dato duplicado` para identidad, se actualiza al cuerpo nuevo en el mismo commit de esta tarea. El cuerpo viejo del correo queda intacto: si un spec de correo falla, es regresión real, no drift.

- [ ] **Step 9: Commit**

```bash
git add app/helpers/person_identity_lookup.ts tests/unit/helpers/person_identity_lookup.spec.ts app/services/person_service.ts app/validators/person.ts app/controllers/person_controller.ts tests/functional/person_identity_company_scope.spec.ts
git commit -m "feat(USRH1789698261610): comparar RFC, CURP y NSS solo dentro de la empresa en alta, edición y verificación"
```

---

### Task 5: La carga masiva compara la CURP dentro de la empresa

**Files:**
- Modify: `app/services/employee_service.ts` (`personWithCurpExists`, `:3249-3256` + paso de la empresa en `:3002-3009`)
- Test: se cubre con la primitiva de la Tarea 4 (mismo chequeo) + test de contenido del paso de la empresa abajo

**Interfaces:**
- Consumes: `livePersonWithIdentityExists('curp', hash, businessUnitId)` (Tarea 4); `businessUnitId` de la fila en el loop de `validRows`.
- Produces: filas de otra empresa con la misma CURP dejan de rechazarse; filas de la misma empresa se siguen rechazando con `CURP duplicado`.

- [ ] **Step 1: Pasar la empresa y delegar en la primitiva**

Sustituir el método (`:3249-3256`) por:

```ts
  /**
   * Verificar si ya existe una persona viva de la MISMA empresa con la CURP dada
   * (USRH1789698261610, regla 1). Compara por huella HMAC-SHA256 (blind-index)
   * porque person_curp está cifrado en reposo. Sin empresa no hay veredicto
   * (regla 10): la fila ya se rechazó antes por falta de unidad.
   */
  private async personWithCurpExists(
    curp: string,
    businessUnitId: number | null | undefined
  ): Promise<boolean> {
    if (!curp || typeof curp !== 'string' || curp.trim() === '') return false
    if (!businessUnitId) return false
    return livePersonWithIdentityExists('curp', blindIndex(curp), businessUnitId)
  }
```

y en el sitio de llamada (`:3003-3009`) cambiar:

```ts
            const curpExists = await this.personWithCurpExists(employeeData.curp)
```

por:

```ts
            const curpExists = await this.personWithCurpExists(employeeData.curp, businessUnitId)
```

(`businessUnitId` es la variable destructurada del `for (const { rowNumber, employeeData, businessUnitId, … } of validRows)`; agregar el import de `livePersonWithIdentityExists` junto al de `blindIndex` del archivo.)

- [ ] **Step 2: Test de contenido del paso de la empresa**

Agregar a `tests/unit/helpers/person_identity_lookup.spec.ts` un grupo de contenido (no necesita BD):

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test.group('carga masiva — paso de la empresa (contenido)', () => {
  test('personWithCurpExists recibe la empresa de la fila', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'app/services/employee_service.ts'), 'utf-8')
    assert.include(content, 'this.personWithCurpExists(employeeData.curp, businessUnitId)')
    assert.include(content, "livePersonWithIdentityExists('curp', blindIndex(curp), businessUnitId)")
  })
})
```

- [ ] **Step 3: Verde + suite del área de importación**

```bash
node ace test unit --files="person_identity_lookup" && node ace test unit --files="employee_import_excel_result" --files="employee_import_excel_bulk_performance" && npm run typecheck
```

Expected: PASS y `tsc` limpio. La primitiva ya está probada contra BD en la Tarea 4; aquí se prueba que la carga la usa con la empresa correcta.

- [ ] **Step 4: Commit**

```bash
git add app/services/employee_service.ts tests/unit/helpers/person_identity_lookup.spec.ts
git commit -m "feat(USRH1789698261610): acotar a la empresa la comprobación de CURP en carga masiva"
```

---

### Task 6: Manual de prueba manual de API y bloque de seeder QA

**Files:**
- Create: `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-qa-api.md`
- Modify (no versionado, `.git/info/exclude`): `database/seeders/_tmp_do_not_commit_qa_seeder.ts` — función `seedUnicidadIdentidadQa` y su llamada en `run()` después de `seedEmpresaDuenaPersonaQa()`

**Interfaces:**
- Consumes: verificar antes con `grep -n "seedEmpresaDuenaPersonaQa\|createAlcanceUser\|QA_PASSWORD" database/seeders/_tmp_do_not_commit_qa_seeder.ts` y copiar esos ayudantes (mismo archivo, mismo estilo). Si `createAlcanceUser` no existiera con ese nombre, usar el que el grep revele y anotarlo en el cierre.
- Produces: empresas `qa-ident-a` y `qa-ident-b`, capturistas `qa-ident-capturista-a/b@gsti-tests.local`, expedientes con RFC/CURP/NSS compartidos entre empresas y un par en conflicto dentro de A para el escenario negativo.

- [ ] **Step 1: El bloque del seeder**

Agregar al final del seeder (estilo del bloque `seedEmpresaDuenaPersonaQa`):

```ts
/**
 * USRH1789698261610 — Unicidad de identidad por empresa.
 * Dos empresas con su capturista; el mismo trabajador (mismo RFC/CURP/NSS)
 * en ambas; y un segundo expediente en A que repite el RFC del primero para
 * el escenario de rechazo dentro de la empresa.
 */
async function seedUnicidadIdentidadQa(): Promise<void> {
  const rootRole = await Role.query().where('role_slug', 'root').whereNull('role_deleted_at').firstOrFail()

  async function ensureUnit(slug: string, name: string): Promise<BusinessUnit> {
    return BusinessUnit.firstOrCreate(
      { businessUnitSlug: slug },
      { businessUnitName: name, businessUnitLegalName: `${name} SA de CV`, businessUnitActive: 1 },
    )
  }

  async function ensurePerson(
    lastname: string,
    email: string,
    identity: { rfc: string; curp: string; nss: string },
    businessUnitId: number | null
  ): Promise<Person> {
    let person = await Person.query()
      .withTrashed()
      .where('person_lastname', lastname)
      .where('person_second_lastname', 'Ident')
      .first()
    if (!person) {
      person = await Person.create({
        personFirstname: 'QA',
        personLastname: lastname,
        personSecondLastname: 'Ident',
        personEmail: email,
        personCurp: identity.curp,
        personRfc: identity.rfc,
        personImssNss: identity.nss,
        businessUnitId,
      })
      return person
    }
    person.deletedAt = null
    person.businessUnitId = businessUnitId
    person.personCurp = identity.curp
    person.personRfc = identity.rfc
    person.personImssNss = identity.nss
    await person.save()
    return person
  }

  const unitA = await ensureUnit('qa-ident-a', 'QA Ident Empresa A')
  const unitB = await ensureUnit('qa-ident-b', 'QA Ident Empresa B')
  const shared = { rfc: 'QAID800101AAA', curp: 'QAID800101HDFXXX01', nss: '12345678901' }

  for (const [email, lastname, unit] of [
    ['qa-ident-capturista-a@gsti-tests.local', 'IdentCapturistaA', unitA],
    ['qa-ident-capturista-b@gsti-tests.local', 'IdentCapturistaB', unitB],
  ] as const) {
    const user = await createAlcanceUser(email, lastname, rootRole.roleId, unit.businessUnitId)
    const person = await Person.find(user.personId)
    if (person && person.businessUnitId !== unit.businessUnitId) {
      person.businessUnitId = unit.businessUnitId
      await person.save()
    }
  }

  await ensurePerson('IdentCompartidoA', 'qa-ident-compartido-a@gsti-tests.local', shared, unitA.businessUnitId)
  await ensurePerson('IdentCompartidoB', 'qa-ident-compartido-b@gsti-tests.local', shared, unitB.businessUnitId)
  await ensurePerson(
    'IdentChoqueA',
    'qa-ident-choque-a@gsti-tests.local',
    { rfc: shared.rfc, curp: 'QAID800102HDFXXX02', nss: '12345678902' },
    unitA.businessUnitId
  )
}
```

y en `run()`, después de `await seedEmpresaDuenaPersonaQa()`, agregar `await seedUnicidadIdentidadQa()`.

- [ ] **Step 2: Correr el seeder contra la BD de desarrollo migrada**

```bash
node ace migration:run && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Expected: sin error. Verificar:

```sql
SELECT p.person_lastname, b.business_unit_slug, p.person_rfc_hash FROM people p LEFT JOIN business_units b ON b.business_unit_id = p.business_unit_id WHERE p.person_second_lastname = 'Ident' ORDER BY p.person_lastname;
```

Expected: `IdentCapturistaA → qa-ident-a`, `IdentCapturistaB → qa-ident-b`, `IdentCompartidoA → qa-ident-a`, `IdentCompartidoB → qa-ident-b` (misma huella que A), `IdentChoqueA → qa-ident-a` (misma huella de RFC que CompartidoA).

- [ ] **Step 3: Escribir el manual**

Crear `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-qa-api.md`:

````markdown
# Prueba manual API — El mismo trabajador en dos empresas; dentro de tu empresa no hay duplicados

**Problema:** hoy el sistema trata el RFC, la CURP y el número de seguro social como únicos en todo el mundo: si otra empresa ya registró a un trabajador, tu empresa no puede darlo de alta ni uno por uno ni por plantilla. Y cuando lo intentas, el mensaje confirma que esa persona existe en la cuenta de alguien más.

**Solución:** esos tres datos pasan a ser únicos dentro de cada empresa. Registrar a alguien que ya está en otra empresa procede sin mencionar a la otra empresa. Intentar repetirlo dentro de tu propia empresa se rechaza explicando qué dato está repetido, sin datos internos. El correo personal sigue único en todo el sistema, como siempre. Vaciar el RFC de un expediente libera ese RFC; dar de baja libera los tres.

Ejemplo: es como las listas de asistencia de dos escuelas distintas: que un alumno esté en la lista de una escuela no impide anotarlo en la otra; pero dentro de la misma escuela no puede aparecer dos veces en la lista.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listas dos empresas (A y B), un capturista en cada una, el mismo trabajador en ambas y un choque dentro de A. Volver a correr el seeder restaura lo que un escenario haya modificado.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-ident-capturista-a@gsti-tests.local` | `password` | Capturista de la empresa A |
| **B** | `qa-ident-capturista-b@gsti-tests.local` | `password` | Capturista de la empresa B |

Identificadores públicos de las dos empresas, para el header `X-Business-Unit-Id`:

```sql
SELECT business_unit_slug, business_unit_public_id FROM business_units WHERE business_unit_slug IN ('qa-ident-a', 'qa-ident-b');
```

Identificadores de los expedientes sembrados:

```sql
SELECT person_id, person_lastname, business_unit_id FROM people WHERE person_second_lastname = 'Ident' AND person_lastname IN ('IdentCompartidoA', 'IdentCompartidoB', 'IdentChoqueA');
```

## 2. Escenario 1 — Alta en B de alguien que ya está en A: procede y no menciona a A

Usuario: **B**.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

```json
{
  "personFirstname": "Compartido",
  "personLastname": "Nuevo",
  "personSecondLastname": "Ident",
  "personEmail": "qa-ident-nuevo-b@gsti-tests.local",
  "personCurp": "QAID800101HDFXXX01",
  "personRfc": "QAID800101AAA",
  "personImssNss": "12345678901"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": { "person": { "personId": 123, "personFirstname": "Compartido", "...": "..." } }
}
```

El cuerpo no menciona en ningún lado que ese trabajador exista en otra empresa.

Qué significa cada dato:
- `type`: qué tan bien salió la petición. Puede valer `success` (sí se hizo lo pedido).
- `title` / `message`: el encabezado y la frase del resultado.
- `data.person.personId`: el número del expediente recién creado en tu empresa.

## 3. Escenario 2 — Repetir el RFC dentro de A: se rechaza diciendo qué dato y nada más

Usuario: **A**. El expediente `IdentChoqueA` ya repite el RFC de `IdentCompartidoA`.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de A>`

```json
{
  "personFirstname": "Choque",
  "personLastname": "Otro",
  "personSecondLastname": "Ident",
  "personEmail": "qa-ident-otro-a@gsti-tests.local",
  "personCurp": "QAID800199HDFXXX99",
  "personRfc": "QAID800101AAA",
  "personImssNss": "12999999999"
}
```

**Response exacto:** `422`

```json
{
  "title": "Este RFC ya está registrado en tu empresa",
  "detail": "Otro expediente activo de tu empresa usa este RFC; revisa el dato o da de baja el expediente que lo tiene. No se guardó ningún cambio.",
  "key": "rfc-ya-registrado-en-la-empresa",
  "code": "PERSON.IDENTITY.001"
}
```

Qué significa cada dato:
- `title`: qué pasó, en palabras del negocio.
- `detail`: qué hacer (revisar el dato o dar de baja el expediente que lo tiene) y que nada se guardó.
- `key`: la clave estable del rechazo. Puede valer `rfc-ya-registrado-en-la-empresa` (este caso), `curp-ya-registrada-en-la-empresa` o `nss-ya-registrado-en-la-empresa`.
- `code`: el código interno del catálogo. Puede valer `PERSON.IDENTITY.001` (RFC), `PERSON.IDENTITY.002` (CURP) o `PERSON.IDENTITY.003` (NSS).

Repetir editando: `PUT /api/persons/<person_id de IdentChoqueA>` con `{"personFirstname": "QA", "personLastname": "IdentChoqueA", "personRfc": "QAID800101AAA"}` responde el mismo `422` con el mismo `key`.

## 4. Escenario 3 — El correo sigue único en todo el sistema

Usuario: **B**.

**Endpoint:** `POST /api/persons` con el mismo cuerpo del Escenario 1 pero `personEmail` igual al de un expediente de A (por ejemplo `qa-ident-compartido-a@gsti-tests.local`) y RFC/CURP/NSS distintos.

**Response exacto:** `422` de validación (el mensaje del correo es de otra historia y no cambia aquí).

Qué significa: el correo personal no se aflojó con este cambio; dos empresas no pueden repetirlo. Es el punto que más atención pide en la revisión.

## 5. Escenario 4 — Vaciar el RFC lo libera

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<person_id de IdentChoqueA>` con `{"personFirstname": "QA", "personLastname": "IdentChoqueA", "personRfc": ""}`

**Response exacto:** `200` o `201` de actualizado (el de edición exitosa de hoy).

Después, `POST /api/persons` en A con el RFC `QAID800101AAA` y otro correo: responde `201`. (Los datos son los ya explicados en el Escenario 1.)

Si al volver a correr el seeder el escenario deja de tener sentido, es normal: el seeder restaura el choque.

## 6. Escenario 5 — Sin empresa no hay respuesta sobre duplicados

Usuario: **A**.

**Endpoint:** `POST /api/persons` con el cuerpo del Escenario 2 pero **sin** el header `X-Business-Unit-Id`.

**Response exacto:** `400`

```json
{
  "title": "Header requerido",
  "detail": "El header x-business-unit-id es obligatorio.",
  "key": "BU.VAL.000"
}
```

Qué significa cada dato:
- `key`: puede valer `BU.VAL.000` (falta el header que dice desde qué empresa se trabaja). Lo importante: no dice si el RFC está repetido o no.

## 7. Checklist

- [ ] Escenario 1 — Alta en B de alguien de A: 201 sin mencionar a A
- [ ] Escenario 2 — Alta y edición con RFC repetido en A: 422 con `key` y `code` del dato, sin datos internos
- [ ] Escenario 3 — Mismo correo en A y B: se rechaza (unicidad global intacta)
- [ ] Escenario 4 — RFC vaciado en A se reutiliza en A: 201
- [ ] Escenario 5 — Sin header: 400 sin veredicto sobre el duplicado
````

- [ ] **Step 4: Levantar el ambiente y entregar — el recorrido lo hace una persona**

Regla `~/.cursor/rules/manual-qa-execution.mdc`: un playbook lo camina **una persona**, nunca el agente.

```bash
node ace serve --hmr
```

Expected: API arriba en `http://127.0.0.1:3333` sobre la BD de desarrollo sembrada en el Step 2. Entregar la ruta del manual y la tabla de usuarios. Si algún response difiere en `title`/`detail`/`key`, **se corrige el manual**, no el código.

- [ ] **Step 5: Commit del manual (el seeder no se versiona)**

```bash
git add docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-qa-api.md
git commit -m "docs(USRH1789698261610): manual de QA de API de unicidad de identidad por empresa"
```

---

### Task 7: Verificación de cierre y resumen (sin PR)

**Files:** ninguno nuevo salvo `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-cierre.md`.

- [ ] **Step 1: Suite completa, typecheck y lint**

```bash
node ace test 2>&1 | tail -20 && npm run typecheck && npm run lint
```

Expected: verde y limpios, sin errores nuevos respecto a la base.

- [ ] **Step 2: Nada prohibido cambió**

```bash
git diff --stat origin/develop...HEAD -- app/models/user.ts app/validators/user.ts app/mixins/with_business_unit_scope.ts start/routes/person_routes.ts app/constants/system_modules_menu resources/lang 2>/dev/null | head; echo ---; git diff HEAD -- app/services/person_service.ts | grep -c "syncCreate"
```

Expected: sin salida salvo los dos `langs` (solo las 8 claves nuevas: verificar con `git diff HEAD -- resources/langs/es.json | grep "^[+-]" | grep -v "person_identity"` que no haya otras líneas) y `0` en syncCreate. El catálogo (`system_modules`) no se toca: no hace falta `permissions:check-consistency`, y se deja constancia de por qué.

- [ ] **Step 3: El correo no se acotó por arrastre (regla 5, revisión explícita)**

```bash
grep -n "business_unit_id\|businessUnitId\|TenantContext" app/validators/person.ts | head; echo ---; grep -n "where('business_unit_id'\|where(\"business_unit_id\"" app/services/person_service.ts | head
```

Expected: en el validador, empresa solo en los tres `.unique()` de identidad, nunca en el del correo; en `verifyInfo`, empresa solo en las tres ramas de identidad, nunca en la del correo. Pegar la salida en el cierre.

- [ ] **Step 4: Simulacro del censo (regla 9) sobre copia sucia**

Sobre una copia de la BD de desarrollo (nunca la de pruebas ni la compartida): crear a mano dos vivos de la misma empresa con el mismo RFC, correr `node ace migration:run` y comprobar que aborta con la lista de `person_id` sin valores en claro y sin aplicar nada (`SHOW CREATE TABLE people` sin las columnas nuevas). Limpiar las filas, reintentar (aplica), y `migration:rollback` + `migration:run` para dejar la BD como estaba. Pegar el mensaje de aborto (con ids de prueba) en el cierre.

- [ ] **Step 5: Confirmar el status 422 con el backoffice**

El cuerpo del duplicado cambió a `{title, detail, key, code}` pero el status se conserva en 422. Con `valanserh-bo` apuntando al API local, provocar un duplicado dentro de una empresa y confirmar que la pantalla lo muestra (o reportar a Wilvardo la rama/versión del BO si espera otro cuerpo). Sin este visto bueno no se cierra.

- [ ] **Step 6: Escribir el resumen de cierre (sin abrir PR)**

Crear `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-cierre.md` con:

```markdown
# Resumen de cierre — USRH1789698261610 Unicidad de identidad por empresa

## Qué cambia

RFC, CURP y NSS únicos por empresa entre vivos: 3 generadas VIRTUAL + 3 UNIQUE
`(business_unit_id, *_active)` con censo previo que aborta sin PII. Alta, edición
y carga masiva comparan por empresa; el correo sigue global; vaciar libera la
huella; la baja libera por construcción; sin empresa nunca hay veredicto; los
tres rechazos hablan en `{title, detail, key, code}` sin datos internos.

## Qué NO cambia

Ninguna pantalla, ningún campo de request/response, ningún status (422 en
duplicados, como hoy), ninguna ruta ni middleware, ningún mensaje del correo,
ningún seed, ningún catálogo. Filas sin empresa fuera de la regla (límite
declarado, regla 8). Sin saneo (regla 11).

## Notas para revisión (los dos puntos que más atención piden)

- Correo por arrastre: <pegar salida del Step 3>.
- Regla que aparenta funcionar: <resultado del criterio 6 de la spec funcional + Escenario 5 del manual>.
- Status 422 conservado a propósito (el BO tiene su rama sobre ese status); visto bueno BO: <sí / pendiente + con quién>.
- Censo: <mensaje de aborto del simulacro + confirmación de fresh --seed limpio en 681 migraciones>.

## Pruebas

Spec funcional `tests/functional/person_identity_company_scope.spec.ts` (7 casos,
criterios 1-6). Manual hermano: `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-qa-api.md` (5 escenarios). Suite completa en verde antes y después.
```

Commit:

```bash
git add docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-cierre.md
git commit -m "docs(USRH1789698261610): resumen de cierre de unicidad de identidad por empresa"
```

- [ ] **Step 7: Anotar en el spec y en Asana**

Anotar en el spec vivo lo que la implementación fijó (422 conservado, primer-choque-gana en `verifyInfo`, receta de huella huérfana) y formalizar en Asana que esta HU habilita a *Reincorporar a un colaborador dado de baja*.

---

## Self-review (hecho al escribir el plan)

**Cobertura de la HU.** Criterio 1 (REPSE, alta cruzada) → Tarea 4 spec caso 1 + manual Esc. 1. Criterio 2 (rechazo intra-empresa alta y edición, mensaje de negocio) → Tarea 3 (catálogo/helper/langs) + Tarea 4 casos 2-3 + manual Esc. 2. Criterio 3 (correo global) → ramas explícitamente excluidas en Tarea 4 Steps 3-4 + caso 4 + Step 3 de Tarea 7 + manual Esc. 3. Criterio 4 (vaciado libera) → Tarea 2 + caso 5 + manual Esc. 4. Criterio 5 (baja libera, bajas conviven) → generadas NULL por `deleted_at` (Tarea 1) + caso 6. Criterio 6 (sin empresa, el que distingue) → guardia 400 en controller/`verifyInfo`/validadores (Tarea 4) + caso 7 + manual Esc. 5. Criterio 7 (censo aborta y reporta sin tocar) → Tarea 1 + simulacro en Tarea 7 Step 4. Criterio 8 (fresh+seed limpio) → Tarea 1 Step 5. Reglas 3 (por empresa no por cliente) y 8 (sin empresa fuera) → por construcción del UNIQUE (empresa NULL nunca compite) + tests. Regla 9 → censo. Regla 10 → guardias + fail-open de validadores. Regla 11 → sin UPDATE/backfill (test de contenido) + receta solo-manual de huellas huérfanas.

**Placeholders.** Ninguno funcional: todos los códigos, llaves, textos es/en, SQL, asserts y comandos van literales. Solo quedan valores de entorno local (`$DB_USER`, tokens, ids) y salidas a pegar en el cierre, que no pueden fijarse en un plan.

**Consistencia de tipos.** `PersonIdentityField = 'curp'|'rfc'|'nss'` definido una vez en la constante e importado por helper, lookup y controller. `livePersonWithIdentityExists(field, hash, businessUnitId, excludePersonId = 0)` — verifyInfo, validadores y bulk la llaman con ese orden. `verifyInfo(person, businessUnitId)` devuelve `{status: 200} | {status: 400, missingCompany: true} | {status: 422, field}` y el controller estrecha por `status` antes de tocar `field`. Nombres de columnas, índices y claves i18n idénticos en migración, helper, langs y specs.
