# Lectura sensible por categoría legal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que los cinco permisos `sensitive-<categoria>-read` decidan de verdad si cada una de las once columnas que hoy se enmascaran siempre viaja en claro o tapada, sin cambiar el aspecto para quien no tiene el permiso y sin que `module-not-enforced` otorgue ni niegue esa lectura.

**Architecture:** Se extrae `evaluateEnforced` en `PermissionGateService` (omite el interruptor del módulo; resuelve identidad → bypass → concesiones). Un middleware abre un `AsyncLocalStorage` con las cinco decisiones, resueltas una sola vez por petición. El `serialize` de Lucid (síncrono) lee ese contexto y enmascara o no según la categoría que deriva del catálogo. Un seeder de transición concede las cinco lecturas a quien ya tenía `reveal-sensitive-data`.

**Tech Stack:** AdonisJS 6, Lucid, AsyncLocalStorage, `PermissionGateService`, catálogo `SENSITIVE_FIELDS`, Japa (unitarios del motor y de los helpers nuevos; la matriz HTTP se valida a mano).

## Global Constraints

- Historia: USRH1787204602825 · orden 30 · primera del tramo API de datos sensibles. Spec fuente: `spec-USRH1787204602825.md`.
- Rebanada **solo API**. Cero líneas de `valanserh-bo`. Sin migraciones. Sin endpoints nuevos. Sin cambiar el algoritmo de `maskSensitiveValue` ni `MASK_CHAR`.
- Alcanza **únicamente las 11 columnas** que hoy llevan `maskedInApi: true`. Las 15 restantes son USRH1787204602828 (orden 31).
- `evaluate` no cambia de comportamiento. `permission_gate_middleware.ts` sigue llamando a `evaluate`. No se enciende `system_module_permission_enforcement_active`.
- `module-not-enforced` no otorga lectura sensible ni la niega: no participa. Sede: `evaluateEnforced`.
- Fail-closed de lectura: sin contexto, `unresolved`, sin clasificación o `reason` distinto de `granted`/`bypass` → dato tapado. Nunca en claro por omisión.
- Bypass `standard`: `root` y `owner` leen en claro sin los cinco slugs. `super-administrador` (dirección general) sí necesita el permiso.
- La categoría de un dato se deriva **siempre** del catálogo. Prohibido el literal `'contacto' | 'identificacion' | 'financiero' | 'salud' | 'biometrico'` en un `serialize`.
- Las cinco decisiones se resuelven **una vez por petición** sobre `ctx.permissionGate` (reusar la instancia; no `new PermissionGateService()` por categoría).
- El permiso de categoría **nunca** rechaza la consulta (no 403). Decide el contenido del dato, no el acceso a la pantalla.
- Esta historia no toca la bitácora (`PiiAccessLogService`), el revelado bajo motivo (`pii_reveal_routes.ts`), ni `app/modules/consent/evidence/evidence.service.ts`.
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en español.
- La HU declara que la matriz HTTP se valida a mano. Aun así se extiende el spec Japa **ya existente** de `PermissionGateService` (si no, la extracción de `resolveByIdentity` puede romper las >100 rutas con `permissionGate`) y se añaden unitarios de los helpers nuevos (ALS, serialize, mapa de slugs). No se crea una suite funcional HTTP nueva.
- Anclas del spec validadas el 2026-08-20 contra este árbol. Drift trivial a aplicar en silencio:
  - Prefijo de seeder: el spec decía `0056`; el máximo actual es `0057_sat_cfdi_use_seeder.ts`. Usar **`0058`**. El día de implementar, reconfirmar con `ls database/seeders | sort | tail -5`.
  - `SENSITIVE_FIELDS.length` hoy es **27** (entró `TenantBillingProfile.rfc` después del spec). El JSDoc se actualiza al conteo real, no a un 26 fijo.
  - Anexo A del spec intercambia las líneas de `personEmail`/`personPhone`. Usar las líneas reales de `person.ts` listadas en la Task 8.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/services/permission_gate_service.ts` | `evaluate` idéntico; nuevo `evaluateEnforced` + privado `resolveByIdentity`. |
| `app/constants/sensitive_fields.ts` | `LEGAL_CATEGORIES` (iteración exhaustiva) + JSDoc: conteo real y `maskedInApi` ya no decide el serialize. |
| `app/services/sensitive_fields_catalog_service.ts` | `categoryOf(model, column): LegalCategory \| null`. Fuente única de categoría. |
| `app/constants/employees_read_permission_declarations.ts` | `EMPLOYEES_SENSITIVE_READ_PERMISSIONS: Record<LegalCategory, PermissionGateOptions>`. |
| `app/utils/sensitive_access_context.ts` | ALS espejo de `tenant_context.ts`. `run` / `canRead` / `isActive`. |
| `app/helpers/sensitive_read_decisions.ts` | Resuelve las 5 decisiones con `evaluateEnforced` y abre el ALS. |
| `app/middleware/sensitive_access_context_middleware.ts` | Abre el contexto en grupos con `auth()` y sin `businessScope`. |
| `app/helpers/sensitive_serialize.ts` | Fábrica `sensitiveSerialize(model, column)` para el `serialize` de Lucid. |
| `app/models/person.ts` | 6 columnas: 3 contacto + 3 identificación. |
| `app/models/employee_bank.ts` | 3 columnas financieras. |
| `app/models/employee_medical_condition.ts` | 2 columnas de salud. |
| `app/middleware/business_unit_scope_middleware.ts` | Anidar apertura del ALS dentro del único `TenantContext.run`. |
| `app/middleware/business_unit_scope_optional_middleware.ts` | Anidar en **los dos** `TenantContext.run` (`:54` y `:96`). |
| `start/kernel.ts` | Registrar `sensitiveAccess` en `router.named`. |
| `start/routes/person_routes.ts` | Montar `sensitiveAccess` solo en el grupo `/api/persons`. |
| `start/routes/customer_routes.ts` | Montar `sensitiveAccess` (preload de `person`). |
| `start/routes/pilot_routes.ts` | Idem. |
| `start/routes/flight_attendant_routes.ts` | Idem. |
| `app/constants/sensitive_data_read_error_codes.ts` | Solo JSDoc de convención `EMP.SENS.READ.*`. Cero constantes (las emite la orden 31). |
| `database/seeders/0058_sensitive_read_grants_backfill_seeder.ts` | Concesión de transición idempotente. |
| `tests/unit/services/permission_gate_service.spec.ts` | Extender: `evaluateEnforced` ignora el interruptor; `evaluate` no cambia. |
| `tests/unit/utils/sensitive_access_context.spec.ts` | Fail-closed sin store; `canRead` respeta el mapa. |
| `tests/unit/helpers/sensitive_serialize.spec.ts` | Claro vs tapado vs sin clasificación vs sin contexto. |
| `tests/unit/helpers/sensitive_read_decisions.spec.ts` | Solo `granted`/`bypass` → `true`. |
| `tests/unit/constants/employees_sensitive_read_permissions.spec.ts` | Cinco slugs reales, bypass `standard`, Record completo. |
| `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts` | Los cinco slugs `-read` siguen siendo literales del catálogo. |
| `tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts` | Idempotencia + no retira `reveal-sensitive-data`. |

**No se modifica:** `app/helpers/sensitive_mask.ts` · `app/middleware/permission_gate_middleware.ts` · `app/services/pii_access_log_service.ts` · `app/constants/employees_permission_catalog.ts` · `app/constants/role_presets.ts` · `start/routes/login_routes.ts` · `start/routes/pii_reveal_routes.ts` · migraciones · evidencia de consentimiento.

---

### Task 1: Catálogo — `categoryOf` y `LEGAL_CATEGORIES`

**Files:**
- Modify: `app/constants/sensitive_fields.ts:25` (tras el type `LegalCategory`) y `:57-68` (JSDoc)
- Modify: `app/services/sensitive_fields_catalog_service.ts` (tras `isMaskedInApi`, hoy `:98-100`)
- Test: `tests/unit/services/sensitive_fields_catalog_service.spec.ts` (crear)

**Interfaces:**
- Consumes: `SENSITIVE_FIELDS`, `LegalCategory`, `SensitiveField`
- Produces:
  - `LEGAL_CATEGORIES: readonly LegalCategory[]` — las cinco categorías, para iterar sin `Object.keys`
  - `SensitiveFieldsCatalogService.categoryOf(model: string, column: string): LegalCategory | null`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/services/sensitive_fields_catalog_service.spec.ts`:

```typescript
import { test } from '@japa/runner'
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { LEGAL_CATEGORIES, SENSITIVE_FIELDS } from '#constants/sensitive_fields'

test.group('SensitiveFieldsCatalogService.categoryOf', () => {
  test('devuelve la categoría del catálogo para las 11 columnas maskedInApi', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('Person', 'personCurp'), 'identificacion')
    assert.equal(catalog.categoryOf('Person', 'personRfc'), 'identificacion')
    assert.equal(catalog.categoryOf('Person', 'personImssNss'), 'identificacion')
    assert.equal(catalog.categoryOf('Person', 'personEmail'), 'contacto')
    assert.equal(catalog.categoryOf('Person', 'personPhone'), 'contacto')
    assert.equal(catalog.categoryOf('Person', 'personPhoneSecondary'), 'contacto')
    assert.equal(catalog.categoryOf('EmployeeBank', 'employeeBankAccountClabe'), 'financiero')
    assert.equal(catalog.categoryOf('EmployeeBank', 'employeeBankAccountNumber'), 'financiero')
    assert.equal(catalog.categoryOf('EmployeeBank', 'employeeBankAccountCardNumber'), 'financiero')
    assert.equal(
      catalog.categoryOf('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('EmployeeMedicalCondition', 'employeeMedicalConditionNotes'),
      'salud'
    )
  })

  test('devuelve null si el par modelo/columna no está clasificado', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.isNull(catalog.categoryOf('Person', 'personFirstname'))
    assert.isNull(catalog.categoryOf('Employee', 'dailySalary'))
  })
})

test.group('LEGAL_CATEGORIES', () => {
  test('enumera exactamente las cinco categorías del type LegalCategory', ({ assert }) => {
    assert.deepEqual(
      [...LEGAL_CATEGORIES].sort(),
      ['biometrico', 'contacto', 'financiero', 'identificacion', 'salud']
    )
    const used = new Set(SENSITIVE_FIELDS.map((field) => field.legalCategory))
    for (const category of LEGAL_CATEGORIES) {
      assert.isTrue(used.has(category), `categoría huérfana: ${category}`)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/services/sensitive_fields_catalog_service.spec.ts`

Expected: FAIL — `LEGAL_CATEGORIES` is not exported; `categoryOf` is not a function.

- [ ] **Step 3: Write minimal implementation**

En `app/constants/sensitive_fields.ts`, inmediatamente debajo del type `LegalCategory` (hoy línea 25):

```typescript
export const LEGAL_CATEGORIES = [
  'identificacion',
  'financiero',
  'biometrico',
  'salud',
  'contacto',
] as const satisfies readonly LegalCategory[]
```

Reemplazar el JSDoc de `maskedInApi` (`:57-64`) por:

```typescript
  /**
   * Marca de elegibilidad para el endpoint de revelado (`GET /reveal/:token`).
   *
   * A partir de USRH1787204602825 el enmascaramiento en serialización ya no
   * se decide con esta bandera: lo decide el permiso de lectura de la
   * categoría legal, vía `sensitiveSerialize`. `true` solo indica que el
   * campo puede pedirse completo por el flujo de revelado con motivo.
   *
   * Ausencia (o `false`) = el campo aún no entra a ese flujo de revelado.
   * No cambiar ninguna entrada del arreglo en esta historia.
   */
```

Reemplazar el JSDoc del catálogo (`:67-68` "~24 columnas") por el conteo real. Contar el día de implementar:

```bash
node -e "import('./app/constants/sensitive_fields.ts').then(m => console.log(m.SENSITIVE_FIELDS.length))"
```

Hoy imprime `27`. Escribir exactamente ese número, p. ej. `Catálogo maestro de campos personales sensibles de Valanserh (27 columnas).`

En `app/services/sensitive_fields_catalog_service.ts`, al final de la clase:

```typescript
  /**
   * Categoría legal del par modelo/columna, o `null` si no está clasificado.
   * Fuente única: nadie más debe guardar su propia copia de la categoría.
   */
  categoryOf(model: string, column: string): LegalCategory | null {
    return SENSITIVE_FIELDS.find((f) => f.model === model && f.column === column)?.legalCategory ?? null
  }
```

No tocar ninguna entrada de `SENSITIVE_FIELDS`. No cambiar `isMaskedInApi`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/services/sensitive_fields_catalog_service.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/sensitive_fields.ts app/services/sensitive_fields_catalog_service.ts tests/unit/services/sensitive_fields_catalog_service.spec.ts
git commit -m "$(cat <<'EOF'
feat: Derivar la categoría legal de un campo desde el catálogo

EOF
)"
```

---

### Task 2: `evaluateEnforced` — el interruptor del módulo deja de decidir la lectura sensible

**Files:**
- Modify: `app/services/permission_gate_service.ts:38-74`
- Test: `tests/unit/services/permission_gate_service.spec.ts`

**Interfaces:**
- Consumes: `isModuleEnforced`, `resolveIdentity`, `hasPermissionGateBypass`, `grantedActionSlugs` (privados vigentes)
- Produces:
  - `evaluate(user, options): Promise<PermissionGateDecision>` — comportamiento **idéntico** al de hoy
  - `evaluateEnforced(user, options): Promise<PermissionGateDecision>` — omite el paso 1 (`isModuleEnforced`)
  - `private resolveByIdentity(user, options): Promise<PermissionGateDecision>` — pasos 2-5 + catch

**Gate de arranque (obligatorio, antes de tocar nada):**

```bash
sed -n '38,74p' app/services/permission_gate_service.ts
```

Confirmar que el primer `return` sigue siendo `{ allowed: true, reason: 'module-not-enforced' }` cuando el módulo no está exigido. Si ese corte ya no fuera el primer paso, **parar y escalar a Wilvardo**. No improvisar.

- [ ] **Step 1: Write the failing test**

Añadir al final del `test.group('PermissionGateService', ...)` en `tests/unit/services/permission_gate_service.spec.ts` (el `group.setup` ya crea `testModule`, `readPermission`, `plainRole`):

```typescript
  test('evaluateEnforced con interruptor apagado: root resuelve bypass, no module-not-enforced', async ({
    assert,
  }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const root = await findPrivilegedRole('root')
    const service = new PermissionGateService()
    const decision = await service.evaluateEnforced(fakeUser(root.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'standard',
    })

    assert.isTrue(decision.allowed)
    assert.equal(decision.reason, 'bypass')
  })

  test('evaluateEnforced con interruptor apagado: rol de cliente sin concesión queda denied', async ({
    assert,
  }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluateEnforced(fakeUser(plainRole.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'standard',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'denied')
  })

  test('evaluate con interruptor apagado sigue cortando en module-not-enforced (no regresión)', async ({
    assert,
  }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluate(fakeUser(plainRole.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'strict',
    })

    assert.isTrue(decision.allowed)
    assert.equal(decision.reason, 'module-not-enforced')
  })

  test('evaluateEnforced con usuario nulo: unresolved, no module-not-enforced', async ({
    assert,
  }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluateEnforced(null, {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'standard',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'unresolved')
  })

  test('evaluateEnforced con permiso concedido: granted aunque el interruptor esté apagado', async ({
    assert,
  }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    try {
      const service = new PermissionGateService()
      const decision = await service.evaluateEnforced(fakeUser(plainRole.roleId), {
        module: MODULE_SLUG,
        action: 'read',
        bypass: 'strict',
      })

      assert.isTrue(decision.allowed)
      assert.equal(decision.reason, 'granted')
    } finally {
      await grant.delete()
    }
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/services/permission_gate_service.spec.ts`

Expected: FAIL — `evaluateEnforced is not a function`. Los tests previos de `evaluate` siguen en verde.

- [ ] **Step 3: Write minimal implementation**

Reemplazar el método `evaluate` actual (`:38-74`) por esta extracción. El cuerpo de pasos 2-5 es el texto vigente de `:48-66`; el `catch` es el de `:67-73`.

```typescript
  async evaluate(
    user: User | null | undefined,
    options: PermissionGateOptions
  ): Promise<PermissionGateDecision> {
    try {
      const enforced = await this.isModuleEnforced(options.module)
      if (!enforced) {
        return { allowed: true, reason: 'module-not-enforced' }
      }
    } catch (error) {
      logger.error(
        { err: error, module: options.module, action: options.action },
        'PermissionGateService: no se pudo determinar el permiso; se niega la operación'
      )
      return { allowed: false, reason: 'unresolved' }
    }

    return this.resolveByIdentity(user, options)
  }

  /**
   * Igual que `evaluate`, pero SIN consultar la exigencia del módulo: la decisión
   * se resuelve siempre por identidad -> bypass -> concesiones reales.
   *
   * La consumen las cuatro rebanadas de datos sensibles (USRH1787204602825/28/19/29).
   * Ahí `module-not-enforced` no puede OTORGAR —abriría las columnas clasificadas
   * a cualquier autenticado— ni NEGAR a secas —cerraría también a `root` y `owner`,
   * que son la única salida del tenant—. Por eso no participa.
   */
  async evaluateEnforced(
    user: User | null | undefined,
    options: PermissionGateOptions
  ): Promise<PermissionGateDecision> {
    return this.resolveByIdentity(user, options)
  }

  private async resolveByIdentity(
    user: User | null | undefined,
    options: PermissionGateOptions
  ): Promise<PermissionGateDecision> {
    try {
      if (!user) {
        return { allowed: false, reason: 'unresolved' }
      }

      const identity = await this.resolveIdentity(user)
      if (!identity) {
        return { allowed: false, reason: 'unresolved' }
      }

      if (hasPermissionGateBypass(identity, options.bypass)) {
        return { allowed: true, reason: 'bypass' }
      }

      const granted = await this.grantedActionSlugs(identity.roleId, options.module)
      const actions = Array.isArray(options.action) ? options.action : [options.action]
      if (actions.some((slug) => granted?.has(slug))) {
        return { allowed: true, reason: 'granted' }
      }
      return { allowed: false, reason: 'denied' }
    } catch (error) {
      logger.error(
        { err: error, module: options.module, action: options.action },
        'PermissionGateService: no se pudo determinar el permiso; se niega la operación'
      )
      return { allowed: false, reason: 'unresolved' }
    }
  }
```

No tocar `permission_gate_middleware.ts`. No tocar `isModuleEnforced` ni `grantedActionSlugs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/services/permission_gate_service.spec.ts`

Expected: PASS, incluidos los tests previos (`interruptor apagado: permite sin resolver identidad`, bypass `standard`/`expanded`/`strict`, caché, action lista).

- [ ] **Step 5: Commit**

```bash
git add app/services/permission_gate_service.ts tests/unit/services/permission_gate_service.spec.ts
git commit -m "$(cat <<'EOF'
feat: Evaluar lectura sensible sin el interruptor del módulo

EOF
)"
```

---

### Task 3: Mapa de los cinco permisos de lectura por categoría

**Files:**
- Modify: `app/constants/employees_read_permission_declarations.ts`
- Modify: `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts`
- Test: `tests/unit/constants/employees_sensitive_read_permissions.spec.ts` (crear)

**Interfaces:**
- Consumes: `employeesStandard` (privado del archivo), `LegalCategory`, `EmployeeActionSlug`, `PermissionGateOptions`
- Produces: `EMPLOYEES_SENSITIVE_READ_PERMISSIONS: Record<LegalCategory, PermissionGateOptions>`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/constants/employees_sensitive_read_permissions.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { EMPLOYEES_SENSITIVE_READ_PERMISSIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { LEGAL_CATEGORIES } from '#constants/sensitive_fields'

test.group('EMPLOYEES_SENSITIVE_READ_PERMISSIONS', () => {
  test('declara las cinco categorías con module employees, bypass standard y slug del catálogo', ({
    assert,
  }) => {
    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((action) => action.slug))

    assert.deepEqual(
      Object.keys(EMPLOYEES_SENSITIVE_READ_PERMISSIONS).sort(),
      [...LEGAL_CATEGORIES].sort()
    )

    const expected: Record<string, string> = {
      identificacion: 'sensitive-identificacion-read',
      contacto: 'sensitive-contacto-read',
      financiero: 'sensitive-financiero-read',
      salud: 'sensitive-salud-read',
      biometrico: 'sensitive-biometrico-read',
    }

    for (const category of LEGAL_CATEGORIES) {
      const declaration = EMPLOYEES_SENSITIVE_READ_PERMISSIONS[category]
      assert.equal(declaration.module, 'employees')
      assert.equal(declaration.bypass, 'standard')
      assert.equal(declaration.action, expected[category])
      assert.isTrue(
        catalogSlugs.has(declaration.action as string),
        `slug ausente en catálogo: ${String(declaration.action)}`
      )
    }
  })
})
```

Añadir al type-check `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts`, junto a los slugs válidos ya existentes:

```typescript
const sensitiveIdentificacionRead: EmployeeActionSlug = 'sensitive-identificacion-read'
void sensitiveIdentificacionRead
const sensitiveContactoRead: EmployeeActionSlug = 'sensitive-contacto-read'
void sensitiveContactoRead
const sensitiveFinancieroRead: EmployeeActionSlug = 'sensitive-financiero-read'
void sensitiveFinancieroRead
const sensitiveSaludRead: EmployeeActionSlug = 'sensitive-salud-read'
void sensitiveSaludRead
const sensitiveBiometricoRead: EmployeeActionSlug = 'sensitive-biometrico-read'
void sensitiveBiometricoRead
```

Un slug inventado en esas asignaciones debe seguir fallando `tsc` (ya hay un `@ts-expect-error` en el archivo).

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/constants/employees_sensitive_read_permissions.spec.ts`

Expected: FAIL — `EMPLOYEES_SENSITIVE_READ_PERMISSIONS` is not exported.

- [ ] **Step 3: Write minimal implementation**

Al final de `app/constants/employees_read_permission_declarations.ts` (tras `EMPLOYEES_TERMINATED_EMPLOYEES_READ_PERMISSION`, hoy `:147-148`). Importar `EmployeeActionSlug` y `LegalCategory` arriba:

```typescript
import type { PermissionGateOptions } from '#constants/permission_gate'
import type { EmployeeActionSlug } from '#constants/employees_permission_catalog'
import type { LegalCategory } from '#constants/sensitive_fields'
```

Añadir, junto a `employeesStandard` (sin exportar el helper interno):

```typescript
const employeesSensitiveRead = (action: EmployeeActionSlug): PermissionGateOptions =>
  employeesStandard(action)
```

Y al final del archivo:

```typescript
/**
 * Permisos de lectura por categoría legal (USRH1787204602825).
 * Consumidos por `resolveSensitiveReadDecisions`; no se montan en rutas.
 * Un slug inventado no compila: `employeesSensitiveRead` exige `EmployeeActionSlug`.
 */
export const EMPLOYEES_SENSITIVE_READ_PERMISSIONS: Record<LegalCategory, PermissionGateOptions> = {
  identificacion: employeesSensitiveRead('sensitive-identificacion-read'),
  contacto: employeesSensitiveRead('sensitive-contacto-read'),
  financiero: employeesSensitiveRead('sensitive-financiero-read'),
  salud: employeesSensitiveRead('sensitive-salud-read'),
  biometrico: employeesSensitiveRead('sensitive-biometrico-read'),
}
```

No añadir estas claves a `EMPLOYEES_READ_PERMISSION_DECLARATIONS`: no son declaraciones de ruta. El test existente que cuenta 119 operaciones de ese mapa no debe moverse.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node ace test --files tests/unit/constants/employees_sensitive_read_permissions.spec.ts
npx tsc --noEmit
```

Expected: PASS. `tsc` sigue en verde (el `@ts-expect-error` del slug inventado sigue usado).

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_read_permission_declarations.ts tests/unit/constants/employees_sensitive_read_permissions.spec.ts tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts
git commit -m "$(cat <<'EOF'
feat: Declarar el mapa de lectura sensible por categoría legal

EOF
)"
```

---

### Task 4: Contexto de acceso sensible por petición (ALS)

**Files:**
- Create: `app/utils/sensitive_access_context.ts`
- Test: `tests/unit/utils/sensitive_access_context.spec.ts`

**Interfaces:**
- Consumes: `LegalCategory` de `#constants/sensitive_fields`
- Produces:
  - `SensitiveAccessContext.run<T>(decisions: Record<LegalCategory, boolean>, fn: () => T): T`
  - `SensitiveAccessContext.canRead(category: LegalCategory): boolean` — `?? false`
  - `SensitiveAccessContext.isActive(): boolean`

Molde exacto: `app/utils/tenant_context.ts:36-84`. El `serialize` de Lucid es síncrono; por eso `canRead` no puede ser `async`.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/utils/sensitive_access_context.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import type { LegalCategory } from '#constants/sensitive_fields'

const allDenied: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

test.group('SensitiveAccessContext', () => {
  test('sin contexto activo canRead es false y isActive es false', ({ assert }) => {
    assert.isFalse(SensitiveAccessContext.isActive())
    assert.isFalse(SensitiveAccessContext.canRead('contacto'))
    assert.isFalse(SensitiveAccessContext.canRead('financiero'))
  })

  test('con contexto activo canRead respeta cada categoría', ({ assert }) => {
    SensitiveAccessContext.run(
      { ...allDenied, contacto: true },
      () => {
        assert.isTrue(SensitiveAccessContext.isActive())
        assert.isTrue(SensitiveAccessContext.canRead('contacto'))
        assert.isFalse(SensitiveAccessContext.canRead('financiero'))
        assert.isFalse(SensitiveAccessContext.canRead('identificacion'))
      }
    )
    assert.isFalse(SensitiveAccessContext.isActive())
  })

  test('al salir de run el store no se filtra a la siguiente llamada', ({ assert }) => {
    SensitiveAccessContext.run({ ...allDenied, salud: true }, () => {
      assert.isTrue(SensitiveAccessContext.canRead('salud'))
    })
    assert.isFalse(SensitiveAccessContext.canRead('salud'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/utils/sensitive_access_context.spec.ts`

Expected: FAIL — módulo `#utils/sensitive_access_context` no existe.

- [ ] **Step 3: Write minimal implementation**

Crear `app/utils/sensitive_access_context.ts`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks'
import type { LegalCategory } from '#constants/sensitive_fields'

type SensitiveReadStore = Record<LegalCategory, boolean>

const storage = new AsyncLocalStorage<SensitiveReadStore>()

/**
 * Contexto request-scoped de lectura sensible (USRH1787204602825).
 *
 * Las cinco decisiones se resuelven una vez en middleware (async) y se leen
 * de forma síncrona desde el `serialize` de Lucid, igual que `TenantContext.getScope()`.
 *
 * Fail-closed: sin store activo, `canRead` devuelve `false`. En crons, comandos
 * y jobs el dato sale tapado — a diferencia del mixin de tenant, que sin
 * contexto es fail-open. Aquí el fail-open sería una fuga.
 */
export const SensitiveAccessContext = {
  canRead(category: LegalCategory): boolean {
    return storage.getStore()?.[category] ?? false
  },

  isActive(): boolean {
    return storage.getStore() !== undefined
  },

  run<T>(decisions: Record<LegalCategory, boolean>, fn: () => T): T {
    return storage.run(decisions, fn)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/utils/sensitive_access_context.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/sensitive_access_context.ts tests/unit/utils/sensitive_access_context.spec.ts
git commit -m "$(cat <<'EOF'
feat: Propagar las decisiones de lectura sensible por petición

EOF
)"
```

---

### Task 5: Resolver las cinco decisiones una vez y abrir el ALS

**Files:**
- Create: `app/helpers/sensitive_read_decisions.ts`
- Test: `tests/unit/helpers/sensitive_read_decisions.spec.ts`

**Interfaces:**
- Consumes:
  - `PermissionGateService.evaluateEnforced` (Task 2)
  - `EMPLOYEES_SENSITIVE_READ_PERMISSIONS` (Task 3)
  - `SensitiveAccessContext.run` (Task 4)
  - `LEGAL_CATEGORIES` (Task 1)
  - `ctx.permissionGate` — mismo patrón que `permission_gate_middleware.ts:16`
- Produces:
  - `isSensitiveReadAllowed(decision: PermissionGateDecision): boolean` — `reason === 'granted' || reason === 'bypass'`
  - `resolveSensitiveReadDecisions(ctx: HttpContext): Promise<Record<LegalCategory, boolean>>`
  - `runWithSensitiveReadDecisions(ctx: HttpContext, next: NextFn): Promise<unknown>`

La regla de mapeo mira `reason`, no `allowed`. Así, si alguien cableara `evaluate` por error, `module-not-enforced` (`allowed: true`) seguiría tapando.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/helpers/sensitive_read_decisions.spec.ts`:

```typescript
import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import PermissionGateService from '#services/permission_gate_service'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import {
  isSensitiveReadAllowed,
  resolveSensitiveReadDecisions,
  runWithSensitiveReadDecisions,
} from '#helpers/sensitive_read_decisions'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import type { LegalCategory } from '#constants/sensitive_fields'

test.group('isSensitiveReadAllowed', () => {
  test('solo granted y bypass abren el dato', ({ assert }) => {
    const cases: Array<[PermissionGateDecision, boolean]> = [
      [{ allowed: true, reason: 'granted' }, true],
      [{ allowed: true, reason: 'bypass' }, true],
      [{ allowed: true, reason: 'module-not-enforced' }, false],
      [{ allowed: false, reason: 'denied' }, false],
      [{ allowed: false, reason: 'unresolved' }, false],
    ]
    for (const [decision, expected] of cases) {
      assert.equal(isSensitiveReadAllowed(decision), expected, decision.reason)
    }
  })
})

function makeCtx(
  evaluateEnforced: (action: string) => PermissionGateDecision
): HttpContext {
  const fakeService = {
    evaluateEnforced: async (_user: unknown, options: { action: string }) =>
      evaluateEnforced(options.action as string),
  } as unknown as PermissionGateService

  return {
    auth: { user: { userId: 1, roleId: 1 } },
    permissionGate: fakeService,
  } as unknown as HttpContext
}

test.group('resolveSensitiveReadDecisions', () => {
  test('mezcla categorías: contacto granted, el resto denied', async ({ assert }) => {
    const ctx = makeCtx((action) =>
      action === 'sensitive-contacto-read'
        ? { allowed: true, reason: 'granted' }
        : { allowed: false, reason: 'denied' }
    )

    const decisions = await resolveSensitiveReadDecisions(ctx)
    assert.isTrue(decisions.contacto)
    assert.isFalse(decisions.identificacion)
    assert.isFalse(decisions.financiero)
    assert.isFalse(decisions.salud)
    assert.isFalse(decisions.biometrico)
  })

  test('bypass abre las cinco', async ({ assert }) => {
    const ctx = makeCtx(() => ({ allowed: true, reason: 'bypass' }))
    const decisions = await resolveSensitiveReadDecisions(ctx)
    assert.isTrue(decisions.identificacion)
    assert.isTrue(decisions.contacto)
    assert.isTrue(decisions.financiero)
    assert.isTrue(decisions.salud)
    assert.isTrue(decisions.biometrico)
  })

  test('reusa ctx.permissionGate y no instancia otro servicio', async ({ assert }) => {
    const ctx = makeCtx(() => ({ allowed: false, reason: 'denied' }))
    const original = ctx.permissionGate
    await resolveSensitiveReadDecisions(ctx)
    assert.strictEqual(ctx.permissionGate, original)
  })
})

test.group('runWithSensitiveReadDecisions', () => {
  test('deja canRead activo durante next() y lo cierra al salir', async ({ assert }) => {
    const ctx = makeCtx((action) =>
      action === 'sensitive-salud-read'
        ? { allowed: true, reason: 'granted' }
        : { allowed: false, reason: 'denied' }
    )
    let seenInside = false
    const next: NextFn = async () => {
      seenInside = SensitiveAccessContext.canRead('salud')
      assert.isFalse(SensitiveAccessContext.canRead('contacto'))
    }

    await runWithSensitiveReadDecisions(ctx, next)
    assert.isTrue(seenInside)
    assert.isFalse(SensitiveAccessContext.canRead('salud'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/helpers/sensitive_read_decisions.spec.ts`

Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

Crear `app/helpers/sensitive_read_decisions.ts`:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import PermissionGateService from '#services/permission_gate_service'
import type { PermissionGateDecision } from '#services/permission_gate_service'
import { EMPLOYEES_SENSITIVE_READ_PERMISSIONS } from '#constants/employees_read_permission_declarations'
import { LEGAL_CATEGORIES } from '#constants/sensitive_fields'
import type { LegalCategory } from '#constants/sensitive_fields'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

export function isSensitiveReadAllowed(decision: PermissionGateDecision): boolean {
  return decision.reason === 'granted' || decision.reason === 'bypass'
}

export async function resolveSensitiveReadDecisions(
  ctx: HttpContext
): Promise<Record<LegalCategory, boolean>> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decisions = {} as Record<LegalCategory, boolean>

  for (const category of LEGAL_CATEGORIES) {
    const decision = await service.evaluateEnforced(
      ctx.auth.user,
      EMPLOYEES_SENSITIVE_READ_PERMISSIONS[category]
    )
    decisions[category] = isSensitiveReadAllowed(decision)
  }

  return decisions
}

export async function runWithSensitiveReadDecisions(
  ctx: HttpContext,
  next: NextFn
): Promise<unknown> {
  const decisions = await resolveSensitiveReadDecisions(ctx)
  return SensitiveAccessContext.run(decisions, () => next())
}
```

Cinco `evaluateEnforced` sobre **la misma** instancia: la primera paga `resolveIdentity` + `grantedActionSlugs`; las otras cuatro leen caché. No instanciar el servicio por categoría.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/helpers/sensitive_read_decisions.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/helpers/sensitive_read_decisions.ts tests/unit/helpers/sensitive_read_decisions.spec.ts
git commit -m "$(cat <<'EOF'
feat: Resolver las cinco lecturas sensibles una vez por petición

EOF
)"
```

---

### Task 6: Abrir el contexto en scope, kernel y los cuatro grupos sin unidad de negocio

**Files:**
- Create: `app/middleware/sensitive_access_context_middleware.ts`
- Modify: `app/middleware/business_unit_scope_middleware.ts:113`
- Modify: `app/middleware/business_unit_scope_optional_middleware.ts:54` y `:96`
- Modify: `start/kernel.ts:48-62`
- Modify: `start/routes/person_routes.ts:18-19`
- Modify: `start/routes/customer_routes.ts:16-17`
- Modify: `start/routes/pilot_routes.ts:13-14`
- Modify: `start/routes/flight_attendant_routes.ts:16-17`
- Test: `tests/unit/middleware/sensitive_access_context_middleware.spec.ts` (crear)
- Test: `tests/unit/routes/sensitive_access_context_mounts.spec.ts` (crear)

**Interfaces:**
- Consumes: `runWithSensitiveReadDecisions` (Task 5), `TenantContext.run` (ya existente)
- Produces: contexto abierto en las 118 monturas de scope + 4 grupos con solo `auth()`

**No montar** `sensitiveAccess` en grupos que ya llevan `businessScope` / `businessScopeOptional`: abriría el ALS dos veces y duplicaría las consultas. Cubierto por el censo de la Task 10.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/middleware/sensitive_access_context_middleware.spec.ts`:

```typescript
import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import PermissionGateService from '#services/permission_gate_service'
import SensitiveAccessContextMiddleware from '#middleware/sensitive_access_context_middleware'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

test.group('SensitiveAccessContextMiddleware', () => {
  test('abre el ALS durante next() usando evaluateEnforced', async ({ assert }) => {
    const fakeService = {
      evaluateEnforced: async () => ({ allowed: true, reason: 'bypass' }),
    } as unknown as PermissionGateService

    const ctx = {
      auth: { user: { userId: 1, roleId: 1 } },
      permissionGate: fakeService,
    } as unknown as HttpContext

    let inside = false
    await new SensitiveAccessContextMiddleware().handle(ctx, async () => {
      inside = SensitiveAccessContext.canRead('identificacion')
    })

    assert.isTrue(inside)
    assert.isFalse(SensitiveAccessContext.isActive())
  })
})
```

Crear `tests/unit/routes/sensitive_access_context_mounts.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

test.group('Apertura del contexto de lectura sensible', () => {
  test('kernel registra sensitiveAccess', ({ assert }) => {
    const kernel = readFileSync(join(ROOT, 'start/kernel.ts'), 'utf-8')
    assert.include(kernel, 'sensitiveAccess:')
    assert.include(kernel, '#middleware/sensitive_access_context_middleware')
  })

  test('businessScope anida runWithSensitiveReadDecisions dentro de TenantContext.run', ({
    assert,
  }) => {
    const source = readFileSync(
      join(ROOT, 'app/middleware/business_unit_scope_middleware.ts'),
      'utf-8'
    )
    assert.include(source, 'runWithSensitiveReadDecisions')
    assert.include(source, 'TenantContext.run')
  })

  test('businessScopeOptional anida la apertura en sus dos retornos', ({ assert }) => {
    const source = readFileSync(
      join(ROOT, 'app/middleware/business_unit_scope_optional_middleware.ts'),
      'utf-8'
    )
    const occurrences = source.split('runWithSensitiveReadDecisions').length - 1
    assert.equal(occurrences, 2)
  })

  test('los cuatro grupos con solo auth() montan sensitiveAccess y no businessScope', ({
    assert,
  }) => {
    const files = [
      'start/routes/person_routes.ts',
      'start/routes/customer_routes.ts',
      'start/routes/pilot_routes.ts',
      'start/routes/flight_attendant_routes.ts',
    ]
    for (const relative of files) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, 'middleware.sensitiveAccess()', relative)
    }

    const persons = readFileSync(join(ROOT, 'start/routes/person_routes.ts'), 'utf-8')
    assert.include(persons, "prefix('/api/persons')")
    assert.match(
      persons,
      /prefix\('\/api\/persons'\)[\s\S]*?\.use\(middleware\.auth\(\)\)[\s\S]*?\.use\(middleware\.sensitiveAccess\(\)\)/
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node ace test --files tests/unit/middleware/sensitive_access_context_middleware.spec.ts
node ace test --files tests/unit/routes/sensitive_access_context_mounts.spec.ts
```

Expected: FAIL — middleware no existe; kernel y rutas no registran `sensitiveAccess`.

- [ ] **Step 3: Write minimal implementation**

Crear `app/middleware/sensitive_access_context_middleware.ts`:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { runWithSensitiveReadDecisions } from '#helpers/sensitive_read_decisions'

/**
 * Abre el contexto de lectura sensible en grupos autenticados que no pasan
 * por `businessScope` / `businessScopeOptional` (USRH1787204602825).
 * Requiere `auth()` previo. No rechaza la petición: solo llena el ALS.
 */
export default class SensitiveAccessContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    return runWithSensitiveReadDecisions(ctx, next)
  }
}
```

En `start/kernel.ts`, dentro de `router.named({...})`, añadir junto a `permissionGate`:

```typescript
  /** Decisiones de lectura sensible por categoría (USRH1787204602825). Fail-closed. */
  sensitiveAccess: () => import('#middleware/sensitive_access_context_middleware'),
```

En `app/middleware/business_unit_scope_middleware.ts`:

1. Importar `runWithSensitiveReadDecisions` desde `#helpers/sensitive_read_decisions`.
2. Reemplazar la línea `return TenantContext.run([requestedId], () => next())` por:

```typescript
    return TenantContext.run([requestedId], () => runWithSensitiveReadDecisions(ctx, next))
```

En `app/middleware/business_unit_scope_optional_middleware.ts`:

1. Mismo import.
2. Reemplazar **los dos** retornos:

```typescript
      return TenantContext.run(fullScope, () => runWithSensitiveReadDecisions(ctx, next))
```

y

```typescript
    return TenantContext.run([requestedId], () => runWithSensitiveReadDecisions(ctx, next))
```

No hay un tercer `TenantContext.run` en ese archivo. No tocar los `return ctx.response.status(...)`.

Rutas — añadir `.use(middleware.sensitiveAccess())` **después** de `auth()`, solo en estos grupos:

`start/routes/person_routes.ts` (grupo `/api/persons`, hoy `:10-19`):

```typescript
  .prefix('/api/persons')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
```

No montarlo en `/api/person-get-employee` (ya tiene `businessScope`) ni en `/api/persons-get-places-of-birth` (no serializa columnas clasificadas).

`start/routes/customer_routes.ts`:

```typescript
  .prefix('/api/customers')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
```

`start/routes/pilot_routes.ts`:

```typescript
  .prefix('/api/pilots')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
```

`start/routes/flight_attendant_routes.ts`:

```typescript
  .prefix('/api/flight-attendants')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node ace test --files tests/unit/middleware/sensitive_access_context_middleware.spec.ts
node ace test --files tests/unit/routes/sensitive_access_context_mounts.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/middleware/sensitive_access_context_middleware.ts app/middleware/business_unit_scope_middleware.ts app/middleware/business_unit_scope_optional_middleware.ts start/kernel.ts start/routes/person_routes.ts start/routes/customer_routes.ts start/routes/pilot_routes.ts start/routes/flight_attendant_routes.ts tests/unit/middleware/sensitive_access_context_middleware.spec.ts tests/unit/routes/sensitive_access_context_mounts.spec.ts
git commit -m "$(cat <<'EOF'
feat: Abrir el contexto de lectura sensible en cada petición autenticada

EOF
)"
```

---

### Task 7: Fábrica de serialización condicional

**Files:**
- Create: `app/helpers/sensitive_serialize.ts`
- Create: `app/constants/sensitive_data_read_error_codes.ts` (JSDoc de convención; lo pide el spec para que la orden 31 no cree el archivo)
- Test: `tests/unit/helpers/sensitive_serialize.spec.ts`

**Interfaces:**
- Consumes:
  - `SensitiveFieldsCatalogService.categoryOf` (Task 1) — se llama **una vez** al evaluar el decorador, no por fila
  - `SensitiveAccessContext.canRead` (Task 4)
  - `maskSensitiveValue` / `MASK_CHAR` (sin reescribir)
- Produces: `sensitiveSerialize(model: string, column: string): (value: string | null) => string | null`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/helpers/sensitive_serialize.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import type { LegalCategory } from '#constants/sensitive_fields'

const allDenied: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

test.group('sensitiveSerialize', () => {
  test('sin contexto activo enmascara igual que hoy', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personCurp')
    assert.equal(serialize('ABCD123456MDFABC01'), '••••••••••••••BC01')
    assert.equal(serialize('ABCD123456MDFABC01'), maskSensitiveValue('ABCD123456MDFABC01', 'identificacion'))
  })

  test('con permiso de la categoría entrega el valor en claro', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personEmail')
    SensitiveAccessContext.run({ ...allDenied, contacto: true }, () => {
      assert.equal(serialize('juan@empresa.com'), 'juan@empresa.com')
    })
  })

  test('sin permiso de la categoría enmascara; otra categoría en claro no abre esta', ({
    assert,
  }) => {
    const serializeClabe = sensitiveSerialize('EmployeeBank', 'employeeBankAccountClabe')
    SensitiveAccessContext.run({ ...allDenied, contacto: true }, () => {
      assert.equal(serializeClabe('012345678901234567'), '••••••••••••••4567')
    })
  })

  test('salud sin permiso entrega cinco MASK_CHAR', ({ assert }) => {
    const serialize = sensitiveSerialize(
      'EmployeeMedicalCondition',
      'employeeMedicalConditionDiagnosis'
    )
    assert.equal(serialize('gripe'), MASK_CHAR.repeat(5))
  })

  test('par no clasificado se tapa siempre, incluso con bypass de otra categoría', ({
    assert,
  }) => {
    const serialize = sensitiveSerialize('Person', 'personFirstname')
    SensitiveAccessContext.run(
      {
        identificacion: true,
        contacto: true,
        financiero: true,
        salud: true,
        biometrico: true,
      },
      () => {
        assert.equal(serialize('Ana'), MASK_CHAR.repeat(5))
      }
    )
  })

  test('null permanece null', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personRfc')
    assert.isNull(serialize(null))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/helpers/sensitive_serialize.spec.ts`

Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

Crear `app/helpers/sensitive_serialize.ts`:

```typescript
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { MASK_CHAR, maskSensitiveValue } from '#helpers/sensitive_mask'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

const catalog = new SensitiveFieldsCatalogService()

/**
 * Fábrica de `serialize` para columnas clasificadas (USRH1787204602825).
 *
 * Resuelve la categoría una vez al evaluar el decorador (carga del módulo).
 * Si el par no está en el catálogo, tapa siempre con máscara total: nunca
 * en claro por omisión.
 */
export function sensitiveSerialize(
  model: string,
  column: string
): (value: string | null) => string | null {
  const category = catalog.categoryOf(model, column)

  return (value: string | null): string | null => {
    if (value === null || value === undefined) {
      return null
    }

    if (category === null) {
      return MASK_CHAR.repeat(5)
    }

    if (SensitiveAccessContext.canRead(category)) {
      return value
    }

    return maskSensitiveValue(value, category)
  }
}
```

Crear `app/constants/sensitive_data_read_error_codes.ts` (el spec lo pide ahora para no dejar el archivo a la orden 31; **cero constantes emitidas**):

```typescript
/**
 * Catálogo ÚNICO de códigos de error de lectura de datos sensibles
 * (cadena CAP-06-01-09, tramo API). Lo crea "Decidir con el permiso de
 * categoría las columnas ya enmascaradas" (USRH1787204602825) y lo
 * extienden las hermanas — USRH1787204602828 agrega las dos constantes
 * que sí se emiten; no se declaran aquí para no dejar constantes muertas.
 *
 * Convención vigente para toda la cadena: `EMP.SENS.READ.<SEMANTICO>` en
 * SCREAMING_SNAKE, sin numeración (estilo `employee_offboarding_error_codes.ts`).
 * El BO ramifica su UI por `key`; estos códigos quedan para trazabilidad.
 *
 * `key` = slug del título en kebab-case español.
 */
export const SENSITIVE_DATA_READ_ERROR_CODES = {} as const

export type SensitiveDataReadErrorCode =
  (typeof SENSITIVE_DATA_READ_ERROR_CODES)[keyof typeof SENSITIVE_DATA_READ_ERROR_CODES]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/helpers/sensitive_serialize.spec.ts`

Expected: PASS. Referencias: CURP `ABCD123456MDFABC01` → `••••••••••••••BC01`; correo `juan@empresa.com` sin permiso → `j•••@empresa.com` (lo cubre `maskSensitiveValue`; no hace falta reassertarlo aquí si el caso CURP ya compara contra la función real).

- [ ] **Step 5: Commit**

```bash
git add app/helpers/sensitive_serialize.ts app/constants/sensitive_data_read_error_codes.ts tests/unit/helpers/sensitive_serialize.spec.ts
git commit -m "$(cat <<'EOF'
feat: Serializar columnas sensibles según el permiso de su categoría

EOF
)"
```

---

### Task 8: Sustituir los 11 literales en los tres modelos

**Files:**
- Modify: `app/models/person.ts` — import + 6 `serialize`
- Modify: `app/models/employee_bank.ts` — import + 3 `serialize`
- Modify: `app/models/employee_medical_condition.ts` — import + 2 `serialize`
- Test: `tests/unit/models/sensitive_serialize_wiring.spec.ts` (crear; censo de fuente)

**Interfaces:**
- Consumes: `sensitiveSerialize('Person' | 'EmployeeBank' | 'EmployeeMedicalCondition', '<column>')`
- Produces: cero literales de categoría en `app/models/`

Líneas reales (2026-08-20), no las del anexo A del spec:

| Modelo | Columna | `serialize` hoy |
|--------|---------|-----------------|
| `Person` | `personPhone` | `:111` `'contacto'` |
| `Person` | `personEmail` | `:132` `'contacto'` |
| `Person` | `personPhoneSecondary` | `:151` `'contacto'` |
| `Person` | `personCurp` | `:172` `'identificacion'` |
| `Person` | `personRfc` | `:192` `'identificacion'` |
| `Person` | `personImssNss` | `:213` `'identificacion'` |
| `EmployeeBank` | `employeeBankAccountClabe` | `:82` `'financiero'` |
| `EmployeeBank` | `employeeBankAccountNumber` | `:103` `'financiero'` |
| `EmployeeBank` | `employeeBankAccountCardNumber` | `:124` `'financiero'` |
| `EmployeeMedicalCondition` | `employeeMedicalConditionDiagnosis` | `:89` `'salud'` |
| `EmployeeMedicalCondition` | `employeeMedicalConditionNotes` | `:108` `'salud'` |

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/models/sensitive_serialize_wiring.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const MODELS = [
  'app/models/person.ts',
  'app/models/employee_bank.ts',
  'app/models/employee_medical_condition.ts',
] as const

test.group('Wiring sensitiveSerialize en los 3 modelos', () => {
  test('los tres modelos importan sensitiveSerialize y no maskSensitiveValue', ({ assert }) => {
    for (const relative of MODELS) {
      const source = readFileSync(join(process.cwd(), relative), 'utf-8')
      assert.include(source, "import { sensitiveSerialize } from '#helpers/sensitive_serialize'")
      assert.notInclude(source, 'maskSensitiveValue')
    }
  })

  test('Person serializa las 6 columnas con la fábrica y el nombre de columna', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/models/person.ts'), 'utf-8')
    for (const column of [
      'personPhone',
      'personEmail',
      'personPhoneSecondary',
      'personCurp',
      'personRfc',
      'personImssNss',
    ]) {
      assert.include(source, `sensitiveSerialize('Person', '${column}')`)
    }
  })

  test('EmployeeBank serializa las 3 columnas financieras', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/models/employee_bank.ts'), 'utf-8')
    for (const column of [
      'employeeBankAccountClabe',
      'employeeBankAccountNumber',
      'employeeBankAccountCardNumber',
    ]) {
      assert.include(source, `sensitiveSerialize('EmployeeBank', '${column}')`)
    }
  })

  test('EmployeeMedicalCondition serializa diagnóstico y notas', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/models/employee_medical_condition.ts'),
      'utf-8'
    )
    assert.include(
      source,
      "sensitiveSerialize('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis')"
    )
    assert.include(
      source,
      "sensitiveSerialize('EmployeeMedicalCondition', 'employeeMedicalConditionNotes')"
    )
  })

  test('cero literales de categoría en serialize de app/models', ({ assert }) => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const output = execSync(
      "rg -n \"maskSensitiveValue\\(.*'\" app/models/ || true",
      { cwd: process.cwd(), encoding: 'utf-8' }
    )
    assert.equal(output.trim(), '')
  })
})
```

Si el entorno no tiene `rg` en el `execSync` del último test, sustituir ese test por leer los tres archivos y `assert.notMatch(source, /maskSensitiveValue\([^)]*'/)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts`

Expected: FAIL — los modelos aún importan `maskSensitiveValue` con literales.

- [ ] **Step 3: Write minimal implementation**

En los tres modelos, reemplazar el import:

```typescript
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
```

(Quitar `import { maskSensitiveValue } from '#helpers/sensitive_mask'`.)

Sustituir cada `serialize` por la fábrica. El `prepare`/`consume` de cifrado **no se toca**.

`person.ts`:

```typescript
    serialize: (value: string | null) => sensitiveSerialize('Person', 'personPhone')(value),
```

```typescript
    serialize: (value: string | null) => sensitiveSerialize('Person', 'personEmail')(value),
```

```typescript
    serialize: (value: string | null) => sensitiveSerialize('Person', 'personPhoneSecondary')(value),
```

```typescript
    serialize: (value: string | null) => sensitiveSerialize('Person', 'personCurp')(value),
```

```typescript
    serialize: (value: string | null) => sensitiveSerialize('Person', 'personRfc')(value),
```

```typescript
    serialize: (value: string | null) => sensitiveSerialize('Person', 'personImssNss')(value),
```

Eso instancia la fábrica en cada serialize de cada fila. Evitarlo: la fábrica debe evaluarse **una vez** al definir la columna, no por fila. Forma correcta (la que pide el spec: “al evaluar el decorador”):

```typescript
    serialize: sensitiveSerialize('Person', 'personPhone'),
```

Repetir esa forma (sin lambda envolvente) en las 11 columnas. Lucid acepta `(value) => ...`; `sensitiveSerialize` ya devuelve esa función.

`employee_bank.ts`:

```typescript
    serialize: sensitiveSerialize('EmployeeBank', 'employeeBankAccountClabe'),
```

```typescript
    serialize: sensitiveSerialize('EmployeeBank', 'employeeBankAccountNumber'),
```

```typescript
    serialize: sensitiveSerialize('EmployeeBank', 'employeeBankAccountCardNumber'),
```

`employee_medical_condition.ts`:

```typescript
    serialize: sensitiveSerialize('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis'),
```

```typescript
    serialize: sensitiveSerialize('EmployeeMedicalCondition', 'employeeMedicalConditionNotes'),
```

No tocar `Employee.dailySalary`, biométricos, ni ninguna otra columna del catálogo.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts
rg -n "maskSensitiveValue(.*'" app/models/ || true
```

Expected: PASS. `rg` sin resultados. `evidence.service.ts` sigue importando `maskSensitiveValue` — fuera de `app/models/`, correcto.

- [ ] **Step 5: Commit**

```bash
git add app/models/person.ts app/models/employee_bank.ts app/models/employee_medical_condition.ts tests/unit/models/sensitive_serialize_wiring.spec.ts
git commit -m "$(cat <<'EOF'
feat: Gobernar el tapado de las once columnas con el permiso de categoría

EOF
)"
```

---

### Task 9: Seeder de transición — nadie pierde acceso

**Files:**
- Create: `database/seeders/0058_sensitive_read_grants_backfill_seeder.ts` (reconfirmar prefijo el día de implementar)
- Test: `tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts`

**Interfaces:**
- Consumes: `reveal-sensitive-data` y los cinco `sensitive-*-read` **por slug** en el módulo `employees`. Nunca por id (el spec menciona que hoy `reveal-sensitive-data` es id 186; no usarlo).
- Produces: para cada `role_id` con concesión viva de `reveal-sensitive-data`, `RoleSystemPermission.firstOrCreate` de las cinco lecturas. No retira `reveal-sensitive-data`. No concede ningún `-write`.

Molde de `firstOrCreate`: `database/seeders/0049_consent_evidence_permissions_seeder.ts:44-51`.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts`. El nombre del archivo debe coincidir con el prefijo real del seeder.

```typescript
import { test } from '@japa/runner'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import SensitiveReadGrantsBackfillSeeder from '#database/seeders/0058_sensitive_read_grants_backfill_seeder'

const READ_SLUGS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

async function employeesModule(): Promise<SystemModule> {
  const row = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', 'employees')
    .first()
  if (!row) {
    throw new Error('El módulo employees debe existir en la BD de pruebas.')
  }
  return row
}

test.group('0058_sensitive_read_grants_backfill_seeder', (group) => {
  let fixtureRole: Role
  let reveal: SystemPermission

  group.setup(async () => {
    const module = await employeesModule()
    const found = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', module.systemModuleId)
      .where('system_permission_slug', 'reveal-sensitive-data')
      .first()
    if (!found) {
      throw new Error('reveal-sensitive-data debe existir. Corre 0047 y 0055 antes.')
    }
    reveal = found

    fixtureRole = await Role.create({
      roleName: 'Backfill Sensitive Read Fixture',
      roleSlug: `backfill-sens-read-${Date.now()}`,
      roleDescription: 'Fixture',
      roleActive: 1,
      roleBusinessAccess: '',
    })
    await RoleSystemPermission.firstOrCreate(
      { roleId: fixtureRole.roleId, systemPermissionId: reveal.systemPermissionId },
      { roleId: fixtureRole.roleId, systemPermissionId: reveal.systemPermissionId }
    )
  })

  group.teardown(async () => {
    const module = await employeesModule()
    const reads = await SystemPermission.query()
      .where('system_module_id', module.systemModuleId)
      .whereIn('system_permission_slug', [...READ_SLUGS])
    const ids = reads.map((row) => row.systemPermissionId)
    await RoleSystemPermission.query()
      .where('role_id', fixtureRole.roleId)
      .whereIn('system_permission_id', [...ids, reveal.systemPermissionId])
      .delete()
    await Role.query().where('role_id', fixtureRole.roleId).delete()
  })

  test('concede las cinco lecturas al rol con reveal-sensitive-data y no duplica al correr dos veces', async ({
    assert,
  }) => {
    const seeder = new SensitiveReadGrantsBackfillSeeder({} as never)
    await seeder.run()
    await seeder.run()

    const module = await employeesModule()
    const reads = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', module.systemModuleId)
      .whereIn('system_permission_slug', [...READ_SLUGS])
    assert.equal(reads.length, 5)

    for (const permission of reads) {
      const grants = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('role_id', fixtureRole.roleId)
        .where('system_permission_id', permission.systemPermissionId)
      assert.equal(grants.length, 1, permission.systemPermissionSlug)
    }

    const revealGrants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', fixtureRole.roleId)
      .where('system_permission_id', reveal.systemPermissionId)
    assert.equal(revealGrants.length, 1)
  })
})
```

Si `#database/seeders/...` no resuelve, importar por ruta relativa como hace `tests/unit/seeders/0055_system_permission_catalog_sync_seeder.spec.ts`:

```typescript
import SensitiveReadGrantsBackfillSeeder from '#database/seeders/0058_sensitive_read_grants_backfill_seeder'
```

Comprobar en `package.json` `"imports"`: ya existe `"#database/*": "./database/*.js"`. El seeder vive en `database/seeders/`, así que el import es `'#database/seeders/0058_sensitive_read_grants_backfill_seeder'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts`

Expected: FAIL — el seeder no existe. Si fallara antes porque faltan los cinco slugs en BD, correr `node ace db:seed --files database/seeders/0055_system_permission_catalog_sync_seeder.ts` en el entorno de test (o el flujo de seed que ya usa la suite).

- [ ] **Step 3: Write minimal implementation**

Antes de crear el archivo:

```bash
ls database/seeders | sort | tail -5
```

Si `0058` ya estuviera ocupado, usar el siguiente libre y renombrar test + import.

Crear `database/seeders/0058_sensitive_read_grants_backfill_seeder.ts`:

```typescript
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'

const REVEAL_SLUG = 'reveal-sensitive-data'
const READ_SLUGS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

/**
 * Concesión de transición (USRH1787204602825, regla 9): los roles que ya
 * tienen `reveal-sensitive-data` reciben las cinco lecturas por categoría,
 * para que nadie pierda acceso el día del despliegue.
 *
 * Idempotente: `firstOrCreate`; se puede re-ejecutar sin duplicar.
 * No retira `reveal-sensitive-data`. No concede permisos de escritura.
 * Resuelve por slug, nunca por id numérico.
 */
export default class extends BaseSeeder {
  async run() {
    const employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .first()

    if (!employeesModule) {
      throw new Error(
        'Seeder 0058: no existe el módulo employees. Corre primero 0017_system_module_seeder.'
      )
    }

    const reveal = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', employeesModule.systemModuleId)
      .where('system_permission_slug', REVEAL_SLUG)
      .first()

    if (!reveal) {
      throw new Error(
        'Seeder 0058: no existe reveal-sensitive-data en employees. Corre primero 0047_pii_sensitive_data_module_seeder.ts.'
      )
    }

    const readPermissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', employeesModule.systemModuleId)
      .whereIn('system_permission_slug', [...READ_SLUGS])

    if (readPermissions.length !== READ_SLUGS.length) {
      const found = new Set(readPermissions.map((row) => row.systemPermissionSlug))
      const missing = READ_SLUGS.filter((slug) => !found.has(slug))
      throw new Error(
        `Seeder 0058: faltan permisos de lectura sensible (${missing.join(', ')}). Corre primero 0055_system_permission_catalog_sync_seeder.ts.`
      )
    }

    const revealGrants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('system_permission_id', reveal.systemPermissionId)

    for (const grant of revealGrants) {
      for (const permission of readPermissions) {
        await RoleSystemPermission.firstOrCreate(
          { roleId: grant.roleId, systemPermissionId: permission.systemPermissionId },
          { roleId: grant.roleId, systemPermissionId: permission.systemPermissionId }
        )
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts`

Expected: PASS. Segunda corrida con el mismo conteo de filas.

Comprobar a mano en desarrollo (CA-5 / prueba 5 del spec):

```bash
node ace db:seed --files database/seeders/0058_sensitive_read_grants_backfill_seeder.ts
node ace db:seed --files database/seeders/0058_sensitive_read_grants_backfill_seeder.ts
```

Contar `role_system_permissions` de los cinco slugs antes/después: no duplicar.

- [ ] **Step 5: Commit**

```bash
git add database/seeders/0058_sensitive_read_grants_backfill_seeder.ts tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts
git commit -m "$(cat <<'EOF'
feat: Conceder las cinco lecturas sensibles a quien ya revelaba datos

EOF
)"
```

---

### Task 10: Censo, lint y pruebas manuales (DoD)

**Files:**
- Ninguno nuevo de producto. El censo se pega en la descripción del PR.

**Interfaces:**
- Consumes: todo lo anterior
- Produces: evidencia de DoD

- [ ] **Step 1: Censo de rutas que serializan los tres modelos**

Correr y pegar la salida en el PR:

```bash
rg -n "middleware\.(businessScope|businessScopeOptional|sensitiveAccess|auth)\(" start/routes/person_routes.ts start/routes/customer_routes.ts start/routes/pilot_routes.ts start/routes/flight_attendant_routes.ts start/routes/employee_routes.ts start/routes/employee_bank_routes.ts start/routes/employee_medical_condition_routes.ts start/routes/login_routes.ts start/routes/pii_reveal_routes.ts start/routes/user_routes.ts
```

Tabla esperada (declarar excepciones, no “arreglarlas” aquí):

| Grupo | Serializa | Middleware de contexto | Notas |
|-------|-----------|------------------------|--------|
| `/api/employees` | `Person` (preload) | `businessScope` | Cubierto por Task 6 |
| `/api/employee-banks` | `EmployeeBank` | `businessScope` | Cubierto |
| `/api/employee-medical-conditions` | `EmployeeMedicalCondition` | `businessScope` | Cubierto |
| `/api/persons` | `Person` | `sensitiveAccess` | Task 6 |
| `/api/person-get-employee` | `Person` | `businessScope` | No montar `sensitiveAccess` |
| `/api/customers` | `Person` | `sensitiveAccess` | Task 6 |
| `/api/pilots` | `Person` | `sensitiveAccess` | Task 6 |
| `/api/flight-attendants` | `Person` | `sensitiveAccess` | Task 6 |
| `/api/users` | `Person` | `businessScope` | Cubierto |
| `POST /login` | `Person` (preload sin sesión) | ninguno | **Excepción declarada**: sigue tapado (fail-closed). No tocar. |
| `/api/pii/...` revelado | valor completo por diseño | `businessScopeOptional` | **Fuera de alcance**, dueño Wilvardo. El revelado no exige los cinco slugs. |

- [ ] **Step 2: Gates de calidad**

```bash
npm run lint
npm run typecheck
node ace test --files tests/unit/services/permission_gate_service.spec.ts
node ace test --files tests/unit/services/sensitive_fields_catalog_service.spec.ts
node ace test --files tests/unit/helpers/sensitive_read_decisions.spec.ts
node ace test --files tests/unit/helpers/sensitive_serialize.spec.ts
node ace test --files tests/unit/utils/sensitive_access_context.spec.ts
node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts
node ace test --files tests/unit/constants/employees_sensitive_read_permissions.spec.ts
rg -n "maskSensitiveValue(.*'" app/models/ || true
```

Expected: lint y `tsc` limpios; Japa en verde; `rg` vacío. Cero `any` nuevos.

- [ ] **Step 3: Pruebas manuales obligatorias (resultado literal en el PR)**

Valores de referencia (funciones reales de `sensitive_mask.ts`):

- CURP `ABCD123456MDFABC01` → `••••••••••••••BC01`
- Correo `juan@empresa.com` → `j•••@empresa.com`
- RFC `VACW850312J95` → `•••••••••2J95`
- CLABE ficticia `012345678901234567` → `••••••••••••••4567`
- Salud → `•••••`

1. Rol de prueba con **solo** `sensitive-contacto-read`: `GET /api/employees/:id` → correo y teléfonos en claro; CURP/RFC/NSS y bancarios tapados. Pegar JSON recortado. **CA-1.**
2. El mismo rol sumando `sensitive-financiero-read`: CLABE, cuenta y tarjeta en claro.
3. Rol sin ninguna de las cinco lecturas y sin bypass: las 11 tapadas, carácter a carácter contra captura previa. Información no sensible intacta. HTTP 200. **CA-4.**
4. `root` y `owner` sin ningún slug concedido, interruptor de `employees` en `0`: las 11 en claro. Un rol de cliente en el mismo escenario: tapadas. **CA-2. Esta es la prueba que demuestra el fix de `module-not-enforced`.**
5. Médico ocupacional con `sensitive-salud-read`: diagnóstico y notas en claro. Bitácora sin filas ni columnas nuevas. **CA-3.**
6. Seeder de transición dos veces: mismo conteo en `role_system_permissions`. **CA-5.**
7. Contar consultas a BD de `GET /api/employees` (listado) antes y después: el alta es la resolución de identidad + slugs concedidos **una vez**, no por colaborador. **CA-8.**

Lo que no debe pasar (si pasa, no mergear):

- Un dato que hoy iba tapado llega en claro a alguien sin su categoría ni bypass.
- Una consulta distinta al expediente entrega el correo en claro a un capturista sin `sensitive-contacto-read`.
- Cualquier 403/500 por faltar un permiso de categoría.
- `super-administrador` lee en claro sin el slug (no tiene bypass `standard`).

- [ ] **Step 4: No hay commit de producto.** Si el censo o las pruebas manuales exigen un arreglo, volver a la task dueña y commitear ahí.

---

## Spec coverage (auto-revisión)

| Requisito | Task |
|-----------|------|
| `evaluateEnforced` omite interruptor; `evaluate` intacto | 2 |
| ALS síncrono, 5 decisiones una vez por petición | 4, 5, 6 |
| Apertura en 3 puntos de scope + 4 grupos `auth()` | 6 |
| 11 columnas, categoría desde catálogo, cero literales | 1, 7, 8 |
| Mapa tipado de 5 slugs `sensitive-*-read` | 3 |
| Seeder de transición idempotente, no borra `reveal-sensitive-data` | 9 |
| Fail-closed: sin contexto / unresolved / sin clasificación | 4, 5, 7 |
| `root`/`owner` leen con interruptor apagado | 2, 10 prueba 4 |
| Dirección general necesita el permiso | 2 (`bypass: 'standard'`) + 10 |
| Módulo no exigido no otorga lectura sensible | 2, 5 (`isSensitiveReadAllowed`) |
| Respuesta mixta 200, nunca 403 por categoría | 5, 8, 10 |
| Máscara idéntica para quien no tiene permiso | 7 (delega en `maskSensitiveValue`) |
| Bitácora sin cambios | fuera; no hay task que la toque |
| 15 columnas restantes / escritura / revelado / dailySalary | fuera, declaradas |
| Archivo `EMP.SENS.READ.*` sin constantes muertas | 7 |
| Costo: no re-resolver por dato ni por colaborador | 5, 6 |
| No montar `sensitiveAccess` donde ya hay scope | 6, 10 |
| Continuidad: seeder a quien tenía reveal | 9 |

## Type consistency

- `LegalCategory` y `LEGAL_CATEGORIES` nacen en Task 1; Tasks 3–7 las importan con esos nombres.
- `evaluateEnforced(user, options): Promise<PermissionGateDecision>` nace en Task 2; Task 5 es el único consumidor de producto.
- `EMPLOYEES_SENSITIVE_READ_PERMISSIONS` nace en Task 3; Task 5 itera `LEGAL_CATEGORIES` y indexa ese Record.
- `SensitiveAccessContext.canRead(category): boolean` nace en Task 4; Task 7 lo lee; Task 6 lo llena vía `run`.
- `sensitiveSerialize(model, column)` nace en Task 7; Task 8 la cablea con los nombres de columna del catálogo (`personCurp`, no `person_curp`).
- `runWithSensitiveReadDecisions` nace en Task 5; Task 6 la llama desde 3 puntos de scope + 1 middleware nombrado.

## Placeholder scan

Sin TBD, sin “similar a Task N”, sin “añadir validación”. Los once `serialize` están escritos. El seeder tiene el `throw` literal si falta un slug.
