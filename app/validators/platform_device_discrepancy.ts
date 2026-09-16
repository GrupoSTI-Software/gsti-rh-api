import vine from '@vinejs/vine'

/**
 * Los cuatro tipos de discrepancia entre el inventario de plataforma y los
 * puntos de acceso de los tenants (USRH1787195527841 · §4 del spec).
 * Fuente única del enum — el servicio y el validador lo derivan de aquí,
 * nunca se duplica el literal.
 */
export const DEVICE_DISCREPANCY_TYPES = [
  'AP_AUSENTE',
  'AP_HUERFANO',
  'SERIE_DESCONOCIDA',
  'SERIE_AUTODESCUBIERTA',
] as const

export type DeviceDiscrepancyType = (typeof DEVICE_DISCREPANCY_TYPES)[number]

/**
 * `GET /api/platform/devices/discrepancies` — filtros opcionales, sin
 * paginación (volumen bajo declarado, §11 del spec). `type` fuera del
 * catálogo o `tenantPublicId` con formato inválido → 422 PLT.DEV.VAL_INPUT.
 */
export const listDeviceDiscrepanciesValidator = vine.compile(
  vine.object({
    type: vine.enum(DEVICE_DISCREPANCY_TYPES).optional(),
    tenantPublicId: vine.string().trim().uuid().optional(),
  })
)
