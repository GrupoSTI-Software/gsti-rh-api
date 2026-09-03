import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import {
  resolveEmployeeOffboardingApiError,
  type EmployeeOffboardingErrorFallbacks,
} from '#helpers/employee_offboarding_api_error'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import DocumentsService from './documents.service.js'
import { issueOffboardingDocumentValidator } from './validators/issue_document.validator.js'
import { listOffboardingDocumentsValidator } from './validators/list_documents.validator.js'

/** Ramos genéricos del resolvedor con los códigos propios del slice. */
const DOCUMENT_FALLBACKS: EmployeeOffboardingErrorFallbacks = {
  valInputCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_VAL_INPUT,
  unexpectedCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_UNEXPECTED,
}

/**
 * Documentos del expediente de salida (USRH1787433503686). Errores siempre
 * `{ title, detail, key, code }`. `assertCanAccess` es la PRIMERA sentencia
 * de las tres acciones: si el 404 llegara antes que el 403, un usuario sin
 * permiso distinguiría expedientes existentes de inexistentes.
 */
export default class DocumentsController {
  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/documents:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Lista los documentos emitidos del expediente
   *     description: |
   *       Solo filas vivas, id descendente. Por defecto devuelve SOLO la
   *       emisión vigente; con includeSuperseded=true viaja el historial
   *       completo con las reemplazadas (USRH1787433503692). Nunca expone
   *       la Key de S3 ni un tipo MIME: el documento del slice es siempre PDF.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: includeSuperseded
   *         schema: { type: boolean, default: false }
   *         description: Incluye las emisiones reemplazadas (historial completo)
   *       - in: query
   *         name: documentType
   *         schema: { type: string, enum: [separation_letter] }
   *     responses:
   *       200:
   *         description: Documentos en data.employeeOffboardingDocuments
   *       403:
   *         description: Sin permiso read sobre employee-offboardings (key sin-permiso)
   *       404:
   *         description: Expediente inexistente o fuera del alcance (key expediente-no-encontrado)
   */
  async index({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new DocumentsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const filters = await request.validateUsing(listOffboardingDocumentsValidator)
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const employeeOffboardingDocuments = await service.list(offboardingId, businessUnitScope, {
        includeSuperseded: filters.includeSuperseded === true,
        documentType: filters.documentType,
      })
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingDocuments,
        i18n.formatMessage('employee_offboarding_document_resource_title'),
        i18n.formatMessage('employee_offboarding_document_list_message'),
        200,
        'employeeOffboardingDocuments'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/documents:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Emite o re-emite la constancia de separación del expediente
   *     description: |
   *       Solo con la baja ya ejecutada y con los datos obligatorios
   *       capturados: si falta uno no se produce nada. Se emite cuantas
   *       veces haga falta (USRH1787433503692): cada emisión es una fila
   *       nueva con folio consecutivo bajo forUpdate, la anterior queda
   *       reemplazada (nunca se borra) y exactamente una queda vigente.
   *       PDF fijo en español, privado en S3, con snapshot de lo impreso,
   *       sello sha256 y tamaño. Sobre expediente cerrado sí se emite.
   *       No muta nada más.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [documentType]
   *             properties:
   *               documentType: { type: string, enum: [separation_letter] }
   *     responses:
   *       201:
   *         description: Documento emitido en data.employeeOffboardingDocument
   *       400:
   *         description: documentType ausente o desconocido (key datos-invalidos)
   *       403:
   *         description: Sin permiso create (key sin-permiso)
   *       404:
   *         description: Expediente fuera del alcance (key expediente-no-encontrado)
   *       422:
   *         description: Baja no ejecutada (key baja-no-ejecutada) o dato faltante (key constancia-incompleta)
   *       500:
   *         description: Fallo de render (constancia-no-generada) o de almacenamiento (constancia-no-almacenada)
   */
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new DocumentsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'create')
      const data = await request.validateUsing(issueOffboardingDocumentValidator)
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const employeeOffboardingDocument = await service.issue(
        offboardingId,
        data.documentType,
        businessUnitScope,
        auth.user?.userId ?? null
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingDocument,
        i18n.formatMessage('employee_offboarding_document_resource_title'),
        i18n.formatMessage('employee_offboarding_document_issued_message'),
        201,
        'employeeOffboardingDocument'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/documents/{documentId}/download-url:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Genera el enlace temporal de descarga del documento
   *     description: |
   *       URL pre-firmada de 300 segundos (regla 16); se pide una nueva en
   *       cada descarga. La Key de S3 nunca viaja al cliente.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: documentId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: data.employeeOffboardingDocumentDownload con downloadUrl y expiresInSeconds
   *       403:
   *         description: Sin permiso read (key sin-permiso)
   *       404:
   *         description: Expediente o documento fuera del alcance (keys expediente-no-encontrado / documento-no-encontrado)
   *       500:
   *         description: Fallo al firmar la URL (key constancia-descarga-fallida)
   */
  async downloadUrl({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new DocumentsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const documentId = this.parseId(request.param('documentId'), i18n)
      const download = await service.getDownloadUrl(offboardingId, documentId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        download,
        i18n.formatMessage('employee_offboarding_document_resource_title'),
        i18n.formatMessage('employee_offboarding_document_download_message'),
        200,
        'employeeOffboardingDocumentDownload'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  private parseId(rawId: string, i18n: HttpContext['i18n']): number {
    const parsed = Number.parseInt(rawId, 10)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new EmployeeOffboardingServiceError({
        key: 'datos-invalidos',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.DOC_VAL_INPUT,
        httpStatus: 400,
        title: i18n.formatMessage('employee_offboarding_val_input_title'),
        detail: i18n.formatMessage('employee_offboarding_val_input_message'),
      })
    }
    return parsed
  }

  private respondWithError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: unknown
  ) {
    const resolved = resolveEmployeeOffboardingApiError(error, i18n, DOCUMENT_FALLBACKS)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
