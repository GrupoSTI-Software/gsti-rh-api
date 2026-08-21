import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import {
  resolveEmployeeOffboardingApiError,
  type EmployeeOffboardingErrorFallbacks,
} from '#helpers/employee_offboarding_api_error'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import ItemsService from './items.service.js'
import { updateOffboardingItemValidator } from './validators/update_item.validator.js'

/** Ramos genéricos del resolvedor con los códigos compartidos del expediente. */
const ITEM_FALLBACKS: EmployeeOffboardingErrorFallbacks = {
  valInputCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_VAL_INPUT,
  unexpectedCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_UNEXPECTED,
}

/**
 * Cumplimiento de pendientes del expediente de salida (USRH1786568279590).
 * Errores siempre `{ title, detail, key, code }`: el BO ramifica por `key`.
 */
export default class ItemsController {
  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/items/{itemId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Actualiza importe y/o nota de un pendiente sin cambiar su estado
   *     description: |
   *       Ambos campos son opcionales: ausente = no tocar, `null` = limpiar.
   *       El importe solo se acepta si el concepto del pendiente lo admite,
   *       resuelto con withTrashed (regla 5: manda lo que decía el concepto
   *       al generarse). Se puede corregir esté el pendiente cumplido o no.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeOffboardingItemAmount: { type: number, minimum: 0, nullable: true }
   *               employeeOffboardingItemNote: { type: string, maxLength: 1000, nullable: true }
   *     responses:
   *       200:
   *         description: Pendiente en data.employeeOffboardingItem, con su diagnóstico de insumo
   *       400:
   *         description: Importe negativo o cuerpo mal formado (key datos-invalidos)
   *       404:
   *         description: Pendiente o expediente inexistente o fuera del alcance (key pendiente-no-encontrado)
   *       422:
   *         description: El concepto no admite importe (key importe-no-aplicable)
   */
  async update({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ItemsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const itemId = this.parseId(request.param('itemId'), i18n)
      const data = await request.validateUsing(updateOffboardingItemValidator)
      const employeeOffboardingItem = await service.updateItem(
        offboardingId,
        itemId,
        data,
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingItem,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_item_updated_message'),
        200,
        'employeeOffboardingItem'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/items/{itemId}/complete:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Marca un pendiente como cumplido, con retiro real del insumo cuando aplica
   *     description: |
   *       Estampa autoría y fecha. Si el pendiente deriva del inventario y el
   *       insumo está disponible, lo retira en la MISMA transacción con la
   *       fecha del acto y el motivo "Devolución registrada en el expediente
   *       de salida #id". Regla única del insumo no disponible (regla 10): ya
   *       retirado, eliminado o fuera del alcance, el pendiente se completa
   *       igual, no se toca el inventario y el diagnóstico viaja en el cuerpo
   *       de éxito (`supplyOutcome`, `supplyDiagnosticCode`) — un pendiente
   *       nunca queda imposible de cerrar. Puede traer importe y nota, que se
   *       aplican en la misma operación.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeOffboardingItemAmount: { type: number, minimum: 0, nullable: true }
   *               employeeOffboardingItemNote: { type: string, maxLength: 1000, nullable: true }
   *     responses:
   *       200:
   *         description: Pendiente cumplido en data.employeeOffboardingItem con supplyOutcome retired/already_retired/unavailable/not_applicable
   *       404:
   *         description: Pendiente o expediente fuera del alcance (key pendiente-no-encontrado)
   *       409:
   *         description: El pendiente ya está cumplido (key pendiente-ya-cumplido)
   *       422:
   *         description: El concepto no admite importe (key importe-no-aplicable)
   */
  async complete({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ItemsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const itemId = this.parseId(request.param('itemId'), i18n)
      const data = await request.validateUsing(updateOffboardingItemValidator)
      const employeeOffboardingItem = await service.completeItem(
        offboardingId,
        itemId,
        data,
        businessUnitScope,
        auth.user?.userId ?? null
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingItem,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_item_completed_message'),
        200,
        'employeeOffboardingItem'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{offboardingId}/items/{itemId}/revert:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Regresa un pendiente cumplido a pendiente
   *     description: |
   *       Limpia autoría y fecha, conserva importe y nota. NUNCA des-retira
   *       el insumo (regla 11, decisión cerrada): entre el retiro y la
   *       reversión el equipo pudo reasignarse; si el retiro fue un error, se
   *       corrige desde el módulo de insumos. La respuesta trae
   *       `supplyOutcome: already_retired` para que el backoffice lo avise.
   *     parameters:
   *       - in: path
   *         name: offboardingId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: itemId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Pendiente de vuelta en pending, en data.employeeOffboardingItem
   *       404:
   *         description: Pendiente o expediente fuera del alcance (key pendiente-no-encontrado)
   *       409:
   *         description: El pendiente no está cumplido (key pendiente-no-cumplido)
   */
  async revert({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ItemsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const offboardingId = this.parseId(request.param('offboardingId'), i18n)
      const itemId = this.parseId(request.param('itemId'), i18n)
      const employeeOffboardingItem = await service.revertItem(
        offboardingId,
        itemId,
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboardingItem,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_item_reverted_message'),
        200,
        'employeeOffboardingItem'
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
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_VAL_INPUT,
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
    const resolved = resolveEmployeeOffboardingApiError(error, i18n, ITEM_FALLBACKS)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
