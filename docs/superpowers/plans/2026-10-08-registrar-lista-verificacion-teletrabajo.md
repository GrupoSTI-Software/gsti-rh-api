# Registrar la Lista de Verificación por teletrabajador y su re-aplicación (VLRH-H1790812613870) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Historial de aplicaciones de la lista de verificación NOM-037 por teletrabajador (catálogo global de puntos, aplicación con respuesta punto por punto, resultado calculado, vencimiento con snapshot de la periodicidad de la empresa, estados de vigencia con a lo más una vigente garantizada por BD), registro de la visita de la Comisión de Seguridad e Higienda desde el Backoffice **sin fotos**, consultas del BO, y el contrato público `invalidateCurrent`/`getCurrentByEmployee` que consumen las HUs hermanas — todo en el API, con el módulo `telework-checklists` y sus permisos declarados para que la pantalla de `VLRH-H1790812613871` se monte sobre él.

**Architecture:** Slice hexagonal espejo de `app/modules/telework-policy/` (controller con `MODULE_SLUG` + `RBAC_FORBIDDEN` + mapa `ERROR_STATUS_BY_KEY`, servicio, puerto `*.repository.ts` + adaptador `*.repository.mysql.ts`, `dto/`, `validators/`, error de dominio con `key`), con las desviaciones que fija el spec: permiso vía `assertComplianceRepsePermission` **en el controller** (las rutas de `nom037_routes.ts` no usan `permissionGate`), el **adaptador** consulta con `db.from(...)` y filtro explícito `business_unit_id` (nunca el mixin) para servir fuera de HTTP al cron de `VLRH-H1791306081115` —los modelos componen el mixin solo como defensa—, y la unicidad de la vigente es de **BD**: columna `GENERATED VIRTUAL` + `UNIQUE uq_twca_current_employee`, con `forUpdate` sobre la fila de `employees` para serializar la carrera y `ER_DUP_ENTRY` → 409.

**Tech Stack:** Adonis 6 + VineJS + Lucid (MySQL) + luxon + japa (API; BD de pruebas `sae_pruebas`).

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1790812613870.md` — el plan argumenta desde él; el ejecutor lee **ambos**, más el anexo A (`/Users/noeabelvargaslopez/Downloads/anexo-A-modelo-de-datos.md`). Cuerpos de error, textos i18n, códigos `TWC`, estados y el contrato §9 se copian **verbatim** del spec, no se improvisan. Cada ancla se valida contra el código al implementar (nota de validación obligatoria del spec): el drift trivial se corrige al momento; el cambio de **alcance, contrato o regla de negocio se escala a Wilvardo**, no se cambia en silencio.

**Ramas:** `feature/VLRH-H1790812613870-registrar-la-lista-de-verificacion-por` ya existe en `gsti-rh-api`, limpia, a la par de `multitenant` local y de `origin/multitenant` (verificada el 2026-10-08). Solo `gsti-rh-api`; sin cambios en `gsti-rh-bo` ni app del colaborador.

**Validación de anclas (2026-10-08, contra `multitenant`):** coincide todo lo citado por el spec: `getEffective` en `app/services/telework_compliance_setting_service.ts:57` (rechaza `businessUnitId <= 0`, default virtual `isDefault: true`, sin crear fila); `TeleworkComplianceSettingEffective` en `app/interfaces/telework_compliance_setting_interface.ts:28`; `assertComplianceRepsePermission` en `app/helpers/compliance_repse_rbac.ts:18-59` (bypass `root`/`super-administrador`/`owner`, acepta `gestion` por módulo); gating espejo `app/services/employee_telework_location_service.ts:61-84` con `EMPLOYEE_WORK_SCHEDULE` (`'Onsite' | 'Remote' | 'Hybrid'`) en `app/constants/employee_work_schedule.ts:14`; patrón de seeder por `updateOrCreate` en `database/seeders/0028_stps_authority_seeder.ts:7`; `positions` con `#` en `app/constants/system_modules_menu/system_modules.constant.ts:667-680` y grupo `empresa` (`:279`) con `telework-workers` en `:396-411`; `naturalSort: false` en `config/database.ts` (~:25); `router.matchers.number()` usado en `start/routes/employee_routes.ts:70`; `vine.date({ formats: ['YYYY-MM-DD'] })` en `app/validators/attention_program_action.ts:11`; `TenantContextMissingException` en `app/mixins/with_business_unit_scope.ts:70`; `employee_telework_locations` con soft delete (`deletedAt` → `employee_telework_location_deleted_at`) y bandera `active`; `employees` con soft delete (`employee_deleted_at`). **Dos drifts triviales, resueltos aquí** (ninguno toca alcance, contrato §9 ni reglas §4; nada que escalar):

1. **Prefijo de migraciones.** El censo reserva `1791429000001…3`, posteriores a la última migración vigente al redactar el spec (`1791406751758`). Hoy `multitenant` ya integró `1791448005837_create_traumatic_event_report_notification_logs_table.ts`, posterior al bloque reservado. Aplica el caso que el propio spec §10 anticipa: **regenerar** con `node ace make:migration` conservando el sufijo `…001/002/003` del mismo prefijo — el patrón de migraciones encadenadas de la regla del repo (`.claude/rules/migraciones-lucid.md:16`: «repetir el prefijo de 13 dígitos con sufijo incremental del MISMO largo», ej. `1788912000001_`, `1788912000002_`). La receta exacta va en la Task 2; los nombres reales se anotan en el commit. `validar-censo.py` no vive en este árbol (proceso de Wilvardo): CA14 se verifica con `git diff --name-only --diff-filter=AM multitenant...HEAD` **excluyendo `docs/superpowers/`**.
2. **Anclas de línea en i18n.** El bloque `telework_policy` de `resources/langs/es.json` está en `:2931` (el spec cita `:2886`) y las claves planas `telework_policy_forbidden_*` en `:2997-3000` (cita `:2942-2945`); en `en.json`, `telework_policy` en `:2928` y las planas en `:2994-2997`. Se inserta tras el bloque `telework_policy` real, nunca al final del archivo.

**Líneas base medidas el 2026-10-08** (rama de la HU, `sae_pruebas` al día):

- `NODE_ENV=test node ace test unit --files="constants/"` → **144 passed (144), 0 failed**.
- `npx tsc --noEmit` → **exit 0**; `./node_modules/.bin/eslint .` → **exit 0**.
- `node ace list:routes | grep -c telework-checklists` → **0** (grep rc=1): no existe ninguna ruta del módulo hoy.
- `ls database/migrations | sort | tail -1` → `1791448005837_create_traumatic_event_report_notification_logs_table.ts`; `ls database/seeders | sort | tail -1` → `0064_tenant_roles_seeder.ts` (**0065 libre**).

**Dónde va la documentación:** este plan y el manual de QA en `gsti-rh-api/docs/superpowers/plans/` (ese directorio **sí** se versiona).

## Global Constraints

- **Rama y commits:** Conventional Commits, descripción en español, footer `Refs: VLRH-H1790812613870`. El plan **no** abre PR ni despliega (proceso aparte, de Wilvardo): termina en la verificación automatizada y en la **entrega** del manual de QA, que recorre una persona.
- **BD de pruebas:** antes de cada tanda que toque BD, `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` — un esquema atrasado produce fallos falsos. Nunca contra la BD de desarrollo. Los comandos `ace` de migración no fijan `NODE_ENV` por sí solos: `node ace test` sí. Nunca correr dos migraciones a la vez ni contra BD distintas del mismo servidor (`GET_LOCK`).
- **Estados y literales exactos** (español, sin numerales de la norma —los mapea `VLRH-H1790812613888`—): `mode: 'autoaplicada' | 'visita_csh'`; `status: 'vigente' | 'vencida' | 'invalidada' | 'reemplazada'`; `overallResult: 'aprobada' | 'no_aprobada'`; respuesta `'cumple' | 'no_cumple' | 'no_aplica'`; motivo de invalidación `'cambio_de_domicilio'`.
- **Códigos `TWC`** solo los de §11 (tabla abajo); **no declarar** los reservados para `VLRH-H1791311161420`: `TWC.VAL.008/009/010`, `TWC.NF.003`, `TWC.CONF.001`, `TWC.SYS.002/003`. Grep de colisión `TWC\.` en `app/` y `resources/` hoy da **0**. No reutilizar `TWL` ni `TWP`.
- **Sin:** ruta DELETE ni `deleted_at` en las tres tablas nuevas (nada se borra; el estado manda), fotos/multipart/FileIntake/`personId`/rutas `/me` (rompen CA8 y la frontera con `VLRH-H1791311161420`), seeder de módulo ni ids a mano, `system_modules_catalog.ts`/`system_permission_catalog.ts` (derivados), job de vencimiento («vencida» se calcula; solo se materializa al reemplazar o invalidar).
- **Periodicidad:** siempre de `TeleworkComplianceSettingService.getEffective(businessUnitId)` (ya resuelve el default 12); **nunca `?? 12`** en el consumidor. El vencimiento ya calculado no se toca al cambiar los ajustes (snapshot en la fila).
- **Empresa y actor:** siempre `ctx.businessUnitScope[0]` y `ctx.auth.user!.userId`; `mode` lo fija el servidor (`visita_csh`); el servicio rechaza `businessUnitId <= 0`. Empleado, lugar y aplicación se buscan **dentro de la consulta** con `business_unit_id` explícito: lo ajeno da el mismo 404 que lo inexistente.
- **Tipos e idioma:** TS estricto, **cero `any`**; identificadores en inglés, comentarios y JSDoc en español; fechas de calendario en CDMX (`America/Mexico_City`).
- **i18n:** bloque raíz `telework_checklist` en `resources/langs/es.json` (tras el bloque `telework_policy`, `:2931-2978`, antes de `telework_settings` `:2979`) y `en.json` (tras `telework_policy` `:2928`), más las cuatro claves planas `telework_checklist_forbidden_{read,write}_{title,message}` junto a las de `telework_policy` (`es.json:2997-3000`). Nunca al final del archivo.
- **Despliegue (nota para el PR, no paso del plan):** el deploy no corre seeders. Tras integrar hay que correr `0062_system_module_seeder` y `0063_system_role_permission_seeder`, y asignar `telework-checklists` a los roles de RH desde Roles y permisos (DoD §16; paso manual del equipo al desplegar). Ningún rol recibe los permisos por defecto.

## Review Focus

Cinco clases de entrada o modos de fallo que el spec implica y ningún criterio de aceptación ejercita. Cada línea lleva su prueba en la tarea que posee el código.

1. **Colaborador que dejó de ser teletrabajador, con historial:** era `Hybrid`, tiene listas; hoy es `Onsite`. Consultar su historial sigue funcionando (la evidencia pasada no se oculta); **registrarle** una nueva lista se rechaza con el gating. CA6 solo cubre a quien nunca fue teletrabajador. → spec unitario, **Task 3** (empleado `Onsite` con historial: `listByEmployee` 200, `registerVisit` → 422 `solo-teletrabajadores`).
2. **Body malformado a nivel Vine:** `answers` vacío, `itemId` ≤ 0, `result` inventado, `appliedAt` que no es fecha — deben caer en 422 `entrada-invalida` `TWC.VAL.001` (con `data.errors`), no en los 422 de cobertura ni en un 500. CA4 solo cubre faltantes/duplicados/desconocidos. → spec funcional, **Task 4**.
3. **Borde de vencimiento:** una vigente cuyo `expiresAt` es **hoy** sigue vigente (vence mañana); la comparación es estricta. CA3 usa fechas pas. → spec unitario, **Task 3** (`effectiveStatus` pura con `expiresAt === hoy`, y una lectura de servicio en ese borde).
4. **Concurrencia entre empleados distintos:** el `UNIQUE` de la vigente es por empleado, no global. Dos `POST` simultáneos para **dos** teletrabajadores deben dejar dos vigentes, no un 409 espurio. CA11 solo prueba el mismo empleado. → spec funcional, **Task 4**.
5. **Consumo fuera de HTTP (el cron de `VLRH-H1791306081115`):** las consultas del servicio no pueden depender de `TenantContext` ni del mixin — el adaptador filtra explícito. El spec unitario lo ejercita por construcción: corre en japa sin contexto HTTP. → **Task 3** (el caso del UNIQUE crudo, además, demuestra la restricción de BD).

---

### Task 1: Módulo, constantes y códigos de error — declaración del catálogo

**Files:**
- Modify: `app/constants/system_modules_menu/system_modules.constant.ts` (grupo `empresa` `:279`, inmediatamente después del bloque `telework-workers` `:396-411`, antes de `supplies` `:412`)
- Modify: `tests/unit/constants/system_modules_constant.spec.ts` (grupo de pruebas nuevo al final)
- Create: `app/constants/telework_checklist.ts`
- Create: `app/constants/telework_checklist_error_codes.ts`

**Interfaces:**
- Produces (Tasks 3 y 4 lo consumen; los consumidores de §17 también):
  - Módulo `telework-checklists` (grupo `empresa`, path `#telework-checklists`, orden 0, activo, exigencia activa, permisos exactos `read`/`create`).
  - En `app/constants/telework_checklist.ts`: `TELEWORK_CHECKLIST_MODULE_SLUG = 'telework-checklists'`; `TELEWORK_CHECKLIST_MODE = { SELF_APPLIED: 'autoaplicada', CSH_VISIT: 'visita_csh' }` (+ tipo y valores); `TELEWORK_CHECKLIST_APPLICATION_STATUS = { CURRENT: 'vigente', EXPIRED: 'vencida', INVALIDATED: 'invalidada', REPLACED: 'reemplazada' }` (+ tipo y valores); `TELEWORK_CHECKLIST_ANSWER_RESULT = { COMPLIANT: 'cumple', NON_COMPLIANT: 'no_cumple', NOT_APPLICABLE: 'no_aplica' }` (+ tipo y valores); `TELEWORK_CHECKLIST_OVERALL_RESULT = { APPROVED: 'aprobada', NOT_APPROVED: 'no_aprobada' }` (+ tipo); `TELEWORK_CHECKLIST_INVALIDATION_REASONS = { ADDRESS_CHANGE: 'cambio_de_domicilio' }` (+ tipo `TeleworkChecklistInvalidationReason`); y la función pura `effectiveStatus(row: { status: TeleworkChecklistApplicationStatus; expiresAt: DateTime }, today: DateTime): TeleworkChecklistApplicationStatus` — **única fuente** del estado efectivo: `status === 'vigente' && expiresAt < today` → `'vencida'`; en otro caso el status persistido. `today` llega normalizado a inicio de día CDMX.
  - En `app/constants/telework_checklist_error_codes.ts`: `TELEWORK_CHECKLIST_ERROR_CODES` con **exactamente** `INVALID_INPUT: 'TWC.VAL.001'`, `INCOMPLETE_ANSWERS: 'TWC.VAL.002'`, `DUPLICATED_ANSWER: 'TWC.VAL.003'`, `UNKNOWN_ITEM: 'TWC.VAL.004'`, `INVALID_APPLIED_AT: 'TWC.VAL.005'`, `INSPECTOR_REQUIRED: 'TWC.VAL.006'`, `INVALID_LOCATION: 'TWC.VAL.007'`, `GATING_ONLY_TELEWORKERS: 'TWC.VAL.GATING.001'`, `EMPLOYEE_NOT_FOUND: 'TWC.NF.001'`, `APPLICATION_NOT_FOUND: 'TWC.NF.002'`, `CONCURRENT_APPLICATION: 'TWC.CONF.002'`, `FORBIDDEN: 'TWC.AUTH.001'`, `UNEXPECTED: 'TWC.SYS.001'` (+ tipo del valor).

- [ ] **Step 1: Correr la línea base del guardrail**

Run: `NODE_ENV=test node ace test unit --files="constants/"`
Expected: **144 passed (144), 0 failed** (línea base medida).

- [ ] **Step 2: Escribir el caso que falla**

Al final de `tests/unit/constants/system_modules_constant.spec.ts` (el archivo ya importa `SYSTEM_MODULES`; el molde de estilo son los grupos existentes), el grupo nuevo:

```ts
test.group('telework-checklists — declaración del módulo (VLRH-H1790812613870, CA13)', () => {
  const MODULE_SLUG = 'telework-checklists'

  test('vive en el grupo empresa, oculto del menú y con exigencia activa', ({ assert }) => {
    const systemModule = SYSTEM_MODULES.find((m) => m.systemModuleSlug === MODULE_SLUG)
    assert.isDefined(systemModule)
    assert.equal(systemModule!.systemModuleGroupKey, 'empresa')
    assert.equal(systemModule!.systemModulePath, '#telework-checklists')
    assert.equal(systemModule!.systemModuleActive, 1)
    assert.equal(systemModule!.systemModuleRetired, false)
    assert.isTrue(systemModule!.systemModulePermissionEnforcementActive)
  })

  test('declara exactamente los permisos read y create', ({ assert }) => {
    const systemModule = SYSTEM_MODULES.find((m) => m.systemModuleSlug === MODULE_SLUG)
    assert.isDefined(systemModule)
    assert.deepEqual(
      systemModule!.systemModulePermissions.map((p) => p.systemPermissionSlug),
      ['read', 'create']
    )
  })
})
```

- [ ] **Step 3: Correrlo y verificar que falla**

Run: `NODE_ENV=test node ace test unit --files="constants/"`
Expected: FAIL — el caso nuevo de `telework-checklists` no existe en la constante.

- [ ] **Step 4: Implementar la declaración y las constantes**

En `system_modules.constant.ts`, dentro del grupo `empresa` (`key: 'empresa'`, `:279`), **inmediatamente después** del bloque `telework-workers` (cierra en `:411`) y antes de `supplies`, inserta (texto §8 del spec; el `#` oculta del menú del BO — `VLRH-H1790812613871` lo cambiará a `/telework-checklists` al montar la pantalla):

```ts
{
  systemModuleName: 'Listas de verificación de teletrabajo',
  systemModuleSlug: 'telework-checklists',
  systemModuleDescription: '',
  systemModules: 1,
  systemModulePath: '#telework-checklists',
  systemModuleOrder: 0,
  systemModuleActive: 1,
  systemModulePermissionEnforcementActive: true,
  systemModuleRetired: false,
  systemModuleIcon:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v1h-6z"/><path d="M9 5h-2a2 2 0 0 0 -2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-13a2 2 0 0 0 -2 -2h-2"/><path d="M9 14l2 2l4 -4"/></svg>',
  systemModulePermissions: [
    { systemPermissionName: 'Consultar listas de verificación de teletrabajo', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Registrar listas de verificación de teletrabajo', systemPermissionSlug: 'create' },
  ],
}
```

Crea los dos archivos de constantes con el contenido exacto del bloque **Interfaces** de esta tarea (junto a sus hermanos `telework_policy.ts` / `telework_policy_error_codes.ts` en estilo y JSDoc en español).

- [ ] **Step 5: Correr el guardrail completo**

Run: `NODE_ENV=test node ace test unit --files="constants/"`
Expected: **146 passed (144 + 2 nuevas), 0 failed**.

- [ ] **Step 6: Commit**

```bash
git add app/constants/system_modules_menu/system_modules.constant.ts app/constants/telework_checklist.ts app/constants/telework_checklist_error_codes.ts tests/unit/constants/system_modules_constant.spec.ts
git commit -m "feat: declara el módulo y las constantes de la lista de verificación de teletrabajo

Refs: VLRH-H1790812613870"
```

---

### Task 2: Datos — migraciones, modelos y semilla del catálogo de puntos

**Files:**
- Create: `database/migrations/<P>001_create_telework_checklist_items_table.ts`
- Create: `database/migrations/<P>002_create_telework_checklist_applications_table.ts`
- Create: `database/migrations/<P>003_create_telework_checklist_answers_table.ts` (prefijo `<P>` según la receta del Step 1)
- Create: `app/models/telework_checklist_item.ts`
- Create: `app/models/telework_checklist_application.ts`
- Create: `app/models/telework_checklist_answer.ts`
- Create: `database/seeders/0065_telework_checklist_items_seeder.ts`

**Interfaces:**
- Consumes: constantes de Task 1 (literales de enums, tipos).
- Produces (Task 3 lo consume): las tres tablas de §10/anexo A con `UNIQUE uq_twca_current_employee` sobre la columna generada (no declarada en el modelo), `UNIQUE uq_twcans_application_item`, índices `idx_twca_bu_employee_applied` e `idx_twca_bu_status_expires`; modelos `TeleworkChecklistItem` (sin mixin), `TeleworkChecklistApplication` y `TeleworkChecklistAnswer` (con `withBusinessUnitScope()`, **sin** `SoftDeletes`, sin la columna generada); seeder `0065` idempotente con los 7 puntos de marcador del anexo A.

- [ ] **Step 1: Generar el prefijo de las tres migraciones**

Run: `node ace make:migration create_telework_checklist_items_table`
Expected: archivo nuevo con prefijo de 13 dígitos. Anota el nombre real (`<T>_create_telework_checklist_items_table.ts`), toma sus **primeros 10 dígitos** como `P` (p. ej. `1791487647373` → `P=1791487647`) y **borra el archivo generado**: las tres migraciones se llaman `<P>001_…`, `<P>002_…`, `<P>003_…` (sufijo incremental del mismo largo, patrón de `.claude/rules/migraciones-lucid.md:16`).

Verifica que `P` sea posterior a la última migración vigente (numérico basta: mismo número de dígitos):

Run: `P=<los 10 dígitos anotados>; [ "$P" -gt 1791448005 ] && echo posterior || echo NO-posterior`
Expected: `posterior` (si el reloj de la máquina diera un prefijo no posterior, no se avanza con uno a mano: se reporta y se espera).

- [ ] **Step 2: Escribir las tres migraciones (columnas del anexo A, verbatim)**

`<P>001` — `telework_checklist_items` (global, sin `business_unit_id`, sin mixin):

```ts
this.schema.createTable(this.tableName, (table) => {
  table.increments('telework_checklist_item_id').notNullable()
  table.string('telework_checklist_item_code', 50).notNullable()
  table.string('telework_checklist_item_label_key', 150).notNullable()
  table.smallint('telework_checklist_item_order').unsigned().notNullable()
  table.boolean('telework_checklist_item_is_active').notNullable().defaultTo(true)
  table.timestamp('telework_checklist_item_created_at').notNullable()
  table.timestamp('telework_checklist_item_updated_at').nullable()
  table.unique(['telework_checklist_item_code'], { indexName: 'uq_twci_code' })
})
```

`<P>002` — `telework_checklist_applications` (sin `deleted_at`): `telework_checklist_application_id` increments; `business_unit_id`/`employee_id` int unsigned notNullable + FK `business_units`/`employees` `RESTRICT` (`fk_twca_business_unit`, `fk_twca_employee`); `employee_telework_location_id` int unsigned nullable + FK `employee_telework_locations` `RESTRICT` (`fk_twca_location`); `telework_checklist_application_mode` enum `['autoaplicada','visita_csh']` notNullable; `…_status` enum `['vigente','vencida','invalidada','reemplazada']` notNullable `defaultTo('vigente')`; `…_overall_result` enum `['aprobada','no_aprobada']` notNullable; `…_applied_at` date notNullable; `…_revalidation_period_months` tinyint unsigned notNullable; `…_expires_at` date notNullable; `…_inspector_name` string(150) nullable; `…_notes` text nullable; `…_applied_by_user_id` int unsigned notNullable + FK `users` (`user_id`) `RESTRICT`; `…_invalidated_at` timestamp nullable; `…_invalidation_reason` string(50) nullable; `…_invalidated_by_user_id` int unsigned nullable + FK `users` `SET NULL`; `…_created_at` timestamp notNullable; `…_updated_at` timestamp nullable. Índices: `idx_twca_bu_employee_applied (business_unit_id, employee_id, telework_checklist_application_applied_at)` y `idx_twca_bu_status_expires (business_unit_id, telework_checklist_application_status, telework_checklist_application_expires_at)`.

Después de `createTable` (en `up()`, **sin `await`** — regla del repo), la columna generada y su `UNIQUE`, con el DDL literal del anexo A:

```ts
this.schema.raw(
  `ALTER TABLE telework_checklist_applications
    ADD COLUMN telework_checklist_application_current_employee_id INT UNSIGNED
      GENERATED ALWAYS AS (CASE WHEN telework_checklist_application_status = 'vigente' THEN employee_id END) VIRTUAL,
    ADD UNIQUE KEY uq_twca_current_employee (telework_checklist_application_current_employee_id)`
)
```

`<P>003` — `telework_checklist_answers`: `telework_checklist_answer_id` increments; `telework_checklist_application_id` int unsigned notNullable + FK `RESTRICT`; `telework_checklist_item_id` int unsigned notNullable + FK `telework_checklist_items` `RESTRICT`; `business_unit_id` int unsigned notNullable + FK `business_units` `RESTRICT` (igual al del padre); `telework_checklist_answer_result` enum `['cumple','no_cumple','no_aplica']` notNullable; `telework_checklist_answer_observation` text nullable; `telework_checklist_answer_created_at` timestamp notNullable (sin `updated_at`). `UNIQUE uq_twcans_application_item (telework_checklist_application_id, telework_checklist_item_id)`.

`down()` de las tres: `this.schema.dropTableIfExists(this.tableName)` (y nada más — la columna generada muere con la tabla).

- [ ] **Step 3: Escribir los tres modelos**

Molde de columnas y decoradores: `app/models/employee_telework_location.ts` y `app/models/telework_compliance_setting.ts`. `TeleworkChecklistItem extends BaseModel` (**sin** mixin, tabla global); `TeleworkChecklistApplication` y `TeleworkChecklistAnswer` con `compose(BaseModel, withBusinessUnitScope())` — **sin** `SoftDeletes` y **sin** declarar la columna generada. `…AppliedAt`/`…ExpiresAt` con `@column.date()`; `…InvalidatedAt` con `@column.dateTime()` nullable; `IsActive`/`Active` con `consume: (v) => Boolean(v)` como el molde; tipos enum importados de `#constants/telework_checklist`. `TeleworkChecklistAnswer` solo `createdAt` (`autoCreate`), sin `updatedAt`.

- [ ] **Step 4: Escribir el seeder `0065`**

Molde `0028_stps_authority_seeder.ts` (`updateOrCreate` por clave). Siete filas, `code` por concepto sin numeral, `labelKey` = `telework_checklist.items.<code>`, `order` 1-7, `isActive: true` — textos de marcador del anexo A (R11: los definitivos los da asesoría, y su ausencia no bloquea):

| order | code | texto es (y en) |
|---|---|---|
| 1 | `iluminacion` | Iluminación suficiente del área de trabajo |
| 2 | `ventilacion_temperatura` | Ventilación y temperatura adecuadas |
| 3 | `mobiliario` | Silla y mesa adecuadas |
| 4 | `instalacion_electrica` | Instalación eléctrica sin riesgos visibles |
| 5 | `orden_y_limpieza` | Espacio ordenado y libre de obstáculos |
| 6 | `ruido` | Nivel de ruido que permite trabajar |
| 7 | `primeros_auxilios_emergencia` | Medios para atender una emergencia |

- [ ] **Step 5: Verificar migración, reversión e idempotencia (en orden, nunca dos a la vez)**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`
Expected: sin errores (las tres tablas nuevas y el seeder `0065` entre los corridos).

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files=database/seeders/0065_telework_checklist_items_seeder.ts` (dos veces)
Expected: idempotente; consulta de conteo `telework_checklist_items` = **7** en ambas corridas.

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:rollback && NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:run`
Expected: reversión limpia (las tres tablas se dropean) y re-run limpio.

La presencia de `uq_twca_current_employee` **no** se verifica a mano aquí: la prueba cruda del `UNIQUE` queda en el spec unitario de Task 3 (Review Focus 5), que es la verificación ejecutable del DoD.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/<P>001_create_telework_checklist_items_table.ts database/migrations/<P>002_create_telework_checklist_applications_table.ts database/migrations/<P>003_create_telework_checklist_answers_table.ts app/models/telework_checklist_item.ts app/models/telework_checklist_application.ts app/models/telework_checklist_answer.ts database/seeders/0065_telework_checklist_items_seeder.ts
git commit -m "feat: agrega las tablas, modelos y semilla de la lista de verificación de teletrabajo

Refs: VLRH-H1790812613870"
```

(El mensaje del commit anota los nombres reales de las tres migraciones.)

---

### Task 3: Servicio — puerto, adaptador MySQL, DTOs, validador y núcleo de dominio

**Files:**
- Create: `app/modules/telework-checklist/telework_checklist.error.ts`
- Create: `app/modules/telework-checklist/dto/telework_checklist.dto.ts`
- Create: `app/modules/telework-checklist/validators/telework_checklist_create.validator.ts`
- Create: `app/modules/telework-checklist/telework_checklist.repository.ts`
- Create: `app/modules/telework-checklist/telework_checklist.repository.mysql.ts`
- Create: `app/modules/telework-checklist/telework_checklist.service.ts`
- Test: `tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts`

**Interfaces:**
- Consumes: constantes de Task 1; `TeleworkComplianceSettingService.getEffective(businessUnitId: number): Promise<TeleworkComplianceSettingEffective>` — inyectada por constructor con default `new TeleworkComplianceSettingService()` (simulable en unitario); `assertScopeResolved` espejo del molde (rechaza `businessUnitId <= 0`).
- Produces (Task 4 consume; §17 fija los consumidores externos):
  - `TeleworkChecklistError extends Error` con `key: TeleworkChecklistErrorKey` (unión: `'respuestas-incompletas' | 'respuesta-duplicada' | 'punto-no-reconocido' | 'fecha-de-aplicacion-invalida' | 'visitador-requerido' | 'lugar-de-teletrabajo-invalido' | 'solo-teletrabajadores' | 'colaborador-no-encontrado' | 'aplicacion-no-encontrada' | 'aplicacion-concurrente'`) y `details?: Record<string, unknown>` — molde `app/exceptions/telework_policy_error.ts`, pero **vive en el módulo** (censo).
  - DTOs (`dto/telework_checklist.dto.ts`): `AnswerInput { itemId: number; result: TeleworkChecklistAnswerResult; observation?: string | null }`; `TeleworkChecklistRegistrationInput` = unión discriminada de §10 — `{ mode: 'visita_csh'; appliedAt: string; inspectorName: string; teleworkLocationId: number | null; notes: string | null; answers: AnswerInput[] }` | `{ mode: 'autoaplicada'; teleworkLocationId: number | null; notes: string | null; answers: AnswerInput[] }` (los demás campos los fija el núcleo); `ApplicationSummaryDto { applicationId; mode; status /* efectivo */; overallResult; appliedAt; expiresAt; revalidationPeriodMonths; appliedByUserId; invalidatedAt; invalidationReason }`; `ApplicationDetailDto = ApplicationSummaryDto & { employeeId; teleworkLocationId; inspectorName; notes; answers: Array<{ itemId; code; label; result; observation }> }` (sin domicilio del lugar, solo el id); `EmployeeApplicationsDto { employeeId; current: ApplicationSummaryDto | null; history: ApplicationSummaryDto[] }`.
  - Validador: `teleworkChecklistCreateValidator` (vine.compile) y `TeleworkChecklistCreateInput` — `employeeId` entero > 0; `appliedAt` `vine.date({ formats: ['YYYY-MM-DD'] })` (patrón `app/validators/attention_program_action.ts:11`); `inspectorName` string trim ≤ 150 **opcional en el esquema** (su ausencia es `TWC.VAL.006`, no `VAL.001`); `teleworkLocationId` entero > 0 opcional; `notes` ≤ 2000 opcional; `answers` arreglo **≥ 1** de `{ itemId: entero > 0; result: enum de respuestas; observation?: string ≤ 1000 }`. Llaves extra (`mode`, `photos`) las descarta Vine.
  - Puerto `TeleworkChecklistRepository` (el adaptador MySQL lo implementa con `db.from(...)` + filtro explícito `business_unit_id` en **cada** consulta, `trx` donde el servicio lo pasa): `listActiveItems()`, `findEmployeeWorkSchedule(businessUnitId, employeeId)`, `hasLiveTeleworkLocation(businessUnitId, employeeId, locationId)`, `listByEmployee(businessUnitId, employeeId)` (aplicaciones del empleado, `applied_at` desc, `id` desc), `findCurrentPersisted(businessUnitId, employeeId, trx?)`, `findApplication(businessUnitId, applicationId)`, `listAnswersWithItems(businessUnitId, applicationId)` (respuestas + código/labelKey del punto), `lockEmployeeRow(businessUnitId, employeeId, trx)`, `insertApplication(values, trx)`, `insertAnswers(applicationId, businessUnitId, answers, trx)`, `updateApplicationStatus(applicationId, status, extra?, trx?)` (extra: `invalidatedAt`/`invalidationReason`/`invalidatedByUserId`; siempre toca `updated_at`).
  - `TeleworkChecklistService` (contrato público, firmas §9):
    - `listItems(): Promise<TeleworkChecklistItem[]>`
    - `listByEmployee(businessUnitId, employeeId): Promise<EmployeeApplicationsDto>` — empleado no vivo en la empresa → `TeleworkChecklistError('colaborador-no-encontrado')` (CA9); `current` = la vigente **efectiva** (null si no hay o si ya venció), `history` incluye a la vigente con estado efectivo.
    - `getCurrentByEmployee(businessUnitId, employeeId): Promise<ApplicationSummaryDto | null>` — vigente efectiva o null (sin 404: es contrato de consulta para las HUs hermanas).
    - `detail(businessUnitId, applicationId): Promise<ApplicationDetailDto>` — ajena o inexistente → `'aplicacion-no-encontrada'`.
    - `registerVisit(businessUnitId, input: TeleworkChecklistCreateInput, actorUserId): Promise<ApplicationDetailDto>` — arma `{ mode: 'visita_csh', … }` y llama al núcleo.
    - `invalidateCurrent(businessUnitId, employeeId, reason: TeleworkChecklistInvalidationReason, actorUserId, trx?): Promise<ApplicationSummaryDto | null>` — sin endpoint.
    - Núcleo privado `#register(businessUnitId, employeeId, input: TeleworkChecklistRegistrationInput, actorUserId)` con el **orden de validación** de §7: empleado vivo en la empresa (404 `NF.001`) → modalidad `Remote`/`Hybrid` (422 `VAL.GATING.001`) → cobertura exacta de los puntos activos (422: faltantes `VAL.002` + `data.missingItemCodes`; repetidos `VAL.003` + `data.itemCode`; inexistentes o inactivos `VAL.004` + `data.itemId`) → fecha no futura en CDMX (`VAL.005`) → `inspectorName` no vacío en `visita_csh` (`VAL.006`) → lugar vivo del propio colaborador si se indicó (`VAL.007`) → `getEffective` → `db.transaction`: `lockEmployeeRow` (`forUpdate`, serializa la carrera), `findCurrentPersisted` → si hay, `effectiveStatus` decide: ya vencida → se **materializa** `'vencida'`; si no → `'reemplazada'`; luego `insertApplication` + `insertAnswers` en lote; captura de `ER_DUP_ENTRY` (`(error as { code?: string })?.code === 'ER_DUP_ENTRY'`, patrón `device_command.repository.mysql.ts:21`) → `'aplicacion-concurrente'` (409). `overallResult`: algún `no_cumple` → `'no_aprobada'`; si no `'aprobada'`. `expiresAt = DateTime.fromISO(appliedAt, { zone: 'America/Mexico_City' }).plus({ months: revalidationPeriodMonths })` (luxon resuelve el fin de mes). `appliedAt`/`expiresAt` se persisten como `yyyy-MM-dd`.

- [ ] **Step 1: Escribir el spec unitario que falla**

`tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts` (japa; molde de fixtures y de estructura: `tests/unit/services/telework_compliance_setting_service.spec.ts` — actores con email único por timestamp, `ensureRole`, cleanup explícito en `group.teardown`). El servicio se construye con un **falso** de `TeleworkComplianceSettingService` inyectado (`getEffective` configurable por prueba); las creaciones de fixture vía modelos van envueltas en `TenantContext.run([buId], …)` (los modelos componen el mixin), pero **las llamadas al servicio van sin envolver** (Review Focus 5: nada depende de `TenantContext`). Fixtures: dos empresas A/B, persona+usuario actor, empleados `Pedro` (`Hybrid`), `Rosa` (`Onsite`), `PedroB` (`Remote` en B), un lugar de teletrabajo vivo de Pedro y uno dado de baja (`active = false` + `delete()`), catálogo sembrado (7 puntos). Pruebas (cada `test` con su prefijo `Objetivo:`):

1. `Objetivo: CA-1 — una visita con un punto que no cumple queda vigente, no aprobada, con vencimiento a 12 meses` — con `getEffective` → 12/default; `registerVisit` con `appliedAt: '2026-11-10'`, `inspectorName`, las 7 respuestas y una `no_cumple` → resumen con `mode: 'visita_csh'`, `status: 'vigente'`, `overallResult: 'no_aprobada'`, `revalidationPeriodMonths: 12`, `expiresAt: '2027-11-10'`, `appliedByUserId` del actor; en BD, 7 filas de respuestas para la aplicación.
2. `Objetivo: Review Focus 3 — el vencimiento cae en fin de mes sin desbordar` — `appliedAt: '2026-08-31'` con periodicidad 6 → `expiresAt: '2027-02-28'` (assert con luxon, `DateTime.fromISO('2026-08-31', { zone: 'America/Mexico_City' }).plus({ months: 6 }).toISODate()`).
3. `Objetivo: CA-2 — el vencimiento es snapshot: cambiar la periodicidad de la empresa no mueve lo ya calculado` — visita 1 (12/default) → el falso pasa a 6 → consulta: sigue `2027-11-10`/12; visita 2 (`'2026-11-20'`) → `2027-05-20`/6.
4. `Objetivo: CA-3 — registrar de nuevo deja la anterior reemplazada y la nueva vigente` — tras la segunda, la primera fila persiste con `'reemplazada'`; `listByEmployee` → `current` = la nueva, `history` con ambas por `appliedAt` desc.
5. `Objetivo: CA-3 — una vigente pasada de fecha se reporta vencida y no cuenta como current` — SQL crudo adelanta `expires_at` a ayer → `getCurrentByEmployee` → `null`; `listByEmployee` → `current: null` y la fila con `status: 'vencida'` en `history`.
6. `Objetivo: CA-3 — re registrar sobre una vigente vencida la materializa como vencida, no reemplazada` — con la vencida persistida, nueva visita → la fila anterior queda `'vencida'`, la nueva `'vigente'`.
7. `Objetivo: CA-4 — respuestas incompletas, duplicadas o desconocidas no dejan rastro` — faltan puntos → error `key: 'respuestas-incompletas'`, `code: 'TWC.VAL.002'`, `data.missingItemCodes` con los códigos; un punto repetido → `'respuesta-duplicada'`/`TWC.VAL.003` con `data.itemCode`; `itemId` inexistente → `'punto-no-reconocido'`/`TWC.VAL.004` con `data.itemId`; en los tres, conteo de aplicaciones/respuestas del empleado sin cambios.
8. `Objetivo: CA-5 — fecha futura, visitador ausente y lugar inválido se rechazan sin escribir` — `appliedAt` mañana (CDMX) → `'fecha-de-aplicacion-invalida'`/`TWC.VAL.005`; sin `inspectorName` (o en blanco) → `'visitador-requerido'`/`TWC.VAL.006`; `teleworkLocationId` de otro empleado o dado de baja → `'lugar-de-teletrabajo-invalido'`/`TWC.VAL.007`; cero filas nuevas en los tres.
9. `Objetivo: CA-6 y Review Focus 1 — el presencial no recibe lista, pero su historial previo sigue consultable` — `registerVisit` para Rosa → `'solo-teletrabajadores'`/`TWC.VAL.GATING.001`; un empleado `Onsite` con historial sembrado por SQL conserva `listByEmployee` → 200-equivalente con su historial.
10. `Objetivo: CA-9 — lo de otra empresa se comporta como inexistente` — empleado de B consultado con `businessUnitId` de A → `'colaborador-no-encontrado'`/`TWC.NF.001`; `detail` de una aplicación de B con scope de A → `'aplicacion-no-encontrada'`/`TWC.NF.002`.
11. `Objetivo: CA-12 — invalidateCurrent invalida con autor y motivo, o no hace nada sin vigente` — con vigente → fila `'invalidada'` con `invalidatedAt`/`invalidationReason: 'cambio_de_domicilio'`/`invalidatedByUserId`, y devuelve el resumen; sin vigente → `null` sin escribir; con vigente ya vencida persistida → la materializa `'vencida'` y devuelve `null`. (Pasando `trx` de una transacción abierta a propósito: la invalidación corre dentro de ella.)
12. `Objetivo: CA-11 y Review Focus 5 — la BD rechaza dos vigentes del mismo empleado` — `INSERT` crudo (vía `db.from`) de una segunda fila `status: 'vigente'` para Pedro → error `ER_DUP_ENTRY` del `UNIQUE uq_twca_current_employee`.
13. `Objetivo: Review Focus 3 — el borde: vence el día siguiente, no el mismo día` — `effectiveStatus` pura con `expiresAt == hoy` (inicio de día CDMX) → `'vigente'`; con `expiresAt == ayer` → `'vencida'`; y una lectura de servicio sobre una fila en ese borde reporta vigente.

- [ ] **Step 2: Correr el spec y verificar que falla**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed && NODE_ENV=test node ace test unit --files="tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts"`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar error, DTOs, validador, puerto, adaptador y servicio**

Contenido exacto de firmas y literales: bloque **Interfaces** de esta tarea; cuerpos de error: tabla de §11 (abajo en Task 4 está el mapa controller↔código). El adaptador NO usa modelos para leer: `db.from('telework_checklist_applications')` + `where('business_unit_id', bu)` en cada consulta (fail-closed explícito, sirve al cron); mapea filas crudas a DTOs camelCase. `appliedAt`/`expiresAt` se comparan y devuelven como `yyyy-MM-dd`; `invalidatedAt` como ISO.

- [ ] **Step 4: Correr el spec y verificar que pasa**

Run: `NODE_ENV=test node ace test unit --files="tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts"`
Expected: PASS (los 13 objetivos).

- [ ] **Step 5: Commit**

```bash
git add app/modules/telework-checklist/ tests/unit/modules/telework-checklist/
git commit -m "feat: agrega el servicio de la lista de verificación de teletrabajo

Refs: VLRH-H1790812613870"
```

---

### Task 4: HTTP — rutas, controller, i18n y prueba funcional

**Files:**
- Modify: `start/routes/nom037_routes.ts` (grupo nuevo **al final**)
- Create: `app/modules/telework-checklist/telework_checklist.controller.ts`
- Modify: `resources/langs/es.json` (bloque `telework_checklist` + 4 claves planas)
- Modify: `resources/langs/en.json` (ídem)
- Test: `tests/unit/routes/nom037_telework_checklist_scope_routes.spec.ts`
- Test: `tests/functional/telework_checklist.spec.ts`

**Interfaces:**
- Consumes: todo Task 3; `assertComplianceRepsePermission(ctx, 'telework-checklists', action, RBAC_FORBIDDEN)` con `RBAC_FORBIDDEN = { errorCode: TELEWORK_CHECKLIST_ERROR_CODES.FORBIDDEN, i18nPrefix: 'telework_checklist' }` y `MODULE_SLUG = TELEWORK_CHECKLIST_MODULE_SLUG` (patrón `telework_policy.controller.ts:14-18`); `ctx.businessUnitScope[0]`; `ctx.auth.user!.userId`.
- Produces: las cuatro rutas de §11 con `auth` + `businessScope` y permiso en el controller; los cuerpos de error de §11 en i18n.

- [ ] **Step 1: Escribir los dos specs que fallan**

`tests/unit/routes/nom037_telework_checklist_scope_routes.spec.ts` — molde exacto `tests/unit/routes/nom037_telework_settings_scope_routes.spec.ts` (lee el archivo de rutas, no lo ejecuta): el grupo de `telework-checklists` monta `prefix('/api')` → `use(middleware.auth())` → `use(middleware.businessScope())` en ese orden; declara en orden `'/nom037/telework-checklists/items'`, `'/nom037/telework-checklists/employees/:employeeId'`, `'/nom037/telework-checklists/:applicationId'` y `router.post('/nom037/telework-checklists', …)`, con `router.matchers.number()` en `:employeeId` y `:applicationId`; **sin** `router.delete` para el prefijo; y los grupos existentes conservan su montaje (assert del grupo `telework-policy` y del anidado de `tele-locations`, como el molde).

`tests/functional/telework_checklist.spec.ts` — molde `tests/functional/telework_compliance_settings.spec.ts` (`createTestActor`, `ensureRole`, `grantModuleAction` de `./employees/sensitive_read_by_category_support.js`, `X-Business-Unit-Id` con el public id, cleanup en `group.teardown`; fixtures de empleado `Hybrid`/`Onsite` y lugar vivo — envolver la creación de empleados en `TenantContext.run`). Grupos y pruebas (todas con prefijo `Objetivo:`):

1. `401` sin sesión: `GET items`, `GET employees/:id`, `GET /:id` y `POST` → 401.
2. `CA-10 — permisos`: sin `telework-checklists:read` → los dos `GET` de datos → 403 `{ key: 'sin-permiso', errorCode: 'TWC.AUTH.001' }` sin `detail`; con `read` sin `create` → `GET` 200 y `POST` 403 sin escribir; `GET items` responde 200 a **cualquier** autenticado de la empresa (con y sin permiso del módulo); un rol con `gestion` en **otro** módulo (p. ej. `telework-policy`) sigue recibiendo 403 aquí (el bypass no cruza de módulo).
3. `CA-1 — visita feliz con un no cumple` (usuario con `create`, `appliedAt` = fecha de hoy o pasada): 201 con envoltura `{ type: 'success' }` y `data` = `ApplicationDetailDto` (`mode: 'visita_csh'`, `status: 'vigente'`, `overallResult: 'no_aprobada'`, `revalidationPeriodMonths: 12`, `expiresAt` = `appliedAt` + 12 meses literal, `appliedByUserId` del actor, las N respuestas con `code` y `label`); en BD, N filas de respuestas.
4. `CA-7 — la forma la fija el servidor`: body con `mode: 'autoaplicada'` (y con `photos: []`) → 201 con `data.mode: 'visita_csh'`.
5. `CA-2 — snapshot por HTTP`: `PUT /api/nom037/telework-settings` de la empresa a 6 meses (permiso de ese módulo) → nueva visita → `expiresAt` a 6 meses; la anterior conserva el suyo.
6. `CA-3 — reemplazo y consulta`: nueva visita → `GET employees/:id` → `current` nueva + `history` con ambas.
7. `CA-4 — cobertura inválida no guarda nada`: faltan puntos → 422 `{ key: 'respuestas-incompletas', code: 'TWC.VAL.002', data: { missingItemCodes } }`; repetido → `respuesta-duplicada`/`TWC.VAL.003`; inexistente → `punto-no-reconocido`/`TWC.VAL.004`; conteo BD sin cambios.
8. `CA-5 — datos de la visita`: sin `inspectorName` → 422 `visitador-requerido`/`TWC.VAL.006`; `appliedAt` futuro → `fecha-de-aplicacion-invalida`/`TWC.VAL.005`; `teleworkLocationId` de otro colaborador o dado de baja → `lugar-de-teletrabajo-invalido`/`TWC.VAL.007`; sin `X-Business-Unit-Id` → el error del middleware (400 `BU.VAL.000`); cero filas nuevas.
9. `CA-6 — presencial`: `POST` para el empleado `Onsite` → 422 `{ key: 'solo-teletrabajadores', code: 'TWC.VAL.GATING.001' }` sin filas.
10. `Review Focus 2 — Vine manda en lo malformado`: `answers: []` → 422 `entrada-invalida`/`TWC.VAL.001` con `data.errors`; `result: 'talvez'` → ídem; `itemId: 0` → ídem.
11. `CA-9 — aislamiento`: usuario de la empresa B con todos los permisos → `GET employees/:pedroId` y `GET /:applicationId` de Pedro y `POST` para Pedro → 404 `colaborador-no-encontrado`/`TWC.NF.001` o `aplicacion-no-encontrada`/`TWC.NF.002`, con el mismo cuerpo que un id inexistente.
12. `CA-11 y Review Focus 4 — concurrencia`: dos `POST` simultáneos (`Promise.all`) para **el mismo** empleado → termina una `vigente` y la otra `reemplazada`, o la segunda 409 `aplicacion-concurrente`/`TWC.CONF.002`; **nunca** dos filas `vigente` (conteo BD). Dos `POST` simultáneos para **dos** empleados distintos → ambos 201, ambos vigentes.

- [ ] **Step 2: Correr ambos specs y verificar que fallan**

Run: `NODE_ENV=test node ace test unit --files="tests/unit/routes/nom037_telework_checklist_scope_routes.spec.ts" && NODE_ENV=test node ace test functional --files="tests/functional/telework_checklist.spec.ts"`
Expected: FAIL ambos — no hay grupo de rutas ni controller.

- [ ] **Step 3: Implementar rutas, controller e i18n**

`nom037_routes.ts`, grupo **al final** del archivo (no se toca el montaje de los existentes):

```ts
// VLRH-H1790812613870 — lista de verificación de condiciones del lugar de
// teletrabajo (NOM-037): catálogo de puntos, historial por teletrabajador y
// registro de la visita de la Comisión. Permiso en el controller. Sin fotos
// (VLRH-H1791311161420) y sin ruta de borrado (nada se elimina).
router
  .group(() => {
    router.get(
      '/nom037/telework-checklists/items',
      '#modules/telework-checklist/telework_checklist.controller.listItems'
    )
    router.get(
      '/nom037/telework-checklists/employees/:employeeId',
      '#modules/telework-checklist/telework_checklist.controller.listByEmployee'
    ).where('employeeId', router.matchers.number())
    router.get(
      '/nom037/telework-checklists/:applicationId',
      '#modules/telework-checklist/telework_checklist.controller.detail'
    ).where('applicationId', router.matchers.number())
    router.post(
      '/nom037/telework-checklists',
      '#modules/telework-checklist/telework_checklist.controller.registerVisit'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

Controller (molde `telework_policy.controller.ts`, con `MODULE_SLUG`/`RBAC_FORBIDDEN`/`assertHasPermission` privado y JSDoc de cabecera con los endpoints; sin bloques @swagger pesados — espeja el nivel de `telework_compliance_setting_controller.ts`): `listItems` **sin** permiso de módulo (solo autenticado; resuelve `label` con `ctx.i18n.formatMessage(item.teleworkChecklistItemLabelKey)`); `listByEmployee` y `detail` con `read`; `registerVisit` con `create`, valida con `teleworkChecklistCreateValidator`, y el 422 de Vine sale como `{ type: 'error', title, detail, key: 'entrada-invalida', code: 'TWC.VAL.001', data: { errors } }` (molde `validationError`, más `code`). Los errores de dominio por el mapa:

```ts
const ERROR_STATUS_BY_KEY: Record<TeleworkChecklistErrorKey, { status: number; code: string }> = {
  'respuestas-incompletas': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.INCOMPLETE_ANSWERS },
  'respuesta-duplicada': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.DUPLICATED_ANSWER },
  'punto-no-reconocido': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.UNKNOWN_ITEM },
  'fecha-de-aplicacion-invalida': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.INVALID_APPLIED_AT },
  'visitador-requerido': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.INSPECTOR_REQUIRED },
  'lugar-de-teletrabajo-invalido': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.INVALID_LOCATION },
  'solo-teletrabajadores': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.GATING_ONLY_TELEWORKERS },
  'colaborador-no-encontrado': { status: 404, code: TELEWORK_CHECKLIST_ERROR_CODES.EMPLOYEE_NOT_FOUND },
  'aplicacion-no-encontrada': { status: 404, code: TELEWORK_CHECKLIST_ERROR_CODES.APPLICATION_NOT_FOUND },
  'aplicacion-concurrente': { status: 409, code: TELEWORK_CHECKLIST_ERROR_CODES.CONCURRENT_APPLICATION },
}
```

El cuerpo de dominio: `{ type: 'error', title: i18n('telework_checklist.errors.<key>.title'), detail: i18n('telework_checklist.errors.<key>.detail'), key, code, ...(details ? { data: details } : {}) }`. Exitos: `{ type: 'success', title: i18n('telework_checklist.title'), message: i18n('telework_checklist.<items|list|detail|register>_success'), data }` con 200/201.

i18n `es.json` — bloque `telework_checklist` tras el bloque `telework_policy` (`:2931-2978`, antes de `telework_settings` `:2979`):

```json
"telework_checklist": {
  "title": "Listas de verificación de teletrabajo",
  "items_success": "Puntos de la lista de verificación obtenidos correctamente.",
  "list_success": "Historial de la lista de verificación obtenido correctamente.",
  "detail_success": "Aplicación de la lista de verificación obtenida correctamente.",
  "register_success": "Visita de la Comisión registrada correctamente.",
  "items": {
    "iluminacion": "Iluminación suficiente del área de trabajo",
    "ventilacion_temperatura": "Ventilación y temperatura adecuadas",
    "mobiliario": "Silla y mesa adecuadas",
    "instalacion_electrica": "Instalación eléctrica sin riesgos visibles",
    "orden_y_limpieza": "Espacio ordenado y libre de obstáculos",
    "ruido": "Nivel de ruido que permite trabajar",
    "primeros_auxilios_emergencia": "Medios para atender una emergencia"
  },
  "errors": {
    "entrada-invalida": { "title": "Entrada inválida", "detail": "Revisa los campos de la petición." },
    "respuestas-incompletas": { "title": "Respuestas incompletas", "detail": "La lista debe responder todos los puntos activos; en 'data' están los códigos que faltan." },
    "respuesta-duplicada": { "title": "Respuesta duplicada", "detail": "Un punto de la lista se respondió más de una vez." },
    "punto-no-reconocido": { "title": "Punto no reconocido", "detail": "La respuesta incluye un punto que no existe o no está activo." },
    "fecha-de-aplicacion-invalida": { "title": "Fecha de aplicación inválida", "detail": "La fecha de la visita no puede ser futura." },
    "visitador-requerido": { "title": "Visitador requerido", "detail": "Indica el nombre de quien realizó la visita por parte de la Comisión." },
    "lugar-de-teletrabajo-invalido": { "title": "Lugar de teletrabajo inválido", "detail": "El lugar indicado no pertenece al colaborador o está dado de baja." },
    "solo-teletrabajadores": { "title": "Solo teletrabajadores", "detail": "La lista de verificación solo aplica a colaboradores en Home Office o Híbrido." },
    "colaborador-no-encontrado": { "title": "Colaborador no encontrado", "detail": "El colaborador no existe en esta empresa." },
    "aplicacion-no-encontrada": { "title": "Aplicación no encontrada", "detail": "La aplicación de la lista no existe en esta empresa." },
    "aplicacion-concurrente": { "title": "Aplicación concurrente", "detail": "Otra persona está registrando la lista de este colaborador; inténtalo de nuevo." }
  }
}
```

…y las cuatro claves planas junto a `telework_policy_forbidden_*` (`:2997-3000`): `telework_checklist_forbidden_read_title` "Sin permiso de consulta", `telework_checklist_forbidden_read_message` "No tienes permiso para consultar las listas de verificación de teletrabajo.", `telework_checklist_forbidden_write_title` "Sin permiso", `telework_checklist_forbidden_write_message` "No tienes permiso para registrar listas de verificación de teletrabajo." En `en.json`, espejo completo en inglés en las mismas posiciones relativas (`:2928` / `:2994-2997`).

- [ ] **Step 4: Correr los dos specs y verificar que pasan**

Run: `NODE_ENV=test node ace test unit --files="tests/unit/routes/nom037_telework_checklist_scope_routes.spec.ts" && NODE_ENV=test node ace test functional --files="tests/functional/telework_checklist.spec.ts"`
Expected: PASS (los dos).

- [ ] **Step 5: CA-8 — frontera de la HU, medida**

Run: `node ace list:routes | grep telework-checklists`
Expected: **exactamente 4** rutas (GET items, GET employees/:employeeId, GET /:applicationId, POST) — ninguna con `evidences`, `photos` ni `/me`.

Run: `grep -rniE "evidence|photo|file_intake|personId" app/modules/telework-checklist app/models/telework_checklist_item.ts app/models/telework_checklist_application.ts app/models/telework_checklist_answer.ts app/constants/telework_checklist.ts app/constants/telework_checklist_error_codes.ts`
Expected: **0 resultados** (los archivos son todos nuevos: cualquier match es una fuga).

- [ ] **Step 6: Regresión**

Run: `NODE_ENV=test node ace test unit --files="constants/"` → **146 passed, 0 failed**. Run: `npx tsc --noEmit && ./node_modules/.bin/eslint .` → ambos exit 0.

- [ ] **Step 7: Commit**

```bash
git add start/routes/nom037_routes.ts app/modules/telework-checklist/telework_checklist.controller.ts resources/langs/es.json resources/langs/en.json tests/unit/routes/nom037_telework_checklist_scope_routes.spec.ts tests/functional/telework_checklist.spec.ts
git commit -m "feat: expone la lista de verificación de teletrabajo en el API de NOM-037

Refs: VLRH-H1790812613870"
```

---

### Task 5: Manual de QA (entrega; lo recorre una persona)

**Files:**
- Create: `docs/superpowers/plans/2026-10-08-registrar-lista-verificacion-teletrabajo-qa-api.md` (versionado)
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (**no versionado**: nada de `git add -f`)

**Interfaces:**
- Consumes: el API de Task 4 ya en verde; las reglas `~/.agents/rules/manual-qa/manual-qa-api.md` y `~/.agents/rules/manual-qa/manual-qa-execution.md` (la copia viva; no citarlas de memoria); las constantes de ambiente de un manual anterior del mismo API (`docs/superpowers/plans/2026-10-02-cobertura-rutas-plataforma-qa-api.md`): URL base, esquema de auth, envelope, dominio/contraseña de las cuentas de prueba y el login por producto para sacar el token.
- Produces: **un solo** playbook por historia (regla de ejecución): la superficie entregada es solo de endpoints, así que el manual es de **API**, recorrido con cliente HTTP. Lo que no se puede provocar desde el cliente (401 sin sesión, concurrencia real, el `UNIQUE` de BD, `invalidateCurrent` sin endpoint, multipart con `photos[]`) **no** es escenario: se declara en «Lo que no se revisa aquí» con su motivo, cubierto por las suites de Task 3 y Task 4.

- [ ] **Step 1: Leer la regla y el molde antes de redactar**

Lee las dos reglas de `manual-qa` y el manual anterior del mismo API (constantes de ambiente). Formato: cada escenario abre con su línea `Objetivo:`; cada paso lleva **endpoint + response exacto** (status y body literales, nunca "debería fallar"); SQL en bloques cercados multilínea con el `WHERE` en línea propia; leyenda **Login por producto** (una vez) y tabla de usuarios con esa columna; tras el response de cada escenario, la lista corta «qué significa cada dato» en lenguaje llano, con los **valores fijos enumerados** la primera vez que aparecen (`mode`, `status`, `overallResult`, `result`) y sin repetirse después. Prohibido: rutas de archivo, nombres de clases/servicios, lenguaje del backend, "revisa el código".

- [ ] **Step 2: Sembrar lo de esta HU en el seeder compartido**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (su sitio; no se commitea), bajo una marca reconocible (`QA Lista de verificación`), idempotente como el resto del seeder: una **empresa A sin ajustes de teletrabajo guardados** con **Pedro** (modalidad Híbrido) y **Rosa** (Presencial) y **un lugar de teletrabajo vivo de Pedro** (y uno dado de baja, para el rechazo del 422); una **empresa B** con un teletrabajador propio y una cuenta propia; y cuentas de RH con la contraseña del proyecto — una con `telework-checklists` completo, una solo `read`, una sin acceso al módulo, todas con alcance a las empresas que correspondan. El manual declara el estado inicial que dejan y el comando único de siembra.

- [ ] **Step 3: Redactar el manual**

Estructura mínima: **Problema/Solución** cortos + `Ejemplo:` cotidiano (el inspector de la STPS que pide ver qué se revisó, quién y cuándo; la lista que se vuelve a pedir al mudarse) + glosario de negocio; **Preparar** (el comando del seeder y qué deja; el token); **Login por producto**; **Usuarios** (tabla); escenarios — cada uno con `Objetivo:` y response exacto:

1. Consultar los puntos de la lista con cualquier cuenta autenticada (200 con los 7 puntos y su texto).
2. Registrar la visita de la Comisión con un punto que no cumple, con fecha pasada o de hoy → 201, `no_aprobada`, vigente, con la periodicidad y el vencimiento literales (`appliedAt` + 12 meses), el nombre del visitante, el autor y las 7 respuestas con su texto.
3. Consultar el historial del teletrabajador: la vigente y las anteriores.
4. Configurar la empresa a 6 meses (Ajustes de teletrabajo) y registrar otra visita → vence a 6 meses; la anterior conserva su vencimiento (verificación SQL del `revalidation_period_months` de cada fila).
5. Rechazos sin rastro (verificación SQL de conteo): sin nombre del visitante, con fecha de mañana, con un punto repetido, con un punto faltante, con un punto inventado, con el lugar de otro colaborador o dado de baja, y para el colaborador presencial → cada 422 con su `key` y `code` literales.
6. Permisos: quien solo consulta ve el historial (200) pero no puede registrar (403 con su `errorCode`); quien no tiene el módulo no consulta (403); los puntos de la lista los ve igual (200).
7. Aislamiento: la cuenta de la empresa B pide el historial o el detalle de Pedro → 404 con el mismo cuerpo que un id inventado.
8. Vencida en el tiempo: adelantar por SQL el `expires_at` de la vigente a ayer → el historial la reporta vencida y `current` en null; re registrar deja la anterior como vencida (no reemplazada).

Y la sección **Lo que no se revisa aquí** (con motivo, sin pasos inventados): 401 sin sesión, concurrencia y el `UNIQUE` de BD, `invalidateCurrent` (sin endpoint), multipart con `photos[]`, el mapeo a numerales y las HUs hermanas (pantalla, app, alertas).

- [ ] **Step 4: Autocomprobar contra la regla**

Run: `f=docs/superpowers/plans/2026-10-08-registrar-lista-verificacion-teletrabajo-qa-api.md; cm=$(grep -c '^### [0-9]*\.' "$f"); ob=$(grep -c '^Objetivo:' "$f"); echo "escenarios=$cm objetivos=$ob"`
Expected: escenarios = objetivos. Y `grep -nE "app/|modules/|controllers|services|validators|middleware" "$f"` sin resultados (nada del lenguaje del backend ni del interior del repo: la única ruta citable es la del comando del seeder, que la regla permite).

- [ ] **Step 5: Entregar (no recorrer)**

El manual queda **entregado**; quien lo recorre es una persona (regla de ejecución). El seeder temporal **no** se commitea.

```bash
git add docs/superpowers/plans/2026-10-08-registrar-lista-verificacion-teletrabajo-qa-api.md
git commit -m "docs: entrega el manual de QA de la lista de verificación de teletrabajo

Refs: VLRH-H1790812613870"
```

---

## Verificación final (fuera de las tareas)

Al cerrar las cinco tareas, en la rama `feature/VLRH-H1790812613870-registrar-la-lista-de-verificacion-por` con `sae_pruebas` al día (`NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`):

- `NODE_ENV=test node ace test unit --files="constants/"` → **146 passed, 0 failed** (CA13).
- `NODE_ENV=test node ace test unit --files="tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts"` y `--files="tests/unit/routes/nom037_telework_checklist_scope_routes.spec.ts"` → en verde (CA12 y sus Review Focus; CA de rutas).
- `NODE_ENV=test node ace test functional --files="tests/functional/telework_checklist.spec.ts"` → en verde (CA1-CA11 por HTTP).
- `npx tsc --noEmit` y `./node_modules/.bin/eslint .` → exit 0 (líneas base medidas). Si `node ace test` completo trae fallos previos no relacionados, se registran y se exige **cero nuevos**.
- CA14 (censo): `git diff --name-only --diff-filter=AM multitenant...HEAD` — excluyendo `docs/superpowers/` — es **subconjunto exacto** de las filas `nuevo`/`editado` del censo §14; ninguna fila `no-tocado` aparece (`telework_compliance_setting_service.ts`, `file_intake.ts`, `compliance_repse_rbac.ts` intactas).
- DoD §16, lo que aplica aquí: `migration:run`/`rollback` limpios (Task 2 Step 5), seeder `0065` idempotente (dos corridas, mismo conteo), `UNIQUE uq_twca_current_employee` ejercitado por el spec unitario, cero `any`. La corrida de `0062`/`0063` y la asignación de permisos a roles es **paso del despliegue** (Wilvardo), anotado en el commit de Task 1.
- El manual de QA (Task 5) queda **entregado**; el recorrido lo hace una persona. Ni PR ni deploy: el plan termina aquí.