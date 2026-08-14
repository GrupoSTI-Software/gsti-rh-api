# Convención: declarar permiso en operaciones del módulo Empleados

Material de copia para las historias de las órdenes 8 a 14.
Origen: exigir permiso en las 23 escrituras del colaborador y su ficha laboral.

## 1. Cómo elegir el permiso de una operación

1. Buscar en `EMPLOYEES_PERMISSION_CATALOG` el slug que nombra la decisión de negocio
   (no inventar slugs; no crear filas nuevas en esta convención).
2. Declarar en la ruta:
   `middleware.permissionGate({ module: 'employees', action: '<slug>', bypass: '<exceptionProfile del catálogo>' })`.
3. Colocar el gate **después** de `auth()` (y de `businessScope()` si la ruta ya lo usa).
4. No encender `system_module_permission_enforcement_active` del módulo.
5. No conceder el permiso a ningún rol como parte de la historia de declaración.

Criterios de elección usados en escrituras del colaborador (referencia):

| Tipo de operación | Slug |
|-------------------|------|
| Alta de colaborador | `create` |
| Escritura de ficha laboral / contratos / sucursal / asignaciones temporales / reactivación | `tab-trabajo-write` |
| Baja del colaborador (operación que lo deja inactivo) y tocar el registro de baja | `delete` |
| Subir foto | `tab-foto-write` |
| Eliminar foto | `tab-foto-delete` |
| Carga masiva de personal (Excel) | `import-employees` |
| Carga masiva de asignaciones de turno (Excel) | `import-shift-assignments` |
| Sincronización con equipo biométrico (todas las variantes) | `manage-biotime` |

## 2. Operación que toca dos asuntos de negocio

Cuando una sola petición puede alterar dos asuntos distintos:

1. El permiso del asunto principal se declara siempre en la ruta con `permissionGate`.
2. El permiso del segundo asunto se exige **solo si ese segundo asunto cambia de verdad**
   en la petición (comparar estado actual vs. valores que la operación aplicaría).
3. La evaluación del segundo permiso usa el mismo `PermissionGateService.evaluate`
   (misma identidad, mismo interruptor de módulo, mismo bypass del catálogo).
4. Si el segundo permiso falta, se rechaza **toda** la operación con la misma
   respuesta 403 del middleware (`PERM.DENIED` / `PERM.UNRESOLVED`); no se
   guarda ningún otro campo del mismo movimiento.
5. Si el segundo asunto no cambia, no se exige el segundo permiso.

Ejemplo canónico: `PUT /api/employees/:employeeId` exige `tab-trabajo-write`
siempre, y `delete` únicamente cuando cambian `employeeTerminatedDate`,
`employeeTerminationModality` o `employeeTerminationType`.

## 3. Qué no hace una historia de “declarar permiso”

- No cambia validaciones ni resultados de negocio para quien sí tiene el permiso.
- No agrega bitácora de denegaciones.
- No oculta botones en el backoffice.
- No enciende la exigencia del módulo.
