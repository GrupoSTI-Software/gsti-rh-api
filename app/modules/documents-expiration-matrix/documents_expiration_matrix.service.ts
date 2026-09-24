import { isUploadFailureSentinel } from '#constants/upload_sentinels'
import { buildDownloadFileName } from '#helpers/download_file_name'
import { resolveStoredFileExtension } from '#helpers/stored_file_extension'
import UploadService from '#services/upload_service'
import {
  daysBetweenBusinessDates,
  toBusinessDateString,
  todayInBusinessZone,
} from '#utils/business_date'
import {
  EXPIRATION_MATRIX_FILE_NAME_PREFIX,
  EXPIRATION_MATRIX_SOURCES,
  EXPIRATION_MATRIX_WINDOW_DAYS,
  buildExpirationMatrixKey,
  parseExpirationMatrixKey,
  type ExpirationMatrixSource,
} from './documents_expiration_matrix.constants.js'
import { ExpirationMatrixError } from './documents_expiration_matrix.error.js'
import type {
  ExpirationMatrixFilter,
  ExpirationMatrixRecord,
  ExpirationMatrixRepository,
} from './documents_expiration_matrix.repository.js'
import ExpirationMatrixRepositoryMysql from './documents_expiration_matrix.repository.mysql.js'
import type {
  ExpirationMatrixItemDto,
  ExpirationMatrixResponseDto,
} from './dto/documents_expiration_matrix.dto.js'

/** Qué puede hacer la sesión con una fuente. */
export interface ExpirationMatrixSourceAccess {
  /** La fuente aporta vencimientos. */
  read: boolean
  /** Sus archivos se pueden abrir (`hasFile` y descarga). */
  download: boolean
}

/** Alcance ya resuelto de la sesión: el service no conoce `HttpContext`. */
export interface ExpirationMatrixAccess {
  businessUnitIds: readonly number[]
  departmentIds: readonly number[]
  sources: Readonly<Record<ExpirationMatrixSource, ExpirationMatrixSourceAccess>>
}

/** Nombre genérico del documento por fuente, ya traducido (cuando la fila no trae uno). */
export type ExpirationMatrixLabels = Readonly<Record<ExpirationMatrixSource, string>>

/** Lo único que el service necesita del almacenamiento. */
export type ExpirationMatrixFileStorage = Pick<UploadService, 'streamStoredFile' | 'canStreamStoredFile'>

type StoredObject = NonNullable<Awaited<ReturnType<UploadService['streamStoredFile']>>>

/** Archivo listo para escribirse en la respuesta. */
export interface ExpirationMatrixFile {
  object: StoredObject
  fileName: string
}

/** Hay archivo real: ni vacío ni el centinela de subida fallida. */
function hasStoredFile(storedPath: string | null): storedPath is string {
  return storedPath !== null && !isUploadFailureSentinel(storedPath)
}

/**
 * Matriz de vencimientos agregada: junta las siete fuentes en una respuesta
 * con ventana única (vencidos + próximos 30 días naturales) y resuelve el
 * archivo de un vencimiento por su llave.
 */
export default class DocumentsExpirationMatrixService {
  constructor(
    private readonly repository: ExpirationMatrixRepository = new ExpirationMatrixRepositoryMysql(),
    private readonly storage: ExpirationMatrixFileStorage = new UploadService()
  ) {}

  /** Consulta de cada fuente. Una fuente = una consulta del repositorio. */
  private findBySource(
    source: ExpirationMatrixSource,
    filter: ExpirationMatrixFilter
  ): Promise<ExpirationMatrixRecord[]> {
    switch (source) {
      case 'employee-file':
        return this.repository.findEmployeeFiles(filter)
      case 'employee-contract':
        return this.repository.findEmployeeContracts(filter)
      case 'company-file':
        return this.repository.findCompanyFiles(filter)
      case 'certification':
        return this.repository.findCertifications(filter)
      case 'repse-folio':
        return this.repository.findRepseFolios(filter)
      case 'provider-folio':
        return this.repository.findProviderFolios(filter)
      case 'supply':
        return this.repository.findSupplies(filter)
    }
  }

  /** Hoy y el último día de la ventana, en zona de negocio. */
  private resolveWindow(): { today: string; horizon: string } {
    const today = todayInBusinessZone()
    return {
      today: toBusinessDateString(today),
      horizon: toBusinessDateString(today.plus({ days: EXPIRATION_MATRIX_WINDOW_DAYS })),
    }
  }

  /**
   * Vencimientos de las fuentes que la sesión puede leer. Una fuente sin
   * permiso no aporta items (no es un 403).
   */
  async list(
    access: ExpirationMatrixAccess,
    labels: ExpirationMatrixLabels
  ): Promise<ExpirationMatrixResponseDto> {
    const { today, horizon } = this.resolveWindow()
    const filter: ExpirationMatrixFilter = {
      horizon,
      businessUnitIds: access.businessUnitIds,
      departmentIds: access.departmentIds,
    }

    const readable = EXPIRATION_MATRIX_SOURCES.filter((source) => access.sources[source].read)
    const batches = await Promise.all(readable.map((source) => this.findBySource(source, filter)))

    const items = batches
      .flat()
      .map((record) => this.toItem(record, today, access, labels))
      .sort(
        (a, b) =>
          a.expiresAt.localeCompare(b.expiresAt) ||
          a.documentName.localeCompare(b.documentName, 'es') ||
          a.key.localeCompare(b.key)
      )

    return { windowDays: EXPIRATION_MATRIX_WINDOW_DAYS, today, items }
  }

  /**
   * Archivo de un vencimiento. Vuelve a resolver la fila con el mismo scope
   * (tenant, departamentos y ventana) que el listado y revalida el permiso de
   * descarga de su fuente.
   *
   * @throws ExpirationMatrixError 404 si la llave no existe o no es visible, o
   *   si no hay archivo; 403 si falta el permiso de descarga de la fuente.
   */
  async resolveFile(access: ExpirationMatrixAccess, key: string): Promise<ExpirationMatrixFile> {
    const parsed = parseExpirationMatrixKey(key)
    const sourceAccess = parsed ? access.sources[parsed.source] : null
    if (!parsed || !sourceAccess?.read) {
      throw ExpirationMatrixError.itemNotFound()
    }

    const { horizon } = this.resolveWindow()
    const [record] = await this.findBySource(parsed.source, {
      horizon,
      businessUnitIds: access.businessUnitIds,
      departmentIds: access.departmentIds,
      id: parsed.id,
    })
    if (!record) {
      throw ExpirationMatrixError.itemNotFound()
    }
    if (!sourceAccess.download) {
      throw ExpirationMatrixError.downloadForbidden()
    }
    if (!hasStoredFile(record.storedPath)) {
      throw ExpirationMatrixError.fileNotFound()
    }

    const object = await this.storage.streamStoredFile(record.storedPath)
    if (!object) {
      throw ExpirationMatrixError.fileNotFound()
    }

    const fileName = buildDownloadFileName(
      [EXPIRATION_MATRIX_FILE_NAME_PREFIX[record.source], record.id],
      resolveStoredFileExtension({
        storedPath: record.storedPath,
        fileName: record.storedFileName,
        contentType: object.contentType,
      })
    )
    return { object, fileName }
  }

  private toItem(
    record: ExpirationMatrixRecord,
    today: string,
    access: ExpirationMatrixAccess,
    labels: ExpirationMatrixLabels
  ): ExpirationMatrixItemDto {
    return {
      key: buildExpirationMatrixKey(record.source, record.id),
      source: record.source,
      documentName: record.documentName ?? labels[record.source],
      reference: record.reference,
      expiresAt: record.expiresAt,
      daysToExpire: daysBetweenBusinessDates(today, record.expiresAt),
      owner: record.owner,
      targetId: record.targetId ?? null,
      // Sin ofrecer lo que no se puede servir: una referencia a otro bucket
      // (archivos heredados) respondería 404 al abrirla.
      hasFile:
        access.sources[record.source].download &&
        hasStoredFile(record.storedPath) &&
        this.storage.canStreamStoredFile(record.storedPath),
    }
  }
}
