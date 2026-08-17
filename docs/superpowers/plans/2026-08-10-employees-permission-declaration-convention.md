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

Excepción documentada: `manage-employee-supplies` se registró en USRH1785766406727 porque el módulo Activos del menú no tiene permisos sembrados y declarar el permiso ahí lo dejaría fuera del interruptor de Empleados.

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
| Zonas de trabajo del colaborador (asignar / modificar) | `tab-zonas-write` |
| Quitar zona de trabajo del colaborador | `tab-zonas-delete` |
| Anotaciones del historial (agregar / corregir) | `tab-anotaciones-write` |
| Eliminar anotación del historial | `tab-anotaciones-delete` |
| Bonificaciones (registrar / modificar) | `tab-trabajo-write` |
| Eliminar bonificación | `tab-trabajo-delete` |
| Asignación responsable ↔ colaborador (crear / modificar / eliminar) | `manage-responsible-edit` **o** `manage-assigned-edit` (OR) |
| Activos y suministros del colaborador (ciclo completo: asignación, retiro, contratos, fotografías) | `manage-employee-supplies` |

Para las operaciones de lectura, la correspondencia entre la ruta y el permiso exigido se declara en el diccionario `EMPLOYEES_READ_PERMISSION_DECLARATIONS`.

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

## 4. Superficie de escritura compartida con otros dominios

Cuando una misma operación HTTP sirve a varios dominios del producto
(p. ej. `PUT /api/persons/:personId` sirve a colaborador, cliente y usuario)
y **no** existe una acción del módulo Empleados que aplique a los demás dominios:

1. **No** declarar `permissionGate` sobre la ruta completa.
2. Resolver caso por caso si el registro tocado corresponde a un colaborador
   (vínculo `employees.person_id` con `employee_deleted_at IS NULL`).
3. Si corresponde a colaborador, exigir el permiso del módulo Empleados con
   `ensureSecondaryPermission` (mismo `PermissionGateService.evaluate`,
   mismo interruptor de módulo, mismo bypass del catálogo, misma respuesta 403).
4. Si no corresponde a colaborador, no exigir permiso de Empleados: la operación
   sigue como hoy para ese dominio.
5. Evaluar el permiso **antes** de validar el cuerpo de la petición cuando el
   caso colaborador aplica, para no revelar reglas de validación de una sección
   a la que no se tiene acceso.

Ejemplo canónico: escritura de datos personales de `Person` — exige
`tab-persona-write` / `tab-persona-delete` solo si la persona está ligada a
un colaborador. Pilotos y sobrecargos son colaboradores (tienen fila en
`employees`), así que quedan cubiertos aunque se editen desde otra pantalla.
La persona de un cliente no queda cubierta.

Los `DELETE` propios de piloto y sobrecargo quedan fuera de esta convención:
son un gap preexistente y no se incluyen en esta historia.

## 5. Operación que acepta cualquiera de varios permisos (OR)

Cuando una misma operación HTTP sirve a dos pestañas del expediente y el
servidor no puede saber desde cuál se ejecuta (responsable y asignados):

1. Declarar un solo `permissionGate` en la ruta (no apilar dos gates: eso sería AND).
2. Pasar `action` como lista de slugs. `PermissionGateService.evaluate` permite
   si el rol tiene **cualquiera**.
3. Quien no tiene ninguno recibe la misma 403 (`PERM.DENIED` / `PERM.UNRESOLVED`).
4. Los permisos de consultar de esas pestañas no se declaran aquí: son lectura.

Ejemplo canónico: `POST/PUT/DELETE /api/user-responsible-employees` exige
`manage-responsible-edit` o `manage-assigned-edit`.

## 6. Cómo elegir el permiso de una consulta

1. Buscar en `EMPLOYEES_PERMISSION_CATALOG` el slug `tab-<pestaña>-read` de la pestaña (no inventar slugs).
2. Consulta anidada: el mismo slug de lectura de la pestaña padre.
3. Calendario, turnos, vacaciones, excepciones de turno y bonificaciones: `tab-trabajo-read`.
4. Incapacidades: `read-work-disabilities` (no hay pestaña propia).
5. Homologación: no declarar `manage-responsible-read`, `manage-assigned-read`, `read-only-files`, `show-face-id` ni `show-fingers`; usar el `tab-*-read` equivalente.
6. Declarar en la ruta: `middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.<clave>)` después de `auth()` y de `businessScope()` si la ruta ya lo usa.
7. Fuente: `EMPLOYEES_READ_PERMISSION_DECLARATIONS`. No mezclar claves de escritura.

## 7. Respuesta compuesta

`GET /api/employees/:employeeId` y `GET /api/employees/get-by-id/:employeeId` exigen solo `tab-trabajo-read`. No recortar secciones ni rechazar por las incluidas. Los campos sensibles los gobierna la historia de categoría legal.

## 8. Superficie de consulta compartida (C-13)

Igual que escritura: no montar `permissionGate` en `/api/persons`, `/api/proceeding-files` ni `/api/proceeding-file-type-property-values`. Derivar el vínculo y exigir con `ensureSecondaryPermission` + constantes `EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION` / `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_READ_PERMISSION`. Si no es colaborador / no es área `employee`, no exigir permiso de Empleados.

## 9. Exención de la aplicación del colaborador

Las URLs que también usa la app no llevan gate en la ruta. El controlador llama `ensureEmployeeTabRead` (identidad propia → permitir; si no, el permiso de pestaña). Rutas solo-app (`/api/employee-badges/me`, `/api/exception-requests/my-requests`, `/unread`, `/api/consent/me`) no declaran gate. No se concede permiso de backoffice al colaborador. Deuda: Wilvardo. Adicionalmente, `GET /api/employee-medical-conditions/employee/:employeeId` tiene una exención para el propio colaborador (para el censo del catálogo).

## 10. Listado de colaboradores y personal dado de baja

1. Buscar en `EMPLOYEES_PERMISSION_CATALOG` el slug `read` (Consultar listado de colaboradores). No usar `tab-trabajo-read` para el listado ni para cumpleaños/aniversarios.
2. Declarar en la ruta: `middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.<clave>)` después de `auth()` y de `businessScope()` si la ruta ya lo usa.
3. Catálogos del propio módulo que alimentan filtros del listado (`get-work-schedules`, `employee-types`, `termination-catalog`): el mismo `read`.
4. El exportable `GET /api/employees/employee-generate-excel` exige `download-employees-list` (mapa de descargas, USRH1785766406735). Si `isTerminatedEmployeesFilterRequested(onlyInactive)` es verdadero, exige además `read-terminated-employees` con `ensureSecondaryPermission` **antes** de generar el archivo. Tener `read` no otorga la descarga; tener la descarga no otorga ver bajas.
5. Si `isTerminatedEmployeesFilterRequested(onlyInactive)` es verdadero, exigir además `EMPLOYEES_TERMINATED_EMPLOYEES_READ_PERMISSION` con `ensureSecondaryPermission` **antes** de consultar. Si falta, rechazar toda la petición con la 403 del middleware. Nunca quitar el filtro ni devolver solo activos.
6. Tener `read` no otorga `read-terminated-employees`.

## 11. Cómo elegir el permiso de una descarga o importación masiva

1. Buscar en `EMPLOYEES_PERMISSION_CATALOG` el slug `download-*` o `import-*` de esa superficie (no inventar slugs; no reutilizar el de otra descarga).
2. Declarar en la ruta: `middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.<clave>)` o, si es importación, `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.<clave>`, después de `auth()` y de `businessScope()` si la ruta ya lo usa.
3. Una misma ruta declara un solo `permissionGate`. GET y POST de `/api/employees/attendance-report` comparten `getAttendanceReport`.
4. Adjunto del expediente y contrato: el gate de ruta es el de descarga; el permiso de lectura de la pestaña se exige en el controlador con `ensureSecondaryPermission` **antes** de leer o enviar el archivo. Con uno solo de los dos, se niega.
5. Los jobs `POST/GET /api/v1/assists/reports` no estrenan permiso: `employeesAttendanceReportJobDeclaration` elige `download-attendance-by-employee` o `download-attendance-all`. Se evalúa con `ensureSecondaryPermission` antes de encolar y antes de enviar el archivo. Los gates del módulo `employees-attendance-monitor` se quedan.
6. Conceder un descargable no concede otro. `manage-vacation` no abre `import-vacations`. `read` no abre `download-employees-list`.
7. Fuente de descargas: `EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS`. No mezclar esas claves en el mapa de lectura del expediente.

