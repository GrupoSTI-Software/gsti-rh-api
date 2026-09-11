import PlatformDevice from '#models/platform_device'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import type { PlatformDeviceOrigin, PlatformDeviceStockStatus } from '#models/platform_device'

/**
 * Lo que el inventario sabe de una serie que esta en cuarentena.
 *
 * Sin esto el operador no distingue los dos casos que se ven igual en la lista:
 * un equipo que GSTI compro, registro y todavia no entrega --y que al reclamar
 * se reusa con su origen y su costo-- de un aparato ajeno que nadie compro y
 * que entra como `del_cliente`. La diferencia decide si esta confirmando una
 * llegada o adoptando un desconocido.
 */
export interface QuarantineInventoryUnit {
  platformDeviceId: number
  modelId: number
  modelBrand: string
  modelName: string
  origin: PlatformDeviceOrigin
  stockStatus: PlatformDeviceStockStatus
  /**
   * Empresa de la entrega abierta, si la hay.
   *
   * Una serie `asignada` hace fallar el reclamo con 409; nombrar al tenant
   * convierte ese callejon en una instruccion: hay que cerrar esa entrega.
   */
  assignedTenantName: string | null
}

/**
 * Clave con la que se cruza una serie.
 *
 * La serie del inventario la teclea un humano al dar de alta la unidad y la
 * del canal la manda el aparato: `syz8252500376` y `SYZ8252500376` son el
 * mismo equipo, y sin normalizar la pantalla dice "nadie la compro" mientras
 * el reclamo si encuentra la unidad y la reusa. Dos verdades distintas para el
 * mismo aparato es peor que no cruzar nada.
 *
 * @param serial - Serie tal como la guarda el inventario o la manda el equipo.
 * @returns La serie en mayusculas y sin espacios de los extremos.
 */
export const quarantineSerialKey = (serial: string): string => serial.trim().toUpperCase()

/** Cruce de las series en cuarentena contra el inventario de plataforma. */
export default class QuarantineInventoryLookupService {
  /**
   * Busca en el inventario las series dadas.
   *
   * Dos consultas por lote, nunca una por fila: la lista de cuarentena trae
   * hasta 300 series y un N+1 aqui se paga en cada visita a la pantalla.
   *
   * @param serials - Series tal como las registro el canal.
   * @returns Mapa serie -> unidad de inventario. Las series que nadie compro no aparecen.
   */
  async findBySerials(serials: string[]): Promise<Map<string, QuarantineInventoryUnit>> {
    const found = new Map<string, QuarantineInventoryUnit>()
    if (serials.length === 0) return found

    const devices = await PlatformDevice.query()
      .whereIn('platform_device_serial_number', serials)
      .whereNull('platform_device_deleted_at')
      /**
       * `withTrashed` no es una licencia: es el unico modo de que esto no
       * reviente. El catalogo da de baja modelos sin mirar si alguna unidad
       * los usa, y un modelo borrado hace que el preload deje la relacion en
       * null --Lucid corre el hook de borrado logico tambien al precargar--.
       * Sin esto, una sola unidad con modelo retirado tumba la lista entera
       * de cuarentena con un 500, incluidas las filas sanas.
       *
       * Ademas es el dato correcto: quien mira la pantalla necesita saber que
       * aparato es, aunque el catalogo ya no lo ofrezca.
       */
      .preload('deviceModel', (query) => query.withTrashed())

    if (devices.length === 0) return found

    const tenantByDeviceId = await this.openAssignmentTenants(
      devices.map((device) => device.platformDeviceId)
    )

    for (const device of devices) {
      /**
       * El modelo puede no venir pese a `withTrashed` si la unidad apunta a
       * una fila que ya no existe. No vale la pena tumbar la lista por eso:
       * se degrada el nombre y el operador sigue viendo el resto.
       */
      const model = device.deviceModel
      found.set(quarantineSerialKey(device.platformDeviceSerialNumber), {
        platformDeviceId: device.platformDeviceId,
        modelId: device.platformDeviceModelId,
        modelBrand: model?.platformDeviceModelBrand ?? '',
        modelName: model?.platformDeviceModelName ?? '',
        origin: device.platformDeviceOrigin,
        stockStatus: device.platformDeviceStockStatus,
        assignedTenantName: tenantByDeviceId.get(device.platformDeviceId) ?? null,
      })
    }

    return found
  }

  /** Empresa de la entrega abierta de cada unidad, cuando existe. */
  private async openAssignmentTenants(deviceIds: number[]): Promise<Map<number, string>> {
    const byDeviceId = new Map<number, string>()
    if (deviceIds.length === 0) return byDeviceId

    const assignments = await PlatformDeviceAssignment.query()
      .whereIn('platform_device_id', deviceIds)
      .whereNull('platform_device_assignment_released_at')
      .whereNull('platform_device_assignment_deleted_at')
      .preload('businessUnit')

    for (const assignment of assignments) {
      /**
       * La empresa puede estar dada de baja: el preload la filtra y deja la
       * relacion sin cargar. Sin esta guarda, una entrega abierta de un tenant
       * borrado tumba toda la lista de cuarentena.
       */
      const tenantName = assignment.businessUnit?.businessUnitName
      if (tenantName) byDeviceId.set(assignment.platformDeviceId, tenantName)
    }

    return byDeviceId
  }
}
