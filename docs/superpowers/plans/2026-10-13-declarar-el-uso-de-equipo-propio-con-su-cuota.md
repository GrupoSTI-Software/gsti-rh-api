# Declarar el uso de equipo propio con su cuota de compensación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que RH declare, desde la matriz "Insumos de teletrabajo" de la ficha del colaborador, que una persona usa equipo propio en una categoría de la norma, con descripción, condiciones, fecha de inicio y cuota mensual capturada; que la matriz muestre esa categoría como "Equipo propio declarado" (nunca como entregada) y que el resumen la cuente aparte.

**Architecture:** En el API, dentro de `app/modules/assets`: una tabla nueva completa (`employee_own_equipment_declarations`, con UNIQUE de una vigente por colaborador y categoría sobre una columna generada VIRTUAL), un puerto con adaptador MySQL (`db.from`, alcance de empresas dentro de cada query, candado `forUpdate` del colaborador dentro de la transacción del alta), un servicio `create` con pre-chequeo → transacción → re-chequeo → `ER_DUP_ENTRY` a 409, y la extensión de la regla pura y el servicio de la matriz para producir el estado `own_equipment` con la declaración vigente adjunta. En el BO, un panel por categoría (`components/ownEquipmentDeclarationPanel/`) con drawer de alta, montado en `employeeTeleworkSuppliesPanel`, con el permiso de escritura resuelto una vez por sección en un composable propio fail-closed.

**Tech Stack:** AdonisJS 6 (Japa, vine, Lucid `db.from`, migraciones Knex), MySQL, Nuxt 3 / Vue 3 `setup` con vitest, PrimeVue (`Drawer`, `DatePicker`, `InputNumber`, `Message`, `Toast`), `assetFetch` del slice de activos.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791306075599.md` (código `VLRH-H1791306075599`, SP 3, rama `feature/VLRH-H1791306075599-declarar-el-uso-de-equipo-propio-con-su-cuota-de`). El plan argumenta desde el spec: léelo completo antes de cada tarea; sus secciones §10 (modelo de datos), §11 (contrato de API) y el censo de archivos son el contrato. Sus anclas fueron revalidadas contra el código el 2026-10-13 (api `56cda8a2` = bo `b18992b7` = punta de la rama base `feature/VLRH-H1791485252682-...` en ambos repos); el drift trivial se corrige al momento, el de alcance/contrato/regla se escala a Wilvardo.

## Restricciones globales

- **Ramas:** `feature/VLRH-H1791306075599-declarar-el-uso-de-equipo-propio-con-su-cuota-de` en ambos repos, ya creadas y limpias, exactamente a la par de la rama base `feature/VLRH-H1791485252682-ver-el-cumplimiento-de-insumos-del-teletrabajador` (api `56cda8a2`, bo `b18992b7`). No se crea PR ni se despliega: el plan termina en la verificación automatizada y la entrega del manual de QA (eso lo levanta Wilvardo por su cuenta).
- **No tocar** (censo `no-tocado` + no-objetivos + CA-16): `app/services/employee_supplie_service.ts` (asignar un activo no cierra la declaración), `app/services/employee_service.ts` (`deleteAllEmployees` queda bloqueada por la FK a propósito), `app/services/telework_compliance_setting_service.ts` (`getEffective` es de la hermana B), `app/modules/assets/asset_files.controller.ts` (evidencia es de la hermana C), `app/constants/supplies_permission_declarations.ts` y `tests/functional/supplies_permission_gate.spec.ts` (la escritura declara Empleados, no supplies), `app/constants/system_modules_menu/system_modules.constant.ts`, `tests/functional/assets_telework_supplies.spec.ts` (regresión: corre, no se edita), `tests/functional/assets_module.spec.ts`, BO: `pages/employees/[employeeSlug]/application/use-employee-assets-section-access.ts`, `components/employeeTeleworkSuppliesPanel/domain/locales/*` (el rótulo `status.own_equipment` ya lo creó la hermana anterior), `components/employeeAssetsPanel/**`, y nada de `valanserh-app-employee`.
- **Frontera con las hermanas B y C (CA-16):** sin `PUT .../:declarationId`, sin `.../close`, sin `.../file`, sin subir archivos, sin leer `getEffective`, sin precarga de cuota estándar, sin chip de origen, sin histórico. `fee_source` siempre lo fija el servidor (`adjusted`); `status` siempre nace `active`. La tabla sí nace completa con las columnas que B y C escriben (`end_date`, `closed_reason`, `closed_by_user_id`, `file`).
- **Sin modelo Lucid** para la tabla nueva: todo va por puerto y adaptador con `db.from`, `whereIn` de alcance dentro de cada query. Nada de `TenantContext` en `findOpenByEmployees` (recibe `businessUnitIds` posicional y obligatorio); el servicio de alta sí lee `TenantContext.getScope()` (solo vive en HTTP).
- **`own_equipment` sale solo de la regla pura** de `telework_supplies.rules.ts`: ni el BO ni el servicio de alta calculan estados. No se toca `TELEWORK_SUPPLY_COVERAGE_STATUSES` ni sus rótulos.
- **Un solo `permissionGate` por ruta** (lo cuenta `gateCount` del test de rutas). No apilar dos.
- **Cero `any`:** la cuota viaja cruda como `unknown` hasta `parseMonthlyFee`; lista blanca estricta en vine (el validador no acepta `feeSource`, `status`, `endDate`, `closedReason`, `businessUnitId`, `employeeId` ni archivos).
- **`ER_DUP_ENTRY` se detecta por `error.code === 'ER_DUP_ENTRY'` dentro del servicio**; cualquier otro error sube a `respondAssetsModuleError` como 500 `error-inesperado`. Sin `error.message` en la respuesta; ni cuota, ni descripción, ni condiciones en logs ni en `detail`.
- **i18n es + en** en API y BO, sin emojis; los errores del API llevan `type/title/message/detail/key`, sin `code`.
- **Commits:** Conventional Commits en español (tipo en inglés, descripción imperativa), cuerpo con el porqué y `Refs: VLRH-H1791306075599`. El hook del api solo corre eslint; en el BO, la auditoría de `.claude/rules/compliance-check.md` sobre los archivos tocados cierra cada tarea (línea **Compliance**).
- **BD de pruebas:** `sae_pruebas` (`NODE_ENV=test`), ya puesta al día en esta rama con `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (≈42 s). Un esquema atrasado produce fallos falsos.
- **Fechas y cuota:** `startDate` viaja como texto `YYYY-MM-DD`; la cuota puede llegar número o texto pero se valida con `^\d{1,8}(\.\d{1,2})?$` y `<= MAX_ALLOWANCE` (99999999.99). El 0 se acepta; `""`, `null`, ausente y `"abc"` se rechazan.
- **QA manual:** único manual, de frontend (la HU trae pantalla), último entregable y solo se entrega: el recorrido lo hace el usuario. Los hallazgos se registran en `qa-valanserh/hallazgos.md` y se corrigen en esta misma rama.

## Review Focus

Entradas o condiciones que el spec implica pero ningún CA ejercita por sí solo, y que por eso son las más propensas a morder. Cada línea lleva su prueba en la tarea dueña del código.

1. **Cuota 0 vs cuota vacía:** `monthlyFee: 0` se acepta (CA-2), pero `""` y `null` se rechazan — `Number("") === 0` las dejaría pasar. Prueba en Tarea 3 (casos discriminantes de CA-3).
2. **Cuota con centavos:** `0.29` es válido — una validación `Math.round(v * 100) === v * 100` lo rechaza por ruido de coma flotante; la regla correcta es el texto con `^\d{1,8}(\.\d{1,2})?$`. Prueba en Tarea 3 (CA-2/CA-3).
3. **Fecha de inicio imposible:** `2026-02-30` pasa la regex del validador; solo `DateTime.fromISO(...).isValid` en el servicio la rechaza como `entrada-invalida`. Prueba en Tarea 3 (CA-9).
4. **Resguardo borrado lógicamente no bloquea declarar:** `hasOpenCoverage` filtra `employee_supply_deleted_at` y `supply_deleted_at`; una devolución lógica con fila viva no es cobertura. Prueba en Tarea 2 (caso del puerto).
5. **Declaración de otra empresa en el lote:** `findOpenByEmployees` no mezcla filas entre empresas (R3); el resumen por lote cuenta solo el alcance y no lanza `TenantContextMissingException` sin petición. Prueba en Tarea 4 (CA-13).

---

### Tarea 1 (gsti-rh-api): la tabla de declaraciones — migración completa con vigente única

La tabla nace completa (las columnas de B y C incluidas) porque ninguna hermana vuelve a migrar. El UNIQUE de una vigente por colaborador y categoría usa una columna generada VIRTUAL, que Knex no expone.

**Files:**
- Create: `database/migrations/<prefijo 13 dígitos>_create_employee_own_equipment_declarations_table.ts` (el nombre exacto lo genera `node ace make:migration` en el Paso 3; anótalo y úsalo en el commit)
- Test: Create `tests/functional/assets_own_equipment_declarations.spec.ts` (parte 1: CA-14, sin HTTP)

**Interfaces:**
- Consumes: fixtures de `tests/functional/assets_telework_supplies.spec.ts` — `createTenantActor` / `cleanupTenantActor` (`#tests/helpers/tenant_actor`; el actor trae `user.userId`, `businessUnit.businessUnitId`), `createEmployeeFixture` / `cleanupEmployeeFixture` (`#tests/helpers/employee_fixture`), `db.table` para insertar por tabla.
- Produces (el contrato de columnas que las Tareas 2-4 consumen; es el §10 del spec, verbatim):
  - `employee_own_equipment_declaration_id` INT UNSIGNED AI PK · `employee_id` FK `employees.employee_id` ON DELETE RESTRICT `fk_eoed_employee` · `business_unit_id` FK `business_units` RESTRICT `fk_eoed_business_unit` · `..._category` ENUM(`ergonomic_chair`,`computing_equipment`,`accessory`) · `..._description` VARCHAR(255) NOT NULL · `..._conditions` TEXT NULL · `..._start_date` DATE NOT NULL · `..._end_date` DATE NULL · `..._monthly_fee` DECIMAL(10,2) NOT NULL · `..._fee_source` ENUM(`default`,`adjusted`) NOT NULL · `..._file` VARCHAR(500) NULL · `..._status` ENUM(`active`,`closed`) NOT NULL DEFAULT `active` · `..._closed_reason` VARCHAR(30) NULL · `..._created_by_user_id` FK `users` RESTRICT `fk_eoed_created_by_user` NOT NULL · `..._closed_by_user_id` FK `users` RESTRICT `fk_eoed_closed_by_user` NULL · `..._created_at`/`..._updated_at`/`..._deleted_at` TIMESTAMP.
  - Índices: `UNIQUE uq_eoed_employee_category_open (employee_id, ..._category, ..._open_flag)` e `INDEX idx_eoed_bu_employee (business_unit_id, employee_id)`; la columna generada `..._open_flag TINYINT UNSIGNED VIRTUAL` = `CASE WHEN status = 'active' AND deleted_at IS NULL THEN 1 ELSE NULL END` (MySQL admite varios NULL en el UNIQUE: cerrar o borrar libera el índice).
  - Prefijo de columnas `employee_own_equipment_declaration_`, sin seeder.

- [ ] **Paso 1: escribir la parte 1 del spec funcional en rojo**

`tests/functional/assets_own_equipment_declarations.spec.ts` — grupo con `RUN` único por corrida (como `assets_telework_supplies.spec.ts:45`), actor + colaborador fixture creados en `group.setup`, `cleanupEmployeeFixture`/`cleanupTenantActor` en `group.teardown`. Helper local `insertDeclaration(overrides)` que inserta por `db.table` una fila mínima con `employee_id`, `business_unit_id` y `..._created_by_user_id` = `actor.user.userId`. Casos:

```ts
test('CA-14: la FK impide borrar en duro al colaborador con una declaración')
// db.rawQuery('DELETE FROM employees WHERE employee_id = ?', [id]) → catch con error.code 'ER_ROW_IS_REFERENCED_2'

test('CA-14: el UNIQUE admite una sola vigente por categoría; cerrar libera')
// segunda INSERT active de la misma categoría → catch 'ER_DUP_ENTRY'
// UPDATE ..._status = 'closed' de la primera → INSERT active entra sin error

test('CA-14: la tabla distingue categorías y empresas')
// INSERT active de otra categoría del mismo colaborador entra
// INSERT con el business_unit_id del colaborador, nunca otro
```

- [ ] **Paso 2: correr y verificar el rojo**

`node ace test functional --files="assets_own_equipment_declarations.spec.ts"` → FAIL (la tabla no existe).

- [ ] **Paso 3: generar e implementar la migración**

1. `node ace make:migration create_employee_own_equipment_declarations_table`; verificar con `ls database/migrations | tail -1` que el prefijo es de 13 dígitos y queda después de `1791752317063_create_announcement_slides_table.ts` (si no, regenéralo: la lista de excepciones del test de convención no crece).
2. `up`: `createTable` con todas las columnas de Interfaces (los ENUM con literales en la migración), FKs con nombre, `idx_eoed_bu_employee`; después, FUERA de `createTable`, dos `this.schema.raw`: la columna generada VIRTUAL y el UNIQUE, molde `database/migrations/1787623518696000_add_is_public_to_billing_plans_table.ts:24-36`.
3. `down`: `this.schema.dropTableIfExists(...)` — sin raw (dropTable se lleva índices y FKs).

- [ ] **Paso 4: correr y verificar el verde**

```
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:run      → creada
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:rollback → retirada
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:run      → de nuevo
node ace test functional --files="assets_own_equipment_declarations.spec.ts" → PASSED (3/3)
node ace test unit --files="migration_filename_convention.spec.ts"             → PASSED
npm run typecheck                                                              → exit 0
```

- [ ] **Paso 5: commit**

```bash
git add database/migrations/<el-archivo-generado> tests/functional/assets_own_equipment_declarations.spec.ts
git commit -m "feat(activos): agrega la tabla de declaraciones de equipo propio

Nace completa, con las columnas que escriben las historias de ajuste
y evidencia, y con un UNIQUE sobre columna generada que admite a lo
sumo una declaracion vigente por colaborador y categoria: la FK sin
cascada conserva la evidencia de la NOM-037 aunque se borre al
colaborador en duro.

Refs: VLRH-H1791306075599"
```

---

### Tarea 2 (gsti-rh-api): contrato de módulo — constantes, errores, DTO, validador y puerto de lectura/escritura

Todo lo que la Tarea 3 (alta HTTP) y la Tarea 4 (matriz) consumen, sin HTTP: las keys de error, las factorías, el DTO, el validador y las consultas con el alcance dentro de cada query.

**Files:**
- Modify: `app/modules/assets/assets.constants.ts` (al final: 4 keys en `ASSET_ERROR_KEYS` y, junto a ellas, las dos constantes nuevas — lejos de `TELEWORK_SUPPLY_COVERAGE_STATUSES`, que CA-16 manda no tocar)
- Modify: `app/modules/assets/assets.error.ts` (4 factorías tras `employeeNotFound()`)
- Create: `app/modules/assets/dto/own_equipment_declarations.dto.ts`
- Create: `app/modules/assets/validators/own_equipment_declarations.validator.ts`
- Create: `app/modules/assets/own_equipment_declarations.repository.ts`
- Create: `app/modules/assets/own_equipment_declarations.repository.mysql.ts`
- Test: Modify `tests/functional/assets_own_equipment_declarations.spec.ts` (parte 1b: el puerto, sin HTTP)

**Interfaces:**
- Consumes: `OPEN_ASSIGNMENT_STATUSES` (`assets.constants.ts:26`), `AssetError` y `ASSET_ERROR_KEYS`, `SUPPLY_TYPE_TELEWORK_CATEGORIES` (`#constants/supply_type_telework_category`), `MAX_ALLOWANCE` (`#constants/telework_compliance_setting` = 99999999.99), `employeeIdParamsValidator` (`app/modules/assets/validators/assets.validator.ts:50`, ya existe; la Tarea 3 lo usa), el patrón de lectura con `db.from` de `assets.repository.mysql.ts` (`findTeleworkCoverage`).
- Produces:
  - `OWN_EQUIPMENT_DECLARATION_STATUSES = ['active', 'closed'] as const` + tipo; `OWN_EQUIPMENT_FEE_SOURCES = ['default', 'adjusted'] as const` + tipo.
  - `ASSET_ERROR_KEYS` gana: `CATEGORY_COVERED_BY_ASSET: 'categoria-cubierta-por-activo'`, `EMPLOYEE_WITHOUT_TELEWORK: 'colaborador-sin-teletrabajo'`, `OWN_EQUIPMENT_DECLARATION_OPEN_EXISTS: 'declaracion-de-equipo-propio-vigente-existente'`, `OWN_EQUIPMENT_FEE_INVALID: 'cuota-de-equipo-propio-invalida'`.
  - Factorías (es el texto respaldo; los títulos/detalles i18n exactos van en la Tarea 3): `AssetError.categoryCoveredByAsset()` 409, prefijo `asset_category_covered_by_asset`, 'Categoría cubierta por activo', 'El colaborador tiene un activo asignado o en envío en esta categoría; no se puede declarar equipo propio.' · `AssetError.employeeWithoutTelework()` 422, `asset_employee_without_telework`, 'Colaborador sin teletrabajo', 'Solo se declara equipo propio para colaboradores con porcentaje de teletrabajo mayor a 0.' · `AssetError.ownEquipmentDeclarationOpenExists()` 409, `asset_own_equipment_declaration_open_exists`, 'Declaración de equipo propio vigente existente', 'El colaborador ya tiene una declaración de equipo propio vigente en esta categoría.' · `AssetError.ownEquipmentFeeInvalid()` 422, `asset_own_equipment_fee_invalid`, 'Cuota de equipo propio inválida', 'Captura una cuota mensual de 0 o más, con hasta dos decimales y sin exceder 99,999,999.99.'
  - `dto/own_equipment_declarations.dto.ts`: `OwnEquipmentDeclarationDto = { declarationId: number; employeeId: number; category: SupplyTypeTeleworkCategory; description: string; conditions: string | null; startDate: string; monthlyFee: number; status: 'active' | 'closed'; createdAt: string }` (sin `businessUnitId` ni `file`: la empresa nunca sale y la llave del archivo es privada); `OwnEquipmentDeclarationInsert = { employeeId: number; businessUnitId: number; category: SupplyTypeTeleworkCategory; description: string; conditions: string | null; startDate: string; monthlyFee: number; feeSource: 'adjusted'; createdByUserId: number }`; `OwnEquipmentDeclarationByEmployee = { employeeId: number; declaration: OwnEquipmentDeclarationDto }`.
  - `createOwnEquipmentDeclarationValidator` = `vine.compile(schema.object({ category: vine.enum(SUPPLY_TYPE_TELEWORK_CATEGORIES), description: vine.string().trim().minLength(1).maxLength(255), conditions: vine.string().trim().maxLength(2000).optional(), startDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))` — **sin `monthlyFee`** (el controlador lo lee crudo) y sin ningún campo de la lista blanca prohibida.
  - Puerto `own_equipment_declarations.repository.ts` con `type OwnEquipmentDbExecutor = TransactionClientContract | typeof db`:
    `findEmployeeForDeclaration(executor, businessUnitIds: readonly number[], employeeId: number, options: { lock: boolean }): Promise<{ employeeId: number; businessUnitId: number; teleworkPercentage: number } | null>` (vivo y en alcance; `forUpdate` solo con `lock` y `executor` transacción) ·
    `hasOpenCoverage(executor, businessUnitIds, employeeId, category: SupplyTypeTeleworkCategory): Promise<boolean>` ·
    `hasOpenDeclaration(executor, businessUnitIds, employeeId, category): Promise<boolean>` ·
    `insert(trx: TransactionClientContract, row: OwnEquipmentDeclarationInsert): Promise<number>` (devuelve el id) ·
    `findById(executor, businessUnitIds: readonly number[], id: number): Promise<OwnEquipmentDeclarationDto | null>` ·
    `findOpenByEmployees(businessUnitIds: readonly number[], employeeIds: readonly number[]): Promise<OwnEquipmentDeclarationByEmployee[]>`.
  - Semántica del adaptador MySQL: espejo de `findTeleworkCoverage` — alias `es`/`s`/`st` en `hasOpenCoverage` (`employee_supplies` ⋈ `supplies` ⋈ `supply_types`, `es.employee_supply_status` en `OPEN_ASSIGNMENT_STATUSES`, `whereNull` de `employee_supply_deleted_at` y `supply_deleted_at`, `st.supply_type_telework_category = category`, `whereIn` de alcance dentro de la query); `findEmployeeForDeclaration` sobre `employees` con `whereNull('employee_deleted_at')` y `Number(row.employee_telework_percentage ?? 0)`; `hasOpenDeclaration` con `..._status = 'active'` y `whereNull(..._deleted_at)`; `findOpenByEmployees` con `whereIn` de empresa y colaborador y lista vacía en **cualquier** argumento → `[]` sin consultar; DECIMAL → `Number`, `DATE` → `'YYYY-MM-DD'` con helper local espejo del `calendarDate` de `assets.repository.mysql.ts`, `created_at` → `toISOString()`.

- [ ] **Paso 1: escribir la parte 1b del spec funcional en rojo**

Mismo archivo y grupo de la Tarea 1, casos nuevos:

```ts
test('RF: findOpenByEmployees respeta el alcance y las listas vacías')
// declaracion activa de A (E1) y otra de B (E2): findOpenByEmployees([buA], [idA]) → solo la de A
// ([], [idA]) → [] · ([buA], []) → []

test('RF: hasOpenCoverage solo con resguardo abierto de la categoría')
// es active de la categoría → true · es shipping → true · es retired → false
// es active con employee_supply_deleted_at lleno → false (devolución lógica no cubre)
// es active con supply_deleted_at lleno → false · otra categoría → false

test('RF: hasOpenDeclaration solo cuenta la vigente')
// status active → true · status closed → false · deleted_at lleno → false

test('RF: findEmployeeForDeclaration descarta ajeno, inexistente y dado de baja')
// A en alcance → { employeeId, businessUnitId, teleworkPercentage } con el porcentaje real
// id de B con [buA] → null · A con employee_deleted_at lleno → null

test('RF: insert escribe la fila completa y findById la devuelve como DTO')
// insert con feeSource 'adjusted' → findById: monthlyFee 350 (number), startDate '2026-11-01',
// createdAt ISO, conditions null, status 'active' · id inexistente → null
```

- [ ] **Paso 2: correr y verificar el rojo**

`node ace test functional --files="assets_own_equipment_declarations.spec.ts"` → FAIL en los casos nuevos (puerto inexistente).

- [ ] **Paso 3: implementar**

1. Constantes y factorías tal cual Interfaces (los JSDoc citan la regla de negocio y la HU).
2. DTO, validador y puerto con las firmas exactas de Interfaces.
3. Adaptador: espejo de `findTeleworkCoverage` para `hasOpenCoverage`; `db.from('employee_own_equipment_declarations')` para las lecturas propias; `insert` con `trx` y las columnas del prefijo; sin modelos ni mixin.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_declarations.spec.ts" → PASSED (8/8)
node ace test unit --files="constants/"                                   → PASSED 148/148
npm run typecheck                                                         → exit 0
npx eslint app/modules/assets                                             → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/assets.constants.ts app/modules/assets/assets.error.ts \
        app/modules/assets/dto/own_equipment_declarations.dto.ts \
        app/modules/assets/validators/own_equipment_declarations.validator.ts \
        app/modules/assets/own_equipment_declarations.repository.ts \
        app/modules/assets/own_equipment_declarations.repository.mysql.ts \
        tests/functional/assets_own_equipment_declarations.spec.ts
git commit -m "feat(activos): agrega el puerto y el contrato de la declaracion de equipo propio

Las cuatro llaves de error, el DTO sin empresa ni archivo, el
validador que deja la cuota fuera de vine y las consultas con el
alcance dentro de cada query: la vigente por lote es la que leen la
matriz y la adenda, sin modelo ni contexto de tenant.

Refs: VLRH-H1791306075599"
```

---

### Tarea 3 (gsti-rh-api): alta por HTTP — servicio, controlador, ruta con gate de Empleados, i18n

La única escritura de la historia: pre-chequeo, transacción con candado del colaborador, re-chequeo y `ER_DUP_ENTRY` a 409. El permiso es el de asignar activos (`employees:manage-employee-supplies`), declarado en Empleados — no en supplies.

**Files:**
- Create: `app/modules/assets/own_equipment_declarations.service.ts`
- Create: `app/modules/assets/own_equipment_declarations.controller.ts`
- Modify: `app/modules/assets/assets.routes.ts` (ruta al final del grupo, tras `telework-supplies`)
- Modify: `app/constants/employees_write_permission_declarations.ts` (junto a `createEmployeeSupply`, línea 225)
- Modify: `resources/langs/es.json` y `resources/langs/en.json` (tras el bloque `asset_employee_not_found_*`, ~3470)
- Test: Modify `tests/functional/assets_own_equipment_declarations.spec.ts` (parte 2: CA-1 a CA-12), `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts` (fila en el contrato de `assets.routes.ts`), `tests/unit/constants/employees_write_permission_declarations.spec.ts` (158 → 159 + aserción)

**Interfaces:**
- Consumes: de la Tarea 2, todo el bloque Produces. De la hermana anterior: `AssetError.employeeNotFound()` (404 `colaborador-no-encontrado`), `AssetError.teleworkCategoryInvalid()` (422 `categoria-de-insumo-invalida`), `respondAssetsModuleError`, `employeeIdParamsValidator`, `assertModuleEnforced`/`grantModulePermissions`/`businessUnitHeaders` de `#tests/helpers/tenant_actor`.
- Produces:
  - `export function parseMonthlyFee(raw: unknown): number` en el servicio — número o texto que cumpla `^\d{1,8}(\.\d{1,2})?$` y `<= MAX_ALLOWANCE`; todo lo demás (ausente, `null`, `""`, `"abc"`, `-1`, `12.345`, `100000000`, boolean, objeto) → `throw AssetError.ownEquipmentFeeInvalid()`. Pura y exportada.
  - `export class OwnEquipmentDeclarationsService { async create(employeeId: number, input: { category: SupplyTypeTeleworkCategory; description: string; conditions: string | null; startDate: string }, rawMonthlyFee: unknown, userId: number): Promise<OwnEquipmentDeclarationDto> }` — orden obligatorio: `TenantContext.getScope()` → `findEmployeeForDeclaration` sin candado, `null` → `employeeNotFound()` (la pertenencia se evalúa antes que cualquier 422/409, CA-8) → porcentaje 0 → `employeeWithoutTelework()` → `startDate` no calendario (regex + `DateTime.fromISO(...).isValid`, espejo de `assets.service.ts:44-71`) → `new AssetError(422, ASSET_ERROR_KEYS.INVALID_INPUT, 'asset_invalid_input', 'Datos inválidos', 'Revisa los datos enviados.')` → `parseMonthlyFee` → `hasOpenCoverage` → `categoryCoveredByAsset()` → `hasOpenDeclaration` → `ownEquipmentDeclarationOpenExists()` → `db.transaction`: `findEmployeeForDeclaration({ lock: true })` + re-chequeo de cobertura y vigente + `insert` con el `business_unit_id` de la fila del colaborador, `feeSource: 'adjusted'`, `createdByUserId: userId` → `error.code === 'ER_DUP_ENTRY'` → `ownEquipmentDeclarationOpenExists()`; al salir, `findById` para el DTO.
  - `OwnEquipmentDeclarationsController.store(ctx)`: `employeeIdParamsValidator.validate(params)` → `request.validateUsing(createOwnEquipmentDeclarationValidator)` con catch de vine: si algún mensaje es del campo `category` → `throw AssetError.teleworkCategoryInvalid()`, si no se relanza → cuota cruda `request.input('monthlyFee')` → `auth.getUserOrFail().userId` → 201 con `own_equipment_declaration_created_title` / `own_equipment_declaration_created_message` y el DTO en `data` → catch `respondAssetsModuleError`. Swagger en el JSDoc del handler (201, 403, 404, los dos 409, los tres 422 y el 500), como `assets.controller.ts`.
  - Ruta: `router.post('/employees/:employeeId/own-equipment-declarations', '#modules/assets/own_equipment_declarations.controller.store').use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.storeOwnEquipmentDeclaration))` dentro del grupo `auth` + `businessScope` existente.
  - `storeOwnEquipmentDeclaration: employeesStandard('manage-employee-supplies')` junto a `createEmployeeSupply`.
  - i18n (es/en): `asset_category_covered_by_asset_title/detail`, `asset_employee_without_telework_title/detail`, `asset_own_equipment_declaration_open_exists_title/detail`, `asset_own_equipment_fee_invalid_title/detail` (los textos es de la Tarea 2, verbatim), y `own_equipment_declaration_created_title` 'Declaración de equipo propio' / `own_equipment_declaration_created_message` 'Declaración de equipo propio guardada' (en: 'Own equipment declaration' / 'Own equipment declaration saved').

- [ ] **Paso 1: escribir la parte 2 del spec funcional y las filas de rutas/permisos en rojo**

Fixtures del mismo grupo; un actor A con `employees:manage-employee-supplies` concedido por `grantModulePermissions` (con `assertModuleEnforced` encendido), actor B de otra empresa, colaborador de B, y tipos/activos/resguardos por tabla como el helper `createTeleworkSupplyForA` de `assets_telework_supplies.spec.ts:90-119`. Casos:

```ts
test('CA-1: declarar con cuota capturada responde 201 y deja la fila ajustada')
// POST { category: 'ergonomic_chair', description: 'Silla de oficina con respaldo ajustable',
//        conditions: 'Buen estado; uso exclusivo para trabajo', startDate: '2026-11-01', monthlyFee: 350 }
// → 201, data.status 'active', data.monthlyFee 350, data.startDate '2026-11-01'
// en BD: fee_source 'adjusted', file/end_date/closed_reason/closed_by_user_id NULL,
//        created_by_user_id = actor.user.userId

test('CA-2: la cuota 0 y los decimales válidos se registran tal cual')
// computing_equipment con 0 → 201 monthlyFee 0 · accessory con 0.29 → 201 monthlyFee 0.29

test('CA-3: la cuota inválida responde 422 y no crea fila')
// -1 · ausente · null · "" · "abc" · 12.345 · 100000000
// → 422 { title: 'Cuota de equipo propio inválida', key: 'cuota-de-equipo-propio-invalida' } y 0 filas

test('CA-4: la categoría cubierta por un activo se rechaza, en resguardo o en envío')
// laptop active → 409 categoria-cubierta-por-activo · laptop shipping → 409 · laptop retired → 201

test('CA-5: a lo más una vigente por categoría; otra categoría sí')
// segunda declaración de ergonomic_chair → 409 declaracion-de-equipo-propio-vigente-existente
// computing_equipment → 201

test('CA-6: el doble envío simultáneo deja una sola fila')
// dos POST iguales de accessory con Promise.all → uno 201 y el otro 409 vigente-existente
// en BD una sola fila active de esa categoría

test('CA-7: sin teletrabajo se rechaza con 422')
// colaborador Onsite porcentaje 0 → 422 colaborador-sin-teletrabajo, sin fila

test('CA-8: ajeno, inexistente y dado de baja responden el mismo 404')
// id de C2 (empresa B), id inexistente y colaborador de E1 con employee_deleted_at lleno
// → 404 colaborador-no-encontrado con deepEqual del cuerpo completo en los tres casos, sin fila

test('CA-9: categoría, campos y lista blanca')
// category 'monitor' → 422 categoria-de-insumo-invalida
// description '' o 256 chars, conditions 2001, startDate '2026-02-30' → 422 entrada-invalida
// body con feeSource 'default', status 'closed', endDate, businessUnitId y employeeId ajenos → 201:
//   la fila queda adjusted/active/sin término, con la empresa y el colaborador de la ruta

test('CA-12: sin manage-employee-supplies el gate responde 403; root y owner cruzan')
// actor sin el permiso (módulo exigido) → 403 del gate, sin fila
// owner y root por bypass standard → 201
```

Fila en `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts`, en el contrato de `app/modules/assets/assets.routes.ts` (tras la fila de `telework-supplies`, línea 197) — `declaration` va con el identificador completo literal:

```ts
{ method: 'post', path: '/employees/:employeeId/own-equipment-declarations',
  handler: '#modules/assets/own_equipment_declarations.controller.store',
  declaration: 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.storeOwnEquipmentDeclaration' },
```

En `tests/unit/constants/employees_write_permission_declarations.spec.ts`: el conteo pasa de 158 a 159 con su línea de historia (`// 159: entra storeOwnEquipmentDeclaration, la declaración de equipo propio de la ficha`) y en el test de mapeo de Activos se agrega `assert.equal(d.storeOwnEquipmentDeclaration.action, 'manage-employee-supplies')`.

- [ ] **Paso 2: correr y verificar el rojo**

```
node ace test functional --files="assets_own_equipment_declarations.spec.ts"                    → FAIL en los casos HTTP (404 de ruta)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"          → FAIL (la fila no existe)
node ace test unit --files="employees_write_permission_declarations.spec.ts"                    → FAIL (conteo 158)
```

- [ ] **Paso 3: implementar**

1. Servicio con `parseMonthlyFee` y `create` según Interfaces (el catch de `ER_DUP_ENTRY` es el único re-mapeo; el resto sube).
2. Controlador delgado con el swagger de Interfaces.
3. Ruta + import de `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS` en `assets.routes.ts`; declaración en `employees_write_permission_declarations.ts`.
4. Diez claves i18n en es y en.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_declarations.spec.ts"                    → PASSED (18/18)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"          → PASSED 22/22 (la fila entra al mismo conteo de tests)
node ace test unit --files="employees_write_permission_declarations.spec.ts"                     → PASSED 9/9 (conteo interno 159)
node ace test functional --files="assets_telework_supplies.spec.ts"                               → PASSED 15/15 (sin regresión)
node ace test unit --files="constants/"                                                           → PASSED 148/148
npm run typecheck                                                                                  → exit 0
npx eslint app/modules/assets app/constants                                                       → 0 problemas
git grep -n "own-equipment-declarations/:declarationId" -- app/modules/assets/assets.routes.ts     → vacío (CA-16)
git grep -nE "fileUpload|getEffective" -- app/modules/assets/own_equipment_declarations.service.ts → vacío (CA-16)
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/own_equipment_declarations.service.ts \
        app/modules/assets/own_equipment_declarations.controller.ts \
        app/modules/assets/assets.routes.ts app/constants/employees_write_permission_declarations.ts \
        resources/langs/es.json resources/langs/en.json \
        tests/functional/assets_own_equipment_declarations.spec.ts \
        tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts \
        tests/unit/constants/employees_write_permission_declarations.spec.ts
git commit -m "feat(activos): expone el alta de la declaracion de equipo propio

Un POST por colaborador con el permiso de administrar sus suministros,
la cuota cruda validada por texto y una transaccion con candado del
colaborador que deja una sola vigente por categoria aunque lleguen
dos altas a la vez.

Refs: VLRH-H1791306075599"
```

---

### Tarea 4 (gsti-rh-api): la matriz cuenta el equipo propio — regla, DTO y tercera lectura por lote

El punto de extensión que la hermana anterior dejó abierto: el estado `own_equipment` sale de la regla pura con las declaraciones vigentes, y la matriz y el resumen adjuntan la declaración por categoría sin cambiar la firma pública del servicio ni la factoría.

**Files:**
- Modify: `app/modules/assets/dto/telework_supplies.dto.ts` (`ownEquipment` por variante de `TeleworkSupplyCategoryDto`)
- Modify: `app/modules/assets/telework_supplies.rules.ts` (`buildEmployeeTeleworkSupplies` gana las declaraciones; `buildCategoryDto` adjunta)
- Modify: `app/modules/assets/telework_supplies.service.ts` (segundo puerto, tercera lectura por lote, cableado de la factoría)
- Test: Modify `tests/unit/modules/assets/telework_supplies.rules.spec.ts`, `tests/functional/assets_own_equipment_declarations.spec.ts` (parte 3: matriz), `tests/functional/assets_telework_supplies.spec.ts` **solo corre** (regresión, no se edita)

**Interfaces:**
- Consumes: `findOpenByEmployees` de la Tarea 2; `buildEmployeeTeleworkSupplies`, `resolveCategoryStatus` y `summarizeTeleworkSupplies` tal como están.
- Produces (la Tarea 6 del BO espeja estos nombres):
  - `TeleworkSupplyCategoryDto`: la variante `delivered`/`shipping` gana `ownEquipment: OwnEquipmentDeclarationDto | null`; la variante `own_equipment` gana `ownEquipment: OwnEquipmentDeclarationDto` (nunca `null`); `uncovered` y `not_delivered` ganan `ownEquipment: null`.
  - `buildEmployeeTeleworkSupplies(profile, rows, ownEquipmentDeclarations: ReadonlyMap<SupplyTypeTeleworkCategory, OwnEquipmentDeclarationDto> = new Map())` — el tercer parámetro pasa de `Set` a `Map`: las llaves del mapa son el punto de extensión (`resolveCategoryStatus` recibe `new Set(map.keys())` y su firma no cambia); `buildCategoryDto` adjunta `ownEquipment` según la variante (en `own_equipment` un cast controlado con JSDoc: la llave existe por construcción porque el set y el mapa salen de las mismas filas; nunca `any`). El default vacío mantiene a los callers existentes compilando.
  - `TeleworkSuppliesService`: `constructor(private readonly repository: AssetsRepository, private readonly declarations: OwnEquipmentDeclarationsRepository = new OwnEquipmentDeclarationsRepositoryMysql())` — **opcional con adaptador por defecto**, porque `tests/functional/assets_telework_supplies.spec.ts` instancia `new TeleworkSuppliesService(spyPort)` y el censo manda no editarlo (el espía sigue viendo exactamente 2 llamadas: la tercera va al otro puerto, y con listas vacías no consulta). `matrixForEmployee` y `summarizeForEmployees` no cambian firma: ambas agregan la lectura `findOpenByEmployees(businessUnitIds, employeeIds)` (en el `Promise.all` del lote) y arman un `Map` de categoría → declaración por colaborador antes de construir.
  - `makeTeleworkSuppliesService()`: `new TeleworkSuppliesService(new AssetsRepositoryMysql(), new OwnEquipmentDeclarationsRepositoryMysql())` — la firma pública no cambia (cinco HUs dependen de ella).
  - `teleworkSuppliesSummary.ownEquipmentCount` pasa de siempre-0 a real: categorías en `own_equipment` (la invariante sigue sumando 3 con `applies`).

- [ ] **Paso 1: escribir en rojo las reglas y la matriz**

En `tests/unit/modules/assets/telework_supplies.rules.spec.ts` (los casos existentes que pasan un `Set` a `buildEmployeeTeleworkSupplies` se actualizan al `Map` con una declaración fixture — el censo lo edita):

```ts
test('la categoría con declaración vigente sale own_equipment con su declaración (CA-1, regla 6)')
// build con mapa { ergonomic_chair: dto } y rows [] → own_equipment, ownEquipment = dto, assets []

test('el activo manda sobre la declaración, que sigue vigente (regla 7, CA-11)')
// mapa con declaración + row active → delivered con ownEquipment = dto presente

test('el aditamento declarado pasa de not_delivered a own_equipment (CA-10)')
// mapa { accessory: dto } → accessory own_equipment

test('el resumen cuenta la declaración aparte y descuenta el pendiente (CA-1)')
// misma matriz con y sin mapa: ownEquipmentCount +1, uncoveredCount −1
// delivered/shipping sin declaración → ownEquipment null y no cambia conteos

test('un mapa vacío no cambia nada (la hermana anterior sigue igual)')
// build(profile, rows) y build(profile, rows, new Map()) → misma matriz
```

Parte 3 del spec funcional (`assets_own_equipment_declarations.spec.ts`, reutiliza el POST de la parte 2):

```ts
test('CA-1: la matriz muestra la declaración y el resumen baja un pendiente')
// tras el POST de CA-1: GET /api/employees/:id/telework-supplies →
//   ergonomic_chair con status 'own_equipment', ownEquipment.declarationId = el creado,
//   teleworkSuppliesSummary con ownEquipmentCount +1 y uncoveredCount −1

test('CA-10: el aditamento declarado pasa a own_equipment')
// accessory estaba not_delivered → tras declararlo: own_equipment

test('CA-11: asignar después un activo manda sobre la declaración, que sigue vigente')
// con declaración vigente en silla: asignar una silla active por tabla →
//   la matriz dice delivered, ownEquipment sigue con la declaración,
//   ownEquipmentCount baja en 1 y la fila de la declaración sigue active

test('CA-13: el resumen por lote solo cuenta el alcance y corre sin contexto')
// declaraciones en E1 y E2: makeTeleworkSuppliesService().summarizeForEmployees([buA], [idA, idB])
//   sin HttpContext ni TenantContext → solo idA con ownEquipmentCount 1, sin TenantContextMissingException
```

- [ ] **Paso 2: correr y verificar el rojo**

```
node ace test unit --files="telework_supplies.rules.spec.ts"                      → FAIL en los casos nuevos
node ace test functional --files="assets_own_equipment_declarations.spec.ts"        → FAIL en la parte 3
```

- [ ] **Paso 3: implementar**

1. DTO: `ownEquipment` por variante según Interfaces (import de `OwnEquipmentDeclarationDto` desde `./own_equipment_declarations.dto.js`).
2. Reglas: el tercer parámetro a `Map`, `new Set(map.keys())` hacia `resolveCategoryStatus`, attach en `buildCategoryDto` con el cast documentado de Interfaces.
3. Servicio: segundo puerto opcional, `findOpenByEmployees` en `matrixForEmployee` y en el `Promise.all` de `summarizeForEmployees`, `Map` por colaborador (clave categoría) y factoría cableada.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test unit --files="telework_supplies.rules.spec.ts"                        → PASSED
node ace test functional --files="assets_own_equipment_declarations.spec.ts"        → PASSED (22/22)
node ace test functional --files="assets_telework_supplies.spec.ts"                 → PASSED 15/15 (sin editar el archivo)
node ace test functional --files="assets_employee_assets.spec.ts"                   → PASSED 15/15
node ace test unit --files="constants/"                                             → PASSED 148/148
npm run typecheck                                                                    → exit 0
npx eslint app/modules/assets                                                        → 0 problemas
git diff feature/VLRH-H1791485252682-ver-el-cumplimiento-de-insumos-del-teletrabajador...HEAD -- \
  app/modules/assets/assets.constants.ts | grep TELEWORK_SUPPLY_COVERAGE_STATUSES    → vacío (CA-16)
git ls-files app/models | grep -ci own_equipment                                     → 0 (CA-16)
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/dto/telework_supplies.dto.ts app/modules/assets/telework_supplies.rules.ts \
        app/modules/assets/telework_supplies.service.ts \
        tests/unit/modules/assets/telework_supplies.rules.spec.ts \
        tests/functional/assets_own_equipment_declarations.spec.ts
git commit -m "feat(activos): la matriz de insumos cuenta el equipo propio declarado

El estado own_equipment sale de la regla pura alimentada por las
declaraciones vigentes, con una tercera lectura por lote en la matriz
y el resumen; la declaracion viaja por categoria y el conteo deja de
ser siempre cero sin que cambie la firma de la factoria.

Refs: VLRH-H1791306075599"
```

---

### Tarea 5 (gsti-rh-bo): el panel de la declaración y su drawer de alta

Hermano de `employeeAssetsPanel`: capas domain/application/infrastructure, drawer molde `assetTypesDrawer`, `assetFetch` para el POST. Puro de permisos — el permiso llega en la Tarea 6.

**Files:**
- Create: `components/ownEquipmentDeclarationPanel/index.vue`, `script.ts`, `style.scss`
- Create: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.interface.ts`, `domain/own-equipment-declaration.const.ts`, `domain/own-equipment-declaration.helpers.ts`
- Create: `components/ownEquipmentDeclarationPanel/application/use-own-equipment-declaration.ts`
- Create: `components/ownEquipmentDeclarationPanel/infrastructure/own-equipment-declarations.repository.ts`
- Create: `components/ownEquipmentDeclarationPanel/domain/locales/own-equipment-declaration-panel.es.json`, `.en.json`
- Modify: `components/employeeTeleworkSuppliesPanel/domain/telework-supplies.helpers.ts` (`canDeclareOwnEquipment`)
- Test: Create `tests/ownEquipmentDeclarationPanel/own-equipment-declaration.helpers.spec.ts`, `tests/ownEquipmentDeclarationPanel/use-own-equipment-declaration.spec.ts`
- Test: Modify `tests/employeeTeleworkSuppliesPanel/telework-supplies.helpers.spec.ts`

**Interfaces:**
- Consumes: `assetFetch` (`pages/supplies/infrastructure/asset-http.ts:23`), `ApiError` de `parseApiError` (`status`, `key`, `message`), `AssetRequestParams`, el patrón de capas de `employeeTeleworkSuppliesPanel` y el drawer molde `assetTypesDrawer` (Drawer PrimeVue `position="right"`, `internalVisible` por computed, `mergeLocaleMessage` en el setup).
- Produces (la Tarea 6 consume):
  - `domain/own-equipment-declaration.interface.ts`: `OwnEquipmentDeclaration` (espejo del DTO del API: `declarationId`, `employeeId`, `category`, `description`, `conditions: string | null`, `startDate`, `monthlyFee: number`, `status: 'active' | 'closed'`, `createdAt`) y `CreateOwnEquipmentDeclarationPayload = { category: AssetTypeTeleworkCategory; description: string; conditions?: string; startDate: string; monthlyFee: number }`.
  - `domain/own-equipment-declaration.const.ts`: `OWN_EQUIPMENT_DESCRIPTION_MAX_LENGTH = 255`, `OWN_EQUIPMENT_CONDITIONS_MAX_LENGTH = 2000`, `OWN_EQUIPMENT_FEE_MAX = 99999999.99`, `OWN_EQUIPMENT_FEE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/`.
  - `domain/own-equipment-declaration.helpers.ts` (puros, sin Vue ni i18n): `validateOwnEquipmentDeclaration(input: { description: string; conditions: string; startDate: string; monthlyFee: number | null }): Partial<Record<'description' | 'conditions' | 'startDate' | 'monthlyFee', 'required' | 'max_length' | 'fee_invalid'>>` (descripción vacía → `required`, >255 → `max_length`; condiciones >2000 → `max_length`; fecha vacía → `required`; cuota `null` → `required`, negativa/sobre el máximo/más de dos decimales → `fee_invalid`; la fecha imposible no se puede elegir en el calendario) · `buildCreateOwnEquipmentPayload(category, input): CreateOwnEquipmentDeclarationPayload` (condiciones vacías → no viajan) · `formatMonthlyFeeMxn(value: number): string` con `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })` → `'$350.00'`, `'$0.00'`, `'$0.29'` · `formatSinceDate(startDate: string): string` → `'2026-11-01'` se vuelve `'01/11/2026'`.
  - `application/use-own-equipment-declaration.ts`: `useOwnEquipmentDeclaration(deps: { repository: typeof ownEquipmentDeclarationsRepository }, employeeId: Ref<number | null>)` → `{ drawerVisible: Ref<boolean>, openCreate(): void, close(): void, submitting: Ref<boolean>, apiError: Ref<ApiError | null>, validationErrors: Ref<Partial<Record<...>>>, submit(input): Promise<boolean> }` — `submit` valida primero (sin llamar al repositorio), en error del API deja `apiError` y el drawer abierto y resuelve `false`; en éxito cierra el drawer y resuelve `true`.
  - `infrastructure/own-equipment-declarations.repository.ts`: `ownEquipmentDeclarationsRepository.createOwnEquipmentDeclaration(params: AssetRequestParams, employeeId: number, payload: CreateOwnEquipmentDeclarationPayload): Promise<OwnEquipmentDeclaration>` — `assetFetch(params, `/employees/${employeeId}/own-equipment-declarations`, { method: 'POST', body: payload })` y `body.data` devuelto con cast controlado.
  - `canDeclareOwnEquipment(status: TeleworkSupplyStatus, canManage: boolean): boolean` en `employeeTeleworkSuppliesPanel/domain/telework-supplies.helpers.ts` — `canManage && (status === 'uncovered' || status === 'not_delivered')`. Vive en el dominio del panel de la matriz porque es la regla de visibilidad de TODO el bloque, y la usa el panel de la declaración (única copia, probada aparte).
  - Componente `ownEquipmentDeclarationPanel`: props `{ category: AssetTypeTeleworkCategory; categoryLabel: string; employeeId: number; declaration: OwnEquipmentDeclaration | null; status: TeleworkSupplyStatus; canManage: boolean }` (los tipos `TeleworkSupplyStatus` y `canDeclareOwnEquipment` se importan de `~/components/employeeTeleworkSuppliesPanel/domain/...`); emite `saved`. Con `declaration`: descripción, condiciones si hay, "Desde el {fecha}" (`formatSinceDate` + `since`), "{cuota} al mes" (`formatMonthlyFeeMxn` + `fee_monthly`). Con `canDeclareOwnEquipment(status, canManage)` en true: botón "Declarar equipo propio" que abre el drawer; si no, no se renderiza (ocultar, nunca deshabilitar). Drawer: título `form.title` con `{category}` = `categoryLabel`; descripción `InputText`, condiciones `Textarea`, fecha `DatePicker` (`dateType="date"`, `update-model-type="string"`, `dateFormat="yy-mm-dd"`, `fluid`, obligatorio), cuota `InputNumber` (`mode="currency"`, `currency="MXN"`, `locale="es-MX"`, `:min="0"`, `:max="99999999.99"`, `:min-fraction-digits="0"`, `:max-fraction-digits="2"`, `fluid`); los errores de validación bajo su campo (`validation.*`); el error del API en `Message severity="error"` con `apiError.message` (el contrato de activos repite el detalle en `message`), sin cerrar el drawer; Guardar `Button :loading="submitting"`; al éxito `useToast` con "Declaración guardada.", `emit('saved')` y cierre. Lo que no aplica se **oculta** (`v-if`), nunca se deshabilita. `style.scss`: drawer a ancho completo bajo `md`, datos de la declaración en una columna, botones apilados en móvil, sin desplazamiento horizontal a 360 px.
  - Locales es/en (raíz `own_equipment_declaration_panel`): `actions.declare` "Declarar equipo propio"/"Declare own equipment", `since` "Desde el {date}"/"Since {date}", `fee_monthly` "{fee} al mes"/"{fee} per month", `form.title` "Declarar equipo propio: {category}"/"Declare own equipment: {category}", `form.description` "Descripción del equipo"/"Equipment description", `form.conditions` "Condiciones pactadas"/"Agreed conditions", `form.start_date` "Fecha de inicio"/"Start date", `form.monthly_fee` "Cuota mensual (MXN)"/"Monthly fee (MXN)", `form.save` "Guardar"/"Save", `form.cancel` "Cancelar"/"Cancel", `validation.required` "Este campo es obligatorio."/"This field is required.", `validation.max_length` "El texto excede el límite permitido."/"The text exceeds the allowed limit.", `validation.fee_invalid` "Captura una cuota de 0 o más, con hasta dos decimales."/"Enter a fee of 0 or more, with up to two decimals.", `toast.saved` "Declaración guardada."/"Declaration saved.".

- [ ] **Paso 1: escribir las pruebas en rojo**

`tests/ownEquipmentDeclarationPanel/own-equipment-declaration.helpers.spec.ts` (vitest, helpers puros):

```ts
it('exige descripción, fecha y cuota')        // vacíos → 'required' en su campo
it('respeta los límites de texto')            // descripción 256 → 'max_length'; condiciones 2001 → 'max_length'
it('valida la cuota como el API')             // 0 y 0.29 válidos · -1, 12.345, 1e8 y null → 'fee_invalid'/'required'
it('formatea la cuota en pesos mexicanos')    // 350 → '$350.00' · 0 → '$0.00' · 0.29 → '$0.29'
it('formatea la fecha Desde el')              // '2026-11-01' → '01/11/2026'
it('el payload limpio no lleva condiciones vacías')  // conditions '' → la clave no está en el payload
```

`tests/ownEquipmentDeclarationPanel/use-own-equipment-declaration.spec.ts`:

```ts
it('un submit válido llama al repositorio, cierra el drawer y resuelve true')
it('un error del API queda en apiError y el drawer sigue abierto')   // resuelve false
it('un submit inválido no llama al repositorio y deja los errores de campo')
```

En `tests/employeeTeleworkSuppliesPanel/telework-supplies.helpers.spec.ts` (el helper vive en el dominio de la matriz):

```ts
describe('canDeclareOwnEquipment', () => {
  it('ofrece declarar en uncovered y not_delivered con el permiso')
  // canDeclareOwnEquipment('uncovered', true) → true · ('not_delivered', true) → true
  it('nunca ofrece en delivered, shipping ni own_equipment, ni sin el permiso')
  // los tres estados con true → false · uncovered con false → false
})
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/ownEquipmentDeclarationPanel tests/employeeTeleworkSuppliesPanel` → FAIL (archivos/helpers inexistentes).

- [ ] **Paso 3: implementar**

1. `canDeclareOwnEquipment` en `employeeTeleworkSuppliesPanel/domain/telework-supplies.helpers.ts` (puro, la única copia de la regla de visibilidad).
2. Las capas del panel en ese orden (domain → infrastructure → application → script → index.vue → style), con `mergeLocaleMessage` de los locales en el setup del script y el patrón de request params de `employeeTeleworkSuppliesPanel/script.ts:56-60`.

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/ownEquipmentDeclarationPanel tests/employeeTeleworkSuppliesPanel        → PASSED (2 archivos nuevos + los 3 del panel de matriz con su caso nuevo)
npx vitest run tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu    → 14 archivos/120 pruebas PASSED (sin regresión)
npm run lint:i18n                                                                            → sin claves nuevas sin traducción
npm run lint:icons                                                                           → limpio
npx eslint components/ownEquipmentDeclarationPanel components/employeeTeleworkSuppliesPanel \
        tests/ownEquipmentDeclarationPanel tests/employeeTeleworkSuppliesPanel               → 0 errores
npm run typecheck 2>&1 | grep -cE 'ownEquipmentDeclarationPanel|employeeTeleworkSuppliesPanel' → 0 (los 277 errores del typecheck son preexistentes y ninguno en estas áreas)
grep -rnE "method: '(PUT|PATCH|DELETE)'" components/ownEquipmentDeclarationPanel             → vacío (el panel escribe solo con el POST del repositorio)
```

- [ ] **Paso 5: commit**

```bash
git add components/ownEquipmentDeclarationPanel components/employeeTeleworkSuppliesPanel/domain/telework-supplies.helpers.ts \
        tests/ownEquipmentDeclarationPanel tests/employeeTeleworkSuppliesPanel
git commit -m "feat(empleados): agrega el panel de declaracion de equipo propio

Muestra la declaracion vigente con su cuota en pesos y su fecha, y
declara desde un drawer de alta que valida igual que el API: los
mismos limites, la cuota vacia rechazada y el error del servidor
 visible sin cerrar el formulario.

Refs: VLRH-H1791306075599"
```

---

### Tarea 6 (gsti-rh-bo): integración en la matriz — permiso propio, montaje por categoría y recarga

El permiso de escritura se resuelve una vez por sección, fail-closed; la matriz monta el panel por categoría y recarga al guardar.

**Files:**
- Create: `components/employeeTeleworkSuppliesPanel/application/use-own-equipment-access.ts`
- Modify: `components/employeeTeleworkSuppliesPanel/domain/telework-supplies.interface.ts` (`ownEquipment` por variante, espejo del API)
- Modify: `components/employeeTeleworkSuppliesPanel/index.vue`, `script.ts`
- Test: Create `tests/employeeTeleworkSuppliesPanel/use-own-equipment-access.spec.ts`

**Interfaces:**
- Consumes: de la Tarea 5, `ownEquipmentDeclarationPanel` con sus props (incluida `canManage`), su regla `canDeclareOwnEquipment` y su evento `saved`; `SUPPLIES_EMPLOYEES_MODULE_SLUG` ('employees') y `SUPPLIES_EMPLOYEE_SUPPLIES_PERMISSION` ('manage-employee-supplies') de `pages/supplies/domain/supplies.const.ts`; el molde de acceso `pages/employees/[employeeSlug]/application/use-employee-attendance-section-access.ts` (deps inyectadas, arranca en false, catch → false) y el patrón de inyección del store de `pages/zones/script.ts:58` (`hasAccess: (moduleSlug, permissionSlug) => generalStore.hasAccess(moduleSlug, permissionSlug)`, con `generalStore = useMyGeneralStore()`).
- Produces:
  - `useOwnEquipmentAccess(deps: { hasAccess: (systemModuleSlug: string, systemPermissionSlug: string) => Promise<boolean> }): { canManageOwnEquipment: ComputedRef<boolean>, hydrate: () => Promise<void> }` — arranca en `false` y cae a `false` si la consulta falla; se resuelve una vez por sección.
  - `TeleworkSupplyCategory` (unión del panel): `delivered`/`shipping` += `ownEquipment: OwnEquipmentDeclaration | null`; `own_equipment` += `ownEquipment: OwnEquipmentDeclaration`; `uncovered`/`not_delivered` += `ownEquipment: null` (`OwnEquipmentDeclaration` se importa del dominio del panel de la Tarea 5). Los rótulos del locale del panel no se tocan: `status.own_equipment` ya existe.
  - `script.ts`: `hydrate()` de `useOwnEquipmentAccess` en `onMounted`, con el `hasAccess` de `useMyGeneralStore()` inyectado por deps; expone `canManageOwnEquipment` y el handler de recarga.
  - `index.vue`: por categoría, `ownEquipmentDeclarationPanel` con `:category`, `:category-label`, `:employee-id`, `:declaration="category.ownEquipment"`, `:status`, `:can-manage="canManageOwnEquipment"` y `@saved` → recarga de la matriz (`load`): chips y conteos se actualizan, `summary-loaded` vuelve a emitirse hacia el panel de activos.

- [ ] **Paso 1: escribir las pruebas en rojo**

`tests/employeeTeleworkSuppliesPanel/use-own-equipment-access.spec.ts`:

```ts
it('arranca en false y queda en true solo si el permiso resuelve')
it('falla cerrado: un rechazo de la consulta deja false')
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/employeeTeleworkSuppliesPanel` → FAIL (composable inexistente).

- [ ] **Paso 3: implementar**

1. Composable de acceso según Interfaces (molde del de asistencia, imports de `supplies.const.ts`).
2. `ownEquipment` por variante en la interfaz.
3. `script.ts`: hidratación en `onMounted` y exposición; `index.vue`: montaje del panel por categoría con `@saved` → `load()`. El componente se autoimporta por Nuxt.

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/employeeTeleworkSuppliesPanel tests/ownEquipmentDeclarationPanel \
        tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu  → PASSED
npm run lint:i18n                                                                  → sin claves nuevas sin traducción
npm run lint:icons                                                                 → limpio
npx eslint components/employeeTeleworkSuppliesPanel components/ownEquipmentDeclarationPanel \
        tests/employeeTeleworkSuppliesPanel                                          → 0 errores
npm run typecheck 2>&1 | grep -cE 'employeeTeleworkSuppliesPanel|ownEquipmentDeclarationPanel|employees/\[employeeSlug\]' → 0
```

- [ ] **Paso 5: commit**

```bash
git add components/employeeTeleworkSuppliesPanel tests/employeeTeleworkSuppliesPanel
git commit -m "feat(empleados): declara equipo propio desde la matriz de insumos

La accion aparece solo en las categorias pendientes y solo con el
permiso de administrar los suministros del colaborador, resuelto una
vez por seccion y cerrado a fallo; al guardar, la matriz recarga y
el resumen deja de contar ese pendiente.

Refs: VLRH-H1791306075599"
```

---

### Tarea 7: manual de QA — último entregable, solo se entrega

El usuario recorre este manual él mismo (trae pantalla: es manual de frontend, único por historia). No se ejecuta ni se automatiza aquí: se escribe y se entrega (decisión de producto, Wilvardo 2026-10-08).

**Files:**
- Create: `docs/superpowers/plans/2026-10-13-declarar-el-uso-de-equipo-propio-con-su-cuota-qa-flujo.md` (en gsti-rh-api, donde se versiona)
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (bloque nuevo de la HU; ese archivo NO se commitea)

**Interfaces:**
- Consumes: la skill `manual-qa` (reglas en `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `manual-qa-execution.md`): cada escenario abre con su línea `Objetivo:` antes de los pasos; correos exactos y contraseña literal leídos del sembrador compartido (si falta una cuenta, se agrega ahí: es su sitio); datos sembrados sin acentos ni eñes; sin rutas de archivo ni endpoints en el manual; anchos 360/850/escritorio; glosario si aplica; escenarios que resuelven las pruebas automatizadas con su `Objetivo:`, `Qué debe verse:` y `Qué pasó:`, y su checklist propio; sección final `## Hallazgos de otras historias`.
- Produces: el manual para el recorrido manual. Los hallazgos que el usuario reporte se registran en `qa-valanserh/hallazgos.md` (cuadro de 14 campos; el código en Comentarios/Historial) y se corrigen en esta misma rama.

- [ ] **Paso 1: agregar las cuentas al sembrador y correrlo**

El sembrador aún no crea cuentas con `employees:manage-employee-supplies`. En `_tmp_do_not_commit_qa_seeder.ts`, bloque nuevo de la HU (molde: el bloque `VLRH-H1791485252682`, ~línea 3867): dos cuentas — una con `manage-employee-supplies` más toda la cadena de lectura que la ficha necesita (ficha del colaborador, `supplies:read`), y una sin el permiso de escritura pero con esa misma cadena de lectura; reutiliza a los colaboradores QA-TEL del bloque hermano (QA-TEL-01 Remote 100 es el caso de declarar; el de la silla entregada para el rechazo por activo). Correr el único comando del playbook (el que ya imprime `[qa-seeder] listo`).

- [ ] **Paso 2: escribir el manual**

Con la skill `manual-qa` cargada y los correos/contraseña leídos del sembrador (nunca de memoria). Escenarios recorribles: declarar la silla con cuota 350 (queda "Equipo propio declarado" con la descripción, "Desde el 01/11/2026" y "$350.00 al mes", y el resumen baja un pendiente); cuota 0 (se registra tal cual); declarar el aditamento que estaba "Sin entregar"; intentar declarar la categoría con la silla ya asignada (el drawer muestra el error del servidor y no guarda); declarar dos veces la misma categoría (el drawer muestra el error, sin cerrarse); entrar con la cuenta sin el permiso de escritura (la matriz se ve, la acción no aparece en ninguna categoría); anchos de pantalla (360 px, ~850 px, escritorio: drawer a ancho completo en móvil, datos en una columna) e inglés (rótulos del drawer y del renglón). Escenarios que resuelven las pruebas automatizadas (con su `Objetivo:` y `Qué pasó:`): el doble envío simultáneo, el 404 indistinguible del colaborador ajeno/inexistente/dado de baja, el 403 del gate sin el permiso, la lista blanca (campos ajenos ignorados), y el borrado en duro del colaborador bloqueado. Checklist propio de esa sección y `## Hallazgos de otras historias` (o «Ninguno»).

- [ ] **Paso 3: verificación de formato y commit**

Cada escenario abre con su `Objetivo:`; sin endpoints, rutas de archivo ni comandos más allá del seeder.

```bash
git add docs/superpowers/plans/2026-10-13-declarar-el-uso-de-equipo-propio-con-su-cuota-qa-flujo.md
git commit -m "docs(qa): agrega el manual de la declaracion de equipo propio

Refs: VLRH-H1791306075599"
```

Entregar la ruta al usuario y **esperar su recorrido manual**.

---

## Definition of Done — líneas base medidas (2026-10-13, ambos repos a la par de la rama base)

Todas las verificaciones se midieron contra el árbol actual antes de escribir este plan; estos números son los que valen.

**gsti-rh-api** (`NODE_ENV=test`, BD `sae_pruebas` al día con `migration:fresh --seed`, 42 s):

| Comando | Línea base | Criterio |
|---|---|---|
| `node ace test functional --files="assets_own_equipment_declarations.spec.ts"` | (nuevo) | PASSED, las tres partes (22/22) |
| `node ace test unit --files="telework_supplies.rules.spec.ts"` | PASSED 6/6 | PASSED con los casos de own_equipment editados |
| `node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"` | PASSED 22/22 | PASSED 22/22 con la fila nueva |
| `node ace test unit --files="employees_write_permission_declarations.spec.ts"` | PASSED 9/9 (conteo interno 158) | PASSED 9/9 (conteo interno 159) |
| `node ace test unit --files="constants/"` | PASSED 148/148 | PASSED 148/148 (sin cambios de catálogo) |
| `node ace test unit` completo | **3783 passed, 122 failed** (preexistentes en la rama base; la captura de medición no conservó el detalle, solo el último visto: `TeleworkPolicyNotificationService.send`) | **no más de 122 fallidas** y ninguna que nombre los archivos del censo; la suite completa NO está verde en la base: "todo en verde" no es criterio alcanzable y no se persigue aquí |
| `node ace test functional` completo | el executor registra el conteo de su primera corrida como línea base (la corrida de medición no terminó al escribir este plan); contiene al menos los 2 preexistentes de abajo | **sin fallos nuevos** respecto de esa línea base |
| `node ace test functional --files="assets_telework_supplies.spec.ts"` | PASSED 15/15 | PASSED 15/15 **sin editar el archivo** (regresión) |
| `node ace test functional --files="assets_employee_assets.spec.ts"` | PASSED 15/15 | PASSED 15/15 (sin regresión) |
| `node ace test functional --files="supplies_permission_gate.spec.ts"` | **5 aprobadas, 2 fallidas** | **sin fallos nuevos**: los 2 preexistentes son `TenantContextMissingException` de fixtures con `SupplyType.query()` fuera de request (heredados, presentes en la rama base) y **se escalan a Wilvardo**; no se arreglan aquí ni se copian sus patrones |
| `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:run` + `migration:rollback` | corren | corren y revierten |
| `node ace test unit --files="migration_filename_convention.spec.ts"` | PASSED | PASSED (prefijo de 13 dígitos) |
| `npm run typecheck` | exit 0, 0 errores | exit 0 |
| `npx eslint app/modules/assets app/constants` | 0 problemas | 0 problemas. **No pasar `resources/langs/*.json` por eslint** (errores `quotes` preexistentes sobre JSON, fuera de alcance) |
| `git grep -n "own-equipment-declarations/:declarationId" -- app/modules/assets/assets.routes.ts` | vacío | vacío (CA-16) |
| `git ls-files app/models \| grep -ci own_equipment` | 0 | 0 (CA-16) |
| `git diff feature/VLRH-H1791485252682-ver-el-cumplimiento-de-insumos-del-teletrabajador...HEAD -- app/modules/assets/assets.constants.ts \| grep TELEWORK_SUPPLY_COVERAGE_STATUSES` | vacío | vacío (CA-16) |
| `git diff ... -- app/modules/assets/asset_files.controller.ts app/constants/supplies_permission_declarations.ts components/employeeTeleworkSuppliesPanel/domain/locales app/services/employee_supplie_service.ts app/services/employee_service.ts app/services/telework_compliance_setting_service.ts` (ambos repos) | vacío | vacío (CA-16 + censo no-tocado) |
| `git grep -nE "fileUpload\|getEffective" -- app/modules/assets/own_equipment_declarations.service.ts` | (nuevo) | vacío (CA-16) |
| `git diff --name-only feature/VLRH-H1791485252682-ver-el-cumplimiento-de-insumos-del-teletrabajador...HEAD` (ambos repos) | vacío | subconjunto de las filas `nuevo`/`editado` del censo del spec |

**gsti-rh-bo:**

| Comando | Línea base | Criterio |
|---|---|---|
| `npx vitest run tests/employeeTeleworkSuppliesPanel tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu` | 17 archivos, 129 pruebas, PASSED | PASSED + los archivos nuevos (`tests/ownEquipmentDeclarationPanel`) y los editados |
| `npm run typecheck` | **exit 2, 277 errores TS preexistentes, 0 en las áreas de la HU** | 0 errores en `employeeTeleworkSuppliesPanel`, `ownEquipmentDeclarationPanel`, `assetTypesDrawer` y `employees/[employeeSlug]` (`grep -cE` sobre la salida → 0) |
| `npx eslint components/employeeTeleworkSuppliesPanel components/employeeAssetsPanel components/ownEquipmentDeclarationPanel 'pages/employees/[employeeSlug]' tests/employeeTeleworkSuppliesPanel tests/ownEquipmentDeclarationPanel` | 0 errores (1 warning preexistente `v-html` en `information.vue`) | 0 errores |
| `npm run lint:i18n` | limpio (31 claves heredadas en la línea base) | sin claves nuevas sin traducción |
| `npm run lint:icons` | limpio | limpio |

**Notas para el executor:**

- La suite unit completa tiene **122 fallos preexistentes** en la rama base (3783 aprobadas de 3905). El spec §16 pide "todo en verde": contra ese árbol no es alcanzable y **no se persigue** — el criterio real es *sin fallos nuevos* (conteo final no mayor a 122, ninguno en los archivos del censo), y la puerta dura son los comandos acotados de esta tabla, todos verdes en la base. Si un fallo nuevo cae fuera del censo, se reporta en `## Hallazgos de otras historias` del manual (Tarea 7) y no se arregla aquí.
- Los 2 fallos preexistentes de `supplies_permission_gate.spec.ts` se **escalan a Wilvardo**; no se arreglan ni se copian sus patrones (fixtures con `db.table` y `createEmployeeFixture`, como `assets_telework_supplies.spec.ts`).
- El segundo parámetro del constructor de `TeleworkSuppliesService` es **opcional con adaptador por defecto** a propósito: `assets_telework_supplies.spec.ts` instancia el servicio con un solo argumento y el censo manda no editarlo.
- Swagger del POST con el contrato completo (201, 403, 404, 409, 422, 500) y la unión discriminada de la matriz documentada.
- El manual de QA (Tarea 7) se **entrega**: el recorrido lo hace el usuario; nada de Playwright sin permiso explícito.
- No se crea PR ni se despliega: eso lo levanta el equipo (Wilvardo) por su cuenta.
