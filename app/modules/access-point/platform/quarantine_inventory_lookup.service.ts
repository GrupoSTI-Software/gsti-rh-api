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
      .preload('deviceModel')

    if (devices.length === 0) return found

    const tenantByDeviceId = await this.openAssignmentTenants(
      devices.map((device) => device.platformDeviceId)
    )

    for (const device of devices) {
      found.set(device.platformDeviceSerialNumber, {
        platformDeviceId: device.platformDeviceId,
        modelId: device.platformDeviceModelId,
        modelBrand: device.deviceModel.platformDeviceModelBrand,
        modelName: device.deviceModel.platformDeviceModelName,
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
