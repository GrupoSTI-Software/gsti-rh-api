import db from '@adonisjs/lucid/services/db'
import { TenantContext } from '../utils/tenant_context.js'
import { PLATFORM_DEVICE_DISCREPANCY_RUN_UNSCOPED_REASON } from '../constants/platform_device_access_point.js'
import type { DeviceDiscrepancyType } from '../validators/platform_device_discrepancy.js'

export interface DeviceDiscrepancyItem {
  type: DeviceDiscrepancyType
  deviceId: number | null
  serialNumber: string
  tenantPublicId: string
  tenantName: string
  accessPointId: number | null
}

export interface ListDeviceDiscrepanciesInput {
  type?: DeviceDiscrepancyType
  tenantPublicId?: string
}

/**
 * Calcula al vuelo las discrepancias entre el inventario de plataforma
 * (`platform_devices`) y los puntos de acceso de cada tenant
 * (`access_points`) — USRH1787195527841 · §10 del spec.
 *
 * **No persiste nada.** Cuatro consultas con constructor crudo (nunca
 * modelos Lucid, para no arrastrar el mixin `withBusinessUnitScope` ni
 * `SoftDeletes`), cada una filtrando a mano su `*_deleted_at` — el
 * constructor crudo NO aplica soft-deletes automáticamente (precedente:
 * `platform_tenant_service.ts:97-112`). Envueltas en un solo
 * `TenantContext.runUnscoped` para dejar rastro auditable de la lectura
 * cruzada de todas las empresas (RN6, CA-9: cero escrituras).
 */
export default class PlatformDeviceDiscrepancyService {
  async list(input: ListDeviceDiscrepanciesInput = {}): Promise<DeviceDiscrepancyItem[]> {
    return TenantContext.runUnscoped(
      () => this.listWithin(input),
      PLATFORM_DEVICE_DISCREPANCY_RUN_UNSCOPED_REASON
    )
  }

  private async listWithin(
    input: ListDeviceDiscrepanciesInput
  ): Promise<DeviceDiscrepancyItem[]> {
    const wantedTypes = input.type ? [input.type] : undefined
    const results: DeviceDiscrepancyItem[] = []

    if (!wantedTypes || wantedTypes.includes('AP_AUSENTE')) {
      results.push(...(await this.findApAusente(input.tenantPublicId)))
    }
    if (!wantedTypes || wantedTypes.includes('AP_HUERFANO')) {
      results.push(...(await this.findApHuerfano(input.tenantPublicId)))
    }
    if (!wantedTypes || wantedTypes.includes('SERIE_DESCONOCIDA') || wantedTypes.includes('SERIE_AUTODESCUBIERTA')) {
      results.push(...(await this.findSerieSinInventario(input.tenantPublicId, wantedTypes)))
    }

    return results
  }

  /**
   * `AP_AUSENTE` (CA-1, RN1.1): unidad con entrega vigente cuyo `access_point`
   * ligado no existe, está borrado o quedó `access_point_active = 0`.
   * El `LEFT JOIN` es a propósito: `AP_AUSENTE` incluye el caso en que la fila
   * nunca existió (la unidad se asignó antes de la precarga).
   */
  private async findApAusente(tenantPublicId?: string): Promise<DeviceDiscrepancyItem[]> {
    const query = db
      .from('platform_devices as d')
      .join('platform_device_assignments as a', (join) => {
        join
          .on('a.platform_device_id', 'd.platform_device_id')
          .andOnNull('a.platform_device_assignment_released_at')
          .andOnNull('a.platform_device_assignment_deleted_at')
      })
      .join('business_units as bu', (join) => {
        join.on('bu.business_unit_id', 'a.business_unit_id').andOnNull('bu.business_unit_deleted_at')
      })
      .leftJoin('access_points as ap', (join) => {
        join
          .on('ap.platform_device_id', 'd.platform_device_id')
          .andOn('ap.business_unit_id', 'a.business_unit_id')
          .andOnNull('ap.access_point_deleted_at')
      })
      .whereNull('d.platform_device_deleted_at')
      .where((q) => {
        q.whereNull('ap.access_point_id').orWhere('ap.access_point_active', 0)
      })
      .select(
        'd.platform_device_id as deviceId',
        'd.platform_device_serial_number as serialNumber',
        'bu.business_unit_public_id as tenantPublicId',
        'bu.business_unit_name as tenantName',
        'ap.access_point_id as accessPointId'
      )

    if (tenantPublicId) {
      query.where('bu.business_unit_public_id', tenantPublicId)
    }

    const rows = await query
    return rows.map((r) => ({
      type: 'AP_AUSENTE' as const,
      deviceId: r.deviceId,
      serialNumber: r.serialNumber,
      tenantPublicId: r.tenantPublicId,
      tenantName: r.tenantName,
      accessPointId: r.accessPointId ?? null,
    }))
  }

  /**
   * `AP_HUERFANO` (CA-2, RN1.2): `access_point` vivo y encendido con
   * `platform_device_id` apuntando a una unidad SIN entrega vigente. Debe ser
   * raro con el apagado de 1883 corriendo — si aparece en volumen es señal
   * de que ese apagado no está corriendo.
   */
  private async findApHuerfano(tenantPublicId?: string): Promise<DeviceDiscrepancyItem[]> {
    const query = db
      .from('access_points as ap')
      .join('platform_devices as d', 'd.platform_device_id', 'ap.platform_device_id')
      .join('business_units as bu', (join) => {
        join.on('bu.business_unit_id', 'ap.business_unit_id').andOnNull('bu.business_unit_deleted_at')
      })
      .leftJoin('platform_device_assignments as a', (join) => {
        join
          .on('a.platform_device_id', 'ap.platform_device_id')
          .andOnNull('a.platform_device_assignment_released_at')
          .andOnNull('a.platform_device_assignment_deleted_at')
      })
      .whereNull('ap.access_point_deleted_at')
      .where('ap.access_point_active', 1)
      .whereNotNull('ap.platform_device_id')
      .whereNull('a.platform_device_assignment_id')
      .select(
        'd.platform_device_id as deviceId',
        'd.platform_device_serial_number as serialNumber',
        'bu.business_unit_public_id as tenantPublicId',
        'bu.business_unit_name as tenantName',
        'ap.access_point_id as accessPointId'
      )

    if (tenantPublicId) {
      query.where('bu.business_unit_public_id', tenantPublicId)
    }

    const rows = await query
    return rows.map((r) => ({
      type: 'AP_HUERFANO' as const,
      deviceId: r.deviceId,
      serialNumber: r.serialNumber,
      tenantPublicId: r.tenantPublicId,
      tenantName: r.tenantName,
      accessPointId: r.accessPointId,
    }))
  }

  /**
   * `SERIE_DESCONOCIDA` / `SERIE_AUTODESCUBIERTA` (CA-3, CA-4, CA-5, §1.1):
   * `access_point` vivo con serie que no existe en `platform_devices`. Es UNA
   * sola consulta que bifurca el tipo con `CASE WHEN platform_device_id IS
   * NULL` — no dos consultas — para que CA-5 (excluyentes, sin solape ni
   * hueco) se cumpla por construcción, no por coincidencia.
   *
   * `platform_device_id IS NULL` es el discriminante de `SERIE_AUTODESCUBIERTA`:
   * el BO del cliente no puede escribir un número de serie (campo bloqueado
   * al alta y al editar — verificado en el spec, §1.1), así que una serie
   * viva sin ese amarre solo pudo escribirla el anuncio automático del
   * aparato (`start/socket.ts`).
   *
   * `DISTINCT` por `(serie, business_unit_id)` como defensa adicional, por si
   * el UNIQUE de `access_point_serial_number` no estuviera puesto todavía.
   */
  private async findSerieSinInventario(
    tenantPublicId: string | undefined,
    wantedTypes: DeviceDiscrepancyType[] | undefined
  ): Promise<DeviceDiscrepancyItem[]> {
    const query = db
      .from('access_points as ap')
      .join('business_units as bu', (join) => {
        join.on('bu.business_unit_id', 'ap.business_unit_id').andOnNull('bu.business_unit_deleted_at')
      })
      .leftJoin('platform_devices as d', (join) => {
        join
          .on('d.platform_device_serial_number', 'ap.access_point_serial_number')
          .andOnNull('d.platform_device_deleted_at')
      })
      .whereNull('ap.access_point_deleted_at')
      .whereNotNull('ap.access_point_serial_number')
      .where('ap.access_point_serial_number', '!=', '')
      .whereNull('d.platform_device_id')
      .distinct('ap.access_point_serial_number', 'ap.business_unit_id')
      .select(
        'ap.access_point_serial_number as serialNumber',
        'bu.business_unit_public_id as tenantPublicId',
        'bu.business_unit_name as tenantName',
        'ap.access_point_id as accessPointId',
        'ap.platform_device_id as apPlatformDeviceId'
      )

    if (tenantPublicId) {
      query.where('bu.business_unit_public_id', tenantPublicId)
    }

    const rows = await query
    return rows
      .map((r) => ({
        type: (r.apPlatformDeviceId === null
          ? 'SERIE_AUTODESCUBIERTA'
          : 'SERIE_DESCONOCIDA') as DeviceDiscrepancyType,
        deviceId: null,
        serialNumber: r.serialNumber,
        tenantPublicId: r.tenantPublicId,
        tenantName: r.tenantName,
        accessPointId: r.accessPointId,
      }))
      .filter((item) => !wantedTypes || wantedTypes.includes(item.type))
  }
}
