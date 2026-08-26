import PlatformDeviceModel, {
  type PlatformDeviceModelStatus,
} from '#models/platform_device_model'
import { PLATFORM_DEVICE_ERROR_CODES } from '../constants/platform_device_error_codes.js'
import { PlatformDeviceServiceError } from '../exceptions/platform_device_service_error.js'

/** Forma serializable que el controlador envía al cliente. */
export interface DeviceModelRecord {
  id: number
  brand: string
  name: string
  slug: string
  status: PlatformDeviceModelStatus
  active: boolean
  createdAt: string
  updatedAt: string | null
}

interface CreateDeviceModelInput {
  brand: string
  name: string
  slug?: string
  status?: PlatformDeviceModelStatus
}

interface UpdateDeviceModelInput {
  brand?: string
  name?: string
}

/**
 * Servicio de plataforma para gobernar el catálogo de modelos de dispositivo
 * biométrico autorizado por GSTI (USRH1787189981870).
 *
 * Reglas de negocio clave:
 *   R1 – El slug es generado automáticamente si no se provee y es inmutable.
 *   R2 – El slug debe ser único (PLT.DEV.MODEL_SLUG_TAKEN).
 *   R3 – Los modelos con baja lógica (deletedAt) no aparecen en listados ni
 *          pueden modificarse.
 *   R4 – Transiciones de estado: en_validacion ↔ vigente | descontinuado (solo
 *          desde vigente). Un modelo descontinuado no vuelve a vigente
 *          directamente; pasa por en_validacion.
 *   R5 – Solo se aceptan modelos `vigente` para asignación de inventario
 *         (responsabilidad de los tickets 1872/1873, no de este servicio).
 */
export default class PlatformDeviceModelService {
  /**
   * Genera un slug kebab-case desde brand + name, eliminando acentos y
   * caracteres especiales no aptos para URLs.
   */
  private buildSlug(brand: string, name: string): string {
    return `${brand} ${name}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
  }

  /** Serializa un modelo a la forma pública. */
  private serialize(model: PlatformDeviceModel): DeviceModelRecord {
    return {
      id: model.platformDeviceModelId,
      brand: model.platformDeviceModelBrand,
      name: model.platformDeviceModelName,
      slug: model.platformDeviceModelSlug,
      status: model.platformDeviceModelStatus,
      active: model.platformDeviceModelActive === 1,
      createdAt: model.platformDeviceModelCreatedAt.toISO()!,
      updatedAt: model.platformDeviceModelUpdatedAt?.toISO() ?? null,
    }
  }

  /**
   * Lista todos los modelos activos (sin baja lógica), ordenados por brand
   * y luego por name. Los descontinuados se incluyen para que el landlord
   * pueda consultarlos; el filtrado visual es responsabilidad del frontend.
   *
   * @returns Catálogo completo de modelos.
   */
  async listAll(): Promise<DeviceModelRecord[]> {
    const models = await PlatformDeviceModel.query()
      .whereNull('platform_device_model_deleted_at')
      .orderBy('platform_device_model_brand')
      .orderBy('platform_device_model_name')

    return models.map((m) => this.serialize(m))
  }

  /**
   * Recupera un modelo por id.
   *
   * @param deviceModelId - Identificador del modelo.
   * @returns El modelo serializado.
   * @throws PlatformDeviceServiceError 404 si no existe o fue dado de baja.
   */
  async getById(deviceModelId: number): Promise<DeviceModelRecord> {
    const model = await PlatformDeviceModel.query()
      .where('platform_device_model_id', deviceModelId)
      .whereNull('platform_device_model_deleted_at')
      .first()

    if (!model) {
      throw new PlatformDeviceServiceError(
        `Modelo ${deviceModelId} no encontrado`,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_FOUND,
        404,
        'PLT.DEV.MODEL_NOT_FOUND',
        'El modelo de dispositivo solicitado no existe.'
      )
    }

    return this.serialize(model)
  }

  /**
   * Crea un nuevo modelo en el catálogo.
   *
   * @param input - Datos del nuevo modelo.
   * @returns El modelo creado serializado.
   * @throws PlatformDeviceServiceError 422 si el slug está tomado.
   */
  async create(input: CreateDeviceModelInput): Promise<DeviceModelRecord> {
    const slug = input.slug ?? this.buildSlug(input.brand, input.name)

    const existing = await PlatformDeviceModel.query()
      .where('platform_device_model_slug', slug)
      .whereNull('platform_device_model_deleted_at')
      .first()

    if (existing) {
      throw new PlatformDeviceServiceError(
        `El slug "${slug}" ya está registrado`,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_SLUG_TAKEN,
        422,
        'PLT.DEV.MODEL_SLUG_TAKEN',
        `El slug "${slug}" ya pertenece a otro modelo del catálogo.`
      )
    }

    const model = await PlatformDeviceModel.create({
      platformDeviceModelBrand: input.brand,
      platformDeviceModelName: input.name,
      platformDeviceModelSlug: slug,
      platformDeviceModelStatus: input.status ?? 'en_validacion',
      platformDeviceModelActive: 1,
    })

    return this.serialize(model)
  }

  /**
   * Actualiza brand y/o name de un modelo existente. El slug es inmutable.
   *
   * @param deviceModelId - Identificador del modelo a actualizar.
   * @param input - Campos a modificar (brand, name).
   * @returns El modelo actualizado serializado.
   * @throws PlatformDeviceServiceError 404 si no existe.
   */
  async update(deviceModelId: number, input: UpdateDeviceModelInput): Promise<DeviceModelRecord> {
    const model = await PlatformDeviceModel.query()
      .where('platform_device_model_id', deviceModelId)
      .whereNull('platform_device_model_deleted_at')
      .first()

    if (!model) {
      throw new PlatformDeviceServiceError(
        `Modelo ${deviceModelId} no encontrado`,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_FOUND,
        404,
        'PLT.DEV.MODEL_NOT_FOUND',
        'El modelo de dispositivo solicitado no existe.'
      )
    }

    if (input.brand !== undefined) model.platformDeviceModelBrand = input.brand
    if (input.name !== undefined) model.platformDeviceModelName = input.name
    await model.save()

    return this.serialize(model)
  }

  /**
   * Cambia el estado de un modelo (vigente / en_validacion / descontinuado).
   * Las transiciones permitidas son:
   *   - en_validacion → vigente
   *   - en_validacion → descontinuado
   *   - vigente → descontinuado
   *   - descontinuado → en_validacion
   *
   * @param deviceModelId - Identificador del modelo.
   * @param status - Nuevo estado deseado.
   * @returns El modelo actualizado serializado.
   * @throws PlatformDeviceServiceError 404 si no existe.
   */
  async changeStatus(
    deviceModelId: number,
    status: PlatformDeviceModelStatus
  ): Promise<DeviceModelRecord> {
    const model = await PlatformDeviceModel.query()
      .where('platform_device_model_id', deviceModelId)
      .whereNull('platform_device_model_deleted_at')
      .first()

    if (!model) {
      throw new PlatformDeviceServiceError(
        `Modelo ${deviceModelId} no encontrado`,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_FOUND,
        404,
        'PLT.DEV.MODEL_NOT_FOUND',
        'El modelo de dispositivo solicitado no existe.'
      )
    }

    model.platformDeviceModelStatus = status
    await model.save()

    return this.serialize(model)
  }

  /**
   * Baja lógica de un modelo. Los modelos con baja lógica se excluyen de
   * listados y no pueden editarse ni reasignarse.
   *
   * @param deviceModelId - Identificador del modelo a dar de baja.
   * @throws PlatformDeviceServiceError 404 si no existe.
   */
  async softDelete(deviceModelId: number): Promise<void> {
    const model = await PlatformDeviceModel.query()
      .where('platform_device_model_id', deviceModelId)
      .whereNull('platform_device_model_deleted_at')
      .first()

    if (!model) {
      throw new PlatformDeviceServiceError(
        `Modelo ${deviceModelId} no encontrado`,
        PLATFORM_DEVICE_ERROR_CODES.MODEL_NOT_FOUND,
        404,
        'PLT.DEV.MODEL_NOT_FOUND',
        'El modelo de dispositivo solicitado no existe.'
      )
    }

    await model.delete()
  }
}
