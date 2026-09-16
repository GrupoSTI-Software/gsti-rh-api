import { createHash } from 'node:crypto'
import { cuid } from '@adonisjs/core/helpers'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { I18n } from '@adonisjs/i18n'
import RoleService from '#services/role_service'
import UploadService from '#services/upload_service'
import type { IncomingFile } from '#services/file_intake_service'
import { FileIntakeError } from '#exceptions/file_intake_error'
import { isUploadFailureSentinel } from '#constants/upload_sentinels'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import type EmployeeOffboardingDocumentTemplate from '#models/employee_offboarding_document_template'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '../concepts/concepts.constants.js'
import { buildUserNamesMap } from '../offboardings/dto/offboardings.dto.js'
import {
  DOCUMENT_SIGNED_URL_EXPIRES_SECONDS,
  EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE,
  type EmployeeOffboardingDocumentType,
} from '../documents/documents.constants.js'
import {
  OFFBOARDING_DOCUMENT_FIELDS,
  fieldsForDocumentType,
} from '../documents/document_fields.constants.js'
import {
  DOCUMENT_TEMPLATE_FALLBACK_FILE_NAME,
  DOCUMENT_TEMPLATE_INTAKE_PROFILE,
  DOCUMENT_TEMPLATE_ORIGINAL_FILE_NAME_MAX_LENGTH,
  DOCUMENT_TEMPLATES_S3_FOLDER,
} from './document_templates.constants.js'
import DocumentTemplatesRepositoryMysql from './document_templates.repository.mysql.js'
import type {
  DocumentTemplatesRepository,
  DocumentTemplateVersionsPage,
} from './document_templates.repository.js'
import {
  toDocumentTemplateDto,
  type EmployeeOffboardingDocumentTemplateCatalogEntryDto,
  type EmployeeOffboardingDocumentTemplateDto,
} from './dto/document_templates.dto.js'
import {
  toDocumentFieldDto,
  type OffboardingDocumentFieldDto,
} from './dto/document_template_fields.dto.js'

/** Acciones del módulo `employee-offboardings` que usa este slice (regla 9). */
export type EmployeeOffboardingDocumentTemplateAction = 'read' | 'create'

/** Historial paginado con el molde de meta del listado de salidas. */
export interface EmployeeOffboardingDocumentTemplateVersionsResult {
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    firstPage: number
  }
  data: EmployeeOffboardingDocumentTemplateDto[]
}

/** Duplicado de llave de MySQL/MariaDB (el UNIQUE de vigencia como último candado). */
function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY'
}

/**
 * Reglas de negocio de las plantillas propias del documento de salida
 * (USRH1788553841100): cualquier PDF que pase el intake se declara plantilla
 * (reglas 1-2), cada carga es una versión nueva consecutiva (regla 3) con una
 * sola vigente por (empresa, tipo) (regla 4), nada se borra (regla 5),
 * almacenamiento privado con enlace de 300 s (regla 7) y 404 uniforme fuera
 * de la empresa (regla 8).
 *
 * Orden de la carga: permiso → tipo → archivo → subida FUERA de transacción
 * → relectura y sello del buffer ALMACENADO → transacción corta (lock de la
 * fila padre, consecutivo, traslado de vigencia, insert). Si la fila falla
 * tras subir, el objeto queda HUÉRFANO en S3 y se tolera: el `catch` no lo
 * borra, porque bajo concurrencia podría borrar el objeto equivocado. Nunca
 * una fila que apunte a un objeto inexistente (regla 6).
 *
 * Este slice NO abre el PDF: el buffer releído es el punto de extensión de
 * ESB-05-07-14 (rechazo estructural) y ESB-05-07-08 (validación de campos),
 * que se injertan dentro de `createVersion`.
 */
export default class DocumentTemplatesService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private readonly repository: DocumentTemplatesRepository

  constructor(
    i18n: I18n,
    repository: DocumentTemplatesRepository = new DocumentTemplatesRepositoryMysql()
  ) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repository = repository
  }

  /** Regla 9 — `create` para subir, `read` para consultar y descargar (bypass root/owner en RoleService). */
  async assertCanAccess(
    roleId: number | null | undefined,
    action: EmployeeOffboardingDocumentTemplateAction
  ) {
    if (!roleId) {
      throw this.forbiddenError()
    }
    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(roleId, EMPLOYEE_OFFBOARDINGS_MODULE_SLUG, action)
    if (!hasAccess) {
      throw this.forbiddenError()
    }
  }

  /** Catálogo: una entrada por tipo declarado; sin vigente = plantilla del sistema. */
  async listCatalog(
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingDocumentTemplateCatalogEntryDto[]> {
    const businessUnitId = this.resolveBusinessUnitId(businessUnitScope)
    const entries: EmployeeOffboardingDocumentTemplateCatalogEntryDto[] = []
    for (const documentType of Object.values(EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE)) {
      const current = await this.repository.resolveCurrent(businessUnitId, documentType)
      entries.push({
        documentType,
        usesSystemTemplate: current === null,
        currentVersion: current ? await this.toDto(current) : null,
      })
    }
    return entries
  }

  /**
   * Catálogo de campos combinables (USRH1788579938623): la MISMA constante
   * que después usa el contraste (regla 7), resuelta en el idioma de la
   * petición. Constante en memoria: cero consultas, cero red. Acotado por
   * tipo cuando se pide (regla 9). El permiso `read` lo afirma el controller,
   * como en las demás acciones del slice.
   */
  listFields(documentType?: EmployeeOffboardingDocumentType): OffboardingDocumentFieldDto[] {
    const fields = documentType ? fieldsForDocumentType(documentType) : OFFBOARDING_DOCUMENT_FIELDS
    return fields.map((field) => toDocumentFieldDto(field, (key) => this.t(key)))
  }

  /** Historial completo por versión descendente, incluidas `superseded` y `rejected`. */
  async listVersions(
    businessUnitScope: number[],
    rawDocumentType: string,
    page: DocumentTemplateVersionsPage
  ): Promise<EmployeeOffboardingDocumentTemplateVersionsResult> {
    const businessUnitId = this.resolveBusinessUnitId(businessUnitScope)
    const documentType = this.resolveDocumentType(rawDocumentType)
    const { rows, total } = await this.repository.listVersions(businessUnitId, documentType, page)

    const userIds = [
      ...new Set(
        rows
          .map((row) => row.employeeOffboardingDocumentTemplateUploadedByUserId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]
    const userNamesById = buildUserNamesMap(await this.repository.findUsersByIds(userIds))

    return {
      meta: {
        total,
        perPage: page.limit,
        currentPage: page.page,
        lastPage: Math.max(Math.ceil(total / page.limit), 1),
        firstPage: 1,
      },
      data: rows.map((row) => toDocumentTemplateDto(row, userNamesById)),
    }
  }

  /**
   * Sube el archivo y lo registra como versión nueva vigente. Punto ÚNICO de
   * inserción del slice: las hermanas injertan aquí su revisión.
   */
  async createVersion(
    businessUnitScope: number[],
    rawDocumentType: string,
    file: IncomingFile | null | undefined,
    uploadedByUserId: number | null
  ): Promise<EmployeeOffboardingDocumentTemplateDto> {
    const businessUnitId = this.resolveBusinessUnitId(businessUnitScope)
    const documentType = this.resolveDocumentType(rawDocumentType)
    if (!file) {
      throw this.fileRequiredError()
    }

    // Se guarda saneado y se pinta después en el BO (cuarta copia privada del saneador)
    const originalFileName = this.sanitizeFileName(file.clientName)

    // Subida FUERA de transacción: S3 puede colgarse hasta el timeout y una
    // transacción abierta dejaría candados InnoDB todo ese tiempo.
    const storageKey = await this.uploadOrFail(file, businessUnitId, originalFileName)

    // Sello sobre el buffer TAL COMO quedó almacenado: el intake reescribe
    // el PDF (limpia metadatos), así que el subido no sirve. La relectura
    // confirma además que el objeto existe ANTES de insertar la fila.
    const stored = await new UploadService().readStoredFileBuffer(storageKey)
    if (!stored) {
      throw this.uploadFailedError()
    }
    const contentSha256 = createHash('sha256').update(stored).digest('hex')
    const fileSizeBytes = stored.byteLength

    const record = await this.persistVersion({
      businessUnitId,
      documentType,
      storageKey,
      originalFileName,
      fileSizeBytes,
      contentSha256,
      uploadedByUserId,
    })

    // Sin nombre original, key completa, URL ni hash junto a identificadores
    logger.info(
      {
        businessUnitId,
        documentType,
        versionId: record.employeeOffboardingDocumentTemplateId,
        fileSizeBytes,
      },
      'Plantilla de documento de salida: versión nueva vigente'
    )

    return await this.toDto(record)
  }

  /** URL pre-firmada de 300 s (regla 7): no se persiste ni se loguea. */
  async getDownloadUrl(
    businessUnitScope: number[],
    rawDocumentType: string,
    versionId: number
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const businessUnitId = this.resolveBusinessUnitId(businessUnitScope)
    const documentType = this.resolveDocumentType(rawDocumentType)
    const record = await this.repository.findVersionInScope(businessUnitId, documentType, versionId)
    if (!record) {
      throw this.templateNotFoundError()
    }

    const url = await new UploadService().getDownloadLink(
      record.employeeOffboardingDocumentTemplateStorageKey,
      DOCUMENT_SIGNED_URL_EXPIRES_SECONDS
    )
    // `getDownloadLink` no lanza: devuelve un objeto en error. Nunca `!url`.
    if (typeof url !== 'string') {
      throw this.downloadFailedError()
    }
    return { downloadUrl: url, expiresInSeconds: DOCUMENT_SIGNED_URL_EXPIRES_SECONDS }
  }

  /**
   * Contrato publicado a la cadena (ESB-05-07-09 la consume para emitir):
   * el MODELO de la versión vigente, no el DTO; `null` = plantilla del
   * sistema. ESB-05-07-08 lo estrecha a versiones con revisión registrada.
   */
  async resolveCurrentTemplate(
    businessUnitId: number,
    documentType: EmployeeOffboardingDocumentType
  ): Promise<EmployeeOffboardingDocumentTemplate | null> {
    return await this.repository.resolveCurrent(businessUnitId, documentType)
  }

  /**
   * Transacción corta y al final: lock de la fila PADRE de la empresa,
   * consecutivo bajo lock, traslado de vigencia e INSERT. El UNIQUE sobre la
   * columna generada es el candado de último recurso: un duplicado sale como
   * 500 `error-interno`, jamás como segunda vigente.
   */
  private async persistVersion(input: {
    businessUnitId: number
    documentType: EmployeeOffboardingDocumentType
    storageKey: string
    originalFileName: string
    fileSizeBytes: number
    contentSha256: string
    uploadedByUserId: number | null
  }): Promise<EmployeeOffboardingDocumentTemplate> {
    try {
      return await db.transaction(async (trx) => {
        const locked = await this.repository.lockBusinessUnitRow(input.businessUnitId, trx)
        if (!locked) {
          // La empresa viene del alcance ya resuelto: sin fila padre no hay carga
          throw this.unexpectedError()
        }

        const versionNumber =
          (await this.repository.findMaxVersionNumber(
            input.businessUnitId,
            input.documentType,
            trx
          )) + 1

        await this.repository.markCurrentAsSuperseded(input.businessUnitId, input.documentType, trx)

        return await this.repository.createVersion({ ...input, versionNumber }, trx)
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw this.unexpectedError()
      }
      throw error
    }
  }

  /**
   * Intake vigente (`pdf-document`: PDF, 10 MB, MIME real, privado). El
   * rechazo de política (422) viaja tal cual con su triplete `FILE.*`
   * (regla 1); el fallo del almacenamiento sale con el código del slice.
   */
  private async uploadOrFail(
    file: IncomingFile,
    businessUnitId: number,
    originalFileName: string
  ): Promise<string> {
    let storageKey: string
    try {
      storageKey = await new UploadService().fileUpload(
        file,
        DOCUMENT_TEMPLATE_INTAKE_PROFILE,
        DOCUMENT_TEMPLATES_S3_FOLDER,
        { fileName: `${businessUnitId}/${cuid()}-${originalFileName}` }
      )
    } catch (error) {
      if (error instanceof FileIntakeError && error.status >= 500) {
        throw this.uploadFailedError()
      }
      throw error
    }
    // Guarda contra los centinelas históricos y la cadena vacía
    if (!storageKey || isUploadFailureSentinel(storageKey)) {
      throw this.uploadFailedError()
    }
    return storageKey
  }

  /** El alcance del middleware trae UN solo elemento; sin él no hay consulta (fail-closed). */
  private resolveBusinessUnitId(businessUnitScope: number[]): number {
    const [businessUnitId] = businessUnitScope
    if (businessUnitId === undefined) {
      throw this.templateNotFoundError()
    }
    return businessUnitId
  }

  /**
   * Tipo contra la constante del slice `documents/`, NO con VineJS: el
   * conjunto es global del producto, así que distinguirlo (422) del 404 no
   * revela nada de otra empresa.
   */
  private resolveDocumentType(rawDocumentType: string): EmployeeOffboardingDocumentType {
    const known = Object.values(EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE) as string[]
    if (!known.includes(rawDocumentType)) {
      throw this.typeInvalidError()
    }
    return rawDocumentType as EmployeeOffboardingDocumentType
  }

  private async toDto(record: EmployeeOffboardingDocumentTemplate) {
    const userId = record.employeeOffboardingDocumentTemplateUploadedByUserId
    const users = userId ? await this.repository.findUsersByIds([userId]) : []
    return toDocumentTemplateDto(record, buildUserNamesMap(users))
  }

  /** Lista blanca ASCII, colapsa `..`, corte al ancho de la columna (255). */
  private sanitizeFileName(rawName: string | null | undefined): string {
    const sanitized = `${rawName ?? ''}`
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, DOCUMENT_TEMPLATE_ORIGINAL_FILE_NAME_MAX_LENGTH)
    return sanitized.length > 0 ? sanitized : DOCUMENT_TEMPLATE_FALLBACK_FILE_NAME
  }

  private forbiddenError() {
    return new EmployeeOffboardingServiceError({
      key: 'sin-permiso',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_FORBIDDEN,
      httpStatus: 403,
      title: this.t('employee_offboarding_forbidden_title'),
      detail: this.t('employee_offboarding_forbidden_message'),
    })
  }

  private fileRequiredError() {
    return new EmployeeOffboardingServiceError({
      key: 'datos-invalidos',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_VAL_INPUT,
      httpStatus: 400,
      title: this.t('employee_offboarding_val_input_title'),
      detail: this.t('employee_offboarding_document_template_file_required_detail'),
    })
  }

  private typeInvalidError() {
    return new EmployeeOffboardingServiceError({
      key: 'tipo-de-documento-no-valido',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_TYPE_INVALID,
      httpStatus: 422,
      title: this.t('employee_offboarding_document_template_error_title'),
      detail: this.t('employee_offboarding_document_template_type_invalid_detail'),
    })
  }

  /** Idéntico para inexistente, de otro tipo o de otra empresa (regla 8). */
  private templateNotFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'plantilla-no-encontrada',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_document_template_not_found_title'),
      detail: this.t('employee_offboarding_document_template_not_found_detail'),
    })
  }

  private uploadFailedError() {
    return new EmployeeOffboardingServiceError({
      key: 'plantilla-no-almacenada',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_UPLOAD_FAILED,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_template_error_title'),
      detail: this.t('employee_offboarding_document_template_upload_failed_detail'),
    })
  }

  private downloadFailedError() {
    return new EmployeeOffboardingServiceError({
      key: 'plantilla-descarga-fallida',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_DOWNLOAD_FAILED,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_template_download_error_title'),
      detail: this.t('employee_offboarding_document_template_download_failed_detail'),
    })
  }

  private unexpectedError() {
    return new EmployeeOffboardingServiceError({
      key: 'error-interno',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_UNEXPECTED,
      httpStatus: 500,
      title: this.t('employee_offboarding_unexpected_title'),
      detail: this.t('employee_offboarding_unexpected_message'),
    })
  }
}
