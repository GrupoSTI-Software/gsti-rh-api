import type { HttpContext } from '@adonisjs/core/http'
import PlatformSystemModuleService from '#services/platform_system_module_service'
import { updateSystemModuleActiveValidator } from '#validators/platform_system_module'
import { resolvePlatformSystemModuleApiError } from '../helpers/platform_system_module_api_error.js'

/**
 * Controlador de la administración global de módulos del sistema (plataforma).
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`.
 *
 * Ref: USRH1784573245783.
 */
export default class PlatformSystemModuleController {
  private readonly service = new PlatformSystemModuleService()

  /**
   * @swagger
   * /api/platform/system-modules:
   *   get:
   *     tags:
   *       - Platform System Modules
   *     summary: Listar todos los módulos del sistema (incluidos inactivos)
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Catálogo completo de módulos con su disponibilidad global
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   */
  async index({ response }: HttpContext) {
    try {
      const systemModules = await this.service.listAll()
      return response.status(200).json({ type: 'success', data: { systemModules } })
    } catch (error) {
      const { status, ...body } = resolvePlatformSystemModuleApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/system-modules/{systemModuleId}/active:
   *   put:
   *     tags:
   *       - Platform System Modules
   *     summary: Encender o apagar globalmente un módulo del sistema
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: systemModuleId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - active
   *             properties:
   *               active:
   *                 type: boolean
   *                 description: Estado deseado del módulo (true encendido, false apagado)
   *     responses:
   *       '200':
   *         description: Módulo actualizado con su nuevo estado
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   *       '404':
   *         description: Módulo no encontrado
   *       '422':
   *         description: Body inválido (active ausente o no booleano)
   */
  async updateActive({ params, request, response }: HttpContext) {
    try {
      const { active } = await request.validateUsing(updateSystemModuleActiveValidator)
      const systemModule = await this.service.setActive(Number(params.systemModuleId), active)
      return response.status(200).json({ type: 'success', data: { systemModule } })
    } catch (error) {
      const { status, ...body } = resolvePlatformSystemModuleApiError(error)
      return response.status(status).json(body)
    }
  }
}
