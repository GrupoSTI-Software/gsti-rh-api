import { createHash } from 'node:crypto'
import { cuid } from '@adonisjs/core/helpers'
import type { I18n } from '@adonisjs/i18n'
import RoleService from '#services/role_service'
import SystemSettingService from '#services/system_setting_service'
import UploadService from '#services/upload_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import {
  daysBetweenBusinessDates,
  toCalendarIsoDate,
  todayInBusinessZone,
} from '#utils/business_date'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '../concepts/concepts.constants.js'
import { buildUserNamesMap } from '../offboardings/dto/offboardings.dto.js'
import {
  DOCUMENT_DEPARTMENT_NAME_MAX_LENGTH,
  DOCUMENT_EMPLOYEE_NAME_MAX_LENGTH,
  DOCUMENT_LEGAL_NAME_MAX_LENGTH,
  DOCUMENT_MIME_TYPE,
  DOCUMENT_POSITION_NAME_MAX_LENGTH,
  DOCUMENT_SIGNED_URL_EXPIRES_SECONDS,
  DOCUMENTS_S3_FOLDER,
  REFERENCE_DATE_SOURCE,
  type EmployeeOffboardingDocumentType,
} from './documents.constants.js'
import DocumentsRepositoryMysql from './documents.repository.mysql.js'
import type { DocumentsRepository } from './documents.repository.js'
import SeparationLetterPdfService, {
  computeSeniority,
  sanitizeRenderText,
} from './separation_letter_pdf.service.js'
import { toDocumentDto, type EmployeeOffboardingDocumentDto } from './dto/documents.dto.js'

/** Acciones del módulo `employee-offboardings` que usa este slice (regla 14). */
export type EmployeeOffboardingDocumentAction = 'read' | 'create'

/**
 * Reglas de negocio de los documentos del expediente (USRH1787433503686):
 * emisión solo con la baja ejecutada (regla 1), una sola constancia por
 * expediente en H1a (regla 9), dato faltante = no se emite nada (regla 6),
 * snapshot saneado de lo impreso más sello sha256 y tamaño (regla 11),
 * archivo privado con enlace de 300 s (regla 16) y aislamiento en dos
 * saltos por el BU snapshoteado del expediente (regla 15).
 *
 * Sobre expediente CERRADO sí se emite (regla 12): desviación declarada
 * frente a la regla 8 de USRH1786568279596 — el candado de solo lectura
 * de esa historia vive por slice (pendientes y comprobantes) y este slice
 * no lo aplica. Elevado a Wilvardo, no cambiado en silencio.
 */
export default class DocumentsService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private readonly repository: DocumentsRepository
  private readonly pdfService: SeparationLetterPdfService

  constructor(
    i18n: I18n,
    repository: DocumentsRepository = new DocumentsRepositoryMysql(),
    pdfService: SeparationLetterPdfService = new SeparationLetterPdfService()
  ) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repository = repository
    this.pdfService = pdfService
  }

  /**
   * Regla 14 — `create` para emitir, `read` para consultar y descargar.
   * `root` y `owner` hacen bypass dentro de `RoleService.hasAccess`.
   */
  async assertCanAccess(
    roleId: number | null | undefined,
    action: EmployeeOffboardingDocumentAction
  ) {
    if (!roleId) {
      throw this.forbiddenError()
    }
    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(
      roleId,
      EMPLOYEE_OFFBOARDINGS_MODULE_SLUG,
      action
    )
    if (!hasAccess) {
      throw this.forbiddenError()
    }
  }

  /**
   * Emite la constancia (orden deliberado): expediente en alcance → baja
   * ejecutada → una sola emisión → completitud → render → sello → subida
   * privada → fila. Render y subida van fuera de transacción; si la fila
   * falla tras subir queda un objeto huérfano en S3, nunca una fila que
   * apunte a un objeto inexistente.
   */
  async issue(
    employeeOffboardingId: number,
    documentType: EmployeeOffboardingDocumentType,
    businessUnitScope: number[],
    generatedByUserId: number | null
  ): Promise<EmployeeOffboardingDocumentDto> {
    const offboarding = await this.resolveOffboarding(employeeOffboardingId, businessUnitScope)

    const employee = await this.repository.findEmployeeForLetter(offboarding.employeeId)
    if (!employee) {
      throw this.caseNotFoundError()
    }

    // Regla 1: el documento hace constar un hecho consumado
    if (employee.deletedAt === null || employee.deletedAt === undefined) {
      throw this.employeeStillActiveError()
    }

    // Regla 9 (frontera de H1a): una sola constancia viva por expediente
    const existing = await this.repository.countByOffboardingAndType(
      offboarding.employeeOffboardingId,
      documentType
    )
    if (existing > 0) {
      throw this.alreadyIssuedError()
    }

    // Datos ya saneados: lo mismo que se imprime es lo que se snapshotea
    const businessUnit = await this.repository.findBusinessUnit(offboarding.businessUnitId)
    const legalName = sanitizeRenderText(businessUnit?.businessUnitLegalName ?? '').slice(
      0,
      DOCUMENT_LEGAL_NAME_MAX_LENGTH
    )
    const employeeName = sanitizeRenderText(
      [
        employee.person?.personFirstname,
        employee.person?.personLastname,
        employee.person?.personSecondLastname,
      ]
        .filter((part) => typeof part === 'string')
        .join(' ')
    ).slice(0, DOCUMENT_EMPLOYEE_NAME_MAX_LENGTH)
    const positionName = sanitizeRenderText(employee.position?.positionName ?? '').slice(
      0,
      DOCUMENT_POSITION_NAME_MAX_LENGTH
    )
    const departmentName = sanitizeRenderText(employee.department?.departmentName ?? '').slice(
      0,
      DOCUMENT_DEPARTMENT_NAME_MAX_LENGTH
    )
    const hireDateIso = toCalendarIsoDate(employee.employeeHireDate)
    // Regla 5 (H1a): solo la fecha real de baja; la cascada es de H1b
    const referenceDateIso = toCalendarIsoDate(employee.employeeTerminatedDate)

    // Regla 6 — guarda GENERAL en un punto único (H1b la sustituye por la
    // función pura que enumera campo por campo). El departamento no bloquea.
    const seniorityDays =
      hireDateIso && referenceDateIso ? daysBetweenBusinessDates(hireDateIso, referenceDateIso) : -1
    if (
      legalName.length === 0 ||
      employeeName.length === 0 ||
      positionName.length === 0 ||
      !hireDateIso ||
      !referenceDateIso ||
      seniorityDays < 0
    ) {
      throw this.incompleteError()
    }

    const issuedAt = todayInBusinessZone()
    const folio = `CS-${offboarding.employeeOffboardingId}-${issuedAt.year}-0001`

    // Regla 7: sin departamento se imprime la unidad de adscripción
    const buffer = await this.renderOrFail({
      folio,
      employeeName,
      positionName,
      departmentOrUnit: departmentName.length > 0 ? departmentName : legalName,
      legalName,
      hireDateIso,
      referenceDateIso,
      seniority: computeSeniority(hireDateIso, referenceDateIso),
      tradeName: await this.resolveTradeName(offboarding.businessUnitId),
      issuedAt,
    })

    const contentHash = createHash('sha256').update(buffer).digest('hex')
    // Nombre solo con folio y literales del sistema: nunca datos personales
    const fileName = this.sanitizeFileName(`constancia-de-separacion-${folio}.pdf`)
    const storedKey = await new UploadService().uploadPrivateBuffer(
      `${DOCUMENTS_S3_FOLDER}/${offboarding.employeeOffboardingId}/${cuid()}-${fileName}`,
      buffer,
      DOCUMENT_MIME_TYPE
    )
    if (!storedKey) {
      throw this.storageFailedError()
    }

    const record = await this.repository.createDocument({
      employeeOffboardingId: offboarding.employeeOffboardingId,
      employeeOffboardingDocumentType: documentType,
      employeeOffboardingDocumentFolio: folio,
      employeeOffboardingDocumentFile: storedKey,
      employeeOffboardingDocumentFileName: fileName,
      employeeOffboardingDocumentSizeBytes: buffer.byteLength,
      employeeOffboardingDocumentEmployeeName: employeeName,
      employeeOffboardingDocumentPositionName: positionName,
      employeeOffboardingDocumentDepartmentName: departmentName.length > 0 ? departmentName : null,
      employeeOffboardingDocumentLegalName: legalName,
      employeeOffboardingDocumentHireDate: hireDateIso,
      employeeOffboardingDocumentReferenceDate: referenceDateIso,
      employeeOffboardingDocumentReferenceDateSource: REFERENCE_DATE_SOURCE.TERMINATED,
      employeeOffboardingDocumentSeniorityDays: seniorityDays,
      employeeOffboardingDocumentContentHash: contentHash,
      employeeOffboardingDocumentGeneratedByUserId: generatedByUserId,
    })

    return await this.toDto(record)
  }

  /** Documentos vivos del expediente, id descendente. */
  async list(
    employeeOffboardingId: number,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingDocumentDto[]> {
    const offboarding = await this.resolveOffboarding(employeeOffboardingId, businessUnitScope)
    const records = await this.repository.listByOffboarding(offboarding.employeeOffboardingId)
    const userIds = [
      ...new Set(
        records
          .map((record) => record.employeeOffboardingDocumentGeneratedByUserId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]
    const userNamesById = buildUserNamesMap(await this.repository.findUsersByIds(userIds))
    return records.map((record) => toDocumentDto(record, userNamesById))
  }

  /** URL pre-firmada de 300 s (regla 16). Se pide una nueva en cada clic. */
  async getDownloadUrl(
    employeeOffboardingId: number,
    employeeOffboardingDocumentId: number,
    businessUnitScope: number[]
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const offboarding = await this.resolveOffboarding(employeeOffboardingId, businessUnitScope)
    const record = await this.repository.findDocumentInOffboarding(
      offboarding.employeeOffboardingId,
      employeeOffboardingDocumentId
    )
    if (!record) {
      throw this.documentNotFoundError()
    }

    const url = await new UploadService().getDownloadLink(
      record.employeeOffboardingDocumentFile,
      DOCUMENT_SIGNED_URL_EXPIRES_SECONDS
    )
    // `getDownloadLink` no lanza: devuelve null u objeto en error. Nunca `!url`.
    if (typeof url !== 'string') {
      throw this.downloadFailedError()
    }
    return { downloadUrl: url, expiresInSeconds: DOCUMENT_SIGNED_URL_EXPIRES_SECONDS }
  }

  /** Primer salto: expediente vivo dentro del alcance, 404 uniforme. */
  private async resolveOffboarding(employeeOffboardingId: number, businessUnitScope: number[]) {
    const offboarding = await this.repository.findOffboardingInScope(
      employeeOffboardingId,
      businessUnitScope
    )
    if (!offboarding) {
      throw this.caseNotFoundError()
    }
    return offboarding
  }

  private async renderOrFail(
    data: Parameters<SeparationLetterPdfService['render']>[0]
  ): Promise<Buffer> {
    let buffer: Buffer
    try {
      buffer = await this.pdfService.render(data)
    } catch {
      throw this.renderFailedError()
    }
    if (buffer.byteLength === 0) {
      throw this.renderFailedError()
    }
    return buffer
  }

  /** Nombre comercial para el membrete; cosmético, nunca bloquea (fail-closed del setting). */
  private async resolveTradeName(businessUnitId: number): Promise<string> {
    try {
      const setting = await new SystemSettingService().resolveByBusinessUnitId(businessUnitId)
      return sanitizeRenderText(setting?.systemSettingTradeName ?? '')
    } catch {
      return ''
    }
  }

  private async toDto(record: Parameters<typeof toDocumentDto>[0]) {
    const userId = record.employeeOffboardingDocumentGeneratedByUserId
    const users = userId ? await this.repository.findUsersByIds([userId]) : []
    return toDocumentDto(record, buildUserNamesMap(users))
  }

  /** Lista blanca ASCII, colapsa `..`, corte a 100 (tercera copia privada del precedente). */
  private sanitizeFileName(rawName: string): string {
    return `${rawName}`
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)
  }

  private forbiddenError() {
    return new EmployeeOffboardingServiceError({
      key: 'sin-permiso',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_FORBIDDEN,
      httpStatus: 403,
      title: this.t('employee_offboarding_forbidden_title'),
      detail: this.t('employee_offboarding_forbidden_message'),
    })
  }

  private caseNotFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'expediente-no-encontrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_CASE_NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_case_not_found_title'),
      detail: this.t('employee_offboarding_case_out_of_scope_message'),
    })
  }

  private documentNotFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'documento-no-encontrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_document_not_found_title'),
      detail: this.t('employee_offboarding_document_not_found_detail'),
    })
  }

  private alreadyIssuedError() {
    return new EmployeeOffboardingServiceError({
      key: 'constancia-ya-emitida',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_ALREADY_ISSUED,
      httpStatus: 409,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_already_issued_detail'),
    })
  }

  private incompleteError() {
    return new EmployeeOffboardingServiceError({
      key: 'constancia-incompleta',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_INCOMPLETE,
      httpStatus: 422,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_incomplete_detail'),
    })
  }

  private employeeStillActiveError() {
    return new EmployeeOffboardingServiceError({
      key: 'baja-no-ejecutada',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_EMPLOYEE_STILL_ACTIVE,
      httpStatus: 422,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_employee_active_detail'),
    })
  }

  private renderFailedError() {
    return new EmployeeOffboardingServiceError({
      key: 'constancia-no-generada',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_RENDER_FAILED,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_render_failed_detail'),
    })
  }

  private storageFailedError() {
    return new EmployeeOffboardingServiceError({
      key: 'constancia-no-almacenada',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_STORAGE_FAILED,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_storage_failed_detail'),
    })
  }

  private downloadFailedError() {
    return new EmployeeOffboardingServiceError({
      key: 'constancia-descarga-fallida',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_DOWNLOAD_FAILED,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_download_error_title'),
      detail: this.t('employee_offboarding_document_download_failed_detail'),
    })
  }
}
