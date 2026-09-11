import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import { TenantContext } from '#utils/tenant_context'
import { channelAddressOf } from '#modules/adms/channel/channel_secret'
import ActiveAccessPointService from './active_access_point.service.js'

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
  constructor(private readonly active = new ActiveAccessPointService()) {}

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
    const { device, accessPoint } = await this.active.resolve(platformDeviceId)

    return TenantContext.runUnscoped(async () => {
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
