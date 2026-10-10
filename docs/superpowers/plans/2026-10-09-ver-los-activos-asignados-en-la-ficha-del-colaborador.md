# Ver los activos asignados en la ficha del colaborador — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una lectura nueva por colaborador (`GET /api/employees/:employeeId/assets`) y una sección **Activos** de solo consulta en la ficha del colaborador (BO), con vigentes, devueltos y estado del resguardo, visible solo con `supplies:read`.

**Architecture:** En el API, un slice vertical dentro de `app/modules/assets` (puerto → adaptador MySQL con `db.from` → servicio → controller propio), espejo invertido de `findAssignments`, con 404 indistinguible para colaborador ajeno o inexistente y scope de empresa dentro de cada consulta. En el BO, una sección extra del submenú de la ficha (patrón Asistencia): el permiso lo resuelve la ruta padre (`use-employee-assets-section-access` con `supplies:read`, fail-closed) y el panel (`components/employeeAssetsPanel/`) solo consulta.

**Tech Stack:** AdonisJS 6 (Japa, vine, Lucid `db.from`), MySQL, Nuxt 3 / Vue 3 `setup` con vitest, PrimeVue (`Card`, `Tag`, `Skeleton`, `Message`, `Button`), `assetFetch` del slice de activos.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791485252056.md` — copia viva de `VLRH-H1791485252056/spec-VLRH-H1791485252056.md` (Código `VLRH-H1791485252056`, SP 3, target `multitenant`). El plan argumenta desde el spec: léelo completo antes de cada tarea. Revalidar sus anclas contra el código al implementar; el drift trivial se corrige al momento, el de alcance/contrato se escala a Wilvardo.

## Restricciones globales

- **Ramas:** `feature/VLRH-H1791485252056-ver-los-activos-asignados-en-la-ficha-del` en ambos repos, ya creadas y limpias, sobre `multitenant` (api `42f9767`, bo `e31d699`, ambos = `origin/multitenant`). No se crea PR ni se despliega: el plan termina en la verificación automatizada.
- **No tocar** (censo `no-tocado` + no-objetivos): `start/routes/employee_supplies.ts` (la legacy `by-employee` ni se reutiliza ni se retira), `app/modules/assets/assets.controller.ts`, `tests/functional/assets_module.spec.ts` (24 pruebas verdes; los casos nuevos van en su spec propio), `app/constants/system_modules_menu/system_modules.constant.ts`, `pages/supplies/application/use-asset-deep-link.ts`, `resources/scripts/services/EmployeeService`/`EmployeeSupplyService.ts`, y nada de `valanserh-app-employee`.
- **Sin migración, seeder ni modelo Lucid nuevo.** Todo con `db.from` / `db.table`, como el resto del slice.
- **La respuesta no cambia en las HUs siguientes del set:** nada de `teleworkCategory` ni teletrabajo aquí. `teleworkPercentage` solo es campo del perfil interno (`AssetEmployeeProfile`), no viaja en la respuesta.
- **Borrado lógico:** filtrar `employee_supply_deleted_at` (NULL = vivo); NO filtrar `employee_deleted_at` (R12), `supply_deleted_at` ni `supply_type_deleted_at` (R6: el activo y el tipo borrados siguen apareciendo, el activo con `isDeleted: true` y sin enlace).
- **`custodyStatus`** se decide por existencia de contrato de resguardo con `employee_supply_response_contract_deleted_at IS NULL` (su columna de archivo es NOT NULL: no se puede mirar “si la columna trae algo”). No se expone el archivo, la foto, `fileName`, `storedPath` ni `businessUnitId` (CA-12).
- **Tipado:** unión discriminada por `status` (`EmployeeAssetCurrentItemDto` con `retirementDate: null`; `EmployeeAssetHistoryItemDto` con `'retired'`). Cero `any`.
- **Fechas de calendario `YYYY-MM-DD`** vía `calendarDate` del repositorio; `assignedAt` = `COALESCE(asignación, alta)`.
- **i18n es + en** en API y BO, con paridad de claves (BO: `npm run lint:i18n`). **Vocabulario de pantalla:** “devuelto”/“devolución”, nunca “retirado”; el literal `retired` del API no cambia.
- **Commits:** Conventional Commits en español (tipo en inglés, descripción imperativa), cuerpo con el porqué y `Refs: VLRH-H1791485252056`; el hook solo corre eslint.
- **BD de pruebas:** `sae_pruebas` (`NODE_ENV=test`). Si el esquema va atrás, primero `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (un esquema atrasado produce fallos falsos).
- **Fallos preexistentes (línea base, fuera de alcance):** ver “Líneas base medidas”.

## Review Focus

Entradas o condiciones que el spec implica pero ningún CA ejercita, y que por eso son las más propensas a morder a un usuario real. Cada línea lleva su prueba en la tarea dueña del código.

1. **Resguardo con borrado lógico:** un contrato de resguardo con `employee_supply_response_contract_deleted_at` lleno NO cuenta como firmado → `custodyStatus: "unsigned"`. Prueba en Tarea 2 (caso “resguardo borrado lógicamente no firma”).
2. **Asignación sin fecha de asignación** (`employee_supply_assignament_date` NULL): `assignedAt` es la fecha de alta (`COALESCE`) y el orden lo respeta. Prueba en Tarea 2 (caso “sin fecha de asignación usa la de alta”).
3. **Asignación con fecha de vencimiento:** `expiresAt` viaja como `YYYY-MM-DD` o `null` (la forma §11 lo declara y ningún CA lo trae). Prueba en Tarea 2 (caso “fecha de vencimiento”).
4. **Tipo de activo borrado lógicamente:** el nombre del tipo se conserva en el renglón (§10). Prueba en Tarea 2 (caso “tipo borrado conserva su nombre”).
5. **Características `boolean`/`date` en el BO:** `true`/`1` → “Sí”, `false`/`0` → “No”; fecha con formato local (CA-5 solo ejercita `text`). Prueba en Tarea 4 (`employee-assets.helpers.spec.ts`).

---

### Tarea 1 (gsti-rh-api): lectura por colaborador — ruta, permiso, validador, perfil y respuestas

Esqueleto completo del endpoint con datos reales: la consulta de perfil, la ruta con gate, el validador y todas las respuestas de error y de éxito-vacío. Las asignaciones con contenido llegan en la Tarea 2.

**Files:**
- Create: `app/modules/assets/employee_assets.controller.ts`
- Modify: `app/modules/assets/assets.routes.ts` (ruta nueva al final del grupo), `app/constants/supplies_permission_declarations.ts` (declaración `indexEmployeeAssets`), `app/modules/assets/assets.constants.ts` (`ASSET_ERROR_KEYS.EMPLOYEE_NOT_FOUND`, `EMPLOYEE_ASSET_CUSTODY_STATUSES`), `app/modules/assets/assets.error.ts` (factoría `employeeNotFound()`), `app/modules/assets/validators/assets.validator.ts` (`employeeIdParamsValidator`), `app/modules/assets/assets.repository.ts` (puerto: `findEmployeeProfile`), `app/modules/assets/assets.repository.mysql.ts` (adaptador: `findEmployeeProfile`), `app/modules/assets/dto/assets.dto.ts` (tipos §11 completos + `AssetEmployeeProfile`), `app/modules/assets/assets.service.ts` (`employeeAssets`), `resources/langs/es.json` y `resources/langs/en.json` (título, éxito y error de colaborador)
- Test: Create `tests/functional/assets_employee_assets.spec.ts`; Modify `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts` (fila de la ruta) y `tests/functional/supplies_permission_gate.spec.ts` (prueba nueva del gate)

**Interfaces:**
- Consumes: `routeId()` de `validators/assets.validator.ts:28`; `AssetError(httpStatus, key, i18nPrefix, fallbackTitle, fallbackDetail)` y `respondAssetsModuleError(ctx, error)` de `assets.error.ts`; `this.scope()` del servicio; `suppliesStandard` de las declaraciones; `calendarDate` del adaptador.
- Produces (la Tarea 2 y las HUs siguientes del set dependen de todo esto, nombres exactos):
  - `ASSET_ERROR_KEYS.EMPLOYEE_NOT_FOUND: 'colaborador-no-encontrado'` y `AssetError.employeeNotFound(): AssetError` (404, prefijo i18n `asset_employee_not_found`).
  - `employeeIdParamsValidator = vine.compile(vine.object({ employeeId: routeId() }))`.
  - `AssetEmployeeProfile { employeeId: number; employeeSlug: string; businessUnitId: number; teleworkPercentage: number }`.
  - `EMPLOYEE_ASSET_CUSTODY_STATUSES = ['signed', 'unsigned'] as const` y `EmployeeAssetCustodyStatus`.
  - Los tipos de renglón §11: `EmployeeAssetCharacteristicDto`, `EmployeeAssetDto`, `EmployeeAssetItemBase`, `EmployeeAssetCurrentItemDto`, `EmployeeAssetHistoryItemDto`, `EmployeeAssetItemDto`, `EmployeeAssetsDto`.
  - `AssetsRepositoryMysql.findEmployeeProfile(businessUnitIds: readonly number[], employeeId: number): Promise<AssetEmployeeProfile | null>`.
  - `AssetsService.employeeAssets(employeeId: number): Promise<EmployeeAssetsDto>` (en esta tarea devuelve `current: []` e `history: []`; la Tarea 2 las conecta al puerto de asignaciones).
  - Ruta `GET /api/employees/:employeeId/assets` → `#modules/assets/employee_assets.controller.assets`, gate `SUPPLIES_PERMISSION_DECLARATIONS.indexEmployeeAssets` (=`suppliesStandard('read')`, bypass `standard`).

- [ ] **Paso 1: escribir las pruebas en rojo**

`tests/functional/assets_employee_assets.spec.ts` — actores de `#tests/helpers/tenant_actor` (`createTenantActor` con `supplies` exigido, `createBypassActor` owner, `grantModulePermissions`, `businessUnitHeaders`, `cleanupTenantActor`), colaboradores de `#tests/helpers/employee_fixture` (`createEmployeeFixture(businessUnitId, prefix)`, `cleanupEmployeeFixture`), todo se limpia en `group.teardown`. Grupo setup: `assertModuleEnforced('supplies')`, actor en empresa A, segundo actor en empresa B. **El actor de la empresa A lleva `supplies:read` concedido en todos los casos de respuesta 200** (`grantModulePermissions(actor, 'supplies', ['read'])`). Fixture por corrida (`unique()` con timestamp) como `assets_module.spec.ts:41-43`. Casos (nombres y aserciones):

```ts
test('CA-10: id de ruta no numérico o no positivo responde 422 entrada-invalida', ...)
// grant read; GET /api/employees/abc/assets y /api/employees/0/assets
// → 422, body.key === ASSET_ERROR_KEYS.INVALID_INPUT

test('CA-7: colaborador de otra empresa e inexistente responden el mismo 404', ...)
// E2 = createEmployeeFixture(empresa B); GET /api/employees/<E2>/assets y /api/employees/999999999/assets
// → 404 ambos, con deepEqual del cuerpo completo:
//   { type: 'error', title: 'Colaborador no encontrado',
//     message: 'El colaborador no existe o no pertenece a la empresa.',
//     detail: 'El colaborador no existe o no pertenece a la empresa.',
//     key: 'colaborador-no-encontrado', data: null }

test('CA-6: colaborador sin asignaciones responde 200 con listas vacías', ...)
// E1 de la empresa A sin activos → 200, type 'success',
//   data.employeeId === E1.employeeId, data.employeeSlug === E1.employeeSlug,
//   data.current deepEqual [], data.history deepEqual []

test('CA-12: la respuesta no expone archivos ni titulares ajenos', ...)
// sobre el cuerpo de CA-6 (y en la Tarea 2 sobre renglones con datos):
//   JSON.stringify(body) no contiene 'contracts' ni 'photos' ni 'fileName'
//   ni 'storedPath' ni 'businessUnitId'
```

Edición de `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts`: en el contrato de `app/modules/assets/assets.routes.ts` (`:184-198`), fila al final de `gated`:

```ts
{ method: 'get', path: '/employees/:employeeId/assets', handler: '#modules/assets/employee_assets.controller.assets', declaration: supplies('indexEmployeeAssets') },
```

(la prueba “cada declaración la usa exactamente una ruta” exige ruta y declaración en el mismo commit).

Edición de `tests/functional/supplies_permission_gate.spec.ts`: prueba nueva al final del grupo — “la lectura de activos por colaborador pide `supplies:read`; owner pasa por el bypass” — con fixture propio por `db.table` (NADA de `SupplyType.query()`/`Supplie.query()` fuera de request: la línea base de esa suite ya truena por el `TenantContextMissingException` de los fixtures con modelo, heredado de `USRH1789600808831`; no lo arregles aquí, no lo copies):

```ts
test('lectura de activos por colaborador: 403 sin supplies:read, 200 con read, owner cruza por bypass', ...)
// tenant sin concesiones → GET /api/employees/<fixture>/assets → 403 con
//   PERMISSION_GATE_ERROR_CODES.DENIED (assertPermissionDenied)
// grantModulePermissions(tenant, 'supplies', ['read']) → 200
// owner (createBypassActor) con su propio empleado → 200
// super-administrador → 403
```

- [ ] **Paso 2: correr y verificar el rojo**

`NODE_ENV=test node ace test functional --files="assets_employee_assets.spec.ts"`
Esperado: FAIL (404 de ruta inexistente en todos los casos).
`NODE_ENV=test node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"` → FAIL (la declaración no existe).
`NODE_ENV=test node ace test functional --files="supplies_permission_gate.spec.ts"` → FAIL en la prueba nueva.

- [ ] **Paso 3: implementar**

1. `assets.constants.ts`: `EMPLOYEE_NOT_FOUND: 'colaborador-no-encontrado'` en `ASSET_ERROR_KEYS`; `export const EMPLOYEE_ASSET_CUSTODY_STATUSES = ['signed', 'unsigned'] as const` (cerca de `OPEN_ASSIGNMENT_STATUSES`).
2. `assets.error.ts`: factoría estática, mismo patrón que `assetNotFound()` (`assets.error.ts:30-38`):

```ts
/** El colaborador no existe, es de otra empresa o está dado de baja sin ser consultable. */
static employeeNotFound(): AssetError {
  return new AssetError(
    404, ASSET_ERROR_KEYS.EMPLOYEE_NOT_FOUND, 'asset_employee_not_found',
    'Colaborador no encontrado', 'El colaborador no existe o no pertenece a la empresa.'
  )
}
```

3. `validators/assets.validator.ts`: `export const employeeIdParamsValidator = vine.compile(vine.object({ employeeId: routeId() }))`.
4. `dto/assets.dto.ts`: los tipos §11 tal cual el spec (unión discriminada incluida) + `AssetEmployeeProfile`. `EmployeeAssetDto.supplyType.name: string | null` (tipo eliminado conserva nombre, y `LEFT JOIN` puede traer `null`… no: el nombre existe aunque borrado; `null` solo si el join no cruza, por eso `string | null`).
5. `assets.repository.ts` (puerto): `findEmployeeProfile(businessUnitIds: readonly number[], employeeId: number): Promise<AssetEmployeeProfile | null>` con doc “alcance vacío → `null` sin consultar”.
6. `assets.repository.mysql.ts`:

```ts
async findEmployeeProfile(businessUnitIds: readonly number[], employeeId: number): Promise<AssetEmployeeProfile | null> {
  if (businessUnitIds.length === 0) return null
  const [row] = await db.from('employees')
    .where('employee_id', employeeId)
    .whereIn('business_unit_id', [...businessUnitIds])
    // R12: SIN filtro de employee_deleted_at (un colaborador dado de baja sigue consultable)
    .select('employee_id', 'employee_slug', 'business_unit_id', 'employee_telework_percentage')
  if (!row) return null
  return {
    employeeId: Number(row.employee_id),
    employeeSlug: row.employee_slug,
    businessUnitId: Number(row.business_unit_id),
    teleworkPercentage: Number(row.employee_telework_percentage), // DECIMAL llega como texto
  }
}
```

7. `assets.service.ts`:

```ts
/** @throws AssetError 404 `colaborador-no-encontrado` (inexistente o de otra empresa). */
async employeeAssets(employeeId: number): Promise<EmployeeAssetsDto> {
  const scope = this.scope()
  const profile = await this.repository.findEmployeeProfile(scope, employeeId)
  if (!profile) throw AssetError.employeeNotFound()
  // Tarea 2: aquí van las asignaciones (current/history). Esta tarea entrega
  // el contrato con listas vacías.
  return { employeeId: profile.employeeId, employeeSlug: profile.employeeSlug, current: [], history: [] }
}
```

8. `employee_assets.controller.ts`: `@inject()`, constructor con `AssetsService`, método `assets(ctx)` con try/catch a `respondAssetsModuleError`, sobre de éxito con `i18n.t('asset_employee_assets_title', undefined, 'Activos del colaborador')` y `i18n.t('asset_employee_assets_successfully', undefined, 'Activos del colaborador obtenidos correctamente')` (patrón de `assets.controller.ts:298-316`), y bloque `@swagger` `/api/employees/{employeeId}/assets` con 200 (ejemplo §11), 403 (gate), 404 (`key: colaborador-no-encontrado`) y 422 (`key: entrada-invalida`), `tags: [Assets]`, `bearerAuth` y `X-Business-Unit-Id` (patrón de `asset_files.controller.ts`).
9. `supplies_permission_declarations.ts`: `indexEmployeeAssets: suppliesStandard('read')` en el bloque del slice vertical (con el comentario del módulo actualizado en una línea).
10. `assets.routes.ts`: dentro del grupo, al final:

```ts
router
  .get('/employees/:employeeId/assets', '#modules/assets/employee_assets.controller.assets')
  .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexEmployeeAssets))
```

11. `resources/langs/es.json` + `en.json` (junto a las claves `asset_*`, ~línea 3424): `asset_employee_assets_title` “Activos del colaborador” / “Employee assets”, `asset_employee_assets_successfully` “Activos del colaborador obtenidos correctamente” / “Employee assets retrieved successfully”, `asset_employee_not_found_title` “Colaborador no encontrado” / “Employee not found”, `asset_employee_not_found_detail` “El colaborador no existe o no pertenece a la empresa.” / “The employee does not exist or does not belong to the company.”

- [ ] **Paso 4: correr y verificar el verde**

```
NODE_ENV=test node ace test functional --files="assets_employee_assets.spec.ts"     → PASSED
NODE_ENV=test node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"  → 22 passed (línea base)
NODE_ENV=test node ace test functional --files="supplies_permission_gate.spec.ts"   → solo los 2 fallos preexistentes
NODE_ENV=test node ace test unit --files="constants/"                              → PASSED (146, línea base)
npm run typecheck                                                                   → exit 0
npx eslint app/modules/assets app/constants/supplies_permission_declarations.ts resources/langs/es.json resources/langs/en.json tests/functional/assets_employee_assets.spec.ts tests/functional/supplies_permission_gate.spec.ts tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts  → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/employee_assets.controller.ts app/modules/assets/assets.routes.ts app/constants/supplies_permission_declarations.ts app/modules/assets/assets.constants.ts app/modules/assets/assets.error.ts app/modules/assets/validators/assets.validator.ts app/modules/assets/assets.repository.ts app/modules/assets/assets.repository.mysql.ts app/modules/assets/dto/assets.dto.ts app/modules/assets/assets.service.ts resources/langs/es.json resources/langs/en.json tests/functional/assets_employee_assets.spec.ts tests/functional/supplies_permission_gate.spec.ts tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts
git commit -m "feat(activos): agrega la lectura de activos por colaborador con gate de supplies:read

Puerto, perfil del colaborador, validador y respuestas de error; el
inexistente y el de otra empresa devuelven el mismo 404.

Refs: VLRH-H1791485252056"
```

---

### Tarea 2 (gsti-rh-api): asignaciones — mapeo, orden, resguardos y características

El contenido de las listas: consulta invertida de `findAssignments` (`es.employee_id`), contratos por lote (solo existencia de uno vivo), características por lote (el valor vigente), partición vigentes/devueltos y el reorden R3 en el servicio.

**Files:**
- Modify: `app/modules/assets/assets.repository.ts` (puerto `findEmployeeAssignments`), `app/modules/assets/assets.repository.mysql.ts`, `app/modules/assets/assets.service.ts`, `tests/functional/assets_employee_assets.spec.ts` (casos nuevos)
- Test: el spec de la Tarea 1 (mismo archivo, casos de datos)

**Interfaces:**
- Consumes: todo lo producido en la Tarea 1; `OPEN_ASSIGNMENT_STATUSES`/`calendarDate`/`orderByRaw` del patrón `findAssignments` (`assets.repository.mysql.ts:412-530`); el patrón "último valor" de `findCharacteristicValues` (`:369-410`).
- Produces: `AssetsRepositoryMysql.findEmployeeAssignments(businessUnitIds: readonly number[], employeeId: number): Promise<EmployeeAssetItemDto[]>` (alcance vacío → `[]` sin consultar); las listas `current`/`history` de `EmployeeAssetsDto` con el orden R3. La respuesta §11 queda completa y **estable** para las HUs siguientes (la matriz cruza `supplyId` desde el BO).

- [ ] **Paso 1: escribir los casos de datos en rojo** (mismo archivo de la Tarea 1)

Fixtures (owner con bypass arma el catálogo por la API; los estados históricos por `db.table`, NADA de modelos Lucid en `query()` fuera de request):

```ts
async function createType(name)  // POST /api/supply-types { supplyTypeName } → 201 → data.supplyType.supplyTypeId
async function createAsset(body) // POST /api/supplies { supplyFileNumber: unique('ACT'), supplyName, supplyTypeId,
                                //                            supplySerialNumber? } → 201 → data.supplie.supplyId
async function assign(employeeId, supplyId, date) // POST /api/employee-supplies { employeeId, supplyId,
                        //   employeeSupplyAssignamentDate: date } → 201 → data.employeeSupply.employeeSupplyId
```

Fixture común CA-1 (empresa A, colaborador `E1`): laptop `L` asignada 2026-08-01 **con** resguardo vivo; monitor `M` asignado 2026-08-15 **sin** resguardo; celular `C` asignado 2026-01-10 y devuelto 2026-09-01 con motivo “Cambio de equipo”; tablet `T` asignada 2026-05-01 y devuelta 2026-06-01. Devoluciones y estados por `db.table('employee_supplies').where('employee_supply_id', id).update({ employee_supply_status: 'retired', employee_supply_retirement_date: '...', employee_supply_retirement_reason: '...', employee_supply_updated_at: new Date() })`. Resguardo vivo de `L`:

```ts
await db.table('employee_supplies_response_contracts').insert({
  employee_supply_id: <L>, business_unit_id: <empresa A>,
  employee_supply_response_contract_uuid: unique('uuid'),
  employee_supply_response_contract_file: 'resguardo-l.pdf',
  employee_supply_response_contract_created_at: new Date(),
})
```

(patrón de `assets_module.spec.ts:807-813`). Casos:

```ts
test('CA-1: vigentes y devueltos con resguardo firmado o sin firmar', ...)
// GET → 200; data.current deepEqual-orden [M, L] (asignación desc: 08-15 > 08-01)
//   M: status 'active', custodyStatus 'unsigned', retirementDate null
//   L: status 'active', custodyStatus 'signed', retirementDate null
//   cada renglón: asset.name, asset.fileNumber, asset.supplyType.name, asset.serialNumber (null si no hay)
//   L.characteristics deepEqual [] aquí (sin características capturadas)
// data.history [C]: status 'retired', retirementDate '2026-09-01',
//   retirementReason 'Cambio de equipo', custodyStatus 'unsigned'

test('CA-2: los devueltos se ordenan por fecha de devolución, no de asignación', ...)
// fixture C y T: por asignación sería [T(05-01), C(01-10)]; por devolución es [C(09-01), T(06-01)]
// → data.history es exactamente [C, T]
// más un renglón devuelto SIN employee_supply_retirement_date: se ordena por su fecha de
//   asignación; empate de fechas → employeeSupplyId desc

test('CA-3: una asignación en envío aparece en vigentes con status shipping', ...)
// db update status 'shipping' → data.current[0].status === 'shipping'

test('CA-4: activo extraviado sigue en vigentes; activo eliminado sigue en devueltos sin ser ocultado', ...)
// db.table('supplies').update({ supply_status: 'lost' }) en L → sigue en current con
//   asset.status 'lost', asset.isDeleted false
// db.table('supplies').update({ supply_deleted_at: new Date() }) en C → sigue en history con
//   asset.isDeleted true y su nombre, folio y tipo presentes

test('CA-5: características capturadas: solo el valor vigente, sin las que no tienen valor', ...)
// tipo de L con características "Modelo" (text) y "RAM" (number) por
//   POST /api/supplie-characteristics { supplyTypeId, supplieCaracteristicName, supplieCaracteristicType }
// valores por db.table('supplie_caracteristic_values').insert({ supplie_id: L,
//   supplie_caracteristic_id, supplie_caracteristic_value_value, supplie_caracteristic_value_created_at: new Date() })
//   (columnas NOT NULL: value y created_at; + business_unit_id de la migración 1789528333528)
// dos valores para "Modelo" (ids crecientes: "Latitude 5430" y luego "Latitude 5440"), ninguno para "RAM"
// → L.asset.characteristics deepEqual [{ characteristicId, name: 'Modelo', type: 'text', value: 'Latitude 5440' }]
//   (sin "RAM"; ordenadas por characteristicId asc)

test('CA-9: un colaborador dado de baja sigue consultable con sus activos', ...)
// db.table('employees').update({ employee_deleted_at: new Date() }) en E1 → 200 (no 404)

test('RF-1: un resguardo borrado lógicamente no cuenta como firmado', ...)
// contrato de L con employee_supply_response_contract_deleted_at lleno → custodyStatus 'unsigned'

test('RF-2: asignación sin fecha de asignación usa la fecha de alta', ...)
// db.table('employee_supplies').insert({ employee_id, supply_id, business_unit_id, status 'active',
//   employee_supply_created_at: '2026-03-05 ...' }) SIN assignament_date → assignedAt '2026-03-05'
//   (y el orden de current lo respeta)

test('RF-3: la fecha de vencimiento viaja como YYYY-MM-DD o null', ...)
// db update employee_supply_expiration_date '2027-08-01' en M → expiresAt '2027-08-01'; en L sigue null

test('RF-4: un tipo de activo borrado lógicamente conserva su nombre', ...)
// db.table('supply_types').update({ supply_type_deleted_at: new Date() }) en el tipo de L
//   → asset.supplyType.name sigue siendo el original
```

- [ ] **Paso 2: correr y verificar el rojo**

`NODE_ENV=test node ace test functional --files="assets_employee_assets.spec.ts"` → FAIL en los casos de datos (las listas vienen vacías).

- [ ] **Paso 3: implementar**

Puerto (`assets.repository.ts`): `findEmployeeAssignments(businessUnitIds: readonly number[], employeeId: number): Promise<EmployeeAssetItemDto[]>` (“alcance vacío → `[]` sin consultar”). Adaptador (`assets.repository.mysql.ts`), espejo invertido de `findAssignments` con el mismo `calendarDate` y el mismo `orderByRaw`:

```ts
async findEmployeeAssignments(businessUnitIds: readonly number[], employeeId: number): Promise<EmployeeAssetItemDto[]> {
  if (businessUnitIds.length === 0) return []
  const rows = await db
    .from('employee_supplies as es')
    .join('supplies as s', 's.supply_id', 'es.supply_id')
    // sin filtro de s.supply_deleted_at (R6): el activo eliminado sigue saliendo con isDeleted
    .leftJoin('supply_types as st', 'st.supply_type_id', 's.supply_type_id') // sin filtro de borrado
    .where('es.employee_id', employeeId)
    .whereNull('es.employee_supply_deleted_at') // la asignación borrada sí se oculta
    .whereIn('es.business_unit_id', [...businessUnitIds])
    .whereIn('s.business_unit_id', [...businessUnitIds]) // el scope DENTRO de la consulta (§13)
    .orderByRaw('COALESCE(es.employee_supply_assignament_date, es.employee_supply_created_at) DESC, es.employee_supply_id DESC')
    .select(
      'es.employee_supply_id', 'es.employee_supply_status', 'es.employee_supply_retirement_reason',
      's.supply_id', 's.supply_name', 's.supply_file_number', 's.supply_serial_number',
      's.supply_status', 's.supply_deleted_at',
      'st.supply_type_id', 'st.supply_type_name',
      calendarDate('COALESCE(es.employee_supply_assignament_date, es.employee_supply_created_at)', 'assigned_at'),
      calendarDate('es.employee_supply_expiration_date', 'expires_at'),
      calendarDate('es.employee_supply_retirement_date', 'retirement_date'),
    )
  if (rows.length === 0) return []

  // Contratos por lote SOLO para saber si existe uno vivo (nunca se expone el archivo).
  // Características por lote: una sola consulta con IN (supplyIds), quedándose con el
  // valor de MAYOR supplie_caracteristic_value_id por (supply, característica) — el
  // equivalente por-lote del MAX(...) de findCharacteristicValues (:369-410) — y
  // descartando los valores NULL/'' (sin valor capturado no hay renglón, CA-5).
  const [contractRows, characteristicRows] = await Promise.all([ /* las dos consultas */ ])
  const signedSupplyIds = new Set(contractRows.map((row) => row.employee_supply_id))
  const latestBySupplyCharacteristic = new Map<string, CharRow>()
  // caracteristicas ordenadas por supplie_caracteristic_value_id asc → la última escritura gana
  return rows.map((row) => ({ /* renglón §11 con variantes por status */ }))
}
```

Características: `db.from('supplie_caracteristic_values as scv').join('supplie_caracteristics as sc', ...)` con `whereIn('scv.supplie_id', supplyIds)`, `whereNull` de ambos `deleted_at`, `orderBy('scv.supplie_caracteristic_value_id', 'asc')`, y en JS un `Map` con clave `` `${supplie_id}:${supplie_caracteristic_id}` `` (la última fila gana = MAX id); por activo, orden `characteristicId` asc, solo valores no nulos. Resguardos firmados: `Set` de `employee_supply_id` con `whereNull('employee_supply_response_contract_deleted_at')`.

Servicio (`assets.service.ts`), partición y reorden R3 (los vigentes conservan el orden SQL; los devueltos se reordenan en JS):

```ts
const assignments = await this.repository.findEmployeeAssignments(scope, employeeId)
const current = assignments.filter(
  (row): row is EmployeeAssetCurrentItemDto => (OPEN_ASSIGNMENT_STATUSES as readonly string[]).includes(row.status),
)
const history = assignments
  .filter((row): row is EmployeeAssetHistoryItemDto => row.status === 'retired')
  .sort((a, b) => {
    // fechas YYYY-MM-DD: comparación de cadenas, desc (R3); sin fecha de devolución,
    // la de asignación; empate → employeeSupplyId desc
    const dateA = a.retirementDate ?? a.assignedAt
    const dateB = b.retirementDate ?? b.assignedAt
    if (dateA !== dateB) return dateA < dateB ? 1 : -1
    return b.employeeSupplyId - a.employeeSupplyId
  })
return { employeeId: profile.employeeId, employeeSlug: profile.employeeSlug, current, history }
```

- [ ] **Paso 4: correr y verificar el verde**

```
NODE_ENV=test node ace test functional --files="assets_employee_assets.spec.ts"    → PASSED (todos los casos)
NODE_ENV=test node ace test functional --files="assets_module.spec.ts"            → PASSED (24, sin regresión)
NODE_ENV=test node ace test functional --files="supplies_permission_gate.spec.ts"  → solo los 2 preexistentes
npm run typecheck                                                                  → exit 0
npx eslint app/modules/assets tests/functional/assets_employee_assets.spec.ts      → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/assets.repository.ts app/modules/assets/assets.repository.mysql.ts app/modules/assets/assets.service.ts tests/functional/assets_employee_assets.spec.ts
git commit -m "feat(activos): agrega las asignaciones por colaborador con vigentes, devueltos y resguardo

Espejo invertido de findAssignments con contratos y características
por lote; el histórico se reordena por fecha de devolución (R3).

Refs: VLRH-H1791485252056"
```

---

### Tarea 3 (gsti-rh-bo): sección Activos — submenú, acceso y página

La ficha gana la sección al final del submenú, con el permiso resuelto fail-closed por la ruta padre, y la página que monta el panel (que llega en la Tarea 4).

**Files:**
- Create: `pages/employees/[employeeSlug]/application/use-employee-assets-section-access.ts`, `pages/employees/[employeeSlug]/assets.vue`, `pages/employees/[employeeSlug]/assets.script.ts`
- Modify: `components/employeeSectionsMenu/domain/employee-section.type.ts` (`'assets'`), `components/employeeSectionsMenu/domain/employee-section.const.ts` (entrada al final), `components/employeeSectionsMenu/domain/employee-section-permission.const.ts` (`assets: []`), `components/employeeSectionsMenu/domain/employee-section-icon.const.ts` (trazos `device-laptop`), `components/employeeSectionsMenu/domain/locales/employee-sections-menu.es.json` + `.en.json`, `pages/employees/[employeeSlug]/domain/employee-extra-sections.interface.ts` (`canReadAssets`), `pages/employees/[employeeSlug]/domain/employee-extra-sections.helpers.ts` (empuja `assets`), `pages/employees/[employeeSlug]/domain/employee-detail.const.ts` (`canReadAssets` en `EmployeeDetailContext`), `pages/employees/[employeeSlug]/domain/locales/employee-detail.es.json` + `.en.json` (`breadcrumb.assets`), `pages/supplies/domain/supplies.enum.ts` (`SUPPLIES_PERMISSION.READ`), `pages/employees/[employeeSlug]/script.ts`
- Test: Create `tests/employeeDetail/use-employee-assets-section-access.spec.ts`; Modify `tests/employeeSectionsMenu/employee-section.helpers.spec.ts`, `tests/employeeSectionsMenu/employee-section-permission.spec.ts`, `tests/employeeDetail/use-employee-attendance-section-access.spec.ts`

**Interfaces:**
- Consumes: patrón completo de asistencia — `application/use-employee-attendance-section-access.ts` (espejo), `attendance.vue`/`attendance.script.ts` (página), cableado en `script.ts:120-138` (instanciación y `allowedSections`), `:269-291` (`provide(EMPLOYEE_DETAIL_CONTEXT, ...)`), `:303-306` (`onMounted` con `hydrate`); `generalStore.hasAccess(moduleSlug, permissionSlug)`; `SUPPLIES_MODULE_SLUG` (`pages/supplies/domain/supplies.const.ts:7`).
- Produces (la Tarea 4 los consume):
  - `EmployeeSectionId` incluye `'assets'`; `EMPLOYEE_SECTION_ITEMS` termina en `{ id: 'assets', labelKey: 'employee_sections_menu.assets', icon: 'device-laptop' }`; `EMPLOYEE_SECTION_TAB_SOURCES.assets: []` (sección extra: su visibilidad no deriva del expediente).
  - `EmployeeExtraSectionsPermissions.canReadAssets: boolean`; `resolveEmployeeExtraSections` empuja `'assets'` al final.
  - `EmployeeDetailContext.canReadAssets: ComputedRef<boolean>` (inyectado por `script.ts`).
  - `useEmployeeAssetsSectionAccess(deps: { hasAccess: (moduleSlug, permissionSlug) => Promise<boolean> }): { canReadAssets: ComputedRef<boolean>; hydrate: () => Promise<void> }` — arranca `false`, pregunta `hasAccess(SUPPLIES_MODULE_SLUG, SUPPLIES_PERMISSION.READ)`, falla cerrado.
  - `SUPPLIES_PERMISSION.READ: 'read'`.
  - Ruta `/employees/[employeeSlug]/assets` que monta el panel solo con `employeeId && canReadAssets` (guarda de URL directa, CA-8).

- [ ] **Paso 1: escribir las pruebas en rojo**

1. `tests/employeeSectionsMenu/employee-section.helpers.spec.ts`: `EMPLOYEE_SECTION_ITEMS` pasa de 10 a **11** y hay una prueba de orden con la lista completa:

```ts
expect(EMPLOYEE_SECTION_ITEMS.map((item) => item.id)).toEqual([
  'information', 'attendance', 'biometrics', 'vacations', 'disabilities',
  'evaluations', 'responsibles', 'career-path', 'certifications', 'file', 'assets',
]) // assets al final, después de Expediente (file)
```
2. `tests/employeeSectionsMenu/employee-section-permission.spec.ts`: el mapa cubre las once secciones (ya lo hace por construcción: keys == ITEMS); agrega la prueba explícita: `resolveVisibleSections({ visibleTabKeys: [], extraVisibleSections: ['assets'] })` contiene `'assets'` — la sección solo llega por `extraVisibleSections`, nunca por pestañas del expediente.
3. `tests/employeeDetail/use-employee-attendance-section-access.spec.ts`: `ALL_GRANTED`/`NONE_GRANTED` ganan `canReadAssets: true/false`; el orden de `resolveEmployeeExtraSections(ALL_GRANTED)` pasa a `['attendance', 'vacations', 'disabilities', 'assets']`; un rol sin `canReadAssets` no recibe `'assets'`.
4. `tests/employeeDetail/use-employee-assets-section-access.spec.ts` (nuevo, espejo del de asistencia):

```ts
it('arranca cerrado antes de consultar el permiso')                      // canReadAssets.value === false
it('pregunta read al módulo supplies, no a employees', async () => {})  // hasAccess('supplies', 'read'); true
it('falla cerrado si la consulta del permiso revienta', async () => {})  // throw → false
it('un rol sin supplies:read no recibe la sección de activos', async () => {})
  // resolveEmployeeDetailSections({ visibleTabKeys: [], permissions: {...NONE, canReadAssets} }) sin 'assets'
```

5. En el mismo archivo, verificación por texto (patrón del “cableado” del spec de asistencia, `read()` de archivos):

```ts
describe('cableado de la sección de activos en el detalle', () => {
  it('el orquestador arma el submenú y publica canReadAssets', () => {
    const script = read('pages/employees/[employeeSlug]/script.ts')
    expect(script).toContain('useEmployeeAssetsSectionAccess({')
    expect(script).toContain('canReadAssets: assetsSectionAccess.canReadAssets.value')
    expect(script).toContain('canReadAssets: assetsSectionAccess.canReadAssets,')
    expect(script).toContain('void assetsSectionAccess.hydrate()')
  })
  it('la ruta de activos no monta el panel sin supplies:read', () => {
    expect(read('pages/employees/[employeeSlug]/assets.vue')).toContain('v-if="employeeId && canReadAssets"')
    expect(read('pages/employees/[employeeSlug]/assets.script.ts')).toContain('useEmployeeSectionHead(\'assets\')')
  })
})
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/employeeSectionsMenu tests/employeeDetail` → FAIL (los tipos y constantes no existen).

- [ ] **Paso 3: implementar**

1. `employee-section.type.ts`: `| 'file'` gana `| 'assets'` (último).
2. `employee-section.const.ts`: al final de `EMPLOYEE_SECTION_ITEMS`: `{ id: 'assets', labelKey: 'employee_sections_menu.assets', icon: 'device-laptop' }`.
3. `employee-section-icon.const.ts`: trazos literales de Tabler `device-laptop`:

```ts
'device-laptop': [
  'M3 19l18 0',
  'M5 7a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -8',
],
```

4. `employee-section-permission.const.ts`: `assets: []` con comentario: sección extra cuyo permiso (`supplies:read`) resuelve el orquestador, como `attendance`.
5. `locales/employee-sections-menu.es.json`: `"assets": "Activos"`; `.en.json`: `"assets": "Assets"` (dentro de `employee_sections_menu`).
6. `supplies.enum.ts`: `SUPPLIES_PERMISSION` gana `READ: 'read'` (antes de CREATE, orden alfabético con el resto).
7. `application/use-employee-assets-section-access.ts`: espejo exacto de `use-employee-attendance-section-access.ts` con `SUPPLIES_MODULE_SLUG` + `SUPPLIES_PERMISSION.READ`, nombre `canReadAssets`, y el comentario de por qué: la sección muestra la misma información de Activos e insumos vista desde la persona, así que exige su lectura; sin ella ni el submenú ni la URL directa abren el panel.
8. `employee-extra-sections.interface.ts`: `canReadAssets: boolean` (comentario: lectura de Activos e insumos, dueño de la sección).
9. `employee-extra-sections.helpers.ts`: al final de `resolveEmployeeExtraSections`, `if (permissions.canReadAssets) sections.push('assets')` (el orden final lo fija `EMPLOYEE_SECTION_ITEMS`, así que `assets` queda tras `file`).
10. `employee-detail.const.ts`: `EmployeeDetailContext` gana `canReadAssets: ComputedRef<boolean>` con el mismo comentario de `canReadAttendance` (`:44-49`).
11. `script.ts`: instanciar tras el de asistencia (`:120-123`):

```ts
const assetsSectionAccess = useEmployeeAssetsSectionAccess({
  hasAccess: (systemModuleSlug, systemPermissionSlug) =>
    generalStore.hasAccess(systemModuleSlug, systemPermissionSlug),
})
```

`allowedSections` (`:128-138`) gana `canReadAssets: assetsSectionAccess.canReadAssets.value` en `permissions`; `provide(EMPLOYEE_DETAIL_CONTEXT, ...)` (`:269-291`) gana `canReadAssets: assetsSectionAccess.canReadAssets,` junto a `canReadAttendance`; `onMounted` (`:303-306`) gana `void assetsSectionAccess.hydrate()`.

12. `assets.vue` (espejo de `attendance.vue`, el `div` raíz es para `pageTransition`):

```vue
<template>
  <div>
    <!-- El permiso lo resuelve la ruta padre (fail-closed): sin supplies:read no se
         monta el panel ni se dispara la petición, ni desde el submenú ni por URL directa. -->
    <employeeAssetsPanel v-if="employeeId && canReadAssets" :employee-id="employeeId" />
  </div>
</template>
<script>
import Script from './assets.script.ts'
export default Script
</script>
```

13. `assets.script.ts` (espejo de `attendance.script.ts`):

```ts
export default defineComponent({
  name: 'employeeAssetsSection',
  setup() {
    useEmployeeSectionHead('assets') // usa breadcrumb.assets, registrado en los locales del padre
    const context = useEmployeeDetailContext()
    const employeeId = computed<number | null>(() => context.employee.value?.employeeId ?? null)
    return { employeeId, canReadAssets: context.canReadAssets }
  },
})
```

14. `locales/employee-detail.es.json` / `.en.json`: `breadcrumb.assets`: “Activos” / “Assets” (el `script.ts` del padre ya fusiona estos locales; la clave alimenta el título de la pestaña y el breadcrumb).

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/employeeDetail tests/employeeSectionsMenu   → PASSED (101 + nuevas)
npm run lint:i18n                                                 → sin claves nuevas sin traducción
npm run lint:icons                                                → grosor uniforme
npx eslint components/employeeSectionsMenu 'pages/employees/[employeeSlug]' pages/supplies/domain tests/employeeSectionsMenu tests/employeeDetail
                                                                  → 0 errores (línea base: 1 warning preexistente de v-html)
```

- [ ] **Paso 5: commit**

```bash
git add components/employeeSectionsMenu pages/employees/[employeeSlug] pages/supplies/domain/supplies.enum.ts tests/employeeSectionsMenu tests/employeeDetail
git commit -m "feat(empleados): agrega la sección Activos al submenú de la ficha con acceso fail-closed

La sección es extra (no deriva del expediente): la abre supplies:read,
resuelta por la ruta padre para cubrir también la URL directa.

Refs: VLRH-H1791485252056"
```

---

### Tarea 4 (gsti-rh-bo): panel de activos del colaborador

`components/employeeAssetsPanel/`: cards de vigentes y devueltos, estados de carga/error/vacío, enlaces al activo en su pestaña de resguardo y detalles responsivos. Solo consulta: cero escrituras.

**Files:**
- Create: `components/employeeAssetsPanel/index.vue`, `components/employeeAssetsPanel/script.ts`, `components/employeeAssetsPanel/style.scss`, `components/employeeAssetsPanel/domain/employee-assets.interface.ts`, `components/employeeAssetsPanel/domain/employee-assets.helpers.ts`, `components/employeeAssetsPanel/domain/locales/employee-assets-panel.es.json`, `components/employeeAssetsPanel/domain/locales/employee-assets-panel.en.json`, `components/employeeAssetsPanel/application/use-employee-assets.ts`, `components/employeeAssetsPanel/infrastructure/employee-assets.repository.ts`
- Test: Create `tests/employeeAssetsPanel/employee-assets.helpers.spec.ts`

**Interfaces:**
- Consumes: `employeeId` por prop y `canReadAssets` de la guarda (Tarea 3); `assetFetch(params: AssetRequestParams, path, options)` de `pages/supplies/infrastructure/asset-http.ts:23-43` (se importa, NO se copia); `ASSET_QUERY` de `pages/supplies/domain/asset.const.ts` y `ASSET_DRAWER_TAB` de `pages/supplies/domain/asset.enum.ts` (mismos con que arma la Matriz: `expiration-matrix.helpers.ts:170-178`); `emptyState` (props `title`/`description`/`isSearch`), PrimeVue `Card`, `Tag`, `Skeleton`, `Message`, `Button`; `localePath` para el deep link.
- Produces: componente `EmployeeAssetsPanel` (prop `employeeId: number`); helpers puros testeados:

```ts
// domain/employee-assets.helpers.ts
buildAssetLink(asset: EmployeeAsset): RouteLocation | null
  // { path: '/supplies', query: { [ASSET_QUERY.ASSET]: String(asset.supplyId),
  //                              [ASSET_QUERY.TAB]: ASSET_DRAWER_TAB.RESGUARDO } }
  // null si asset.isDeleted (CA-4: renglón sin enlace)
formatCharacteristicValue(characteristic: EmployeeAssetCharacteristic, locale: string, labels: { yes: string; no: string }): string
  // text/number → value tal cual; boolean: 'true'|'1' → labels.yes, 'false'|'0' → labels.no (RF-5);
  // date → new Date(value).toLocaleDateString(locale)
resolveAssignmentStatusSeverity(status: AssetAssignmentStatus): 'success' | 'warn'
  // 'active' → 'success'; 'shipping' → 'warn'
```

```ts
// domain/employee-assets.interface.ts — espejo de la respuesta §11 (sin expiresAt fuera del contrato del API)
interface EmployeeAssetCharacteristic { characteristicId: number; name: string; type: 'text' | 'number' | 'date' | 'boolean'; value: string }
interface EmployeeAsset { supplyId: number; name: string; fileNumber: string; serialNumber: string | null;
  status: 'active' | 'inactive' | 'lost' | 'damaged'; isDeleted: boolean;
  supplyType: { supplyTypeId: number; name: string | null }; characteristics: EmployeeAssetCharacteristic[] }
interface EmployeeAssetRow { employeeSupplyId: number; assignedAt: string; expiresAt: string | null;
  custodyStatus: 'signed' | 'unsigned'; asset: EmployeeAsset }
interface EmployeeAssetCurrentRow extends EmployeeAssetRow { status: 'active' | 'shipping' }
interface EmployeeAssetHistoryRow extends EmployeeAssetRow { status: 'retired'; retirementDate: string | null; retirementReason: string | null }
interface EmployeeAssetsData { employeeId: number; employeeSlug: string; current: EmployeeAssetCurrentRow[]; history: EmployeeAssetHistoryRow[] }
```

```ts
// infrastructure/employee-assets.repository.ts
export const employeeAssetsRepository = {
  fetchByEmployee(params: AssetRequestParams, employeeId: number): Promise<EmployeeAssetsData>,
  // assetFetch(params, `/employees/${employeeId}/assets`) → response.data
}
// application/use-employee-assets.ts
useEmployeeAssets(deps: { repository: typeof employeeAssetsRepository }, employeeId: Ref<number | null>): {
  loading: Ref<boolean>; error: Ref<boolean>; data: Ref<EmployeeAssetsData | null>;
  load: () => Promise<void>; retry: () => void,
}
```

- [ ] **Paso 1: escribir la prueba en rojo**

`tests/employeeAssetsPanel/employee-assets.helpers.spec.ts`:

```ts
it('arma el enlace al activo en su pestaña de resguardo')
  // buildAssetLink(asset activo) → { path: '/supplies', query: { activo: '31', tab: 'resguardo' } }
it('no arma enlace para un activo eliminado del catálogo')
  // buildAssetLink({ ...asset, isDeleted: true }) → null
it('formatea las características: texto, número, booleano y fecha')
  // text 'Latitude 5440' → tal cual; number → tal cual;
  // boolean '1'/'true' → labels.yes ('Sí'), '0'/'false' → labels.no ('No');
  // date '2026-08-01' → new Date('2026-08-01').toLocaleDateString('es-MX')
it('resuelve la severidad del chip de asignación')
  // 'active' → 'success'; 'shipping' → 'warn'
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/employeeAssetsPanel` → FAIL (el archivo de helpers no existe).

- [ ] **Paso 3: implementar**

1. `domain/employee-assets.interface.ts` y `domain/employee-assets.helpers.ts` tal como están en Interfaces (los helpers puros, sin `useI18n`: los labels de Sí/No los pasa el `script.ts` del panel).
2. `infrastructure/employee-assets.repository.ts`: `assetFetch` importado de `~/pages/supplies/infrastructure/asset-http`.
3. `application/use-employee-assets.ts`: `loading`/`error`/`data`, `load()` (no consulta si `employeeId` es `null`; `error = true` al fallar, sin toast) y `retry()` (limpia `error` y vuelve a `load`).
4. `domain/locales/employee-assets-panel.es.json` + `.en.json` — claves (es / en):

```jsonc
{
  "employee_assets_panel": {
    "current_title": "Activos vigentes" / "Current assets",
    "returned_title": "Activos devueltos" / "Returned assets",
    "count": "Total: {count}" / "Total: {count}",
    "empty_title": "Sin activos asignados" / "No assigned assets",
    "empty_body": "Los activos se asignan desde Activos e insumos y aparecen aquí." / "Assets are assigned from Assets and supplies and appear here.",
    "load_failed": "No se pudieron cargar los activos." / "The assets could not be loaded.",
    "retry": "Reintentar" / "Retry",
    "file_number": "Folio {value}" / "File number {value}",
    "serial": "Serie {value}" / "Serial {value}",
    "assigned_at": "Asignado el {date}" / "Assigned on {date}",
    "returned_at": "Devuelto el {date}" / "Returned on {date}",
    "return_reason": "Motivo: {reason}" / "Reason: {reason}",
    "type_label": "Tipo: {value}" / "Type: {value}",
    "status": { "active": "Asignado" / "Assigned", "shipping": "En envío" / "In transit" },
    "custody": { "signed": "Resguardo firmado" / "Custody signed", "unsigned": "Resguardo sin firmar" / "Custody not signed" },
    "asset_status": { "inactive": "Inactivo" / "Inactive", "lost": "Extraviado" / "Lost", "damaged": "Dañado" / "Damaged" },
    "open_asset": "Abrir el activo {name}" / "Open asset {name}",   // aria-label del enlace
    "boolean": { "yes": "Sí" / "Yes", "no": "No" / "No" }
  }
}
```

5. `script.ts` del panel: `defineComponent` con `name: 'employeeAssetsPanel'`, props `{ employeeId: { type: Number, required: true } }`, `mergeLocaleMessage` de los dos locales, `AssetRequestParams` armado como en `pages/supplies/script.ts:50-55` (`useRuntimeConfig().public.BASE_API_PATH`, `useAuth().token.value`, `locale`), instanciación de `useEmployeeAssets` con `toRef` del prop, `load()` en `onMounted` y al cambiar el prop, expone `data`, `loading`, `error`, `retry`, y los helpers para el template (`buildAssetLink`, `formatCharacteristicValue` con labels del i18n, `resolveAssignmentStatusSeverity`, `localePath`).
6. `index.vue` (sin borde en las cards, iconos SVG en línea, sin emojis):

   - `loading` → tres renglones de `Skeleton`.
   - `error` → `Message severity="error"` con `load_failed` y `Button` “Reintentar” (`retry`).
   - `data` con `current.length === 0 && history.length === 0` → una sola `emptyState` (`empty_title`/`empty_body`, sin card de devueltos; CA-6).
   - Vigentes: `Card` con `current_title` y `Tag` del conteo; cada renglón: nombre como `NuxtLink` con `localePath(buildAssetLink(asset))` y `aria-label` `open_asset` (área táctil ≥ 44px), o texto plano si `isDeleted` (CA-4); `file_number`, `type_label`, `serial` (solo si existe), cada característica como “Nombre: valor”, `assigned_at`; chips `Tag`: asignación (`resolveAssignmentStatusSeverity`; `status.active`/`status.shipping`), resguardo (`custody.signed` → severity `success` / `custody.unsigned` → `warn`), y, solo si `asset.status !== 'active'`, el estado del catálogo (`asset_status.*`: `inactive` → `secondary`, `lost`/`damaged` → `danger`; CA-4).
   - Devueltos: `Card` con `returned_title` **solo si `history.length > 0`**; renglones: nombre (enlace igual que vigentes), `type_label`, `returned_at` solo si hay fecha, `return_reason` solo si hay motivo, chip de resguardo. “Devuelto”/“devolución”, nunca “retirado”.
   - Sin toasts: solo lectura (§12).

7. `style.scss`: lista apilada (no `DataTable`); en `<md` nombre y chips en una columna con los metadatos debajo; desde `md` dos columnas (datos | chips); `Tag` con `flex-wrap`; sin desplazamiento horizontal a 360px (CA-13).

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/employeeDetail tests/employeeSectionsMenu tests/employeeAssetsPanel  → PASSED
npm run lint:i18n        → sin claves nuevas sin traducción
npm run lint:icons       → grosor uniforme
grep -rnE "method: '(POST|PUT|PATCH|DELETE)'|assetDownload" components/employeeAssetsPanel
                         → salida vacía (CA-12: el panel no escribe ni descarga)
npx eslint components/employeeAssetsPanel tests/employeeAssetsPanel   → 0 problemas
npm run typecheck 2>&1 | grep -cE 'employeeAssetsPanel|employees/\[employeeSlug\]|employeeSectionsMenu'   → 0 (los 285 errores del typecheck son preexistentes y ninguno en estas áreas)
```

- [ ] **Paso 5: commit**

```bash
git add components/employeeAssetsPanel tests/employeeAssetsPanel
git commit -m "feat(empleados): agrega el panel de activos del colaborador en su ficha

Vigentes y devueltos con estado del resguardo, solo consulta, con
enlace al activo en Activos e insumos en su pestaña de resguardo.

Refs: VLRH-H1791485252056"
```

---

### Tarea 5 (gsti-rh-bo): manual de QA — último entregable, solo se entrega

El usuario recorre este manual él mismo. No se ejecuta aquí ni se automatiza: se escribe y se entrega (decisión de producto, Wilvardo 2026-10-08).

**Files:**
- Create: `docs/superpowers/plans/2026-10-09-ver-los-activos-asignados-en-la-ficha-del-colaborador-qa-flujo.md`

**Interfaces:**
- Consumes: la skill `manual-qa` (reglas en `~/.agents/rules/manual-qa/frontend.md` y `manual-qa-execution.md`): cada escenario abre con su línea `Objetivo:` antes de los pasos, pasos con datos exactos, resultado esperado y evidencia; el fixture vivo de la Tarea 4 ejecutado contra el BO real.
- Produces: el manual para el recorrido manual del usuario; los hallazgos que surjan los registra el usuario en `qa-valanserh/hallazgos.md` (cuadro de 14 campos; el código va en Comentarios/Historial, no en Evidencia).

- [ ] **Paso 1: cargar las reglas y escribir el manual**

Skill `manual-qa` antes de escribir. Escenarios (todos abren con `Objetivo:`):

1. **Ficha completa** — Rol con `supplies:read` abre la ficha de un colaborador con una laptop vigente (resguardo firmado) y un celular devuelto el mes pasado: sección **Activos** al final del submenú, tras Expediente; laptop en vigentes con folio, tipo, serie, características y “Resguardo firmado”; celular en devueltos con fecha y motivo “Cambio de equipo”; orden de devueltos por fecha de devolución.
2. **Resguardo sin firmar** — un monitor vigente sin resguardo subido: chip “Resguardo sin firmar”.
3. **En envío** — un activo en envío: chip “En envío”, en vigentes.
4. **Extraviado y eliminado** — activo con estado Extraviado: chip “Extraviado” y renglón con enlace; activo eliminado del catálogo: nombre como texto, sin enlace.
5. **Enlace al activo (CA-11)** — pulsar el nombre: navega a Activos e insumos con la ficha del activo abierta en su pestaña de resguardo.
6. **Colaborador nuevo** — sin activos: “Sin activos asignados”, sin card de devueltos.
7. **Colaborador dado de baja** — sigue viendo pendientes y devueltos.
8. **Rol sin `supplies:read`** — la sección no aparece en el submenú (ni deshabilitada ni con aviso) y la URL directa `/employees/<slug>/assets` monta una página vacía sin petición a la API (pestaña de red).
9. **Responsivo (CA-13)** — ancho 360px: sin desplazamiento horizontal; nombre y chips apilados, metadatos debajo.

Cada escenario: pasos exactos, credenciales de los roles de prueba del seeder QA, resultado esperado y cómo adjuntar evidencia.

- [ ] **Paso 2: verificación de formato**

`npm run lint:i18n` y `npm run lint:icons` siguen limpios (el manual no toca claves); revisión propia contra las reglas de `manual-qa`: cada escenario abre con su `Objetivo:`.

- [ ] **Paso 3: commit y entrega**

```bash
git add docs/superpowers/plans/2026-10-09-ver-los-activos-asignados-en-la-ficha-del-colaborador-qa-flujo.md
git commit -m "docs(qa): agrega el manual de recorrido de la sección Activos de la ficha

Refs: VLRH-H1791485252056"
```

Entregar la ruta al usuario y **esperar su recorrido manual**: los hallazgos que reporte se registran en `qa-valanserh/hallazgos.md` y se corrigen en esta misma rama.

---

## Definition of Done — líneas base medidas (2026-10-09, rama = origin/multitenant)

Todas las verificaciones se midieron contra el árbol actual antes de escribir este plan; estos números son los que valen.

**gsti-rh-api** (`NODE_ENV=test`, BD `sae_pruebas` al día con `migration:fresh --seed`):

| Comando | Línea base | Criterio |
|---|---|---|
| `node ace test functional --files="assets_employee_assets.spec.ts"` | (nuevo) | PASSED, todos los casos |
| `node ace test functional --files="assets_module.spec.ts"` | PASSED 24/24 | sin regresión |
| `node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"` | PASSED 22/22 | PASSED |
| `node ace test unit --files="constants/"` | PASSED 146/146 | PASSED (sin cambios de catálogo) |
| `node ace test functional --files="supplies_permission_gate.spec.ts"` | **3 aprobadas, 2 fallidas** | **sin fallos nuevos**: los 2 preexistentes son `TenantContextMissingException` de fixtures con `SupplyType.query()` fuera de request (heredado de `USRH1789600808831`, presente en `multitenant`) y **se escalan a Wilvardo**, no se arreglan aquí |
| `npm run typecheck` | exit 0, 0 errores | exit 0 |
| `npx eslint` sobre los archivos del censo | 0 problemas | 0 problemas |
| `git diff --name-only multitenant...HEAD -- start/routes/employee_supplies.ts app/modules/assets/assets.controller.ts tests/functional/assets_module.spec.ts` | vacío | vacío (CA-14) |

**gsti-rh-bo:**

| Comando | Línea base | Criterio |
|---|---|---|
| `npx vitest run tests/employeeDetail tests/employeeSectionsMenu` | 12 archivos, 101 pruebas, PASSED | PASSED + nuevas |
| `npx vitest run tests/employeeAssetsPanel` | (nuevo) | PASSED |
| `npx eslint components/employeeSectionsMenu components/employeeAssetsPanel 'pages/employees/[employeeSlug]' pages/supplies/domain tests/employeeSectionsMenu tests/employeeDetail tests/employeeAssetsPanel` | 0 errores (1 warning preexistente `v-html`) | 0 errores |
| `npm run lint` (repo completo) | **940 errores + 1387 warnings preexistentes** | no correr como gate; el gate es el eslint acotado de arriba |
| `npm run typecheck` | **exit 2, 285 errores TS preexistentes** | **0 errores en las áreas de la HU** (`grep -cE 'employeeAssetsPanel|employees/\[employeeSlug\]|employeeSectionsMenu|supplies/domain'` → 0; hoy ya es 0) |
| `npm run lint:i18n` / `npm run lint:icons` | limpios / limpios | limpios |
| `grep -rnE "method: '(POST\|PUT\|PATCH\|DELETE)'\|assetDownload" components/employeeAssetsPanel` | (nuevo) | vacío (CA-12) |
| `grep -rn "by-employee" pages components` | **21 coincidencias preexistentes** (todas de otros endpoints: asistencia, evaluaciones; ninguna de activos) | **21, sin crecer**; y `grep -rn "by-employee" components/employeeAssetsPanel 'pages/employees/[employeeSlug]'` → vacío |
| `git diff --name-only multitenant...HEAD` (ambos repos) | vacío | subconjunto de las filas `nuevo`/`editado` del censo (CA-14) |

**Notas para el executor:**

- CA-14 del spec dice que el grep de `by-employee` “sigue en cero”, pero la línea base es 21 (comentarios de otros módulos). **Drift del criterio, no del código: se escala a Wilvardo** para corregir el spec; mientras tanto el criterio medido es “sin crecer”.
- Swagger del endpoint con 200, 403, 404 y 422 (Paso 3.8 de la Tarea 1).
- El manual de QA (Tarea 5) se **entrega**: el recorrido lo hace el usuario.
- No se crea PR ni se despliega: eso lo levanta el equipo (Wilvardo) por su cuenta.