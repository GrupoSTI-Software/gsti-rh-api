import type { PermissionGateOptions } from '#constants/permission_gate'

const zonesStandard = (action: string | readonly string[]): PermissionGateOptions => ({
  module: 'zones',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Zonas de asistencia remota. Fuente única
 * que consumen las rutas de `start/routes/zone_routes.ts`.
 *
 * El listado (`GET /api/zones`) no se declara: lo consume el select de zonas
 * con el que Empleados asigna una zona a un colaborador.
 *
 * El detalle pide `read`: solo lo usa el formulario de la página de zonas.
 *
 * La miniatura acepta `create` o `update`: el formulario la sube justo después
 * de crear y también después de editar, así que un rol que solo crea no debe
 * quedarse sin ella.
 */
export const ZONES_PERMISSION_DECLARATIONS = {
  storeZone: zonesStandard('create'),
  showZone: zonesStandard('read'),
  updateZone: zonesStandard('update'),
  deleteZone: zonesStandard('delete'),
  uploadZoneThumbnail: zonesStandard(['create', 'update']),
} as const satisfies Record<string, PermissionGateOptions>
