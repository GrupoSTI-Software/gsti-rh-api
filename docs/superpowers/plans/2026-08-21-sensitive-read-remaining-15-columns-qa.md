# Lectura sensible — 15 columnas restantes — Plan de pruebas QA (Unit + Functional / Integración)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la matriz QA de USRH1787204602828 (orden 31): unitarios de caracterización del motor ya entregado (fábrica numérica, DTO, wiring de las 15, 422 de revelado) más una suite Japa HTTP / integración que demuestra CA-1 a CA-8 contra la app real, y Vitest de bindings del backoffice para CA-9, sin encender el interruptor del módulo Empleados y sin que falte una categoría produzca `PERM.DENIED`.

**Architecture:** El producto vive en `feature/USRH1787204602828-lectura-sensibles-columnas-2` (API) y la rama homónima de `gsti-rh-bo`. Los unitarios de la orden 31 ya existen (helpers, wiring, validators, DTO, omit-on-update, swagger). Este plan **no reescribe** `tests/functional/employees/employees_sensitive_read_by_category.spec.ts` (las 11 de la orden 30). Añade un hueco unitario (`categoryOf` de las 15), extiende el support de fixtures, y crea una suite HTTP nueva. El oráculo de máscara es `maskSensitiveValue` / `MASK_CHAR`, nunca literales sueltos salvo el contraejemplo de magnitud `•••0.75`. El DTO biométrico no tiene caller HTTP: se prueba invocando `EmployeeBiometricService.getEnrollmentStatus` dentro de `SensitiveAccessContext.run` (el socket no abre ALS; eso es fail-closed declarado). CA-9 es Vitest de bindings en BO, no Playwright.

**Tech Stack:** AdonisJS 6, Lucid, Japa (`@japa/runner` + HTTP client), `maskSensitiveValue`, `SensitiveAccessContext`, `SensitiveFieldsCatalogService`. Backoffice: Vitest sobre fuentes Vue.

## Global Constraints

- Historia: USRH1787204602828 · orden 31. Spec: `spec-USRH1787204602828.md`. Plan de producto: `docs/superpowers/plans/2026-08-21-sensitive-read-remaining-15-columns.md`.
- Alcanza **únicamente las 15 columnas del Anexo A**. Las 11 `maskedInApi: true` ya las cubre la suite de la orden 30; no duplicar F.1–F.11 de aquel archivo.
- Catálogo real: **27** entradas (`TenantBillingProfile.rfc` entró después de la HU). Esta rebanada gobierna 15; al terminar 26/27 tienen serialize. **No** exigir serialize ni HTTP de `TenantBillingProfile.rfc`. **No** confundir `EmpresaContratante.rfc` con `ProveedorRepse.rfc`.
- `evaluate` no cambia. **No se enciende** `system_module_permission_enforcement_active` de `employees`. Tras cada grupo el interruptor queda `false`.
- Falta de categoría **nunca** es 403 / `PERM.DENIED` en las rutas de expediente que usan `permissionGate` + `evaluate`. HTTP 200 con el dato tapado, en claro, o `null` (importes). Lactancia, ATS y empresas contratantes tienen `RoleService.hasAccess` / RBAC REPSE **propio**: esas rutas sí 403 si falta el permiso de módulo; el test debe concederlo y seguir asertando que la **categoría** no 403.
- Fail-closed: sin ALS, `canRead` false → texto tapado, importe `null`.
- Los tres importes van `null` sin `sensitive-financiero-read`, nunca `maskLastFour` (`"1250.75"` → `•••0.75`).
- No tocar `maskSensitiveValue`, `MASK_CHAR`, entradas de `SENSITIVE_FIELDS`, `evidence.service.ts`, `start/socket.ts`.
- Bancos/médica/notas/teléfonos/importes cifrados: crear con `Model.create()` (cifrado `prepare`). Prohibido `db.table(...).insert` de claro.
- TDD de caracterización: el producto ya existe. Cada test nuevo **debe pasar**. Si falla, el bug es de producto (volver al plan de implementación); no se relaja la aserción.
- Código, comentarios y docs en español; identificadores en inglés. Commits: Conventional Commits, tipo en inglés, descripción en inglés.
- Cero Playwright. Cero suite HTTP nueva sobre las 11 de la orden 30. Cero tests del interruptor ON.

---

## Contratos fijos de la suite

### Interruptor

`system_modules.system_module_permission_enforcement_active` del módulo `employees` permanece `false`.

### Oráculo de máscara (no hardcodear `•` salvo el contraejemplo de magnitud)

| Campo | Claro de fixture | Categoría | Esperado tapado |
|-------|------------------|-----------|-----------------|
| `employeeBiometricData` | `Finger:1, Finger:4, Face` | biometrico | `MASK_CHAR.repeat(5)` |
| `employeeBiometricFaceIdToken` | `face-token-qa-xyz` | biometrico | `MASK_CHAR.repeat(5)` |
| `employeeBiometricFaceIdPhotoUrl` | `s3://gsti-qa/face.jpg` | biometrico | `MASK_CHAR.repeat(5)` |
| `workDisabilityNoteDescription` | `nota clinica de incapacidad qa` | salud | `MASK_CHAR.repeat(5)` |
| `traumaticEventReportInvolvedPeople` | `Ana y Luis` | salud | `MASK_CHAR.repeat(5)` |
| `traumaticEventReportDescription` | `caida en andamio` | salud | `MASK_CHAR.repeat(5)` |
| `employeeLactationPeriodNotes` | `notas de lactancia qa` | salud | `MASK_CHAR.repeat(5)` |
| `employeeMedicalConditionDiagnosis` / `Notes` | los de `CLEAR_FIXED` | salud | `MASK_CHAR.repeat(5)` |
| `employeeEmergencyContactPhone` | `5512345678` | contacto | `maskSensitiveValue(phone, 'contacto')` |
| `employeeSpousePhone` | `5587654321` | contacto | últimos 4 |
| `userConsentIp` | `203.0.113.10` | contacto | últimos 4 |
| `userConsentUserAgent` | `QaAgent/1.0` | contacto | últimos 4 |
| `EmpresaContratante.rfc` | `VACW850312J95` | identificacion | `maskSensitiveValue(rfc, 'identificacion')` → `•••••••••2J95` |
| `salaryDaily` / `minSalaryDaily` / `maxSalaryDaily` | `1250.75` / `1000` / `2000` | financiero | **`null`**, nunca `'•••0.75'` |

Conteo biométrico (siempre en claro, CA-1): `fingers` incluye `1` y `4`; `face === true`.

### Rutas HTTP de esta matriz

| Superficie | Método | Cuerpo |
|------------|--------|--------|
| Incapacidad show | `GET /api/work-disability-notes/:id` | `data.workDisabilityNote.workDisabilityNoteDescription` |
| Incapacidad update | `PUT /api/work-disability-notes/:id` | mismo |
| Cónyuge | `GET/PUT /api/employee-spouses/:id` | `data.employeeSpouse.employeeSpousePhone` |
| Emergencia | `GET/PUT /api/employee-emergency-contacts/:id` | `data.employeeEmergencyContact.employeeEmergencyContactPhone` |
| Lactancia index | `GET /api/employee-lactation-periods?employeeId=&page=1&limit=10` | `data.employeeLactationPeriods.data[]` |
| ATS show | `GET /api/traumatic-event-reports/:id` | `data.traumaticEventReport.*` |
| Histórico salarial | `GET /api/employees/:employeeId/salary-history` | `data[]` o primer ítem `.salaryDaily` |
| Rango salarial | `GET /api/position-salary-ranges?razon_social_id=:buId&position_id=:positionId` | `data[]` `.minSalaryDaily` / `.maxSalaryDaily` |
| Biométricos show | `GET /api/employees/:employeeId/biometrics` | `data.employeeBiometric.fingers` / `.face` — **no** trae `employeeBiometricData` |
| Empresa contratante | `GET /api/empresas-contratantes/:id` | RFC del DTO |
| Revelado | `GET /api/v1/pii/reveal/:model/:column/:recordId` | 422 `{title,detail,key,code}` |

Todas las rutas de expediente llevan `X-Business-Unit-Id` = `actor.businessUnit.businessUnitPublicId`.

### Headers y auth

```typescript
.loginAs(actor.user).header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
```

### Nunca 403 por categoría (rutas con permissionGate + evaluate)

```typescript
assert.equal(response.status(), 200)
assert.notEqual(response.body()?.key, 'PERM.DENIED')
```

---

## Matriz Unit (regresión + hueco)

Automatizado. Sin interruptor ON.

| # | Escenario | Archivo | Criterio de éxito |
|---|-----------|---------|-------------------|
| U.1 | `categoryOf` de las **15** del Anexo A | `tests/unit/services/sensitive_fields_catalog_service.spec.ts` | Cada par resuelve la categoría del Anexo A; `personFirstname` → `null` |
| U.2 | `revealEligibility` | mismo | `personCurp` revealable; `employeeBiometricData` / `workDisabilityNoteDescription` not_revealable; `personFirstname` not_classified |
| U.3 | Códigos 422 | `tests/unit/constants/sensitive_data_read_error_codes.spec.ts` | `EMP.SENS.READ.NOT_REVEALABLE` y `NOT_CLASSIFIED` |
| U.4 | Fábrica texto + numérica + DTO | `tests/unit/helpers/sensitive_serialize.spec.ts` | Importe `null`; biométrico DTO cinco `MASK_CHAR`; cero literales de categoría |
| U.5 | Wiring 12 texto + 3 numéricas | `tests/unit/models/sensitive_serialize_wiring.spec.ts` | `sensitiveSerialize(` / `sensitiveSerializeNumeric(`; proxy face no serializa |
| U.6 | DTO empresa + biométrico | `tests/unit/services/sensitive_dto_masking.spec.ts` | `maskSensitiveDtoValue` en los dos servicios; socket.ts no se toca |
| U.7 | `noMaskCharRule` | `tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts` | 5 validators; CREATE incapacidad sigue requerida |
| U.8 | Omit = no modificar | `tests/unit/services/sensitive_update_omit_fields.spec.ts` | null/undefined no asignan descripción ni teléfonos |
| U.9 | Controller revelado | `tests/unit/controllers/pii_reveal_eligibility.spec.ts` | 422 antes de `new PiiRevealService()` |
| U.10 | Swagger | `tests/unit/controllers/sensitive_swagger_masking_note.spec.ts` | Frases canónicas |
| U.11 | Motor orden 30 (no romper) | los specs de ALS / `evaluateEnforced` / seeder 0058 | Siguen verdes |
| U.12 | **Hueco:** `categoryOf` Anexo A | Task 1 de este plan | Las 15 + `TenantBillingProfile.rfc` clasificado (fuera de serialize) |

Correr batería unitaria de esta HU:

```bash
node ace test --files tests/unit/helpers/sensitive_serialize.spec.ts,tests/unit/models/sensitive_serialize_wiring.spec.ts,tests/unit/services/sensitive_dto_masking.spec.ts,tests/unit/services/sensitive_update_omit_fields.spec.ts,tests/unit/validators/sensitive_no_mask_char_wiring.spec.ts,tests/unit/controllers/pii_reveal_eligibility.spec.ts,tests/unit/controllers/sensitive_swagger_masking_note.spec.ts,tests/unit/constants/sensitive_data_read_error_codes.spec.ts,tests/unit/services/sensitive_fields_catalog_service.spec.ts
```

---

## Matriz Functional / Integración (nuevo)

Japa HTTP real + una llamada de servicio bajo ALS. Interruptor OFF.

| # | CA | Escenario | Criterio de éxito |
|---|----|-----------|-------------------|
| F.1 | CA-4 | Solo `sensitive-salud-read` | 6 columnas de salud en claro (médica + incapacidad + lactancia + 2 ATS); teléfonos e importes tapados/`null`; 200 |
| F.2 | CA-4 | Cero lecturas sensibles | Las 6 de salud `MASK_CHAR.repeat(5)`; 200; no `PERM.DENIED` |
| F.3 | CA-3 | Sin `sensitive-financiero-read` | `salaryDaily`, `minSalaryDaily`, `maxSalaryDaily` son `null`; `assert.notEqual(value, '•••0.75')` |
| F.4 | CA-3 | Solo `sensitive-financiero-read` | Los tres son `number` y coinciden con el fixture |
| F.5 | CA-2 | Sin `sensitive-identificacion-read`, con `repse-registrations:read` | `GET /api/empresas-contratantes/:id` → RFC enmascarado. No asertar `ProveedorRepse` |
| F.6 | CA-2 | Con `sensitive-identificacion-read` | RFC `VACW850312J95` en claro |
| F.7 | CA-1 | `GET .../biometrics` sin `sensitive-biometrico-read` | `fingers`/`face` en claro (hay biométricos y cuántos); el JSON **no** incluye el string `Finger:1` |
| F.8 | CA-1 / CA-2 | `getEnrollmentStatus` sin ALS / con `biometrico: true` | `biometricData` tapado vs claro; `fingers`/`face` siempre claros |
| F.9 | CA-1 | `EmployeeBiometricFaceId.serialize()` | token y photoUrl tapados sin permiso; claros con `biometrico: true`. No llamar `GET .../biometric-face-id` (S3 `getDownloadLink`) |
| F.10 | CA-5 | `PUT` incapacidad **sin** clave `workDisabilityNoteDescription` | 200; recargar el modelo (consume, sin serialize) conserva el texto claro |
| F.11 | CA-6 | `PUT` incapacidad / cónyuge / emergencia / lactancia / ATS con `MASK_CHAR` en el campo | 400 o 422; mensaje de `noMaskChar`; valor en BD intacto |
| F.12 | CA-9 API | `PUT` cónyuge y emergencia omitiendo el teléfono (`null`) | 200; teléfono en BD intacto |
| F.13 | CA-7 | `GET /api/v1/pii/reveal/EmployeeBiometric/employeeBiometricData/:id` | 422, envelope `{title,detail,key,code}`, código `NOT_REVEALABLE`; **cero** filas nuevas en `pii_access_logs` |
| F.14 | CA-8 | `GET /api/v1/pii/reveal/Person/personFirstname/:id` | 422 `NOT_CLASSIFIED`; cero filas nuevas en bitácora |
| F.15 | — | Consentimiento: `UserConsent.serialize()` bajo ALS | IP y UA tapados sin `contacto`; claros con grant. No tocar `evidence.service.ts` |
| F.16 | — | CREATE incapacidad sin descripción | Sigue 422 (el `.optional()` es solo UPDATE) |

---

## Matriz Unit BO (CA-9)

Repo `gsti-rh-bo`. Vitest de fuentes; no HTTP.

| # | Superficie | Archivo | Criterio |
|---|------------|---------|----------|
| B.1 | Incapacidad | `tests/employeeFormTabs/sensitive-category-bindings.spec.ts` | Ya existe el it de descripción; no revertirlo |
| B.2 | Emergencia + cónyuge | mismo | Invertir `'no cablea el teléfono del cónyuge ni el de emergencia'` |
| B.3 | Lactancia | mismo | Invertir el it que solo afirma lactancia |
| B.4 | ATS | `tests/traumatic-event-reports/sensitive-health-fields.spec.ts` (crear si no existe) | `useSensitiveCategoryAccess('salud')`, `:can-reveal="false"`, delete de las dos claves |
| B.5 | Foto facial | bindings biométricos | No asignar `currentPhotoUrl` si la URL contiene `MASK`/`•` o `!canReadBiometric` |

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `tests/unit/services/sensitive_fields_catalog_service.spec.ts` | U.1 / U.12: `categoryOf` de las 15. |
| `tests/functional/employees/sensitive_read_by_category_support.ts` | Extender fixtures Anexo A, extractores, `grantModuleAction`, `allDenied`. |
| `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts` | Suite HTTP F.1–F.16. Un `test.group`, interruptor OFF. |
| `gsti-rh-bo/tests/employeeFormTabs/sensitive-category-bindings.spec.ts` | B.2–B.3, B.5. |
| `gsti-rh-bo/tests/traumatic-event-reports/sensitive-health-fields.spec.ts` | B.4. |

**No se modifica producto** salvo que un test nuevo falle: entonces el arreglo vive en el plan de implementación, no aquí.

**No se crea:** suite con interruptor ON, tests de `ProveedorRepse.rfc`, serialize de `TenantBillingProfile.rfc`, tests de `start/socket.ts`, Playwright.

---

### Task 1: Unitario U.12 — `categoryOf` de las 15

**Files:**
- Modify: `tests/unit/services/sensitive_fields_catalog_service.spec.ts`
- Test: mismo archivo

**Interfaces:**
- Consumes: `SensitiveFieldsCatalogService.categoryOf`
- Produces: cobertura U.1/U.12. Los tasks HTTP asumen estas categorías.

- [ ] **Step 1: Write the characterization test**

Añadir un grupo nuevo, sin borrar el de las 11:

```typescript
test.group('SensitiveFieldsCatalogService.categoryOf — Anexo A orden 31', () => {
  test('resuelve las 15 columnas restantes', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('EmployeeBiometric', 'employeeBiometricData'), 'biometrico')
    assert.equal(
      catalog.categoryOf('EmployeeBiometricFaceId', 'employeeBiometricFaceIdToken'),
      'biometrico'
    )
    assert.equal(
      catalog.categoryOf('EmployeeBiometricFaceId', 'employeeBiometricFaceIdPhotoUrl'),
      'biometrico'
    )
    assert.equal(
      catalog.categoryOf('WorkDisabilityNote', 'workDisabilityNoteDescription'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('TraumaticEventReport', 'traumaticEventReportInvolvedPeople'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('TraumaticEventReport', 'traumaticEventReportDescription'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('EmployeeLactationPeriod', 'employeeLactationPeriodNotes'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('EmployeeEmergencyContact', 'employeeEmergencyContactPhone'),
      'contacto'
    )
    assert.equal(catalog.categoryOf('EmployeeSpouse', 'employeeSpousePhone'), 'contacto')
    assert.equal(catalog.categoryOf('UserConsent', 'userConsentIp'), 'contacto')
    assert.equal(catalog.categoryOf('UserConsent', 'userConsentUserAgent'), 'contacto')
    assert.equal(catalog.categoryOf('EmpresaContratante', 'rfc'), 'identificacion')
    assert.equal(catalog.categoryOf('EmployeeSalaryHistory', 'salaryDaily'), 'financiero')
    assert.equal(catalog.categoryOf('PositionSalaryRange', 'minSalaryDaily'), 'financiero')
    assert.equal(catalog.categoryOf('PositionSalaryRange', 'maxSalaryDaily'), 'financiero')
  })

  test('TenantBillingProfile.rfc está clasificado pero queda fuera de esta rebanada', ({
    assert,
  }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('TenantBillingProfile', 'rfc'), 'identificacion')
  })
})
```

- [ ] **Step 2: Run the new group**

Run: `node ace test --files tests/unit/services/sensitive_fields_catalog_service.spec.ts`

Expected: PASS. Si `TenantBillingProfile.rfc` no está en el catálogo, parar y reportar drift (no inventar la entrada).

- [ ] **Step 3: Run the unit battery listed above**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/services/sensitive_fields_catalog_service.spec.ts
git commit -m "$(cat <<'EOF'
test: cover categoryOf for the fifteen remaining sensitive columns

EOF
)"
```

---

### Task 2: Fixtures HTTP del Anexo A

**Files:**
- Modify: `tests/functional/employees/sensitive_read_by_category_support.ts`

**Interfaces:**
- Consumes: `createSensitiveFixture`, `createActor`, `grantOnly`, `buHeader`, `CLEAR_FIXED`, `maskSensitiveValue`
- Produces:
  - `allDenied: Record<LegalCategory, boolean>`
  - `CLEAR_REMAINING` (textos/importes/RFC del Anexo A)
  - `grantModuleAction(roleId, moduleSlug, actionSlug): Promise<void>`
  - `createRemainingSensitiveFixture(actor, base: SensitiveFixture): Promise<RemainingSensitiveFixture>`
  - `cleanupRemainingSensitiveFixture(extra: RemainingSensitiveFixture | null): Promise<void>`
  - extractores: `workDisabilityNoteBody`, `spouseBody`, `emergencyBody`, `firstSalaryDaily`, `rangeAmounts`, `empresaRfc`

- [ ] **Step 1: Export the existing `asRecord` helper**

En `sensitive_read_by_category_support.ts`, cambiar la función local:

```typescript
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
```

No duplicar esa función al pegar el bloque de abajo.

- [ ] **Step 2: Append helpers** (no reescribir el archivo; pegar al final, **sin** redefinir `asRecord`)

`DateTime` y `maskSensitiveValue` ya están importados en el support. Fusionar el resto de imports en la cabecera del archivo (no duplicar `luxon`).

```typescript
import type { LegalCategory } from '#constants/sensitive_fields'
import { MASK_CHAR } from '#helpers/sensitive_mask'
import WorkDisability from '#models/work_disability'
import WorkDisabilityNote from '#models/work_disability_note'
import InsuranceCoverageType from '#models/insurance_coverage_type'
import EmployeeSpouse from '#models/employee_spouse'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import TraumaticEventReport from '#models/traumatic_event_report'
import TraumaticEventType from '#models/traumatic_event_type'
import EmployeeBiometric from '#models/employee_biometric'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import EmployeeSalaryHistory from '#models/employee_salary_history'
import PositionSalaryRange from '#models/position_salary_range'
import EmpresaContratante from '#models/empresa_contratante'
import UserConsent from '#models/user_consent'
import LegalDocument from '#models/legal_document'
import { blindIndex } from '#utils/blind_index'
import { normalizeRfc } from '#shared/validators/rfc.validator'

export const allDenied: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

export const CLEAR_REMAINING = {
  disabilityDescription: 'nota clinica de incapacidad qa',
  traumaPeople: 'Ana y Luis',
  traumaDescription: 'caida en andamio',
  lactationNotes: 'notas de lactancia qa',
  spouseFirstname: 'ConyugeQa',
  spouseLastname: 'Prueba',
  emergencyFirstname: 'EmerQa',
  emergencyLastname: 'Contacto',
  emergencyRelationship: 'hermano',
  biometricData: 'Finger:1, Finger:4, Face',
  faceToken: 'face-token-qa-xyz',
  facePhotoUrl: 's3://gsti-qa/face.jpg',
  empresaRfc: 'VACW850312J95',
  empresaRazon: 'QA Contratante Sensible SA de CV',
  salaryDaily: 1250.75,
  minSalaryDaily: 1000,
  maxSalaryDaily: 2000,
  consentIp: '203.0.113.10',
  consentUa: 'QaAgent/1.0',
} as const

export interface RemainingSensitiveFixture {
  disability: WorkDisability
  note: WorkDisabilityNote
  spouse: EmployeeSpouse
  emergency: EmployeeEmergencyContact
  lactation: EmployeeLactationPeriod
  trauma: TraumaticEventReport
  biometric: EmployeeBiometric
  faceId: EmployeeBiometricFaceId
  salary: EmployeeSalaryHistory
  range: PositionSalaryRange
  empresa: EmpresaContratante
  consent: UserConsent | null
}

export async function grantModuleAction(
  roleId: number,
  moduleSlug: string,
  actionSlug: string
) {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', actionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
    )
    .first()
  if (!permission) {
    throw new Error(`Se requiere ${moduleSlug}:${actionSlug} en BD para este test.`)
  }
  await RoleSystemPermission.firstOrCreate(
    { roleId, systemPermissionId: permission.systemPermissionId },
    { roleId, systemPermissionId: permission.systemPermissionId }
  )
}

export async function createRemainingSensitiveFixture(
  actor: TenantActor,
  base: SensitiveFixture
): Promise<RemainingSensitiveFixture> {
  const coverage = await InsuranceCoverageType.query()
    .whereNull('insurance_coverage_type_deleted_at')
    .firstOrFail()
  const disability = await WorkDisability.create({
    employeeId: base.employee.employeeId,
    insuranceCoverageTypeId: coverage.insuranceCoverageTypeId,
    workDisabilityUuid: `wd-sens15-${Date.now()}`,
  })
  const note = await WorkDisabilityNote.create({
    workDisabilityId: disability.workDisabilityId,
    workDisabilityNoteDescription: CLEAR_REMAINING.disabilityDescription,
    userId: actor.user.userId,
  })
  const spouse = await EmployeeSpouse.create({
    employeeId: base.employee.employeeId,
    employeeSpouseFirstname: CLEAR_REMAINING.spouseFirstname,
    employeeSpouseLastname: CLEAR_REMAINING.spouseLastname,
    employeeSpouseSecondLastname: 'Qa',
    employeeSpouseOcupation: 'QA',
    employeeSpouseBirthday: '1990-01-15',
    employeeSpousePhone: CLEAR_FIXED.phoneSecondary,
  })
  const emergency = await EmployeeEmergencyContact.create({
    employeeId: base.employee.employeeId,
    employeeEmergencyContactFirstname: CLEAR_REMAINING.emergencyFirstname,
    employeeEmergencyContactLastname: CLEAR_REMAINING.emergencyLastname,
    employeeEmergencyContactSecondLastname: 'Qa',
    employeeEmergencyContactRelationship: CLEAR_REMAINING.emergencyRelationship,
    employeeEmergencyContactPhone: CLEAR_FIXED.phone,
  })
  const lactation = new EmployeeLactationPeriod()
  lactation.employeeId = base.employee.employeeId
  lactation.employeeLactationPeriodStartDate = DateTime.now().startOf('day')
  lactation.employeeLactationPeriodEndDate = DateTime.now().startOf('day').plus({ days: 60 })
  lactation.employeeLactationPeriodType = 'reduced_hour'
  lactation.employeeLactationPeriodReductionApplication = 'end'
  lactation.employeeLactationPeriodNotes = CLEAR_REMAINING.lactationNotes
  await lactation.save()
  const traumaType = await TraumaticEventType.query()
    .whereNull('traumatic_event_type_deleted_at')
    .firstOrFail()
  const trauma = await TraumaticEventReport.create({
    employeeId: base.employee.employeeId,
    traumaticEventTypeId: traumaType.traumaticEventTypeId,
    traumaticEventReportOccurredAt: DateTime.now().startOf('day'),
    traumaticEventReportElaboratedAt: DateTime.now(),
    traumaticEventReportInvolvedPeople: CLEAR_REMAINING.traumaPeople,
    traumaticEventReportDescription: CLEAR_REMAINING.traumaDescription,
    traumaticEventReportOrigin: 'rh',
    traumaticEventReportCapturedByUserId: actor.user.userId,
  })
  const biometric = await EmployeeBiometric.create({
    employeeId: base.employee.employeeId,
    businessUnitId: actor.businessUnit.businessUnitId,
    employeeBiometricData: CLEAR_REMAINING.biometricData,
    employeeBiometricStatus: 'completed_both',
  })
  const faceId = await EmployeeBiometricFaceId.create({
    employeeId: base.employee.employeeId,
    businessUnitId: actor.businessUnit.businessUnitId,
    employeeBiometricFaceIdToken: CLEAR_REMAINING.faceToken,
    employeeBiometricFaceIdPhotoUrl: CLEAR_REMAINING.facePhotoUrl,
  })
  const salary = await EmployeeSalaryHistory.create({
    employeeId: base.employee.employeeId,
    salaryDaily: CLEAR_REMAINING.salaryDaily,
    validFrom: DateTime.now().startOf('day'),
    validTo: null,
    changedBy: actor.user.userId,
    reason: 'qa-orden-31',
  })
  const range = await PositionSalaryRange.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    positionId: base.positionId,
    minSalaryDaily: CLEAR_REMAINING.minSalaryDaily,
    maxSalaryDaily: CLEAR_REMAINING.maxSalaryDaily,
    validFrom: DateTime.now().startOf('day'),
    validTo: null,
    createdBy: actor.user.userId,
  })
  const normalizedRfc = normalizeRfc(CLEAR_REMAINING.empresaRfc)
  const empresa = await EmpresaContratante.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    razonSocial: CLEAR_REMAINING.empresaRazon,
    rfc: CLEAR_REMAINING.empresaRfc,
    rfcHash: blindIndex(normalizedRfc),
    domicilioFiscal: 'Calle QA 1, CDMX',
  })
  const legal = await LegalDocument.query().first()
  let consent: UserConsent | null = null
  if (legal) {
    consent = await UserConsent.create({
      userId: actor.user.userId,
      employeeId: base.employee.employeeId,
      legalDocumentId: legal.legalDocumentId,
      userConsentDocumentVersion: 'qa-1',
      userConsentIp: CLEAR_REMAINING.consentIp,
      userConsentUserAgent: CLEAR_REMAINING.consentUa,
      userConsentAcceptedAt: DateTime.now(),
      userConsentChannel: 'digital',
    })
  }
  return {
    disability,
    note,
    spouse,
    emergency,
    lactation,
    trauma,
    biometric,
    faceId,
    salary,
    range,
    empresa,
    consent,
  }
}

export async function cleanupRemainingSensitiveFixture(
  extra: RemainingSensitiveFixture | null
) {
  if (!extra) return
  if (extra.consent) {
    await UserConsent.query().where('user_consent_id', extra.consent.userConsentId).delete()
  }
  await EmpresaContratante.query()
    .where('empresa_contratante_id', extra.empresa.empresaContratanteId)
    .delete()
  await PositionSalaryRange.query()
    .where('position_salary_range_id', extra.range.positionSalaryRangeId)
    .delete()
  await EmployeeSalaryHistory.query()
    .where('employee_salary_history_id', extra.salary.employeeSalaryHistoryId)
    .delete()
  await EmployeeBiometricFaceId.query()
    .where('employee_biometric_face_id_id', extra.faceId.employeeBiometricFaceIdId)
    .delete()
  await EmployeeBiometric.query()
    .where('employee_biometric_id', extra.biometric.employeeBiometricId)
    .delete()
  await TraumaticEventReport.query()
    .where('traumatic_event_report_id', extra.trauma.traumaticEventReportId)
    .delete()
  await EmployeeLactationPeriod.query()
    .where('employee_lactation_period_id', extra.lactation.employeeLactationPeriodId)
    .delete()
  await EmployeeEmergencyContact.query()
    .where('employee_emergency_contact_id', extra.emergency.employeeEmergencyContactId)
    .delete()
  await EmployeeSpouse.query()
    .where('employee_spouse_id', extra.spouse.employeeSpouseId)
    .delete()
  await WorkDisabilityNote.query()
    .where('work_disability_note_id', extra.note.workDisabilityNoteId)
    .delete()
  await WorkDisability.query()
    .where('work_disability_id', extra.disability.workDisabilityId)
    .delete()
}

export function workDisabilityNoteBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).workDisabilityNote)
}

export function spouseBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).employeeSpouse)
}

export function emergencyBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).employeeEmergencyContact)
}

export function firstSalaryDaily(body: Record<string, unknown>): unknown {
  const data = body.data
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data).data)
      ? (asRecord(data).data as unknown[])
      : []
  const first = asRecord(rows[0])
  return first.salaryDaily
}

export function rangeAmounts(body: Record<string, unknown>): {
  min: unknown
  max: unknown
} {
  const data = body.data
  const rows = Array.isArray(data) ? data : []
  const first = asRecord(rows[0])
  return { min: first.minSalaryDaily, max: first.maxSalaryDaily }
}

export function empresaRfcFromShow(body: Record<string, unknown>): unknown {
  const data = asRecord(body.data)
  const direct = asRecord(data.empresaContratante)
  if (direct.rfc !== undefined) return direct.rfc
  if (data.rfc !== undefined) return data.rfc
  return undefined
}

export function expectMaskedHealth(value: unknown, assert: Assert) {
  assert.equal(value, MASK_CHAR.repeat(5))
}

export function expectAmountNull(value: unknown, assert: Assert) {
  assert.isNull(value)
  assert.notEqual(value, '•••0.75')
}
```

- [ ] **Step 3: Typecheck the support file by running a smoke import**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS (la suite de las 11 no debe romperse). Si el append introduce error de TS en el support, arreglar solo imports/tipos.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/employees/sensitive_read_by_category_support.ts
git commit -m "$(cat <<'EOF'
test: add fixtures for the fifteen remaining sensitive columns

EOF
)"
```

---

### Task 3: Suite HTTP — importes, RFC de empresa, humo 200

**Files:**
- Create: `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: helpers del Task 2 + `createActor` / `grantOnly` / `grantModuleAction`
- Produces: F.3, F.4, F.5, F.6 y el `test.group` con interruptor OFF

- [ ] **Step 1: Write the suite skeleton and F.3–F.6**

```typescript
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import SystemModule from '#models/system_module'
import PiiAccessLog from '#models/pii_access_log'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import EmployeeBiometricService from '#services/employee_biometric_service'
import type { I18n } from '@adonisjs/i18n'
import {
  allDenied,
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  CLEAR_FIXED,
  CLEAR_REMAINING,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  emergencyBody,
  empresaRfcFromShow,
  expectAmountNull,
  expectMaskedHealth,
  expectNeverDenied,
  firstSalaryDaily,
  grantModuleAction,
  grantOnly,
  medicalConditionBody,
  rangeAmounts,
  spouseBody,
  workDisabilityNoteBody,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

function fakeI18n(): I18n {
  return { formatMessage: (key: string) => key } as I18n
}

test.group('Lectura sensible — 15 columnas restantes — HTTP', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let extra: RemainingSensitiveFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('sens-read-15')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens15')
    extra = await createRemainingSensitiveFixture(actor, fixture)
  })

  group.teardown(async () => {
    try {
      await cleanupRemainingSensitiveFixture(extra)
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('humo: GET nota de incapacidad sin grants sensibles responde 200', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    expectMaskedHealth(
      workDisabilityNoteBody(response.body()).workDisabilityNoteDescription,
      assert
    )
  })

  test('CA-3: sin financiero los importes van null, nunca mascara parcial', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const salaryRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/salary-history`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(salaryRes, assert)
    expectAmountNull(firstSalaryDaily(salaryRes.body()), assert)

    const rangeRes = await client
      .get('/api/position-salary-ranges')
      .qs({
        razon_social_id: actor!.businessUnit.businessUnitId,
        position_id: fixture!.positionId,
      })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(rangeRes, assert)
    const amounts = rangeAmounts(rangeRes.body())
    expectAmountNull(amounts.min, assert)
    expectAmountNull(amounts.max, assert)
  })

  test('CA-3: con sensitive-financiero-read los importes son number', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-financiero-read'])
    const salaryRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/salary-history`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(salaryRes, assert)
    assert.equal(firstSalaryDaily(salaryRes.body()), CLEAR_REMAINING.salaryDaily)

    const rangeRes = await client
      .get('/api/position-salary-ranges')
      .qs({
        razon_social_id: actor!.businessUnit.businessUnitId,
        position_id: fixture!.positionId,
      })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const amounts = rangeAmounts(rangeRes.body())
    assert.equal(amounts.min, CLEAR_REMAINING.minSalaryDaily)
    assert.equal(amounts.max, CLEAR_REMAINING.maxSalaryDaily)
  })

  test('CA-2: RFC de empresa contratante se enmascara sin identificacion', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    await grantModuleAction(actor!.role.roleId, 'repse-registrations', 'read')
    const response = await client
      .get(`/api/empresas-contratantes/${extra!.empresa.empresaContratanteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    assert.equal(
      empresaRfcFromShow(response.body()),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc, 'identificacion')
    )
  })

  test('CA-2: RFC de empresa contratante llega en claro con identificacion', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-identificacion-read'])
    await grantModuleAction(actor!.role.roleId, 'repse-registrations', 'read')
    const response = await client
      .get(`/api/empresas-contratantes/${extra!.empresa.empresaContratanteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    assert.equal(empresaRfcFromShow(response.body()), CLEAR_REMAINING.empresaRfc)
  })
})
```

- [ ] **Step 2: Run the new file**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

Expected: PASS. Si `rangeAmounts` no encuentra filas, ajustar el extractor al JSON real (`data.ranges` / primer elemento) **sin** relajar `null` vs `•••0.75`. Si empresas 403 `sin-permiso`, el `grantModuleAction` falló: no saltar el test.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: assert salary amounts null and contracting RFC masked

EOF
)"
```

---

### Task 4: HTTP — salud, biométricos y consentimiento

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `extra.note`, `extra.lactation`, `extra.trauma`, `extra.biometric`, `extra.faceId`, `extra.consent`, `EmployeeBiometricService.getEnrollmentStatus`
- Produces: F.1, F.2, F.7, F.8, F.9, F.15

- [ ] **Step 1: Add the tests inside the same group**

```typescript
  test('CA-4: solo sensitive-salud-read destapa las 6 de salud', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-salud-read', 'read'])
    await grantModuleAction(actor!.role.roleId, 'traumatic-event-reports', 'read')
    const medicalRes = await client
      .get(
        `/api/employee-medical-conditions/${fixture!.medical.employeeMedicalConditionId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(medicalRes, assert)
    const medical = medicalConditionBody(medicalRes.body())
    assert.equal(medical.employeeMedicalConditionDiagnosis, CLEAR_FIXED.diagnosis)
    assert.equal(medical.employeeMedicalConditionNotes, CLEAR_FIXED.notes)

    const noteRes = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.equal(
      workDisabilityNoteBody(noteRes.body()).workDisabilityNoteDescription,
      CLEAR_REMAINING.disabilityDescription
    )

    const lactationRes = await client
      .get('/api/employee-lactation-periods')
      .qs({ employeeId: fixture!.employee.employeeId, page: 1, limit: 10 })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(lactationRes, assert)
    const lactationRows =
      (lactationRes.body()?.data?.employeeLactationPeriods?.data as Record<string, unknown>[]) ??
      []
    const lactationRow = lactationRows.find(
      (row) => row.employeeLactationPeriodId === extra!.lactation.employeeLactationPeriodId
    )
    assert.exists(lactationRow)
    assert.equal(lactationRow!.employeeLactationPeriodNotes, CLEAR_REMAINING.lactationNotes)

    const traumaRes = await client
      .get(`/api/traumatic-event-reports/${extra!.trauma.traumaticEventReportId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(traumaRes, assert)
    const trauma = traumaRes.body()?.data?.traumaticEventReport as Record<string, unknown>
    assert.equal(trauma.traumaticEventReportInvolvedPeople, CLEAR_REMAINING.traumaPeople)
    assert.equal(trauma.traumaticEventReportDescription, CLEAR_REMAINING.traumaDescription)
  })

  test('CA-4: sin salud las 4 columnas nuevas van tapadas', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['read'])
    await grantModuleAction(actor!.role.roleId, 'traumatic-event-reports', 'read')
    const noteRes = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectMaskedHealth(
      workDisabilityNoteBody(noteRes.body()).workDisabilityNoteDescription,
      assert
    )
    const traumaRes = await client
      .get(`/api/traumatic-event-reports/${extra!.trauma.traumaticEventReportId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const trauma = traumaRes.body()?.data?.traumaticEventReport as Record<string, unknown>
    expectMaskedHealth(trauma.traumaticEventReportInvolvedPeople, assert)
    expectMaskedHealth(trauma.traumaticEventReportDescription, assert)
  })

  test('CA-1: GET biometrics muestra conteo y no el string Finger', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/biometrics`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const biometric = response.body()?.data?.employeeBiometric as Record<string, unknown>
    assert.isArray(biometric.fingers)
    assert.include(biometric.fingers as number[], 1)
    assert.include(biometric.fingers as number[], 4)
    assert.isTrue(Boolean(biometric.face))
    assert.isUndefined(biometric.employeeBiometricData)
    assert.notInclude(JSON.stringify(response.body()), CLEAR_REMAINING.biometricData)
  })

  test('CA-2: getEnrollmentStatus tapa biometricData sin ALS y lo destapa con biometrico', async ({
    assert,
  }) => {
    const service = new EmployeeBiometricService(fakeI18n())
    const masked = await service.getEnrollmentStatus(fixture!.employee.employeeId)
    assert.exists(masked)
    assert.equal(masked!.biometricData, MASK_CHAR.repeat(5))
    assert.include(masked!.fingers, 1)
    assert.isTrue(masked!.face)

    const clear = await SensitiveAccessContext.run(
      { ...allDenied, biometrico: true },
      () => service.getEnrollmentStatus(fixture!.employee.employeeId)
    )
    assert.equal(clear!.biometricData, CLEAR_REMAINING.biometricData)
  })

  test('CA-1: serialize de FaceId tapa token y photoUrl', async ({ assert }) => {
    await extra!.faceId.refresh()
    const masked = extra!.faceId.serialize()
    assert.equal(masked.employeeBiometricFaceIdToken, MASK_CHAR.repeat(5))
    assert.equal(masked.employeeBiometricFaceIdPhotoUrl, MASK_CHAR.repeat(5))
    const clear = SensitiveAccessContext.run({ ...allDenied, biometrico: true }, () =>
      extra!.faceId.serialize()
    )
    assert.equal(clear.employeeBiometricFaceIdToken, CLEAR_REMAINING.faceToken)
    assert.equal(clear.employeeBiometricFaceIdPhotoUrl, CLEAR_REMAINING.facePhotoUrl)
  })

  test('UserConsent.serialize tapa IP y UA sin contacto', async ({ assert }) => {
    if (!extra!.consent) {
      assert.isTrue(true)
      return
    }
    await extra!.consent.refresh()
    const masked = extra!.consent.serialize()
    assert.equal(
      masked.userConsentIp,
      maskSensitiveValue(CLEAR_REMAINING.consentIp, 'contacto')
    )
    assert.equal(
      masked.userConsentUserAgent,
      maskSensitiveValue(CLEAR_REMAINING.consentUa, 'contacto')
    )
    const clear = SensitiveAccessContext.run({ ...allDenied, contacto: true }, () =>
      extra!.consent!.serialize()
    )
    assert.equal(clear.userConsentIp, CLEAR_REMAINING.consentIp)
    assert.equal(clear.userConsentUserAgent, CLEAR_REMAINING.consentUa)
  })
```

Si no hay `LegalDocument`, el test de consentimiento hace `assert.isTrue(true)` y se declara en el PR: “sin legal_documents en el entorno, F.15 no corrió”. No relajar el oráculo cuando el registro sí existe.

- [ ] **Step 2: Run the file**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: cover health masking and biometric enrollment DTO

EOF
)"
```

---

### Task 5: HTTP — CA-5 omitir, CA-6 noMaskChar, teléfonos

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `WorkDisabilityNote.find`, `EmployeeSpouse.find`, `EmployeeEmergencyContact.find`
- Produces: F.10, F.11, F.12, F.16

- [ ] **Step 1: Add write tests**

Al inicio del spec, añadir:

```typescript
import WorkDisabilityNote from '#models/work_disability_note'
import EmployeeSpouse from '#models/employee_spouse'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'
```

```typescript
  test('CA-5: PUT incapacidad sin descripcion responde 200 y no vacia', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .put(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({})
    assert.equal(response.status(), 200)
    const stored = await WorkDisabilityNote.findOrFail(extra!.note.workDisabilityNoteId)
    assert.equal(stored.workDisabilityNoteDescription, CLEAR_REMAINING.disabilityDescription)
  })

  test('CA-6: reenviar MASK_CHAR en descripcion de incapacidad se rechaza', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .put(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ workDisabilityNoteDescription: MASK_CHAR.repeat(5) })
    assert.include([400, 422], response.status())
    const body = JSON.stringify(response.body())
    assert.include(body, 'carácter de máscara')
    const stored = await WorkDisabilityNote.findOrFail(extra!.note.workDisabilityNoteId)
    assert.equal(stored.workDisabilityNoteDescription, CLEAR_REMAINING.disabilityDescription)
  })

  test('CA-9 API: omitir telefono de conyuge y emergencia no lo vacia', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const spouseRes = await client
      .put(`/api/employee-spouses/${extra!.spouse.employeeSpouseId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ employeeSpouseFirstname: 'ConyugeQa' })
    assert.equal(spouseRes.status(), 200)
    const spouseStored = await EmployeeSpouse.findOrFail(extra!.spouse.employeeSpouseId)
    assert.equal(spouseStored.employeeSpousePhone, CLEAR_FIXED.phoneSecondary)

    const emergencyRes = await client
      .put(`/api/employee-emergency-contacts/${extra!.emergency.employeeEmergencyContactId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ employeeEmergencyContactFirstname: 'EmerQa' })
    assert.equal(emergencyRes.status(), 200)
    const emergencyStored = await EmployeeEmergencyContact.findOrFail(
      extra!.emergency.employeeEmergencyContactId
    )
    assert.equal(emergencyStored.employeeEmergencyContactPhone, CLEAR_FIXED.phone)
  })

  test('CREATE de nota de incapacidad sigue exigiendo descripcion', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/work-disability-notes')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ workDisabilityId: extra!.disability.workDisabilityId })
    assert.include([400, 422], response.status())
  })
```

Repetir el cuerpo de CA-6 (reenviar `MASK_CHAR.repeat(5)`) en `employeeSpousePhone`, `employeeEmergencyContactPhone`, `employeeLactationPeriodNotes` (`PUT /api/employee-lactation-periods/:id` con grant `update-information` + `read`) y las dos columnas ATS (`PUT /api/traumatic-event-reports/:id` con `traumatic-event-reports:update`). Mismo criterio: status 400/422, mensaje de máscara, valor en BD intacto.

- [ ] **Step 2: Run the file**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

Expected: PASS. Si Vine usa 422, está bien (`assert.include([400, 422], ...)`). Si responde 200 y guarda `•••••`, **parar**: es corrupción, no relajar.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: reject echoed masks and keep omitted sensitive updates

EOF
)"
```

---

### Task 6: HTTP — revelado CA-7 y CA-8

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `PiiAccessLog`, `SENSITIVE_DATA_READ_ERROR_CODES`
- Produces: F.13, F.14

- [ ] **Step 1: Add reveal tests**

```typescript
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'

  test('CA-7: revelar columna clasificada no revelable es 422 y no escribe bitacora', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const before = await PiiAccessLog.query().where('accessor_user_id', actor!.user.userId).count('* as total')
    const response = await client
      .get(
        `/api/v1/pii/reveal/EmployeeBiometric/employeeBiometricData/${extra!.biometric.employeeBiometricId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.equal(response.status(), 422)
    const body = response.body()
    assert.equal(body.title, 'El dato no se puede revelar por esta vía')
    assert.equal(
      body.detail,
      'Este dato sensible se consulta con el permiso de su categoría; no está disponible en el revelado individual.'
    )
    assert.equal(body.key, 'el-dato-no-se-puede-revelar-por-esta-via')
    assert.equal(body.code, SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE)
    const after = await PiiAccessLog.query().where('accessor_user_id', actor!.user.userId).count('* as total')
    assert.equal(Number(after[0].$extras.total), Number(before[0].$extras.total))
  })

  test('CA-8: revelar par no clasificado es 422 NOT_CLASSIFIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .get(`/api/v1/pii/reveal/Person/personFirstname/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.equal(response.status(), 422)
    const body = response.body()
    assert.equal(body.title, 'El campo solicitado no es un dato sensible')
    assert.equal(body.key, 'el-campo-solicitado-no-es-un-dato-sensible')
    assert.equal(body.code, SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED)
  })
```

Si el count de Lucid no usa `$extras.total`, ajustar al shape real (`count` / `total`) **sin** dejar de asertar que el número no crece.

- [ ] **Step 2: Run the file**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`

Expected: PASS. Envelope 422 es `{title,detail,key,code}` — no el 404 `{type,title,message,data}`. Declarar la dualidad de envelopes en el PR.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: return typed 422s for non-revealable and unclassified PII

EOF
)"
```

---

### Task 7: Vitest BO — CA-9 bindings restantes

**Files:** (repo `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-bo`)
- Modify: `tests/employeeFormTabs/sensitive-category-bindings.spec.ts`
- Create: `tests/traumatic-event-reports/sensitive-health-fields.spec.ts`

**Interfaces:**
- Consumes: el mismo `read()` helper del spec de bindings
- Produces: B.2–B.5

- [ ] **Step 1: Invert spouse/emergency and lactation its**

Reemplazar `'no cablea el teléfono del cónyuge ni el de emergencia'` por:

```typescript
  it('el telefono de emergencia y el de conyuge son campos sensibles de contacto', () => {
    const emergency = read('components/employeeEmergencyContactForm/index.vue')
    const emergencyScript = read('components/employeeEmergencyContactForm/script.ts')
    const person = read('components/employeePersonInfoForm/script.ts')
    const personTpl = read('components/employeePersonInfoForm/index.vue')
    expect(emergencyScript).toContain("useSensitiveCategoryAccess('contacto')")
    expect(emergency).toContain(':can-reveal="false"')
    expect(emergency).toContain('column="employeeEmergencyContactPhone"')
    expect(emergencyScript).toContain('delete payload.employeeEmergencyContactPhone')
    expect(person).toContain("useSensitiveCategoryAccess('contacto')")
    expect(personTpl).toContain('column="employeeSpousePhone"')
    expect(personTpl).toContain(':can-reveal="false"')
  })
```

Reemplazar el it de lactancia (ya sin incapacidad) por:

```typescript
  it('las notas de lactancia se presentan como campo sensible de salud', () => {
    const script = read('components/employeeLactationPeriodInfoForm/script.ts')
    const template = read('components/employeeLactationPeriodInfoForm/index.vue')
    expect(script).toContain("useSensitiveCategoryAccess('salud')")
    expect(template).toContain(':can-reveal="false"')
    expect(template).toContain('column="employeeLactationPeriodNotes"')
    expect(script).not.toContain('notes: null')
  })
```

Añadir al describe de biométricos:

```typescript
  it('no asigna currentPhotoUrl si la URL llega tapada o no hay lectura', () => {
    const script = read('components/employeeBiometricFaceForm/script.ts')
    expect(script).toMatch(/canReadBiometric/)
    expect(script).toMatch(/currentPhotoUrl/)
    expect(script).toMatch(/•|MASK_CHAR|includes\(['"]•['"]\)/)
  })
```

- [ ] **Step 2: Write ATS spec**

Crear `gsti-rh-bo/tests/traumatic-event-reports/sensitive-health-fields.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8')

describe('traumatic event reports — campos de salud', () => {
  it('las dos descripciones son SensitiveField de salud sin revelado', () => {
    const script = read('pages/traumatic-event-reports/script.ts')
    const template = read('pages/traumatic-event-reports/index.vue')
    expect(script).toContain("useSensitiveCategoryAccess('salud')")
    expect(template).toContain('column="traumaticEventReportInvolvedPeople"')
    expect(template).toContain('column="traumaticEventReportDescription"')
    expect(template).toContain(':can-reveal="false"')
    expect(script).toContain('delete payload.traumaticEventReportInvolvedPeople')
    expect(script).toContain('delete payload.traumaticEventReportDescription')
  })
})
```

- [ ] **Step 3: Run Vitest**

Run (en `gsti-rh-bo`):

```bash
npx vitest run tests/employeeFormTabs/sensitive-category-bindings.spec.ts tests/traumatic-event-reports/sensitive-health-fields.spec.ts
```

Expected: PASS. Si un formulario aún no está cableado, **parar** (producto incompleto de Tasks 11–14 del plan de implementación); no relajar el it.

- [ ] **Step 4: Commit** (en `gsti-rh-bo`)

```bash
git add tests/employeeFormTabs/sensitive-category-bindings.spec.ts tests/traumatic-event-reports/sensitive-health-fields.spec.ts
git commit -m "$(cat <<'EOF'
test: bind remaining backoffice surfaces as masked sensitive fields

EOF
)"
```

---

## Spec coverage (auto-revisión)

| Requisito | Task |
|-----------|------|
| CA-1 biométricos conteo + string | 4 (F.7 GET counts, F.8 DTO, F.9 serialize FaceId) |
| CA-2 DTO enrolamiento + RFC empresa | 3 (F.5–F.6), 4 (F.8) |
| CA-3 importes `null` | 3 (F.3–F.4) |
| CA-4 seis columnas de salud | 4 (F.1–F.2) |
| CA-5 PUT sin descripción | 5 (F.10) |
| CA-6 noMaskChar | 5 (F.11) |
| CA-7 / CA-8 revelado 422 | 6 |
| CA-9 BO no reenvía | 5 (API omit) + 7 (Vitest) |
| CREATE incapacidad sigue requerida | 5 (F.16) |
| `categoryOf` 15 | 1 |
| `TenantBillingProfile.rfc` fuera | 1 (clasificado, sin serialize HTTP) |
| Dual envelope + bitácora | 6 + nota de PR |
| Socket / S3 face GET | Fuera a propósito (ALS + serialize) |

**Huecos conscientes (no son tasks de este plan):** Playwright de las 5 pantallas; HTTP del proxy `employeeBiometricFaceIdPhotoUrlProxy`; interruptor ON; `Employee.dailySalary`.
