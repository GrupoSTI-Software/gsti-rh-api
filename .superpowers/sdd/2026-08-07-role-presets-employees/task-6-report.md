# Informe de Task 6: Alta de rol con plantilla

## Estado

Implementado.

## Cambios

- `createRoleValidator` acepta opcionalmente `rolePresetSlug` con los cuatro slugs soportados.
- `RoleController.store` conserva el flujo existente cuando no se envía plantilla.
- Cuando se envía `rolePresetSlug`, la creación del rol y la aplicación de la plantilla se ejecutan en la misma transacción.
- La plantilla se aplica con `mode: 'replace'`, `baselinePermissionIds: []` y la versión actual obtenida mediante `getRolePreset`.
- La respuesta `201` incluye `appliedPreset` cuando se aplicó una plantilla.
- `RoleService.create` acepta opcionalmente una transacción para permitir el rollback conjunto.

## Verificación

- `node ace test functional --files role_create_with_preset.spec.ts`: comando exitoso, pero no se ejecutaron pruebas porque el archivo de pruebas no existe actualmente en el repositorio.
- `npx tsc --noEmit`: falla por errores preexistentes en `tests/unit/constants/role_presets.spec.ts`, relacionados con tipos de slugs `tab-*`; no señalan los archivos modificados.
- `ReadLints`: sin errores en los archivos modificados.

## Preocupaciones

La cobertura funcional específica de esta tarea queda pendiente hasta incorporar `tests/functional/role_create_with_preset.spec.ts`.
