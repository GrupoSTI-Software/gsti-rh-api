import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import PlatformDevice, {
  type PlatformDeviceOrigin,
  type PlatformDeviceRetireReason,
  type PlatformDeviceStockStatus,
} from '#models/platform_device'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import PlatformDeviceModel from '#models/platform_device_model'
import { PLATFORM_DEVICE_ERROR_CODES } from '../constants/platform_device_error_codes.js'
import { PlatformDeviceServiceError } from '../exceptions/platform_device_service_error.js'

/** Forma en que se devuelve el modelo resuelto dentro de un registro de unidad. */
interface ResolvedDeviceModel {
  platformDeviceModelId: number
  platformDeviceModelBrand: string
  platformDeviceModelName: string
  platformDeviceModelSlug: string
}

/** Empresa que tiene colocado el aparato (disponible desde ticket 1876). */
export interface AssignedTenant {
  publicId: string
  name: string
}

/**
 * Forma serializable que el controlador envía al cliente.
 * Campos en camelCase completo, espejo directo de las columnas de la tabla
 * (§11 del spec). Ningún campo de empresa propio del aparato (R9).
 * `assignedTenant` proviene de `platform_device_assignments` (ticket 1876);
 * mientras no exista esa tabla se entrega siempre como `null`.
 */
export interface DeviceRecord {
  platformDeviceId: number
  platformDeviceSerialNumber: string
  platformDeviceOrigin: PlatformDeviceOrigin
  platformDeviceStockStatus: PlatformDeviceStockStatus
  /** true = en circulación; false = apartado por operador (toggle HU 1877) */
  platformDeviceActive: boolean
  platformDeviceAcquisitionCostCents: number | null
  platformDeviceAcquisitionDate: string | null
  assignedTenant: AssignedTenant | null
  model: ResolvedDeviceModel
}

/** Respuesta del listado, con meta de paginación (§11). */
export interface DeviceListResult {
  devices: DeviceRecord[]
  meta: {
    total: number
    page: number
    limit: number
    lastPage: number
  }
}

/** Contadores por modelo para `/summary`. */
export interface DeviceModelSummary {
  modelId: number
  modelName: string
  modelSlug: string
  total: number
  disponibles: number
  asignadas: number
  retiradas: number
  delCliente: number
}

/** Respuesta de `GET /api/platform/devices/units/summary`. */
export interface DeviceInventorySummary {
  total: number
  disponibles: number
  asignadas: number
  retiradas: number
  delCliente: number
  porModelo: DeviceModelSummary[]
}

interface CreateDeviceInput {
  platformDeviceSerialNumber: string
  platformDeviceModelId: number
  platformDeviceOrigin: PlatformDeviceOrigin
  platformDeviceAcquisitionCostCents?: number | null
  platformDeviceAcquisitionDate?: string | null
}

interface ListDevicesInput {
  search?: string
  modelId?: number
  status?: PlatformDeviceStockStatus
  origin?: PlatformDeviceOrigin
  tenantPublicId?: string
  page?: number
  limit?: number
}

/**
 * Servicio del inventario general de aparatos biométricos de GSTI.
 * Ref: USRH1787189981873 · §11 del spec.
 *
 * Reglas de negocio (R1-R12 del spec):
 *   R2 – Serial único en toda la plataforma, incluyendo aparatos con baja lógica.
 *   R3 – Solo modelos en estado `vigente` son elegibles para nuevas altas.
 *   R5 – Aparatos `propia`: pueden llevar costo y fecha de adquisición.
 *   R6 – Aparatos `del_cliente`: sin costo ni fecha; se rechaza si vienen.
 *   R7 – Aparatos `propia`: nacen en `disponible`.
 *   R8 – Aparatos `del_cliente`: nunca cuentan como existencia colocable.
 *   R9 – Ningún aparato nace atado a una empresa.
 *
 * Orden de validación en `create()` (§11 del spec, importa para el UX):
 *   1) Modelo existe → 404
 *   2) Modelo vigente → 422 MODEL_NOT_SELECTABLE
 *   3) Coherencia origen/costo → 422 COST_NOT_ALLOWED_FOR_ORIGIN
 *   4) Serie libre → 422 DEVICE_SERIAL_TAKEN
 *   5) Crear
 * La regla 3 va antes que la 4 para que un alta con dos errores reporte
 * primero el que el operador puede corregir sin consultar nada externo.
 */
export default class PlatformDeviceService {
  private serialize(device: PlatformDevice): DeviceRecord {
    const model = device.deviceModel

    return {
      platformDeviceId: device.platformDeviceId,
      platformDeviceSerialNumber: device.platformDeviceSerialNumber,
      platformDeviceOrigin: device.platformDeviceOrigin,
      platformDeviceStockStatus: device.platformDeviceStockStatus,
      platformDeviceActive: device.platformDeviceActive === 1,
      platformDeviceAcquisitionCostCents: device.platformDeviceAcquisitionCostCents,
      platformDeviceAcquisitionDate: device.platformDeviceAcquisitionDate,
      // platform_device_assignments aún no existe (ticket 1876).
      // Se entrega null como degradación documentada en §11 del spec 1874.
      assignedTenant: null,
      model: {
        platformDeviceModelId: model.platformDeviceModelId,
        platformDeviceModelBrand: model.platformDeviceModelBrand,
        platformDeviceModelName: model.platformDeviceModelName,
        platformDeviceModelSlug: model.platformDeviceModelSlug,
      },
    }
  }

  /**
   * Calcula los contadores del parque de inventario en una sola consulta SQL
   * agrupada (sin N+1). No acepta filtros — RN8 del spec: los contadores
   * responden "cuánto hay", no "cuánto se está viendo".
   *
   * RN3: `disponibles` solo cuenta `origin = 'propia' AND status = 'disponible'`.
   * `delCliente` cuenta `origin = 'del_cliente'` sin importar el status.
   *
   * `porModelo` incluye todos los modelos vigentes del catálogo, incluso
   * los que tienen cero aparatos registrados.
   *
   * Ref: USRH1787189981874 · CA-1, CA-2 · §10 del spec.
   */
  async getInventorySummary(): Promise<DeviceInventorySummary> {
    // Consulta agrupada: una fila por (modelo × status × origin).
    // El filtro de deleted_at va a mano porque la consulta cruda no pasa
    // por el hook de SoftDeletes (molde: platform_tenant_service.ts:101,106).
    type AggRow = {
      modelId: number
      modelName: string
      modelSlug: string
      status: PlatformDeviceStockStatus
      origin: PlatformDeviceOrigin
      cnt: string
    }

    const rows = await db
      .from('platform_devices as d')
      .join('platform_device_models as m', 'm.platform_device_model_id', 'd.platform_device_model_id')
      .whereNull('d.platform_device_deleted_at')
      .select(
        'm.platform_device_model_id as modelId',
        'm.platform_device_model_name as modelName',
        'm.platform_device_model_slug as modelSlug',
        'd.platform_device_stock_status as status',
        'd.platform_device_origin as origin'
      )
      .count('* as cnt')
      .groupBy(
        'm.platform_device_model_id',
        'm.platform_device_model_name',
        'm.platform_device_model_slug',
        'd.platform_device_stock_status',
        'd.platform_device_origin'
      ) as AggRow[]

    // Todos los modelos del catálogo para incluir los de cero aparatos.
    const allModels = await PlatformDeviceModel.query()
      .whereNull('platform_device_model_deleted_at')
      .orderBy('platform_device_model_name')

    const globalCounters = { total: 0, disponibles: 0, asignadas: 0, retiradas: 0, delCliente: 0 }

    // Mapa de contadores por modelId para plegar las filas agrupadas.
    const byModel = new Map<number, DeviceModelSummary>()

    for (const m of allModels) {
      byModel.set(m.platformDeviceModelId, {
        modelId: m.platformDeviceModelId,
        modelName: m.platformDeviceModelName,
        modelSlug: m.platformDeviceModelSlug,
        total: 0,
        disponibles: 0,
        asignadas: 0,
        retiradas: 0,
        delCliente: 0,
      })
    }

    for (const row of rows) {
      const cnt = Number(row.cnt)
      const mc = byModel.get(row.modelId)
      if (!mc) continue

      mc.total += cnt
      globalCounters.total += cnt

      if (row.origin === 'del_cliente') {
        mc.delCliente += cnt
        globalCounters.delCliente += cnt
      } else if (row.status === 'disponible') {
        mc.disponibles += cnt
        globalCounters.disponibles += cnt
      } else if (row.status === 'asignada') {
        mc.asignadas += cnt
        globalCounters.asignadas += cnt
      } else if (row.status === 'retirada') {
        mc.retiradas += cnt
        globalCounters.retiradas += cnt
      }
    }

    return {
      ...globalCounters,
      porModelo: [...byModel.values()],
    }
  }

  /**
   * Lista unidades activas con filtros opcionales y paginación server-side.
   * Extiende el listado base de 1873 con los filtros del tablero (1874).
   *
   * Filtro `tenantPublicId`: requiere `platform_device_assignments` (ticket 1876).
   * Mientras esa tabla no exista, el filtro devuelve siempre array vacío
   * sin lanzar error — degradación documentada en §11 del spec 1874.
   *
   * Sin N+1: preload resuelve el modelo en una sola consulta adicional.
   */
  async listAll(input: ListDevicesInput = {}): Promise<DeviceListResult> {
    const page = input.page ?? 1
    const limit = input.limit ?? 20

    // Si filtra por empresa y la tabla de asignaciones aún no existe,
    // devolver vacío sin error (degradación declarada en spec §11).
    const assignmentsExist = await this.assignmentsTableExists()
    if (input.tenantPublicId && !assignmentsExist) {
      return {
        devices: [],
        meta: { total: 0, page, limit, lastPage: 1 },
      }
    }

    const buildQuery = () => {
      const q = PlatformDevice.query().whereNull('platform_device_deleted_at')

      if (input.search) {
        q.where('platform_device_serial_number', 'like', `%${input.search}%`)
      }
      if (input.modelId) {
        q.where('platform_device_model_id', input.modelId)
      }
      if (input.status) {
        q.where('platform_device_stock_status', input.status)
      }
      if (input.origin) {
        q.where('platform_device_origin', input.origin)
      }
      if (input.tenantPublicId && assignmentsExist) {
        q.whereIn('platform_device_id', (sub) => {
          sub
            .from('platform_device_assignments as a')
            .join('business_units as bu', 'bu.business_unit_id', 'a.business_unit_id')
            .where('bu.business_unit_public_id', input.tenantPublicId!)
            .whereNull('a.platform_device_assignment_released_at')
            .whereNull('a.platform_device_assignment_deleted_at')
            .select('a.platform_device_id')
        })
      }

      return q
    }

    const total = await buildQuery()
      .count('* as total')
      .then((rows) => Number(rows[0].$extras.total))

    const devices = await buildQuery()
      .preload('deviceModel')
      .orderBy('platform_device_created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

    return {
      devices: devices.map((d) => this.serialize(d)),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.max(1, Math.ceil(total / limit)),
      },
    }
  }

  /**
   * Detecta si la tabla `platform_device_assignments` ya existe en el esquema.
   * Permite degradación sin error mientras el ticket 1876 no se integre.
   */
  private async assignmentsTableExists(): Promise<boolean> {
    try {
      await db.from('platform_device_assignments').limit(0)
      return true
    } catch {
      return false
    }
  }

  /**
   * Devuelve el detalle de una unidad por id.
   *
   * @throws PlatformDeviceServiceError 404 si no existe o fue dada de baja.
   */
  async getById(deviceId: number): Promise<DeviceRecord> {
    const device = await PlatformDevice.query()
      .where('platform_device_id', deviceId)
      .whereNull('platform_device_deleted_at')
      .preload('deviceModel')
      .first()

    if (!device) {
      throw new PlatformDeviceServiceError(
        `Aparato ${deviceId} no encontrado`,
        PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
        404,
        PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
        'El aparato del inventario solicitado no existe o fue dado de baja.'
      )
    }

    return this.serialize(device)
  }

  /**
   * Registra una nueva unidad en el inventario.
   * Orden de validación del spec §11 — crítico para el mensaje que ve el usuario.
   *
   * @throws PlatformDeviceServiceError 404 si el modelo no existe.
   * @throws PlatformDeviceServiceError 422 MODEL_NOT_SELECTABLE si el modelo no es vigente.
   * @throws PlatformDeviceServiceError 422 COST_NOT_ALLOWED_FOR_ORIGIN si del_cliente trae costo/fecha.
   * @throws PlatformDeviceServiceError 422 DEVICE_SERIAL_TAKEN si el serial ya existe.
   */
  async create(input: CreateDeviceInput): Promise<DeviceRecord> {
    // 1) Modelo existe → 404
    const model = await PlatformDeviceModel.query()
      .where('platform_device_model_id', input.platformDeviceModelId)
      .whereNull('platform_device_model_deleted_at')
      .first()

    if (!model) {
      throw new PlatformDeviceServiceError(
        `Modelo ${input.platformDeviceModelId} no encontrado`,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_FOUND,
        404,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_FOUND,
        'El modelo de dispositivo seleccionado no existe.'
      )
    }

    // 2) Modelo vigente → 422 MODEL_NOT_SELECTABLE
    if (model.platformDeviceModelStatus !== 'vigente') {
      throw new PlatformDeviceServiceError(
        `Modelo "${model.platformDeviceModelSlug}" no está vigente (estado: ${model.platformDeviceModelStatus})`,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_SELECTABLE,
        422,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_SELECTABLE,
        `Solo se pueden registrar aparatos contra modelos en estado vigente. El modelo seleccionado está en estado "${model.platformDeviceModelStatus}".`
      )
    }

    // 3) Coherencia origen/costo → 422 COST_NOT_ALLOWED_FOR_ORIGIN
    if (input.platformDeviceOrigin === 'del_cliente') {
      const hasCost = input.platformDeviceAcquisitionCostCents !== null && input.platformDeviceAcquisitionCostCents !== undefined
      const hasDate = input.platformDeviceAcquisitionDate !== null && input.platformDeviceAcquisitionDate !== undefined

      if (hasCost || hasDate) {
        throw new PlatformDeviceServiceError(
          'Aparatos del cliente no admiten costo ni fecha de adquisición',
          PLATFORM_DEVICE_ERROR_CODES.COST_NOT_ALLOWED_FOR_ORIGIN,
          422,
          PLATFORM_DEVICE_ERROR_CODES.COST_NOT_ALLOWED_FOR_ORIGIN,
          'Un aparato de origen "del cliente" no puede registrarse con costo ni fecha de adquisición.'
        )
      }
    }

    // 4) Serie libre → 422 DEVICE_SERIAL_TAKEN
    // Se comprueba también contra bajas lógicas (R2 del spec: la serie queda
    // ocupada para siempre una vez asignada a un aparato físico real).
    const existing = await PlatformDevice.query()
      .withTrashed()
      .where('platform_device_serial_number', input.platformDeviceSerialNumber)
      .first()

    if (existing) {
      throw new PlatformDeviceServiceError(
        `El serial "${input.platformDeviceSerialNumber}" ya está registrado`,
        PLATFORM_DEVICE_ERROR_CODES.DEVICE_SERIAL_TAKEN,
        422,
        PLATFORM_DEVICE_ERROR_CODES.DEVICE_SERIAL_TAKEN,
        'Ya existe una unidad registrada con ese número de serie.'
      )
    }

    // 5) Crear
    try {
      const device = await PlatformDevice.create({
        platformDeviceModelId: input.platformDeviceModelId,
        platformDeviceSerialNumber: input.platformDeviceSerialNumber,
        platformDeviceOrigin: input.platformDeviceOrigin,
        platformDeviceStockStatus: 'disponible',
        platformDeviceAcquisitionCostCents: input.platformDeviceAcquisitionCostCents ?? null,
        platformDeviceAcquisitionDate: input.platformDeviceAcquisitionDate ?? null,
        platformDeviceActive: 1,
      })

      await device.load('deviceModel')
      return this.serialize(device)
    } catch (error: unknown) {
      // Captura la carrera: dos altas concurrentes con la misma serie.
      // MySQL lanza ER_DUP_ENTRY (código 1062) cuando el UNIQUE lo frena.
      // Sin esta captura, la carrera produce un 500 en lugar del error correcto.
      const dbError = error as { code?: string; errno?: number }
      if (dbError?.code === 'ER_DUP_ENTRY' || dbError?.errno === 1062) {
        throw new PlatformDeviceServiceError(
          `El serial "${input.platformDeviceSerialNumber}" ya está registrado (carrera concurrente)`,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_SERIAL_TAKEN,
          422,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_SERIAL_TAKEN,
          'Ya existe una unidad registrada con ese número de serie.'
        )
      }
      throw error
    }
  }

  // ─── Ciclo de vida (USRH1787189981877) ────────────────────────────────────

  /**
   * Aparta (active=false) o devuelve a circulación (active=true) un aparato.
   * Un aparato retirado no se puede reactivar (CA-7).
   * Un aparato con entrega abierta no se puede apartar (CA-6).
   *
   * @throws PlatformDeviceServiceError 404 — aparato no encontrado.
   * @throws PlatformDeviceServiceError 422 LIFECYCLE_HAS_OPEN_ASSIGNMENT — entrega abierta.
   * @throws PlatformDeviceServiceError 422 LIFECYCLE_ALREADY_RETIRED — ya retirado.
   */
  async setDeviceActive(
    deviceId: number,
    active: boolean
  ): Promise<{ deviceId: number; serialNumber: string; active: boolean }> {
    return db.transaction(async (trx) => {
      const device = await PlatformDevice.query({ client: trx })
        .where('platform_device_id', deviceId)
        .whereNull('platform_device_deleted_at')
        .forUpdate()
        .first()

      if (!device) {
        throw new PlatformDeviceServiceError(
          `Aparato ${deviceId} no encontrado`,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          404,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          'El aparato del inventario no existe o fue dado de baja.'
        )
      }

      if (device.platformDeviceStockStatus === 'retirada') {
        throw new PlatformDeviceServiceError(
          `Aparato ${deviceId} ya está retirado`,
          PLATFORM_DEVICE_ERROR_CODES.LIFECYCLE_ALREADY_RETIRED,
          422,
          PLATFORM_DEVICE_ERROR_CODES.LIFECYCLE_ALREADY_RETIRED,
          'El aparato ya fue retirado definitivamente y no puede volver a circulación ni ser apartado de nuevo.'
        )
      }

      // Solo bloquear apartar (active=false); reactivar no requiere el guard.
      if (!active) {
        await this.assertNoOpenAssignment(deviceId, trx)
      }

      device.useTransaction(trx)
      device.platformDeviceActive = active ? 1 : 0
      await device.save()

      return {
        deviceId: device.platformDeviceId,
        serialNumber: device.platformDeviceSerialNumber,
        active: device.platformDeviceActive === 1,
      }
    })
  }

  /**
   * Retira definitivamente un aparato del inventario con motivo obligatorio.
   * El retiro es irreversible (RN4). No borra el registro ni libera el serial.
   *
   * @throws PlatformDeviceServiceError 404 — aparato no encontrado.
   * @throws PlatformDeviceServiceError 422 LIFECYCLE_HAS_OPEN_ASSIGNMENT — entrega abierta.
   * @throws PlatformDeviceServiceError 422 LIFECYCLE_ALREADY_RETIRED — ya retirado.
   */
  async retireDevice(
    deviceId: number,
    reason: PlatformDeviceRetireReason,
    retiredAt?: Date
  ): Promise<{
    deviceId: number
    serialNumber: string
    status: string
    retireReason: string
    retiredAt: string
  }> {
    return db.transaction(async (trx) => {
      const device = await PlatformDevice.query({ client: trx })
        .where('platform_device_id', deviceId)
        .whereNull('platform_device_deleted_at')
        .forUpdate()
        .first()

      if (!device) {
        throw new PlatformDeviceServiceError(
          `Aparato ${deviceId} no encontrado`,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          404,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          'El aparato del inventario no existe o fue dado de baja.'
        )
      }

      if (device.platformDeviceStockStatus === 'retirada') {
        throw new PlatformDeviceServiceError(
          `Aparato ${deviceId} ya está retirado`,
          PLATFORM_DEVICE_ERROR_CODES.LIFECYCLE_ALREADY_RETIRED,
          422,
          PLATFORM_DEVICE_ERROR_CODES.LIFECYCLE_ALREADY_RETIRED,
          'El aparato ya fue retirado definitivamente. El retiro es irreversible.'
        )
      }

      await this.assertNoOpenAssignment(deviceId, trx)

      const retiredAtStr = retiredAt
        ? DateTime.fromJSDate(retiredAt).toISODate()!
        : DateTime.now().toISODate()!

      device.useTransaction(trx)
      device.platformDeviceStockStatus = 'retirada'
      device.platformDeviceRetireReason = reason
      device.platformDeviceRetiredAt = retiredAtStr
      await device.save()

      return {
        deviceId: device.platformDeviceId,
        serialNumber: device.platformDeviceSerialNumber,
        status: 'retirada',
        retireReason: reason,
        retiredAt: retiredAtStr,
      }
    })
  }

  /**
   * Guarda común: rechaza la operación si el aparato tiene una entrega
   * abierta en `platform_device_assignments` (RN7 del spec 1877).
   *
   * El `forUpdate` ya está tomado sobre `platform_devices` antes de llamar
   * aquí, por lo que no hay carrera entre la consulta y la mutación.
   */
  private async assertNoOpenAssignment(
    deviceId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    const openAssignment = await PlatformDeviceAssignment.query({ client: trx })
      .where('platform_device_id', deviceId)
      .whereNull('platform_device_assignment_released_at')
      .whereNull('platform_device_assignment_deleted_at')
      .preload('businessUnit')
      .first()

    if (openAssignment) {
      const tenantName = openAssignment.businessUnit?.businessUnitName ?? 'un tenant'
      throw new PlatformDeviceServiceError(
        `Aparato ${deviceId} tiene entrega abierta con ${tenantName}`,
        PLATFORM_DEVICE_ERROR_CODES.LIFECYCLE_HAS_OPEN_ASSIGNMENT,
        422,
        PLATFORM_DEVICE_ERROR_CODES.LIFECYCLE_HAS_OPEN_ASSIGNMENT,
        `La unidad está asignada a «${tenantName}». Debe desasignarse antes de retirarla o apartarla.`
      )
    }
  }
}
