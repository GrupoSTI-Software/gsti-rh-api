import { HttpContext } from '@adonisjs/core/http'
import EmployeeDevice from '#models/employee_device'
import EmployeeDeviceService from '#services/employee_device_service'

export default class EmployeeDeviceController {
  /**
   * @swagger
   * /api/employee-devices:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Devices
   *     summary: get all employee devices
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Employee id to filter devices
   *         schema:
   *           type: integer
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
  async index({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.input('employeeId')
      const employeeDeviceService = new EmployeeDeviceService(i18n)
      const employeeDevices = await employeeDeviceService.index(employeeId)
      response.status(200)
      return {
        type: 'success',
        title: 'Employee Devices',
        message: 'The employee devices were found successfully',
        data: { employeeDevices },
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
   * /api/employee-devices/{employeeDeviceId}/status:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Devices
   *     summary: update employee device status
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeDeviceId
   *         schema:
   *           type: number
   *         description: Employee device id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeDeviceActive:
   *                 type: number
   *                 description: Employee device active status (1 = active, 0 = inactive)
   *                 required: true
   *                 default: 1
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
  async updateStatus({ request, response, i18n }: HttpContext) {
    try {
      const employeeDeviceId = request.param('employeeDeviceId')
      const employeeDeviceActive = request.input('employeeDeviceActive')

      if (!employeeDeviceId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee device Id was not found',
          message: 'Missing data to process',
          data: { employeeDeviceId },
        }
      }

      if (employeeDeviceActive === undefined || employeeDeviceActive === null) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee device active status was not found',
          data: { employeeDeviceId },
        }
      }

      const currentEmployeeDevice = await EmployeeDevice.query()
        .whereNull('employee_device_deleted_at')
        .where('employee_device_id', employeeDeviceId)
        .first()

      if (!currentEmployeeDevice) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee device was not found',
          message: 'The employee device was not found with the entered ID',
          data: { employeeDeviceId },
        }
      }

      const employeeDeviceService = new EmployeeDeviceService(i18n)
      const activeStatus =
        employeeDeviceActive === 1 || employeeDeviceActive === '1' ? 1 : 0
      const updateEmployeeDevice = await employeeDeviceService.updateStatus(
        currentEmployeeDevice,
        activeStatus
      )

      if (updateEmployeeDevice) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee Devices',
          message: 'The employee device status was updated successfully',
          data: { employeeDevice: updateEmployeeDevice },
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
   * /api/employee-devices/{employeeDeviceId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Devices
   *     summary: delete employee device (soft delete)
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeDeviceId
   *         schema:
   *           type: number
   *         description: Employee device id
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
  /**
   * @swagger
   * /api/employee-devices/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Devices
   *     summary: get employee devices by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: Employee id
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
  async getByEmployee({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeDeviceService = new EmployeeDeviceService(i18n)
      const employeeDevices = await employeeDeviceService.index(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employee Devices',
        message: 'The employee devices were found successfully',
        data: { employeeDevices },
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

  async delete({ request, response, i18n }: HttpContext) {
    try {
      const employeeDeviceId = request.param('employeeDeviceId')

      if (!employeeDeviceId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee device Id was not found',
          message: 'Missing data to process',
          data: { employeeDeviceId },
        }
      }

      const currentEmployeeDevice = await EmployeeDevice.query()
        .whereNull('employee_device_deleted_at')
        .where('employee_device_id', employeeDeviceId)
        .first()

      if (!currentEmployeeDevice) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee device was not found',
          message: 'The employee device was not found with the entered ID',
          data: { employeeDeviceId },
        }
      }

      const employeeDeviceService = new EmployeeDeviceService(i18n)
      const deleteEmployeeDevice = await employeeDeviceService.delete(
        currentEmployeeDevice
      )

      if (deleteEmployeeDevice) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee Devices',
          message: 'The employee device was deleted successfully',
          data: { employeeDevice: deleteEmployeeDevice },
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
}

