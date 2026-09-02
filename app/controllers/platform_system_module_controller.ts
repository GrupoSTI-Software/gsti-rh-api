import type { HttpContext } from '@adonisjs/core/http'
import PlatformSystemModuleService from '#services/platform_system_module_service'
import {
  updateSystemModuleActiveValidator,
  updateSystemModulePermissionEnforcementValidator,
} from '#validators/platform_system_module'
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
   *     summary: Catálogo completo de módulos con grupo anidado (panel de plataforma)
   *     description: >
   *       Devuelve todos los módulos, incluidos los inactivos, con su grupo anidado
   *       en `systemModuleGroup` (objeto precargado; `null` si el módulo es suelto
   *       o su grupo fue dado de baja). El grupo viaja anidado porque el panel de
   *       plataforma no consulta la ruta de catálogo `/api/system-modules/get-groups`.
   *       Orden clusterizado (R9): grupos en el orden del catálogo, módulos dentro
   *       del suyo por `systemModuleOrder`, y todos los módulos sueltos juntos
   *       al final en un único bloque (requerido por PrimeVue `row-group-mode="subheader"`).
   *       Excluye módulos con baja lógica. No está paginado (USRH1788282413110 §9.4).
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Catálogo completo de módulos con grupo anidado en orden clusterizado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     systemModules:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/SystemModule'
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma (`AUTH.PLATFORM.FORBIDDEN`)
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

  /**
   * @swagger
   * /api/platform/system-modules/{systemModuleId}/permission-enforcement:
   *   put:
   *     tags:
   *       - Platform System Modules
   *     summary: Encender o apagar la exigencia de permisos del módulo
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
   *                 description: Estado deseado de la exigencia de permisos
   *     responses:
   *       '200':
   *         description: Módulo actualizado con su enforcement
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   *       '404':
   *         description: Módulo no encontrado
   *       '422':
   *         description: Body inválido
   */
  async updatePermissionEnforcement({ params, request, response }: HttpContext) {
    try {
      const { active } = await request.validateUsing(
        updateSystemModulePermissionEnforcementValidator
      )
      const systemModule = await this.service.setPermissionEnforcement(
        Number(params.systemModuleId),
        active
      )
      return response.status(200).json({ type: 'success', data: { systemModule } })
    } catch (error) {
      const { status, ...body } = resolvePlatformSystemModuleApiError(error)
      return response.status(status).json(body)
    }
  }
}
