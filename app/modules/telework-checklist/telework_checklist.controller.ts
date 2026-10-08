import type { HttpContext } from '@adonisjs/core/http'
import {
  assertComplianceRepsePermission,
  type ComplianceRepseAction,
} from '#helpers/compliance_repse_rbac'
import { TELEWORK_CHECKLIST_MODULE_SLUG } from '#constants/telework_checklist'
import { TELEWORK_CHECKLIST_ERROR_CODES } from '#constants/telework_checklist_error_codes'
import TeleworkChecklistError from './telework_checklist.error.js'
import type { TeleworkChecklistErrorKey } from './telework_checklist.error.js'
import TeleworkChecklistService from './telework_checklist.service.js'
import { teleworkChecklistCreateValidator } from './validators/telework_checklist_create.validator.js'

/** Módulo de catálogo cuyos permisos gobiernan las rutas de datos. */
const MODULE_SLUG = TELEWORK_CHECKLIST_MODULE_SLUG
/** Respuesta 403 propia del helper RBAC (sin `detail`, con `errorCode`). */
const RBAC_FORBIDDEN = {
  errorCode: TELEWORK_CHECKLIST_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'telework_checklist',
}

/**
 * `key` de dominio → { status HTTP, código estable }. El error de dominio no se
 * acopla al HTTP: el controller resuelve aquí el estado y el `TWC.*`.
 */
const ERROR_STATUS_BY_KEY: Record<TeleworkChecklistErrorKey, { status: number; code: string }> = {
  'respuestas-incompletas': {
    status: 422,
    code: TELEWORK_CHECKLIST_ERROR_CODES.INCOMPLETE_ANSWERS,
  },
  'respuesta-duplicada': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.DUPLICATED_ANSWER },
  'punto-no-reconocido': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.UNKNOWN_ITEM },
  'fecha-de-aplicacion-invalida': {
    status: 422,
    code: TELEWORK_CHECKLIST_ERROR_CODES.INVALID_APPLIED_AT,
  },
  'visitador-requerido': { status: 422, code: TELEWORK_CHECKLIST_ERROR_CODES.INSPECTOR_REQUIRED },
  'lugar-de-teletrabajo-invalido': {
    status: 422,
    code: TELEWORK_CHECKLIST_ERROR_CODES.INVALID_LOCATION,
  },
  'solo-teletrabajadores': {
    status: 422,
    code: TELEWORK_CHECKLIST_ERROR_CODES.GATING_ONLY_TELEWORKERS,
  },
  'colaborador-no-encontrado': {
    status: 404,
    code: TELEWORK_CHECKLIST_ERROR_CODES.EMPLOYEE_NOT_FOUND,
  },
  'aplicacion-no-encontrada': {
    status: 404,
    code: TELEWORK_CHECKLIST_ERROR_CODES.APPLICATION_NOT_FOUND,
  },
  'aplicacion-concurrente': {
    status: 409,
    code: TELEWORK_CHECKLIST_ERROR_CODES.CONCURRENT_APPLICATION,
  },
}

/**
 * Controlador HTTP de la lista de verificación de teletrabajo (NOM-037,
 * VLRH-H1790812613870).
 *
 * Endpoints:
 *   GET  /api/nom037/telework-checklists/items                     — catálogo de puntos (cualquier autenticado).
 *   GET  /api/nom037/telework-checklists/employees/:employeeId     — historial del teletrabajador (`read`).
 *   GET  /api/nom037/telework-checklists/:applicationId            — detalle de una aplicación (`read`).
 *   POST /api/nom037/telework-checklists                           — registra la visita de la Comisión (`create`).
 *
 * Seguridad: `middleware.auth()` + `middleware.businessScope()` en todas las
 * rutas (empresa resuelta del header `X-Business-Unit-Id`, nunca de URL/body,
 * anti-IDOR). El permiso del módulo `telework-checklists` se verifica aquí con
 * `assertComplianceRepsePermission` (patrón `telework_policy.controller.ts`);
 * `items` no exige permiso de módulo. El servidor fija `mode: 'visita_csh'`.
 * Sin fotos (VLRH-H1791311161420) y sin ruta de borrado.
 */
export default class TeleworkChecklistController {
  /** Responde 403 y devuelve `false` si el usuario no tiene la acción pedida. */
  private async assertHasPermission(
    ctx: HttpContext,
    action: ComplianceRepseAction
  ): Promise<boolean> {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  /** Catálogo global de puntos activos, con su etiqueta ya traducida. Sin permiso de módulo. */
  async listItems(
    ctx: HttpContext,
    service: TeleworkChecklistService = new TeleworkChecklistService()
  ) {
    const { response, i18n } = ctx
    try {
      const items = await service.listItems()
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('telework_checklist.title'),
        message: i18n.formatMessage('telework_checklist.items_success'),
        data: items.map((item) => ({
          itemId: item.teleworkChecklistItemId,
          code: item.teleworkChecklistItemCode,
          label: i18n.formatMessage(item.teleworkChecklistItemLabelKey),
        })),
      }
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /** Historial de un teletrabajador de la empresa (vigente efectiva + historial). */
  async listByEmployee(
    ctx: HttpContext,
    service: TeleworkChecklistService = new TeleworkChecklistService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const employeeId = Number(ctx.params.employeeId)
      const data = await service.listByEmployee(businessUnitId, employeeId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_checklist.title'),
        message: ctx.i18n.formatMessage('telework_checklist.list_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /** Detalle de una aplicación de la empresa, con sus respuestas. */
  async detail(
    ctx: HttpContext,
    service: TeleworkChecklistService = new TeleworkChecklistService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'read'))) {
      return
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const applicationId = Number(ctx.params.applicationId)
      const data = await service.detail(businessUnitId, applicationId)
      return ctx.response.status(200).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_checklist.title'),
        message: ctx.i18n.formatMessage('telework_checklist.detail_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /** Registra la visita de la Comisión (`mode` lo fija el servidor). */
  async registerVisit(
    ctx: HttpContext,
    service: TeleworkChecklistService = new TeleworkChecklistService()
  ) {
    if (!(await this.assertHasPermission(ctx, 'create'))) {
      return
    }

    let input
    try {
      input = await teleworkChecklistCreateValidator.validate(ctx.request.all())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    try {
      const businessUnitId = ctx.businessUnitScope[0]
      const actorUserId = ctx.auth.user!.userId
      const data = await service.registerVisit(businessUnitId, input, actorUserId)
      return ctx.response.status(201).json({
        type: 'success',
        title: ctx.i18n.formatMessage('telework_checklist.title'),
        message: ctx.i18n.formatMessage('telework_checklist.register_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * 422 de Vine: `mode`/`result` fuera de enum, `answers` vacío, `itemId` no
   * positivo o `appliedAt` mal formado. Lleva los `errors` crudos del validador.
   */
  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ field: string; message: string; rule: string }> }).messages
        : undefined

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('telework_checklist.errors.entrada-invalida.title'),
      detail:
        vineMessages?.[0]?.message ??
        (error instanceof Error
          ? error.message
          : i18n.formatMessage('telework_checklist.errors.entrada-invalida.detail')),
      key: 'entrada-invalida',
      code: TELEWORK_CHECKLIST_ERROR_CODES.INVALID_INPUT,
      data: { errors: vineMessages ?? [] },
    })
  }

  /** Errores de dominio: `title`/`detail` por clave y el `code` del mapa. */
  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof TeleworkChecklistError) {
      const { i18n } = ctx
      const { status, code } = ERROR_STATUS_BY_KEY[error.key]
      return ctx.response.status(status).json({
        type: 'error',
        title: i18n.formatMessage(`telework_checklist.errors.${error.key}.title`),
        detail: i18n.formatMessage(`telework_checklist.errors.${error.key}.detail`),
        key: error.key,
        code,
        ...(error.details ? { data: error.details } : {}),
      })
    }
    throw error
  }
}
