import type { HttpContext } from '@adonisjs/core/http'
import BranchOfficeService from '#services/branch_office_service'
import {
  createBranchOfficeValidator,
  updateBranchOfficeValidator,
  branchOfficeFilterValidator,
} from '#validators/branch_office'
import { resolveBranchOfficeApiError } from '../helpers/branch_office_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class BranchOfficesController {
  /**
   * @swagger
   * /api/branch-offices:
   *   get:
   *     summary: Listar sucursales con paginación y filtros
   *     description: Solo se devuelven sucursales cuya unidad de negocio pertenece al scope del usuario autenticado.
   *     tags: [BranchOffices]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 1000
   *       - in: query
   *         name: businessUnitId
   *         schema:
   *           type: integer
   *         description: Filtrar por unidad de negocio
   *       - in: query
   *         name: branchOfficeName
   *         schema:
   *           type: string
   *         description: Filtrar por nombre (coincidencia parcial, sin distinguir mayúsculas)
   *       - in: query
   *         name: sortOrder
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *         description: Orden alfabético por nombre (predeterminado asc)
   *       - in: query
   *         name: includeDeleted
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Lista paginada de sucursales
   */
  async index({ request, response, businessUnitScope }: HttpContext) {
    try {
      const filters = await request.validateUsing(branchOfficeFilterValidator)
      const branches = await BranchOfficeService.getAll(filters, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        branches,
        'Branches',
        'Sucursales obtenidas correctamente'
      )
    } catch (error) {
      const { message, status, errorCode } = resolveBranchOfficeApiError(error, 400)
      return StandardResponseFormatter.error(response, message, status, errorCode)
    }
  }

  /**
   * @swagger
   * /api/branch-offices/{id}:
   *   get:
   *     summary: Obtener sucursal por ID
   *     description: Solo si la sucursal pertenece a una unidad de negocio del scope del usuario autenticado; si no, 404.
   *     tags: [BranchOffices]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Detalle de la sucursal
   *       404:
   *         description: No encontrada
   */
  async show({ params, response, businessUnitScope }: HttpContext) {
    try {
      const branch = await BranchOfficeService.getById(params.id, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        branch,
        'Branch',
        'Sucursal obtenida correctamente'
      )
    } catch (error) {
      const { message, status, errorCode } = resolveBranchOfficeApiError(error, 404)
      return StandardResponseFormatter.error(response, message, status, errorCode)
    }
  }

  /**
   * @swagger
   * /api/branch-offices:
   *   post:
   *     summary: Crear sucursal
   *     tags: [BranchOffices]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - businessUnitId
   *               - branchOfficeName
   *             properties:
   *               businessUnitId:
   *                 type: integer
   *               branchOfficeName:
   *                 type: string
   *                 maxLength: 255
   *               branchOfficeLocationAddress:
   *                 type: string
   *                 nullable: true
   *                 description: GeoJSON como string (p. ej. FeatureCollection); mismo patrón que zonePolygon en zonas; LONGTEXT
   *               branchOfficeIdealTemplateCount:
   *                 type: integer
   *                 minimum: 0
   *                 nullable: true
   *               branchOfficeMinActiveEmployeesPerShift:
   *                 type: integer
   *                 minimum: 0
   *                 nullable: true
   *     responses:
   *       201:
   *         description: Creada correctamente
   *       400:
   *         description: Error de validación o unidad inexistente
   */
  async store({ request, response, businessUnitScope }: HttpContext) {
    try {
      const data = await request.validateUsing(createBranchOfficeValidator)
      const branch = await BranchOfficeService.create(data, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        branch,
        'Branch',
        'Sucursal creada correctamente',
        201
      )
    } catch (error) {
      const { message, status, errorCode } = resolveBranchOfficeApiError(error, 400)
      return StandardResponseFormatter.error(response, message, status, errorCode)
    }
  }

  /**
   * @swagger
   * /api/branch-offices/{id}:
   *   put:
   *     summary: Actualizar sucursal
   *     tags: [BranchOffices]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               businessUnitId:
   *                 type: integer
   *               branchOfficeName:
   *                 type: string
   *               branchOfficeLocationAddress:
   *                 type: string
   *                 nullable: true
   *                 description: GeoJSON serializado como string (LONGTEXT)
   *               branchOfficeIdealTemplateCount:
   *                 type: integer
   *                 nullable: true
   *               branchOfficeMinActiveEmployeesPerShift:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Actualizada correctamente
   *       404:
   *         description: No encontrada
   */
  async update({ params, request, response, businessUnitScope }: HttpContext) {
    try {
      const data = await request.validateUsing(updateBranchOfficeValidator)
      const branch = await BranchOfficeService.update(params.id, data, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        branch,
        'Branch',
        'Sucursal actualizada correctamente'
      )
    } catch (error) {
      const { message, status, errorCode } = resolveBranchOfficeApiError(error, 400)
      return StandardResponseFormatter.error(response, message, status, errorCode)
    }
  }

  /**
   * @swagger
   * /api/branch-offices/{id}:
   *   delete:
   *     summary: Eliminar sucursal (baja lógica)
   *     tags: [BranchOffices]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Eliminada correctamente
   *       404:
   *         description: No encontrada
   */
  async destroy({ params, response, businessUnitScope }: HttpContext) {
    try {
      await BranchOfficeService.delete(params.id, businessUnitScope)
      return StandardResponseFormatter.success(response, null, 'Branch', 'Sucursal eliminada correctamente')
    } catch (error) {
      const { message, status, errorCode } = resolveBranchOfficeApiError(error, 404)
      return StandardResponseFormatter.error(response, message, status, errorCode)
    }
  }
}
