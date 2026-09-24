import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import type { I18n } from '@adonisjs/i18n'
import { errors as vineErrors } from '@vinejs/vine'
import { contentDisposition } from '#helpers/download_file_name'
import { resolveExpirationMatrixAccess } from './documents_expiration_matrix.access.js'
import { EXPIRATION_MATRIX_ERROR_KEYS } from './documents_expiration_matrix.constants.js'
import { ExpirationMatrixError } from './documents_expiration_matrix.error.js'
import DocumentsExpirationMatrixService, {
  type ExpirationMatrixLabels,
} from './documents_expiration_matrix.service.js'
import { expirationMatrixItemKeyValidator } from './validators/expiration_matrix_item_key.validator.js'

/** Nombre genérico del documento por fuente, traducido según `Accept-Language`. */
function resolveLabels(i18n: I18n): ExpirationMatrixLabels {
  return {
    'employee-file': i18n.t('expiration_matrix_document_employee_file', undefined, 'Expediente'),
    'employee-contract': i18n.t('expiration_matrix_document_employee_contract', undefined, 'Contrato'),
    'company-file': i18n.t('expiration_matrix_document_company_file', undefined, 'Expediente de la empresa'),
    'certification': i18n.t('expiration_matrix_document_certification', undefined, 'Certificación'),
    'repse-folio': i18n.t('expiration_matrix_document_repse_folio', undefined, 'Folio REPSE'),
    'provider-folio': i18n.t(
      'expiration_matrix_document_provider_folio',
      undefined,
      'Folio REPSE del proveedor'
    ),
    'supply': i18n.t('expiration_matrix_document_supply', undefined, 'Insumo'),
  }
}

/**
 * Matriz de vencimientos agregada del backoffice: sustituye las seis llamadas
 * por fuente (con N+1 en insumos) por una sola. Los endpoints por fuente
 * (`get-expired-and-expiring`) siguen vivos con su contrato.
 */
@inject()
export default class DocumentsExpirationMatrixController {
  constructor(private readonly service: DocumentsExpirationMatrixService) {}

  /**
   * @swagger
   * /api/documents-expiration-matrix:
   *   get:
   *     summary: Vencimientos de documentos de todas las fuentes en una sola llamada
   *     description: |
   *       Ventana única de 30 días naturales en zona de negocio: entra todo lo
   *       vencido (sin límite inferior) y lo que vence de hoy a hoy + 30,
   *       ambos inclusive. Items ordenados por `expiresAt` ascendente y luego
   *       por `documentName`.
   *
   *       Fuentes y permiso con el que cada una aporta items (además de
   *       `documents-expiration-matrix:read`, que exige la ruta). Una fuente
   *       sin permiso no aporta items; no responde 403.
   *       - `employee-file`: `employees:tab-expediente-read`, acotado a los
   *         departamentos del rol. Archivo con `employees:download-proceeding-files`.
   *       - `employee-contract`: igual que `employee-file`. Archivo con
   *         `employees:download-employee-contract` y `employees:tab-trabajo-read`.
   *       - `company-file`: expediente de la ficha activa de la empresa.
   *       - `certification`: `employees:tab-certificaciones-read` (última por
   *         empleado y certificación), acotado a los departamentos del rol.
   *       - `repse-folio`: folios REPSE activos de la empresa. Constancia con
   *         `repse-registrations` read o gestion.
   *       - `provider-folio`: `repse-providers` read o gestion. Sin archivo.
   *       - `supply`: insumos asignados activos, acotado a los departamentos
   *         del rol; archivo = resguardo más reciente.
   *
   *       `hasFile` es `true` solo si hay archivo y la sesión puede abrirlo.
   *     tags: [DocumentsExpirationMatrix]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *         description: "Unidad de negocio seleccionada (scope del tenant)."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Traduce title/message y los nombres genéricos de documento."
   *     responses:
   *       '200':
   *         description: Vencimientos agregados.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Matriz de vencimientos
   *               message: Vencimientos obtenidos correctamente
   *               data:
   *                 windowDays: 30
   *                 today: "2026-09-23"
   *                 items:
   *                   - key: "employee-file-418"
   *                     source: employee-file
   *                     documentName: "Constancia de situación fiscal"
   *                     reference: "csf.pdf"
   *                     expiresAt: "2026-09-20"
   *                     daysToExpire: -3
   *                     owner:
   *                       kind: employee
   *                       employeeId: 57
   *                       name: "Ana López Ruiz"
   *                       positionName: "Analista"
   *                       departmentName: "Finanzas"
   *                       employeeCode: "1057"
   *                     hasFile: true
   *                   - key: "provider-folio-12"
   *                     source: provider-folio
   *                     documentName: "Folio REPSE del proveedor"
   *                     reference: "REPSE-12345"
   *                     expiresAt: "2026-10-05"
   *                     daysToExpire: 12
   *                     owner:
   *                       kind: provider
   *                       providerId: 12
   *                       name: "Servicios Especializados Acme S.A. de C.V."
   *                       detail: "Servicios de limpieza industrial"
   *                     hasFile: false
   *       '403':
   *         description: Sin `documents-expiration-matrix:read` (gate).
   *       '500':
   *         description: "Error inesperado (`key: error-inesperado`)."
   */
  async index(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      const access = await resolveExpirationMatrixAccess(ctx)
      const data = await this.service.list(access, resolveLabels(i18n))
      return response.status(200).json({
        type: 'success',
        title: i18n.t('expiration_matrix_title', undefined, 'Matriz de vencimientos'),
        message: i18n.t(
          'expiration_matrix_listed_successfully',
          undefined,
          'Vencimientos obtenidos correctamente'
        ),
        data,
      })
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/documents-expiration-matrix/items/{key}/file:
   *   get:
   *     summary: Archivo de un vencimiento de la matriz
   *     description: |
   *       Resuelve la fuente por la llave (`<source>-<id>`), vuelve a validar
   *       el tenant, el scope de departamentos, la ventana y el permiso de
   *       descarga de esa fuente, y transmite el archivo desde el almacenamiento
   *       privado (`UploadService.streamStoredFile`), sin exponer su ubicación.
   *       La certificación también se transmite (no se redirige a una URL
   *       prefirmada) para que todos los archivos salgan por la misma vía.
   *       El nombre llega en `Content-Disposition` (`inline`) y nunca lleva
   *       datos del empleado.
   *     tags: [DocumentsExpirationMatrix]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: key
   *         required: true
   *         schema: { type: string, example: "company-file-31" }
   *     responses:
   *       '200':
   *         description: Stream binario del archivo.
   *       '403':
   *         description: |
   *           Sin `documents-expiration-matrix:read` (gate) o sin el permiso
   *           de descarga de la fuente (`key: sin-permiso-de-descarga`).
   *       '404':
   *         description: |
   *           `vencimiento-no-encontrado` (llave inexistente, de otra empresa,
   *           fuera de la ventana o de una fuente que la sesión no ve) o
   *           `archivo-no-encontrado` (el vencimiento no tiene archivo).
   *       '422':
   *         description: "Llave con formato inválido (`key: entrada-invalida`)."
   */
  async file(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      const { key } = await expirationMatrixItemKeyValidator.validate(params)
      const access = await resolveExpirationMatrixAccess(ctx)
      const { object, fileName } = await this.service.resolveFile(access, key)

      response.header('Content-Type', object.contentType || 'application/octet-stream')
      response.header('Content-Disposition', contentDisposition(fileName, 'inline'))
      response.header('Cache-Control', 'private, no-store')
      if (object.contentLength !== undefined) {
        response.header('Content-Length', String(object.contentLength))
      }
      response.status(200)
      return response.stream(object.stream)
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /** Contrato de error del repo: `type/title/message/detail/key`. */
  private respondError(ctx: HttpContext, error: unknown) {
    const { response, i18n } = ctx

    if (error instanceof ExpirationMatrixError) {
      const detail = i18n.t(`${error.i18nPrefix}_detail`, undefined, error.fallbackDetail)
      return response.status(error.httpStatus).json({
        type: 'error',
        title: i18n.t(`${error.i18nPrefix}_title`, undefined, error.fallbackTitle),
        message: detail,
        detail,
        key: error.key,
        data: null,
      })
    }

    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      const detail = i18n.t(
        'expiration_matrix_invalid_key_detail',
        undefined,
        'La llave del vencimiento no tiene un formato válido.'
      )
      return response.status(422).json({
        type: 'error',
        title: i18n.t('expiration_matrix_invalid_key_title', undefined, 'Datos inválidos'),
        message: detail,
        detail,
        key: EXPIRATION_MATRIX_ERROR_KEYS.INVALID_INPUT,
        data: null,
      })
    }

    logger.error({ err: error }, 'Matriz de vencimientos: error inesperado')
    const detail = i18n.t(
      'expiration_matrix_unexpected_error_detail',
      undefined,
      'Ocurrió un error inesperado al consultar los vencimientos.'
    )
    return response.status(500).json({
      type: 'error',
      title: i18n.t('expiration_matrix_unexpected_error_title', undefined, 'Error inesperado'),
      message: detail,
      detail,
      key: EXPIRATION_MATRIX_ERROR_KEYS.UNEXPECTED,
      data: null,
    })
  }
}
