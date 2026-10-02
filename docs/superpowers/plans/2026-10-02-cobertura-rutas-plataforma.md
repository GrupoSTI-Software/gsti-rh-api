# Cobertura y marco regulatorio a rutas de plataforma (USRH1790610965479) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las 8 lecturas de cobertura y marco regulatorio respondan solo a usuarios de plataforma con token de la consola bajo `/api/platform/...` (mismo contenido), que las rutas `/api/v1/...` dejen de existir (404) y que el módulo `regulatory-coverage` se retire del catálogo del backoffice.

**Architecture:** Dos archivos de rutas de plataforma nuevos (uno por área, molde `platform_discount_code_routes.ts`) con guard `auth + platformAdmin` **a nivel de grupo**; se eliminan los dos archivos de rutas viejos, sus imports y las declaraciones de permiso `regulatory_coverage_permission_declarations.ts`. El módulo se retira del catálogo con el molde completo de `holidays`. Cero migraciones, cero seeders: el seeder existente `0062` aplica la baja en el deploy.

**Tech Stack:** Adonis 6, japa, `middleware.platformAdmin()` existente (`app/middleware/platform_admin_middleware.ts`, no se toca).

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1790610965479.md` — el plan argumenta desde él; el ejecutor lee **ambos**. Los cuerpos de error exactos, el contrato congelado de las 8 lecturas y el censo de archivos están en el spec (§5, §9, §12) y se copian verbatim de ahí, no se improvisan.

**Validación de anclas:** hecha el 2026-10-02 contra `multitenant` — rutas viejas (`start/routes/regulatory_coverage_routes.ts`, `start/routes/regulatory_framework_routes.ts`), imports en `start/routes.ts:140-141` (con `platform_legal_document_routes.js` ya presente en `:28`), molde `holidays` (`:681-693`), entrada `regulatory-coverage` (`:1213-1238`), guard, helpers (`tenant_actor.ts`, `platform_admin_scope_bypass.spec.ts:22-71`) y los 4 specs de test coinciden con el spec. Drift trivial: se corrige al momento; cambio de alcance/contrato: se escala a Wilvardo.

## Global Constraints

- **No tocar** (censo §12): handlers y servicios de ambos módulos, `app/middleware/platform_admin_middleware.ts`, `database/seeders/0062_system_module_seeder.ts`, `tests/unit/constants/system_modules_constant.spec.ts`, `docs/openapi.yaml`, `tests/unit/modules/regulatory-coverage/regulatory_coverage_summary.spec.ts`. Ninguno puede aparecer en el diff.
- Los grupos de rutas nuevos montan **solo** `[middleware.auth({ guards: ['api'] }), middleware.platformAdmin()]`: jamás `permissionGate` ni `businessScope`; sin validación duplicada en el controller (S1).
- No se crea ningún `key` ni `code` de error; las formas de error vigentes se citan tal cual (§9 "Desviaciones vigentes": 403 sin `code`, errores de cobertura sin `code`, 500 con `detail` crudo).
- En el archivo de cobertura, `'/summary'` se declara **antes** que `'/:regulationId'`.
- Catálogo (regla del repo): única fuente `system_modules.constant.ts`; retiro con el molde **completo** de `holidays`; sin ids ni slugs a mano; sin archivos nuevos que enumeren módulos o permisos.
- Orden de imports en `start/routes.ts` (§16): los dos nuevos van **después** de `./routes/platform_legal_document_routes.js` (`:28`); primero `platform_regulatory_coverage_routes.js`, luego `platform_regulatory_framework_routes.js`.
- TS estricto, cero `any`. Código, comentarios y docblocks en español; Conventional Commits con tipo en inglés y descripción en español; todo commit de la HU lleva footer `Refs: USRH1790610965479`. Sin push.
- Los tests funcionales exigen la BD `sae_pruebas` levantada. El guardrail no negociable: `node ace test unit --files="constants/"`.

## Review Focus

1. **Un `permissionGate` o `businessScope` rezagado** en los grupos nuevos reabre el dato a tenants o rompe el guard: Tasks 1-2 asertan `notInclude` de ambos en la tabla de rutas; Task 4 fija el 403 con `deepEqual` del cuerpo exacto del guard.
2. **Una ruta vieja queda viva** y responde 403 en vez de 404 (lectura aún posible por URL conocida): Task 3 aserta inexistencia de archivos e imports, y Task 4 prueba las 8 viejas con y sin token → 404.
3. **`/:regulationId` captura "summary"** y la vista ejecutiva responde 400: Task 1 fija el orden por `indexOf`; Task 5 prueba `GET /summary` → 200 con `aggregate` y `regulations`.
4. **Una sesión del backoffice de un usuario de plataforma abre las lecturas** (regla 3): Task 4 prueba `isPlatformAdmin` con `loginAs` → 403, y plataforma revocada con token de consola → 403.
5. **Retiro a medias del catálogo** (permisos vivos, icono, exigencia encendida) rompe el menú o deja el módulo reactivable: Task 7 deja `system_modules_constant.spec.ts` en verde **sin editarlo** (contrato de retirados `:202-210`).

---

### Task 1: Rutas de plataforma de cobertura + tabla de rutas + swagger del controller

**Files:**
- Create: `start/routes/platform_regulatory_coverage_routes.ts`
- Create: `tests/unit/routes/platform_regulatory_coverage_routes.spec.ts`
- Modify: `start/routes.ts` (import nuevo en el bloque de plataforma)
- Modify: `app/modules/regulatory-coverage/regulatory_coverage.controller.ts` (docblock de clase `:7-16`, descripción de `/summary` `:166`, 3 bloques `@swagger` `:20`, `:148`, `:308` aprox.)

**Interfaces:**
- Consumes: `middleware.auth({ guards: ['api'] })` y `middleware.platformAdmin()` de `#start/kernel`; handlers existentes `#modules/regulatory-coverage/regulatory_coverage.controller.{index,summary,show}` (sin tocar).
- Produces: `GET /api/platform/regulatory-coverage` (L1), `GET /api/platform/regulatory-coverage/summary` (L2) y `GET /api/platform/regulatory-coverage/:regulationId` (L3) con el contrato congelado del §9. Task 3 extiende este spec con las aserciones de archivo viejo; Task 5 usa las rutas.

- [ ] **Step 1: Escribir el unitario de tabla de rutas (T8, fracasa primero)**

Molde: `tests/unit/routes/platform_discount_code_routes.spec.ts` (leer `start/routes/platform_regulatory_coverage_routes.ts` con `readFile` + `join(process.cwd(), ...)`). Grupos japa:

- "el grupo completo usa auth + platformAdmin": `assert.include(content, 'middleware.auth(')` e `include 'middleware.platformAdmin()'`.
- "nunca declara businessScope ni permissionGate": `assert.notInclude(content, 'businessScope')` y `notInclude 'permissionGate'`.
- "declara las 3 lecturas": `include` de cada `router.get('/')`, `router.get('/summary')` y `router.get('/:regulationId')` con su handler literal (`#modules/regulatory-coverage/regulatory_coverage.controller.index` / `.summary` / `.show`).
- "summary se declara antes que :regulationId": `assert.isBelow(content.indexOf("'/summary'"), content.indexOf("'/:regulationId'"))`.
- "start/routes.ts — registro del módulo" (segundo `test.group`, molde del descuento): `assert.include(routesTs, "import './routes/platform_regulatory_coverage_routes.js'")`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node ace test unit --files="platform_regulatory_coverage_routes"`
Expected: FAIL — `readFile` de `start/routes/platform_regulatory_coverage_routes.ts` rechaza (ENOENT).

- [ ] **Step 3: Crear `start/routes/platform_regulatory_coverage_routes.ts`**

Contenido fijo por el spec (§7), docblock en español citando la HU:

```ts
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * USRH1790610965479 — lecturas de cobertura regulatoria: dato confidencial de
 * plataforma (roadmap interno), sin tenant. Solo usuarios de plataforma con
 * sesión del panel (origin = 'platform').
 *
 *   GET /api/platform/regulatory-coverage                   → lista de normas con su cobertura
 *   GET /api/platform/regulatory-coverage/summary           → resumen agregado y proyectado
 *   GET /api/platform/regulatory-coverage/:regulationId     → detalle de cobertura de una norma
 *
 * "/summary" va ANTES de "/:regulationId": si no, "summary" se toma como id (400).
 */
router
  .group(() => {
    router.get('/', '#modules/regulatory-coverage/regulatory_coverage.controller.index')
    router.get('/summary', '#modules/regulatory-coverage/regulatory_coverage.controller.summary')
    router.get('/:regulationId', '#modules/regulatory-coverage/regulatory_coverage.controller.show')
  })
  .prefix('/api/platform/regulatory-coverage')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
```

- [ ] **Step 4: Importar en `start/routes.ts`**

Insertar `import './routes/platform_regulatory_coverage_routes.js'` después de `import './routes/platform_legal_document_routes.js'` (`:28`), antes de `platform_device_model_routes.js`.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `node ace test unit --files="platform_regulatory_coverage_routes"`
Expected: PASS

- [ ] **Step 6: Actualizar docblocks y `@swagger` del controller de cobertura**

Sin tocar lógica. En `regulatory_coverage.controller.ts`:

- Docblock de clase (`:7-16`): la ruta pasa a `GET /api/platform/regulatory-coverage`; agregar la advertencia: "Solo registrables bajo el grupo `[auth, platformAdmin]`: el controller no tiene control de acceso propio."
- Los 3 bloques `@swagger` (`index`, `summary`, `show`): path `/api/v1/regulatory-coverage*` → `/api/platform/regulatory-coverage*`; agregar a `responses` la entrada `403` con `description: Acceso restringido a plataforma (AUTH.PLATFORM.FORBIDDEN)`; en la descripción de `summary` (`:166`), la referencia al endpoint por-norma pasa a `GET /api/platform/regulatory-coverage`.

- [ ] **Step 7: Verificar que no queda ruta vieja en el controller**

Run: `grep -n "/api/v1/regulatory-coverage" app/modules/regulatory-coverage/regulatory_coverage.controller.ts`
Expected: sin resultados (exit code 1)

- [ ] **Step 8: Commit**

```bash
git add start/routes/platform_regulatory_coverage_routes.ts tests/unit/routes/platform_regulatory_coverage_routes.spec.ts start/routes.ts app/modules/regulatory-coverage/regulatory_coverage.controller.ts
git commit -m "refactor: crear las rutas de plataforma de cobertura regulatoria

Refs: USRH1790610965479"
```

---

### Task 2: Rutas de plataforma del marco + tabla de rutas + swagger del controller

**Files:**
- Create: `start/routes/platform_regulatory_framework_routes.ts`
- Create: `tests/unit/routes/platform_regulatory_framework_routes.spec.ts`
- Modify: `start/routes.ts` (segundo import)
- Modify: `app/modules/regulatory-framework/regulatory_framework.controller.ts` (docblock de clase `:25-32`, 5 bloques `@swagger` `:39`, `:76`, `:104`, `:136`, `:170` aprox.)

**Interfaces:**
- Consumes: mismos middlewares; handlers `#modules/regulatory-framework/regulatory_framework.controller.{listAuthorities,showAuthority,showRegulation,showClause,showClauseFeatures}` (sin tocar).
- Produces: L4 `GET /api/platform/regulatory-authorities`, L5 `.../:slug`, L6 `GET /api/platform/regulations/:code`, L7 `.../clauses/:clauseCode`, L8 `.../clauses/:clauseCode/features` (contrato §9). Task 3 extiende este spec; Task 6 usa las rutas.

- [ ] **Step 1: Escribir el unitario de tabla de rutas (T8, fracasa primero)**

Mismo molde y estilo de aserciones que Task 1, sobre `start/routes/platform_regulatory_framework_routes.ts`:

- Guard de grupo: `include 'middleware.auth('` y `'middleware.platformAdmin()'`; `notInclude 'businessScope'` y `'permissionGate'`.
- Las 5 rutas con su handler literal: `router.get('/regulatory-authorities', '#modules/regulatory-framework/regulatory_framework.controller.listAuthorities')`, `showAuthority` con `'/regulatory-authorities/:slug'`, `showRegulation` con `'/regulations/:code'`, `showClause` con `'/regulations/:code/clauses/:clauseCode'`, `showClauseFeatures` con `'/regulations/:code/clauses/:clauseCode/features'`.
- `start/routes.ts`: `include "import './routes/platform_regulatory_framework_routes.js'"`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node ace test unit --files="platform_regulatory_framework_routes"`
Expected: FAIL — ENOENT del archivo de rutas.

- [ ] **Step 3: Crear `start/routes/platform_regulatory_framework_routes.ts`**

Contenido fijo por el spec (§7). Conservar la nota de `regulatory_framework_routes.ts:45-48`: el formato de `:clauseCode` se valida en el controller (regex + 404 con shape correcto), no con `.where()`:

```ts
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * USRH1790610965479 — marco regulatorio (autoridades, normas, numerales y
 * features): dato confidencial de plataforma, sin tenant. Solo usuarios de
 * plataforma con sesión del panel (origin = 'platform').
 *
 *   GET /api/platform/regulatory-authorities                        → lista de autoridades
 *   GET /api/platform/regulatory-authorities/:slug                  → una autoridad
 *   GET /api/platform/regulations/:code                             → norma con árbol de numerales
 *   GET /api/platform/regulations/:code/clauses/:clauseCode         → un numeral
 *   GET /api/platform/regulations/:code/clauses/:clauseCode/features → features del numeral
 *
 * El formato de :clauseCode se valida en el controller (regex + 404 con el
 * shape correcto), no con .where() de la ruta.
 */
router
  .group(() => {
    router.get('/regulatory-authorities', '#modules/regulatory-framework/regulatory_framework.controller.listAuthorities')
    router.get('/regulatory-authorities/:slug', '#modules/regulatory-framework/regulatory_framework.controller.showAuthority')
    router.get('/regulations/:code', '#modules/regulatory-framework/regulatory_framework.controller.showRegulation')
    router.get('/regulations/:code/clauses/:clauseCode', '#modules/regulatory-framework/regulatory_framework.controller.showClause')
    router.get('/regulations/:code/clauses/:clauseCode/features', '#modules/regulatory-framework/regulatory_framework.controller.showClauseFeatures')
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
```

- [ ] **Step 4: Importar en `start/routes.ts`**

Insertar `import './routes/platform_regulatory_framework_routes.js'` inmediatamente después del import de Task 1.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `node ace test unit --files="platform_regulatory_framework_routes"`
Expected: PASS

- [ ] **Step 6: Actualizar docblocks y `@swagger` del controller del marco**

Sin tocar lógica. Docblock de clase: las 5 lecturas pasan a `/api/platform/...` y agrega la misma advertencia del grupo `[auth, platformAdmin]`. Los 5 bloques `@swagger`: path `/api/v1/...` → `/api/platform/...` y respuesta `403` con `AUTH.PLATFORM.FORBIDDEN` en cada uno.

- [ ] **Step 7: Verificar que no queda ruta vieja en el controller**

Run: `grep -n "/api/v1/regulat" app/modules/regulatory-framework/regulatory_framework.controller.ts`
Expected: sin resultados (exit code 1)

- [ ] **Step 8: Commit**

```bash
git add start/routes/platform_regulatory_framework_routes.ts tests/unit/routes/platform_regulatory_framework_routes.spec.ts start/routes.ts app/modules/regulatory-framework/regulatory_framework.controller.ts
git commit -m "refactor: crear las rutas de plataforma del marco regulatorio

Refs: USRH1790610965479"
```

---

### Task 3: Retiro de las rutas viejas y de las declaraciones de permiso

**Files:**
- Delete: `start/routes/regulatory_coverage_routes.ts`
- Delete: `start/routes/regulatory_framework_routes.ts`
- Delete: `app/constants/regulatory_coverage_permission_declarations.ts`
- Modify: `start/routes.ts` (quitar los imports `:140-141`)
- Modify: `tests/unit/routes/platform_regulatory_coverage_routes.spec.ts` (aserciones de archivo viejo)
- Modify: `tests/unit/routes/platform_regulatory_framework_routes.spec.ts` (aserciones de archivo viejo)
- Modify: `tests/unit/routes/traumatic_event_registry_regulatory_coverage_permission_gate_routes.spec.ts` (quitar la parte de cobertura)

**Interfaces:**
- Consumes: los dos specs de Task 1-2 (se extienden en el lugar).
- Produces: cero referencias al símbolo `REGULATORY_COVERAGE_PERMISSION_DECLARATIONS`; las 8 rutas `/api/v1/regulat...` dejan de registrarse (404 de router). Task 4 depende de esto para T7.

- [ ] **Step 1: Extender los dos unitarios con aserciones que hoy fallan**

En `platform_regulatory_coverage_routes.spec.ts`:

```ts
test('el archivo de rutas viejo fue eliminado', async ({ assert }) => {
  const routesTs = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
  assert.notInclude(routesTs, "import './routes/regulatory_coverage_routes.js'")
  await assert.rejects(access(join(process.cwd(), 'start/routes/regulatory_coverage_routes.ts')))
})
```

En `platform_regulatory_framework_routes.spec.ts`, el mismo test con `regulatory_framework_routes`. (Importar `access` de `node:fs/promises`.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `node ace test unit --files="platform_regulatory_coverage_routes" && node ace test unit --files="platform_regulatory_framework_routes"`
Expected: FAIL en el test nuevo de cada archivo (los archivos viejos aún existen).

- [ ] **Step 3: Quitar la parte de cobertura del spec traumático (antes de borrar el archivo que importa)**

En `traumatic_event_registry_regulatory_coverage_permission_gate_routes.spec.ts`, sin renombrar el archivo:

- Quitar el import `:5` (`REGULATORY_COVERAGE_PERMISSION_DECLARATIONS`) y la constante `COVERAGE` `:27`.
- Quitar el test "las ocho lecturas de cobertura y marco regulatorio piden regulatory-coverage:read" (`:54-69`).
- En el test "los dos módulos tienen la exigencia encendida..." (`:70-84`): dejar solo `'traumatic-event-reports-registry'` en el loop y ajustar el título a un solo módulo.
- Quitar el grupo completo "Cobertura regulatoria — rutas de cobertura y marco regulatorio" (`:177-267`), incluidos sus helpers locales `coverage`, `framework`, `decl` y `assertGatedAfterAuth`.
- El título del grupo `:42` pierde "y cobertura regulatoria"; actualizar el docblock del archivo `:15-21` en consecuencia.
- **Se queda** el import de `gateExpression` (los grupos del registro `:94` lo siguen usando).

- [ ] **Step 4: Correr el spec traumático y verificar que sigue en verde**

Run: `node ace test unit --files="traumatic_event_registry"`
Expected: PASS — solo quedan los grupos del registro.

- [ ] **Step 5: Eliminar los tres archivos y sus imports**

- `git rm start/routes/regulatory_coverage_routes.ts start/routes/regulatory_framework_routes.ts app/constants/regulatory_coverage_permission_declarations.ts`
- En `start/routes.ts`, borrar las líneas `import './routes/regulatory_coverage_routes.js'` y `import './routes/regulatory_framework_routes.js'` (`:140-141`).

- [ ] **Step 6: Correr los dos unitarios extendidos y verificar que pasan**

Run: `node ace test unit --files="platform_regulatory_coverage_routes" && node ace test unit --files="platform_regulatory_framework_routes" && node ace test unit --files="traumatic_event_registry"`
Expected: PASS los tres.

- [ ] **Step 7: Verificar que no queda ningún consumidor del símbolo**

Run: `grep -rn "REGULATORY_COVERAGE_PERMISSION_DECLARATIONS" app start tests`
Expected: sin resultados. (El comentario del catálogo que cita el nombre de **archivo** se borra en Task 7, junto con la entrada que lo contiene.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: retirar las rutas v1 y las declaraciones de permiso de cobertura

Refs: USRH1790610965479"
```

---

### Task 4: Reescribir el gate funcional como prueba del guard de plataforma (T1-T4, T6, T7)

**Files:**
- Modify (reescritura en el lugar, sin renombrar): `tests/functional/regulatory_coverage_permission_gate.spec.ts`

**Interfaces:**
- Consumes: rutas de Tasks 1-2 y el retiro de la Task 3 (para el 404 de las viejas); helpers `createBypassActor`, `createTenantActor`, `cleanupTenantActor`, `required` de `#tests/helpers/tenant_actor`; mold del actor de plataforma de `tests/functional/platform_admin_scope_bypass.spec.ts:22-71` (inline por spec, **sin helper nuevo**).
- Produces: el molde de actor de plataforma (crear usuario `isPlatformAdmin` + `POST /api/platform/auth/login` → bearer) que Tasks 5-6 replican inline.

- [ ] **Step 1: Reescribir el spec con los casos nuevos (hoy fallan contra el guard nuevo)**

Reemplazar el contenido completo. Estructura:

- Docblock: guard de plataforma — las 8 lecturas son exclusivas de `origin = 'platform'`; el 403 del guard no trae `code`.
- Actor de plataforma inline (copia del molde `platform_admin_scope_bypass.spec.ts:22-71`): `createPlatformAdmin(emailPrefix)` (rol `root` vía query, `Person` + `User` con `isPlatformAdmin: true`), `cleanupActor` (borra `ApiToken` por `tokenable_id`, luego `User` y `Person`), `loginPlatformConsole` (`POST /api/platform/auth/login` → `data.token`). Contraseña propia del spec.
- Tabla `platformCalls()` (molde de la tabla actual `:38-56`, mismas 8 lecturas con URLs de plataforma y el `regulationId` resuelto de BD):

```ts
return [
  { label: 'lista de cobertura', url: '/api/platform/regulatory-coverage' },
  { label: 'resumen ejecutivo', url: '/api/platform/regulatory-coverage/summary' },
  { label: 'detalle de cobertura por norma', url: `/api/platform/regulatory-coverage/${regulation.regulationId}` },
  { label: 'lista de autoridades', url: '/api/platform/regulatory-authorities' },
  { label: 'detalle de autoridad', url: '/api/platform/regulatory-authorities/stps' },
  { label: 'norma con árbol de numerales', url: `/api/platform/regulations/${REGULATION_CODE}` },
  { label: 'numeral', url: `/api/platform/regulations/${REGULATION_CODE}/clauses/5.8.a` },
  { label: 'features del numeral', url: `/api/platform/regulations/${REGULATION_CODE}/clauses/5.8.a/features` },
]
```

- Tabla `legacyCalls()` con las 8 URLs `/api/v1/...` (las exactas de la tabla actual `:40-53`).
- Helper `assertPlatformForbidden(assert, response)`:

```ts
assert.equal(response.status(), 403)
assert.deepEqual(response.body(), {
  title: 'Acceso restringido a plataforma',
  detail: 'Esta sección es exclusiva de administradores de plataforma.',
  key: 'AUTH.PLATFORM.FORBIDDEN',
})
assert.notProperty(response.body(), 'code')
assert.notProperty(response.body(), 'data')
```

- Helper local `grantOrphanedCoverageRead(role)`: siembra la concesión huérfana directo (el módulo puede estar soft-deleted en una BD re-sembrada con `0062`, y `grantModulePermissions` no la encontraría): `SystemPermission.query().withTrashed().where('system_permission_slug', 'read').whereHas('systemModule', (q) => q.withTrashed().where('system_module_slug', 'regulatory-coverage')).firstOrFail()` → `RoleSystemPermission.create({ roleId, systemPermissionId })`.

Tests (T1-T4, T6, T7):

1. **T1** — sin token: las 8 nuevas responden 401 (una por una con su `label` en el mensaje).
2. **T2** — owner de tenant con `loginAs` (token BO): las 8 nuevas responden 403 con `assertPlatformForbidden`. Y un actor de tenant (`createTenantActor`) cuyo rol recibió antes `regulatory-coverage:read` vía `grantOrphanedCoverageRead`: también 403 en las 8 — la concesión guardada no abre nada.
3. **T3** — `root` y `super-administrador` con `loginAs` (createBypassActor de cada slug): ≥1 ruta por archivo (`/api/platform/regulatory-coverage` y `/api/platform/regulations/NOM-035-STPS`) → 403 con key `AUTH.PLATFORM.FORBIDDEN`.
4. **T4** — usuario `isPlatformAdmin` autenticado con `loginAs` (origin web): 403 en una ruta de cada archivo.
5. **T6** — plataforma revocada: `createPlatformAdmin`, login de consola → bearer; poner `is_platform_admin = 0` y guardar; `GET /api/platform/regulatory-coverage` con ese bearer → 403 (el guard relee por petición).
6. **T7** — las 8 viejas: sin token → 404; y con owner `loginAs` → 404 (solo status).

- [ ] **Step 2: Correr el spec y verificar que pasa**

Run: `node ace test functional --files="regulatory_coverage_permission_gate"`
Expected: PASS — los 403/404/401 son del código de Tasks 1-3; si algo falla, es del guard o de las rutas, no del spec.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/regulatory_coverage_permission_gate.spec.ts
git commit -m "test: reescribir el gate de cobertura como prueba del guard de plataforma

Refs: USRH1790610965479"
```

---

### Task 5: Spec funcional de contenido de cobertura a plataforma (T5: L1-L3)

**Files:**
- Modify: `tests/functional/regulatory_coverage.spec.ts`

**Interfaces:**
- Consumes: rutas de Task 1; molde de actor de plataforma de Task 4 (inline, sin helper nuevo).
- Produces: cobertura funcional de L1, L2 y L3 con token de consola, incluidos los escenarios de error propios de §5.

- [ ] **Step 1: Pasar los paths al actor de plataforma**

- Reemplazar `getRootUser()` por el actor de plataforma inline (mismo molde de Task 4: crear, login de consola, teardown con `cleanupActor`).
- Los requests pasan de `.loginAs(user)` a `.header('Authorization', \`Bearer ${token}\`)`.
- Path `:9` del docblock, `:90` (401) y `:100` (200): `/api/v1/regulatory-coverage` → `/api/platform/regulatory-coverage`.
- Conservar los helpers de tolerancia `isRegulatorySchemaMissing*` y el test 401 (`:89-93`) y el 200 con asertos de forma (`assertRegulationShape`) tal cual están.

- [ ] **Step 2: Agregar los casos de summary, detalle y errores propios (§5)**

Cuatro tests nuevos con token de consola:

- **200 summary**: `GET /api/platform/regulatory-coverage/summary` → `data.aggregate.evaluableClauses` es número; `data.aggregate.coveragePercentage` trae `disponible`/`enDesarrollo`/`planeado` cada uno `number | null`; `data.regulations` es array con las mismas llaves por fila. Pina que "summary" no se confunde con un id (200, no 400).
- **200 detalle (L3)**: resolver `regulationId` de `NOM-035-STPS` de BD; `GET /api/platform/regulatory-coverage/:regulationId` → `data.regulation` con las llaves de §9 L3 y `data.clauses` array con `regulationClauseId`, `code`, `obligationKey` string, `bestCoverage` en `('total', 'parcial', null)`, `features` array con `systemFeatureId`, `featureStatus`, `coverage`, `module.moduleSlug`.
- **400 id no numérico**: `GET /api/platform/regulatory-coverage/abc` → 400; `assert.properties(body, ['title', 'detail', 'key'])` con `title: 'Error de validación'`, `detail: 'El parámetro regulationId debe ser un entero positivo.'`, `key: 'id-no-numerico'`; `assert.notProperty(body, 'code')`.
- **404 norma inexistente**: `GET /api/platform/regulatory-coverage/999999` → 404; `title: 'No encontrado'`, `detail: 'La norma solicitada no existe o no está vigente.'`, `key: 'norma-no-encontrada'`; `assert.notProperty(body, 'code')`.

- [ ] **Step 3: Correr y verificar que pasa**

Run: `node ace test functional --files="regulatory_coverage.spec"`
Expected: PASS (con `sae_pruebas` levantada; sin las tablas regulatorias, los casos 200 se saltan por la tolerancia existente).

- [ ] **Step 4: Commit**

```bash
git add tests/functional/regulatory_coverage.spec.ts
git commit -m "test: probar la cobertura regulatoria por rutas de plataforma

Refs: USRH1790610965479"
```

---

### Task 6: Spec funcional del marco a plataforma (T5: L4-L8 + textos sin claves crudas)

**Files:**
- Modify: `tests/functional/regulatory_framework.spec.ts`

**Interfaces:**
- Consumes: rutas de Task 2; molde de actor de plataforma de Task 4 (inline, sin helper nuevo).
- Produces: cobertura funcional de L4-L8 con token de consola y el caso "sin claves crudas" de §5.

- [ ] **Step 1: Mover los 26 paths de los 7 grupos y cambiar el actor**

- Actor: `getRootUser()` → actor de plataforma inline (Task 4); requests con `Bearer` en vez de `loginAs`.
- Reemplazar los paths de los 7 grupos (`:29,91,128,227,310,334,346` aprox.): `/api/v1/regulatory-authorities*` → `/api/platform/regulatory-authorities*` y `/api/v1/regulations/*` → `/api/platform/regulations/*` (26 ocurrencias en total).
- Conservar **sin tocar los asertos**: 401, 404 `REG.NF.001/002/003` con shape, 422 `REG.VAL.001`, conteos del árbol (47/49), orden ASC, pertenencia cruzada, `Accept-Language: en` (`:357`) y el caso de caché caliente < 200 ms (`:210-225`) — la consulta de `ApiToken` del guard ya cuenta dentro del umbral; no se relaja.

- [ ] **Step 2: Agregar el caso "textos del catálogo en español sin claves crudas" (§5)**

Test nuevo en el grupo de `/regulations/:code`: para `NOM-035-STPS` y `NOM-037-STPS` con `Accept-Language: es`, recorrer `clausesTree` recursivamente y asertar que ningún `title`, `obligation`, `explanation`, `rationale` ni `auditCriteria` empieza con `"regulatory."` (usar `startsWith`, no `include`, para no castigar textos que legítimamente contengan la palabra).

- [ ] **Step 3: Correr y verificar que pasa**

Run: `node ace test functional --files="regulatory_framework.spec"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/regulatory_framework.spec.ts
git commit -m "test: probar el marco regulatorio por rutas de plataforma

Refs: USRH1790610965479"
```

---

### Task 7: Baja del módulo `regulatory-coverage` en el catálogo (T9)

**Files:**
- Modify: `app/constants/system_modules_menu/system_modules.constant.ts:1213-1238` (entrada `regulatory-coverage`)

**Interfaces:**
- Consumes: molde `holidays` (`:681-693`) y contrato de retirados de `tests/unit/constants/system_modules_constant.spec.ts:202-210`.
- Produces: la entrada retirada que el seeder `0062` (no tocado) lleva a BD como soft delete idempotente en el deploy.

- [ ] **Step 1: Retirar la entrada con el molde completo**

Sobre la entrada `regulatory-coverage` (`:1213-1238`): **se conservan** `systemModuleName: 'Cobertura regulatoria'`, slug, description, `systemModules: 1`, path `/regulatory-coverage` y `systemModuleOrder: 10`. Cambian a: `systemModuleActive: 0`, `systemModulePermissionEnforcementActive: false`, `systemModuleRetired: true`, `systemModuleIcon: ''`, `systemModulePermissions: []`. **Borrar** el comentario `:1229-1230` (cita el archivo de declaraciones eliminado). Nada más del catálogo se toca; los catálogos derivados tampoco.

- [ ] **Step 2: Correr el guardrail del catálogo sin editar el spec**

Run: `node ace test unit --files="constants/"`
Expected: PASS — el contrato de retirados exige `systemModuleActive === 0` y `systemModulePermissions.length === 0`; un retiro a medias lo truena. El spec **no se edita**.

- [ ] **Step 3: Regresión del spec traumático**

Run: `node ace test unit --files="traumatic_event_registry"`
Expected: PASS — desde Task 3 ya no referencia cobertura; el grupo del registro de eventos traumáticos queda intacto (regla 9).

- [ ] **Step 4: Commit**

```bash
git add app/constants/system_modules_menu/system_modules.constant.ts
git commit -m "refactor: dar de baja el modulo de cobertura regulatoria del catalogo

Refs: USRH1790610965479"
```

---

### Task 8: Verificación de cierre (Definition of Done §14)

**Files:**
- Solo verificación; sin cambios de código.

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Greps de ausencia**

```bash
grep -rn "regulatory_coverage_permission_declarations" app start tests
grep -rn "/api/v1/regulat" start tests/functional tests/unit/routes
```

Expected: ambos sin resultados (exit code 1). El primero ahora también cubre el comentario borrado en Task 7.

- [ ] **Step 2: Grep complementario de no-fuga (S6)**

Run: `grep -rn "load('features')" app` y revisar serializaciones de `SystemModule`
Expected: solo dentro de `app/modules/regulatory-framework/`.

- [ ] **Step 3: Suites**

```bash
node ace test unit --files="constants/"
node ace test unit --files="routes/"
node ace test unit --files="platform_regulatory_coverage_routes" && node ace test unit --files="platform_regulatory_framework_routes"
node ace test functional --files="regulatory_coverage" && node ace test functional --files="regulatory_framework" && node ace test functional --files="regulatory_coverage_permission_gate"
npm run typecheck && npm run lint
```

Expected: todo en verde (funcionales con `sae_pruebas` levantada).

- [ ] **Step 4: Entregar el manual de QA para que una persona lo recorra**

La prueba manual con la consola (L1-L8 → 200 con `Accept-Language: es`; token de BO → 403; las 8 viejas → 404) se documenta en el manual de la Task 9 y la recorre una persona con un cliente de API (regla `manual-qa-execution`: el agente no automatiza el recorrido).

- [ ] **Step 5: Dejar escrito el checklist de deploy**

Sin PR: el trabajo vive en la rama `refactor/USRH1790610965479-cobertura-rutas-plataforma` y el agente no hace push. En el mismo despliegue que esta HU hay que correr `0062_system_module_seeder`: sin él, el BO sigue mostrando la entrada (que responde 404) y `permissions:check-consistency` la marca como "retirado con fila viva".

---

### Task 9: Manual de QA del API (playbook de prueba manual)

**Files:**
- Create: `docs/superpowers/plans/2026-10-02-cobertura-rutas-plataforma-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (extensión del seeder compartido; **no versionado**: no se commitea)

**Interfaces:**
- Consumes: rutas y cuerpos exactos del contrato congelado (spec §9) y de los errores (spec §5, §6); constantes del API tomadas de manuales anteriores del mismo producto (regla `manual-qa-api`): URL base `http://127.0.0.1:3333`, login de consola `POST /api/platform/auth/login`, login del BO `POST /api/auth/login` (ambos con `{ "userEmail", "userPassword" }` → `data.token`, header `Authorization: Bearer`), seeder compartido `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`, usuarios `qa-<variante>@gsti-tests.local` con password `password`.
- Produces: el manual que una persona recorre con un cliente de API (Postman, Insomnia, Bruno) para validar la HU en ambiente local. El agente no lo recorre ni lo automatiza (regla `manual-qa-execution`).

- [ ] **Step 1: Extender el seeder temporal compartido con los actores de esta HU**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (el mismo archivo que usan los demás manuales; no se crea uno nuevo): empresa de prueba `QA Cobertura` y tres usuarios, todos con password `password` y valores **sin acentos ni eñes**:

- `qa-cobertura-plataforma@gsti-tests.local` — administrador de plataforma; entra por el login de la consola.
- `qa-cobertura-owner-bo@gsti-tests.local` — cuenta propietaria de la empresa de prueba; entra por el login del backoffice.
- `qa-cobertura-plataforma-bo@gsti-tests.local` — administrador de plataforma que entra por el login del backoffice.

Además, siembra directa (no por pantalla) de un rol de la empresa de prueba con la **concesión huérfana** `regulatory-coverage:read`: fila en `role_system_permissions` al permiso `read` del módulo `regulatory-coverage` tal como quedó tras la baja — es el estado "permiso guardado pero sin efecto" de la regla 6. Re-correr el seeder y confirmar que restaura el estado.

- [ ] **Step 2: Redactar el manual con la estructura de la regla `manual-qa-api`**

En `docs/superpowers/plans/2026-10-02-cobertura-rutas-plataforma-qa-api.md`, espejo de `2026-09-30-estado-aceptacion-qa-api.md` (mismos logins y envelope). Estructura mínima:

1. **Problema / Solución / `Ejemplo:`** (2-4 líneas cotidianas, cero jerga) + **glosario** con los términos de negocio de la HU: cobertura regulatoria, marco regulatorio, panel de plataforma, usuario de plataforma, empresa cliente y estado de una funcionalidad.
2. **Preparar** — un solo comando (el seeder compartido) + tabla de usuarios con la variante de cada uno. Una línea de prerrequisito de ambiente: el despliegue de esta HU con `0062_system_module_seeder` ya corrido (sin él, la entrada "Cobertura regulatoria" sigue en el menú del BO).
3. **Escenarios** — cada uno abre con su `Objetivo:` (qué se quiere comprobar, en lenguaje llano, antes del endpoint), trae **endpoint + response exacto** (status + body literal, con `"..."` solo en lo que no importa), y su lista "qué significa cada dato" en lenguaje de negocio. Ningún dato se explica dos veces. Propuesta de escenarios:
   - **E1** — Plataforma entra por la consola y obtiene las 8 lecturas: `200` con envelope `{type: "success", title: "Recursos", message: "Los recursos fueron encontrados con éxito", data}` y `Accept-Language: es`. Aquí se explican todos los datos: porcentajes (`number | null`: `null` cuando la norma no tiene numerales evaluables), conteos (`coveredTotal + coveredPartial + uncovered = evaluableClauses`), estados de funcionalidad (`disponible` ya liberada / `en_desarrollo` en construcción / `planeado` en el plan) y textos de numerales resueltos. El `regulationId` de las URLs se resuelve con consulta SQL multilínea corta (`WHERE` entero en línea propia), nunca hardcodeado.
   - **E2** — Objetivo: lo mismo que E1 pero con la propietaria de una empresa cliente entrando por el backoffice, para comprobar que no recibe nada. Las 8 rutas → `403` con exactamente `{title: "Acceso restringido a plataforma", detail: "Esta sección es exclusiva de administradores de plataforma.", key: "AUTH.PLATFORM.FORBIDDEN"}` — sin `code`, sin `type`, sin `data`.
   - **E3** — Objetivo: lo mismo que E2 pero con un rol al que su empresa le había concedido antes el permiso, para comprobar que el permiso guardado ya no abre nada. Misma respuesta `403`. Verificación de la consecuencia con SQL multilínea: la concesión sigue en `role_system_permissions` y el módulo está dado de baja (`system_module_deleted_at` con valor en `system_modules`).
   - **E4** — Objetivo: lo mismo que E2 pero con una persona del equipo de Valanserh que entra por el backoffice, para comprobar que esa sesión no sirve para estas consultas. Misma respuesta `403`.
   - **E5** — Las 8 direcciones viejas `/api/v1/...` (con el token del BO y también sin token) → `404` de ruta inexistente.
   - **E6** — Los errores propios se conservan tal cual (regla 4): `GET /api/platform/regulatory-coverage/abc` → `400` con `key: "id-no-numerico"`; `.../999999` → `404` con `key: "norma-no-encontrada"`; `GET /api/platform/regulations/NOM-999-XXXX` → `404` con `code: "REG.NF.002"`; `.../clauses/99.99` → `404` con `code: "REG.NF.003"`; `GET /api/platform/regulatory-authorities?country=MEX` → `422` con `code: "REG.VAL.001"`. Cuerpos verbatim del spec §5, cada uno explicando solo lo nuevo (`code`: un identificador interno del tipo de error).
   - **E7** — Sin token, las 8 rutas nuevas → `401`.
4. **Limpieza** — solo si el recorrido enciende algo global; esta HU no lo hace (la baja del módulo la aplicó el despliegue, no el manual).
5. **Checklist** — una casilla por escenario, marcada contra su `Objetivo:`.

Prohibiciones de la regla: nada de rutas de archivos, nombres de clases/servicios/middleware ni "revisa el código de X"; la auth se asume resuelta por el cliente (los logins solo se documentan porque esta HU vive de la diferencia entre las dos sesiones); toda consulta SQL en bloque cercado multilínea de líneas cortas.

- [ ] **Step 3: Cotejar el manual contra lo que el seeder deja realmente**

Cada response exacto se coteja contra la base sembrada (seeders del marco 0028-0033 + el seeder QA): normas esperadas (NOM-035-STPS, NOM-037-STPS), autoridad `stps`, numeral `5.8.a`. Si un criterio de la HU no se puede provocar con esa base, se declara en una línea como no revisable aquí — nunca se manda a una verificación imposible.

- [ ] **Step 4: Commit (solo el manual)**

```bash
git add docs/superpowers/plans/2026-10-02-cobertura-rutas-plataforma-qa-api.md
git commit -m "docs: agregar el manual de QA del API de cobertura regulatoria

Refs: USRH1790610965479"
```

---

## Notas de cierre (fuera de las tareas)

- **Ventanas aceptadas** (§15): entre esta HU y USRH1790610965557 las páginas del BO de cobertura quedan rotas por URL directa; entre esta HU y las HU del panel nadie consulta cobertura en pantalla. Ambas se recomienda integrarlas en el mismo sprint.
- **Rollback no revive el módulo** (regla 7): el upsert de `0062` no toca `deletedAt`; volver atrás exige revert + SQL manual.