# Escenarios de prueba — USRH1785766406734

Matriz QA para el listado de colaboradores y la consulta de personal dado de baja. La exigencia del módulo Empleados está apagada para la entrega; las pruebas `ON` son de ambiente de prueba.

**Plan de implementación:** `docs/superpowers/plans/2026-08-13-employees-listado-bajas-permission-gate.md`

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

No se usa otra clave, título ni detalle. El body no incluye registros, totales ni `data`.

### Interruptor

`system_modules.system_module_permission_enforcement_active` del módulo `employees`.

| Estado | Qué comprueba |
|--------|----------------|
| OFF | La historia se entrega sin cambio percibido. |
| ON | El servidor niega si falta el permiso. |

Tras cualquier suite `ON`, el interruptor debe volver a `false`.

### Nombres en roles y permisos

| Slug | Etiqueta en matriz |
|------|--------------------|
| `read` | Consultar listado de colaboradores |
| `read-terminated-employees` | Ver personal dado de baja |

Tener el primero no otorga el segundo.

---

## 1. Unit

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| U.1 | El mapa de lectura declara 120 claves | Solo slugs válidos, `module: 'employees'`, `bypass: 'standard'`. |
| U.2 | Las 9 claves de listado usan `read` | `indexEmployees`, `indexEmployeesToAssigned`, `indexEmployeesWithoutUser`, `getBirthday`, `getAnniversary`, `getWorkSchedules`, `getTerminationCatalog`, `getEmployeesExcel`, `indexEmployeeTypes`. |
| U.3 | La constante de bajas es distinta | `EMPLOYEES_TERMINATED_EMPLOYEES_READ_PERMISSION.action === 'read-terminated-employees'`. |
| U.4 | El predicado de bajas solo acepta `true` / `'true'` | `1`, `'1'`, `'TRUE'`, `'false'` son falso. |
| U.5 | Las 9 rutas declaran gate; las de otros módulos no | Ver spec de rutas. Attendance-report sigue sin `READ_PERMISSION`. |
| U.6 | `standard` es el bypass | owner y root pasan; `super-administrador` no. |

---

## 2. Functional

### 2.A Exigencia OFF

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| F-OFF.1 | Sin exigencia, listado, bajas, cumpleaños y tipos no responden `PERM.DENIED` | Rol sin grants. |
| F-OFF.2 | El interruptor queda apagado | Tras el teardown, el flag de `employees` es `false`. |

### 2.B Exigencia ON

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| F-ON.1 | Sin `read` | `GET /api/employees/` → 403 `PERM.DENIED`, sin `data`. |
| F-ON.2 | Solo `read` | Listado de activos 200; `onlyInactive=true` 403 (no degrada). |
| F-ON.3 | Rodeo por variante | `to-assigned` y `employee-generate-excel` con `onlyInactive=true` y solo `read` → 403. |
| F-ON.4 | `read` + `read-terminated-employees` | `onlyInactive=true` → 200. |
| F-ON.5 | Homologación | `tab-trabajo-read` no abre el listado. `read` abre cumpleaños, aniversarios, horarios, catálogo de baja, tipos y `without-user`. |
| F-ON.6 | Alcance intacto | Con `read`, filtrar por un departamento fuera de alcance no entrega esa gente. |
| F-ON.7 | Bypass `standard` | owner y root 200 en listado y bajas; `super-administrador` 403. |
| F-ON.8 | Negativa uniforme | El mismo `PERM.DENIED` con o sin gente dada de baja en BD. |

### 2.C E2E API manual

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| E-API-OFF.1 | Repetir F-ON.1 con exigencia apagada | El listado no responde `PERM.DENIED`. |
| E-API-ON.1 | Repetir F-ON.1 y F-ON.2 con exigencia encendida | Sin `read` 403; con `read` activos 200 y bajas 403. |
| E-API-ON.2 | Backoffice con permisos en orden | Buscar, paginar, ordenar y filtrar como siempre; sin error nuevo. |

---

## Fuera

| Tema | No debe incluirse aquí |
|------|------------------------|
| Áreas, puestos, sucursales, unidades de negocio | Deuda de otros módulos |
| Attendance-report y plantillas | Orden 21 |
| Ficha `GET /:employeeId` | Orden 15 |
| App / PWA | No consumen esta superficie |
