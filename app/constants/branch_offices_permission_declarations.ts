import type { PermissionGateOptions } from '#constants/permission_gate'

const branchOfficesStandard = (action: string): PermissionGateOptions => ({
  module: 'branch-offices',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Sucursales. Fuente única que consumen
 * las rutas de `start/routes/branch_offices.ts`.
 *
 * El listado (`GET /api/branch-offices`) no se declara: es el catálogo de los
 * selects y filtros de Empleados, Monitor de asistencia, NOM-035 y REPSE, y
 * ninguna de esas pantallas tiene por qué administrar sucursales.
 *
 * El detalle sí pide `read`: su único consumidor es la página de sucursales,
 * a la que el backoffice ya no deja entrar sin ese permiso.
 *
 * `update` gobierna también la liga con una empresa contratante
 * (`empresaContratanteId`), porque hoy la mandan tanto el formulario de
 * sucursales como la pantalla de REPSE por la misma ruta. Quién es dueño de
 * esa liga es una decisión pendiente; mientras tanto, REPSE necesita
 * `branch-offices:update` para ligar o desligar sitios.
 */
export const BRANCH_OFFICES_PERMISSION_DECLARATIONS = {
  storeBranchOffice: branchOfficesStandard('create'),
  showBranchOffice: branchOfficesStandard('read'),
  updateBranchOffice: branchOfficesStandard('update'),
  destroyBranchOffice: branchOfficesStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
