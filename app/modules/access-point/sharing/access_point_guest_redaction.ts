import type { AccessPointHealthDto } from '#modules/access-point/health/health.dto'
import type { DeviceProfileDto } from '#modules/access-point/device-profile/dto/device_profile.dto'
import type { AccessPointSharingView } from './access_point_sharing_view.js'

/**
 * Lo que la empresa invitada no recibe de un checador compartido (VLRH-P0065, 6).
 *
 * Una declaracion por forma de respuesta: cada campo declarado `null` llega
 * nulo a la invitada; un objeto anidado declara los campos que se anulan
 * dentro de el (si el objeto viene `null`, se queda asi). Agregar un campo
 * aqui lo retira de todos los endpoints de esa forma, lista e individual. A la
 * responsable se le devuelve todo intacto.
 */
type GuestRedaction<T> = {
  [K in keyof T]?:
    | null
    | (NonNullable<T[K]> extends object ? GuestRedaction<NonNullable<T[K]>> : never)
}

/**
 * Catalogo de checadores (`GET /api/access-points` y su ficha): ni el id
 * interno de la responsable ni la configuracion de red del aparato (IP, MAC,
 * CIDR permitidos). De la responsable solo viaja el nombre (`businessUnit`).
 */
const CATALOG_GUEST_REDACTION = {
  businessUnitId: null,
  accessPointIp: null,
  accessPointMac: null,
  accessPointAllowedCidrs: null,
} as const satisfies Record<string, null>

/**
 * Salud: sin datos de red del aparato ni agregados del personal de la
 * responsable. El padron y los avisos abiertos se calculan sobre todo el
 * aparato; el texto del ultimo fallo de la cola puede ser de un colaborador
 * ajeno.
 */
const HEALTH_GUEST_REDACTION: GuestRedaction<AccessPointHealthDto> = {
  ip: null,
  mac: null,
  enrollment: null,
  openIncidents: null,
  queue: { lastFailure: { error: null } },
  hardening: { lastIpSeen: null, lastIpSeenAt: null },
}

/** Perfil: la IP desde la que reporta el aparato es de la red de la responsable. */
const PROFILE_GUEST_REDACTION: GuestRedaction<DeviceProfileDto> = {
  lastIpSeen: null,
  lastIpSeenAt: null,
}

function applyRedaction<T extends object>(value: T, redaction: GuestRedaction<T>): T {
  const result = { ...value } as Record<string, unknown>
  for (const [key, rule] of Object.entries(redaction) as Array<[string, unknown]>) {
    if (rule === null) {
      result[key] = null
      continue
    }
    const current = result[key]
    if (current !== null && typeof current === 'object' && rule !== undefined) {
      result[key] = applyRedaction(current, rule as GuestRedaction<object>)
    }
  }
  return result as T
}

/** Catalogo serializado tal como lo ve quien lo mira (`sharingViewOf`). */
export function redactCatalogForGuest<T extends Record<string, unknown>>(
  serialized: T,
  view: AccessPointSharingView | undefined
): T {
  if (view?.sharedRole !== 'guest') return serialized
  return {
    ...applyRedaction(serialized, CATALOG_GUEST_REDACTION as GuestRedaction<T>),
    businessUnit: { businessUnitName: view.sharedBy },
  }
}

/** Salud del checador para la invitada. */
export function redactHealthForGuest(row: AccessPointHealthDto): AccessPointHealthDto {
  return applyRedaction(row, HEALTH_GUEST_REDACTION)
}

/** Perfil del checador para la invitada. */
export function redactProfileForGuest(dto: DeviceProfileDto): DeviceProfileDto {
  return applyRedaction(dto, PROFILE_GUEST_REDACTION)
}
