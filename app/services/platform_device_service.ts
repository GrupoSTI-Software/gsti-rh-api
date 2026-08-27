import PlatformDevice, {
  type PlatformDeviceOrigin,
  type PlatformDeviceStockStatus,
} from '#models/platform_device'
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

/**
 * Forma serializable que el controlador envía al cliente.
 * Campos en camelCase completo, espejo directo de las columnas de la tabla
 * (§11 del spec). Ningún campo de empresa (R9).
 */
export interface DeviceRecord {
  platformDeviceId: number
  platformDeviceSerialNumber: string
  platformDeviceOrigin: PlatformDeviceOrigin
  platformDeviceStockStatus: PlatformDeviceStockStatus
  platformDeviceAcquisitionCostCents: number | null
  platformDeviceAcquisitionDate: string | null
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

interface CreateDeviceInput {
  platformDeviceSerialNumber: string
  platformDeviceModelId: number
  platformDeviceOrigin: PlatformDeviceOrigin
  platformDeviceAcquisitionCostCents?: number | null
  platformDeviceAcquisitionDate?: string | null
}

interface ListDevicesInput {
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
      platformDeviceAcquisitionCostCents: device.platformDeviceAcquisitionCostCents,
      platformDeviceAcquisitionDate: device.platformDeviceAcquisitionDate,
      model: {
        platformDeviceModelId: model.platformDeviceModelId,
        platformDeviceModelBrand: model.platformDeviceModelBrand,
        platformDeviceModelName: model.platformDeviceModelName,
        platformDeviceModelSlug: model.platformDeviceModelSlug,
      },
    }
  }

  /**
   * Lista todas las unidades activas (sin baja lógica) con su modelo,
   * ordenadas por fecha de creación descendente, con paginación opcional.
   * La UI de esta rebanada no usa paginación, pero el contrato la expone
   * desde el día uno para no romperlo cuando llegue el tablero (1874).
   *
   * Una sola consulta — sin N+1. AC3.
   */
  async listAll(input: ListDevicesInput = {}): Promise<DeviceListResult> {
    const page = input.page ?? 1
    const limit = input.limit ?? 20

    const baseQuery = PlatformDevice.query()
      .whereNull('platform_device_deleted_at')
      .preload('deviceModel')
      .orderBy('platform_device_created_at', 'desc')

    const total = await PlatformDevice.query()
      .whereNull('platform_device_deleted_at')
      .count('* as total')
      .then((rows) => Number(rows[0].$extras.total))

    const devices = await baseQuery.offset((page - 1) * limit).limit(limit)

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
      const hasCost = input.platformDeviceAcquisitionCostCents != null
      const hasDate = input.platformDeviceAcquisitionDate != null

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
        `Ya existe una unidad registrada con ese número de serie.`
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
          `Ya existe una unidad registrada con ese número de serie.`
        )
      }
      throw error
    }
  }
}
