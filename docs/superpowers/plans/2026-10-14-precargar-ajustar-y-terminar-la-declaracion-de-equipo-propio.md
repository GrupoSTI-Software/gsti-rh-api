# Precargar, ajustar y terminar la declaración de equipo propio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darle ciclo de vida completo a la declaración de equipo propio de la NOM-037: la cuota del alta se propone con la estándar de la empresa (`fee_source` lo calcula el servidor, al centavo), el ajuste cierra la versión vigente y abre otra en una transacción sin perder el histórico, el término la cierra con fecha y motivo de catálogo, y la matriz de insumos muestra el histórico, la cuota estándar, el aviso cuando la categoría ya la cubre un activo y las vigentes de quien ya no teletrabaja (para poder terminarlas).

**Architecture:** En el API (`app/modules/assets`), sin migración ni modelo Lucid: tres reglas puras nuevas en `telework_supplies.rules.ts` (origen de cuota al centavo, aviso de sustitución, detección de cambios), tres métodos nuevos en el puerto de declaraciones (`findDeclarationForChange` con candado, `closeDeclaration`, `findHistoryByEmployee` ordenado), el alta que precarga con `TeleworkComplianceSettingService.getEffective`, dos endpoints con el candado de colaborador-antes-de-declaración y el `UPDATE` de la vieja antes del `INSERT` de la nueva (libera el UNIQUE de vigente), y la matriz extendida en su raíz (`ownEquipmentHistory`, `ownEquipmentFeeDefault`, `ownEquipmentToClose`) y por variante (`ownEquipmentSuperseded`). En el BO, el mismo panel `components/ownEquipmentDeclarationPanel/` gana los modos `adjust` y `close`, el chip de origen, el aviso y el histórico plegado; la matriz (`employeeTeleworkSuppliesPanel`) le pasa la cuota estándar, el histórico por categoría y el aviso, y se mantiene visible con 0% mientras haya vigentes que terminar.

**Tech Stack:** AdonisJS 6 (Japa, vine, Lucid `db.from`/`db.transaction`, `forUpdate`), MySQL (UNIQUE sobre columna generada), Nuxt 3 / Vue 3 `setup` con vitest, PrimeVue (`Drawer`, `DatePicker`, `InputNumber`, `Select`, `Message`, `Tag`, `Toast`), `assetFetch` del slice de activos.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791493045968.md` (código `VLRH-H1791493045968`, SP 3; versión viva en `00-docs-hu/VLRH-H1791493045968/`). El plan argumenta desde el spec: léelo completo antes de cada tarea; sus secciones §10 (modelo de datos), §11 (contrato de API), §12 (UI) y el censo de archivos son el contrato. Anclas revalidadas contra el código el 2026-10-14 (ambos repos en su rama, exactamente a la par de la rama base `feature/VLRH-H1791306075599-declarar-el-uso-de-equipo-propio-con-su-cuota-de`: api `454bf083`, bo `162e477e`; merge-base == HEAD en ambos). El drift trivial se corrige al momento; el de alcance, contrato o regla de negocio **se escala a Wilvardo**, no se cambia en silencio.

## Restricciones globales

- **Ramas:** `feature/VLRH-H1791493045968-precargar-ajustar-y-terminar-la-declaracion-de` en ambos repos, ya creadas y limpias, exactamente a la par de la rama base. La base de TODOS los `git diff` de verificación (CA-18) es `feature/VLRH-H1791306075599-declarar-el-uso-de-equipo-propio-con-su-cuota-de`. No se crea PR ni se despliega: el plan termina en la verificación automatizada y la entrega del manual de QA.
- **Sin migración (CA-18):** `git diff --name-only <base>...HEAD -- database/migrations` sale vacío. Ningún `node ace make:migration`. Todas las columnas nacieron en `VLRH-H1791306075599`.
- **Un solo archivo nuevo en toda la rama (CA-18):** `tests/functional/assets_own_equipment_lifecycle.spec.ts` (api). En el BO no se crea archivo alguno: todo es edición de lo existente. Todos los demás archivos del censo son `editado`.
- **No tocar (censo `no-tocado` + no-objetivos):** api: `app/modules/assets/asset_files.controller.ts`, `app/services/employee_supplie_service.ts` (asignar no cierra la declaración; solo se avisa), `app/services/telework_compliance_setting_service.ts` (`getEffective` se consume tal cual), `app/modules/assets/employee_assets.controller.ts`, `app/modules/assets/assets.repository.ts` y `assets.repository.mysql.ts` (no aparecen en el censo), `app/constants/supplies_permission_declarations.ts`, `app/constants/system_modules_menu/system_modules.constant.ts`, `tests/functional/assets_own_equipment_declarations.spec.ts` (el spec del alta **no se edita ni corre menos verde**: sus fixtures no tienen fila de ajustes, así que `fee_source` les sigue dando `adjusted`), `tests/functional/assets_telework_supplies.spec.ts` y `tests/functional/assets_employee_assets.spec.ts` (regresión: corren, no se editan). BO: `components/employeeTeleworkSuppliesPanel/application/use-own-equipment-access.ts` (el permiso ya lo resuelve), `pages/employees/[employeeSlug]/assets.vue` (el panel ya se monta siempre).
- **`feeSource` jamás viene del cliente** (R2): el validador del alta no lo declara, el PUT lo ignora, y lo calcula el servidor con `resolveOwnEquipmentFeeSource` comparando `Math.round(x * 100)` — nunca igualdad de flotantes. Sin cuota estándar, siempre `adjusted`. **CA-19:** al terminar la rama, `git grep -n "fee_source: 'adjusted'\|feeSource: 'adjusted'" -- app/modules/assets` da **cero** resultados (hoy da 2: la anotación del DTO y el literal del servicio).
- **`adjusted` no es seleccionable** (R8): no entra al `vine.enum` del cierre ni al `Select` del BO; lo pone el sistema al ajustar.
- **El `UPDATE` de la versión vieja va ANTES del `INSERT` de la nueva** en la misma transacción: al revés, el UNIQUE de vigente (columna generada `..._open_flag`) rechaza el `INSERT`.
- **Candados en orden fijo:** ajuste = colaborador primero, luego declaración (el mismo orden del alta, para no abrir interbloqueos); cierre = solo la declaración (se permite con el colaborador dado de baja o a 0%). `ER_DUP_ENTRY` es el único re-mapeo → 409 `declaracion-de-equipo-propio-vigente-existente`.
- **Fechas civiles** con `app/utils/business_date.ts` (`toBusinessDateString`, `CIVIL_DATE_ANCHOR_ZONE`): "hoy" en zona de negocio y "menos un día" sobre fechas civiles — nunca `new Date()` en UTC. La comparación de fechas del servicio es textual `YYYY-MM-DD`.
- **Multi-tenant fail-closed (R3):** el alcance viaja `whereIn('business_unit_id', ...)` DENTRO de cada consulta del puerto; ajeno, inexistente y borrado lógico dan el mismo 404 con el mismo cuerpo (CA-11). `business_unit_id`, `employee_id` y categoría de la versión nueva salen de la fila vieja, nunca del body. Nada de `DELETE`; `deleted_at` no lo escribe ninguna ruta.
- **La cuota es confidencial:** solo en el DTO de la declaración y en la matriz (`supplies:read`); nunca en `teleworkSuppliesSummary`, en logs ni en el `detail` de errores (los 422 por fecha nombran el campo, no el valor).
- **Cero `any`** en ambos repos; los errores del API llevan `type/title/message/detail/key`, sin `code` y sin `error.message`. i18n es + en, sin emojis.
- **Commits:** Conventional Commits en español (tipo en inglés, descripción imperativa), cuerpo con el porqué y `Refs: VLRH-H1791493045968`. El hook del api solo corre eslint; en el BO la auditoría de `.claude/rules/compliance-check.md` sobre los archivos tocados cierra cada tarea (línea **Compliance**).
- **BD de pruebas:** `sae_pruebas` (`NODE_ENV=test`), ya puesta al día en esta rama con `migration:fresh --seed`. Un esquema atrasado produce fallos falsos.
- **Manual de QA:** único, de frontend, **último entregable y solo se entrega**: el recorrido lo hace el usuario. Los hallazgos se registran en `qa-valanserh/hallazgos.md` y se corrigen en esta misma rama.

## Review Focus

Entradas o condiciones que el spec implica pero ningún CA ejercita por sí solo, y que por eso son las más propensas a morder. Cada línea lleva su prueba en la tarea dueña del código.

1. **Ajuste que solo limpia las condiciones (`conditions: null`):** es un cambio válido (R5) y NO debe caer en el 422 de "sin cambios" — la normalización (`trim`, vacío = `null`) hace que `null` y `''` comparen igual entre sí pero distinto contra un valor heredado. Prueba en Tarea 4 (caso `conditions: null` sobre una vigente con condiciones).
2. **Ajuste cuyo nuevo monto coincide con la estándar vigente HOY:** `feeSource` se recalcula contra la estándar actual, no hereda el de la versión vieja (R2 "al guardar"): ajustar de 350 (`adjusted`) a 350 con estándar 350 nace `default`. Prueba en Tarea 4 (ajuste a la estándar → `feeSource: 'default'`).
3. **Término con `endDate` IGUAL al inicio:** el borde es inclusivo (`≥`, regla 8) y debe cerrar en 200, no en 422 — una comparación estricta lo rompería. Prueba en Tarea 5 (cierre con `endDate === startDate`).
4. **Declaración borrada lógicamente (`deleted_at`):** no aparece ni en `ownEquipmentToClose` ni en `ownEquipmentHistory` — el puerto la filtra dentro de cada consulta; pero el AJUSTE sobre ella responde el mismo 404 que la ajena (CA-11 la cubre con `deleted_at`). Prueba en Tarea 2 (puerto) y Tarea 6 (matriz).
5. **La vigente no viaja en el histórico:** `ownEquipmentHistory` son SOLO las cerradas; una vigente más una cerrada de la misma categoría no duplica renglones ni confunde al panel ("Declaraciones anteriores"). Prueba en Tarea 6 (matriz con una vigente y una cerrada de silla).

---

### Tarea 1 (gsti-rh-api): el contrato del ciclo de vida — constantes, errores, DTO, validadores y reglas puras

Todo lo que las tareas 2-6 consumen, sin HTTP: los motivos de cierre, las dos llaves de error con sus factorías, el DTO que gana los campos de cierre y origen, los validadores de ajuste y término, y las tres reglas puras. El adaptador mapea los campos nuevos del DTO para que el árbol siga compilando (la Tarea 2 agrega los métodos nuevos del puerto).

**Files:**
- Modify: `app/modules/assets/assets.constants.ts` (motivos de cierre junto a `OWN_EQUIPMENT_FEE_SOURCES`; dos keys al final de `ASSET_ERROR_KEYS`)
- Modify: `app/modules/assets/assets.error.ts` (dos factorías tras `ownEquipmentFeeInvalid()`)
- Modify: `app/modules/assets/dto/own_equipment_declarations.dto.ts` (DTO gana `endDate`/`closedReason`/`feeSource`; `feeSource` del `Insert` deja de ser el literal; nuevo `OwnEquipmentDeclarationForChange`)
- Modify: `app/modules/assets/own_equipment_declarations.repository.mysql.ts` (solo el mapeo: columnas y `toDto` de los campos nuevos)
- Create: (nada — los validadores viven en el archivo existente) Modify: `app/modules/assets/validators/own_equipment_declarations.validator.ts` (`declarationIdParamsValidator`, `adjustOwnEquipmentDeclarationValidator`, `closeOwnEquipmentDeclarationValidator`)
- Modify: `app/modules/assets/telework_supplies.rules.ts` (las tres funciones puras nuevas)
- Modify: `resources/langs/es.json` y `resources/langs/en.json` (las 4 llaves de los dos errores, tras el bloque `asset_own_equipment_fee_invalid_*`)
- Test: Modify `tests/unit/modules/assets/telework_supplies.rules.spec.ts` (casos de las tres reglas; el fixture `makeDeclaration` gana los campos nuevos)

**Interfaces:**
- Consumes: `OwnEquipmentFeeSource` y `OwnEquipmentDeclarationStatus` (`assets.constants.ts`), `routeId()` de `app/modules/assets/validators/assets.validator.ts:50` (`employeeIdParamsValidator`), el patrón `.nullable().optional()` de vine (`app/validators/position_assessment_profile.ts:24`), `TeleworkSupplyCoverageStatus` (`assets.constants.ts`).
- Produces:
  - `OWN_EQUIPMENT_CLOSE_REASONS = ['company_equipment_assigned', 'telework_ended', 'conditions_changed', 'other'] as const` (los seleccionables) + `OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON = 'adjusted'` + `export type OwnEquipmentClosedReason = (typeof OWN_EQUIPMENT_CLOSE_REASONS)[number] | typeof OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON`.
  - `ASSET_ERROR_KEYS` gana `DECLARATION_NOT_FOUND: 'declaracion-de-equipo-propio-no-encontrada'` y `DECLARATION_NOT_ACTIVE: 'declaracion-de-equipo-propio-no-vigente'`.
  - `AssetError.ownEquipmentDeclarationNotFound()` → 404, prefijo `asset_own_equipment_declaration_not_found`, 'Declaración de equipo propio no encontrada', 'La declaración no existe o no pertenece a la empresa.' · `AssetError.ownEquipmentDeclarationNotActive()` → 409, prefijo `asset_own_equipment_declaration_not_active`, 'Declaración de equipo propio no vigente', 'La declaración ya está cerrada; consulta la versión vigente en la ficha del colaborador.'
  - `OwnEquipmentDeclarationDto` gana `endDate: string | null`, `closedReason: OwnEquipmentClosedReason | null`, `feeSource: OwnEquipmentFeeSource` (sigue sin `businessUnitId` ni la llave del archivo). `OwnEquipmentDeclarationInsert.feeSource` pasa de `'adjusted'` a `OwnEquipmentFeeSource` (CA-19). Nuevo `OwnEquipmentDeclarationForChange = { declarationId: number; employeeId: number; businessUnitId: number; category: SupplyTypeTeleworkCategory; description: string; conditions: string | null; startDate: string; monthlyFee: number; status: OwnEquipmentDeclarationStatus }`.
  - Validadores (en `validators/own_equipment_declarations.validator.ts`, junto al del alta): `declarationIdParamsValidator = vine.compile(vine.object({ declarationId: routeId().min(1) }))`; `adjustOwnEquipmentDeclarationValidator = vine.compile(vine.object({ effectiveDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), description: vine.string().trim().minLength(1).maxLength(255).optional(), conditions: vine.string().trim().maxLength(2000).nullable().optional() }))` — **sin `monthlyFee`** (crudo por `request.input`, igual que el alta) ni ningún campo de servidor; `closeOwnEquipmentDeclarationValidator = vine.compile(vine.object({ endDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), closedReason: vine.enum(OWN_EQUIPMENT_CLOSE_REASONS) }))` — `adjusted` y cualquier literal fuera del catálogo rebotan aquí.
  - Reglas puras (exportadas de `telework_supplies.rules.ts`):
    `resolveOwnEquipmentFeeSource(monthlyFee: number, feeDefault: number | null): OwnEquipmentFeeSource` → `default` solo si `feeDefault !== null && Math.round(monthlyFee * 100) === Math.round(feeDefault * 100)`; si no `adjusted`.
    `isOwnEquipmentSuperseded(status: TeleworkSupplyCoverageStatus, hasOpenDeclaration: boolean): boolean` → `hasOpenDeclaration && (status === 'delivered' || status === 'shipping')`.
    `hasOwnEquipmentChanges(current: { monthlyFee: number; description: string; conditions: string | null }, input: { monthlyFee: number; description?: string; conditions?: string | null }): boolean` → compara la cuota en centavos y descripción/condiciones normalizadas (`trim`, vacío = `null`; `undefined` hereda el valor vigente).
  - i18n (es/en): `asset_own_equipment_declaration_not_found_title/_detail` y `asset_own_equipment_declaration_not_active_title/_detail` con los textos es de arriba (en: 'Own equipment declaration not found' / 'The declaration does not exist or does not belong to the company.' / 'Own equipment declaration no longer active' / 'The declaration is already closed; check the current version on the employee profile.').

- [ ] **Paso 1: escribir en rojo los casos de las tres reglas puras**

En `tests/unit/modules/assets/telework_supplies.rules.spec.ts` (el fixture `makeDeclaration` gana `endDate: null`, `closedReason: null`, `feeSource: 'adjusted'` para seguir compilando con el DTO nuevo):

```ts
test('resolveOwnEquipmentFeeSource decide el origen comparando centavos, nunca flotantes', ({ assert }) => {
  // (350, 350) → 'default' · (350, null) → 'adjusted' · (500, 350) → 'adjusted'
  // (0.3, 0.30) → 'default' (Math.round(0.3*100) === Math.round(0.30*100) === 30)
  // (0.29, null) → 'adjusted' · (350, 350.00) → 'default'
})

test('isOwnEquipmentSuperseded solo con vigente y categoria cubierta', ({ assert }) => {
  // ('delivered', true) → true · ('shipping', true) → true
  // ('own_equipment', true) → false · ('uncovered', false) → false
  // ('delivered', false) → false · ('not_delivered', false) → false
})

test('hasOwnEquipmentChanges exige un cambio real en cuota, descripcion o condiciones', ({ assert }) => {
  // mismos valores → false · cuota 350 vs 350.00 → false (centavos)
  // description ' x ' vs 'x' → false (trim) · description undefined → hereda → false
  // conditions null vs '' → false (vacío normaliza null) · conditions undefined → hereda → false
  // cuota 350→420 → true · description 'a'→'b' → true · conditions null→'x' → true
})
```

- [ ] **Paso 2: correr y verificar el rojo**

`node ace test unit --files="telework_supplies.rules.spec.ts"` → FAIL (no compila: `resolveOwnEquipmentFeeSource` y compañía no existen).

- [ ] **Paso 3: implementar el contrato**

1. Constantes, factorías, DTO y validadores con las firmas exactas de Interfaces (los JSDoc citan su regla y la HU; los motivos de cierre van junto a `OWN_EQUIPMENT_FEE_SOURCES`, lejos de `TELEWORK_SUPPLY_COVERAGE_STATUSES`).
2. `DECLARATION_DTO_COLUMNS` gana `calendarDate('..._end_date', 'end_date')`, `..._closed_reason as closed_reason`, `..._fee_source as fee_source`; `toDto` mapea `endDate`, `closedReason`, `feeSource`. Los tres métodos existentes del adaptador no cambian de comportamiento (la columna nueva viaja sola).
3. Las tres reglas puras en `telework_supplies.rules.ts`, sin I/O.
4. Las 8 llaves i18n en es y en.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test unit --files="telework_supplies.rules.spec.ts"   → PASSED (11 existentes + los casos nuevos)
node ace test unit --files="constants/"                          → PASSED 154/154 (sin cambios de catálogo)
node ace test functional --files="assets_own_equipment_declarations.spec.ts" → PASSED 25/25 (sin editar el archivo)
npm run typecheck                                                → exit 0
npx eslint app/modules/assets app/constants                      → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/assets.constants.ts app/modules/assets/assets.error.ts \
        app/modules/assets/dto/own_equipment_declarations.dto.ts \
        app/modules/assets/own_equipment_declarations.repository.mysql.ts \
        app/modules/assets/validators/own_equipment_declarations.validator.ts \
        app/modules/assets/telework_supplies.rules.ts \
        resources/langs/es.json resources/langs/en.json \
        tests/unit/modules/assets/telework_supplies.rules.spec.ts
git commit -m "feat(activos): agrega el contrato del ciclo de vida de la declaracion de equipo propio

Motivos de cierre de catalogo con adjusted reservado al sistema, el
DTO con periodo y origen de cuota, los validadores de ajuste y termino
y las reglas puras que deciden origen al centavo, aviso de
sustitucion y cambios reales del ajuste.

Refs: VLRH-H1791493045968"
```

---

### Tarea 2 (gsti-rh-api): el puerto del ciclo de vida — consulta de cambio, cierre e histórico

Los tres métodos nuevos del puerto y su adaptador MySQL, probados sin HTTP en el spec funcional nuevo (el único archivo nuevo de la rama, CA-18).

**Files:**
- Modify: `app/modules/assets/own_equipment_declarations.repository.ts` (tres firmas nuevas)
- Modify: `app/modules/assets/own_equipment_declarations.repository.mysql.ts` (las tres consultas)
- Test: Create `tests/functional/assets_own_equipment_lifecycle.spec.ts` (parte 1: el puerto, sin HTTP)

**Interfaces:**
- Consumes: de la Tarea 1, `OwnEquipmentDeclarationForChange`, `OwnEquipmentClosedReason` y el mapeo nuevo del DTO. Del alta: `OwnEquipmentDbExecutor`, el patrón `options.lock && query.client.isTransaction → forUpdate` (`findEmployeeForDeclaration`), `calendarDate`.
- Produces (las firmas exactas que las Tareas 4-6 consumen):
  - `findDeclarationForChange(executor: OwnEquipmentDbExecutor, businessUnitIds: readonly number[], declarationId: number, options: { lock: boolean }): Promise<OwnEquipmentDeclarationForChange | null>` — fila viva (sin `deleted_at`) y en alcance; `DECIMAL` a número, `DATE` a `YYYY-MM-DD`; ajeno/inexistente/borrado → `null` indistinguible.
  - `closeDeclaration(trx: TransactionClientContract, declarationId: number, input: { endDate: string; reason: OwnEquipmentClosedReason; userId: number }): Promise<void>` — `UPDATE` de `..._status = 'closed'`, `..._end_date`, `..._closed_reason`, `..._closed_by_user_id`, `..._updated_at`.
  - `findHistoryByEmployee(businessUnitIds: readonly number[], employeeId: number): Promise<OwnEquipmentDeclarationDto[]>` — cerradas no borradas del colaborador, TODAS las categorías, `end_date` desc y luego `declaration_id` desc; alcance dentro de la consulta; alcance vacío → `[]` sin consultar.

- [ ] **Paso 1: escribir la parte 1 del spec funcional en rojo**

`tests/functional/assets_own_equipment_lifecycle.spec.ts` — mismo molde de fixtures que `assets_own_equipment_declarations.spec.ts`: `RUN` único, actor A + actor B (`createTenantActor`), colaborador A + colaborador B (`createEmployeeFixture`), `insertDeclaration(overrides)` por `db.table` (colaborador y empresa del fixture, `created_by_user_id` = actor), `dbErrorCode(fn)` y limpieza en `group.each.teardown`/`group.teardown`. Casos:

```ts
test('RF: findDeclarationForChange devuelve la fila viva en alcance como ForChange')
// insertDeclaration({ category: 'ergonomic_chair', …350 }) → findDeclarationForChange(db, [buA], id, { lock: false })
//   → { declarationId, employeeId, businessUnitId: buA, category, description, conditions, startDate: '2026-11-01',
//       monthlyFee: 350 (number), status: 'active' }
// id de B con alcance de A → null · id inexistente → null
// fila con deleted_at lleno → null (mismo null, indistinguible)
// con candado dentro de db.transaction → la misma fila (forUpdate corre)

test('RF: closeDeclaration cierra con periodo, motivo y autor')
// closeDeclaration(trx, id, { endDate: '2026-10-14', reason: 'telework_ended', userId: actor })
//   → fila: status 'closed', end_date '2026-10-14', closed_reason 'telework_ended',
//     closed_by_user_id = actor, updated_at movida; el resto de la fila intacto

test('RF: findHistoryByEmployee ordena por fin desc y luego id desc, y excluye vivas y borradas')
// tres cerradas por tabla, categorías DISTINTAS, insertadas en orden: silla fin 2026-09-30,
//   cómputo fin 2026-08-31, aditamento fin 2026-09-30 → history del colaborador A
//   → [aditamento, silla, cómputo] (end_date desc; el empate lo desempata id desc)
// una vigente (active) NO aparece · una cerrada con deleted_at lleno NO aparece
// la de B con alcance de A no sale · findHistoryByEmployee([], idA) → []
```

- [ ] **Paso 2: correr y verificar el rojo**

`node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"` → FAIL (no compila: los métodos no existen en el puerto).

- [ ] **Paso 3: implementar**

1. Las tres firmas en el puerto con sus JSDoc (regla y HU).
2. Adaptador: `findDeclarationForChange` espeja `findById` + `business_unit_id` en el SELECT y el candado de `findEmployeeForDeclaration`; `closeDeclaration` con `trx.table(...).where('..._id', id).update({...})`; `findHistoryByEmployee` espeja `findOpenByEmployees` con `where('..._status', 'closed')` y los dos `orderBy`.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts" → PASSED (parte 1: 3/3)
node ace test functional --files="assets_own_equipment_declarations.spec.ts" → PASSED 25/25 (regresión)
npm run typecheck → exit 0
npx eslint app/modules/assets → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/own_equipment_declarations.repository.ts \
        app/modules/assets/own_equipment_declarations.repository.mysql.ts \
        tests/functional/assets_own_equipment_lifecycle.spec.ts
git commit -m "feat(activos): agrega al puerto la consulta de cambio, el cierre y el historico

La declaracion se lee para cambiarla con su empresa y su candado
dentro de la transaccion, se cierra dejando periodo, motivo y autor,
y su historico viaja ordenado por fin y luego por id, siempre acotado
a las empresas de la consulta.

Refs: VLRH-H1791493045968"
```

---

### Tarea 3 (gsti-rh-api): precarga del alta con la cuota estándar de la empresa

El alta deja de exigir la cuota: si falta, toma la estándar; `fee_source` deja de ser un literal y lo calcula `resolveOwnEquipmentFeeSource` (CA-19 pierde su segunda aparición).

**Files:**
- Modify: `app/modules/assets/own_equipment_declarations.service.ts` (segundo parámetro de constructor `settings`; `create` resuelve la cuota y el origen)
- Modify: `app/modules/assets/own_equipment_declarations.controller.ts` (solo el JSDoc de swagger del POST: `monthlyFee` opcional)
- Test: Modify `tests/functional/assets_own_equipment_lifecycle.spec.ts` (parte 2: CA-1 a CA-4 por HTTP)

**Interfaces:**
- Consumes: de la Tarea 1, `resolveOwnEquipmentFeeSource`; de la hermana integrada, `TeleworkComplianceSettingService.getEffective(businessUnitId: number): Promise<{ ownEquipmentFeeDefault: number | null; … }>` (`app/services/telework_compliance_setting_service.ts:57`); `parseMonthlyFee` (ya exportado por este mismo servicio).
- Produces:
  - Constructor: `constructor(private readonly repository: OwnEquipmentDeclarationsRepository = new OwnEquipmentDeclarationsRepositoryMysql(), private readonly settings: Pick<TeleworkComplianceSettingService, 'getEffective'> = new TeleworkComplianceSettingService())` — el controlador `@inject()` no cambia.
  - `create(...)` — firma pública intacta; solo cambia el interior, en este orden: pertenencia (404) → teletrabajo (422) → fecha (422) → **`feeDefault = (await this.settings.getEffective(employee.businessUnitId)).ownEquipmentFeeDefault`** → cuota: si `rawMonthlyFee` es `undefined`/`null`/`''` → `fee = feeDefault`, y si `feeDefault === null` → 422 `cuota-de-equipo-propio-invalida`; si no → `fee = parseMonthlyFee(rawMonthlyFee)` → `feeSource = resolveOwnEquipmentFeeSource(fee, feeDefault)` (reemplaza el literal) → cobertura (409) → vigente (409) → transacción con candado y re-chequeos (sin cambios) → `insert` con `feeSource` calculado.

- [ ] **Paso 1: escribir la parte 2 del spec funcional en rojo**

Mismo grupo del lifecycle spec; actor A con `grantModulePermissions('employees', ['manage-employee-supplies'])` (módulo exigido con `setModuleEnforcement`/`assertModuleEnforced`, el patrón del alta), colaborador A `Remote` al 100%, colaborador B en la empresa de B. Helper nuevo `upsertTeleworkSettings(businessUnitId, feeDefault: number | null)`: `db.table('telework_compliance_settings').insert({ business_unit_id, telework_compliance_setting_revalidation_period_months: 6, telework_compliance_setting_expiration_notice_days: 30, telework_compliance_setting_own_equipment_fee_default: feeDefault, telework_compliance_setting_created_by_user_id: actorA.user.userId, telework_compliance_setting_created_at: new Date() })` (la empresa del fixture es nueva en cada corrida: el `UNIQUE` de `business_unit_id` nunca choca) + limpieza del fila en el teardown. Casos (POST `/api/employees/:id/own-equipment-declarations` con header de empresa, igual que el alta):

```ts
test('CA-1: sin cuota capturada responde 201 con la estandar de la empresa')
// settings de A en 350 → POST { category: 'ergonomic_chair', description, startDate: '2026-09-01' } SIN monthlyFee
// → 201, data.monthlyFee 350, data.feeSource 'default'; fila: fee_source 'default', monthly_fee 350.00

test('CA-2: el origen se decide comparando centavos, no flotantes')
// settings de A en 0.30 → POST monthlyFee 0.3 → 201 feeSource 'default'
// POST monthlyFee 500 (misma categoría tras cerrar la anterior por tabla) → 201 feeSource 'adjusted'

test('CA-3: sin estandar la cuota es obligatoria y el cero se registra como ajustada')
// colaborador de B (sin fila de ajustes) → POST sin monthlyFee → 422 'cuota-de-equipo-propio-invalida' y 0 filas
// POST monthlyFee 0 → 201, monthlyFee 0, feeSource 'adjusted'

test('CA-4: el feeSource del body se ignora')
// POST { …, monthlyFee: 500, feeSource: 'default' } → 201 con feeSource 'adjusted'
```

- [ ] **Paso 2: correr y verificar el rojo**

`node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"` → FAIL en la parte 2 (201/422 sin la precarga: `feeSource` llega `adjusted` o el POST sin cuota responde 422).

- [ ] **Paso 3: implementar**

1. El constructor gana `settings` con default (import de valor de `#services/telework_compliance_setting_service`).
2. `create` según el orden de Interfaces; el `feeSource: 'adjusted'` literal del `insert` se sustituye por la variable calculada (CA-19).
3. Swagger del POST: `monthlyFee` sale de `required` y su `description` menciona la precarga.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"            → PASSED (parte 1 + parte 2)
node ace test functional --files="assets_own_equipment_declarations.spec.ts"        → PASSED 25/25 (regresión: sus fixtures no tienen estándar → 'adjusted' como siempre)
npm run typecheck                                                                     → exit 0
npx eslint app/modules/assets                                                        → 0 problemas
git grep -n "feeSource: 'adjusted'" -- app/modules/assets                             → 0 resultados (CA-19; queda solo la anotación del DTO, que la Tarea 1 ya retiró)
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/own_equipment_declarations.service.ts \
        app/modules/assets/own_equipment_declarations.controller.ts \
        tests/functional/assets_own_equipment_lifecycle.spec.ts
git commit -m "feat(activos): propone la cuota del alta con la estandar de la empresa

La cuota deja de ser obligatoria en el alta: si no viene se toma la
estandar configurada, y si tampoco existe se rechaza. El origen lo
decide el servidor comparando centavos contra la estandar vigente al
guardar, nunca el cliente ni la igualdad de flotantes.

Refs: VLRH-H1791493045968"
```

---

### Tarea 4 (gsti-rh-api): el ajuste versionado por HTTP — `PUT /api/own-equipment-declarations/:declarationId`

Cerrar la vigente y abrir la nueva en una transacción, con el candado de colaborador-antes-de-declaración y el `UPDATE` antes del `INSERT`.

**Files:**
- Modify: `app/modules/assets/own_equipment_declarations.service.ts` (método `adjust`)
- Modify: `app/modules/assets/own_equipment_declarations.controller.ts` (handler `update` + swagger)
- Modify: `app/modules/assets/assets.routes.ts` (ruta PUT tras el POST del alta)
- Modify: `app/constants/employees_write_permission_declarations.ts` (`updateOwnEquipmentDeclaration` junto a `storeOwnEquipmentDeclaration`, línea ~226)
- Modify: `resources/langs/es.json` y `resources/langs/en.json` (`own_equipment_declaration_adjusted_title/_message`)
- Test: Modify `tests/functional/assets_own_equipment_lifecycle.spec.ts` (parte 3: CA-5 a CA-8, CA-10, CA-11, CA-16), `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts` (fila del PUT), `tests/unit/constants/employees_write_permission_declarations.spec.ts` (conteo 159 → 160 + aserción de acción)

**Interfaces:**
- Consumes: de la Tarea 2, `findDeclarationForChange` y `closeDeclaration`; de la Tarea 1, `hasOwnEquipmentChanges`, `OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON`, factorías 404/409; del alta, `findEmployeeForDeclaration`, `hasOpenCoverage`, `insert`, `findById`, `parseMonthlyFee`, `ER_DUP_ENTRY`; `toBusinessDateString` y `CIVIL_DATE_ANCHOR_ZONE` (`app/utils/business_date.ts`).
- Produces:
  - `async adjust(declarationId: number, input: { effectiveDate?: string; description?: string; conditions?: string | null }, rawMonthlyFee: unknown, userId: number): Promise<OwnEquipmentDeclarationDto>` — orden obligatorio (§11):
    1. `TenantContext.getScope()` → `parseMonthlyFee(rawMonthlyFee)` → 422 `cuota-de-equipo-propio-invalida` (la cuota del body manda, con estándar o sin ella; el validador de vine ya corrió en el handler).
    2. Pre-chequeo sin candado: `findDeclarationForChange(db, scope, id, { lock: false })` → `null` → 404 `declaracion-de-equipo-propio-no-encontrada`; `status !== 'active'` → 409 `declaracion-de-equipo-propio-no-vigente`.
    3. `db.transaction`: `findEmployeeForDeclaration(trx, scope, forChange.employeeId, { lock: true })` → `null` (dado de baja) → 404 `colaborador-no-encontrado` → `findDeclarationForChange(trx, ..., { lock: true })` + re-chequeo de `status` (409).
    4. `teleworkPercentage <= 0` → 422 `colaborador-sin-teletrabajo`.
    5. `hasOpenCoverage(trx, scope, employeeId, forChange.category)` → 409 `categoria-cubierta-por-activo`.
    6. `effectiveDate = input.effectiveDate ?? toBusinessDateString()`; si no cumple `^\d{4}-\d{2}-\d{2}$` o `DateTime.fromISO(effectiveDate).isValid` es falso, o `effectiveDate <= forChange.startDate` → 422 `entrada-invalida` con `detail` 'La fecha de vigencia debe ser posterior al inicio de la declaración vigente' (título 'Datos inválivos', key `entrada-invalida`; véase la nota de prefantasma abajo) — el chequeo de fecha va ANTES que el de cambios.
    7. `hasOwnEquipmentChanges(forChange, { monthlyFee: fee, ...input })` → falso → 422 `entrada-invalida` con `detail` 'El ajuste no cambia nada: cuota, descripción o condiciones deben diferir de la versión vigente'.
    8. `feeDefault = (await this.settings.getEffective(locked.businessUnitId)).ownEquipmentFeeDefault`; `closeDeclaration(trx, id, { endDate: díaCivilAnterior(effectiveDate), reason: OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON, userId })` y LUEGO `insert(trx, nueva)` con `employeeId`/`businessUnitId`/`category` de `forChange`, `description: input.description ?? forChange.description`, `conditions: input.conditions === undefined ? forChange.conditions : (vacío → null)`, `startDate: effectiveDate`, `monthlyFee: fee`, `feeSource: resolveOwnEquipmentFeeSource(fee, feeDefault)`, `createdByUserId: userId` — el `INSERT` no escribe la columna de archivo (nace `NULL`, R6). `ER_DUP_ENTRY` → 409 `declaracion-de-equipo-propio-vigente-existente`.
  - `díaCivilAnterior(iso: string): string` — privada del servicio: `toBusinessDateString(DateTime.fromISO(iso, { zone: CIVIL_DATE_ANCHOR_ZONE }).minus({ days: 1 }))`.
  - **Prefijos i18n fantasma:** los dos 422 de fecha/cambios se construyen como `new AssetError(422, ASSET_ERROR_KEYS.INVALID_INPUT, 'asset_own_equipment_declaration_invalid_date' | 'asset_own_equipment_declaration_no_changes', 'Datos inválidos', <detail>)` — el prefijo NO existe en `resources/langs/*`, así que `respondAssetError` siempre usa el `fallbackDetail` (el genérico `asset_invalid_input_detail` de `es.json` taparía cualquier detail propio). No se agregan llaves i18n para ellos.
  - `OwnEquipmentDeclarationsController.update(ctx)`: `declarationIdParamsValidator.validate(params)` → `request.validateUsing(adjustOwnEquipmentDeclarationValidator)` (sin catch especial: todo vine → `entrada-invalida` por `respondAssetsModuleError`) → `request.input('monthlyFee')` → `auth.getUserOrFail().userId` → 200 `{ type: 'success', title: own_equipment_declaration_adjusted_title, message: own_equipment_declaration_adjusted_message, data: DTO de la nueva }` (leída con `findById`) → catch `respondAssetsModuleError`. Swagger: 200, 403, 404, 409 (los dos), 422 (los tres), 500.
  - Ruta: `router.put('/own-equipment-declarations/:declarationId', '#modules/assets/own_equipment_declarations.controller.update').use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateOwnEquipmentDeclaration))` dentro del grupo `auth` + `businessScope` existente, tras el POST del alta.
  - `updateOwnEquipmentDeclaration: employeesStandard('manage-employee-supplies')` junto a `storeOwnEquipmentDeclaration`.
  - i18n (es/en): `own_equipment_declaration_adjusted_title`: 'Declaración de equipo propio' / 'Own equipment declaration'; `own_equipment_declaration_adjusted_message`: 'Declaración de equipo propio ajustada' / 'Own equipment declaration adjusted'.

- [ ] **Paso 1: escribir la parte 3 del spec funcional y las filas de rutas/permisos en rojo**

Fixtures del mismo grupo + `upsertTeleworkSettings` (estándar 350 en A). Helper `putAs(client, user, buPublicId, declarationId, payload)` espejo del `postAs`. Una vigente de silla del colaborador A creada con el POST de la parte 2 (o `insertDeclaration` cuando el caso la quiere cerrada de antemano). Casos:

```ts
test('CA-5: el ajuste cierra la vigente y abre la nueva en un solo paso')
// vigente silla (start 2026-09-01, 350, con ..._file 'evidencia.png' puesto por tabla)
// PUT { monthlyFee: 420, effectiveDate: '2026-10-15' } → 200:
//   nueva: startDate '2026-10-15', monthlyFee 420, feeSource 'adjusted', status 'active',
//          misma categoría/despción/condiciones heredadas, columna de archivo NULL,
//          created_by_user_id = actor
//   vieja: status 'closed', end_date '2026-10-14', closed_reason 'adjusted',
//          closed_by_user_id = actor; en BD sigue el file de la vieja intacto

test('CA-6: la vigencia debe ser posterior al inicio; el día siguiente es válido')
// PUT { monthlyFee: 420, effectiveDate: '2026-09-02' } → 200 y la vieja cierra con end_date '2026-09-01' (igual a su inicio)
// PUT { effectiveDate: '2026-09-01' } y { effectiveDate: '2026-08-31' } → 422 'entrada-invalida', cero filas nuevas

test('CA-7: el ajuste sin cambios se rechaza y no nace una versión')
// PUT { monthlyFee: 350, description: <la misma de la vigente> } → 422 'entrada-invalida'; solo 1 fila en la categoría

test('Review Focus 1: conditions null limpia y es un cambio válido')
// vigente con conditions 'Buen estado' → PUT { monthlyFee: 350, conditions: null } → 200;
//   la nueva nace con conditions NULL (y la vieja conserva la suya)

test('Review Focus 2: ajustar al monto de la estándar recalcula el origen a default')
// estándar 350; PUT { monthlyFee: 350, description: 'otra' } → 200 con feeSource 'default'

test('CA-8: ajustar una categoría cubierta por un activo se rechaza')
// resguardo 'shipping' de silla por tabla → PUT → 409 'categoria-cubierta-por-activo', sin filas nuevas

test('CA-10: sobre una cerrada, 409 sin efecto; dos PUT concurrentes dejan una sola versión')
// PUT sobre id cerrado → 409 'declaracion-de-equipo-propio-no-vigente', sin fila nueva
// Promise.all de dos PUT sobre la misma vigente → uno 200 y otro 409; en BD una sola vigente nueva

test('CA-11: ajena, inexistente y borrada responden el mismo 404')
// PUT sobre id de B (con alcance y header de A), id 2_000_000_000 e id borrado lógicamente
//   → 404 'declaracion-de-equipo-propio-no-encontrada' con deepEqual del cuerpo completo en los tres

test('RF: el ajuste con el colaborador dado de baja responde 404 colaborador-no-encontrado')
// vigente del colaborador A → baja lógica por tabla → PUT → 404 'colaborador-no-encontrado' (§6),
//   sin filas nuevas ni cambio en la vigente; se restaura el colaborador al salir del caso

test('CA-16: sin manage-employee-supplies el gate responde 403')
// actor con supplies:read sin el permiso de escritura → PUT → 403 del gate, sin cambios
```

En `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts`, en el contrato de `assets.routes.ts` (tras la fila del POST del alta, línea ~198):

```ts
{ method: 'put', path: '/own-equipment-declarations/:declarationId',
  handler: '#modules/assets/own_equipment_declarations.controller.update',
  declaration: 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateOwnEquipmentDeclaration' },
```

En `tests/unit/constants/employees_write_permission_declarations.spec.ts`: el conteo pasa de 159 a 160 con su línea de historia (`// 160: entra updateOwnEquipmentDeclaration, el ajuste versionado de la declaración`) y el test de mapeo gana `assert.equal(d.updateOwnEquipmentDeclaration.action, 'manage-employee-supplies')`.

- [ ] **Paso 2: correr y verificar el rojo**

```
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"          → FAIL en la parte 3 (404 de ruta)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts" → FAIL (la fila no existe)
node ace test unit --files="employees_write_permission_declarations.spec.ts"        → FAIL (conteo 159)
```

- [ ] **Paso 3: implementar**

1. `adjust` en el servicio según el orden de Interfaces (el `catch` de `ER_DUP_ENTRY` es el único re-mapeo).
2. Handler `update` delgado + swagger.
3. Ruta, declaración de permiso y las dos llaves i18n.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"          → PASSED (partes 1-3)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts" → PASSED 22/22 (la fila entra al contrato sin cambiar el conteo)
node ace test unit --files="employees_write_permission_declarations.spec.ts"        → PASSED (conteo interno 160)
node ace test functional --files="assets_own_equipment_declarations.spec.ts"       → PASSED 25/25 (regresión)
npm run typecheck                                                                    → exit 0
npx eslint app/modules/assets app/constants                                         → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/own_equipment_declarations.service.ts \
        app/modules/assets/own_equipment_declarations.controller.ts \
        app/modules/assets/assets.routes.ts app/constants/employees_write_permission_declarations.ts \
        resources/langs/es.json resources/langs/en.json \
        tests/functional/assets_own_equipment_lifecycle.spec.ts \
        tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts \
        tests/unit/constants/employees_write_permission_declarations.spec.ts
git commit -m "feat(activos): expone el ajuste versionado de la declaracion de equipo propio

Un PUT que cierra la vigente el dia anterior a la nueva fecha y abre
la version nueva en la misma transaccion: el UPDATE libera el UNIQUE
antes del INSERT, el candado del colaborador serializa dos ajustes a
la vez y el rechazo sin cambios evita versiones gemelas. La cuota
recalcula su origen contra la estandar vigente al guardar.

Refs: VLRH-H1791493045968"
```

---

### Tarea 5 (gsti-rh-api): el término por HTTP — `POST /api/own-equipment-declarations/:declarationId/close`

Cerrar la vigente con fecha y motivo de catálogo; permitido con el colaborador dado de baja o a 0% (para poder limpiar), sin candado de colaborador.

**Files:**
- Modify: `app/modules/assets/own_equipment_declarations.service.ts` (método `close`)
- Modify: `app/modules/assets/own_equipment_declarations.controller.ts` (handler `close` + swagger)
- Modify: `app/modules/assets/assets.routes.ts` (ruta POST close tras el PUT)
- Modify: `app/constants/employees_write_permission_declarations.ts` (`closeOwnEquipmentDeclaration`)
- Modify: `resources/langs/es.json` y `resources/langs/en.json` (`own_equipment_declaration_closed_title/_message`)
- Test: Modify `tests/functional/assets_own_equipment_lifecycle.spec.ts` (parte 4: CA-9, CA-10 close, CA-11 close), `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts` (fila del close), `tests/unit/constants/employees_write_permission_declarations.spec.ts` (conteo 160 → 161)

**Interfaces:**
- Consumes: `findDeclarationForChange`, `closeDeclaration`, factorías 404/409 de la Tarea 1, `toBusinessDateString` de `business_date.ts`.
- Produces:
  - `async close(declarationId: number, input: { endDate?: string; closedReason: OwnEquipmentClosedReason }, userId: number): Promise<OwnEquipmentDeclarationDto>`:
    1. Pre-chequeo sin candado: `findDeclarationForChange(db, scope, id, { lock: false })` → `null` → 404; `status !== 'active'` → 409.
    2. `db.transaction`: SOLO `findDeclarationForChange(trx, ..., { lock: true })` + re-chequeo de `status` (409) — sin candado de colaborador: el término procede con baja o 0%.
    3. `endDate = input.endDate ?? toBusinessDateString()`; si no pasa la regex de calendario o `DateTime.fromISO(endDate).isValid` es falso → 422 `entrada-invalida` con `detail` 'La fecha de término no es una fecha válida'; si `endDate < forChange.startDate` → 422 con `detail` 'La fecha de término no puede ser anterior al inicio de la declaración' (ambos con prefijo fantasma `asset_own_equipment_declaration_invalid_date`, título 'Datos inválidos', key `entrada-invalida`).
    4. `closeDeclaration(trx, id, { endDate, reason: input.closedReason, userId })` → 200 con la cerrada (`findById`) y `own_equipment_declaration_closed_title/_message`.
  - Handler `close(ctx)`: `declarationIdParamsValidator` → `request.validateUsing(closeOwnEquipmentDeclarationValidator)` (sin motivo, `adjusted` o literal fuera de catálogo → 422 `entrada-invalida` por vine) → `auth.getUserOrFail().userId` → 200. Swagger: 200, 403, 404, 409, 422, 500.
  - Ruta: `router.post('/own-equipment-declarations/:declarationId/close', '#modules/assets/own_equipment_declarations.controller.close').use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.closeOwnEquipmentDeclaration))`.
  - `closeOwnEquipmentDeclaration: employeesStandard('manage-employee-supplies')`.
  - i18n (es/en): `own_equipment_declaration_closed_title`: 'Declaración de equipo propio' / 'Own equipment declaration'; `own_equipment_declaration_closed_message`: 'Declaración de equipo propio terminada' / 'Own equipment declaration closed'.

- [ ] **Paso 1: escribir la parte 4 del spec funcional y las filas en rojo**

```ts
test('CA-9: el término cierra con fecha y motivo; sin fecha usa hoy en zona de negocio')
// POST close { endDate: '2026-10-20', closedReason: 'telework_ended' } → 200: status 'closed',
//   endDate, closedReason; la categoría vuelve a 'uncovered' en la matriz y la declaración
//   queda en ownEquipmentHistory (verificado en la Tarea 6; aquí el DTO y la fila en BD)
// POST close sin endDate → 200 con endDate = toBusinessDateString() (hoy en zona de negocio)
// POST close sin closedReason · con 'adjusted' · con 'whatever' → 422 'entrada-invalida'
// POST close { endDate: '2026-08-31' } (< inicio 2026-09-01) → 422 'entrada-invalida'

test('Review Focus 3: cerrar con endDate igual al inicio es válido')
// POST close { endDate: <startDate de la vigente> } → 200 (borde inclusivo ≥)

test('CA-10: cerrar sobre cerrada responde 409 sin efecto')
// segundo close sobre el mismo id → 409 'declaracion-de-equipo-propio-no-vigente', fila intacta

test('CA-11: el close ajeno, inexistente y borrado responde el mismo 404')
// close sobre id de B, id 2_000_000_000 e id con deleted_at → deepEqual del 404 en los tres

test('CA-14: el término procede con el colaborador a 0% o dado de baja')
// vigente del colaborador A → setTelework(idA, 0) → close → 200; luego baja lógica → close otra vigente → 200
```

Fila del contrato de rutas (tras la del PUT):

```ts
{ method: 'post', path: '/own-equipment-declarations/:declarationId/close',
  handler: '#modules/assets/own_equipment_declarations.controller.close',
  declaration: 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.closeOwnEquipmentDeclaration' },
```

En `employees_write_permission_declarations.spec.ts`: conteo 160 → 161 con su línea de historia y `assert.equal(d.closeOwnEquipmentDeclaration.action, 'manage-employee-supplies')`.

- [ ] **Paso 2: correr y verificar el rojo**

```
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"                    → FAIL en la parte 4 (404 de ruta)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"      → FAIL (la fila no existe)
node ace test unit --files="employees_write_permission_declarations.spec.ts"                 → FAIL (conteo 160)
```

- [ ] **Paso 3: implementar**

`close` en el servicio según el orden de Interfaces, handler `close` delgado, ruta, declaración y llaves i18n.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"                    → PASSED (partes 1-4)
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"      → PASSED 22/22
node ace test unit --files="employees_write_permission_declarations.spec.ts"                  → PASSED (conteo interno 161)
node ace test unit --files="constants/"                                                       → PASSED 154/154
npm run typecheck → exit 0
npx eslint app/modules/assets app/constants                                                   → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/own_equipment_declarations.service.ts \
        app/modules/assets/own_equipment_declarations.controller.ts \
        app/modules/assets/assets.routes.ts app/constants/employees_write_permission_declarations.ts \
        resources/langs/es.json resources/langs/en.json \
        tests/functional/assets_own_equipment_lifecycle.spec.ts \
        tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts \
        tests/unit/constants/employees_write_permission_declarations.spec.ts
git commit -m "feat(activos): expone el termino de la declaracion de equipo propio

Un POST por declaracion que pide fecha de termino y un motivo del
catalogo con adjusted fuera de juego, cierra con el autor de la
operacion y procede tambien con el colaborador dado de baja o sin
teletrabajo: las declaraciones vigentes se pueden limpiar siempre.

Refs: VLRH-H1791493045968"
```

---

### Tarea 6 (gsti-rh-api): la matriz gana histórico, cuota estándar, aviso de sustitución y vigentes con 0%

`matrixForEmployee` lee el histórico y la cuota estándar; el tipo discriminado gana `ownEquipmentSuperseded` por variante y las tres raíces nuevas; el resumen por lote no cambia.

**Files:**
- Modify: `app/modules/assets/dto/telework_supplies.dto.ts` (raíz + variantes)
- Modify: `app/modules/assets/telework_supplies.rules.ts` (`buildEmployeeTeleworkSupplies` gana el ciclo de vida; `buildCategoryDto` el aviso)
- Modify: `app/modules/assets/telework_supplies.service.ts` (tercer parámetro de constructor; `matrixForEmployee` lee histórico y ajustes)
- Test: Modify `tests/unit/modules/assets/telework_supplies.rules.spec.ts` (casos del ciclo de vida), `tests/functional/assets_own_equipment_lifecycle.spec.ts` (parte 5: CA-12 a CA-15 + Review Focus)
- Test (solo corre): `tests/functional/assets_telework_supplies.spec.ts`, `tests/functional/assets_employee_assets.spec.ts`

**Interfaces:**
- Consumes: `findHistoryByEmployee` (Tarea 2), `isOwnEquipmentSuperseded` (Tarea 1), `getEffective` (hermana integrada), `findOpenByEmployees` (alta).
- Produces (la Tarea 8 del BO espeja estos nombres):
  - `TeleworkSuppliesLifecycle = { history: OwnEquipmentDeclarationDto[]; feeDefault: number | null }` (en `dto/telework_supplies.dto.ts`).
  - `buildEmployeeTeleworkSupplies(profile, rows, ownEquipmentDeclarations = new Map(), lifecycle: TeleworkSuppliesLifecycle = { history: [], feeDefault: null })` — cuarto parámetro con default: los callers existentes no cambian. La matriz gana en AMBAS ramas de `applies`: `ownEquipmentHistory: lifecycle.history`, `ownEquipmentFeeDefault: lifecycle.feeDefault`, y `ownEquipmentToClose`: con `applies: false` son `[...ownEquipmentDeclarations.values()]` (las vigentes del colaborador, TODAS las categorías, incluidas las de un colaborador dado de baja); con `applies: true` es `[]` literal (lo exige el tipo).
  - `TeleworkSupplyCategoryDto`: la variante `delivered`/`shipping` gana `ownEquipmentSuperseded: boolean`; las variantes `own_equipment`, `uncovered` y `not_delivered` llevan `ownEquipmentSuperseded: false` literal — el aviso no compila sobre una categoría no cubierta.
  - `buildCategoryDto` adjunta el aviso con `isOwnEquipmentSuperseded(status, ownEquipmentDeclarations.has(category))`.
  - `TeleworkSuppliesService`: `constructor(repository, declarations = new OwnEquipmentDeclarationsRepositoryMysql(), settings: Pick<TeleworkComplianceSettingService, 'getEffective'> = new TeleworkComplianceSettingService())`. `matrixForEmployee` (firma intacta): tras el perfil, `Promise.all([findTeleworkCoverage, findOpenByEmployees, findHistoryByEmployee, getEffective(businessUnitIds[0])])` y construye con `lifecycle = { history, feeDefault: ownEquipmentFeeDefault }` — el alcance de la ficha es UNA empresa (la del header), y el colaborador está dentro, así que `businessUnitIds[0]` es su empresa; con alcance vacío la matriz ni se arma (el perfil sale `null` antes). `summarizeForEmployees` NO cambia: construye con el default del ciclo de vida (ni histórico ni cuota en el lote).
  - `makeTeleworkSuppliesService(): TeleworkSuppliesService` — firma pública intacta; cablea los tres adaptadores.

- [ ] **Paso 1: escribir en rojo las reglas y la matriz**

En `tests/unit/modules/assets/telework_supplies.rules.spec.ts` (los casos existentes que comparan categorías completas se actualizan con `ownEquipmentSuperserved` — el archivo ya se editó en la Tarea 1):

```ts
test('la matriz viaja con historico, cuota estandar y vigentes por cerrar')
// build(profile, rows, mapa, { history: [dto cerrada], feeDefault: 350 }) con applies true:
//   ownEquipmentHistory = [dto], ownEquipmentFeeDefault 350, ownEquipmentToClose []
// con applies false (perfil Onsite o 0%): ownEquipmentToClose = [las vigentes del mapa],
//   ownEquipmentFeeDefault conserva el valor, categories []

test('el aviso de sustitucion solo en delivered/shipping y con vigente')
// con mapa con vigente + row active → delivered con ownEquipmentSuperseded true
// delivered SIN vigente → false · uncovered/not_delivered/own_equipment → false literal
```

Parte 5 del spec funcional (usa los helpers de matriz del alta spec como molde: `matrixBody`, `matrixCategoryOf`):

```ts
test('CA-12: el historico viaja ordenado por fin desc y luego id desc')
// tres cerradas por tabla de categorías distintas (fin 2026-09-30, 2026-08-31, 2026-09-30,
//   en ese orden de inserción) → GET matriz → ownEquipmentHistory [aditamento, silla, cómputo]

test('CA-13: la categoria cubierta por un activo prende el aviso y la declaracion sigue vigente')
// vigente de silla + resguardo active de silla → silla delivered, ownEquipment con la vigente,
//   ownEquipmentSuperseded true; cómputo y aditamento (sin vigente) → false

test('CA-14: con 0% la matriz devuelve las vigentes para terminarlas y no se puede declarar')
// colaborador A al 0% con una vigente de cómputo → applies false, categories [],
//   ownEquipmentToClose [esa vigente], resumen en ceros
// sin vigentes → ownEquipmentToClose [] · POST alta → 422 'colaborador-sin-teletrabajo'
// close sobre su vigente → 200 (la Tarea 5 ya lo probó; aquí la matriz sin vigentes)

test('CA-15: la cuota estandar de la empresa viaja en la matriz')
// A con settings 350 → ownEquipmentFeeDefault 350; colaborador de B (sin fila) → null

test('Review Focus 4 y 5: la borrada lógica no aparece; la vigente no viaja en el historico')
// cerrada con deleted_at lleno → fuera de ownEquipmentHistory
// vigente de silla + cerrada de silla → history SOLO la cerrada (1 renglón)
```

- [ ] **Paso 2: correr y verificar el rojo**

```
node ace test unit --files="telework_supplies.rules.spec.ts"                     → FAIL en los casos nuevos
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"      → FAIL en la parte 5
```

- [ ] **Paso 3: implementar**

1. DTO: `TeleworkSuppliesLifecycle` + las tres raíces por rama + `ownEquipmentSuperseded` por variante.
2. Reglas: el cuarto parámetro, las raíces en `buildEmployeeTeleworkSupplies`, el aviso en `buildCategoryDto` con `isOwnEquipmentSuperseded`.
3. Servicio: tercer parámetro de constructor, las cuatro lecturas en `matrixForEmployee`, factoría cableando los tres adaptadores.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test unit --files="telework_supplies.rules.spec.ts"                     → PASSED
node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"       → PASSED (partes 1-5)
node ace test functional --files="assets_telework_supplies.spec.ts"              → PASSED 15/15 (SIN editar el archivo: el tercer parámetro es opcional)
node ace test functional --files="assets_employee_assets.spec.ts"                → PASSED 15/15
node ace test functional --files="assets_own_equipment_declarations.spec.ts"    → PASSED 25/25
npm run typecheck                                                                 → exit 0
npx eslint app/modules/assets                                                      → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/dto/telework_supplies.dto.ts app/modules/assets/telework_supplies.rules.ts \
        app/modules/assets/telework_supplies.service.ts \
        tests/unit/modules/assets/telework_supplies.rules.spec.ts \
        tests/functional/assets_own_equipment_lifecycle.spec.ts
git commit -m "feat(activos): la matriz de insumos gana historico, cuota estandar y aviso

La ficha lee junto a la matriz el historico ordenado de la declaracion
y la cuota estandar de la empresa; la categoria cubierta por un activo
prende el aviso de que la declaracion sobra sin cerrarla sola, y quien
dejo de teletrabajar conserva sus vigentes listadas para terminarlas.

Refs: VLRH-H1791493045968"
```

---

### Tarea 7 (gsti-rh-bo): el panel gana modos ajustar y terminar, chip de origen, aviso e histórico

El mismo panel `ownEquipmentDeclarationPanel` ahora hace las tres acciones: declarar (con precarga), ajustar y terminar; muestra el chip de origen, el aviso de sustitución y el histórico plegado.

**Files:**
- Modify: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.interface.ts` (campos de cierre y origen; payloads; unión de submit)
- Modify: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.const.ts` (motivos seleccionables y modos)
- Modify: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.helpers.ts` (validadores y builders de ajuste/término, día siguiente, llave de motivo)
- Modify: `components/ownEquipmentDeclarationPanel/application/use-own-equipment-declaration.ts` (submit discriminado por modo)
- Modify: `components/ownEquipmentDeclarationPanel/infrastructure/own-equipment-declarations.repository.ts` (PUT y POST close)
- Modify: `components/ownEquipmentDeclarationPanel/script.ts`, `index.vue`, `style.scss`
- Modify: `components/ownEquipmentDeclarationPanel/domain/locales/own-equipment-declaration-panel.es.json`, `.en.json`
- Test: Modify `tests/ownEquipmentDeclarationPanel/own-equipment-declaration.helpers.spec.ts`, `tests/ownEquipmentDeclarationPanel/use-own-equipment-declaration.spec.ts`

**Interfaces:**
- Consumes: de la Tarea 6, la matriz con `ownEquipmentFeeDefault`/`ownEquipmentHistory`/`ownEquipmentSuperseded` (la Tarea 8 los pasa como props). Del alta: `assetFetch`, `ApiError`, `formatMonthlyFeeMxn`, `formatSinceDate`, `canDeclareOwnEquipment`, el patrón de `DatePicker` con `update-model-type="string"` (`startDateModel`).
- Produces:
  - `OwnEquipmentDeclaration` gana `endDate: string | null`, `closedReason: OwnEquipmentClosedReason | null`, `feeSource: 'default' | 'adjusted'`; nuevo `OwnEquipmentClosedReason = 'company_equipment_assigned' | 'telework_ended' | 'conditions_changed' | 'other' | 'adjusted'` y `OwnEquipmentDeclarationMode = 'create' | 'adjust' | 'close'`.
  - Payloads y captura: `AdjustOwnEquipmentDeclarationPayload = { monthlyFee: number; effectiveDate: string; description?: string; conditions?: string | null }`; `CloseOwnEquipmentDeclarationPayload = { endDate: string; closedReason: Exclude<OwnEquipmentClosedReason, 'adjusted'> }`; captura del drawer `AdjustOwnEquipmentFormInput = { monthlyFee: number | null; effectiveDate: string; description: string; conditions: string }` y `CloseOwnEquipmentFormInput = { closeDate: string; closeReason: Exclude<OwnEquipmentClosedReason, 'adjusted'> | null }`.
  - `OWN_EQUIPMENT_CLOSE_REASONS = ['company_equipment_assigned', 'telework_ended', 'conditions_changed', 'other'] as const` (seleccionables: `adjusted` NO está) en el const del dominio.
  - Helpers puros (sin Vue ni i18n): `nextCalendarDay(iso: string): string` (`2026-10-15` → `2026-10-16`; `2026-12-31` → `2027-01-01`, con `Date.UTC`); `todayIsoDate(): string` (`YYYY-MM-DD` local); `validateAdjustOwnEquipmentDeclaration(input: AdjustOwnEquipmentFormInput): Partial<Record<'monthlyFee' | 'description' | 'conditions', 'required' | 'fee_invalid' | 'max_length'>>`; `buildAdjustOwnEquipmentPayload(input: AdjustOwnEquipmentFormInput): AdjustOwnEquipmentDeclarationPayload` (condiciones vacías → `null`, descripción trim, `effectiveDate` tal cual); `validateCloseOwnEquipmentDeclaration(input: CloseOwnEquipmentFormInput): { closedReason?: 'required' }`; `buildCloseOwnEquipmentDeclarationPayload(input: CloseOwnEquipmentFormInput): CloseOwnEquipmentDeclarationPayload` (la `closeDate` viaja como `endDate`); `closeReasonLabelKey(reason: OwnEquipmentClosedReason): string` → `own_equipment_declaration_panel.closed_reason.${reason}` (incluye `adjusted`).
  - Repositorio: `adjustOwnEquipmentDeclaration(params, declarationId: number, payload): Promise<OwnEquipmentDeclaration>` — `assetFetch(params, `/own-equipment-declarations/${declarationId}`, { method: 'PUT', body: payload })`; `closeOwnEquipmentDeclaration(params, declarationId, payload)` — `assetFetch(params, `/own-equipment-declarations/${declarationId}/close`, { method: 'POST', body: payload })`. Ambas devuelven `body.data`.
  - Composable: `useOwnEquipmentDeclaration(deps, employeeId)` gana `openAdjust(): void` y `openClose(): void` (abren + resetean, como `openCreate`); `submit` pasa a recibir la unión `OwnEquipmentDeclarationSubmitInput = ({ mode: 'create'; category: AssetTypeTeleworkCategory } & OwnEquipmentDeclarationFormInput) | ({ mode: 'adjust'; declarationId: number } & AdjustOwnEquipmentFormInput) | ({ mode: 'close'; declarationId: number } & CloseOwnEquipmentFormInput)` y despacha: valida con su validador, llama al método del repositorio que toca, cierra el drawer y resuelve `true`; error del API → `apiError` y drawer abierto, `false`. `validationErrors` se tipa con la unión de códigos de los tres validadores.
  - `script.ts`: el formulario reactivo gana `effectiveDate`, `closeDate`, `closeReason` (`null`), y `activeMode: Ref<Mode>` local; `openDrawer` (create) precarga `monthlyFee` con `props.feeDefault ?? null`; `openAdjustDrawer` precarga cuota/descripción/condiciones de `props.declaration` y `effectiveDate` en `todayIsoDate()` con mínimo `nextCalendarDay(declaration.startDate)`; `openCloseDrawer` precarga `closeDate` en hoy con mínimo `declaration.startDate` y `closeReason` en `null`; `save()` arma el input discriminado y llama `submit`. El título del drawer y la nota van por `activeMode`.
  - `index.vue`: un solo `Drawer` con secciones por modo (`v-if`): create (cuota con ayuda `form.fee_default_hint`/`form.fee_no_default_hint` según `feeDefault`), adjust (cuota precargada, `DatePicker` "Vigente desde" con mínimo `nextCalendarDay`, descripción/condiciones precargadas, nota fija `form.adjust_no_evidence_note`, SIN campo de archivo), close (`DatePicker` "Fecha de término" con mínimo el inicio, `Select` de motivo con los 4 literales). Con `declaration`: chip `Tag` `fee_source.default`/`fee_source.adjusted` según `feeSource`. Con `superseded && canManage`: `Message severity="warn"` `superseded_warning` + botón Terminar (abre el drawer close). Acciones Ajustar y Terminar (`variant="text" raised severity="secondary"`) solo con `canManage` y `declaration` — se OCULTAN (`v-if`), nunca se deshabilitan; Ajustar no se pinta cuando `superseded`. Histórico: bloque plegado (elemento `details`/toggle) `history_title` con conteo, un renglón por versión: descripción, cuota (`formatMonthlyFeeMxn`), periodo `history_period` (`{start} a {end}`, ambos con `formatSinceDate`), motivo (`closeReasonLabelKey` traducido; `adjusted` = "Ajuste de cuota"). "Con evidencia/Sin evidencia" NO se pinta: el DTO no viaja con la llave del archivo (§12 lo condiciona a que el DTO la traiga). Estados: Guardar con `:loading="submitting"`, error del API en `Message` dentro del drawer sin cerrarlo, éxito → toast `toast.adjusted`/`toast.closed` y `emit('saved')`.
  - `style.scss`: histórico en una columna, drawer a ancho completo bajo `md`, sin desplazamiento horizontal a 375 px.
  - Locales es/en (raíz `own_equipment_declaration_panel`): `fee_source.default` "Cuota estándar"/"Standard fee", `fee_source.adjusted` "Cuota ajustada"/"Adjusted fee", `superseded_warning` "Esta categoría ya la cubre un activo de la empresa: termina la declaración."/"This category is already covered by a company asset: close the declaration.", `history_title` "Declaraciones anteriores ({n})"/"Previous declarations ({n})", `history_period` "{start} a {end}"/"{start} to {end}", `closed_reason.company_equipment_assigned` "Se le asignó equipo de la empresa"/"Company equipment was assigned", `closed_reason.telework_ended` "Dejó el teletrabajo"/"Ended telework", `closed_reason.conditions_changed` "Cambio de condiciones"/"Conditions changed", `closed_reason.other` "Otro"/"Other", `closed_reason.adjusted` "Ajuste de cuota"/"Fee adjustment", `actions.adjust` "Ajustar cuota"/"Adjust fee", `actions.close` "Terminar declaración"/"Close declaration", `form.adjust_title` "Ajustar declaración: {category}"/"Adjust declaration: {category}", `form.close_title` "Terminar declaración: {category}"/"Close declaration: {category}", `form.effective_date` "Vigente desde"/"Effective from", `form.end_date` "Fecha de término"/"End date", `form.close_reason` "Motivo de término"/"Close reason", `form.adjust_no_evidence_note` "La versión nueva queda sin evidencia ni respaldo de adenda"/"The new version starts without evidence or addendum backing", `form.fee_default_hint` "Cuota estándar de la empresa: {fee}"/"Company standard fee: {fee}", `form.fee_no_default_hint` "La empresa no tiene cuota estándar; captura el monto"/"The company has no standard fee; enter the amount", `toast.adjusted` "Declaración ajustada."/"Declaration adjusted.", `toast.closed` "Declaración terminada."/"Declaration closed."

- [ ] **Paso 1: escribir las pruebas en rojo**

En `own-equipment-declaration.helpers.spec.ts`:

```ts
it('nextCalendarDay suma un día civil, también fin de año')   // '2026-10-15' → '2026-10-16' · '2026-12-31' → '2027-01-01'
it('validateAdjust exige la cuota y respeta los límites')     // null → required · -1 → fee_invalid · desc 256 → max_length
it('buildAdjust normaliza condiciones vacías a null')          // conditions '' → null en el payload · description trim
it('validateClose exige el motivo')                            // closedReason null → required
it('buildClose arma el payload de término')                   // { endDate, closedReason } tal cual
it('closeReasonLabelKey traduce los cinco motivos')           // incluido 'adjusted' → closed_reason.adjusted
```

En `use-own-equipment-declaration.spec.ts` (el fixture `created` gana `endDate: null, closedReason: null, feeSource: 'adjusted'`):

```ts
it('un submit de ajuste llama al PUT con el id, cierra el drawer y resuelve true')
it('un submit de término llama al POST close con el id y resuelve true')
it('un error del API de ajuste queda en apiError y el drawer sigue abierto')
it('un ajuste inválido no llama al repositorio')
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/ownEquipmentDeclarationPanel` → FAIL (no compilan las exportaciones nuevas).

- [ ] **Paso 3: implementar**

Domain → infrastructure → application → script → index.vue → style → locales, en ese orden. El `Select` de motivo usa `OWN_EQUIPMENT_CLOSE_REASONS` con `optionLabel` desde el locale; `adjusted` no aparece porque no está en la constante.

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/ownEquipmentDeclarationPanel tests/employeeTeleworkSuppliesPanel \
        tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu   → PASSED (los archivos del panel actualizados)
npm run lint:i18n                                                                     → sin claves nuevas sin traducción
npm run lint:icons                                                                    → limpio
npx eslint components/ownEquipmentDeclarationPanel tests/ownEquipmentDeclarationPanel → 0 errores
npm run typecheck 2>&1 | grep -cE "ownEquipmentDeclarationPanel"                      → 0 (los 277 errores TS son preexistentes y ninguno en el área)
grep -rnE "adjusted" components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.const.ts → sin literal en el Select (solo el tipo, jamás la opción)
```

Auditoría de `.claude/rules/compliance-check.md` sobre los archivos tocados y línea **Compliance** al cerrar.

- [ ] **Paso 5: commit**

```bash
git add components/ownEquipmentDeclarationPanel tests/ownEquipmentDeclarationPanel
git commit -m "feat(empleados): el panel de declaracion gana ajuste, termino e historico

El mismo drawer ahora declara con la cuota estandar propuesta,
ajusta precargando la vigente con su fecha de vigencia y termina con
motivo de catalogo; el chip cuenta si la cuota es estandar o
ajustada, el aviso dice cuando un activo ya cubre la categoria y el
historial plegado conserva cada version con su periodo y su motivo.

Refs: VLRH-H1791493045968"
```

---

### Tarea 8 (gsti-rh-bo): la matriz pasa cuota estándar, histórico y aviso; el bloque sobrevive con 0%

La matriz (`employeeTeleworkSuppliesPanel`) le pasa al panel la cuota estándar, el histórico por categoría y el aviso, y se mantiene visible sin teletrabajo mientras haya vigentes que terminar.

**Files:**
- Modify: `components/employeeTeleworkSuppliesPanel/domain/telework-supplies.interface.ts` (raíz + `ownEquipmentSuperseded` por variante)
- Modify: `components/employeeTeleworkSuppliesPanel/domain/telework-supplies.helpers.ts` (`isTeleworkBlockVisible`, `historyForCategory`)
- Modify: `components/employeeTeleworkSuppliesPanel/script.ts`, `index.vue`
- Modify: `components/employeeTeleworkSuppliesPanel/domain/locales/employee-telework-supplies-panel.es.json`, `.en.json`
- Test: Modify `tests/employeeTeleworkSuppliesPanel/telework-supplies.helpers.spec.ts`

**Interfaces:**
- Consumes: de la Tarea 7, el panel con sus props nuevas (`feeDefault`, `history`, `superseded`) y sus handlers de ajuste/término; el evento `saved` ya existe.
- Produces:
  - `EmployeeTeleworkSuppliesData` (unión por `applies`): ambas ramas ganan `ownEquipmentHistory: OwnEquipmentDeclaration[]`, `ownEquipmentFeeDefault: number | null` y `ownEquipmentToClose: OwnEquipmentDeclaration[]` (espejo del API; con `applies: false` son las vigentes, con `true` viene vacío).
  - `TeleworkSupplyCategory`: la variante `delivered`/`shipping` gana `ownEquipmentSuperseded: boolean`; las demás `false` literal.
  - `isTeleworkBlockVisible(matrix: EmployeeTeleworkSuppliesData): boolean` → `matrix.applies || matrix.ownEquipmentToClose.length > 0` — reemplaza el `data.applies` del `isVisible` del script (que conserva loading/error).
  - `historyForCategory(history: OwnEquipmentDeclaration[], category: AssetTypeTeleworkCategory): OwnEquipmentDeclaration[]` — filtro que conserva el orden del root (`end_date` desc, ya viene ordenado del API).
  - `script.ts`: expone `ownEquipmentFeeDefault` (`data.ownEquipmentFeeDefault ?? null`), `historyForCategory` con `data.ownEquipmentHistory`, y por categoría pasa al panel `:fee-default`, `:history` y `:superseded="category.ownEquipmentSuperseded"`. El `v-if` del panel por categoría pasa a montarse si la categoría tiene vigente, o histórico, o acción de declarar (`canDeclareOwnEquipment(...) || historyForCategory(...).length > 0 || category.ownEquipment !== null`).
  - `index.vue`: `isVisible` usa `isTeleworkBlockVisible`; con `!applies && ownEquipmentToClose.length > 0` se pinta SOLO la nota `inactive_note` y la lista `ownEquipmentToClose` — cada una con su panel (declaración vigente + acción Terminar) —, sin `Card` de leyenda, chips de resumen, renglones de categoría ni botón Declarar. El evento `summary-loaded` sigue emitiendo `applies` tal cual (la etiqueta de la lista de activos no cambia).
  - Locales es/en (raíz `employee_telework_supplies_panel`): `inactive_note` "Sin teletrabajo: solo se muestran las declaraciones vigentes para terminarlas."/"No telework: only active declarations are shown so they can be closed."

- [ ] **Paso 1: escribir las pruebas en rojo**

En `tests/employeeTeleworkSuppliesPanel/telework-supplies.helpers.spec.ts`:

```ts
describe('isTeleworkBlockVisible', () => {
  it('aplica con la matriz vigente y sin teletrabajo mientras queden vigentes')
  // applies true → true · applies false + toClose [] → false · applies false + toClose [dto] → true
})

describe('historyForCategory', () => {
  it('filtra por categoría conservando el orden del root')
  // [sillaA (fin 10-01), cómputo, sillaB (fin 09-01)] → historyForCategory(…, 'ergonomic_chair')
  //   → [sillaA, sillaB] en el mismo orden · categoría sin histórico → []
})
```

- [ ] **Paso 2: correr y verificar el rojo**

`npx vitest run tests/employeeTeleworkSuppliesPanel` → FAIL (no existen los helpers).

- [ ] **Paso 3: implementar**

Interfaz → helpers → script → index.vue → locales, en ese orden. La nota y la lista del modo sin teletrabajo reutilizan las clases del panel (`style.scss` del matriz solo si hace falta un ajuste de espaciado).

- [ ] **Paso 4: correr y verificar el verde**

```
npx vitest run tests/employeeTeleworkSuppliesPanel tests/ownEquipmentDeclarationPanel \
        tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu   → PASSED
npm run lint:i18n                                                                     → sin claves nuevas sin traducción
npm run lint:icons                                                                    → limpio
npx eslint components/employeeTeleworkSuppliesPanel tests/employeeTeleworkSuppliesPanel → 0 errores
npm run typecheck 2>&1 | grep -cE "employeeTeleworkSuppliesPanel|ownEquipmentDeclarationPanel" → 0
```

Auditoría de compliance y línea **Compliance**.

- [ ] **Paso 5: commit**

```bash
git add components/employeeTeleworkSuppliesPanel tests/employeeTeleworkSuppliesPanel
git commit -m "feat(empleados): la matriz pasa la cuota, el historico y el aviso al panel

El bloque de insumos sobrevive sin teletrabajo mientras queden
declaraciones vigentes por terminar, listadas solas con su accion de
terminar; con teletrabajo, cada categoria le entrega al panel su cuota
estandar para la precarga, su historial plegado y el aviso de que un
activo ya la cubre.

Refs: VLRH-H1791493045968"
```

---

### Tarea 9: manual de QA — último entregable, solo se entrega

El usuario recorre este manual él mismo (trae pantalla: es manual de frontend, único por historia). No se ejecuta ni se automatiza aquí: se escribe y se entrega (decisión de producto, Wilvardo 2026-10-08).

**Files:**
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (bloque nuevo de la HU; ese archivo NO se commitea)
- Create: `docs/superpowers/plans/2026-10-14-precargar-ajustar-y-terminar-la-declaracion-qa-flujo.md` (en gsti-rh-api, donde se versiona)

**Interfaces:**
- Consumes: la skill `manual-qa` (reglas en `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `manual-qa-execution.md`): cada escenario abre con su línea `Objetivo:` antes de los pasos; correos exactos y contraseña literal leídos del sembrador compartido (si falta una cuenta, se agrega ahí: es su sitio); datos sembrados sin acentos ni eñes; sin rutas de archivo ni endpoints en el manual; anchos 360/850/escritorio; glosario si aplica; escenarios que resuelven las pruebas automatizadas con su `Objetivo:`, `Qué debe verse:` y `Qué pasó:`, y su checklist propio; sección final `## Hallazgos de otras historias`.
- Produces: el manual para el recorrido manual. Los hallazgos que el usuario reporte se registran en `qa-valanserh/hallazgos.md` (cuadro de 14 campos; el código archivo:línea en Comentarios/Historial) y se corrigen en esta misma rama.

- [ ] **Paso 1: completar el estado del sembrador y correrlo**

El sembrador ya trae el bloque de `VLRH-H1791306075599` (cuentas `qa-own-equipment-full@gsti-tests.local` con `manage-employee-supplies` y toda la cadena de lectura, y `qa-own-equipment-readonly@gsti-tests.local` sin el permiso de escritura; colaboradores QA-TEL-01 a 07; una declaración vigente para QA-TEL-02 y la silla QA-TEL-ACT-SILLA-05 sin resguardo). Verifica en el archivo qué falta para ESTE manual y agrégalo en un bloque nuevo `VLRH-H1791493045968` (molde del bloque hermano): (a) una declaración vigente para el colaborador QA-TEL de 0% de teletrabajo (el del bloque que no aplica), para el modo sin teletrabajo; (b) una versión CERRADA previa de la categoría del QA-TEL-02, para que el histórico nazca poblado; (c) la cuota estándar de la empresa de QA en los ajustes de teletrabajo (`350.00`), para la precarga. Corre el único comando del playbook (el que imprime `[qa-seeder] listo`), SIN commitear el archivo.

- [ ] **Paso 2: escribir el manual**

Con la skill `manual-qa` cargada y los correos/contraseña leídos del sembrador (nunca de memoria). Escenarios recorribles: declarar SIN capturar la cuota (llega propuesta con la estándar y el chip dice "Cuota estándar"); capturar una distinta (chip "Cuota ajustada"); ajustar la cuota de una vigente con fecha de vigencia (la anterior queda en "Declaraciones anteriores" con su periodo y "Ajuste de cuota", la nueva queda vigente); ajustar solo la descripción o las condiciones; terminar con fecha y motivo "Dejó el teletrabajo" (la categoría vuelve a "Sin cubrir" y el histórico gana el renglón); asignar la silla de la empresa a quien tenía silla propia (el aviso de sustitución con su botón Terminar); entrar con la cuenta sin permiso de escritura (se ven las declaraciones y el histórico, no las acciones); el colaborador de 0% (solo la lista de vigentes con su acción Terminar y la nota); anchos (360, ~850, escritorio: drawer a ancho completo en móvil, histórico en una columna) e inglés. Escenarios que resuelven las pruebas automatizadas (con su `Objetivo:`, `Qué debe verse:` y `Qué pasó:`): el ajuste con fecha igual o anterior al inicio (422 que nombra la fecha), el ajuste sin cambios (422), el doble ajuste simultáneo (uno 200 y uno 409), el término con `Ajuste de cuota` como motivo (no existe en el catálogo), el 404 indistinguible de la ajena, y el 403 del gate sin el permiso. Checklist propio de la sección y `## Hallazgos de otras historias` (o «Ninguno»).

- [ ] **Paso 3: verificación de formato y commit**

Cada escenario abre con su `Objetivo:`; sin endpoints, rutas de archivo ni comandos más allá del seeder; correos exactos y la contraseña literal del sembrador.

```bash
git add docs/superpowers/plans/2026-10-14-precargar-ajustar-y-terminar-la-declaracion-qa-flujo.md
git commit -m "docs(qa): agrega el manual de precarga, ajuste y termino de la declaracion

Refs: VLRH-H1791493045968"
```

Entregar la ruta al usuario y **esperar su recorrido manual**. Los hallazgos que reporte van a `qa-valanserh/hallazgos.md` y se corrigen en esta misma rama.

---

## Definition of Done — líneas base medidas (2026-10-14, ambos repos a la par de la rama base)

Todas las verificaciones se midieron contra el árbol actual antes de escribir este plan; estos números son los que valen. La base de los `git diff` es `feature/VLRH-H1791306075599-declarar-el-uso-de-equipo-propio-con-su-cuota-de` en cada repo.

**gsti-rh-api** (`NODE_ENV=test`, BD `sae_pruebas` al día con `migration:fresh --seed`):

| Comando | Línea base | Criterio |
|---|---|---|
| `node ace test functional --files="assets_own_equipment_lifecycle.spec.ts"` | (nuevo) | PASSED, las cinco partes |
| `node ace test functional --files="assets_own_equipment_declarations.spec.ts"` | PASSED 25/25 | PASSED 25/25 **sin editar el archivo** (sus fixtures no tienen estándar → `adjusted` como siempre) |
| `node ace test functional --files="assets_telework_supplies.spec.ts"` | PASSED 15/15 | PASSED 15/15 **sin editar el archivo** (tercer parámetro opcional) |
| `node ace test functional --files="assets_employee_assets.spec.ts"` | PASSED 15/15 | PASSED 15/15 |
| `node ace test unit --files="telework_supplies.rules.spec.ts"` | PASSED 11/11 | PASSED con los casos nuevos del ciclo de vida |
| `node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"` | PASSED 22/22 | PASSED 22/22 (dos filas nuevas en el contrato, el conteo de tests no cambia) |
| `node ace test unit --files="employees_write_permission_declarations.spec.ts"` | PASSED 9/9 (conteo interno 159) | PASSED 9/9 (conteo interno **161**) |
| `node ace test unit --files="constants/"` | PASSED 154/154 | PASSED 154/154 (sin cambios de catálogo) |
| `node ace test unit` completo | **3874 passed, 114 failed** (preexistentes en la rama base) | **no más de 114 fallidas** y ninguna que nombre los archivos del censo; la suite completa NO está verde en la base: "todo en verde" no es criterio alcanzable y no se persigue aquí |
| `node ace test functional` completo | no terminó dentro de la ventana de medición (corrida >7 min) | el executor registra el conteo de su primera corrida como línea base y exige **sin fallos nuevos**; las puertas duras son los comandos acotados de esta tabla |
| `npm run typecheck` | exit 0, 0 errores | exit 0 |
| `npx eslint app/modules/assets app/constants` | 0 problemas | 0 problemas. No pasar `resources/langs/*.json` por eslint (errores `quotes` preexistentes sobre JSON) |
| `git grep -n "fee_source: 'adjusted'\|feeSource: 'adjusted'" -- app/modules/assets` | **2 resultados** (la anotación del DTO y el literal del servicio) | **0 resultados** (CA-19) |
| `git diff --name-only --diff-filter=A <base>...HEAD` (ambos repos) | vacío | **solo** `tests/functional/assets_own_equipment_lifecycle.spec.ts` en el api; **vacío** en el BO (CA-18) |
| `git diff --name-only <base>...HEAD -- database/migrations app/modules/assets/asset_files.controller.ts app/services/employee_supplie_service.ts app/services/telework_compliance_setting_service.ts app/modules/assets/employee_assets.controller.ts app/modules/assets/assets.repository.ts app/modules/assets/assets.repository.mysql.ts app/constants/supplies_permission_declarations.ts tests/functional/assets_own_equipment_declarations.spec.ts` | vacío | vacío (CA-18 + censo no-tocado) |
| `git diff --name-only <base>...HEAD` (ambos repos) | vacío | subconjunto de las filas `editado`/`nuevo` del censo del spec |

**gsti-rh-bo:**

| Comando | Línea base | Criterio |
|---|---|---|
| `npx vitest run tests/employeeTeleworkSuppliesPanel tests/employeeAssetsPanel tests/employeeDetail tests/employeeSectionsMenu tests/ownEquipmentDeclarationPanel` | 20 archivos, 146 pruebas, PASSED | PASSED + los casos nuevos en los archivos editados |
| `npm run typecheck` | **exit ≠ 0, 277 errores TS preexistentes, 0 en las áreas de la HU** | `npm run typecheck 2>&1 \| grep -cE "ownEquipmentDeclarationPanel\|employeeTeleworkSuppliesPanel"` → 0 |
| `npx eslint components/ownEquipmentDeclarationPanel components/employeeTeleworkSuppliesPanel tests/ownEquipmentDeclarationPanel tests/employeeTeleworkSuppliesPanel` | 0 errores | 0 errores |
| `npm run lint:i18n` | limpio (31 claves heredadas) | sin claves nuevas sin traducción |
| `npm run lint:icons` | limpio | limpio |

**Notas para el executor:**

- La suite unit completa tiene **114 fallos preexistentes** en la rama base (3874 aprobadas de 3988). El spec §16 pide todo en verde: contra este árbol no es alcanzable y **no se persigue** — el criterio real es *sin fallos nuevos* (conteo final no mayor a 114, ninguno en los archivos del censo). Si un fallo nuevo cae fuera del censo, se reporta en `## Hallazgos de otras historias` del manual (Tarea 9) y no se arregla aquí.
- El segundo parámetro del constructor de `OwnEquipmentDeclarationsService` y el tercero de `TeleworkSuppliesService` son **opcionales con default a propósito**: `assets_telework_supplies.spec.ts` instancia el servicio con un solo argumento y el censo manda no editarlo.
- Los 422 por fecha usan **prefijos i18n fantasma** (`asset_own_equipment_declaration_invalid_date`, `asset_own_equipment_declaration_no_changes`): sus llaves no existen en `resources/langs/*`, así que el `fallbackDetail` fijo (que nombra el campo, no el valor) es siempre el que responde; el genérico `asset_invalid_input_detail` de `es.json` taparía cualquier detail propio.
- `ownEquipmentFeeDefault` sale de `getEffective(businessUnitIds[0])`: el alcance de la ficha es UNA empresa (la del header) y el colaborador está dentro, así que ese es su empresa; con alcance vacío la matriz ni se arma.
- "Con evidencia/Sin evidencia" NO se pinta en el histórico del BO: el DTO no viaja con la llave del archivo (§11) y el §12 lo condiciona a que el DTO la traiga.
- El manual de QA (Tarea 9) se **entrega**: el recorrido lo hace el usuario; nada de Playwright sin permiso explícito. El sembrador `_tmp_do_not_commit_qa_seeder.ts` NO se commitea.
- No se crea PR ni se despliega: eso lo levanta el equipo (Wilvardo) por su cuenta.