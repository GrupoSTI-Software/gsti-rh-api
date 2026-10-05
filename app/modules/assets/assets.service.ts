import { DateTime } from 'luxon'
import { isUploadFailureSentinel } from '#constants/upload_sentinels'
import { buildDownloadFileName } from '#helpers/download_file_name'
import { resolveStoredFileExtension } from '#helpers/stored_file_extension'
import UploadService from '#services/upload_service'
import { TenantContext } from '#utils/tenant_context'
import {
  ASSET_FILE_NAME_PREFIX,
  ASSETS_LIST_DEFAULT_LIMIT,
  type AssetCharacteristicType,
  type AssetStateFilter,
} from './assets.constants.js'
import { AssetError } from './assets.error.js'
import type {
  AssetCharacteristicValueWrite,
  AssetOwnership,
  AssetsRepository,
} from './assets.repository.js'
import AssetsRepositoryMysql from './assets.repository.mysql.js'
import type {
  AssetAssignmentDto,
  AssetCharacteristicValueDto,
  AssetCharacteristicValueInput,
  AssetDetailDto,
  AssetListResponseDto,
  AssetsSummaryDto,
  AssetTypeDto,
  AssetValueHistoryDto,
} from './dto/assets.dto.js'

/** Lo único que el service necesita del almacenamiento. */
export type AssetFileStorage = Pick<UploadService, 'streamStoredFile'>

type StoredObject = NonNullable<Awaited<ReturnType<UploadService['streamStoredFile']>>>

/** Archivo listo para escribirse en la respuesta. */
export interface AssetFile {
  object: StoredObject
  fileName: string
}

export interface AssetListQuery {
  search?: string
  supplyTypeId?: number
  state?: AssetStateFilter
  page?: number
  limit?: number
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/
const TRUE_VALUES = new Set(['true', '1'])
const FALSE_VALUES = new Set(['false', '0'])

/**
 * Valor de característica en su forma guardada (texto), validado contra el
 * tipo de la característica. `null` = quitar el valor.
 *
 * @throws AssetError 422 `valor-de-caracteristica-invalido`.
 */
export function normalizeCharacteristicValue(
  characteristic: { name: string; type: AssetCharacteristicType },
  value: AssetCharacteristicValueInput['value']
): string | null {
  if (value === null) return null
  const text = String(value).trim()
  if (text === '') return null

  const invalid = () => AssetError.characteristicValueInvalid(characteristic.name)
  switch (characteristic.type) {
    case 'text':
      return text
    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(text)
      if (typeof value === 'boolean' || !Number.isFinite(parsed)) throw invalid()
      return String(parsed)
    }
    case 'date':
      if (!CALENDAR_DATE.test(text) || !DateTime.fromISO(text).isValid) throw invalid()
      return text
    case 'boolean': {
      const lowered = text.toLowerCase()
      if (TRUE_VALUES.has(lowered)) return 'true'
      if (FALSE_VALUES.has(lowered)) return 'false'
      throw invalid()
    }
  }
}

/** Hay archivo real: ni vacío ni el centinela de subida fallida. */
function hasStoredFile(storedPath: string | null): storedPath is string {
  return storedPath !== null && storedPath.trim() !== '' && !isUploadFailureSentinel(storedPath)
}

/**
 * Activos del backoffice: listado con resguardo activo embebido, resumen,
 * ficha (características, resguardos, historial de valor), tipos y descargas.
 * El scope de empresas sale del `TenantContext` de la petición.
 */
export default class AssetsService {
  constructor(
    private readonly repository: AssetsRepository = new AssetsRepositoryMysql(),
    private readonly storage: AssetFileStorage = new UploadService()
  ) {}

  private scope(): readonly number[] {
    return TenantContext.getScope()
  }

  list(query: AssetListQuery): Promise<AssetListResponseDto> {
    return this.repository.list({
      businessUnitIds: this.scope(),
      search: query.search?.trim() || undefined,
      supplyTypeId: query.supplyTypeId,
      state: query.state ?? 'all',
      page: query.page ?? 1,
      limit: query.limit ?? ASSETS_LIST_DEFAULT_LIMIT,
    })
  }

  summary(supplyTypeId?: number): Promise<AssetsSummaryDto> {
    return this.repository.summary(this.scope(), supplyTypeId)
  }

  /** @throws AssetError 404 `activo-no-encontrado`. */
  async detail(supplyId: number): Promise<AssetDetailDto> {
    const asset = await this.repository.findById(this.scope(), supplyId)
    if (!asset) throw AssetError.assetNotFound()
    const characteristicValues = await this.repository.findCharacteristicValues(
      asset.supplyId,
      asset.supplyType.supplyTypeId
    )
    return { ...asset, characteristicValues }
  }

  /** @throws AssetError 404 `activo-no-encontrado`. */
  async assignments(supplyId: number): Promise<AssetAssignmentDto[]> {
    const asset = await this.findOwnershipOrFail(supplyId)
    return this.repository.findAssignments(this.scope(), asset.supplyId)
  }

  /** @throws AssetError 404 `activo-no-encontrado`. */
  async valueHistory(supplyId: number): Promise<AssetValueHistoryDto> {
    const asset = await this.repository.findById(this.scope(), supplyId)
    if (!asset) throw AssetError.assetNotFound()
    const entries = await this.repository.findValueHistory(asset.supplyId)
    return {
      acquisition: { value: asset.acquisitionValue, date: asset.acquisitionDate },
      entries,
    }
  }

  types(): Promise<AssetTypeDto[]> {
    return this.repository.findTypes(this.scope())
  }

  /**
   * Guarda en lote los valores de características del activo. Cada
   * característica debe ser del tipo del activo y el valor respetar su
   * formato. Devuelve todas las características del tipo con su valor.
   *
   * @throws AssetError 404 `activo-no-encontrado`; 422
   *   `caracteristica-no-pertenece-al-tipo` o `valor-de-caracteristica-invalido`.
   */
  async upsertCharacteristicValues(
    supplyId: number,
    inputs: readonly AssetCharacteristicValueInput[]
  ): Promise<AssetCharacteristicValueDto[]> {
    const asset = await this.findOwnershipOrFail(supplyId)
    const characteristics = await this.repository.findCharacteristicValues(
      asset.supplyId,
      asset.supplyTypeId
    )
    const byId = new Map(characteristics.map((item) => [item.characteristicId, item]))

    // Si la misma característica llega dos veces, gana la última.
    const writes = new Map<number, AssetCharacteristicValueWrite>()
    for (const input of inputs) {
      const characteristic = byId.get(input.characteristicId)
      if (!characteristic) throw AssetError.characteristicNotInType()
      writes.set(input.characteristicId, {
        characteristicId: input.characteristicId,
        value: normalizeCharacteristicValue(characteristic, input.value),
      })
    }

    await this.repository.upsertCharacteristicValues(asset, [...writes.values()])
    return this.repository.findCharacteristicValues(asset.supplyId, asset.supplyTypeId)
  }

  /** @throws AssetError 404 `archivo-no-encontrado` (inexistente, ajeno o sin archivo). */
  async responseContractFile(contractId: number): Promise<AssetFile> {
    const record = await this.repository.findResponseContractFile(this.scope(), contractId)
    if (!record) throw AssetError.fileNotFound()
    return this.streamFile(record.storedPath, [ASSET_FILE_NAME_PREFIX.responseContract, record.id])
  }

  /** @throws AssetError 404 `archivo-no-encontrado` (inexistente, ajeno o sin archivo). */
  async assignationPhotoFile(photoId: number): Promise<AssetFile> {
    const record = await this.repository.findAssignationPhotoFile(this.scope(), photoId)
    if (!record) throw AssetError.fileNotFound()
    const prefix =
      record.kind === 'return'
        ? ASSET_FILE_NAME_PREFIX.returnPhoto
        : ASSET_FILE_NAME_PREFIX.assignationPhoto
    return this.streamFile(record.storedPath, [prefix, record.id])
  }

  private async findOwnershipOrFail(supplyId: number): Promise<AssetOwnership> {
    const asset = await this.repository.findOwnership(this.scope(), supplyId)
    if (!asset) throw AssetError.assetNotFound()
    return asset
  }

  private async streamFile(
    storedPath: string | null,
    nameParts: Array<string | number>
  ): Promise<AssetFile> {
    if (!hasStoredFile(storedPath)) throw AssetError.fileNotFound()
    const object = await this.storage.streamStoredFile(storedPath)
    if (!object) throw AssetError.fileNotFound()
    const fileName = buildDownloadFileName(
      nameParts,
      resolveStoredFileExtension({ storedPath, contentType: object.contentType })
    )
    return { object, fileName }
  }
}
