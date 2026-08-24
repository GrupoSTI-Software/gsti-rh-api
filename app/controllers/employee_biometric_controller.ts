import { HttpContext } from '@adonisjs/core/http'
import EmployeeBiometricService from '#services/employee_biometric_service'
import { createEmployeeBiometricValidator, updateEmployeeBiometricValidator } from '#validators/employee_biometric'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'

export default class EmployeeBiometricController {
  /**
   * @swagger
   * /api/employees/{employeeId}/biometrics:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeBiometrics
   *     summary: get employee biometric data
   *     description: |
   *       Campo employeeBiometricData: Puede llegar enmascarado según el permiso de lectura de su categoría.
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
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }

      const employeeBiometricService = new EmployeeBiometricService(i18n)
      const employeeBiometric = await employeeBiometricService.findByEmployeeId(employeeId)

      if (!employeeBiometric) {
        response.status(404)
        return {
          type: 'warning',
          title: t('biometric_record_not_found'),
          message: t('biometric_record_not_found_for_employee'),
          data: { employeeId },
        }
      }

      const parsed = employeeBiometricService.parseBiometricData(employeeBiometric.employeeBiometricData)

      response.status(200)
      return {
        type: 'success',
        title: t('employee_biometric'),
        message: t('resource_was_found_successfully'),
        data: {
          employeeBiometric: {
            employeeBiometricId: employeeBiometric.employeeBiometricId,
            employeeId: employeeBiometric.employeeId,
            fingers: parsed.fingers,
            face: parsed.face,
            employeeBiometricCreatedAt: employeeBiometric.employeeBiometricCreatedAt,
            employeeBiometricUpdatedAt: employeeBiometric.employeeBiometricUpdatedAt,
          },
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometrics/fingers:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeBiometrics
   *     summary: get registered fingers for employee
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
   *       default:
   *         description: Unexpected error
   */
  async getFingers({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }

      const employeeBiometricService = new EmployeeBiometricService(i18n)
      const fingers = await employeeBiometricService.getFingers(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: t('employee_biometric'),
        message: t('resource_was_found_successfully'),
        data: { fingers },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometrics/face:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeBiometrics
   *     summary: get face registration status for employee
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
   *       default:
   *         description: Unexpected error
   */
  async getFaceStatus({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }

      const employeeBiometricService = new EmployeeBiometricService(i18n)
      const face = await employeeBiometricService.getFaceStatus(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: t('employee_biometric'),
        message: t('resource_was_found_successfully'),
        data: { face },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometrics:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeBiometrics
   *     summary: create employee biometric record
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               Fingers:
   *                 type: array
   *                 items:
   *                   type: number
   *                 description: Array of finger IDs (0-9)
   *                 example: [1, 4, 7]
   *               Face:
   *                 type: boolean
   *                 description: Face ID registration status
   *                 example: false
   *     responses:
   *       '201':
   *         description: Resource created successfully
   *       default:
   *         description: Unexpected error
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }

      const fingers = request.input('Fingers', [])
      const face = request.input('Face', false)

      await request.validateUsing(createEmployeeBiometricValidator, {
        data: {
          employeeId,
          fingers,
          face,
        },
      })

      const employeeBiometricService = new EmployeeBiometricService(i18n)
      const employeeBiometric = await employeeBiometricService.create(employeeId, fingers, face)

      const parsed = employeeBiometricService.parseBiometricData(employeeBiometric.employeeBiometricData)

      response.status(201)
      return {
        type: 'success',
        title: t('employee_biometric'),
        message: t('resource_was_created_successfully'),
        data: {
          employeeBiometric: {
            employeeBiometricId: employeeBiometric.employeeBiometricId,
            employeeId: employeeBiometric.employeeId,
            fingers: parsed.fingers,
            face: parsed.face,
          },
        },
      }
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometrics/fingers:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeBiometrics
   *     summary: update registered fingers for employee
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - Fingers
   *             properties:
   *               Fingers:
   *                 type: array
   *                 items:
   *                   type: number
   *                 description: Array of finger IDs (0-9)
   *                 example: [1, 4, 7]
   *     responses:
   *       '200':
   *         description: Resource updated successfully
   *       default:
   *         description: Unexpected error
   */
  async updateFingers(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }

      const fingers = request.input('Fingers', [])

      await request.validateUsing(updateEmployeeBiometricValidator, {
        data: {
          fingers,
        },
      })

      const employeeBiometricService = new EmployeeBiometricService(i18n)
      const employeeBiometric = await employeeBiometricService.updateFingers(employeeId, fingers)

      const parsed = employeeBiometricService.parseBiometricData(employeeBiometric.employeeBiometricData)

      response.status(200)
      return {
        type: 'success',
        title: t('employee_biometric'),
        message: t('resource_was_updated_successfully'),
        data: {
          employeeBiometric: {
            employeeBiometricId: employeeBiometric.employeeBiometricId,
            employeeId: employeeBiometric.employeeId,
            fingers: parsed.fingers,
            face: parsed.face,
          },
        },
      }
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometrics/face:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeBiometrics
   *     summary: update face registration status for employee
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - Face
   *             properties:
   *               Face:
   *                 type: boolean
   *                 description: Face ID registration status
   *                 example: true
   *     responses:
   *       '200':
   *         description: Resource updated successfully
   *       default:
   *         description: Unexpected error
   */
  async updateFaceStatus(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }

      const face = request.input('Face', false)

      await request.validateUsing(updateEmployeeBiometricValidator, {
        data: {
          face,
        },
      })

      const employeeBiometricService = new EmployeeBiometricService(i18n)
      const employeeBiometric = await employeeBiometricService.updateFaceStatus(employeeId, face)

      const parsed = employeeBiometricService.parseBiometricData(employeeBiometric.employeeBiometricData)

      response.status(200)
      return {
        type: 'success',
        title: t('employee_biometric'),
        message: t('resource_was_updated_successfully'),
        data: {
          employeeBiometric: {
            employeeBiometricId: employeeBiometric.employeeBiometricId,
            employeeId: employeeBiometric.employeeId,
            fingers: parsed.fingers,
            face: parsed.face,
          },
        },
      }
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometrics:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeBiometrics
   *     summary: update employee biometric record
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               Fingers:
   *                 type: array
   *                 items:
   *                   type: number
   *                 description: Array of finger IDs (0-9)
   *                 example: [1, 4, 7]
   *               Face:
   *                 type: boolean
   *                 description: Face ID registration status
   *                 example: false
   *     responses:
   *       '200':
   *         description: Resource updated successfully
   *       default:
   *         description: Unexpected error
   */
  async update(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }

      const fingers = request.input('Fingers')
      const face = request.input('Face')

      await request.validateUsing(updateEmployeeBiometricValidator, {
        data: {
          fingers: fingers !== undefined ? fingers : null,
          face: face !== undefined ? face : null,
        },
      })

      const employeeBiometricService = new EmployeeBiometricService(i18n)
      const employeeBiometric = await employeeBiometricService.update(
        employeeId,
        fingers !== undefined ? fingers : null,
        face !== undefined ? face : null
      )

      const parsed = employeeBiometricService.parseBiometricData(employeeBiometric.employeeBiometricData)

      response.status(200)
      return {
        type: 'success',
        title: t('employee_biometric'),
        message: t('resource_was_updated_successfully'),
        data: {
          employeeBiometric: {
            employeeBiometricId: employeeBiometric.employeeBiometricId,
            employeeId: employeeBiometric.employeeId,
            fingers: parsed.fingers,
            face: parsed.face,
          },
        },
      }
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }
}
