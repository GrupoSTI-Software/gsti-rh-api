import AccessPoint from '#models/access_point'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { TenantContext } from '#utils/tenant_context'

const UNSCOPED_REASON =
  'vista de plataforma: el punto de acceso de una unidad puede ser de cualquier empresa'

/** La unidad, su entrega abierta y el punto de acceso que le corresponde hoy. */
export interface ActiveAccessPoint {
  device: PlatformDevice
  assignment: PlatformDeviceAssignment
  accessPoint: AccessPoint
}

/**
 * Resuelve el punto de acceso vigente de una unidad del inventario.
 *
 * Vive aparte porque la regla la comparten la direccion del canal y el estado
 * de conexion, y es una regla con trampa: cerrar una entrega NO borra el punto
 * de acceso, solo lo desactiva (RN1 del inventario, "nunca borra"). Quien
 * busque por el amarre historico acaba devolviendo los datos de un cliente que
 * ya devolvio el aparato.
 */
export default class ActiveAccessPointService {
  /**
   * @param platformDeviceId - Unidad del inventario de plataforma.
   * @returns La unidad, su entrega abierta y su punto de acceso.
   * @throws PlatformDeviceServiceError 404 — la unidad no existe o esta dada de baja.
   * @throws PlatformDeviceServiceError 422 — la unidad no esta entregada a ninguna empresa.
   * @throws PlatformDeviceServiceError 409 — esta entregada pero su punto de acceso ya no existe.
   */
  async resolve(platformDeviceId: number): Promise<ActiveAccessPoint> {
    return TenantContext.runUnscoped(async () => {
      const device = await PlatformDevice.query()
        .where('platform_device_id', platformDeviceId)
        .whereNull('platform_device_deleted_at')
        .first()

      if (!device) {
        throw new PlatformDeviceServiceError(
          `Unidad ${platformDeviceId} no encontrada`,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          404,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          'La unidad no existe en el inventario.'
        )
      }

      const assignment = await PlatformDeviceAssignment.query()
        .where('platform_device_id', platformDeviceId)
        .whereNull('platform_device_assignment_released_at')
        .whereNull('platform_device_assignment_deleted_at')
        .orderBy('platform_device_assignment_id', 'desc')
        .first()

      if (!assignment) {
        throw new PlatformDeviceServiceError(
          `La unidad ${platformDeviceId} no tiene entrega vigente`,
          PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT,
          422,
          PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT,
          'Esta unidad no esta entregada a ninguna empresa.'
        )
      }

      /**
       * Un punto de acceso desactivado SI cuenta: la adopcion idempotente no
       * lo reactiva, y exigir `active = 1` dejaria fuera a equipos que estan
       * legitimamente entregados. Lo que no cuenta es uno borrado.
       */
      const accessPoint = await AccessPoint.query()
        .where('platform_device_id', platformDeviceId)
        .where('business_unit_id', assignment.businessUnitId)
        .whereNull('access_point_deleted_at')
        .orderBy('access_point_id', 'desc')
        .first()

      if (!accessPoint) {
        throw new PlatformDeviceServiceError(
          `La unidad ${platformDeviceId} esta entregada pero no tiene punto de acceso`,
          PLATFORM_DEVICE_ERROR_CODES.ACCESS_POINT_ABSENT,
          409,
          PLATFORM_DEVICE_ERROR_CODES.ACCESS_POINT_ABSENT,
          'La empresa borro el punto de acceso de este equipo. Hay que volver a crearlo para que el aparato tenga direccion.'
        )
      }

      return { device, assignment, accessPoint }
    }, UNSCOPED_REASON)
  }
}
