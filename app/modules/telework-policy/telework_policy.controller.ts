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
}

/**
 * Editor del borrador de la Política de Teletrabajo (NOM-037, numeral 5.2).
 *
 * Endpoints:
 *   GET    /api/nom037/telework-policy            — estado/borrador de la empresa en scope.
 *   GET    /api/nom037/telework-policy/template    — plantilla base global vigente.
 *   POST   /api/nom037/telework-policy/initialize  — primera vez: plantilla o cero.
 *   PUT    /api/nom037/telework-policy             — editar borrador (título + 12 componentes).
 *   DELETE /api/nom037/telework-policy/draft       — descartar borrador.
 *
 * Seguridad: `middleware.auth()` + `middleware.businessScope()` en todas las
 * rutas (empresa resuelta del header `X-Business-Unit-Id`, nunca de URL/body,
 * anti-IDOR). Permiso del módulo compliance/teletrabajo vía
 * `assertComplianceRepsePermission` (bypass root/super-administrador).
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
