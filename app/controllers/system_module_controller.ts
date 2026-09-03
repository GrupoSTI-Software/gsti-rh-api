import { HttpContext } from '@adonisjs/core/http'
import { SystemModuleFilterSearchInterface } from '../interfaces/system.module_filter_search_interface.js'
import SystemModuleService from '#services/system_module_service'

export default class SystemModuleController {
  /**
   * @swagger
   * /api/system-modules:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Modules
   *     summary: Listar módulos con su grupo y su orden
   *     description: >
   *       Devuelve el catálogo paginado de módulos. Cada módulo incluye
   *       `systemModuleGroup` (objeto precargado, `null` si el módulo es suelto)
   *       y `systemModuleOrder`. El orden es determinista: COALESCE(orden del grupo,
   *       orden del módulo) → orden del módulo → id. No usa el orden de alta
   *       ni el alfabeto del nombre del grupo (USRH1788282413110).
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Filtro por nombre de módulo (insensible a mayúsculas)
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: false
   *         description: Número de página (default 1)
   *         schema:
   *           type: integer
   *           default: 1
   *       - name: limit
   *         in: query
   *         required: false
   *         description: Registros por página (default 2000)
   *         schema:
   *           type: integer
   *           default: 2000
   *     responses:
   *       '200':
   *         description: Catálogo paginado de módulos con grupo anidado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     systemModules:
   *                       type: object
   *                       description: Objeto paginado de Lucid con meta y data
   *                       properties:
   *                         meta:
   *                           type: object
   *                         data:
   *                           type: array
   *                           items:
   *                             $ref: '#/components/schemas/SystemModule'
   *       default:
   *         description: Error inesperado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 error:
   *                   type: string
   */
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 2000)
      const filters = {
        search: search,
        page: page,
        limit: limit,
      } as SystemModuleFilterSearchInterface
      const systemModuleService = new SystemModuleService()
      const systemModules = await systemModuleService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'System modules',
        message: 'The system modules were found successfully',
        data: {
          systemModules,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-modules/{systemModuleSlug}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Module
   *     summary: get system module by slug
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemModuleSlug
   *         schema:
   *           type: string
   *         description: System module slug
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async show({ request, response }: HttpContext) {
    try {
      const systemModuleSlug = request.param('systemModuleSlug')
      if (!systemModuleSlug) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The system module slug was not found',
          message: 'Missing data to process',
          data: { systemModuleSlug },
        }
      }
      const systemModuleService = new SystemModuleService()
      const showSystemModule = await systemModuleService.show(systemModuleSlug)
      if (!showSystemModule) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system module was not found',
          message: 'The system module was not found with the entered ID',
          data: { systemModuleSlug },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'System module',
          message: 'The system module was found successfully',
          data: { systemModule: showSystemModule },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-modules/get-groups:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Modules
   *     summary: Catálogo de grupos del menú
   *     description: >
   *       Devuelve el catálogo de grupos no dados de baja, cada uno con nombre
   *       limpio (sin prefijo numérico), clave, icono (puede ser `null`) y
   *       posición. Orden: `systemModuleGroupOrder` ASC, `systemModuleGroupId`
   *       ASC como desempate. Es el catálogo real, no un `DISTINCT` de módulos
   *       (USRH1788282413110 §9.1).
   *     responses:
   *       '200':
   *         description: Catálogo de grupos del menú lateral
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     systemModulesGroups:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/SystemModuleGroup'
   *       default:
   *         description: Error inesperado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 error:
   *                   type: string
   */
  async getGroups({ response }: HttpContext) {
    try {
      const systemModuleService = new SystemModuleService()
      const systemModulesGroups = await systemModuleService.getGroups()
      response.status(200)
      return {
        type: 'success',
        title: 'System modules',
        message: 'The system modules groups were found successfully',
        data: {
          systemModulesGroups,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
