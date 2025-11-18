import type { HttpContext } from '@adonisjs/core/http'
import EmployeeSuppliesResponseContractService from '#services/employee_supplies_response_contract_service'
import {
  uploadContractValidator,
  contractFilterValidator,
} from '#validators/employee_supplies_response_contract'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class EmployeeSuppliesResponseContractsController {
  /**
   * @swagger
   * /api/employee-supplies-response-contracts:
   *   post:
   *     summary: Upload contract file for multiple employee supplies
   *     tags: [Employee Supplies Response Contracts]
   *     description: Uploads a contract file to S3 and creates records for multiple employee supplies that share the same contract file. Optionally includes a digital signature file (PNG).
   *     consumes:
   *       - multipart/form-data
   *     parameters:
   *       - in: formData
   *         name: file
   *         type: file
   *         required: true
   *         description: The contract file to upload (PDF, DOC, DOCX, JPG, JPEG, PNG)
   *       - in: formData
   *         name: digitalSignature
   *         type: file
   *         required: false
   *         description: Optional digital signature file (PNG format, max 5MB)
   *       - in: formData
   *         name: employeeSupplyIds
   *         type: array
   *         items:
   *           type: integer
   *         required: true
   *         description: Array of employee supply IDs that will share this contract
   *     responses:
   *       201:
   *         description: Contract uploaded successfully
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
   *                   example: Contract Upload
   *                 message:
   *                   type: string
   *                   example: Contract uploaded successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     contractUuid:
   *                       type: string
   *                       description: Unique UUID for this contract
   *                     fileUrl:
   *                       type: string
   *                       description: URL of the uploaded contract file
   *                     digitalSignatureUrl:
   *                       type: string
   *                       nullable: true
   *                       description: URL of the uploaded digital signature file (if provided)
   *                     contracts:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/EmployeeSuppliesResponseContract'
   *       400:
   *         description: Validation error or employee supplies not found
   */
  async store({ request, response }: HttpContext) {
    try {
      // Get contract file from formData
      const file = request.file('file', {
        size: '10mb',
        extnames: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
      })

      if (!file) {
        return StandardResponseFormatter.error(
          response,
          'File is required',
          400
        )
      }

      if (!file.isValid) {
        return StandardResponseFormatter.error(
          response,
          file.errors[0]?.message || 'Invalid file',
          400
        )
      }

      // Get digital signature file from formData (optional)
      const digitalSignature = request.file('digitalSignature', {
        size: '5mb',
        extnames: ['png'],
      })

      if (digitalSignature && !digitalSignature.isValid) {
        return StandardResponseFormatter.error(
          response,
          digitalSignature.errors[0]?.message || 'Invalid digital signature file',
          400
        )
      }

      // Get employeeSupplyIds from formData
      // Can be sent as JSON string or as multiple values
      let employeeSupplyIds: number[] = []
      const employeeSupplyIdsInput = request.input('employeeSupplyIds')

      if (typeof employeeSupplyIdsInput === 'string') {
        try {
          employeeSupplyIds = JSON.parse(employeeSupplyIdsInput)
        } catch {
          // If not JSON, try as comma-separated string
          employeeSupplyIds = employeeSupplyIdsInput
            .split(',')
            .map((id: string) => Number.parseInt(id.trim()))
            .filter((id: number) => !Number.isNaN(id))
        }
      } else if (Array.isArray(employeeSupplyIdsInput)) {
        employeeSupplyIds = employeeSupplyIdsInput.map((id: any) => Number.parseInt(id)).filter((id: number) => !Number.isNaN(id))
      }

      if (!employeeSupplyIds || employeeSupplyIds.length === 0) {
        return StandardResponseFormatter.error(
          response,
          'employeeSupplyIds is required and must be a non-empty array',
          400
        )
      }

      // Validate employeeSupplyIds
      const validationResult = await uploadContractValidator.validate({
        employeeSupplyIds,
      })

      const result = await EmployeeSuppliesResponseContractService.uploadContract({
        file,
        digitalSignature: digitalSignature || undefined,
        employeeSupplyIds: validationResult.employeeSupplyIds,
      })

      return StandardResponseFormatter.success(
        response,
        result,
        'Contract Upload',
        'Contract uploaded successfully',
        201
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies-response-contracts:
   *   get:
   *     summary: Get all employee supplies response contracts
   *     tags: [Employee Supplies Response Contracts]
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
   *           maximum: 1000
   *         description: Number of items per page
   *       - in: query
   *         name: employeeSupplyId
   *         schema:
   *           type: integer
   *         description: Filter by employee supply ID
   *       - in: query
   *         name: contractUuid
   *         schema:
   *           type: string
   *         description: Filter by contract UUID (to get all contracts that share the same file)
   *     responses:
   *       200:
   *         description: List of contracts
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
   *                   example: Contracts
   *                 message:
   *                   type: string
   *                   example: Contracts retrieved successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/EmployeeSuppliesResponseContract'
   *                     meta:
   *                       type: object
   *                       properties:
   *                         current_page:
   *                           type: integer
   *                         per_page:
   *                           type: integer
   *                         total:
   *                           type: integer
   *                         last_page:
   *                           type: integer
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(contractFilterValidator)
      const contracts = await EmployeeSuppliesResponseContractService.getAll(filters)

      return StandardResponseFormatter.success(
        response,
        contracts,
        'Contracts',
        'Contracts retrieved successfully'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies-response-contracts/{id}:
   *   get:
   *     summary: Get contract by ID
   *     tags: [Employee Supplies Response Contracts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Contract ID
   *     responses:
   *       200:
   *         description: Contract details
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
   *                   example: Contract
   *                 message:
   *                   type: string
   *                   example: Contract retrieved successfully
   *                 data:
   *                   $ref: '#/components/schemas/EmployeeSuppliesResponseContract'
   *       404:
   *         description: Contract not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const contract = await EmployeeSuppliesResponseContractService.getById(params.id)
      return StandardResponseFormatter.success(
        response,
        contract,
        'Contract',
        'Contract retrieved successfully'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies-response-contracts/by-uuid/{uuid}:
   *   get:
   *     summary: Get all contracts by UUID
   *     tags: [Employee Supplies Response Contracts]
   *     description: Retrieves all contracts that share the same UUID (same contract file for multiple employee supplies)
   *     parameters:
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *         description: Contract UUID
   *     responses:
   *       200:
   *         description: Contracts with the same UUID
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
   *                   example: Contracts
   *                 message:
   *                   type: string
   *                   example: Contracts retrieved successfully
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/EmployeeSuppliesResponseContract'
   *       404:
   *         description: No contracts found with this UUID
   */
  async getByUuid({ params, response }: HttpContext) {
    try {
      const contracts = await EmployeeSuppliesResponseContractService.getByUuid(params.uuid)
      return StandardResponseFormatter.success(
        response,
        contracts,
        'Contracts',
        'Contracts retrieved successfully'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }

  /**
   * @swagger
   * /api/employee-supplies-response-contracts/{id}:
   *   delete:
   *     summary: Delete contract (soft delete)
   *     tags: [Employee Supplies Response Contracts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Contract ID
   *     responses:
   *       200:
   *         description: Contract deleted successfully
   *       404:
   *         description: Contract not found
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await EmployeeSuppliesResponseContractService.delete(params.id)
      return StandardResponseFormatter.success(
        response,
        null,
        'Contract',
        'Contract deleted successfully'
      )
    } catch (error) {
      return StandardResponseFormatter.error(response, error.message, 404)
    }
  }
}

