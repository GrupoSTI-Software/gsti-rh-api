import vine from '@vinejs/vine'

/**
 * Régimen de tenencia de la entrega (USRH1787189981880 · §11 del spec).
 * Fuente única del enum en el API — el modelo importa este tipo.
 */
export const TENURE_REGIMES = ['comodato', 'venta', 'propiedad_cliente'] as const

/**
 * Body para `POST /api/platform/devices/assignments`.
 * Registra la entrega de un aparato disponible a una empresa cliente.
 *
 * Reglas de negocio aplicadas en el servicio (no aquí):
 *   - El tenant debe tener la habilitación de biométricos encendida.
 *   - El aparato debe estar en estado `disponible`.
 *   - La transición y la creación ocurren en una sola transacción con
 *     forUpdate sobre la fila de platform_devices.
 *   - Reglas cruzadas régimen↔precio↔origen (USRH1787189981880): precio
 *     obligatorio solo en `venta`, régimen restringido por el origen de
 *     la unidad. Vine solo valida forma; la coherencia vive en el servicio.
 */
export const createDeviceAssignmentValidator = vine.compile(
  vine.object({
    platformDeviceId: vine.number().positive().withoutDecimals(),
    tenantPublicId: vine.string().trim().uuid(),
    deliveredAt: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .beforeOrEqual('today'),
    tenureRegime: vine.enum(TENURE_REGIMES),
    salePriceCents: vine.number().positive().withoutDecimals().optional(),
  })
)

/**
 * Query params para `GET /api/platform/devices/assignments`.
 * `tenantPublicId` es obligatorio — sin él no hay contexto de empresa.
 * `status=open` (default) filtra solo entregas vigentes (releasedAt IS NULL).
 */
export const listDeviceAssignmentsValidator = vine.compile(
  vine.object({
    tenantPublicId: vine.string().trim().uuid(),
    status: vine.enum(['open', 'all'] as const).optional(),
  })
)
