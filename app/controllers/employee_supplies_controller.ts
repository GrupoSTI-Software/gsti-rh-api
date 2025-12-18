import type { HttpContext } from '@adonisjs/core/http'
import EmployeeSupplieService from '#services/employee_supplie_service'
import {
  createEmployeeSupplieValidator,
  updateEmployeeSupplieValidator,
  employeeSupplieFilterValidator,
  employeeSupplieRetirementValidator
} from '#validators/employee_supplie'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class EmployeeSuppliesController {
  /**
   * @swagger
   * /api/employee-supplies:
   *   get:
   *     summary: Get all employee supplies
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *         description: Number of items per page
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search term
   *       - in: query
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: Filter by employee ID
   *       - in: query
   *         name: supplyId
   *         schema:
   *           type: integer
   *         description: Filter by supply ID
   *       - in: query
   *         name: employeeSupplyStatus
   *         schema:
   *           type: string
   *           enum: [active, retired, shipping]
   *         description: Filter by status
   *       - in: query
   *         name: supplyTypeId
   *         schema:
   *           type: integer
   *         description: Filter by supply type ID
   *     responses:
   *       200:
   *         description: List of employee supplies
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/EmployeeSupplie'
   *                 meta:
   *                   type: object
   *                   properties:
   *                     current_page:
   *                       type: integer
   *                     per_page:
   *                       type: integer
   *                     total:
   *                       type: integer
   *                     last_page:
   *                       type: integer
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(employeeSupplieFilterValidator)
      const employeeSupplies = await EmployeeSupplieService.getAll(filters)

      return StandardResponseFormatter.success(response, employeeSupplies, 'Employee Supplies', 'Employee supplies retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies/{id}:
   *   get:
   *     summary: Get employee supply by ID
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee supply ID
   *     responses:
   *       200:
   *         description: Employee supply details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/EmployeeSupplie'
   *       404:
   *         description: Employee supply not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const employeeSupply = await EmployeeSupplieService.getById(params.id)
      return StandardResponseFormatter.success(response, employeeSupply
      , 'Employee Supply', 'Employee supply retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies:
   *   post:
   *     summary: Create new employee supply assignment
   *     tags: [Employee Supplies]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
 *             required:
 *               - employeeId
 *               - supplyId
 *             properties:
 *               employeeId:
 *                 type: integer
 *                 description: Employee ID
 *               supplyId:
 *                 type: integer
 *                 description: Supply ID
 *               employeeSupplyExpirationDate:
 *                 type: string
 *                 format: date-time
 *                 description: Expiration date for the assignment (optional)
 *               employeeSupplyStatus:
 *                 type: string
 *                 enum: [active, retired, shipping]
 *                 description: Assignment status
 *               employeeSupplyAssignamentDate:
 *                 type: string
 *                 format: date-time
 *                 description: Assignament date for the assignment (optional, can be null to remove)
 *               employeeSupplyAdditions:
 *                 type: string
 *                 description: Additions for the assignment (optional, can be null to remove)
 *     responses:
 *       201:
   *         description: Employee supply assignment created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/EmployeeSupplie'
   *       400:
   *         description: Validation error or business rule violation
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createEmployeeSupplieValidator)
      const employeeSupply = await EmployeeSupplieService.create(data)

      return StandardResponseFormatter.success(response, employeeSupply
      , 'Employee Supply', 'Employee supply assignment created successfully', 201)
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies/{id}:
   *   put:
   *     summary: Update employee supply assignment
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee supply ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
 *             properties:
 *               employeeId:
 *                 type: integer
 *                 description: Employee ID
 *               supplyId:
 *                 type: integer
 *                 description: Supply ID
 *               employeeSupplyExpirationDate:
 *                 type: string
 *                 format: date-time
 *                 description: Expiration date for the assignment (optional, can be null to remove)
 *               employeeSupplyStatus:
 *                 type: string
 *                 enum: [active, retired, shipping]
 *                 description: Assignment status
 *               employeeSupplyAdditions:
 *                 type: string
 *                 description: Additions for the assignment (optional, can be null to remove)
 *               employeeSupplyAssignamentDate:
 *                 type: string
 *                 format: date-time
 *                 description: Assignament date for the assignment (optional, can be null to remove)
 *     responses:
 *       200:
   *         description: Employee supply assignment updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/EmployeeSupplie'
   *       400:
   *         description: Validation error or business rule violation
   *       404:
   *         description: Employee supply not found
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateEmployeeSupplieValidator)
      const body = request.body()

      if ('employeeSupplyExpirationDate' in body) {
        data.employeeSupplyExpirationDate =
          body.employeeSupplyExpirationDate === null ||
          body.employeeSupplyExpirationDate === ''
            ? null
            : body.employeeSupplyExpirationDate
      }

      const employeeSupply = await EmployeeSupplieService.update(params.id, data)

      return StandardResponseFormatter.success(response, employeeSupply
      , 'Employee Supply', 'Employee supply assignment updated successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies/{id}:
   *   delete:
   *     summary: Delete employee supply assignment
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee supply ID
   *     responses:
   *       200:
   *         description: Employee supply assignment deleted successfully
   *       404:
   *         description: Employee supply not found
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await EmployeeSupplieService.delete(params.id)
      return StandardResponseFormatter.success(response, null
      , 'Employee Supply', 'Employee supply assignment deleted successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies/{id}/retire:
   *   post:
   *     summary: Retire employee supply with reason
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee supply ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - employeeSupplyRetirementReason
   *             properties:
   *               employeeSupplyRetirementReason:
   *                 type: string
   *                 maxLength: 500
   *                 description: Reason for retirement
   *               employeeSupplyRetirementDate:
   *                 type: string
   *                 format: date-time
   *                 description: Retirement date (optional, defaults to now)
   *     responses:
   *       200:
   *         description: Employee supply retired successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/EmployeeSupplie'
   *       400:
   *         description: Validation error
   *       404:
   *         description: Employee supply not found
   */
  async retire({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(employeeSupplieRetirementValidator)
      const employeeSupply = await EmployeeSupplieService.retire(params.id, data)

      return StandardResponseFormatter.success(response, employeeSupply
      , 'Employee Supply', 'Employee supply retired successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 400)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies/{id}/with-relations:
   *   get:
   *     summary: Get employee supply with relations
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee supply ID
   *     responses:
   *       200:
   *         description: Employee supply with relations
   *       404:
   *         description: Employee supply not found
   */
  async getWithRelations({ params, response }: HttpContext) {
    try {
      const employeeSupply = await EmployeeSupplieService.getWithRelations(params.id)
      return StandardResponseFormatter.success(response, employeeSupply
      , 'Employee Supply', 'Employee supply with relations retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies/by-employee/{employeeId}:
   *   get:
   *     summary: Get employee supplies by employee
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee ID
   *     responses:
   *       200:
   *         description: Employee supplies for the employee
   *       404:
   *         description: Employee not found
   */
  async getByEmployee({ params, response }: HttpContext) {
    try {
      const employeeSupplies = await EmployeeSupplieService.getByEmployee(params.employeeId)
      return StandardResponseFormatter.success(response, employeeSupplies
      , 'Employee Supplies', 'Employee supplies retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies/active-by-employee/{employeeId}:
   *   get:
   *     summary: Get active employee supplies by employee
   *     tags: [Employee Supplies]
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Employee ID
   *     responses:
   *       200:
   *         description: Active employee supplies for the employee
   *       404:
   *         description: Employee not found
   */
  async getActiveByEmployee({ params, response }: HttpContext) {
    try {
      const employeeSupplies = await EmployeeSupplieService.getActiveByEmployee(params.employeeId)
      return StandardResponseFormatter.success(response, employeeSupplies
      , 'Data', 'Active employee supplies retrieved successfully')
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message
      , 404)
    }
  }
}
