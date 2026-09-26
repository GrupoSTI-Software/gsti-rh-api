# Permiso en el revelado de datos sensibles y su bitácora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la puerta trasera del revelado: el sistema exigirá, antes de entregar un dato delicado completo y antes de listar la bitácora, exactamente el mismo permiso que ya decide el tapado en pantalla.

**Architecture:** El revelado no monta `permissionGate` en la ruta (el interruptor apagado otorgaría). Lee la decisión ya resuelta en el request por `evaluateEnforced` → `SensitiveAccessContext.canRead(categoryOf(model, column))` y responde 403 antes de instanciar `PiiRevealService`. La bitácora evalúa `evaluateEnforced` con el slug `sensitive-data-access-log` / `read` / bypass `standard` en un helper que lanza `PiiAuditError` con el código ya declarado `SEC.AUD.FORB.001`.

**Tech Stack:** AdonisJS 6, Lucid, `PermissionGateService.evaluateEnforced`, `SensitiveAccessContext` (ALS), catálogo `SENSITIVE_FIELDS`, Japa (unitarios del helper y del cableado; la matriz HTTP de los CA se valida a mano).

## Global Constraints

- Historia: **USRH1787433076989** · spec `spec-USRH1787433076989.md` · rama `feature/USRH1787433076989-permiso-revelado-sensibles` · target `multitenant`.
- **Solo API.** Cero líneas de `valanserh-bo`. Sin migración, sin seeder, sin ruta nueva, sin texto nuevo en `resources/langs/*.json`.
- **No montar** `middleware.permissionGate` en `start/routes/pii_reveal_routes.ts`. Con el interruptor apagado (`system_module_permission_enforcement_active = 0`) `evaluate` otorga y el fix queda inerte.
- **No llamar** a `evaluate`. Solo `evaluateEnforced`. `module-not-enforced` nunca otorga en esta vía.
- **No usar** `RoleService.hasAccess`. Dejaría el revelado con un criterio distinto del tapado.
- El revelado se gobierna por **categoría legal** (`sensitive-<categoria>-read`), no por el permiso general `reveal-sensitive-data`.
- Orden innegociable del revelado: `recordId` válido → `revealEligibility` (422) → **permiso de categoría (403)** → `PiiRevealService.reveal` (404/200 + asiento).
- Un 403 **nunca** escribe en `pii_access_logs`. La bitácora es el registro de accesos concedidos.
- El `detail` del 403 nombra solo la familia del dato. Prohibido el valor, su longitud, sus últimos dígitos o el nombre del titular.
- Sobre legado `{type,title,message,data}` de las respuestas 200/404/500 del revelado: **no se toca**.
- Bypass `standard`: `root` y `owner` revelan y leen la bitácora. `super-administrador` sí necesita el permiso.
- Fail-closed: `categoryOf` nulo → 403. `canRead` sin store → `false`. Identidad `unresolved` → 403.
- El permiso no amplía el alcance de empresa: registro de otra empresa → 404, no 403.
- Código y comentarios en español; identificadores en inglés; commits Conventional Commits (tipo en inglés, descripción en español).
- La HU declara que no hay suite HTTP nueva. Igual que las órdenes 30/31/32, sí hay unitarios Japa del helper nuevo y del cableado. Los 8 CA se validan a mano y el resultado literal va en el PR.
- **Drift resuelto (2026-08-27), aplicar en silencio:**
  - El spec cita `app/helpers/ensure_employee_assist_write.ts` como molde. **Ese archivo no existe.** El molde real es `isSensitiveReadAllowed` + `evaluateEnforced` (`app/helpers/sensitive_read_decisions.ts:15-17` y `:26-29`) y el constructor de `PiiAuditError`.
  - `SensitiveAccessContext.canRead` vive hoy en `app/utils/sensitive_access_context.ts:40-42` (el spec ancla `:18-21`; el archivo creció con el store de escritura).
  - `evaluateEnforced` está en `app/services/permission_gate_service.ts:67-72`. **Existe.** Si faltara, parar y escalar a Wilvardo; no reimplementarlo.
  - `pii_audit_api_error.ts:24` ya mapea `FORBIDDEN → 'consulta-bitacora-denegada'`. Verificar, no editar.
  - i18n `consulta-bitacora-denegada` está en `resources/langs/es.json:2561` y `en.json:2516` (el spec cita `:2578` / `:2533`; drift de línea).
- **Abierto, no se resuelve aquí (dueño Wilvardo):**
  1. Ningún perfil predefinido trae el permiso de bitácora. Al desplegar, la pantalla queda solo para `root`/`owner` hasta concederlo por empresa.
  2. `X-Origin-Module` no se guarda en el asiento de revelado. Deuda declarada, Anexo C del spec.
  3. Confirmar seeder `0058` ejecutado en cada BD y slug de la fila `system_modules.system_module_id = 46` en al menos dos BD de tenant.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/sensitive_data_read_error_codes.ts` | Agregar `FORBIDDEN: 'EMP.SENS.READ.FORBIDDEN'`. Familia ya existente `EMP.SENS.READ.*`. |
| `app/controllers/pii_reveal_controller.ts` | Tras los 422 de catálogo y **antes** de `new PiiRevealService()`: `categoryOf` + `canRead` → 403. `@swagger` 403. Mapa local de etiquetas de categoría (no i18n). |
| `app/helpers/ensure_pii_access_log_read.ts` | **Nuevo.** Declara `PII_ACCESS_LOG_READ_PERMISSION`, evalúa con `evaluateEnforced` sobre `ctx.permissionGate`, lanza `PiiAuditError` si no es `granted`/`bypass`. |
| `app/controllers/pii_access_log_controller.ts` | Primera línea del `try` de `index`: `await ensurePiiAccessLogRead(ctx)`. `@swagger` 403. **No se toca el `catch`.** |
| `tests/unit/controllers/pii_reveal_eligibility.spec.ts` | Extender el grupo existente: el 403 va después de los 422 y antes del servicio. |
| `tests/unit/helpers/ensure_pii_access_log_read.spec.ts` | **Nuevo.** Solo `granted`/`bypass` dejan pasar; `module-not-enforced`/`denied`/`unresolved` lanzan `PiiAuditError` 403. |

**Sin cambios (condición de la HU):** `start/routes/pii_reveal_routes.ts` · `app/services/pii_reveal_service.ts` · `app/services/pii_access_log_service.ts` · `app/services/permission_gate_service.ts` · `app/utils/sensitive_access_context.ts` · `app/constants/sensitive_fields.ts` · `app/constants/employees_permission_catalog.ts` · `app/constants/role_presets.ts` · `app/helpers/pii_audit_api_error.ts` (verificar) · `resources/langs/*.json` · `database/**` · todo `valanserh-bo`.

---

### Task 1: Código `EMP.SENS.READ.FORBIDDEN` y 403 del revelado

**Files:**
- Modify: `app/constants/sensitive_data_read_error_codes.ts:14-19`
- Modify: `app/controllers/pii_reveal_controller.ts` — imports, `@swagger` 403, bloque tras `:159` y antes de `:161`
- Test: `tests/unit/controllers/pii_reveal_eligibility.spec.ts`

**Interfaces:**
- Consumes: `SensitiveFieldsCatalogService.categoryOf(model: string, column: string): LegalCategory | null` · `SensitiveAccessContext.canRead(category: LegalCategory): boolean` · `SENSITIVE_DATA_READ_ERROR_CODES`
- Produces: `SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN` = `'EMP.SENS.READ.FORBIDDEN'` · respuesta 403 `{ title, detail, key, code }` en `PiiRevealController.reveal` cuando `!category || !canRead(category)`

- [ ] **Step 1: Write the failing test**

Reemplazar el contenido de `tests/unit/controllers/pii_reveal_eligibility.spec.ts` por:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'

test.group('PiiRevealController ramas 422 y 403', () => {
  test('FORBIDDEN existe en la familia EMP.SENS.READ', ({ assert }) => {
    assert.equal(SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN, 'EMP.SENS.READ.FORBIDDEN')
  })

  test('consulta elegibilidad antes del servicio y emite los dos códigos 422', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/pii_reveal_controller.ts'),
      'utf-8'
    )
    assert.include(source, 'revealEligibility')
    assert.include(source, 'SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE')
    assert.include(source, 'SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED')
    assert.include(source, 'El dato no se puede revelar por esta vía')
    assert.include(source, 'El campo solicitado no es un dato sensible')
    assert.include(source, 'el-dato-no-se-puede-revelar-por-esta-via')
    assert.include(source, 'el-campo-solicitado-no-es-un-dato-sensible')
    const revealIndex = source.indexOf('new PiiRevealService()')
    const notRevealableIndex = source.indexOf('NOT_REVEALABLE')
    assert.isBelow(notRevealableIndex, revealIndex)
  })

  test('el 403 de categoría va después de los 422 y antes del servicio', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/pii_reveal_controller.ts'),
      'utf-8'
    )
    const notRevealableIndex = source.indexOf('NOT_REVEALABLE')
    const categoryOfIndex = source.indexOf('catalog.categoryOf')
    const canReadIndex = source.indexOf('SensitiveAccessContext.canRead')
    const forbiddenIndex = source.indexOf('SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN')
    const revealIndex = source.indexOf('new PiiRevealService()')

    assert.isBelow(notRevealableIndex, categoryOfIndex)
    assert.isBelow(categoryOfIndex, canReadIndex)
    assert.isBelow(canReadIndex, forbiddenIndex)
    assert.isBelow(forbiddenIndex, revealIndex)
    assert.include(source, 'Sin permiso para revelar datos sensibles')
    assert.include(source, 'sin-permiso-para-revelar-datos-sensibles')
    assert.include(source, 'datos de identificación')
    assert.include(source, 'datos de contacto')
    assert.include(source, 'datos financieros')
    assert.include(source, 'datos de salud')
    assert.include(source, 'datos biométricos')
    assert.notInclude(source, 'middleware.permissionGate')
    assert.notInclude(source, 'evaluate(')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files="pii_reveal_eligibility" unit`

Expected: FAIL — `SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN` is undefined; el controlador no contiene `categoryOf` / `canRead` / `FORBIDDEN`.

- [ ] **Step 3: Add the error code**

En `app/constants/sensitive_data_read_error_codes.ts`, actualizar el JSDoc (esta HU es la que emite `FORBIDDEN`) y agregar la constante:

```typescript
/**
 * Catálogo ÚNICO de códigos de error de lectura de datos sensibles
 * (cadena CAP-06-01-09, tramo API). Lo crea "Decidir con el permiso de
 * categoría las columnas ya enmascaradas" (USRH1787204602825).
 * USRH1787204602828 agrega NOT_REVEALABLE / NOT_CLASSIFIED.
 * USRH1787433076989 agrega FORBIDDEN (revelado sin permiso de categoría).
 *
 * Convención vigente para toda la cadena: `EMP.SENS.READ.<SEMANTICO>` en
 * SCREAMING_SNAKE, sin numeración (estilo `employee_offboarding_error_codes.ts`).
 * El BO ramifica su UI por `key`; estos códigos quedan para trazabilidad.
 *
 * `key` = slug del título en kebab-case español.
 */
export const SENSITIVE_DATA_READ_ERROR_CODES = {
  /** Columna clasificada pero fuera del registry de PiiRevealService — 422. */
  NOT_REVEALABLE: 'EMP.SENS.READ.NOT_REVEALABLE',
  /** Par modelo/columna ausente del catálogo de campos sensibles — 422. */
  NOT_CLASSIFIED: 'EMP.SENS.READ.NOT_CLASSIFIED',
  /** Revelado individual sin permiso de la categoría legal del par — 403. */
  FORBIDDEN: 'EMP.SENS.READ.FORBIDDEN',
} as const
```

- [ ] **Step 4: Gate the reveal controller**

En `app/controllers/pii_reveal_controller.ts`:

1. Agregar imports (junto a los existentes):

```typescript
import type { LegalCategory } from '#constants/sensitive_fields'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
```

`SENSITIVE_DATA_READ_ERROR_CODES` ya está importado.

2. Debajo de los imports, **antes** de la clase, el mapa local de etiquetas (no i18n; el spec manda textos en el propio controlador, como los dos 422):

```typescript
const SENSITIVE_CATEGORY_LABELS: Record<LegalCategory, string> = {
  identificacion: 'datos de identificación',
  contacto: 'datos de contacto',
  financiero: 'datos financieros',
  salud: 'datos de salud',
  biometrico: 'datos biométricos',
}
```

3. Tras el `if (eligibility === 'not_revealable') { ... }` y **antes** de `const revealService = new PiiRevealService()`:

```typescript
      const category = catalog.categoryOf(model, column)
      if (!category || !SensitiveAccessContext.canRead(category)) {
        response.status(403)
        const categoryLabel = category
          ? SENSITIVE_CATEGORY_LABELS[category]
          : 'este dato sensible'
        return {
          title: 'Sin permiso para revelar datos sensibles',
          detail: `No tienes permiso para consultar ${categoryLabel}.`,
          key: 'sin-permiso-para-revelar-datos-sensibles',
          code: SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN,
        }
      }
```

Cero `any`. Cero `!` sobre `category`. El `null` es denegación. El `detail` interpola solo la etiqueta de familia; nunca `result.value`, nunca `column`, nunca una longitud.

4. En el bloque `@swagger`, tras la respuesta `'422'` y **antes** de `default:`, agregar:

```yaml
       '403':
         description: |
           Sin permiso de la categoría legal del par modelo/columna
           (`EMP.SENS.READ.FORBIDDEN`). Envelope `{title,detail,key,code}`.
           No se escribe asiento en `pii_access_logs`.
         content:
           application/json:
             schema:
               type: object
               properties:
                 title:
                   type: string
                   example: Sin permiso para revelar datos sensibles
                 detail:
                   type: string
                   example: No tienes permiso para consultar datos financieros.
                 key:
                   type: string
                   example: sin-permiso-para-revelar-datos-sensibles
                 code:
                   type: string
                   example: EMP.SENS.READ.FORBIDDEN
```

No tocar las ramas 200, 404, 422 de `recordId`, ni el `catch` 500.

- [ ] **Step 5: Run test to verify it passes**

Run: `node ace test --files="pii_reveal_eligibility" unit`

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add app/constants/sensitive_data_read_error_codes.ts \
  app/controllers/pii_reveal_controller.ts \
  tests/unit/controllers/pii_reveal_eligibility.spec.ts
git commit -m "$(cat <<'EOF'
fix: Exigir permiso de categoría antes de revelar un dato sensible

El botón de ver completo leía la columna cruda sin pasar por
SensitiveAccessContext. El 403 va después de los 422 de catálogo
y antes del servicio, para no escribir asiento ni filtrar el catálogo.
EOF
)"
```

---

### Task 2: Helper `ensurePiiAccessLogRead`

**Files:**
- Create: `app/helpers/ensure_pii_access_log_read.ts`
- Test: `tests/unit/helpers/ensure_pii_access_log_read.spec.ts`

**Interfaces:**
- Consumes: `PermissionGateOptions` · `PII_ACCESS_LOG_MODULE_SLUG` (`'sensitive-data-access-log'`) · `PII_AUDIT_ERROR_CODES.FORBIDDEN` (`'SEC.AUD.FORB.001'`) · `PiiAuditError` · `isSensitiveReadAllowed(decision: PermissionGateDecision): boolean` · `PermissionGateService.evaluateEnforced(user, options)`
- Produces: `ensurePiiAccessLogRead(ctx: HttpContext): Promise<void>` — no retorna valor en el camino feliz; lanza `PiiAuditError` con `httpStatus: 403`, `errorCode: 'SEC.AUD.FORB.001'`, `key: 'consulta-bitacora-denegada'` cuando la decisión no es `granted` ni `bypass`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/helpers/ensure_pii_access_log_read.spec.ts`:

```typescript
import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import PermissionGateService from '#services/permission_gate_service'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import { PiiAuditError } from '#exceptions/pii_audit_error'
import { PII_AUDIT_ERROR_CODES } from '#constants/pii_audit_error_codes'
import { ensurePiiAccessLogRead } from '#helpers/ensure_pii_access_log_read'

function makeCtx(decision: PermissionGateDecision): HttpContext {
  const fakeService = {
    evaluateEnforced: async () => decision,
    evaluate: async () => {
      throw new Error('ensurePiiAccessLogRead no debe llamar evaluate')
    },
  } as unknown as PermissionGateService

  return {
    auth: { user: { userId: 1, roleId: 1 } },
    permissionGate: fakeService,
  } as unknown as HttpContext
}

test.group('ensurePiiAccessLogRead', () => {
  test('granted y bypass no lanzan', async ({ assert }) => {
    await ensurePiiAccessLogRead(makeCtx({ allowed: true, reason: 'granted' }))
    await ensurePiiAccessLogRead(makeCtx({ allowed: true, reason: 'bypass' }))
    assert.isTrue(true)
  })

  test('module-not-enforced, denied y unresolved lanzan FORBIDDEN 403', async ({ assert }) => {
    const denied: PermissionGateDecision[] = [
      { allowed: true, reason: 'module-not-enforced' },
      { allowed: false, reason: 'denied' },
      { allowed: false, reason: 'unresolved' },
    ]

    for (const decision of denied) {
      try {
        await ensurePiiAccessLogRead(makeCtx(decision))
        assert.fail(`debería lanzar con reason=${decision.reason}`)
      } catch (error) {
        assert.instanceOf(error, PiiAuditError)
        const audit = error as PiiAuditError
        assert.equal(audit.errorCode, PII_AUDIT_ERROR_CODES.FORBIDDEN)
        assert.equal(audit.httpStatus, 403)
        assert.equal(audit.key, 'consulta-bitacora-denegada')
        assert.equal(
          audit.message,
          'No tienes permiso para consultar la bitácora de accesos a datos sensibles.'
        )
      }
    }
  })

  test('reusa ctx.permissionGate y no instancia otro servicio', async ({ assert }) => {
    let evaluateCalls = 0
    const existing = {
      evaluateEnforced: async () => {
        evaluateCalls += 1
        return { allowed: true, reason: 'granted' } satisfies PermissionGateDecision
      },
    } as unknown as PermissionGateService

    const ctx = {
      auth: { user: { userId: 1, roleId: 1 } },
      permissionGate: existing,
    } as unknown as HttpContext

    await ensurePiiAccessLogRead(ctx)
    assert.equal(evaluateCalls, 1)
    assert.strictEqual(ctx.permissionGate, existing)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files="ensure_pii_access_log_read" unit`

Expected: FAIL with "Cannot find module '#helpers/ensure_pii_access_log_read'" (o equivalente del loader).

- [ ] **Step 3: Write the helper**

Crear `app/helpers/ensure_pii_access_log_read.ts`:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import {
  PII_ACCESS_LOG_MODULE_SLUG,
  PII_AUDIT_ERROR_CODES,
} from '#constants/pii_audit_error_codes'
import { PiiAuditError } from '#exceptions/pii_audit_error'
import { isSensitiveReadAllowed } from '#helpers/sensitive_read_decisions'
import PermissionGateService from '#services/permission_gate_service'

const PII_ACCESS_LOG_READ_PERMISSION: PermissionGateOptions = {
  module: PII_ACCESS_LOG_MODULE_SLUG,
  action: 'read',
  bypass: 'standard',
}

/**
 * Exige el permiso `read` del módulo `sensitive-data-access-log` con
 * `evaluateEnforced`: el interruptor apagado no otorga.
 * Reusa `ctx.permissionGate` si el middleware de scope ya lo pobló.
 */
export async function ensurePiiAccessLogRead(ctx: HttpContext): Promise<void> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decision = await service.evaluateEnforced(ctx.auth.user, PII_ACCESS_LOG_READ_PERMISSION)
  if (isSensitiveReadAllowed(decision)) {
    return
  }
  throw new PiiAuditError(
    'No tienes permiso para consultar la bitácora de accesos a datos sensibles.',
    PII_AUDIT_ERROR_CODES.FORBIDDEN,
    403,
    'consulta-bitacora-denegada'
  )
}
```

No exportar `PII_ACCESS_LOG_READ_PERMISSION`: es local, como pide el spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files="ensure_pii_access_log_read" unit`

Expected: PASS (3 tests). `module-not-enforced` lanza aunque `allowed: true`, porque `isSensitiveReadAllowed` solo acepta `granted` y `bypass`.

- [ ] **Step 5: Commit**

```bash
git add app/helpers/ensure_pii_access_log_read.ts \
  tests/unit/helpers/ensure_pii_access_log_read.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir evaluateEnforced al consultar la bitácora de accesos

El permiso read de sensitive-data-access-log ya existía y no se
evaluaba. module-not-enforced no otorga: solo granted o bypass.
EOF
)"
```

---

### Task 3: Cablear la bitácora y verificar el traductor

**Files:**
- Modify: `app/controllers/pii_access_log_controller.ts` — import, primera línea del `try` de `index`, `@swagger` 403
- Verify (no editar salvo drift): `app/helpers/pii_audit_api_error.ts:24` · `resources/langs/es.json` clave `consulta-bitacora-denegada` · `resources/langs/en.json` misma clave
- Test: `tests/unit/helpers/ensure_pii_access_log_read.spec.ts` (ya verde; este task añade un spec de cableado)

**Interfaces:**
- Consumes: `ensurePiiAccessLogRead(ctx: HttpContext): Promise<void>` · `respondError` / `resolvePiiAuditApiError` (ya existentes; no se tocan)
- Produces: `PiiAccessLogController.index` lanza (y el `catch` traduce) 403 `{ type: 'error', title, message, key: 'consulta-bitacora-denegada', detail, code: 'SEC.AUD.FORB.001', data: null }` **antes** de `request.validateUsing`

- [ ] **Step 1: Write the failing wiring test**

Crear `tests/unit/controllers/pii_access_log_forbidden.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('PiiAccessLogController permiso de consulta', () => {
  test('index llama ensurePiiAccessLogRead antes de validar el query', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/pii_access_log_controller.ts'),
      'utf-8'
    )
    assert.include(source, "import { ensurePiiAccessLogRead } from '#helpers/ensure_pii_access_log_read'")
    assert.include(source, 'await ensurePiiAccessLogRead(ctx)')
    const ensureIndex = source.indexOf('await ensurePiiAccessLogRead(ctx)')
    const validateIndex = source.indexOf('request.validateUsing(piiAccessLogsListValidator)')
    assert.isBelow(ensureIndex, validateIndex)
    assert.notInclude(source, 'middleware.permissionGate')
    assert.notInclude(source, 'RoleService')
  })

  test('el traductor ya mapea FORBIDDEN a consulta-bitacora-denegada', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/helpers/pii_audit_api_error.ts'), 'utf-8')
    assert.include(source, "FORBIDDEN]: 'consulta-bitacora-denegada'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files="pii_access_log_forbidden" unit`

Expected: FAIL — el controlador no importa ni llama `ensurePiiAccessLogRead`. El segundo test debe PASAR (el mapeo ya existe); si falla, hay drift real: parar y releer `pii_audit_api_error.ts` antes de inventar un código nuevo.

- [ ] **Step 3: Wire the controller**

En `app/controllers/pii_access_log_controller.ts`:

1. Agregar el import (junto a los existentes):

```typescript
import { ensurePiiAccessLogRead } from '#helpers/ensure_pii_access_log_read'
```

2. Primera línea del `try` de `index`, **antes** de `request.validateUsing`:

```typescript
    try {
      await ensurePiiAccessLogRead(ctx)
      const filters = await request.validateUsing(piiAccessLogsListValidator)
```

No tocar `respondError`. No tocar el `catch`. El `PiiAuditError` ya sale por `resolvePiiAuditApiError` con `httpStatus`, `errorCode` y `key`.

3. En el bloque `@swagger` de `index`, tras la respuesta `'422'` y **antes** de `default:`, agregar:

```yaml
       '403':
         description: |
           Sin permiso `read` del módulo `sensitive-data-access-log`
           (`SEC.AUD.FORB.001`). Envelope legado `{type,title,message,key,detail,code,data}`.
           `key` es `consulta-bitacora-denegada` (desviación deliberada: no es el slug del title).
           No se valida el query ni se devuelve `data`/`meta`.
         content:
           application/json:
             schema:
               type: object
               properties:
                 type:
                   type: string
                   example: error
                 title:
                   type: string
                   example: Bitácora de accesos a datos sensibles
                 message:
                   type: string
                   example: No tienes permiso para consultar la bitácora de accesos a datos sensibles.
                 key:
                   type: string
                   example: consulta-bitacora-denegada
                 detail:
                   type: string
                   example: No tienes permiso para consultar la bitácora de accesos a datos sensibles.
                 code:
                   type: string
                   example: SEC.AUD.FORB.001
                 data:
                   nullable: true
                   example: null
```

- [ ] **Step 4: Confirm i18n and translator (no edits)**

Abrir y confirmar, sin escribir:

- `app/helpers/pii_audit_api_error.ts` línea del mapa `FORBIDDEN → 'consulta-bitacora-denegada'`
- `resources/langs/es.json`: `"consulta-bitacora-denegada": "No tienes permiso para consultar la bitácora de accesos a datos sensibles."`
- `resources/langs/en.json`: `"consulta-bitacora-denegada": "You do not have permission to view the sensitive data access log."`

Si alguna clave falta, **parar y escalar**. No agregar textos nuevos: el spec lo prohíbe y el BO ya mapea esas claves.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node ace test --files="pii_access_log_forbidden" --files="ensure_pii_access_log_read" --files="pii_reveal_eligibility" unit`

Expected: PASS. `node ace lint` limpio en los archivos tocados.

- [ ] **Step 6: Commit**

```bash
git add app/controllers/pii_access_log_controller.ts \
  tests/unit/controllers/pii_access_log_forbidden.spec.ts
git commit -m "$(cat <<'EOF'
fix: Exigir permiso de bitácora antes de validar el listado de accesos

Reutiliza SEC.AUD.FORB.001 y consulta-bitacora-denegada. El catch
existente traduce el PiiAuditError; no se valida el query si no hay permiso.
EOF
)"
```

---

### Task 4: Verificación manual y comprobaciones operativas

**Files:**
- Ninguno de producto. Resultado literal en la descripción del PR.

**Interfaces:**
- Consumes: los dos endpoints ya cableados · once columnas del Anexo A · seeder `0058` · fila `system_modules.id = 46`
- Produces: evidencia de CA-1 a CA-8 y de los tres riesgos del spec, escrita en el PR

- [ ] **Step 1: Preflight — `evaluateEnforced` y `SensitiveAccessContext` siguen ahí**

```bash
rg -n "async evaluateEnforced" app/services/permission_gate_service.ts
rg -n "canRead\(category" app/utils/sensitive_access_context.ts
```

Expected: ambas coincidencias existen. Si falta alguna, **detenerse y escalar a Wilvardo**. No reimplementar. No llamar a `evaluate`.

- [ ] **Step 2: Preflight — las rutas no montan `permissionGate`**

```bash
rg -n "permissionGate" start/routes/pii_reveal_routes.ts
```

Expected: cero coincidencias. Si alguien las agregó, revertir ese cambio: con el interruptor apagado el gate otorgaría.

- [ ] **Step 3: Preflight — seeder 0058 y colisión del id 46 (dos BD de tenant)**

En cada BD (mínimo dos tenants):

```sql
-- El módulo de bitácora debe existir por slug, no por id.
SELECT system_module_id, system_module_slug, system_module_active
FROM system_modules
WHERE system_module_slug = 'sensitive-data-access-log'
  AND system_module_deleted_at IS NULL;

-- Riesgo 1: qué slug quedó en la PK 46.
SELECT system_module_id, system_module_slug, system_module_active
FROM system_modules
WHERE system_module_id = 46;

-- El seeder 0058 concedió las cinco lecturas a quien ya tenía reveal-sensitive-data.
SELECT r.role_slug, sp.system_permission_slug
FROM role_system_permissions rsp
JOIN roles r ON r.role_id = rsp.role_id
JOIN system_permissions sp ON sp.system_permission_id = rsp.system_permission_id
WHERE sp.system_permission_slug IN (
  'reveal-sensitive-data',
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read'
)
ORDER BY r.role_slug, sp.system_permission_slug;
```

Si la fila 46 tiene otro slug y **no** existe `sensitive-data-access-log` por slug: escalar a Wilvardo. La reparación de la colisión no es alcance. Si 0058 no corrió, un rol con el botón visible (`reveal-sensitive-data` en el BO) recibirá 403: no desplegar hasta confirmarlo.

- [ ] **Step 4: Matriz HTTP del revelado (CA-1, CA-2, CA-3, CA-4, CA-7)**

Usar un usuario de cliente (no `root`/`owner`) y un colaborador de su empresa. Contar `pii_access_logs` **antes** de cada tanda denegada.

| # | Petición | Permiso | Esperado |
|---|----------|---------|----------|
| 1 | `GET /api/v1/pii/reveal/Person/personCurp/:id` | `sensitive-identificacion-read` | 200, sobre legado, asiento nuevo |
| 2 | Mismo path, mismas once columnas del Anexo A (CURP, RFC, NSS, email, phone, phoneSecondary, CLABE, accountNumber, cardNumber, diagnosis, notes) con su categoría | categoría concedida | 200 + asiento en las once. Si una falla, **detener** el resto |
| 3 | `GET /api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionDiagnosis/:id` | sin `sensitive-salud-read` | 403 `{ title, detail: "No tienes permiso para consultar datos de salud.", key: "sin-permiso-para-revelar-datos-sensibles", code: "EMP.SENS.READ.FORBIDDEN" }`. Conteos de `pii_access_logs` idénticos. El body no contiene el diagnóstico ni su longitud |
| 4 | `GET /api/v1/pii/reveal/EmployeeBank/employeeBankAccountClabe/:id` | sin `sensitive-financiero-read` | 403 `EMP.SENS.READ.FORBIDDEN`. En la **misma sesión**, `GET /api/employee-banks/:id` devuelve la CLABE tapada. No puede existir el par tapado+revelado |
| 5 | Revelado de un `recordId` de otra empresa, con `sensitive-identificacion-read` | categoría concedida | 404 sobre legado. Nunca 403 |
| 6 | `GET /api/v1/pii/reveal/Person/personFirstname/:id` | irrelevante | 422 `EMP.SENS.READ.NOT_CLASSIFIED` (el 403 no se adelanta al catálogo) |
| 7 | Usuario cliente, interruptor del módulo `employees` en `0`, sin la categoría | — | 403 (CA-7). `root` u `owner` en el mismo estado: 200 |

Las once columnas revelables y su permiso:

| Modelo | Columna | Permiso |
|--------|---------|---------|
| `Person` | `personCurp` | `sensitive-identificacion-read` |
| `Person` | `personRfc` | `sensitive-identificacion-read` |
| `Person` | `personImssNss` | `sensitive-identificacion-read` |
| `Person` | `personEmail` | `sensitive-contacto-read` |
| `Person` | `personPhone` | `sensitive-contacto-read` |
| `Person` | `personPhoneSecondary` | `sensitive-contacto-read` |
| `EmployeeBank` | `employeeBankAccountClabe` | `sensitive-financiero-read` |
| `EmployeeBank` | `employeeBankAccountNumber` | `sensitive-financiero-read` |
| `EmployeeBank` | `employeeBankAccountCardNumber` | `sensitive-financiero-read` |
| `EmployeeMedicalCondition` | `employeeMedicalConditionDiagnosis` | `sensitive-salud-read` |
| `EmployeeMedicalCondition` | `employeeMedicalConditionNotes` | `sensitive-salud-read` |

- [ ] **Step 5: Matriz HTTP de la bitácora (CA-5, CA-6)**

| # | Petición | Permiso `sensitive-data-access-log:read` | Esperado |
|---|----------|------------------------------------------|----------|
| 1 | `GET /api/v1/pii/access-logs` | no | 403 `{ type: 'error', title: "Bitácora de accesos a datos sensibles", message: "No tienes permiso para consultar la bitácora de accesos a datos sensibles.", key: "consulta-bitacora-denegada", code: "SEC.AUD.FORB.001", data: null }`. Sin filas, sin `meta` |
| 2 | `GET /api/v1/pii/access-logs?dateFrom=2026-12-01&dateTo=2026-01-01` | no | 403, **no** 422: la comprobación va antes del validador |
| 3 | Mismo query de fechas invertidas | sí | 422 `SEC.AUD.VAL.DATE.001` (vigente) |
| 4 | `GET /api/v1/pii/access-logs` con asientos en dos empresas, una fuera de alcance | sí | 200, solo filas del alcance. Misma forma que hoy |
| 5 | `root` / `owner` sin el permiso concedido | bypass `standard` | 200 |

- [ ] **Step 6: Recorrido de punta a punta en el backoffice (CA-8)**

Sin cambiar `valanserh-bo`. Con y sin permiso:

- Botón de ver completo en Datos personales, Bancos y Condición médica. Sin permiso: aviso "No tienes permiso para ver este dato."
- Pantalla Bitácora de accesos a datos sensibles. Sin permiso: mensaje mapeado desde `consulta-bitacora-denegada` / `SEC.AUD.FORB.001`.

- [ ] **Step 7: Lint y tests unitarios finales**

```bash
node ace lint
node ace test --files="pii_reveal_eligibility" --files="ensure_pii_access_log_read" --files="pii_access_log_forbidden" unit
```

Expected: lint limpio, 8 tests PASS. Cero `any` en los archivos nuevos o editados.

- [ ] **Step 8: Commit only if Step 4–6 produced a code fix**

Si la verificación encontró un bug y se corrigió en esta sesión, commit aparte con el `fix` concreto. Si solo se documentó evidencia, no hay commit: el resultado va al PR.

---

## Self-Review

**1. Spec coverage**

| Requisito | Task |
|-----------|------|
| CA-1 revelado feliz + asiento | Task 1 (no toca 200) + Task 4 paso 4 |
| CA-2 403 sin asiento, `EMP.SENS.READ.FORBIDDEN` | Task 1 + Task 4 paso 4 |
| CA-3 misma decisión que el tapado (`canRead`) | Task 1 |
| CA-4 permiso no amplía empresa (404) | Task 1 no toca el servicio + Task 4 paso 4 |
| CA-5 bitácora 403 `SEC.AUD.FORB.001` antes del validador | Task 2 + Task 3 |
| CA-6 bitácora acotada por empresa | no se toca el servicio + Task 4 paso 5 |
| CA-7 interruptor apagado no otorga; `root`/`owner` sí; `unresolved` 403 | Task 1 (`canRead`) + Task 2 (`isSensitiveReadAllowed`) + Task 4 |
| CA-8 cero cambios BO | Global Constraints |
| Orden 422 → 403 → servicio | Task 1 test de índices |
| No `permissionGate` en rutas | Global Constraints + Task 4 paso 2 |
| No i18n nueva; reutilizar `consulta-bitacora-denegada` | Task 3 paso 4 |
| Colisión id 46, seeder 0058, reparto bitácora | Task 4 paso 3 (operativo / Wilvardo) |
| Deuda `X-Origin-Module` | Global Constraints, no se implementa |

**2. Placeholder scan:** sin TBD, sin "similar to Task N", sin "add validation". Cada paso de código trae el bloque completo.

**3. Type consistency:** `ensurePiiAccessLogRead(ctx: HttpContext): Promise<void>` · `SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN` · `PII_ACCESS_LOG_MODULE_SLUG` · `PII_AUDIT_ERROR_CODES.FORBIDDEN` · `isSensitiveReadAllowed` · `categoryOf` → `LegalCategory | null` · `canRead(category: LegalCategory): boolean`.
