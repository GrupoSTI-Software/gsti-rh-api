import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import { ensureAccessPointPermission } from '#modules/access-point/access_point_authorization'
import UnmappedPinsService from './unmapped_pins.service.js'

const listValidator = vine.compile(
  vine.object({
    status: vine.enum(['pending', 'linked', 'dismissed'] as const).optional(),
  })
)

const idValidator = vine.compile(
  vine.object({
    params: vine.object({ unmappedPinId: vine.number().positive() }),
    search: vine.string().trim().maxLength(80).optional(),
  })
)

const linkValidator = vine.compile(
  vine.object({
    params: vine.object({ unmappedPinId: vine.number().positive() }),
    employeeId: vine.number().positive(),
  })
)

const dismissValidator = vine.compile(
  vine.object({
    params: vine.object({ unmappedPinId: vine.number().positive() }),
    reason: vine.string().trim().minLength(3).maxLength(200),
  })
)

/**
 * PINs que el checador reporta y no corresponden a nadie (spec ADMS 9.4).
 *
 * Pasa siempre al arrancar con un equipo que ya venia usandose. Lo que marcaron
 * esas personas se retiene y se acredita cuando alguien dice de quien es.
 */
export default class UnmappedPinsController {
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.reconcilePins)
      const payload = await request.validateUsing(listValidator, {
        data: { status: request.input('status') },
      })

      const service = new UnmappedPinsService()
      const rows = await service.list(ctx.businessUnitScope ?? [], payload.status)

      return StandardResponseFormatter.success(
        response,
        rows,
        i18n.formatMessage('unmapped_pin_title'),
        i18n.formatMessage('unmapped_pin_list_message'),
        200,
        'unmappedPins'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /** Sugerencias, no decisiones: quien vincula es una persona. */
  async candidates(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.reconcilePins)
      const payload = await request.validateUsing(idValidator, {
        data: { params: request.params(), search: request.input('search') },
      })

      const service = new UnmappedPinsService()
      const rows = await service.candidates(
        payload.params.unmappedPinId,
        ctx.businessUnitScope ?? [],
        payload.search
      )

      return StandardResponseFormatter.success(
        response,
        rows,
        i18n.formatMessage('unmapped_pin_title'),
        i18n.formatMessage('unmapped_pin_candidates_message'),
        200,
        'candidates'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  async link(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.reconcilePins)
      const payload = await request.validateUsing(linkValidator, {
        data: { params: request.params(), employeeId: request.input('employeeId') },
      })

      const service = new UnmappedPinsService()
      const result = await service.link({
        unmappedPinId: payload.params.unmappedPinId,
        employeeId: payload.employeeId,
        businessUnitIds: ctx.businessUnitScope ?? [],
        userId: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        result,
        i18n.formatMessage('unmapped_pin_title'),
        i18n.formatMessage('unmapped_pin_linked_message'),
        200,
        'unmappedPin'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  async dismiss(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.reconcilePins)
      const payload = await request.validateUsing(dismissValidator, {
        data: { params: request.params(), reason: request.input('reason') },
      })

      const service = new UnmappedPinsService()
      const row = await service.dismiss({
        unmappedPinId: payload.params.unmappedPinId,
        reason: payload.reason,
        businessUnitIds: ctx.businessUnitScope ?? [],
        userId: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        { unmappedPinId: row.admsUnmappedPinId, status: row.admsUnmappedPinStatus },
        i18n.formatMessage('unmapped_pin_title'),
        i18n.formatMessage('unmapped_pin_dismissed_message'),
        200,
        'unmappedPin'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}
