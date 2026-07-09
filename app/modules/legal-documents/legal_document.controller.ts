import { HttpContext } from '@adonisjs/core/http'
import LegalDocumentError from '#exceptions/legal_document_error'
import type { LegalDocumentErrorKey } from '#exceptions/legal_document_error'
import { LEGAL_DOCUMENT_ERROR_CODES } from '#constants/legal_document_error_codes'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '#helpers/compliance_repse_rbac'
import LegalDocumentService from './legal_document.service.js'
import { legalDocumentQueryValidator } from './validators/legal_document_query.validator.js'
import { legalDocumentHistoryQueryValidator } from './validators/legal_document_history_query.validator.js'
import {
  createLegalDocumentDraftValidator,
  updateLegalDocumentDraftValidator,
} from './validators/legal_document_draft.validator.js'

const MODULE_SLUG = 'legal-documents'
const RBAC_FORBIDDEN = {
  errorCode: LEGAL_DOCUMENT_ERROR_CODES.FORBIDDEN_PLATFORM,
  i18nPrefix: 'legal_document',
}

/** `key` de dominio → { status HTTP, código estable }. Evita acoplar el controller al dominio. */
const ERROR_STATUS_BY_KEY: Record<LegalDocumentErrorKey, { status: number; code: string }> = {
  'documento-legal-sin-version-vigente': { status: 404, code: LEGAL_DOCUMENT_ERROR_CODES.NOT_CURRENT },
  'documento-legal-inexistente': { status: 404, code: LEGAL_DOCUMENT_ERROR_CODES.NOT_FOUND },
  'version-publicada-inmutable': { status: 409, code: LEGAL_DOCUMENT_ERROR_CODES.PUBLISHED_IMMUTABLE },
  'version-duplicada': { status: 409, code: LEGAL_DOCUMENT_ERROR_CODES.VERSION_COLLISION },
  'contenido-idioma-incompleto': { status: 422, code: LEGAL_DOCUMENT_ERROR_CODES.INCOMPLETE_LOCALE },
}

/**
 * Controller de documentos legales versionados: consulta pública del vigente
 * (cimiento) + gestión/publicación reservada al rol `root` (esta hermana).
 *
 * Endpoints:
 *   GET  /api/legal-documents/current?type=...     — documento vigente de un tipo (cimiento).
 *   GET  /api/legal-documents?type=...&status=...  — histórico de versiones de un tipo (root).
 *   GET  /api/legal-documents/:id                  — detalle administrativo de una versión (root).
 *   POST /api/legal-documents                      — crear versión en borrador (root).
 *   PUT  /api/legal-documents/:id                  — editar borrador (root; 409 si ya está publicada).
 *   POST /api/legal-documents/:id/publish          — publicar un borrador por id (root).
 *
 * Seguridad:
 *  - Requiere middleware.auth(). Sin businessScope: documento global de GSTI.
 *  - Gestión reservada al rol `root` en TODOS los verbos, incluido el histórico:
 *    `assertComplianceRepsePermission` (403 `LGDOC.FORB.001` para cualquier no-root).
 *  - `getCurrent` es la única lectura pública (la usan las pantallas de aceptación).
 */
export default class LegalDocumentController {
  /**
   * @swagger
   * /api/legal-documents/current:
   *   get:
   *     summary: Consultar el documento legal vigente de un tipo
   *     description: |
   *       Devuelve la versión actualmente vigente (`is_current = true`) de un tipo de
   *       documento legal de plataforma (aviso de privacidad, términos y condiciones o
   *       consentimiento biométrico). Responde 404 contractual cuando el tipo aún no
   *       tiene ninguna versión publicada (caso de `biometric_consent` recién declarado).
   *     security:
   *       - bearerAuth: []
   *     tags: [LegalDocuments]
   *     parameters:
   *       - in: query
   *         name: type
   *         required: true
   *         schema:
   *           type: string
   *           enum: [privacy_notice, terms_conditions, biometric_consent]
   *     responses:
   *       200:
   *         description: Documento legal vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Documento legal vigente obtenido correctamente.
   *               data:
   *                 type: privacy_notice
   *                 version: "1.0"
   *                 content: "<h1>Aviso de privacidad</h1><p>...</p>"
   *                 publishedAt: "2026-07-02T00:00:00.000-06:00"
   *       404:
   *         description: El tipo no tiene versión vigente publicada
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: Aún no hay una versión vigente publicada para este tipo de documento.
   *               key: documento-legal-sin-version-vigente
   *               code: LGDOC.NF.001
   *       422:
   *         description: El parámetro `type` es inválido o falta
   *         content:
   *           application/json:
   *             examples:
   *               missingType:
   *                 summary: No se envió el parámetro type
   *                 value:
   *                   type: error
   *                   title: Documento legal
   *                   detail: "Debes indicar el parámetro 'type' con uno de estos valores: privacy_notice, terms_conditions, biometric_consent."
   *                   key: tipo-de-documento-invalido
   *                   code: LGDOC.VAL.001
   *               invalidType:
   *                 summary: type fuera del enum permitido
   *                 value:
   *                   type: error
   *                   title: Documento legal
   *                   detail: El tipo de documento legal indicado no es válido.
   *                   key: tipo-de-documento-invalido
   *                   code: LGDOC.VAL.001
   */
  async getCurrent(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    const { request, i18n } = ctx

    let payload
    try {
      payload = await legalDocumentQueryValidator.validate({ type: request.input('type') })
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const data = await service.getCurrent(payload.type, i18n.locale)
      return ctx.response.status(200).json({
        type: 'success',
        title: i18n.formatMessage('legalDocuments.title'),
        message: i18n.formatMessage('legalDocuments.current_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/legal-documents:
   *   get:
   *     summary: "[Gestión GSTI] Histórico de versiones de un tipo de documento legal"
   *     description: |
   *       Devuelve todas las versiones (borrador y publicadas) de un tipo de documento
   *       legal, con cuál está vigente. Reservado al rol `root`; cualquier otro rol
   *       recibe 403, incluida esta consulta de solo lectura.
   *     security:
   *       - bearerAuth: []
   *     tags: [LegalDocuments]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: query
   *         name: type
   *         required: true
   *         schema: { type: string, enum: [privacy_notice, terms_conditions, biometric_consent] }
   *       - in: query
   *         name: status
   *         required: false
   *         schema: { type: string, enum: [draft, published] }
   *     responses:
   *       200:
   *         description: Histórico de versiones del tipo
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Histórico de documento legal obtenido correctamente.
   *               data:
   *                 - id: 5
   *                   type: terms_conditions
   *                   version: "2.0"
   *                   content: { es: "<h1>Términos v2</h1>", en: "<h1>Terms v2</h1>" }
   *                   status: published
   *                   isCurrent: true
   *                   publishedAt: "2026-07-05T10:00:00.000-06:00"
   *                   publishedBy: { userId: 12, name: "Ana Root", email: "ana.root@gsti.mx" }
   *                 - id: 1
   *                   type: terms_conditions
   *                   version: "1.0"
   *                   content: { es: "<h1>Términos v1</h1>", en: "<h1>Terms v1</h1>" }
   *                   status: published
   *                   isCurrent: false
   *                   publishedAt: "2026-07-02T00:00:00.000-06:00"
   *                   publishedBy: null
   *       403:
   *         description: El usuario autenticado no tiene rol `root`
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: LGDOC.FORB.001
   *               data: null
   *       422:
   *         description: El parámetro `type` es inválido o falta
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: "Debes indicar el parámetro 'type' con uno de estos valores: privacy_notice, terms_conditions, biometric_consent."
   *               key: tipo-de-documento-invalido
   *               code: LGDOC.VAL.001
   */
  async listByType(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    const { request, i18n } = ctx
    let payload
    try {
      payload = await legalDocumentHistoryQueryValidator.validate({
        type: request.input('type'),
        status: request.input('status'),
      })
    } catch (error) {
      return this.validationError(ctx, error)
    }

    const data = await service.listByType(payload.type, payload.status)
    return ctx.response.status(200).json({
      type: 'success',
      title: i18n.formatMessage('legalDocuments.title'),
      message: i18n.formatMessage('legalDocuments.history_success'),
      data,
    })
  }

  /**
   * @swagger
   * /api/legal-documents/{id}:
   *   get:
   *     summary: "[Gestión GSTI] Detalle administrativo de una versión"
   *     description: |
   *       Devuelve una versión puntual con su contenido completo en ambos idiomas y
   *       metadatos de auditoría. Reservado al rol `root`.
   *     security:
   *       - bearerAuth: []
   *     tags: [LegalDocuments]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, example: 5 }
   *     responses:
   *       200:
   *         description: Detalle de la versión
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Documento legal obtenido correctamente.
   *               data:
   *                 id: 5
   *                 type: terms_conditions
   *                 version: "2.0"
   *                 content: { es: "<h1>Términos v2</h1>", en: "<h1>Terms v2</h1>" }
   *                 status: published
   *                 isCurrent: true
   *                 publishedAt: "2026-07-05T10:00:00.000-06:00"
   *                 publishedBy: { userId: 12, name: "Ana Root", email: "ana.root@gsti.mx" }
   *       403:
   *         description: El usuario autenticado no tiene rol `root`
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: LGDOC.FORB.001
   *               data: null
   *       404:
   *         description: No existe ninguna versión con ese id
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: No existe una versión de documento legal con ese identificador.
   *               key: documento-legal-inexistente
   *               code: LGDOC.NF.002
   */
  async getById(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const id = this.parseResourceId(ctx.request.param('id'))
      const data = await service.getById(id)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('legalDocuments.title'),
        message: ctx.i18n.formatMessage('legalDocuments.detail_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/legal-documents:
   *   post:
   *     summary: "[Gestión GSTI] Crear una versión en borrador"
   *     description: |
   *       Crea una versión nueva en `status='draft'` (nunca vigente). El contenido puede
   *       llegar con un solo idioma completo (regla de negocio 8): la obligatoriedad de
   *       ambos idiomas se valida al publicar, no al crear el borrador. El contenido se
   *       sanea por idioma en el servidor antes de persistir. Reservado al rol `root`.
   *     security:
   *       - bearerAuth: []
   *     tags: [LegalDocuments]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [type, version, content]
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [privacy_notice, terms_conditions, biometric_consent]
   *               version: { type: string, maxLength: 20, example: "2.0" }
   *               content:
   *                 type: object
   *                 properties:
   *                   es: { type: string, example: "<h1>Términos v2</h1>" }
   *                   en: { type: string, example: "<h1>Terms v2</h1>" }
   *     responses:
   *       201:
   *         description: Borrador creado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Borrador de documento legal creado correctamente.
   *               data:
   *                 id: 6
   *                 type: biometric_consent
   *                 version: "1.0"
   *                 content: { es: "<p>Texto biométrico</p>", en: "" }
   *                 status: draft
   *                 isCurrent: false
   *                 publishedAt: null
   *                 publishedBy: null
   *       403:
   *         description: El usuario autenticado no tiene rol `root`
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: LGDOC.FORB.001
   *               data: null
   *       409:
   *         description: La combinación tipo + versión ya existe
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: Ya existe una versión con ese identificador para este tipo de documento.
   *               key: version-duplicada
   *               code: LGDOC.CONF.002
   *       422:
   *         description: Body malformado (tipo/versión/contenido inválidos)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               message: Entrada inválida
   *               detail: The version field must be defined
   *               key: entrada-invalida
   *               data: null
   */
  async createDraft(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    if (!(await this.assertHasPermission(ctx, 'create'))) {
      return
    }

    let payload
    try {
      payload = await createLegalDocumentDraftValidator.validate(ctx.request.all())
    } catch (error) {
      return this.draftValidationError(ctx, error)
    }

    try {
      const data = await service.createDraft(payload)
      return ctx.response.status(201).json({
        type: 'success',
        title: ctx.i18n.formatMessage('legalDocuments.title'),
        message: ctx.i18n.formatMessage('legalDocuments.create_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/legal-documents/{id}:
   *   put:
   *     summary: "[Gestión GSTI] Editar un borrador"
   *     description: |
   *       Actualiza el contenido y/o la versión de una versión en `status='draft'`.
   *       Sobre una versión ya publicada responde 409 (regla de negocio 3: el contenido
   *       publicado es inmutable — corregir significa publicar una versión nueva).
   *       Reservado al rol `root`.
   *     security:
   *       - bearerAuth: []
   *     tags: [LegalDocuments]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, example: 6 }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [content]
   *             properties:
   *               version: { type: string, maxLength: 20, example: "1.0" }
   *               content:
   *                 type: object
   *                 properties:
   *                   es: { type: string }
   *                   en: { type: string }
   *     responses:
   *       200:
   *         description: Borrador actualizado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Borrador de documento legal actualizado correctamente.
   *               data:
   *                 id: 6
   *                 type: biometric_consent
   *                 version: "1.0"
   *                 content: { es: "<p>Texto biométrico</p>", en: "<p>Biometric text</p>" }
   *                 status: draft
   *                 isCurrent: false
   *                 publishedAt: null
   *                 publishedBy: null
   *       403:
   *         description: El usuario autenticado no tiene rol `root`
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: LGDOC.FORB.001
   *               data: null
   *       404:
   *         description: No existe ninguna versión con ese id
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: No existe una versión de documento legal con ese identificador.
   *               key: documento-legal-inexistente
   *               code: LGDOC.NF.002
   *       409:
   *         description: La versión ya está publicada (inmutable) o la nueva versión choca con otra existente
   *         content:
   *           application/json:
   *             examples:
   *               publicadaInmutable:
   *                 summary: La versión ya está publicada
   *                 value:
   *                   type: error
   *                   title: Documento legal
   *                   detail: El contenido de una versión publicada no se puede editar.
   *                   key: version-publicada-inmutable
   *                   code: LGDOC.CONF.001
   *               versionDuplicada:
   *                 summary: El nuevo identificador de versión ya existe
   *                 value:
   *                   type: error
   *                   title: Documento legal
   *                   detail: Ya existe una versión con ese identificador para este tipo de documento.
   *                   key: version-duplicada
   *                   code: LGDOC.CONF.002
   */
  async updateDraft(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    if (!(await this.assertHasPermission(ctx, 'update'))) {
      return
    }

    let payload
    try {
      payload = await updateLegalDocumentDraftValidator.validate(ctx.request.all())
    } catch (error) {
      return this.draftValidationError(ctx, error)
    }

    try {
      const id = this.parseResourceId(ctx.request.param('id'))
      const data = await service.updateDraft(id, payload)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('legalDocuments.title'),
        message: ctx.i18n.formatMessage('legalDocuments.update_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/legal-documents/{id}/publish:
   *   post:
   *     summary: "[Gestión GSTI] Publicar un borrador (transaccional)"
   *     description: |
   *       Publica un borrador existente: lo marca `published` + vigente y apaga la
   *       versión vigente anterior del mismo tipo en una sola transacción (regla de
   *       negocio 4). Si el tipo no tenía ninguna vigente (el biométrico al inicio),
   *       esta operación crea su primera versión vigente (regla de negocio 2). Requiere
   *       contenido en español e inglés (regla de negocio 8); si falta alguno, 422 y el
   *       borrador permanece sin publicar. Habilita la re-aceptación de los usuarios
   *       (la aplican las historias hermanas). Reservado al rol `root`.
   *     security:
   *       - bearerAuth: []
   *     tags: [LegalDocuments]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, example: 6 }
   *     responses:
   *       200:
   *         description: Versión publicada y vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Documento legal
   *               message: Documento legal publicado correctamente.
   *               data:
   *                 id: 6
   *                 type: biometric_consent
   *                 version: "1.0"
   *                 content: { es: "<p>Texto biométrico</p>", en: "<p>Biometric text</p>" }
   *                 status: published
   *                 isCurrent: true
   *                 publishedAt: "2026-07-06T12:00:00.000-06:00"
   *                 publishedBy: { userId: 12, name: "Ana Root", email: "ana.root@gsti.mx" }
   *       403:
   *         description: El usuario autenticado no tiene rol `root`
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: LGDOC.FORB.001
   *               data: null
   *       404:
   *         description: No existe ninguna versión con ese id
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: No existe una versión de documento legal con ese identificador.
   *               key: documento-legal-inexistente
   *               code: LGDOC.NF.002
   *       409:
   *         description: El id no corresponde a un borrador (ya está publicado)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: El contenido de una versión publicada no se puede editar.
   *               key: version-publicada-inmutable
   *               code: LGDOC.CONF.001
   *       422:
   *         description: Falta contenido en español o en inglés
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Documento legal
   *               detail: No puedes publicar una versión sin contenido en español e inglés.
   *               key: contenido-idioma-incompleto
   *               code: LGDOC.VAL.002
   */
  async publish(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService()) {
    if (!(await this.assertHasPermission(ctx, 'update'))) {
      return
    }

    try {
      const id = this.parseResourceId(ctx.request.param('id'))
      const userId = ctx.auth.user?.userId ?? null
      const data = await service.publishDraft(id, userId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('legalDocuments.title'),
        message: ctx.i18n.formatMessage('legalDocuments.publish_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  private parseResourceId(raw: unknown): number {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new LegalDocumentError('documento-legal-inexistente')
    }
    return id
  }

  /**
   * Errores de Vine para crear/editar borrador: cualquier campo mal formado
   * (tipo fuera de enum, versión vacía/demasiado larga, contenido > 1 MB por
   * idioma) cae en el bucket genérico `entrada-invalida`, igual que el resto
   * del proyecto expone `E_VALIDATION_ERROR` (`.cursorrules`).
   */
  private draftValidationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ field: string; message: string; rule: string }> }).messages
        : undefined

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('legalDocuments.title'),
      message: i18n.formatMessage('legalDocuments.errors.entrada-invalida.title'),
      detail:
        vineMessages?.[0]?.message ??
        (error instanceof Error ? error.message : i18n.formatMessage('legalDocuments.errors.entrada-invalida.detail')),
      key: 'entrada-invalida',
      data: vineMessages ? { errors: vineMessages } : null,
    })
  }

  /**
   * `key`/`code` son siempre los mismos (contrato del spec: un solo error de
   * validación para `type`), pero el `detail` distingue si el parámetro falta
   * por completo de si llegó con un valor fuera del enum — evita el mensaje
   * genérico "no es válido" cuando en realidad nunca se envió `type`.
   */
  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const messageKey = this.isMissingTypeError(error)
      ? 'legalDocuments.errors.tipo-de-documento-invalido.detail_missing'
      : 'legalDocuments.errors.tipo-de-documento-invalido.detail'

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('legalDocuments.title'),
      detail: i18n.formatMessage(messageKey),
      key: 'tipo-de-documento-invalido',
      code: LEGAL_DOCUMENT_ERROR_CODES.INVALID_TYPE,
    })
  }

  private isMissingTypeError(error: unknown): boolean {
    const validationError = error as { messages?: Array<{ field?: string; rule?: string }> }
    return (
      validationError?.messages?.some((m) => m.field === 'type' && m.rule === 'required') ?? false
    )
  }

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof LegalDocumentError) {
      const { i18n } = ctx
      const { status, code } = ERROR_STATUS_BY_KEY[error.key]
      return ctx.response.status(status).json({
        type: 'error',
        title: i18n.formatMessage('legalDocuments.title'),
        detail: i18n.formatMessage(`legalDocuments.errors.${error.key}.detail`),
        key: error.key,
        code,
      })
    }
    throw error
  }
}
