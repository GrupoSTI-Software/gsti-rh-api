import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import EmployeeMedicalConditionService from '#services/employee_medical_condition_service'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import {
  createEmployeeMedicalConditionValidator,
  updateEmployeeMedicalConditionValidator,
} from '#validators/employee_medical_condition'

export default class EmployeeMedicalConditionController {
  /**
   * @swagger
   * /api/employee-medical-conditions:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Medical Conditions
   *     summary: get all employee medical conditions
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *       default:
   *         description: Unexpected error
   */
  async index({ response }: HttpContext) {
    try {
      const employeeMedicalConditions = await EmployeeMedicalCondition.query()
        .whereNull('employee_medical_condition_deleted_at')
        .preload('employee', (query) => {
          query.preload('person')
        })
        .preload('medicalConditionType', (query) => {
          query.preload('properties')
        })
        .preload('propertyValues', (query) => {
          query.preload('medicalConditionTypeProperty')
        })
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources were found successfully',
        data: employeeMedicalConditions,
      })
    } catch (error) {
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: error.message,
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employee-medical-conditions:
   *   post:
   *     summary: Create an employee medical condition
   *     tags:
   *       - Employee Medical Conditions
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee ID
   *                 required: true
   *               medicalConditionTypeId:
   *                 type: number
   *                 description: Medical condition type ID
   *                 required: true
   *               employeeMedicalConditionDiagnosis:
   *                 type: string
   *                 description: Medical condition diagnosis
   *                 required: true
   *               employeeMedicalConditionTreatment:
   *                 type: string
   *                 description: Medical condition treatment
   *                 required: false
   *               employeeMedicalConditionNotes:
   *                 type: string
   *                 description: Medical condition notes
   *                 required: false
   *               employeeMedicalConditionActive:
   *                 type: number
   *                 description: Medical condition status
   *                 required: false
   *                 default: 1
   *               propertyValues:
   *                 type: array
   *                 description: Property values for the medical condition
   *                 required: false
   *                 items:
   *                   type: object
   *                   properties:
   *                     medicalConditionTypePropertyId:
   *                       type: number
   *                       description: Medical condition type property ID
   *                     medicalConditionTypePropertyValue:
   *                       type: string
   *                       description: Property value
   *                     medicalConditionTypePropertyValueActive:
   *                       type: number
   *                       description: Property value status
   *                       default: 1
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  @inject()
  async store({ request, response }: HttpContext) {
    try {
      const employeeMedicalConditionService = new EmployeeMedicalConditionService()
      let inputs = request.all()
      inputs = employeeMedicalConditionService.sanitizeInput(inputs)
      await request.validateUsing(createEmployeeMedicalConditionValidator)

      const employeeMedicalCondition = {
        employeeId: inputs['employeeId'],
        medicalConditionTypeId: inputs['medicalConditionTypeId'],
        employeeMedicalConditionDiagnosis: inputs['employeeMedicalConditionDiagnosis'],
        employeeMedicalConditionTreatment: inputs['employeeMedicalConditionTreatment'],
        employeeMedicalConditionNotes: inputs['employeeMedicalConditionNotes'],
        employeeMedicalConditionActive: inputs['employeeMedicalConditionActive'] || 1,
      } as EmployeeMedicalCondition

      const propertyValues = inputs['propertyValues'] || []

      const isValidInfo = await employeeMedicalConditionService.verifyInfo(employeeMedicalCondition)
      if (isValidInfo.status !== 200) {
        response.status(isValidInfo.status)
        return {
          status: isValidInfo.status,
          type: isValidInfo.type,
          title: isValidInfo.title,
          message: isValidInfo.message,
          data: isValidInfo.data,
        }
      }

      const newEmployeeMedicalCondition = await employeeMedicalConditionService.create(employeeMedicalCondition, propertyValues)
      response.status(201)
      return {
        type: 'success',
        title: 'Employee medical condition',
        message: 'The employee medical condition was created successfully',
        data: { employeeMedicalCondition: newEmployeeMedicalCondition },
      }
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'validation_error',
          title: 'Validation error',
          message: 'The provided data is invalid',
          errors: error.messages,
        }
      }
      const messageError = error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employee-medical-conditions/{employeeMedicalConditionId}:
   *   put:
   *     summary: Update an employee medical condition
   *     tags:
   *       - Employee Medical Conditions
   *     parameters:
   *       - in: path
   *         name: employeeMedicalConditionId
   *         schema:
   *           type: number
   *         description: Employee medical condition id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee ID
   *                 required: false
   *               medicalConditionTypeId:
   *                 type: number
   *                 description: Medical condition type ID
   *                 required: false
   *               employeeMedicalConditionDiagnosis:
   *                 type: string
   *                 description: Medical condition diagnosis
   *                 required: false
   *               employeeMedicalConditionTreatment:
   *                 type: string
   *                 description: Medical condition treatment
   *                 required: false
   *               employeeMedicalConditionNotes:
   *                 type: string
   *                 description: Medical condition notes
   *                 required: false
   *               employeeMedicalConditionActive:
   *                 type: number
   *                 description: Medical condition status
   *                 required: false
   *               propertyValues:
   *                 type: array
   *                 description: Property values for the medical condition
   *                 required: false
   *                 items:
   *                   type: object
   *                   properties:
   *                     medicalConditionTypePropertyId:
   *                       type: number
   *                       description: Medical condition type property ID
   *                     medicalConditionTypePropertyValue:
   *                       type: string
   *                       description: Property value
   *                     medicalConditionTypePropertyValueActive:
   *                       type: number
   *                       description: Property value status
   *                       default: 1
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  @inject()
  async update({ request, response }: HttpContext) {
    try {
      const employeeMedicalConditionService = new EmployeeMedicalConditionService()
      let inputs = request.all()
      inputs = employeeMedicalConditionService.sanitizeInput(inputs)
      await request.validateUsing(updateEmployeeMedicalConditionValidator)

      const employeeMedicalConditionId = request.param('employeeMedicalConditionId')
      if (!employeeMedicalConditionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee medical condition Id was not found',
          message: 'Missing data to process',
          data: { employeeMedicalConditionId },
        }
      }

      const currentEmployeeMedicalCondition = await EmployeeMedicalCondition.query()
        .whereNull('employee_medical_condition_deleted_at')
        .where('employee_medical_condition_id', employeeMedicalConditionId)
        .first()

      if (!currentEmployeeMedicalCondition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee medical condition was not found',
          message: 'The employee medical condition was not found with the entered ID',
          data: { employeeMedicalConditionId },
        }
      }

      const employeeMedicalCondition = {
        employeeMedicalConditionId: employeeMedicalConditionId,
        employeeId: inputs['employeeId'] || currentEmployeeMedicalCondition.employeeId,
        medicalConditionTypeId: inputs['medicalConditionTypeId'] || currentEmployeeMedicalCondition.medicalConditionTypeId,
        employeeMedicalConditionDiagnosis: inputs['employeeMedicalConditionDiagnosis'] || currentEmployeeMedicalCondition.employeeMedicalConditionDiagnosis,
        employeeMedicalConditionTreatment: inputs['employeeMedicalConditionTreatment'] || currentEmployeeMedicalCondition.employeeMedicalConditionTreatment,
        employeeMedicalConditionNotes: inputs['employeeMedicalConditionNotes'] || currentEmployeeMedicalCondition.employeeMedicalConditionNotes,
        employeeMedicalConditionActive: inputs['employeeMedicalConditionActive'] !== undefined ? inputs['employeeMedicalConditionActive'] : currentEmployeeMedicalCondition.employeeMedicalConditionActive,
      } as EmployeeMedicalCondition

      const propertyValues = inputs['propertyValues'] || []

      const isValidInfo = await employeeMedicalConditionService.verifyInfo(employeeMedicalCondition)
      if (isValidInfo.status !== 200) {
        response.status(isValidInfo.status)
        return {
          status: isValidInfo.status,
          type: isValidInfo.type,
          title: isValidInfo.title,
          message: isValidInfo.message,
          data: isValidInfo.data,
        }
      }

      const updateEmployeeMedicalCondition = await employeeMedicalConditionService.update(
        currentEmployeeMedicalCondition,
        employeeMedicalCondition,
        propertyValues
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Employee medical condition',
        message: 'The employee medical condition was updated successfully',
        data: { employeeMedicalCondition: updateEmployeeMedicalCondition },
      }
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'validation_error',
          title: 'Validation error',
          message: 'The provided data is invalid',
          errors: error.messages,
        }
      }
      const messageError = error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employee-medical-conditions/{employeeMedicalConditionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Medical Conditions
   *     summary: delete employee medical condition
   *     parameters:
   *       - in: path
   *         name: employeeMedicalConditionId
   *         schema:
   *           type: number
   *         description: Employee medical condition id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  async delete({ request, response }: HttpContext) {
    try {
      const employeeMedicalConditionId = request.param('employeeMedicalConditionId')
      if (!employeeMedicalConditionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee medical condition Id was not found',
          message: 'Missing data to process',
          data: { employeeMedicalConditionId },
        }
      }

      const currentEmployeeMedicalCondition = await EmployeeMedicalCondition.query()
        .whereNull('employee_medical_condition_deleted_at')
        .where('employee_medical_condition_id', employeeMedicalConditionId)
        .first()

      if (!currentEmployeeMedicalCondition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee medical condition was not found',
          message: 'The employee medical condition was not found with the entered ID',
          data: { employeeMedicalConditionId },
        }
      }

      const employeeMedicalConditionService = new EmployeeMedicalConditionService()
      const deleteEmployeeMedicalCondition = await employeeMedicalConditionService.delete(currentEmployeeMedicalCondition)
      if (deleteEmployeeMedicalCondition) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee medical condition',
          message: 'The employee medical condition was deleted successfully',
          data: { employeeMedicalCondition: deleteEmployeeMedicalCondition },
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
   * /api/employee-medical-conditions/{employeeMedicalConditionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Medical Conditions
   *     summary: get employee medical condition by id
   *     parameters:
   *       - in: path
   *         name: employeeMedicalConditionId
   *         schema:
   *           type: number
   *         description: Employee medical condition id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response }: HttpContext) {
    try {
      const employeeMedicalConditionId = request.param('employeeMedicalConditionId')
      if (!employeeMedicalConditionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee medical condition Id was not found',
          message: 'Missing data to process',
          data: { employeeMedicalConditionId },
        }
      }

      const employeeMedicalConditionService = new EmployeeMedicalConditionService()
      const showEmployeeMedicalCondition = await employeeMedicalConditionService.show(employeeMedicalConditionId)
      if (!showEmployeeMedicalCondition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee medical condition was not found',
          message: 'The employee medical condition was not found with the entered ID',
          data: { employeeMedicalConditionId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee medical condition',
          message: 'The employee medical condition was found successfully',
          data: { showEmployeeMedicalCondition: showEmployeeMedicalCondition },
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
   * /api/employee-medical-conditions/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Medical Conditions
   *     summary: get employee medical conditions by employee id
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  async getByEmployee({ request, response }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }

      const employeeMedicalConditions = await EmployeeMedicalCondition.query()
        .whereNull('employee_medical_condition_deleted_at')
        .where('employee_id', employeeId)
        .preload('employee', (query) => {
          query.preload('person')
        })
        .preload('medicalConditionType', (query) => {
          query.preload('properties')
        })
        .preload('propertyValues', (query) => {
          query.preload('medicalConditionTypeProperty')
        })

      response.status(200)
      return {
        type: 'success',
        title: 'Employee medical conditions',
        message: 'The employee medical conditions were found successfully',
        data: { employeeMedicalConditions: employeeMedicalConditions },
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
}
