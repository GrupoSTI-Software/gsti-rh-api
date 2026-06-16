import type { HttpContext } from '@adonisjs/core/http'
import BranchOfficeShiftQuotaService from '#services/branch_office_shift_quota_service'
import { BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES } from '../constants/branch_office_shift_quota_error_codes.js'
import { BranchOfficeShiftQuotaError } from '../exceptions/branch_office_shift_quota_error.js'
import { resolveBranchOfficeShiftQuotaApiError } from '../helpers/branch_office_shift_quota_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import {
  findDuplicateShiftIndices,
  replaceBranchOfficeShiftQuotasValidator,
  type BranchOfficeShiftQuotaInput,
} from '../validators/branch_office_shift_quota.js'

const SUCCESS_TITLE = 'Branch Office Shift Quotas'

/**
 * Controlador REST de cuotas de plantilla por sucursal y turno.
 */
export default class BranchOfficeShiftQuotasController {
  /**
   * @swagger
   * /api/branch-offices/{branchOfficeId}/shift-quotas:
   *   get:
   *     summary: Listar cuotas de plantilla configuradas para una sucursal
   *     description: Solo sucursales dentro del scope del usuario autenticado; fuera de scope responde 404 con key sucursal-no-encontrada.
   *     tags: [BranchOfficeShiftQuotas]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: branchOfficeId
   *         required: true
   *         description: Identificador numérico de la sucursal (entero positivo).
   *         schema:
   *           type: integer
   *           minimum: 1
   *           example: 1
   *     responses:
   *       '200':
   *         description: Cuotas configuradas con turno poblado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BranchOfficeShiftQuotasSuccess'
   *             example:
   *               type: success
   *               title: Branch Office Shift Quotas
   *               message: Cuotas obtenidas correctamente
   *               data:
   *                 quotas:
   *                   - branchOfficeShiftQuotaId: 1
   *                     shift:
   *                       shiftId: 3
   *                       shiftName: Nocturno
   *                     required: 3
   *                     minimum: 2
   *       '400':
   *         description: branchOfficeId no es un entero positivo
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorValInput'
   *             example:
   *               type: error
   *               title: Datos inválidos
   *               message: El parámetro branchOfficeId debe ser un entero positivo
   *               detail: 'Valor recibido: "a". Use un número entero mayor o igual a 1.'
   *               errorCode: BRCH.SQ.VAL.BRCH.001
   *               data: null
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorUnauthorized'
   *             example:
   *               type: error
   *               title: Error
   *               message: Unauthorized access
   *               errorCode: BRCH.SQ.SYS.001
   *               data: null
   *       '404':
   *         description: key sucursal-no-encontrada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorSucursalNoEncontrada'
   *             example:
   *               type: error
   *               title: Sucursal no encontrada
   *               message: Sucursal no encontrada o no disponible para esta instancia del sistema
   *               detail: Sucursal no encontrada o no disponible para esta instancia del sistema
   *               key: sucursal-no-encontrada
   *               errorCode: BRCH.SQ.NF.BRCH.001
   *               data: null
   */
  async index({ params, response, businessUnitScope, i18n }: HttpContext) {
    try {
      const branchOfficeId = this.parseBranchOfficeId(params.branchOfficeId, i18n)
      const quotas = await BranchOfficeShiftQuotaService.list(branchOfficeId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        quotas,
        SUCCESS_TITLE,
        i18n.t(
          'branch_office_shift_quota_list_success_message',
          undefined,
          'Cuotas obtenidas correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 404, i18n)
    }
  }

  /**
   * @swagger
   * /api/branch-offices/{branchOfficeId}/shift-quotas:
   *   put:
   *     summary: Reemplazar todas las cuotas de plantilla de una sucursal
   *     description: Operación replace-all transaccional. Un arreglo vacío elimina todas las cuotas del sitio.
   *     tags: [BranchOfficeShiftQuotas]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: branchOfficeId
   *         required: true
   *         description: Identificador numérico de la sucursal (entero positivo).
   *         schema:
   *           type: integer
   *           minimum: 1
   *           example: 1
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/BranchOfficeShiftQuotasReplace'
   *     responses:
   *       '200':
   *         description: Set completo guardado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BranchOfficeShiftQuotasSuccess'
   *             example:
   *               type: success
   *               title: Branch Office Shift Quotas
   *               message: Cuotas guardadas correctamente
   *               data:
   *                 quotas:
   *                   - branchOfficeShiftQuotaId: 1
   *                     shift:
   *                       shiftId: 3
   *                       shiftName: Nocturno
   *                     required: 3
   *                     minimum: 2
   *       '400':
   *         description: branchOfficeId inválido, validación VineJS o shiftId repetido en el payload
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorValInput'
   *                 - $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorShiftIdDuplicado'
   *             examples:
   *               branchOfficeIdInvalido:
   *                 summary: branchOfficeId no es entero positivo
   *                 value:
   *                   type: error
   *                   title: Datos inválidos
   *                   message: El parámetro branchOfficeId debe ser un entero positivo
   *                   detail: 'Valor recibido: "a". Use un número entero mayor o igual a 1.'
   *                   errorCode: BRCH.SQ.VAL.BRCH.001
   *                   data: null
   *               vineValidation:
   *                 summary: Validación VineJS
   *                 value:
   *                   type: error
   *                   title: Datos inválidos
   *                   message: The quotas.0.required field must be at least 1
   *                   errorCode: BRCH.SQ.VAL.001
   *                   data: null
   *               duplicateShiftId:
   *                 summary: shiftId repetido
   *                 value:
   *                   type: error
   *                   title: Turno repetido en el lote
   *                   message: "shiftId repetido en los items: 1, 2"
   *                   detail: "Los items 1, 2 repiten el mismo shiftId"
   *                   errorCode: BRCH.SQ.VAL.DUP.001
   *                   data: null
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorUnauthorized'
   *             example:
   *               type: error
   *               title: Error
   *               message: Unauthorized access
   *               errorCode: BRCH.SQ.SYS.001
   *               data: null
   *       '404':
   *         description: key sucursal-no-encontrada o turno-no-encontrado
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorSucursalNoEncontrada'
   *                 - $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorTurnoNoEncontrado'
   *             examples:
   *               sucursalNoEncontrada:
   *                 summary: Sucursal fuera de scope
   *                 value:
   *                   type: error
   *                   title: Sucursal no encontrada
   *                   message: Sucursal no encontrada o no disponible para esta instancia del sistema
   *                   detail: Sucursal no encontrada o no disponible para esta instancia del sistema
   *                   key: sucursal-no-encontrada
   *                   errorCode: BRCH.SQ.NF.BRCH.001
   *                   data: null
   *               turnoNoEncontrado:
   *                 summary: Turno inexistente o de otra unidad
   *                 value:
   *                   type: error
   *                   title: Turno no encontrado
   *                   message: No se encontró el turno del item 1 (id 99999) para esta unidad
   *                   detail: No se encontró el turno del item 1 (id 99999) para esta unidad
   *                   key: turno-no-encontrado
   *                   errorCode: BRCH.SQ.NF.SHIFT.001
   *                   data: null
   *       '422':
   *         description: key cuota-invalida
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BranchOfficeShiftQuotaErrorCuotaInvalida'
   *             example:
   *               type: error
   *               title: Cuota inválida
   *               message: "El item 1 (turno 3): el mínimo no puede superar la plantilla requerida y ambos deben ser al menos 1"
   *               detail: "El item 1 (turno 3): el mínimo no puede superar la plantilla requerida y ambos deben ser al menos 1"
   *               key: cuota-invalida
   *               errorCode: BRCH.SQ.VAL.QUOTA.001
   *               data: null
   */
  async replace({ params, request, response, businessUnitScope, i18n }: HttpContext) {
    try {
      const branchOfficeId = this.parseBranchOfficeId(params.branchOfficeId, i18n)
      const body = await request.validateUsing(replaceBranchOfficeShiftQuotasValidator)
      const quotas = body.quotas ?? []

      this.assertNoDuplicateShifts(quotas)

      const saved = await BranchOfficeShiftQuotaService.replaceAll(
        branchOfficeId,
        quotas,
        businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        saved,
        SUCCESS_TITLE,
        i18n.t(
          'branch_office_shift_quota_replace_success_message',
          undefined,
          'Cuotas guardadas correctamente'
        )
      )
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }

  private parseBranchOfficeId(raw: unknown, _i18n: HttpContext['i18n']): number {
    const id = Number(raw)
    if (!Number.isInteger(id) || id <= 0) {
      const receivedValue = raw === undefined || raw === null ? '' : String(raw)
      throw new BranchOfficeShiftQuotaError(
        'El parámetro branchOfficeId debe ser un entero positivo',
        BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.VAL_BRANCH_OFFICE_ID,
        400,
        undefined,
        `Valor recibido: "${receivedValue}". Use un número entero mayor o igual a 1.`,
        { value: receivedValue }
      )
    }
    return id
  }

  private assertNoDuplicateShifts(quotas: BranchOfficeShiftQuotaInput[]) {
    const duplicateIndices = findDuplicateShiftIndices(quotas)
    if (duplicateIndices.length === 0) return

    const indices = duplicateIndices.join(', ')

    throw new BranchOfficeShiftQuotaError(
      `shiftId repetido en los items: ${indices}`,
      BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.VAL_SHIFT_DUPLICATE,
      400,
      undefined,
      `Los items ${indices} repiten el mismo shiftId`,
      { indices }
    )
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveBranchOfficeShiftQuotaApiError(error, fallback, i18n)
    const body: Record<string, unknown> = {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      errorCode: resolved.errorCode,
      data: null,
    }
    if (resolved.detail) {
      body.detail = resolved.detail
    }
    if (resolved.key) {
      body.key = resolved.key
    }
    return response.status(resolved.status).json(body)
  }
}
