import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { TenantContext } from '#utils/tenant_context'

const UNSCOPED_REASON =
  'direccion del canal: plataforma consulta el punto de acceso de cualquier empresa'

/** Lo que el operador necesita para configurar el aparato en sitio. */
export interface DeviceChannelAddress {
  platformDeviceId: number
  serialNumber: string
  accessPointId: number
  accessPointName: string
  businessUnitId: number
  businessUnitName: string | null
  /**
   * Falso en los equipos anteriores al canal propio.
   *
   * Siguen atendidos durante la convivencia, pero no tienen direccion que
   * teclear: el operador tiene que saberlo en vez de leer un campo vacio y
   * creer que la pantalla fallo.
   */
  hasSecret: boolean
  secret: string | null
  secretSetAt: string | null
}

/**
 * Direccion propia del equipo, para volver a teclearla en el aparato.
 *
 * El secreto se guarda cifrado y NO hasheado justamente para esto (migracion
 * 1788912000026): quien instala o repone un checador tiene que poder leerlo.
 * Hasta ahora solo salia en la respuesta del reclamo de cuarentena, una sola
 * vez -- asi que un equipo entregado por la via normal del inventario nacia con
 * su direccion y nadie podia verla nunca.
 */
export default class DeviceChannelSecretService {
  /**
   * Lee la direccion del canal del punto de acceso vigente de una unidad.
   *
   * @param platformDeviceId - Unidad del inventario de plataforma.
   * @returns Punto de acceso, empresa y direccion propia del equipo.
   * @throws PlatformDeviceServiceError 404 — la unidad no existe o esta dada de baja.
   * @throws PlatformDeviceServiceError 409 — la unidad no esta entregada a ninguna empresa.
   */
  async show(platformDeviceId: number): Promise<DeviceChannelAddress> {
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

      /**
       * El punto de acceso se amarra a la unidad al entregarla. Uno dado de
       * baja no cuenta: esa entrega ya se cerro y su direccion no sirve para
       * instalar nada.
       */
      const accessPoint = await AccessPoint.query()
        .where('platform_device_id', platformDeviceId)
        .whereNull('access_point_deleted_at')
        .orderBy('access_point_id', 'desc')
        .first()

      if (!accessPoint) {
        throw new PlatformDeviceServiceError(
          `La unidad ${platformDeviceId} no tiene punto de acceso vigente`,
          PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT,
          409,
          PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT,
          'Esta unidad no esta entregada a ninguna empresa, asi que todavia no tiene direccion de canal.'
        )
      }

      const tenant = await BusinessUnit.query()
        .where('business_unit_id', accessPoint.businessUnitId)
        .first()

      return {
        platformDeviceId: device.platformDeviceId,
        serialNumber: device.platformDeviceSerialNumber,
        accessPointId: accessPoint.accessPointId,
        accessPointName: accessPoint.accessPointName,
        businessUnitId: accessPoint.businessUnitId,
        businessUnitName: tenant?.businessUnitName ?? null,
        hasSecret: accessPoint.accessPointChannelSecret !== null,
        secret: accessPoint.accessPointChannelSecret,
        secretSetAt: accessPoint.accessPointChannelSecretSetAt?.toISO() ?? null,
      }
    }, UNSCOPED_REASON)
  }
}
