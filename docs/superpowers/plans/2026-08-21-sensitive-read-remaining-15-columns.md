# Extender el enmascaramiento a las 15 columnas restantes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que las quince columnas del expediente que hoy salen en claro —incluidas las tres biométricas, cuatro de salud y los tres importes— dependan del permiso de lectura de su categoría, de modo que las veintiséis columnas del catálogo de la HU queden gobernadas y el backoffice no reenvíe ni corrompa los valores tapados.

**Architecture:** Se reutiliza la fábrica `sensitiveSerialize` y el ALS de la orden 30. Las doce columnas de texto ganan `serialize: sensitiveSerialize(Modelo, 'columna')`. Los tres importes usan una rama nueva `sensitiveSerializeNumeric` que devuelve `null` sin permiso. Los dos DTO que leen la propiedad del modelo pasan por `maskSensitiveDtoValue`. El revelado individual distingue columna clasificada no revelable vs par no clasificado. En `gsti-rh-bo` las seis superficies de texto plano replican el patrón de correo/teléfono, condicionado por `canRead`, con `:can-reveal="false"` porque estas columnas no están en el registry de `PiiRevealService`.

**Tech Stack:** AdonisJS 6, Lucid, VineJS, `SensitiveAccessContext` (ALS), catálogo `SENSITIVE_FIELDS`, Japa (unitarios de helpers/wiring; la matriz HTTP se valida a mano). Backoffice: Nuxt 3, Vue, `useSensitiveCategoryAccess`, `SensitiveField`, Vitest de bindings.

## Global Constraints

- Historia: USRH1787204602828 · orden 31 · segunda del tramo API. Spec fuente: `spec-USRH1787204602828.md`.
- Target de rama API: `feature/USRH1787204602828-lectura-sensibles-columnas-2` (ya existe; parte de la orden 30). Backoffice: sibling `gsti-rh-bo` (hoy en `feature/USRH1786931496803-sensibles-formulario-empleado`); crear rama `feature/USRH1787204602828-lectura-sensibles-columnas-2` desde esa.
- Sin migraciones. Sin seeders. Sin endpoints nuevos. Sin cambiar `maskSensitiveValue`, `MASK_CHAR`, ni ninguna entrada de `SENSITIVE_FIELDS` (`maskedInApi` no se toca).
- La categoría se deriva **siempre** con `SensitiveFieldsCatalogService.categoryOf`. Cero literales `'contacto' | 'identificacion' | 'financiero' | 'salud' | 'biometrico'` en serialize ni en los DTO.
- Fail-closed heredado: sin contexto, sin categoría o sin `granted`/`bypass` → texto tapado, importe `null`.
- Los tres importes van `null` sin permiso, nunca `maskLastFour` (`"1250.75"` → `•••0.75` filtra magnitud).
- Esta rebanada no crea ni concede permisos. No monta `permissionGate` en el revelado.
- `employeeBiometricFaceIdPhotoUrlProxy` no es columna: sigue gobernada por `tab-biometricos-read`. Tapar la ruta almacenada no cierra el proxy.
- No tocar `app/modules/consent/evidence/evidence.service.ts`.
- No clasificar las 7 columnas cifradas fuera del catálogo ni `Employee.dailySalary`.
- Catálogo real hoy: **27** columnas (`TenantBillingProfile.rfc` entró después de la HU). Esta rebanada gobierna las **15** del Anexo A. Al terminar, 26 de 27 quedan con serialize; `TenantBillingProfile.rfc` queda fuera (no está en el Anexo A).
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en inglés (skill conventional-commits-en).
- Sin suite HTTP nueva (regla vigente). Sí unitarios Japa de helpers/wiring y Vitest de bindings en BO.
- Anclas del spec validadas el 2026-08-21 contra este árbol. Drift trivial a aplicar en silencio:
  - `getEnrollmentStatus` / `updateEnrollmentStatus` **no tienen caller HTTP**; solo `start/socket.ts`. El DTO se enmascara en el servicio igual. Socket no abre ALS → fail-closed: `biometricData` sale tapado siempre en el socket; `fingers`/`face` (conteo) siguen en claro. Eso cumple CA-1 (se ve que hay biométricos y cuántos) y CA-2 (el string no viaja en claro).
  - `work_disability_note.ts:11` sigue **sin** `.optional()`. El frente 4 aplica.
  - Cónyuge y contacto de emergencia: el validador de update ya es `.optional()`, pero el **servicio asigna el teléfono sin condición**. Si el BO omite la clave, `request.input` devuelve `null` y se vaciaría el dato. La regla 6 / CA-9 exigen tratar `null`/`undefined` como "no modificar" también ahí. No es alcance nuevo: es el mismo agujero que la nota de incapacidad, detectado en el servicio y no en Vine.
  - BO `tests/employeeFormTabs/sensitive-category-bindings.spec.ts` afirma hoy que cónyuge, emergencia, lactancia e incapacidad **no** están cableados. Esas aserciones se invierten en esta rebanada (nacieron en la orden 29, que las excluyó con razón).

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/helpers/sensitive_serialize.ts` | `sensitiveSerialize` intacto; nuevo `sensitiveSerializeNumeric`; nuevo `maskSensitiveDtoValue` para DTO. |
| `app/constants/sensitive_data_read_error_codes.ts` | `NOT_REVEALABLE` y `NOT_CLASSIFIED`. |
| `app/services/sensitive_fields_catalog_service.ts` | `revealEligibility(model, column)`. |
| 11 modelos del Anexo A | Una línea `serialize:` por columna (numéricas usan la rama numérica). |
| `app/services/empresa_contratante_service.ts` | `rfc` del DTO pasa por `maskSensitiveDtoValue`. |
| `app/services/employee_biometric_service.ts` | `biometricData` del DTO pasa por `maskSensitiveDtoValue`. |
| `app/validators/work_disability_note.ts` | `noMaskCharRule`; update `.optional()`. |
| `app/validators/employee_spouse.ts` · `employee_emergency_contact.ts` · `traumatic_event_report.ts` · `employee_lactation_period.ts` | Montar `noMaskCharRule`. |
| `app/services/work_disability_note_service.ts` · `employee_spouse_service.ts` · `employee_emergency_contact_service.ts` | `undefined`/`null` en la columna sensible = no modificar. |
| `app/controllers/pii_reveal_controller.ts` | Dos 422 tipadas **antes** de invocar el servicio. |
| 8 controllers `@swagger` | Declarar que el campo puede llegar tapado / importe `null`. |
| `gsti-rh-bo` — 5 formularios + foto facial | Valor tapado como referencia, no reenviar, `:can-reveal="false"`. |

**No se modifica:** `app/helpers/sensitive_mask.ts` · `app/constants/sensitive_fields.ts` (entradas) · `app/utils/sensitive_access_context.ts` · `app/helpers/sensitive_read_decisions.ts` · `start/kernel.ts` · `start/routes/` · `start/socket.ts` · seeders · migraciones · evidencia de consentimiento.

**Repos:** cambios de `app/` y `tests/` en este repo. Cambios de `components/` y `pages/` en `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-bo`. Dos PR. No es un segundo plan: el cableado BO viaja con el cambio de API por decisión de Wilvardo.

---

### Task 1: Rama numérica y helper de DTO

**Files:**
- Modify: `app/helpers/sensitive_serialize.ts`
- Test: `tests/unit/helpers/sensitive_serialize.spec.ts`

**Interfaces:**
- Consumes: `SensitiveFieldsCatalogService.categoryOf`, `SensitiveAccessContext.canRead`, `maskSensitiveValue`, `MASK_CHAR`
- Produces:
  - `sensitiveSerializeNumeric(model: string, column: string): (value: number \| null) => number \| null`
  - `maskSensitiveDtoValue(model: string, column: string, value: string \| null \| undefined): string \| null`

- [ ] **Step 1: Write the failing test**

Añadir al final de `tests/unit/helpers/sensitive_serialize.spec.ts`:

```typescript
import { sensitiveSerialize, sensitiveSerializeNumeric, maskSensitiveDtoValue } from '#helpers/sensitive_serialize'

test.group('sensitiveSerializeNumeric', () => {
  test('sin permiso entrega null, nunca máscara parcial', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily')
    assert.isNull(serialize(1250.75))
    assert.notEqual(serialize(1250.75), '•••0.75')
  })

  test('con permiso de financiero entrega el number', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('PositionSalaryRange', 'minSalaryDaily')
    SensitiveAccessContext.run({ ...allDenied, financiero: true }, () => {
      assert.equal(serialize(1250.75), 1250.75)
      assert.equal(typeof serialize(1250.75), 'number')
    })
  })

  test('null permanece null', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('PositionSalaryRange', 'maxSalaryDaily')
    assert.isNull(serialize(null))
  })

  test('sin clasificación entrega null (fail-closed de importe)', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    SensitiveAccessContext.run(
      { identificacion: true, contacto: true, financiero: true, salud: true, biometrico: true },
      () => {
        assert.isNull(serialize(999))
      }
    )
  })
})

test.group('maskSensitiveDtoValue', () => {
  test('biométrico sin permiso entrega cinco MASK_CHAR', ({ assert }) => {
    assert.equal(
      maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', 'Finger:1, Face'),
      MASK_CHAR.repeat(5)
    )
  })

  test('biométrico con permiso entrega el valor en claro', ({ assert }) => {
    SensitiveAccessContext.run({ ...allDenied, biometrico: true }, () => {
      assert.equal(
        maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', 'Finger:1, Face'),
        'Finger:1, Face'
      )
    })
  })

  test('cadena vacía permanece vacía (sin enrolamiento)', ({ assert }) => {
    assert.equal(maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', ''), '')
  })

  test('RFC de empresa contratante sin permiso aplica maskLastFour', ({ assert }) => {
    assert.equal(
      maskSensitiveDtoValue('EmpresaContratante', 'rfc', 'VACW850312J95'),
      '•••••••••2J95'
    )
  })

  test('la categoría sale del catálogo, no de un literal en el caller', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/helpers/sensitive_serialize.ts'), 'utf-8')
    assert.notMatch(source, /canRead\('biometrico'\)/)
    assert.notMatch(source, /canRead\('identificacion'\)/)
  })
})
```

Añadir imports `readFileSync` / `join` al tope del spec si no están.

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/helpers/sensitive_serialize.spec.ts`

Expected: FAIL — `sensitiveSerializeNumeric` / `maskSensitiveDtoValue` is not a function.

- [ ] **Step 3: Write minimal implementation**

Al final de `app/helpers/sensitive_serialize.ts`:

```typescript
/**
 * Fábrica de `serialize` para importes clasificados (USRH1787204602828).
 * Sin permiso devuelve `null`: `maskLastFour` sobre un importe filtra magnitud.
 */
export function sensitiveSerializeNumeric(
  model: string,
  column: string
): (value: number | null) => number | null {
  const category = catalog.categoryOf(model, column)

  return (value: number | null): number | null => {
    if (value === null || value === undefined) {
      return null
    }

    if (category === null) {
      return null
    }

    if (SensitiveAccessContext.canRead(category)) {
      return value
    }

    return null
  }
}

/**
 * Enmascara un valor leído de la propiedad del modelo (DTO que no pasa por Lucid `serialize`).
 * Cadena vacía se deja igual: no hay dato que tapar.
 */
export function maskSensitiveDtoValue(
  model: string,
  column: string,
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value === '') {
    return ''
  }

  const category = catalog.categoryOf(model, column)
  if (category === null) {
    return MASK_CHAR.repeat(5)
  }
  if (SensitiveAccessContext.canRead(category)) {
    return value
  }
  return maskSensitiveValue(value, category)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/helpers/sensitive_serialize.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/helpers/sensitive_serialize.ts tests/unit/helpers/sensitive_serialize.spec.ts
git commit -m "$(cat <<'EOF'
feat: add numeric serialize and DTO masking helpers

Salary magnitudes must not leak via partial masks, and DTOs that
skip Lucid serialize need the same category-derived decision.
EOF
)"
```

---

### Task 2: Códigos de error y elegibilidad de revelado

**Files:**
- Modify: `app/constants/sensitive_data_read_error_codes.ts`
- Modify: `app/services/sensitive_fields_catalog_service.ts` (tras `categoryOf`)
- Test: `tests/unit/services/sensitive_fields_catalog_service.spec.ts`
- Test: `tests/unit/constants/sensitive_data_read_error_codes.spec.ts` (crear)

**Interfaces:**
- Consumes: `isClassified`, `isMaskedInApi`
- Produces:
  - `SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE = 'EMP.SENS.READ.NOT_REVEALABLE'`
  - `SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED = 'EMP.SENS.READ.NOT_CLASSIFIED'`
  - `SensitiveFieldsCatalogService.revealEligibility(model, column): 'revealable' | 'not_revealable' | 'not_classified'`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/constants/sensitive_data_read_error_codes.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'

test.group('SENSITIVE_DATA_READ_ERROR_CODES', () => {
  test('declara las dos constantes que emite el revelado', ({ assert }) => {
    assert.equal(SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE, 'EMP.SENS.READ.NOT_REVEALABLE')
    assert.equal(SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED, 'EMP.SENS.READ.NOT_CLASSIFIED')
  })
})
```

Añadir a `tests/unit/services/sensitive_fields_catalog_service.spec.ts`:

```typescript
test.group('SensitiveFieldsCatalogService.revealEligibility', () => {
  test('maskedInApi es revelable', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.revealEligibility('Person', 'personCurp'), 'revealable')
  })

  test('clasificada sin maskedInApi no es revelable', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(
      catalog.revealEligibility('EmployeeBiometric', 'employeeBiometricData'),
      'not_revealable'
    )
    assert.equal(
      catalog.revealEligibility('WorkDisabilityNote', 'workDisabilityNoteDescription'),
      'not_revealable'
    )
  })

  test('par ausente del catálogo no está clasificado', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.revealEligibility('Person', 'personFirstname'), 'not_classified')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/constants/sensitive_data_read_error_codes.spec.ts --files tests/unit/services/sensitive_fields_catalog_service.spec.ts`

Expected: FAIL — constantes vacías / `revealEligibility` is not a function.

- [ ] **Step 3: Write minimal implementation**

Reemplazar el objeto vacío en `app/constants/sensitive_data_read_error_codes.ts`:

```typescript
export const SENSITIVE_DATA_READ_ERROR_CODES = {
  /** Columna clasificada pero fuera del registry de PiiRevealService — 422. */
  NOT_REVEALABLE: 'EMP.SENS.READ.NOT_REVEALABLE',
  /** Par modelo/columna ausente del catálogo de campos sensibles — 422. */
  NOT_CLASSIFIED: 'EMP.SENS.READ.NOT_CLASSIFIED',
} as const
```

Al final de `SensitiveFieldsCatalogService`:

```typescript
  /**
   * Elegibilidad del par para el revelado individual.
   * Distingue "clasificada pero no revelable" de "ni siquiera está en el catálogo".
   */
  revealEligibility(model: string, column: string): 'revealable' | 'not_revealable' | 'not_classified' {
    if (!this.isClassified(model, column)) {
      return 'not_classified'
    }
    if (!this.isMaskedInApi(model, column)) {
      return 'not_revealable'
    }
    return 'revealable'
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/constants/sensitive_data_read_error_codes.spec.ts --files tests/unit/services/sensitive_fields_catalog_service.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/sensitive_data_read_error_codes.ts app/services/sensitive_fields_catalog_service.ts tests/unit/constants/sensitive_data_read_error_codes.spec.ts tests/unit/services/sensitive_fields_catalog_service.spec.ts
git commit -m "$(cat <<'EOF'
feat: distinguish classified-not-revealable from unclassified PII

The reveal endpoint used a single 404 for both cases, so callers
could not tell a category-governed field from an unknown column.
EOF
)"
```

---

### Task 3: Serializar las 12 columnas de texto

**Files:**
- Modify: `app/models/employee_biometric.ts` (import + `employeeBiometricData`)
- Modify: `app/models/employee_biometric_face_id.ts` (`employeeBiometricFaceIdPhotoUrl`, `employeeBiometricFaceIdToken`)
- Modify: `app/models/work_disability_note.ts`
- Modify: `app/models/traumatic_event_report.ts` (2 columnas)
- Modify: `app/models/employee_lactation_period.ts`
- Modify: `app/models/employee_emergency_contact.ts`
- Modify: `app/models/employee_spouse.ts`
- Modify: `app/models/user_consent.ts` (2 columnas)
- Modify: `app/models/empresa_contratante.ts`
- Test: `tests/unit/models/sensitive_serialize_wiring.spec.ts`

**Interfaces:**
- Consumes: `sensitiveSerialize(model, column)` de Task 1 (ya existía; se reusa)
- Produces: las 12 columnas de texto serializan por la fábrica. `employeeBiometricFaceIdPhotoUrlProxy` **no** se toca.

- [ ] **Step 1: Write the failing test**

Ampliar `tests/unit/models/sensitive_serialize_wiring.spec.ts`. Reemplazar `MODELS` y añadir grupos:

```typescript
const TEXT_MODELS = [
  'app/models/person.ts',
  'app/models/employee_bank.ts',
  'app/models/employee_medical_condition.ts',
  'app/models/employee_biometric.ts',
  'app/models/employee_biometric_face_id.ts',
  'app/models/work_disability_note.ts',
  'app/models/traumatic_event_report.ts',
  'app/models/employee_lactation_period.ts',
  'app/models/employee_emergency_contact.ts',
  'app/models/employee_spouse.ts',
  'app/models/user_consent.ts',
  'app/models/empresa_contratante.ts',
] as const

const TEXT_WIRING: Array<{ file: string; model: string; columns: string[] }> = [
  { file: 'app/models/employee_biometric.ts', model: 'EmployeeBiometric', columns: ['employeeBiometricData'] },
  {
    file: 'app/models/employee_biometric_face_id.ts',
    model: 'EmployeeBiometricFaceId',
    columns: ['employeeBiometricFaceIdToken', 'employeeBiometricFaceIdPhotoUrl'],
  },
  {
    file: 'app/models/work_disability_note.ts',
    model: 'WorkDisabilityNote',
    columns: ['workDisabilityNoteDescription'],
  },
  {
    file: 'app/models/traumatic_event_report.ts',
    model: 'TraumaticEventReport',
    columns: ['traumaticEventReportInvolvedPeople', 'traumaticEventReportDescription'],
  },
  {
    file: 'app/models/employee_lactation_period.ts',
    model: 'EmployeeLactationPeriod',
    columns: ['employeeLactationPeriodNotes'],
  },
  {
    file: 'app/models/employee_emergency_contact.ts',
    model: 'EmployeeEmergencyContact',
    columns: ['employeeEmergencyContactPhone'],
  },
  { file: 'app/models/employee_spouse.ts', model: 'EmployeeSpouse', columns: ['employeeSpousePhone'] },
  {
    file: 'app/models/user_consent.ts',
    model: 'UserConsent',
    columns: ['userConsentIp', 'userConsentUserAgent'],
  },
  { file: 'app/models/empresa_contratante.ts', model: 'EmpresaContratante', columns: ['rfc'] },
]

test.group('Wiring sensitiveSerialize en las 12 columnas de texto de orden 31', () => {
  test('cada modelo importa la fábrica y cablea sus columnas', ({ assert }) => {
    for (const entry of TEXT_WIRING) {
      const source = readFileSync(join(process.cwd(), entry.file), 'utf-8')
      assert.include(source, "import { sensitiveSerialize } from '#helpers/sensitive_serialize'")
      assert.notInclude(source, 'maskSensitiveValue')
      for (const column of entry.columns) {
        assert.include(source, `sensitiveSerialize('${entry.model}', '${column}')`)
      }
    }
  })

  test('el proxy de la foto facial no usa sensitiveSerialize', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/models/employee_biometric_face_id.ts'),
      'utf-8'
    )
    assert.notInclude(source, "sensitiveSerialize('EmployeeBiometricFaceId', 'employeeBiometricFaceIdPhotoUrlProxy')")
  })
})
```

Renombrar el grupo viejo para que `MODELS` siga cubriendo Person/Bank/Medical (no borrar esos tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts`

Expected: FAIL — los 9 modelos nuevos no importan `sensitiveSerialize`.

- [ ] **Step 3: Write minimal implementation**

En cada modelo de texto, añadir el import (mismo que `person.ts`):

```typescript
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
```

Y **una línea** `serialize:` dentro del `@column({ prepare, consume })` existente, copiando el molde de `person.ts:111`. Ejemplos exactos:

`employee_biometric.ts` — dentro del `@column` de `employeeBiometricData` (hoy cierra en línea 73):

```typescript
    serialize: sensitiveSerialize('EmployeeBiometric', 'employeeBiometricData'),
```

`employee_biometric_face_id.ts` — en el `@column` de `employeeBiometricFaceIdPhotoUrl`:

```typescript
    serialize: sensitiveSerialize('EmployeeBiometricFaceId', 'employeeBiometricFaceIdPhotoUrl'),
```

El token **no tiene** `prepare`/`consume`. Cambiar `@column()` de `employeeBiometricFaceIdToken` a:

```typescript
  @column({
    serialize: sensitiveSerialize('EmployeeBiometricFaceId', 'employeeBiometricFaceIdToken'),
  })
  declare employeeBiometricFaceIdToken: string
```

Resto, misma inserción de `serialize:` en el objeto de `@column` que ya tiene `prepare`/`consume`:

- `WorkDisabilityNote` / `workDisabilityNoteDescription`
- `TraumaticEventReport` / `traumaticEventReportInvolvedPeople` y `traumaticEventReportDescription`
- `EmployeeLactationPeriod` / `employeeLactationPeriodNotes`
- `EmployeeEmergencyContact` / `employeeEmergencyContactPhone`
- `EmployeeSpouse` / `employeeSpousePhone`
- `UserConsent` / `userConsentIp` y `userConsentUserAgent`
- `EmpresaContratante` / `rfc`

No tocar `rfcHash` (`serializeAs: null`). No tocar `employeeBiometricFaceIdPhotoUrlProxy`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models/employee_biometric.ts app/models/employee_biometric_face_id.ts app/models/work_disability_note.ts app/models/traumatic_event_report.ts app/models/employee_lactation_period.ts app/models/employee_emergency_contact.ts app/models/employee_spouse.ts app/models/user_consent.ts app/models/empresa_contratante.ts tests/unit/models/sensitive_serialize_wiring.spec.ts
git commit -m "$(cat <<'EOF'
feat: serialize twelve remaining text columns by category

Biometric, health, contact and contracting-company RFC values
were still returned in the clear to any tab-authorized caller.
EOF
)"
```

---

### Task 4: Serializar los 3 importes

**Files:**
- Modify: `app/models/employee_salary_history.ts`
- Modify: `app/models/position_salary_range.ts`
- Test: `tests/unit/models/sensitive_serialize_wiring.spec.ts`

**Interfaces:**
- Consumes: `sensitiveSerializeNumeric(model, column)` de Task 1
- Produces: `salaryDaily`, `minSalaryDaily`, `maxSalaryDaily` serializan a `number | null`

- [ ] **Step 1: Write the failing test**

Añadir al spec de wiring:

```typescript
test.group('Wiring sensitiveSerializeNumeric en los 3 importes', () => {
  test('histórico y rango usan la rama numérica, no maskLastFour', ({ assert }) => {
    const history = readFileSync(join(process.cwd(), 'app/models/employee_salary_history.ts'), 'utf-8')
    const range = readFileSync(join(process.cwd(), 'app/models/position_salary_range.ts'), 'utf-8')
    assert.include(history, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")
    assert.include(range, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")
    assert.include(history, "sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily')")
    assert.include(range, "sensitiveSerializeNumeric('PositionSalaryRange', 'minSalaryDaily')")
    assert.include(range, "sensitiveSerializeNumeric('PositionSalaryRange', 'maxSalaryDaily')")
    assert.notInclude(history, 'sensitiveSerialize(')
    assert.notInclude(range, 'sensitiveSerialize(')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts`

Expected: FAIL — import not found.

- [ ] **Step 3: Write minimal implementation**

En ambos modelos, importar `sensitiveSerializeNumeric` y añadir `serialize:` al `@column` que ya cifra. Molde:

```typescript
  @column({
    prepare: (value: number | string) => encryption.encrypt(String(value)),
    consume: (value: string) => {
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
    serialize: sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily'),
  })
  declare salaryDaily: number
```

Igual en `minSalaryDaily` / `maxSalaryDaily` con `'PositionSalaryRange'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models/employee_salary_history.ts app/models/position_salary_range.ts tests/unit/models/sensitive_serialize_wiring.spec.ts
git commit -m "$(cat <<'EOF'
feat: return salary amounts as null without financial read

Partial masking of a daily rate reveals magnitude; the numeric
serialize path blanks the field instead of keeping last digits.
EOF
)"
```

---

### Task 5: Enmascarar los dos DTO que esquivan `serialize`

**Files:**
- Modify: `app/services/empresa_contratante_service.ts` (`serializeEmpresaContratante`, hoy `:47-59`)
- Modify: `app/services/employee_biometric_service.ts` (retornos `:296-302` y `:322-340`)
- Test: `tests/unit/services/sensitive_dto_masking.spec.ts` (crear) — source inspection + contrato de import

**Interfaces:**
- Consumes: `maskSensitiveDtoValue(model, column, value)` de Task 1
- Produces: `serializeEmpresaContratante` y los dos retornos de enrolamiento entregan el string ya gobernado

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/services/sensitive_dto_masking.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('DTO que no pasan por serialize', () => {
  test('empresa contratante enmascara rfc con la fábrica, no con un literal de categoría', ({
    assert,
  }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/empresa_contratante_service.ts'),
      'utf-8'
    )
    assert.include(source, "import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'")
    assert.include(source, "maskSensitiveDtoValue('EmpresaContratante', 'rfc',")
    assert.notMatch(source, /rfc:\s*row\.rfc/)
    assert.notMatch(source, /canRead\('identificacion'\)/)
  })

  test('enrolamiento y estado enmascaran biometricData con la fábrica', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/employee_biometric_service.ts'),
      'utf-8'
    )
    assert.include(source, "import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'")
    assert.include(
      source,
      "maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData'"
    )
    assert.notMatch(source, /biometricData:\s*employeeBiometric\.employeeBiometricData/)
    assert.notMatch(source, /canRead\('biometrico'\)/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/services/sensitive_dto_masking.spec.ts`

Expected: FAIL — `rfc: row.rfc` y `biometricData: employeeBiometric.employeeBiometricData` siguen ahí.

- [ ] **Step 3: Write minimal implementation**

`empresa_contratante_service.ts`:

```typescript
import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'

export function serializeEmpresaContratante(row: EmpresaContratante) {
  return {
    id: row.empresaContratanteId,
    razonSocial: row.razonSocial,
    rfc: maskSensitiveDtoValue('EmpresaContratante', 'rfc', row.rfc),
    domicilioFiscal: row.domicilioFiscal,
    representanteLegal: row.representanteLegal,
    correo: row.correo,
    telefono: row.telefono,
    createdAt: toIsoDateTimeString(row.createdAt),
    updatedAt: toIsoDateTimeString(row.updatedAt),
  }
}
```

`employee_biometric_service.ts`, en **los dos** retornos (alta/update de estatus y getEnrollmentStatus). El de "sin registro" deja `''` (el helper no lo tapa):

```typescript
import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'

// updateEnrollmentStatus, return:
      biometricData: maskSensitiveDtoValue(
        'EmployeeBiometric',
        'employeeBiometricData',
        employeeBiometric.employeeBiometricData
      ),

// getEnrollmentStatus, con registro:
      biometricData: maskSensitiveDtoValue(
        'EmployeeBiometric',
        'employeeBiometricData',
        employeeBiometric.employeeBiometricData
      ),

// getEnrollmentStatus, sin registro: dejar `biometricData: ''`
```

No tocar `start/socket.ts`: reemite el DTO ya gobernado. `fingers` y `face` siguen en claro.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/services/sensitive_dto_masking.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/empresa_contratante_service.ts app/services/employee_biometric_service.ts tests/unit/services/sensitive_dto_masking.spec.ts
git commit -m "$(cat <<'EOF'
feat: mask biometric and contracting RFC DTOs off serialize

Enrollment status and the REPSE catalog read model properties
directly, so Lucid serialize never reached those two responses.
EOF
)"
```

---

### Task 6: Guard `noMaskCharRule` y 422 de incapacidad

**Files:**
- Modify: `app/validators/work_disability_note.ts`
- Modify: `app/validators/employee_spouse.ts`
- Modify: `app/validators/employee_emergency_contact.ts`
- Modify: `app/validators/traumatic_event_report.ts`
- Modify: `app/validators/employee_lactation_period.ts` (constante `lactationPeriodNotesField` en `:8`)
- Test: `tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts` (crear)

**Interfaces:**
- Consumes: `noMaskCharRule()` de `app/validators/no_mask_char_rule.ts` (mensaje vigente en `:24`)
- Produces: las 5 validaciones rechazan `•`; `updateWorkDisabilityNoteValidator.workDisabilityNoteDescription` es `.optional()`; create de incapacidad **sigue requerido**

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('noMaskCharRule en las 5 validaciones nuevas', () => {
  test('incapacidad: create requerido + guard; update optional + guard', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/validators/work_disability_note.ts'), 'utf-8')
    assert.include(source, "import { noMaskCharRule } from './no_mask_char_rule.js'")
    assert.match(
      source,
      /workDisabilityNoteDescription:\s*vine\.string\(\)\.trim\(\)\.minLength\(1\)\.use\(noMaskCharRule\(\)\)/
    )
    assert.match(
      source,
      /workDisabilityNoteDescription:\s*vine\.string\(\)\.trim\(\)\.minLength\(1\)\.use\(noMaskCharRule\(\)\)\.optional\(\)/
    )
  })

  test('cónyuge, emergencia, trauma y lactancia montan el guard', ({ assert }) => {
    const spouse = readFileSync(join(process.cwd(), 'app/validators/employee_spouse.ts'), 'utf-8')
    const emergency = readFileSync(
      join(process.cwd(), 'app/validators/employee_emergency_contact.ts'),
      'utf-8'
    )
    const trauma = readFileSync(join(process.cwd(), 'app/validators/traumatic_event_report.ts'), 'utf-8')
    const lactation = readFileSync(
      join(process.cwd(), 'app/validators/employee_lactation_period.ts'),
      'utf-8'
    )
    for (const source of [spouse, emergency, trauma, lactation]) {
      assert.include(source, 'noMaskCharRule')
    }
    assert.include(lactation, 'lactationPeriodNotesField')
    assert.match(lactation, /noMaskCharRule\(\)/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts`

Expected: FAIL — `noMaskCharRule` no está importado.

- [ ] **Step 3: Write minimal implementation**

`work_disability_note.ts`:

```typescript
import vine from '@vinejs/vine'
import { noMaskCharRule } from './no_mask_char_rule.js'

export const createWorkDisabilityNoteValidator = vine.compile(
  vine.object({
    workDisabilityNoteDescription: vine.string().trim().minLength(1).use(noMaskCharRule()),
    workDisabilityId: vine.number().min(1),
  })
)
export const updateWorkDisabilityNoteValidator = vine.compile(
  vine.object({
    workDisabilityNoteDescription: vine.string().trim().minLength(1).use(noMaskCharRule()).optional(),
  })
)
```

Cónyuge `:9` y `:20`: `.use(noMaskCharRule())` antes de `.optional()`.

Emergencia `:19` y `:40`: igual.

Trauma create `:27-28` y `:42-43`: `.use(noMaskCharRule())` (siguen requeridos). Update `:73-74`: `.use(noMaskCharRule()).optional()`.

Lactancia — **una sola edición** de la constante `:8`:

```typescript
const lactationPeriodNotesField = vine.string().trim().maxLength(500).use(noMaskCharRule()).nullable()
```

Eso cubre create `:50` y update `:80`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/validators/work_disability_note.ts app/validators/employee_spouse.ts app/validators/employee_emergency_contact.ts app/validators/traumatic_event_report.ts app/validators/employee_lactation_period.ts tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts
git commit -m "$(cat <<'EOF'
fix: reject echoed mask characters and make disability notes optional on update

Masking those columns would otherwise 422 routine edits and let
bullet characters overwrite clinical text on save.
EOF
)"
```

---

### Task 7: Ausencia = no modificar (incapacidad, cónyuge, emergencia)

**Files:**
- Modify: `app/services/work_disability_note_service.ts:15-23`
- Modify: `app/services/employee_spouse_service.ts:18-26`
- Modify: `app/services/employee_emergency_contact_service.ts:22-37`
- Test: `tests/unit/services/sensitive_update_omit_fields.spec.ts` (crear)

**Interfaces:**
- Consumes: validators de Task 6 (update ya no exige la columna)
- Produces: `update` no asigna la columna sensible cuando el valor entrante es `null` o `undefined`. El resto de campos se asigna como hoy.

Molde: `app/services/employee_bank_service.ts:32-45`.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/services/sensitive_update_omit_fields.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('update no vacía la columna sensible omitida', () => {
  test('nota de incapacidad solo asigna descripción si viene valor', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/work_disability_note_service.ts'),
      'utf-8'
    )
    assert.include(source, 'workDisabilityNote.workDisabilityNoteDescription !== undefined')
    assert.include(source, 'workDisabilityNote.workDisabilityNoteDescription !== null')
  })

  test('cónyuge y emergencia no asignan el teléfono si viene null', ({ assert }) => {
    const spouse = readFileSync(join(process.cwd(), 'app/services/employee_spouse_service.ts'), 'utf-8')
    const emergency = readFileSync(
      join(process.cwd(), 'app/services/employee_emergency_contact_service.ts'),
      'utf-8'
    )
    assert.include(spouse, 'employeeSpouse.employeeSpousePhone !== undefined')
    assert.include(spouse, 'employeeSpouse.employeeSpousePhone !== null')
    assert.include(emergency, 'employeeEmergencyContact.employeeEmergencyContactPhone !== undefined')
    assert.include(emergency, 'employeeEmergencyContact.employeeEmergencyContactPhone !== null')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/services/sensitive_update_omit_fields.spec.ts`

Expected: FAIL — asignación incondicional sigue en `:19-20`, `:24`, `:34-35`.

- [ ] **Step 3: Write minimal implementation**

`work_disability_note_service.ts` `update`:

```typescript
  async update(
    currentWorkDisabilityNote: WorkDisabilityNote,
    workDisabilityNote: WorkDisabilityNote
  ) {
    if (
      workDisabilityNote.workDisabilityNoteDescription !== undefined &&
      workDisabilityNote.workDisabilityNoteDescription !== null
    ) {
      currentWorkDisabilityNote.workDisabilityNoteDescription =
        workDisabilityNote.workDisabilityNoteDescription
    }
    await currentWorkDisabilityNote.save()
    return currentWorkDisabilityNote
  }
```

`employee_spouse_service.ts` `update` — envolver **solo** el teléfono (el resto se asigna igual):

```typescript
    if (employeeSpouse.employeeSpousePhone !== undefined && employeeSpouse.employeeSpousePhone !== null) {
      currentEmployeeSpouse.employeeSpousePhone = employeeSpouse.employeeSpousePhone
    }
```

`employee_emergency_contact_service.ts` `update` — igual solo el teléfono.

Lactancia y trauma **ya** ramifican por `!== undefined`. No tocarlos.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/services/sensitive_update_omit_fields.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/work_disability_note_service.ts app/services/employee_spouse_service.ts app/services/employee_emergency_contact_service.ts tests/unit/services/sensitive_update_omit_fields.spec.ts
git commit -m "$(cat <<'EOF'
fix: keep stored sensitive values when the masked field is omitted

The backoffice stops echoing masked columns; treating null as a
blank would wipe clinical notes and emergency phones on save.
EOF
)"
```

---

### Task 8: Revelado — dos 422 distinguibles

**Files:**
- Modify: `app/controllers/pii_reveal_controller.ts` (método `reveal`, hoy `:119`; swagger `:81-90`)
- Test: `tests/unit/controllers/pii_reveal_eligibility.spec.ts` (crear)

**Interfaces:**
- Consumes: `revealEligibility` de Task 2, `SENSITIVE_DATA_READ_ERROR_CODES` de Task 2
- Produces: 422 `{ title, detail, key, code }` **antes** de `PiiRevealService.reveal` (no escribe `pii_access_logs`). Las 404 existentes `{ type, title, message, data }` no se tocan. Inconsistencia de envelope **declarada en el PR**.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/controllers/pii_reveal_eligibility.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('PiiRevealController ramas 422', () => {
  test('consulta elegibilidad antes del servicio y emite los dos códigos', ({ assert }) => {
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/controllers/pii_reveal_eligibility.spec.ts`

Expected: FAIL — el controller no importa el catálogo de códigos.

- [ ] **Step 3: Write minimal implementation**

Imports al tope de `pii_reveal_controller.ts`:

```typescript
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'
```

En `reveal`, **después** de validar `recordId` y **antes** de `new PiiRevealService()`:

```typescript
      const catalog = new SensitiveFieldsCatalogService()
      const eligibility = catalog.revealEligibility(model, column)
      if (eligibility === 'not_classified') {
        response.status(422)
        return {
          title: 'El campo solicitado no es un dato sensible',
          detail: 'El campo indicado no está clasificado en el catálogo de datos sensibles.',
          key: 'el-campo-solicitado-no-es-un-dato-sensible',
          code: SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED,
        }
      }
      if (eligibility === 'not_revealable') {
        response.status(422)
        return {
          title: 'El dato no se puede revelar por esta vía',
          detail:
            'Este dato sensible se consulta con el permiso de su categoría; no está disponible en el revelado individual.',
          key: 'el-dato-no-se-puede-revelar-por-esta-via',
          code: SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE,
        }
      }
```

En el bloque `@swagger` de `'422'`, añadir en `description` (sin reescribir el envelope viejo de params inválidos):

```yaml
       '422':
         description: |
           Parámetros inválidos (envelope legado `{type,title,message,data}`)
           o el par no es revelable / no está clasificado (envelope `{title,detail,key,code}`:
           `EMP.SENS.READ.NOT_REVEALABLE` / `EMP.SENS.READ.NOT_CLASSIFIED`).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/controllers/pii_reveal_eligibility.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/controllers/pii_reveal_controller.ts tests/unit/controllers/pii_reveal_eligibility.spec.ts
git commit -m "$(cat <<'EOF'
feat: return typed 422s when a PII field cannot be revealed

Callers need to tell a category-governed column from a pair that
is not in the sensitive-fields catalog at all.
EOF
)"
```

---

### Task 9: Swagger de los 8 controllers

**Files:**
- Modify: `app/controllers/work_disability_note_controller.ts` (request y, si existe, schema de respuesta de `workDisabilityNoteDescription`; update deja de marcar `required: true`)
- Modify: `app/controllers/traumatic_event_report_controller.ts`
- Modify: `app/controllers/employee_lactation_periods_controller.ts`
- Modify: `app/controllers/employee_spouse_controller.ts`
- Modify: `app/controllers/employee_emergency_contact_controller.ts`
- Modify: `app/controllers/position_salary_range_controller.ts`
- Modify: `app/controllers/employee_biometric_controller.ts` (schema del modelo en `app/models/employee_biometric.ts` también: `employeeBiometricData`)
- Modify: `app/controllers/employee_biometric_face_id_controller.ts` (y schema en el modelo para token y photoUrl)
- Test: `tests/unit/controllers/sensitive_swagger_masking_note.spec.ts` (crear)

**Interfaces:**
- Consumes: nada de tasks previas más que los nombres de columna
- Produces: cada descripción de campo sensible declara el contrato de lectura

Texto canónico (copiar verbatim):

- Texto: `Puede llegar enmascarado según el permiso de lectura de su categoría.`
- Importe: `Sin permiso de lectura financiera se entrega null, nunca enmascarado por partes.`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/controllers/sensitive_swagger_masking_note.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const FILES = [
  'app/controllers/work_disability_note_controller.ts',
  'app/controllers/traumatic_event_report_controller.ts',
  'app/controllers/employee_lactation_periods_controller.ts',
  'app/controllers/employee_spouse_controller.ts',
  'app/controllers/employee_emergency_contact_controller.ts',
  'app/controllers/employee_biometric_controller.ts',
  'app/controllers/employee_biometric_face_id_controller.ts',
  'app/models/employee_biometric.ts',
  'app/models/employee_biometric_face_id.ts',
  'app/models/employee_salary_history.ts',
  'app/models/position_salary_range.ts',
] as const

test.group('Swagger declara enmascaramiento condicional', () => {
  test('los controllers y schemas de esta rebanada mencionan el permiso o el null de importe', ({
    assert,
  }) => {
    for (const relative of FILES) {
      const source = readFileSync(join(process.cwd(), relative), 'utf-8')
      const mentionsMask =
        source.includes('enmascarado según el permiso') ||
        source.includes('se entrega null, nunca enmascarado por partes')
      assert.isTrue(mentionsMask, `falta nota de enmascaramiento en ${relative}`)
    }
  })

  test('update de nota de incapacidad ya no marca la descripción como required', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/work_disability_note_controller.ts'),
      'utf-8'
    )
    const updateBlock = source.slice(source.indexOf('/api/work-disability-notes/{workDisabilityNoteId}:'))
    const descBlock = updateBlock.slice(
      updateBlock.indexOf('workDisabilityNoteDescription:'),
      updateBlock.indexOf('responses:')
    )
    assert.notInclude(descBlock, 'required: true')
  })
})
```

`position_salary_range_controller.ts` no siempre declara los campos en GET; si el grep del spec no encuentra la nota, añadirla también en el schema del modelo (ya está en `FILES` vía el modelo). Si el controller no menciona `minSalaryDaily` en un GET, la aserción del controller se cubre añadiendo la frase en el primer bloque `@swagger` que liste esos campos (create/update, líneas `:50` y `:311`). Incluir el controller en `FILES` **solo si** se le agrega la frase; si no, dejar los modelos de salario en `FILES` y añadir el controller a mano con la frase en esos bloques.

Ajuste práctico: añadir `app/controllers/position_salary_range_controller.ts` a `FILES` y pegar la frase de importe en las `description:` de `minSalaryDaily` y `maxSalaryDaily`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test --files tests/unit/controllers/sensitive_swagger_masking_note.spec.ts`

Expected: FAIL — las descriptions actuales no mencionan enmascaramiento.

- [ ] **Step 3: Write minimal implementation**

Concatenar el texto canónico a cada `description:` de las columnas del Anexo A que ya aparecen en esos `@swagger`. No inventar endpoints. En update de incapacidad, quitar `required: true` de `workDisabilityNoteDescription`.

En schemas de modelo (`EmployeeBiometric`, `EmployeeBiometricFaceId`, `EmployeeSalaryHistory`, `PositionSalaryRange`) actualizar la `description:` de la columna.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test --files tests/unit/controllers/sensitive_swagger_masking_note.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/controllers/work_disability_note_controller.ts app/controllers/traumatic_event_report_controller.ts app/controllers/employee_lactation_periods_controller.ts app/controllers/employee_spouse_controller.ts app/controllers/employee_emergency_contact_controller.ts app/controllers/position_salary_range_controller.ts app/controllers/employee_biometric_controller.ts app/controllers/employee_biometric_face_id_controller.ts app/models/employee_biometric.ts app/models/employee_biometric_face_id.ts app/models/employee_salary_history.ts app/models/position_salary_range.ts tests/unit/controllers/sensitive_swagger_masking_note.spec.ts
git commit -m "$(cat <<'EOF'
docs: declare category masking on remaining dossier fields

API consumers need to know these values may arrive masked or,
for salary amounts, as null according to the caller's permission.
EOF
)"
```

---

### Task 10: Backoffice — nota de incapacidad

**Files:** (repo `gsti-rh-bo`)
- Modify: `components/employeeWorkDisabilityNoteInfoForm/index.vue:14-16`
- Modify: `components/employeeWorkDisabilityNoteInfoForm/script.ts`
- Test: `tests/employeeFormTabs/sensitive-category-bindings.spec.ts` (invertir `'no cablea notas de lactancia ni de incapacidad'` para la parte de incapacidad; la de lactancia se invierte en Task 12)

**Interfaces:**
- Consumes: `useSensitiveCategoryAccess('salud')`, `SensitiveField`, `hasSensitiveInputValue`, `getFirstMissingRequiredSensitiveFieldLabel` — mismos que `employeeMedicalConditionInfoForm`
- Produces: sin `canReadHealth`, la descripción se muestra tapada y **no se envía** en el PUT; con permiso, textarea como hoy. `:can-reveal="false"` (columna fuera del registry).

Patrón de referencia (orden 29 **condicionado**): hidratar máscara **solo si** `!canReadHealth`. Si se copia la versión incondicional de `initializeSensitivePersonFields`, quien sí tiene permiso pierde el valor real.

- [ ] **Step 1: Write the failing test**

En `gsti-rh-bo`, reemplazar el it de incapacidad (dejar lactancia para Task 12 o partir el it). Nuevo it:

```typescript
  it('la nota de incapacidad presenta la descripción como campo sensible de salud', () => {
    const script = read('components/employeeWorkDisabilityNoteInfoForm/script.ts')
    const template = read('components/employeeWorkDisabilityNoteInfoForm/index.vue')
    expect(script).toContain("useSensitiveCategoryAccess('salud')")
    expect(script).toContain('maskedDescription')
    expect(script).toContain('delete payload.workDisabilityNoteDescription')
    expect(template).toContain('sensitiveWriteDeniedHint')
    expect(template).toContain('category="salud"')
    expect(template).toContain(':can-reveal="false"')
    expect(template).toContain('column="workDisabilityNoteDescription"')
  })
```

El it `'no cablea notas de lactancia ni de incapacidad'` debe dejar de incluir los dos archivos de incapacidad (si no, este test y ese it se contradicen). En este step, sacar incapacidad de ese it.

- [ ] **Step 2: Run test to verify it fails**

Run (en `gsti-rh-bo`): `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: FAIL — el form no importa `useSensitiveCategoryAccess`.

- [ ] **Step 3: Write minimal implementation**

`script.ts` — `setup()`:

```typescript
import SensitiveField from '~/components/sensitiveField/index.vue'
import sensitiveWriteDeniedHint from '~/components/sensitiveWriteDeniedHint/index.vue'
import { useSensitiveCategoryAccess } from '~/components/employeeFormTabs/application/use-sensitive-category-access'
import {
  getFirstMissingRequiredSensitiveFieldLabel,
  hasSensitiveInputValue,
} from '~/components/sensitiveField/domain/sensitive-field.helpers'

setup() {
  const { t } = useI18n()
  const healthAccess = useSensitiveCategoryAccess('salud')
  return {
    t,
    canReadHealth: healthAccess.canRead,
    canWriteHealth: healthAccess.canWrite,
    isUnresolvedHealth: healthAccess.isUnresolved,
  }
}
```

`components`: añadir `SensitiveField`, `sensitiveWriteDeniedHint`.

`data`: `maskedDescription: null as string | null`, `isEditingDescription: false`.

En `mounted`, después de resolver `isNewWorkDisabilityNote`:

```typescript
    if (!this.isNewWorkDisabilityNote && !this.canReadHealth) {
      const raw = this.workDisabilityNote.workDisabilityNoteDescription
      this.maskedDescription = hasSensitiveInputValue(raw) ? String(raw).trim() : null
      this.workDisabilityNote.workDisabilityNoteDescription = ''
    }
```

`onSave` — sustituir el guard `:63` (`if (!this.workDisabilityNote.workDisabilityNoteDescription)`) por:

```typescript
      const descriptionMissing = getFirstMissingRequiredSensitiveFieldLabel([
        {
          isNewRecord: this.isNewWorkDisabilityNote,
          maskedValue: this.maskedDescription,
          isEditing: this.isEditingDescription,
          inputValue: this.workDisabilityNote.workDisabilityNoteDescription,
          fieldLabel: this.t('description'),
          canWriteCategory: this.canWriteHealth,
        },
      ]) !== null
      if (descriptionMissing) {
        this.$toast.add({
          severity: 'warn',
          summary: this.t('validation_data'),
          detail: this.t('missing_data'),
          life: 5000,
        })
        return
      }
```

Antes de `store`/`update`, omitir la clave si está tapada y no se está editando:

```typescript
      const payload = { ...this.workDisabilityNote }
      if (this.maskedDescription && !this.isEditingDescription) {
        delete payload.workDisabilityNoteDescription
      }
      // pasar `payload` a store/update en lugar del modelo crudo
```

`index.vue` — reemplazar el `Textarea` plano:

```vue
          <sensitiveWriteDeniedHint
            category="salud"
            :unresolved="isUnresolvedHealth"
            :blocked="!canWriteHealth"
            :can-read="canReadHealth"
          >
            <SensitiveField
              v-if="maskedDescription"
              v-model:is-editing="isEditingDescription"
              :masked-value="maskedDescription"
              model="WorkDisabilityNote"
              column="workDisabilityNoteDescription"
              :record-id="workDisabilityNote.workDisabilityNoteId ?? 0"
              origin-module="employees"
              :can-reveal="false"
              :editable="canManageWorkDisabilities && canManageUserResponsible && canWriteHealth"
              @edit-start="workDisabilityNote.workDisabilityNoteDescription = ''"
              @edit-cancel="workDisabilityNote.workDisabilityNoteDescription = ''"
            />
            <Textarea
              v-if="canManageWorkDisabilities && canManageUserResponsible && (!maskedDescription || isEditingDescription)"
              id="proceedingFileObservations"
              v-model="workDisabilityNote.workDisabilityNoteDescription"
              autoResize
              rows="8"
              :disabled="!canManageWorkDisabilities || !canManageUserResponsible"
            />
          </sensitiveWriteDeniedHint>
          <small
            class="p-error"
            v-if="submitted && isNewWorkDisabilityNote && !workDisabilityNote.workDisabilityNoteDescription"
          >
            {{ $t('description') }} {{ $t('is_required') }}
          </small>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit** (en `gsti-rh-bo`)

```bash
git add components/employeeWorkDisabilityNoteInfoForm/index.vue components/employeeWorkDisabilityNoteInfoForm/script.ts tests/employeeFormTabs/sensitive-category-bindings.spec.ts
git commit -m "$(cat <<'EOF'
feat: treat disability note description as a masked health field

Once the API masks the note, a plain textarea would echo bullets
and 422 the save; the field is now reference-only without read.
EOF
)"
```

---

### Task 11: Backoffice — teléfono de emergencia y de cónyuge

**Files:** (repo `gsti-rh-bo`)
- Modify: `components/employeeEmergencyContactForm/index.vue:79-92`
- Modify: `components/employeeEmergencyContactForm/script.ts`
- Modify: `components/employeePersonInfoForm/index.vue:286-289` (bloque cónyuge)
- Modify: `components/employeePersonInfoForm/script.ts` (hidratar en el mismo flujo que `initializeSensitivePersonFields`; **no** anular el teléfono si `canReadContact`)
- Test: `tests/employeeFormTabs/sensitive-category-bindings.spec.ts` — invertir `'no cablea el teléfono del cónyuge ni el de emergencia'` y `'el script de emergencia tampoco importa la categoría'`

**Interfaces:**
- Consumes: `useSensitiveCategoryAccess('contacto')` (Persona **ya** lo expone como `canReadContact`; reusarlo en el bloque cónyuge. Emergencia debe llamarlo en su propio `setup`.)
- Produces: teléfono tapado no se reenvía; `validateInfo` de emergencia no exige teléfono si hay `maskedPhone`; `:can-reveal="false"`

- [ ] **Step 1: Write the failing test**

Reemplazar los dos it negativos por:

```typescript
  it('el teléfono del cónyuge se presenta como campo sensible de contacto', () => {
    const script = read('components/employeePersonInfoForm/script.ts')
    const template = read('components/employeePersonInfoForm/index.vue')
    expect(script).toContain('maskedSpousePhone')
    expect(template).toContain('column="employeeSpousePhone"')
    expect(template).toContain(':can-reveal="false"')
  })

  it('el teléfono de emergencia se presenta como campo sensible de contacto', () => {
    const script = read('components/employeeEmergencyContactForm/script.ts')
    const template = read('components/employeeEmergencyContactForm/index.vue')
    expect(script).toContain("useSensitiveCategoryAccess('contacto')")
    expect(script).toContain('maskedPhone')
    expect(template).toContain('column="employeeEmergencyContactPhone"')
    expect(template).toContain('sensitiveWriteDeniedHint')
    expect(template).toContain(':can-reveal="false"')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: FAIL — cónyuge sigue siendo `InputMask` plano.

- [ ] **Step 3: Write minimal implementation**

**Emergencia** — `setup()` con `useSensitiveCategoryAccess('contacto')`. En el watch que copia `formData`, si `!canReadContact` y hay id:

```typescript
        this.maskedPhone = hasSensitiveInputValue(newVal.employeeEmergencyContactPhone)
          ? String(newVal.employeeEmergencyContactPhone).trim()
          : null
        this.formData = { ...newVal, employeeEmergencyContactPhone: '' }
```

`onSave`: si `maskedPhone && !isEditingPhone`, `delete this.formData.employeeEmergencyContactPhone` (clonar antes). Ajustar `hasAtLeastOneField` / `validateInfo` **en el form** (no hace falta cambiar el service global si el form considera `maskedPhone` como "ya hay teléfono"): antes de `validateInfo`, si `maskedPhone`, asignar un placeholder temporal no enviado, o mejor: si `maskedPhone`, no exigir `employeeEmergencyContactPhone` en el chequeo local — clonar y pasar al `validateInfo` un objeto con un dummy solo si hace falta que `hasAtLeastOneField` pase. Más limpio: en `onSave`, si `maskedPhone`, tratar el teléfono como presente para la validación cliente y omitirlo del body:

```typescript
      const payload = { ...this.formData }
      if (this.maskedPhone && !this.isEditingPhone) {
        delete payload.employeeEmergencyContactPhone
      }
      const forValidation = {
        ...this.formData,
        employeeEmergencyContactPhone:
          this.formData.employeeEmergencyContactPhone || this.maskedPhone || '',
      }
      if (!employeeEmergencyContactService.hasAtLeastOneField(forValidation)) { /* toast */ }
      if (!employeeEmergencyContactService.validateInfo(forValidation)) { /* toast */ }
      // store/update(payload)
```

Template: mismo bloque `sensitiveWriteDeniedHint` + `SensitiveField` (`model="EmployeeEmergencyContact"`, `column="employeeEmergencyContactPhone"`, `:can-reveal="false"`) + `InputMask` solo si `!maskedPhone || isEditingPhone`.

**Cónyuge** — en `employeePersonInfoForm` (ya tiene `canReadContact`). `data`: `maskedSpousePhone`, `isEditingSpousePhone`. Tras cargar spouse:

```typescript
          if (!this.canReadContact && hasSensitiveInputValue(this.employeeSpouse.employeeSpousePhone)) {
            this.maskedSpousePhone = String(this.employeeSpouse.employeeSpousePhone).trim()
            this.employeeSpouse.employeeSpousePhone = ''
          }
```

Al guardar spouse (antes de `store`/`update`, ~`:617`):

```typescript
          const spousePayload = { ...this.employeeSpouse }
          if (this.maskedSpousePhone && !this.isEditingSpousePhone) {
            delete spousePayload.employeeSpousePhone
          }
```

`validateInfo` del spouse **no** exige teléfono (solo nombre/ocupación/cumpleaños). No hay que relajarlo.

Template del `InputMask` de `employeeSpousePhone`: mismo patrón SensitiveField + InputMask, `column="employeeSpousePhone"`, `:can-reveal="false"`, `category="contacto"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/employeeEmergencyContactForm/index.vue components/employeeEmergencyContactForm/script.ts components/employeePersonInfoForm/index.vue components/employeePersonInfoForm/script.ts tests/employeeFormTabs/sensitive-category-bindings.spec.ts
git commit -m "$(cat <<'EOF'
feat: mask spouse and emergency phones in employee forms

Those numbers now arrive masked from the API; keeping them in
plain inputs would save the mask bullets as the real phone.
EOF
)"
```

---

### Task 12: Backoffice — notas de lactancia

**Files:** (repo `gsti-rh-bo`)
- Modify: `components/employeeLactationPeriodInfoForm/index.vue` (bloque `:193-208`)
- Modify: `components/employeeLactationPeriodInfoForm/script.ts` (`hydrateLocalState` `:219`, payload `:317-319`)
- Test: `tests/employeeFormTabs/sensitive-category-bindings.spec.ts` — quitar lactancia del it `'no cablea notas de lactancia ni de incapacidad'` (si aún existe) y añadir it positivo

**Interfaces:**
- Consumes: `useSensitiveCategoryAccess('salud')`
- Produces: sin lectura, `notesModel` no se hidrata con la máscara; el payload de update **omite** `employeeLactationPeriodNotes` (`undefined`), nunca envía `null` (el service trata `null` como vaciar). `:can-reveal="false"`

- [ ] **Step 1: Write the failing test**

```typescript
  it('las notas de lactancia se presentan como campo sensible de salud', () => {
    const script = read('components/employeeLactationPeriodInfoForm/script.ts')
    const template = read('components/employeeLactationPeriodInfoForm/index.vue')
    expect(script).toContain("useSensitiveCategoryAccess('salud')")
    expect(script).toContain('maskedNotes')
    expect(template).toContain('column="employeeLactationPeriodNotes"')
    expect(template).toContain(':can-reveal="false"')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`setup()` ya existe; añadir `healthAccess`. `data`: `maskedNotes: null as string | null`, `isEditingNotes: false`.

`hydrateLocalState`:

```typescript
      const notesRaw = this.employeeLactationPeriod.employeeLactationPeriodNotes
      if (!this.isNewPeriod && !this.canReadHealth && notesRaw) {
        this.maskedNotes = String(notesRaw).trim()
        this.notesModel = ''
      } else {
        this.maskedNotes = null
        this.notesModel = notesRaw ?? ''
      }
      this.isEditingNotes = false
```

Payload (`:317-319`):

```typescript
        employeeLactationPeriodNotes:
          this.maskedNotes && !this.isEditingNotes
            ? undefined
            : this.notesModel.trim().length === 0
              ? null
              : this.notesModel.trim(),
```

Template: `sensitiveWriteDeniedHint` + `SensitiveField` (`model="EmployeeLactationPeriod"`) + `Textarea` solo si `!maskedNotes || isEditingNotes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/employeeLactationPeriodInfoForm/index.vue components/employeeLactationPeriodInfoForm/script.ts tests/employeeFormTabs/sensitive-category-bindings.spec.ts
git commit -m "$(cat <<'EOF'
feat: keep lactation notes as a masked health reference

Sending the masked string or null would either fail validation
or blank stored clinical notes on an otherwise routine edit.
EOF
)"
```

---

### Task 13: Backoffice — reporte de acontecimiento traumático

**Files:** (repo `gsti-rh-bo`)
- Modify: `pages/traumatic-event-reports/index.vue:470,489`
- Modify: `pages/traumatic-event-reports/script.ts` (`formState` `:110-111`, hidratar `:357-358`, payload `:408-411`)
- Modify: `pages/traumatic-event-reports/domain/traumatic-event-report.helpers.ts` (`buildValidationErrors`)
- Test: crear `tests/traumatic-event-reports/sensitive-health-fields.spec.ts` (Vitest de bindings, mismo estilo `readFileSync`)

**Interfaces:**
- Consumes: `useSensitiveCategoryAccess('salud')` dentro del `setup()` de composition API
- Produces: en **edición** sin lectura, las dos descripciones se muestran tapadas y se omiten del payload; `buildValidationErrors` no las exige si hay valor tapado. En **alta**, siguen requeridas. `:can-reveal="false"`

- [ ] **Step 1: Write the failing test**

Crear `gsti-rh-bo/tests/traumatic-event-reports/sensitive-health-fields.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8')

describe('traumatic event reports — campos de salud', () => {
  it('el formulario usa SensitiveField y no reenvía las descripciones tapadas', () => {
    const script = read('pages/traumatic-event-reports/script.ts')
    const template = read('pages/traumatic-event-reports/index.vue')
    const helpers = read('pages/traumatic-event-reports/domain/traumatic-event-report.helpers.ts')
    expect(script).toContain("useSensitiveCategoryAccess('salud')")
    expect(script).toContain('maskedInvolvedPeople')
    expect(script).toContain('maskedDescription')
    expect(template).toContain('column="traumaticEventReportInvolvedPeople"')
    expect(template).toContain('column="traumaticEventReportDescription"')
    expect(template).toContain(':can-reveal="false"')
    expect(helpers).toContain('hasMaskedInvolvedPeople')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/traumatic-event-reports/sensitive-health-fields.spec.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`buildValidationErrors` — añadir parámetros opcionales al final para no romper otras llamadas:

```typescript
export const buildValidationErrors = (
  state: TraumaticEventReportFormState,
  options?: {
    hasMaskedInvolvedPeople?: boolean
    hasMaskedDescription?: boolean
    isEditingInvolvedPeople?: boolean
    isEditingDescription?: boolean
  },
): TraumaticEventReportFieldErrors => {
  // ...validaciones de empleado/tipo/fecha igual...
  const involvedRequired = !options?.hasMaskedInvolvedPeople || options.isEditingInvolvedPeople
  const descriptionRequired = !options?.hasMaskedDescription || options.isEditingDescription
  if (involvedRequired && !state.traumaticEventReportInvolvedPeople.trim()) {
    errors.traumaticEventReportInvolvedPeople =
      'traumaticEventReports.errors.involvedPeopleRequired'
  }
  if (descriptionRequired && !state.traumaticEventReportDescription.trim()) {
    errors.traumaticEventReportDescription =
      'traumaticEventReports.errors.descriptionRequired'
  }
  return errors
}
```

En `setup()` de `script.ts`:

```typescript
    const healthAccess = useSensitiveCategoryAccess('salud')
    const maskedInvolvedPeople = ref<string | null>(null)
    const maskedDescription = ref<string | null>(null)
    const isEditingInvolvedPeople = ref(false)
    const isEditingDescription = ref(false)
```

Al abrir edición (`:357-358`):

```typescript
      if (!healthAccess.canRead.value) {
        maskedInvolvedPeople.value = report.traumaticEventReportInvolvedPeople
        maskedDescription.value = report.traumaticEventReportDescription
        formState.value = {
          ...formState.value,
          traumaticEventReportInvolvedPeople: '',
          traumaticEventReportDescription: '',
        }
      } else {
        maskedInvolvedPeople.value = null
        maskedDescription.value = null
      }
```

Al abrir alta, resetear máscaras a `null`.

`onSaveForm`:

```typescript
      const errors = buildValidationErrors(formState.value, {
        hasMaskedInvolvedPeople: Boolean(maskedInvolvedPeople.value),
        hasMaskedDescription: Boolean(maskedDescription.value),
        isEditingInvolvedPeople: isEditingInvolvedPeople.value,
        isEditingDescription: isEditingDescription.value,
      })
```

Payload: omitir claves tapadas (el update del API ya ramifica por `undefined`):

```typescript
      const payload: TraumaticEventReportPayload = {
        traumaticEventReportEmployeeId: formState.value.selectedEmployee!.employeeId!,
        traumaticEventTypeId: formState.value.traumaticEventTypeId!,
        traumaticEventReportOccurredAt: occurredAtIso,
        traumaticEventReportInvolvedPeople: formState.value.traumaticEventReportInvolvedPeople,
        traumaticEventReportDescription: formState.value.traumaticEventReportDescription,
      }
      if (maskedInvolvedPeople.value && !isEditingInvolvedPeople.value) {
        delete (payload as { traumaticEventReportInvolvedPeople?: string }).traumaticEventReportInvolvedPeople
      }
      if (maskedDescription.value && !isEditingDescription.value) {
        delete (payload as { traumaticEventReportDescription?: string }).traumaticEventReportDescription
      }
```

Mejor: extender `TraumaticEventReportPayload` para que esas dos claves sean opcionales en update (siguen requeridas en el tipo de create). Si el tipo único las marca required, construir el objeto en dos ramas (create vs update) en lugar de `delete`.

Template: envolver los dos `Textarea` con `sensitiveWriteDeniedHint` + `SensitiveField` (`model="TraumaticEventReport"`). Registrar componentes si esta página no usa `SensitiveField` aún.

Return del `setup()`: exportar `canReadHealth`, máscaras, flags de edición.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/traumatic-event-reports/sensitive-health-fields.spec.ts tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: PASS. Si hay unitarios de `buildValidationErrors`, actualizarlos para el tercer argumento opcional (default = exigir como hoy).

- [ ] **Step 5: Commit**

```bash
git add pages/traumatic-event-reports/index.vue pages/traumatic-event-reports/script.ts pages/traumatic-event-reports/domain/traumatic-event-report.helpers.ts tests/traumatic-event-reports/sensitive-health-fields.spec.ts
git commit -m "$(cat <<'EOF'
feat: mask traumatic-event descriptions without blocking other edits

The involved-people and event text are health data; echoing the
mask would corrupt the NOM-035 record, so update omits them.
EOF
)"
```

---

### Task 14: Backoffice — foto del rostro sin recuadro roto

**Files:** (repo `gsti-rh-bo`)
- Modify: `components/employeeBiometricFaceForm/script.ts` (`loadBiometricPhoto` `:235-248`)
- Test: `tests/employeeFormTabs/sensitive-category-bindings.spec.ts` (grupo biométricos, it nuevo)

**Interfaces:**
- Consumes: `canReadBiometric` ya expuesto por el form; `employeeBiometricFaceIdPhotoUrl` ahora puede ser `•••••`
- Produces: si no hay lectura o la URL contiene `•`, `currentPhotoUrl` queda `''`. El `v-if="canReadBiometric && currentPhotoUrl"` ya evita el `<img>` roto; hay que evitar además que una URL tapada (truthy) oculte el botón de captura (`!currentPhotoUrl`).

- [ ] **Step 1: Write the failing test**

Añadir al describe biométricos:

```typescript
  it('no asigna currentPhotoUrl si la ruta almacenada viene tapada', () => {
    const script = read('components/employeeBiometricFaceForm/script.ts')
    expect(script).toContain("includes('•')")
    expect(script).toContain('canReadBiometric')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: FAIL — `loadBiometricPhoto` asigna cualquier string truthy.

- [ ] **Step 3: Write minimal implementation**

Reemplazar el cuerpo de `loadBiometricPhoto`:

```typescript
    async loadBiometricPhoto() {
      if (!this.employee.employeeId) return
      if (!this.canReadBiometric) {
        this.currentPhotoUrl = ''
        return
      }
      try {
        const employeeService = new EmployeeService()
        const response = await employeeService.getBiometricFaceId(this.employee.employeeId)
        const url = response?._data?.data?.employeeBiometricFaceId?.employeeBiometricFaceIdPhotoUrl
        if (response?.status === 200 && typeof url === 'string' && url.length > 0 && !url.includes('•')) {
          this.currentPhotoUrl = url
        } else {
          this.currentPhotoUrl = ''
        }
      } catch (error) {
        console.error('Error loading biometric photo:', error)
        this.currentPhotoUrl = ''
      }
    },
```

No tocar el proxy `employeeBiometricFaceIdPhotoUrlProxy` ni la ruta `/api/employees/:id/biometric-face-id-photo`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/employeeBiometricFaceForm/script.ts tests/employeeFormTabs/sensitive-category-bindings.spec.ts
git commit -m "$(cat <<'EOF'
fix: skip masked face-photo URLs so the image slot stays empty

A bullet-masked path is truthy and would render a broken img and
hide the capture controls for users without biometric read.
EOF
)"
```

---

### Task 15: Verificación API + lint y pruebas manuales

**Files:** ninguno nuevo de producto.

- [ ] **Step 1: Lint y unitarios API**

Run:

```bash
node ace lint
node ace test --files tests/unit/helpers/sensitive_serialize.spec.ts
node ace test --files tests/unit/models/sensitive_serialize_wiring.spec.ts
node ace test --files tests/unit/services/sensitive_dto_masking.spec.ts
node ace test --files tests/unit/services/sensitive_update_omit_fields.spec.ts
node ace test --files tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts
node ace test --files tests/unit/controllers/pii_reveal_eligibility.spec.ts
node ace test --files tests/unit/controllers/sensitive_swagger_masking_note.spec.ts
rg -n "canRead\('(biometrico|salud|contacto|identificacion|financiero)'\)" app/helpers/sensitive_serialize.ts app/services/empresa_contratante_service.ts app/services/employee_biometric_service.ts || true
```

Expected: lint limpio; Japa en verde; `rg` vacío (la categoría no se escribe como literal en esos tres archivos).

- [ ] **Step 2: Lint/tipos y Vitest BO**

Run (en `gsti-rh-bo`):

```bash
npx nuxi typecheck
npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts tests/traumatic-event-reports/sensitive-health-fields.spec.ts
```

Expected: typecheck limpio; Vitest en verde. Cero `any` nuevos.

- [ ] **Step 3: Pruebas manuales obligatorias (resultado literal en el PR)**

Valores de referencia:

- Salud / biométrico → `•••••`
- RFC `VACW850312J95` → `•••••••••2J95`
- Importe `1250.75` → **`null`**, nunca `•••0.75`
- Teléfono (contacto, no correo) → últimos 4

1. Rol con **solo** `sensitive-biometrico-read` (+ `tab-biometricos-read`): pestaña Biométricos → dato de enrolamiento, token y foto en claro. Quitar la lectura de categoría, repetir → los tres `•••••`; se sigue viendo que hay biométricos y cuántos (`fingers`/`face`). Alta/estado de enrolamiento (socket o la UI que los consume) → `biometricData` tapado. **CA-1, CA-2.**
2. Rol con **solo** `sensitive-salud-read`: las 6 columnas de salud en claro (diagnóstico, notas médicas, descripción de incapacidad, notas de lactancia, las dos del ATS). Quitarlo → las 6 `•••••`. **CA-4.**
3. Rol sin `sensitive-financiero-read`: histórico salarial y rango del puesto → `salaryDaily`, `minSalaryDaily`, `maxSalaryDaily` = `null`. **CA-3.**
4. Rol sin `sensitive-identificacion-read`: `GET /api/empresas-contratantes` → `rfc` enmascarado. **No confundir** con `ProveedorRepse.rfc`. **CA-2 empresa contratante.**
5. PUT de nota de incapacidad desde el BO, con y sin lectura de salud: **200** y descripción intacta. Sin este cableado, 422. **CA-5.**
6. Las cinco superficies BO (incapacidad, emergencia, cónyuge, lactancia, ATS), con y sin permiso: el resto de campos se guarda; el valor sensible no se corrompe. Reenviar `•••••` a propósito → 400 `noMaskChar`. **CA-6, CA-9.**
7. Foto del rostro sin `sensitive-biometrico-read`: espacio vacío con la leyenda del hint, no `<img>` roto. **Prueba 7 del spec.**
8. `GET /api/v1/pii/reveal/EmployeeBiometric/employeeBiometricData/:id` → 422 `EMP.SENS.READ.NOT_REVEALABLE`. `GET /api/v1/pii/reveal/Person/personFirstname/:id` → 422 `EMP.SENS.READ.NOT_CLASSIFIED`. **CA-7, CA-8.**
9. Rol de prueba con **solo** `sensitive-salud-read` y `sensitive-biometrico-read`: expediente completo → 6 de salud + 3 biométricas en claro; el resto tapado; importes `null`. Sin errores. **Estado final observable.**

Lo que no debe pasar (si pasa, no mergear):

- Una de las 15 sigue en claro para quien no tiene su categoría.
- Un importe llega como `•••0.75`.
- Editar una incapacidad responde 422 porque falta la descripción.
- Se guarda `•` en diagnóstico, nota, lactancia o ATS.
- La foto se pinta rota.

Declarar en el PR la inconsistencia de envelope del revelado (`{type,title,message,data}` vs `{title,detail,key,code}`) y que un intento no revelable **deja de quedar** en `pii_access_logs`.

- [ ] **Step 4: No hay commit de producto.** Si una prueba manual exige arreglo, volver a la task dueña y commitear ahí.

---

## Spec coverage (auto-revisión)

| Requisito | Task |
|-----------|------|
| 12 columnas de texto con `sensitiveSerialize` | 3 |
| 3 importes `null` (`sensitiveSerializeNumeric`) | 1, 4 |
| DTO empresa contratante + DTO biométrico | 5 |
| `noMaskCharRule` en 5 validators | 6 |
| Update incapacidad `.optional()` + no vaciar | 6, 7 |
| Cónyuge/emergencia no vacían teléfono omitido (regla 6 / CA-9) | 7 |
| 422 `NOT_REVEALABLE` / `NOT_CLASSIFIED` | 2, 8 |
| `@swagger` 8 controllers + schemas de modelo | 9 |
| BO 5 superficies de texto | 10–13 |
| Foto facial sin recuadro roto | 14 |
| Categoría vía `categoryOf`, cero literales | 1, 5, Step 15 `rg` |
| No tocar catálogo, máscara, permisos, proxy, evidencia | File Structure |
| CA-1 … CA-9 y 7 pruebas manuales | 15 |
| `TenantBillingProfile.rfc` (27ª columna) fuera | Global Constraints |

Placeholders: ninguno. Firmas: `sensitiveSerializeNumeric`, `maskSensitiveDtoValue`, `revealEligibility` consistentes entre tasks.

Hueco consciente (declarado, no se implementa): `TenantBillingProfile.rfc` clasificado sin serialize; 7 columnas cifradas no catalogadas; `permissionGate` en revelado; `Employee.dailySalary` no clasificado.
