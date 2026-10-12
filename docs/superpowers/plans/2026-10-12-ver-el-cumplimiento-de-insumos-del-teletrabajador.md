# Ver el cumplimiento de insumos del teletrabajador en su ficha — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La matriz de cumplimiento de insumos de teletrabajo (NOM-037 5.7): un endpoint por colaborador (`GET /api/employees/:employeeId/telework-supplies`), un servicio de dominio con alcance explícito y por lote (el contrato que leerán cinco HUs del set), y un bloque **Insumos de teletrabajo** en la sección Activos de la ficha (BO), con la etiqueta de categoría en los activos vigentes.

**Architecture:** En el API, tres piezas dentro de `app/modules/assets`: reglas puras (`telework_supplies.rules.ts`, sin I/O), lecturas por lote con el alcance dentro de la query (`findTeleworkProfiles` / `findTeleworkCoverage`, espejo de `findAssignments` con `db.from`) y un servicio `TeleworkSuppliesService` cuya única forma de construcción es la factoría `makeTeleworkSuppliesService()`; el controller pasa `ctx.businessUnitScope ?? []` y el servicio jamás toca `TenantContext`. En el BO, un panel hermano de `employeeAssetsPanel` (`components/employeeTeleworkSuppliesPanel/`, capas domain/application/infrastructure) montado arriba del panel de activos, que emite `summary-loaded` con el mapa de categorías por resguardo para etiquetar los renglones vigentes de la lista.

**Tech Stack:** AdonisJS 6 (Japa, vine, Lucid `db.from`), MySQL, Nuxt 3 / Vue 3 `setup` con vitest, PrimeVue (`Card`, `Tag`, `Skeleton`, `Message`, `Button`), `assetFetch` del slice de activos.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791485252682.md` (Código `VLRH-H1791485252682`, SP 3, rama `feature/VLRH-H1791485252682-ver-el-cumplimiento-de-insumos-del-teletrabajador`, base/target la rama de `VLRH-H1791485252056`, ya integrada en `multitenant`). El plan argumenta desde el spec: léelo completo antes de cada tarea. Sus anclas fueron revalidadas contra el código el 2026-10-12 (api `2b7c0080` = bo `ef1427df` = `origin/multitenant` en ambos repos); el drift trivial se corrige al momento, el de alcance/contrato/regla se escala a Wilvardo.

## Restricciones globales

- **Ramas:** `feature/VLRH-H1791485252682-ver-el-cumplimiento-de-insumos-del-teletrabajador` en ambos repos, ya creadas y limpias, a la par de `origin/multitenant` (api `2b7c0080`, bo `ef1427df`). No se crea PR ni se despliega: el plan termina en la verificación automatizada y la entrega del manual de QA.
- **No tocar** (censo `no-tocado` + no-objetivos + CA-13): `app/services/telework_worker_service.ts`, `app/modules/assets/dto/assets.dto.ts`, `tests/functional/assets_module.spec.ts`, `app/modules/assets/assets.controller.ts` (la sección de resumen no cambia), `start/routes/employee_supplies.ts` (la legacy `by-employee` ni se reutiliza ni se retira), `app/constants/system_modules_menu/system_modules.constant.ts`, `pages/telework-workers/`, y nada de `valanserh-app-employee`. `git diff --name-only <base>...HEAD` sobre los tres primeros y el último debe salir vacío.
- **Sin migración, seeder, índice ni modelo Lucid nuevo.** Nada se persiste: el estado siempre se deriva. Lecturas con `db.from`, como el resto del slice. Nada de `TenantContext.getScope()`, `this.scope()`, `TenantContext.runUnscoped` ni modelos con mixin dentro del servicio nuevo: `businessUnitIds` es posicional y **obligatorio, sin default** (`= []` está prohibido en las firmas del servicio, igual que en `listAllForNotification`).
- **Firma pública congelada** (§11): `TeleworkSuppliesService.matrixForEmployee(businessUnitIds, employeeId)`, `summarizeForEmployees(businessUnitIds, employeeIds)`, `makeTeleworkSuppliesService()`, el enum de cinco estados y la forma de `teleworkSuppliesSummary` no cambian: cinco HUs del set dependen de ellos. Campo nuevo = escalar a Wilvardo.
- **`own_equipment` no se produce aquí:** el parámetro `ownEquipmentCategories` llega vacío (default) y el estado nunca sale con esta HU; lo agrega `VLRH-H1791306075599` sin cambiar firma ni rótulos.
- **Sin texto de leyenda ni umbral en el API:** viajan `isLegallyRequired` y `legalThresholdPercent` desde `TELEWORK_LEGAL_THRESHOLD_PERCENT` (`>=`, inclusivo; el JSDoc que dice "estrictamente" se corrige aquí). Ningún literal `40` nuevo en `app/modules/assets`.
- **Switch exhaustivo:** el conteo por estado en las reglas es un `switch` sobre `TeleworkSupplyCoverageStatus` que termina en un `assertNever` local (no existe helper en el repo: definido en el propio `telework_supplies.rules.ts`), sin `?? 0` ni rama default, para que el typecheck exija el caso `own_equipment` cuando llegue.
- **Aserción por subconjunto (CA-14):** el spec funcional de la matriz asierta el body con `assert.containsSubset` (existe en `@japa/assert` v3, `assert.d.ts:1246`) solo sobre los campos de esta HU; `deepEqual` y `assertBody(` quedan prohibidos en `tests/functional/assets_telework_supplies.spec.ts` (`git grep -nE "deepEqual|assertBody\(" -- tests/functional/assets_telework_supplies.spec.ts` = 0). La comparación exacta del 404 de CA-8 sí es `deepEqual` del cuerpo completo de error, como en `assets_employee_assets.spec.ts`.
- **Tipado:** unión discriminada por `applies` y por `status` (§11, la imposibilidad de tipo sustituye a la regla: `uncovered` con `accessory` y `not_delivered` con otra categoría no compilan). Cero `any`. Comentarios y JSDoc en español, identificadores en inglés.
- **i18n es + en** en API y BO, con parada de claves (BO: `npm run lint:i18n`). Rótulos de categoría copiados en el locale del componente; no leer `asset_types_drawer.telework_category.*`.
- **Commits:** Conventional Commits en español (tipo en inglés, descripción imperativa), cuerpo con el porqué y `Refs: VLRH-H1791485252682`; el hook solo corre eslint. En el BO, la auditoría de `.claude/rules/compliance-check.md` sobre los archivos tocados cierra cada tarea.
- **BD de pruebas:** `sae_pruebas` (`NODE_ENV=test`). Si el esquema va atrás: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (un esquema atrasado produce fallos falsos).
- **Fallos preexistentes (línea base, fuera de alcance):** ver "Definition of Done — líneas base medidas".

## Review Focus

Entradas o condiciones que el spec implica pero ningún CA ejercita, y que por eso son las más propensas a morder a un usuario real. Cada línea lleva su prueba en la tarea dueña del código.

1. **Resguardo con borrado lógico:** un contrato con `employee_supply_response_contract_deleted_at` lleno NO cuenta como firmado → `custodyStatus: "unsigned"` y sí cuenta en `unsignedCustodyCount`. El `EXISTS` de `has_contract` filtra `employee_supply_response_contract_deleted_at IS NULL`. Prueba en Tarea 3 (caso "CA-1 + resguardo borrado lógicamente no firma").
2. **Asignación sin fecha de asignación** (`employee_supply_assignament_date` NULL): `assignedAt` es la fecha de alta (`COALESCE`) y el orden DESC lo respeta (R5 no depende del orden de filas). Prueba en Tarea 3 (fixture de CA-2 con una asignación sin fecha).
3. **Porcentaje DECIMAL llega como texto:** `Number(employee_telework_percentage ?? 0)` en `findTeleworkProfiles`; 39.99 no se trunca a 39 y viaja numérico en `teleworkPercentage` (CA-4 solo lo prueba en las reglas, no en la lectura). Prueba en Tarea 2 (caso del spec funcional del servicio).
4. **Lote con ids repetidos:** `summarizeForEmployees` con ids duplicados devuelve un `Map` sin duplicados y los conteos por colaborador no se inflan (una fila de cobertura por asignación). Prueba en Tarea 2 (mismo spec).
5. **Fallo de la matriz no tumba la sección:** si `GET .../telework-supplies` falla, el bloque muestra su propio error y `employeeAssetsPanel` sigue cargando (el error es local al composable). Prueba en Tarea 4 (`use-employee-telework-supplies.spec.ts`).

---

### Tarea 1 (gsti-rh-api): reglas puras — cinco estados, DTO discriminado y cálculo de la matriz

El corazón de la HU, sin I/O: aplicabilidad, prioridad de estados, resumen y el invariante. Todo lo demás (repo, servicio, endpoint, BO) consume estos nombres.

**Files:**
- Create: `app/modules/assets/dto/telework_supplies.dto.ts`
- Create: `app/modules/assets/telework_supplies.rules.ts`
- Modify: `app/modules/assets/assets.constants.ts` (tras `OPEN_ASSIGNMENT_STATUSES`, línea 26-27; lejos de `ASSET_ERROR_KEYS`, que editan las HUs hermanas)
- Modify: `app/constants/employee_work_schedule.ts` (solo el JSDoc de `TELEWORK_LEGAL_THRESHOLD_PERCENT`, líneas 68-71)
- Test: Create `tests/unit/modules/assets/telework_supplies.rules.spec.ts`

**Interfaces:**
- Consumes: `SUPPLY_TYPE_TELEWORK_CATEGORIES` / `SupplyTypeTeleworkCategory` (`app/constants/supply_type_telework_category.ts`, orden silla → cómputo → aditamento); `EMPLOYEE_WORK_SCHEDULE`, `TELEWORK_LEGAL_THRESHOLD_PERCENT` (`app/constants/employee_work_schedule.ts`); `OPEN_ASSIGNMENT_STATUSES` / `OpenAssignmentStatus`, `EMPLOYEE_ASSET_CUSTODY_STATUSES` / `EmployeeAssetCustodyStatus` (`assets.constants.ts`).
- Produces (nombres contrato; las Tareas 2 y 3 dependen de ellos):
  - `export const TELEWORK_SUPPLY_COVERAGE_STATUSES = ['delivered','shipping','own_equipment','uncovered','not_delivered'] as const` y `export type TeleworkSupplyCoverageStatus = (typeof TELEWORK_SUPPLY_COVERAGE_STATUSES)[number]`.
  - En `dto/telework_supplies.dto.ts`, los tipos §11 verbatim (la unión discriminada es la regla): `CoveringStatus`, `TeleworkSupplyAssetDto`, `TeleworkSupplyCategoryDto`, `TeleworkSuppliesSummary`, `EmployeeTeleworkSuppliesDto`; más los modelos de lectura `TeleworkProfile = { employeeId: number; workSchedule: string; teleworkPercentage: number; isDeleted: boolean }` y `TeleworkCoverageRow = { employeeId: number; employeeSupplyId: number; supplyId: number; name: string; fileNumber: string; assignmentStatus: OpenAssignmentStatus; category: SupplyTypeTeleworkCategory; hasContract: boolean; assignedAt: string }` (los produce el repositorio de la Tarea 2; viven aquí como `AssetEmployeeProfile` vive en `dto/assets.dto.ts`).
  - `resolveTeleworkApplicability(profile: TeleworkProfile): { applies: boolean; isLegallyRequired: boolean }` — `applies` = modalidad Remote/Híbrido **y** porcentaje > 0 **y** no dado de baja (propias 8-9: mismas condiciones del listado 5.1); `isLegallyRequired` = `applies && teleworkPercentage >= TELEWORK_LEGAL_THRESHOLD_PERCENT` (R4, inclusivo; sin literal 40).
  - `resolveCategoryStatus(category: SupplyTypeTeleworkCategory, rows: readonly TeleworkCoverageRow[], ownEquipmentCategories: ReadonlySet<SupplyTypeTeleworkCategory>): TeleworkSupplyCoverageStatus` — prioridad R5/R6: algún `active` → `delivered`; si no, hay filas → `shipping` (todas `shipping`); si no, `ownEquipmentCategories.has(category)` → `own_equipment`; si no, `category === 'accessory'` → `not_delivered`, sino `uncovered`. Lo devuelto no depende del orden de `rows`.
  - `buildEmployeeTeleworkSupplies(profile: TeleworkProfile, rows: readonly TeleworkCoverageRow[], ownEquipmentCategories: ReadonlySet<SupplyTypeTeleworkCategory> = new Set()): EmployeeTeleworkSuppliesDto` — filtra las filas del colaborador, arma las tres categorías en el orden de `SUPPLY_TYPE_TELEWORK_CATEGORIES`, mapea `hasContract` → `custodyStatus` (`signed`/`unsigned`), y embebe `teleworkSuppliesSummary` llamando a `summarizeTeleworkSupplies`. Con `applies: false`: `categories: []` y resumen en ceros.
  - `summarizeTeleworkSupplies(matrix: EmployeeTeleworkSuppliesDto): TeleworkSuppliesSummary` — conteos por estado con el `switch` exhaustivo + `assertNever` local; `uncoveredCount` solo cuenta silla y cómputo; `unsignedCustodyCount` = filas `active` sin contrato contadas por `employeeSupplyId` (el `shipping` sin contrato no cuenta, R6).
  - `assertNever(value: never): never` privado al archivo de reglas.

- [ ] **Paso 1: escribir la prueba unitaria en rojo**

`tests/unit/modules/assets/telework_supplies.rules.spec.ts` (japa, sin BD; imports `#modules/assets/...`). Casos (nombres y aserciones):

```ts
test('aplica solo a Remote o Hybrid con porcentaje > 0; la baja no aplica (R4, propias 8-9)')
// profile: Remote 100 → { applies: true, isLegallyRequired: true }
// Hybrid 40 → true/true · Hybrid 39.99 → true/false · Hybrid 20 → true/false
// Remote 0 → false/false · Onsite 100 → false/false · Onsite 50 → false/false
// Remote 100 isDeleted → false/false

test('la prioridad de estados no depende del orden de filas (R5, R6)')
// rows [shipping, active] y [active, shipping] → 'delivered' en ambos
// rows [shipping] → 'shipping' · rows [] → 'uncovered' (chair/computing) o 'not_delivered' (accessory)

test('equipo propio declarado solo entra por ownEquipmentCategories')
// rows [] + set vacío → nunca 'own_equipment' (chair → uncovered, accessory → not_delivered)
// rows [] + set con 'ergonomic_chair' → 'own_equipment'
// rows [shipping] + set con la categoría → 'shipping' (Mientras hay activo o envío no se declara equipo propio, R6)

test('el resumen cuenta por estado, silla y cómputo como sin cubrir, y el envío no firma (R5, R6, propia 6)')
// matriz con chair delivered (active firmado + shipping sin contrato),
// computing shipping, accessory not_delivered:
// { deliveredCount: 1, shippingCount: 1, ownEquipmentCount: 0, uncoveredCount: 0, unsignedCustodyCount: 0 }
// matriz con chair active sin contrato, computing uncovered:
// uncoveredCount 1 · unsignedCustodyCount 1 (solo el active sin contrato)
// sin applies: todo 0

test('el invariante del resumen se cumple (§11)')
// delivered + shipping + ownEquipment + uncovered + (accessory = not_delivered ? 1 : 0) = 3 con applies
// y = 0 sin applies, sobre 3 matrices distintas

test('las categorías salen siempre en el orden de la norma (R1)')
// buildEmployeeTeleworkSupplies(Remote 100, rows) → categories.map(c => c.category)
//   deepEqual ['ergonomic_chair','computing_equipment','accessory']
```

- [ ] **Paso 2: correr y verificar el rojo**

`node ace test unit --files="telework_supplies.rules.spec.ts"` → FAIL (módulo inexistente).

- [ ] **Paso 3: implementar**

1. `assets.constants.ts`: `TELEWORK_SUPPLY_COVERAGE_STATUSES` + tipo, insertado tras `OPEN_ASSIGNMENT_STATUSES` (línea 27), con JSDoc citando R5.
2. `dto/telework_supplies.dto.ts`: tipos de Interfaces, la unión `EmployeeTeleworkSuppliesDto` discriminada por `applies` exactamente como §11 (`applies: false` → `isLegallyRequired: false`, `categories: []`; `applies: true` → tupla de tres).
3. `telework_supplies.rules.ts`: las cuatro funciones de Interfaces + `assertNever`. `custodyStatus` se mapea de `hasContract` con `EMPLOYEE_ASSET_CUSTODY_STATUSES`. El DTO de categoría con `assets` no vacío se arma con un cast controlado a la unión (`as const` no alcanza para tuplas abiertas): documéntalo en el JSDoc, no uses `any`.
4. `app/constants/employee_work_schedule.ts:68-71`: JSDoc del umbral pasa de "superar el 40% (estrictamente)" a "40% o más (inclusivo)", citando la decisión de producto del 2026-07-08 (el operador del código es `>=`, en `telework_worker_service.ts:78` y `:139`).

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test unit --files="telework_supplies.rules.spec.ts"   → PASSED (6/6)
node ace test unit --files="constants/"                        → PASSED 148/148 (sin regresión)
npm run typecheck                                              → exit 0
git grep -n "estrictamente" -- app/constants/employee_work_schedule.ts  → 0 coincidencias (CA-12)
git grep -n "40" -- app/modules/assets | wc -l                  → 44 (línea base; sin crecimiento: ningún literal de umbral)
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/assets.constants.ts app/modules/assets/dto/telework_supplies.dto.ts \
        app/modules/assets/telework_supplies.rules.ts app/constants/employee_work_schedule.ts \
        tests/unit/modules/assets/telework_supplies.rules.spec.ts
git commit -m "feat(activos): agrega las reglas de cumplimiento de insumos de teletrabajo

Los cinco estados de categoría, la aplicabilidad con el umbral inclusivo
de la NOM-037 y el resumen por colaborador, puros y sin I/O: el repositorio,
el endpoint y el backoffice solo consumen estos nombres. Corrige además el
JSDoc del umbral, que decia estricto cuando el codigo es inclusivo.

Refs: VLRH-H1791485252682"
```

---

### Tarea 2 (gsti-rh-api): lecturas por lote y servicio de dominio con factoría

El contrato que leen cinco HUs: dos consultas por lote con el alcance dentro de la query y un servicio sin `TenantContext`, invocable fuera de HTTP.

**Files:**
- Modify: `app/modules/assets/assets.repository.ts` (puerto: `findTeleworkProfiles` y `findTeleworkCoverage`, tras `findEmployeeAssignments`)
- Modify: `app/modules/assets/assets.repository.mysql.ts` (adaptador, tras `findEmployeeAssignments`, línea 538)
- Create: `app/modules/assets/telework_supplies.service.ts`
- Test: Create `tests/functional/assets_telework_supplies.spec.ts` (parte 1: servicio sin HTTP; la Tarea 3 agrega los casos HTTP al mismo archivo)

**Interfaces:**
- Consumes: de la Tarea 1: `TeleworkProfile`, `TeleworkCoverageRow`, `buildEmployeeTeleworkSupplies`, `resolveTeleworkApplicability`, `EmployeeTeleworkSuppliesDto`, `TeleworkSuppliesSummary`. Del repo: patrón `findEmployeeProfile` / `findEmployeeAssignments` (`assets.repository.mysql.ts:352-538`), `calendarDate`, cortes tempranos con lista vacía.
- Produces (nombres contrato, congelados):
  - `AssetsRepository.findTeleworkProfiles(businessUnitIds: readonly number[], employeeIds: readonly number[]): Promise<TeleworkProfile[]>` — `employees` con `whereIn('employee_id')` y `whereIn('business_unit_id')`, **sin** filtrar `employee_deleted_at` (el 404 es solo por alcance; la baja se resuelve como `applies: false` en las reglas); `isDeleted` de `employee_deleted_at !== null`; `teleworkPercentage` con `Number(row.employee_telework_percentage ?? 0)`. Lista vacía en **cualquier** argumento → `[]` sin consultar.
  - `AssetsRepository.findTeleworkCoverage(businessUnitIds: readonly number[], employeeIds: readonly number[]): Promise<TeleworkCoverageRow[]>` — `employee_supplies es` ⋈ `supplies s` ⋈ `supply_types st`; `whereIn('es.business_unit_id')`, `whereIn('s.business_unit_id')` (defensa en profundidad), `whereIn('es.employee_id')`, `whereIn('es.employee_supply_status', OPEN_ASSIGNMENT_STATUSES)`, `whereNull('es.employee_supply_deleted_at')`, `whereNull('s.supply_deleted_at')`, `whereNotNull('st.supply_type_telework_category')`; `hasContract` por `EXISTS` sobre `employee_supplies_response_contracts` con `employee_supply_response_contract_deleted_at IS NULL`; orden `COALESCE(es.employee_supply_assignament_date, es.employee_supply_created_at) DESC, es.employee_supply_id DESC`; `assignedAt` con `calendarDate`. Lista vacía en cualquier argumento → `[]` sin consultar.
  - `export class TeleworkSuppliesService { constructor(private readonly repository: AssetsRepository) }` con `matrixForEmployee(businessUnitIds: readonly number[], employeeId: number): Promise<EmployeeTeleworkSuppliesDto | null>` (perfil `null` → `null`; llama al par de lecturas con `[employeeId]` y compone con `buildEmployeeTeleworkSupplies`) y `summarizeForEmployees(businessUnitIds: readonly number[], employeeIds: readonly number[]): Promise<Map<number, TeleworkSuppliesSummary>>` (un solo par de lecturas para todo el lote, sin N+1; por perfil en alcance construye la matriz y extrae su resumen; ids fuera de alcance ausentes del `Map`, nunca con ceros; aplica=false → resumen en ceros con `applies: false`).
  - `export function makeTeleworkSuppliesService(): TeleworkSuppliesService` — hoy `new TeleworkSuppliesService(new AssetsRepositoryMysql())`; única forma de construcción para los consumidores.

- [ ] **Paso 1: escribir la parte 1 del spec funcional en rojo**

`tests/functional/assets_telework_supplies.spec.ts` — actores de `#tests/helpers/tenant_actor` (`createTenantActor`, `grantModulePermissions`, `businessUnitHeaders`, `cleanupTenantActor`), colaboradores de `#tests/helpers/employee_fixture` (`createEmployeeFixture`, `cleanupEmployeeFixture`); se limpia todo en `group.teardown`. Fixtures de modalidad por tabla (el fixture nace Onsite): `db.from('employees').where('employee_id', id).update({ employee_work_schedule: 'Remote'|'Hybrid'|'Onsite', employee_telework_percentage: 100|39.99|... })`. Helper local `fakePort` (objeto con los dos métodos del puerto, contando llamadas, delegando a `new AssetsRepositoryMysql()` cuando el caso necesita datos reales). Casos:

```ts
test('CA-10: el resumen por lote devuelve solo a los del alcance, sin TenantContext')
// sin petición HTTP: makeTeleworkSuppliesService().summarizeForEmployees([buA], [empA, empB])
//   → Map con empA (applies true/false según fixture) y SIN empB (ausencia ≠ ceros)
// ninguna llamada lanza TenantContextMissingException

test('CA-10: lote o alcance vacíos devuelven Map vacío sin consultar el puerto')
// new TeleworkSuppliesService(spyPort).summarizeForEmployees([], [1]) → Map vacío, 0 llamadas
// new TeleworkSuppliesService(spyPort).summarizeForEmployees([buA], []) → ídem

test('CA-10: con 25 colaboradores el puerto recibe exactamente 2 llamadas')
// spyPort devuelve 25 TeleworkProfile y coverage vacía
//   → findTeleworkProfiles 1 vez + findTeleworkCoverage 1 vez

test('RF-3: el porcentaje DECIMAL llega como texto y no se trunca')
// empA Hybrid 39.99 → matrixForEmployee([buA], id): teleworkPercentage === 39.99 (número),
//   applies true, isLegallyRequired false, legalThresholdPercent === 40

test('RF-4: ids repetidos en el lote no duplican el Map ni inflan los conteos')
// summarizeForEmployees([buA], [id, id, id]) → Map.size === 1, conteos sin cambio vs [id]
```

- [ ] **Paso 2: correr y verificar el rojo**

`node ace test functional --files="assets_telework_supplies.spec.ts"` → FAIL (el servicio no existe).

- [ ] **Paso 3: implementar**

1. Puerto en `assets.repository.ts`: los dos métodos de Interfaces, con JSDoc de alcance y cortes tempranos.
2. Adaptador en `assets.repository.mysql.ts`: espejo de `findEmployeeAssignments` (`db.from`, alias `es`/`s`/`st`, `whereIn` de alcance dentro de la query, `calendarDate`). El `EXISTS` de `has_contract` como `select` con `db.knexRawQuery` (mismo estilo que el join de `findCharacteristicValues`, `:573-584`).
3. `telework_supplies.service.ts`: clase + factoría de Interfaces. Solo el controller pasa alcance; el servicio no lee contexto. Agrupa las filas por `employeeId` con un `Map` antes de construir cada matriz.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_telework_supplies.spec.ts"  → PASSED (5/5)
node ace test functional --files="assets_employee_assets.spec.ts"   → PASSED 15/15 (sin regresión)
npm run typecheck                                                    → exit 0
npx eslint app/modules/assets                                        → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/assets.repository.ts app/modules/assets/assets.repository.mysql.ts \
        app/modules/assets/telework_supplies.service.ts tests/functional/assets_telework_supplies.spec.ts
git commit -m "feat(activos): agrega el servicio de insumos de teletrabajo con lecturas por lote

Perfiles y cobertura por lote con el alcance de empresas dentro de cada
query, y un servicio sin contexto cuya factoría es la puerta unica de las
cinco pantallas que leen el cumplimiento, para que ninguna calcule por su
cuenta.

Refs: VLRH-H1791485252682"
```

---

### Tarea 3 (gsti-rh-api): endpoint HTTP — ruta, permiso, controller, i18n y swagger

La matriz por colaborador con gate `supplies:read` y 404 indistinguible fuera de la empresa.

**Files:**
- Modify: `app/modules/assets/employee_assets.controller.ts` (handler `teleworkSupplies`)
- Modify: `app/modules/assets/assets.routes.ts` (ruta nueva al final del grupo)
- Modify: `app/constants/supplies_permission_declarations.ts` (declaración `showEmployeeTeleworkSupplies`, tras `indexEmployeeAssets`)
- Modify: `resources/langs/es.json` y `resources/langs/en.json` (tras el bloque de `asset_employee_not_found_*`, línea ~3470)
- Test: Modify `tests/functional/assets_telework_supplies.spec.ts` (parte 2: CA-1 a CA-8), `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts` (fila tras la 196), `tests/functional/supplies_permission_gate.spec.ts` (prueba del gate al final)

**Interfaces:**
- Consumes: de la Tarea 2: `makeTeleworkSuppliesService()`, `matrixForEmployee`. De `VLRH-H1791485252056`: `EmployeeAssetsController` (`@inject()`, patrón `assets` del propio archivo), `employeeIdParamsValidator`, `AssetError.employeeNotFound()` (404 `colaborador-no-encontrado`), `respondAssetsModuleError`; `ctx.businessUnitScope` (`number[]`, `business_unit_scope_middleware.ts:129,152`). Fixtures por API del owner como `assets_employee_assets.spec.ts:189-240` (`POST /api/supply-types` con `supplyTypeTeleworkCategory`, `POST /api/supplies`, `POST /api/employee-supplies`, contratos por `db.table`, `retire` por update).
- Produces:
  - Declaración `showEmployeeTeleworkSupplies: suppliesStandard('read')`.
  - Ruta `GET /api/employees/:employeeId/telework-supplies` → `#modules/assets/employee_assets.controller.teleworkSupplies`, gate `SUPPLIES_PERMISSION_DECLARATIONS.showEmployeeTeleworkSupplies`.
  - Handler `teleworkSupplies(ctx)`: `employeeIdParamsValidator.validate(params)`; `makeTeleworkSuppliesService().matrixForEmployee(ctx.businessUnitScope ?? [], employeeId)`; `null` → `throw AssetError.employeeNotFound()`; 200 con `i18n.t('asset_employee_telework_supplies_title', undefined, 'Insumos de teletrabajo del colaborador')` y `i18n.t('asset_employee_telework_supplies_successfully', undefined, 'Insumos de teletrabajo obtenidos correctamente')`; catch → `respondAssetsModuleError`.
  - Claves i18n API: `asset_employee_telework_supplies_title` / `asset_employee_telework_supplies_successfully` (es/en, valores §11).
  - Swagger JSDoc del handler con la unión discriminada documentada (200 con `applies` true/false, 403, 404 `colaborador-no-encontrado`, 422 `entrada-invalida`), sin literales de umbral en los ejemplos.

- [ ] **Paso 1: escribir la parte 2 del spec funcional y las filas de gate en rojo**

Mismo grupo del spec de la Tarea 2 (colaboradores y catálogo con cleanup en teardown). El actor A lleva `supplies:read`; los tipos se crean con categoría (`supplyTypeTeleworkCategory: 'ergonomic_chair' | 'computing_equipment' | 'accessory'`) y un "Celular" sin categoría. Cambios de modalidad por update sobre `employees`; estados `shipping`/`retired` por update sobre `employee_supplies`. Casos (assertions por subconjunto con `assert.containsSubset(body.data, {...})`, salvo el 404 que es `deepEqual` exacto):

```ts
test('CA-1: entregado con resguardo; uncovered y not_delivered vacíos; resumen')
// A Remote 100, silla active con contrato vivo y nada más → 200:
// categories en orden [ergonomic_chair delivered (1 activo, custodyStatus 'signed'),
//   computing_equipment uncovered assets [], accessory not_delivered assets []]
// isLegallyRequired true · summary {1,0,0,1,0}

test('CA-2: la prioridad no depende del orden de creación (R5, R6)')
// laptop shipping creada ANTES que monitor active del mismo tipo computing:
//   computing = delivered con los DOS activos (assignmentStatus 'active' y 'shipping')
// chair con solo una retired y una shipping → shipping con UN activo (la devuelta no aparece)
// repetir con el orden invertido de inserción → mismo resultado

test('CA-3: lo devuelto no cubre; uncoveredCount cuenta solo silla y cómputo')
// única laptop retired → computing uncovered; único soporte retired → accessory not_delivered

test('CA-4: el umbral es inclusivo (R4)')
// Hybrid 39.99 → applies true, isLegallyRequired false
// Hybrid 40.00 → isLegallyRequired true (aparece en el listado de teletrabajadores)

test('CA-5: presencial, baja y porcentaje residual no aplican')
// Onsite 0 · Remote 100 con employee_deleted_at lleno · Onsite 50
//   → applies false, isLegallyRequired false, categories [], resumen en ceros

test('CA-6: unsignedCustodyCount cuenta solo entregados sin contrato')
// silla active sin contrato + laptop shipping sin contrato + celular sin categoría
//   → unsignedCustodyCount 1

test('CA-7: reclasificar el tipo se refleja en la siguiente consulta (R2)')
// CA-1 + update supply_types.supply_type_telework_category = null en el tipo de la silla
//   → ergonomic_chair uncovered, sin tocar asignaciones

test('CA-8: otra empresa e inexistente responden el mismo 404; id no numérico 422')
// empleado de B y 999999999 → 404 deepEqual del cuerpo completo (como assets_employee_assets.spec.ts:84-91)
// 'abc' y '0' → 422 entrada-invalida

test('RF-1: un resguardo borrado lógicamente no firma')
// silla active con contrato cuya employee_supply_response_contract_deleted_at se llena
//   → custodyStatus 'unsigned' y cuenta en unsignedCustodyCount

test('RF-2: sin fecha de asignación, assignedAt es la de alta')
// asignación con employee_supply_assignament_date NULL → assignedAt === created_at (YYYY-MM-DD)
```

Fila en `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts`, tras la línea 196:

```ts
{ method: 'get', path: '/employees/:employeeId/telework-supplies', handler: '#modules/assets/employee_assets.controller.teleworkSupplies', declaration: supplies('showEmployeeTeleworkSupplies') },
```

Prueba nueva al final de `tests/functional/supplies_permission_gate.spec.ts`, espejo de la de la línea 323 (fixtures solo con `createEmployeeFixture`; NADA de `SupplyType.query()` fuera de request — los 2 fallos preexistentes de esa suite vienen de ahí y no se tocan):

```ts
test('matriz de insumos de teletrabajo: 403 sin supplies:read, 200 con read, owner y root cruzan por bypass')
// tenant sin concesiones → 403 assertPermissionDenied · con ['read'] → 200
// owner y root → 200 por bypass standard · super-administrador → 403
```

- [ ] **Paso 2: correr y verificar el rojo**

```
node ace test functional --files="assets_telework_supplies.spec.ts"                        → FAIL en los casos nuevos (404 de ruta)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"   → FAIL (la declaración no existe)
node ace test functional --files="supplies_permission_gate.spec.ts"                        → FAIL en la prueba nueva
```

- [ ] **Paso 3: implementar**

1. Declaración en `supplies_permission_declarations.ts`, con una línea del porqué en el JSDoc del bloque.
2. Ruta en `assets.routes.ts` al final del grupo (mismo `auth` + `businessScope` del archivo).
3. Handler en `employee_assets.controller.ts`: patrón del método `assets` existente, con el swagger de Interfaces.
4. Claves i18n en `es.json`/`en.json` tras `asset_employee_not_found_detail`.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_telework_supplies.spec.ts"                        → PASSED (15/15)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"   → PASSED 23/23
node ace test functional --files="supplies_permission_gate.spec.ts"                       → 5 aprobadas, 2 fallidas (las 2 preexistentes; la nueva en verde)
node ace test functional --files="assets_module.spec.ts"                                  → PASSED 24/24 (sin regresión)
node ace test unit --files="constants/"                                                   → PASSED 148/148
npm run typecheck                                                                         → exit 0
npx eslint app/modules/assets app/constants                                               → 0 problemas
git grep -nE "deepEqual|assertBody\(" -- tests/functional/assets_telework_supplies.spec.ts → 0 (CA-14)
git grep -n "40" -- app/modules/assets | wc -l                                            → 44 (CA-12, sin crecimiento)
git diff --name-only origin/multitenant...HEAD -- app/services/telework_worker_service.ts \
  app/modules/assets/dto/assets.dto.ts tests/functional/assets_module.spec.ts pages/telework-workers → vacío (CA-13)
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/employee_assets.controller.ts app/modules/assets/assets.routes.ts \
        app/constants/supplies_permission_declarations.ts resources/langs/es.json resources/langs/en.json \
        tests/functional/assets_telework_supplies.spec.ts \
        tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts \
        tests/functional/supplies_permission_gate.spec.ts
git commit -m "feat(activos): expone la matriz de insumos de teletrabajo del colaborador

Endpoint de solo lectura con el permiso de Activos e insumos, 404
indistinguible para el colaborador ajeno y la union discriminada que las
hermanas del set extienden sin editar este test.

Refs: VLRH-H1791485252682"
```

---

### Tarea 4 (gsti-rh-bo): bloque Insumos de teletrabajo en la ficha

El panel que muestra las tres categorías con su leyenda y chips, hermano de `employeeAssetsPanel`, montado arriba de él.

**Files:**
- Create: `components/employeeTeleworkSuppliesPanel/index.vue`, `script.ts`, `style.scss`, `domain/telework-supplies.interface.ts`, `domain/telework-supplies.helpers.ts`, `application/use-employee-telework-supplies.ts`, `infrastructure/employee-telework-supplies.repository.ts`, `domain/locales/employee-telework-supplies-panel.es.json`, `domain/locales/employee-telework-supplies-panel.en.json`
- Modify: `pages/employees/[employeeSlug]/assets.vue`, `pages/employees/[employeeSlug]/assets.script.ts`
- Test: Create `tests/employeeTeleworkSuppliesPanel/telework-supplies.helpers.spec.ts`, `tests/employeeTeleworkSuppliesPanel/use-employee-telework-supplies.spec.ts`

**Interfaces:**
- Consumes: `assetFetch` (`pages/supplies/infrastructure/asset-http.ts:23`); `AssetTypeTeleworkCategory` (`pages/supplies/domain/asset.enum.ts:57`); el patrón de `components/employeeAssetsPanel/` (script con `defineComponent`, `mergeLocaleMessage`, `AssetRequestParams` armado como en su `script.ts:40-44`; composable `loading/error/data/load/retry`); `canReadAssets` del contexto del detalle.
- Produces:
  - `domain/telework-supplies.interface.ts`: unión de los cinco estados y la matriz discriminada como el DTO del API (`EmployeeTeleworkSuppliesData`), y el payload del evento:
    `export interface TeleworkSuppliesSummaryLoaded { applies: boolean; categoryByAssignment: Record<number, AssetTypeTeleworkCategory> }`
  - `domain/telework-supplies.helpers.ts`: `resolveStatusSeverity(status): 'success' | 'info' | 'secondary' | 'danger'` (`delivered` success, `shipping` info, `own_equipment` secondary, `uncovered` danger, `not_delivered` secondary); `resolveSummaryChips(summary): Array<{ key: 'complete' | 'uncovered' | 'shipping' | 'unsigned_custody'; label: string; severity: ... }>` (reutilizable por el listado de teletrabajadores: `complete` si `uncoveredCount + shippingCount === 0`, si no `{n} sin cubrir` y/o `{n} en envío`; `{n} resguardo(s) sin firmar` solo si `unsignedCustodyCount > 0`); `resolveLegendKey(isLegallyRequired): 'legend.required' | 'legend.preventive'`; `buildCategoryByAssignment(data): Record<number, AssetTypeTeleworkCategory>` (solo categorías con `assets` no vacío, clave `employeeSupplyId`).
  - `application/use-employee-telework-supplies.ts`: `useEmployeeTeleworkSupplies(deps: { repository }, employeeId: Ref<number | null>): { loading, error, data, load, retry }` — igual a `use-employee-assets` (sin toast; error local).
  - `infrastructure/employee-telework-supplies.repository.ts`: `employeeTeleworkSuppliesRepository.fetchTeleworkSupplies(params: AssetRequestParams, employeeId: number): Promise<EmployeeTeleworkSuppliesData>` con `assetFetch(params, `/employees/${employeeId}/telework-supplies`)`.
  - Componente: props `{ employeeId: number }` requerido; emite `summary-loaded` con `TeleworkSuppliesSummaryLoaded` en cada carga exitosa (con `applies: false` va el mapa vacío); se renderiza solo si `data.applies` (presencial y baja no ven el bloque; sin estado vacío).
  - `assets.vue`/`assets.script.ts`: `employeeTeleworkSuppliesPanel` montado encima de `employeeAssetsPanel` con `@summary-loaded`; el handler guarda el payload en una ref (la Tarea 5 la consume).
  - Locales es/en (raíz `employee_telework_supplies_panel`, textos exactos de R4): `title` "Insumos de teletrabajo" / "Telework supplies"; `legend.required` "Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)" / "Required: this employee is on the teleworkers list (NOM-037 5.7, LFT 330-E)"; `legend.preventive` "Registro preventivo: no está en el listado de teletrabajadores" / "Preventive record: not on the teleworkers list"; `category.ergonomic_chair` "Silla ergonómica" / "Ergonomic chair", `category.computing_equipment` "Equipo de cómputo o impresión" / "Computing or printing equipment", `category.accessory` "Aditamento" / "Accessory"; `status.delivered` "Entregado" / "Delivered", `status.shipping` "En envío" / "In transit", `status.own_equipment` "Equipo propio declarado" / "Own equipment declared", `status.uncovered` "Sin cubrir" / "Uncovered", `status.not_delivered` "Sin entregar" / "Not delivered"; `summary.complete` "Completo" / "Complete", `summary.uncovered` "{n} sin cubrir" / "{n} uncovered", `summary.shipping` "{n} en envío" / "{n} in transit", `summary.unsigned_custody` "{n} resguardo(s) sin firmar" / "{n} unsigned custody contract(s)"; `assignment.shipping` "En envío" / "In transit"; `custody.signed` "Resguardo firmado" / "Custody signed", `custody.unsigned` "Resguardo sin firmar" / "Custody not signed"; `load_failed` "No se pudo cargar el cumplimiento de insumos." / "Telework supplies compliance could not be loaded."; `retry` "Reintentar" / "Retry"; `open_asset` "Abrir el activo {name}" / "Open asset {name}" (aria-label, área táctil ≥ 44 px).

- [ ] **Paso 1: escribir las pruebas en rojo**

`tests/employeeTeleworkSuppliesPanel/telework-supplies.helpers.spec.ts` (vitest, helpers puros):

```ts
it('resuelve la severidad de los cinco estados') // delivered→success shipping→info own_equipment→secondary uncovered→danger not_delivered→secondary
it('arma los chips de resumen: completo, pendientes y resguardos sin firmar')
// {uncovered:0, shipping:0} → [complete] · {uncovered:2, shipping:1} → ['2 sin cubrir', '1 en envío']
// {unsignedCustody:3} → incluye '3 resguardo(s) sin firmar' · con 0 no incluye ninguno
it('elige la leyenda por isLegallyRequired') // true→legend.required false→legend.preventive (R4, textos exactos)
it('arma el mapa de categorías por resguardo solo con activos que cubren')
// matriz CA-2 → { [monitorId]: 'computing_equipment', [laptopId]: 'computing_equipment', [sillaEnvioId]: 'ergonomic_chair' }
// aplica false / categorías vacías → {}
```

`tests/employeeTeleworkSuppliesPanel/use-employee-telework-supplies.spec.ts` (RF-5):

```ts
it('un fallo de carga deja error en true y permite reintentar')
// repositorio que rechaza → error true, data null · retry con repositorio que resuelve → error false, data presente
it('no consulta si employeeId es null') // load() sin llamada al repositorio
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/employeeTeleworkSuppliesPanel` → FAIL (archivos inexistentes).

- [ ] **Paso 3: implementar**

1. `domain/telework-supplies.interface.ts` y `domain/telework-supplies.helpers.ts` tal cual Interfaces (puros, sin `useI18n`: los textos de chips y leyenda los resuelve el script con `t`).
2. `infrastructure/employee-telework-supplies.repository.ts` y `application/use-employee-telework-supplies.ts` espejo de `employeeAssetsPanel` (`assetFetch` importado de `~/pages/supplies/infrastructure/asset-http`).
3. `script.ts` del panel: mismo patrón que `employeeAssetsPanel/script.ts` (mergeLocaleMessage, request params, composable con `toRef`); además `emit('summary-loaded', { applies, categoryByAssignment })` con cada carga exitosa y `resolveStatusSeverity`, `resolveSummaryChips`, `resolveLegendKey` expuestos al template.
4. `index.vue` (card sin borde, iconos SVG en línea, sin emojis): `loading` → tres renglones de `Skeleton`; `error` → `Message severity="error"` + `Button` Reintentar; éxito con `applies` → Card "Insumos de teletrabajo" con la leyenda R4 bajo el título (`resolveLegendKey`), chips de `resolveSummaryChips` en el header, y tres renglones en el orden del API: rótulo (`category.*`), `Tag` de estado (`resolveStatusSeverity`) y, por activo, nombre como `NuxtLink` a `localePath` de `{ path: '/supplies', query: { activo: String(supplyId), tab: 'resguardo' } }` con aria-label `open_asset`, folio, chip de asignación (`En envío` si `shipping`) y chip de resguardo (`custody.*`, severity success/warn). Sin vacío: tres renglones o nada.
5. `style.scss`: renglones apilados en móvil; desde `md`, grid categoría | estado | activos; sin desplazamiento horizontal a 360 px.
6. `assets.vue`: montar el panel encima de `employeeAssetsPanel` (misma guarda `v-if="employeeId && canReadAssets"`) con `@summary-loaded`; `assets.script.ts`: ref con el payload y handler.

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/employeeTeleworkSuppliesPanel tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu
                                        → PASSED (los 14 archivos/118 pruebas de la línea base + los nuevos)
npm run lint:i18n                       → sin claves nuevas sin traducción
npm run lint:icons                      → grosor uniforme
npx eslint components/employeeTeleworkSuppliesPanel 'pages/employees/[employeeSlug]' tests/employeeTeleworkSuppliesPanel
                                        → 0 errores (el warning v-html preexistente no crece)
npm run typecheck 2>&1 | grep -cE 'employeeTeleworkSuppliesPanel|employees/\[employeeSlug\]'   → 0
                                        (los 277 errores del typecheck son preexistentes y ninguno en estas áreas)
grep -rnE "method: '(POST|PUT|PATCH|DELETE)'" components/employeeTeleworkSuppliesPanel
                                        → salida vacía (el bloque no escribe)
```

- [ ] **Paso 5: commit**

```bash
git add components/employeeTeleworkSuppliesPanel pages/employees/[employeeSlug] tests/employeeTeleworkSuppliesPanel
git commit -m "feat(empleados): agrega el bloque de insumos de teletrabajo en la ficha

Tres categorias con su estado, leyenda de la NOM-037 segun el umbral y
chips de resumen; la prueba la comparte con el listado mediante el evento
summary-loaded.

Refs: VLRH-H1791485252682"
```

---

### Tarea 5 (gsti-rh-bo): etiqueta de categoría en los activos vigentes de la lista

La etiqueta de la categoría del insumo en los renglones vigentes de la sección, solo cuando el bloque aplica (CA-11, propia 4).

**Files:**
- Modify: `components/employeeAssetsPanel/script.ts` (prop `teleworkCategoryByAssignment`), `index.vue` (Tag de categoría), `domain/employee-assets.helpers.ts` (resolver por `employeeSupplyId` solo en vigentes), `domain/locales/employee-assets-panel.es.json` + `.en.json` (`category.*`), `pages/employees/[employeeSlug]/assets.script.ts` (pasar el mapa como prop)
- Test: Modify `tests/employeeAssetsPanel/employee-assets.helpers.spec.ts`

**Interfaces:**
- Consumes: de la Tarea 4: `TeleworkSuppliesSummaryLoaded` (`categoryByAssignment: Record<number, AssetTypeTeleworkCategory>`); el renglón de `employeeAssetsPanel` ya trae `employeeSupplyId` y `status` (`'active' | 'shipping' | 'retired'`).
- Produces:
  - `resolveRowTeleworkCategory(row: { employeeSupplyId: number; status: 'active' | 'shipping' | 'retired' }, categoryByAssignment: Record<number, AssetTypeTeleworkCategory> | undefined): AssetTypeTeleworkCategory | null` en `employee-assets.helpers.ts` — `null` si el mapa no existe o está vacío, si el renglón es `retired` o si su resguardo no está en el mapa (cruzar por `employeeSupplyId` evita marcar el renglón histórico de un activo devuelto y reasignado).
  - Prop `teleworkCategoryByAssignment: { type: Object as () => Record<number, AssetTypeTeleworkCategory>, default: () => ({}) }` en `employeeAssetsPanel` — sin mapa (bloque ausente o `applies: false`) no se pinta ninguna etiqueta.
  - Locales `employee_assets_panel.category.ergonomic_chair` "Silla ergonómica" / "Ergonomic chair", `.computing_equipment` "Equipo de cómputo o impresión" / "Computing or printing equipment", `.accessory` "Aditamento" / "Accessory" (rótulos copiados, no importados del drawer).

- [ ] **Paso 1: escribir las pruebas en rojo**

En `tests/employeeAssetsPanel/employee-assets.helpers.spec.ts`:

```ts
describe('resolveRowTeleworkCategory', () => {
  it('etiqueta renglones vigentes presentes en el mapa (CA-11)')
  // resolveRowTeleworkCategory({ employeeSupplyId: 912, status: 'active' }, { 912: 'ergonomic_chair' }) → 'ergonomic_chair'
  // resolveRowTeleworkCategory({ employeeSupplyId: 913, status: 'shipping' }, { 913: 'computing_equipment' }) → 'computing_equipment'
  it('sin etiqueta en devueltos, ausentes del mapa o sin mapa (propia 4)')
  // status 'retired' con id en el mapa → null · id ausente → null · undefined → null · {} → null
})
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/employeeAssetsPanel` → FAIL (el helper no existe).

- [ ] **Paso 3: implementar**

1. Helper en `domain/employee-assets.helpers.ts` según Interfaces.
2. Prop en `script.ts` y exposición del helper con la etiqueta traducida (`t(\`employee_assets_panel.category.${category}\`)`).
3. `index.vue`: en los renglones vigentes, `Tag` con el rótulo de la categoría cuando el helper devuelve no-null (junto a los chips existentes; `secondary`); los devueltos nunca.
4. Locales es/en con los tres rótulos.
5. `assets.script.ts`: pasa `teleworkCategoryByAssignment` del payload guardado en la Tarea 4 al panel de activos como prop.

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/employeeAssetsPanel tests/employeeTeleworkSuppliesPanel tests/employeeDetail tests/employeeSectionsMenu   → PASSED
npm run lint:i18n          → sin claves nuevas sin traducción
npm run lint:icons         → limpio
npx eslint components/employeeAssetsPanel 'pages/employees/[employeeSlug]' tests/employeeAssetsPanel   → 0 errores
npm run typecheck 2>&1 | grep -cE 'employeeAssetsPanel|employees/\[employeeSlug\]'   → 0
```

- [ ] **Paso 5: commit**

```bash
git add components/employeeAssetsPanel pages/employees/[employeeSlug]/assets.script.ts tests/employeeAssetsPanel
git commit -m "feat(empleados): etiqueta los activos vigentes con su categoria de insumo

La etiqueta la resuelve el bloque de insumos por resguardo, no la lista:
asi un activo devuelto y reasignado no queda marcado en el historico.

Refs: VLRH-H1791485252682"
```

---

### Tarea 6: manual de QA — último entregable, solo se entrega

El usuario recorre este manual él mismo. No se ejecuta aquí ni se automatiza: se escribe y se entrega (decisión de producto, Wilvardo 2026-10-08).

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-ver-el-cumplimiento-de-insumos-del-teletrabajador-qa-flujo.md` (en gsti-rh-api, donde se versiona)

**Interfaces:**
- Consumes: la skill `manual-qa` (reglas en `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `manual-qa-execution.md`): cada escenario abre con su línea `Objetivo:` antes de los pasos, pasos con datos exactos, resultado esperado y evidencia; los correos exactos de los roles de prueba y la contraseña literal del sembrador compartido `_tmp_do_not_commit_qa_seeder.ts` (si falta una cuenta, se agrega ahí; ese archivo no se commitea); los fixtures de la Tarea 4 ejecutados contra el BO real.
- Produces: el manual para el recorrido manual; los hallazgos que surjan los registra el usuario en `qa-valanserh/hallazgos.md` (cuadro de 14 campos; el código va en Comentarios/Historial, no en Evidencia) y se corrigen en esta misma rama.

- [ ] **Paso 1: cargar las reglas y escribir el manual**

Skill `manual-qa` antes de escribir. Escenarios (todos abren con `Objetivo:`):

1. **Cumplimiento completo con obligatorio** — Colaborador Home Office al 100% con silla de tipo "Silla ergonómica" entregada con resguardo firmado: bloque "Insumos de teletrabajo" arriba de los activos, silla "Entregado" con su activo, cómputo "Sin cubrir", Aditamento "Sin entregar", leyenda "Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)", chip de resumen con pendientes.
2. **Registro preventivo** — Híbrido al 20%: mismo bloque con leyenda "Registro preventivo: no está en el listado de teletrabajadores".
3. **Umbral exacto** — Híbrido al 40%: leyenda de obligatorio y la persona aparece en el listado de teletrabajadores.
4. **En envío** — monitor entregado + laptop en camino: cómputo "Entregado" con los dos activos, la laptop con "En envío"; con solo la laptop en camino: cómputo "En envío".
5. **Devuelto no cubre** — única laptop devuelta: cómputo "Sin cubrir".
6. **Etiquetas en la lista (CA-11)** — silla y laptop vigentes con su etiqueta, celular sin categoría y activos devueltos sin etiqueta.
7. **Reclasificación (CA-7)** — quitar la categoría al tipo en Activos e insumos: la ficha deja de contar la categoría al reabrirse.
8. **Sin bloque** — colaborador presencial (aunque tenga porcentaje residual) y dado de baja: solo sus activos, sin bloque; usuario sin `supplies:read`: sin sección ni bloque ni petición en la red.
9. **Error aislado** — con la API de la matriz caída (o token inválido en la pestaña de red): el bloque muestra su error con Reintentar y la lista de activos sigue funcionando.
10. **Responsivo e idiomas** — 360 px sin desplazamiento horizontal, renglones apilados; en inglés, leyenda y rótulos traducidos.

Cada escenario: pasos exactos, credenciales de los roles de prueba del sembrador QA, resultado esperado y cómo adjuntar evidencia.

- [ ] **Paso 2: verificación de formato**

`npm run lint:i18n` y `npm run lint:icons` siguen limpios (el manual no toca claves); revisión propia contra las reglas de `manual-qa`: cada escenario abre con su `Objetivo:`.

- [ ] **Paso 3: commit y entrega**

```bash
git add docs/superpowers/plans/2026-10-12-ver-el-cumplimiento-de-insumos-del-teletrabajador-qa-flujo.md
git commit -m "docs(qa): agrega el manual de recorrido del bloque de insumos de teletrabajo

Refs: VLRH-H1791485252682"
```

Entregar la ruta al usuario y **esperar su recorrido manual**: los hallazgos que reporte se registran en `qa-valanserh/hallazgos.md` y se corrigen en esta misma rama.

---

## Definition of Done — líneas base medidas (2026-10-12, ramas a la par de origin/multitenant)

Todas las verificaciones se midieron contra el árbol actual antes de escribir este plan; estos números son los que valen.

**gsti-rh-api** (`NODE_ENV=test`, BD `sae_pruebas` al día):

| Comando | Línea base | Criterio |
|---|---|---|
| `node ace test unit --files="telework_supplies.rules.spec.ts"` | (nuevo) | PASSED |
| `node ace test functional --files="assets_telework_supplies.spec.ts"` | (nuevo) | PASSED, todos los casos |
| `node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"` | PASSED 22/22 | PASSED 23/23 (fila nueva) |
| `node ace test unit --files="constants/"` | PASSED 148/148 | PASSED (sin cambios de catálogo) |
| `node ace test functional --files="supplies_permission_gate.spec.ts"` | **4 aprobadas, 2 fallidas** | **sin fallos nuevos**: los 2 preexistentes son `TenantContextMissingException` de fixtures con `SupplyType.query()` fuera de request (heredados de `USRH1789600808831`, presentes en `multitenant`) y **se escalan a Wilvardo**, no se arreglan aquí; con la prueba nueva: 5 aprobadas, mismas 2 |
| `node ace test functional --files="assets_employee_assets.spec.ts"` | PASSED 15/15 | sin regresión |
| `node ace test functional --files="assets_module.spec.ts"` | PASSED 24/24 | sin regresión (no se toca) |
| `npm run typecheck` | exit 0, 0 errores | exit 0 |
| `npx eslint` sobre los `.ts` del censo (`app/modules/assets`, `app/constants`) | 0 problemas | 0 problemas. **No pasar `resources/langs/*.json` por eslint**: 5966 errores `quotes` preexistentes (reglas de JS sobre JSON), fuera de alcance |
| `git grep -n "estrictamente" -- app/constants/employee_work_schedule.ts` | 1 (el JSDoc) | 0 (CA-12) |
| `git grep -n "40" -- app/modules/assets \| wc -l` | 44 (ninguna del umbral; 403/404 de Swagger y un ejemplo de summary) | 44, sin crecimiento; ningún literal nuevo de umbral (CA-12) |
| `git grep -nE "deepEqual\|assertBody\(" -- tests/functional/assets_telework_supplies.spec.ts` | (nuevo) | 0 (CA-14; `assert.containsSubset` existe en `@japa/assert` v3) |
| `git diff --name-only origin/multitenant...HEAD -- app/services/telework_worker_service.ts app/modules/assets/dto/assets.dto.ts tests/functional/assets_module.spec.ts` (api) y `pages/telework-workers` (bo) | vacío | vacío (CA-13) |
| `git diff --name-only origin/multitenant...HEAD` (ambos repos) | vacío | subconjunto de las filas `nuevo`/`editado` del censo (§ censo del spec) |

**gsti-rh-bo:**

| Comando | Línea base | Criterio |
|---|---|---|
| `npx vitest run tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu` | 14 archivos, 118 pruebas, PASSED | PASSED + los archivos nuevos de `tests/employeeTeleworkSuppliesPanel` |
| `npm run typecheck` | **exit 2, 277 errores TS preexistentes** | **0 errores en las áreas de la HU** (`grep -cE 'employeeTeleworkSuppliesPanel\|employeeAssetsPanel\|employees/\[employeeSlug\]'` sobre la salida → 0) |
| `npx eslint components/employeeAssetsPanel 'pages/employees/[employeeSlug]' tests/employeeAssetsPanel` | 0 errores (1 warning preexistente `v-html`) | 0 errores |
| `npm run lint:i18n` | limpio (31 claves heredadas en la línea base) | sin claves nuevas sin traducción |
| `npm run lint:icons` | limpio | limpio |

**Notas para el executor:**

- Los 2 fallos preexistentes de `supplies_permission_gate.spec.ts` se **escalan a Wilvardo**; no se arreglan ni se copian sus patrones (nada de `SupplyType.query()`/`Supplie.query()` fuera de request: fixtures con `db.table`, `createEmployeeFixture` y el owner por API, como `assets_employee_assets.spec.ts`).
- Swagger del endpoint con la unión discriminada documentada (Paso 3.3 de la Tarea 3).
- El manual de QA (Tarea 6) se **entrega**: el recorrido lo hace el usuario.
- No se crea PR ni se despliega: eso lo levanta el equipo (Wilvardo) por su cuenta.
