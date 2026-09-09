import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import {
  resolveEmployeeOffboardingApiError,
  type EmployeeOffboardingErrorFallbacks,
} from '#helpers/employee_offboarding_api_error'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import { DOCUMENT_TEMPLATE_VERSIONS_DEFAULT_LIMIT } from './document_templates.constants.js'
import DocumentTemplatesService from './document_templates.service.js'
import { listDocumentTemplateVersionsValidator } from './validators/list_document_template_versions.validator.js'

/**
 * Ramos genéricos del resolvedor con los códigos propios del slice. La rama
 * de fallback del helper emite `error-inesperado`, que no está en la unión:
 * se pasa `error-interno` en lugar de tocar el helper compartido.
 */
const TEMPLATE_FALLBACKS: EmployeeOffboardingErrorFallbacks = {
  valInputCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_VAL_INPUT,
  unexpectedCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_UNEXPECTED,
  unexpectedKey: 'error-interno',
}

/**
 * Plantillas propias del documento de salida (USRH1788553841100). Errores
 * siempre `{ title, detail, key, code }`. `assertCanAccess` es la PRIMERA
 * sentencia de las cuatro acciones: antes de leer el multipart, de tocar el
 * almacenamiento y de cualquier consulta (CA-10).
 */
export default class DocumentTemplatesController {
  /**
   * @swagger
   * /api/employee-offboarding-document-templates:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Catálogo de plantillas propias por tipo de documento de salida
   *     description: |
   *       Una entrada por cada tipo declarado (hoy separation_letter) con la
   *       versión vigente de la empresa activa, o usesSystemTemplate=true y
   *       currentVersion=null cuando la empresa sigue con la plantilla del
   *       sistema. Nunca expone la Key de S3.
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: data.employeeOffboardingDocumentTemplates con { documentType, usesSystemTemplate, currentVersion }
   *       403:
   *         description: Sin permiso read sobre employee-offboardings (key sin-permiso)
   */
  async index({ auth, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new DocumentTemplatesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const employeeOffboardingDocumentTemplates = await service.listCatalog(businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingDocumentTemplates,
        i18n.formatMessage('employee_offboarding_document_template_resource_title'),
        i18n.formatMessage('employee_offboarding_document_template_catalog_message'),
        200,
        'employeeOffboardingDocumentTemplates'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboarding-document-templates/{documentType}/versions:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Historial de versiones de la plantilla propia de un tipo de documento
   *     description: |
   *       Todas las versiones de la empresa activa para el tipo — vigente,
   *       reemplazadas y rechazadas — por número de versión descendente,
   *       paginadas (default 50, máximo 100). Ninguna versión se borra.
   *     parameters:
   *       - in: path
   *         name: documentType
   *         required: true
   *         schema: { type: string, enum: [separation_letter] }
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
   *     responses:
   *       200:
   *         description: data.employeeOffboardingDocumentTemplateVersions con meta y data
   *       400:
   *         description: Paginado mal formado (key datos-invalidos)
   *       403:
   *         description: Sin permiso read (key sin-permiso)
   *       422:
   *         description: Tipo de documento desconocido (key tipo-de-documento-no-valido)
   */
  async versions({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new DocumentTemplatesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const filters = await request.validateUsing(listDocumentTemplateVersionsValidator)
      const result = await service.listVersions(businessUnitScope, request.param('documentType'), {
        page: filters.page ?? 1,
        limit: filters.limit ?? DOCUMENT_TEMPLATE_VERSIONS_DEFAULT_LIMIT,
      })
      return StandardResponseFormatter.success(
        response,
        { meta: result.meta, data: result.data },
        i18n.formatMessage('employee_offboarding_document_template_resource_title'),
        i18n.formatMessage('employee_offboarding_document_template_versions_message'),
        200,
        'employeeOffboardingDocumentTemplateVersions'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboarding-document-templates/{documentType}/versions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Sube el PDF base de la empresa como versión nueva vigente
   *     description: |
   *       Cualquier PDF que pase el intake (10 MB, MIME real, privado) se
   *       declara plantilla; revisar que sirva como tal es de historias
   *       posteriores. Cada carga crea una versión consecutiva; la vigente
   *       anterior pasa a superseded en la misma transacción y nunca se borra.
   *       El sello sha256 se calcula sobre el archivo tal como quedó
   *       almacenado. No toca los documentos ya emitidos. Por encima del
   *       tope multipart de la plataforma (20 MB) el bodyparser responde
   *       413 antes de llegar aquí; entre 10 y 20 MB rechaza el intake (422).
   *     parameters:
   *       - in: path
   *         name: documentType
   *         required: true
   *         schema: { type: string, enum: [separation_letter] }
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [file]
   *             properties:
   *               file: { type: string, format: binary, description: 'PDF de hasta 10 MB' }
   *     responses:
   *       201:
   *         description: Versión creada en data.employeeOffboardingDocumentTemplate
   *       400:
   *         description: Campo file ausente (key datos-invalidos)
   *       403:
   *         description: Sin permiso create (key sin-permiso), resuelto antes de leer el archivo
   *       422:
   *         description: Tipo desconocido (tipo-de-documento-no-valido) o archivo rechazado por el intake (keys y códigos FILE.* propios del intake)
   *       500:
   *         description: Almacenamiento fallido (plantilla-no-almacenada); no queda fila
   */
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new DocumentTemplatesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'create')
      // Primer filtro de Adonis; el error estable lo produce el intake en el servicio
      const file = request.file('file', { extnames: ['pdf'], size: '10mb' })
      const employeeOffboardingDocumentTemplate = await service.createVersion(
        businessUnitScope,
        request.param('documentType'),
        file,
        auth.user?.userId ?? null
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingDocumentTemplate,
        i18n.formatMessage('employee_offboarding_document_template_resource_title'),
        i18n.formatMessage('employee_offboarding_document_template_uploaded_message'),
        201,
        'employeeOffboardingDocumentTemplate'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboarding-document-templates/{documentType}/versions/{versionId}/download-url:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Genera el enlace temporal de descarga de una versión
   *     description: |
   *       URL pre-firmada de 300 segundos, nueva en cada petición; no se
   *       persiste ni se loguea. Descargar no cambia el estado de la versión.
   *     parameters:
   *       - in: path
   *         name: documentType
   *         required: true
   *         schema: { type: string, enum: [separation_letter] }
   *       - in: path
   *         name: versionId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: data.employeeOffboardingDocumentTemplateDownload con downloadUrl y expiresInSeconds
   *       403:
   *         description: Sin permiso read (key sin-permiso)
   *       404:
   *         description: Versión inexistente, de otro tipo o de otra empresa (key plantilla-no-encontrada), idéntico en los tres casos
   *       422:
   *         description: Tipo de documento desconocido (key tipo-de-documento-no-valido)
   *       500:
   *         description: Fallo al firmar la URL (key plantilla-descarga-fallida)
   */
  async downloadUrl({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new DocumentTemplatesService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const versionId = this.parseId(request.param('versionId'), i18n)
      const download = await service.getDownloadUrl(
        businessUnitScope,
        request.param('documentType'),
        versionId
      )
      return StandardResponseFormatter.success(
        response,
        download,
        i18n.formatMessage('employee_offboarding_document_template_resource_title'),
        i18n.formatMessage('employee_offboarding_document_template_download_message'),
        200,
        'employeeOffboardingDocumentTemplateDownload'
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
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.TEMPLATE_VAL_INPUT,
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
    const resolved = resolveEmployeeOffboardingApiError(error, i18n, TEMPLATE_FALLBACKS)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
