import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import EmployeeRecord from '#models/employee_record'
import EmployeeRecordService from '#services/employee_record_service'
import {
  createEmployeeRecordValidator,
  updateEmployeeRecordValidator,
} from '#validators/employee_record'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'

export default class EmployeeRecordController {
  /**
   * @swagger
   * /api/employee-records:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Records
   *     summary: create new employee record
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               employeeRecordPropertyId:
   *                 type: number
   *                 description: Employee record property id
   *                 required: true
   *                 default: ''
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               employeeRecordValueFile:
   *                 type: string
   *                 format: binary
   *                 description: Employee record value file
   *                 required: false
   *                 default: ''
   *               employeeRecordValue:
   *                 type: string
   *                 description: Employee record value
   *                 required: true
   *                 default: ''
   *               employeeRecordActive:
   *                 type: boolean
   *                 description: Employee record active
   *                 required: true
   *                 default: true
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
  async store({ request, response }: HttpContext) {
    try {
      const employeeRecordPropertyId = request.input('employeeRecordPropertyId')
      const employeeId = request.input('employeeId')
      const employeeRecordValue = request.input('employeeRecordValue')
      const employeeRecordActive = request.input('employeeRecordActive')
      const employeeRecord = {
        employeeRecordPropertyId: employeeRecordPropertyId,
        employeeId: employeeId,
        employeeRecordValue: employeeRecordValue,
        employeeRecordActive:
          employeeRecordActive && (employeeRecordActive === 'true' || employeeRecordActive === '1')
            ? 1
            : 0,
      } as EmployeeRecord
      const employeeRecordService = new EmployeeRecordService()
      const data = await request.validateUsing(createEmployeeRecordValidator)
      const exist = await employeeRecordService.verifyInfoExist(employeeRecord)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '',
      }
      const file = request.file('employeeRecordValueFile', validationOptions)
      if (!employeeRecordValue && !file) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee record value was not found',
          data: { ...employeeRecord },
        }
      }
      if (file) {
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(file, 'employee-record-document', 'employees-records')
        employeeRecord.employeeRecordValue = fileUrl
      }
      const newEmployeeRecord = await employeeRecordService.create(employeeRecord)
      if (newEmployeeRecord) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employee Records',
          message: 'The employee record was created successfully',
          data: { employeeRecord: newEmployeeRecord },
        }
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
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
   * /api/employee-records/{employeeRecordId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Records
   *     summary: update employee record
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeRecordId
   *         schema:
   *           type: number
   *         description: Employee record id
   *         required: true
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               employeeRecordValueFile:
   *                 type: string
   *                 format: binary
   *                 description: Employee record value file
   *                 required: false
   *                 default: ''
   *               employeeRecordValue:
   *                 type: string
   *                 description: Employee record value
   *                 required: true
   *                 default: ''
   *               employeeRecordActive:
   *                 type: boolean
   *                 description: Employee record active
   *                 required: true
   *                 default: true
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
  async update({ request, response }: HttpContext) {
    try {
      const employeeRecordId = request.param('employeeRecordId')
      const employeeRecordValue = request.input('employeeRecordValue')
      const employeeRecordActive = request.input('employeeRecordActive')
      const employeeRecord = {
        employeeRecordId: employeeRecordId,
        employeeRecordValue: employeeRecordValue,
        employeeRecordActive:
          employeeRecordActive && (employeeRecordActive === 'true' || employeeRecordActive === '1')
            ? 1
            : 0,
      } as EmployeeRecord
      if (!employeeRecordId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee record Id was not found',
          message: 'Missing data to process',
          data: { ...employeeRecord },
        }
      }
      const currentEmployeeRecord = await EmployeeRecord.query()
        .whereNull('employee_record_deleted_at')
        .where('employee_record_id', employeeRecordId)
        .first()
      if (!currentEmployeeRecord) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee record was not found',
          message: 'The employee record was not found with the entered ID',
          data: { ...employeeRecord },
        }
      }
      const employeeRecordService = new EmployeeRecordService()
      await request.validateUsing(updateEmployeeRecordValidator)
      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '',
      }
      const file = request.file('employeeRecordValueFile', validationOptions)
      if (!employeeRecordValue && !file) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee record value was not found',
          data: { ...employeeRecord },
        }
      }
      if (file) {
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(file, 'employee-record-document', 'employees-records')
        if (currentEmployeeRecord.employeeRecordValue) {
          const fileNameWithExt = decodeURIComponent(
            path.basename(currentEmployeeRecord.employeeRecordValue)
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/employees-records/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        employeeRecord.employeeRecordValue = fileUrl
      }
      const updateEmployeeRecord = await employeeRecordService.update(
        currentEmployeeRecord,
        employeeRecord
      )
      if (updateEmployeeRecord) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employee Records',
          message: 'The employee record was updated successfully',
          data: { employeeRecord: updateEmployeeRecord },
        }
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
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
   * /api/employee-records/{employeeRecordId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Records
   *     summary: delete employee record
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeRecordId
   *         schema:
   *           type: number
   *         description: Employee record id
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
  async delete({ request, response }: HttpContext) {
    try {
      const employeeRecordId = request.param('employeeRecordId')
      if (!employeeRecordId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee record Id was not found',
          message: 'Missing data to process',
          data: { employeeRecordId },
        }
      }
      const currentEmployeeRecord = await EmployeeRecord.query()
        .whereNull('employee_record_deleted_at')
        .where('employee_record_id', employeeRecordId)
        .first()
      if (!currentEmployeeRecord) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee record was not found',
          message: 'The employee record was not found with the entered ID',
          data: { employeeRecordId },
        }
      }
      const employeeRecordService = new EmployeeRecordService()
      const deleteEmployeeRecord = await employeeRecordService.delete(currentEmployeeRecord)
      if (deleteEmployeeRecord) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee Records',
          message: 'The employee record was deleted successfully',
          data: { employeeRecord: deleteEmployeeRecord },
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
   * /api/employee-records/{employeeRecordId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Records
   *     summary: get employee record by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeRecordId
   *         schema:
   *           type: number
   *         description: Employee record id
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
      const employeeRecordId = request.param('employeeRecordId')
      if (!employeeRecordId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee record Id was not found',
          data: { employeeRecordId },
        }
      }
      const employeeRecordService = new EmployeeRecordService()
      const showEmployeeRecord = await employeeRecordService.show(employeeRecordId)
      if (!showEmployeeRecord) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee record was not found',
          message: 'The employee record was not found with the entered ID',
          data: { employeeRecordId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee Records',
          message: 'The employee record was found successfully',
          data: { employeeRecord: showEmployeeRecord },
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
