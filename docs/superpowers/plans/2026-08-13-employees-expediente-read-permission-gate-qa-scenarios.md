# Escenarios de prueba — USRH1785766406733

Matriz QA para la lectura del expediente del colaborador: permisos de pestaña, superficies compartidas, exención de la app del colaborador, homologación y bypass `standard`. La exigencia del módulo Empleados está apagada para la entrega; las pruebas `ON` son de ambiente de prueba.

**Plan de implementación:** `docs/superpowers/plans/2026-08-13-employees-expediente-read-permission-gate.md`

---

## Contratos fijos

### Negativa del gate

HTTP `403`:

```json
{
  "title": "Sin permiso",
  "detail": "No tienes permiso para realizar esta operación.",
  "key": "PERM.DENIED"
}
```

No se usa otra clave, título ni detalle.

### Interruptor

`system_modules.system_module_permission_enforcement_active` del módulo `employees`.

| Estado | Qué comprueba |
|--------|----------------|
| OFF | La historia se entrega sin cambio percibido. |
| ON | El servidor niega si falta el permiso. |

Tras cualquier suite `ON`, el interruptor debe volver a `false`.

### Nombres en roles y permisos

| Slug | Etiqueta en matriz | Sección |
|------|--------------------|---------|
| `tab-bancos-read` | Consultar bancos | Bancos |
| `tab-condicion-medica-read` | Consultar condición médica | Condición médica |
| `tab-trabajo-read` | Consultar Trabajo | Trabajo |
| `tab-responsable-read` | Consultar responsable asignado | Responsable |
| `tab-asignados-read` | Consultar colaboradores asignados | Asignados |
| `read-work-disabilities` | Consultar incapacidades | Incapacidades |
| `tab-expediente-read` | Consultar expediente | Expediente |
| `tab-persona-read` | Consultar Persona | Persona |

Homologación obligatoria: `manage-responsible-read` → `tab-responsable-read`; `manage-assigned-read` → `tab-asignados-read`; `read-only-files` → `tab-expediente-read`; `show-face-id` / `show-fingers` → `tab-biometricos-read`. Incapacidades conservan `read-work-disabilities`.

---

## 1. Unit

Automatizado. No requiere interruptor ON/OFF: no hay HTTP.

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| U.1 | El mapa de lectura declara las 111 claves | `EMPLOYEES_READ_PERMISSION_DECLARATIONS` contiene solo slugs válidos de Empleados, con `module: 'employees'` y `bypass: 'standard'`. |
| U.2 | La ficha compuesta y el calendario usan `tab-trabajo-read` | `showEmployee`, `getEmployeeById`, `getSalaryHistory`, `showEmployeeContract`, `indexAssistCalendars` y `showEmployeeBonus` cuelgan de `tab-trabajo-read`. |
| U.3 | Las consultas anidadas heredan la pestaña padre | `showEmployeeChild`, `getEmergencyContactsByEmployee`, `showMedicalConditionPropertyValue`, `indexLactationEvidences` e `indexCertificationUploads` usan el slug de su pestaña. |
| U.4 | La homologación usa el slug de pestaña | `getUserResponsible` → `tab-responsable-read`; `getEmployeesAssigned` → `tab-asignados-read`; `showUserResponsibleEmployee` usa OR entre ambos; `getEmployeeProceedingFiles` → `tab-expediente-read`; biométricos → `tab-biometricos-read`; incapacidades → `read-work-disabilities`. |
| U.5 | Las superficies compartidas usan constantes dedicadas | `EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION` apunta a `tab-persona-read` y `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_READ_PERMISSION` a `tab-expediente-read`. |
| U.6 | `ensureEmployeeTabRead` protege la app del colaborador | Si la sesión es el propio colaborador, permite; si no, delega en `ensureSecondaryPermission`. |
| U.7 | Las rutas exclusivas declaran gate y las exentas no | Bancos, anotaciones, ficha, persona-colaborador, expediente employee y el resto de GET del mapa declaran `permissionGate`; `GET /api/persons` y `GET /api/proceeding-files` no lo hacen. |
| U.8 | `standard` es el bypass correcto | `owner` y `root` pasan; `super-administrador` no. |

---

## 2. Functional

Japa HTTP real contra la app. Esta es la capa automatizada de CI.

### 2.A Exigencia OFF

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| F-OFF.1 | Sin exigencia, la lectura no cambia | Con rol sin grants, bancos, anotaciones, ficha, persona-cliente y `GET /api/employee-badges/me` no responden `PERM.DENIED`. |
| F-OFF.2 | El interruptor queda apagado | Tras el teardown, `system_module_permission_enforcement_active` de `employees` es `false`. |

### 2.B Exigencia ON

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| F-ON.1 | Rol solo `tab-bancos-read` | Bancos 200, anotaciones 403, ficha 403, médica 403. |
| F-ON.2 | Rol solo `tab-condicion-medica-read` | Médica y `property-values` 200, bancos 403. |
| F-ON.3 | Rol solo `tab-trabajo-read` | Ficha 200 completa; bancos dedicados 403. |
| F-ON.4 | Homologación de responsable | GET responsable con `tab-responsable-read` 200; con `manage-responsible-read` y sin tab 403. |
| F-ON.5 | OR en el vínculo responsable | `show` del vínculo responsable con solo `tab-asignados-read` 200. |
| F-ON.6 | Incapacidades conservan su slug | `read-work-disabilities` 200; `tab-expediente-read` no basta. |
| F-ON.7 | Propio sin grants | Usuario-colaborador sin grants obtiene su médica, contactos, incapacidades y calendario; no obtiene bancos de otro. |
| F-ON.8 | C-13 en `persons` | `GET /api/persons/:id` de cliente 200; colaborador ajeno 403; propio 200. |
| F-ON.9 | Área employee en proceeding-files | `GET` del área employee 403 sin `tab-expediente-read`; área aircraft 200. |
| F-ON.10 | Bypass `standard` | Owner 200, root 200, `super-administrador` 403. |
| F-ON.11 | Negativa uniforme | El mismo `PERM.DENIED` aplica para bank id existente e inexistente. |
| F-ON.12 | Alcance intacto | Con `tab-anotaciones-read`, anotaciones de otra unidad/departamento siguen el rechazo de `businessScope` y no dan 200. |

### 2.C E2E API manual

Misma matriz que Functional, contra el ambiente de prueba. No se automatiza la autorización e2e.

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| E-API-OFF.1 | Repetir F-ON.1 con exigencia apagada | Bancos y ficha no responden `PERM.DENIED`. |
| E-API-OFF.2 | Repetir F-ON.3 con exigencia apagada | `tab-trabajo-read` no es necesario mientras el interruptor esté `false`. |
| E-API-ON.1 | Repetir F-ON.1 con exigencia encendida | Bancos 200; anotaciones, ficha y médica 403. |
| E-API-ON.2 | Repetir F-ON.3 con exigencia encendida | Ficha 200 completa; bancos dedicados 403. |

---

## Fuera

| Tema | No debe incluirse aquí |
|------|------------------------|
| Excel | Listados exportables |
| Listado | `GET /api/employees/` y reportes de personal |
| Supplies | Activos / suministros |
| `/api/proxy-image` | Endpoint público |
| `tests-by-position` | Ruta fuera de alcance |

