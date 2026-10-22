# Invalidar la Lista de Verificación vigente al cambiar el domicilio de teletrabajo (VLRH-H1791306078668) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-KILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `POST`, `PUT` y `DELETE` de `/api/nom037/telework-locations` dejen invalidada, en la misma transacción que guarda el lugar, la Lista de Verificación vigente del colaborador cuando el cambio toca el lugar que la lista verificó (o su fijo pactado de referencia), con el motivo `cambio_de_domicilio`, fecha y autor; y que la respuesta informe si esa petición invalidó (`data.teleworkChecklistInvalidated`). Sin migración, estado, ruta ni validator nuevos.

**Architecture:** El dominio de lugares sigue plano (`app/services/`, `app/controllers/`, `app/utils/`) y la lista vive en su slice `app/modules/telework-checklist/`; cada quien en su casa. La decisión "¿este cambio invalida?" es una **regla pura** en `app/utils/telework_location_change.ts` (normalización de los 8 campos sobre `normalizeForSearch` + matriz `shouldInvalidateTeleworkChecklist`), testeable sin BD. El servicio de lugares recibe por constructor `Pick<TeleworkChecklistService, 'findCurrentEffective' | 'invalidateCurrent'>` (default `new TeleworkChecklistService()`) y envuelve create/update/softDelete en **un solo** `db.transaction` con el orden de candados de `#register`: empleado (`lockEmployeeRow`) → lugar (`forUpdate`) → lista; el "antes" del lugar se captura **dentro** del trx y **antes** de `applyPayload`. `invalidateCurrent` se reutiliza tal cual (no se reimplanta el candado ni la materialización de `vencida`); solo se agrega `findCurrentEffective` al servicio de la lista. El controller es el único consumidor de lugares y sigue instanciando con `new` (sin punto de inyección).

**Tech Stack:** AdonisJS 6 + VineJS + Lucid/MySQL (`SoftDeletes` en el lugar) + luxon + Japa sobre `sae_pruebas`. Solo `gsti-rh-api` (= repo local `valanserh-api`): el aviso en pantalla es de `VLRH-H1792680264800` y el BO no recibe ni un commit.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791306078668.md` y su anexo `/Users/noeabelvargaslopez/Downloads/anexo-A-casos-de-decision.md` (versión viva en `04-gsti/03-valanserh/02-plannings/00-docs-hu/VLRH-H1791306078668/`). El plan argumenta desde el spec: el ejecutor lee **ambos**, y la matriz de los 24 casos del anexo es la fuente de los tests. Reglas de negocio, contrato de API y censo se copian **verbatim** del spec, no se improvisan.

**Rama y anclas revalidadas el 2026-10-22** contra la rama de la HU (`feature/VLRH-H1791306078668-invalidar-la-lista-de-verificacion-vigente-al`, limpia y a la par de `multitenant` local `01425ebe`), **sin ningún commit propio: la HU no ha arrancado y el plan parte de cero.** Coinciden todas las anclas del spec (validadas una por una): `invalidateCurrent` en `app/modules/telework-checklist/telework_checklist.service.ts:183-232` con la firma exacta de §9 y el constructor con `Pick<...>` en `:52-65`; `findCurrentPersisted` (`telework_checklist.repository.mysql.ts:140-156`) y `lockEmployeeRow` (`:198-210`, `SELECT ... FOR UPDATE`, exige `trx`); `assertScopeResolved:345`, `today():414`, `isCurrentEffective:424` (privados); `buildErrorResponse` con su `default` a 500 `TWL.SYS.001` en `app/controllers/employee_telework_location_controller.ts:18-72` y `new EmployeeTeleworkLocationService()` en `:114,157,213,267` (el `destroy` de `:267` hoy **sin** `try`); `applyPayload` llamado desde `update` en `app/services/employee_telework_location_service.ts:165`; `unsetOtherFixedLocations` **sin** filtro de empresa; `normalizeForSearch` en `app/utils/org_alias_normalize.ts:15-21`; `TELEWORK_CHECKLIST_APPLICATION_STATUS.INVALIDATED = 'invalidada'` y `TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE = 'cambio_de_domicilio'` en `app/constants/telework_checklist.ts:32,69-74`; `TWL.VAL.001`/`TWL.VAL.GATING.001`/`TWL.NF.EMP.001`/`TWL.NF.LOC.001`/`TWL.SYS.001` en `app/constants/employee_telework_location_error_codes.ts:11-23`; rutas `start/routes/nom037_routes.ts:62-67`; i18n `telework_location_title` (`es.json:3160`), `telework_location_unexpected_error` (`es.json:3170`, `en.json:3167`); el caso `invalidateCurrent` en `tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts:631-689` en verde; molde de fixtures `tests/functional/telework_checklist.spec.ts:146-222`; molde de stub de prototipo `tests/functional/assets_own_equipment_evidence.spec.ts:550,632`; candados de prueba en `tests/helpers/lock_wait.ts` (`lockHolderOf`, `waitForLockWaitOn`, molde `tests/functional/org_chart_relocate_drags_employees.spec.ts:435-462`). **Cero drift**: nada que escalar a Wilvardo.

**Líneas base medidas el 2026-10-22** (rama de la HU, `sae_pruebas` al día con `migration:fresh --seed`):

- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="constants/"` → **156 passed (156), 0 failed** (esta HU no toca catálogo: el número no debe moverse).
- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework_checklist.service.spec.ts"` → **13 passed (13)**, incluido el caso `:631-689` que CA-19 exige intacto.
- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_checklist.spec.ts"` → **19 passed (19)**.
- `npm run typecheck` → **exit 0**; `npx eslint app/services/employee_telework_location_service.ts app/controllers/employee_telework_location_controller.ts app/modules/telework-checklist app/utils/org_alias_normalize.ts` → **0 problemas**.
- `git diff --name-only multitenant...HEAD` → **vacío**.

**Dónde va la documentación:** este plan y el manual de QA en `gsti-rh-api/docs/superpowers/plans/` (directorio **versionado**). El sembrador de QA (`database/seeders/_tmp_do_not_commit_qa_seeder.ts`) está en `.git/info/exclude` (verificado): **no se commitea jamás** ni con `git add -f`.

## Restricciones globales

- **Rama y commits:** Conventional Commits, descripción en español en imperativo, cuerpo con el porqué y footer `Refs: VLRH-H1791306078668`. El plan **no** abre PR ni despliega (proceso aparte, de Wilvardo): termina en la verificación automatizada y en la **entrega** del manual de QA, que recorre una persona.
- **BD de pruebas:** `sae_pruebas`; antes de cada tanda que toque BD, `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (los comandos `ace` de migración **no** fijan `NODE_ENV` por sí solos; `node ace test` sí). Nunca contra la BD de desarrollo ni dos migraciones a la vez (`GET_LOCK`).
- **Sin nada nuevo de infraestructura:** sin migración, seeder, modelo, estado, motivo, ruta ni validator. `invalidada`, `cambio_de_domicilio`, las columnas `invalidated_*`, la FK `employee_telework_location_id` (nullable `RESTRICT`) y la baja lógica ya existen. **Sin códigos de error nuevos**: el 500 usa `TWL.SYS.001`; 404/422/400 como hoy.
- **Frontera de la HU (filas `no-tocado` del censo §14):** no se tocan `app/utils/org_alias_normalize.ts` (tiene consumidores en otros dominios), `app/modules/telework-checklist/telework_checklist.repository.mysql.ts` ni `telework_checklist.repository.ts`, `app/constants/employee_telework_location_error_codes.ts`, `app/constants/telework_checklist.ts`, `resources/langs/es.json`/`en.json` (se reutilizan `telework_location_title` y `telework_location_unexpected_error`), `start/routes/nom037_routes.ts`, `app/helpers/compliance_repse_rbac.ts` (sin gate de permiso: riesgo aceptado, HU aparte), `app/constants/system_modules_menu/**`, `database/**`, ni **ningún** archivo de `valanserh-bo` (repo local `valanserh-landlord`, hoy en una rama ajena: no se toca).
- **Sin gate de permiso (riesgo aceptado, decisión de Wilvardo 2026-10-22):** las tres rutas siguen solo `auth()` + `businessScope()`. No se agregan seeders de permiso, middlewares ni entradas en `rutas_sensibles`.
- **Anti-IDOR:** `businessUnitId` y `employeeId` para la lista salen **solo de la fila ya filtrada por alcance** (empleado de `resolveTeleworker`, lugar de `findInScope`), nunca de body/query/params/header; un id ajeno responde 404 **antes** de abrir el trx. Los validators no declaran `businessUnitId` ni actor (VineJS descarta lo no declarado). `unsetOtherFixedLocations` agrega `.where('business_unit_id', ...)`.
- **Atomicidad y candados (§7):** un solo trx envuelve candado del empleado, captura del "antes", escritura del lugar, desmarcado de fijos e invalidación. Orden **empleado → lugar → lista** (igual que `#register`, sin deadlock). El "antes" se captura tras el candado y antes de `applyPayload`. Cualquier excepción revierte todo y RH recibe el 500 con la forma viva.
- **Datos personales (LFPDPPP):** prohibido registrar payload, calle, número, colonia, ciudad, estado, país, código postal, diff antes/después o `err.message` (un error de MySQL puede citar valores del domicilio y `config/logger.ts` no lo redacta). `logger.error` solo con ids (`employeeId`, `locationId`, `businessUnitId`) y nombre/código del error. La comparación normalizada no se persiste ni se loguea. Cero `console.log`.
- **Firmas intactas:** `invalidateCurrent`, `findCurrentPersisted` y `lockEmployeeRow` no cambian (`VLRH-H1791311161420` edita los mismos archivos: quien integre segundo resuelve el conflicto textual sin tocar firmas). No se reimplementa `isCurrentEffective` ni la materialización de `vencida`.
- **Stub en tests funcionales:** se stubbea `TeleworkChecklistService.prototype.invalidateCurrent` (guardar original, restaurar en `finally`) — molde `assets_own_equipment_evidence.spec.ts:550,632` —; el repo **no** usa `app.container.swap`. El controller sigue con `new EmployeeTeleworkLocationService()` sin argumentos.
- **Idioma y tipos:** identificadores en inglés, comentarios y JSDoc en español; TS estricto, **cero `any`**; fechas de calendario en CDMX. El hook de commit solo corre eslint (nunca `prettier --write` sobre archivos ajenos).
- **Manual de QA:** único, de **API** (esta HU no trae pantalla), último entregable y **solo se ENTREGA** (el recorrido lo hace una persona). Sus reglas viven en `~/.agents/rules/manual-qa/manual-qa-api.md` y `manual-qa-execution.md`; se redacta con la skill `manual-qa` cargada.

## Review Focus

Entradas o condiciones que el spec implica y ningún criterio de aceptación ejercita por sí solo, y que por eso son las más propensas a morder. Cada línea lleva su prueba en la tarea dueña del código.

1. **País omitido en el `PUT`:** `employeeTeleworkLocationCountry` es opcional en el validador y `applyPayload` reescribe el default `'México'` (`:188`) — un lugar guardado con otro país y un `PUT` que "no toca el país" **sí** lo cambia, y con esta HU eso invalida la lista. Comportamiento preexistente que la HU vuelve visible: se pinnera tal cual. Prueba en **Task 3** (unit del servicio: lugar con país `'España'`, `PUT` sin `country` → el país queda `'México'` y `teleworkChecklistInvalidated = true`).
2. **Lista ligada a un lugar de OTRO colaborador (dato anómalo o carrera residual de `#register`, que valida el lugar fuera de su trx):** la resolución de la referencia filtra el lugar por colaborador además de empresa; un id que apunte a un lugar vivo ajeno cae a la referencia fija, nunca compara contra un domicilio ajeno. Prueba en **Task 3** (unit: lista ligada por SQL a lugar vivo de otro colaborador → la referencia es el fijo, y decide como CA-07).
3. **Más de un fijo activo previo (dato previo, porque el desmarcado corría fuera de transacción):** la referencia fija es el de `employee_telework_location_created_at` más reciente (desempate por id mayor), y editar el fijo **viejo** con domicilio distinto también invalida (la fórmula `fixed/update` con `before.id !== R.id` no exime al fijo no referenciado). Prueba en **Task 3** (unit: dos fijos activos sembrados por tabla → `PUT` al más reciente invalida; `PUT` al viejo con domicilio distinto también).
4. **`PUT` sobre un lugar ya dado de baja:** CA-16 solo repite el `DELETE` (404); el `PUT` tras la baja no está pinchado y pasa por el mismo releer-con-`forUpdate`. Prueba en **Task 4** (funcional: `PUT` a un lugar dado de baja → 404 `lugar-no-encontrado` `TWL.NF.LOC.001`, sin invalidar nada).
5. **Miembro de dos empresas con el header de una:** el alcance es **solo** la empresa del header (`business_unit_scope_middleware.ts:129` fija `ctx.businessUnitScope = [requestedId]`), así que un `POST` con `X-Business-Unit-Id` de A y `employeeId` de B responde 404 `empleado-no-encontrado` (`TWL.NF.EMP.001`) y **no** toca la lista de B, aunque la cuenta tenga membresía en B. Prueba en **Task 4** (funcional: actor miembro de A y B, `POST` con header de A y `employeeId` de B → 404 y la lista de B sigue `vigente`). Ruling del controlador (2026-10-22): la propiedad «la empresa de la lista sale de la fila del empleado, no del header» no es ejercitable por HTTP hoy —ninguna ruta entrega un `scope` multiempresa—; el spec §13 manda fail-closed con el alcance resuelto, y el plan corrigió esta línea en el commit de docs posterior a la Task 4.

---

### Task 1: Helper puro de cambio de domicilio (`app/utils/telework_location_change.ts`)

**Files:**
- Create: `app/utils/telework_location_change.ts` (en `app/utils/`, **no** en `app/helpers/`, que concentra los `*_api_error.ts`)
- Test: `tests/unit/utils/telework_location_change.spec.ts`

**Interfaces:**
- Consumes: `normalizeForSearch` de `app/utils/org_alias_normalize.ts:15-21` (**sin modificarla**: trim + NFD sin marcas + minúsculas; `ñ` cae a `n` por la descomposición). Modelo `EmployeeTeleworkLocation` solo como **tipo** (`import type`), sin boot de modelo.
- Produces (todo lo que Task 3 consume, nombres exactos):

```ts
export interface TeleworkAddress {
  street: string
  externalNumber: string
  internalNumber: string
  settlement: string
  city: string
  state: string
  country: string
  zipcode: string
}
export interface TeleworkLocationSnapshot {
  locationId: number
  isFixedAgreed: boolean
  address: TeleworkAddress
}
export interface TeleworkLocationReference {
  kind: 'linked' | 'fixed'
  location: TeleworkLocationSnapshot | null  // en 'fixed' puede ser null (sin fijo)
}
export type TeleworkLocationChange =
  | { operation: 'create'; after: TeleworkLocationSnapshot }
  | { operation: 'update'; before: TeleworkLocationSnapshot; after: TeleworkLocationSnapshot }
  | { operation: 'softDelete'; before: TeleworkLocationSnapshot }
export function normalizeTeleworkAddressField(value: string | null | undefined): string
export function isSameTeleworkAddress(a: TeleworkAddress, b: TeleworkAddress): boolean
export function toTeleworkLocationSnapshot(location: EmployeeTeleworkLocation): TeleworkLocationSnapshot
export function shouldInvalidateTeleworkChecklist(
  reference: TeleworkLocationReference,
  change: TeleworkLocationChange
): boolean
```

- [ ] **Step 1: Escribir los tests que fallan (matriz de los casos 1 a 20 del anexo A + normalización)**

Suite **sin BD**. Dos grupos:

(a) **Normalización y comparación** (`normalizeTeleworkAddressField` / `isSameTeleworkAddress`), assertions exactas:
- `normalizeTeleworkAddressField('  Av.   Juárez\t15 ')` === `'av. juarez 15'` (trim, minúsculas, acentos fuera, tab y espacios repetidos colapsados a uno).
- `normalizeTeleworkAddressField('Av.\u00A0Juárez')` === `'av. juarez'` (NBSP cuenta como espacio).
- `normalizeTeleworkAddressField('Peña')` === `normalizeTeleworkAddressField('Pena')` === `'pena'` (ñ ≈ n).
- `normalizeTeleworkAddressField(null) === normalizeTeleworkAddressField(undefined) === normalizeTeleworkAddressField('') === ''` (vacío es igual a sin dato).
- `isSameTeleworkAddress`: cierto con las dos direcciones cosméticamente distintas (`'Av. Juárez  15'` vs `'av. juarez 15'`, `internalNumber null` vs `''`); falso cuando **cualquiera** de los 8 campos difiere de verdad (un test por campo, 8 tests, p. ej. solo `zipcode` distinto).
- `toTeleworkLocationSnapshot`: de una instancia fake del modelo (objeto tipado con los campos `employeeTeleworkLocation*`, null en los nullable) → snapshot con los 8 campos `?? ''`, `locationId` e `isFixedAgreed` correctos.

(b) **Matriz de la regla** — los casos 1 a 20 del anexo A, un test por fila, nombrado `caso N — <operación>` con su esperado (`si`/`no`). Builders locales: `snap(id, fixed, overrides)` (dirección base: `street: 'Av. Juárez'`, `externalNumber: '15'`, `internalNumber: null`, `settlement: 'Centro'`, `city: 'Ciudad de México'`, `state: 'Ciudad de México'`, `country: 'México'`, `zipcode: '06600'`), `linked(L)`, `fixed(F | null)`, `chgCreate(after)`, `chgUpdate(before, after)`, `chgDelete(before)`. Ejemplo de dos filas para fijar el estilo:

```ts
// Caso 1 (con lugar L): PUT a L cambiando cualquiera de los 8 campos → si
const L = snap(10, false)
assert.isTrue(shouldInvalidateTeleworkChecklist(
  linked(L), chgUpdate(L, snap(10, false, { street: 'Calle Reforma' }))))
// Caso 2 (regla 7): PUT a L cambiando solo mayúsculas/acentos/espacios → no
// (ruido cosmético POR CAMPO: la calle y el número siguen siendo los mismos)
assert.isFalse(shouldInvalidateTeleworkChecklist(
  linked(L), chgUpdate(L, snap(10, false, { street: '  AV. JUAREZ ', externalNumber: ' 15 ' }))))
```

El resto sale de la tabla del anexo (la referencia y el change de cada fila); los casos 8/9/16 usan un domicilio que **normaliza igual** (misma calle y número con ruido cosmético: `'Av. Juárez'`/`'15'` frente a `'av. juarez'`/`'15'` — nunca un valor que agregue o quite texto real), el 18 es `fixed(null)` con `chgCreate(snap(11, true))`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework_location_change.spec.ts"`
Expected: FAIL — no existe el módulo (`Cannot find module '#utils/telework_location_change'`).

- [ ] **Step 3: Implementar el helper en `app/utils/telework_location_change.ts`**

`normalizeTeleworkAddressField = (v) => normalizeForSearch(v ?? '').replace(/\s+/g, ' ')`; `isSameTeleworkAddress` compara los 8 campos normalizados; `toTeleworkLocationSnapshot` mapea el modelo (campos `?? ''`). La regla es el algoritmo de §7 del spec, que los tests de la matriz no determinan solos (se copia tal cual; `R` = `reference.location`, `same` = `isSameTeleworkAddress`; en `linked` la referencia siempre trae snapshot — quien la construye ya filtró el lugar vivo):

```
linked:  create     -> after.isFixed && !same(after.address, R.address)
         update     -> before.locationId === R.locationId ? !same(before.address, after.address)
                       : !before.isFixedAgreed && after.isFixedAgreed && !same(after.address, R.address)
         softDelete -> before.locationId === R.locationId
fixed:   create     -> after.isFixedAgreed && R !== null && !same(after.address, R.address)
         update     -> (R !== null && before.locationId === R.locationId)
                       ? (!after.isFixedAgreed || !same(before.address, after.address))
                       : (after.isFixedAgreed && R !== null && !same(after.address, R.address))
         softDelete -> R !== null && before.locationId === R.locationId
```

JSDoc en español citando las reglas 1-7 de la HU y la decisión (Wilvardo, 2026-10-22). Un archivo nuevo, sin editar `org_alias_normalize.ts`.

- [ ] **Step 4: Correr y verificar en verde**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework_location_change.spec.ts"`
Expected: PASS (los 8 tests por campo + normalización + los 20 de la matriz).

- [ ] **Step 5: Commit**

```bash
git add app/utils/telework_location_change.ts tests/unit/utils/telework_location_change.spec.ts
git commit -m "feat: regla pura que decide si un cambio de lugar invalida la lista

Normaliza los 8 campos del domicilio sobre normalizeForSearch (mayusculas,
acentos, ñ y espacios no cuentan) y decide con la matriz de los 24 casos
de decision del anexo A, para que el servicio de lugares solo tenga que
llamarla. Refs: VLRH-H1791306078668"
```

---

### Task 2: `findCurrentEffective` — la vigente efectiva y su lugar, dentro del trx

**Files:**
- Modify: `app/modules/telework-checklist/dto/telework_checklist.dto.ts` (tipo nuevo al final, tras `EmployeeApplicationsDto`)
- Modify: `app/modules/telework-checklist/telework_checklist.service.ts` (método nuevo inmediatamente después de `invalidateCurrent`, hoy termina en `:232`)
- Test: `tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts` (**agregar** casos; el caso `:631-689` queda **intacto y en verde**)

**Interfaces:**
- Consumes: `assertScopeResolved` (`:345`), `lockEmployeeRow` (`repository.mysql.ts:198-210`, **exige** `trx`), `findCurrentPersisted` (`:140-156`, solo ve `vigente`), `isCurrentEffective` (`:424`, privado) y `today()` (`:414`), tal cual están.
- Produces:

```ts
// dto/telework_checklist.dto.ts
export interface CurrentApplicationLocationRef {
  applicationId: number
  teleworkLocationId: number | null
}
// telework_checklist.service.ts
async findCurrentEffective(
  businessUnitId: number,
  employeeId: number,
  trx: TransactionClientContract
): Promise<CurrentApplicationLocationRef | null>
```

Cuerpo: `assertScopeResolved(bu)` → `lockEmployeeRow(bu, emp, trx)` → `findCurrentPersisted(bu, emp, trx)` → `null` si no hay fila o `!isCurrentEffective(current, today())` → `{ applicationId: current.applicationId, teleworkLocationId: current.teleworkLocationId }`. **No materializa `vencida`.** `trx` obligatorio (quien lo llama ya abrió la transacción y tomó el candado en el orden correcto).

- [ ] **Step 1: Escribir los tests que fallan (4 casos, con los fixtures existentes del spec)**

Con los fixtures del archivo (`buildVisit`, `registerVisit`, lugar vivo/muerto, `forceExpiresAt`), dentro de `db.transaction`:

1. **Con vigente ligada a lugar vivo** → `{ applicationId, teleworkLocationId }` con el id del lugar pasado al `registerVisit`.
2. **Con vigente sin lugar** (`teleworkLocationId: null`) → reflete el `null`.
3. **Vigente persistida ya vencida por fecha** (`forceExpiresAt(..., ayer)`) → `null` y la fila **sigue** `vigente` en la BD (no materializa `vencida`).
4. **Sin lista** → `null`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework_checklist.service.spec.ts"`
Expected: FAIL — `service.findCurrentEffective is not a function` (los 13 existentes siguen en verde).

- [ ] **Step 3: Implementar el tipo y el método**

Como dice el bloque Interfaces. Sin tocar `invalidateCurrent`, ni el repositorio, ni `getCurrentByEmployee`/`detail`.

- [ ] **Step 4: Correr y verificar en verde (y el caso histórico intacto)**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework_checklist.service.spec.ts"`
Expected: PASS — los 13 preexistentes (incluido `:631-689`, sin ediciones) + los 4 nuevos.

- [ ] **Step 5: Commit**

```bash
git add app/modules/telework-checklist/dto/telework_checklist.dto.ts app/modules/telework-checklist/telework_checklist.service.ts tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts
git commit -m "feat: exponer la lista vigente efectiva con su lugar dentro del trx

findCurrentEffective toma el candado del colaborador y devuelve la vigente
que no ha vencido con el lugar que verifico, sin materializar vencida,
para que el servicio de lugares decida la invalidacion en su propia
transaccion. Refs: VLRH-H1791306078668"
```

---

### Task 3: Servicio de lugares — transacción, actor, puerto de la lista y campo de resultado

**Files:**
- Modify: `app/services/employee_telework_location_service.ts`
- Modify: `app/controllers/employee_telework_location_controller.ts` (**solo** los call sites de `:157,213,267`: agregar `auth` al destructuring y pasar `auth.user!.userId` como 4° argumento — el campo en `data`, los `catch` y el Swagger son de Task 4; este ajuste es el mínimo para que la rama siga compilando en verde)
- Test: Create `tests/unit/services/employee_telework_location_service.spec.ts` (suite unit con BD, molde de fixtures de `telework_checklist.service.spec.ts`)

**Interfaces:**
- Consumes: Task 1 (helper completo, nombres exactos del bloque de Task 1); Task 2 `findCurrentEffective`; `invalidateCurrent` (`:183-232`, **firma intacta**, con `trx`); `TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE`; patrones de transacción `db.transaction` + `useTransaction(trx)` / `query({ client: trx })` de `empresa_contratante_service.ts:263` y `system_setting_service.ts:539`.
- Produces (lo que Task 4 consume):

```ts
// TeleworkLocationResult gana:
teleworkChecklistInvalidated?: boolean   // presente en TODO ok:true de las tres operaciones
// Firmas nuevas (scope y actorUserId van al final):
async create(employeeId: number, payload: TeleworkLocationPayload, scope: number[], actorUserId: number): Promise<TeleworkLocationResult>
async update(locationId: number, payload: TeleworkLocationPayload, scope: number[], actorUserId: number): Promise<TeleworkLocationResult>
async softDelete(locationId: number, scope: number[], actorUserId: number): Promise<TeleworkLocationResult>
// Constructor con puerto y default (no rompe a nadie: el controller usa new sin argumentos):
constructor(
  checklist: Pick<TeleworkChecklistService, 'findCurrentEffective' | 'invalidateCurrent'> = new TeleworkChecklistService()
)
// Privados nuevos/ajustados:
private async findActiveFixedLocation(businessUnitId: number, employeeId: number, trx: TransactionClientContract): Promise<EmployeeTeleworkLocation | null>
private async unsetOtherFixedLocations(fixed: EmployeeTeleworkLocation, trx: TransactionClientContract): Promise<void>
```

`findActiveFixedLocation`: `query({ client: trx })`, mismo empleado y empresa, `is_fixed_agreed = true`, activo, sin `deleted_at`, `.orderBy('employee_telework_location_created_at', 'desc').orderBy('employee_telework_location_id', 'desc')`, `first` (regla del anexo para más de un fijo activo). `unsetOtherFixedLocations` agrega `.where('business_unit_id', fixed.businessUnitId)` y corre con `query({ client: trx })`.

- [ ] **Step 1: Escribir los tests que fallan**

Fixtures (molde del spec de la lista): empresas A/B, teletrabajador híbrido, lugares insertados por tabla, vigente sembrada con `TeleworkChecklistService#registerVisit`. El servicio bajo prueba se construye con `new EmployeeTeleworkLocationService(new TeleworkChecklistService())` (puerto real) salvo donde se pide puerto falso. Casos:

1. **Atomicidad con puerto que lanza (mitad unit de CA-12):** vigente ligada a L; puerto = instancia real con `invalidateCurrent` sobrescrito para lanzar; `update(L, calle nueva, scope, actor)` → rechaza; tras el fallo la calle de L es la original, el fijo que L tenía (o el desmarcado) sigue igual, la lista sigue `vigente` y no quedó nada a medias.
2. **Actor intacto al puerto (CA-13):** puerto espía registra los argumentos; `create`/`update`/`softDelete` que invalidan pasan como 4° argumento de `invalidateCurrent` exactamente el `actorUserId` recibido.
3. **Lugar ligado muerto (CA-10):** vigente ligada a un lugar ya dado de baja → la referencia cae al fijo activo y decide igual que CA-07 (cambiar el domicilio del fijo invalida).
4. **RF1 país omitido:** lugar guardado con país `'España'`; `PUT` sin `employeeTeleworkLocationCountry` → el país queda `'México'` y `teleworkChecklistInvalidated = true`.
5. **RF2 lugar ligado ajeno:** lista ligada por SQL a un lugar vivo de **otro** colaborador → la referencia es el fijo del colaborador (cambiar el fijo invalida; nunca compara contra el lugar ajeno).
6. **RF3 dos fijos activos previos:** dos fijos insertados por tabla → `PUT` al más reciente invalida; `PUT` al fijo viejo con domicilio distinto **también** invalida (fórmula `fixed/update` con `before.id !== R.id`).
7. **Camino frío:** `create` de un lugar no fijo (coworking) con vigente ligada → `ok: true` con `teleworkChecklistInvalidated: false` y la lista sigue `vigente`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="employee_telework_location_service.spec.ts"`
Expected: FAIL — la firma actual no acepta `actorUserId` ni devuelve `teleworkChecklistInvalidated` (TS del spec nuevo + `undefined` en las assertions).

- [ ] **Step 3: Implementar el flujo transaccional**

Constructor con puerto (arriba). Las tres operaciones:

1. **Fuera del trx:** resolución de alcance como hoy — `resolveTeleworker` en `create`, `findInScope` en `update`/`softDelete`; si falla, `{ ok: false, code }` **sin abrir trx**.
2. **`db.transaction(async (trx) => { ... })`**, en orden:
   (a) `V = await this.checklist.findCurrentEffective(bu, employeeId, trx)` — toma el candado del empleado primero (mismo orden que `#register`, sin deadlock);
   (b) en `update`/`softDelete`, releer el lugar con `query({ client: trx }).forUpdate()` filtrado por scope; si ya no existe → `{ ok: false, code: LOCATION_NOT_FOUND }` (la excepción revierte el trx); capturar `before = toTeleworkLocationSnapshot(location)` **antes** de `applyPayload`;
   (c) resolver la referencia: si `V` no es `null` y `V.teleworkLocationId` apunta a un lugar **vivo del mismo colaborador y empresa** (activo, sin `deleted_at`) → `{ kind: 'linked', location: snapshot }`; si no → `{ kind: 'fixed', location: findActiveFixedLocation(...) }` (o `null`);
   (d) escribir el lugar dentro del trx (`useTransaction(trx)` + `save()`; `softDelete`: `active = false` + `delete()` que pone `deleted_at` por `SoftDeletes`), capturar `after` en create/update;
   (e) si el lugar quedó fijo → `unsetOtherFixedLocations(location, trx)`;
   (f) armar el `change` (`create` → `{ operation: 'create', after }`; `update` → `{ operation: 'update', before, after }`; `softDelete` → `{ operation: 'softDelete', before }`) y, **solo si `V !== null`**, evaluar `shouldInvalidateTeleworkChecklist(reference, change)`; si da `true` → `dto = await this.checklist.invalidateCurrent(bu, employeeId, TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE, actorUserId, trx)` (reentrante, sin abrir su propio trx);
   (g) `{ ok: true, location, teleworkChecklistInvalidated: dto !== null }`.
3. Cualquier excepción deja que `db.transaction` revierta todo. Y en el controller, solo pasar `auth.user!.userId` en los tres call sites (Task 4 termina el contrato HTTP).

`businessUnitId` siempre sale de la fila (`resolution.employee.businessUnitId` / la del lugar releído), nunca del body. Sin `logger` en el servicio (el 500 lo arma el controller en Task 4).

- [ ] **Step 4: Correr y verificar en verde**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="employee_telework_location_service.spec.ts"` → PASS.
Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework_checklist.service.spec.ts"` → PASS (regresión, sin ediciones en esta task).
Run: `npm run typecheck` → exit 0 (call sites del controller ajustados).
Run: `npx eslint app/services/employee_telework_location_service.ts app/controllers/employee_telework_location_controller.ts` → 0 problemas.

- [ ] **Step 5: Commit**

```bash
git add app/services/employee_telework_location_service.ts app/controllers/employee_telework_location_controller.ts tests/unit/services/employee_telework_location_service.spec.ts
git commit -m "feat: invalidar la lista vigente al guardar un cambio de lugar

El servicio de lugares envuelve create/update/softDelete en un solo trx
con el candado del empleado primero, captura el antes del lugar con
forUpdate, resuelve la referencia (verificado vivo o fijo pactado) y
llama a invalidateCurrent con el actor de la sesion. La respuesta informa
si la peticion invalido. Refs: VLRH-H1791306078668"
```

---

### Task 4: Controller — contrato de respuesta, 500 con `logger.error` y matriz HTTP funcional

**Files:**
- Modify: `app/controllers/employee_telework_location_controller.ts` (`data` de las tres, `catch` a 500 en store/update, `try/catch` nuevo en destroy, `logger.error` solo con ids, Swagger JSDoc de los tres)
- Test: Create `tests/functional/employee_telework_location_invalidation.spec.ts`

**Interfaces:**
- Consumes: `TeleworkLocationResult.teleworkChecklistInvalidated` (Task 3); el `default` existente de `buildErrorResponse` (`:50-64`, ya responde 500 `TWL.SYS.001`); i18n `telework_location_title` (`es.json:3160`) y `telework_location_unexpected_error` (`es.json:3170`, `en.json:3167`); `logger` de `@adonisjs/core/services/logger` (molde `employee_controller.ts:76`).
- Produces (contrato §11, la forma viva — nada de `detail`):

```ts
// 201 (POST) y 200 (PUT, DELETE):
{ type: 'success', title: 'Lugar de teletrabajo', message: <created|updated|deleted>, data: { teleworkLocation, teleworkChecklistInvalidated: boolean } }
// 500 (cualquier excepción que no sea de validación):
{ type: 'error', title: 'Lugar de teletrabajo', message: 'Ocurrió un error inesperado al procesar el lugar de teletrabajo.', key: 'error-inesperado', code: 'TWL.SYS.001', data: null }
```

`teleworkChecklistInvalidated`: booleano **siempre presente** en 200/201, nunca en errores; `true` solo si esa petición pasó una lista de `vigente` a `invalidada`. `data` no expone id, estado ni fechas de la lista (CA-11).

- [ ] **Step 1: Escribir el funcional que falla (matriz HTTP, casos 1-5, 7-9, 11-16, 18, 19 y 21-24 del anexo)**

Fixtures copiando el molde de `tests/functional/telework_checklist.spec.ts:146-222`: `createBusinessUnit`, `insertEmployee` (dentro de `TenantContext.run`), `insertTeleworkLocation` **extendida** (calle/ciudad/fijo pactado parametrizables), vigente sembrada con `TeleworkChecklistService#registerVisit` (con y sin `teleworkLocationId`), actor `root` con `ensureRole`, `loginAs` y header `X-Business-Unit-Id` con el **UUID público** (`businessUnitPublicId`). Peticiones: `POST/PUT/DELETE /api/nom037/telework-locations[/:id]` con el payload de los validators (`employeeTeleworkLocation*`, `employeeId` solo en POST).

Matriz (un test por caso del anexo, `caso N — <operación>` en el nombre):
- **1** PUT cambia calle → 200, `data.teleworkChecklistInvalidated === true`, lista `invalidada` con motivo `cambio_de_domicilio`, `invalidated_at` no nulo, `invalidated_by_user_id` = `auth.user.userId`, respuestas intactas (mismo conteo de `telework_checklist_answers`).
- **2** PUT cosmético (`'Av. Juárez  15'`→`'av. juarez 15'`, `null`→`''`) → `false`, lista sigue `vigente`.
- **3** PUT cambia solo tipo/notas/internet/equipo → `false`, `vigente`.
- **4** DELETE de L → 200 `true`, lista `invalidada`, lugar con `active: 0` y fila viva (no borrada).
- **5** DELETE de otro lugar → `false`.
- **7** POST no fijo (coworking) → 201 `false`.
- **8/9** POST fijo con domicilio distinto → `true`; con el mismo normalizado que L → `false`.
- **11** PUT cambia domicilio del fijo F (lista sin lugar) → `true`.
- **12** PUT desmarca F como fijo → `true`.
- **13** DELETE de F → `true`.
- **14** POST de otro fijo con domicilio distinto (F queda desmarcado) → `true`.
- **15** PUT marca otro lugar como fijo (domicilio distinto) → `true`.
- **16** POST/PUT de fijo con el mismo domicilio normalizado que F → `false`.
- **18** sin lugar y sin fijo: POST del primer fijo → `false`.
- **19** PUT que marca el primer fijo → `false`.
- **21** sin vigente (nunca registrada, o persistida con `expires_at` adelantado por SQL) → cambio guarda normal, `false`, y la fila vencida **no** se materializa (sigue `vigente` persistida).
- **22** ya invalidada + nuevo cambio → `false`, `invalidated_at` y `invalidated_by_user_id` sin cambiar (conserva fecha y autor del primer cambio).
- **23** PUT/DELETE de lugar de la empresa B con cuenta A → 404 `{ key: 'lugar-no-encontrado', code: 'TWL.NF.LOC.001' }`, la lista de B sigue `vigente`.
- **24** POST con empleado de B → 404 `{ key: 'empleado-no-encontrado', code: 'TWL.NF.EMP.001' }`.

Más las del contrato y aislamiento: **CA-11** (el campo está presente y es booleano en 201/200 de las tres operaciones; `data` sin id/estado/fechas de la lista), **CA-13** (body con `actorUserId`/`invalidatedByUserId` cualquiera → `invalidated_by_user_id` es el de la sesión), **CA-15** (body con `businessUnitId` de B en un PUT de A → solo cambia A), **CA-16** (PUT repetido → `false` y `invalidated_at` sin cambiar; DELETE repetido → 404), **RF4** (PUT a un lugar ya dado de baja → 404 `TWL.NF.LOC.001`), **RF5** (actor con membresía en A y B: `POST` con header de A y `employeeId` de B → 404 `empleado-no-encontrado` `TWL.NF.EMP.001` y la lista de B sigue `vigente` — el alcance es solo la empresa del header, `business_unit_scope_middleware.ts:129`; ruling del controlador 2026-10-22).

- [ ] **Step 2: Correr y verificar que falla**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="employee_telework_location_invalidation.spec.ts"`
Expected: FAIL — `data.teleworkChecklistInvalidated` es `undefined` en las respuestas de éxito (el controller aún no lo expone).

- [ ] **Step 3: Implementar el controller**

- En los tres éxitos: `data: { teleworkLocation: result.location, teleworkChecklistInvalidated: result.teleworkChecklistInvalidated }`.
- `store`/`update`: el `catch` actual relanza lo que no es de Vine; cambiarlo por: `logger.error({ employeeId, locationId, businessUnitId, errorName }, '<mensaje estático en español>')` y responder el `default` de `buildErrorResponse` (500 `TWL.SYS.001`). `errorName = error instanceof Error ? error.name : 'desconocido'` — **nunca** `err.message` ni el payload. `destroy`: envolver en `try/catch` con el mismo cuerpo (hoy no tiene `try`).
- Swagger JSDoc de los tres métodos: documentar `teleworkChecklistInvalidated` en 201/200 y la 500 con `TWL.SYS.001`.
- Sin tocar rutas, validators ni i18n (claves reutilizadas).

- [ ] **Step 4: Correr y verificar en verde (con regresiones)**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="employee_telework_location_invalidation.spec.ts"` → PASS.
Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_checklist.spec.ts"` → **19 passed** (regresión, sin editar el archivo).
Run: `npm run typecheck` → exit 0.
Run: `npx eslint app/controllers/employee_telework_location_controller.ts tests/functional/employee_telework_location_invalidation.spec.ts` → 0 problemas.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/employee_telework_location_controller.ts tests/functional/employee_telework_location_invalidation.spec.ts
git commit -m "feat: informar si guardar un lugar invalido la lista vigente

Las tres operaciones responden data.teleworkChecklistInvalidated y
cualquier falla dentro del trx responde 500 error-inesperado con logger
de solo ids (el domicilio es dato personal y no se registra).
Refs: VLRH-H1791306078668"
```

---

### Task 5: Funcional parte 2 — rollback visible, serialización por candado y logs

**Files:**
- Modify: `tests/functional/employee_telework_location_invalidation.spec.ts` (agregar la segunda parte; si destapa algo de Task 3/4, se corrige ahí mismo y se re-corren las suites)

**Interfaces:**
- Consumes: `tests/helpers/lock_wait.ts` (`lockHolderOf`, `waitForLockWaitOn` — molde `tests/functional/org_chart_relocate_drags_employees.spec.ts:435-462`); el mecanismo de stub de prototipo con restauración en `finally` (`assets_own_equipment_evidence.spec.ts:550,632`); `logger` de `@adonisjs/core/services/logger`.
- Produces: la prueba de CA-12 (forma 500 + rollback), CA-17 (orden de candados sin deadlock) y CA-18 (logs sin domicilio) por HTTP.

- [ ] **Step 1: Escribir los tres tests (pueden heredar el escenario del archivo)**

1. **CA-12 funcional:** guardar `TeleworkChecklistService.prototype.invalidateCurrent` original, reemplazarlo por una función que lanza, hacer el `PUT` que invalida y **restaurar en `finally`**. Esperado: 500 con la forma exacta de §11 (`type: 'error'`, `title`, `message`, `key: 'error-inesperado'`, `code: 'TWL.SYS.001'`, `data: null`), la calle conserva el valor anterior, el fijo anterior sigue fijo y la lista sigue `vigente` (rollback total).
2. **CA-17:** con un trx de prueba que ya tomó `lockEmployeeRow` del colaborador (vía `db.transaction()` + `lockHolderOf`), disparar el `PUT` que cambia el domicilio **sin esperarlo**, confirmar con `waitForLockWaitOn(holder, 'employees', pending)` que el `PUT` quedó esperando el candado (marcador de orden escrito antes del commit, sin sleeps), hacer `commit`, esperar el `PUT` → 200 `true`, lista invalidada **una sola vez**, sin deadlock. En el `finally`: rollback si no está completado y esperar el pending.
3. **CA-18:** interceptar `logger.error` (guardar original, restaurar en `finally`), repetir el fallo del stub de CA-12 y registrar las llamadas: cada entrada lleva solo `employeeId`/`locationId`/`businessUnitId`/`errorName` y un mensaje estático — `JSON.stringify` de lo registrado **no** contiene la calle del fixture ni `err.message`.

- [ ] **Step 2: Correr; si algo del src quedó debiendo, corregirlo y re-correr**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="employee_telework_location_invalidation.spec.ts"`
Expected: PASS con las tres partes (matriz de Task 4 + estos tres). Si el 500 sale con otra forma o el logger registra domicilio/`message`, el fallo es del src de Task 3/4: se corrige y se re-corren **todas** las suites tocadas.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employee_telework_location_invalidation.spec.ts
git commit -m "test: rollback, serializacion por candado y logs sin domicilio

La mitad funcional de CA-12 (stub de prototipo restaurado en finally),
CA-17 (el PUT espera el candado del empleado y no hace deadlock) y CA-18
(logger.error solo con ids). Refs: VLRH-H1791306078668"
```

---

### Task 6: Manual de QA (entrega; lo recorre una persona)

**Files:**
- Create: `docs/superpowers/plans/2026-10-22-invalidar-la-lista-de-verificacion-vigente-al-cambiar-el-domicilio-de-teletrabajo-qa-api.md` (versionado)
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (**no versionado**: está en `.git/info/exclude`; jamás `git add -f`)

**Interfaces:**
- Consumes: las reglas `~/.agents/rules/manual-qa/manual-qa-api.md` y `~/.agents/rules/manual-qa/manual-qa-execution.md` (leídas con `read_file`, la copia viva — nunca de memoria) y la skill `manual-qa` cargada; el manual hermano `docs/superpowers/plans/2026-10-08-registrar-lista-verificacion-teletrabajo-qa-api.md` como molde de ambiente (URL base `http://127.0.0.1:3333`, login backoffice, header `X-Business-Unit-Id` con UUID público, sobre de respuesta); el bloque `QA Lista de verificación` del sembrador (`_tmp_do_not_commit_qa_seeder.ts:10161-10581`: empresas `qa-twc-empresa-a/b`, Pedro/Rosa/Bruno, lugares con calle propia, cuentas `qa-twc-{full,lector,none}@gsti-tests.local` y `qa-twc-empresa-b@gsti-tests.local`).
- Produces: **un solo** manual de API. Cada escenario con `Objetivo:` + endpoint + response exacto + «qué significa cada dato» (la primera vez, con los valores cerrados enumerados); tabla de usuarios con correos exactos y la contraseña literal del sembrador (copiada del bloque del manual hermano **sin imprimirla**; verificada contra el sembrador comparando hash/longitud, nunca el valor); sección de escenarios automatizados (lo no recorrible: 401, concurrencia real, el `UNIQUE` de BD, el 500 del rollback, la serialización del candado, los logs) con `Objetivo:` + `Qué pasó:` nombrando el caso del spec, y su checklist; casillas **vacías**; apartado de hallazgos de otras historias (o «Ninguno»).

- [ ] **Step 1: Leer la regla y el molde antes de redactar**

Las dos reglas de `~/.agents/rules/manual-qa/` y el manual hermano (constantes de ambiente y forma de escenario). Prohibido en el cuerpo: rutas de archivo, comandos que no sean el del sembrador, nombres de clases/servicios, lenguaje del backend. La única sección nueva permitida por escenario no recorrible es la de automatizados con su `Objetivo:`/`Qué pasó:`.

- [ ] **Step 2: Sembrar lo que falte de esta HU en el bloque compartido**

Revisar el bloque `QA Lista de verificación` (`:10161-10581`): esta HU necesita, para el recorrido, un colaborador con **dos** lugares (uno fijo pactado y uno secundario no fijo, para los casos 3/7) y un lugar **sin** lista vigente (caso 8). Agregar ahí solo lo que falte, idempotente y con datos sin acentos ni eñes, **sin commitear**. Correr una vez:

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files="database/seeders/_tmp_do_not_commit_qa_seeder.ts"
```

- [ ] **Step 3: Redactar el manual**

Estructura mínima: **Problema/Solución** + `Ejemplo:` cotidiano (la lista que se vuelve a pedir al mudarse) + glosario; **Preparar** (comando único del sembrador y estado que deja, resoluciones SQL de ids internos/públicos, token); **Login por producto**; **Usuarios** (tabla); escenarios — cada uno con `Objetivo:` y response exacto (status + cuerpo):

1. Registrar la lista vigente de Pedro sobre su lugar (molde del escenario 2 del manual hermano) y editar la calle del lugar → 200 con `teleworkChecklistInvalidated: true`; el historial muestra la lista `invalidada` con motivo `cambio_de_domicilio` y sus respuestas intactas.
2. Editar solo mayúsculas/acentos/espacios → `false`, lista sigue `vigente`.
3. Dar de baja el lugar verificado → `true`; el lugar queda inactivo y la lista invalidada.
4. Lista ligada: marcar **otro** lugar como fijo — distinto → `true`; mismo domicilio normalizado → `false`.
5. Lista sin lugar ligado: cambiar el domicilio del fijo, desmarcarlo, darlo de baja → `true`; primer fijo cuando no había → `false`.
6. Coworking secundario (POST no fijo) → `false`.
7. Sin lista vigente (o ya vencida): el cambio guarda normal, sin estado nuevo.
8. Segundo cambio tras invalidar → `false`, conserva fecha y autor.
9. Aislamiento: lugar/empleado de la empresa B → 404 con su `key`/`code`.

- [ ] **Step 4: Autocomprobar contra la regla**

Run: `f=docs/superpowers/plans/2026-10-22-invalidar-la-lista-de-verificacion-vigente-al-cambiar-el-domicilio-de-teletrabajo-qa-api.md; cm=$(grep -c '^### [0-9]*\.' "$f"); ob=$(grep -c '^Objetivo:' "$f"); echo "escenarios=$cm objetivos=$ob"`
Expected: escenarios = objetivos (más los de la sección automatizados, que también llevan `Objetivo:`).
Run: `grep -nE "app/|modules/|controllers|services|validators" "$f"` → solo la ruta del comando del sembrador si la regla la permite (ideal: 0).
Run: comparación de contraseña manual vs sembrador por script (hash/longitud, **sin imprimir el valor**) → coinciden; `grep -c "redacted" "$f"` → **0**.

- [ ] **Step 5: Entregar (no recorrer)**

El manual queda **entregado**; el recorrido lo hace la persona que lo pidió (regla de ejecución). El sembrador **no** se commitea (está en `.git/info/exclude`).

```bash
git add docs/superpowers/plans/2026-10-22-invalidar-la-lista-de-verificacion-vigente-al-cambiar-el-domicilio-de-teletrabajo-qa-api.md
git commit -m "docs: entrega el manual de QA de la invalidacion por cambio de domicilio

Refs: VLRH-H1791306078668"
```

---

## Verificación final (fuera de las tareas)

Al cerrar las seis tareas, en la rama `feature/VLRH-H1791306078668-invalidar-la-lista-de-verificacion-vigente-al` con `sae_pruebas` al día (`NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`):

- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test` **completo** → en verde (DoD §16); a falta de eso, las suites tocadas una por una: unit `telework_location_change.spec.ts`, unit `telework_checklist.service.spec.ts` (13 preexistentes + 4), unit `employee_telework_location_service.spec.ts`, functional `employee_telework_location_invalidation.spec.ts` (matriz + CA-12/17/18), functional `telework_checklist.spec.ts` → **19 passed sin editar el archivo**, unit `constants/` → **156 passed** (catálogo intacto).
- El caso `invalidateCurrent` (`telework_checklist.service.spec.ts:631-689`) en verde **sin ediciones**: `git diff multitenant...HEAD -- tests/unit/modules/telework-checklist/telework_checklist.service.spec.ts` solo agrega (cero líneas quitadas de ese rango).
- `npm run typecheck` → exit 0; `npx eslint app/utils/telework_location_change.ts app/services/employee_telework_location_service.ts app/controllers/employee_telework_location_controller.ts app/modules/telework-checklist tests/unit/utils/telework_location_change.spec.ts tests/unit/services/employee_telework_location_service.spec.ts tests/unit/modules/telework-checklist tests/functional/employee_telework_location_invalidation.spec.ts` → 0 problemas.
- **CA-19 (censo):** `git diff --name-only multitenant...HEAD` coincide **exactamente** con las filas `nuevo`/`editado` del censo §14 del spec: 5 de código (`app/utils/telework_location_change.ts`, `app/services/employee_telework_location_service.ts`, `app/controllers/employee_telework_location_controller.ts`, `app/modules/telework-checklist/telework_checklist.service.ts`, `app/modules/telework-checklist/dto/telework_checklist.dto.ts`) + 3 de prueba (`tests/unit/utils/telework_location_change.spec.ts`, `tests/unit/services/employee_telework_location_service.spec.ts`, `tests/functional/employee_telework_location_invalidation.spec.ts`) + 1 editado de prueba (`telework_checklist.service.spec.ts`) + el plan y el manual de QA. **Nada** bajo `database/` ni `start/routes/`; ninguna fila `no-tocado` aparece.
- **Frontera del BO:** esta HU no hace **ni un** commit en el repo del Backoffice (`valanserh-landlord`, hoy en una rama ajena que no se toca): CA-19 se cumple por ausencia.
- Swagger de los tres métodos actualizado (campo y 500) — visible en los JSDoc del controller.
- Puntos críticos revisados antes de cerrar (DoD §16): orden de candados empleado → lugar → lista; "antes" capturado tras el candado y antes de `applyPayload`; ningún log con domicilio ni `err.message`; `businessUnitId` solo de la fila; `normalizeForSearch` sin editar.
- El manual de QA queda **entregado**; el recorrido lo hace una persona. Ni PR ni deploy: el plan termina aquí.