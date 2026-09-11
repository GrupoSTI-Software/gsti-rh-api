import env from '#start/env'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { TenantContext } from '#utils/tenant_context'
import { channelAddressOf } from '#modules/adms/channel/channel_secret'

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
  /**
   * Lo que de verdad se teclea en el menu del checador: el secreto como
   * etiqueta delante del dominio comun. `null` cuando no hay dominio
   * configurado, que es cuando el canal todavia atiende solo por el comun.
   */
  address: string | null
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
   * @throws PlatformDeviceServiceError 422 — la unidad no esta entregada a ninguna empresa.
   * @throws PlatformDeviceServiceError 409 — esta entregada pero su punto de acceso ya no existe.
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
       * La entrega abierta manda, no el amarre historico.
       *
       * Cerrar una entrega NO borra el punto de acceso: solo lo desactiva
       * (`deactivateForDeviceWithin`, RN1 del inventario: "nunca borra"). Asi
       * que buscar por `platform_device_id` sin mas devolvia la direccion --y
       * el nombre de la empresa-- de un cliente que ya devolvio el aparato, y
       * ademas afirmaba que una unidad en existencias estaba entregada.
       */
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
          'Esta unidad no esta entregada a ninguna empresa, asi que todavia no tiene direccion de canal.'
        )
      }

      /**
       * Un punto de acceso desactivado SI cuenta: la adopcion idempotente no
       * lo reactiva, y exigir `active = 1` dejaria sin direccion a equipos
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
        address: channelAddressOf(
          accessPoint.accessPointChannelSecret,
          env.get('ADMS_CHANNEL_BASE_DOMAIN')
        ),
        secretSetAt: accessPoint.accessPointChannelSecretSetAt?.toISO() ?? null,
      }
    }, UNSCOPED_REASON)
  }
}
