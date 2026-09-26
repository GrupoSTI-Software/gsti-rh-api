# Escenarios QA — plantillas de roles

| Escenario | Verificación |
|---|---|
| A. Supervisor en replace | La preview separa permisos otorgados, revocados y sin cambios; apply coincide y conserva otros módulos. |
| B. Capturista en merge | `revoked` queda vacío; los permisos previos y los de la plantilla permanecen. |
| C. Auditoría / Consulta | El alta con `read-only` crea únicamente permisos de lectura. |
| D. Catálogo incompleto | La API responde 422 con el slug faltante y no modifica grants. |
| E. Error durante apply | La transacción revierte todos los grants si falla después de escribir. |
| F. Rol de sistema | La API responde 403 y conserva intactos los permisos del rol. |
| G. Listado / deploy | Consultar plantillas no crea filas en `role_system_permissions`. |

## Ejecución

```bash
node ace test functional --files "role_presets_acceptance.spec.ts"
```
