import vine from '@vinejs/vine'

/**
 * Body para `POST /api/platform/devices/assignments`.
 * Registra la entrega de un aparato disponible a una empresa cliente.
 *
 * Reglas de negocio aplicadas en el servicio (no aquí):
 *   - El tenant debe tener la habilitación de biométricos encendida.
 *   - El aparato debe estar en estado `disponible`.
 *   - La transición y la creación ocurren en una sola transacción con
 *     forUpdate sobre la fila de platform_devices.
 */
export const createDeviceAssignmentValidator = vine.compile(
  vine.object({
    platformDeviceId: vine.number().positive().withoutDecimals(),
    tenantPublicId: vine.string().trim().uuid(),
    deliveredAt: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .beforeOrEqual('today'),
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
