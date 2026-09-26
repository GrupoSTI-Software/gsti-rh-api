# Escenarios de prueba — USRH1785766406727

Exigir permiso en escritura de Zonas, Anotaciones, Bonificaciones, Responsable/Asignados y Activos.

**Enfoque:** las 21 operaciones de escritura de este tramo declaran `permissionGate` en el servidor. La historia se entrega con la exigencia del módulo Empleados **apagada**. Encenderla es solo para ambiente de prueba.

**Capas:** unit (Japa, sin HTTP), functional (Japa HTTP = e2e API automatizado de este repositorio), e2e API (ambiente de prueba, mismas rutas), e2e backoffice (pantalla; esta historia no cambia UI).

**Plan de implementación:** `docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate.md`

---

## Contratos fijos (todas las capas)

### Negativa del gate (regla 15)

HTTP `403`:

```json
{
  "title": "Sin permiso",
  "detail": "No tienes permiso para realizar esta operación.",
  "key": "PERM.DENIED"
}
```

No se usa otra clave, título ni detalle. `PERM.UNRESOLVED` solo si no se puede resolver el rol (pieza de orden 3; no se reescribe aquí).

### Autoría de anotaciones (regla 3)

HTTP `403` del controlador, **no** del gate:

```json
{
  "message": "Only the original creator can update this annotation"
}
```

`key` distinto de `PERM.DENIED` (o ausente). Conservar tal cual.

### Interruptor

`system_modules.system_module_permission_enforcement_active` del módulo `employees`.

| Estado | Qué comprueba |
|--------|----------------|
| OFF (entrega) | Nadie nota el cambio. Las 21 escrituras se ejecutan como hoy. |
| ON (solo prueba) | El servidor niega si falta el permiso. |

Tras cualquier suite ON, el interruptor debe volver a `false`.

### Nombres en Roles y permisos

| Slug | Etiqueta en matriz | Sección |
|------|--------------------|---------|
| `tab-zonas-write` | Modificar Zonas | Zonas |
| `tab-zonas-delete` | Eliminar Zonas | Zonas |
| `tab-anotaciones-write` | Modificar Anotaciones | Anotaciones |
| `tab-anotaciones-delete` | Eliminar Anotaciones | Anotaciones |
| `tab-trabajo-write` | Modificar Trabajo | Trabajo |
| `tab-trabajo-delete` | Eliminar Trabajo | Trabajo |
| `manage-responsible-edit` | Administrar responsable asignado | Responsable |
| `manage-assigned-edit` | Administrar colaboradores asignados | Asignados |
| `manage-employee-supplies` | Administrar suministros del colaborador | Expediente |
| `tab-expediente-write` | Modificar Expediente | Expediente |
| `manage-files` | Administrar archivos del expediente | Expediente |
| `manage-responsible-read` | Consultar responsable asignado | Responsable |
| `manage-assigned-read` | Consultar colaboradores asignados | Asignados |

`tab-responsable-write` / `tab-asignados-write` **no** gobiernan estas escrituras. `full-employee-assigned` es de alcance de lectura y no participa.

### Las 21 operaciones

| # | Operación | Método y ruta | Permiso |
|---|-----------|---------------|---------|
| 1 | Asignar zona | `POST /api/employee-zones` | `tab-zonas-write` |
| 2 | Modificar zona | `PUT /api/employee-zones/:employeeZoneId` | `tab-zonas-write` |
| 3 | Quitar zona | `DELETE /api/employee-zones/:employeeZoneId` | `tab-zonas-delete` |
| 4 | Agregar anotación | `POST /api/employee-annotations` | `tab-anotaciones-write` |
| 5 | Corregir anotación | `PUT /api/employee-annotations/:employeeAnnotationId` | `tab-anotaciones-write` |
| 6 | Eliminar anotación | `DELETE /api/employee-annotations/:employeeAnnotationId` | `tab-anotaciones-delete` |
| 7 | Registrar bonificación | `POST /api/employee-bonuses` | `tab-trabajo-write` |
| 8 | Modificar bonificación | `PUT /api/employee-bonuses/:employeeBonusId` | `tab-trabajo-write` |
| 9 | Eliminar bonificación | `DELETE /api/employee-bonuses/:employeeBonusId` | `tab-trabajo-delete` |
| 10 | Crear asignación responsable | `POST /api/user-responsible-employees` | `manage-responsible-edit` **o** `manage-assigned-edit` |
| 11 | Modificar asignación | `PUT /api/user-responsible-employees/:userResponsibleEmployeeId` | igual OR |
| 12 | Eliminar asignación | `DELETE /api/user-responsible-employees/:userResponsibleEmployeeId` | igual OR |
| 13 | Registrar entrega de activo | `POST /api/employee-supplies` | `manage-employee-supplies` |
| 14 | Modificar asignación | `PUT /api/employee-supplies/:id` | `manage-employee-supplies` |
| 15 | Registrar retiro/devolución | `POST /api/employee-supplies/:id/retire` | `manage-employee-supplies` |
| 16 | Eliminar asignación | `DELETE /api/employee-supplies/:id` | `manage-employee-supplies` |
| 17 | Registrar contrato de resguardo | `POST /api/employee-supplies-response-contracts` | `manage-employee-supplies` |
| 18 | Eliminar contrato | `DELETE /api/employee-supplies-response-contracts/:id` | `manage-employee-supplies` |
| 19 | Foto de entrega | `POST /api/employee-supply-assignation-photos/:employeeSupplyId/assignation` | `manage-employee-supplies` |
| 20 | Foto de devolución | `POST /api/employee-supply-assignation-photos/:employeeSupplyId/return` | `manage-employee-supplies` |
| 21 | Eliminar fotografía | `DELETE /api/employee-supply-assignation-photos/:photoId` | `manage-employee-supplies` |

Lecturas (GET de las mismas familias) y catálogos (`/api/zones`, `/api/supplies`, `/api/supply-types`) **no** declaran gate.

### Actores

| Id | Quién | Grants de Empleados |
|----|-------|---------------------|
| A0 | Rol de cliente sin permisos de este tramo | ninguno |
| A1 | Solo zonas escritura | `tab-zonas-write` |
| A2 | Solo zonas eliminación | `tab-zonas-delete` |
| A3 | Solo anotaciones escritura | `tab-anotaciones-write` |
| A4 | Solo anotaciones eliminación | `tab-anotaciones-delete` |
| A5 | Solo Trabajo escritura | `tab-trabajo-write` |
| A6 | Solo Trabajo eliminación | `tab-trabajo-delete` |
| A7 | Solo administrar responsable | `manage-responsible-edit` |
| A8 | Solo administrar asignados | `manage-assigned-edit` |
| A9 | Solo consultar responsable y asignados | `manage-responsible-read`, `manage-assigned-read` |
| A10 | Expediente + archivos, sin suministros | `tab-expediente-write`, `manage-files` |
| A11 | Solo suministros | `manage-employee-supplies` |
| A12 | Dueño de la empresa | slug `owner` (bypass `standard`) |
| A13 | Administración de plataforma | slug `root` (bypass `standard`) |
| A14 | Dirección general del cliente | slug `super-administrador` (sin bypass) |
| A15 | Sesión no iniciada | — |

Todas las peticiones autenticadas llevan `X-Business-Unit-Id` salvo las 3 de fotografías (hoy no tienen `businessScope`; no se corrige aquí).

---

## 1. Unit

Automatizado. No requiere interruptor ON/OFF: no hay HTTP.

Archivos:

- `tests/unit/constants/employees_permission_catalog_granular.spec.ts`
- `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts`
- `tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts`
- `tests/unit/services/permission_gate_service.spec.ts`
- `tests/unit/constants/employees_write_permission_declarations.spec.ts`
- `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| U.1 | Catálogo declara `manage-employee-supplies` | `displayName` = `Administrar suministros del colaborador`; `kind` = `write`; `section` = `expediente`; `exceptionProfile` = `standard`; sin `legacyEquivalence`; sin `exemption`. Distinto de `tab-expediente-write` y de `manage-files`. |
| U.2 | El slug compila como `EmployeeActionSlug` | `npx tsc --noEmit` acepta `const suppliesSlug: EmployeeActionSlug = 'manage-employee-supplies'`. |
| U.3 | Sync materializa y no concede | `SystemPermissionCatalogSyncService.sync()` deja una fila en `system_permissions` del módulo `employees` y **cero** filas nuevas en `role_system_permissions` para ese permiso. |
| U.4 | OR: basta el primero | `evaluate(..., { action: ['read', 'write'], bypass: 'strict' })` con solo `write` concedido → `{ allowed: true, reason: 'granted' }`. |
| U.5 | OR: basta el segundo | `action: ['write', 'read']` con solo `read` concedido → `granted`. |
| U.6 | OR: ninguno | `action: ['missing-a', 'missing-b']` → `{ allowed: false, reason: 'denied' }`. |
| U.7 | OR: interruptor apagado | `evaluate(null, { action: ['read', 'write'], bypass: 'strict' })` con exigencia OFF → `{ allowed: true, reason: 'module-not-enforced' }`. |
| U.8 | Mapa tiene 147 claves | Todas `module: 'employees'`, `bypass: 'standard'`. Cada `action` (string o lista) existe en `EMPLOYEES_PERMISSION_CATALOG`. |
| U.9 | Mapeo de las 21 | Coincide con la tabla de operaciones de arriba (OR como `['manage-responsible-edit', 'manage-assigned-edit']` en #10–12). |
| U.10 | Zonas: 3 gates en escrituras, 0 en GET | `employee_zone_routes.ts` declara exactamente 3 `permissionGate(...)`. GET `/:employeeZoneId` sin gate. |
| U.11 | Catálogo `/api/zones` sin gate | `zone_routes.ts` no menciona `permissionGate` ni el mapa de Empleados. |
| U.12 | Anotaciones: 3 gates, GET sin gate | POST/PUT/DELETE con declaración; GET `/`, `/employee/:employeeId`, `/:id` sin gate. |
| U.13 | Autoría intacta en controlador | `employee_annotation_controller.ts` conserva `Only the original creator can update this annotation` y `currentEmployeeAnnotation.userId !== user.userId`. |
| U.14 | Bonificaciones: 3 gates de Trabajo | POST/PUT/DELETE con `create/update/deleteEmployeeBonus`. GET `/`, `/concepts/:employeeId`, `/:id` sin gate. |
| U.15 | Responsable: un solo gate por escritura | Exactamente 3 `permissionGate`. No existe `permissionGateAnyOf`. GET `/:id` sin gate. |
| U.16 | Activos asignación: 4 gates | store/update/retire/destroy. GET index/show/with-relations/by-employee/active-by-employee sin gate. |
| U.17 | Catálogos de insumos sin gate | `supplies.ts` y `supply_type.ts` no declaran `permissionGate`. |
| U.18 | Contratos: 2 gates | POST y DELETE. GET index/show/by-uuid sin gate. |
| U.19 | Fotos: 3 gates y sin `businessScope` nuevo | POST assignation, POST return, DELETE. GET assignation/return sin gate. El archivo **no** agrega `businessScope` (orden 1). Si el merge de orden 1 ya lo puso, no revertirlo. |

```bash
node ace test tests/unit/constants/employees_permission_catalog_granular.spec.ts
node ace test tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts
node ace test tests/unit/services/permission_gate_service.spec.ts
node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts
node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts
npx tsc --noEmit
```

---

## 2. Functional (e2e API automatizado)

Japa pega HTTP real contra la app. Este es el e2e API de CI.

Archivo: `tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts`

Assert de negativa: status `403`, `key === 'PERM.DENIED'`, `title === 'Sin permiso'`.
Assert de éxito: status 2xx **y** el efecto persiste en BD (no basta “no es PERM.DENIED”).

### 2.A Exigencia OFF

| # | Escenario | Actor | Criterio de éxito |
|---|-----------|-------|-------------------|
| F-OFF.1 | Las 21 escrituras sin grants | A0 | Cada una responde 2xx. Zona, anotación, bono, asignación, activo, contrato y fotos quedan persistidos. PUT cambia el registro. DELETE/retire deja el registro inactivo o ausente según la operación vigente. No aparece `PERM.DENIED`. |
| F-OFF.2 | Interruptor queda apagado al terminar | — | `system_module_permission_enforcement_active` de `employees` es `false` tras el teardown. |

Cuerpos mínimos (los mismos en OFF y ON):

- Zona: `{ employeeId, zoneId }`
- Anotación: `{ employeeId, employeeAnnotationContent }`
- Bono: `{ employeeId, employeeBonusConcept, employeeBonusQuantity, employeeBonusUnitAmount, employeeBonusTotal, employeeBonusAssignmentDate, employeeBonusPaymentDate }`
- Responsable: `{ userId, employeeId, userResponsibleEmployeeReadonly: 0, userResponsibleEmployeeDirectBoss: 0 }`
- Activo: `{ employeeId, supplyId, employeeSupplyAssignamentDate }`
- Retiro: `{ employeeSupplyRetirementReason }`
- Contrato: multipart `employeeSupplyIds` (JSON array) + `file`
- Foto: multipart `photos` (PNG 1×1)

### 2.B Exigencia ON — cobertura de las 21

| # | Escenario | Actor | Criterio de éxito |
|---|-----------|-------|-------------------|
| F-ON.1 | Las 21 sin grants | A0 | Cada una responde `PERM.DENIED`. Filas previas (zona, anotación, bono, asignación, activo, contrato, foto) permanecen. No se crea bono ni zona nueva. Foto de evidencia: el conteo de `employee_supplie_assignation_photos` no sube. |
| F-ON.2 | Zonas sí, bonificaciones no | A1 | `POST` zona 2xx y fila persistida. `POST` bono `PERM.DENIED` y cero filas en `employee_bonuses` de ese colaborador. |
| F-ON.3 | Zonas: write ≠ delete | A1 luego A2 | Con `tab-zonas-write`: POST y PUT 2xx; DELETE `PERM.DENIED` y la zona sigue. Con `tab-zonas-delete`: DELETE 2xx y la zona ya no está activa. |
| F-ON.4 | Anotaciones: write ≠ delete | A3 luego A4 | POST y PUT (propia) 2xx; DELETE `PERM.DENIED` y la nota sigue. Con delete: DELETE 2xx (`employeeAnnotationActive = 0`). |
| F-ON.5 | Autoría convive con el gate | A3 + otro A3 | B corrige la nota de A → 403 con `message: 'Only the original creator can update this annotation'` y `key !== 'PERM.DENIED'`. A corrige la suya → 2xx. |
| F-ON.6 | Borrar anotación ajena | A4 | DELETE de nota de otro usuario → 2xx. No hay regla de autoría en delete. |
| F-ON.7 | Bonificaciones: write ≠ delete | A5 luego A6 | Con `tab-trabajo-write`: POST y PUT 2xx; DELETE `PERM.DENIED` y el bono sigue. Con `tab-trabajo-delete`: DELETE 2xx. |
| F-ON.8 | OR responsable: basta A7 | A7 | POST, PUT y DELETE de `/api/user-responsible-employees` 2xx. |
| F-ON.9 | OR asignados: basta A8 | A8 | Las mismas tres operaciones 2xx. |
| F-ON.10 | OR: sin ninguno | A0 | POST/PUT/DELETE `PERM.DENIED`. La asignación vigente no cambia. |
| F-ON.11 | Consultar no otorga administrar | A9 | POST/PUT/DELETE de responsable `PERM.DENIED`. Las asignaciones vigentes no cambian. |
| F-ON.12 | Expediente no abre suministros | A10 | `POST /api/employee-supplies` → `PERM.DENIED`, no crea asignación. `POST .../assignation` (foto) → `PERM.DENIED` y el conteo de fotos no sube. |
| F-ON.13 | Foto rechazada no se almacena | A10 (o A0) | Tras 403 de foto de entrega, cero filas nuevas en `employee_supplie_assignation_photos`. El controlador no corre: no hay objeto en almacenamiento. |
| F-ON.14 | Un permiso para las 9 de activos | A11 | POST asignación, PUT, POST retire, POST contrato, DELETE contrato, POST foto entrega, POST foto devolución, DELETE foto, DELETE asignación: las 9 2xx y cada efecto persiste. |
| F-ON.15 | GET de las mismas familias sin permiso de escritura | A0 | GET zona/anotación/bono/responsable/activo/contrato/foto **no** responden `PERM.DENIED` (lecturas son orden 15). |
| F-ON.16 | Catálogos de empresa | A0 | `GET /api/zones`, `GET /api/supplies`, `GET /api/supply-types` no responden `PERM.DENIED`. |
| F-ON.17 | Sin sesión | A15 | Las 21 responden 401 (o el 401 vigente de `auth()`), no `PERM.DENIED`. El permiso se suma a la sesión; no la reemplaza. |
| F-ON.18 | `full-employee-assigned` no abre escritura | Rol con solo ese slug | POST zona y POST bono → `PERM.DENIED`. |

### 2.C Bypass (exigencia ON)

| # | Escenario | Actor | Criterio de éxito |
|---|-----------|-------|-------------------|
| F-BY.1 | Owner y root sin grants | A12, A13 | Tras vaciar grants de Empleados: POST zona y POST bono 2xx. |
| F-BY.2 | Dirección general sin grants | A14 | POST zona → `PERM.DENIED`. Sin concesión no hay paso libre. |
| F-BY.3 | Teardown restaura exigencia | — | Interruptor de `employees` queda `false`. Grants de owner/root restaurados. |

### Comandos

```bash
node ace test tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts
```

**Huecos respecto al spec funcional ya escrito:** F-ON.7, F-ON.11, F-ON.15, F-ON.16, F-ON.17 y F-ON.18. Añadirlos al mismo archivo en el mismo grupo ON (mismos helpers `grantOnly`, `assertPermissionDenied`, `assertSuccess`, teardown que apaga el interruptor). No crear un segundo spec.

Código de los huecos (pegar en el grupo ON, reutilizando `actor`, `fixture`, `zones`, `supplies`):

```typescript
  test('tab-trabajo-write permite POST y PUT de bono, DELETE exige tab-trabajo-delete', async ({
    client,
    assert,
  }) => {
    const employeeId = fixture!.employee.employeeId
    await grantOnly(actor!.role.roleId, ['tab-trabajo-write'])
    const created = await client
      .post('/api/employee-bonuses')
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json(bonusPayload(employeeId))
    assertSuccess(assert, created)
    const bonus = await EmployeeBonus.query()
      .where('employee_id', employeeId)
      .whereNull('employee_bonus_deleted_at')
      .firstOrFail()
    const updated = await client
      .put(`/api/employee-bonuses/${bonus.employeeBonusId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ ...bonusPayload(employeeId), employeeBonusConcept: 'Bono corregido ON' })
    assertSuccess(assert, updated)
    const denied = await client
      .delete(`/api/employee-bonuses/${bonus.employeeBonusId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertPermissionDenied(assert, denied)
    assert.isNotNull(
      await EmployeeBonus.query()
        .where('employee_bonus_id', bonus.employeeBonusId)
        .whereNull('employee_bonus_deleted_at')
        .first()
    )
    await grantOnly(actor!.role.roleId, ['tab-trabajo-delete'])
    const deleted = await client
      .delete(`/api/employee-bonuses/${bonus.employeeBonusId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertSuccess(assert, deleted)
    assert.isNull(
      await EmployeeBonus.query()
        .where('employee_bonus_id', bonus.employeeBonusId)
        .whereNull('employee_bonus_deleted_at')
        .first()
    )
  })

  test('consultar responsable o asignados no permite escribir la asignación', async ({
    client,
    assert,
  }) => {
    const employeeId = fixture!.employee.employeeId
    await grantOnly(actor!.role.roleId, ['manage-responsible-read', 'manage-assigned-read'])
    const existing = await UserResponsibleEmployee.create(
      responsiblePayload(employeeId, actor!.user.userId)
    )
    const deniedPost = await client
      .post('/api/user-responsible-employees')
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json(responsiblePayload(employeeId, actor!.user.userId))
    const deniedPut = await client
      .put(`/api/user-responsible-employees/${existing.userResponsibleEmployeeId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json(responsiblePayload(employeeId, actor!.user.userId, 1))
    const deniedDelete = await client
      .delete(`/api/user-responsible-employees/${existing.userResponsibleEmployeeId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertPermissionDenied(assert, deniedPost)
    assertPermissionDenied(assert, deniedPut)
    assertPermissionDenied(assert, deniedDelete)
    assert.isNotNull(
      await UserResponsibleEmployee.query()
        .where('user_responsible_employee_id', existing.userResponsibleEmployeeId)
        .whereNull('user_responsible_employee_deleted_at')
        .first()
    )
  })

  test('GET de las mismas familias sin permiso de escritura no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const employeeId = fixture!.employee.employeeId
    const zone = await createZoneFixture('on-get')
    zones.push(zone)
    const employeeZone = await EmployeeZone.create({ employeeId, zoneId: zone.zoneId })
    const annotation = await EmployeeAnnotation.create({
      employeeId,
      employeeAnnotationContent: 'Nota GET',
      employeeAnnotationActive: true,
      userId: actor!.user.userId,
    })
    const bonus = await EmployeeBonus.create({
      ...bonusPayload(employeeId),
      employeeBonusAssignmentDate: DateTime.fromISO('2027-08-01'),
      employeeBonusPaymentDate: DateTime.fromISO('2027-08-15'),
    })
    const responsible = await UserResponsibleEmployee.create(
      responsiblePayload(employeeId, actor!.user.userId)
    )
    const supplyFixture = await createSupplyFixture('on-get')
    supplies.push(supplyFixture)
    const supply = await EmployeeSupplie.create({
      employeeId,
      supplyId: supplyFixture.supply.supplyId,
      employeeSupplyStatus: 'active',
      employeeSupplyAssignamentDate: DateTime.now(),
    })
    const reads = [
      client.get(`/api/employee-zones/${employeeZone.employeeZoneId}`).loginAs(actor!.user).headers(buHeader(actor!)),
      client.get(`/api/employee-annotations/${annotation.employeeAnnotationId}`).loginAs(actor!.user).headers(buHeader(actor!)),
      client.get(`/api/employee-bonuses/${bonus.employeeBonusId}`).loginAs(actor!.user).headers(buHeader(actor!)),
      client
        .get(`/api/user-responsible-employees/${responsible.userResponsibleEmployeeId}`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!)),
      client.get(`/api/employee-supplies/${supply.employeeSupplyId}`).loginAs(actor!.user).headers(buHeader(actor!)),
    ]
    for (const pending of reads) {
      const response = await pending
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
    }
  })

  test('catálogos de zonas e insumos no responden PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    for (const path of ['/api/zones', '/api/supplies', '/api/supply-types']) {
      const response = await client.get(path).loginAs(actor!.user).headers(buHeader(actor!))
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
    }
  })

  test('sin sesión las escrituras no responden PERM.DENIED', async ({ client, assert }) => {
    const response = await client.post('/api/employee-zones').json({ employeeId: 1, zoneId: 1 })
    assert.equal(response.status(), 401)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
```

`full-employee-assigned` (F-ON.18): mismo patrón que F-ON.11 con `grantOnly(actor!.role.roleId, ['full-employee-assigned'])` y `POST` zona + `POST` bono → `PERM.DENIED`.

---

## 3. E2E API (ambiente de prueba)

Misma matriz que Functional, contra el ambiente (no Japa). Encender y apagar el interruptor **a mano** y dejarlo apagado al terminar.

Preparación:

1. Sincronizar catálogo (el deploy ya corre `SystemPermissionCatalogSyncService`; verificar fila `manage-employee-supplies` en módulo `employees`).
2. Crear los actores A0–A14 en Roles y permisos. No conceder `manage-employee-supplies` a ningún rol de producción (D-03).
3. Tener un colaborador de prueba, una zona, un insumo activo, y (para fotos/contratos) un PNG pequeño.

Login: `POST /api/login` (o el flujo vigente). Luego las 21 rutas con `Authorization` + `X-Business-Unit-Id`.

### 3.A Interruptor OFF

| # | Escenario | Actor | Criterio de éxito |
|---|-----------|-------|-------------------|
| E-API-OFF.1 | Integración sin cambio percibido | A0 | Recorrer las 21 operaciones. Todas 2xx (o el error de negocio vigente, nunca `PERM.DENIED`). El colaborador queda con zona, nota, bono, responsable y activo+foto+contrato según se haya ejecutado. |
| E-API-OFF.2 | Owner / root / dirección | A12, A13, A14 | Igual que hoy: las 21 pasan. Dirección general **todavía** tiene paso libre porque el interruptor está apagado. |
| E-API-OFF.3 | Foto se almacena | A0 | POST foto de entrega 2xx; GET de esa foto devuelve la imagen. |

Si E-API-OFF.1 falla con `PERM.DENIED`, el interruptor se encendió por error o hay un gate mal puesto. No seguir con ON hasta corregirlo.

### 3.B Interruptor ON

Encender exigencia de `employees` **solo** en el ambiente de prueba.

| # | Escenario | Actor | Criterio de éxito |
|---|-----------|-------|-------------------|
| E-API-ON.1 | Hueco cerrado: las 21 sin permiso | A0 | Las 21 → 403 `PERM.DENIED`. Expediente sin cambios parciales. |
| E-API-ON.2 | Separación zonas vs dinero | A1 | Asigna zona (2xx). Registra bono (403, sin fila). |
| E-API-ON.3 | Separación write/delete zonas | A1, A2 | A1 no borra zona. A2 sí. |
| E-API-ON.4 | Separación write/delete anotaciones | A3, A4 | A3 crea y corrige la propia; no borra. A4 borra (incluida ajena). |
| E-API-ON.5 | Autoría | dos A3 | El no-autor recibe el mensaje de siempre, no `PERM.DENIED`. |
| E-API-ON.6 | Bonificaciones = Trabajo | A5, A6 | A5 registra y modifica; no elimina. A6 elimina. Quien “Modificar Trabajo” registra bonos (decisión Wilvardo). |
| E-API-ON.7 | OR responsable/asignados | A7, A8, A0, A9 | A7 y A8 hacen las 3 operaciones. A0 y A9 reciben 403; la asignación vigente no cambia. |
| E-API-ON.8 | Suministros independientes del Expediente | A10 | Alta de activo y foto → 403. Cero fotos nuevas. |
| E-API-ON.9 | Ciclo del activo con un permiso | A11 | Las 9 operaciones 2xx. |
| E-API-ON.10 | Bypass | A12, A13, A14 | Owner y root sin grants: 2xx. Dirección general sin grants: 403. |
| E-API-ON.11 | Lecturas y catálogos | A0 | GET de secciones y catálogos no dan `PERM.DENIED`. |
| E-API-ON.12 | Apagar al terminar | — | Interruptor de `employees` queda `false`. Verificar con E-API-OFF.1 de nuevo. |

Petición de foto denegada (E-API-ON.8): adjuntar PNG. Tras 403, GET de fotos de esa asignación no lista un archivo nuevo y el bucket/disco no tiene objeto extra.

---

## 4. E2E backoffice

Esta historia **no cambia pantalla** (orden 20 oculta pestañas/botones; orden 23 rediseña la matriz). El backoffice ya consulta `manage-responsible-*` y `manage-assigned-*` para dibujar botones. Zonas, Anotaciones, Bonificaciones y Activos pueden seguir mostrando botones aunque el servidor ya niegue.

Árbol de sesión: `GET /api/session/permissions` (badge del módulo Empleados: “Solo declarada” mientras el interruptor esté apagado).

### 4.A Interruptor OFF (entrega)

| # | Escenario | Actor | Dónde | Criterio de éxito |
|---|-----------|-------|-------|-------------------|
| E-BO-OFF.1 | Nadie nota el cambio | usuario que hoy opera el expediente | Pestañas Zonas, Anotaciones, Responsable, Asignados; ventana de Bonificaciones del calendario; módulo Activos | Asignar zona, anotar, registrar bono, cambiar responsable, entregar activo con foto y contrato: mismo flujo, mismo resultado. Sin toast de “Sin permiso”. |
| E-BO-OFF.2 | Matriz muestra el permiso nuevo | quien edita roles | Roles y permisos → Empleados → Expediente | Aparece **Administrar suministros del colaborador** como acción independiente. No viene marcada en ningún rol de cliente (D-03). No está bajo el módulo Activos del menú. |
| E-BO-OFF.3 | Matriz no inventa sección de bonos | quien edita roles | Empleados → Trabajo | No hay sección “Bonificaciones”. Quien configure roles ve **Modificar Trabajo** / **Eliminar Trabajo**. |
| E-BO-OFF.4 | Responsable/Asignados siguen ocultando botones | A9 (solo consultar) | Pestañas Responsable y Asignados | Botones de administrar ocultos (conducta vigente del BO). Con interruptor OFF, si se fuerza la API igual pasa (E-API-OFF.1). |
| E-BO-OFF.5 | Dueño y dirección | A12, A14 | Las 5 superficies | Siguen operando como hoy. |
| E-BO-OFF.6 | Badge de exigencia | cualquier rol con acceso a Roles | Módulo Empleados | “Solo declarada” / equivalente vigente. No se puede encender desde esta pantalla. |

### 4.B Interruptor ON (solo prueba; hueco de UI hasta orden 20)

Aviso previo: dirección general (A14) pierde el paso libre.

| # | Escenario | Actor | Dónde | Criterio de éxito |
|---|-----------|-------|-------|-------------------|
| E-BO-ON.1 | Zonas sí, bono no | A1 | Expediente → Zonas, luego calendario → Bonificaciones | Asignar zona guarda. Registrar bono: el servidor responde 403 `Sin permiso` / `PERM.DENIED`. No queda bono. Si el botón de bono sigue visible, es el hueco de orden 20, no un fallo de esta historia. |
| E-BO-ON.2 | Anotaciones write sin delete | A3 | Pestaña Anotaciones | Agregar y corregir la propia funciona. Eliminar muestra 403 y la nota permanece. |
| E-BO-ON.3 | Autoría en UI | dos A3 | Anotaciones | Corregir nota ajena: el mensaje de siempre (autoría), no el del gate. |
| E-BO-ON.4 | Responsable: BO oculta, API acepta OR | A7 | Pestaña Responsable vs Asignados | A7 ve botones de administrar en Responsable (BO vigente). Puede cambiar responsable. En Asignados el BO puede ocultar botones; si dispara la misma API (o se prueba por API), pasa por regla 5. |
| E-BO-ON.5 | Asignados simétrico | A8 | Igual | Basta `Administrar colaboradores asignados`. |
| E-BO-ON.6 | Sin ninguno de los dos | A0 o A9 | Ambas pestañas | BO oculta administrar. Forzar API → 403; asignaciones vigentes intactas. |
| E-BO-ON.7 | Activos sin permiso propio | A10 | Módulo Activos | Entregar herramienta con foto: 403, no se crea asignación, la foto no queda. Tener Expediente/archivos no abre suministros. |
| E-BO-ON.8 | Activos con permiso propio | A11 | Módulo Activos | Ciclo completo con un solo permiso: alta, edición, retiro, baja, contrato, fotos. |
| E-BO-ON.9 | Dueño sigue | A12 | Las 5 superficies | Opera las 21 sin concesión explícita. |
| E-BO-ON.10 | Dirección general ya no | A14 | Zonas (mínimo) | Sin concesión: 403. Hay que avisarlo antes de encender en un ambiente compartido. |
| E-BO-ON.11 | Árbol de sesión refleja grants | A11 | `GET /api/session/permissions` | Incluye `manage-employee-supplies` concedido. A10 no lo incluye. |
| E-BO-ON.12 | Restaurar OFF | — | — | Apagar exigencia. Repetir E-BO-OFF.1. |

---

## 5. Lo que no debe pasar

| # | Falla | Cómo se ve |
|---|-------|------------|
| X.1 | Una de las 21 escrituras sin gate | Con ON y A0 esa ruta no da `PERM.DENIED`. |
| X.2 | Foto almacenada tras 403 | Fila nueva en `employee_supplie_assignation_photos` o objeto en almacenamiento. |
| X.3 | Escritura parcial | Zona guardada y bono guardado cuando el bono debía negarse; o asignación creada cuando la foto se negó en el mismo movimiento de UI (el alta HTTP y la foto son dos peticiones: cada una se niega por separado). |
| X.4 | Autoría diagnosticada como gate | Corregir nota ajena devuelve `PERM.DENIED` en vez del mensaje de siempre. |
| X.5 | Delete de anotación ajena bloqueado por autoría | Esta historia no agrega esa regla. |
| X.6 | OR convertido en AND | Quien solo tiene `manage-responsible-edit` recibe 403 en la asignación. |
| X.7 | Dos gates apilados | AND accidental. El unit U.15 exige un solo `permissionGate` por ruta. |
| X.8 | Expediente concede suministros | A10 entrega activos. |
| X.9 | Permiso nuevo concedido a roles en el sync | U.3 falla; viola D-03. |
| X.10 | Interruptor queda encendido | Tras tests, clientes de prueba pierden acceso. Teardown obligatorio. |
| X.11 | Dirección general con bypass | A14 sin grants pasa las 21 con ON. |
| X.12 | Gate en GET o catálogos | Lecturas o `/api/zones` / `/api/supplies` dan `PERM.DENIED`. |
| X.13 | `businessScope` agregado en fotos | Conflicto con orden 1. U.19. |
| X.14 | Entrega con exigencia ON | Viola regla 9 / D-09. |

---

## 6. Fuera de alcance (no fallar estos)

| Tema | Historia |
|------|----------|
| Lectura de pestañas (incluidos `manage-responsible-read` / `manage-assigned-read` en GET) | USRH1785766406733 orden 15 |
| Lectura de listado y catálogos como permiso de Empleados | USRH1785766406734 orden 16 |
| Descargables | USRH1785766406735 orden 17 |
| Ocultar pestañas/botones de Zonas, Anotaciones, Bonos, Activos | USRH1785766406738 orden 20 |
| Acciones globales del listado | USRH1785766406739 orden 21 |
| Árbol de roles (salvo que el permiso nuevo se liste) | USRH1785766406741 orden 23 |
| Presets | USRH1785766406742 orden 24 |
| `businessScope` en fotos de activos | USRH1785766406719 orden 1 |
| Catálogos de zonas/insumos como entidad de empresa | no es este tramo |
| Bitácora de denegaciones | fuera por decisión de dirección |
| App/portal del colaborador escribiendo estos endpoints | barrido D-08; si aparece escritura, marcar exenta |

Hasta orden 20, con exigencia ON es esperado que el backoffice muestre botones de Zonas/Anotaciones/Bonos/Activos que el servidor rechaza. Eso no es falla de esta historia.

---

## Prioridad

| Prioridad | Escenarios | Razón |
|-----------|------------|--------|
| Alta | F-OFF.1, E-API-OFF.1, E-BO-OFF.1 | Entrega sin cambio percibido |
| Alta | F-ON.1, E-API-ON.1 | Las 21 cerradas |
| Alta | F-ON.2, F-ON.12, F-ON.13, E-API-ON.8, E-BO-ON.7 | Dinero, deslinde y foto no almacenada |
| Alta | F-ON.8–F-ON.11, E-API-ON.7 | OR y consultar ≠ administrar |
| Alta | F-ON.5, E-API-ON.5, E-BO-ON.3 | Autoría no se diagnostica como gate |
| Alta | F-BY.1, F-BY.2, E-API-ON.10, E-BO-ON.9–10 | Bypass y dirección general |
| Media | F-ON.3, F-ON.4, F-ON.7 | Write ≠ delete |
| Media | F-ON.14, E-API-ON.9, E-BO-ON.8 | Ciclo del activo |
| Media | U.1–U.19 | Regresión de declaración |
| Media | F-ON.15–F-ON.17, E-API-ON.11 | No romper lecturas ni auth |
| Baja | E-BO-OFF.2, E-BO-OFF.3, E-BO-ON.11 | Matriz y árbol de sesión |
| Baja | F-ON.18 | `full-employee-assigned` no participa |

---

## Notas para testers

- Encender exigencia es decisión de negocio con fecha (regla 10), no un paso de esta historia. En prueba: un `UPDATE` al flag del módulo `employees`, nunca en producción.
- Sin bitácora de denegaciones: un “no me deja” se diagnostica revisando el rol a mano.
- Bonificaciones viven en **Modificar Trabajo** / **Eliminar Trabajo**. Decirlo al configurar roles.
- Suministros: permiso propio bajo Expediente, independiente de “Modificar Expediente” y de “Administrar archivos”.
- Fotos de activos: no exigen unidad de negocio en esta historia; no reportar eso como fallo del gate.
- Restaurar OFF al terminar el día de prueba. Verificar con E-BO-OFF.1.

---

## Mapa escenario → test automatizado

| Escenario | Automatizado hoy |
|-----------|------------------|
| U.1–U.19 | Sí, specs unit listados |
| F-OFF.1, F-OFF.2 | Sí |
| F-ON.1 a F-ON.6, F-ON.8 a F-ON.10, F-ON.12 a F-ON.14 | Sí |
| F-BY.1 a F-BY.3 | Sí |
| F-ON.7, F-ON.11, F-ON.15 a F-ON.18 | No — añadir al spec funcional (código en §2) |
| E-API-* / E-BO-* | Manual en ambiente de prueba |

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-08-13 | Matriz completa unit + functional + e2e API/BO, exigencia OFF y ON, para USRH1785766406727. |
