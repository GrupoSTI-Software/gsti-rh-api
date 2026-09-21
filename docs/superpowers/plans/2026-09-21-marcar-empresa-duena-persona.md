# Marcar la empresa dueña de la persona — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada expediente personal (`people`) registre a qué empresa cliente pertenece (`business_unit_id`), que todo camino de alta con contexto de tenant la llene solo, que el alta self-service marque al dueño de la cuenta nueva, y que las consultas de un inquilino —incluido el CRUD de `/api/persons`— alcancen **únicamente** sus propias personas, sin cambiar una sola pantalla ni una sola respuesta del API salvo la exigencia del header `X-Business-Unit-Id`.

**Architecture:** Una columna nullable con índice y FK `RESTRICT` sobre `people`. `Person` compone el mixin `withBusinessUnitScope()` **sin `includeGlobal`** (fail-closed: una fila `NULL` es invisible para todo inquilino) y un `@beforeCreate` **tolerante** que copia la empresa activa de `TenantContext.getScope()` y deja `NULL` sin lanzar cuando no hay contexto (landlord, seeder raíz, signup, sync biométrico). `PersonService.create` propaga la columna; `SignupDraftService.complete` crea la `BusinessUnit` antes que la `Person` y la asigna explícitamente. Dos grupos de `person_routes.ts` montan `businessScope()`. El sync biométrico (`PersonService.syncCreate`) **no se toca** (D3).

**Tech Stack:** AdonisJS 6 · Lucid (mixins, hooks, `AsyncLocalStorage` vía `TenantContext`) · MySQL (BD desechable `sae_pruebas`) · TypeScript estricto · Japa (`node ace test`)

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1789698261609-marcar-empresa-duena-persona` · **Target del PR:** `feature/USRH1789698261608-blindar-liberacion-persona` (cadena en serie, decisión de Wilvardo 2026-09-18; **no** `multitenant`)

**HU:** USRH1789698261609 — *Marcar la empresa dueña de la persona* · **Spec:** `~/Downloads/spec-USRH1789698261609.md` (los anexos A-D viven en Drive y **no fueron accesibles** desde esta cuenta; todo el código de este plan sale del repo, validado el 2026-09-21)

---

## Global Constraints

Copiadas del spec (§4, §9, §12, §14, §15). Cada tarea las hereda.

- **Regla 1.** Cada expediente registra a qué empresa cliente pertenece. La marca la pone el sistema al crear; nadie la captura ni la elige y **no aparece en ninguna pantalla ni respuesta**.
- **Regla 2.** Toda persona capturada con contexto de tenant nace marcada con la empresa activa (`TenantContext.getScope()` trae **exactamente un** elemento). Incluye captura una por una y carga masiva.
- **Regla 3.** El dueño de una cuenta self-service nace marcado con la empresa recién creada, **también** cuando el bucle de colisión de slug reintenta.
- **Regla 4.** Los expedientes de plataforma (root de GrupoSTI en `0007_person_seeder`, usuarios landlord de `platform_user_controller.store`) quedan **NULL** a propósito y el proceso **no lanza**.
- **Regla 5 / 6 (fail-closed).** Con contexto activo, un inquilino solo alcanza filas con su `business_unit_id`; una fila `NULL` es invisible para **todo** inquilino. Con contexto activo y scope vacío: **cero filas**. **`grep -n "includeGlobal" app/models/person.ts` devuelve CERO** (D7: copiarlo de `employee_type.ts:50` convierte la HU en fuga de PII y ningún test lo detecta).
- **Regla 7.** Sin contexto (rutas de plataforma, seeders, signup, REPL) no se filtra nada: la plataforma ve y opera todo como hoy.
- **Regla 8.** La marca se pone una sola vez, al crear. Ningún endpoint la cambia; esta HU no crea uno.
- **Columna `people.business_unit_id`:** `integer().unsigned().nullable().after('person_id')`, índice `people_business_unit_id_index`, FK `people_business_unit_id_foreign` → `business_units.business_unit_id` **sin `onDelete`** (⇒ `RESTRICT`). **NUNCA se vuelve NOT NULL**; se documenta en la cabecera de la migración y en el TSDoc del modelo. Sin backfill (base limpia el 2026-09-28), sin `UNIQUE`, sin seeders, sin catálogo.
- **Migración generada con `node ace make:migration`**, prefijo de **13 dígitos** posterior a `1789700400000` (el último hoy). Nunca escribir el timestamp a mano. **Nunca `await this.schema`** (CLAUDE.md).
- **Modelo:** `withBusinessUnitScope()` sin opciones; `@beforeCreate` tolerante (**sin `throw`**); no pisa un `businessUnitId` ya asignado; `@belongsTo(() => BusinessUnit)`. **La columna no se serializa** (`serializeAs: null`): §10 exige cero campos nuevos en request o response y CA-1 exige la misma respuesta de antes. (El spec §9 escribe `@column()` a secas; §10 y CA-1 mandan. Ver "Estado actual verificado".)
- **Rutas:** `.use(middleware.businessScope())` en `/api/persons` y `/api/persons-get-places-of-birth`, **inmediatamente después de `auth()`** y antes de `sensitiveAccess()` (razón en "Estado actual verificado"). **Sin `permissionGate`** nuevo. `/api/person-get-employee` ya lo monta y no se toca.
- **Prohibido:** tocar `PersonService.syncCreate` · cambiar el default del mixin `with_business_unit_scope.ts` · `throw` en el hook · `onDelete` en la FK · cambiar texto o status del 404 de persona (`person_controller.ts:655-659`, `:846-851`, `:1004-1009`) · asignar la empresa desde el cuerpo de la petición · el fallback `|| 1` de `employee_controller.ts:472` · tocar `person_controller.ts`, `platform_user_controller.ts`, `employee_service.ts`, `user_service.ts`, `pii_reveal_service.ts`, `validators/person.ts`, `person_is_collaborator.ts`, los seeders de catálogo/producción (`0007`, `0029`, `0047`), demo, `resources/lang/**`, `system_modules.constant.ts`, `valanserh-bo`. (El seeder QA no versionado de la Tarea 6, `_tmp_do_not_commit_qa_seeder.ts`, no está en este alcance: es gitignored, no se despliega, y es el mismo mecanismo que usó la HU predecesora.)
- **Mina estructural (va al TSDoc, no se arregla):** el mixin **no filtra escrituras**: `Person.query().where(...).update()` / `.delete()` escriben sin filtro de tenant aun con contexto activo (Lucid solo corre `before:fetch` en SELECT). Regla escrita: ningún update o delete masivo sobre `people` sin `where('business_unit_id', ...)` explícito. Los hooks de Lucid **no corren** en INSERT crudo de Knex.
- **Orden de trabajo obligatorio (D11):** (1) migración, modelo, hook, `person_service`, signup → (2) helpers de fixtures → (3) **suite completa y triage** → (4) **solo entonces** rutas y sus specs. Al revés se mezclan dos cascadas y no se sabe qué rompió qué.
- **Trip-wire (§16.1):** si el triage tras la **primera** corrida completa de `node ace test` pasa de **2 h**, se ejecuta el corte R1/R2 del spec **tal cual** y se reporta; no se absorbe en silencio. Cualquier archivo editado fuera de la "Estructura de archivos" de este plan se reporta en el PR.
- **TypeScript estricto, cero `any` nuevo.** `getScope()` devuelve `number[]`; el destructuring da `number | undefined`; `?? null` cierra contra `number | null`. `logger` de Adonis, nunca `console.*`.
- **Tests contra `sae_pruebas`:** `node ace test` fija `NODE_ENV=test` y lee `.env.test`. La BD se siembra **una sola vez** con `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`, nunca en paralelo con otra migración (`GET_LOCK` global del servidor).
- **Nada se retira a `__TO_DELETE__/`.** **No commitear `pnpm-lock.yaml` ni `pnpm-workspace.yaml`** (sucios por causas ajenas). Cada commit lista sus archivos; nunca `git add -A`.
- **Commits:** `feat(USRH1789698261609): <qué cambia en presente>` para código, `test(...)` para specs, `docs(...)` para el manual; cierre con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Ubicar por nombre de función, no por número de línea.** Los números son del estado en `34232d63` y sirven para orientarse.

---

## Estado actual verificado (2026-09-21, rama @ `34232d63`)

Cada ancla del spec coincide con el código salvo lo siguiente. Hallazgos que **ajustan** el plan:

| # | Hallazgo | Evidencia | Qué cambia |
|---|---|---|---|
| 1 | **La columna no debe serializarse.** §9 dice `@column() declare businessUnitId`, pero §10 exige "cero campos nuevos en request o response" y CA-1 "la respuesta del API es la misma de antes: sin campo nuevo". `Zone` sí la expone; `Person` no debe. | `person.ts` ya usa `serializeAs: null` en las cuatro huellas | `@column({ serializeAs: null })`. El bloque `@swagger` **no** cambia (documenta la respuesta, y la respuesta no cambia). Se anota en el PR como aclaración de §9. |
| 2 | **`businessScope()` va antes de `sensitiveAccess()`, no al final de la cadena.** Los dos middlewares llaman `runWithSensitiveReadDecisions`, que envuelve `response.send/json/finish` en un `SensitiveAccessContext.run(store, …)`. Al anidarse, el wrapper del **primer** middleware montado es el más interno y **su store gana** al serializar. `businessScope` aplica el rol efectivo de la empresa (`applyEffectiveTenantRole`) **antes** de resolver las decisiones; si `sensitiveAccess` corriera primero, la respuesta se enmascararía con el rol de la cuenta, no con el de la empresa. | `sensitive_read_decisions.ts:98-107` (`reenterSensitiveReadOnResponse`), `business_unit_scope_middleware.ts` (rol efectivo → `TenantContext.run(... runWithSensitiveReadDecisions)`), precedente `exception_request_routes.ts:72-73` | Cadena final: `auth → businessScope → sensitiveAccess → sensitiveMaskEcho`. `sensitiveAccess` **se conserva** (quitarlo es cambio de alcance y el spec de montaje `sensitive_access_context_mounts.spec.ts` lo censa). |
| 3 | **El radio de `tests/` es mayor que los 4 archivos de §13.** Hay un tercer helper compartido y dos fixtures locales que crean `Person` **sin** marca y luego la leen por HTTP con contexto (`PUT /api/persons/:id`, `GET /api/employees/*` con `preload('person')`): quedarían en 404 / `person: null`. Y `signup_system_settings.spec.ts` limpia la persona buscando `where('person_email', email)` contra un valor **cifrado** (nunca empata): la persona sobrevive, y con la FK `RESTRICT` el `BusinessUnit.query().delete()` del teardown fallará. | `tests/functional/employees/sensitive_read_by_category_support.ts:210,248,314` · `employees_expediente_read_permission_gate.spec.ts:85,122,180` · `employees_persona_domicilio_bancos_permission_gate.spec.ts:81,118,174` · `signup_system_settings.spec.ts:130-133` | Son el triage que D11 paso 3 anticipa ("61 specs crean Person fuera de HTTP"). Se arreglan en la Tarea 4 con el **mismo cambio de una línea** y se listan en el PR como radio real. No es cambio de contrato. |
| 4 | **CA-3 no tiene endpoint.** No existe listado de personas bajo `/api/platform/*`; el landlord solo crea (`POST /api/platform/users`) y precarga `person` en sesión. | `grep -rn "person" start/routes/platform_*.ts` | El conteo del landlord (V11) se cuadra con `Person.query()` **sin contexto** desde `node ace repl` contra `SELECT COUNT(*)`. Misma semántica (regla 7), sin endpoint inventado. |
| 5 | **CA-8 tiene un oráculo residual por orden de comprobaciones**, fuera de alcance. En `update`/`delete`, `personIsCollaborator(id)` (deliberadamente sin scope) corre **antes** de buscar la persona: para el id de un colaborador de B, un usuario de A **sin** `tab-persona-write` recibe **403 `PERM.DENIED`**, y para un id inexistente, 404. Con el permiso (el caso del tester habitual), ambos dan 404 idéntico. | `person_controller.ts:641-649`, `:832-840`; `person_is_collaborator.ts` | **No se toca el controller** (§13). Se reporta a Wilvardo en el PR junto al oráculo de `verifyInfo` (CA-9) como herencia de la HU sucesora. V-CA-8 se ejecuta con un usuario **con** permiso de escritura. |
| 6 | Conteo de llamadas del spec E7: son **12** peticiones a `/api/persons` (7 sitios, uno en bucle de 6), no 9. | `person_store_subject_type_permission_gate.spec.ts` | Drift trivial. Todas llevan header. |
| 7 | Rama real y target: `feature/USRH1789698261609-marcar-empresa-duena-persona` sobre `feature/USRH1789698261608-blindar-liberacion-persona` (ya con los 5 commits de la predecesora). | `git branch`, `git log` | Se usa la rama real; el PR apunta a la predecesora. |
| 8 | Prefijo de migración: `date +%s000` hoy = `1790007401000` (13 dígitos, > `1789700400000`). | `ls database/migrations \| tail` | `make:migration` producirá el prefijo correcto sin intervención. |
| 9 | El `.delete()` a nivel query de `adonis-lucid-soft-deletes` es **hard delete** (el paquete solo añade `restore`, `withTrashed`, `onlyTrashed`). | `node_modules/adonis-lucid-soft-deletes/build/chunk-63NPG5AD.js` | Los teardowns que borran la persona **antes** que la empresa siguen funcionando con la FK `RESTRICT`. Los que no la borran (hallazgo 3) fallan. |

### Los puntos de alta de `Person` en `app/` y qué les pasa

| Punto | Camino | Contexto | Resultado tras la HU |
|---|---|---|---|
| `person_controller.store` → `PersonService.create` | `POST /api/persons` | activo (Tarea 5) | hook marca con la empresa activa |
| `employee_service.createPerson` (`:4083`) | alta de empleado / carga masiva | activo | hook marca |
| `user_service.ts:879` | alta masiva de usuarios | activo | hook marca |
| `signup_draft_service.complete` (`:343-358`) | `POST /api/auth/signup/complete` | **ninguno** | asignación explícita (Tarea 3) |
| `platform_user_controller.store` (`:203`) | `POST /api/platform/users` | ninguno | `NULL`, sin excepción (regla 4) |
| `0007_person_seeder` | siembra | ninguno | `NULL` (regla 4) |
| `PersonService.syncCreate` (`:20-34`) | sync biométrico | ninguno | `NULL` — **residual D3, no se toca** |
| `PersonService.createDemoPerson` / demo | demo | fuera de alcance | sin cambio |

### Moldes que se copian

- Migración: `database/migrations/1789528336288_add_business_unit_id_to_supply_value_histories.ts` (columna + índice + FK; `down()` en orden dropForeign → dropIndex → dropColumn).
- Hook `@beforeCreate` con `TenantContext.getScope()`: `app/models/zone.ts:56-66` (**variante tolerante**: donde `Zone` lanza, `Person` deja `null`).
- `@belongsTo(() => BusinessUnit, { foreignKey, localKey })`: `app/models/employee_type.ts:64-68`.
- Spec de modelo con `TenantContext.run` contra BD real: `tests/unit/models/assist_scope.spec.ts`.
- Spec de contenido de migración: `tests/unit/migrations/zones_supplies_business_unit_migrations.spec.ts`.
- Header en specs HTTP: `.header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)` (`tests/functional/role_create_with_preset.spec.ts:79`).
- Bloque de seeder QA: `seedLiberacionPersonaQa` y `createAlcanceUser` en `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado, en `.git/info/exclude`).

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `database/migrations/<13 dígitos>_add_business_unit_id_to_people_table.ts` (**nuevo**) | Columna + índice + FK `RESTRICT`; cabecera que prohíbe el NOT NULL | 1 |
| `tests/unit/models/person_business_unit_scope.spec.ts` (**nuevo**) | Contenido de la migración y del modelo (cero `includeGlobal`, `serializeAs: null`, hook sin `throw`), hook puro sin BD, scope fail-closed y FK contra BD | 1, 2 |
| `app/models/person.ts` | Composición `withBusinessUnitScope()`, columna con TSDoc de las minas, `@beforeCreate` tolerante, `@belongsTo(BusinessUnit)` | 2 |
| `app/services/person_service.ts` | **1 línea** en `create`: propaga `businessUnitId`. `syncCreate` intacto | 3 |
| `app/services/signup_draft_service.ts` | `BusinessUnit` antes que `Person` + asignación explícita, misma transacción | 3 |
| `tests/functional/signup_complete.spec.ts` | Un assert (CA-4): el dueño nace marcado | 3 |
| `tests/helpers/tenant_actor.ts` | `businessUnitId` en el `Person.create()` del actor | 4 |
| `tests/helpers/employee_fixture.ts` | Idem | 4 |
| `tests/functional/employees/sensitive_read_by_category_support.ts` | Idem en `createActor`, `createSystemActor`, `createSensitiveFixture` | 4 |
| `tests/functional/employees/employees_expediente_read_permission_gate.spec.ts` | Idem en sus fixtures locales | 4 |
| `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts` | Idem | 4 |
| `tests/functional/signup_system_settings.spec.ts` | `cleanupTenant` borra las personas de la empresa antes que la empresa | 4 |
| `start/routes/person_routes.ts` | Dos `.use(middleware.businessScope())` | 5 |
| `tests/functional/employees/person_store_subject_type_permission_gate.spec.ts` | Header UUID v4 en las 12 peticiones | 5 |
| `tests/unit/routes/sensitive_access_context_mounts.spec.ts` | Reescribir el test *"…y no businessScope"* (queda falso en silencio; **no se pone en rojo**) | 5 |
| `docs/superpowers/plans/2026-09-21-marcar-empresa-duena-persona-qa-api.md` (**nuevo**) | Manual de QA de API, hermano de este plan (`~/.cursor/rules/manual-qa-api.mdc`) | 6 |
| `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado) | Bloque `seedEmpresaDuenaPersonaQa` | 6 |

**Decisión del plan, revertible:** el spec §2 declara fuera de alcance "tests automatizados nuevos de la marca". Este plan añade **un** spec de unidad (`person_business_unit_scope.spec.ts`) porque automatiza el punto del DoD "`grep includeGlobal` = 0" y el fail-closed de CA-5, que son justo lo que "ningún test detecta" (D7). Cuesta ~20 min y no toca código de producto. Si Wilvardo lo rechaza, se retira el archivo y nada más cambia.

---

## Preparación (una sola vez)

- [ ] Confirmar rama y árbol limpio (salvo `pnpm-lock.yaml` / `pnpm-workspace.yaml`):

```bash
git status --short && git branch --show-current
```

Expected: `feature/USRH1789698261609-marcar-empresa-duena-persona`, solo ` M pnpm-lock.yaml` y `?? pnpm-workspace.yaml`.

- [ ] **Captura previa (DoD, CA-2) — ANTES de tocar nada.** Con el API local corriendo sobre la BD de desarrollo (`node ace serve --hmr`) y un usuario de una empresa A con `tab-persona-read`, guardar el conjunto de ids y el `meta.total` que `GET /api/persons` devuelve **hoy**. La ruta aún no exige header; se manda de todos modos para que la comparación posterior sea la misma llamada:

```bash
TOKEN='<bearer del usuario de A>'; BU_A='<business_unit_public_id de A>'; curl -s "http://127.0.0.1:3333/api/persons?page=1&limit=1000" -H "Authorization: Bearer $TOKEN" -H "X-Business-Unit-Id: $BU_A" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s).data.persons;console.log(JSON.stringify({total:b.meta.total,ids:b.data.map(p=>p.personId).sort((a,c)=>a-c)}))})' > /tmp/persons-A-antes.json; cat /tmp/persons-A-antes.json | head -c 300
```

Expected: un JSON `{"total":N,"ids":[...]}`. **Ojo:** en la BD de desarrollo actual (pre-HU) esa lista trae personas de **todas** las empresas —es el hueco que se cierra—; la captura sirve para demostrar que, tras la HU, A conserva **sus** personas. Si la BD de desarrollo no tiene dos empresas con personas, hacer la captura sobre `sae_pruebas` sembrada con el bloque QA de la Tarea 6 (las personas de la empresa A del seeder) y anotarlo en el PR.

- [ ] Sembrar la BD desechable (nunca en paralelo con otra migración):

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
```

Expected: termina sin error (hoy: 678 migraciones).

- [ ] Verificar que la suite base afectada está en verde antes de tocar nada:

```bash
node ace test unit --files="sensitive_access_context_mounts" --files="sensitive_mask_echo_mounts" --files="migration_filename_convention"
```

Expected: todo PASS.

---

### Task 1: Migración — la columna, el índice y la FK `RESTRICT`

**Files:**
- Create: `database/migrations/<13 dígitos>_add_business_unit_id_to_people_table.ts` (vía `node ace make:migration`)
- Test: `tests/unit/models/person_business_unit_scope.spec.ts` (grupo "migración")

**Interfaces:**
- Consumes: `BaseSchema` de `@adonisjs/lucid/schema`; tabla `business_units.business_unit_id` (`int unsigned`).
- Produces: columna `people.business_unit_id` (`int unsigned NULL`), índice `people_business_unit_id_index`, FK `people_business_unit_id_foreign` (RESTRICT). La Tarea 2 la mapea como `Person.businessUnitId`.

- [ ] **Step 1: Escribir el test de contenido que falla**

Crear `tests/unit/models/person_business_unit_scope.spec.ts` con este primer grupo (los grupos de la Tarea 2 se agregan al mismo archivo después):

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789698261609 — marca de empresa dueña del expediente personal.
 *
 * Automatiza lo que el DoD pide a mano y ningún otro test detecta (D7):
 * cero `includeGlobal` en `Person`, hook tolerante sin `throw`, columna que
 * no se serializa, migración con FK RESTRICT y prefijo de 13 dígitos.
 */

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'database/migrations')
const MIGRATION_SLUG = 'add_business_unit_id_to_people_table'
/** Última migración del repo al escribir la HU: la nueva debe ordenar después. */
const PREVIOUS_LAST_PREFIX = '1789700400000'

function readMigration(): { name: string; content: string } {
  const name = readdirSync(MIGRATIONS_DIR).find((file) => file.includes(MIGRATION_SLUG))
  if (!name) {
    throw new Error(`No existe la migración *_${MIGRATION_SLUG}.ts`)
  }
  return { name, content: readFileSync(join(MIGRATIONS_DIR, name), 'utf-8') }
}

test.group('people.business_unit_id — migración (CA-7)', () => {
  test('existe, con prefijo de 13 dígitos posterior a la última del repo', ({ assert }) => {
    const { name } = readMigration()
    const prefix = name.slice(0, 13)
    assert.match(name, /^[0-9]{13}_add_business_unit_id_to_people_table\.ts$/)
    assert.isTrue(prefix > PREVIOUS_LAST_PREFIX, `${prefix} debe ordenar después de ${PREVIOUS_LAST_PREFIX}`)
  })

  test('columna nullable tras person_id, índice y FK con nombre, sin onDelete', ({ assert }) => {
    const { content } = readMigration()
    const upBody = content.slice(content.indexOf('async up()'), content.indexOf('async down()'))
    assert.include(upBody, "table.integer('business_unit_id').unsigned().nullable().after('person_id')")
    assert.include(upBody, "table.index(['business_unit_id'], 'people_business_unit_id_index')")
    assert.include(upBody, ".foreign('business_unit_id', 'people_business_unit_id_foreign')")
    assert.include(upBody, ".references('business_unit_id')")
    assert.include(upBody, ".inTable('business_units')")
    assert.notMatch(upBody, /onDelete/i, 'la FK es RESTRICT a propósito: sin onDelete')
    assert.notMatch(content, /await\s+this\.schema/, 'nunca await sobre this.schema (CLAUDE.md)')
    assert.notMatch(upBody, /\bUPDATE\b|\.update\(/i, 'sin backfill: la base arranca limpia')
  })

  test('down() revierte en orden dropForeign → dropIndex → dropColumn', ({ assert }) => {
    const { content } = readMigration()
    const downBody = content.slice(content.indexOf('async down()'))
    const foreignIdx = downBody.indexOf("dropForeign(['business_unit_id'], 'people_business_unit_id_foreign')")
    const indexIdx = downBody.indexOf("dropIndex(['business_unit_id'], 'people_business_unit_id_index')")
    const columnIdx = downBody.indexOf("dropColumn('business_unit_id')")
    assert.isAbove(foreignIdx, -1)
    assert.isAbove(indexIdx, foreignIdx)
    assert.isAbove(columnIdx, indexIdx)
  })

  test('la cabecera prohíbe volver la columna NOT NULL y explica el RESTRICT', ({ assert }) => {
    const { content } = readMigration()
    assert.include(content, 'NUNCA DEBE VOLVERSE NOT NULL')
    assert.include(content, 'RESTRICT')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test unit --files="person_business_unit_scope"
```

Expected: FAIL con `No existe la migración *_add_business_unit_id_to_people_table.ts`.

- [ ] **Step 3: Generar la migración con el CLI (nunca a mano)**

```bash
node ace make:migration add_business_unit_id_to_people_table && ls database/migrations | tail -2
```

Expected: `DONE:    create database/migrations/17900xxxxxxxx_add_business_unit_id_to_people_table.ts`. Verificar en el `ls` que el prefijo tiene **13 dígitos** y es mayor que `1789700400000`. Si el CLI generara `create_people_table` o un `alterTable` con nombre distinto, **no** renombrar a mano: borrar el archivo generado y volver a correr el comando con el nombre exacto.

- [ ] **Step 4: Reemplazar el contenido generado por la migración real**

Sobrescribir el archivo generado con:

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1789698261609 — marca de empresa dueña del expediente personal.
 *
 * `people` era de las pocas tablas del producto que no sabía de qué empresa
 * cliente es cada renglón. Desde aquí cada expediente registra su empresa; la
 * marca la pone el modelo al crear (`Person.assignBusinessUnitId`) desde la
 * empresa activa de la petición, nunca desde el cuerpo.
 *
 * LA COLUMNA NUNCA DEBE VOLVERSE NOT NULL. `NULL` no es dato faltante: es un
 * valor con significado, "persona de plataforma" (regla 4). Nacen así, y deben
 * seguir naciendo así, el root de GrupoSTI (`0007_person_seeder`) y los usuarios
 * landlord (`platform_user_controller.store`). Un NOT NULL posterior rompería
 * el seeder raíz, el alta de landlord y el sync biométrico (residual D3 de la
 * HU). Es la diferencia con el molde que se calca (`…supply_value_histories`):
 * allá la columna terminará siendo obligatoria; aquí, no.
 *
 * FK sin `onDelete` => RESTRICT de MySQL, y es una decisión, no un olvido:
 * CASCADE borraría expedientes de PII al dar de baja una empresa; SET NULL los
 * volvería "de plataforma" e invisibles para todos (fail-closed), la peor forma
 * de perder un dato. RESTRICT obliga a resolverlos con un acto explícito antes
 * de borrar la empresa.
 *
 * Sin backfill: la base de producción arranca limpia el 2026-09-28. El índice
 * no es decorativo: desde esta HU toda lectura de `people` con contexto de
 * tenant —incluidos los `preload('person')`— lleva `WHERE business_unit_id IN`.
 */
export default class extends BaseSchema {
  protected tableName = 'people'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('person_id')
      table.index(['business_unit_id'], 'people_business_unit_id_index')
      table
        .foreign('business_unit_id', 'people_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'people_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'people_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
```

- [ ] **Step 5: Correr los tests de contenido y la convención de nombres**

```bash
node ace test unit --files="person_business_unit_scope" --files="migration_filename_convention"
```

Expected: PASS (4 + los de convención).

- [ ] **Step 6: Aplicar la migración desde cero y verificar el DDL (CA-7)**

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
```

Expected: **679** migraciones y la siembra completa sin error; el seeder `0007` crea la persona root con la columna en `NULL` (el hook aún no existe: la columna queda `NULL` por default).

```bash
mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASSWORD" sae_pruebas -e "SHOW CREATE TABLE people\G" | grep -E "business_unit_id|people_business_unit_id" ; mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASSWORD" sae_pruebas -e "SELECT COUNT(*) AS personas, SUM(business_unit_id IS NULL) AS sin_marca FROM people"
```

(Tomar host, usuario y contraseña de `.env.test`.) Expected: `` `business_unit_id` int unsigned DEFAULT NULL `` justo después de `person_id`, `KEY people_business_unit_id_index (business_unit_id)`, `CONSTRAINT people_business_unit_id_foreign FOREIGN KEY (business_unit_id) REFERENCES business_units (business_unit_id)` **sin** `ON DELETE`; y `personas = sin_marca`.

- [ ] **Step 7: Verificar el `down()` donde la migración es su propio batch**

En `sae_pruebas` tras un `fresh` **todas** las migraciones son el batch 1 y `migration:rollback` revertiría las 679 (y algún `down()` histórico ajeno puede no ser reversible). El `down()` de esta HU se prueba en la BD de desarrollo local, donde `migration:run` la aplica como batch nuevo y `rollback` revierte solo ese batch. Un comando a la vez (candado global `GET_LOCK`):

```bash
node ace migration:run && node ace migration:rollback && node ace migration:run
```

Expected: el `run` aplica solo `…_add_business_unit_id_to_people_table`; el `rollback` la revierte sin `Cannot drop index` ni `Cannot drop foreign key` (dropForeign → dropIndex → dropColumn es el orden que MySQL acepta); el segundo `run` la vuelve a aplicar. La BD de desarrollo queda migrada, que es lo que la Tarea 6 necesita.

- [ ] **Step 8: Commit**

```bash
git add database/migrations/*_add_business_unit_id_to_people_table.ts tests/unit/models/person_business_unit_scope.spec.ts
git commit -m "feat(USRH1789698261609): people registra la empresa dueña con FK RESTRICT y columna nullable a propósito

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `Person` compone el scope fail-closed y marca la empresa al crear

**Files:**
- Modify: `app/models/person.ts` (imports `:1-12`, `compose` `:77`, columna nueva tras `personId`, hook tras `calculateIdentifierHashes`, relación tras `user`)
- Test: `tests/unit/models/person_business_unit_scope.spec.ts` (tres grupos nuevos)

**Interfaces:**
- Consumes: `withBusinessUnitScope()` de `#mixins/with_business_unit_scope` (sin opciones), `TenantContext.getScope(): number[]` de `#utils/tenant_context`, `BusinessUnit` de `./business_unit.js`.
- Produces (los usan las Tareas 3, 4 y 6):
  - `Person.businessUnitId: number | null` (columna, **no serializada**)
  - `Person.assignBusinessUnitId(person: Person): void` (hook `@beforeCreate`, estático, tolerante)
  - `Person.businessUnit: BelongsTo<typeof BusinessUnit>`
  - Comportamiento: `Person.create({ ..., businessUnitId: X })` conserva `X`; `Person.create({...})` bajo `TenantContext.run([A], …)` queda con `A`; sin contexto queda `null`.

- [ ] **Step 1: Agregar los tres grupos de test que fallan**

Añadir al final de `tests/unit/models/person_business_unit_scope.spec.ts` (ampliar los imports de arriba):

```ts
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import { TenantContext } from '#utils/tenant_context'

const MODEL_FILE = join(ROOT, 'app/models/person.ts')

test.group('Person — composición fail-closed y columna oculta (D7, §10)', () => {
  test('compone withBusinessUnitScope() sin includeGlobal', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.include(content, "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'")
    assert.match(content, /compose\([^)]*SoftDeletes[^)]*withBusinessUnitScope\(\)/)
    // El error más caro de la HU: copiar `{ includeGlobal: true }` de employee_type.ts
    // haría visibles las filas NULL para todos los inquilinos (fuga de PII).
    assert.notInclude(content, 'includeGlobal')
  })

  test('businessUnitId existe, no se serializa y el hook no lanza', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.match(content, /@column\(\{ serializeAs: null \}\)\s*\n\s*declare businessUnitId: number \| null/)
    assert.include(content, '@beforeCreate()')
    const hookStart = content.indexOf('static assignBusinessUnitId')
    assert.isAbove(hookStart, -1)
    const hookBody = content.slice(hookStart, content.indexOf('}', content.indexOf('TenantContext.getScope()', hookStart)))
    assert.notInclude(hookBody, 'throw', 'el hook es tolerante: sin contexto deja null (regla 4)')
    assert.isDefined(Person.$getColumn('businessUnitId'))
    assert.isNull(Person.$getColumn('businessUnitId')?.serializeAs)
    assert.isDefined(Person.$getRelation('businessUnit'))
  })
})

test.group('Person.assignBusinessUnitId — hook puro, sin BD', () => {
  test('sin contexto deja null y no lanza (landlord, seeder, signup, biométrico)', ({ assert }) => {
    const person = new Person()
    assert.isFalse(TenantContext.isActive())
    assert.doesNotThrow(() => Person.assignBusinessUnitId(person))
    assert.isNull(person.businessUnitId)
  })

  test('con contexto toma la empresa activa', ({ assert }) => {
    const person = new Person()
    TenantContext.run([123], () => Person.assignBusinessUnitId(person))
    assert.equal(person.businessUnitId, 123)
  })

  test('con contexto activo y scope vacío deja null, no lanza', ({ assert }) => {
    const person = new Person()
    assert.doesNotThrow(() => TenantContext.run([], () => Person.assignBusinessUnitId(person)))
    assert.isNull(person.businessUnitId)
  })

  test('no pisa una marca ya asignada (signup self-service)', ({ assert }) => {
    const person = new Person()
    person.businessUnitId = 7
    TenantContext.run([123], () => Person.assignBusinessUnitId(person))
    assert.equal(person.businessUnitId, 7)
  })
})

test.group('Person — scope fail-closed y FK RESTRICT contra BD (CA-2, CA-5, CA-6)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  const personIds: number[] = []
  let personA: Person
  let personB: Person
  let personNull: Person

  async function createUnit(prefix: string): Promise<BusinessUnit> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    return BusinessUnit.create({
      businessUnitName: `Person scope ${prefix} ${stamp}`,
      businessUnitSlug: `person-scope-${prefix}-${stamp}`,
      businessUnitLegalName: `Person scope ${prefix} legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
  }

  group.setup(async () => {
    unitA = await createUnit('a')
    unitB = await createUnit('b')
    personA = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'EmpresaA',
      personSecondLastname: 'Persona',
      businessUnitId: unitA.businessUnitId,
    })
    personB = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'EmpresaB',
      personSecondLastname: 'Persona',
      businessUnitId: unitB.businessUnitId,
    })
    personNull = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'Plataforma',
      personSecondLastname: 'Persona',
    })
    personIds.push(personA.personId, personB.personId, personNull.personId)
  })

  group.teardown(async () => {
    // Las personas salen ANTES que las empresas: la FK es RESTRICT.
    await Person.query().whereIn('person_id', personIds).delete()
    await BusinessUnit.query()
      .whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId])
      .delete()
  })

  test('sin contexto no se filtra: las tres son visibles (regla 7)', async ({ assert }) => {
    const rows = await Person.query().whereIn('person_id', personIds)
    assert.lengthOf(rows, 3)
  })

  test('con la empresa A solo se ve la persona de A: ni la de B ni la NULL (reglas 5 y 6)', async ({
    assert,
  }) => {
    const rows = await TenantContext.run([unitA.businessUnitId], () =>
      Person.query().whereIn('person_id', personIds)
    )
    assert.deepEqual(
      rows.map((row) => row.personId),
      [personA.personId]
    )
  })

  test('por id: la persona NULL y la de B responden null para A; la propia sí (CA-5)', async ({
    assert,
  }) => {
    const [own, foreign, platform] = await TenantContext.run([unitA.businessUnitId], () =>
      Promise.all([
        Person.find(personA.personId),
        Person.find(personB.personId),
        Person.find(personNull.personId),
      ])
    )
    assert.isNotNull(own)
    assert.isNull(foreign)
    assert.isNull(platform)
  })

  test('contexto activo con scope vacío devuelve cero filas, nunca la tabla ni solo las NULL', async ({
    assert,
  }) => {
    const rows = await TenantContext.run([], () => Person.query().whereIn('person_id', personIds))
    assert.lengthOf(rows, 0)
  })

  test('runUnscoped no filtra', async ({ assert }) => {
    const rows = await TenantContext.runUnscoped(
      () => Person.query().whereIn('person_id', personIds),
      'spec person scope'
    )
    assert.lengthOf(rows, 3)
  })

  test('crear con contexto marca la empresa activa; sin contexto queda null (CA-1, CA-6)', async ({
    assert,
  }) => {
    const marked = await TenantContext.run([unitB.businessUnitId], () =>
      Person.create({ personFirstname: 'Scope', personLastname: 'Marcada', personSecondLastname: 'Persona' })
    )
    personIds.push(marked.personId)
    const unmarked = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'SinMarca',
      personSecondLastname: 'Persona',
    })
    personIds.push(unmarked.personId)

    assert.equal(marked.businessUnitId, unitB.businessUnitId)
    assert.isNull(unmarked.businessUnitId)
    // La marca no viaja en la respuesta (§10, CA-1).
    assert.notProperty(marked.serialize(), 'businessUnitId')
  })

  test('la FK RESTRICT rechaza borrar una empresa con personas', async ({ assert }) => {
    await assert.rejects(
      () => BusinessUnit.query().where('business_unit_id', unitA.businessUnitId).delete(),
      /foreign key constraint fails|ER_ROW_IS_REFERENCED/
    )
  })
})
```

- [ ] **Step 2: Correr el spec para verificar que falla**

```bash
node ace test unit --files="person_business_unit_scope"
```

Expected: los 4 del grupo "migración" PASS; los nuevos FAIL (`assert.include` del import del mixin; `Person.assignBusinessUnitId is not a function`; TS puede fallar antes en `businessUnitId` como propiedad desconocida — es el mismo rojo esperado).

- [ ] **Step 3: Modificar `app/models/person.ts`**

Imports (reemplazar el bloque `:2-12`):

```ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, beforeSave, belongsTo, column, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import { blindIndex } from '#utils/blind_index'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { withSensitiveWriteGuard } from '#mixins/with_sensitive_write_guard'
import { TenantContext } from '#utils/tenant_context'
import BusinessUnit from './business_unit.js'
import Employee from './employee.js'
import User from './user.js'
```

Composición (línea `:77`; el orden scope → guard sigue la convención mayoritaria del repo; los dos mixins enganchan eventos disjuntos, `find/fetch/paginate` vs `save`, así que el orden no importa):

```ts
export default class Person extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope(),
  withSensitiveWriteGuard()
) {
  @column({ isPrimary: true })
  declare personId: number

  /**
   * Marca de empresa dueña del expediente (USRH1789698261609). `null` significa
   * "persona de plataforma" (regla 4): no es dato faltante. La columna NUNCA se
   * vuelve NOT NULL. No se serializa: la marca no aparece en ninguna respuesta ni
   * pantalla (§10 del spec, CA-1), igual que las huellas.
   *
   * Fail-closed: el modelo compone `withBusinessUnitScope()` sin la opción de
   * filas globales. Con contexto de tenant una fila NULL es invisible para todo
   * inquilino: se prefiere el dato que se esconde a la PII que se filtra
   * (regla 6). NO seguir el precedente de `employee_type.ts`, que sí incluye
   * las filas NULL para todos: aquél es un catálogo, esto es un expediente.
   * (La palabra de esa opción no se escribe aquí a propósito: el DoD exige que
   * un grep sobre este archivo la encuentre cero veces.)
   *
   * Minas conocidas, no se arreglan aquí:
   *  - El mixin NO filtra escrituras. Lucid solo corre `before:fetch` cuando el
   *    método es SELECT: `Person.query().where(...).update()` / `.delete()`
   *    escriben sin filtro de tenant aun con contexto activo. Ningún update o
   *    delete masivo sobre `people` sin `where('business_unit_id', ...)` explícito.
   *  - Los hooks de Lucid no corren en INSERT crudo de Knex (`db.table('people')`).
   *  - `PersonService.syncCreate` (sync biométrico) crea personas sin contexto:
   *    nacen NULL e invisibles para su propio cliente (residual D3 de la HU).
   */
  @column({ serializeAs: null })
  declare businessUnitId: number | null
```

Hook (justo después de `calculateIdentifierHashes`):

```ts
  /**
   * Marca la empresa dueña desde la empresa activa de la petición, nunca desde
   * el cuerpo. Variante TOLERANTE del patrón de `zone.ts`: donde `Zone` lanza sin
   * contexto, `Person` deja `null` y no interrumpe el alta de landlord, el seeder
   * raíz, el signup ni el sync biométrico. Si la persona ya trae marca (signup
   * self-service la asigna antes de guardar), no la pisa (regla 8).
   */
  @beforeCreate()
  static assignBusinessUnitId(person: Person) {
    if (person.businessUnitId) return
    const [businessUnitId] = TenantContext.getScope()
    person.businessUnitId = businessUnitId ?? null
  }
```

Relación (después de `declare user: HasOne<typeof User>`):

```ts
  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
```

El bloque `@swagger` **no cambia**: la respuesta no cambia.

- [ ] **Step 4: Correr el spec y el typecheck**

```bash
node ace test unit --files="person_business_unit_scope" && npm run typecheck
```

Expected: PASS completo (4 + 2 + 4 + 7) y `tsc` limpio. Si `assert.rejects` no acepta regex en esta versión de `@japa/assert`, cambiar a `try { … ; assert.fail('debió rechazar') } catch (error) { assert.match(String((error as Error).message), /foreign key constraint fails/) }`.

- [ ] **Step 5: Evidencia del DoD (va al PR)**

```bash
grep -n "includeGlobal" app/models/person.ts; echo "exit=$?"
```

Expected: sin salida y `exit=1` (grep no encontró nada). Pegar la línea en el PR.

- [ ] **Step 6: Commit**

```bash
git add app/models/person.ts tests/unit/models/person_business_unit_scope.spec.ts
git commit -m "feat(USRH1789698261609): Person compone el scope fail-closed y marca la empresa dueña al crear

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `PersonService.create` propaga la marca y el signup la asigna antes de la persona

**Files:**
- Modify: `app/services/person_service.ts` (`create`, `:55-75`) — **`syncCreate` (`:20-34`) NO SE TOCA**
- Modify: `app/services/signup_draft_service.ts` (`complete`, bloque de la transacción `:341-378`)
- Test: `tests/functional/signup_complete.spec.ts` (un assert nuevo, CA-4)

**Interfaces:**
- Consumes: `Person.businessUnitId: number | null` (Tarea 2).
- Produces: `PersonService.create(person: Person, trx?)` copia `person.businessUnitId ?? null` al `Person` nuevo (misma firma). `SignupDraftService.complete` deja `people.business_unit_id` del dueño = `business_units.business_unit_id` de la empresa recién creada, dentro de la misma transacción.

- [ ] **Step 1: Escribir el assert que falla (CA-4)**

En `tests/functional/signup_complete.spec.ts`, dentro del test `'el usuario nace con rol owner y recibe su par de tokens'`, justo después del bloque que obtiene `businessUnit` y comprueba `businessUnitOrigin` (`:163-166`), agregar:

```ts
    // USRH1789698261609 (CA-4): el dueño de la cuenta nueva nace marcado con su
    // empresa. Sin esto quedaría invisible dentro de la cuenta que acaba de crear.
    const ownerPerson = await Person.query().where('person_id', createdPersonId).firstOrFail()
    assert.equal(
      ownerPerson.businessUnitId,
      createdBusinessUnitId,
      'el expediente del dueño debe quedar marcado con la empresa recién creada'
    )
```

`Person` ya está importado en ese spec (`:5`).

- [ ] **Step 2: Correr el spec para verificar que falla**

```bash
node ace test functional --files="signup_complete"
```

Expected: FAIL en el assert nuevo: `expected null to equal <id>`. Si el spec falla **antes** por otra razón (plan sin publicar, limitador `signup` 5 req/min por IP, correo), leer el mensaje: no es de esta HU; esperar un minuto y reintentar antes de tocar nada.

- [ ] **Step 3: La línea de `PersonService.create`**

En `app/services/person_service.ts`, dentro de `create`, inmediatamente después de `const newPerson = new Person()`:

```ts
    const newPerson = new Person()
    // USRH1789698261609: la marca viaja con la persona que arma el llamador
    // (signup self-service). Con contexto de tenant y sin marca, la pone el hook
    // del modelo; sin contexto y sin marca queda null (persona de plataforma).
    newPerson.businessUnitId = person.businessUnitId ?? null
    newPerson.personFirstname = person.personFirstname
```

`person_controller.store` arma `person` sin `businessUnitId` (`:369-380`), así que desde `POST /api/persons` llega `undefined` → `null` → el hook lo llena desde el contexto. La marca **nunca** sale del cuerpo de la petición.

- [ ] **Step 4: El reorden del signup**

En `app/services/signup_draft_service.ts`, dentro del `db.transaction(async (trx) => { … })` de `complete`, mover el bloque de `businessUnitData`/`trxBusinessUnit` **antes** del de `personData` y asignar la marca. El bloque queda así (sustituye desde `const personData = new Person()` hasta `const trxBusinessUnit = await businessUnitService.create(businessUnitData, trx)` inclusive):

```ts
        // La empresa nace ANTES que el expediente del dueño: la persona necesita
        // la empresa para llevar su marca (USRH1789698261609, regla 3). El
        // bucle de colisión de slug reintenta la transacción completa, así que
        // nunca queda una persona sin marca de un intento abortado.
        const businessUnitData = new BusinessUnit()
        businessUnitData.businessUnitName = draft.signupDraftBusinessUnitName
        businessUnitData.businessUnitSlug = slug
        businessUnitData.businessUnitLegalName = draft.signupDraftBusinessUnitName
        businessUnitData.businessUnitActive = 1
        businessUnitData.businessUnitOrigin = 'self_service'
        const trxBusinessUnit = await businessUnitService.create(businessUnitData, trx)

        const personData = new Person()
        personData.businessUnitId = trxBusinessUnit.businessUnitId
        personData.personFirstname = draft.signupDraftFirstName
        personData.personLastname = draft.signupDraftLastName
        personData.personSecondLastname = draft.signupDraftSecondLastName ?? ''
        personData.personEmail = draft.signupDraftEmail
        personData.personGender = ''
        personData.personPhone = ''
        personData.personPhoneSecondary = ''
        personData.personCurp = ''
        personData.personRfc = ''
        personData.personImssNss = ''
        personData.personMaritalStatus = ''
        personData.personPlaceOfBirthCountry = ''
        personData.personPlaceOfBirthState = ''
        personData.personPlaceOfBirthCity = ''
        const trxPerson = await personService.create(personData, trx)
```

Y en el comentario que precede al bucle (`:333-339`) cambiar `Person → BusinessUnit → User → attach → system_settings` por `BusinessUnit → Person → User → attach → system_settings`.

Por qué sobrevive el bucle de colisión de slug: (1) la transacción es nueva por intento y el `catch` solo regenera el slug, (2) el `INSERT` de la empresa es la **primera** escritura, así que un `ER_DUP_ENTRY` aborta antes de crear la persona, (3) aunque abortara después, el rollback deshace la persona, (4) `personData` se arma dentro del callback: cada intento construye una persona nueva con la empresa de **ese** intento.

- [ ] **Step 5: Correr los specs del signup y el typecheck**

```bash
node ace test functional --files="signup_complete" --files="signup_complete_rollback" --files="business_unit_slug_unique" && npm run typecheck
```

Expected: PASS. (`signup_system_settings` se corre en la Tarea 4: su teardown chocará con la FK hasta que se arregle allí.)

- [ ] **Step 6: Verificar que `syncCreate` sigue byte a byte**

```bash
git diff HEAD -- app/services/person_service.ts | grep -c "syncCreate"
```

Expected: `0`.

- [ ] **Step 7: Commit**

```bash
git add app/services/person_service.ts app/services/signup_draft_service.ts tests/functional/signup_complete.spec.ts
git commit -m "feat(USRH1789698261609): el alta propaga la marca y el signup crea la empresa antes que el dueño

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Fixtures marcadas y primera corrida completa de la suite (la cascada del mixin)

**Files:**
- Modify: `tests/helpers/tenant_actor.ts` (`createUserInBusinessUnit`, `:65-90`)
- Modify: `tests/helpers/employee_fixture.ts` (`createEmployeeFixture`, `:36-46`)
- Modify: `tests/functional/employees/sensitive_read_by_category_support.ts` (`createActor` `:210`, `createSystemActor` `:248`, `createSensitiveFixture` `:314`)
- Modify: `tests/functional/employees/employees_expediente_read_permission_gate.spec.ts` (`createActor` `:85`, `createSystemActor` `:122`, `createEmployeeFixture` `:180`)
- Modify: `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts` (`createActor` `:81`, `createSystemActor` `:118`, `createEmployeeFixture` `:174`)
- Modify: `tests/functional/signup_system_settings.spec.ts` (`cleanupTenant`, `:130-133`)

**Interfaces:**
- Consumes: `Person.create({ ..., businessUnitId })` (Tarea 2).
- Produces: todo actor, empleado y persona de fixture nace con la empresa del actor. **52 archivos** dependen de `tenant_actor`, **3** de `employee_fixture`, **4** del support de lectura sensible.

**Regla de triage para lo que no está en esta lista.** Un spec falla por esta HU si (a) crea una `Person` fuera de HTTP sin `businessUnitId` y luego la lee por HTTP con contexto (`preload('person')` en `/api/employees*`, `GET|PUT|DELETE /api/persons/:id`), o (b) borra una `BusinessUnit` sin haber borrado antes sus personas (FK `RESTRICT`). El arreglo es siempre el mismo: pasar `businessUnitId: <empresa del actor>` al `Person.create` / `new Person()`, o borrar `Person.query().where('business_unit_id', id).delete()` antes de la empresa. Una persona creada a propósito "de otra empresa" lleva la **otra** empresa; una creada a propósito "de plataforma" se queda sin marca. Nada de `runUnscoped` en specs para esquivar el filtro.

- [ ] **Step 1: `tests/helpers/tenant_actor.ts`**

En `createUserInBusinessUnit`, el `Person.create` queda:

```ts
  const person = await Person.create({
    personFirstname: 'Gate',
    personLastname: 'Test',
    personSecondLastname: prefix,
    personEmail: email,
    // USRH1789698261609: el actor pertenece a su empresa; sin marca, con
    // `businessScope` su propio expediente le sería invisible (fail-closed).
    businessUnitId,
  })
```

- [ ] **Step 2: `tests/helpers/employee_fixture.ts`**

En `createEmployeeFixture`:

```ts
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'Fixture',
    personSecondLastname: prefix,
    personEmail: `employee-${prefix}-${stamp}@gsti-tests.local`,
    businessUnitId,
  })
```

- [ ] **Step 3: `tests/functional/employees/sensitive_read_by_category_support.ts`**

Tres sitios, misma línea:

```ts
  // createActor (:210): la empresa la crea la propia función unas líneas arriba
  const person = await Person.create({
    personFirstname: 'ActorSens',
    personLastname: 'Qa',
    personSecondLastname: emailPrefix,
    personEmail: email,
    businessUnitId: businessUnit.businessUnitId,
  })
```

```ts
  // createSystemActor (:248): recibe `businessUnitId` como parámetro
  const person = await Person.create({
    personFirstname: 'SistemaSens',
    personLastname: 'Qa',
    personSecondLastname: emailPrefix,
    personEmail: email,
    businessUnitId,
  })
```

```ts
  // createSensitiveFixture (:314): recibe `businessUnitId` como parámetro
  const person = await Person.create({
    personFirstname: CLEAR_FIXED.firstname,
    personLastname: 'Colaborador',
    personSecondLastname: searchToken,
    personEmail: clear.email,
    personPhone: clear.phone,
    personPhoneSecondary: clear.phoneSecondary,
    personCurp: clear.curp,
    personRfc: clear.rfc,
    personImssNss: clear.nss,
    businessUnitId,
  })
```

- [ ] **Step 4: Los dos specs con fixtures locales**

`tests/functional/employees/employees_expediente_read_permission_gate.spec.ts`: en `createActor` (`:85`) agregar `businessUnitId: businessUnit.businessUnitId,`; en `createSystemActor` (`:122`) agregar `businessUnitId,` (parámetro `:117`); en `createEmployeeFixture` (`:180`) agregar `businessUnitId,` dentro del `Person.create` (parámetro `:172`). El `customerPerson` de `:370` se crea para la empresa del actor: agregar `businessUnitId: actor.businessUnit.businessUnitId,`. El `otherFixture` de `:670` ya recibe `otherBu.businessUnitId` por el parámetro y queda marcado con la **otra** empresa: es exactamente lo que ese caso prueba.

`tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts`: en `createActor` (`:81`) agregar `businessUnitId: businessUnit.businessUnitId,`; en `createSystemActor` (`:118`) agregar `businessUnitId: businessUnit.businessUnitId,` (la empresa se resuelve en `:112`); en `createEmployeeFixture` (`:174`) agregar `businessUnitId,`. El `customerPerson` de `:559`: `businessUnitId: actor!.businessUnit.businessUnitId,`.

- [ ] **Step 5: `tests/functional/signup_system_settings.spec.ts`**

En `cleanupTenant`, borrar las cuatro líneas `:130-133`:

```ts
  const person = await Person.query().where('person_email', email).first()
  if (person) {
    await Person.query().where('person_id', person.personId).delete()
  }
```

(buscan por `person_email` **cifrado** y nunca empatan: la persona sobrevivía a cada corrida y, con la FK `RESTRICT`, ahora impediría borrar la empresa). Y en el bloque `if (businessUnit) { … }` que sigue, insertar el borrado por marca **entre** el borrado de roles y el de la empresa, de modo que el final del bloque quede exactamente así:

```ts
    if (tenantRoles.length > 0) {
      await RoleSystemPermission.query()
        .whereIn(
          'role_id',
          tenantRoles.map((role) => role.roleId)
        )
        .delete()
      await Role.query()
        .withTrashed()
        .where('business_unit_id', businessUnit.businessUnitId)
        .delete()
    }
    // Las personas de la empresa salen antes que ella: `people.business_unit_id`
    // es FK RESTRICT (USRH1789698261609). Buscar por correo no sirve: viaja cifrado.
    await Person.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
  }
```

El `orphanPerson` de `:308` (caso de rollback) sigue igual: ahí se espera `null` y con el cifrado ya daba `null`; no lo toca esta HU.

- [ ] **Step 6: Primera corrida de los specs directamente afectados**

```bash
node ace test functional --files="signup_system_settings" --files="employees_expediente_read_permission_gate" --files="employees_persona_domicilio_bancos_permission_gate" --files="employees_sensitive_read_by_category" --files="employees_sensitive_write_by_category" --files="employees_sensitive_mask_echo_http" --files="person_store_subject_type_permission_gate" && node ace test e2e --files="sensitive_read_by_category"
```

Expected: PASS. `person_store_subject_type_permission_gate` pasa **todavía** (la ruta aún no exige header; se rompe en la Tarea 5, a propósito).

- [ ] **Step 7: Commit de las fixtures (antes de la corrida completa, para que el triage tenga base limpia)**

```bash
git add tests/helpers/tenant_actor.ts tests/helpers/employee_fixture.ts tests/functional/employees/sensitive_read_by_category_support.ts tests/functional/employees/employees_expediente_read_permission_gate.spec.ts tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts tests/functional/signup_system_settings.spec.ts
git commit -m "test(USRH1789698261609): las fixtures de persona nacen marcadas con la empresa del actor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Corrida completa y triage (D11 paso 3) — arrancar el cronómetro**

```bash
date; node ace test 2>&1 | tee /tmp/suite-antes-de-rutas.log | tail -40; date
```

Expected: verde, o una lista de fallos que caen en la regla de triage de arriba. Para cada fallo: (1) confirmar con `git stash` que en la rama base **pasa** (si ya fallaba antes, no es de esta HU: anotar y seguir); (2) aplicar el arreglo de una línea; (3) volver a correr solo ese archivo. Commit por lote: `test(USRH1789698261609): <specs> crean sus personas con la empresa del actor`.

**Trip-wire:** si al cumplirse **2 h** de triage la suite no está en verde, **parar**, dejar constancia de qué specs quedan y por qué, y ejecutar el corte del spec §16.1: R1 = lo hecho hasta aquí (Tareas 1-4 + verificaciones V4-V15) se cierra como esta HU; R2 = Tarea 5 pasa a una HU aparte, **en el mismo sprint e inmediatamente después** (entre una y otra `POST /api/persons` crea personas marcadas que cualquier inquilino todavía puede leer y editar: es lo que D4 cierra). Se reporta, no se decide.

---

### Task 5: `businessScope()` en los dos grupos de `person_routes.ts` (la cascada de rutas)

**Files:**
- Modify: `start/routes/person_routes.ts` (cadena `:26-28` de `/api/persons`; cadena `:39-40` de `/api/persons-get-places-of-birth`)
- Modify: `tests/functional/employees/person_store_subject_type_permission_gate.spec.ts` (12 peticiones)
- Modify: `tests/unit/routes/sensitive_access_context_mounts.spec.ts` (test `:125`)

**Interfaces:**
- Consumes: `middleware.businessScope()` de `#start/kernel` (exige `X-Business-Unit-Id` UUID v4; 400 `BU.VAL.000` si falta, 404 `BU.NOT.001` si inválido o fuera de alcance). `BusinessUnit.businessUnitPublicId` (UUID v4 generado en `@beforeCreate`).
- Produces: `/api/persons/*` y `/api/persons-get-places-of-birth` corren bajo `TenantContext.run([empresaActiva])`, así que `Person.query()` en `index`, `show`, `update`, `delete`, `verifyInfo` y `getPlacesOfBirth` queda acotado y el hook marca lo que `store` crea.

- [ ] **Step 1: Reescribir el test de montaje (queda falso en silencio: hay que buscarlo, no esperar el rojo)**

En `tests/unit/routes/sensitive_access_context_mounts.spec.ts`, sustituir el test `'el grupo /api/persons con solo auth() monta sensitiveAccess y no businessScope'` (`:125-137`) por:

```ts
  test('los tres grupos de person_routes montan businessScope; /api/persons lo monta antes que sensitiveAccess', ({
    assert,
  }) => {
    // USRH1789698261609: `/api/persons` era el único grupo con rutas de
    // escritura que abría el contexto sensible sin acotar por empresa; hoy
    // cualquier inquilino leía, editaba y borraba expedientes de los demás.
    // El orden importa: los dos middlewares envuelven la serialización con
    // `runWithSensitiveReadDecisions` y gana el store del PRIMERO montado;
    // `businessScope` aplica el rol efectivo de la empresa antes de decidir.
    const source = readFileSync(join(ROOT, 'start/routes/person_routes.ts'), 'utf-8')
    const groups = extractRouteGroups(source)
    const persons = groups.find((group) => group.chain.includes(".prefix('/api/persons')"))
    const getEmployee = groups.find((group) =>
      group.chain.includes(".prefix('/api/person-get-employee')")
    )
    const placesOfBirth = groups.find((group) =>
      group.chain.includes(".prefix('/api/persons-get-places-of-birth')")
    )

    assert.isDefined(persons)
    assert.isDefined(getEmployee)
    assert.isDefined(placesOfBirth)
    for (const group of [persons!, getEmployee!, placesOfBirth!]) {
      assert.include(group.chain, '.use(middleware.businessScope())')
    }

    const chain = persons!.chain
    const authIdx = chain.indexOf('.use(middleware.auth())')
    const scopeIdx = chain.indexOf('.use(middleware.businessScope())')
    const sensitiveIdx = chain.indexOf('.use(middleware.sensitiveAccess())')
    assert.isAbove(authIdx, -1)
    assert.isAbove(scopeIdx, authIdx)
    assert.isAbove(sensitiveIdx, scopeIdx)
    assert.notInclude(chain, 'permissionGate', 'sin gate de grupo: PUT/DELETE evalúan por vínculo en el controller')
  })
```

Ojo con el comentario `:23-27` del propio spec ("`person_routes.ts` tiene 3 grupos, solo uno de los cuales monta `sensitiveAccess()`"): sigue siendo cierto y se deja.

- [ ] **Step 2: Correr el spec para verificar que falla**

```bash
node ace test unit --files="sensitive_access_context_mounts"
```

Expected: FAIL: `expected '…' to include '.use(middleware.businessScope())'` para `/api/persons`.

- [ ] **Step 3: Montar el scope en `start/routes/person_routes.ts`**

Cadena de `/api/persons` (`:26-28`) — `businessScope()` **inmediatamente después** de `auth()`:

```ts
  .prefix('/api/persons')
  .use(middleware.auth())
  .use(middleware.businessScope())
  .use(middleware.sensitiveAccess())
  .use(middleware.sensitiveMaskEcho())
```

Cadena de `/api/persons-get-places-of-birth` (`:39-40`):

```ts
  .prefix('/api/persons-get-places-of-birth')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

**Sin comentarios dentro de las cadenas `.prefix(...).use(...)`.** `extractRouteGroups` (el censo de `sensitive_access_context_mounts.spec.ts`) corta la cadena en la primera línea que no empieza con `.`: un `/** … */` entre dos `.use()` dejaría fuera del censo a `sensitiveAccess()` y pondría en rojo el test de los 10 modelos. La explicación va en el comentario de cabecera del archivo (`:5-14`), al que se añade este párrafo:

```ts
// USRH1789698261609 — los tres grupos montan `businessScope()`: la pertenencia del
// expediente va por `people.business_unit_id` y sin scope cualquier inquilino
// listaba, leía, editaba y borraba expedientes de los demás. En `/api/persons` va
// ANTES que `sensitiveAccess()`: los dos abren el contexto de lectura sensible y al
// serializar gana el del primero montado; `businessScope` aplica antes el rol
// efectivo de la empresa. Solo scope: sin `permissionGate` de grupo (ése es de
// "Cerrar las consecuencias del cambio de credencial"). `/api/persons-get-places-of-birth`
// no es un catálogo aunque lo parezca: `PersonService.getPlacesOfBirth` consulta
// `Person.query()` con `distinct` y `withTrashed()` y sin scope agregaba los lugares
// de nacimiento de todos los inquilinos. NO meter comentarios entre los `.use()`:
// el censo de `sensitive_access_context_mounts.spec.ts` corta la cadena ahí.
```

`/api/person-get-employee` (`:33-34`) no se toca.

- [ ] **Step 4: Correr los specs de montaje**

```bash
node ace test unit --files="sensitive_access_context_mounts" --files="sensitive_mask_echo_mounts"
```

Expected: PASS. (`sensitive_mask_echo_mounts` verifica que `sensitiveMaskEcho()` sigue solo en `/api/persons`: no cambia.)

- [ ] **Step 5: Ver caer el spec de alta de persona (400 sin header) y arreglarlo**

```bash
node ace test functional --files="person_store_subject_type_permission_gate"
```

Expected: FAIL en todos los casos con `expected 400 to not equal 403` / `expected 400 to equal 403`: la ruta exige el header.

En `tests/functional/employees/person_store_subject_type_permission_gate.spec.ts`, agregar un helper junto a `personPayload`:

```ts
/** Header de empresa activa: el middleware exige el UUID v4 público, no el id entero. */
function buHeader(actor: TenantActor): string {
  return actor.businessUnit.businessUnitPublicId
}
```

y en **cada** `client.post('/api/persons')` y `client.get('/api/persons')` (12 peticiones: 2 en el grupo OFF y 10 en el ON, contando el bucle) intercalar `.header('X-Business-Unit-Id', buHeader(actor!))` antes de `.loginAs(actor!.user)`. Ejemplo:

```ts
      const response = await client
        .post('/api/persons')
        .header('X-Business-Unit-Id', buHeader(actor!))
        .loginAs(actor!.user)
        .json(payload)
```

El actor local de ese spec hace `attach([businessUnitId])` sin rol en la pivote; `resolveEffectiveTenantRole` devuelve `null` en ese caso y manda `users.role_id` (fail-open documentado en `effective_tenant_role.ts`), así que el gate sigue evaluando el rol del spec. No cambiar el `attach`.

Además, ahora que `store` corre con contexto, las personas que estos casos crean nacen marcadas con la empresa del actor. `deleteByEmail` las borra por huella antes de `cleanupActor` (que borra la empresa al final), así que la FK no estorba. No hace falta tocar la limpieza.

- [ ] **Step 6: Correr el spec de alta y el resto de consumidores de `/api/persons`**

```bash
node ace test functional --files="person_store_subject_type_permission_gate" --files="employees_sensitive_write_by_category" --files="employees_sensitive_mask_echo_http" --files="employees_sensitive_read_by_category" --files="employees_persona_domicilio_bancos_permission_gate" --files="employees_expediente_read_permission_gate" && node ace test e2e --files="sensitive_read_by_category"
```

Expected: PASS. Los otros seis ya mandaban el header y sus fixtures ya nacen marcadas (Tarea 4).

- [ ] **Step 7: Segunda corrida completa (D11 paso 4)**

```bash
node ace test 2>&1 | tee /tmp/suite-despues-de-rutas.log | tail -40
```

Expected: verde. Cualquier fallo nuevo respecto a `/tmp/suite-antes-de-rutas.log` es de la cascada de rutas: un spec que llama `/api/persons*` sin header (buscar con `grep -rn "api/persons" tests | grep -v X-Business-Unit-Id` en el archivo que falló) o que lee por `/api/persons/:id` una persona sin marca. Mismo arreglo de la Tarea 4.

- [ ] **Step 8: Typecheck y lint**

```bash
npm run typecheck && npm run lint
```

Expected: limpios (sin errores nuevos respecto a la base).

- [ ] **Step 9: Commit**

```bash
git add start/routes/person_routes.ts tests/functional/employees/person_store_subject_type_permission_gate.spec.ts tests/unit/routes/sensitive_access_context_mounts.spec.ts
git commit -m "feat(USRH1789698261609): el CRUD de personas y los lugares de nacimiento se acotan a la empresa activa

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Manual de prueba manual de API (hermano del plan) y su bloque de seeder QA

**Files:**
- Create: `docs/superpowers/plans/2026-09-21-marcar-empresa-duena-persona-qa-api.md`
- Modify (no versionado, `.git/info/exclude`): `database/seeders/_tmp_do_not_commit_qa_seeder.ts` — función `seedEmpresaDuenaPersonaQa` y su llamada en `run()` después de `seedLiberacionPersonaQa()`

**Interfaces:**
- Consumes: `createAlcanceUser(email, lastname, roleId, businessUnitId)` y `QA_PASSWORD = 'password'` del propio seeder; `Person.create({ ..., businessUnitId })`.
- Produces: empresas `qa-duena-a` y `qa-duena-b`, capturistas `qa-duena-capturista-a@gsti-tests.local` y `qa-duena-capturista-b@gsti-tests.local` (rol `root`, como el capturista de la HU predecesora: pasa el gate y `businessScope` lo sigue acotando a su empresa), expedientes `QA PersonaA Duena` (marca A), `QA PersonaB Duena` (marca B) y `QA SinMarca Duena` (NULL). El administrador de plataforma **ya existe** en el seeder (`qa-dashboard-platform-admin@gsti-tests.local`, `isPlatformAdmin: true`, `:1127-1154`) y se reutiliza; no se crea otro.

- [ ] **Step 1: El bloque del seeder**

Agregar al final de `database/seeders/_tmp_do_not_commit_qa_seeder.ts`:

```ts
/**
 * USRH1789698261609 — Marcar la empresa dueña de la persona.
 * Dos empresas con su capturista, un expediente en cada una y uno sin marca.
 * `createAlcanceUser` crea al capturista sin contexto: su persona nace NULL y
 * se marca aquí a mano, como haría el hook con la empresa activa.
 */
async function seedEmpresaDuenaPersonaQa(): Promise<void> {
  const rootRole = await Role.query().where('role_slug', 'root').whereNull('role_deleted_at').firstOrFail()

  async function ensureUnit(slug: string, name: string): Promise<BusinessUnit> {
    return BusinessUnit.firstOrCreate(
      { businessUnitSlug: slug },
      { businessUnitName: name, businessUnitLegalName: `${name} SA de CV`, businessUnitActive: 1 },
    )
  }

  /**
   * Expediente por apellido (el correo viaja cifrado y no sirve de filtro);
   * si existe, se le repone la marca esperada y se restaura si estaba liberado.
   */
  async function ensurePerson(lastname: string, email: string, businessUnitId: number | null): Promise<Person> {
    let person = await Person.query()
      .withTrashed()
      .where('person_lastname', lastname)
      .where('person_second_lastname', 'Duena')
      .first()
    if (!person) {
      person = await Person.create({
        personFirstname: 'QA',
        personLastname: lastname,
        personSecondLastname: 'Duena',
        personEmail: email,
        businessUnitId,
      })
      return person
    }
    person.deletedAt = null
    person.businessUnitId = businessUnitId
    await person.save()
    return person
  }

  const unitA = await ensureUnit('qa-duena-a', 'QA Duena Empresa A')
  const unitB = await ensureUnit('qa-duena-b', 'QA Duena Empresa B')

  for (const [email, lastname, unit] of [
    ['qa-duena-capturista-a@gsti-tests.local', 'DuenaCapturistaA', unitA],
    ['qa-duena-capturista-b@gsti-tests.local', 'DuenaCapturistaB', unitB],
  ] as const) {
    const user = await createAlcanceUser(email, lastname, rootRole.roleId, unit.businessUnitId)
    const person = await Person.find(user.personId)
    if (person && person.businessUnitId !== unit.businessUnitId) {
      person.businessUnitId = unit.businessUnitId
      await person.save()
    }
  }

  await ensurePerson('PersonaA', 'qa-duena-persona-a@gsti-tests.local', unitA.businessUnitId)
  await ensurePerson('PersonaB', 'qa-duena-persona-b@gsti-tests.local', unitB.businessUnitId)
  await ensurePerson('SinMarca', 'qa-duena-sin-marca@gsti-tests.local', null)
}
```

y en `run()`, después de `await seedLiberacionPersonaQa()`, agregar `await seedEmpresaDuenaPersonaQa()`. (`Role`, `BusinessUnit`, `Person` ya están importados en ese archivo.)

- [ ] **Step 2: Correr el seeder contra la BD de desarrollo migrada**

La BD de desarrollo ya tiene la migración desde la Tarea 1 (paso 7). Si se trabaja en otra máquina, `node ace migration:run` primero. Luego:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Expected: termina sin error. Verificar:

```sql
SELECT p.person_lastname, b.business_unit_slug FROM people p LEFT JOIN business_units b ON b.business_unit_id = p.business_unit_id WHERE p.person_second_lastname = 'Duena' ORDER BY p.person_lastname;
```

Expected: `DuenaCapturistaA → qa-duena-a`, `DuenaCapturistaB → qa-duena-b`, `PersonaA → qa-duena-a`, `PersonaB → qa-duena-b`, `SinMarca → NULL`.

- [ ] **Step 3: Escribir el manual**

Crear `docs/superpowers/plans/2026-09-21-marcar-empresa-duena-persona-qa-api.md`:

````markdown
# Prueba manual API — Cada expediente personal pertenece a una empresa y solo ella lo ve

**Problema:** Valanserh promete que cada empresa cliente trabaja sobre sus propios datos y no ve los de otra. Eso se cumplía en casi todo el producto salvo en el expediente personal —donde viven nombre, RFC, CURP, número de seguro social, fecha de nacimiento y teléfonos—: esa parte no sabía de qué empresa era cada registro, así que un usuario de cualquier empresa podía consultar, editar y borrar expedientes de todas las demás.

**Solución:** Desde esta historia cada expediente registra por sí solo a qué empresa pertenece en el momento de crearse: quien lo captura no llena ningún campo nuevo ni ve nada distinto. Las consultas hechas desde una empresa solo traen sus propios expedientes; los de otra empresa y los que no tienen empresa (los del personal de la plataforma) responden como si no existieran. El dueño de una cuenta nueva que se registra por su cuenta nace ya dentro de su empresa. Este manual no cubre a los empleados que llegan desde el reloj checador: esa vía sigue creando expedientes sin empresa y se atiende en otra historia.

Ejemplo: es como los casilleros de una escuela: cada alumno tiene el suyo y, aunque todos los casilleros estén en el mismo pasillo, tu llave solo abre el tuyo. Antes, la llave de cualquier alumno abría todos; ahora, si intentas abrir el de otro, el casillero se comporta como si no existiera.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio.** Además del token, cada petición a `/api/persons` lleva el header `X-Business-Unit-Id` con el identificador público de la empresa desde la que se consulta. Es lo único que cambia hacia fuera con esta historia: antes ese endpoint no lo pedía.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listas dos empresas (A y B), un capturista en cada una, un expediente en cada empresa, un expediente sin empresa y el administrador de la plataforma. Volver a correr el seeder restaura cualquier expediente que un escenario haya modificado.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-duena-capturista-a@gsti-tests.local` | `password` | Capturista de la empresa A |
| **B** | `qa-duena-capturista-b@gsti-tests.local` | `password` | Capturista de la empresa B |
| **P** | `qa-dashboard-platform-admin@gsti-tests.local` | `password` | Administrador de la plataforma (no pertenece a ninguna empresa) |

Identificadores públicos de las dos empresas, para el header `X-Business-Unit-Id`:

```sql
SELECT business_unit_slug, business_unit_public_id, business_unit_id FROM business_units WHERE business_unit_slug IN ('qa-duena-a', 'qa-duena-b');
```

Identificadores de los tres expedientes sembrados (el correo no sirve de filtro porque se guarda cifrado; el apellido sí):

```sql
SELECT person_id, person_lastname, business_unit_id FROM people WHERE person_second_lastname = 'Duena' AND person_lastname IN ('PersonaA', 'PersonaB', 'SinMarca');
```

## 2. Escenario 1 — Alta desde la empresa A: el expediente nace marcado sin que el capturista haga nada distinto

Usuario: **A**.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

```json
{
  "personFirstname": "Alta",
  "personLastname": "EmpresaA",
  "personSecondLastname": "Duena",
  "personEmail": "qa-duena-alta-a@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": { "person": { "personId": 123, "personFirstname": "Alta", "personLastname": "EmpresaA", "...": "..." } }
}
```

El cuerpo no trae ningún campo nuevo: la marca de empresa no se muestra. Comprobar en la base que quedó puesta:

```sql
SELECT person_id, business_unit_id FROM people WHERE person_lastname = 'EmpresaA' AND person_second_lastname = 'Duena';
```

Debe traer el `business_unit_id` de la empresa A, nunca vacío.

Qué significa cada dato:
- `type`: qué tan bien salió la petición. Puede valer `success` (sí se hizo lo pedido) o `warning` (no se hizo; el mensaje dice por qué — se ve en el Escenario 3).
- `title` / `message`: el encabezado y la frase del resultado.
- `data.person.personId`: el número con el que el sistema identifica al expediente recién creado.
- El número que devuelve la consulta: la empresa dueña del expediente; el sistema la puso solo, a partir de la empresa desde la que se capturó. Si viniera vacío, el expediente habría nacido sin dueño.

## 3. Escenario 2 — Desde la empresa A solo se ven los expedientes de A

Usuario: **A**.

**Endpoint:** `GET /api/persons?page=1&limit=100`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The persons were found successfully",
  "data": { "persons": { "meta": { "total": 3, "...": "..." }, "data": [ { "personId": "...", "personLastname": "DuenaCapturistaA" }, { "personLastname": "PersonaA" }, { "personLastname": "EmpresaA" } ] } }
}
```

Deben aparecer únicamente el capturista A, `PersonaA` y la persona creada en el Escenario 1. **No** aparecen `PersonaB`, `DuenaCapturistaB` ni `SinMarca`. Repetir con el usuario **B** y su header: aparecen solo `DuenaCapturistaB` y `PersonaB`.

Qué significa cada dato:
- `data.persons.meta.total`: cuántos expedientes alcanza esta empresa en total.
- `data.persons.data`: la lista de esos expedientes; ninguno pertenece a otra empresa ni está sin empresa.

## 4. Escenario 3 — El expediente de otra empresa no existe para A: ni leer, ni editar, ni borrar

Usuario: **A**. Identificador: el `person_id` de `PersonaB` (resuelto en Preparar).

**Endpoint:** `GET /api/persons/<person_id de PersonaB>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

**Response exacto:** `404`

```json
{
  "type": "warning",
  "title": "The person was not found",
  "message": "The person was not found with the entered ID",
  "data": { "personId": "<person_id de PersonaB>" }
}
```

**Endpoint:** `PUT /api/persons/<person_id de PersonaB>`

```json
{
  "personFirstname": "Intruso",
  "personLastname": "PersonaB",
  "personSecondLastname": "Duena"
}
```

**Response exacto:** `404`, con el mismo `title` y `message` del `GET`.

**Endpoint:** `DELETE /api/persons/<person_id de PersonaB>`

**Response exacto:** `404`, con el mismo `title` y `message`.

Comprobar en la base que el expediente de B sigue intacto:

```sql
SELECT person_firstname, person_deleted_at FROM people WHERE person_id = <person_id de PersonaB>;
```

Debe traer `QA` y `person_deleted_at` vacío. Repetir los tres con un identificador inexistente (por ejemplo `999999999`): el `404` es idéntico, así que la respuesta no revela si el expediente existe en otra empresa.

Qué significa lo nuevo aquí:
- `type` con valor `warning` y ese `title` / `message`: el sistema responde "no encontrado" tanto para un expediente ajeno como para uno que no existe; no distingue entre ambos a propósito.
- `data.personId`: el identificador que se pidió, devuelto tal cual.
- Lo que devuelve la consulta: el nombre sigue siendo `QA` (nadie lo editó) y la segunda columna viene vacía (nadie lo dio de baja).

## 5. Escenario 4 — El expediente sin empresa es invisible para cualquier empresa

Usuario: **A**. Identificador: el `person_id` de `SinMarca`.

**Endpoint:** `GET /api/persons/<person_id de SinMarca>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

**Response exacto:** `404` (los datos son los ya explicados en el Escenario 3). Repetir con el usuario **B** y su header: también `404`.

## 6. Escenario 5 — El header manipulado no abre la puerta

Usuario: **A**.

**Endpoint:** `GET /api/persons?page=1&limit=100` con `X-Business-Unit-Id: <identificador público de la empresa B>`

**Response exacto:** `404`

```json
{
  "title": "Unidad de negocio no encontrada",
  "detail": "El recurso solicitado no existe o no tienes acceso a él.",
  "key": "BU.NOT.001"
}
```

**Endpoint:** `GET /api/persons?page=1&limit=100` **sin** el header `X-Business-Unit-Id`

**Response exacto:** `400`

```json
{
  "title": "Header requerido",
  "detail": "El header x-business-unit-id es obligatorio.",
  "key": "BU.VAL.000"
}
```

**Endpoint:** `GET /api/persons?page=1&limit=100` con `X-Business-Unit-Id: <business_unit_id entero de la empresa A>` (el número interno en vez del identificador público)

**Response exacto:** `404` con `key: "BU.NOT.001"`.

Qué significa cada dato:
- `key`: puede valer `BU.VAL.000` (falta el header que dice desde qué empresa se consulta) o `BU.NOT.001` (la empresa indicada no existe o el usuario no tiene acceso a ella; el sistema no dice cuál de las dos).

## 7. Escenario 6 — El dueño de una cuenta nueva nace dentro de su empresa

Sin usuario: son los tres pasos públicos del registro. El registro admite **5 peticiones por minuto por dirección**: si aparece `429`, esperar un minuto.

**Endpoint:** `POST /api/auth/signup/start`

```json
{
  "firstName": "Duena",
  "lastName": "Signup",
  "businessUnitName": "QA Duena Signup",
  "email": "qa-duena-signup@gsti-tests.local",
  "billingPlanId": <id de un plan publicado>,
  "contractedEmployees": 10
}
```

El plan: `SELECT billing_plan_id FROM billing_plans WHERE billing_plan_published_at IS NOT NULL AND billing_plan_deleted_at IS NULL LIMIT 1;`

**Response exacto:** `200` con `data.signupDraftId`.

**Endpoint:** `POST /api/auth/signup/verify-otp` con `{ "signupDraftId": <el de arriba>, "pinCode": "<pin>" }`; el pin: `SELECT signup_draft_pin_code FROM signup_drafts WHERE signup_draft_email = 'qa-duena-signup@gsti-tests.local';`

**Response exacto:** `200` con `data.signupToken`.

**Endpoint:** `POST /api/auth/signup/complete` con `{ "signupDraftId": <id>, "signupToken": "<token>", "password": "DuenaSignup123!", "passwordConfirm": "DuenaSignup123!" }`

**Response exacto:** `200` con `data.user.personId`.

Comprobar en la base:

```sql
SELECT p.business_unit_id, b.business_unit_name FROM people p JOIN business_units b ON b.business_unit_id = p.business_unit_id WHERE p.person_id = <data.user.personId>;
```

Debe traer `QA Duena Signup`. Después, con el token que devolvió `complete` y el `business_unit_public_id` de esa empresa en el header, `GET /api/persons/<data.user.personId>` responde `200` con el propio expediente: el dueño se ve a sí mismo desde el primer momento.

Qué significa lo nuevo aquí:
- `data.signupDraftId`: el número del registro a medio hacer, que se usa en los dos pasos siguientes.
- `data.signupToken`: la llave de un solo uso que confirma que el correo fue verificado.
- `data.user.personId`: el expediente del dueño de la cuenta nueva.
- Lo que devuelve la consulta: el nombre de la empresa que acaba de crear; el expediente del dueño quedó dentro de ella.

## 8. Escenario 7 — La plataforma sigue creando su gente sin empresa

Usuario: **P**.

**Endpoint:** `POST /api/platform/users`

Headers: `Authorization: Bearer <token de P>` (sin `X-Business-Unit-Id`: la plataforma no trabaja desde una empresa)

```json
{
  "personFirstname": "Landlord",
  "personLastname": "Duena",
  "userEmail": "qa-duena-landlord@gsti-tests.local",
  "userPassword": "LandlordDuena123!"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Usuario interno creado",
  "message": "El administrador de plataforma fue creado correctamente.",
  "data": { "user": { "userId": 45, "userEmail": "qa-duena-landlord@gsti-tests.local", "isPlatformAdmin": true, "roleId": 1, "personId": 456 } }
}
```

Comprobar en la base:

```sql
SELECT business_unit_id FROM people WHERE person_id = <data.user.personId>;
```

Debe venir vacío: el personal de la plataforma no pertenece a ninguna empresa, y crearlo no falla. Después, con el usuario **A** y su header, `GET /api/persons/<data.user.personId>` responde `404` (los datos son los ya explicados en el Escenario 3): ese expediente es invisible para cualquier empresa.

Qué significa lo nuevo aquí:
- `data.user.isPlatformAdmin`: puede valer `true` (la cuenta opera la plataforma para todos los clientes) o `false` (es una cuenta de empresa; no se puede provocar en este endpoint).
- `data.user.roleId`: el número del rol interno que se le asignó.
- Lo que devuelve la consulta, vacío: el expediente no tiene empresa dueña, a propósito.

## 9. Checklist

- [ ] Escenario 1 — Alta desde A queda marcada con A y la respuesta no trae campo nuevo
- [ ] Escenario 2 — A lista solo lo suyo; B lista solo lo suyo
- [ ] Escenario 3 — GET/PUT/DELETE de un expediente de B desde A: 404 idéntico al inexistente y fila intacta
- [ ] Escenario 4 — El expediente sin empresa es invisible para A y para B
- [ ] Escenario 5 — Header de B, header ausente y header entero: rechazados
- [ ] Escenario 6 — El dueño de la cuenta nueva queda dentro de su empresa y se ve a sí mismo
- [ ] Escenario 7 — La plataforma crea su gente sin empresa, sin error, y ninguna empresa la ve
````

- [ ] **Step 4: Levantar el ambiente y entregar el manual — el recorrido lo hace una persona**

Regla `~/.cursor/rules/manual-qa-execution.mdc`: un playbook lo camina **una persona**, nunca el agente (ni con curl, ni con Playwright, salvo que Noé lo pida explícitamente para esta tarea). La parte del agente termina aquí:

```bash
node ace serve --hmr
```

Expected: API arriba en `http://127.0.0.1:3333` sobre la BD de desarrollo sembrada en el Step 2. Entregar a Noé la ruta del manual y la tabla de usuarios. Si al recorrerlo algún response difiere en `title`/`message`/`key`, **se corrige el manual**, no el código: los mensajes del 404 de persona y los del header no se tocan en esta HU.

- [ ] **Step 5: Commit del manual (el seeder no se versiona)**

```bash
git add docs/superpowers/plans/2026-09-21-marcar-empresa-duena-persona-qa-api.md
git commit -m "docs(USRH1789698261609): manual de QA de API de la marca de empresa dueña de la persona

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación de cierre (V1-V15 del spec), DoD y PR

**Files:** ninguno nuevo. Verificación cruzada del diff completo.

- [ ] **Step 1: Suite completa en verde, typecheck y lint**

```bash
node ace test 2>&1 | tail -20 && npm run typecheck && npm run lint
```

Expected: verde, sin errores nuevos.

- [ ] **Step 2: Verificar que nada prohibido cambió**

```bash
git diff --stat feature/USRH1789698261608-blindar-liberacion-persona...HEAD -- app/mixins/with_business_unit_scope.ts app/controllers/person_controller.ts app/controllers/platform_user_controller.ts app/services/employee_service.ts app/services/user_service.ts app/services/pii_reveal_service.ts app/validators/person.ts app/helpers/person_is_collaborator.ts database/seeders resources/lang app/constants/system_modules_menu .env .env.test
```

Expected: **sin salida**.

```bash
git diff feature/USRH1789698261608-blindar-liberacion-persona...HEAD -- app/services/person_service.ts | grep -E "^[-+]" | grep -v "^[-+]{3}" 
```

Expected: exactamente las líneas añadidas de `create` (el comentario y `newPerson.businessUnitId = person.businessUnitId ?? null`); **nada** de `syncCreate`.

```bash
grep -n "includeGlobal" app/models/person.ts; grep -n "onDelete" database/migrations/*_add_business_unit_id_to_people_table.ts; grep -n "throw" app/models/person.ts
```

Expected: las tres sin salida.

```bash
git diff feature/USRH1789698261608-blindar-liberacion-persona...HEAD --stat | grep -vE "person\.ts|person_service\.ts|signup_draft_service\.ts|person_routes\.ts|add_business_unit_id_to_people_table|person_business_unit_scope|tenant_actor|employee_fixture|sensitive_read_by_category_support|employees_expediente_read_permission_gate|employees_persona_domicilio_bancos_permission_gate|signup_system_settings|signup_complete\.spec|person_store_subject_type_permission_gate|sensitive_access_context_mounts|qa-api|marcar-empresa-duena-persona"
```

Expected: solo la línea de resumen (`N files changed`). Cualquier otro archivo es radio no previsto: se lista en el PR.

- [ ] **Step 3: Verificación funcional contra el servidor local (V1-V3, V9: separación por resultado, no por status)**

Con el API corriendo sobre la BD de desarrollo (ya migrada y sembrada con el bloque QA) y el mismo usuario y header de la **captura previa** de Preparación:

```bash
TOKEN='<bearer del usuario de A>'; BU_A='<business_unit_public_id de A>'; curl -s "http://127.0.0.1:3333/api/persons?page=1&limit=1000" -H "Authorization: Bearer $TOKEN" -H "X-Business-Unit-Id: $BU_A" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s).data.persons;console.log(JSON.stringify({total:b.meta.total,ids:b.data.map(p=>p.personId).sort((a,c)=>a-c)}))})' > /tmp/persons-A-despues.json; diff /tmp/persons-A-antes.json /tmp/persons-A-despues.json && echo 'IDS Y TOTAL IDENTICOS'
```

Expected: si la BD de desarrollo tenía personas de varias empresas, el `diff` **mostrará** que desaparecieron las ajenas y las NULL: eso es el cierre del hueco, y lo que hay que verificar es que **todas** las personas que quedan tienen `business_unit_id` = A y que **todas** las personas con `business_unit_id` = A siguen (comparar contra `SELECT person_id FROM people WHERE business_unit_id = <A> AND person_deleted_at IS NULL ORDER BY person_id`). Si la captura previa se hizo sobre la empresa A del seeder QA, el `diff` sale vacío e imprime `IDS Y TOTAL IDENTICOS`. En ambos casos, pegar los dos JSON en el PR. **Un 200 con menos filas de las propias es la regresión que este paso existe para atrapar.**

Después, con el header de B: ninguna fila devuelta tiene `business_unit_id` de A ni NULL (comprobar los ids contra `people` por SQL).

- [ ] **Step 4: Landlord sin regresión (V11, CA-3) — a mano y en este orden**

No hay endpoint de listado de personas en `/api/platform/*`; la regla 7 se comprueba donde vive, en el modelo sin contexto:

```bash
node ace repl
```

```js
const { default: Person } = await import('#models/person')
const rows = await Person.query().count('* as total')
console.log(Number(rows[0].$extras.total))
```

y en MySQL: `SELECT COUNT(*) FROM people WHERE person_deleted_at IS NULL;`. Expected: **los dos números iguales** (incluye todas las empresas y las NULL). Luego, con un administrador de plataforma, `POST /api/platform/users` con `{ "personFirstname": "Landlord", "personLastname": "QA", "userEmail": "qa-duena-landlord@gsti-tests.local", "userPassword": "LandlordQa123!" }` → `201`, y `SELECT business_unit_id FROM people WHERE person_lastname = 'QA' AND person_firstname = 'Landlord'` → `NULL`, sin excepción en el log (CA-6).

- [ ] **Step 5: El dueño de la cuenta nueva se ve a sí mismo (V13, CA-4) — a mano, después de V11**

Es la verificación V13 del spec, hecha por el desarrollador con `curl` (no es el recorrido del playbook, que corresponde a una persona): los tres pasos del registro y después `GET /api/persons/<personId>` con el token y el header de la empresa nueva → `200` con el propio expediente; en BD, `people.business_unit_id` del dueño = `business_units.business_unit_id` de la empresa recién creada.

- [ ] **Step 6: Arranque del backoffice sin 400 (R3 del spec)**

Con `valanserh-bo` (rama `multitenant`) apuntando al API local, hacer login completo con un usuario de empresa y con un usuario de plataforma, con la pestaña Network abierta filtrando `persons`. Expected: **ninguna** petición a `/api/persons*` responde `400 BU.VAL.000`; el interceptor global (`plugins/business-unit-header.client.ts`) adjunta el header. Si alguna petición del arranque sale antes de que `workBusinessUnitPublicId` resuelva y recibe `400`, **no** se arregla aquí: se reporta a Wilvardo con la URL y el momento (es el punto abierto de §10 del spec).

- [ ] **Step 7: Constancia numérica del residual D3 (V15, CA-11) — se mide, no se arregla**

Si el entorno tiene un reloj checador de prueba: anotar la hora, disparar una sincronización (`POST /api/synchronization/employees`) y correr:

```sql
SELECT COUNT(*) AS personas_sin_marca_del_sync FROM people WHERE business_unit_id IS NULL AND person_created_at > '<inicio de la prueba>';
```

Pegar el número en la HU y en el PR. Si no hay reloj de prueba, dejar constancia de que no se pudo medir y que el camino (`employee_controller.ts:360` → `employee_service.ts:208` → `PersonService.syncCreate`) sigue creando personas NULL.

- [ ] **Step 8: Abrir el PR contra la rama de la predecesora**

```bash
git push -u origin feature/USRH1789698261609-marcar-empresa-duena-persona
gh pr create --base feature/USRH1789698261608-blindar-liberacion-persona --title "feat(USRH1789698261609): marcar la empresa dueña de la persona" --body-file - <<'EOF'
## Qué cambia

`people` registra su empresa dueña (`business_unit_id`, nullable, índice, FK **RESTRICT**). `Person` compone `withBusinessUnitScope()` **sin `includeGlobal`** (fail-closed: una fila NULL es invisible para todo inquilino) y un `@beforeCreate` tolerante que toma la empresa activa del contexto y deja NULL sin lanzar cuando no hay contexto. `PersonService.create` propaga la marca; el signup self-service crea la empresa antes que el dueño y lo marca en la misma transacción (sobrevive al bucle de colisión de slug). `/api/persons` y `/api/persons-get-places-of-birth` montan `businessScope()`: hoy cualquier inquilino listaba, leía, editaba y borraba expedientes de los demás.

## Qué NO cambia

Ninguna pantalla, ningún campo de request ni de response (la columna no se serializa), ningún mensaje ni status salvo que `/api/persons*` ahora exige `X-Business-Unit-Id` (400 `BU.VAL.000` si falta; comportamiento ya existente del middleware). `PersonService.syncCreate` **no se toca** (D3, decisión de Wilvardo 2026-09-18): las personas del reloj checador nacen NULL e invisibles para su propio cliente. **Este PR no es el cierre completo de la marca de empresa.** Sin backfill: base limpia el 2026-09-28.

## Notas para revisión

- `businessUnitId` lleva `serializeAs: null`: §10 y CA-1 del spec (cero campos nuevos en response) mandan sobre el `@column()` a secas de §9.
- `businessScope()` va **antes** de `sensitiveAccess()`: ambos envuelven la serialización con `runWithSensitiveReadDecisions` y gana el store del primero montado; `businessScope` aplica antes el rol efectivo de la empresa. Precedente: `exception_request_routes.ts`.
- Radio real de `tests/`: además de los 4 archivos de §13, el support `sensitive_read_by_category_support.ts`, dos fixtures locales (`employees_expediente_read_permission_gate`, `employees_persona_domicilio_bancos_permission_gate`) y el teardown de `signup_system_settings` (buscaba la persona por correo cifrado y la FK RESTRICT lo delataba). Mismo cambio de una línea.
- Oráculos residuales, heredan a *Acotar por empresa la unicidad de RFC, CURP y NSS*: (a) `verifyInfo` sigue consultando por huella — con el scope ya solo contesta sobre la propia empresa; (b) en `update`/`delete`, `personIsCollaborator` (sin scope) corre antes de buscar la persona: un usuario **sin** `tab-persona-write` recibe 403 para un colaborador ajeno y 404 para un id inexistente.
- Spec de unidad nuevo (`person_business_unit_scope.spec.ts`) aunque §2 no lo pedía: automatiza el `grep includeGlobal = 0` del DoD y el fail-closed. Si se rechaza, se retira sin más cambios.

## Evidencia (DoD)

- `grep -n "includeGlobal" app/models/person.ts` → sin salida.
- `SHOW CREATE TABLE people`: `<pegar líneas de business_unit_id, KEY y CONSTRAINT>`.
- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` → 679 migraciones en verde; `rollback` del `down()` en verde.
- Captura previa vs posterior de `GET /api/persons` para A: `<pegar los dos JSON>`.
- Conteo landlord (REPL sin contexto) = `SELECT COUNT(*) FROM people WHERE person_deleted_at IS NULL` = `<N>`.
- Residual D3: `<número>` personas NULL creadas por el sync de prueba (o "no medible en este entorno").

## Pruebas

Manual de QA de API hermano: `docs/superpowers/plans/2026-09-21-marcar-empresa-duena-persona-qa-api.md` (6 escenarios). Suite completa en verde antes y después de montar el scope de rutas.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 9: Cerrar el ciclo en el spec y en Asana**

Anotar en el spec (§9 → `serializeAs: null`; §10 → orden de la cadena; §13 → radio real de tests; §12 → oráculo del orden de comprobaciones en `update`/`delete`) y formalizar en Asana la dependencia dura hacia *Acotar por empresa la unicidad de RFC, CURP y NSS*.

---

## Self-review (hecho al escribir el plan)

**Cobertura del spec.** Regla 1 y CA-1 → Tareas 2 (hook, `serializeAs: null`) y 3 (`create`), Escenario 1 del manual. Regla 2 → hook con contexto (Tarea 2, test "crear con contexto marca") + `businessScope` en `store` (Tarea 5); carga masiva y alta de empleado pasan por `employee_service.createPerson` / `user_service` bajo contexto, sin cambio de código. Regla 3 y CA-4 → Tarea 3 (reorden + assert en `signup_complete`), V13, Escenario 6. Regla 4 y CA-6 → hook tolerante sin `throw` (Tarea 2, tests "sin contexto deja null" y "no lanza"), V11 con `POST /api/platform/users`. Reglas 5 y 6, CA-2, CA-5 → grupo contra BD de la Tarea 2 (A ve solo A, NULL invisible, scope vacío = 0 filas), Tarea 5 (rutas), Escenarios 2-4. Regla 7 y CA-3 → tests "sin contexto no se filtra" y `runUnscoped`, V11 por REPL (no hay endpoint de listado en plataforma: hallazgo 4). Regla 8 → sin endpoint de reasignación; hook no pisa marca previa (test). CA-7 → Tarea 1 (make:migration, 13 dígitos, `fresh --seed`, `rollback`, `SHOW CREATE TABLE`). CA-8 → Escenario 3 con verificación en BD; oráculo del orden de comprobaciones declarado (hallazgo 5). CA-9 → `verifyInfo` acotado por el scope de rutas (Tarea 5); cierre completo declarado como herencia. CA-10 → Escenario 5 (header de B, ausente, entero). CA-11 → V15 (Tarea 7, paso 7). Bordes de §6: contexto con id (`whereIn`), scope vacío (`1 = 0`), sin contexto, `runUnscoped`, NULL invisible, alta sin contexto, marca previa no pisada, header ausente = 400, FK RESTRICT → todos con test en la Tarea 2 o escenario en el manual; "escritura no filtrada" → TSDoc del modelo, no se prueba (mina documentada). D11 (orden de trabajo) → Tareas 1-3, 4, 5 en ese orden con dos corridas completas. Trip-wire §16.1 → Tarea 4, paso 8. Manual de QA (regla `manual-qa-api.mdc`: constantes del proyecto, endpoint + response literal, sin rutas ni clases, "qué significa" sin nombres de columna, valores fijos enumerados, seeder QA con usuarios `qa-<feature>-<variante>`, ejemplo cotidiano, estructura mínima; 7 escenarios, el 7º cubre "las cuentas de la plataforma no pierden nada") → Tarea 6; recorrido a cargo de una persona (regla `manual-qa-execution.mdc`) → Tarea 6 paso 4.

**Placeholders.** Los únicos valores por rellenar son credenciales, ids y JSON del entorno local (`<bearer …>`, `<business_unit_public_id …>`, `<pegar …>`), que no pueden fijarse en el plan. El prefijo de la migración lo fija `make:migration`, no el plan.

**Consistencia de tipos.** `Person.businessUnitId: number | null` (Tarea 2) es lo que asignan `PersonService.create` (`?? null`), el signup (`number`), las fixtures (`businessUnitId: number` de los parámetros) y el seeder QA (`number | null`). `Person.assignBusinessUnitId(person: Person): void` se llama con ese nombre en los tests puros y en el TSDoc de la migración. `buHeader(actor: TenantActor): string` en el spec de alta usa la interfaz local `TenantActor` de ese mismo archivo (tiene `businessUnit: BusinessUnit`). `extractRouteGroups` y `RouteGroup.chain` en la Tarea 5 son los que ya existen en `sensitive_access_context_mounts.spec.ts`. La FK, el índice y la columna se nombran igual en la migración, en el test de contenido y en el `SHOW CREATE TABLE` esperado.
