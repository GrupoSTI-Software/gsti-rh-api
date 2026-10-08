# Parametrizar por empresa la compensación y la revalidación del teletrabajo (VLRH-H1791306074375) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una fila por empresa en `telework_compliance_settings` con los montos por defecto de luz, internet y cuota por equipo propio y los plazos de revalidación (meses) y aviso (días), leída por `GET`/`PUT /api/nom037/telework-settings` (permiso propio `telework-settings`: `read`/`update`) y por `TeleworkComplianceSettingService.getEffective(businessUnitId)` utilizable fuera de HTTP, con default virtual (12 meses / 30 días / montos `null`) que nunca crea fila; y pantalla **Ajustes y configuración → Ajustes de teletrabajo** en el BO, espejo de la de retención de datos.

**Architecture:** API (`gsti-rh-api`): espejo del molde `RetentionPolicy` (tabla por empresa con `UNIQUE(business_unit_id)`, default virtual, `upsert(input, businessUnitId, actorUserId)`), con tres desviaciones obligatorias: `getEffective` NO usa modelo ni mixin (`db.from` + `where` explícito + `leftJoin` a `users`/`people` para `updatedByName`, porque el mixin lanza `TenantContextMissingException` fuera de HTTP y lo leerá un cron), `upsert` dentro de `db.transaction` con `forUpdate` sobre la fila de `business_units` (el molde no protege la carrera de alta), y permiso propio vía `assertComplianceRepsePermission`. BO (`gsti-rh-bo`): espejo de `pages/retention-policy/` con permiso `update` en lugar de `write`, chip "Valores del sistema"/"Configurada" y error 422 pintado bajo el campo de `data.field`.

**Tech Stack:** Adonis 6 + VineJS + Lucid (MySQL) + japa (API, BD de pruebas `sae_pruebas`); Nuxt 4 SPA (`ssr: false`) + Vue 3 + PrimeVue + Vitest (BO).

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791306074375.md` — el plan argumenta desde él; el ejecutor lee **ambos**. Cuerpos de error, textos i18n y el contrato §9 se copian **verbatim** del spec, no se improvisan.

**Ramas:** `feature/VLRH-H1791306074375-parametrizar-por-empresa-la-compensacion-y-la` ya existe y está cargada en **ambos** repos, limpia (target `multitenant`, raíz de la cadena, sin dependencias).

**Validación de anclas (2026-10-07):** hecha contra `gsti-rh-api` @ `3da62670` y `gsti-rh-bo` @ `9af8c628`, cada uno en su rama de la HU. Coincide todo lo citado por el spec: grupo `ajustes-y-configuracion` en `app/constants/system_modules_menu/system_modules.constant.ts:1005` con `retention-policy` en `:1136-1158` y el **orden 8 libre** (ocupados 0-7, 9, 10 y 99); el molde `app/services/retention_policy_service.ts:26-36,43-76,79-88,104-114`; `respondError` en `app/controllers/retention_policy_controller.ts:19-36` con `show`/`upsert` en `:188-218`/`:414-444`; `TenantContextMissingException` en `app/mixins/with_business_unit_scope.ts:70`; `assertComplianceRepsePermission` en `app/helpers/compliance_repse_rbac.ts:18-59` con `forbidden: { errorCode, i18nPrefix }` y las cuatro claves planas `telework_policy_forbidden_{read,write}_{title,message}` en `resources/langs/es.json:2968-2971`; el patrón `MODULE_SLUG`/`RBAC_FORBIDDEN`/`assertHasPermission` de `app/modules/telework-policy/telework_policy.controller.ts:14-18,1193-1195`; `start/routes/nom037_routes.ts` con su grupo `auth`+`businessScope` al que se agrega uno nuevo **al final** (ninguna suite existente lee ese archivo: `grep nom037_routes tests/` → 0); `users.user_id` + `users.person_id` → `people.person_id` con `person_firstname`/`person_lastname`/`person_second_lastname` (ojo: `people` también tiene `business_unit_id`, calificar siempre las columnas); `pages/retention-policy/` con los 12 archivos espejo; `tests/pages/` y `tests/headerBreadcrumbs/` existentes en el BO. **Tres drifts triviales, resueltos aquí** (ninguno cambia alcance, contrato §9 ni reglas §4; nada que escalar a Wilvardo):

1. **Nombre de la migración.** El censo reserva `1791306074375_create_telework_compliance_settings_table.ts`, pero la regla del repo (`.claude/rules/migraciones-lucid.md:14`) y el propio spec §15 mandan generarla con `node ace make:migration` y **prohíben** el timestamp a mano. Se genera con `make:migration`; el prefijo de 13 dígitos que salga (posterior a `1791314813565`, el último de hoy) cumple el orden de §10: las migraciones de VLRH-H1790812613870 aún no existen y nacerán de esta rama con timestamps posteriores. El nombre real se anota en el commit.
2. **Integridad de enteros en Vine.** §11 sugiere `vine.number().withoutDecimals()` para periodicidad y aviso, pero CA-5 exige que `revalidationPeriodMonths: 6.5` caiga en `TWS.VAL.002` (`periodicidad-de-revalidacion-invalida`); con `withoutDecimals()` lo mataría Vine como `TWS.VAL.001`. El validador solo exige presencia y tipo (`vine.number()`; montos `vine.number().nullable()`); **enteridad y rangos los valida el servicio** para devolver la `key` y el `data.field` por campo (R6, CA-5/6/7).
3. **`nom035Subnav`.** El molde `retention-policy` lo pinta, pero esta pantalla vive en Ajustes y configuración, no bajo NOM-035: no se copia.

**Dónde va la documentación:** este plan y el manual de QA en `gsti-rh-api/docs/superpowers/plans/` (ese directorio **sí** se versiona). El BO no lleva documentos.

## Global Constraints

- **Rama y commits:** Conventional Commits, descripción en español, footer `Refs: VLRH-H1791306074375`. El plan **no** abre PR ni despliega (proceso aparte, de Wilvardo): termina en la verificación automatizada y en la **entrega** del manual de QA, que recorre una persona.
- **PUT reemplazo completo:** las cinco llaves obligatorias — `revalidationPeriodMonths`, `expirationNoticeDays`, `electricityAllowanceDefault`, `internetAllowanceDefault`, `ownEquipmentFeeDefault`; los importes aceptan `null`; las llaves extra las descarta Vine; `businessUnitId` del body se ignora. Empresa siempre `ctx.businessUnitScope[0]`, actor `ctx.auth.user!.userId`; **sin id en la ruta** (singleton por empresa).
- **Reglas exactas (R3-R5):** montos en MXN por mes, ≥ 0, ≤ `99999999.99`, dos decimales (`Math.abs(v * 100 - Math.round(v * 100)) >= 1e-6` ⇒ inválido), `null` = "la empresa no propone monto" (**nunca `?? 0`**); periodicidad entera 1..12; aviso entero, ≥ 1 y < periodicidad × 30 (`DAYS_PER_MONTH = 30`; con 1 mes, máximo 29).
- **Orden de reporte (CA-8):** periodicidad → aviso → luz → internet → equipo propio. Si un valor falla, **no se guarda nada** (R6).
- **Errores:** cuerpo `{ type: "error", title, message, detail, key, code, data }`, `key` = slug kebab del título (espejo `retention_policy_controller.ts:19-36`); el 403 del helper lleva `errorCode` y **sin** `detail`. Catálogo (`app/constants/telework_compliance_setting_error_codes.ts`):

  | HTTP | `code` | `title` | `key` |
  |---|---|---|---|
  | 422 | `TWS.VAL.001` | Entrada inválida | `entrada-invalida` |
  | 422 | `TWS.VAL.002` | Periodicidad de revalidación inválida | `periodicidad-de-revalidacion-invalida` |
  | 422 | `TWS.VAL.003` | Ventana de aviso inválida | `ventana-de-aviso-invalida` |
  | 422 | `TWS.VAL.004` | Monto inválido | `monto-invalido` |
  | 403 | `TWS.AUTH.001` | Sin permiso | `sin-permiso` (campo `errorCode`, lo emite el helper) |
  | 403 | `TWS.AUTH.002` | Alcance no resuelto | `alcance-no-resuelto` |
  | 500 | `TWS.SYS.001` | Error inesperado | `error-inesperado` |

  Las claves i18n del 403 del helper son `telework_settings_forbidden_{read,write}_{title,message}` (planas, raíz del JSON, como `telework_policy` en `resources/langs/es.json:2968-2971`).
- **Sin:** ruta DELETE, soft delete, seeder de módulo ni ids, catálogos derivados (`system_modules_catalog.ts`, `system_permission_catalog.ts`), nada de `system_setting_*`, ningún consumidor (adenda, equipo propio, lista de verificación, alertas) y nada de lo que fija la norma en pantalla (R7: umbral 40%, puntos de la lista, categorías de insumo, conservación, causales).
- **No tocar (censo del spec; nada puede aparecer en `git diff --name-only`):** `app/services/retention_policy_service.ts`, `app/controllers/retention_policy_controller.ts` (moldes), `app/helpers/compliance_repse_rbac.ts` (se consume tal cual), `app/constants/sensitive_fields.ts` (los montos por defecto de empresa no son datos personales), `app/modules/telework-policy/**`, `pages/retention-policy/**` (molde BO), seeders `0061`/`0062`/`0063`, `tests/unit/constants/system_modules_constant.spec.ts`, `tests/headerBreadcrumbs/breadcrumb-locales.spec.ts`.
- **Importes:** siempre `number | null` en respuestas (`consume: (v) => (v === null ? null : Number(v))` — MySQL devuelve `decimal` como texto); `businessUnitId` con `serializeAs: null` en el modelo. En `getEffective` (sin modelo) la misma conversión.
- **BD de pruebas:** antes de cada tanda funcional, `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (la suite necesita el módulo `telework-settings` sembrado por `0062_system_module_seeder`, que lee la constante). Nunca contra la BD de desarrollo. `node ace test` fija `NODE_ENV=test` solo; los comandos `ace` de migración no.
- **Idioma y tipos:** TS estricto, cero `any`; comentarios y JSDoc en español; identificadores en inglés.
- **i18n API:** bloque raíz `telework_settings` en `resources/langs/es.json` y `en.json`, junto al bloque `telework_policy` (`es.json:2912`), más las cuatro claves planas del helper junto a las de `telework_policy` (`:2968-2971`).
- **BO:** montos vacíos → `null` (nunca 0); validación en cliente espejo de R3-R5 con el mismo orden de campos (el API manda); permisos hidratados con **fallo cerrado** si `getAccess` falla; `isDefault: true` ⇒ chip "Valores del sistema" y sin línea de última modificación.
- **Líneas base medidas el 2026-10-07** (con `sae_pruebas` al día):
  - API: `NODE_ENV=test node ace test unit --files="constants/"` → **139 passed, 0 failed** (puede subir si el guardrail genera casos por módulo; jamás bajar ni fallar); `npx tsc --noEmit` → **exit 0**; `./node_modules/.bin/eslint .` → **exit 0**.
  - BO: `./node_modules/.bin/vitest run` → **255 archivos / 2358 pruebas en verde**; `./node_modules/.bin/vitest run tests/headerBreadcrumbs/breadcrumb-locales.spec.ts` → **2 passed**; `./node_modules/.bin/eslint pages/retention-policy` → **0 problemas**.
  - **El BO NO está en verde completo en la base:** `./node_modules/.bin/nuxt typecheck` arrastra **282 errores previos** (p. ej. `store/general.ts:528,563,568,894`) y `./node_modules/.bin/eslint .` **940 errores / 1384 advertencias previos**. La verificación de esta HU es acotada: `npx tsc --noEmit` API en 0; en el BO, **cero errores nuevos y ninguno que nombre `pages/telework-settings/**` ni `tests/pages/telework-settings/**`**, y eslint acotado al slice en 0.
  - En el BO, `pnpm test` puede morir en el chequeo de dependencias de pnpm (`runDepsStatusCheck`): se corre `./node_modules/.bin/vitest run …` directo, como se midió.
- **Despliegue (nota para el PR, no paso del plan):** el deploy no corre seeders. Tras integrar hay que correr `0062_system_module_seeder` y asignar `telework-settings` a los roles de RH desde Roles y permisos (paso manual del DoD §16, lo ejecuta el equipo al desplegar).

## Review Focus

Las cinco clases de entrada o modos de fallo que el spec implica y ningún criterio de aceptación ejercita directamente. Cada línea tiene su prueba en la tarea que posee el código.

1. **Petición sin header de empresa** (`X-Business-Unit-Id` ausente o inválido): el middleware `businessScope` responde su error (400 o 404, según el middleware) y el controlador nunca lee; jamás un 200 con un default ajeno. → spec funcional, **Task 3** (medir el status exacto en la primera corrida y fijarlo en el assert).
2. **Rol con solo `gestion`** (y el bypass de `root`/`super-administrador`/`owner`): el helper concede GET y PUT sin permisos granulares; CA-9 solo cubre el 403 de quien no tiene nada. → spec funcional, **Task 3** (una prueba con un rol concedido solo `gestion`; el bypass de `root` ya lo ejercita el happy path).
3. **`updatedByName` con segundo apellido y `updatedAt` ISO:** el `leftJoin` arma `"{firstname} {lastname}[ {second_lastname}]"`; CA-2 solo aserta un nombre de una palabra. → spec unitario, **Task 2** (persona con `personSecondLastname`).
4. **Importe `null` vs `0` en el BO:** una respuesta `null` pinta el campo **vacío** y un campo vacío manda `null` en el PUT — nunca 0 (§15: `null` significa "sin monto propuesto"). → spec de helpers, **Task 4**.
5. **`expirationNoticeDays` en el borde de 12 meses:** 359 guarda y 360 no (CA-6 cubre 6 y 1; 12 es el default del sistema y el tope que usarán las alertas del año completo). → spec unitario, **Task 2** (validación pura, sin BD).

---

# Repo 1: `gsti-rh-api`

Rama de trabajo: `feature/VLRH-H1791306074375-parametrizar-por-empresa-la-compensacion-y-la` (ya cargada). Rutas relativas a `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-api`.

### Task 1: Cimientos tipados y de datos — catálogo, migración, modelo y constantes

**Files:**
- Modify: `app/constants/system_modules_menu/system_modules.constant.ts` (grupo `ajustes-y-configuracion`, inmediatamente después del bloque `retention-policy`, `:1136-1158`)
- Create: `database/migrations/<prefijo de `make:migration`>_create_telework_compliance_settings_table.ts`
- Create: `app/constants/telework_compliance_setting.ts`
- Create: `app/interfaces/telework_compliance_setting_interface.ts`
- Create: `app/models/telework_compliance_setting.ts`

**Interfaces:**
- Produces (Tasks 2 y 3 lo consumen; los consumidores futuros de §17 también):
  - En el catálogo: módulo `telework-settings` (path `/telework-settings`, orden 8, permisos `read`/`update`) dentro del grupo `ajustes-y-configuracion`.
  - `TELEWORK_COMPLIANCE_DEFAULTS: TeleworkComplianceValues` = `{ revalidationPeriodMonths: 12, expirationNoticeDays: 30, electricityAllowanceDefault: null, internetAllowanceDefault: null, ownEquipmentFeeDefault: null }`.
  - `MIN_REVALIDATION_MONTHS = 1`, `MAX_REVALIDATION_MONTHS = 12`, `DAYS_PER_MONTH = 30`, `MAX_ALLOWANCE = 99999999.99` — todos públicos en `app/constants/telework_compliance_setting.ts`.
  - `TeleworkComplianceValues`, `TeleworkComplianceSettingEffective` (unión discriminada por `isDefault`), `UpsertTeleworkComplianceSettingInput extends TeleworkComplianceValues` — copia textual de §9.
  - Modelo `TeleworkComplianceSetting` (tabla `telework_compliance_settings`) con las columnas de §10.

- [ ] **Step 1: Correr la línea base del guardrail de catálogo**

Run: `NODE_ENV=test node ace test unit --files="constants/"`
Expected: **139 passed, 0 failed** (línea base medida). No se edita `tests/unit/constants/system_modules_constant.spec.ts`.

- [ ] **Step 2: Agregar el módulo al catálogo y verificar**

En `system_modules.constant.ts`, dentro del grupo `ajustes-y-configuracion` (`key: 'ajustes-y-configuracion'`, `:1005`), **inmediatamente después** del bloque `retention-policy` (cierra en `:1158`) y antes de `biometric-devices`, inserta (texto del spec §8; el icono va en el estilo de los vecinos, trazo 1.75):

```ts
{
  systemModuleName: 'Ajustes de teletrabajo',
  systemModuleSlug: 'telework-settings',
  systemModuleDescription: '',
  systemModules: 1,
  systemModulePath: '/telework-settings',
  systemModuleOrder: 8,
  systemModuleActive: 1,
  systemModulePermissionEnforcementActive: true,
  systemModuleRetired: false,
  systemModuleIcon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l8 0"/><path d="M16 6l4 0"/><path d="M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 12l2 0"/><path d="M10 12l10 0"/><path d="M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 18l10 0"/><path d="M18 18l2 0"/><path d="M16 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/></svg>',
  systemModulePermissions: [
    { systemPermissionName: 'Acceder a ajustes de teletrabajo', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Editar ajustes de teletrabajo', systemPermissionSlug: 'update' },
  ],
}
```

Run: `NODE_ENV=test node ace test unit --files="constants/"`
Expected: ≥ 139 passed, **0 failed** (el spec de catálogo no se edita; si truena, el cambio está mal, no el test).

- [ ] **Step 3: Generar la migración y crear la tabla**

Run: `node ace make:migration create_telework_compliance_settings_table`
Expected: archivo nuevo con prefijo de 13 dígitos; **anota el nombre real** (va en el mensaje del commit).

Escribe la tabla con las columnas de §10 (prefijo `telework_compliance_setting_`, como el molde `1782200000000_create_retention_policies_table.ts`):

```ts
this.schema.createTable(this.tableName, (table) => {
  table.increments('telework_compliance_setting_id').notNullable()
  table.integer('business_unit_id').unsigned().notNullable()
  table.tinyint('telework_compliance_setting_revalidation_period_months').unsigned().notNullable().defaultTo(12)
  table.smallint('telework_compliance_setting_expiration_notice_days').unsigned().notNullable().defaultTo(30)
  table.decimal('telework_compliance_setting_electricity_allowance_default', 10, 2).nullable()
  table.decimal('telework_compliance_setting_internet_allowance_default', 10, 2).nullable()
  table.decimal('telework_compliance_setting_own_equipment_fee_default', 10, 2).nullable()
  table.integer('telework_compliance_setting_created_by_user_id').unsigned().notNullable()
  table.integer('telework_compliance_setting_updated_by_user_id').unsigned().notNullable()
  table.timestamp('telework_compliance_setting_created_at').notNullable()
  table.timestamp('telework_compliance_setting_updated_at').nullable()

  table.foreign('business_unit_id', 'fk_tcs_business_unit').references('business_unit_id').inTable('business_units').onDelete('CASCADE')
  table.foreign('telework_compliance_setting_created_by_user_id', 'fk_tcs_created_by_user').references('user_id').inTable('users').onDelete('RESTRICT')
  table.foreign('telework_compliance_setting_updated_by_user_id', 'fk_tcs_updated_by_user').references('user_id').inTable('users').onDelete('RESTRICT')
  table.unique(['business_unit_id'], { indexName: 'uq_tcs_business_unit' })
})
```

Sin soft delete, sin más índices (una fila por empresa; el `UNIQUE` es la red de la carrera de alta). `down()`: `dropTableIfExists`.

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`
Expected: exit 0.

Run: `ls -1 database/migrations | sort | tail -3`
Expected: la migración nueva es la **última** (orden de §10 cumplido: las de VLRH-H1790812613870 no existen aún).

- [ ] **Step 4: Constantes, interfaz y modelo**

`app/constants/telework_compliance_setting.ts`: los cuatro límites y `TELEWORK_COMPLIANCE_DEFAULTS` (valores del bloque **Interfaces**), con JSDoc en español (default virtual R2, límites R3-R5).

`app/interfaces/telework_compliance_setting_interface.ts`: copia textual de §9 (`TeleworkComplianceValues`, `TeleworkComplianceSettingEffective` como unión discriminada, `UpsertTeleworkComplianceSettingInput`). Sin aplanar la unión y sin campos opcionales (§15).

`app/models/telework_compliance_setting.ts`: `compose(BaseModel, withBusinessUnitScope())`, tabla `telework_compliance_settings`, **sin** `SoftDeletes`; columnas espejo del molde `retention_policy.ts` con el prefijo propio; los tres importes con `@column({ consume: (v) => (v === null ? null : Number(v)) })`; `businessUnitId` con `serializeAs: null`; `created_at`/`updated_at` con `autoCreate`/`autoUpdate`; `belongsTo` a `BusinessUnit` y `User` (creador/último editor), como el molde. JSDoc en español citando VLRH-H1791306074375.

Run: `npx tsc --noEmit`
Expected: exit 0 (línea base medida: 0 errores).

- [ ] **Step 5: Commit**

```bash
git add app/constants/system_modules_menu/system_modules.constant.ts database/migrations/*_create_telework_compliance_settings_table.ts app/constants/telework_compliance_setting.ts app/interfaces/telework_compliance_setting_interface.ts app/models/telework_compliance_setting.ts
git commit -m "feat: agrega el módulo y la tabla de ajustes de teletrabajo por empresa

Refs: VLRH-H1791306074375"
```

---

### Task 2: Servicio — `getEffective` sin contexto y `upsert` con candado

**Files:**
- Create: `app/constants/telework_compliance_setting_error_codes.ts`
- Create: `app/exceptions/telework_compliance_setting_service_error.ts`
- Create: `app/services/telework_compliance_setting_service.ts`
- Test: `tests/unit/services/telework_compliance_setting_service.spec.ts`

**Interfaces:**
- Consumes: Task 1 (modelo, constantes, interfaz).
- Produces (Task 3 y los consumidores de §17):
  - `TELEWORK_COMPLIANCE_SETTING_ERROR_CODES` = `{ VAL_INPUT: 'TWS.VAL.001', INVALID_REVALIDATION_MONTHS: 'TWS.VAL.002', INVALID_NOTICE_DAYS: 'TWS.VAL.003', INVALID_ALLOWANCE: 'TWS.VAL.004', FORBIDDEN: 'TWS.AUTH.001', UNRESOLVED_SCOPE: 'TWS.AUTH.002', SYS_UNHANDLED: 'TWS.SYS.001' } as const` + su tipo.
  - `TeleworkComplianceSettingServiceError` — espejo de `RetentionPolicyServiceError` (`app/exceptions/retention_policy_service_error.ts`) **más** una propiedad readonly `field?: string` y la fábrica `static withField(messageKey, errorCode, key, field)` que fija status 422 y `field` (así el 422 lleva `data: { field }` sin acoplar el dominio al HTTP). `withMessageKey(i18nKey, code, status, key)` queda igual al molde.
  - `TeleworkComplianceSettingService.getEffective(businessUnitId: number): Promise<TeleworkComplianceSettingEffective>`.
  - `TeleworkComplianceSettingService.upsert(input: UpsertTeleworkComplianceSettingInput, businessUnitId: number, actorUserId: number): Promise<TeleworkComplianceSettingEffective>`.

- [ ] **Step 1: Escribir el spec unitario que falla**

`tests/unit/services/telework_compliance_setting_service.spec.ts`, molde de `tests/functional/telework_policy.spec.ts` para los fixtures (actores con email único por timestamp, `ensureRole` de `#tests/helpers/ensure_role`, empresa activa con `BusinessUnit.query().where('business_unit_active', 1).firstOrFail()`, cleanup explícito en `group.each.teardown`). **Cada prueba abre con su bloque `Objetivo:`** (regla de las suites del repo). `getEffective` se llama **directamente** (japa corre fuera de HTTP: esa es la prueba de CA-10); lo que toca el modelo (`upsert` y los conteos de verificación) va envuelto en `TenantContext.run([businessUnitId], …)` para que el mixin no lance. Grupos:

**`'TeleworkComplianceSettingService — default virtual y lectura (CA-1, CA-10)'`**
1. `'CA-1: empresa sin fila recibe el default virtual y la tabla sigue en 0'` — `getEffective(buId)` → `deepEqual` con `{ isDefault: true, teleworkComplianceSettingId: null, revalidationPeriodMonths: 12, expirationNoticeDays: 30, electricityAllowanceDefault: null, internetAllowanceDefault: null, ownEquipmentFeeDefault: null, updatedAt: null, updatedByName: null }`; y `db.from('telework_compliance_settings').where('business_unit_id', buId).count()` sigue en `'0'`.
2. `'CA-10: getEffective corre sin TenantContext ni HttpContext y por empresa'` — la misma llamada hecha **sin** envolver; crea una fila para A (via `upsert` envuelto) y contrasta A (`isDefault: false`) contra B sin fila (`isDefault: true`); ninguna llamada lanza `TenantContextMissingException`.
3. `'CA-10: ids no enteros o <= 0 lanzan alcance-no-resuelto sin consultar'` — `getEffective(0)`, `getEffective(-1)`, `getEffective(1.5)` → cada una `rejects` con `TeleworkComplianceSettingServiceError` cuyo `key` es `'alcance-no-resuelto'`, `errorCode` `'TWS.AUTH.002'` y `httpStatus` 403 (aserta antes de consultar: con `1.5` no hay fila que buscar).

**`'TeleworkComplianceSettingService — validación de reglas 3 a 5 (CA-5, CA-6, CA-7, CA-8)'`** (todas via `upsert` envuelto; los rechazos ocurren antes de abrir transacción):
4. `'CA-5: periodicidad fuera de 1-12 o no entera'` — `revalidationPeriodMonths` en `0`, `13` y `6.5` → `rejects` con `key 'periodicidad-de-revalidacion-invalida'`, `errorCode 'TWS.VAL.002'`, `field 'revalidationPeriodMonths'`.
5. `'CA-6: ventana de aviso fuera de contrato'` — `6` con `200`, `180` y `0`; y `1` con `30` → `key 'ventana-de-aviso-invalida'`, `'TWS.VAL.003'`, `field 'expirationNoticeDays'`. Con `6` y `179`, y con `1` y `29` → resuelve.
6. `'Review Focus 5: el borde de 12 meses'` — `12` con `359` resuelve; `12` con `360` → `'TWS.VAL.003'`.
7. `'CA-7: monto negativo, de más de dos decimales o sobre el tope'` — `internetAllowanceDefault` en `-1`, `350.555` y `100000000` → `key 'monto-invalido'`, `'TWS.VAL.004'`, `field 'internetAllowanceDefault'`; con `99999999.99` resuelve.
8. `'CA-8: el primer campo inválido en el orden fijo gana'` — `upsert({ revalidationPeriodMonths: 13, expirationNoticeDays: 0, electricityAllowanceDefault: -1, … })` → reporta `revalidationPeriodMonths` (`'TWS.VAL.002'`), no ningún otro.
9. `'CA-3: los centavos no se pierden'` — `upsert` con `electricityAllowanceDefault: 0.29` → `getEffective` devuelve `0.29` como `number` (no `"0.29"`, no `0.28999…`).

**`'TeleworkComplianceSettingService — escritura (CA-2, CA-13)'`**
10. `'CA-2: el alta crea una fila y la edición reusa la misma'` — primer `upsert` completo (350/500/250, 6, 15) → `isDefault: false`, `teleworkComplianceSettingId` numérico, `updatedAt` ISO, `updatedByName` el nombre del actor; `count` = 1; `created_by` = actor. Segundo `upsert` con `internetAllowanceDefault: null` → `count` sigue en 1, `created_by` intacto, `updated_by` = actor.
11. `'CA-13: dos upsert concurrentes dejan una sola fila'` — `Promise.all([upsert(…), upsert(…)])` sobre una empresa sin fila → ambos resuelven (sin `ER_DUP_ENTRY`), `count` = 1.
12. `'Review Focus 3: updatedByName arma nombre y segundo apellido, updatedAt ISO'` — actor con `personSecondLastname` → `updatedByName` = `"{personFirstname} {personLastname} {personSecondLastname}"`; `updatedAt` matchea `/^\d{4}-\d{2}-\d{2}T/`.

**`'TeleworkComplianceSettingService — contrato de tipos (CA-12)'`** (dentro del mismo archivo):
13. `'CA-12: la unión discriminada exige estrechar'` — un bloque con `// @ts-expect-error` que asigne `teleworkComplianceSettingId` (declarado `number`) desde un `TeleworkComplianceSettingEffective` con `isDefault: true` — no compila sin estrechar; y el estrechado (`if (!eff.isDefault) …`) sí. Si `npx tsc --noEmit` se queja de un `@ts-expect-error` sin error, el contrato se aplanó: la prueba falló.

- [ ] **Step 2: Correr el spec y verificar que falla**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed && NODE_ENV=test node ace test unit --files="tests/unit/services/telework_compliance_setting_service.spec.ts"`
Expected: FAIL — no compila: `TeleworkComplianceSettingService` y su error no existen.

- [ ] **Step 3: Implementar códigos, excepción y servicio**

`telework_compliance_setting_error_codes.ts` espejo de `telework_policy_error_codes.ts` con las siete llaves del bloque **Interfaces** (JSDoc en español, prefijo TWS = TeleWork Settings).

`telework_compliance_setting_service_error.ts` espejo de `retention_policy_service_error.ts` + `field` y `withField` (bloque **Interfaces**).

`telework_compliance_setting_service.ts`, en este orden exacto:

1. `private assertScopeResolved(businessUnitId: number): void` — `!Number.isInteger(businessUnitId) || businessUnitId <= 0` ⇒ `TeleworkComplianceSettingServiceError.withMessageKey('telework_settings.forbidden_scope', UNRESOLVED_SCOPE, 403, 'alcance-no-resuelto')`.
2. `private validateValues(input): void` — en el **orden fijo** R4 → R5 → R3 (luz, internet, equipo): periodicidad no entera o fuera de 1-12 ⇒ `withField('telework_settings.invalid_revalidation', INVALID_REVALIDATION_MONTHS, 'periodicidad-de-revalidacion-invalida', 'revalidationPeriodMonths')`; aviso no entero, `< 1` o `>= revalidationPeriodMonths * DAYS_PER_MONTH` ⇒ `withField(…, INVALID_NOTICE_DAYS, 'ventana-de-aviso-invalida', 'expirationNoticeDays')`; cada monto no nulo con `< 0`, `> MAX_ALLOWANCE` o `Math.abs(v * 100 - Math.round(v * 100)) >= 1e-6` ⇒ `withField('telework_settings.invalid_allowance', INVALID_ALLOWANCE, 'monto-invalido', <campo>)`. **Nada se escribe si algo falla** (R6): la validación corre antes de abrir la transacción.
3. `async getEffective(businessUnitId: number): Promise<TeleworkComplianceSettingEffective>` — `assertScopeResolved` y luego **una sola** consulta, sin modelo ni mixin (CA-11: el `grep` del spec solo puede encontrar `TeleworkComplianceSetting.query|find` dentro de `upsert`):

```ts
const row = await db
  .from('telework_compliance_settings')
  .leftJoin('users', 'users.user_id', 'telework_compliance_settings.telework_compliance_setting_updated_by_user_id')
  .leftJoin('people', 'people.person_id', 'users.person_id')
  .where('telework_compliance_settings.business_unit_id', businessUnitId)
  .first()
```

   Sin fila ⇒ `{ ...TELEWORK_COMPLIANCE_DEFAULTS, isDefault: true, teleworkComplianceSettingId: null, updatedAt: null, updatedByName: null }` (garantía §9.3: nunca crea fila, nunca lanza por ausencia, no valida que la empresa exista). Con fila ⇒ `isDefault: false` + `teleworkComplianceSettingId` + valores (importes `Number(v)`, `null` se conserva), `updatedAt = row.telework_compliance_setting_updated_at instanceof Date ? …toISOString() : null`, `updatedByName` con los tres apellidos de `people` (Review Focus 3: `"{person_firstname} {person_lastname}[ {person_second_lastname}]"`, sin el espacio extra cuando el segundo apellido es nulo). **Garantía §9.5:** el servicio NO verifica permisos de BO — el permiso (`read`/`update`) lo exige solo el controller; los consumidores de servidor pasan el `businessUnitId` **del registro que procesan**, ya escopeado por ellos.
4. `async upsert(input, businessUnitId, actorUserId)` — `assertScopeResolved`, `validateValues(input)`, y después `db.transaction(async (trx) => { … })`: `await trx.from('business_units').where('business_unit_id', businessUnitId).forUpdate().first()` (el candado de la carrera, CA-13), luego `TeleworkComplianceSetting.query({ client: trx }).where('business_unit_id', businessUnitId).first()` — existe ⇒ `merge` con los cinco valores + `updated_by` = actor y `save`; no existe ⇒ `create` con `created_by` = actor. Al salir de la transacción, `return this.getEffective(businessUnitId)` (devuelve el contrato completo, incluido el nombre).

- [ ] **Step 4: Correr el spec y verificar que pasa**

Run: `NODE_ENV=test node ace test unit --files="tests/unit/services/telework_compliance_setting_service.spec.ts"`
Expected: PASS (las 13 pruebas).

Run: `npx tsc --noEmit`
Expected: exit 0 — el bloque `@ts-expect-error` de CA-12 compila.

- [ ] **Step 5: Commit**

```bash
git add app/constants/telework_compliance_setting_error_codes.ts app/exceptions/telework_compliance_setting_service_error.ts app/services/telework_compliance_setting_service.ts tests/unit/services/telework_compliance_setting_service.spec.ts
git commit -m "feat: agrega el servicio de ajustes de teletrabajo con lectura sin contexto

Refs: VLRH-H1791306074375"
```

---

### Task 3: Superficie HTTP — validador, permisos, controlador, rutas e i18n

**Files:**
- Create: `app/validators/telework_compliance_setting.ts`
- Create: `app/helpers/telework_compliance_setting_api_error.ts`
- Create: `app/controllers/telework_compliance_setting_controller.ts`
- Modify: `start/routes/nom037_routes.ts` (grupo nuevo **al final** del archivo)
- Modify: `resources/langs/es.json`
- Modify: `resources/langs/en.json`
- Test: `tests/unit/routes/nom037_telework_settings_scope_routes.spec.ts`
- Test: `tests/functional/telework_compliance_settings.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`getEffective`, `upsert`, `TeleworkComplianceSettingServiceError`, códigos TWS.*); `assertComplianceRepsePermission(ctx, moduleSlug, action, forbidden)` de `#helpers/compliance_repse_rbac` con `MODULE_SLUG = 'telework-settings'` y `RBAC_FORBIDDEN = { errorCode: TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.FORBIDDEN, i18nPrefix: 'telework_settings' }` (patrón de `telework_policy.controller.ts:14-18,1193-1195`).
- Produces: `GET`/`PUT /api/nom037/telework-settings` → `telework_compliance_setting_controller.show` / `.update`; response 200 `{ type: 'success', title, message, data: TeleworkComplianceSettingEffective }`; errores con el cuerpo del bloque *Global Constraints → Errores*.

- [ ] **Step 1: Escribir el spec de rutas que falla (CA-14)**

`tests/unit/routes/nom037_telework_settings_scope_routes.spec.ts`, molde de `tests/unit/routes/system_setting_show_scope_routes.spec.ts` (lee `start/routes/nom037_routes.ts` con `readFileSync`). Tres pruebas:

1. `'el grupo de telework-settings monta prefix, auth y businessScope en ese orden'` — el contenido compactado (`content.replace(/\s+/g, '')`) incluye `"router.group("` … `router.get('/nom037/telework-settings','#controllers/telework_compliance_setting_controller.show')"` y `router.put('/nom037/telework-settings','#controllers/telework_compliance_setting_controller.update')` … `".prefix('/api').use(middleware.auth()).use(middleware.businessScope())"` (la cadena del grupo nuevo, con las tres llamadas encadenadas al final del archivo).
2. `'no hay ruta de borrado para el prefijo de telework-settings'` — `assert.isFalse(/router\.delete\(\s*'\/nom037\/telework-settings/.test(content))`.
3. `'los grupos existentes conservan su montaje'` — el grupo de `telework-policy` sigue trayendo `.prefix('/api')` + `.use(middleware.auth())` + `.use(middleware.businessScope())` y el de `telework-locations` su `.use(middleware.businessScope())`.

- [ ] **Step 2: Escribir el spec funcional que falla**

`tests/functional/telework_compliance_settings.spec.ts`, molde de `tests/functional/telework_policy.spec.ts`: `createTestActor(roleSlug, emailPrefix)` (persona + usuario con email único por timestamp, `userEmailType: 'institutional'`, contraseña `'TeleworkSettingsTest123!'`), `getPrimaryBusinessUnit()`, cleanup en `group.each.teardown` (detach de empresas, delete de settings de la empresa de prueba con `db.from('telework_compliance_settings').where('business_unit_id', bu).delete()` **antes** de borrar usuarios, y las concesiones de `grantModuleAction` solo las que creó). Helpers: `getSettings(client, user, bu)` y `putSettings(client, user, bu, body)` con `.loginAs(user)` y `.header('X-Business-Unit-Id', bu.businessUnitPublicId)`; `countSettings(buId)` con `db.from`. `TEST_PASSWORD`, y `ensureRole` + `grantModuleAction` (import de `./employees/sensitive_read_by_category_support.js`). **Cada prueba abre con su bloque `Objetivo:`.** Grupos:

**`'telework-settings — autenticación (401)'`**: GET y PUT sin sesión → 401.

**`'telework-settings — permisos (CA-9, Review Focus 1 y 2)'`** (actor `empleado` — sin el módulo — con sesión y header):
1. `'CA-9: sin permiso de lectura responde 403 con el errorCode del helper'` — GET → 403 con `{ type: 'error', key: 'sin-permiso', errorCode: 'TWS.AUTH.001' }` (el helper responde con su forma propia: `title`, `message`, `key`, `errorCode`, `data: null`, sin `detail`).
2. `'CA-9: con read sin update, GET responde 200 y PUT 403 sin escribir'` — rol con `grantModuleAction(role, 'telework-settings', 'read')`: GET → 200 (default virtual); PUT → 403 `sin-permiso` + `errorCode 'TWS.AUTH.001'`; `countSettings(bu)` sigue en 0.
3. `'Review Focus 2: un rol con solo gestion puede leer y guardar'` — rol con solo `'gestion'`: GET → 200 y PUT válido → 200.
4. `'Review Focus 1: sin header de empresa responde el error del middleware businessScope'` — `client.get('/api/nom037/telework-settings').loginAs(user)` **sin** header → el status y cuerpo que devuelve hoy el middleware (medirlo en la primera corrida: 400 o 404) — asertar ese status y `assert.notEqual(status, 200)`; la tabla queda en 0 filas nuevas.

**`'telework-settings — contrato de lectura y escritura (CA-1 a CA-8)'`** (actor `root` — bypass del helper — con sesión y header):
5. `'CA-1: GET sin fila devuelve el default virtual y no crea nada'` — 200 con `type: 'success'` y `data` deepEqual al default (12/30/`null`×3/`isDefault: true`/`teleworkComplianceSettingId: null`/`updatedAt: null`/`updatedByName: null`); `countSettings` = 0. Abrir la pantalla no guarda nada.
6. `'CA-2: PUT válido crea, y el segundo PUT edita la misma fila'` — PUT `{ revalidationPeriodMonths: 6, expirationNoticeDays: 15, electricityAllowanceDefault: 350, internetAllowanceDefault: 500, ownEquipmentFeeDefault: 250 }` → 200 con esos valores como `number`, `isDefault: false`, `teleworkComplianceSettingId` numérico, `updatedAt` ISO, `updatedByName` no vacío; `countSettings` = 1. Segundo PUT con `internetAllowanceDefault: null` → 200, `countSettings` sigue en 1, `data.internetAllowanceDefault` = `null`, `created_by` intacto (leer la fila cruda con `db.from`) y `updated_by` = actor.
7. `'CA-3: 0.29 redondea limpio en el round-trip'` — PUT con `electricityAllowanceDefault: 0.29` → GET devuelve `0.29` number.
8. `'CA-4: el aislamiento entre empresas se respeta'` — crea una segunda empresa (`new BusinessUnit()` con `businessUnitPublicId: randomUUID()`, `name`/`slug`/`legalName` únicos, `businessUnitActive: 1`, `businessUnitOrigin` y `businessUnitTimezone` — patrón de `tests/functional/position_level.spec.ts`), adjunta ambas al actor: GET con header de B → default virtual de B (12/30/null); PUT **desde B** con `businessUnitId` de A en el body → crea **solo** la fila de B (el campo del body se ignora), y la fila de A queda intacta. Teardown: borrar la empresa B creada.
9. `'CA-5: periodicidad inválida no cambia lo guardado'` — con la fila de CA-2 puesta: PUT con `revalidationPeriodMonths` `0`, `13` y `6.5` → 422 `{ title: 'Periodicidad de revalidación inválida', key: 'periodicidad-de-revalidacion-invalida', code: 'TWS.VAL.002', data: { field: 'revalidationPeriodMonths' } }`; GET posterior devuelve los valores de CA-2 sin cambio.
10. `'CA-6: ventana de aviso inválida por campo'` — `6` con `200`/`180`/`0`, y `1` con `30` → 422 `key 'ventana-de-aviso-invalida'`, `'TWS.VAL.003'`, `data.field 'expirationNoticeDays'`; con `6`+`179` y `1`+`29` → 200.
11. `'CA-7: monto inválido por campo, y el tope guarda'` — `internetAllowanceDefault` en `-1`, `350.555`, `100000000` → 422 `key 'monto-invalido'`, `'TWS.VAL.004'`, `data.field 'internetAllowanceDefault'`, y el `detail` nombra el campo; nada se guarda. Con `99999999.99` → 200.
12. `'CA-8: entrada mal formada responde entrada-invalida'` — PUT sin la llave `ownEquipmentFeeDefault` → 422 `key 'entrada-invalida'`, `'TWS.VAL.001'`; PUT con `revalidationPeriodMonths: 'seis'` → 422 `'TWS.VAL.001'`. Con dos campos mal a la vez, gana el primero del orden (periodicidad antes que aviso).

- [ ] **Step 3: Correr ambos specs y verificar que fallan**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed && NODE_ENV=test node ace test unit --files="tests/unit/routes/nom037_telework_settings_scope_routes.spec.ts"`
Expected: FAIL — la cadena del grupo nuevo no está en `nom037_routes.ts`.

Run: `NODE_ENV=test node ace test functional --files="telework_compliance_settings"`
Expected: FAIL — GET responde 404 de router (la ruta no existe).

- [ ] **Step 4: Implementar el validador**

`app/validators/telework_compliance_setting.ts` (molde `retention_policy.ts`; **sin** `withoutDecimals`, ver drift 2 del encabezado):

```ts
export const upsertTeleworkComplianceSettingValidator = vine.compile(
  vine.object({
    revalidationPeriodMonths: vine.number(),
    expirationNoticeDays: vine.number(),
    electricityAllowanceDefault: vine.number().nullable(),
    internetAllowanceDefault: vine.number().nullable(),
    ownEquipmentFeeDefault: vine.number().nullable(),
  })
)
export type UpsertTeleworkComplianceSettingPayload = Awaited<
  ReturnType<typeof upsertTeleworkComplianceSettingValidator.validate>
>
```

- [ ] **Step 5: Implementar el resolvedor y el controlador**

`app/helpers/telework_compliance_setting_api_error.ts` — espejo de `retention_policy_api_error.ts` con dos desvíos: el `E_VALIDATION_ERROR` responde **422** (no 400) con `errorCode VAL_INPUT` y `key 'entrada-invalida'`, y el resultado copia el campo: `data: resolved.field ? { field: resolved.field } : null`, con `field` extraído del `TeleworkComplianceSettingServiceError`. El título traduce `telework_settings.title` (fallback `'Ajustes de teletrabajo'`); `key`/`status`/`detail` del error; lo no tipado → `SYS_UNHANDLED` con el status de entrada.

`app/controllers/telework_compliance_setting_controller.ts` — molde `retention_policy_controller.ts` con el permiso del helper en lugar del `checkPermission` local:
- `private async assertHasPermission(ctx, action: 'read' | 'update')` = `assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)` — devuelve `false` ya habiendo respondido 403.
- `async show(ctx)`: `assertHasPermission(ctx, 'read')` ⇒ return; `businessUnitId = ctx.businessUnitScope[0]`; `new TeleworkComplianceSettingService().getEffective(businessUnitId)`; 200 `{ type: 'success', title: i18n.formatMessage('telework_settings.title'), message: i18n.formatMessage('telework_settings.get_success'), data: result }`; catch → `respondError(error, response, 500, i18n)`.
- `async update(ctx)`: `assertHasPermission(ctx, 'update')`; `request.validateUsing(upsertTeleworkComplianceSettingValidator)`; `service.upsert(payload, ctx.businessUnitScope[0], ctx.auth.user!.userId)`; 200 con `telework_settings.upsert_success`; catch → `respondError(error, response, 500, i18n)`.
- `respondError` espejo de `retention_policy_controller.ts:19-36` (cuerpo `{ type, title, message, key, detail, code, data }`).
- Bloques `@swagger` para GET y PUT (molde de los del retention, con `X-Business-Unit-Id` y los cuerpos de §11).

- [ ] **Step 6: Publicar las rutas**

Al **final** de `start/routes/nom037_routes.ts`, grupo nuevo sin tocar los existentes:

```ts
router
  .group(() => {
    router.get(
      '/nom037/telework-settings',
      '#controllers/telework_compliance_setting_controller.show'
    )
    router.put(
      '/nom037/telework-settings',
      '#controllers/telework_compliance_setting_controller.update'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 7: Agregar los textos i18n**

En `resources/langs/es.json` (y su espejo en `en.json`): bloque raíz `telework_settings` junto al de `telework_policy` (`es.json:2912`), y las cuatro claves planas junto a `telework_policy_forbidden_*` (`:2968-2971`). ES verbatim:

```json
"telework_settings": {
  "title": "Ajustes de teletrabajo",
  "get_success": "Ajustes de teletrabajo obtenidos correctamente.",
  "upsert_success": "Ajustes de teletrabajo guardados correctamente.",
  "val_input": "Los datos enviados no son válidos.",
  "invalid_revalidation": "La periodicidad de revalidación debe ser un número entero de meses entre 1 y 12.",
  "invalid_notice": "La ventana de aviso debe ser un número entero de días, mayor o igual a 1 y menor que los meses de periodicidad multiplicados por 30.",
  "invalid_allowance": "Los montos deben ser mayores o iguales a cero, con dos decimales como máximo, y no mayores a 99999999.99.",
  "forbidden_scope": "No se pudo resolver la empresa para consultar los ajustes de teletrabajo."
},
"telework_settings_forbidden_read_title": "Sin permiso de consulta",
"telework_settings_forbidden_read_message": "No tienes permiso para consultar los ajustes de teletrabajo.",
"telework_settings_forbidden_write_title": "Sin permiso",
"telework_settings_forbidden_write_message": "No tienes permiso para editar los ajustes de teletrabajo."
```

(EN: traducción fiel, tono del bloque `telework_policy` de `en.json`.)

- [ ] **Step 8: Correr los specs y verificar que pasan**

Run: `NODE_ENV=test node ace test unit --files="tests/unit/routes/nom037_telework_settings_scope_routes.spec.ts"`
Expected: PASS (3 pruebas).

Run: `NODE_ENV=test node ace test functional --files="telework_compliance_settings"`
Expected: PASS (las 14 pruebas de los cuatro grupos: 2 de 401, 4 de permisos, 8 de contrato).

- [ ] **Step 9: Regresión del guardrail y del catálogo**

Run: `NODE_ENV=test node ace test unit --files="constants/"`
Expected: ≥ 139 passed, **0 failed** (sin editar `tests/unit/constants/system_modules_constant.spec.ts`).

Run: `npx tsc --noEmit && ./node_modules/.bin/eslint .`
Expected: ambos exit 0.

- [ ] **Step 10: Commit**

```bash
git add app/validators/telework_compliance_setting.ts app/helpers/telework_compliance_setting_api_error.ts app/controllers/telework_compliance_setting_controller.ts start/routes/nom037_routes.ts resources/langs/es.json resources/langs/en.json tests/unit/routes/nom037_telework_settings_scope_routes.spec.ts tests/functional/telework_compliance_settings.spec.ts
git commit -m "feat: expone los ajustes de teletrabajo en el API de NOM-037

Refs: VLRH-H1791306074375"
```

---

# Repo 2: `gsti-rh-bo`

Rama de trabajo: la misma `feature/VLRH-H1791306074375-parametrizar-por-empresa-la-compensacion-y-la` (ya cargada). Rutas relativas a `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-bo`.

### Task 4: Dominio, locales y repositorio del slice `telework-settings`

**Files:**
- Create: `pages/telework-settings/domain/telework-settings.const.ts`
- Create: `pages/telework-settings/domain/telework-settings.interface.ts`
- Create: `pages/telework-settings/domain/telework-settings.helpers.ts`
- Create: `pages/telework-settings/domain/locales/telework-settings.es.json`
- Create: `pages/telework-settings/domain/locales/telework-settings.en.json`
- Create: `pages/telework-settings/infrastructure/telework-settings.repository.ts`
- Test: `tests/pages/telework-settings/telework-settings.helpers.spec.ts`

**Interfaces:**
- Consumes: el API de Task 3 (`GET`/`PUT /nom037/telework-settings`, envoltura `{ type, title, message, data }`, 422 con `data.field`).
- Produces (Task 5 consume):
  - `TELEWORK_SETTINGS_MODULE_SLUG = 'telework-settings'` y los límites espejo: `TELEWORK_SETTINGS_DEFAULT_MONTHS = 12`, `TELEWORK_SETTINGS_DEFAULT_NOTICE_DAYS = 30`, `MIN_REVALIDATION_MONTHS = 1`, `MAX_REVALIDATION_MONTHS = 12`, `DAYS_PER_MONTH = 30`, `MAX_ALLOWANCE = 99999999.99`.
  - `TeleworkSettings` (respuesta: los cinco valores + `isDefault` + `teleworkComplianceSettingId: number | null` + `updatedAt: string | null` + `updatedByName: string | null`) y `TeleworkSettingsForm` (los cinco valores, montos `number | null`).
  - `makeDefaultTeleworkSettings(): TeleworkSettings` (default virtual).
  - `validateTeleworkSettingsForm(form): { valid: boolean; field?: string; errorKey?: string }` — espejo de R3-R5 **con el mismo orden de campos del API**.
  - `mapTeleworkSettingsResponse(raw): TeleworkSettings` — importes `Number(v)` / `null`, jamás `?? 0` (Review Focus 4).
  - `resolveTeleworkSettingsError(error): { field: string | null; errorKey: string }` — de un 422 del API saca el campo (`data.field`) y la clave i18n; red/5xx → genéricas.
  - `fetchTeleworkSettings(params: { apiBasePath; authToken })` y `upsertTeleworkSettings(params: { apiBasePath; authToken } & TeleworkSettingsForm)` — envuelven `$fetch` con `Authorization`, mapean `response.data` con `mapTeleworkSettingsResponse`; el GET **siempre** responde 200 (default virtual): sin rama de 404 (desviación del molde, que sí la tiene).

- [ ] **Step 1: Escribir el spec de helpers que falla**

`tests/pages/telework-settings/telework-settings.helpers.spec.ts` (`describe`/`it` de Vitest; cada `it` con su bloque `Objetivo:`):

1. `'el default virtual es 12 meses, 30 días y los tres montos null'` — `makeDefaultTeleworkSettings()` → `isDefault: true`, `revalidationPeriodMonths: 12`, `expirationNoticeDays: 30`, los tres montos `null`, `teleworkComplianceSettingId/updatedAt/updatedByName` en `null`.
2. `'el mapeo de respuesta conserva números y null, jamás 0'` (Review Focus 4) — `mapTeleworkSettingsResponse` con montos `350`/`null`/`'250.5'` (string, como lo manda el JSON crudo) → `350`/`null`/`250.5` como `number`, y **nunca** `?? 0`.
3. `'la validación en cliente replica las reglas del API por campo'` — `revalidationPeriodMonths: 0 | 13 | 6.5` → `{ field: 'revalidationPeriodMonths', … }`; `6` con aviso `200 | 180 | 0` y `1` con `30` → `expirationNoticeDays`; `12` con `359` válido y `12` con `360` inválido (Review Focus 5); monto `-1` → su campo; todo válido → `{ valid: true }`.
4. `'el orden de campos coincide con el API'` — periodicidad y aviso inválidos a la vez → reporta `revalidationPeriodMonths`.
5. `'un 422 del API se traduce a campo y clave i18n'` — `resolveTeleworkSettingsError` sobre un error con `key: 'monto-invalido'` y `data: { field: 'internetAllowanceDefault' }` → `{ field: 'internetAllowanceDefault', errorKey: 'telework_settings.errors.invalid_allowance' }`; sin `data.field` → `field: null`; red (`status === 0`) y 5xx → sus claves genéricas.

- [ ] **Step 2: Correr el spec y verificar que falla**

Run: `./node_modules/.bin/vitest run tests/pages/telework-settings/telework-settings.helpers.spec.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar const, interfaz, helpers, locales y repositorio**

- `telework-settings.const.ts`: slug y los seis límites del bloque **Interfaces** (los valores son los del API: 12, 30, 1, 12, 30, 99999999.99).
- `telework-settings.interface.ts`: `TeleworkSettings`, `TeleworkSettingsForm`, `TeleworkSettingsPermissions { canRead; canUpdate }`.
- `telework-settings.helpers.ts`: `makeDefaultTeleworkSettings`, `validateTeleworkSettingsForm` (orden fijo; enteros con `Number.isInteger`; dos decimales con `Math.abs(v * 100 - Math.round(v * 100)) >= 1e-6`), `mapTeleworkSettingsResponse` (lista blanca de llaves), `resolveTeleworkSettingsError` — molde `retention-policy.helpers.ts`, importando `isApiError`/`parseApiError` de `~/resources/scripts/utils/apiError`.
- `telework-settings.repository.ts`: molde `retention-policy.repository.ts` con el endpoint `/nom037/telework-settings`, los dos métodos, `mapTeleworkSettingsResponse` y **sin** la rama de 404 (el API responde 200 con default virtual).
- `telework-settings.es.json` (y su traducción `en`): claves con los rótulos que fija §12 — `page.title "Ajustes de teletrabajo"`, `page.intro_title`, `page.intro_body`, `page.forbidden_module "No tienes acceso"`, `page.missing_tenant "Selecciona una empresa"`, `status.system_defaults "Valores del sistema"`, `status.configured "Configurada"`, `form.allowance_group "Compensación por defecto (MXN al mes)"`, `form.electricity_label "Luz"`, `form.internet_label "Internet"`, `form.own_equipment_label "Cuota por uso de equipo propio"`, `form.allowance_hint "Se proponen al capturar la adenda y se ajustan por colaborador."`, `form.revalidation_group "Lista de verificación"`, `form.revalidation_label "Revalidar cada"`, `form.revalidation_suffix "meses"`, `form.notice_label "Avisar antes del vencimiento"`, `form.notice_suffix "días"`, `form.checklist_hint "Aplica a las listas que se registren desde ahora."`, `form.updated_by "Última modificación por {name} el {date}"`, `form.save "Guardar"`, `toast.save_summary`, `toast.save_success "Ajustes guardados"`, `errors.{load_failed, invalid_revalidation, invalid_notice, invalid_allowance, entrada_invalida, network, server, unexpected}`, `actions.retry "Reintentar"`. Misma estructura de bloques que `retention-policy.es.json`.

- [ ] **Step 4: Correr el spec y verificar que pasa**

Run: `./node_modules/.bin/vitest run tests/pages/telework-settings/telework-settings.helpers.spec.ts`
Expected: PASS (5 pruebas).

Run: `./node_modules/.bin/eslint pages/telework-settings tests/pages/telework-settings`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add pages/telework-settings/domain/telework-settings.const.ts pages/telework-settings/domain/telework-settings.interface.ts pages/telework-settings/domain/telework-settings.helpers.ts pages/telework-settings/domain/locales/telework-settings.es.json pages/telework-settings/domain/locales/telework-settings.en.json pages/telework-settings/infrastructure/telework-settings.repository.ts tests/pages/telework-settings/telework-settings.helpers.spec.ts
git commit -m "feat(telework-settings): agrega el dominio y el repositorio de ajustes de teletrabajo

Refs: VLRH-H1791306074375"
```

---

### Task 5: Pantalla — permisos, orquestador y template

**Files:**
- Create: `pages/telework-settings/application/use-telework-settings-permissions.ts`
- Create: `pages/telework-settings/application/use-telework-settings.ts`
- Create: `pages/telework-settings/script.ts`
- Create: `pages/telework-settings/style.scss`
- Create: `pages/telework-settings/index.vue`
- Modify: `components/headerBreadcrumbs/domain/locales/headerBreadcrumbs.es.json`
- Modify: `components/headerBreadcrumbs/domain/locales/headerBreadcrumbs.en.json`
- Test: `tests/pages/telework-settings/use-telework-settings-permissions.spec.ts`

**Interfaces:**
- Consumes: Task 4 (const/interface/helpers/repository); `useMyGeneralStore` (`isRoot`, `getAccess(slug)`, `workBusinessUnitPublicId`), `useAuth().token`, `useToast`, `useI18n`, `useRuntimeConfig().public.BASE_API_PATH` (auto-imports de Nuxt, como el molde).
- Produces: la pantalla `/telework-settings` con los estados de §12.

- [ ] **Step 1: Escribir el spec de permisos que falla**

`tests/pages/telework-settings/use-telework-settings-permissions.spec.ts` (deps planas: `generalStore: { isRoot, getAccess: vi.fn() }`, molde de composables del repo). Cada `it` con su `Objetivo:`:

1. `'root tiene read y update sin consultar al catálogo'` — `isRoot: true` → `canRead`/`canUpdate` en `true` y `getAccess` **sin llamadas**.
2. `'un rol con read pero sin update queda de solo lectura'` — `getAccess` resuelve `[{ systemPermissions: { systemPermissionSlug: 'read' } }]` → `canRead: true`, `canUpdate: false`.
3. `'falla cerrado si getAccess rechaza'` — `getAccess` rechaza → `hydrate()` no lanza y deja `canRead`/`canUpdate` en `false`.

- [ ] **Step 2: Correr el spec y verificar que falla**

Run: `./node_modules/.bin/vitest run tests/pages/telework-settings/use-telework-settings-permissions.spec.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar los permisos (fallo cerrado)**

`use-telework-settings-permissions.ts` — molde `use-retention-policy-permissions.ts` con dos desvíos: hidrata `read`/**`update`** (no `write`) desde `TELEWORK_SETTINGS_MODULE_SLUG`, y `hydrate` envuelve `getAccess` en `try/catch` que deja ambos permisos en `false` (fallo cerrado, §12) — `console.error` solo con el error, sin datos del usuario.

- [ ] **Step 4: Correr el spec de permisos y verificar que pasa**

Run: `./node_modules/.bin/vitest run tests/pages/telework-settings/use-telework-settings-permissions.spec.ts`
Expected: PASS (3 pruebas).

- [ ] **Step 5: Implementar orquestador, template y estilos**

- `use-telework-settings.ts` — molde `use-retention-policy.ts`: `settings` (`ref<TeleworkSettings>` con `makeDefaultTeleworkSettings()`), `form` (`reactive<TeleworkSettingsForm>` con los defaults), `isLoading`/`isSaving`/`loadErrorKey`/`fieldError { field: string | null; errorKey: string | null }`; `loadSettings()` (GET, mapea y sincroniza el form; catch → `loadErrorKey`); `saveSettings()` (valida en cliente con `validateTeleworkSettingsForm`; si falla, `fieldError` con el campo y **conserva lo capturado**; si pasa, PUT, `settings` = respuesta, toast de éxito y `fieldError` en null; catch → `resolveTeleworkSettingsError` para pintar el 422 **bajo el campo** con el texto i18n y conservar lo capturado; `finally` limpia `isSaving` y el loader global). Sin diálogo de confirmación (no hay nada que desactivar).
- `script.ts` — molde `retention-policy/script.ts`: `mergeLocaleMessage` de los dos locales, `permissionsComposable.hydrate()` en `onMounted`, carga solo si `canRead && businessUnitId != null`, `watch` del `businessUnitId` (recarga al cambiar de empresa), `translate`/`showToast`/`setFullLoader`, y en el `return`: `canRead`, `canUpdate`, `permissionsReady`, `hasTenant`, `settings`, `form`, `isLoading`, `isSaving`, `loadErrorKey`, `fieldError`, `onSave`, `onRetry`.
- `index.vue` — molde `retention-policy/index.vue` **sin** `nom035Subnav`, con:
  - Card de introducción (título + párrafo).
  - Card `v-if="!canRead && permissionsReady"` → "No tienes acceso"; `v-else-if="canRead && !hasTenant"` → "Selecciona una empresa"; `v-else-if="… && isLoading"` → `Skeleton`; `v-else-if="… && loadErrorKey"` → mensaje + `key` + botón "Reintentar"; `v-else` el formulario.
  - Header del card del formulario con `<Tag>`: `settings.isDefault ? 'Valores del sistema' : 'Configurada'` (claves `telework_settings.status.*`).
  - Grupo "Compensación por defecto (MXN al mes)": tres `InputNumber` `mode="currency" currency="MXN" locale="es-MX"` `:min="0"`, `v-model` al campo del form (`null` permitido), `:disabled="!canUpdate || isSaving"` (como el molde), con el hint de §12.
  - Grupo "Lista de verificación": `InputNumber` "Revalidar cada" (`:min="1" :max="12"`, `suffix="meses"`) y "Avisar antes del vencimiento" (`suffix="días"`), `:disabled="!canUpdate || isSaving"`, con el hint "Aplica a las listas que se registren desde ahora."
  - `p` con `telework_settings.form.updated_by` interpolando `{ name: settings.updatedByName, date: settings.updatedAt }` **solo si `!settings.isDefault`**.
  - Error de 422: `p role="alert"` **bajo el campo** de `fieldError.field` (CA-15), con el texto de `fieldError.errorKey`.
  - Botón "Guardar" `:disabled="!canUpdate || isSaving" :loading="isSaving"` — **no se pinta** sin `update` (CA-15: UI sin ruido).
  - `<Head><Title>` con el título de la página; `<script lang="ts">` con `import Script from './script'` y `<style lang="scss" scoped>@import './style';` — sin `definePageMeta` (layout backoffice por defecto).
- `style.scss` — BEM `telework-settings-page` (molde `retention-policy/style.scss`): grid de **2 columnas desde `md`**, 1 en móvil; botón a ancho completo en móvil; nada de `nom035`.
- Breadcrumb: en `headerBreadcrumbs.es.json` agrega `"telework-settings": "Ajustes de teletrabajo"` (en orden alfabético del objeto, entre `system-settings`… según el orden existente) y en `en.json` su traducción.

- [ ] **Step 6: Correr todo lo del slice y las regresiones acotadas**

Run: `./node_modules/.bin/vitest run tests/pages/telework-settings tests/headerBreadcrumbs/breadcrumb-locales.spec.ts`
Expected: PASS (5 + 3 + 2 pruebas).

Run: `./node_modules/.bin/vitest run`
Expected: **255 archivos + los 2 nuevos, 2358 pruebas + las 8 nuevas, 0 failed** (línea base medida).

Run: `./node_modules/.bin/eslint pages/telework-settings tests/pages/telework-settings components/headerBreadcrumbs`
Expected: exit 0.

Run: `./node_modules/.bin/nuxt typecheck 2>&1 | grep -c "error TS"`
Expected: **el mismo 282 de la línea base** (cero errores nuevos y ninguno que nombre `pages/telework-settings`).

- [ ] **Step 7: Revisión visual (fuera de Vitest)**

Con el API local (Task 3) y la BD de desarrollo sembrada con `0062_system_module_seeder` (`node ace db:seed --files=database/seeders/0062_system_module_seeder.ts`), en **claro y oscuro**, **desktop y 375 px**: entrada de menú Ajustes y configuración → Ajustes de teletrabajo con el chip "Valores del sistema" y 12/30/vacíos; captura 350/500/250/6/15 y guarda → toast "Ajustes guardados", chip "Configurada" y la línea de última modificación; recarga al cambiar de empresa; un 422 pinta el mensaje **bajo el campo** correcto y conserva lo capturado; sin `update` los campos son de solo lectura y **no hay botón**; sin `read` no hay entrada de menú y la ruta muestra "No tienes acceso". Un ajuste visual de esta pantalla va en el mismo commit de este paso solo si es de este bloque.

- [ ] **Step 8: Commit**

```bash
git add pages/telework-settings/application/use-telework-settings-permissions.ts pages/telework-settings/application/use-telework-settings.ts pages/telework-settings/script.ts pages/telework-settings/style.scss pages/telework-settings/index.vue components/headerBreadcrumbs/domain/locales/headerBreadcrumbs.es.json components/headerBreadcrumbs/domain/locales/headerBreadcrumbs.en.json tests/pages/telework-settings/use-telework-settings-permissions.spec.ts
git commit -m "feat(telework-settings): agrega la pantalla de ajustes de teletrabajo

Refs: VLRH-H1791306074375"
```

---

### Task 6: Manual de QA del flujo (entrega; lo recorre una persona)

**Files:**
- Create: `docs/superpowers/plans/2026-10-07-parametrizar-compensacion-teletrabajo-qa-flujo.md` (repo `gsti-rh-api`, versionado)
- Modify (no versionado): `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts`

**Interfaces:**
- Consumes: la pantalla de Task 5 y el API de Task 3 ya verificados; las reglas de manual de QA; el catálogo real de textos del slice.
- Produces: **un solo** playbook, aunque la HU sea fullstack (API + BO): la regla `manual-qa-execution.md` («Un solo manual por historia») manda entregar el de la superficie que recorre una persona —aquí, la pantalla del BO—. Lo que únicamente se provoca por HTTP no se documenta como escenario: se declara no revisable y lo cubren las suites de Task 2 y Task 3.

- [ ] **Step 1: Leer la regla y el molde antes de redactar**

Lee `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `~/.agents/rules/manual-qa/manual-qa-execution.md` (la copia viva; no las cites de memoria). Abre `docs/superpowers/plans/2026-10-05-historial-aceptaciones-tenant-qa-flujo.md` y toma las constantes del ambiente: la URL local del BO (sin prefijo de idioma), el flujo de login tal como se ve en pantalla, el comando del seeder compartido y el dominio y la contraseña de las cuentas de prueba.

- [ ] **Step 2: Sembrar lo de esta HU en el seeder compartido**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (su sitio; **no** se versiona, nada de `git add -f`), bajo una marca reconocible (`QA Teletrabajo`): dos empresas del mismo grupo —una sin ajustes guardados y otra que se configura durante el recorrido— y tres cuentas de RH (`qa-teletrabajo-<variante>@gsti-tests.local` con la contraseña de prueba del proyecto): una con `telework-settings` completo, una con solo `read` y una sin acceso. Declara en el manual el estado inicial de esas cuentas y el orden del recorrido cuando un escenario consuma ese estado.

- [ ] **Step 3: Redactar el manual con la estructura mínima de la regla**

`…-qa-flujo.md`, lenguaje llano para quien prueba en el navegador, con la estructura de `manual-qa-frontend.md`: **0.** Problema/Solución cortos, un `Ejemplo:` cotidiano (la empresa que pagaba una cantidad distinta por cada adenda y el inspector que contrasta los documentos) y glosario solo con términos de negocio que el cuerpo no explique al usarlos; **1. Preparar** (el único comando del seeder y qué deja sembrado); **2. Usuarios** (tabla con correo, contraseña y qué es cada uno); **3. Dónde probar** (menú Ajustes y configuración → Ajustes de teletrabajo); **4. Usuario A (positivo)**; **5. Usuario B (negativo, si aplica)**; **6. Checklist** (una casilla por escenario). Escenarios, cada uno abriendo con su línea **`Objetivo:`**: la empresa nueva que ve "Valores del sistema", 12 meses y 30 días con los montos vacíos; abrir la pantalla no guarda nada; capturar y guardar los valores del criterio (350/500/250, 6, 15) y ver el chip "Configurada" con la última modificación; volver a entrar y ver lo mismo; otra empresa del grupo que sigue viendo lo suyo o el default; un monto negativo, una periodicidad de 0 o de 13, y un aviso de 200 con periodicidad de 6 → el aviso bajo el campo correcto y lo capturado sin perderse; quien solo consulta no ve el botón y sus campos son de solo lectura; quien no tiene acceso no ve la entrada de menú; el móvil a 375 px. Y una sección **Lo que no se revisa con esta base** (con su motivo, sin pasos inventados): lo que solo se provoca por HTTP —401 sin sesión, el 403 sin permiso granular, la petición sin header de empresa, el aislamiento con una empresa ajena en el cuerpo y la carrera de alta— y el consumo por la adenda, la lista de verificación y las alertas, que aún no existen.

- [ ] **Step 4: Autocomprobar contra la regla**

Run: `f=docs/superpowers/plans/2026-10-07-parametrizar-compensacion-teletrabajo-qa-flujo.md; cm=$(grep -c '^### [0-9]*\.' "$f"); ob=$(grep -c '^Objetivo:' "$f"); echo "escenarios=$cm objetivos=$ob"`
Expected: escenarios = objetivos. Textos copiados del catálogo real (`pages/telework-settings/domain/locales/`), lenguaje llano: sin rutas de archivo, TypeScript, componentes, `curl`, `jq`, endpoints ni selectores.

- [ ] **Step 5: Entregar (no recorrer)**

El manual queda **entregado**; el ejecutor **no** lo camina (regla `manual-qa-execution.md`). El recorrido lo hace una persona.

```bash
git add docs/superpowers/plans/2026-10-07-parametrizar-compensacion-teletrabajo-qa-flujo.md
git commit -m "docs: entrega el manual de QA de los ajustes de teletrabajo

Refs: VLRH-H1791306074375"
```

---

## Verificación final (fuera de las tareas)

Al cerrar las seis tareas:

- **API**, rama de la HU, `sae_pruebas` al día (`NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`):
  - `NODE_ENV=test node ace test unit --files="tests/unit/services/telework_compliance_setting_service.spec.ts"` → 13 passed (CA-1, CA-2, CA-3, CA-5 a CA-13, Review Focus 3 y 5).
  - `NODE_ENV=test node ace test unit --files="tests/unit/routes/nom037_telework_settings_scope_routes.spec.ts"` → 3 passed (CA-14).
  - `NODE_ENV=test node ace test functional --files="telework_compliance_settings"` → 14 passed (CA-1 a CA-9, Review Focus 1 y 2).
  - `NODE_ENV=test node ace test unit --files="constants/"` → ≥ 139 passed, 0 failed (guardrail intacto).
  - `npx tsc --noEmit` y `./node_modules/.bin/eslint .` → exit 0. Si la suite completa (`node ace test`) trae fallos previos no relacionados, se registran y se exige cero nuevos.
- **BO**, misma rama: `./node_modules/.bin/vitest run` → 255+2 archivos / 2358+8 pruebas en verde; `nuxt typecheck` sin errores nuevos (282 previos) y ninguno que nombre el slice; eslint acotado al slice en 0; `tests/headerBreadcrumbs/breadcrumb-locales.spec.ts` → 2 passed sin editar.
- **Censo (§14):** `git diff --name-only` contra `multitenant` muestra exactamente los archivos de la tabla del spec en cada repo, ninguno de la lista de **No tocar**, y nada más.
- **DoD (§16), lo que aplica aquí:** migración generada con `make:migration` y ordenada al final; los 5 specs nuevos del censo en verde; la nota para el PR/deploy (correr `0062_system_module_seeder` y asignar `telework-settings` a los roles de RH) queda en el cuerpo del commit de Task 1 o del PR que levante Wilvardo. La revisión de Wilvardo y el despliegue son proceso aparte: el plan termina aquí.
- El manual de QA (Task 6) queda **entregado**; el recorrido lo hace una persona.