# Editar y dar de baja a un empleado sin estructura — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquier empleado se pueda editar y dar de baja tenga o no departamento y puesto, sin que el guardado se los exija ni se los invente, y que al asignarle un departamento o un puesto distinto del que tiene guardado el sistema solo acepte los vigentes de la empresa del empleado, con un mensaje claro (nunca la pantalla de error general) cuando no se cumple.

**Architecture:** Hoy `PUT /api/employees/:id` exige departamento y puesto en dos capas —el validador de Vine (`min(1)` obligatorio) y `EmployeeService.verifyInfoExist`— y cualquier error de validación cae al `catch` como 500. El cambio deja el validador opcional y nulo para los dos campos, saca de `verifyInfoExist` el bloque de estructura (que solo el alta sigue usando) y agrega **una** pieza nueva, `EmployeeStructureService`, con dos responsabilidades pequeñas: una función pura que decide qué valor queda y qué hay que verificar (ausente = conservar, `null` = sin asignar, distinto del guardado o cambio de empresa = verificar) y una consulta que confirma que el id existe, no está eliminado y pertenece a la empresa del empleado. El controller la orquesta antes del nivel de puesto y traduce el rechazo a un 400 con mensaje único, anotando el intento en el log de accesos bloqueados que ya existe.

**Tech Stack:** AdonisJS 6 · Lucid · VineJS · TypeScript estricto · Japa (`node ace test`) · MySQL

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1788466831270-editar-empleado-sin-estructura` · **Target:** `multitenant`

**HU:** USRH1788466831270 — *Editar y dar de baja a un empleado aunque no tenga departamento ni puesto*

---

## Global Constraints

- **Regla 1.** Al editar, `departmentId` y `positionId` **no son obligatorios**. Editar cualquier otro dato o registrar la baja nunca exige asignarlos.
- **Regla 2.** Si la edición no cambia el departamento o el puesto, se conservan **exactamente** como estaban, incluso vacíos. El guardado nunca rellena con "Sin Departamento", "Sin posición" ni ningún otro valor. **El alta no cambia**: sigue con su relleno hasta USRH1789328927556.
- **Regla 3.** Un departamento o puesto **distinto del guardado** tiene que existir, no estar eliminado (`*_deleted_at IS NULL`) y pertenecer a la empresa del empleado: `business_unit_id` del empleado, **no** las empresas a las que tiene acceso quien captura. Si falla, se rechaza y el empleado conserva todo.
- **Regla 4.** "Cambió" se decide comparando con lo que el sistema tiene **guardado**, nunca con lo que envíe la pantalla. Reenviar el mismo id, aunque apunte a un departamento eliminado o al relleno de otra empresa, no bloquea.
- **Regla 5.** Si la misma edición cambia `businessUnitId`, departamento y puesto se revisan contra la empresa nueva aunque no cambien.
- **Regla 6.** El rechazo no distingue inexistente / eliminado / de otra empresa: mismo mensaje. Texto fijo de la HU: **"El departamento no existe en la empresa del empleado"** y **"El puesto no existe en la empresa del empleado"**.
- **Regla 7.** Un nivel de puesto solo se asigna si el empleado tiene puesto; si la edición no envía el puesto, cuenta el guardado. Lo aplica `EmployeePositionLevelService.assertAssignable` que ya existe: solo cambia qué `effectivePositionId` recibe.
- **Regla 8.** Todo rechazo de la edición por datos es un mensaje, **nunca** la pantalla de error general. El BO abre `error.vue` con cualquier status `>= 500` (`plugins/api-error-handler.client.ts`), así que un `E_VALIDATION_ERROR` en `update` tiene que salir como **400**, no como 500.
- **Regla 9.** Enviar `departmentId: null` o `positionId: null` deja al empleado sin asignar. No se agrega a la pantalla ni se prohíbe en el servidor.
- **Intentos rechazados.** Un id de departamento o puesto que no resuelve en la empresa del empleado se anota con `ScopeDeniedLogService.log` (qué id se pidió, quién lo pidió, scope), sin datos del empleado. Es el "registro de accesos bloqueados" de USRH1783372659486; no se crea otro.
- **Ausente vs `null`.** Convención ya establecida en este mismo controller para `positionLevelConfigId` y `dailySalary`: propiedad **ausente** = no tocar; **`null` explícito** = limpiar. Se aplica igual a `departmentId` y `positionId`. Se lee del payload **validado** (`data`), no de `request.input`, para que "ausente" sea exactamente "Vine no devolvió la clave".
- **Nada que mande la pantalla decide la empresa.** La empresa contra la que se verifica es `businessUnitId` del empleado tras la edición; el middleware `businessScope` ya garantiza que ese valor está en el alcance del usuario y lo inyecta desde el header cuando falta.
- **Sin migraciones ni catálogo.** No cambia el esquema (`employees.department_id` y `position_id` ya son `NULL`-ables desde `1741033244536_*` y `1741033268087_*`).
- **TypeScript estricto, cero `any` nuevo.** `npm run typecheck` y `npm run lint` limpios antes de cada commit.
- **Nada se borra.** Este plan no retira archivos. Si algo se retirara, va a `__TO_DELETE__/` conservando su ruta (regla del `CLAUDE.md`).
- **No commitear `pnpm-lock.yaml` ni `pnpm-workspace.yaml`.** Están modificados/sin seguimiento en el árbol de trabajo por causas ajenas a esta HU. Cada commit del plan lista sus archivos explícitamente; nunca `git add -A`.
- **Ubicar por nombre de función, no por número de línea.** Los números son del estado actual (archivos sin tocar) y sirven para orientarse; cada Task dice qué bloque buscar.

---

## Estado actual verificado

Todo lo de abajo se leyó contra el código el 2026-09-17.

### El camino de la edición y dónde exige estructura

`PUT /api/employees/:employeeId` → `EmployeeController.update` (`app/controllers/employee_controller.ts:1542`). En orden:

| Paso | Dónde | Qué hace hoy con la estructura |
|---|---|---|
| Arma el literal `employee` desde `request.input(...)` | `:1587-1613` | `departmentId` y `positionId` viajan crudos (`undefined` si no vienen). |
| Carga `currentEmployee` con `withTrashed()` | `:1622-1625` | Auto-acotado a la empresa del header por el mixin `withBusinessUnitScope`. |
| Baja: fecha + modalidad + tipo, permiso secundario si el registro cambia | `:1637-1704` | No mira la estructura. |
| `request.validateUsing(updateEmployeeValidator)` | `:1707` | **Exige** `departmentId: vine.number().min(1)` y `positionId: vine.number().min(1)` (`app/validators/employee.ts:106,108`). Con `null` o ausente lanza `E_VALIDATION_ERROR`. |
| `employeeService.verifyInfoExist(employee)` | `:1708` | **Exige** ambos y que existan sin eliminar (`employee_service.ts:1220-1268`): `if (!employee.departmentId) → 400 'The department was not found'`. No mira la empresa. |
| `employeeService.verifyInfo(employee)` | `:1720` | Unicidad de código y correo. No mira la estructura. |
| Nivel de puesto | `:1734-1745` | `assertAssignable({ effectivePositionId: employee.positionId, currentPositionId: currentEmployee.positionId, ... })`. Con `effectivePositionId` vacío falla cerrado (`ELVL.CONF.001`, 422). |
| `employeeService.update(currentEmployee, employee)` | `:1759` | Copia a ciegas: `currentEmployee.departmentId = employee.departmentId` (`employee_service.ts:841-842`). |
| `catch` | `:1786-1810` | `EmployeePositionLevelError` → su status; error de modalidad → 400; **todo lo demás, incluido `E_VALIDATION_ERROR`, → 500 "Server error"**. |

**Por qué la baja se atora igual:** el BO registra la baja desde la ficha con el mismo `PUT` (`components/employeeInfoForm/script.ts:2212`, `employeeService.update(this.employee)`), enviando `employeeTerminatedDate`, modalidad y tipo junto con el resto del registro. Pasa por el validador y por `verifyInfoExist` igual que cualquier edición. El `DELETE /api/employees/:id` (`EmployeeController.delete`, `:1933`) es otro camino —lo usa la lista— y **no** exige estructura: `EmployeeService.delete` no toca `departmentId` ni `positionId`. Este plan lo verifica con una prueba, no lo cambia.

**Por qué el eco del departamento eliminado bloquea:** el BO reenvía el registro completo (`resources/scripts/services/EmployeeService.ts:31`, `buildEmployeeBody`), incluido el `departmentId` que ya tiene el empleado. `verifyInfoExist` lo busca con `whereNull('department_deleted_at')` y, si el departamento fue eliminado, responde 400 aunque nadie lo haya tocado.

**Por qué se ve la pantalla de error general:** `E_VALIDATION_ERROR` cae al `catch` y sale como 500. El BO, con `>= 500`, hace `showError` y abre `error.vue`; con `< 500` muestra un toast con `detail` → `error` → `errors[0].message` → `message` (`extractApiErrorDetail`, `script.ts:2395`).

### Quién más usa `verifyInfoExist`

Solo `EmployeeController.store` (`:1153`) y `update` (`:1708`). Ningún servicio, job ni importador. Por eso se puede partir sin tocar a nadie más. El alta llega a `verifyInfoExist` **después** de su relleno (`:1136-1153`: si no trae departamento busca `'Sin departamento'`; si no trae puesto, `'Sin posición'`) y debe seguir exigiendo ambos.

### Lo que ya existe y se reutiliza

| Pieza | Dónde | Para qué la usa este plan |
|---|---|---|
| `ScopeDeniedLogService.log({ domain, action, requestedId, actorUserId, businessUnitScope })` | `app/services/scope_denied_log_service.ts` | El "registro de accesos bloqueados" de la HU. Best-effort (nunca rompe la respuesta). Ya usa `domain: 'department'` y `'position'` desde sus controllers. |
| `EmployeePositionLevelService.assertAssignable` | `app/services/employee_position_level_service.ts:41` | Regla 7. Falla cerrado con `effectivePositionId` vacío. No se toca. |
| Mixin `withBusinessUnitScope` en `Department` y `Position` | `app/mixins/with_business_unit_scope.ts` | Acota las consultas a la empresa del header. La verificación nueva agrega `where('business_unit_id', empresaDelEmpleado)` **explícito** además del mixin, igual que hace `assertAssignable` (defensa en profundidad y regla 3: cuenta la empresa del empleado). |
| `i18n.t(key)` en el controller | `employee_controller.ts:117` | Título y mensaje del rechazo, en `resources/langs/es.json` y `en.json`. Locale por defecto `es` (`config/i18n.ts:8`). |
| Convención "ausente = conservar, `null` = limpiar" | `employee_controller.ts:1730-1745` (`positionLevelConfigId`), `:1567-1574` (`dailySalary`) | Misma semántica para `departmentId` y `positionId`. |

### Efectos conocidos que la HU acepta y este plan no corrige

- La ficha del BO sigue marcando en rojo departamento y puesto vacíos al guardar; el envío procede. Fuera de alcance.
- Un empleado que quedó **sin puesto pero con nivel de puesto guardado** (solo posible por llamada directa) y cuya ficha reenvía ese mismo nivel recibe 422 `ELVL.CONF.001`: la exención de conservación de `assertAssignable` exige `currentPositionId` no nulo. La HU lo anota como efecto conocido; no se toca `EmployeePositionLevelService`.
- Guardar un contrato sigue copiando al empleado el departamento y el puesto del contrato sin esta revisión (`employee_contract_service.ts:221-232`). Lo atiende USRH1789328927648 reutilizando `EmployeeStructureService`.

---

## Diseño: por qué una función pura + una consulta, y no tocar `EmployeeService.update`

Se consideró meter la regla dentro de `EmployeeService.update` (que copie solo si cambió). Se descarta: `update` recibe un literal `as Employee` donde la clave **siempre existe** (`departmentId: departmentId`, con `undefined` si no vino), así que "ausente" no es observable ahí; y el punto donde sí es observable es el payload validado `data` que ya usa el controller para `positionLevelConfigId`. El controller resuelve los valores efectivos con la función pura y se los pasa a `update`, que sigue copiando como hoy.

Se consideró extender `verifyInfoExist` con un parámetro "modo edición". Se descarta (YAGNI/KISS): la edición no necesita **ninguna** de sus comprobaciones de estructura, y el alta las necesita todas. Partir el método en dos deja a cada camino con exactamente lo suyo.

Se consideró un catálogo de códigos de error + excepción + helper como el del nivel de puesto. Se descarta: la HU pide un rechazo con un mensaje; el patrón `{ status, type, title, message }` que ya usa este mismo `update` para la baja incompleta y para `verifyInfoExist` lo cubre sin capas nuevas. Si USRH1789328927648 necesita código estable, lo agrega entonces.

**Por qué `where('business_unit_id', …)` explícito si el mixin ya acota:** el mixin acota a la empresa del **header** (`TenantContext.run([requestedId])`), que es la del usuario activo, no necesariamente la del empleado (regla 5 permite cambiar de empresa en la misma edición; el usuario puede tener acceso a varias). La regla 3 exige la del empleado. Con los dos filtros en `AND`, un id que no sea de la empresa del empleado nunca resuelve.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `app/validators/employee.ts` | Contrato de entrada de `PUT`: `departmentId` y `positionId` pasan a `nullable().optional()`. El validador de alta no cambia. | **Modificar** (`updateEmployeeValidator`) |
| `tests/unit/validators/employee_update_validator.spec.ts` | Verifica ausente, `null`, `0` y positivo, sin BD. | **Crear** |
| `app/services/employee_structure_service.ts` | Única representación de "qué estructura queda y cuál hay que verificar" (función pura) y de "existe, vigente y de la empresa del empleado" (consulta). La consumirá también USRH1789328927648. | **Crear** |
| `tests/unit/services/employee_structure_resolution.spec.ts` | La función pura: reglas 2, 4, 5 y 9. Sin BD. | **Crear** |
| `tests/functional/employee_structure_service.spec.ts` | La consulta: vigente propio pasa; eliminado, ajeno e inexistente fallan igual (regla 6). Corre sobre la BD de desarrollo y limpia todo. | **Crear** |
| `app/services/employee_service.ts` | `verifyInfoExist` deja de exigir estructura; el bloque se va a `verifyStructureExist`, que solo el alta consume. | **Modificar** (`verifyInfoExist`, nuevo `verifyStructureExist`) |
| `tests/functional/employee_verify_info_exist.spec.ts` | `verifyInfoExist` sin estructura devuelve 200; `verifyStructureExist` sin estructura devuelve el 400 de siempre. | **Crear** |
| `app/controllers/employee_controller.ts` | `store` llama a `verifyStructureExist` antes de `verifyInfoExist`; `update` resuelve y verifica la estructura, pasa el puesto efectivo al nivel, copia los valores efectivos y responde 400 al `E_VALIDATION_ERROR`. | **Modificar** (`store`, `update`) |
| `resources/langs/es.json`, `resources/langs/en.json` | Título y mensaje del rechazo por departamento y por puesto. | **Modificar** |
| `tests/functional/employee_edicion_sin_estructura.spec.ts` | Punta a punta por HTTP con `root`: los "cómo sabremos que quedó bien" y los "lo que no debe pasar" de la HU. | **Crear** |
| `docs/superpowers/plans/2026-09-17-editar-empleado-sin-estructura-qa-api.md` | Manual de QA de API, hermano de este plan. Lo construye la Task 5. | **Crear** |
| `database/seeders/_tmp_do_not_commit_qa_seeder.ts` | Siembra las variantes de QA. Ya existe y está en `.git/info/exclude`: se le agregan casos. | **Modificar** (no se commitea) |

`EmployeeStructureService` va en `app/services/` con clase por defecto y función pura exportada con nombre, como `EmployeePositionLevelService` (su vecino más cercano). No va dentro de `employee_service.ts` (8 400 líneas) porque la pieza tiene que importarse desde el servicio de contratos en la HU siguiente sin arrastrar todo `EmployeeService`.

---

## Task 1: El validador de edición deja de exigir departamento y puesto

**Files:**
- Modify: `app/validators/employee.ts` — `updateEmployeeValidator`, líneas `departmentId: vine.number().min(1),` y `positionId: vine.number().min(1),` (hoy `:106` y `:108`)
- Test: `tests/unit/validators/employee_update_validator.spec.ts`

**Interfaces:**
- Consumes: nada del plan.
- Produces: `updateEmployeeValidator` devuelve `data.departmentId` y `data.positionId` con tipo `number | null | undefined`; **la clave no existe** en `data` cuando no vino en el body (Vine omite las claves `optional()` ausentes, igual que ya pasa con `positionLevelConfigId`). La Task 4 depende de esas dos cosas.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/validators/employee_update_validator.spec.ts`:

```ts
import { test } from '@japa/runner'
import { updateEmployeeValidator } from '#validators/employee'

/**
 * USRH1788466831270 — al editar, departamento y puesto no son obligatorios
 * (regla 1). Ausente y `null` pasan; `0` sigue fuera (`min(1)`). Sin BD: el
 * validador de edición no tiene reglas `unique`.
 */
const base = {
  employeeCode: 'EDIT-001',
  companyId: 1,
  employeeTypeId: 1,
}

test.group('updateEmployeeValidator — estructura opcional al editar (USRH1788466831270)', () => {
  test('sin departmentId ni positionId pasa y no inventa las claves', async ({ assert }) => {
    const data = await updateEmployeeValidator.validate(base)

    assert.isFalse('departmentId' in data)
    assert.isFalse('positionId' in data)
  })

  test('null explícito pasa y llega como null (regla 9)', async ({ assert }) => {
    const data = await updateEmployeeValidator.validate({
      ...base,
      departmentId: null,
      positionId: null,
    })

    assert.isNull(data.departmentId)
    assert.isNull(data.positionId)
  })

  test('un id positivo pasa como número', async ({ assert }) => {
    const data = await updateEmployeeValidator.validate({
      ...base,
      departmentId: 7,
      positionId: '12',
    })

    assert.strictEqual(data.departmentId, 7)
    assert.strictEqual(data.positionId, 12)
  })

  test('0 sigue rechazado: no es "sin asignar", es un id inválido', async ({ assert }) => {
    await assert.rejects(() => updateEmployeeValidator.validate({ ...base, departmentId: 0 }))
    await assert.rejects(() => updateEmployeeValidator.validate({ ...base, positionId: 0 }))
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test unit --files="employee_update_validator"
```

Esperado: FALLAN los dos primeros (`E_VALIDATION_ERROR: The departmentId field must be defined`); pasan el tercero y el cuarto.

- [ ] **Step 3: Cambiar el validador**

En `app/validators/employee.ts`, dentro de `updateEmployeeValidator` (el segundo `vine.compile`), reemplazar:

```ts
    departmentId: vine.number().min(1),
```
por
```ts
    // USRH1788466831270, regla 1: al editar no son obligatorios. Ausente =
    // conservar lo guardado; `null` = dejar sin asignar (regla 9). Solo el
    // alta (`createEmployeeValidator` + relleno en `store`) los sigue exigiendo.
    departmentId: vine.number().min(1).nullable().optional(),
```
y
```ts
    positionId: vine.number().min(1),
```
por
```ts
    positionId: vine.number().min(1).nullable().optional(),
```

No tocar `createEmployeeValidator`.

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
node ace test unit --files="employee_update_validator"
```

Esperado: PASA, 4 de 4.

- [ ] **Step 5: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores. (Ningún consumidor lee `data.departmentId` todavía; el tipo nuevo no rompe nada.)

- [ ] **Step 6: Commit**

```bash
git add app/validators/employee.ts tests/unit/validators/employee_update_validator.spec.ts
git commit -m "feat(USRH1788466831270): departamento y puesto opcionales en el validador de edicion

Al editar un empleado ya no se exige departamentId ni positionId (regla 1).
Ausente conserva lo guardado y null deja sin asignar (regla 9), la misma
convencion que positionLevelConfigId. El validador de alta no cambia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `EmployeeStructureService` — qué queda y qué se verifica, y la verificación

**Files:**
- Create: `app/services/employee_structure_service.ts`
- Test: `tests/unit/services/employee_structure_resolution.spec.ts` (función pura, sin BD)
- Test: `tests/functional/employee_structure_service.spec.ts` (consulta, con BD)

**Interfaces:**
- Consumes: modelos `Department` (`#models/department`) y `Position` (`#models/position`).
- Produces (los consume la Task 4 con estos nombres exactos):
  - `resolveEmployeeStructureUpdate(current: EmployeeStructureCurrent, input: EmployeeStructureInput): EmployeeStructureResolution` — exportación con nombre, pura.
  - `EmployeeStructureService` (default) con `verifyAssignable(resolution: EmployeeStructureResolution): Promise<EmployeeStructureVerification>`.
  - Tipos exportados: `EmployeeStructureCurrent`, `EmployeeStructureInput`, `EmployeeStructureResolution`, `EmployeeStructureField = 'department' | 'position'`, `EmployeeStructureVerification = { ok: true } | { ok: false; field: EmployeeStructureField; requestedId: number }`.

- [ ] **Step 1: Escribir el test de la función pura (falla)**

Crear `tests/unit/services/employee_structure_resolution.spec.ts`:

```ts
import { test } from '@japa/runner'
import { resolveEmployeeStructureUpdate } from '#services/employee_structure_service'

/**
 * USRH1788466831270 — qué departamento y puesto quedan tras la edición y
 * cuáles hay que verificar. Se compara contra lo GUARDADO, nunca contra lo
 * que mande la pantalla (regla 4). Sin BD.
 */
const guardado = { departmentId: 10, positionId: 20, businessUnitId: 5 }
const sinEstructura = { departmentId: null, positionId: null, businessUnitId: 5 }

test.group('Estructura del empleado — resolución al editar (USRH1788466831270)', () => {
  test('regla 2: clave ausente conserva lo guardado y no verifica nada', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, { businessUnitId: 5 })

    assert.deepEqual(resolution, {
      departmentId: 10,
      positionId: 20,
      businessUnitId: 5,
      departmentIdToVerify: null,
      positionIdToVerify: null,
    })
  })

  test('regla 2: clave ausente conserva también los vacíos, sin inventar nada', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(sinEstructura, { businessUnitId: 5 })

    assert.isNull(resolution.departmentId)
    assert.isNull(resolution.positionId)
    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
  })

  test('regla 4: reenviar el mismo id no verifica, aunque apunte a un departamento eliminado', ({
    assert,
  }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, {
      departmentId: 10,
      positionId: 20,
      businessUnitId: 5,
    })

    assert.equal(resolution.departmentId, 10)
    assert.equal(resolution.positionId, 20)
    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
  })

  test('regla 3: un id distinto del guardado se verifica contra la empresa del empleado', ({
    assert,
  }) => {
    const resolution = resolveEmployeeStructureUpdate(sinEstructura, {
      departmentId: 11,
      positionId: 21,
      businessUnitId: 5,
    })

    assert.deepEqual(resolution, {
      departmentId: 11,
      positionId: 21,
      businessUnitId: 5,
      departmentIdToVerify: 11,
      positionIdToVerify: 21,
    })
  })

  test('solo se verifica el campo que cambió', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, {
      departmentId: 10,
      positionId: 21,
      businessUnitId: 5,
    })

    assert.isNull(resolution.departmentIdToVerify)
    assert.equal(resolution.positionIdToVerify, 21)
  })

  test('regla 9: null explícito deja sin asignar y no verifica nada', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, {
      departmentId: null,
      positionId: null,
      businessUnitId: 5,
    })

    assert.isNull(resolution.departmentId)
    assert.isNull(resolution.positionId)
    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
  })

  test('regla 5: al cambiar de empresa se verifican ambos contra la nueva aunque no cambien', ({
    assert,
  }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, { businessUnitId: 6 })

    assert.deepEqual(resolution, {
      departmentId: 10,
      positionId: 20,
      businessUnitId: 6,
      departmentIdToVerify: 10,
      positionIdToVerify: 20,
    })
  })

  test('regla 5: al cambiar de empresa, lo vacío sigue vacío y no se verifica', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(sinEstructura, { businessUnitId: 6 })

    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
    assert.equal(resolution.businessUnitId, 6)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test unit --files="employee_structure_resolution"
```

Esperado: FALLA con `Cannot find module '#services/employee_structure_service'`.

- [ ] **Step 3: Escribir el servicio**

Crear `app/services/employee_structure_service.ts`:

```ts
import Department from '#models/department'
import Position from '#models/position'

/** Departamento, puesto y empresa que el empleado tiene GUARDADOS. */
export interface EmployeeStructureCurrent {
  departmentId: number | null
  positionId: number | null
  businessUnitId: number
}

/**
 * Lo que trae la edición, ya validada. Clave ausente = no tocar ese campo;
 * `null` = dejar sin asignar (USRH1788466831270, reglas 2 y 9).
 */
export interface EmployeeStructureInput {
  departmentId?: number | null
  positionId?: number | null
  /** Empresa del empleado tras la edición; ya validada por el middleware de scope. */
  businessUnitId: number
}

export interface EmployeeStructureResolution {
  /** Valores que quedarán guardados si la verificación pasa. */
  departmentId: number | null
  positionId: number | null
  /** Empresa contra la que se verifica: la del empleado tras la edición (regla 5). */
  businessUnitId: number
  /** Ids que deben existir, vigentes y en `businessUnitId`; `null` = nada que verificar. */
  departmentIdToVerify: number | null
  positionIdToVerify: number | null
}

export type EmployeeStructureField = 'department' | 'position'

export type EmployeeStructureVerification =
  | { ok: true }
  | { ok: false; field: EmployeeStructureField; requestedId: number }

/**
 * Decide qué departamento y puesto quedan tras editar a un empleado y cuáles
 * hay que verificar antes de guardar (USRH1788466831270).
 *
 * "Cambió" se decide contra lo GUARDADO, nunca contra lo que mande la pantalla
 * (regla 4): reenviar el mismo id —aunque apunte a un departamento eliminado
 * o al relleno de otra empresa— no se verifica, para que ese empleado se
 * pueda seguir editando y dar de baja. Un id distinto se verifica (regla 3).
 * Si la edición cambia de empresa, se verifican los dos aunque no cambien
 * (regla 5). Lo vacío nunca se verifica ni se rellena (reglas 2 y 9).
 *
 * Función pura: no consulta nada. Es la única representación de esa regla;
 * la consume `EmployeeController.update` y la reutilizará el guardado de
 * contratos (USRH1789328927648).
 */
export function resolveEmployeeStructureUpdate(
  current: EmployeeStructureCurrent,
  input: EmployeeStructureInput
): EmployeeStructureResolution {
  const departmentId = input.departmentId === undefined ? current.departmentId : input.departmentId
  const positionId = input.positionId === undefined ? current.positionId : input.positionId
  const businessUnitChanged = input.businessUnitId !== current.businessUnitId

  const toVerify = (next: number | null, saved: number | null): number | null =>
    next !== null && (businessUnitChanged || next !== saved) ? next : null

  return {
    departmentId,
    positionId,
    businessUnitId: input.businessUnitId,
    departmentIdToVerify: toVerify(departmentId, current.departmentId),
    positionIdToVerify: toVerify(positionId, current.positionId),
  }
}

/**
 * Confirma que el departamento y el puesto marcados para verificar existen,
 * no están eliminados y pertenecen a la empresa del empleado (regla 3).
 *
 * El `where('business_unit_id', …)` es explícito además del mixin
 * `withBusinessUnitScope`: el mixin acota a la empresa del header (la del
 * usuario activo), y la regla exige la del EMPLEADO, que puede ser otra si la
 * misma edición lo cambia de empresa. Con los dos filtros en AND, un id ajeno
 * nunca resuelve. Inexistente, eliminado y ajeno son indistinguibles en el
 * resultado (regla 6).
 */
export default class EmployeeStructureService {
  async verifyAssignable(
    resolution: EmployeeStructureResolution
  ): Promise<EmployeeStructureVerification> {
    if (resolution.departmentIdToVerify !== null) {
      const department = await Department.query()
        .where('department_id', resolution.departmentIdToVerify)
        .whereNull('department_deleted_at')
        .where('business_unit_id', resolution.businessUnitId)
        .first()
      if (!department) {
        return { ok: false, field: 'department', requestedId: resolution.departmentIdToVerify }
      }
    }

    if (resolution.positionIdToVerify !== null) {
      const position = await Position.query()
        .where('position_id', resolution.positionIdToVerify)
        .whereNull('position_deleted_at')
        .where('business_unit_id', resolution.businessUnitId)
        .first()
      if (!position) {
        return { ok: false, field: 'position', requestedId: resolution.positionIdToVerify }
      }
    }

    return { ok: true }
  }
}
```

- [ ] **Step 4: Correr el test de la función pura para verificar que pasa**

```bash
node ace test unit --files="employee_structure_resolution"
```

Esperado: PASA, 8 de 8.

- [ ] **Step 5: Escribir el test funcional de la verificación (falla hasta que exista el archivo; con el Step 3 hecho, pasa)**

Crear `tests/functional/employee_structure_service.spec.ts`:

```ts
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import Position from '#models/position'
import EmployeeStructureService from '#services/employee_structure_service'
import type { EmployeeStructureResolution } from '#services/employee_structure_service'

/**
 * USRH1788466831270 — la verificación de "existe, vigente y de la empresa del
 * empleado" (regla 3) sobre la base de desarrollo. Inexistente, eliminado y
 * de otra empresa devuelven exactamente lo mismo (regla 6). Sin middleware:
 * no hay TenantContext, así que lo único que acota es el `where` explícito.
 * Todo lo que crea lo borra en teardown.
 */

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Estructura ${label} ${s}`,
    businessUnitSlug: `estructura-${label}-${s}`,
    businessUnitLegalName: `Estructura ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `EST-${s}`.slice(0, 50),
    departmentName: `Estructura ${label} ${s}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

async function createPosition(unit: BusinessUnit, label: string): Promise<Position> {
  const s = stamp()
  return Position.create({
    positionSyncId: Date.now() + Math.floor(Math.random() * 1000),
    positionCode: `EST-${s}`.slice(0, 50),
    positionName: `Estructura ${label} ${s}`.slice(0, 100),
    positionActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

async function cleanupUnits(units: BusinessUnit[]): Promise<void> {
  for (const unit of units) {
    await Position.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

/** Resolución "ya decidida": solo importa qué se verifica y contra qué empresa. */
function resolution(
  businessUnitId: number,
  toVerify: { departmentId?: number; positionId?: number }
): EmployeeStructureResolution {
  return {
    departmentId: toVerify.departmentId ?? null,
    positionId: toVerify.positionId ?? null,
    businessUnitId,
    departmentIdToVerify: toVerify.departmentId ?? null,
    positionIdToVerify: toVerify.positionId ?? null,
  }
}

const NONEXISTENT_ID = 2_000_000_000

test.group('Estructura del empleado — verificación en la empresa del empleado (USRH1788466831270)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let activeDepartment: Department
  let deletedDepartment: Department
  let foreignDepartment: Department
  let activePosition: Position
  let deletedPosition: Position
  let foreignPosition: Position

  const service = new EmployeeStructureService()

  group.setup(async () => {
    unit = await createUnit('propia')
    foreignUnit = await createUnit('ajena')
    activeDepartment = await createDepartment(unit, 'Activo')
    deletedDepartment = await createDepartment(unit, 'Eliminado')
    foreignDepartment = await createDepartment(foreignUnit, 'Ajeno')
    activePosition = await createPosition(unit, 'Activo')
    deletedPosition = await createPosition(unit, 'Eliminado')
    foreignPosition = await createPosition(foreignUnit, 'Ajeno')
    await deletedDepartment.delete()
    await deletedPosition.delete()
  })

  group.teardown(async () => {
    await cleanupUnits([unit, foreignUnit])
  })

  test('sin nada que verificar responde ok sin consultar', async ({ assert }) => {
    const result = await service.verifyAssignable(resolution(unit.businessUnitId, {}))

    assert.deepEqual(result, { ok: true })
  })

  test('un departamento y un puesto vigentes de la empresa del empleado pasan', async ({
    assert,
  }) => {
    const result = await service.verifyAssignable(
      resolution(unit.businessUnitId, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
      })
    )

    assert.deepEqual(result, { ok: true })
  })

  test('regla 6: departamento eliminado, de otra empresa o inexistente fallan igual', async ({
    assert,
  }) => {
    for (const requestedId of [
      deletedDepartment.departmentId,
      foreignDepartment.departmentId,
      NONEXISTENT_ID,
    ]) {
      const result = await service.verifyAssignable(
        resolution(unit.businessUnitId, { departmentId: requestedId })
      )
      assert.deepEqual(result, { ok: false, field: 'department', requestedId })
    }
  })

  test('regla 6: puesto eliminado, de otra empresa o inexistente fallan igual', async ({
    assert,
  }) => {
    for (const requestedId of [
      deletedPosition.positionId,
      foreignPosition.positionId,
      NONEXISTENT_ID,
    ]) {
      const result = await service.verifyAssignable(
        resolution(unit.businessUnitId, { positionId: requestedId })
      )
      assert.deepEqual(result, { ok: false, field: 'position', requestedId })
    }
  })

  test('cuenta la empresa del empleado: el mismo departamento pasa en la suya y falla en la ajena', async ({
    assert,
  }) => {
    const own = await service.verifyAssignable(
      resolution(unit.businessUnitId, { departmentId: activeDepartment.departmentId })
    )
    const other = await service.verifyAssignable(
      resolution(foreignUnit.businessUnitId, { departmentId: activeDepartment.departmentId })
    )

    assert.deepEqual(own, { ok: true })
    assert.deepEqual(other, {
      ok: false,
      field: 'department',
      requestedId: activeDepartment.departmentId,
    })
  })

  test('el departamento se reporta antes que el puesto cuando fallan los dos', async ({ assert }) => {
    const result = await service.verifyAssignable(
      resolution(unit.businessUnitId, {
        departmentId: foreignDepartment.departmentId,
        positionId: foreignPosition.positionId,
      })
    )

    assert.deepEqual(result, {
      ok: false,
      field: 'department',
      requestedId: foreignDepartment.departmentId,
    })
  })
})
```

- [ ] **Step 6: Correr el test funcional**

```bash
node ace test functional --files="employee_structure_service"
```

Esperado: PASA, 6 de 6. Si `Position.create` rechaza `companyId`, revisar `app/models/position.ts:151` (`declare companyId: number`): la columna existe; el test de `employees_write_permission_gate.spec.ts` la inserta igual.

- [ ] **Step 7: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores.

- [ ] **Step 8: Commit**

```bash
git add app/services/employee_structure_service.ts tests/unit/services/employee_structure_resolution.spec.ts tests/functional/employee_structure_service.spec.ts
git commit -m "feat(USRH1788466831270): servicio de estructura del empleado al editar

Una funcion pura decide que departamento y puesto quedan y cuales hay que
verificar (ausente conserva, null deja sin asignar, distinto del guardado o
cambio de empresa se verifica: reglas 2, 4, 5 y 9) y una consulta confirma
que existen, no estan eliminados y son de la empresa del empleado (regla 3),
sin distinguir el motivo del rechazo (regla 6). Lo consumira la edicion y,
despues, el guardado de contratos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `verifyInfoExist` deja de exigir estructura; el alta la sigue exigiendo con `verifyStructureExist`

**Files:**
- Modify: `app/services/employee_service.ts` — método `verifyInfoExist` (hoy `:1220-1352`)
- Modify: `app/controllers/employee_controller.ts` — en `store`, la línea `const exist = await employeeService.verifyInfoExist(employee)` (hoy `:1153`)
- Test: `tests/functional/employee_verify_info_exist.spec.ts`

**Interfaces:**
- Consumes: nada del plan.
- Produces: `EmployeeService.verifyStructureExist(employee: Employee)` con la misma forma de retorno que `verifyInfoExist` (`{ status, type, title, message, data }`). `verifyInfoExist(employee)` ya no mira `departmentId` ni `positionId`. La Task 4 depende de lo segundo.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/functional/employee_verify_info_exist.spec.ts`:

```ts
import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import Employee from '#models/employee'
import EmployeeService from '#services/employee_service'

/**
 * USRH1788466831270 — `verifyInfoExist` (lo que comparte alta y edición) ya
 * no exige departamento ni puesto (regla 1); `verifyStructureExist` (solo el
 * alta) conserva ese rechazo tal cual, texto incluido. Sobre la base de
 * desarrollo; `employeeTypeId: 1` es el tipo "Empleado" que siembra
 * `0011_employee_type_seeder.ts`.
 */

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

test.group('EmployeeService.verifyInfoExist — sin estructura (USRH1788466831270)', (group) => {
  let unit: BusinessUnit
  let department: Department

  function service(): EmployeeService {
    return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
  }

  /** Literal equivalente al que arma el controller; sin departamento ni puesto. */
  function payload(extra: Partial<Employee> = {}): Employee {
    return {
      employeeId: 0,
      employeeCode: `VIE-${stamp()}`,
      departmentId: null,
      positionId: null,
      employeeTypeId: 1,
      businessUnitId: unit.businessUnitId,
      payrollBusinessUnitId: unit.businessUnitId,
      ...extra,
    } as Employee
  }

  group.setup(async () => {
    const s = stamp()
    unit = await BusinessUnit.create({
      businessUnitName: `VerifyInfo ${s}`,
      businessUnitSlug: `verify-info-${s}`,
      businessUnitLegalName: `VerifyInfo legal ${s}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    department = await Department.create({
      departmentSyncId: Date.now(),
      departmentCode: `VIE-${s}`.slice(0, 50),
      departmentName: `VerifyInfo ${s}`,
      departmentAlias: '',
      departmentIsDefault: false,
      departmentActive: 1,
      businessUnitId: unit.businessUnitId,
      companyId: unit.businessUnitId,
    })
  })

  group.teardown(async () => {
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  })

  test('verifyInfoExist pasa sin departamento ni puesto (regla 1)', async ({ assert }) => {
    const result = await service().verifyInfoExist(payload())

    assert.equal(result.status, 200)
  })

  test('verifyInfoExist sigue rechazando lo demás: tipo de empleado inexistente', async ({
    assert,
  }) => {
    const result = await service().verifyInfoExist(payload({ employeeTypeId: 2_000_000_000 }))

    assert.equal(result.status, 400)
    assert.equal(result.title, 'The employee type was not found')
  })

  test('verifyStructureExist (alta) sigue exigiendo el departamento con el texto de siempre', async ({
    assert,
  }) => {
    const result = await service().verifyStructureExist(payload())

    assert.equal(result.status, 400)
    assert.equal(result.title, 'The department was not found')
  })

  test('verifyStructureExist (alta) sigue exigiendo el puesto con el texto de siempre', async ({
    assert,
  }) => {
    const result = await service().verifyStructureExist(
      payload({ departmentId: department.departmentId })
    )

    assert.equal(result.status, 400)
    assert.equal(result.title, 'The position was not found')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test functional --files="employee_verify_info_exist"
```

Esperado: FALLA. El primero devuelve `400` (`'The department was not found'`) en vez de 200; el tercero y el cuarto fallan en `typecheck`/runtime porque `verifyStructureExist` no existe. (Si Japa compila el archivo antes de correr, el error será de tipos; cuenta igual como "falla".)

- [ ] **Step 3: Partir `verifyInfoExist`**

En `app/services/employee_service.ts`, localizar `async verifyInfoExist(employee: Employee) {`. Su cuerpo empieza con cuatro bloques seguidos: `if (!employee.departmentId)`, `const existDepartment = …` + `if (!existDepartment && employee.departmentId)`, `if (!employee.positionId)`, `const existPosition = …` + `if (!existPosition && employee.positionId)`. Termina ese cuarto bloque justo antes de `const existEmployeeType = await EmployeeType.query()`.

Mover esos cuatro bloques, **sin cambiar una letra de sus textos**, a un método nuevo colocado inmediatamente antes de `verifyInfoExist`:

```ts
  /**
   * Departamento y puesto obligatorios y vigentes. Solo lo exige el ALTA
   * (`store`, después de su relleno "Sin departamento" / "Sin posición").
   * La edición no pasa por aquí (USRH1788466831270, regla 1): su estructura
   * se revisa en `EmployeeStructureService` y solo cuando cambia.
   */
  async verifyStructureExist(employee: Employee) {
    if (!employee.departmentId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The department was not found',
        message: 'The department was not found with the entered ID',
        data: { ...employee },
      }
    }
    const existDepartment = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', employee.departmentId)
      .first()

    if (!existDepartment && employee.departmentId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The department was not found',
        message: 'The department was not found with the entered ID',
        data: { ...employee },
      }
    }
    if (!employee.positionId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position was not found',
        message: 'The position was not found with the entered ID',
        data: { ...employee },
      }
    }

    const existPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', employee.positionId)
      .first()

    if (!existPosition && employee.positionId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position was not found',
        message: 'The position was not found with the entered ID',
        data: { ...employee },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...employee },
    }
  }

  /**
   * Comprobaciones compartidas por alta y edición: tipo de empleado, persona
   * (solo alta), empresa y empresa de nómina. La estructura NO va aquí
   * (USRH1788466831270): ver `verifyStructureExist`.
   */
  async verifyInfoExist(employee: Employee) {
    const existEmployeeType = await EmployeeType.query()
```

`verifyInfoExist` queda empezando por `const existEmployeeType …` y el resto de su cuerpo no cambia.

- [ ] **Step 4: El alta llama a los dos**

En `app/controllers/employee_controller.ts`, dentro de `store`, reemplazar:

```ts
      const exist = await employeeService.verifyInfoExist(employee)
```
por
```ts
      // El alta sigue exigiendo departamento y puesto (USRH1788466831270 no lo
      // cambia; lo atiende USRH1789328927556). La edición ya no pasa por aquí.
      const structureExist = await employeeService.verifyStructureExist(employee)
      const exist =
        structureExist.status === 200 ? await employeeService.verifyInfoExist(employee) : structureExist
```

El `if (exist.status !== 200) { … releasePersonIfOrphan … }` que sigue no se toca: recibe exactamente lo mismo que antes (primero el rechazo de estructura, si lo hay; luego el del resto).

- [ ] **Step 5: Correr el test para verificar que pasa**

```bash
node ace test functional --files="employee_verify_info_exist"
```

Esperado: PASA, 4 de 4.

- [ ] **Step 6: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/services/employee_service.ts app/controllers/employee_controller.ts tests/functional/employee_verify_info_exist.spec.ts
git commit -m "refactor(USRH1788466831270): la exigencia de estructura sale de verifyInfoExist

verifyInfoExist ya no exige departamento ni puesto; ese bloque se mueve tal
cual a verifyStructureExist, que solo el alta consume (regla 1). La edicion
deja de rechazar al empleado sin estructura o con departamento eliminado en
esta capa; la revision de lo que cambia llega en la tarea siguiente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

> Nota para el revisor: al cerrar esta Task, `PUT` con departamento vacío ya no rechaza en `verifyInfoExist` **pero** todavía copia lo que venga y no verifica nada; la Task 4 cierra eso en el mismo PR. No mergear entre Task 3 y Task 4.

---

## Task 4: `update` resuelve, verifica y responde con mensaje; la validación ya no es 500

**Files:**
- Modify: `app/controllers/employee_controller.ts` — imports (cabecera), método `update`: bloque entre `verifyInfo` y el nivel de puesto (hoy `:1720-1745`), copia de valores antes de `employeeService.update` (hoy `:1759`), y el `catch` (hoy `:1786-1810`)
- Modify: `resources/langs/es.json` y `resources/langs/en.json` — cuatro claves nuevas
- Test: `tests/functional/employee_edicion_sin_estructura.spec.ts`

**Interfaces:**
- Consumes: `resolveEmployeeStructureUpdate`, `EmployeeStructureService` (Task 2); `data.departmentId` / `data.positionId` opcionales y nulos (Task 1); `verifyInfoExist` sin estructura (Task 3); `ScopeDeniedLogService.log` (existente).
- Produces: contrato HTTP de `PUT /api/employees/:employeeId`:
  - `201` + `data.employee` como hoy, con `departmentId`/`positionId` conservados, asignados o en `null` según lo enviado.
  - `400 { type: 'warning', title, message, data }` con `message` = `"El departamento no existe en la empresa del empleado"` o `"El puesto no existe en la empresa del empleado"` (i18n `es`); nada más cambia en el body.
  - `400 { type: 'warning', title: 'Error de validación', message: <primer mensaje de Vine>, errors: [...] }` para `E_VALIDATION_ERROR` (antes 500).

- [ ] **Step 1: Escribir el test HTTP que falla**

Crear `tests/functional/employee_edicion_sin_estructura.spec.ts`:

```ts
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Department from '#models/department'
import Position from '#models/position'
import Employee from '#models/employee'

/**
 * USRH1788466831270 — editar y dar de baja a un empleado aunque no tenga
 * departamento ni puesto, y aceptar solo estructura vigente de SU empresa al
 * asignarle una distinta. Punta a punta por HTTP con el usuario principal
 * (`root`): tiene acceso a las dos empresas, así que si un departamento
 * ajeno se rechaza es porque cuenta la empresa del empleado y no el alcance
 * de quien captura. Corre sobre la base de desarrollo y borra todo en
 * teardown.
 */

const TEST_PASSWORD = 'EditarSinEstructura123!'
const NONEXISTENT_ID = 2_000_000_000

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Edicion ${label} ${s}`,
    businessUnitSlug: `edicion-${label}-${s}`,
    businessUnitLegalName: `Edicion ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `EDI-${s}`.slice(0, 50),
    departmentName: `Edicion ${label} ${s}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

async function createPosition(unit: BusinessUnit, label: string): Promise<Position> {
  const s = stamp()
  return Position.create({
    positionSyncId: Date.now() + Math.floor(Math.random() * 1000),
    positionCode: `EDI-${s}`.slice(0, 50),
    positionName: `Edicion ${label} ${s}`.slice(0, 100),
    positionActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

interface EmployeeFixture {
  employee: Employee
  person: Person
}

async function createEmployee(
  unit: BusinessUnit,
  label: string,
  structure: { departmentId: number | null; positionId: number | null }
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Edicion',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `edicion-${label}-${s}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EDI-${s}`
  employee.employeeFirstName = 'Edicion'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `EDI-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = structure.departmentId
  employee.positionId = structure.positionId
  employee.employeeTerminatedDate = null
  await employee.save()
  return { employee, person }
}

interface Actor {
  user: User
  person: Person
}

/** El usuario principal: rol `root` del sistema, con acceso a todas las empresas. */
async function createRootActor(unit: BusinessUnit): Promise<Actor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const s = stamp()
  const email = `edicion-root-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Root',
    personSecondLastname: s,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([unit.businessUnitId])
  return { user, person }
}

async function cleanupEmployees(fixtures: EmployeeFixture[]): Promise<void> {
  for (const { employee, person } of fixtures) {
    // La baja abre un expediente de salida (FK RESTRICT a `employees`); sus
    // pendientes caen en cascada al borrar el expediente.
    await db.from('employee_offboardings').where('employee_id', employee.employeeId).delete()
    await db.from('employee_salary_history').where('employee_id', employee.employeeId).delete()
    await Employee.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await Person.query().where('person_id', person.personId).delete()
  }
}

async function cleanupActor(actor: Actor | null): Promise<void> {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function cleanupUnits(units: BusinessUnit[]): Promise<void> {
  for (const unit of units) {
    await Position.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

/**
 * Body equivalente al eco del BO (`buildEmployeeBody`): el registro completo,
 * con `departmentId` y `positionId` tal como los tiene el empleado (incluido
 * `null`). `overrides` es lo que "cambia el usuario" en la ficha.
 */
function bodyFor(fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
  const employee = fixture.employee
  return {
    employeeCode: String(employee.employeeCode),
    employeeFirstName: employee.employeeFirstName ?? '',
    employeeLastName: employee.employeeLastName ?? '',
    employeeSecondLastName: employee.employeeSecondLastName ?? '',
    companyId: employee.companyId,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    employeeTypeId: employee.employeeTypeId,
    businessUnitId: employee.businessUnitId,
    payrollBusinessUnitId: employee.payrollBusinessUnitId,
    employeeBusinessEmail: employee.employeeBusinessEmail,
    employeeWorkSchedule: 'Onsite',
    employeeWorkScheduleHybridConfig: null,
    ...overrides,
  }
}

async function snapshot(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select([
      'department_id',
      'position_id',
      'position_level_config_id',
      'employee_business_email',
      'employee_terminated_date',
      'employee_termination_modality',
      'employee_termination_type',
    ])
    .first()
}

test.group('Edición y baja sin estructura — PUT/DELETE /api/employees/:id (USRH1788466831270)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let root: Actor | null = null
  let activeDepartment: Department
  let activePosition: Position
  let deletedDepartment: Department
  let foreignDepartment: Department
  let foreignPosition: Position
  let sinEstructura: EmployeeFixture
  let sinEstructuraAsignar: EmployeeFixture
  let sinEstructuraRechazos: EmployeeFixture
  let sinEstructuraBajaPut: EmployeeFixture
  let sinEstructuraBajaDelete: EmployeeFixture
  let deptoEliminado: EmployeeFixture
  let conEstructura: EmployeeFixture

  group.setup(async () => {
    unit = await createUnit('empresa')
    foreignUnit = await createUnit('ajena')
    activeDepartment = await createDepartment(unit, 'Activo')
    activePosition = await createPosition(unit, 'Activo')
    deletedDepartment = await createDepartment(unit, 'Eliminado')
    foreignDepartment = await createDepartment(foreignUnit, 'Ajeno')
    foreignPosition = await createPosition(foreignUnit, 'Ajeno')

    const none = { departmentId: null, positionId: null }
    sinEstructura = await createEmployee(unit, 'SinEstructura', none)
    sinEstructuraAsignar = await createEmployee(unit, 'Asignar', none)
    sinEstructuraRechazos = await createEmployee(unit, 'Rechazos', none)
    sinEstructuraBajaPut = await createEmployee(unit, 'BajaPut', none)
    sinEstructuraBajaDelete = await createEmployee(unit, 'BajaDelete', none)
    deptoEliminado = await createEmployee(unit, 'DeptoEliminado', {
      departmentId: deletedDepartment.departmentId,
      positionId: activePosition.positionId,
    })
    conEstructura = await createEmployee(unit, 'ConEstructura', {
      departmentId: activeDepartment.departmentId,
      positionId: activePosition.positionId,
    })
    // El departamento se elimina DESPUÉS de asignarlo: es el caso "apunta a
    // un departamento que ya se eliminó en el Organigrama".
    await deletedDepartment.delete()

    root = await createRootActor(unit)
    await root.user.related('businessUnits').attach([foreignUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupEmployees([
      sinEstructura,
      sinEstructuraAsignar,
      sinEstructuraRechazos,
      sinEstructuraBajaPut,
      sinEstructuraBajaDelete,
      deptoEliminado,
      conEstructura,
    ])
    await cleanupActor(root)
    await cleanupUnits([unit, foreignUnit])
  })

  function put(fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
    return (client: any) =>
      client
        .put(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(root!.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
        .json(bodyFor(fixture, overrides))
  }

  test('corrige el correo de un empleado sin departamento ni puesto; siguen vacíos (reglas 1 y 2)', async ({
    client,
    assert,
  }) => {
    const nuevoCorreo = `edicion-corregido-${stamp()}@gsti-tests.local`
    const response = await put(sinEstructura, { employeeBusinessEmail: nuevoCorreo })(client)

    response.assertStatus(201)
    const row = await snapshot(sinEstructura.employee.employeeId)
    assert.equal(row.employee_business_email, nuevoCorreo)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
    assert.isNull(response.body().data.employee.departmentId)
    assert.isNull(response.body().data.employee.positionId)
  })

  test('registra la baja desde la ficha (PUT) sin pedir estructura (regla 1)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraBajaPut, {
      employeeTerminatedDate: '2026-09-15',
      employeeTerminationModality: 'Renuncia',
      employeeTerminationType: 'Cambio de Residencia',
    })(client)

    response.assertStatus(201)
    const row = await snapshot(sinEstructuraBajaPut.employee.employeeId)
    assert.isNotNull(row.employee_terminated_date)
    assert.equal(row.employee_termination_modality, 'Renuncia')
    assert.equal(row.employee_termination_type, 'Cambio de Residencia')
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
  })

  test('registra la baja desde la lista (DELETE) sin pedir estructura', async ({
    client,
    assert,
  }) => {
    const response = await client
      .delete(`/api/employees/${sinEstructuraBajaDelete.employee.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .json({
        employeeTerminatedDate: '2026-09-15',
        employeeTerminationModality: 'Renuncia',
        employeeTerminationType: 'Cambio de Residencia',
      })

    response.assertStatus(201)
    const row = await snapshot(sinEstructuraBajaDelete.employee.employeeId)
    assert.isNotNull(row.employee_terminated_date)
    assert.isNull(row.department_id)
  })

  test('asigna un departamento y un puesto vigentes de su empresa (regla 3)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraAsignar, {
      departmentId: activeDepartment.departmentId,
      positionId: activePosition.positionId,
    })(client)

    response.assertStatus(201)
    const row = await snapshot(sinEstructuraAsignar.employee.employeeId)
    assert.equal(row.department_id, activeDepartment.departmentId)
    assert.equal(row.position_id, activePosition.positionId)
  })

  test('el eco de un departamento ya eliminado no bloquea y se conserva (regla 4)', async ({
    client,
    assert,
  }) => {
    const nuevoCorreo = `edicion-eliminado-${stamp()}@gsti-tests.local`
    const response = await put(deptoEliminado, { employeeBusinessEmail: nuevoCorreo })(client)

    response.assertStatus(201)
    const row = await snapshot(deptoEliminado.employee.employeeId)
    assert.equal(row.employee_business_email, nuevoCorreo)
    assert.equal(row.department_id, deletedDepartment.departmentId)
    assert.equal(row.position_id, activePosition.positionId)
  })

  test('rechaza un departamento de otra empresa aunque quien captura tenga acceso a las dos (regla 3)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, {
      departmentId: foreignDepartment.departmentId,
    })(client)

    response.assertStatus(400)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
  })

  test('rechaza un puesto de otra empresa con el mensaje de puesto (regla 3)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, {
      positionId: foreignPosition.positionId,
    })(client)

    response.assertStatus(400)
    assert.equal(response.body().message, 'El puesto no existe en la empresa del empleado')
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.position_id)
  })

  test('regla 6: eliminado e inexistente reciben exactamente el mismo mensaje que el ajeno', async ({
    client,
    assert,
  }) => {
    for (const departmentId of [deletedDepartment.departmentId, NONEXISTENT_ID]) {
      const response = await put(sinEstructuraRechazos, { departmentId })(client)
      response.assertStatus(400)
      assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    }
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.department_id)
  })

  test('regla 5: al cambiar de empresa, el departamento que tenía se revisa contra la nueva y se rechaza', async ({
    client,
    assert,
  }) => {
    const response = await put(conEstructura, {
      businessUnitId: foreignUnit.businessUnitId,
      payrollBusinessUnitId: foreignUnit.businessUnitId,
    })(client)

    response.assertStatus(400)
    assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    const row = await snapshot(conEstructura.employee.employeeId)
    assert.equal(row.department_id, activeDepartment.departmentId)
    assert.equal(row.position_id, activePosition.positionId)
  })

  test('regla 7: a un empleado sin puesto no se le asigna un nivel de puesto', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, {
      positionLevelConfigId: NONEXISTENT_ID,
    })(client)

    response.assertStatus(422)
    assert.equal(response.body().code, 'ELVL.CONF.001')
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.position_level_config_id)
  })

  test('regla 8: un dato mal formado es 400 con mensaje, no la pantalla de error general', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, { departmentId: 0 })(client)

    response.assertStatus(400)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().title, 'Error de validación')
    assert.isString(response.body().message)
    assert.isNotEmpty(response.body().message)
    assert.notEqual(response.body().title, 'Server error')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test functional --files="employee_edicion_sin_estructura"
```

Esperado: FALLAN al menos los de rechazo (hoy `PUT` con `departmentId` ajeno responde **201** porque nadie verifica la empresa; con `departmentId: 0` responde **500**; el cambio de empresa responde 201). Los de "conserva" y "baja" pueden pasar ya por la Task 3. Anotar cuáles fallan para contrastar en el Step 7.

- [ ] **Step 3: Agregar las claves de i18n**

En `resources/langs/es.json`, después de la línea `"employee_position_level_val_input_message": "El identificador del nivel de puesto es inválido.",` agregar:

```json
  "employee_department_not_in_business_unit_title": "Departamento no disponible",
  "employee_department_not_in_business_unit_message": "El departamento no existe en la empresa del empleado",
  "employee_position_not_in_business_unit_title": "Puesto no disponible",
  "employee_position_not_in_business_unit_message": "El puesto no existe en la empresa del empleado",
```

En `resources/langs/en.json`, después de `"employee_position_level_val_input_message": "The position level identifier is invalid.",` agregar:

```json
  "employee_department_not_in_business_unit_title": "Department not available",
  "employee_department_not_in_business_unit_message": "The department does not exist in the employee's company",
  "employee_position_not_in_business_unit_title": "Position not available",
  "employee_position_not_in_business_unit_message": "The position does not exist in the employee's company",
```

Comprobar que los dos archivos siguen siendo JSON válido:

```bash
node -e "JSON.parse(require('fs').readFileSync('resources/langs/es.json','utf8')); JSON.parse(require('fs').readFileSync('resources/langs/en.json','utf8')); console.log('ok')"
```

Esperado: `ok`.

- [ ] **Step 4: Imports en el controller**

En la cabecera de `app/controllers/employee_controller.ts`, junto a `import { updateEmployeeValidator } from '../validators/employee.js'`, agregar:

```ts
import EmployeeStructureService, {
  resolveEmployeeStructureUpdate,
} from '#services/employee_structure_service'
import ScopeDeniedLogService from '#services/scope_denied_log_service'
```

(`ScopeDeniedLogService` no está importado hoy en este controller; verificarlo con `grep -n ScopeDeniedLogService app/controllers/employee_controller.ts` antes de agregarlo, para no duplicar.)

- [ ] **Step 5: Resolver y verificar la estructura en `update`**

En `update`, localizar el bloque del nivel de puesto, que empieza con el comentario `// Nivel de puesto (USRH1785964117188): propiedad ausente = no tocar el` y contiene `if ('positionLevelConfigId' in data) {`. **Inmediatamente antes de ese comentario** insertar:

```ts
      // Estructura (USRH1788466831270): departamento y puesto no son
      // obligatorios al editar. Clave ausente = conservar lo guardado (aunque
      // esté vacío); null = dejar sin asignar. Solo lo DISTINTO de lo guardado
      // —o todo, si cambia de empresa— tiene que existir, estar vigente y ser
      // de la empresa del empleado; reenviar lo mismo nunca bloquea (regla 4).
      const structure = resolveEmployeeStructureUpdate(
        {
          departmentId: currentEmployee.departmentId,
          positionId: currentEmployee.positionId,
          businessUnitId: currentEmployee.businessUnitId,
        },
        {
          departmentId: data.departmentId,
          positionId: data.positionId,
          businessUnitId: Number(employee.businessUnitId),
        }
      )
      const structureCheck = await new EmployeeStructureService().verifyAssignable(structure)
      if (!structureCheck.ok) {
        // Registro de accesos bloqueados: qué id se pidió y quién, sin datos
        // del empleado. Inexistente, eliminado y ajeno son indistinguibles.
        await ScopeDeniedLogService.log({
          domain: structureCheck.field,
          action: 'assign-to-employee',
          requestedId: structureCheck.requestedId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_title`),
          message: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_message`),
          data: { ...data },
        }
      }
      employee.departmentId = structure.departmentId
      employee.positionId = structure.positionId

```

Luego, dentro del bloque del nivel de puesto que sigue, cambiar la línea

```ts
          effectivePositionId: employee.positionId,
```
por
```ts
          // Regla 7 (USRH1788466831270): el puesto efectivo es el resuelto
          // arriba —el del payload o, si no vino, el guardado—.
          effectivePositionId: structure.positionId,
```

`currentPositionId: currentEmployee.positionId` se queda como está.

Nada más cambia antes de `employeeService.update(currentEmployee, employee, …)`: como `employee.departmentId` y `employee.positionId` ya llevan los valores efectivos, `EmployeeService.update` los copia como siempre y la regla 2 se cumple sin tocar el servicio.

- [ ] **Step 6: El `catch` de `update` responde 400 a la validación**

En el `catch (error)` de `update`, localizar:

```ts
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
```

e insertar **antes** de `const messageError`:

```ts
      if (error?.code === 'E_VALIDATION_ERROR') {
        // Regla 8 (USRH1788466831270): un dato mal formado es un rechazo por
        // datos, no un error del servidor. Con 500 el BO abre la pantalla de
        // error general y el usuario pierde lo capturado.
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t('validation_error'),
          message: error.messages?.[0]?.message ?? i18n.t('validation_error'),
          errors: error.messages,
        }
      }
```

El resto del `catch` no cambia (la rama `messageError` queda para lo que no sea validación; sigue compilando aunque su ternario ya no se cumpla nunca — no reescribirla, es el patrón del resto del controller).

No tocar el `catch` de `delete`: ahí no corre ningún validador de Vine.

- [ ] **Step 7: Correr el test para verificar que pasa**

```bash
node ace test functional --files="employee_edicion_sin_estructura"
```

Esperado: PASA, 11 de 11.

Si falla el de la regla 5 con **404** en vez de 400: el middleware rechazó `businessUnitId` del body por no estar en el alcance del actor; confirmar que el `setup` hizo `root.user.related('businessUnits').attach([foreignUnit.businessUnitId])` (para `root`, `BusinessAccessScopeService` devuelve todas las unidades activas, así que el `attach` es redundante pero inocuo).

Si falla el de "DELETE" por algo de checadores/dispositivos: `EmployeeService.delete` revoca accesos best-effort; leer el error y, si es una dependencia externa (ADMS/Mongo) no disponible en local, dejar el test tal cual y anotarlo en el PR. No quitar el test.

Si el `teardown` falla con una FK sobre `employees`: la baja por `DELETE` abre un expediente de salida en `employee_offboardings` (`EmployeeService.delete` → `OffboardingsService.openAutomatically`; el `PUT` con fecha de baja no lo abre — verificado con `grep -n openAutomatically app/services/employee_service.ts`: solo `:1033`, dentro de `delete`). `cleanupEmployees` ya borra ese expediente antes que al empleado; si aparece otra tabla con FK `RESTRICT`, agregarla ahí, antes del `Employee.query()…delete()`.

- [ ] **Step 8: Correr las suites vecinas que tocan el mismo camino**

```bash
node ace test functional --files="employees_write_permission_gate" --files="employee_position_level" --files="employee_verify_info_exist" --files="employee_structure_service"
```

Esperado: todo en verde. `employees_write_permission_gate` es el que más se parece al `PUT` real (con permisos de rol, no `root`): si su caso "A: permite editar puesto…" se rompe, la resolución de estructura está mal cableada.

- [ ] **Step 9: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores. Punto de atención de tipos: `data.departmentId` es `number | null | undefined` (Task 1) y `EmployeeStructureInput.departmentId?: number | null` lo acepta tal cual.

- [ ] **Step 10: Commit**

```bash
git add app/controllers/employee_controller.ts resources/langs/es.json resources/langs/en.json tests/functional/employee_edicion_sin_estructura.spec.ts
git commit -m "feat(USRH1788466831270): editar y dar de baja sin estructura; solo se verifica lo que cambia

PUT /api/employees/:id conserva departamento y puesto cuando no vienen
(incluso vacios), deja sin asignar con null y verifica solo lo distinto de
lo guardado —o todo si cambia de empresa— contra la empresa del empleado.
El rechazo es un 400 con un unico mensaje por campo y queda en el log de
accesos bloqueados. Un error de validacion sale como 400 y ya no abre la
pantalla de error general.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Manual de prueba manual de API (hermano del plan)

Todo plan de este repo entrega su manual de QA hermano. Esta tarea lo construye.

**La regla manda:** `~/.cursor/rules/manual-qa-api.mdc` (`alwaysApply`). **Leerla completa antes de escribir una línea.** Cada step de abajo aplica una sección de esa regla y la nombra entre comillas; lo que sigue son las constantes y los datos de esta HU ya resueltos, no una versión de la regla. Si algo de aquí pareciera contradecirla, manda la regla.

**Files:**
- Create: `docs/superpowers/plans/2026-09-17-editar-empleado-sin-estructura-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado, está en `.git/info/exclude`)

**Interfaces:**
- Consumes: el comportamiento entregado por las Tasks 1–4.
- Produces: nada que consuma otra tarea.

- [ ] **Step 1: "Antes de escribir: tomar las constantes del proyecto"**

La regla: *"La regla fija el formato; los valores concretos salen del repo. Antes de redactar, abre un manual anterior del mismo API —o el código, si no hay ninguno— y anota la URL base local, el esquema de auth, la forma del envelope de éxito y de error, dónde vive el seeder de QA, y el dominio y contraseña de los usuarios de prueba."*

Manual anterior del mismo API: `docs/superpowers/plans/2026-09-15-alcance-empleados-sin-departamento-qa-api.md`. Abrirlo y anotar. Lo que ya trae:

| Constante | Valor |
|---|---|
| URL base local | `http://127.0.0.1:3333` |
| Esquema de auth | Resuelta por el cliente: `Authorization: Bearer <token>`. No se documenta el login |
| Header obligatorio en toda petición | `X-Business-Unit-Id: <identificador público de la empresa>`, resuelto en Preparar con una consulta |
| Seeder de QA | `database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Comando del seeder | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Dominio de pruebas | `@gsti-tests.local` |
| Contraseña de prueba | `password` |

Lo que hay que anotar leyendo el código (investigación; no se publica): el envelope de éxito de `PUT /api/employees/:id` es `201 { type: 'success', title: 'Employees', message: 'The employee was updated successfully', data: { employee: {...} } }` (los textos nacen en inglés en el servidor, sin traducción) y el de `DELETE /api/employees/:id` es `201 { type: 'success', title: 'Employees', message: 'The employee was deleted successfully', data: { employee: {...} } }`. Los rechazos de esta HU son `400 { type: 'warning', title, message, data }` con `title`/`message` en español (`Departamento no disponible` / `El departamento no existe en la empresa del empleado`; `Puesto no disponible` / `El puesto no existe en la empresa del empleado`), y el de datos mal formados `400 { type: 'warning', title: 'Error de validación', message: <texto de la regla>, errors: [...] }`. El de nivel sin puesto es `422 { type: 'error', title: 'Nivel no válido para el puesto', message: 'El nivel indicado no pertenece a los niveles configurados del puesto del empleado.', detail, key: 'nivel-no-pertenece-al-puesto', code: 'ELVL.CONF.001' }`. El body completo del `PUT` es el registro entero del empleado (la ficha lo reenvía todo); en el manual va completo y pegable, con `"..."` solo en lo que no importa al caso.

- [ ] **Step 2: "Setup — seeder QA (no versionado)"**

La regla: *"Todo lo necesario va en un solo archivo, el mismo que ya usan los paneles del producto — no crear uno nuevo"*; usuarios *"`qa-<feature>-<variante>@<dominio de pruebas>` con la contraseña de prueba del proyecto, uno por variante del caso (con permiso / sin permiso, de plataforma / de tenant)"*; *"Roles, permisos y datos de negocio imprescindibles para la HU"*; *"Los ids que van en las URLs no se inventan ni se hardcodean: se entregan con la consulta que los resuelve"*; *"El playbook incluye un solo comando: el que corre ese seeder."*

Agregar al seeder existente, con `<feature>` = `edicion`, idempotente por código de nómina (mismo estilo que el bloque `QA-ALC-*` ya presente en el archivo):

**Usuarios (una variante cada uno):**

| | Correo | Variante |
|---|---|---|
| **A** | `qa-edicion-principal@gsti-tests.local` | Usuario principal (`root`) con acceso a la empresa de prueba **y** a la ajena |

(Una sola variante: la HU no cambia quién puede editar ni dar de baja; lo que se prueba es la empresa del empleado, y el usuario principal, con acceso a las dos, es quien lo demuestra.)

**Datos de negocio imprescindibles:** dos empresas (`qa-edicion-prueba`, `qa-edicion-ajena`); en la de prueba un departamento activo (`QA-EDI-DEPT-ACTIVO`), un puesto activo (`QA-EDI-POS-ACTIVO`) y un departamento dado de baja (`QA-EDI-DEPT-BAJA`, sembrarlo, asignarlo y darlo de baja después); en la ajena un departamento (`QA-EDI-DEPT-AJENO`) y un puesto (`QA-EDI-POS-AJENO`). Empleados activos de la empresa de prueba:

| Código de nómina | Estructura |
|---|---|
| `QA-EDI-01` | Sin departamento ni puesto (se le corrige el correo y luego se da de baja desde la ficha) |
| `QA-EDI-02` | Sin departamento ni puesto (se le asigna departamento y puesto de su empresa) |
| `QA-EDI-03` | Apunta al departamento dado de baja; con el puesto activo (se le corrige el correo) |
| `QA-EDI-04` | Sin departamento ni puesto (recibe los intentos rechazados: ajeno, eliminado, nivel sin puesto, dato mal formado) |
| `QA-EDI-05` | Sin departamento ni puesto (se da de baja desde la lista) |

**Consultas que entregan los ids** (van al manual, en Preparar; el manual nunca trae un número):

```sql
SELECT employee_id AS id FROM employees
WHERE employee_payroll_code = 'QA-EDI-01' AND employee_deleted_at IS NULL;
```

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-edicion-prueba';
```

```sql
SELECT department_id FROM departments WHERE department_code = 'QA-EDI-DEPT-ACTIVO';
SELECT position_id FROM positions WHERE position_code = 'QA-EDI-POS-ACTIVO';
SELECT department_id FROM departments WHERE department_code = 'QA-EDI-DEPT-BAJA';
SELECT department_id FROM departments WHERE department_code = 'QA-EDI-DEPT-AJENO';
SELECT position_id FROM positions WHERE position_code = 'QA-EDI-POS-AJENO';
```

Correr el seeder y confirmar que termina sin error:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

- [ ] **Step 3: "Alcance — solo la HU"**

La regla: *"Documentar únicamente lo que la historia pide validar. No pasos de configuración manual si se pueden sembrar. No casos borde ni regresiones. Si un caso de la HU no se puede provocar en un ambiente sembrado, se declara en una línea y no se le inventan pasos."*

Escenarios, uno por "cómo sabremos que quedó bien" y por "lo que no debe pasar", en este orden y con estos usuarios/empleados:

1. **A** corrige el correo de `QA-EDI-01` (`PUT`, body completo con `departmentId: null` y `positionId: null`) → `201`; en `data.employee`, `departmentId` y `positionId` en `null`, y ningún texto "Sin Departamento".
2. **A** registra la baja de `QA-EDI-01` desde la ficha (`PUT` con `employeeTerminatedDate`, `employeeTerminationModality: "Renuncia"`, `employeeTerminationType: "Cambio de Residencia"`) → `201`, estructura sigue en `null`.
3. **A** asigna a `QA-EDI-02` el departamento y el puesto activos de su empresa → `201`, `data.employee.departmentId` y `positionId` con los ids asignados.
4. **A** corrige el correo de `QA-EDI-03` reenviando el departamento dado de baja → `201`, `departmentId` conserva ese mismo id.
5. **A** intenta asignar a `QA-EDI-04` el departamento ajeno → `400`, `message: "El departamento no existe en la empresa del empleado"`; consultar `QA-EDI-04` y confirmar que sigue sin departamento.
6. **A** intenta asignar a `QA-EDI-04` el puesto ajeno → `400`, `message: "El puesto no existe en la empresa del empleado"`.
7. **A** intenta asignar a `QA-EDI-04` el departamento dado de baja → `400`, mismo mensaje que el escenario 5 (no se distingue).
8. **A** intenta ponerle a `QA-EDI-04` un nivel de puesto (`positionLevelConfigId`) sin puesto → `422`, `code: "ELVL.CONF.001"`.
9. **A** envía `departmentId: 0` para `QA-EDI-04` → `400`, `title: "Error de validación"` (y no un `500`).
10. **A** da de baja a `QA-EDI-05` desde la lista (`DELETE` con fecha, modalidad y tipo) → `201`.

Declarar en una línea, sin inventarle pasos, el caso que no se puede provocar con un cliente de API sobre el ambiente sembrado: **"al cambiar a un empleado de empresa, su departamento se revisa contra la nueva"** exige que el usuario opere con el header de una empresa y mueva al empleado a otra; se cubre con la prueba automatizada del expediente técnico.

- [ ] **Step 4: "Formato — contrato, no código"**

La regla: *"Cada paso indica el endpoint (método + ruta + body si aplica) y el response exacto (status + body). Nunca 'debería fallar': el status y el identificador del error van escritos literales."* *"Permitido: métodos y rutas HTTP, bodies JSON, query params, status, envelopes, códigos de error, SQL de preparación o de consulta de ids, correos y contraseñas de prueba."* *"Prohibido: rutas de archivos, nombres de clases, servicios, validadores o middlewares, el lenguaje del backend, y cualquier 'revisa el código de X'. Quien prueba no abre el repo."* *"La auth se asume resuelta por el cliente: no se documenta el login salvo que la HU lo cambie."* *"Los bodies de ejemplo van completos y pegables, con `"..."` solo en lo que no importa al caso."*

Para esta HU eso significa: el body del `PUT` es el registro completo del empleado (la ficha lo reenvía todo) — va entero y pegable, y `"..."` solo en los campos que no importan al escenario (nombre, código, tipo, jornada); `departmentId` y `positionId` **siempre** visibles porque son lo que se prueba. Los responses `201`/`400`/`422` con `type`, `title`, `message` (y `code` en el 422) literales, tal como se anotaron en el Step 1.

- [ ] **Step 5: "Qué significa cada dato — en lenguaje de negocio, por escenario"**

La regla: *"Después del response exacto de cada escenario, agrega una lista corta que explique en lenguaje llano qué significa cada dato que ese escenario verifica."* *"Un renglón por dato: `campo`: qué es en palabras simples."* *"Cero términos técnicos y cero jerga de código: nada de tipos, formatos internos ni nombres de columnas."*

**"Valores fijos — se enumeran y explican todos":** *"Si un dato solo puede tomar ciertos valores cerrados… se listan todos con lo que cada uno quiere decir, en el primer escenario donde aparece el dato."* *"Cada valor lleva su traducción a lenguaje sencillo: nunca se deja el valor crudo solo."* En esta HU son valores fijos: `type` (`success`: se guardó; `warning`: no se guardó y el mensaje explica por qué; `error`: no se guardó por un dato que no cuadra con el puesto — el del escenario 8), `employeeTerminationModality` y `employeeTerminationType` (listar los del catálogo que use el manual y decir qué significan; los demás valores del catálogo se listan igual y se declara en una línea que no se provocan aquí).

**"Sin redundancia — cada dato se explica una sola vez":** *"Cada clave-valor se explica una sola vez, en el primer escenario donde aparece. En los siguientes escenarios no se vuelve a explicar."* *"Si el escenario no trae datos nuevos, no lleva lista: se verifica remitiendo al escenario donde ya se explicó, p. ej. (Los datos son los ya explicados en el Escenario 1.)"* *"Si solo un valor es nuevo… se explica solo ese con `Qué significa lo nuevo aquí:`."* En esta HU: `departmentId`/`positionId` vacíos se explican en el escenario 1; con valor, en el 3; el `message` de rechazo por departamento en el 5 y el de puesto en el 6 (el 7 remite al 5); `code` en el 8; `title: Error de validación` en el 9.

- [ ] **Step 6: "Ejemplo cotidiano — que lo entienda cualquiera"**

La regla: *"Después de Problema / Solución, agrega un `Ejemplo:` de 2-4 líneas que ponga el mismo problema en un contexto común y sencillo (tienda, escuela, casa, fútbol, videojuegos) que un adolescente entienda sin conocer el producto ni el negocio."* *"Lenguaje llano: cero términos de negocio y cero términos técnicos."* *"No inventa casos nuevos: solo ilustra con lo cotidiano lo ya dicho en Problema / Solución."* *"Formato: una línea `Ejemplo: ...`."*

Contexto sugerido para esta HU: una lista de alumnos donde a uno que todavía no tiene salón sí se le puede corregir el nombre y darlo de baja, pero solo se le puede poner un salón que exista en SU escuela, no uno de la escuela de al lado. Redactarlo sin usar "empleado", "departamento", "puesto" ni "empresa".

- [ ] **Step 7: "Interruptores globales — avisar y restaurar" y "Estructura mínima"**

La regla (interruptores): *"Si el recorrido enciende una bandera que no está acotada al tenant o a la empresa de prueba, el manual lo advierte antes del primer escenario… y termina con un paso de limpieza que la deja como estaba."* Esta HU no enciende ninguna: **sin sección de Limpieza**.

La regla (estructura mínima): *"1. Problema / Solución / Ejemplo… 2. Preparar (seeder + tabla de usuarios con la variante de cada uno) 3. Un escenario por variante, cada uno con su endpoint y su response exacto 4. Limpieza (solo si se tocó un interruptor global) 5. Checklist (una casilla por escenario)."* Armar el manual exactamente en ese orden: Problema / Solución / `Ejemplo:` → Preparar → 10 escenarios (Step 3) → Checklist con 10 casillas.

- [ ] **Step 8: Recorrer el manual de punta a punta contra el servidor local**

Levantar el API (`npm run dev`), correr el seeder, y ejecutar los 10 escenarios con un cliente de API. Cada response del manual tiene que coincidir con el observado; si no coincide, corregir el manual (o el código, si el manual tenía razón).

- [ ] **Step 9: Commit (solo el manual)**

```bash
git add docs/superpowers/plans/2026-09-17-editar-empleado-sin-estructura-qa-api.md
git commit -m "docs(USRH1788466831270): manual de QA de API de la edicion sin estructura

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

El seeder `_tmp_do_not_commit_qa_seeder.ts` no se agrega (está en `.git/info/exclude`). `git status` debe seguir mostrando solo `pnpm-lock.yaml` y `pnpm-workspace.yaml` como cambios ajenos al plan.

---

## Cierre: verificación antes de abrir el PR

- [ ] Suite completa de lo tocado:

```bash
node ace test unit --files="employee_update_validator" --files="employee_structure_resolution"
node ace test functional --files="employee_structure_service" --files="employee_verify_info_exist" --files="employee_edicion_sin_estructura" --files="employees_write_permission_gate" --files="employee_position_level"
npm run typecheck && npm run lint
```

- [ ] `git log --oneline multitenant..HEAD` muestra 5 commits con prefijo `USRH1788466831270` (feat, feat, refactor, feat, docs).
- [ ] `git status` no incluye `pnpm-lock.yaml`, `pnpm-workspace.yaml` ni el seeder temporal en ningún commit.
- [ ] Sin migraciones: no hace falta `migration:fresh`.

---

## Self-review (hecho al escribir el plan)

**Cobertura de la HU → Task:**

| Requisito | Task |
|---|---|
| Regla 1 (no obligatorios al editar; baja no exige) | 1 (validador), 3 (`verifyInfoExist`), 4 (tests PUT/DELETE sin estructura) |
| Regla 2 (conservar exacto, sin relleno) | 2 (`resolveEmployeeStructureUpdate`), 4 (controller copia efectivos; test "siguen vacíos") |
| Regla 3 (distinto → existe, vigente, de la empresa del empleado) | 2 (`verifyAssignable`), 4 (tests ajeno con `root`) |
| Regla 4 (comparar contra lo guardado; eco de eliminado no bloquea) | 2 (test unitario), 4 (test "eco de departamento eliminado") |
| Regla 5 (cambio de empresa revisa ambos) | 2 (test unitario), 4 (test HTTP de rechazo) |
| Regla 6 (mismo mensaje) | 2 (test funcional), 4 (test HTTP eliminado/inexistente/ajeno) |
| Regla 7 (nivel solo con puesto; cuenta el guardado) | 4 (`effectivePositionId: structure.positionId`, test 422) |
| Regla 8 (rechazo por datos = mensaje, no pantalla general) | 4 (`E_VALIDATION_ERROR` → 400, test) |
| Regla 9 (`null` deja sin asignar) | 1 (validador acepta `null`), 2 (test unitario) |
| Intentos rechazados al registro de accesos bloqueados | 4 (`ScopeDeniedLogService.log`) |
| Alta sin cambios | 3 (`verifyStructureExist` en `store`) |
| Manual de QA | 5 |

**Placeholders:** ninguno; cada step con código lo trae completo.

**Consistencia de nombres entre tasks:** `resolveEmployeeStructureUpdate`, `EmployeeStructureService.verifyAssignable`, `EmployeeStructureResolution{ departmentId, positionId, businessUnitId, departmentIdToVerify, positionIdToVerify }`, `EmployeeStructureVerification{ ok, field, requestedId }`, `verifyStructureExist`, claves i18n `employee_<field>_not_in_business_unit_{title,message}` con `field ∈ {'department','position'}` — iguales en Tasks 2, 3 y 4.
