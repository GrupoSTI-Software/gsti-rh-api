import type { HttpContext } from '@adonisjs/core/http'
import PositionLevelService from '#services/position_level_service'
import { resolvePositionLevelApiError } from '#helpers/position_level_api_error'
import PositionLevelServiceError from '#exceptions/position_level_service_error'
import { POSITION_LEVEL_ERROR_CODES } from '#constants/position_level_error_codes'
import {
  createPositionLevelValidator,
  listPositionLevelsValidator,
  reorderPositionLevelsValidator,
  setPositionLevelActiveValidator,
  updatePositionLevelValidator,
} from '#validators/position_level'

/**
 * Catálogo de niveles de puesto por empresa (USRH1785273891312).
 * Errores siempre `{ title, detail, key, code }`: el BO ramifica por `key`.
 */
export default class PositionLevelController {
  /**
   * @swagger
   * /api/position-levels:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles de puesto]
   *     summary: Lista los niveles de puesto de la razón social del scope
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: UUID público de la razón social
   *       - in: query
   *         name: active
   *         schema: { type: boolean }
   *         description: true devuelve solo niveles activos
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *         description: Filtro por nombre (sin acentos ni mayúsculas)
   *     responses:
   *       200:
   *         description: Lista ordenada por posición jerárquica ascendente
   *       403:
   *         description: Sin permiso sobre la estructura organizacional
   */
  async index({ auth, request, response, i18n }: HttpContext) {
    try {
      const service = new PositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const filters = await request.validateUsing(listPositionLevelsValidator)
      const positionLevels = await service.list(filters)
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_level_list_title'),
        message: i18n.formatMessage('position_level_list_message'),
        data: { positionLevels },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/position-levels/{positionLevelId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles de puesto]
   *     summary: Detalle de un nivel dentro del scope
   *     parameters:
   *       - in: path
   *         name: positionLevelId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Nivel encontrado
   *       404:
   *         description: Inexistente o fuera de scope (key nivel-no-encontrado)
   */
  async show({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const positionLevelId = this.parsePositionLevelId(request.param('positionLevelId'), i18n)
      const positionLevel = await service.show(positionLevelId, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_level_show_title'),
        message: i18n.formatMessage('position_level_show_message'),
        data: { positionLevel },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/position-levels:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles de puesto]
   *     summary: Crea un nivel de puesto en la razón social del scope
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionLevelName: { type: string, maxLength: 100 }
   *               positionLevelRank: { type: integer, minimum: 1, description: 'Opcional; default max(rank)+1' }
   *     responses:
   *       201:
   *         description: Nivel creado activo
   *       409:
   *         description: Nombre duplicado en la empresa (key nivel-nombre-duplicado)
   *       422:
   *         description: Razón social inválida (key referencia-invalida)
   */
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const data = await request.validateUsing(createPositionLevelValidator)
      const positionLevel = await service.create(data, businessUnitScope)
      response.status(201)
      return {
        type: 'success',
        title: i18n.formatMessage('position_level_created_title'),
        message: i18n.formatMessage('position_level_created_message'),
        data: { positionLevel },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/position-levels/{positionLevelId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles de puesto]
   *     summary: Edita nombre y posición jerárquica de un nivel
   *     parameters:
   *       - in: path
   *         name: positionLevelId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [positionLevelName, positionLevelRank]
   *             properties:
   *               positionLevelName: { type: string, maxLength: 100 }
   *               positionLevelRank: { type: integer, minimum: 1 }
   *     responses:
   *       200:
   *         description: Nivel actualizado
   *       404:
   *         description: Inexistente o fuera de scope
   *       409:
   *         description: Nombre duplicado en la empresa
   */
  async update({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const positionLevelId = this.parsePositionLevelId(request.param('positionLevelId'), i18n)
      const data = await request.validateUsing(updatePositionLevelValidator)
      const positionLevel = await service.update(positionLevelId, data, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_level_updated_title'),
        message: i18n.formatMessage('position_level_updated_message'),
        data: { positionLevel },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/position-levels/{positionLevelId}/active:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles de puesto]
   *     summary: Activa o desactiva un nivel (regla 4)
   *     parameters:
   *       - in: path
   *         name: positionLevelId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [positionLevelActive]
   *             properties:
   *               positionLevelActive: { type: boolean }
   *     responses:
   *       200:
   *         description: Estado actualizado; el nivel inactivo sigue visible en el catálogo
   *       404:
   *         description: Inexistente o fuera de scope
   */
  async setActive({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const positionLevelId = this.parsePositionLevelId(request.param('positionLevelId'), i18n)
      const data = await request.validateUsing(setPositionLevelActiveValidator)
      const positionLevel = await service.setActive(
        positionLevelId,
        data.positionLevelActive,
        businessUnitScope
      )
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_level_active_updated_title'),
        message: i18n.formatMessage('position_level_active_updated_message'),
        data: { positionLevel },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/position-levels/reorder:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles de puesto]
   *     summary: Reordena el catálogo completo y renumera 1..n (regla 3)
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [orderedPositionLevelIds]
   *             properties:
   *               orderedPositionLevelIds:
   *                 type: array
   *                 items: { type: integer }
   *                 description: Lista completa de niveles vigentes en el nuevo orden
   *     responses:
   *       200:
   *         description: Lista renumerada en el orden recibido
   *       422:
   *         description: Ids ajenos, duplicados o lista incompleta (key orden-invalido)
   */
  async reorder({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const data = await request.validateUsing(reorderPositionLevelsValidator)
      const positionLevels = await service.reorder(
        data.businessUnitId,
        data.orderedPositionLevelIds,
        businessUnitScope
      )
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_level_reordered_title'),
        message: i18n.formatMessage('position_level_reordered_message'),
        data: { positionLevels },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/position-levels/{positionLevelId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags: [Niveles de puesto]
   *     summary: Baja lógica de un nivel que ningún puesto usa (reglas 5 y 6)
   *     parameters:
   *       - in: path
   *         name: positionLevelId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Nivel eliminado lógicamente; su nombre queda libre
   *       404:
   *         description: Inexistente o fuera de scope
   *       409:
   *         description: Nivel en uso, solo puede desactivarse (key nivel-en-uso)
   */
  async delete({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new PositionLevelService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const positionLevelId = this.parsePositionLevelId(request.param('positionLevelId'), i18n)
      const positionLevel = await service.delete(positionLevelId, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('position_level_deleted_title'),
        message: i18n.formatMessage('position_level_deleted_message'),
        data: { positionLevel },
      }
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /** El parámetro de ruta debe ser un entero positivo; si no, 400 `datos-invalidos`. */
  private parsePositionLevelId(rawId: string, i18n: HttpContext['i18n']): number {
    const positionLevelId = Number.parseInt(rawId, 10)
    if (!Number.isInteger(positionLevelId) || positionLevelId < 1) {
      throw new PositionLevelServiceError({
        key: 'datos-invalidos',
        errorCode: POSITION_LEVEL_ERROR_CODES.VAL_INPUT,
        httpStatus: 400,
        title: i18n.formatMessage('position_level_val_input_title'),
        detail: i18n.formatMessage('position_level_val_input_message'),
      })
    }
    return positionLevelId
  }

  private respondWithError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: unknown
  ) {
    const resolved = resolvePositionLevelApiError(error, i18n)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
