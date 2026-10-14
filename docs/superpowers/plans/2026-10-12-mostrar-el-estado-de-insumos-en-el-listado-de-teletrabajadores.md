# Mostrar el estado de insumos en el listado de teletrabajadores — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `GET /api/nom037/telework-workers` agregue a cada fila, y solo con `supplies:read`, el `employeeSlug` y el `teleworkSuppliesSummary` calculados en una sola llamada por página al servicio de `VLRH-H1791485252682`, y que el BO muestre la columna **Insumos** y convierta el nombre en enlace a la sección Activos de la ficha cuando el usuario además tiene `employees:read`; de paso, el 500 del índice deja de devolver `error.message`.

**Architecture:** En el API, `TeleworkWorkerService` recibe un lector inyectable (la factoría `makeTeleworkSuppliesService()`) y una opción `includeSuppliesSummary`; con ella, tras paginar llama **una** vez a `summarizeForEmployees(scope, idsDeLaPágina)` y mezcla el resumen por fila con spread condicional. El controller resuelve el permiso con `RoleService.hasAccess` sobre la declaración `SUPPLIES_PERMISSION_DECLARATIONS.showEmployeeTeleworkSupplies` y **omite las llaves** (no `null`) sin permiso, para que el dato no viaje nunca al cliente. En el BO, `pages/telework-workers` gana un helper puro de dominio (ruta de la ficha y chips de la celda), un composable de permisos que suma `canReadSupplies` y `canOpenEmployee` con `hasAccess` fail-closed, y la columna Insumos con el nombre como `NuxtLink`.

**Tech Stack:** AdonisJS 6 (Japa, Lucid `db.from`, `@adonisjs/core/services/logger`), MySQL, Nuxt 3 / Vue 3 `setup` con vitest, PrimeVue (`DataTable`, `Column`, `Tag`).

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791485253301.md` (Código `VLRH-H1791485253301`, SP 2, rama `feature/VLRH-H1791485253301-mostrar-el-estado-de-insumos-en-el-listado-de` en ambos repos, base y target la rama de `VLRH-H1791485252682`). El plan argumenta desde el spec: léelo completo antes de cada tarea. Sus anclas se revalidaron contra el código el 2026-10-12 (api `56cda8a2` = bo `b18992b7` = la punta de la rama de `VLRH-H1791485252682`, que es la rama base); el drift trivial se corrige al momento, el de alcance/contrato/regla se escala a Wilvardo.

## Restricciones globales

- **Ramas:** `feature/VLRH-H1791485253301-mostrar-el-estado-de-insumos-en-el-listado-de` en ambos repos, ya creadas y limpias, apuntando a la punta de la rama de `VLRH-H1791485252682` (api `56cda8a2`, bo `b18992b7`). No se crea PR ni se despliega: el plan termina en la verificación automatizada y la entrega del manual de QA.
- **Cero escrituras nuevas:** sin migración, sin tabla, sin columna, sin seeder. El `employeeSlug` sale de `employees.employee_slug` (ya existe, `app/models/employee.ts:198`) del mismo `Employee` que pagina el índice; el resumen entra por `employee_id` (dueño `VLRH-H1791485252682`).
- **Un solo cálculo en todo el sistema (R5/regla 4):** el listado **nunca** calcula el estado de insumos. Consume `summarizeForEmployees` por la **factoría** `makeTeleworkSuppliesService()`, jamás `new TeleworkSuppliesService(...)`: `VLRH-H1791306075599` cambia lo que la factoría inyecta sin cambiar su firma pública.
- **No tocar** (censo `no-tocado` + no-objetivos + CA-14): `app/modules/assets/**` (servicio, reglas, repositorio, DTO; los edita `VLRH-H1791485252682` / lo extiende `VLRH-H1791306075599`), `components/employeeTeleworkSuppliesPanel/**`, `app/constants/system_modules_menu/system_modules.constant.ts`, `listAllForNotification` / `toRecipient` / `TeleworkWorkerRecipient`, `resources/langs/*.json`, y nada de `valanserh-app-employee`. `git diff --name-only <base>...HEAD` no puede contener nada bajo `app/modules/assets/` ni bajo `components/employeeTeleworkSuppliesPanel/` (CA-14).
- **Llave ausente, no `null`:** sin `supplies:read`, la fila lleva exactamente las siete llaves de hoy (`Object.hasOwn(row, 'employeeSlug') === false`), y `summarizeForEmployees` no se llama **ni una** vez (CA-7, CA-15).
- **Quién aparece no cambia (regla 8):** ni el filtro `>= 40%` inclusivo, ni la modalidad, ni el orden, ni la búsqueda, ni la paginación se tocan.
- **Errores sin fuga (CA-12):** el 500 del índice responde `detail: null`; el mensaje interno va al log con `logger.error({ err: error }, 'telework_workers.index')`. No se vuelve a meter `error.message` en ninguna respuesta del controller.
- **Sin errores ni claves i18n nuevos en el API** (§11 del spec): el BO arma los textos de la celda.
- **Tipado:** cero `any`. La fila con resumen va tipada por unión (`TeleworkWorkerRowWithSupplies`), y el campo opcional se arma con spread condicional, nunca `undefined` explícito. Comentarios y JSDoc en español, identificadores en inglés.
- **i18n es + en** en el BO, con parada de claves (`npm run lint:i18n`); las claves nuevas del listado son literales (las resuelve el lint) y el rótulo `table.percentage` pasa de "% remoto" a "% de teletrabajo".
- **Commits:** Conventional Commits en español (tipo en inglés, descripción imperativa), cuerpo con el porqué y `Refs: VLRH-H1791485253301`; el hook solo corre eslint (no pasa `prettier --check` sobre archivos ajenos).
- **BD de pruebas:** `sae_pruebas` (`NODE_ENV=test`). Si el esquema va atrás: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (un esquema atrasado produce fallos falsos).
- **Fallos preexistentes (línea base, fuera de alcance):** ver "Definition of Done — líneas base medidas".

## Review Focus

Entradas o condiciones que el spec implica pero ningún CA ejercita, y que por eso son las más propensas a morder a un usuario real. Cada línea lleva su prueba en la tarea dueña del código.

1. **Página vacía no consulta al lector.** Un `search` que no deja teletrabajadores (o una página más allá de la última) devuelve `data: []` y **cero** llamadas a `summarizeForEmployees`: `summarizeForEmployees(scope, [])` devolvería un `Map` vacío, pero la llamada sobra. Prueba en Tarea 2 (caso "página vacía sin lector").
2. **`scope` vacío (`businessUnitScope ?? []`) no abre la puerta.** El índice sin alcance de empresa responde `data: []` (Knex `1 = 0` en `whereIn`) y el lector no se llama; nunca se cuela el resumen de otra empresa. Prueba en Tarea 2 (mismo spec: caso de alcance vacío).
3. **El resumen ausente no rompe la fila (CA-11).** Si `summarizeForEmployees` no devuelve entrada para un `employeeId` de la página (colaborador fuera del alcance del lector, o página con un `employeeId` que el lector no reconoce), la fila queda con `employeeSlug` y **sin** `teleworkSuppliesSummary`, y el BO pinta la celda vacía y el enlace sigue funcionando. Prueba en Tarea 3 (`telework-worker.helpers.spec.ts`, caso CA-11) y en Tarea 2 (servicio: fila con slug sin resumen).
4. **Renombre del rótulo de porcentaje.** `table.percentage` pasa de "% remoto"/"Remote %" a "% de teletrabajo"/"Telework %" en **ambos idiomas**: un solo término por dato, el mismo de la ficha y de la norma. Prueba en Tarea 3 (aserción de claves del rótulo en el spec de los helpers) más la parada `npm run lint:i18n`.
5. **Fallo del lector no cambia el contrato de sin permiso.** Con `solo-listado` (sin `supplies:read`) un lector que explota no debe poder afectar la respuesta: el lector no se llama, la respuesta es 200 con las siete llaves. Prueba en Tarea 2 (spec funcional: caso CA-15, con el espía armado para explotar si lo llaman).

---

### Tarea 1 (gsti-rh-api): el resumen por lote llega al servicio del listado

El corazón de la HU en el API: el servicio gana lector inyectable y opción `includeSuppliesSummary`, y arma cada fila con `employeeSlug` y, cuando hay resumen, `teleworkSuppliesSummary`. El controller todavía no cambia: con la opción por defecto en `false`, `list` es idéntico a hoy.

**Files:**
- Modify: `app/services/telework_worker_service.ts`
- Test: Create `tests/functional/telework_workers_index.spec.ts` (grupo "servicio", sin HTTP; la Tarea 2 agrega el grupo HTTP en el mismo archivo)

**Interfaces:**
- Consumes: `makeTeleworkSuppliesService()` y el tipo `TeleworkSuppliesService` de `#modules/assets/telework_supplies.service`; `TeleworkSuppliesSummary` de `#modules/assets/dto/telework_supplies.dto`; `EMPLOYEE_WORK_SCHEDULE`, `TELEWORK_LEGAL_THRESHOLD_PERCENT` (ya importados en el archivo).
- Produces (nombres contrato; la Tarea 2 depende de ellos):
  - `export interface TeleworkWorkerListOptions { includeSuppliesSummary?: boolean }`.
  - `export type TeleworkWorkerRowWithSupplies = TeleworkWorkerRow & { employeeSlug: string; teleworkSuppliesSummary?: TeleworkSuppliesSummary }`. `TeleworkWorkerRow` se queda con sus siete campos, intacto.
  - `constructor(private readonly suppliesSummary: Pick<TeleworkSuppliesService, 'summarizeForEmployees'> = makeTeleworkSuppliesService())` — el controller sigue haciendo `new TeleworkWorkerService()`.
  - `async list(filters: TeleworkWorkerFilters, scope: number[], options: TeleworkWorkerListOptions = {}): Promise<{ meta: TeleworkWorkerMeta; data: TeleworkWorkerRow[] | TeleworkWorkerRowWithSupplies[] }>` (el tipo del `meta` es el que ya devuelve `paginate()`; no se nombra uno nuevo).
  - `toRow(employee: Employee): TeleworkWorkerRow` **no cambia**; el resumen se mezcla sobre su resultado, no dentro del mapper de hoy.

- [ ] **Paso 1: escribir el test que falla (servicio, sin HTTP)**

En `tests/functional/telework_workers_index.spec.ts`, cabecera copiada de `tests/functional/assets_telework_supplies.spec.ts` (imports de `@japa/runner`, `db`, `makeTeleworkSuppliesService`, `TeleworkSuppliesService`, `createEmployeeFixture`, `createTenantActor`, `cleanupEmployeeFixture`, `cleanupTenantActor`, `required`, y los helpers de organigrama que use el fixture). Cabecera de comentario: "Estado de insumos en el listado de teletrabajadores (NOM-037 5.1, VLRH-H1791485253301) — parte 1: el servicio, sin HTTP".

```ts
test.group('Estado de insumos en el listado — servicio (sin HTTP)', (group) => {
  let actorA: TenantActor | null = null
  let employeeA: EmployeeFixture | null = null

  const buIdA = () => required(actorA, 'el actor de A').businessUnit.businessUnitId
  const employeeIdA = () => required(employeeA, 'el colaborador de A').employee.employeeId

  group.setup(async () => {
    actorA = await createTenantActor('listado-insumos-servicio-a')
    employeeA = await createEmployeeFixture(buIdA(), `listA-${RUN.slice(-6)}`)
    await db
      .from('employees')
      .where('employee_id', employeeIdA())
      .update({
        employee_work_schedule: 'Remote',
        employee_telework_percentage: 100,
        employee_deleted_at: null,
      })
  })
  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeA)
    await cleanupTenantActor(actorA)
  })

  test('sin la opción, la fila queda con sus siete llaves y no se llama al lector', async ({
    assert,
  }) => {
    const calls: number[] = []
    const spy = {
      summarizeForEmployees: async () => {
        calls.push(1)
        return new Map<number, TeleworkSuppliesSummary>()
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await service.list({ page: 1, limit: 5 }, [buIdA()])

    assert.lengthOf(page.data, 1)
    assert.deepEqual(Object.keys(page.data[0]).sort(), [
      'employeeCode',
      'employeeId',
      'fullName',
      'position',
      'teleworkPercentage',
      'workSchedule',
      'workplaces',
    ])
    assert.equal(calls.length, 0)
  })

  test('con la opción, la fila trae employeeSlug y el resumen del bucle, en una sola llamada', async ({
    assert,
  }) => {
    const seen: Array<{ businessUnitIds: readonly number[]; employeeIds: readonly number[] }> = []
    const real = makeTeleworkSuppliesService()
    const spy = {
      summarizeForEmployees: async (
        businessUnitIds: readonly number[],
        employeeIds: readonly number[]
      ) => {
        seen.push({ businessUnitIds, employeeIds })
        return real.summarizeForEmployees(businessUnitIds, employeeIds)
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await service.list({ page: 1, limit: 5 }, [buIdA()], {
      includeSuppliesSummary: true,
    })

    assert.equal(seen.length, 1)
    assert.deepEqual(seen[0].businessUnitIds, [buIdA()])
    assert.deepEqual(seen[0].employeeIds, [employeeIdA()])

    const row = page.data[0] as TeleworkWorkerRowWithSupplies
    assert.equal(row.employeeSlug, required(employeeA, 'el colaborador de A').employee.employeeSlug)
    assert.equal(row.teleworkSuppliesSummary?.applies, true)
    assert.equal(row.teleworkSuppliesSummary?.isLegallyRequired, true)
    assert.equal(row.teleworkSuppliesSummary?.uncoveredCount, 1)
  })

  test('Review Focus 1 — una página sin filas no consulta al lector', async ({ assert }) => {
    let calls = 0
    const spy = {
      summarizeForEmployees: async () => {
        calls += 1
        return new Map<number, TeleworkSuppliesSummary>()
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await service.list({ search: 'zzz-no-existe-zzz', page: 1, limit: 5 }, [buIdA()], {
      includeSuppliesSummary: true,
    })

    assert.lengthOf(page.data, 0)
    assert.equal(calls, 0)
  })

  test('Review Focus 2 — alcance vacío devuelve página vacía y no consulta al lector', async ({
    assert,
  }) => {
    let calls = 0
    const spy = {
      summarizeForEmployees: async () => {
        calls += 1
        return new Map<number, TeleworkSuppliesSummary>()
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await service.list({ page: 1, limit: 5 }, [], { includeSuppliesSummary: true })

    assert.lengthOf(page.data, 0)
    assert.equal(calls, 0)
  })

  test('Review Focus 3 — sin entrada en el mapa, la fila queda con slug y sin resumen', async ({
    assert,
  }) => {
    const service = new TeleworkWorkerService({
      summarizeForEmployees: async () => new Map<number, TeleworkSuppliesSummary>(),
    })

    const page = await service.list({ page: 1, limit: 5 }, [buIdA()], {
      includeSuppliesSummary: true,
    })

    const row = page.data[0] as TeleworkWorkerRowWithSupplies
    assert.equal(row.employeeSlug, required(employeeA, 'el colaborador de A').employee.employeeSlug)
    assert.isFalse(Object.hasOwn(row, 'teleworkSuppliesSummary'))
  })
})
```

`RUN` y el import del tipo `TeleworkWorkerRowWithSupplies` van en la cabecera del archivo; al final del grupo, `TeleworkWorkerService` se importa de `#services/telework_worker_service` y `TeleworkWorkerListOptions`/`TeleworkWorkerRowWithSupplies` del mismo módulo como `import type`.

- [ ] **Paso 2: correr el test y verlo fallar**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_workers_index.spec.ts"`
Expected: **el primer caso ya pasa** (con la opción en `false` el comportamiento es el de hoy: es la red de seguridad del contrato intacto) y los cuatro restantes fallan: los tres que piden la opción con `TypeError: ... is not a function` o `row.employeeSlug` indefinido, porque el servicio todavía no acepta lector ni opción.

- [ ] **Paso 3: implementar el lector inyectable y la opción en `app/services/telework_worker_service.ts`**

Imports nuevos:

```ts
import {
  makeTeleworkSuppliesService,
  type TeleworkSuppliesService,
} from '#modules/assets/telework_supplies.service'
import type { TeleworkSuppliesSummary } from '#modules/assets/dto/telework_supplies.dto'
```

Tipos nuevos, justo debajo de `TeleworkWorkerRow`:

```ts
/** Opciones de `list`: el resumen de insumos solo se pide cuando el RBAC lo permite. */
export interface TeleworkWorkerListOptions {
  includeSuppliesSummary?: boolean
}

/** Fila del listado con el identificador de la ficha y, con permiso, el resumen de insumos. */
export type TeleworkWorkerRowWithSupplies = TeleworkWorkerRow & {
  employeeSlug: string
  teleworkSuppliesSummary?: TeleworkSuppliesSummary
}
```

Constructor (antes de `list`), con su JSDoc: el lector por defecto es la factoría, y el parámetro existe para que los specs cuenten llamadas sin tocar la factoría ajena.

```ts
constructor(
  private readonly suppliesSummary: Pick<TeleworkSuppliesService, 'summarizeForEmployees'> =
    makeTeleworkSuppliesService()
) {}
```

`list` reescrito (el JSDoc de hoy se amplía, no se reescribe):

```ts
async list(
  filters: TeleworkWorkerFilters,
  scope: number[],
  options: TeleworkWorkerListOptions = {}
) {
  const employees = await Employee.query()
    // … el encadenado actual, SIN cambios, hasta:
    .paginate(filters.page, filters.limit)

  const serialized = employees.toJSON()
  const rows = employees.all() as Employee[]

  if (!options.includeSuppliesSummary) {
    return { meta: serialized.meta, data: rows.map((employee) => this.toRow(employee)) }
  }

  // Una sola lectura para toda la página; el alcance es el mismo del índice.
  const summaries = await this.summarizePage(scope, rows)
  return {
    meta: serialized.meta,
    data: rows.map((employee) => this.toRowWithSupplies(employee, summaries.get(employee.employeeId))),
  }
}
```

Dos privados nuevos:

```ts
/**
 * Resumen de insumos de la página en UNA llamada por lote. Página vacía o
 * alcance vacío → mapa vacío sin consultar (el servicio de insumos también
 * devolvería vacío, pero la llamada sobra).
 */
private async summarizePage(scope: number[], employees: Employee[]) {
  if (employees.length === 0 || scope.length === 0) {
    return new Map<number, TeleworkSuppliesSummary>()
  }
  return this.suppliesSummary.summarizeForEmployees(
    scope,
    employees.map((employee) => employee.employeeId)
  )
}

/** Fila con el slug de la ficha y, solo si el colaborador trae resumen, el resumen. */
private toRowWithSupplies(
  employee: Employee,
  summary: TeleworkSuppliesSummary | undefined
): TeleworkWorkerRowWithSupplies {
  return {
    ...this.toRow(employee),
    employeeSlug: employee.employeeSlug,
    ...(summary ? { teleworkSuppliesSummary: summary } : {}),
  }
}
```

`listAllForNotification`, `toRecipient`, `TeleworkWorkerRecipient`, `toRow`, `buildFullName`, `resolveRecipientEmail` y `toWorkplace` no se tocan.

- [ ] **Paso 4: correr el test y verlo pasar**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_workers_index.spec.ts"`
Expected: PASSED, 5 casos.

- [ ] **Paso 5: typecheck y eslint de lo tocado**

Run: `npm run typecheck` → exit 0, 0 errores.
Run: `npx eslint app/services/telework_worker_service.ts tests/functional/telework_workers_index.spec.ts` → 0 problemas.

- [ ] **Paso 6: commit**

```bash
git add app/services/telework_worker_service.ts tests/functional/telework_workers_index.spec.ts
git commit -m "feat(teletrabajadores): agrega el resumen de insumos al servicio del listado

El listado lee el resumen por lote del servicio de insumos en una sola
llamada por pagina, con el mismo alcance de empresa del indice. La opcion
includeSuppliesSummary deja el comportamiento actual intacto por defecto.

Refs: VLRH-H1791485253301"
```

---

### Tarea 2 (gsti-rh-api): el gate del dato en el controller y el 500 sin fuga

El controller resuelve `supplies:read` y decide si el resumen viaja; sin permiso, la fila pierde el slug y el resumen (llave ausente) y el lector no se llama. El 500 deja de exponer el mensaje interno.

**Files:**
- Modify: `app/controllers/telework_worker_controller.ts`
- Test: Modify `tests/functional/telework_workers_index.spec.ts` (grupo HTTP nuevo en el mismo archivo)

**Interfaces:**
- Consumes: `TeleworkWorkerService.list(filters, scope, options)` y `TeleworkWorkerRowWithSupplies` (Tarea 1); `SUPPLIES_PERMISSION_DECLARATIONS.showEmployeeTeleworkSupplies.module` (`app/constants/supplies_permission_declarations.ts`, módulo `'supplies'`); `RoleService.hasAccess(roleId, module, action)` (`app/services/role_service.ts`, con bypass de root y owner); `logger` de `@adonisjs/core/services/logger`; `TWK_ERROR_CODES` (ya importado).
- Produces: nada que consuman tareas posteriores del API. El contrato HTTP (sección 11 del spec) queda fijo: 200 con llaves extra solo con `supplies:read`; 403 `TWK.AUTH.001`/`sin-permiso`; 500 `TWK.SYS.001`/`error-inesperado` con `detail: null`.

- [ ] **Paso 1: escribir el test que falla (grupo HTTP)**

Añade al final de `tests/functional/telework_workers_index.spec.ts` un `test.group('Estado de insumos en el listado — endpoint HTTP', ...)`. Cabecera de comentario: "parte 2: la superficie HTTP de `GET /api/nom037/telework-workers`. Convenciones del molde `telework_compliance_settings.spec.ts` (actores con email único, cleanup explícito, header `X-Business-Unit-Id` con el UUID público de la empresa); activos, tipos con categoría y resguardos con la forma de `assets_telework_supplies.spec.ts`.".

Andamiaje del grupo (fuera de los `test`, al nivel del grupo):

```ts
/** Espía del lector: cuenta llamadas, captura argumentos y puede reventar (CA-12). */
interface SuppliesSpy {
  calls: Array<{ businessUnitIds: readonly number[]; employeeIds: readonly number[] }>
  shouldThrow: boolean
}

const prototype = TeleworkSuppliesService.prototype
let originalSummarize: typeof prototype.summarizeForEmployees
let spy: SuppliesSpy

function installSpy(): SuppliesSpy {
  const created: SuppliesSpy = { calls: [], shouldThrow: false }
  originalSummarize = prototype.summarizeForEmployees
  prototype.summarizeForEmployees = async function (businessUnitIds, employeeIds) {
    if (created.shouldThrow) throw new Error('fallo interno de prueba')
    created.calls.push({ businessUnitIds, employeeIds })
    return originalSummarize.call(this, businessUnitIds, employeeIds)
  }
  return created
}

function restoreSpy(): void {
  if (originalSummarize) prototype.summarizeForEmployees = originalSummarize
}
```

`group.setup`: `await assertModuleEnforced('telework-workers')`; `await assertModuleEnforced('supplies')`; `actorLectura = await createTenantActor('listado-insumos-lectura')`; `await grantModulePermissions(actorLectura, 'telework-workers', ['read'])`; `await addRoleModulePermissions(actorLectura.role, 'supplies', ['read'])`; `await addRoleModulePermissions(actorLectura.role, 'employees', ['read'])`; `actorSoloListado = await createTenantActor('listado-insumos-solo-listado')`; `await grantModulePermissions(actorSoloListado, 'telework-workers', ['read'])`; `actorEmpresaB = await createTenantActor('listado-insumos-b')`; `await grantModulePermissions(actorEmpresaB, 'telework-workers', ['read'])`. Cada `group.setup`/cada `test` envuelve el espía: `spy = installSpy()` al inicio del setup y `restoreSpy()` en `group.teardown` y en un `group.each.teardown`.

Fixtures de empleados (función local, por tabla, como `assets_telework_supplies.spec.ts`):

```ts
/** Colaborador del listado: modalidad y porcentaje por tabla (el fixture nace Onsite). */
async function makeTeleworker(
  businessUnitId: number,
  label: string,
  schedule: 'Remote' | 'Hybrid',
  percentage: number
): Promise<EmployeeFixture> {
  const fixture = await createEmployeeFixture(businessUnitId, `list-${label}-${RUN.slice(-6)}`)
  await db.from('employees').where('employee_id', fixture.employee.employeeId).update({
    employee_work_schedule: schedule,
    employee_telework_percentage: percentage,
  })
  return fixture
}
```

`makeSupplyType(businessUnitId, category)` inserta en `supply_types` con `supply_type_telework_category` (silla `ergonomic_chair`, cómputo `computing_equipment`) y devuelve el id; `makeAsset(businessUnitId, typeId, name)` inserta en `supplies` con `supply_status: 'active'`; `assign(employeeId, supplyId, status)` inserta en `employee_supplies` con `employee_supply_status` (`'active'` o `'shipping'`) y fecha; `signContract(assignmentId, businessUnitId)` inserta en `employee_supplies_response_contracts` con `employee_supply_response_contract_deleted_at: null`. Todas acumulan ids en arreglos para el `group.teardown`, que borra en orden inverso (contratos → asignaciones → activos → tipos → empleados → personas → `cleanupOrgChartFixtures` → actores).

Casos (cada uno abre con su `Objetivo:`):

- **CA-1 completo.** Ana al 100% Remote con silla y cómputo `active`, ambos con resguardo firmado, sin aditamento. `GET /api/nom037/telework-workers` como `actorLectura` → 200; la fila trae `employeeSlug === employee.employeeSlug` y `teleworkSuppliesSummary` `assert.containsSubset` de `{ applies: true, isLegallyRequired: true, deliveredCount: 2, shippingCount: 0, ownEquipmentCount: 0, uncoveredCount: 0, unsignedCustodyCount: 0 }`.
- **CA-2 sin cubrir.** Luis al 60% Hybrid con solo la silla entregada y firmada → `uncoveredCount: 1`, `deliveredCount: 1`.
- **CA-3 en envío.** Marta al 100% con silla entregada y la laptop en `shipping` → `shippingCount: 1`, `uncoveredCount: 0`.
- **CA-4 resguardo.** Pedro al 100% con silla y laptop `active` **sin** contrato de resguardo en la silla → `unsignedCustodyCount: 1`.
- **CA-5 umbral.** Sofía Hybrid al 40% exacto → aparece y su resumen trae `isLegallyRequired: true`.
- **CA-7 gate del dato.** `actorSoloListado` → 200, mismas filas (`employeeId` y `fullName` de cada una) que `actorLectura`, y en **ninguna** fila existen `employeeSlug` ni `teleworkSuppliesSummary` (`Object.hasOwn(row, 'employeeSlug') === false`); `spy.calls.length === 0`.
- **CA-8 lote.** Con 5 teletrabajadores en la empresa A y `?page=1&limit=5` como `actorLectura` → `spy.calls.length === 1`, con `spy.calls[0].businessUnitIds` deep-equal a `[actorLectura.businessUnit.businessUnitId]` y `spy.calls[0].employeeIds` con el mismo conjunto que los 5 `employeeId` de `response.body().data.teleworkWorkers.data` (compara con `assert.deepEqual([...ids].sort(), [...expected].sort())`, "en cualquier orden").
- **CA-9 aislamiento.** El teletrabajador de la empresa B (con `actorEmpresaB`) no aparece para `actorLectura`, ni con `?search=` por su nombre, y su `employeeId` no figura en los `employeeIds` de ninguna llamada del espía (`spy.calls.flatMap((call) => call.employeeIds)`).
- **CA-12 error sin fuga.** `spy.shouldThrow = true`; `logger.error` espiado (`import logger from '@adonisjs/core/services/logger'`, guarda el `logger.error` original y restáuralo en teardown); como `actorLectura` → 500 con `assert.deepEqual(response.body(), { type: 'error', title: ..., message: telework_workers_unexpected_error, key: 'error-inesperado', detail: null, code: 'TWK.SYS.001', data: null })` comparando solo `key`/`detail`/`code`/`data` y afirmando `detail === null` (los `title`/`message` son i18n y no se fijan); el cuerpo serializado **no** contiene `'fallo interno de prueba'` (`assert.notInclude(JSON.stringify(response.body()), 'fallo interno de prueba')`); `loggerSpy` recibió al menos una llamada.
- **CA-13 permiso del módulo.** `actorEmpresaB` sin `telework-workers:read` (usa `createTenantActor` sin `grantModulePermissions`, o revoca con `grantModulePermissions(actor, 'telework-workers', [])`) → 403 con `key: 'sin-permiso'`, `code: 'TWK.AUTH.001'`, `detail: null`, y `spy.calls.length === 0`.
- **CA-15 contrato intacto.** Para `actorSoloListado`, `Object.keys(row).sort()` de cada fila es exactamente `['employeeCode','employeeId','fullName','position','teleworkPercentage','workSchedule','workplaces']`.
- **Review Focus 5.** Con `actorSoloListado` y `spy.shouldThrow = true` → 200, las mismas siete llaves, y `spy.calls.length === 0` (el lector que explota no se llama y no afecta la respuesta).

- [ ] **Paso 2: correr el test y verlo fallar**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_workers_index.spec.ts"`
Expected: FAIL en CA-1 (la fila no trae `employeeSlug` ni resumen: el controller no pasa la opción) y en CA-12 (`detail` trae `'fallo interno de prueba'`).

- [ ] **Paso 3: implementar el gate y el 500 sin fuga en `app/controllers/telework_worker_controller.ts`**

Imports nuevos:

```ts
import logger from '@adonisjs/core/services/logger'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'
```

En `index`, dentro del `try`, después del `if (!(await this.checkPermission(ctx)))` y antes de leer el querystring:

```ts
// El dato de insumos es de Activos e insumos: sin `supplies:read` no viaja ni
// el resumen ni el slug de la ficha (el corte es del API, no del BO).
const canReadSupplies = await new RoleService().hasAccess(
  ctx.auth.user!.roleId,
  SUPPLIES_PERMISSION_DECLARATIONS.showEmployeeTeleworkSupplies.module,
  'read'
)
```

(donde `ctx.auth.user!` es el mismo usuario ya cargado por `checkPermission`; si el tipado del `HttpContext` no lo estrecha, se resuelve con `required` local — no se introduce `any`).

Y la llamada al servicio:

```ts
const result = await service.list({ search, page, limit }, businessUnitScope ?? [], {
  includeSuppliesSummary: canReadSupplies,
})
```

En el `catch`:

```ts
} catch (error) {
  logger.error({ err: error }, 'telework_workers.index')
  response.status(500)
  return {
    type: 'error',
    title: i18n.formatMessage('telework_workers_title'),
    message: i18n.formatMessage('telework_workers_unexpected_error'),
    key: 'error-inesperado',
    detail: null,
    code: TWK_ERROR_CODES.SYS_UNHANDLED,
    data: null,
  }
}
```

(se borra la rama `error instanceof Error ? error.message : null`).

Swagger: en el `items.properties` del 200, tras `workplaces`, dos propiedades opcionales, cada una con la nota "solo con `supplies:read`":

```yaml
employeeSlug:
  type: string
  description: Slug opaco de la ficha del colaborador. Solo con `supplies:read`.
teleworkSuppliesSummary:
  type: object
  description: Resumen de insumos del colaborador (NOM-037 5.7). Solo con `supplies:read`.
  properties:
    applies:
      type: boolean
    isLegallyRequired:
      type: boolean
    deliveredCount:
      type: integer
    shippingCount:
      type: integer
    ownEquipmentCount:
      type: integer
    uncoveredCount:
      type: integer
    unsignedCustodyCount:
      type: integer
```

`checkPermission` no se toca (sigue con su bypass de root por `roleSlug`).

El JSDoc de la clase gana una línea: el detalle de insumos solo se entrega con `supplies:read` y el error inesperado ya no expone el mensaje interno.

- [ ] **Paso 4: correr el test y verlo pasar**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_workers_index.spec.ts"`
Expected: PASSED, todos los casos (servicio + HTTP).

- [ ] **Paso 5: verificar que el 500 no filtra y que no quedan literales prohibidos**

Run: `git grep -n "error.message" -- app/controllers/telework_worker_controller.ts` → 0 resultados (CA-12).
Run: `git grep -nE "'supplies'" -- app/controllers/telework_worker_controller.ts` → 0 resultados (el módulo sale de la declaración).
Run: `npm run typecheck` → exit 0, 0 errores.
Run: `npx eslint app/controllers/telework_worker_controller.ts` → 0 problemas.

- [ ] **Paso 6: commit**

```bash
git add app/controllers/telework_worker_controller.ts tests/functional/telework_workers_index.spec.ts
git commit -m "feat(teletrabajadores): entrega el estado de insumos solo con permiso de activos

El indice resuelve supplies:read con RoleService y omite el slug y el
resumen cuando el rol no lo tiene: el dato no viaja al cliente. El 500
deja de devolver el mensaje interno del error y lo manda al log.

Refs: VLRH-H1791485253301"
```

---

### Tarea 3 (gsti-rh-bo): la columna Insumos y el enlace a la ficha

El backoffice gana el helper puro del dominio (chips de la celda y ruta de la ficha), el composable de permisos con fail-closed y la columna con el nombre como enlace. Todo lo que decide vive en funciones puras con prueba propia; la vista solo las pinta.

**Files:**
- Modify: `pages/telework-workers/domain/telework-worker.interface.ts`
- Modify: `pages/telework-workers/domain/telework-worker.const.ts`
- Create: `pages/telework-workers/domain/telework-worker.helpers.ts`
- Modify: `pages/telework-workers/application/use-telework-workers-permissions.ts`
- Modify: `pages/telework-workers/script.ts`
- Modify: `pages/telework-workers/index.vue`
- Modify: `pages/telework-workers/style.scss`
- Modify: `pages/telework-workers/domain/locales/telework-workers.es.json`
- Modify: `pages/telework-workers/domain/locales/telework-workers.en.json`
- Test: Create `tests/pages/telework-workers/use-telework-workers-permissions.spec.ts`
- Test: Create `tests/pages/telework-workers/telework-worker.helpers.spec.ts`

**Interfaces:**
- Consumes: `TeleworkSuppliesSummary` y `SummaryChip`, `SummaryChipLabels` de `~/components/employeeTeleworkSuppliesPanel/domain/telework-supplies.interface`; `resolveSummaryChips` de `~/components/employeeTeleworkSuppliesPanel/domain/telework-supplies.helpers` (no se edita: dueño `VLRH-H1791485252682`); `SUPPLIES_MODULE_SLUG` de `~/pages/supplies/domain/supplies.const`; `SUPPLIES_PERMISSION.READ` de `~/pages/supplies/domain/supplies.enum`; `buildEmployeeSectionPath(slug, 'assets')` de `~/components/employeeSectionsMenu/domain/employee-section.helpers`; `generalStore.hasAccess(slug, permission)` y `generalStore.getAccess(slug)` (`store/general.ts`).
- Produces:
  - `telework-worker.interface.ts`: `TeleworkWorker` gana `employeeSlug?: string` y `teleworkSuppliesSummary?: TeleworkSuppliesSummary` (importado); `TeleworkWorkersPermissions` gana `canReadSupplies: boolean` y `canOpenEmployee: boolean`.
  - `telework-worker.const.ts`: `export const TELEWORK_WORKERS_EMPLOYEES_MODULE_SLUG = 'employees'` y `export const TELEWORK_WORKERS_READ_PERMISSION = 'read'`.
  - `telework-worker.helpers.ts` (puro): `buildSuppliesChipLabels(t: Translate): SummaryChipLabels`; `resolveSuppliesCell(summary: TeleworkSuppliesSummary | undefined, labels: SummaryChipLabels): SummaryChip[]`; `resolveEmployeeAssetsPath(row: { employeeSlug?: string }, permissions: { canReadSupplies: boolean; canOpenEmployee: boolean }): string | null`.

  > Nota de contrato: el spec escribe `resolveSuppliesCell(summary)`, pero `resolveSummaryChips` (ajeno, no se edita) exige el segundo argumento `labels`. Los textos no se copian del panel (sus llaves cuelgan de `employee_telework_supplies_panel` y este slice no las registra), así que el helper recibe los suyos. El resto del contrato es el del spec: `undefined` → `[]`.
  - `use-telework-workers-permissions.ts`: deps ganan `hasAccess(slug, permission): Promise<boolean>`; `permissions` gana `canReadSupplies` y `canOpenEmployee`.
  - `script.ts` expone a la vista: `canReadSupplies`, `resolveSuppliesCell`, `resolveEmployeeLink(row)` (aplica `useLocalePath` sobre `resolveEmployeeAssetsPath`).

- [ ] **Paso 1: escribir los tests que fallan**

`tests/pages/telework-workers/use-telework-workers-permissions.spec.ts`, molde `tests/pages/telework-settings/use-telework-settings-permissions.spec.ts` (imports `describe/expect/it/vi`, el composable y las constantes por ruta relativa `../../../pages/telework-workers/...`, `RoleSystemPermissionInterface`, y el helper local `granted(slugs)` que devuelve filas `{ systemPermissions: { systemPermissionSlug } }`):

```ts
const hasAccess = (map: Record<string, boolean>) =>
  vi.fn<(slug: string, permission: string) => Promise<boolean>>(
    async (slug, permission) => map[`${slug}:${permission}`] ?? false,
  )
```

Casos, cada uno con su `Objetivo:`:
1. **Root**: `isRoot: true` → `canRead`, `canReadSupplies` y `canOpenEmployee` en `true`, y `getAccess` + `hasAccess` **no** se llaman.
2. **Solo listado**: `canRead: true`, `hasAccess` siempre `false` → `canReadSupplies === false`, `canOpenEmployee === false`.
3. **Con `supplies:read` y sin `employees:read`** → `canReadSupplies === true`, `canOpenEmployee === false`; `hasAccess` fue llamada con `(SUPPLIES_MODULE_SLUG, SUPPLIES_PERMISSION.READ)` y con `('employees', 'read')`.
4. **Orden de consultas**: espías de orden; `getAccess` se llama **antes** que cualquier `hasAccess` (`expect(getAccess.mock.invocationCallOrder[0]).toBeLessThan(hasAccess.mock.invocationCallOrder[0])`), y con `TELEWORK_WORKERS_MODULE_SLUG`.
5. **Fail-closed por consulta**: `hasAccess` rechaza para `supplies` y para `employees` → `canReadSupplies === false`, `canOpenEmployee === false`, `hydrate` resuelve (`resolves.toBeUndefined()`) y `canRead` queda como lo dio `getAccess`; `console.error` espiado (restaurado al final).
6. **`getAccess` rechaza** → todos los permisos en `false`, sin lanzar.

`tests/pages/telework-workers/telework-worker.helpers.spec.ts`, molde `tests/employeeTeleworkSuppliesPanel/telework-supplies.helpers.spec.ts` (mismo helper local `summary(overrides)` con `applies: true, isLegallyRequired: true` y los siete conteos en cero):

```ts
/** Traductor de prueba: registra las llaves pedidas y las devuelve como texto. */
function fakeT(seen: string[]) {
  return (key: string, named?: Record<string, unknown>): string => {
    seen.push(key)
    return named ? `${key}:${named.n}` : key
  }
}
```

Casos, cada uno con su `Objetivo:`:
- **CA-1**: `resolveSuppliesCell(summary(), labels)` → un chip `{ key: 'complete', severity: 'success' }`.
- **CA-2**: `summary({ deliveredCount: 1, uncoveredCount: 1 })` → un chip `{ key: 'uncovered' }` con `label` que lleva el `1`.
- **CA-3**: `summary({ shippingCount: 1 })` → un chip `{ key: 'shipping' }`.
- **CA-4**: `summary({ unsignedCustodyCount: 1 })` → dos chips: `complete` (success) y `unsigned_custody` (severity `warn`).
- **CA-6**: `summary({ deliveredCount: 1, ownEquipmentCount: 1 })` → un chip `complete` (`ownEquipmentCount` no resta).
- **CA-11 / Review Focus 3**: `resolveSuppliesCell(undefined, labels)` → `[]`.
- **Review Focus 4 (rótulo de porcentaje y claves de los chips)**: `buildSuppliesChipLabels(fakeT(seen))` con un `fakeT` que registra las llaves → las cuatro llamadas piden `telework_workers.supplies.complete`, `telework_workers.supplies.uncovered`, `telework_workers.supplies.shipping` y `telework_workers.supplies.unsigned_custody` (los tres con conteo reciben `{ n: <count> }`); y el locale `telework-workers.es.json` trae `table.percentage === '% de teletrabajo'` y `telework-workers.en.json` trae `table.percentage === 'Telework %'` (importa los dos JSON como el resto de los specs del slice).
- **CA-10 (ruta)**: `resolveEmployeeAssetsPath({ employeeSlug: 'abc' }, { canReadSupplies: true, canOpenEmployee: true })` → `'/employees/abc/assets'`; con `canOpenEmployee: false` → `null`; con `canReadSupplies: false` → `null`; sin `employeeSlug` → `null`; y `resolveEmployeeAssetsPath({}, { canReadSupplies: true, canOpenEmployee: true })` → `null` (no inventa ruta con `undefined`).

- [ ] **Paso 2: correr los tests y verlos fallar**

Run: `npx vitest run tests/pages/telework-workers`
Expected: FAIL — `Cannot find module '../../../pages/telework-workers/domain/telework-worker.helpers'` y `hasAccess is not a function` / `permissions.canReadSupplies` indefinido.

- [ ] **Paso 3: implementar const, interfaz, helper y composable**

`pages/telework-workers/domain/telework-worker.const.ts`, al final:

```ts
/** Slug del módulo Empleados, dueño del permiso para abrir la ficha. */
export const TELEWORK_WORKERS_EMPLOYEES_MODULE_SLUG = 'employees'

/** Acción que habilita abrir la ficha del colaborador. */
export const TELEWORK_WORKERS_READ_PERMISSION = 'read'
```

`pages/telework-workers/domain/telework-worker.interface.ts`: importa `TeleworkSuppliesSummary` de `~/components/employeeTeleworkSuppliesPanel/domain/telework-supplies.interface`, añade los dos campos opcionales a `TeleworkWorker` (con JSDoc: presentes **solo** con `supplies:read`; el enlace exige además `employees:read`) y los dos booleanos a `TeleworkWorkersPermissions`.

`pages/telework-workers/domain/telework-worker.helpers.ts` (nuevo, puro, sin Vue ni Nuxt):

```ts
import type {
  SummaryChip,
  SummaryChipLabels,
  TeleworkSuppliesSummary,
} from '~/components/employeeTeleworkSuppliesPanel/domain/telework-supplies.interface'
import { resolveSummaryChips } from '~/components/employeeTeleworkSuppliesPanel/domain/telework-supplies.helpers'

/** Traductor del slice: llave completa (raíz `telework_workers` incluida) y parámetro nombrado. */
export type TeleworkWorkersTranslate = (key: string, named?: Record<string, unknown>) => string

/** Textos de los chips de la celda, resueltos con el traductor de la página. */
export const buildSuppliesChipLabels = (t: TeleworkWorkersTranslate): SummaryChipLabels => ({
  complete: t('telework_workers.supplies.complete'),
  uncovered: (count) => t('telework_workers.supplies.uncovered', { n: count }),
  shipping: (count) => t('telework_workers.supplies.shipping', { n: count }),
  unsignedCustody: (count) => t('telework_workers.supplies.unsigned_custody', { n: count }),
})

/** Chips de la celda Insumos; sin resumen (fila sin permiso o sin entrada) queda vacía. */
export const resolveSuppliesCell = (
  summary: TeleworkSuppliesSummary | undefined,
  labels: SummaryChipLabels,
): SummaryChip[] => (summary ? resolveSummaryChips(summary, labels) : [])

/** Ruta sin localizar de la sección Activos de la ficha, o null si no se puede abrir. */
export const resolveEmployeeAssetsPath = (
  row: { employeeSlug?: string },
  permissions: { canReadSupplies: boolean; canOpenEmployee: boolean },
): string | null => {
  if (!permissions.canReadSupplies || !permissions.canOpenEmployee || !row.employeeSlug) return null
  return buildEmployeeSectionPath(row.employeeSlug, 'assets')
}
```

(importa `buildEmployeeSectionPath` de `~/components/employeeSectionsMenu/domain/employee-section.helpers`.)

`pages/telework-workers/application/use-telework-workers-permissions.ts`: deps ganan `hasAccess: (systemModuleSlug: string, systemPermissionSlug: string) => Promise<boolean>`; `permissions` arranca con `canRead: false, canReadSupplies: false, canOpenEmployee: false`; `hydrate` sigue con el bypass de root primero (`isRoot` → los tres en `true`, sin consultar), y sin root: `getAccess(TELEWORK_WORKERS_MODULE_SLUG)` **primero** (en `try/catch` → `canRead = false`), y solo si `canRead`, dos consultas independientes cada una en su `try/catch` que falla cerrado:

```ts
const canRead = permissions.canRead
permissions.canReadSupplies = false
permissions.canOpenEmployee = false
if (!canRead) return

try {
  permissions.canReadSupplies = await deps.hasAccess(SUPPLIES_MODULE_SLUG, SUPPLIES_PERMISSION.READ)
} catch (error) {
  console.error('useTeleworkWorkersPermissions: error al consultar el acceso a insumos', error)
  permissions.canReadSupplies = false
}

try {
  permissions.canOpenEmployee = await deps.hasAccess(
    TELEWORK_WORKERS_EMPLOYEES_MODULE_SLUG,
    TELEWORK_WORKERS_READ_PERMISSION,
  )
} catch (error) {
  console.error('useTeleworkWorkersPermissions: error al consultar el acceso a la ficha', error)
  permissions.canOpenEmployee = false
}
```

- [ ] **Paso 4: correr los tests y verlos pasar**

Run: `npx vitest run tests/pages/telework-workers`
Expected: PASSED, los dos archivos.

- [ ] **Paso 5: cablear la vista (script, plantilla, estilos, locales)**

`pages/telework-workers/script.ts`: pasa `hasAccess: generalStore.hasAccess.bind(generalStore)` a `useTeleworkWorkersPermissions`; captura `const localePath = useLocalePath()`; expone:

```ts
canReadSupplies: computed(() => permissionsComposable.permissions.canReadSupplies),
suppliesChips: (row: TeleworkWorker) =>
  resolveSuppliesCell(row.teleworkSuppliesSummary, buildSuppliesChipLabels(t)),
resolveEmployeeLink: (row: TeleworkWorker): string | null => {
  const path = resolveEmployeeAssetsPath(row, {
    canReadSupplies: permissionsComposable.permissions.canReadSupplies,
    canOpenEmployee: permissionsComposable.permissions.canOpenEmployee,
  })
  return path === null ? null : localePath(path)
},
```

(donde `t` sale de `i18n`; `useI18n()` ya está en el `setup`.)

`pages/telework-workers/index.vue`:
- Columna **Insumos** con `v-if="canReadSupplies"` inmediatamente después de la columna `teleworkPercentage`:

```html
<Column v-if="canReadSupplies" field="teleworkSuppliesSummary" :header="$t('telework_workers.table.supplies')">
  <template #body="{ data }">
    <span class="telework-workers-page__supplies">
      <Tag
        v-for="chip in suppliesChips(data)"
        :key="chip.key"
        :value="chip.label"
        :severity="chip.severity"
      />
    </span>
  </template>
</Column>
```

- El `span` del nombre (líneas 126-132) se vuelve enlace cuando `resolveEmployeeLink(data)` no es `null`; si es `null`, queda el `span` de hoy:

```html
<template #body="{ data }">
  <NuxtLink
    v-if="resolveEmployeeLink(data)"
    class="telework-workers-page__employee-link"
    :to="resolveEmployeeLink(data)!"
  >
    {{ data.fullName }}
  </NuxtLink>
  <span v-else class="telework-workers-page__employee-name">
    {{ data.fullName }}
  </span>
</template>
```

`pages/telework-workers/style.scss`: `&__supplies` (flex, `gap: var(--space-2)`, `flex-wrap: wrap`) y `&__employee-link` (mismo peso y color que `__employee-name`, con el estilo de enlace del design system: `color: var(--color-primary)`, `text-decoration: none`, `hover` con subrayado).

Locales (es y en), dentro de `telework_workers`:

```json
"table": {
  "percentage": "% de teletrabajo",
  "supplies": "Insumos"
},
"supplies": {
  "complete": "Completo",
  "uncovered": "{n} sin cubrir",
  "shipping": "{n} en envío",
  "unsigned_custody": "{n} resguardo sin firmar | {n} resguardos sin firmar"
}
```

```json
"table": {
  "percentage": "Telework %",
  "supplies": "Supplies"
},
"supplies": {
  "complete": "Complete",
  "uncovered": "{n} uncovered",
  "shipping": "{n} in transit",
  "unsigned_custody": "{n} unsigned custody receipt | {n} unsigned custody receipts"
}
```

(El bloque `table` ya existe: se renombra `percentage` y se agrega `supplies`; el bloque `supplies` es nuevo y va hermano de `table`.)

- [ ] **Paso 6: verificar vistas, tipos y claves**

Run: `npm run typecheck` → sin errores nuevos: `grep -cE "telework-workers" <salida>` = 0 (la línea base ya trae 277 errores TS preexistentes).
Run: `npx eslint pages/telework-workers tests/pages/telework-workers` → 0 errores.
Run: `npm run lint:i18n` → sin claves nuevas sin traducción (las cuatro del bloque `supplies` y `table.supplies` existen en es y en).
Run: `npx vitest run tests/pages/telework-workers tests/employeeTeleworkSuppliesPanel tests/employeeSectionsMenu`
Expected: PASSED (los dos nuevos + los de la dependencia, sin regresión).

- [ ] **Paso 7: commit**

```bash
git add pages/telework-workers tests/pages/telework-workers
git commit -m "feat(teletrabajadores): muestra el estado de insumos y abre la ficha desde el listado

La columna Insumos lee el resumen del API y pinta los chips de la celda;
sin supplies:read no existe y el nombre deja de ser enlace sin
employees:read. El rótulo de porcentaje se alinea con la ficha.

Refs: VLRH-H1791485253301"
```

---

### Tarea 4: manual de QA — último entregable, solo se entrega

El usuario recorre este manual él mismo. No se ejecuta aquí ni se automatiza: se escribe y se entrega (decisión de producto, Wilvardo 2026-10-08).

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-mostrar-el-estado-de-insumos-en-el-listado-de-teletrabajadores-qa-flujo.md` (en gsti-rh-api, donde se versiona)

**Interfaces:**
- Consumes: la skill `manual-qa` (reglas en `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `manual-qa-execution.md`): cada escenario abre con su línea `Objetivo:` antes de los pasos, pasos con datos exactos, resultado esperado y evidencia; los correos exactos de los roles de prueba y la contraseña literal del sembrador compartido `_tmp_do_not_commit_qa_seeder.ts` (si falta una cuenta, se agrega ahí; ese archivo no se commitea).
- Produces: el manual para el recorrido manual; los hallazgos que surjan los registra el usuario en `qa-valanserh/hallazgos.md` (cuadro de 14 campos; el código va en Comentarios/Historial, no en Evidencia) y se corrigen en esta misma rama.

- [ ] **Paso 1: cargar las reglas y escribir el manual**

Skill `manual-qa` antes de escribir. Escenarios (todos abren con `Objetivo:`):

1. **Completo** — Colaborador al 100% con silla y laptop entregadas y sus resguardos firmados, sin aditamento: la columna Insumos dice "Completo" y el aditamento sin entregar no aparece como pendiente.
2. **Sin cubrir** — Colaborador al 60% con la silla entregada y sin equipo de cómputo: "1 sin cubrir".
3. **En envío** — Colaborador con la laptop en camino: "1 en envío", nunca "Completo".
4. **Resguardo sin firmar** — Todo entregado pero el resguardo de la silla sin firmar: "Completo" **y** "1 resguardo sin firmar".
5. **Equipo propio declarado** — Colaborador que usa su propia silla con declaración vigente: "Completo".
6. **Umbral exacto (40%)** — Colaborador híbrido al 40% exacto: aparece en el listado con su estado de insumos.
7. **Abrir la ficha (regla 5)** — Clic en el nombre: llega a la sección Activos de la ficha y los números coinciden con los de la columna.
8. **Sin permiso de insumos (regla 6)** — Rol con solo Teletrabajadores: el listado se ve como hoy, sin columna Insumos ni enlace, y en la pestaña de red la respuesta no trae `teleworkSuppliesSummary` ni `employeeSlug`.
9. **Sin permiso de Empleados (regla 7)** — Rol con Teletrabajadores + Activos e insumos pero sin Empleados: la columna se ve y el nombre queda como texto, sin enlace.
10. **Aislamiento entre empresas (regla 8)** — Cambiar la empresa activa: el listado y los estados son solo de la empresa elegida y los números siguen coincidiendo con la ficha.
11. **Error sin fuga** — Con la API caída o el token inválido: el listado muestra su error con Reintentar y el mensaje no revela detalles internos del sistema.
12. **Responsivo e idiomas** — 360 px sin desplazamiento horizontal, chips que envuelven; en inglés, columna y rótulos traducidos.

Cada escenario: pasos exactos, credenciales de los roles de prueba del sembrador QA, resultado esperado y cómo adjuntar evidencia.

- [ ] **Paso 2: verificación de formato**

`npm run lint:i18n` y `npm run lint:icons` siguen limpios (el manual no toca claves); revisión propia contra las reglas de `manual-qa`: cada escenario abre con su `Objetivo:`.

- [ ] **Paso 3: commit y entrega**

```bash
git add docs/superpowers/plans/2026-10-12-mostrar-el-estado-de-insumos-en-el-listado-de-teletrabajadores-qa-flujo.md
git commit -m "docs(qa): agrega el manual de recorrido del estado de insumos en el listado

Refs: VLRH-H1791485253301"
```

Entregar la ruta al usuario y **esperar su recorrido manual**: los hallazgos que reporte se registran en `qa-valanserh/hallazgos.md` y se corrigen en esta misma rama.

---

## Definition of Done — líneas base medidas (2026-10-12, ambas ramas a la punta de la rama de `VLRH-H1791485252682`)

Todas las verificaciones se midieron contra el árbol actual antes de escribir este plan; estos números son los que valen.

**gsti-rh-api** (rama `feature/VLRH-H1791485253301-…` en `56cda8a2`, árbol limpio; `NODE_ENV=test`, BD `sae_pruebas` al día):

| Comando | Línea base | Criterio |
|---|---|---|
| `node ace test functional --files="telework_workers_index.spec.ts"` | (nuevo) | PASSED, todos los casos |
| `node ace test functional --files="telework_compliance_settings.spec.ts"` (molde) | PASSED 14/14 | sin regresión (no se toca) |
| `npm run typecheck` | exit 0, 0 errores | exit 0 |
| `npx eslint app/services/telework_worker_service.ts app/controllers/telework_worker_controller.ts` | 0 problemas | 0 problemas (+ el spec nuevo) |
| `git grep -n "error.message" -- app/controllers/telework_worker_controller.ts` | 1 (línea 172) | 0 (CA-12) |
| `git grep -nE "'supplies'" -- app/controllers/telework_worker_controller.ts` | 0 | 0 (el módulo sale de la declaración) |
| `git diff --name-only <base>...HEAD -- app/modules/assets tests/functional/assets_telework_supplies.spec.ts` | vacío | vacío (CA-14) |

**gsti-rh-bo** (rama `feature/VLRH-H1791485253301-…` en `b18992b7`, árbol limpio):

| Comando | Línea base | Criterio |
|---|---|---|
| `npx vitest run tests/pages/telework-workers` | (nuevo) | PASSED |
| `npx vitest run tests/pages/telework-settings tests/employeeTeleworkSuppliesPanel tests/employeeSectionsMenu` | 7 archivos, 49 pruebas, PASSED | sin regresión |
| `npm run typecheck` | **exit 2, 277 errores TS preexistentes** | **sin errores nuevos**: `grep -cE "telework-workers"` sobre la salida → 0 (medido: 0) |
| `npx eslint pages/telework-workers` | 0 problemas | 0 problemas (+ `tests/pages/telework-workers`) |
| `npx prettier --check pages/telework-workers` | **4 archivos preexistentes no conformes** (`use-telework-workers-permissions.ts`, `use-telework-workers.ts`, `telework-worker.repository.ts`, `script.ts`) | **no se corre `--write` sobre ajenos**: el criterio es que los archivos del censo no sumen no conformidades nuevas por formato propio (escribir ya conforme) |
| `npm run lint:i18n` | limpio (31 claves heredadas en la línea base) | sin claves nuevas sin traducción |
| `git diff --name-only <base>...HEAD -- components/employeeTeleworkSuppliesPanel` | vacío | vacío (CA-14) |

**Notas para el executor:**

- La rama de trabajo en ambos repos ya existe y está en la punta de la rama de `VLRH-H1791485252682` (`56cda8a2` / `b18992b7`); no se reinicia ni se rebasa: el diff del corte (CA-14) se mide contra esa punta.
- No se edita la factoría ni el servicio de `app/modules/assets`: la lectura del resumen pasa **siempre** por `makeTeleworkSuppliesService()`.
- Si la factoría dejara de devolver una instancia de `TeleworkSuppliesService` (el espía del test la envuelve en su prototipo), se cambia por un seam en el controller y se avisa a Wilvardo; no se edita la factoría.
- El manual de QA (Tarea 4) se **entrega**: el recorrido lo hace el usuario.
- No se crea PR ni se despliega: eso lo levanta el equipo (Wilvardo) por su cuenta.
