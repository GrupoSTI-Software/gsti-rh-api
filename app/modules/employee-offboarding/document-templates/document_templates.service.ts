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
import EmployeeOffboardingServiceError, {
  type EmployeeOffboardingErrorKey,
} from '#exceptions/employee_offboarding_service_error'
import {
  EMPLOYEE_OFFBOARDING_ERROR_CODES,
  type EmployeeOffboardingErrorCode,
} from '#constants/employee_offboarding_error_codes'
import {
  inspectPdfTemplate,
  sanitizeVerdictDetail,
  type PdfTemplateInspection,
  type PdfTemplateRejectionReason,
} from '#helpers/pdf_template_safety'
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
import type { DocumentTemplateValidationResult } from './document_template_validation_result.type.js'
import {
  DOCUMENT_TEMPLATE_FALLBACK_FILE_NAME,
  DOCUMENT_TEMPLATE_INTAKE_PROFILE,
  DOCUMENT_TEMPLATE_ORIGINAL_FILE_NAME_MAX_LENGTH,
  DOCUMENT_TEMPLATE_STATUS,
  DOCUMENT_TEMPLATES_S3_FOLDER,
  type DocumentTemplateStatus,
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

/** Motivo de rechazo con su ofensor ya saneado; `null` = la plantilla pasa. */
interface TemplateRejection {
  reason: Exclude<PdfTemplateRejectionReason, 'unvalidated_legacy'>
  detail: string | null
}

/**
 * Cada motivo con su propio `key`, `code` y copy (regla 3 de USRH1789097550387).
 * Un genérico no cumple. Los diez comparten el título.
 */
const REJECTION_ERRORS: Readonly<
  Record<
    TemplateRejection['reason'],
    { key: EmployeeOffboardingErrorKey; code: EmployeeOffboardingErrorCode; detailKey: string }
  >
> = {
  encrypted: {
    key: 'plantilla-protegida-con-contrasena',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_ENCRYPTED,
    detailKey: 'employee_offboarding_document_template_rejected_encrypted_detail',
  },
  xfa: {
    key: 'plantilla-de-formulario-dinamico',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_XFA,
    detailKey: 'employee_offboarding_document_template_rejected_xfa_detail',
  },
  no_form_fields: {
    key: 'plantilla-sin-campos-rellenables',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_NO_FIELDS,
    detailKey: 'employee_offboarding_document_template_rejected_no_fields_detail',
  },
  field_type: {
    key: 'plantilla-con-campo-de-tipo-no-admitido',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_FIELD_TYPE,
    detailKey: 'employee_offboarding_document_template_rejected_field_type_detail',
  },
  active_content: {
    key: 'plantilla-con-contenido-activo',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_ACTIVE_CONTENT,
    detailKey: 'employee_offboarding_document_template_rejected_active_content_detail',
  },
  submit_action: {
    key: 'plantilla-con-envio-a-terceros',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_SUBMIT_ACTION,
    detailKey: 'employee_offboarding_document_template_rejected_submit_action_detail',
  },
  signature_field: {
    key: 'plantilla-con-campo-de-firma',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_SIGNATURE_FIELD,
    detailKey: 'employee_offboarding_document_template_rejected_signature_field_detail',
  },
  duplicate_field: {
    key: 'plantilla-con-campos-duplicados',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_DUPLICATE_FIELD,
    detailKey: 'employee_offboarding_document_template_rejected_duplicate_field_detail',
  },
  field_name_invalid: {
    key: 'plantilla-con-nombre-de-campo-invalido',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_FIELD_NAME,
    detailKey: 'employee_offboarding_document_template_rejected_field_name_detail',
  },
  too_complex: {
    key: 'plantilla-demasiado-compleja',
    code: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_REJECTED_TOO_COMPLEX,
    detailKey: 'employee_offboarding_document_template_rejected_too_complex_detail',
  },
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
      throw this.unreadableError()
    }
    const contentSha256 = createHash('sha256').update(stored).digest('hex')
    const fileSizeBytes = stored.byteLength

    // Revisión estructural (USRH1789097550387) sobre el buffer ALMACENADO:
    // única carga de pdf-lib del flujo; el documento queda listo para que
    // ESB-05-07-08 contraste los campos sin volver a cargarlo.
    const inspection = await inspectPdfTemplate(stored)
    const rejection = this.resolveRejection(documentType, inspection)
    const version = {
      businessUnitId,
      documentType,
      storageKey,
      originalFileName,
      fileSizeBytes,
      contentSha256,
      uploadedByUserId,
    }
    const pageCount = inspection.pageCount
    const fieldCount = inspection.ok ? inspection.fields.length : inspection.fieldCount

    if (rejection) {
      // Regla 4 y 5: el intento consume su consecutivo como `rejected` y NO
      // toca la vigente. Se responde 422 con el dictamen (data).
      const record = await this.persistVersion({
        ...version,
        status: DOCUMENT_TEMPLATE_STATUS.REJECTED,
        validationResult: this.buildStructuralVerdict(documentType, rejection),
      })
      // Sin nombres de campo, key completa, URL ni hash junto a identificadores
      logger.info(
        {
          businessUnitId,
          documentType,
          versionId: record.employeeOffboardingDocumentTemplateId,
          pageCount,
          fieldCount,
          verdict: 'rejected',
          reason: rejection.reason,
        },
        'Plantilla de documento de salida: versión rechazada por la revisión estructural'
      )
      throw this.rejectedError(rejection.reason, record)
    }

    const record = await this.persistVersion({
      ...version,
      status: DOCUMENT_TEMPLATE_STATUS.CURRENT,
      validationResult: this.buildStructuralVerdict(documentType, null),
    })
    logger.info(
      {
        businessUnitId,
        documentType,
        versionId: record.employeeOffboardingDocumentTemplateId,
        pageCount,
        fieldCount,
        verdict: 'accepted',
      },
      'Plantilla de documento de salida: versión nueva vigente'
    )

    return await this.toDto(record)
  }

  /**
   * Motivo de rechazo del intento, o `null` si la plantilla pasa. Un buffer
   * que no se puede cargar tras el intake es un objeto corrupto: 500, sin
   * fila. El décimo detector (CA-9) SÍ lee el catálogo: un campo con nombre
   * del catálogo cuyo widget no es de texto no puede rellenarse; vive aquí y
   * no en el helper, que no conoce el catálogo.
   */
  private resolveRejection(
    documentType: EmployeeOffboardingDocumentType,
    inspection: PdfTemplateInspection
  ): TemplateRejection | null {
    if (!inspection.ok) {
      if (inspection.reason === 'unreadable') {
        throw this.unreadableError()
      }
      return { reason: inspection.reason, detail: inspection.detail }
    }
    const catalogKeys = new Set(fieldsForDocumentType(documentType).map((field) => field.key))
    const offender = inspection.fields.find(
      (field) => catalogKeys.has(field.name) && field.kind !== 'text'
    )
    return offender ? { reason: 'field_type', detail: sanitizeVerdictDetail(offender.name) } : null
  }

  /**
   * Dictamen estructural (K-1): esta HU escribe SIEMPRE `structural`; las tres
   * listas van vacías y `passed` refleja solo la estructura. ESB-05-07-08
   * conserva `structural`, puebla las listas y cambia `stage` a `fields`.
   */
  private buildStructuralVerdict(
    documentType: EmployeeOffboardingDocumentType,
    rejection: TemplateRejection | null
  ): DocumentTemplateValidationResult {
    return {
      checkedAt: new Date().toISOString(),
      documentType,
      passed: rejection === null,
      recognized: [],
      unrecognized: [],
      missingRequired: [],
      structural: {
        stage: 'structural',
        reason: rejection?.reason ?? null,
        detail: rejection?.detail ?? null,
      },
    }
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
    status: DocumentTemplateStatus
    validationResult: DocumentTemplateValidationResult | null
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

        // Un rechazo NO desplaza a la vigente (regla 5); solo la nueva `current` la reemplaza
        if (input.status === DOCUMENT_TEMPLATE_STATUS.CURRENT) {
          await this.repository.markCurrentAsSuperseded(
            input.businessUnitId,
            input.documentType,
            trx
          )
        }

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

  /** 422 con el dictamen en `data`: el BO lo muestra sin volver a subir el archivo. */
  private rejectedError(
    reason: TemplateRejection['reason'],
    record: EmployeeOffboardingDocumentTemplate
  ) {
    const mapping = REJECTION_ERRORS[reason]
    return new EmployeeOffboardingServiceError({
      key: mapping.key,
      errorCode: mapping.code,
      httpStatus: 422,
      title: this.t('employee_offboarding_document_template_rejected_title'),
      detail: this.t(mapping.detailKey),
      data: {
        employeeOffboardingDocumentTemplateId: record.employeeOffboardingDocumentTemplateId,
        versionNumber: Number(record.employeeOffboardingDocumentTemplateVersionNumber),
        validationResult: record.employeeOffboardingDocumentTemplateValidationResult,
      },
    })
  }

  private unreadableError() {
    return new EmployeeOffboardingServiceError({
      key: 'plantilla-no-procesable',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_UNREADABLE,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_template_error_title'),
      detail: this.t('employee_offboarding_document_template_unreadable_detail'),
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
