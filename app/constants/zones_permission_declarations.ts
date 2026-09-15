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
 *
 * Estos permisos deciden QUÉ se hace, no SOBRE QUÉ EMPRESA: `zones` no tiene
 * `business_unit_id` y el grupo de rutas no monta `businessScope`, así que quien
 * tenga el verbo (u owner por bypass) opera zonas de todas las empresas. Hueco
 * de aislamiento pendiente, reportado aparte; no lo cierra este gate.
 */
export const ZONES_PERMISSION_DECLARATIONS = {
  storeZone: zonesStandard('create'),
  showZone: zonesStandard('read'),
  updateZone: zonesStandard('update'),
  deleteZone: zonesStandard('delete'),
  uploadZoneThumbnail: zonesStandard(['create', 'update']),
} as const satisfies Record<string, PermissionGateOptions>
