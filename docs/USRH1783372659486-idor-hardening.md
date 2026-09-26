# USRH1783372659486 — Cerrar IDOR en endpoints de detalle y mutación

> HU de negocio: `USRH1783372659486 Cerrar IDOR en endpoints de detalle y mutacion.md`. Spec técnico: `spec-USRH1783372659486.md` (anexo a la tarea, no versionado en este repo).
> Repo: `valanserh-api`. Rama base: `multitenant`.
> Fecha de implementación: 2026-07-08 (PR1/PR2). Defensa en profundidad ESB: 2026-07-09.
> Última actualización del documento: 2026-07-09.

Este documento registra **todo lo que se modificó** para esta HU: PR1 (hotfix), PR2 (IDOR principal) y **ESB-07-08-03-08** (defensa en profundidad sobre los ~29 modelos hijo con acceso directo por PK).

---

## Resumen ejecutivo

Durante la auditoría previa a la implementación se encontró un problema **más grave que el descrito en el spec**: los grupos de rutas de creación/edición/borrado de posiciones y de detalle/creación/edición/borrado de departamentos no montaban **ningún middleware**, ni siquiera `auth()`. No era IDOR (que exige estar autenticado) sino **acceso sin sesión**. Esto se resolvió primero, como **PR1 (hotfix P0, separado)**, antes de continuar con la HU de IDOR propiamente dicha (**PR2**). Después se cerró el residual de modelos hijo con acceso directo (**ESB-07-08-03-08**).

| Entrega | Qué resuelve | Estado |
|---|---|---|
| PR1 | Rutas de posiciones/departamentos sin `auth()` ni `businessScope()` | ✅ Implementado y probado |
| PR2 | IDOR en expedientes de empleado, posiciones y departamentos (show/update/delete) | ✅ Implementado y probado |
| ESB-07-08-03-08 | Defensa en profundidad en ~29 modelos hijo con acceso directo por PK | ✅ Implementado y verificado |

---

## PR1 — Hotfix: rutas sin autenticación (P0)

### Hallazgo

```4:11:start/routes/position_routes.ts (antes)
router
  .group(() => {
    router.post('/', '#controllers/position_controller.store')
    router.put('/:positionId', '#controllers/position_controller.update')
    router.delete('/:positionId', '#controllers/position_controller.delete')
    router.get('/', '#controllers/position_controller.get')
  })
  .prefix('/api/positions')
```

```5:15:start/routes/department_routes.ts (antes)
router.group(() => {
  router.get('/organization', '#controllers/department_controller.getOrganization')
  router.get('/search', '#controllers/department_controller.getSearch')
  router.get('/:departmentId', '#controllers/department_controller.show')
  router.post('/', '#controllers/department_controller.store')
  router.post('/sync-positions', '#controllers/department_controller.syncPositions')
  router.put('/:departmentId', '#controllers/department_controller.update')
  router.delete('/:departmentId', '#controllers/department_controller.delete')
  router.delete('/:departmentId/force-delete', '#controllers/department_controller.forceDelete')
})
 .prefix('/api/departments')
```

Ninguno de los dos grupos montaba `middleware.auth()` ni `middleware.businessScope()`. Cualquiera con acceso a la URL (sin token) podía crear, editar, borrar y listar posiciones y departamentos.

### Validación previa a implementar

Antes de montar el middleware se verificó que no rompiera nada:

1. **`store`/`update` de ambos controladores no validan `businessUnitId` en el validator de Vine** — se lee directo con `request.input('businessUnitId')` y se pasa al modelo sin chequeo. Esto significa que el middleware `businessScope()` puede inyectarlo/validarlo de forma transparente sin tocar el controller (ver `app/middleware/business_unit_scope_middleware.ts:77-116`: acepta UUID nuevo o entero legacy, e inyecta el valor resuelto del header si el campo viene ausente).
2. **El frontend (`RHSystem-BO`) ya envía `Authorization` en el 100% de las llamadas** a `/positions` y `/departments`, vía `PositionService.ts` y `DepartmentService.ts` (ambos arman `GENERAL_HEADERS` con `useAuth().token.value` en el constructor). No hay ninguna llamada anónima a estos endpoints en el repo.
3. **El header `X-Business-Unit-Id` ya se envía de forma global** en cada petición desde `plugins/business-unit-header.client.ts`, que envuelve `window.fetch` y agrega el header siempre que haya una unidad de negocio activa en sesión — cubre también las llamadas de posiciones/departamentos sin que haya que tocar esos servicios.

Con esto confirmado, agregar el middleware era seguro.

### Cambios

**`start/routes/position_routes.ts`**
```diff
 router
   .group(() => {
     router.post('/', '#controllers/position_controller.store')
     router.put('/:positionId', '#controllers/position_controller.update')
     router.delete('/:positionId', '#controllers/position_controller.delete')
     router.get('/', '#controllers/position_controller.get')
   })
   .prefix('/api/positions')
+  .use(middleware.auth())
+  .use(middleware.businessScope())
```

**`start/routes/department_routes.ts`**
```diff
 router.group(() => {
   router.get('/organization', '#controllers/department_controller.getOrganization')
   router.get('/search', '#controllers/department_controller.getSearch')
   router.get('/:departmentId', '#controllers/department_controller.show')
   router.post('/', '#controllers/department_controller.store')
   router.post('/sync-positions', '#controllers/department_controller.syncPositions')
   router.put('/:departmentId', '#controllers/department_controller.update')
   router.delete('/:departmentId', '#controllers/department_controller.delete')
   router.delete('/:departmentId/force-delete', '#controllers/department_controller.forceDelete')
 })
  .prefix('/api/departments')
+ .use(middleware.auth())
+ .use(middleware.businessScope())
```

Efecto colateral **positivo**: `PositionController.get` (index) y `DepartmentController.getOrganization/getSearch` empiezan a filtrar automáticamente por tenant (los modelos `Position`/`Department` ya componen `withBusinessUnitScope`), cerrando también una fuga cross-tenant en los listados que antes no tenían ningún filtro.

### Tests (PR1)

`tests/unit/routes/position_department_scope_hotfix_routes.spec.ts` — 4 tests, verifican por inspección de código fuente (sin servidor ni BD) que el grupo de escritura de cada dominio monta `auth()` + `businessScope()` y que las rutas siguen expuestas.

---

## PR2 — Cerrar IDOR (HU principal)

Alcance confirmado con el usuario en el momento de PR2: **solo lo nombrado literalmente en el spec** — los 4 dominios padre (empleados, sucursales, posiciones, departamentos) + expedientes de empleado como único "dato colgante" con defensa en profundidad. El resto de los modelos hijo detectados se implementó después en **ESB-07-08-03-08** (sección siguiente).

### 1. Expedientes de empleado (`employee_proceeding_files`)

Este era el vector más grave: `EmployeeProceedingFileService.show(id)` consultaba el vínculo por su propio PK **sin ningún filtro de tenant**, y sus rutas standalone (`/api/employees-proceeding-files/*`) solo montaban `auth()` (la excepción era `download`, que ya tenía su propio `businessScopeOptional()` con un `whereHas` manual).

#### 1.1 Migración — defensa en profundidad

**Archivo nuevo:** `database/migrations/1783200000000_add_business_unit_id_to_employee_proceeding_files.ts`

- Agrega `business_unit_id` (INT UNSIGNED) nullable a `employee_proceeding_files`.
- Backfill en un solo `UPDATE ... INNER JOIN` desde `employees.business_unit_id` (cubre también filas soft-deleted, sin reabrir el universo).
- `ALTER` final: `NOT NULL` + índice + FK a `business_units`, todo en un solo statement para minimizar locks.
- Sigue la regla del proyecto (`CLAUDE.md`): nunca `await this.schema` dentro de `up()`; el backfill corre en `this.defer(...)`.

#### 1.2 Modelo — `app/models/employee_proceeding_file.ts`

- Importa y compone `withBusinessUnitScope()`.
- Agrega la columna `businessUnitId` con comentario explicando que se copia del empleado padre, nunca del cliente.

#### 1.3 Servicio — `app/services/employee_proceeding_file_service.ts`

- Nuevo método privado `resolveBusinessUnitIdFromEmployee(employeeId)`: consulta `Employee.query()` (ya escopeado por el mixin) y devuelve `null` si el empleado no existe o está fuera del scope del actor — **nunca confía en un `businessUnitId` que venga en el payload**.
- `create()`: resuelve `businessUnitId` desde el empleado antes de persistir; si el empleado está fuera de scope, devuelve `null` sin crear nada.
- `update()`: si el `employeeId` del payload cambia respecto al actual, vuelve a resolver `businessUnitId` desde el nuevo padre (y rechaza si está fuera de scope); si no cambia, no vuelve a consultar (evita una query innecesaria).

#### 1.4 Controller — `app/controllers/employee_proceeding_file_controller.ts`

- `store`/`update`: manejan el nuevo retorno `null` del service devolviendo **404** uniforme (antes no se contemplaba ese caso).
- `show`/`update`/`delete`: sin cambio de lógica — al tener ahora el modelo su propio `business_unit_id` + mixin, la carga por PK (`EmployeeProceedingFile.query().where('employee_proceeding_file_id', id)`) ya auto-filtra por tenant; el `if (!registro) → 404` preexistente ya cubre el caso "fuera de scope" sin necesitar tocarlo.
- Se agregó `ScopeDeniedLogService.log(...)` en los 4 puntos donde el registro no resuelve (store por empleado fuera de scope, update por vínculo o por nuevo empleado fuera de scope, delete, show).

#### 1.5 Rutas — `start/routes/employee_proceeding_file_routes.ts`

```diff
     router.get(
       '/:employeeProceedingFileId/download',
       '#controllers/employee_proceeding_file_controller.download'
-    ).use(middleware.businessScopeOptional())
+    )
   })
   .prefix('/api/employees-proceeding-files')
   .use(middleware.auth())
+  .use(middleware.businessScope())
```

El middleware obligatorio a nivel de grupo reemplaza el `businessScopeOptional()` que solo protegía `download`; ahora **todo** el dominio (index/store/update/delete/show/download) exige el header `X-Business-Unit-Id`, igual que el resto de dominios ya migrados. `download` mantiene su chequeo manual `whereHas('employee', ...)` para root (que con el mixin activo ahora también queda acotado a la BU seleccionada en el header — antes root podía descargar cualquier expediente sin importar el header; ahora root respeta el header igual que en el resto del sistema, alineado con la regla 7 del spec).

### 2. Posiciones — `app/controllers/position_controller.ts`

`update` y `delete` cargaban `Position` por PK sin ningún filtro de scope, mientras que `show`/`getPdf`/`getExcel` sí lo hacían. Se corrigió:

```diff
- async update({ request, response, i18n }: HttpContext) {
+ async update({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
   ...
   const currentPosition = await Position.query()
     .whereNull('position_deleted_at')
     .where('position_id', positionId)
+    .whereIn('businessUnitId', businessUnitScope)
     .first()
   if (!currentPosition) {
+    await ScopeDeniedLogService.log({ domain: 'position', action: 'update', ... })
     response.status(404)
     ...
```

Mismo patrón en `delete`. `store` no necesitó cambios de código: el middleware de PR1 ya valida/inyecta `businessUnitId` de forma transparente.

### 3. Departamentos — `app/services/department_service.ts` + `app/controllers/department_controller.ts`

`department_service.show(departmentId)` **no filtraba por tenant en absoluto**. Además, `department_controller.show` cargaba el departamento completo (con datos) **antes** de un chequeo de rol que respondía **403** si el departamento no estaba en la lista de departamentos del rol del usuario — revelando la existencia del registro ajeno (violación directa de la regla 4 del spec: "sin distinguir *no existe* de *no es tuyo*").

- **`department_service.ts`**: `show(departmentId, allowedBusinessUnitIds = [])` ahora exige el scope y filtra con `.whereIn('businessUnitId', allowedBusinessUnitIds)` — igual patrón que `position_service.show`. Con scope vacío devuelve `null` sin consultar.
- **`department_controller.ts`**: `show`, `update`, `delete` y `forceDelete` ahora reciben `businessUnitScope` del contexto y filtran la carga por PK. El chequeo de rol (403) permanece **después** de la validación de scope y **solo aplica a departamentos que sí pertenecen al tenant del usuario** — ya no puede ejecutarse sobre un departamento ajeno, porque `departmentService.show` devuelve `null` antes de llegar ahí (nota: ese 403 es un control de acceso por rol *intra-tenant*, distinto del scope de tenant; se mantiene sin cambios porque no es el tipo de fuga que cubre esta HU — ver spec §objetivos).
- Se agregó `ScopeDeniedLogService.log(...)` en los 4 puntos de bloqueo.

`department_controller.getRotationIndex` **no requirió cambios**: el `departmentId` ya se valida contra `businessUnitScope` antes de ejecutar los conteos raw SQL, y esos conteos filtran por ese mismo `departmentId` ya validado — no hay fuga cross-tenant posible ahí. *(Nota aparte, fuera de alcance de IDOR: las 3 queries de `getRotationIndex` interpolan `dateStart`/`dateEnd` directamente en el SQL sin parametrizar — es un riesgo de inyección SQL preexistente, no relacionado con esta HU. Se recomienda escalarlo a Wilvardo como hallazgo aparte.)*

### 4. Log de accesos bloqueados

**Archivo nuevo:** `app/services/scope_denied_log_service.ts`

Reutiliza `LogStore` (Mongo), el mismo mecanismo que ya usa `AccessPointService` para su bitácora. Registra `{ domain, action, requested_id, actor_user_id, business_unit_scope, date }` — nunca el contenido del registro ajeno. Es *best-effort*: si Mongo no está disponible, no lanza (no debe romper la respuesta 404 al cliente).

Se conectó en los 4 dominios tocados: `position` (update/delete), `department` (show/update/delete/forceDelete), `employee_proceeding_file` (store/update/delete/show).

### 5. Formato de errores

Se mantuvo el formato existente de cada dominio (`{type, title, message, data}` sin `code`), tal como se decidió — no se unificó a `{title, detail, key, code}`. El único cambio observable es que los casos fuera de scope ahora responden **404** de forma consistente donde antes había fugas (200 con datos ajenos) o revelación de existencia (403 tras carga completa).

### Tests (PR2)

| Archivo | Qué cubre |
|---|---|
| `tests/unit/services/employee_proceeding_file_service.spec.ts` | `create`/`update` devuelven `null` cuando el empleado padre no resuelve en scope; `update` no vuelve a consultar si `employeeId` no cambió |
| `tests/unit/services/scope_denied_log_service.spec.ts` | El log registra el shape correcto sin contenido del registro ajeno; nunca lanza si Mongo falla |
| `tests/unit/routes/employee_proceeding_file_scope_routes.spec.ts` | El grupo de rutas monta `auth()`+`businessScope()`; `download` ya no depende de middleware individual |
| `tests/unit/controllers/position_department_idor_regression.spec.ts` | `update`/`delete` de posiciones y `show`/`update`/`delete`/`forceDelete` de departamentos filtran por `businessUnitScope` y registran el log de bloqueo |
| `tests/unit/models/employee_proceeding_file_scope.spec.ts` | El modelo compone el mixin, declara la columna, y existe la migración con el patrón correcto (`this.defer`, sin `await this.schema`) |

Total: 25 tests nuevos (4 de PR1 + 21 de PR2), suite completa del proyecto en verde (446/446).

---

## ESB-07-08-03-08 — Defensa en profundidad en modelos hijo

Durante el barrido previo a PR2 se auditaron los ~50 modelos hijo de `Employee`, `BranchOffice`, `Position` y `Department`. Se identificaron **~29 modelos** que son "punto de entrada directo" (consulta por PK propio desde HTTP). En PR2 solo se endureció `employee_proceeding_files`; el resto se cerró en esta entrega con el **mismo patrón**.

### Patrón aplicado (idéntico a proceeding files)

1. **Migración** (`1783300000001` … `1783300000029`): columna `business_unit_id` nullable → backfill `UPDATE … INNER JOIN` desde el padre → `NOT NULL` + índice + FK. Sin `await this.schema` (regla `CLAUDE.md`); el backfill corre en `this.defer(...)`.
2. **Modelo**: compone `withBusinessUnitScope()` + declara `businessUnitId`.
3. **Rutas**: `.use(middleware.businessScope())` después de `auth()` (y `auth()` donde faltaba, p. ej. `employee_medical_condition_routes`).
4. **`@beforeCreate`**: resuelve `businessUnitId` desde el padre vía `#mixins/resolve_parent_business_unit_id` — **nunca** se confía en un valor del cliente. Los services típicos solo asignan `employeeId`/`positionId`/… y dejan el hook completar la BU.

Con el mixin activo y `TenantContext` del middleware, las cargas por PK (`Model.query().where(pk).first()` / `findOrFail`) quedan auto-filtradas por tenant. Los creates siguen funcionando porque el hook rellena `businessUnitId` antes del INSERT `NOT NULL`.

### Helper nuevo

**`app/mixins/resolve_parent_business_unit_id.ts`** — consulta el padre (ya escopeado por su propio mixin) y lanza si no existe o está fuera de alcance.

### Casos especiales

| Caso | Cómo se resolvió |
|---|---|
| `position_salary_range`, `employee_type` | Ya tenían `business_unit_id` → solo se agregó el mixin (y `businessScope()` en rutas de `employee_type`). Sin migración de columna nueva. |
| `position_salary_range_audit` | Backfill/hook desde `position_salary_ranges` vía `range_id` |
| `employee_competency_evaluation`, `employee_kpi_evaluation` | Padre indirecto: `employee_evaluations` (migración `1783300000012` primero) |
| `employee_supplies_response_contract` | Padre: `employee_supplies` |
| `employee_vacation_archive_content` | Padre: `employee_vacation_archives` |
| `employee_shift_changes` | BU canónica desde `employee_id_to` (empleado destino) |
| `employee_medical_condition_routes` | Además de scope, se montó `auth()` (antes el grupo estaba abierto) |

### Inventario cerrado (antes → ahora)

#### Hijos de `Employee` — Critico / Alto (cerrados)

| Modelo | Migración | Riesgo original | Estado |
|---|---|---|---|
| `employee_address` | `1783300000001` | Crítico | ✅ mixin + hook + `businessScope()` |
| `employee_bank` | `1783300000002` | Crítico | ✅ |
| `employee_children` | `1783300000003` | Crítico | ✅ |
| `employee_contract` | `1783300000004` | Crítico | ✅ |
| `employee_emergency_contact` | `1783300000005` | Crítico | ✅ |
| `employee_medical_condition` | `1783300000006` | Crítico | ✅ (+ `auth()` en rutas) |
| `employee_spouse` | `1783300000007` | Crítico | ✅ |
| `employee_annotation` | `1783300000008` | Alto | ✅ |
| `employee_assessment` | `1783300000009` | Alto | ✅ |
| `employee_bonus` | `1783300000010` | Alto | ✅ |
| `employee_device` | `1783300000011` | Alto | ✅ |
| `employee_evaluation` | `1783300000012` | Alto | ✅ |
| `employee_record` | `1783300000013` | Alto | ✅ |
| `employee_shift` | `1783300000014` | Alto | ✅ |
| `employee_shift_changes` | `1783300000015` | Alto | ✅ (BU desde `employeeIdTo`) |
| `employee_supplie` | `1783300000016` | Alto | ✅ |
| `employee_vacation_archive` | `1783300000017` | Alto | ✅ |
| `employee_zone` | `1783300000018` | Alto | ✅ |
| `employee_competency_evaluation` | `1783300000019` | Alto | ✅ (vía `employee_evaluations`) |
| `employee_kpi_evaluation` | `1783300000020` | Alto | ✅ (vía `employee_evaluations`) |
| `employee_supplies_response_contract` | `1783300000021` | Alto | ✅ (vía `employee_supplies`) |
| `employee_vacation_archive_content` | `1783300000022` | Alto | ✅ (vía `employee_vacation_archives`) |
| `employee_type` | (columna ya existía) | Alto | ✅ mixin + `businessScope()` en rutas |

#### Hijos de `Position` / `Department` — Critico / Alto (cerrados)

| Modelo | Migración | Riesgo original | Estado |
|---|---|---|---|
| `position_salary_range_audit` | `1783300000023` | Crítico | ✅ (vía `position_salary_ranges`) |
| `position_assessment_profile` | `1783300000024` | Alto | ✅ |
| `position_business_unit_competency_level` | `1783300000025` | Alto | ✅ |
| `position_kpi` | `1783300000026` | Alto | ✅ |
| `position_specific_function` | `1783300000027` | Alto | ✅ |
| `position_work_tool` | `1783300000028` | Alto | ✅ |
| `department_position` | `1783300000029` | Alto | ✅ |
| `position_salary_range` | (columna ya existía) | Crítico | ✅ mixin + rutas ya con `businessScope()` |

#### Fuera de alcance de ESB (riesgo Medio / ya mitigados)

No requieren columna propia porque no son punto de entrada por PK propio, o ya estaban mitigados:

- **Medio / sin show por PK:** `employee_assist_calendar`, `employee_biometric*`, `employee_certification`, `employee_contract_type`, `employee_record_property`, `employee_salary_history`, `employee_supplie_assignation_photo`, `employee_temporary_assignment`, `position_certification_requirement`, `position_approval_history`.
- **Ya mitigados:** `employee_lactation_period*`, `employee_branch_office`, `branch_office_shift_quota`.

**Nota aparte (no IDOR):** en `employee_address_controller` el update/delete filtraba históricamente por una columna incorrecta (`employee_proceeding_file_id`) — bug funcional a reportar aparte; no forma parte de este endurecimiento de scope.

### Compatibilidad con el funcionamiento original

- Los services de create **no** asignan `businessUnitId` manualmente (p. ej. `EmployeeAddressService.create` solo setea `employeeId`/`addressId`); el `@beforeCreate` lo completa. El contrato HTTP del cliente no cambia.
- `businessScope()` inyecta/valida `businessUnitId` en body/query cuando el dominio lo usa (p. ej. `position_salary_range`); en hijos que no leen ese campo del request, la inyección es inocua.
- Lecturas/updates/deletes por PK pasan a devolver **404** si el registro es de otra BU (antes podían filtrar mal o filtrar nada). Dentro de la misma BU el comportamiento se mantiene.
- **Requisito operativo:** hay que correr las migraciones `178330*` en cada entorno antes de desplegar el código; sin ellas los INSERT fallan por columna ausente / NOT NULL.

### Verificación (2026-07-09)

- `tsc --noEmit`: OK.
- Suite unitaria: 445/446 (1 timeout flaky de i18n NOM-037, no relacionado). Tests IDOR PR1/PR2: 22/22 OK.
- Migraciones: 29 archivos, ninguna usa `await this.schema`.
- Modelos con mixin de scope: incluye los ~29 hijos + padres ya migrados.
- Rutas de los dominios tocados: `auth()` + `businessScope()`.

---

## Archivos afectados (resumen)

**PR1:**
- `start/routes/position_routes.ts`
- `start/routes/department_routes.ts`
- `tests/unit/routes/position_department_scope_hotfix_routes.spec.ts` (nuevo)

**PR2:**
- `database/migrations/1783200000000_add_business_unit_id_to_employee_proceeding_files.ts` (nuevo)
- `app/models/employee_proceeding_file.ts`
- `app/services/employee_proceeding_file_service.ts`
- `app/controllers/employee_proceeding_file_controller.ts`
- `start/routes/employee_proceeding_file_routes.ts`
- `app/controllers/position_controller.ts`
- `app/services/department_service.ts`
- `app/controllers/department_controller.ts`
- `app/services/scope_denied_log_service.ts` (nuevo)
- `tests/unit/services/employee_proceeding_file_service.spec.ts` (nuevo)
- `tests/unit/services/scope_denied_log_service.spec.ts` (nuevo)
- `tests/unit/routes/employee_proceeding_file_scope_routes.spec.ts` (nuevo)
- `tests/unit/controllers/position_department_idor_regression.spec.ts` (nuevo)
- `tests/unit/models/employee_proceeding_file_scope.spec.ts` (nuevo)

**ESB-07-08-03-08:**
- `app/mixins/resolve_parent_business_unit_id.ts` (nuevo)
- `database/migrations/1783300000001_*.ts` … `1783300000029_*.ts` (29 migraciones nuevas)
- Modelos hijo listados arriba (mixin + columna + `@beforeCreate` donde aplica)
- Rutas de esos dominios (`businessScope()`; `auth()` en medical conditions)
- `app/models/position_salary_range.ts`, `app/models/employee_type.ts` (solo mixin / rutas)

**Entorno local (no versionado en git, ajuste de `.env`):**
- `BLIND_INDEX_KEY` (resuelto en sesión anterior)
- `WORK_JOURNAL_HMAC_SECRET` (resuelto en esta sesión para dejar la suite de tests en verde)
