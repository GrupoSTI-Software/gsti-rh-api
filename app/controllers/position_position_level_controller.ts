import type { HttpContext } from '@adonisjs/core/http'
import PositionPositionLevelService from '#services/position_position_level_service'
import { resolvePositionPositionLevelApiError } from '#helpers/position_position_level_api_error'
import PositionPositionLevelServiceError from '#exceptions/position_position_level_service_error'
import { POSITION_POSITION_LEVEL_ERROR_CODES } from '#constants/position_position_level_error_codes'
import {
  listPositionPositionLevelsValidator,
  replacePositionPositionLevelsValidator,
} from '#validators/position_position_level'

/**
 * Configuración de niveles por puesto (USRH1785273891313).
 * Errores siempre `{ title, detail, key, code }`: el BO ramifica por `key`.
 */
export default class PositionPositionLevelController {
  /**
   * @swagger
   * /api/positions/{positionId}/levels:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles por puesto]
   *     summary: Configuración de niveles del puesto, ordenada por rank
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: UUID público de la razón social
   *       - in: path
   *         name: positionId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: active
   *         schema: { type: boolean }
   *         description: true devuelve solo renglones activos dentro del puesto
   *     responses:
   *       200:
   *         description: Lista ordenada que consumen las HUs posteriores (CA-10)
   *       404:
   *         description: Puesto inexistente o fuera de scope (key puesto-no-encontrado)
   *       403:
   *         description: Sin permiso sobre la estructura organizacional
   */
  async index({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionPositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const positionId = this.parseRouteId(request.param('positionId'), i18n)
      const filters = await request.validateUsing(listPositionPositionLevelsValidator)
      const positionLevels = await service.index(positionId, filters, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_position_level_list_title'),
        message: i18n.formatMessage('position_position_level_list_message'),
        data: { positionLevels },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/positions/{positionId}/levels:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles por puesto]
   *     summary: Reemplaza el bloque completo de niveles del puesto (transaccional)
   *     description: >
   *       Una lista vacía es válida y deja el puesto sin niveles (regla 1).
   *       Las filas vivas ausentes del bloque se dan de baja lógica, salvo que
   *       tengan personal asignado (409 nivel-con-personal-asignado) — en ese
   *       caso la transacción completa se revierte (regla 10).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: path
   *         name: positionId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               levels:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     positionPositionLevelId: { type: integer, nullable: true }
   *                     positionLevelId: { type: integer, nullable: true }
   *                     positionPositionLevelAdHocName: { type: string, nullable: true, maxLength: 100 }
   *                     positionPositionLevelRank: { type: integer, minimum: 1 }
   *                     positionPositionLevelIsDefault: { type: boolean }
   *                     positionPositionLevelActive: { type: boolean }
   *     responses:
   *       200:
   *         description: Configuración resultante ordenada por rank
   *       400:
   *         description: Body inválido (key datos-invalidos)
   *       404:
   *         description: Puesto inexistente o fuera de scope
   *       409:
   *         description: Duplicado, más de un default o personal asignado
   *       422:
   *         description: Origen ambiguo, ad-hoc sin nombre, fuera de catálogo o default inactivo
   */
  async replace({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionPositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const positionId = this.parseRouteId(request.param('positionId'), i18n)
      const data = await request.validateUsing(replacePositionPositionLevelsValidator)
      const positionLevels = await service.replace(positionId, data.levels, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_position_level_replaced_title'),
        message: i18n.formatMessage('position_position_level_replaced_message'),
        data: { positionLevels },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/positions/{positionId}/levels/{positionPositionLevelId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles por puesto]
   *     summary: Quita un nivel individual del puesto (baja lógica)
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: path
   *         name: positionId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: positionPositionLevelId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Nivel quitado; la secuencia restante se renumera 1..n
   *       404:
   *         description: Puesto o renglón inexistente o fuera de scope
   *       409:
   *         description: Nivel con personal asignado; desactivar en su lugar (CA-8)
   */
  async destroy({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionPositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const positionId = this.parseRouteId(request.param('positionId'), i18n)
      const positionPositionLevelId = this.parseRouteId(
        request.param('positionPositionLevelId'),
        i18n
      )
      const positionLevel = await service.deleteOne(
        positionId,
        positionPositionLevelId,
        businessUnitScope
      )
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_position_level_deleted_title'),
        message: i18n.formatMessage('position_position_level_deleted_message'),
        data: { positionLevel },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /** Los parámetros de ruta deben ser enteros positivos; si no, 400 `datos-invalidos`. */
  private parseRouteId(rawId: string, i18n: HttpContext['i18n']): number {
    const parsed = Number.parseInt(rawId, 10)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new PositionPositionLevelServiceError({
        key: 'datos-invalidos',
        errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.VAL_INPUT,
        httpStatus: 400,
        title: i18n.formatMessage('position_position_level_val_input_title'),
        detail: i18n.formatMessage('position_position_level_val_input_message'),
      })
    }
    return parsed
  }

  private respondWithError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: unknown
  ) {
    const resolved = resolvePositionPositionLevelApiError(error, i18n)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
