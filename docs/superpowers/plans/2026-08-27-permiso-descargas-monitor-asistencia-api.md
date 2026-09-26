# Abrir el árbol de permisos del monitor de asistencia (API) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `GET /api/auth/session/permissions` deje de emitir el módulo `employees-attendance-monitor` con `sections: []` y entregue sus 11 acciones ya sembradas, sin crear ni retirar ninguna concesión.

**Architecture:** El índice maestro de permisos es un archivo TypeScript, no una tabla. Se agrega un catálogo de acciones propio del módulo (`attendance_monitor_permission_catalog.ts`), se enciende `actionsEnumerated: true` en el catálogo de módulos y se registra en `actionsByModule`. Las 11 acciones ya existen como filas de `system_permissions` desde `0018_system_permission_seeder.ts`, así que cada una declara `legacyEquivalence.relation: 'exact'` contra su propio slug: eso hace que `SystemPermissionCatalogSyncService.ensureAction` no cree ni una fila y que `isCatalogActionGranted` reconozca las concesiones que cada cliente ya tiene.

**Tech Stack:** AdonisJS 6 · TypeScript estricto · Lucid ORM · Japa (`node ace test`) · MySQL.

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1787433076991-permiso-descargas-monitor` · **Target:** `multitenant`

**Spec fuente:** `spec-USRH1787433076991.md` §Alcance 1, Anexo A, CA-1.

## Global Constraints

- **Cero migraciones, cero seeders nuevos, cero endpoints nuevos, cero cambios de contrato HTTP.** Lo único que cambia es el *contenido* de un nodo que ya venía en la respuesta.
- **Ningún gate nuevo.** Las nueve superficies de descarga de esta capacidad ya están comprobadas en servidor (`employee_routes.ts:13-16`, `assist_routes.ts:30-31`, `report_jobs_controller.ts:92-107`, `:124-140`, `:142-146`, `:369-373`). Esta HU no monta ni uno.
- **Enumerar las ONCE acciones, no solo `download-summary`.** `SystemPermissionCatalogConsistencyService.checkModuleActions` reporta como `registeredNotDeclared` toda fila viva del módulo que el catálogo no declare. Declarar una sola convierte las otras diez en hallazgos permanentes.
- **`legacyEquivalence: { systemPermissionSlug: '<mismo slug>', relation: 'exact' }` en las once.** Sin ella el sync crearía filas gemelas y los clientes perderían sus concesiones.
- **`exceptionProfile: 'standard'` en las once.** `strict` retiraría el acceso a los roles privilegiados; no es lo que se quiere.
- **Los slugs se copian de `database/seeders/0018_system_permission_seeder.ts` (filas con `systemModuleId: 7`), nunca de memoria.**
- **Archivos que NO se tocan, y es condición de la HU:** todo `start/routes/`, `app/controllers/report_jobs_controller.ts`, `app/services/permission_gate_service.ts`, `app/constants/employees_permission_catalog.ts`, `app/constants/employees_download_permission_declarations.ts`, `app/constants/role_presets.ts`, `database/migrations/**`, `database/seeders/**`.
- TypeScript estricto, cero `any`. `npm run lint` y `npm run typecheck` limpios.

## Drift verificado contra el código de hoy (`3657e356`)

Se validó cada ancla del spec antes de escribir este plan. Diferencias respecto al spec, todas triviales y ya incorporadas a las tareas:

| Spec dice | Código real hoy | Efecto en el plan |
|---|---|---|
| `system_modules_catalog.ts:32` es el monitor | Es `:33` | Se edita `:33` |
| `actionsByModule` en `system_permission_catalog.ts:33-35`, solo `employees` | Está en `:36-39` y ya trae `employees` **y** `positions` | Se agrega una tercera entrada |
| El docblock `:13-16` de `system_modules_catalog.ts` hay que pasarlo a plural | Ya está en plural (menciona `employees` y `positions`) | Solo se suma el monitor a la enumeración |
| Esta HU entra antes que USRH1787433076995 (`positions`) | `positions_permission_catalog.ts` ya existe y está registrado | No hay conflicto que coordinar; `positions_permission_catalog.ts` es el **molde exacto** a copiar |

Confirmado sin drift: las 11 filas de `systemModuleId: 7` en `0018_system_permission_seeder.ts` (ids 22, 78, 79, 93, 94, 112, 124, 125, 126, 169, 206 — `rg -c "systemModuleId: 7$"` da exactamente 11, y ningún otro seeder siembra en el módulo 7); `session_permission_tree_service.ts:108-115` (corto-circuito a `sections: []`); `system_permission_catalog_sync_service.ts:94-106` (`ensureAction` resuelve por `slugToMatch` y devuelve `false` si la fila existe); `system_permission_catalog_consistency_service.ts:51-53` (`knownDebtModules`) y `:141-148` (`registeredNotDeclared`); `session_permission_grant.ts:19-23`; `session_permission_decision.ts:48-49` (`reason: 'assignment'`) y `:42-46` (`reason: 'privileged-role'`).

---

## Estructura de archivos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Crear | `app/constants/attendance_monitor_permission_catalog.ts` | Tipo `AttendanceMonitorSection` (4 secciones) + las 11 acciones del módulo, `as const satisfies ActionCatalogEntry<AttendanceMonitorSection>[]`. Un solo propósito: declarar qué acciones tiene el monitor. Molde literal: `positions_permission_catalog.ts`. |
| Editar | `app/constants/system_modules_catalog.ts` | Una línea (`:33`) y el docblock. |
| Editar | `app/constants/system_permission_catalog.ts` | Import, re-export del tipo y una entrada en `actionsByModule`. |
| Crear | `tests/unit/constants/attendance_monitor_permission_catalog.spec.ts` | Traba la forma del catálogo nuevo: 11 slugs exactos, secciones, perfil y equivalencia legada. |
| Crear | `tests/unit/services/session_permission_tree_attendance_monitor.spec.ts` | Traba el efecto observable: el nodo del monitor deja de venir vacío y nadie gana ni pierde una concesión. Archivo aparte para no ensanchar `session_permission_tree_service.spec.ts` (243 líneas, otro dueño). |

---

## Task 1: Catálogo de las 11 acciones del monitor

**Files:**
- Create: `app/constants/attendance_monitor_permission_catalog.ts`
- Test: `tests/unit/constants/attendance_monitor_permission_catalog.spec.ts`

**Interfaces:**
- Consumes: `ActionCatalogEntry<TSection>` de `#constants/permission_catalog_types` (`slug`, `displayName`, `kind: 'read' | 'write' | 'delete'`, `section`, `exceptionProfile`, `legacyEquivalence?`).
- Produces: `ATTENDANCE_MONITOR_PERMISSION_CATALOG` (array readonly de 11 entradas), `export type AttendanceMonitorSection = 'listado' | 'nomina' | 'asistencia' | 'descargas'`, `export type AttendanceMonitorActionSlug`. La Task 2 los importa por esos nombres exactos.

- [ ] **Step 1: Cotejar los slugs contra el seeder antes de escribir nada**

Run:
```bash
cd gsti-rh-api && rg -n "systemModuleId: 7$" -B 4 database/seeders/0018_system_permission_seeder.ts
```
Expected: exactamente 11 bloques, con estos `systemPermissionSlug` — `read`, `read-time-worked`, `add-assist-manual`, `sync-assist`, `consecutive-faults`, `delete-check-assist`, `download-summary`, `display-discounts-summary`, `display-payments-summary`, `shift-coverage`, `see-payroll`. Si sale cualquier otro número o cualquier slug distinto, **detenerse y escalar a Wilvardo**: el Anexo A del spec dejó de ser válido.

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/unit/constants/attendance_monitor_permission_catalog.spec.ts`:

```ts
import { test } from '@japa/runner'
import {
  ATTENDANCE_MONITOR_PERMISSION_CATALOG,
} from '#constants/attendance_monitor_permission_catalog'

/** Los 11 slugs sembrados con `systemModuleId: 7` en 0018_system_permission_seeder.ts. */
const SEEDED_MODULE_7_SLUGS = [
  'read',
  'read-time-worked',
  'consecutive-faults',
  'shift-coverage',
  'see-payroll',
  'display-payments-summary',
  'display-discounts-summary',
  'add-assist-manual',
  'sync-assist',
  'delete-check-assist',
  'download-summary',
] as const

test.group('Catálogo employees-attendance-monitor — USRH1787433076991', () => {
  test('enumera exactamente las 11 acciones ya sembradas del módulo 7', ({ assert }) => {
    assert.lengthOf(ATTENDANCE_MONITOR_PERMISSION_CATALOG, 11)
    assert.deepEqual(
      [...ATTENDANCE_MONITOR_PERMISSION_CATALOG.map((action) => action.slug)].sort(),
      [...SEEDED_MODULE_7_SLUGS].sort()
    )
  })

  test('las 11 llevan equivalencia legada exacta contra su propio slug (regla 8: enumerar no concede)', ({
    assert,
  }) => {
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      assert.equal(action.legacyEquivalence?.relation, 'exact', action.slug)
      assert.equal(action.legacyEquivalence?.systemPermissionSlug, action.slug, action.slug)
    }
  })

  test('las 11 usan exceptionProfile standard: el rol privilegiado conserva su acceso', ({
    assert,
  }) => {
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      assert.equal(action.exceptionProfile, 'standard', action.slug)
    }
  })

  test('reparte las 11 en las 4 secciones declaradas', ({ assert }) => {
    const bySection = new Map<string, string[]>()
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      bySection.set(action.section, [...(bySection.get(action.section) ?? []), action.slug])
    }

    assert.deepEqual([...bySection.keys()].sort(), [
      'asistencia',
      'descargas',
      'listado',
      'nomina',
    ])
    assert.deepEqual(bySection.get('descargas'), ['download-summary'])
    assert.lengthOf(bySection.get('listado') ?? [], 4)
    assert.lengthOf(bySection.get('nomina') ?? [], 3)
    assert.lengthOf(bySection.get('asistencia') ?? [], 3)
  })

  test('ninguna acción se declara exenta de la revisión de consistencia', ({ assert }) => {
    for (const action of ATTENDANCE_MONITOR_PERMISSION_CATALOG) {
      assert.notProperty(action, 'exemption', action.slug)
    }
  })
})
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `cd gsti-rh-api && node ace test unit --files="attendance_monitor_permission_catalog"`
Expected: FAIL — no resuelve `#constants/attendance_monitor_permission_catalog`.

- [ ] **Step 4: Escribir el catálogo**

Crear `app/constants/attendance_monitor_permission_catalog.ts`:

```ts
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/**
 * Secciones del monitor de asistencia (USRH1787433076991). En español,
 * igual que `employees`: agrupan las acciones para la matriz de roles.
 */
export type AttendanceMonitorSection = 'listado' | 'nomina' | 'asistencia' | 'descargas'

/**
 * Las 11 acciones del módulo `employees-attendance-monitor`.
 *
 * Las once YA están sembradas desde `0018_system_permission_seeder.ts`
 * (`systemModuleId: 7`), por eso todas declaran `legacyEquivalence` exacta
 * contra su propio slug: `SystemPermissionCatalogSyncService.ensureAction`
 * las reconoce y no crea fila nueva, e `isCatalogActionGranted` sigue
 * respetando las concesiones que cada cliente ya tiene. Enumerarlas no
 * concede ni retira nada a nadie (regla 8 de la HU).
 *
 * `displayName` en español: solo se materializa en una base donde la fila
 * no existiera — el sync nunca renombra lo ya registrado.
 *
 * Esta HU solo cambia el consumidor de `download-summary` y `see-payroll`
 * (las descargas del monitor en el backoffice). Las otras nueve se enumeran
 * porque la revisión de consistencia reporta como `registeredNotDeclared`
 * toda fila viva del módulo que el catálogo no declare; su gobierno sigue
 * exactamente como está.
 */
export const ATTENDANCE_MONITOR_PERMISSION_CATALOG = [
  {
    slug: 'read',
    displayName: 'Ver el monitor de asistencia',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
  },
  {
    slug: 'read-time-worked',
    displayName: 'Ver el tiempo trabajado',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read-time-worked', relation: 'exact' },
  },
  {
    slug: 'consecutive-faults',
    displayName: 'Ver faltas consecutivas',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'consecutive-faults', relation: 'exact' },
  },
  {
    slug: 'shift-coverage',
    displayName: 'Ver cobertura de turnos',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'shift-coverage', relation: 'exact' },
  },
  {
    slug: 'see-payroll',
    displayName: 'Ver el modo de nómina',
    kind: 'read',
    section: 'nomina',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'see-payroll', relation: 'exact' },
  },
  {
    slug: 'display-payments-summary',
    displayName: 'Ver pagos en el resumen',
    kind: 'read',
    section: 'nomina',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'display-payments-summary', relation: 'exact' },
  },
  {
    slug: 'display-discounts-summary',
    displayName: 'Ver descuentos en el resumen',
    kind: 'read',
    section: 'nomina',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'display-discounts-summary', relation: 'exact' },
  },
  {
    slug: 'add-assist-manual',
    displayName: 'Capturar asistencia manual',
    kind: 'write',
    section: 'asistencia',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'add-assist-manual', relation: 'exact' },
  },
  {
    slug: 'sync-assist',
    displayName: 'Sincronizar asistencia',
    kind: 'write',
    section: 'asistencia',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'sync-assist', relation: 'exact' },
  },
  {
    slug: 'delete-check-assist',
    displayName: 'Eliminar una checada',
    kind: 'delete',
    section: 'asistencia',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'delete-check-assist', relation: 'exact' },
  },
  {
    slug: 'download-summary',
    displayName: 'Descargar el resumen de incidencias',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'download-summary', relation: 'exact' },
  },
] as const satisfies ActionCatalogEntry<AttendanceMonitorSection>[]

export type AttendanceMonitorActionSlug =
  (typeof ATTENDANCE_MONITOR_PERMISSION_CATALOG)[number]['slug']
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd gsti-rh-api && node ace test unit --files="attendance_monitor_permission_catalog"`
Expected: PASS, los 5 tests.

- [ ] **Step 6: Commit**

```bash
cd gsti-rh-api
git add app/constants/attendance_monitor_permission_catalog.ts tests/unit/constants/attendance_monitor_permission_catalog.spec.ts
git commit -m "feat: Declarar las once acciones del monitor de asistencia en el catálogo"
```

---

## Task 2: Encender y registrar el módulo en el índice maestro

**Files:**
- Modify: `app/constants/system_modules_catalog.ts:13-17` (docblock) y `:33`
- Modify: `app/constants/system_permission_catalog.ts:1-16` (imports y re-exports) y `:36-39` (`actionsByModule`)
- Test: `tests/unit/constants/attendance_monitor_permission_catalog.spec.ts` (se le añade un grupo)

**Interfaces:**
- Consumes: `ATTENDANCE_MONITOR_PERMISSION_CATALOG`, `AttendanceMonitorSection`, `AttendanceMonitorActionSlug` de la Task 1.
- Produces: `SYSTEM_PERMISSION_CATALOG.actionsByModule['employees-attendance-monitor']` poblado, y la entrada del módulo con `actionsEnumerated: true`. Es lo que consumen `SessionPermissionTreeService`, `SystemPermissionCatalogSyncService` y `SystemPermissionCatalogConsistencyService` sin cambio de código.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `tests/unit/constants/attendance_monitor_permission_catalog.spec.ts`:

```ts
import { SYSTEM_PERMISSION_CATALOG } from '#constants/system_permission_catalog'

test.group('Índice maestro — registro del monitor de asistencia', () => {
  test('el módulo queda declarado como enumerado', ({ assert }) => {
    const moduleEntry = SYSTEM_PERMISSION_CATALOG.modules.find(
      (entry) => entry.slug === 'employees-attendance-monitor'
    )
    assert.exists(moduleEntry)
    assert.isTrue(moduleEntry!.actionsEnumerated)
  })

  test('actionsByModule expone exactamente las 11 acciones del catálogo del monitor', ({
    assert,
  }) => {
    assert.deepEqual(
      SYSTEM_PERMISSION_CATALOG.actionsByModule['employees-attendance-monitor'].map(
        (action) => action.slug
      ),
      ATTENDANCE_MONITOR_PERMISSION_CATALOG.map((action) => action.slug)
    )
  })

  test('los módulos ya enumerados siguen enumerados (no se pisó nada)', ({ assert }) => {
    assert.deepEqual(Object.keys(SYSTEM_PERMISSION_CATALOG.actionsByModule).sort(), [
      'employees',
      'employees-attendance-monitor',
      'positions',
    ])
  })
})
```

(mover el `import { SYSTEM_PERMISSION_CATALOG }` al bloque de imports del archivo, arriba).

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd gsti-rh-api && node ace test unit --files="attendance_monitor_permission_catalog"`
Expected: FAIL — `actionsEnumerated` es `false` y `actionsByModule['employees-attendance-monitor']` es `undefined`.

- [ ] **Step 3: Encender el módulo**

En `app/constants/system_modules_catalog.ts`, cambiar la línea 33:

```ts
  { slug: 'employees-attendance-monitor', legacySystemModuleId: 7, actionsEnumerated: true },
```

y en el docblock (`:13-17`) sumar el monitor a la enumeración:

```ts
 * `actionsEnumerated: true` en `employees` (piloto de la HU
 * USRH1785766406720), en `positions` (USRH1787433076995, permiso de alta y
 * rangos salariales del puesto) y en `employees-attendance-monitor`
 * (USRH1787433076991, descargas del monitor de asistencia). El resto queda
 * reconocido pero sin sus acciones declaradas todavía — deuda conocida
 * explícita (ver supuesto de la HU), no un error de la revisión de
 * consistencia.
```

- [ ] **Step 4: Registrarlo en el índice maestro**

En `app/constants/system_permission_catalog.ts`, añadir el import junto a los otros catálogos (`:1-3`):

```ts
import { ATTENDANCE_MONITOR_PERMISSION_CATALOG } from '#constants/attendance_monitor_permission_catalog'
```

el re-export junto a los otros (`:15-16`):

```ts
export { ATTENDANCE_MONITOR_PERMISSION_CATALOG } from '#constants/attendance_monitor_permission_catalog'
export type {
  AttendanceMonitorSection,
  AttendanceMonitorActionSlug,
} from '#constants/attendance_monitor_permission_catalog'
```

y la entrada en `actionsByModule` (`:36-39`):

```ts
  actionsByModule: {
    employees: EMPLOYEES_PERMISSION_CATALOG,
    positions: POSITIONS_PERMISSION_CATALOG,
    'employees-attendance-monitor': ATTENDANCE_MONITOR_PERMISSION_CATALOG,
  },
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd gsti-rh-api && node ace test unit --files="attendance_monitor_permission_catalog"`
Expected: PASS, los 8 tests.

- [ ] **Step 6: Verificar que `validateCatalogIntegrity` sigue contenta**

Run: `cd gsti-rh-api && node ace test unit --files="system_permission_catalog"`
Expected: PASS. `validateCatalogIntegrity` (`system_permission_catalog.ts:261-308`) lanza si hay slug duplicado, si el módulo dueño no está reconocido, si hay acciones declaradas con `actionsEnumerated: false`, si falta `section` o si la `relation` no es válida. Las 11 entradas cumplen las cinco.

- [ ] **Step 7: Commit**

```bash
cd gsti-rh-api
git add app/constants/system_modules_catalog.ts app/constants/system_permission_catalog.ts tests/unit/constants/attendance_monitor_permission_catalog.spec.ts
git commit -m "feat: Enumerar los permisos del monitor de asistencia en el índice maestro"
```

---

## Task 3: Trabar el efecto observable — árbol poblado y cero concesiones movidas

Esta es la tarea que demuestra CA-1: que el nodo deja de venir vacío **y** que nadie gana ni pierde una concesión al enumerar.

**Files:**
- Test: `tests/unit/services/session_permission_tree_attendance_monitor.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `SessionPermissionTreeService.buildForUser(user)`, `SystemPermissionCatalogSyncService.sync()`, `SystemPermissionCatalogConsistencyService.checkConsistency()`, todos con su catálogo por defecto (el real).
- Produces: nada de código de producción. Es la red de seguridad de las Tasks 1 y 2.

- [ ] **Step 1: Escribir el test**

Crear `tests/unit/services/session_permission_tree_attendance_monitor.spec.ts`:

```ts
import { test } from '@japa/runner'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import type User from '#models/user'
import SessionPermissionTreeService from '#services/session_permission_tree_service'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'
import SystemPermissionCatalogConsistencyService from '#services/system_permission_catalog_consistency_service'
import { ATTENDANCE_MONITOR_PERMISSION_CATALOG } from '#constants/attendance_monitor_permission_catalog'

const MONITOR_SLUG = 'employees-attendance-monitor'
const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ROLE_SLUG = `monitor-tree-test-${STAMP}-plain-role`

function fakeUser(roleId: number): User {
  return { userId: roleId, roleId } as User
}

async function findMonitorPermission(slug: string): Promise<SystemPermission> {
  const moduleRow = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', MONITOR_SLUG)
    .first()
  if (!moduleRow) {
    throw new Error(`El módulo "${MONITOR_SLUG}" debería existir ya en la BD de pruebas.`)
  }
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_module_id', moduleRow.systemModuleId)
    .where('system_permission_slug', slug)
    .first()
  if (!permission) {
    throw new Error(`El permiso "${MONITOR_SLUG}:${slug}" debería estar sembrado desde 0018.`)
  }
  return permission
}

function monitorNodeFrom(
  tree: Awaited<ReturnType<SessionPermissionTreeService['buildForUser']>>
) {
  const node = tree.modules.find((moduleNode) => moduleNode.slug === MONITOR_SLUG)
  if (!node) {
    throw new Error('El árbol debe incluir el módulo del monitor de asistencia.')
  }
  return node
}

test.group('Árbol de sesión — monitor de asistencia (USRH1787433076991)', (group) => {
  let plainRole: Role

  group.setup(async () => {
    plainRole = await Role.create({
      roleName: 'Test Attendance Monitor Tree Role',
      roleSlug: ROLE_SLUG,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
    })
  })

  group.teardown(async () => {
    const grants = await RoleSystemPermission.query()
      .where('role_id', plainRole.roleId)
      .withTrashed()
    for (const grant of grants) {
      await grant.forceDelete()
    }
    await plainRole.forceDelete()
  })

  test('CA-1: el nodo del monitor llega con 4 secciones y 11 acciones, no vacío', async ({
    assert,
  }) => {
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
    const node = monitorNodeFrom(tree)

    assert.lengthOf(node.sections, 4)
    assert.lengthOf(
      node.sections.flatMap((section) => section.actions),
      11
    )
  })

  test('CA-1: un grant real de download-summary llega como allowed/assignment', async ({
    assert,
  }) => {
    const permission = await findMonitorPermission('download-summary')
    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: permission.systemPermissionId,
    })

    try {
      const tree = await new SessionPermissionTreeService().buildForUser(
        fakeUser(plainRole.roleId)
      )
      const actions = monitorNodeFrom(tree).sections.flatMap((section) => section.actions)
      const summary = actions.find((action) => action.slug === 'download-summary')
      const payroll = actions.find((action) => action.slug === 'see-payroll')

      assert.isTrue(summary?.allowed)
      assert.equal(summary?.reason, 'assignment')
      assert.isFalse(payroll?.allowed)
      assert.equal(payroll?.reason, 'missing-assignment')
    } finally {
      await grant.forceDelete()
    }
  })

  test('CA-5: un rol privilegiado ve las 11 por privileged-role, sin grants', async ({
    assert,
  }) => {
    const owner = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'owner')
      .firstOrFail()
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(owner.roleId))
    const actions = monitorNodeFrom(tree).sections.flatMap((section) => section.actions)

    assert.lengthOf(actions, 11)
    assert.isTrue(
      actions.every((action) => action.allowed && action.reason === 'privileged-role')
    )
  })

  test('regla 8: sincronizar el catálogo no crea filas ni toca las concesiones', async ({
    assert,
  }) => {
    const countGrants = async (): Promise<number> => {
      const rows = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .count('* as total')
      return Number((rows[0] as unknown as { $extras: { total: number } }).$extras.total)
    }

    const grantsBefore = await countGrants()
    const first = await new SystemPermissionCatalogSyncService().sync()
    const second = await new SystemPermissionCatalogSyncService().sync()
    const grantsAfter = await countGrants()

    const monitorSlugs = ATTENDANCE_MONITOR_PERMISSION_CATALOG.map((action) => action.slug)
    for (const created of [...first.createdPermissionSlugs, ...second.createdPermissionSlugs]) {
      assert.notInclude(monitorSlugs, created)
    }
    assert.isEmpty(
      first.skippedActions.filter((skipped) => monitorSlugs.includes(skipped.slug as never))
    )
    assert.equal(grantsAfter, grantsBefore)
  })

  test('la revisión de consistencia deja de reportar deuda del monitor y no gana hallazgos', async ({
    assert,
  }) => {
    const report = await new SystemPermissionCatalogConsistencyService().checkConsistency()
    const monitorSlugs = ATTENDANCE_MONITOR_PERMISSION_CATALOG.map((action) => action.slug)

    assert.notInclude(report.knownDebtModules, MONITOR_SLUG)
    assert.isEmpty(
      report.declaredNotRegistered.filter((finding) => monitorSlugs.includes(finding.slug as never))
    )
    assert.isEmpty(
      report.registeredNotDeclared.filter((finding) => monitorSlugs.includes(finding.slug as never))
    )
  })
})
```

- [ ] **Step 2: Correr el test**

Run: `cd gsti-rh-api && node ace test unit --files="session_permission_tree_attendance_monitor"`
Expected: PASS, los 5 tests. Si el primero falla con 0 secciones, la Task 2 quedó a medias (`actionsEnumerated` o la entrada de `actionsByModule`).

- [ ] **Step 3: Correr la suite unitaria completa (no-regresión)**

Run: `cd gsti-rh-api && node ace test unit`
Expected: PASS. Especial atención a `system_permission_catalog_consistency_service.spec.ts`, `system_permission_catalog_sync_service.spec.ts` y `session_permission_tree_service.spec.ts`: los tres inyectan catálogos de prueba y no deberían verse afectados, pero si alguno asume que solo `employees` y `positions` están enumerados, ese assert hay que ajustarlo aquí y ahora.

- [ ] **Step 4: Commit**

```bash
cd gsti-rh-api
git add tests/unit/services/session_permission_tree_attendance_monitor.spec.ts
git commit -m "test: Trabar el árbol poblado del monitor sin mover ninguna concesión"
```

---

## Task 4: Verificación manual contra la base y cierre del API

**Files:** ninguno (solo comandos y evidencia).

- [ ] **Step 1: Revisión de consistencia antes/después**

Run:
```bash
cd gsti-rh-api && node ace permissions:check-consistency
```
Expected: `knownDebtModules` **no** contiene `employees-attendance-monitor`; ni `declaredNotRegistered` ni `registeredNotDeclared` traen entrada nueva para ese módulo (las 11 declaradas cubren las 11 sembradas).

- [ ] **Step 2: Idempotencia del seed en dos pasadas**

Run:
```bash
cd gsti-rh-api && node ace db:seed && node ace db:seed
```
Expected: `createdPermissionSlugs` vacío en ambas pasadas para el módulo del monitor. Si aparece un slug del Anexo A, la `legacyEquivalence` de esa entrada está mal escrita — corregirla antes de seguir.

- [ ] **Step 3: Conteo de concesiones sin cambio**

Run (antes y después del `db:seed` del paso anterior):
```sql
SELECT COUNT(*) FROM role_system_permissions WHERE role_system_permission_deleted_at IS NULL;
```
Expected: idéntico. El sync nunca escribe en `role_system_permissions`.

- [ ] **Step 4: Forma de la respuesta HTTP**

Con un rol no privilegiado autenticado y `X-Business-Unit-Id` puesto:
```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Business-Unit-Id: $BU" \
  "$API/api/auth/session/permissions" | jq '.data.modules[] | select(.slug=="employees-attendance-monitor")'
```
Expected: `sections` con 4 entradas y 11 acciones en total, cada una con `{ slug, displayName, kind, allowed, reason, revocableFromPrivileged, exceptionProfile, grantable }`. El `version` del árbol cambia respecto a antes de esta rama — es esperado y benigno (`computeCatalogDigest` solo agrega módulos enumerados; el BO no cachea entre sesiones).

- [ ] **Step 5: Diff limpio donde tiene que estarlo**

Run:
```bash
cd gsti-rh-api && git diff --stat multitenant... -- database start/routes app/controllers app/services
```
Expected: **vacío**. Si no lo está, el alcance se salió: esta HU no toca migraciones, seeders, rutas, controladores ni servicios.

- [ ] **Step 6: Lint y tipos**

Run: `cd gsti-rh-api && npm run lint && npm run typecheck`
Expected: limpio, cero `any`.

- [ ] **Step 7: Commit de cierre si hubo ajustes**

Si los pasos anteriores no obligaron a tocar nada, no hay commit. Si sí:

```bash
cd gsti-rh-api
git add -A
git commit -m "fix: Ajustar el catálogo del monitor tras la verificación de consistencia"
```

---

## DoD del API

- [ ] `attendance_monitor_permission_catalog.ts` con las 11 acciones cotejadas slug por slug contra `0018_system_permission_seeder.ts`, todas con `legacyEquivalence` exacta y `exceptionProfile: 'standard'`.
- [ ] `actionsEnumerated: true` en `system_modules_catalog.ts:33` y entrada registrada en `actionsByModule`; docblocks actualizados en ambos archivos.
- [ ] `permissions:check-consistency` sin hallazgos nuevos y `db:seed` idempotente con `createdPermissionSlugs` vacío en dos pasadas.
- [ ] `COUNT(*)` de `role_system_permissions` idéntico antes y después.
- [ ] `GET /api/auth/session/permissions` devuelve el nodo del monitor con 4 secciones y 11 acciones.
- [ ] `git diff --stat` vacío en `database/`, `start/routes/`, `app/controllers/` y `app/services/`.
- [ ] `node ace test unit` en verde; lint y typecheck limpios.

## Handoff al backoffice

Con esto listo y mergeado en la rama, el backoffice puede empezar: hasta que el árbol emita las secciones del monitor, cualquier clave que el BO pregunte resuelve `false` **para todos**, incluido quien la tiene concedida, y se implementaría a ciegas. El plan del BO es `gsti-rh-bo/docs/superpowers/plans/2026-08-27-permiso-descargas-monitor-asistencia-bo.md`.

## Decisiones abiertas que bloquean la liberación (no la implementación)

Ninguna de las dos es del API, pero las dos frenan el despliegue conjunto:

1. **Interruptor de exigencia por módulo.** `PermissionGateService.evaluate:43-46` respeta `system_module_permission_enforcement_active`, que viene apagado para `employees`; el árbol de sesión no lo respeta. Consecuencia: el BO queda más estricto que el API para las cuatro claves del módulo `employees`. Misma decisión elevada en USRH1786931495734 (Wilvardo). Esta HU la hereda.
2. **Concesión por tenant de tres claves sin preset.** `download-attendance-all`, `download-attendance-by-employee` y `download-permissions-by-dates` no están en ninguno de los cuatro paquetes de rol (`role_presets.ts` solo trae `download-attendance-report`, en `:128` y `:161`) y no tienen equivalencia legada. Un cliente que hoy descarga esos tres reportes deja de ver esos botones el día del encendido si nadie se los concede antes.
3. **Colisión de id preexistente sobre `see-payroll` (permiso #206).** Descubierta durante la revisión final de esta rama (no introducida por ella): `0018_system_permission_seeder.ts` siembra el id 206 como `see-payroll` bajo el módulo 7 (`employees-attendance-monitor`), pero `0055_employee_offboardings_module_seeder.ts` reclama el mismo id numérico como `read` bajo el módulo 51 (`employee-offboardings`) vía `updateOrCreate({ systemPermissionId: 206 }, ...)`. En cualquier base que haya corrido el seeder 0055, la fila 206 pertenece hoy a `employee-offboardings`, no al monitor — `employees-attendance-monitor` se queda sin fila viva de `see-payroll`. Ya documentado como hallazgo informativo en `KNOWN_DUPLICATE_IDS` (`app/constants/system_permission_catalog.ts`), pero es una decisión de release, no de código: antes de encender el módulo en cada tenant, correr `permissions:check-consistency` y, si `see-payroll` no aparece con fila viva bajo el módulo 7, materializarla vía `0055_system_permission_catalog_sync_seeder.ts` (no escribe concesiones) y decidir con Wilvardo a quién se le concede — de lo contrario, el modo de nómina del monitor se lee como denegado para todo rol no privilegiado incluso en tenants que históricamente lo tenían.
