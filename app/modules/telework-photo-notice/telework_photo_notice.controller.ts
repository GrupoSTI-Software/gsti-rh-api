import type { HttpContext } from '@adonisjs/core/http'
import { TELEWORK_PHOTO_NOTICE_PLACEHOLDERS } from '#constants/telework_photo_notice'
import { TELEWORK_PHOTO_NOTICE_ERROR_CODES } from '#constants/telework_photo_notice_error_codes'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '#helpers/compliance_repse_rbac'
import TeleworkPhotoNoticeError from './telework_photo_notice.error.js'
import type { TeleworkPhotoNoticeErrorKey } from './telework_photo_notice.error.js'
import TeleworkPhotoNoticeService from './telework_photo_notice.service.js'
import { teleworkPhotoNoticeUpdateValidator } from './validators/telework_photo_notice_update.validator.js'

/**
 * Módulo cuyos permisos gobiernan el aviso (§8): se reusa el de la Política de
 * Teletrabajo, así que esta HU no crea módulo ni entrada de menú.
 */
const MODULE_SLUG = 'telework-policy'
/** Respuesta 403 propia del helper RBAC (sin `detail`, con `errorCode`). */
const RBAC_FORBIDDEN = {
  errorCode: TELEWORK_PHOTO_NOTICE_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'telework_photo_notice',
}

/**
 * `key` de dominio → { status HTTP, código estable }. El error de dominio no se
 * acopla al HTTP ni al catálogo: el controller resuelve aquí ambos.
 */
const ERROR_STATUS_BY_KEY: Record<TeleworkPhotoNoticeErrorKey, { status: number; code: string }> = {
  'marcador-no-reconocido': {
    status: 422,
    code: TELEWORK_PHOTO_NOTICE_ERROR_CODES.UNKNOWN_PLACEHOLDER,
  },
  'contenido-vacio': { status: 422, code: TELEWORK_PHOTO_NOTICE_ERROR_CODES.EMPTY_CONTENT },
  'borrador-ya-existe': {
    status: 409,
    code: TELEWORK_PHOTO_NOTICE_ERROR_CODES.DRAFT_ALREADY_EXISTS,
  },
  'aviso-no-publicado': { status: 404, code: TELEWORK_PHOTO_NOTICE_ERROR_CODES.NOTICE_NOT_PUBLISHED },
  'borrador-no-encontrado': { status: 404, code: TELEWORK_PHOTO_NOTICE_ERROR_CODES.DRAFT_NOT_FOUND },
  'plantilla-no-encontrada': {
    status: 404,
    code: TELEWORK_PHOTO_NOTICE_ERROR_CODES.TEMPLATE_NOT_FOUND,
  },
}

/**
 * Superficie HTTP del aviso de privacidad de la evidencia fotográfica del
 * puesto de trabajo (VLRH-H1791306079310, §11).
 *
 * Endpoints:
 *   GET    /api/nom037/telework-photo-notice          — estado de la empresa (vigente + borrador) (`read`).
 *   GET    /api/nom037/telework-photo-notice/template — plantilla base global vigente (`read`).
 *   POST   /api/nom037/telework-photo-notice/draft    — abrir el borrador (`create`).
 *   PUT    /api/nom037/telework-photo-notice/draft    — editar el borrador (`update`).
 *   DELETE /api/nom037/telework-photo-notice/draft    — descartar el borrador (`delete`).
 *   POST   /api/nom037/telework-photo-notice/publish  — publicar el borrador (`update`).
 *   GET    /api/nom037/telework-photo-notice/versions — historial de versiones (`read`).
 *
 * Seguridad: `middleware.auth()` + `middleware.businessScope()` en el grupo de
 * rutas (empresa resuelta del header `X-Business-Unit-Id`, nunca de URL/body,
 * anti-IDOR) y el permiso del módulo `telework-policy` verificado aquí, en cada
 * handler, con `assertComplianceRepsePermission` (§8: sin `permissionGate`). La
 * empresa sale SIEMPRE de `ctx.businessUnitScope[0]` y el actor de
 * `ctx.auth.user!.userId`.
 *
 * El controller no conoce el dominio: delega en `TeleworkPhotoNoticeService`,
 * traduce su error a `{ status, code }` y envuelve todo en el sobre
 * `{ type, title, message|detail, key, code, data }`. La versión publicada
 * siempre viaja con su texto RESUELTO y saneado; el borrador, con sus
 * marcadores.
 *
 * No hay pantalla en esta HU (el BO llega en VLRH-H1791311160233) y no se
 * exponen aquí las rutas de app (`/current`, `/acknowledgements`): son de
 * VLRH-H1791311160825.
 */
export default class TeleworkPhotoNoticeController {
  /**
   * @swagger
   * /api/nom037/telework-photo-notice:
   *   get:
   *     summary: Consultar el estado del aviso de privacidad de las fotos del puesto
   *     description: |
   *       Devuelve la versión publicada vigente (`current`) y el borrador vivo
   *       (`draft`) de la empresa resuelta por el header `X-Business-Unit-Id`;
   *       ambos pueden ser `null`. Una empresa sin aviso responde 200 con
   *       `{ current: null, draft: null }` — nunca 404: es el primer request con
   *       el que abre la pestaña del backoffice.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPhotoNotice]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *         description: "Código público (UUID v4) de la empresa activa."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     responses:
   *       200:
   *         description: Estado del aviso (con o sin versión vigente y borrador)
   *         content:
   *           application/json:
   *             examples:
   *               sinAviso:
   *                 summary: La empresa aún no tiene aviso
   *                 value:
   *                   type: success
   *                   title: Aviso de privacidad de las fotos del puesto
   *                   message: Estado del aviso de privacidad obtenido correctamente.
   *                   data: { current: null, draft: null }
   *               conBorrador:
   *                 summary: La empresa ya tiene una versión vigente y un borrador
   *                 value:
   *                   type: success
   *                   title: Aviso de privacidad de las fotos del puesto
   *                   message: Estado del aviso de privacidad obtenido correctamente.
   *                   data:
   *                     current:
   *                       status: published
   *                       teleworkPhotoNoticeId: 1
   *                       version: 1
   *                       title: "Aviso de privacidad de las fotos del puesto"
   *                       content: "<p>La empresa Acme informa.</p>"
   *                       contentHash: "5d41402abc4b2a76b9719d911017c592"
   *                       isCurrent: true
   *                       publishedAt: "2026-10-21T09:00:00.000-06:00"
   *                       publishedByUserId: 7
   *                       publishedByName: "Juana Pérez"
   *                       acknowledgementsCount: 0
   *                     draft:
   *                       status: draft
   *                       teleworkPhotoNoticeId: 2
   *                       version: 2
   *                       title: "Aviso de privacidad de las fotos del puesto"
   *                       content: "<p>La empresa {{razon_social}} informa.</p>"
   *                       templateId: 1
   *                       updatedAt: "2026-10-21T10:00:00.000-06:00"
   *       401:
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: Sesión expirada
   *               message: Tu sesión ha expirado, inicia sesión de nuevo.
   *               detail: Token inválido o expirado.
   *               key: unauthorized
   *               data: { refreshable: false }
   *       400:
   *         description: Falta el header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso de consulta
   *               message: No tienes permiso para consultar el aviso de privacidad de las fotos del puesto.
   *               key: sin-permiso
   *               errorCode: TWN.AUTH.001
   *               data: null
   */
  async getState(
    ctx: HttpContext,
    service: TeleworkPhotoNoticeService = new TeleworkPhotoNoticeService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const data = await service.getState(ctx.businessUnitScope[0])
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_photo_notice.title'),
        message: ctx.i18n.formatMessage('telework_photo_notice.get_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-photo-notice/template:
   *   get:
   *     summary: Consultar la plantilla base del aviso de privacidad de las fotos
   *     description: |
   *       Plantilla base global vigente mantenida por GSTI (semilla, sin
   *       pantalla de administración): el machote con sus marcadores SIN
   *       resolver y la lista cerrada de marcadores permitidos. Es lo que se
   *       copia al abrir el primer borrador.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPhotoNotice]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     responses:
   *       200:
   *         description: Plantilla base vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Aviso de privacidad de las fotos del puesto
   *               message: Plantilla base del aviso de privacidad obtenida correctamente.
   *               data:
   *                 templateId: 1
   *                 version: "2026.1"
   *                 title: "Aviso de privacidad de las fotos del puesto"
   *                 content: "<p>La empresa {{razon_social}} informa.</p>"
   *                 placeholders: ["razon_social"]
   *       401:
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: Sesión expirada
   *               message: Tu sesión ha expirado, inicia sesión de nuevo.
   *               detail: Token inválido o expirado.
   *               key: unauthorized
   *               data: { refreshable: false }
   *       400:
   *         description: Falta el header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso de consulta
   *               message: No tienes permiso para consultar el aviso de privacidad de las fotos del puesto.
   *               key: sin-permiso
   *               errorCode: TWN.AUTH.001
   *               data: null
   *       404:
   *         description: Aún no hay una plantilla base vigente sembrada
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Plantilla no encontrada
   *               detail: Todavía no hay una plantilla base vigente del aviso de privacidad.
   *               key: plantilla-no-encontrada
   *               code: TWN.NF.004
   */
  async getTemplate(
    ctx: HttpContext,
    service: TeleworkPhotoNoticeService = new TeleworkPhotoNoticeService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const data = await service.getTemplate()
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_photo_notice.title'),
        message: ctx.i18n.formatMessage('telework_photo_notice.template_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-photo-notice/draft:
   *   post:
   *     summary: Abrir el borrador del aviso (partiendo de la vigente o de la plantilla)
   *     description: |
   *       Crea el borrador de la empresa: si ya hay una versión publicada copia
   *       su título y su texto CON marcadores; en la primera vez copia la
   *       plantilla base vigente. La versión es siempre la siguiente libre, así
   *       que descartar un borrador no libera su número. 409 si ya hay un
   *       borrador vivo (se edita ese, no se apila otro).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPhotoNotice]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     responses:
   *       201:
   *         description: Borrador creado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Aviso de privacidad de las fotos del puesto
   *               message: Borrador del aviso de privacidad creado correctamente.
   *               data:
   *                 status: draft
   *                 teleworkPhotoNoticeId: 1
   *                 version: 1
   *                 title: "Aviso de privacidad de las fotos del puesto"
   *                 content: "<p>La empresa {{razon_social}} informa.</p>"
   *                 templateId: 1
   *                 updatedAt: "2026-10-21T10:00:00.000-06:00"
   *       401:
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: Sesión expirada
   *               message: Tu sesión ha expirado, inicia sesión de nuevo.
   *               detail: Token inválido o expirado.
   *               key: unauthorized
   *               data: { refreshable: false }
   *       400:
   *         description: Falta el header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para gestionar el aviso de privacidad de las fotos del puesto.
   *               key: sin-permiso
   *               errorCode: TWN.AUTH.001
   *               data: null
   *       404:
   *         description: No hay plantilla base vigente de la cual partir
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Plantilla no encontrada
   *               detail: Todavía no hay una plantilla base vigente del aviso de privacidad.
   *               key: plantilla-no-encontrada
   *               code: TWN.NF.004
   *       409:
   *         description: Ya existe un borrador vivo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Borrador ya existe
   *               detail: Ya existe un borrador del aviso; edítalo en vez de crear otro.
   *               key: borrador-ya-existe
   *               code: TWN.CONF.001
   */
  async createDraft(
    ctx: HttpContext,
    service: TeleworkPhotoNoticeService = new TeleworkPhotoNoticeService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'create'))) {
      return
    }

    try {
      const data = await service.createDraft(
        ctx.businessUnitScope[0],
        ctx.auth.user!.userId
      )
      return ctx.response.status(201).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_photo_notice.title'),
        message: ctx.i18n.formatMessage('telework_photo_notice.create_draft_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-photo-notice/draft:
   *   put:
   *     summary: Editar el borrador del aviso (título y texto enriquecido)
   *     description: |
   *       Guarda el título y el texto del borrador vivo. El texto viaja CON
   *       marcadores (`{{razon_social}}` y los de la lista cerrada) y se sanea
   *       en el servidor al guardar; se resuelven al publicar. Los marcadores
   *       fuera de la lista no se rechazan aquí: la publicación es quien falla
   *       cerrado (422 `marcador-no-reconocido`).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPhotoNotice]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [title, content]
   *             properties:
   *               title: { type: string, minLength: 3, maxLength: 150 }
   *               content: { type: string, minLength: 1, maxLength: 100000, description: "HTML enriquecido con marcadores" }
   *     responses:
   *       200:
   *         description: Borrador actualizado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Aviso de privacidad de las fotos del puesto
   *               message: Borrador del aviso de privacidad actualizado correctamente.
   *               data:
   *                 status: draft
   *                 teleworkPhotoNoticeId: 1
   *                 version: 1
   *                 title: "Aviso de privacidad de las fotos del puesto"
   *                 content: "<p>La empresa {{razon_social}} informa.</p>"
   *                 templateId: 1
   *                 updatedAt: "2026-10-21T10:05:00.000-06:00"
   *       401:
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: Sesión expirada
   *               message: Tu sesión ha expirado, inicia sesión de nuevo.
   *               detail: Token inválido o expirado.
   *               key: unauthorized
   *               data: { refreshable: false }
   *       400:
   *         description: Falta el header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para gestionar el aviso de privacidad de las fotos del puesto.
   *               key: sin-permiso
   *               errorCode: TWN.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa no tiene un borrador vivo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Borrador no encontrado
   *               detail: La empresa no tiene un borrador del aviso de privacidad.
   *               key: borrador-no-encontrado
   *               code: TWN.NF.002
   *       422:
   *         description: Body malformado (título o texto fuera de rango)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Entrada inválida
   *               detail: The title field must have at least 3 characters
   *               key: entrada-invalida
   *               code: TWN.VAL.001
   *               data:
   *                 errors:
   *                   - field: title
   *                     rule: minLength
   *                     message: The title field must have at least 3 characters
   */
  async updateDraft(
    ctx: HttpContext,
    service: TeleworkPhotoNoticeService = new TeleworkPhotoNoticeService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'update'))) {
      return
    }

    let input
    try {
      input = await teleworkPhotoNoticeUpdateValidator.validate(ctx.request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const data = await service.updateDraft(
        ctx.businessUnitScope[0],
        input,
        ctx.auth.user!.userId
      )
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_photo_notice.title'),
        message: ctx.i18n.formatMessage('telework_photo_notice.update_draft_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-photo-notice/draft:
   *   delete:
   *     summary: Descartar el borrador del aviso
   *     description: |
   *       Descarta (soft delete) el borrador vivo de la empresa. Nada se borra
   *       (C0129 R3): la fila queda marcada y su número de versión no se
   *       reutiliza; la versión publicada vigente sigue intacta. 404 si la
   *       empresa no tiene borrador.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPhotoNotice]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     responses:
   *       200:
   *         description: Borrador descartado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Aviso de privacidad de las fotos del puesto
   *               message: Borrador del aviso de privacidad descartado correctamente.
   *               data: null
   *       401:
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: Sesión expirada
   *               message: Tu sesión ha expirado, inicia sesión de nuevo.
   *               detail: Token inválido o expirado.
   *               key: unauthorized
   *               data: { refreshable: false }
   *       400:
   *         description: Falta el header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para gestionar el aviso de privacidad de las fotos del puesto.
   *               key: sin-permiso
   *               errorCode: TWN.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa no tiene un borrador vivo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Borrador no encontrado
   *               detail: La empresa no tiene un borrador del aviso de privacidad.
   *               key: borrador-no-encontrado
   *               code: TWN.NF.002
   */
  async discardDraft(
    ctx: HttpContext,
    service: TeleworkPhotoNoticeService = new TeleworkPhotoNoticeService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'delete'))) {
      return
    }

    try {
      await service.discardDraft(ctx.businessUnitScope[0])
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_photo_notice.title'),
        message: ctx.i18n.formatMessage('telework_photo_notice.discard_draft_success'),
        data: null,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-photo-notice/publish:
   *   post:
   *     summary: Publicar el borrador como versión vigente e inmutable
   *     description: |
   *       Resuelve los marcadores del borrador con los datos de la empresa
   *       (escapados: nunca inyectan HTML), sanea el texto resultante, calcula
   *       su huella sha256 y sella el borrador como versión publicada y
   *       vigente, apagando la anterior. Falla cerrado sin escribir nada:
   *       422 `marcador-no-reconocido` si el texto usa marcadores fuera de la
   *       lista cerrada (los sobrantes viajan en `data.placeholders`) y 422
   *       `contenido-vacio` si tras sanear no queda texto.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPhotoNotice]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     responses:
   *       200:
   *         description: Versión publicada y marcada como vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Aviso de privacidad de las fotos del puesto
   *               message: Aviso de privacidad publicado correctamente.
   *               data:
   *                 status: published
   *                 teleworkPhotoNoticeId: 1
   *                 version: 1
   *                 title: "Aviso de privacidad de las fotos del puesto"
   *                 content: "<p>La empresa Acme informa.</p>"
   *                 contentHash: "5d41402abc4b2a76b9719d911017c592"
   *                 isCurrent: true
   *                 publishedAt: "2026-10-21T11:00:00.000-06:00"
   *                 publishedByUserId: 7
   *                 publishedByName: "Juana Pérez"
   *                 acknowledgementsCount: 0
   *       401:
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: Sesión expirada
   *               message: Tu sesión ha expirado, inicia sesión de nuevo.
   *               detail: Token inválido o expirado.
   *               key: unauthorized
   *               data: { refreshable: false }
   *       400:
   *         description: Falta el header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para gestionar el aviso de privacidad de las fotos del puesto.
   *               key: sin-permiso
   *               errorCode: TWN.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa no tiene un borrador vivo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Borrador no encontrado
   *               detail: La empresa no tiene un borrador del aviso de privacidad.
   *               key: borrador-no-encontrado
   *               code: TWN.NF.002
   *       422:
   *         description: El texto usa un marcador fuera de la lista o quedó vacío tras sanearlo
   *         content:
   *           application/json:
   *             examples:
   *               marcadorDesconocido:
   *                 summary: Marcador fuera de la lista cerrada
   *                 value:
   *                   type: error
   *                   title: Marcador no reconocido
   *                   detail: "El texto usa marcadores que no existen: {{domicilio}}. Permitidos: {{razon_social}}."
   *                   key: marcador-no-reconocido
   *                   code: TWN.VAL.002
   *                   data: { placeholders: [domicilio] }
   *               contenidoVacio:
   *                 summary: El texto quedó vacío después de sanearlo
   *                 value:
   *                   type: error
   *                   title: Contenido vacío
   *                   detail: El aviso quedó sin texto después de limpiarlo; escríbelo antes de publicar.
   *                   key: contenido-vacio
   *                   code: TWN.VAL.003
   */
  async publish(
    ctx: HttpContext,
    service: TeleworkPhotoNoticeService = new TeleworkPhotoNoticeService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'update'))) {
      return
    }

    try {
      const data = await service.publish(ctx.businessUnitScope[0], ctx.auth.user!.userId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_photo_notice.title'),
        message: ctx.i18n.formatMessage('telework_photo_notice.publish_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-photo-notice/versions:
   *   get:
   *     summary: Consultar el historial de versiones publicadas del aviso
   *     description: |
   *       Versiones publicadas de la empresa, de la más reciente a la más
   *       antigua, con el conteo de acuses de cada una. Una empresa sin
   *       versiones responde 200 con `[]` — nunca 404: la empresa ajena ve lo
   *       mismo que la inexistente. El borrador no aparece aquí (aún no es
   *       versión) ni las filas descartadas.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPhotoNotice]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     responses:
   *       200:
   *         description: Historial de versiones publicadas (puede venir vacío)
   *         content:
   *           application/json:
   *             examples:
   *               sinVersiones:
   *                 summary: La empresa todavía no publica ninguna versión
   *                 value:
   *                   type: success
   *                   title: Aviso de privacidad de las fotos del puesto
   *                   message: Versiones del aviso de privacidad obtenidas correctamente.
   *                   data: []
   *               conVersiones:
   *                 summary: Historial con dos versiones y sus acuses
   *                 value:
   *                   type: success
   *                   title: Aviso de privacidad de las fotos del puesto
   *                   message: Versiones del aviso de privacidad obtenidas correctamente.
   *                   data:
   *                     - status: published
   *                       teleworkPhotoNoticeId: 2
   *                       version: 2
   *                       title: "Aviso de privacidad de las fotos del puesto"
   *                       content: "<p>La empresa Acme informa.</p>"
   *                       contentHash: "9a0364b9e99bb480dd25e1f0284c8555"
   *                       isCurrent: true
   *                       publishedAt: "2026-10-21T11:00:00.000-06:00"
   *                       publishedByUserId: 7
   *                       publishedByName: "Juana Pérez"
   *                       acknowledgementsCount: 0
   *                     - status: published
   *                       teleworkPhotoNoticeId: 1
   *                       version: 1
   *                       title: "Aviso de privacidad de las fotos del puesto"
   *                       content: "<p>La empresa Acme informa.</p>"
   *                       contentHash: "5d41402abc4b2a76b9719d911017c592"
   *                       isCurrent: false
   *                       publishedAt: "2026-10-20T11:00:00.000-06:00"
   *                       publishedByUserId: 7
   *                       publishedByName: "Juana Pérez"
   *                       acknowledgementsCount: 1
   *       401:
   *         description: Usuario no autenticado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: Sesión expirada
   *               message: Tu sesión ha expirado, inicia sesión de nuevo.
   *               detail: Token inválido o expirado.
   *               key: unauthorized
   *               data: { refreshable: false }
   *       400:
   *         description: Falta el header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso de consulta
   *               message: No tienes permiso para consultar el aviso de privacidad de las fotos del puesto.
   *               key: sin-permiso
   *               errorCode: TWN.AUTH.001
   *               data: null
   */
  async listVersions(
    ctx: HttpContext,
    service: TeleworkPhotoNoticeService = new TeleworkPhotoNoticeService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const data = await service.listVersions(ctx.businessUnitScope[0])
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_photo_notice.title'),
        message: ctx.i18n.formatMessage('telework_photo_notice.versions_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /** Responde 403 y devuelve `false` si el usuario no tiene la acción pedida. */
  private async assertHasPermission(
    ctx: HttpContext,
    action: ComplianceRepseAction
  ): Promise<boolean> {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  /**
   * 422 de Vine: título o texto del borrador fuera de rango o de tipo. Lleva el
   * primer mensaje del validador como `detail` y la lista cruda en `data.errors`
   * para que el cliente señale el campo.
   */
  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ field: string; message: string; rule: string }> }).messages
        : undefined

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('telework_photo_notice.errors.entrada-invalida.title'),
      detail:
        vineMessages?.[0]?.message ??
        (error instanceof Error
          ? error.message
          : i18n.formatMessage('telework_photo_notice.errors.entrada-invalida.detail')),
      key: 'entrada-invalida',
      code: TELEWORK_PHOTO_NOTICE_ERROR_CODES.INVALID_INPUT,
      data: { errors: vineMessages ?? [] },
    })
  }

  /**
   * Errores de dominio: `title`/`detail` por clave, el `code` del mapa y `data`
   * solo cuando el dominio trae `details`.
   */
  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof TeleworkPhotoNoticeError) {
      const { i18n } = ctx
      const { status, code } = ERROR_STATUS_BY_KEY[error.key]
      return ctx.response.status(status).json({
        type: 'error',
        title: i18n.formatMessage(`telework_photo_notice.errors.${error.key}.title`),
        detail: this.domainDetail(ctx, error),
        key: error.key,
        code,
        ...(error.details ? { data: error.details } : {}),
      })
    }

    throw error
  }

  /**
   * Detalle del error de dominio. Solo `marcador-no-reconocido` interpola: los
   * nombres sobrantes (los que el dominio entrega recortados, únicos y en orden
   * de aparición —puede venir vacía—) y la lista cerrada de marcadores
   * permitidos, ambos como `{{clave}}` para que el usuario vea la forma exacta.
   */
  private domainDetail(ctx: HttpContext, error: TeleworkPhotoNoticeError): string {
    const detailKey = `telework_photo_notice.errors.${error.key}.detail`
    if (error.key !== 'marcador-no-reconocido') {
      return ctx.i18n.formatMessage(detailKey)
    }

    return ctx.i18n.formatMessage(detailKey, {
      markers: this.formatPlaceholders(this.detailPlaceholders(error.details)),
      allowed: this.formatPlaceholders(TELEWORK_PHOTO_NOTICE_PLACEHOLDERS),
    })
  }

  /** `details.placeholders` del error, saneado a `string[]` (vacío si no viene). */
  private detailPlaceholders(details?: Record<string, unknown>): string[] {
    const raw = details?.placeholders
    if (!Array.isArray(raw)) {
      return []
    }

    return raw.filter((placeholder): placeholder is string => typeof placeholder === 'string')
  }

  /** Marcadores como `{{clave}}`, unidos por `, `. */
  private formatPlaceholders(placeholders: readonly string[]): string {
    return placeholders.map((placeholder) => `{{${placeholder}}}`).join(', ')
  }
}
