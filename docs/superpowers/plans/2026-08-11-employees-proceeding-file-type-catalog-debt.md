# Deuda: catálogo de tipos de documento y requisitos de certificación por puesto

**Fecha:** 2026-08-11
**Historia origen:** Exigir permiso en escritura de Expediente documental y Certificaciones

## Catálogo de tipos de documento (11 escrituras)

Rutas sin gate de Empleados (a propósito):

1. `POST /api/proceeding-file-types`
2. `POST /api/proceeding-file-types/create-employee-type`
3. `POST /api/proceeding-file-types/create-system-setting-type`
4. `PUT /api/proceeding-file-types/:proceedingFileTypeId`
5. `DELETE /api/proceeding-file-types/:proceedingFileTypeId`
6. `POST /api/proceeding-file-type-properties`
7. `POST /api/proceeding-file-type-properties/create-multiple`
8. `DELETE /api/proceeding-file-type-properties/:proceedingFileTypePropertyId`
9. `POST /api/proceeding-file-type-emails`
10. `PUT /api/proceeding-file-type-emails/:proceedingFileTypeEmailId`
11. `DELETE /api/proceeding-file-type-emails/:proceedingFileTypeEmailId`

**Motivo:** catálogo compartido con aeronaves, pilotos, sobrecargos, clientes y ajustes de empresa; no existe permiso configurable de administración en el módulo Empleados; declarar un slug de colaboradores gobernaría mal un catálogo ajeno.

**Dueño / siguiente paso:** Wilvardo — gobernar cuando se decida el módulo dueño o cuando ese dominio migre al motor de permisos. No crear slug en Empleados mientras tanto.

**Confirmado:** Wilvardo, 2026-08-11.

## Requisitos de certificación por puesto

Rutas:

- `POST /api/positions/:positionId/certification-requirements`
- `DELETE /api/positions/:positionId/certification-requirements/:certificationId`

**Motivo:** tocan certificaciones pero pertenecen al catálogo de puestos; no aparecen en el esbozo del set de Empleados (órdenes 8–14).

**Dueño / siguiente paso:** asignar dueño con Wilvardo (puestos vs certificaciones).
