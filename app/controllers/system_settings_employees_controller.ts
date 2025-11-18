import { HttpContext } from '@adonisjs/core/http'
import SystemSettingsEmployeeService from '#services/system_settings_employee_service'
import { createSystemSettingEmployeeValidator } from '#validators/system_setting_employee'

export default class SystemSettingsEmployeesController {
  /**
   * @swagger
   * /api/system-settings-employees:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings Employees
   *     summary: Create employee limit for system configuration
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingId:
   *                 type: number
   *                 description: System configuration ID
   *                 required: true
   *               employeeLimit:
   *                 type: number
   *                 description: Employee limit (optional)
   *                 required: false
   *     responses:
   *       '201':
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
   *                   description: Processed object
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSystemSettingEmployeeValidator)
      const systemSettingsEmployeeService = new SystemSettingsEmployeeService()

      const newRecord = await systemSettingsEmployeeService.create(
        data.systemSettingId,
        data.employeeLimit
      )

      response.status(201)
      return {
        type: 'success',
        title: 'Configuración de empleados',
        message: 'El límite de empleados fue creado exitosamente',
        data: { systemSettingsEmployee: newRecord },
      }
    } catch (error) {
      const isValidatorError = error && error.code === 'E_VALIDATION_ERROR'
      const isNotFound = typeof error?.message === 'string' && error.message.toLowerCase().includes('no fue encontrada')

      if (isValidatorError) {
        response.status(422)
      } else if (isNotFound) {
        response.status(404)
      } else {
        response.status(500)
      }
      return {
        type: 'error',
        title: 'Error del servidor',
        message: isValidatorError
          ? 'Los parámetros ingresados son inválidos o faltan datos esenciales'
          : isNotFound
          ? 'El recurso solicitado no fue encontrado'
          : 'Ha ocurrido un error inesperado en el servidor',
        error: isValidatorError ? error.messages?.[0]?.message : error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-settings-employees/{systemSettingId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings Employees
   *     summary: Delete employee limit for system configuration
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System configuration ID
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async delete({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')

      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos para procesar',
          message: 'El ID de la configuración del sistema no fue encontrado',
          data: { systemSettingId },
        }
      }

      const systemSettingsEmployeeService = new SystemSettingsEmployeeService()
      const deletedRecord = await systemSettingsEmployeeService.delete(systemSettingId)

      response.status(200)
      return {
        type: 'success',
        title: 'Configuración de empleados',
        message: 'El límite de empleados fue eliminado exitosamente',
        data: { systemSettingsEmployee: deletedRecord },
      }
    } catch (error) {
      const isValidatorError = error && error.code === 'E_VALIDATION_ERROR'
      const isNotFound = typeof error?.message === 'string' && error.message.toLowerCase().includes('no fue encontrada')

      if (isValidatorError) {
        response.status(422)
      } else if (isNotFound) {
        response.status(404)
      } else {
        response.status(500)
      }
      return {
        type: 'error',
        title: 'Error del servidor',
        message: isValidatorError
          ? 'Los parámetros ingresados son inválidos o faltan datos esenciales'
          : isNotFound
          ? 'El recurso solicitado no fue encontrado'
          : 'Ha ocurrido un error inesperado en el servidor',
        error: isValidatorError ? error.messages?.[0]?.message : error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-settings-employees/{systemSettingId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings Employees
   *     summary: Get employee limit records for system configuration
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System configuration ID
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of records
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async index({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')

      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos para procesar',
          message: 'El ID de la configuración del sistema no fue encontrado',
          data: { systemSettingId },
        }
      }

      const systemSettingsEmployeeService = new SystemSettingsEmployeeService()
      const records = await systemSettingsEmployeeService.read(systemSettingId)

      response.status(200)
      return {
        type: 'success',
        title: 'Configuración de empleados',
        message: 'Los registros de límite de empleados fueron encontrados exitosamente',
        data: { systemSettingsEmployees: records },
      }
    } catch (error) {
      const isValidatorError = error && error.code === 'E_VALIDATION_ERROR'
      const isNotFound = typeof error?.message === 'string' && error.message.toLowerCase().includes('no fue encontrada')

      if (isValidatorError) {
        response.status(422)
      } else if (isNotFound) {
        response.status(404)
      } else {
        response.status(500)
      }
      return {
        type: 'error',
        title: 'Error del servidor',
        message: isValidatorError
          ? 'Los parámetros ingresados son inválidos o faltan datos esenciales'
          : isNotFound
          ? 'El recurso solicitado no fue encontrado'
          : 'Ha ocurrido un error inesperado en el servidor',
        error: isValidatorError ? error.messages?.[0]?.message : error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-settings-employees/{systemSettingId}/active:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings Employees
   *     summary: Get active employee limit record for system configuration
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System configuration ID
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Active record
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async getActive({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')

      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos para procesar',
          message: 'El ID de la configuración del sistema no fue encontrado',
          data: { systemSettingId },
        }
      }

      const systemSettingsEmployeeService = new SystemSettingsEmployeeService()
      const activeRecord = await systemSettingsEmployeeService.getActive(systemSettingId)

      if (!activeRecord) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Registro no encontrado',
          message: 'No se encontró un registro activo de límite de empleados',
          data: { systemSettingId },
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Configuración de empleados',
        message: 'El registro activo de límite de empleados fue encontrado exitosamente',
        data: { systemSettingsEmployee: activeRecord },
      }
    } catch (error) {
      const isValidatorError = error && error.code === 'E_VALIDATION_ERROR'
      const isNotFound = typeof error?.message === 'string' && error.message.toLowerCase().includes('no fue encontrada')

      if (isValidatorError) {
        response.status(422)
      } else if (isNotFound) {
        response.status(404)
      } else {
        response.status(500)
      }
      return {
        type: 'error',
        title: 'Error del servidor',
        message: isValidatorError
          ? 'Los parámetros ingresados son inválidos o faltan datos esenciales'
          : isNotFound
          ? 'El recurso solicitado no fue encontrado'
          : 'Ha ocurrido un error inesperado en el servidor',
        error: isValidatorError ? error.messages?.[0]?.message : error.message,
      }
    }
  }
}
