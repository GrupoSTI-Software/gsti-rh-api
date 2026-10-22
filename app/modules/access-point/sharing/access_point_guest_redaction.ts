import type AccessPoint from '#models/access_point'
import type { AccessPointHealthDto } from '#modules/access-point/health/health.dto'
import type { DeviceProfileDto } from '#modules/access-point/device-profile/dto/device_profile.dto'
import type { AccessPointSharingView } from './access_point_sharing_view.js'

/**
 * Lo que la empresa invitada no recibe de un checador compartido (VLRH-P0065, 6).
 *
 * Fuente unica del recorte: una funcion por forma de respuesta, y cada
 * endpoint de esa forma (lista e individual) la importa de aqui. Un campo
 * nuevo que la invitada no debe ver se agrega en la funcion de su forma. A la
 * responsable se le devuelve todo intacto: la decision de rol es del llamador.
 */

/**
 * Catalogo de checadores: ni el id interno de la responsable ni la
 * configuracion de red del aparato (IP, MAC, CIDR permitidos). `satisfies`
 * valida cada clave contra el modelo: un nombre mal escrito no compila.
 */
const CATALOG_GUEST_NULLS = {
  businessUnitId: null,
  accessPointIp: null,
  accessPointMac: null,
  accessPointAllowedCidrs: null,
} satisfies Partial<Record<keyof AccessPoint, null>>

/**
 * Catalogo serializado (`GET /api/access-points` y su ficha) tal como lo ve
 * quien lo mira (`sharingViewOf`). De la responsable solo viaja el nombre: el
 * Backoffice lo pinta; nada de su ficha (razon social, slug, zona).
 */
export function redactCatalogForGuest<T extends Record<string, unknown>>(
  serialized: T,
  view: AccessPointSharingView | undefined
): T {
  if (view?.sharedRole !== 'guest') return serialized
  return {
    ...serialized,
    businessUnit: { businessUnitName: view.sharedBy },
    ...CATALOG_GUEST_NULLS,
  }
}

/**
 * Salud del checador: sin IP, MAC ni la ultima IP desde la que reporto el
 * aparato (red de la responsable). Tampoco agregados de su personal: el padron
 * y los avisos abiertos se calculan sobre todo el aparato y salen `null`; del
 * ultimo fallo de la cola se quita el texto de error, que puede ser de un
 * colaborador ajeno.
 */
export function redactHealthForGuest(row: AccessPointHealthDto): AccessPointHealthDto {
  return {
    ...row,
    ip: null,
    mac: null,
    enrollment: null,
    openIncidents: null,
    queue: {
      ...row.queue,
      lastFailure: row.queue.lastFailure ? { ...row.queue.lastFailure, error: null } : null,
    },
    hardening: { ...row.hardening, lastIpSeen: null, lastIpSeenAt: null },
  }
}

/** Perfil del checador: la IP desde la que reporta el aparato es de la red de la responsable. */
export function redactProfileForGuest(dto: DeviceProfileDto): DeviceProfileDto {
  return { ...dto, lastIpSeen: null, lastIpSeenAt: null }
}
