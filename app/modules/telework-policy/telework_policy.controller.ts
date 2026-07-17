import { HttpContext } from '@adonisjs/core/http'
import TeleworkPolicyError from '#exceptions/telework_policy_error'
import type { TeleworkPolicyErrorKey } from '#exceptions/telework_policy_error'
import { TELEWORK_POLICY_ERROR_CODES } from '#constants/telework_policy_error_codes'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '#helpers/compliance_repse_rbac'
import TeleworkPolicyService from './telework_policy.service.js'
import { teleworkPolicyInitializeValidator } from './validators/telework_policy_initialize.validator.js'
import { teleworkPolicyUpdateValidator } from './validators/telework_policy_update.validator.js'
import { teleworkPolicyRemindValidator } from './validators/telework_policy_remind.validator.js'

const MODULE_SLUG = 'telework-policy'
const RBAC_FORBIDDEN = {
  errorCode: TELEWORK_POLICY_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'telework_policy',
}

/** `key` de dominio → { status HTTP, código estable }. Evita acoplar el controller al dominio. */
const ERROR_STATUS_BY_KEY: Record<TeleworkPolicyErrorKey, { status: number; code: string }> = {
  'politica-ya-existe': { status: 409, code: TELEWORK_POLICY_ERROR_CODES.ALREADY_EXISTS },
  'politica-inexistente': { status: 404, code: TELEWORK_POLICY_ERROR_CODES.NOT_FOUND },
  'estructura-componentes-invalida': {
    status: 422,
    code: TELEWORK_POLICY_ERROR_CODES.INVALID_STRUCTURE,
  },
  'politica-publicada-inmutable': {
    status: 409,
    code: TELEWORK_POLICY_ERROR_CODES.PUBLISHED_IMMUTABLE,
  },
  'politica-incompleta-para-publicar': {
    status: 422,
    code: TELEWORK_POLICY_ERROR_CODES.INCOMPLETE_FOR_PUBLISH,
  },
  'sin-version-vigente': {
    status: 404,
    code: TELEWORK_POLICY_ERROR_CODES.NO_CURRENT_VERSION,
  },
  'borrador-ya-existe': {
    status: 409,
    code: TELEWORK_POLICY_ERROR_CODES.DRAFT_ALREADY_EXISTS,
  },
}

/**
 * Editor del borrador de la Política de Teletrabajo (NOM-037, numeral 5.2).
 *
 * Endpoints:
 *   GET    /api/nom037/telework-policy               — estado/borrador de la empresa en scope.
 *   GET    /api/nom037/telework-policy/template       — plantilla base global vigente.
 *   POST   /api/nom037/telework-policy/initialize     — primera vez: plantilla o cero.
 *   PUT    /api/nom037/telework-policy                — editar borrador (título + 12 componentes).
 *   DELETE /api/nom037/telework-policy/draft           — descartar borrador.
 *   POST   /api/nom037/telework-policy/publish         — publicar el borrador (sella vigente + difunde por correo).
 *   POST   /api/nom037/telework-policy/draft           — nuevo borrador partiendo de la última vigente.
 *   GET    /api/nom037/telework-policy/versions        — historial de versiones.
 *   GET    /api/nom037/telework-policy/acknowledgements — seguimiento de acuses del conjunto 5.1.
 *   POST   /api/nom037/telework-policy/remind-pending  — recordatorio masivo/selectivo a pendientes.
 *
 * Seguridad: `middleware.auth()` + `middleware.businessScope()` en todas las
 * rutas (empresa resuelta del header `X-Business-Unit-Id`, nunca de URL/body,
 * anti-IDOR). Permiso del módulo compliance/teletrabajo vía
 * `assertComplianceRepsePermission` (bypass root/super-administrador).
 *
 * USRH1783547655377 (publicar/difundir + seguimiento de acuses) extiende
 * este controller sin tocar el editor (`getPolicy`..`discardDraft`) ni el
 * listado 5.1 (`telework_worker_controller`).
 */
export default class TeleworkPolicyController {
  /**
   * @swagger
   * /api/nom037/telework-policy:
   *   get:
   *     summary: Consultar el estado/borrador de la Política de Teletrabajo de la empresa
   *     description: |
   *       Devuelve la política (borrador) de la empresa resuelta por el header
   *       `X-Business-Unit-Id`. Si la empresa aún no tiene ninguna, responde
   *       `exists: false` sin crear nada — dispara el selector cero/plantilla
   *       en el backoffice (elección única, regla de negocio 3).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
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
   *         description: Estado de la política (con o sin borrador existente)
   *         content:
   *           application/json:
   *             examples:
   *               sinBorrador:
   *                 summary: La empresa aún no tiene política
   *                 value:
   *                   type: success
   *                   title: Política de Teletrabajo
   *                   message: Estado de la política obtenido correctamente.
   *                   data: { exists: false, policy: null }
   *               conBorrador:
   *                 summary: La empresa ya tiene un borrador
   *                 value:
   *                   type: success
   *                   title: Política de Teletrabajo
   *                   message: Estado de la política obtenido correctamente.
   *                   data:
   *                     exists: true
   *                     policy:
   *                       id: 1
   *                       businessUnitId: 5
   *                       version: 1
   *                       title: "Política de Teletrabajo"
   *                       status: draft
   *                       isCurrent: false
   *                       missingComponentKeys: ["5_2_b", "5_2_h"]
   *                       components:
   *                         - key: "5_2_a"
   *                           clause: "5.2.a"
   *                           title: "Cultura de prevención de riesgos"
   *                           body: "<p>La empresa promueve...</p>"
   *                           required: true
   *                           order: 1
   *                       createdAt: "2026-07-10T09:00:00.000-06:00"
   *                       updatedAt: "2026-07-10T09:00:00.000-06:00"
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
   *               message: No tienes permiso para consultar este módulo.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   */
  async getPolicy(ctx: HttpContext, service: TeleworkPolicyService = new TeleworkPolicyService()) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const data = await service.getPolicy(businessUnitId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.get_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/template:
   *   get:
   *     summary: Consultar la plantilla base global (los 12 componentes del 5.2)
   *     description: |
   *       Plantilla base mantenida por GSTI (semilla, sin pantalla de
   *       administración): los 12 componentes obligatorios con su título y
   *       texto modelo. Se usa para previsualizar antes de elegir "partir de
   *       la plantilla".
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Plantilla base vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Política de Teletrabajo
   *               message: Plantilla base obtenida correctamente.
   *               data:
   *                 version: "2023.1"
   *                 isCurrent: true
   *                 components:
   *                   - key: "5_2_a"
   *                     clause: "5.2.a"
   *                     title: "Cultura de prevención de riesgos y seguridad y salud en el teletrabajo"
   *                     body: "<p>La empresa promueve...</p>"
   *                     required: true
   *                     order: 1
   *       404:
   *         description: Aún no se ha sembrado ninguna plantilla base
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: Aún no existe una política ni una plantilla base disponible.
   *               key: politica-inexistente
   *               code: TWP.NF.001
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para consultar este módulo.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   */
  async getTemplate(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const data = await service.getTemplate()
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.template_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/initialize:
   *   post:
   *     summary: Inicializar el borrador la primera vez (plantilla base o de cero)
   *     description: |
   *       Elección única (regla de negocio 3): `mode: "template"` copia los 12
   *       componentes de la plantilla base vigente; `mode: "blank"` arranca con
   *       el título del sistema y `body` vacío. Crea el borrador en version 1
   *       (o la siguiente versión libre si la empresa ya tuvo una descartada).
   *       409 si la empresa ya tiene una política (no se vuelve a preguntar).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [mode]
   *             properties:
   *               mode: { type: string, enum: [template, blank] }
   *     responses:
   *       201:
   *         description: Borrador creado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Política de Teletrabajo
   *               message: Borrador de la Política de Teletrabajo creado correctamente.
   *               data:
   *                 id: 1
   *                 businessUnitId: 5
   *                 version: 1
   *                 title: "Política de Teletrabajo"
   *                 status: draft
   *                 isCurrent: false
   *                 missingComponentKeys: []
   *                 components: []
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   *       409:
   *         description: La empresa ya tiene una política (borrador o publicada)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: La empresa ya tiene una Política de Teletrabajo; no se puede volver a inicializar.
   *               key: politica-ya-existe
   *               code: TWP.CONF.001
   *       422:
   *         description: Body malformado (mode fuera de enum o ausente)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               message: Entrada inválida
   *               detail: The mode field must be defined
   *               key: entrada-invalida
   *               data: null
   */
  async initialize(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'create'))) {
      return
    }

    let payload
    try {
      payload = await teleworkPolicyInitializeValidator.validate(ctx.request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const actorUserId = ctx.auth.user!.userId
      const data = await service.initialize(businessUnitId, payload, actorUserId)
      return ctx.response.status(201).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.initialize_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy:
   *   put:
   *     summary: Editar el borrador (título y los 12 componentes con texto enriquecido)
   *     description: |
   *       Actualiza el borrador existente. Se puede guardar aunque falte
   *       contenido en algún componente (regla de negocio 5, 6): la respuesta
   *       señala en `missingComponentKeys` cuáles siguen vacíos (guía, no
   *       bloqueo). El `components` debe traer exactamente los 12 `key`
   *       esperados (`5_2_a`..`5_2_l`); estructura fija (regla de negocio 4).
   *       El `body` de cada componente se sanea en el servidor (anti-XSS).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [title, components]
   *             properties:
   *               title: { type: string, minLength: 3, maxLength: 150 }
   *               components:
   *                 type: array
   *                 minItems: 12
   *                 maxItems: 12
   *                 items:
   *                   type: object
   *                   required: [key, title, body]
   *                   properties:
   *                     key: { type: string, example: "5_2_a" }
   *                     title: { type: string }
   *                     body: { type: string, description: "HTML enriquecido" }
   *     responses:
   *       200:
   *         description: Borrador actualizado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Política de Teletrabajo
   *               message: Borrador de la Política de Teletrabajo actualizado correctamente.
   *               data:
   *                 id: 1
   *                 businessUnitId: 5
   *                 version: 1
   *                 title: "Política de Teletrabajo de Acme"
   *                 status: draft
   *                 isCurrent: false
   *                 missingComponentKeys: ["5_2_h"]
   *                 components: []
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa aún no tiene un borrador
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: La empresa aún no tiene una Política de Teletrabajo; primero inicialízala.
   *               key: politica-inexistente
   *               code: TWP.NF.001
   *       409:
   *         description: La política ya está publicada (inmutable)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: No se puede editar una versión ya publicada.
   *               key: politica-publicada-inmutable
   *               code: TWP.CONF.002
   *       422:
   *         description: El components no trae exactamente los 12 key esperados (regla 4) o body malformado
   *         content:
   *           application/json:
   *             examples:
   *               estructuraInvalida:
   *                 summary: Faltan/sobran/duplican componentes
   *                 value:
   *                   type: error
   *                   title: Política de Teletrabajo
   *                   detail: El campo 'components' debe traer exactamente los 12 elementos obligatorios del numeral 5.2, cada uno con una 'key' distinta ('5_2_a' a '5_2_l'); no se pueden agregar, quitar ni repetir. Revisa 'data' en esta respuesta para ver qué claves faltan, están duplicadas o no son válidas.
   *                   key: estructura-componentes-invalida
   *                   code: TWP.VAL.STRUCTURE.001
   *                   data:
   *                     missingKeys: [5_2_b, 5_2_c, 5_2_d, 5_2_e, 5_2_f, 5_2_g, 5_2_h, 5_2_i, 5_2_j, 5_2_k, 5_2_l]
   *                     duplicatedKeys: [5_2_a]
   *                     unexpectedKeys: []
   *               entradaInvalida:
   *                 summary: Body malformado (Vine)
   *                 value:
   *                   type: error
   *                   title: Política de Teletrabajo
   *                   message: Entrada inválida
   *                   detail: The title field must be defined
   *                   key: entrada-invalida
   *                   data: null
   */
  async updateDraft(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'update'))) {
      return
    }

    let payload
    try {
      payload = await teleworkPolicyUpdateValidator.validate(ctx.request.all())
    } catch (error) {
      return this.draftValidationError(ctx, error)
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const actorUserId = ctx.auth.user!.userId
      const data = await service.updateDraft(businessUnitId, payload, actorUserId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.update_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/draft:
   *   delete:
   *     summary: Descartar el borrador de la Política de Teletrabajo
   *     description: |
   *       Elimina (soft delete) el borrador de la empresa en scope. Solo aplica
   *       mientras esté en `status: draft`; sobre una versión publicada
   *       responde 409 (defensa a futuro, esta HU no publica).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Borrador descartado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Política de Teletrabajo
   *               message: Borrador de la Política de Teletrabajo descartado correctamente.
   *               data: null
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa no tiene ningún borrador
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: La empresa aún no tiene una Política de Teletrabajo; primero inicialízala.
   *               key: politica-inexistente
   *               code: TWP.NF.001
   *       409:
   *         description: La política ya está publicada (inmutable)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: No se puede editar una versión ya publicada.
   *               key: politica-publicada-inmutable
   *               code: TWP.CONF.002
   */
  async discardDraft(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'delete'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      await service.discardDraft(businessUnitId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.discard_success'),
        data: null,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/publish:
   *   post:
   *     summary: Publicar el borrador (sella una versión vigente y la difunde por correo)
   *     description: |
   *       Congela el borrador activo como versión publicada e inmutable
   *       (sello sha256 de contenido), la vuelve vigente (apagando la
   *       anterior) y, tras confirmar la transacción, difunde por correo al
   *       conjunto de teletrabajadores del listado 5.1 con bitácora — un
   *       fallo de correo nunca revierte la publicación (regla de negocio 5).
   *       422 si algún componente del 5.2 sigue sin contenido (regla 13).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
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
   *         description: Versión publicada y difundida
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Política de Teletrabajo
   *               message: Política de Teletrabajo publicada y difundida correctamente.
   *               data:
   *                 policy:
   *                   id: 1
   *                   businessUnitId: 5
   *                   version: 1
   *                   status: published
   *                   isCurrent: true
   *                   contentHash: "5d41402abc4b2a76b9719d911017c592"
   *                   publishedAt: "2026-07-15T12:00:00.000-06:00"
   *                   publishedByName: "Juana Pérez"
   *                 diffusion: { total: 10, sent: 9, failed: 0, skipped: 1 }
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa aún no tiene un borrador
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: La empresa aún no tiene una Política de Teletrabajo; primero inicialízala.
   *               key: politica-inexistente
   *               code: TWP.NF.001
   *       409:
   *         description: La fila activa ya está publicada (no hay borrador que publicar)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: No se puede editar una versión ya publicada.
   *               key: politica-publicada-inmutable
   *               code: TWP.CONF.002
   *       422:
   *         description: Falta contenido en alguno de los 12 componentes del 5.2
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: No se puede publicar; hay componentes del numeral 5.2 sin contenido.
   *               key: politica-incompleta-para-publicar
   *               code: TWP.VAL.STRUCTURE.002
   *               data:
   *                 missingKeys: [5_2_h]
   *                 duplicatedKeys: []
   *                 unexpectedKeys: []
   */
  async publish(ctx: HttpContext, service: TeleworkPolicyService = new TeleworkPolicyService()) {
    if (!(await this.assertHasPermission(ctx, 'update'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const actorUserId = ctx.auth.user!.userId
      const data = await service.publish(businessUnitId, actorUserId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.publish_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/draft:
   *   post:
   *     summary: Iniciar un nuevo borrador partiendo de la última versión publicada
   *     description: |
   *       Clona título y componentes de la vigente publicada en un nuevo
   *       borrador editable (regla de negocio 12) — nunca de hoja en blanco.
   *       409 si ya hay un borrador activo; 404 `sin-version-vigente` si la
   *       empresa nunca ha publicado (aunque haya tenido un borrador
   *       descartado); `politica-inexistente` si nunca tuvo absolutamente nada.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
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
   *         description: Nuevo borrador creado a partir de la vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Política de Teletrabajo
   *               message: Nuevo borrador de la Política de Teletrabajo creado a partir de la versión vigente.
   *               data:
   *                 id: 2
   *                 businessUnitId: 5
   *                 version: 2
   *                 status: draft
   *                 isCurrent: false
   *                 missingComponentKeys: []
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   *       404:
   *         description: No hay versión publicada de la cual partir
   *         content:
   *           application/json:
   *             examples:
   *               sinVigente:
   *                 summary: Hubo actividad previa pero nunca se publicó
   *                 value:
   *                   type: error
   *                   title: Política de Teletrabajo
   *                   detail: La empresa no tiene ninguna versión publicada vigente de la cual partir.
   *                   key: sin-version-vigente
   *                   code: TWP.NF.002
   *               inexistente:
   *                 summary: La empresa nunca ha tenido ninguna política
   *                 value:
   *                   type: error
   *                   title: Política de Teletrabajo
   *                   detail: La empresa aún no tiene una Política de Teletrabajo; primero inicialízala.
   *                   key: politica-inexistente
   *                   code: TWP.NF.001
   *       409:
   *         description: Ya existe un borrador activo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: Ya existe un borrador activo; edítalo en vez de crear otro.
   *               key: borrador-ya-existe
   *               code: TWP.CONF.003
   */
  async createDraftFromLatest(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'create'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const actorUserId = ctx.auth.user!.userId
      const data = await service.createDraftFromLatest(businessUnitId, actorUserId)
      return ctx.response.status(201).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.draft_from_latest_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/versions:
   *   get:
   *     summary: Consultar el historial de versiones de la Política de Teletrabajo
   *     description: |
   *       Todas las versiones no eliminadas de la empresa, de la más
   *       reciente a la más antigua (incluye el borrador activo si existe).
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
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
   *         description: Historial de versiones
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Política de Teletrabajo
   *               message: Historial de versiones obtenido correctamente.
   *               data:
   *                 - id: 2
   *                   version: 2
   *                   status: draft
   *                   isCurrent: false
   *                   publishedAt: null
   *                   publishedByName: null
   *                   contentHash: null
   *                   createdAt: "2026-07-15T12:05:00.000-06:00"
   *                 - id: 1
   *                   version: 1
   *                   status: published
   *                   isCurrent: true
   *                   publishedAt: "2026-07-15T12:00:00.000-06:00"
   *                   publishedByName: "Juana Pérez"
   *                   contentHash: "5d41402abc4b2a76b9719d911017c592"
   *                   createdAt: "2026-07-10T09:00:00.000-06:00"
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para consultar este módulo.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa no tiene ninguna versión
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: La empresa aún no tiene una Política de Teletrabajo; primero inicialízala.
   *               key: politica-inexistente
   *               code: TWP.NF.001
   */
  async listVersions(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const data = await service.listVersions(businessUnitId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.versions_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/acknowledgements:
   *   get:
   *     summary: Seguimiento de acuses de la Política de Teletrabajo vigente
   *     description: |
   *       Cruza el conjunto de teletrabajadores del listado 5.1 contra los
   *       acuses registrados (calculado al vuelo — regla de negocio 6, 7):
   *       `acknowledged` (acusó la vigente), `outdated` (acusó una versión
   *       anterior) o `pending` (sin ningún acuse). Responde 200 con
   *       `hasCurrentVersion: false` si aún no hay ninguna versión publicada
   *       (no es error). El correo nunca viaja en la respuesta — solo
   *       `hasEmail`.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
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
   *         description: Seguimiento de acuses
   *         content:
   *           application/json:
   *             examples:
   *               sinVigente:
   *                 summary: Aún no hay ninguna versión publicada
   *                 value:
   *                   type: success
   *                   title: Política de Teletrabajo
   *                   message: Seguimiento de acuses obtenido correctamente.
   *                   data:
   *                     hasCurrentVersion: false
   *                     currentVersion: null
   *                     publishedAt: null
   *                     summary: { total: 0, acknowledged: 0, outdated: 0, pending: 0, withoutEmail: 0 }
   *                     workers: []
   *               conVigente:
   *                 summary: Con versión vigente y teletrabajadores en distintos estados
   *                 value:
   *                   type: success
   *                   title: Política de Teletrabajo
   *                   message: Seguimiento de acuses obtenido correctamente.
   *                   data:
   *                     hasCurrentVersion: true
   *                     currentVersion: 2
   *                     publishedAt: "2026-07-15T12:00:00.000-06:00"
   *                     summary: { total: 3, acknowledged: 1, outdated: 1, pending: 1, withoutEmail: 0 }
   *                     workers:
   *                       - employeeId: 10
   *                         employeeCode: 1010
   *                         fullName: "Juana Pérez"
   *                         position: "Analista"
   *                         status: acknowledged
   *                         acknowledgedVersion: 2
   *                         acknowledgedAt: "2026-07-15T13:00:00.000-06:00"
   *                         hasEmail: true
   *                       - employeeId: 11
   *                         employeeCode: 1011
   *                         fullName: "Luis Gómez"
   *                         position: "Analista"
   *                         status: outdated
   *                         acknowledgedVersion: 1
   *                         acknowledgedAt: "2026-06-01T09:00:00.000-06:00"
   *                         hasEmail: true
   *                       - employeeId: 12
   *                         employeeCode: 1012
   *                         fullName: "Ana Ruiz"
   *                         position: "Analista"
   *                         status: pending
   *                         acknowledgedVersion: null
   *                         acknowledgedAt: null
   *                         hasEmail: true
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para consultar este módulo.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   */
  async getAcknowledgementTracking(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const data = await service.getAcknowledgementTracking(businessUnitId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage('telework_policy.tracking_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-policy/remind-pending:
   *   post:
   *     summary: Recordar por correo a los teletrabajadores pendientes de acusar
   *     description: |
   *       Sin `employeeIds` es masivo (todos los `outdated` + `pending` de la
   *       vigente, regla de negocio 4); con `employeeIds` es selectivo — se
   *       intersecta con los pendientes reales, ids ajenos se ignoran en
   *       silencio. 0 pendientes responde 200 idempotente (no es error). 404
   *       `sin-version-vigente` si la empresa nunca ha publicado.
   *     security:
   *       - bearerAuth: []
   *     tags: [TeleworkPolicy]
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
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeIds:
   *                 type: array
   *                 items: { type: integer, minimum: 1 }
   *                 minItems: 1
   *                 description: "Omitir para recordatorio masivo a todos los pendientes."
   *     responses:
   *       200:
   *         description: Recordatorio enviado (o 0 pendientes, idempotente)
   *         content:
   *           application/json:
   *             examples:
   *               enviado:
   *                 summary: Al menos un pendiente recibió el recordatorio
   *                 value:
   *                   type: success
   *                   title: Política de Teletrabajo
   *                   message: Recordatorio enviado correctamente.
   *                   data: { pendingTotal: 2, total: 2, sent: 2, failed: 0, skipped: 0 }
   *               sinPendientesEnLaEmpresa:
   *                 summary: 0 pendientes en toda la empresa (masivo) — idempotente, no es error
   *                 value:
   *                   type: success
   *                   title: Política de Teletrabajo
   *                   message: No hay teletrabajadores pendientes de acusar; no fue necesario enviar ningún recordatorio.
   *                   data: { pendingTotal: 0, total: 0, sent: 0, failed: 0, skipped: 0 }
   *               employeeIdsSinCoincidencias:
   *                 summary: Sí hay pendientes, pero ninguno coincide con los employeeIds indicados — idempotente, no es error
   *                 value:
   *                   type: success
   *                   title: Política de Teletrabajo
   *                   message: Ninguno de los teletrabajadores indicados está pendiente de acusar; no se envió ningún recordatorio.
   *                   data: { pendingTotal: 2, total: 0, sent: 0, failed: 0, skipped: 0 }
   *       403:
   *         description: Sin permiso del módulo de teletrabajo
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para realizar esta operación.
   *               key: sin-permiso
   *               errorCode: TWP.AUTH.001
   *               data: null
   *       404:
   *         description: La empresa nunca ha publicado ninguna versión
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               detail: La empresa no tiene ninguna versión publicada vigente de la cual partir.
   *               key: sin-version-vigente
   *               code: TWP.NF.002
   *       422:
   *         description: employeeIds malformado (no numérico, vacío o negativo)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Política de Teletrabajo
   *               message: Entrada inválida
   *               detail: The employeeIds.0 field must be a number
   *               key: entrada-invalida
   *               data: null
   */
  async remindPending(
    ctx: HttpContext,
    service: TeleworkPolicyService = new TeleworkPolicyService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'update'))) {
      return
    }

    let payload
    try {
      payload = await teleworkPolicyRemindValidator.validate(ctx.request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const actorUserId = ctx.auth.user!.userId
      const data = await service.remindPending(businessUnitId, actorUserId, payload.employeeIds)
      // `total === 0` significa que no se disparó ni un solo correo — decirlo
      // como "enviado correctamente" sería contradictorio. Se distingue el
      // motivo: nadie pendiente en TODA la empresa (`pendingTotal === 0`) vs.
      // los `employeeIds` indicados no coinciden con ningún pendiente real
      // (sigue habiendo pendientes, solo no en ese subconjunto).
      const messageKey =
        data.total > 0
          ? 'telework_policy.remind_success'
          : data.pendingTotal === 0
            ? 'telework_policy.remind_no_pending_success'
            : 'telework_policy.remind_no_matching_pending_success'
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_policy.title'),
        message: ctx.i18n.formatMessage(messageKey),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  private async assertHasPermission(ctx: HttpContext, action: ComplianceRepseAction) {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  /** Errores de Vine para `initialize`: `mode` fuera de enum/ausente. */
  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ field: string; message: string; rule: string }> }).messages
        : undefined

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('telework_policy.title'),
      message: i18n.formatMessage('telework_policy.errors.entrada-invalida.title'),
      detail:
        vineMessages?.[0]?.message ??
        (error instanceof Error
          ? error.message
          : i18n.formatMessage('telework_policy.errors.entrada-invalida.detail')),
      key: 'entrada-invalida',
      data: vineMessages ? { errors: vineMessages } : null,
    })
  }

  /** Errores de Vine para `updateDraft`: título/componentes mal formados (forma, no estructura de negocio). */
  private draftValidationError(ctx: HttpContext, error: unknown) {
    return this.validationError(ctx, error)
  }

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof TeleworkPolicyError) {
      const { i18n } = ctx
      const { status, code } = ERROR_STATUS_BY_KEY[error.key]
      return ctx.response.status(status).json({
        type: 'error',
        title: i18n.formatMessage('telework_policy.title'),
        detail: i18n.formatMessage(`telework_policy.errors.${error.key}.detail`),
        key: error.key,
        code,
        // Detalle accionable (faltantes/duplicados/no reconocidos) para que
        // el cliente sepa exactamente qué `key` corregir, sin necesidad de
        // adivinar a partir de un mensaje genérico.
        ...(error.details ? { data: error.details } : {}),
      })
    }
    throw error
  }
}
