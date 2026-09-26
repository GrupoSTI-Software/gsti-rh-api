# Escenarios de prueba — USRH1785766406735

Matriz QA para las 21 superficies de descarga e importación del módulo Empleados. La exigencia del módulo está apagada para la entrega; las pruebas `ON` son solo de ambiente de prueba.

**Plan de implementación:** `docs/superpowers/plans/2026-08-14-employees-downloads-imports-permission-gate.md`

**Capas:** unit (Japa, sin HTTP), functional (Japa HTTP = e2e API automatizado de este repositorio), e2e API (ambiente de prueba, mismas rutas), e2e backoffice (pantalla; esta historia no oculta botones).

---

## Contratos fijos (todas las capas)

### Negativa del gate

HTTP `403`:

```json
{
  "title": "Sin permiso",
  "detail": "No tienes permiso para realizar esta operación.",
  "key": "PERM.DENIED"
}
```

No se usa otra clave, título ni detalle. El body no incluye `data`, registros ni totales.

Además, en descargas e importaciones:

| Assert | Criterio |
|--------|----------|
| Sin archivo | `Content-Type` no es spreadsheet ni `text/csv` |
| Sin adjunto | ausente `Content-Disposition` |
| Sin enlace de job | ausente `data.reportJobId` (y no se encola el job) |
| Sin filas | las 3 importaciones no crean ni modifican registros |

`PERM.UNRESOLVED` solo si no se puede resolver el rol (pieza de orden 3; no se reescribe aquí).

### Interruptor

`system_modules.system_module_permission_enforcement_active` del módulo `employees`.

| Estado | Qué comprueba |
|--------|----------------|
| OFF (entrega) | Nadie nota el cambio. Las 21 superficies se ejecutan como hoy. |
| ON (solo prueba) | El servidor niega si falta el permiso de la superficie. |

Tras cualquier suite `ON`, el interruptor debe volver a `false`.

### Nombres en roles y permisos

| Slug | Etiqueta en matriz | Sección |
|------|--------------------|---------|
| `download-employees-list` | Descargar listado de colaboradores | descargas |
| `download-employees-import-template` | Descargar plantilla de importación de personal | descargas |
| `download-shift-assignment-template` | Descargar plantilla de importación de turnos | descargas |
| `download-attendance-report` | Descargar reporte de asistencia | descargas |
| `download-shift-exceptions` | Descargar excepciones de turno | descargas |
| `download-vacations-report` | Descargar reporte de vacaciones | descargas |
| `download-vacations-history` | Descargar histórico de vacaciones usadas | descargas |
| `download-vacations-summary` | Descargar resumen de vacaciones | descargas |
| `download-vacation-import-template` | Descargar plantilla de importación de vacaciones | descargas |
| `download-payroll-format` | Descargar formato de nómina | descargas |
| `download-attendance-by-employee` | Descargar asistencia por colaborador | descargas |
| `download-attendance-by-position` | Descargar asistencia por puesto | descargas |
| `download-attendance-by-department` | Descargar asistencia por departamento | descargas |
| `download-attendance-all` | Descargar asistencia general | descargas |
| `download-permissions-by-dates` | Descargar reporte de permisos por fechas | descargas |
| `download-supplies-report` | Descargar reporte de suministros | descargas |
| `download-proceeding-files` | Descargar archivos del expediente | descargas |
| `download-employee-contract` | Descargar contrato | descargas |
| `import-employees` | Importar personal | listado |
| `import-shift-assignments` | Importar asignaciones de turno | listado |
| `import-vacations` | Importar vacaciones | listado |
| `tab-expediente-read` | Consultar expediente (AND en #20) | expediente |
| `tab-trabajo-read` | Consultar Trabajo (AND en #21) | trabajo |
| `manage-vacation` | Administrar vacaciones (no abre #12) | vacaciones |
| `read-terminated-employees` | Ver personal dado de baja (secundario en #1 con `onlyInactive`) | listado |

Un permiso de descarga no concede otro. No hay OR entre descargables. GET y POST `/api/employees/attendance-report` exigen el mismo slug `download-attendance-report`.

### Las 21 superficies

| # | Clave | HTTP | Slug |
|---|-------|------|------|
| 1 | `getEmployeesExcel` | `GET /api/employees/employee-generate-excel` | `download-employees-list` |
| 2 | `getEmployeesImportTemplate` | `GET /api/employees/template-excel` | `download-employees-import-template` |
| 3 | `getShiftAssignmentTemplate` | `GET /api/employees/shift-assignment-template` | `download-shift-assignment-template` |
| 4 | `getAttendanceReport` | `GET` y `POST /api/employees/attendance-report` | `download-attendance-report` |
| 5 | `exportShiftExceptionsExcel` | `GET /api/employees/:employeeId/export-excel` | `download-shift-exceptions` |
| 6 | `importEmployeesExcel` | `POST /api/employees/import-excel` | `import-employees` |
| 7 | `importShiftAssignmentsExcel` | `POST /api/employees/import-shift-assignments` | `import-shift-assignments` |
| 8 | `getVacationsExcel` | `GET /api/employees-vacations/get-excel` | `download-vacations-report` |
| 9 | `getVacationsUsedExcel` | `GET /api/employees-vacations/get-vacations-used-excel` | `download-vacations-history` |
| 10 | `getVacationsSummaryExcel` | `GET /api/employees-vacations/get-vacations-summary-excel` | `download-vacations-summary` |
| 11 | `getVacationImportTemplate` | `GET /api/employees-vacations/get-vacation-import-template` | `download-vacation-import-template` |
| 12 | `importVacationExcel` | `POST /api/employees-vacations/import-vacation-excel` | `import-vacations` |
| 13 | `getPayrollFormat` | `GET /api/v1/assists/get-format-payroll` | `download-payroll-format` |
| 14 | `getAttendanceByEmployee` | `GET /api/v1/assists/get-excel-by-employee` | `download-attendance-by-employee` |
| 15 | `getAttendanceByPosition` | `GET /api/v1/assists/get-excel-by-position` | `download-attendance-by-position` |
| 16 | `getAttendanceByDepartment` | `GET /api/v1/assists/get-excel-by-department` | `download-attendance-by-department` |
| 17 | `getAttendanceAll` | `GET /api/v1/assists/get-excel-all` | `download-attendance-all` |
| 18 | `getPermissionsByDates` | `GET /api/v1/assists/get-excel-permissions-dates` | `download-permissions-by-dates` |
| 19 | `getSuppliesExcel` | `GET /api/supplies/excel` | `download-supplies-report` |
| 20 | `downloadProceedingFile` | `GET /api/employees-proceeding-files/:id/download` | `download-proceeding-files` **AND** `tab-expediente-read` |
| 21 | `downloadEmployeeContract` | `GET /api/employee-contracts/:id/download` | `download-employee-contract` **AND** `tab-trabajo-read` |

**Caminos adicionales (misma descarga, no suman superficie 22):**

| HTTP | Comparte slug de |
|------|------------------|
| `POST /api/v1/assists/reports` con `assistance_employee` o con `employeeId` | #14 `download-attendance-by-employee` |
| `POST /api/v1/assists/reports` sin `employeeId` (`assistance_all`, `assistance_incident_summary`, `assistance_incident_summary_payroll`) | #17 `download-attendance-all` |
| `GET /api/v1/assists/reports/:id/download` | el mismo slug que el `reportJobType` / `employeeId` del job |

### Actores

| Id | Quién | Grants de Empleados |
|----|-------|---------------------|
| A0 | Rol sin permisos de este tramo | ninguno |
| A1 | Solo histórico de vacaciones | `download-vacations-history` |
| A2 | Solo reporte de asistencia | `download-attendance-report` |
| A3 | Solo descarga de expediente | `download-proceeding-files` |
| A4 | Solo lectura de expediente | `tab-expediente-read` |
| A5 | Descarga + lectura de expediente | `download-proceeding-files`, `tab-expediente-read` |
| A6 | Solo descarga de contrato | `download-employee-contract` |
| A7 | Descarga + lectura de Trabajo | `download-employee-contract`, `tab-trabajo-read` |
| A8 | Solo administrar vacaciones | `manage-vacation` |
| A9 | Solo listado Excel | `download-employees-list` |
| A10 | Solo asistencia por departamento | `download-attendance-by-department` |
| A11 | Dueño de la empresa | slug `owner` (bypass `standard`) |
| A12 | Administración de plataforma | slug `root` (bypass `standard`) |
| A13 | Dirección general del cliente | slug `super-administrador` (sin bypass) |
| A14 | Sesión no iniciada | — |

Todas las peticiones autenticadas llevan `X-Business-Unit-Id`.

---

## 1. Unit

Automatizado. No requiere interruptor ON/OFF: no hay HTTP.

Archivos:

- `tests/unit/constants/employees_permission_catalog_granular.spec.ts`
- `tests/unit/constants/employees_download_permission_declarations.spec.ts`
- `tests/unit/routes/employees_downloads_imports_permission_gate_routes.spec.ts`
- `tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts` (sync sin grants, vía suite de catálogo)

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| U.1 | Catálogo Empleados declara 124 acciones | `EMPLOYEES_PERMISSION_CATALOG.length === 124`. Incluye los 15 slugs nuevos (14 descarga + `import-vacations`) con `displayName`, `kind`, `section` y `legacyEquivalence` según el plan. Los 6 ya registrados (`download-employees-list`, `download-attendance-report`, `download-vacations-history`, `download-proceeding-files`, `import-employees`, `import-shift-assignments`) no se renombran. |
| U.2 | Mapa de descargas declara exactamente 18 claves | `EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS` tiene 18 entradas; cada una `module: 'employees'`, `bypass: 'standard'`; cada `action` existe en el catálogo; 18 acciones distintas (sin herencia). |
| U.3 | GET y POST attendance-report usan el mismo slug | En rutas, ambos declaran `EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceReport` → `download-attendance-report`. |
| U.4 | Helper de jobs asíncronos | `employeesAttendanceReportJobDeclaration('assistance_employee')` y con `employeeId` → `download-attendance-by-employee`; `assistance_all` / `assistance_incident_summary` / `assistance_incident_summary_payroll` sin `employeeId` → `download-attendance-all`. |
| U.5 | Rutas exclusivas declaran gate | `employee_routes`, `employee_vacation_routes`, `assist_routes` (6 Excel/CSV; synchronize sin gate de esta historia), `supplies` (`/excel`), `employee_proceeding_file_routes` (download), `employee_contract_routes` (download), `report_jobs_controller` (enqueue + download del archivo). `getEmployeesExcel` ya no cuelga de `EMPLOYEES_READ_PERMISSION_DECLARATIONS`. `importVacationExcel` → `import-vacations`. AND: expediente usa `tab-expediente-read`; contrato usa `tab-trabajo-read`. |
| U.6 | Sync materializa sin conceder | `SystemPermissionCatalogSyncService.sync()` deja las filas en `system_permissions` del módulo `employees` y **cero** filas nuevas en `role_system_permissions` para los 15 slugs nuevos. Idempotente: no toca lo ya registrado. |

```bash
node ace test tests/unit/constants/employees_permission_catalog_granular.spec.ts \
  tests/unit/constants/employees_download_permission_declarations.spec.ts \
  tests/unit/routes/employees_downloads_imports_permission_gate_routes.spec.ts \
  --timeout 180000
```

---

## 2. Functional (e2e API automatizado)

Japa pega HTTP real contra la app. Este es el e2e API de CI.

Archivos:

- `tests/functional/employees/employees_downloads_imports_permission_gate.spec.ts`
- `tests/functional/employees/employees_listado_permission_gate.spec.ts` (regresión: Excel ya no cuelga de `read`)

Assert de negativa: status `403`, `key === 'PERM.DENIED'`, `title === 'Sin permiso'`, sin `Content-Disposition`, sin spreadsheet/csv, sin `data.reportJobId`.
Assert de no-denegación: `body.key !== 'PERM.DENIED'` (puede ser 2xx, 404 u otro error de negocio; el gate no intervino).

### 2.A Exigencia OFF

| # | Escenario | Actor | Criterio de éxito |
|---|-----------|-------|-------------------|
| F-OFF.1 | Muestra de las 21 sin grants | A0 | `GET` sample: `employee-generate-excel`, `attendance-report`, `get-vacations-used-excel`, `supplies/excel`, `employees-proceeding-files/999999999/download`, `employee-contracts/999999999/download` — ninguna responde `PERM.DENIED`. `POST` sample: `import-excel`, `import-vacation-excel` — ninguna responde `PERM.DENIED`. |
| F-OFF.2 | Interruptor queda apagado al terminar | — | Tras el teardown, `system_module_permission_enforcement_active` de `employees` es `false`. |

### 2.B Exigencia ON

| # | Escenario | Actor | Criterio de éxito |
|---|-----------|-------|-------------------|
| F-ON.1 | Sin permiso niega las 18 descargas | A0 | Cada entrada de `DOWNLOAD_SURFACES` (las 18) → 403 `PERM.DENIED`, sin spreadsheet/csv, sin `Content-Disposition`. |
| F-ON.2 | Aislamiento del histórico | A1 | `get-vacations-used-excel` no es `PERM.DENIED`. Las otras 17 descargas + las 3 importaciones → 403 `PERM.DENIED`. |
| F-ON.3 | GET+POST attendance-report | A2 | GET y POST `/api/employees/attendance-report` no son `PERM.DENIED`. `GET /api/v1/assists/get-excel-all` → 403 `PERM.DENIED`. |
| F-ON.4 | AND expediente y contrato | A3–A7 | Solo `download-proceeding-files` → 403. Solo `tab-expediente-read` → 403. Ambos → no `PERM.DENIED`. Solo `download-employee-contract` → 403. Con `tab-trabajo-read` → no `PERM.DENIED`. |
| F-ON.5 | Importación sin filas; `manage-vacation` no abre vacaciones | A8 | Con solo `manage-vacation`: `POST import-excel` → 403 y el conteo de empleados no cambia. `POST import-vacation-excel` → 403 `PERM.DENIED` (no basta `manage-vacation`). |
| F-ON.6 | Alcance intacto | A9 | Con `download-employees-list`, `employee-generate-excel` no es `PERM.DENIED`. El recorte por responsable / departamento / unidad de negocio sigue aplicando igual que hoy (el permiso no amplía alcance). |
| F-ON.7 | Bypass `standard` | A11–A13 | owner y root: `employee-generate-excel` no es `PERM.DENIED`. `super-administrador` → 403 `PERM.DENIED`. |
| F-ON.8 | Job asíncrono sin `reportJobId` | A0 | `POST /api/v1/assists/reports` con `assistance_all` → 403 `PERM.DENIED` y `data.reportJobId` ausente. |

### 2.C Regresión listado

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| F-LIST.1 | Excel de personal ya no cuelga de `read` | Con solo `read`, `GET /api/employees/employee-generate-excel` → 403 por falta de `download-employees-list`. Con `download-employees-list` + `onlyInactive=true` sin `read-terminated-employees` → 403. |

```bash
node ace test \
  tests/functional/employees/employees_downloads_imports_permission_gate.spec.ts \
  tests/functional/employees/employees_listado_permission_gate.spec.ts \
  --timeout 180000
```

---

## 3. E2E API (ambiente de prueba)

Misma matriz que Functional, contra el ambiente de prueba con interruptor controlado. No se automatiza fuera de Japa en este repositorio; se ejecuta a mano o con cliente HTTP.

### 3.A Exigencia OFF

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| E-API-OFF.1 | Sin exigencia, no hay rechazos nuevos | Rol sin grants: las 21 superficies no responden `PERM.DENIED`. Comportamiento igual a producción previa. |
| E-API-OFF.2 | Interruptor apagado al cerrar | `employees.system_module_permission_enforcement_active === false`. |

### 3.B Exigencia ON

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| E-API-ON.1 | Rol solo asistencia por departamento | Con solo `download-attendance-by-department`: `GET /api/v1/assists/get-excel-by-department` entrega el Excel. `GET /api/employees/template-excel` → 403. `GET /api/employees-vacations/get-vacations-summary-excel` → 403. |
| E-API-ON.2 | Quien tiene el permiso no nota diferencia | Con el slug correcto concedido, el archivo (columnas, filas, nombre) es el mismo que con exigencia OFF. No hay error nuevo ni cambio de payload. |
| E-API-ON.3 | Enmascaramiento intacto | Teléfono, CURP, RFC, NSS vía `PiiExportService` / `reveal-sensitive-data` se comportan igual que antes. Esta historia no altera el enmascaramiento. |
| E-API-ON.4 | AND y jobs | Repetir F-ON.4 y F-ON.8 contra el ambiente: sin ambos permisos no hay archivo; sin permiso de job no hay `reportJobId`. |
| E-API-ON.5 | Teardown | Tras las pruebas, interruptor de `employees` vuelve a `false`. |

### 3.C Revalidación app / PWA

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| E-API-APP.1 | Las 21 URLs no las consume la app ni la PWA | `rg` de Step 2 (ver abajo) solo encuentra rutas/controladores/constantes de backoffice. No hay consumidor en controlador de app (`/me`, exemption, `collaborator-*`). |
| E-API-APP.2 | Exenciones | Si aparece un consumidor app/PWA, documentarlo aquí con dueño **Wilvardo**, **sin** montar el gate en esa ruta y **sin** inventar un 22.º permiso. |

**Resultado de revalidación (2026-08-14):**

```bash
rg -n "employee-generate-excel|template-excel|shift-assignment-template|attendance-report|import-excel|import-shift-assignments|import-vacation-excel|get-vacation-import-template|get-vacations-used-excel|get-vacations-summary-excel|get-format-payroll|get-excel-by-|get-excel-all|get-excel-permissions-dates|supplies/excel|proceeding-files/.*/download|employee-contracts/.*/download" \
  --glob '!node_modules/**' --glob '!docs/**' --glob '!tests/**' -g '*.ts'
```

Hallazgos: solo `start/routes/*` de backoffice, controladores de backoffice, mapas/catálogo de permisos, inventario de export sensibles, presets (fuera de esta historia) y `NotificationEmailService` (servicio de servidor que llama `get-excel-permissions-dates` con el token del actor de backoffice; no es controlador app/PWA). **Cero hits en rutas `/me`, exemption ni `collaborator-*`.** No se declara exención. No se inventa un 22.º permiso.

---

## Fuera

| Tema | No debe incluirse aquí | Dueño / nota |
|------|------------------------|--------------|
| Puestos `GET /api/positions/get-excel/:positionId` y `get-pdf` | Quedan fuera de las 21 | Pregunta abierta con **Wilvardo**: ¿se levantan en un tramo aparte? |
| Cumplimiento de lactancia y `download-url` de evidencias médicas / lactancia / consentimiento / certificaciones | Fuera de las 21 | No inventar un 22.º permiso |
| Gafetes | Fuera | — |
| Recorte por unidad de negocio de `GET /api/supplies/excel` | Se exige permiso; el recorte no se corrige | Deuda con dueño |
| Importación masiva de personal escribe persona / domicilio / contacto de emergencia sin `tab-persona-*` / `tab-domicilio-*` | Deuda del set | No se resuelve aquí |
| `ROLE_PRESETS` / conceder los 15 a roles | Orden 24 | No se toca |
| Encender el interruptor del módulo | Entrega con exigencia OFF | No es de esta historia |
| Ocultar botones en el backoffice | UI | No es de esta historia |
| Bitácora de denegaciones | — | No se agrega |
| Gates del módulo `employees-attendance-monitor` (`download-summary`, `see-payroll`, etc.) | Se conservan; esta historia suma el permiso de Empleados | No sustituir |

---

## Suite de la historia

```bash
node ace test \
  tests/unit/constants/employees_permission_catalog_granular.spec.ts \
  tests/unit/constants/employees_download_permission_declarations.spec.ts \
  tests/unit/routes/employees_downloads_imports_permission_gate_routes.spec.ts \
  tests/functional/employees/employees_downloads_imports_permission_gate.spec.ts \
  tests/functional/employees/employees_listado_permission_gate.spec.ts \
  --timeout 180000
```

Esperado: PASS. Interruptor de `employees` sigue en `false`.
