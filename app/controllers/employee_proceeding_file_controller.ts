/* eslint-disable prettier/prettier */
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import EmployeeProceedingFileService from '#services/employee_proceeding_file_service'
import {
  createEmployeeProceedingFileValidator,
  updateEmployeeProceedingFileValidator,
} from '#validators/employee_proceeding_file'
import { HttpContext } from '@adonisjs/core/http'
import { EmployeeProceedingFileFilterInterface } from '../interfaces/employee_proceeding_file_filter_interface.js'
import UserService from '#services/user_service'

export default class EmployeeProceedingFileController {
  /**
   * @swagger
   * /api/employees-proceeding-files/:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees Proceeding Files
   *     summary: get all relation employee-proceedingfile
   *     produces:
   *       - application/json
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
  async index({ response }: HttpContext) {
    try {
      const employeeProceedingFileService = new EmployeeProceedingFileService()
      const showEmployeeProceedingFiles = await employeeProceedingFileService.index()
      response.status(200)
      return {
        type: 'success',
        title: 'Employees proceeding files',
        message: 'The relation employee-proceedingfile were found successfully',
        data: { employeeProceedingFiles: showEmployeeProceedingFiles },
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
   * /api/employees-proceeding-files:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees Proceeding Files
   *     summary: create new relation employee-proceeding-files
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               proceedingFileId:
   *                 type: number
   *                 description: Proceeding file id
   *                 required: true
   *                 default: ''
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
      const employeeId = request.input('employeeId')
      const proceedingFileId = request.input('proceedingFileId')
      const employeeProceedingFile = {
        employeeId: employeeId,
        proceedingFileId: proceedingFileId,
      } as EmployeeProceedingFile
      const employeeProceedingFileService = new EmployeeProceedingFileService()
      const data = await request.validateUsing(createEmployeeProceedingFileValidator)
      const exist = await employeeProceedingFileService.verifyInfoExist(employeeProceedingFile)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await employeeProceedingFileService.verifyInfo(employeeProceedingFile)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newEmployeeProceedingFile =
        await employeeProceedingFileService.create(employeeProceedingFile)
      if (newEmployeeProceedingFile) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employees proceeding files',
          message: 'The relation employee-proceedingfile was created successfully',
          data: { employeeProceedingFile: newEmployeeProceedingFile },
        }
      }
    } catch (error) {
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
   * /api/employees-proceeding-files/{employeeProceedingFileId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees Proceeding Files
   *     summary: update relation employee-proceedingfile
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeProceedingFileId
   *         schema:
   *           type: number
   *         description: Employee proceeding file id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               proceedingFileId:
   *                 type: number
   *                 description: ProceedingFile id
   *                 required: true
   *                 default: ''
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
  async update({ request, response }: HttpContext) {
    try {
      const employeeProceedingFileId = request.param('employeeProceedingFileId')
      const employeeId = request.input('employeeId')
      const proceedingFileId = request.input('proceedingFileId')
      const employeeProceedingFile = {
        employeeProceedingFileId: employeeProceedingFileId,
        employeeId: employeeId,
        proceedingFileId: proceedingFileId,
      } as EmployeeProceedingFile
      if (!employeeProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation employee-proceedingfile Id was not found',
          message: 'Missing data to process',
          data: { ...employeeProceedingFile },
        }
      }
      const currentEmployeeProceedingFile = await EmployeeProceedingFile.query()
        .whereNull('employee_proceeding_file_deleted_at')
        .where('employee_proceeding_file_id', employeeProceedingFileId)
        .first()
      if (!currentEmployeeProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation employee-proceedingfile was not found',
          message: 'The relation employee-proceedingfile was not found with the entered ID',
          data: { ...employeeProceedingFile },
        }
      }
      const employeeProceedingFileService = new EmployeeProceedingFileService()
      const data = await request.validateUsing(updateEmployeeProceedingFileValidator)
      const exist = await employeeProceedingFileService.verifyInfoExist(employeeProceedingFile)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await employeeProceedingFileService.verifyInfo(employeeProceedingFile)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updateEmployeeProceedingFile = await employeeProceedingFileService.update(
        currentEmployeeProceedingFile,
        employeeProceedingFile
      )
      if (updateEmployeeProceedingFile) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee proceeding files',
          message: 'The relation employee-proceedingfile was updated successfully',
          data: { employeeProceedingFile: updateEmployeeProceedingFile },
        }
      }
    } catch (error) {
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
   * /api/employees-proceeding-files/{employeeProceedingFileId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees Proceeding Files
   *     summary: delete relation employee proceeding files
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeProceedingFileId
   *         schema:
   *           type: number
   *         description: Employee proceeding file id
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
      const employeeProceedingFileId = request.param('employeeProceedingFileId')
      if (!employeeProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation employee-proceedingfile Id was not found',
          message: 'Missing data to process',
          data: { employeeProceedingFileId },
        }
      }
      const currentEmployeeProceedingFile = await EmployeeProceedingFile.query()
        .whereNull('employee_proceeding_file_deleted_at')
        .where('employee_proceeding_file_id', employeeProceedingFileId)
        .first()
      if (!currentEmployeeProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation employee-proceedingfile was not found',
          message: 'The relation employee-proceedingfile was not found with the entered ID',
          data: { employeeProceedingFileId },
        }
      }
      const employeeProceedingFileService = new EmployeeProceedingFileService()
      const deleteEmployeeProceedingFile = await employeeProceedingFileService.delete(
        currentEmployeeProceedingFile
      )
      if (deleteEmployeeProceedingFile) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employees proceeding files',
          message: 'The relation employee-proceedingfile was deleted successfully',
          data: { employeeProceedingFile: deleteEmployeeProceedingFile },
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
   * /api/employees-proceeding-files/{employeeProceedingFileId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees Proceeding Files
   *     summary: get relation employee-proceedingfile by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeProceedingFileId
   *         schema:
   *           type: number
   *         description: Employee proceeding file id
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
      const employeeProceedingFileId = request.param('employeeProceedingFileId')
      if (!employeeProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation employee-proceedingfile Id was not found',
          message: 'Missing data to process',
          data: { employeeProceedingFileId },
        }
      }
      const employeeProceedingFileService = new EmployeeProceedingFileService()
      const showEmployeeProceedingFile =
        await employeeProceedingFileService.show(employeeProceedingFileId)
      if (!showEmployeeProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation employee-proceedingfile was not found',
          message: 'The relation employee-proceedingfile was not found with the entered ID',
          data: { employeeProceedingFileId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employees proceeding files',
          message: 'The relation employee-proceedingfile was found successfully',
          data: { employeeProceedingFile: showEmployeeProceedingFile },
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
   * /api/employees-proceeding-files/get-expired-and-expiring:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees Proceeding Files
   *     summary: get expired and expiring proceeding files by date
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: dateStart
   *         in: query
   *         required: false
   *         description: Date start (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *       - name: dateEnd
   *         in: query
   *         required: false
   *         description: Date end (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
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
  async getExpiresAndExpiring({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()

      const user = auth.user
      const userService = new UserService(i18n)
      let departmentsList = [] as Array<number>

      if (user) {
        departmentsList = await userService.getRoleDepartments(user.userId)
      }

      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const filters = { dateStart: dateStart, dateEnd: dateEnd } as EmployeeProceedingFileFilterInterface
      const employeeProceddingFileService = new EmployeeProceedingFileService()
      const employeeProceedingFiles = await employeeProceddingFileService.getExpiredAndExpiring(filters, departmentsList)

      response.status(200)
      return {
        type: 'success',
        title: 'Employee proceeding files',
        message: 'The employee proceeding files were found successfully',
        data: {
          employeeProceedingFiles: employeeProceedingFiles,
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
