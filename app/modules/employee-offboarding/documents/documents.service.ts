import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { I18n } from '@adonisjs/i18n'
import RoleService from '#services/role_service'
import SystemSettingService from '#services/system_setting_service'
import UploadService from '#services/upload_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import {
  daysBetweenBusinessDates,
  getBusinessTimeZone,
  toCalendarIsoDate,
  todayInBusinessZone,
} from '#utils/business_date'
import type EmployeeOffboardingDocumentTemplate from '#models/employee_offboarding_document_template'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '../concepts/concepts.constants.js'
import { buildUserNamesMap } from '../offboardings/dto/offboardings.dto.js'
import DocumentTemplatesRepositoryMysql from '../document-templates/document_templates.repository.mysql.js'
import type { DocumentTemplatesRepository } from '../document-templates/document_templates.repository.js'
import { fieldByKey, type OffboardingDocumentFieldKey } from './document_fields.constants.js'
import DocumentTemplateFillService, {
  type DocumentTemplateFieldValues,
  type DocumentTemplateFillFailure,
} from './document_template_fill.service.js'
import {
  DOCUMENT_DEPARTMENT_NAME_MAX_LENGTH,
  DOCUMENT_EMPLOYEE_NAME_MAX_LENGTH,
  DOCUMENT_LEGAL_NAME_MAX_LENGTH,
  DOCUMENT_MIME_TYPE,
  DOCUMENT_POSITION_NAME_MAX_LENGTH,
  DOCUMENT_PRINTED_DATE_FORMAT,
  DOCUMENT_SIGNED_URL_EXPIRES_SECONDS,
  DOCUMENTS_S3_FOLDER,
  MISSING_FIELD_LABEL_KEY,
  REFERENCE_DATE_SOURCE,
  type EmployeeOffboardingDocumentType,
} from './documents.constants.js'
import DocumentsRepositoryMysql from './documents.repository.mysql.js'
import type { DocumentsRepository } from './documents.repository.js'
import SeparationLetterPdfService, {
  collectMissingSeparationLetterFields,
  computeSeniority,
  formatSeniority,
  sanitizeRenderText,
  type MissingSeparationLetterField,
} from './separation_letter_pdf.service.js'
import {
  templateVersionNumberOf,
  toDocumentDto,
  type EmployeeOffboardingDocumentDto,
} from './dto/documents.dto.js'

/** Acciones del módulo `employee-offboardings` que usa este slice (regla 14). */
export type EmployeeOffboardingDocumentAction = 'read' | 'create'

/** Salida del render, venga de la plantilla propia o de la del sistema. */
interface RenderedDocument {
  buffer: Buffer
  /** Opcionales del catálogo que la plantilla propia trae sin admitir texto; vacío con la del sistema. */
  skippedFieldKeys: OffboardingDocumentFieldKey[]
}

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
 *
 * Plantilla propia (USRH1789097550389): al emitir se resuelve la versión
 * vigente de la empresa dueña del expediente; si existe, el documento se
 * produce sobre ella con los MISMOS valores saneados, se aplana y la
 * emisión queda amarrada a esa versión. Sin plantilla propia, el camino de
 * siempre. Una vigente no recuperable es error explícito, jamás caída
 * silenciosa a la del sistema (regla 6).
 */
export default class DocumentsService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private readonly locale: string
  private readonly repository: DocumentsRepository
  private readonly pdfService: SeparationLetterPdfService
  private readonly templatesRepository: DocumentTemplatesRepository
  private readonly fillService: DocumentTemplateFillService

  constructor(
    i18n: I18n,
    repository: DocumentsRepository = new DocumentsRepositoryMysql(),
    pdfService: SeparationLetterPdfService = new SeparationLetterPdfService(),
    templatesRepository: DocumentTemplatesRepository = new DocumentTemplatesRepositoryMysql(),
    fillService: DocumentTemplateFillService = new DocumentTemplateFillService()
  ) {
    this.t = i18n.formatMessage.bind(i18n)
    this.locale = i18n.locale
    this.repository = repository
    this.pdfService = pdfService
    this.templatesRepository = templatesRepository
    this.fillService = fillService
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
    const hasAccess = await roleService.hasAccess(roleId, EMPLOYEE_OFFBOARDINGS_MODULE_SLUG, action)
    if (!hasAccess) {
      throw this.forbiddenError()
    }
  }

  /**
   * Emite la constancia (orden deliberado): expediente en alcance → baja
   * ejecutada → datos saneados → plantilla propia resuelta y leída →
   * completitud → render (propia o del sistema) → sello → subida privada →
   * fila. Render y subida van fuera de transacción; si la fila falla tras
   * subir queda un objeto huérfano en S3, nunca una fila que apunte a un
   * objeto inexistente.
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
    // Regla 5 — cascada (molde literal del DTO del expediente): la fecha real
    // de baja y, si no existe (bajas de piloto/sobrecargo), la de apertura del
    // expediente. Se recuerda de cuál salió (regla 6). `??`, nunca `||`.
    const terminatedDateIso = toCalendarIsoDate(employee.employeeTerminatedDate)
    const referenceDateIso =
      terminatedDateIso ?? toCalendarIsoDate(offboarding.employeeOffboardingPlannedDate)
    const referenceDateSource = terminatedDateIso
      ? REFERENCE_DATE_SOURCE.TERMINATED
      : REFERENCE_DATE_SOURCE.PLANNED

    // Plantilla propia (USRH1789097550389, reglas 1, 6 y 9): resuelta AL
    // EMITIR por el BU SNAPSHOTEADO del expediente — nunca el del encabezado —
    // y leída UNA sola vez, fuera del bucle de folio y de la transacción (I/O
    // de red). Sin buffer no se emite nada y no se cae a la del sistema. Va
    // antes de la guarda a propósito (R-12): USRH1789097550392 la hará
    // dinámica sobre la plantilla ya resuelta.
    const template = await this.templatesRepository.resolveCurrent(
      offboarding.businessUnitId,
      documentType
    )
    const templateBuffer = template ? await this.readTemplateOrFail(template) : null

    // Regla 1 — guarda PURA en un punto único, antes de gastar CPU o red:
    // el 422 enumera cada dato con su pestaña destino (regla 2).
    const missing = collectMissingSeparationLetterFields({
      legalName,
      employeeName,
      position: positionName,
      hireDate: hireDateIso,
      separationDate: referenceDateIso,
    })
    if (missing.length > 0 || !hireDateIso || !referenceDateIso) {
      throw this.incompleteError(missing)
    }

    // Regla 7 — coherencia DESPUÉS de la guarda: sin las dos fechas no hay
    // nada que comparar y el usuario recibiría el error equivocado.
    const seniorityDays = daysBetweenBusinessDates(hireDateIso, referenceDateIso)
    if (seniorityDays < 0) {
      throw this.dateRangeInvalidError()
    }

    const issuedAt = todayInBusinessZone()
    const departmentOrUnit = departmentName.length > 0 ? departmentName : legalName

    // Regla 3 — folio consecutivo por expediente y tipo. El folio SE IMPRIME
    // en el PDF, así que se estima ANTES de renderizar (sin lock) y se
    // CONFIRMA bajo el forUpdate: si otra emisión ganó la carrera, se
    // re-renderiza con el consecutivo correcto. El lock nunca se sostiene
    // durante el render ni la subida (transacción corta y al final); el
    // objeto de un intento perdedor queda huérfano en S3 — degradación
    // aceptada, nunca una fila que apunte a un objeto inexistente.
    const MAX_FOLIO_ATTEMPTS = 3
    for (let attempt = 1; attempt <= MAX_FOLIO_ATTEMPTS; attempt++) {
      const expectedCount = await this.repository.countByOffboardingAndType(
        offboarding.employeeOffboardingId,
        documentType
      )
      const folio = this.buildFolio(
        offboarding.employeeOffboardingId,
        issuedAt.year,
        expectedCount + 1
      )

      // Regla 7 de H1a: sin departamento se imprime la unidad de adscripción.
      // Regla 2 (USRH1789097550389): la plantilla propia recibe EXACTAMENTE los
      // valores que imprime la del sistema; no hay segunda ruta de datos.
      const seniority = computeSeniority(hireDateIso, referenceDateIso)
      const tradeName = await this.resolveTradeName(offboarding.businessUnitId)
      const rendered: RenderedDocument = templateBuffer
        ? await this.fillTemplateOrFail(templateBuffer, documentType, {
            legal_name: legalName,
            trade_name: tradeName,
            employee_name: employeeName,
            position_name: positionName,
            department_or_unit: departmentOrUnit,
            hire_date: this.formatCalendarDate(hireDateIso),
            separation_date: this.formatCalendarDate(referenceDateIso),
            seniority: formatSeniority(seniority),
            folio,
            issue_date: issuedAt.toFormat(DOCUMENT_PRINTED_DATE_FORMAT),
          })
        : {
            buffer: await this.renderOrFail({
              folio,
              employeeName,
              positionName,
              departmentOrUnit,
              legalName,
              hireDateIso,
              referenceDateIso,
              seniority,
              tradeName,
              issuedAt,
            }),
            skippedFieldKeys: [],
          }
      const buffer = rendered.buffer

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

      // Transacción corta y al final: lock del expediente YA resuelto en
      // alcance, recuento bajo lock, traslado de vigencia (nunca se borra la
      // anterior, regla 2) e INSERT — un único forUpdate para todo.
      const record = await db.transaction(async (trx) => {
        const locked = await this.repository.lockOffboardingRow(
          offboarding.employeeOffboardingId,
          trx
        )
        if (!locked) {
          throw this.caseNotFoundError()
        }

        const countUnderLock = await this.repository.countByOffboardingAndType(
          offboarding.employeeOffboardingId,
          documentType,
          trx
        )
        if (countUnderLock !== expectedCount) {
          // Otra emisión consumió el folio estimado: el impreso ya no
          // coincidiría con el guardado — se reintenta con el correcto
          return null
        }

        const supersededDocumentId = await this.repository.markCurrentAsSuperseded(
          offboarding.employeeOffboardingId,
          documentType,
          trx
        )

        return await this.repository.createDocument(
          {
            employeeOffboardingId: offboarding.employeeOffboardingId,
            employeeOffboardingDocumentType: documentType,
            employeeOffboardingDocumentFolio: folio,
            employeeOffboardingDocumentFile: storedKey,
            employeeOffboardingDocumentFileName: fileName,
            employeeOffboardingDocumentSizeBytes: buffer.byteLength,
            employeeOffboardingDocumentEmployeeName: employeeName,
            employeeOffboardingDocumentPositionName: positionName,
            employeeOffboardingDocumentDepartmentName:
              departmentName.length > 0 ? departmentName : null,
            employeeOffboardingDocumentLegalName: legalName,
            employeeOffboardingDocumentHireDate: hireDateIso,
            employeeOffboardingDocumentReferenceDate: referenceDateIso,
            employeeOffboardingDocumentReferenceDateSource: referenceDateSource,
            employeeOffboardingDocumentSeniorityDays: seniorityDays,
            employeeOffboardingDocumentContentHash: contentHash,
            employeeOffboardingDocumentGeneratedByUserId: generatedByUserId,
            employeeOffboardingDocumentSupersededDocumentId: supersededDocumentId,
            // Regla 4: amarrada a la versión resuelta; `null` = plantilla del sistema
            employeeOffboardingDocumentTemplateVersionId:
              template?.employeeOffboardingDocumentTemplateId ?? null,
          },
          trx
        )
      })

      if (record) {
        // Identificadores y claves del catálogo: nunca nombres, valores, buffer ni URL
        logger.info(
          {
            offboardingId: offboarding.employeeOffboardingId,
            documentType,
            documentId: record.employeeOffboardingDocumentId,
            templateVersionId: template?.employeeOffboardingDocumentTemplateId ?? null,
            skippedFieldKeys: rendered.skippedFieldKeys,
          },
          'Documento de salida emitido'
        )
        return await this.toDto(
          record,
          template ? Number(template.employeeOffboardingDocumentTemplateVersionNumber) : null
        )
      }
    }

    throw this.concurrencyExhaustedError()
  }

  /**
   * Documentos vivos del expediente, id descendente. Por defecto solo la
   * vigente (regla 5); el historial se pide con `includeSuperseded`.
   */
  async list(
    employeeOffboardingId: number,
    businessUnitScope: number[],
    filters: { includeSuperseded: boolean; documentType?: string }
  ): Promise<EmployeeOffboardingDocumentDto[]> {
    const offboarding = await this.resolveOffboarding(employeeOffboardingId, businessUnitScope)
    const records = await this.repository.listByOffboarding(
      offboarding.employeeOffboardingId,
      filters
    )
    const userIds = [
      ...new Set(
        records
          .map((record) => record.employeeOffboardingDocumentGeneratedByUserId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]
    const userNamesById = buildUserNamesMap(await this.repository.findUsersByIds(userIds))
    return records.map((record) =>
      toDocumentDto(record, userNamesById, templateVersionNumberOf(record))
    )
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

  /**
   * Regla 6 — `readStoredFileBuffer` devuelve `null` sin lanzar: la guarda es
   * obligatoria y el fallo es explícito. Jamás fallback a la del sistema.
   */
  private async readTemplateOrFail(template: EmployeeOffboardingDocumentTemplate): Promise<Buffer> {
    const buffer = await new UploadService().readStoredFileBuffer(
      template.employeeOffboardingDocumentTemplateStorageKey
    )
    if (!buffer || buffer.byteLength === 0) {
      throw this.templateUnavailableError()
    }
    return buffer
  }

  /**
   * Regla 7 — el llenado devuelve un fallo tipado; aquí se traduce al error de
   * dominio: dato no imprimible = 422 corregible por el usuario; el resto = 500.
   */
  private async fillTemplateOrFail(
    templateBuffer: Buffer,
    documentType: EmployeeOffboardingDocumentType,
    values: DocumentTemplateFieldValues
  ): Promise<RenderedDocument> {
    const result = await this.fillService.fill(templateBuffer, documentType, values)
    if (result.ok) {
      return { buffer: result.buffer, skippedFieldKeys: result.skippedFieldKeys }
    }
    if (result.failure.reason === 'unrenderable_text') {
      throw this.templateTextUnrenderableError(result.failure.fieldKey)
    }
    throw this.templateFillFailedError(result.failure)
  }

  /**
   * Fecha civil como la imprime la plantilla del sistema (zona de negocio).
   * Copia declarada del privado de `separation_letter_pdf.service.ts`, que
   * no se edita (candado G-14).
   */
  private formatCalendarDate(iso: string): string {
    return DateTime.fromISO(iso, { zone: getBusinessTimeZone() }).toFormat(
      DOCUMENT_PRINTED_DATE_FORMAT
    )
  }

  /** Etiqueta del catálogo en el idioma de la petición; el `key` solo si el catálogo no la tuviera. */
  private fieldLabel(fieldKey: OffboardingDocumentFieldKey): string {
    return this.t(fieldByKey(fieldKey)?.labelKey ?? fieldKey)
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

  private async toDto(
    record: Parameters<typeof toDocumentDto>[0],
    templateVersionNumber: number | null
  ) {
    const userId = record.employeeOffboardingDocumentGeneratedByUserId
    const users = userId ? await this.repository.findUsersByIds([userId]) : []
    return toDocumentDto(record, buildUserNamesMap(users), templateVersionNumber)
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

  /**
   * Detalle compuesto en el idioma de la petición con las etiquetas del
   * catálogo (nunca valores de la ficha): "a, b y c" por `Intl.ListFormat`,
   * que resuelve la conjunción por locale sin una clave i18n extra.
   */
  /** `CS-{expediente}-{año en zona de negocio}-{consecutivo a 4 dígitos}` (regla 3). */
  private buildFolio(employeeOffboardingId: number, year: number, sequence: number): string {
    return `CS-${employeeOffboardingId}-${year}-${String(sequence).padStart(4, '0')}`
  }

  /**
   * Tras varios intentos la carrera por el folio no se resolvió: estado
   * excepcional (el botón en vuelo del BO evita llegar aquí) — 500 genérico.
   */
  private concurrencyExhaustedError() {
    return new EmployeeOffboardingServiceError({
      key: 'error-interno',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_UNEXPECTED,
      httpStatus: 500,
      title: this.t('employee_offboarding_unexpected_title'),
      detail: this.t('employee_offboarding_unexpected_message'),
    })
  }

  private incompleteError(missing: MissingSeparationLetterField[]) {
    const labels = missing.map((field) => this.t(MISSING_FIELD_LABEL_KEY[field]))
    const fields = new Intl.ListFormat(this.locale, { style: 'long', type: 'conjunction' }).format(
      labels
    )
    return new EmployeeOffboardingServiceError({
      key: 'constancia-incompleta',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_INCOMPLETE,
      httpStatus: 422,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_incomplete_detail', { fields }),
    })
  }

  private dateRangeInvalidError() {
    return new EmployeeOffboardingServiceError({
      key: 'fechas-de-la-constancia-incoherentes',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_DATE_RANGE_INVALID,
      httpStatus: 422,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_date_range_detail'),
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

  /** Regla 6: hay vigente registrada pero su objeto no se leyó. No es 404: la plantilla existe. */
  private templateUnavailableError() {
    return new EmployeeOffboardingServiceError({
      key: 'plantilla-vigente-no-recuperable',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_TEMPLATE_UNAVAILABLE,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_template_unavailable_detail'),
    })
  }

  /** Regla 7: 422 porque lo corrige el usuario en la ficha; nombra el dato, nunca su valor. */
  private templateTextUnrenderableError(fieldKey: OffboardingDocumentFieldKey) {
    return new EmployeeOffboardingServiceError({
      key: 'dato-no-imprimible-en-la-plantilla',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_TEMPLATE_TEXT_UNRENDERABLE,
      httpStatus: 422,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_template_text_unrenderable_detail', {
        field: this.fieldLabel(fieldKey),
      }),
    })
  }

  /**
   * Regla 7: un solo `code` para "no se pudo producir el documento"; el
   * `detail` distingue la causa (ICU `select`) y nombra el hueco cuando lo hay.
   */
  private templateFillFailedError(failure: DocumentTemplateFillFailure) {
    const cause =
      failure.reason === 'required_field_unwritable'
        ? 'field'
        : failure.reason === 'fields_left_after_flatten'
          ? 'flatten'
          : 'other'
    const field =
      failure.reason === 'required_field_unwritable' ? this.fieldLabel(failure.fieldKey) : ''
    return new EmployeeOffboardingServiceError({
      key: 'documento-no-generado-con-plantilla',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_TEMPLATE_FILL_FAILED,
      httpStatus: 500,
      title: this.t('employee_offboarding_document_issue_error_title'),
      detail: this.t('employee_offboarding_document_template_fill_failed_detail', { cause, field }),
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
