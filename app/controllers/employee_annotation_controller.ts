import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import EmployeeAnnotationService from '#services/employee_annotation_service'
import EmployeeAnnotation from '#models/employee_annotation'
import {
  createEmployeeAnnotationValidator,
  updateEmployeeAnnotationValidator,
} from '#validators/employee_annotation'

export default class EmployeeAnnotationController {
  /**
   * @swagger
   * /api/employee-annotations:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Annotations
   *     summary: get all employee annotations
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
      const employeeAnnotations = await EmployeeAnnotation.query()
        .whereNull('employee_annotation_deleted_at')
        .preload('employee', (query) => {
          query.preload('person')
        })
        .preload('user', (query) => {
          query.preload('person')
        })
        .orderBy('employee_annotation_active', 'desc')
        .orderBy('employee_annotation_created_at', 'desc')
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources were found successfully',
        data: employeeAnnotations,
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
   * /api/employee-annotations:
   *   post:
   *     summary: Create an employee annotation
   *     tags:
   *       - Employee Annotations
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
   *               employeeAnnotationContent:
   *                 type: string
   *                 description: Annotation content
   *                 required: true
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
  async store({ auth, request, response }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        response.status(401)
        return {
          type: 'error',
          title: 'Unauthorized',
          message: 'User must be authenticated',
          data: null,
        }
      }

      const employeeAnnotationService = new EmployeeAnnotationService()
      let inputs = request.all()
      inputs = employeeAnnotationService.sanitizeInput(inputs)
      await request.validateUsing(createEmployeeAnnotationValidator)

      const employeeAnnotation = {
        employeeId: inputs['employeeId'],
        employeeAnnotationContent: inputs['employeeAnnotationContent'],
      } as EmployeeAnnotation

      const isValidInfo = await employeeAnnotationService.verifyInfo(employeeAnnotation)
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

      const newEmployeeAnnotation = await employeeAnnotationService.create(
        employeeAnnotation,
        user.userId
      )
      response.status(201)
      return {
        type: 'success',
        title: 'Employee annotation',
        message: 'The employee annotation was created successfully',
        data: { employeeAnnotation: newEmployeeAnnotation },
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
   * /api/employee-annotations/{employeeAnnotationId}:
   *   put:
   *     summary: Update an employee annotation
   *     tags:
   *       - Employee Annotations
   *     parameters:
   *       - in: path
   *         name: employeeAnnotationId
   *         schema:
   *           type: number
   *         description: Employee annotation id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeAnnotationContent:
   *                 type: string
   *                 description: Annotation content
   *                 required: false
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       '403':
   *         description: Forbidden - Only the original creator can update
   *       default:
   *         description: Unexpected error
   */
  @inject()
  async update({ auth, request, response }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        response.status(401)
        return {
          type: 'error',
          title: 'Unauthorized',
          message: 'User must be authenticated',
          data: null,
        }
      }

      const employeeAnnotationService = new EmployeeAnnotationService()
      let inputs = request.all()
      inputs = employeeAnnotationService.sanitizeInput(inputs)
      await request.validateUsing(updateEmployeeAnnotationValidator)

      const employeeAnnotationId = request.param('employeeAnnotationId')
      if (!employeeAnnotationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee annotation Id was not found',
          message: 'Missing data to process',
          data: { employeeAnnotationId },
        }
      }

      const currentEmployeeAnnotation = await EmployeeAnnotation.query()
        .whereNull('employee_annotation_deleted_at')
        .where('employee_annotation_id', employeeAnnotationId)
        .first()

      if (!currentEmployeeAnnotation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee annotation was not found',
          message: 'The employee annotation was not found with the entered ID',
          data: { employeeAnnotationId },
        }
      }

      // Verificar que solo el usuario que creó la anotación puede modificarla
      if (currentEmployeeAnnotation.userId !== user.userId) {
        response.status(403)
        return {
          type: 'error',
          title: 'Forbidden',
          message: 'Only the original creator can update this annotation',
          data: { employeeAnnotationId },
        }
      }

      const employeeAnnotation = {
        employeeAnnotationId: employeeAnnotationId,
        employeeAnnotationContent:
          inputs['employeeAnnotationContent'] ||
          currentEmployeeAnnotation.employeeAnnotationContent,
      } as EmployeeAnnotation

      const isValidInfo = await employeeAnnotationService.verifyInfo(currentEmployeeAnnotation)
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

      const updateEmployeeAnnotation = await employeeAnnotationService.update(
        currentEmployeeAnnotation,
        employeeAnnotation
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Employee annotation',
        message: 'The employee annotation was updated successfully',
        data: { employeeAnnotation: updateEmployeeAnnotation },
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
   * /api/employee-annotations/{employeeAnnotationId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Annotations
   *     summary: delete employee annotation (deactivate)
   *     parameters:
   *       - in: path
   *         name: employeeAnnotationId
   *         schema:
   *           type: number
   *         description: Employee annotation id
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
      const employeeAnnotationId = request.param('employeeAnnotationId')
      if (!employeeAnnotationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee annotation Id was not found',
          message: 'Missing data to process',
          data: { employeeAnnotationId },
        }
      }

      const currentEmployeeAnnotation = await EmployeeAnnotation.query()
        .whereNull('employee_annotation_deleted_at')
        .where('employee_annotation_id', employeeAnnotationId)
        .first()

      if (!currentEmployeeAnnotation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee annotation was not found',
          message: 'The employee annotation was not found with the entered ID',
          data: { employeeAnnotationId },
        }
      }

      const employeeAnnotationService = new EmployeeAnnotationService()
      const deleteEmployeeAnnotation = await employeeAnnotationService.delete(
        currentEmployeeAnnotation
      )
      if (deleteEmployeeAnnotation) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee annotation',
          message: 'The employee annotation was deactivated successfully',
          data: { employeeAnnotation: deleteEmployeeAnnotation },
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
   * /api/employee-annotations/{employeeAnnotationId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Annotations
   *     summary: get employee annotation by id
   *     parameters:
   *       - in: path
   *         name: employeeAnnotationId
   *         schema:
   *           type: number
   *         description: Employee annotation id
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
      const employeeAnnotationId = request.param('employeeAnnotationId')
      if (!employeeAnnotationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee annotation Id was not found',
          message: 'Missing data to process',
          data: { employeeAnnotationId },
        }
      }

      const employeeAnnotationService = new EmployeeAnnotationService()
      const showEmployeeAnnotation = await employeeAnnotationService.show(employeeAnnotationId)
      if (!showEmployeeAnnotation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee annotation was not found',
          message: 'The employee annotation was not found with the entered ID',
          data: { employeeAnnotationId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee annotation',
          message: 'The employee annotation was found successfully',
          data: { showEmployeeAnnotation: showEmployeeAnnotation },
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
   * /api/employee-annotations/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Annotations
   *     summary: get employee annotations by employee id (active first, then history)
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

      const employeeAnnotationService = new EmployeeAnnotationService()
      const annotations = await employeeAnnotationService.getByEmployee(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employee annotations',
        message: 'The employee annotations were found successfully',
        data: {
          active: annotations.active,
          history: annotations.history,
        },
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
