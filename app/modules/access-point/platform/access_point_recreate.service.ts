import db from '@adonisjs/lucid/services/db'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import { PLATFORM_DEVICE_ACCESS_POINT_RUN_UNSCOPED_REASON } from '#constants/platform_device_access_point'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { TenantContext } from '#utils/tenant_context'
import PlatformDeviceAccessPointService, {
  type PreloadAccessPointResult,
} from '#services/platform_device_access_point_service'

/**
 * Vuelve a dar a una unidad entregada el punto de acceso que la empresa borro.
 *
 * Sin esto la unidad queda entregada pero muda: sin direccion del canal ni
 * estado que consultar, y la unica salida era cerrar la entrega y volver a
 * hacerla. Reusa la precarga de la entrega, que ya sabe crear, adoptar o
 * revivir el renglon segun lo que encuentre, asi que repetirla es inofensivo.
 */
export default class AccessPointRecreateService {
  constructor(private readonly preloader = new PlatformDeviceAccessPointService()) {}

  /**
   * @param platformDeviceId - Unidad del inventario de plataforma.
   * @returns Desenlace de la precarga y el punto de acceso resultante.
   * @throws PlatformDeviceServiceError 404 — la unidad no existe o esta dada de baja.
   * @throws PlatformDeviceServiceError 422 — la unidad no esta entregada a ninguna empresa.
   * @throws PlatformDeviceServiceError 409 — la serie esta ocupada en otra empresa.
   */
  async recreate(platformDeviceId: number): Promise<PreloadAccessPointResult> {
    return TenantContext.runUnscoped(
      () =>
        db.transaction(async (trx) => {
          // Mismo candado que la entrega: dos clics simultaneos no crean dos puntos.
          const device = await PlatformDevice.query({ client: trx })
            .where('platform_device_id', platformDeviceId)
            .whereNull('platform_device_deleted_at')
            .preload('deviceModel')
            .forUpdate()
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

          const assignment = await PlatformDeviceAssignment.query({ client: trx })
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

          return this.preloader.preload({
            businessUnitId: assignment.businessUnitId,
            platformDeviceId: device.platformDeviceId,
            serialNumber: device.platformDeviceSerialNumber,
            modelName: device.deviceModel.platformDeviceModelName,
            trx,
          })
        }),
      PLATFORM_DEVICE_ACCESS_POINT_RUN_UNSCOPED_REASON
    )
  }
}
