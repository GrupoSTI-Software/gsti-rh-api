import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import Env from '#start/env'
import { cuid } from '@adonisjs/core/helpers'
import path from 'node:path'
import { DateTime } from 'luxon'
import EmployeeContractService from '#services/employee_contract_service'
import { createEmployeeContractValidator } from '#validators/employee_contract'
import EmployeeContract from '#models/employee_contract'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION } from '#constants/employees_download_permission_declarations'
export default class EmployeeContractController {
  /**
   * @swagger
   * /api/employee-contracts/:
   *   post:
   *     summary: create new employee contract
   *     tags:
   *       - Employee Contracts
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               employeeContractFolio:
   *                 type: string
   *                 description: Employee contract folio
   *                 required: true
   *                 default: ''
   *               employeeContractStartDate:
   *                 type: string
   *                 format: date
   *                 description: Employee contract start date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               employeeContractEndDate:
   *                 type: string
   *                 format: date
   *                 description: Employee contract end date (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               employeeContractStatus:
   *                 type: string
   *                 description: Employee contract status
   *                 required: true
   *                 default: ''
   *                 enum: [active, expired, cancelled]
   *               employeeContractMonthlyNetSalary:
   *                 type: number
   *                 description: Employee contract monthly net salary
   *                 required: true
   *                 default: ''
   *               employeeContractFile:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *                 required: false
   *               employeeContractTypeId:
   *                 type: number
   *                 description: Employee contract type id
   *                 required: true
   *                 default: ''
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               departmentId:
   *                 type: number
   *                 description: Department id
   *                 required: true
   *                 default: ''
   *               positionId:
   *                 type: number
   *                 description: Position id
   *                 required: true
   *                 default: ''
   *               payrollBusinessUnitId:
   *                 type: number
   *                 description: Payroll Business Unit id
   *                 required: true
   *                 default: ''
   *               employeeContractActive:
   *                 type: boolean
   *                 description: Employee contract status
   *                 required: false
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
  @inject()
  async store({ request, response }: HttpContext) {
    try {
      const employeeContractService = new EmployeeContractService()
      await request.validateUsing(createEmployeeContractValidator)
      const validationOptions = {
        types: ['image', 'document'],
        size: '',
      }
      const employeeContractFile = request.file('employeeContractFile', validationOptions)
      const employeeContractFolio = request.input('employeeContractFolio')
      const employeeContractStatus = request.input('employeeContractStatus')
      const employeeContractMonthlyNetSalary = request.input('employeeContractMonthlyNetSalary')
      const employeeContractTypeId = request.input('employeeContractTypeId')
      const employeeId = request.input('employeeId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const employeeContractActive = request.input('employeeContractActive')
      let employeeContractStartDate = request.input('employeeContractStartDate')
      employeeContractStartDate = employeeContractStartDate
        ? DateTime.fromJSDate(new Date(employeeContractStartDate)).setZone('UTC').toJSDate()
        : null
      let employeeContractEndDate = request.input('employeeContractEndDate')
      employeeContractEndDate = employeeContractEndDate
        ? DateTime.fromJSDate(new Date(employeeContractEndDate)).setZone('UTC').toJSDate()
        : null
      const employeeContractUuid = cuid()
      const employeeContract = {
        employeeContractUuid: employeeContractUuid,
        employeeContractFolio: employeeContractFolio,
        employeeContractStartDate: employeeContractStartDate,
        employeeContractEndDate: employeeContractEndDate,
        employeeContractStatus: employeeContractStatus,
        employeeContractMonthlyNetSalary: employeeContractMonthlyNetSalary,
        employeeContractTypeId: employeeContractTypeId,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        payrollBusinessUnitId: payrollBusinessUnitId,
        employeeContractActive: employeeContractActive,
      } as EmployeeContract
      const verifyExist = await employeeContractService.verifyInfoExist(employeeContract)
      if (verifyExist.status !== 200) {
        response.status(verifyExist.status)
        return {
          type: verifyExist.type,
          title: verifyExist.title,
          message: verifyExist.message,
          data: { ...employeeContract },
        }
      }
      const verifyInfo = await employeeContractService.verifyInfo(employeeContract)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...employeeContract },
        }
      }
      if (employeeContractFile) {
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'doc', 'docx']
        const fileExtension = employeeContractFile.extname
          ? employeeContractFile.extname.toLowerCase()
          : ''
        if (!allowedExtensions.includes(fileExtension)) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Invalid file type',
            message: 'Please upload a valid file (image, .doc, .docx)',
            data: employeeContractFile,
          }
        }
        // get file name and extension
        const fileName = `${new Date().getTime()}_${employeeContractFile.clientName}`
        const uploadService = new UploadService()

        const fileUrl = await uploadService.fileUpload(
          employeeContractFile,
          'employee-contracts',
          fileName,
          'private'
        )
        employeeContract.employeeContractFile = fileUrl
      }
      const newEmployeeContract = await employeeContractService.create(employeeContract)
      response.status(201)
      return {
        type: 'success',
        title: 'Employee contracts',
        message: 'The employee contract was created successfully',
        data: { employeeContract: newEmployeeContract },
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
   * /api/employee-contracts/{employeeContractId}:
   *   put:
   *     summary: Update employee contract
   *     tags:
   *       - Employee Contracts
   *     parameters:
   *       - in: path
   *         name: employeeContractId
   *         schema:
   *           type: number
   *         description: Employee contract id
   *         required: true
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               employeeContractFolio:
   *                 type: string
   *                 description: Employee contract folio
   *                 required: true
   *                 default: ''
   *               employeeContractStartDate:
   *                 type: string
   *                 format: date
   *                 description: Employee contract start date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               employeeContractEndDate:
   *                 type: string
   *                 format: date
   *                 description: Employee contract end date (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               employeeContractStatus:
   *                 type: string
   *                 description: Employee contract status
   *                 required: true
   *                 default: ''
   *                 enum: [active, expired, cancelled]
   *               employeeContractMonthlyNetSalary:
   *                 type: number
   *                 description: Employee contract monthly net salary
   *                 required: true
   *                 default: ''
   *               employeeContractFile:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *                 required: false
   *               employeeContractTypeId:
   *                 type: number
   *                 description: Employee contract type id
   *                 required: true
   *                 default: ''
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               departmentId:
   *                 type: number
   *                 description: Department id
   *                 required: true
   *                 default: ''
   *               positionId:
   *                 type: number
   *                 description: Position id
   *                 required: true
   *                 default: ''
   *               payrollBusinessUnitId:
   *                 type: number
   *                 description: Payroll Business Unit id
   *                 required: true
   *                 default: ''
   *               employeeContractActive:
   *                 type: boolean
   *                 description: Employee contract status
   *                 required: false
   *                 default: true
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
  @inject()
  async update({ request, response }: HttpContext) {
    try {
      const employeeContractService = new EmployeeContractService()
      await request.validateUsing(createEmployeeContractValidator)
      const validationOptions = {
        types: ['image', 'document'],
        size: '',
      }
      const employeeContractFile = request.file('employeeContractFile', validationOptions)
      const employeeContractId = request.param('employeeContractId')
      if (!employeeContractId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee contract file Id was not found',
          data: { employeeContractId },
        }
      }
      const currentEmployeeContract = await EmployeeContract.query()
        .whereNull('employee_contract_deleted_at')
        .where('employee_contract_id', employeeContractId)
        .first()
      if (!currentEmployeeContract) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee contract was not found',
          message: 'The employee contract was not found with the entered ID',
          data: { employeeContractId },
        }
      }
      const employeeContractFolio = request.input('employeeContractFolio')
      const employeeContractStatus = request.input('employeeContractStatus')
      const employeeContractMonthlyNetSalary = request.input('employeeContractMonthlyNetSalary')
      const employeeContractTypeId = request.input('employeeContractTypeId')
      const employeeId = request.input('employeeId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const employeeContractActive = request.input('employeeContractActive')
      let employeeContractStartDate = request.input('employeeContractStartDate')
      employeeContractStartDate = employeeContractStartDate
        ? DateTime.fromJSDate(new Date(employeeContractStartDate)).setZone('UTC').toJSDate()
        : null
      let employeeContractEndDate = request.input('employeeContractEndDate')
      employeeContractEndDate = employeeContractEndDate
        ? DateTime.fromJSDate(new Date(employeeContractEndDate)).setZone('UTC').toJSDate()
        : null
      const employeeContract = {
        employeeContractId: employeeContractId,
        employeeContractFolio: employeeContractFolio,
        employeeContractStartDate: employeeContractStartDate,
        employeeContractEndDate: employeeContractEndDate,
        employeeContractStatus: employeeContractStatus,
        employeeContractMonthlyNetSalary: employeeContractMonthlyNetSalary,
        employeeContractTypeId: employeeContractTypeId,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        payrollBusinessUnitId: payrollBusinessUnitId,
        employeeContractActive: employeeContractActive,
      } as EmployeeContract
      const verifyExist = await employeeContractService.verifyInfoExist(employeeContract)
      if (verifyExist.status !== 200) {
        response.status(verifyExist.status)
        return {
          type: verifyExist.type,
          title: verifyExist.title,
          message: verifyExist.message,
          data: { ...employeeContract },
        }
      }
      const verifyInfo = await employeeContractService.verifyInfo(employeeContract)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...employeeContract },
        }
      }
      if (employeeContractFile) {
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'doc', 'docx']
        const fileExtension = employeeContractFile.extname
          ? employeeContractFile.extname.toLowerCase()
          : ''
        if (!allowedExtensions.includes(fileExtension)) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Invalid file type',
            message: 'Please upload a valid file (image, .doc, .docx)',
            data: employeeContractFile,
          }
        }
        const fileName = `${new Date().getTime()}_${employeeContractFile.clientName}`
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(
          employeeContractFile,
          'employee-contracts',
          fileName,
          'private'
        )
        if (currentEmployeeContract.employeeContractFile) {
          const fileNameWithExt = decodeURIComponent(
            path.basename(currentEmployeeContract.employeeContractFile)
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/employee-contracts/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        employeeContract.employeeContractFile = fileUrl
      }
      const updateEmployeeContract = await employeeContractService.update(
        currentEmployeeContract,
        employeeContract
      )

      response.status(200)
      return {
        type: 'success',
        title: 'Employee contracts',
        message: 'The employee contract was updated successfully',
        data: { employeeContract: updateEmployeeContract },
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
   * /api/employee-contracts/{employeeContractId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Contracts
   *     summary: delete employee contract
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeContractId
   *         schema:
   *           type: number
   *         description: Employee contract id
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
      const employeeContractId = request.param('employeeContractId')
      if (!employeeContractId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee contract Id was not found',
          data: { employeeContractId },
        }
      }
      const currentEmployeeContract = await EmployeeContract.query()
        .whereNull('employee_contract_deleted_at')
        .where('employee_contract_id', employeeContractId)
        .first()
      if (!currentEmployeeContract) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee contract was not found',
          message: 'The employee contract was not found with the entered ID',
          data: { employeeContractId },
        }
      }
      const employeeContractService = new EmployeeContractService()
      const deleteEmployeeContract = await employeeContractService.delete(currentEmployeeContract)
      if (deleteEmployeeContract) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee contracts',
          message: 'The employee contract was deleted successfully',
          data: { employeeContract: deleteEmployeeContract },
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
   * /api/employee-contracts/{employeeContractId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Contracts
   *     summary: get employee contract by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeContractId
   *         schema:
   *           type: number
   *         description: Employee contract id
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
      const employeeContractId = request.param('employeeContractId')
      if (!employeeContractId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee conytact Id was not found',
          data: { employeeContractId },
        }
      }
      const employeeContractService = new EmployeeContractService()
      const showEmployeeContract = await employeeContractService.show(employeeContractId)
      if (!showEmployeeContract) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee contract was not found',
          message: 'The employee contract was not found with the entered ID',
          data: { employeeContractId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee contracts',
          message: 'The employee contract was found successfully',
          data: { employeeContract: showEmployeeContract },
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
   * /api/employee-contracts/{employeeContractId}/download:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Contracts
   *     summary: Descarga el binario de un contrato de empleado (proxy autenticado)
   *     description: |
   *       Proxy server-side para contratos de empleado. El API valida que el contrato
   *       pertenezca al scope del usuario autenticado y, si es válido, transmite (stream)
   *       el binario desde DigitalOcean Spaces sin exponer la URL de origen.
   *       Responde 404 tanto si el contrato no existe como si está fuera del scope
   *       del usuario (no se revela la existencia del recurso ajeno).
   *     parameters:
   *       - in: path
   *         name: employeeContractId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador del contrato de empleado
   *     responses:
   *       200:
   *         description: Stream binario del documento
   *       400:
   *         description: ID inválido
   *       401:
   *         description: Sin token de autenticación válido
   *       404:
   *         description: Contrato no encontrado o fuera del scope del usuario
   *       500:
   *         description: Error inesperado al descargar el archivo
   */
  @inject()
  async download(ctx: HttpContext, uploadService: UploadService) {
    const { auth, request, response, logger, businessUnitScope } = ctx
    try {
      const canReadTab = await ensureSecondaryPermission(
        ctx,
        EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION
      )
      if (!canReadTab) return

      const rawId = request.param('employeeContractId')
      const employeeContractId = Number(rawId)

      if (!Number.isInteger(employeeContractId) || employeeContractId <= 0) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del contrato es inválido',
          data: { employeeContractId: rawId },
        }
      }

      const user = auth.user!
      if (!user.role) {
        await user.load('role')
      }
      const isRoot = user.role?.roleSlug === 'root'

      const query = EmployeeContract.query()
        .where('employee_contract_id', employeeContractId)
        .whereNull('employee_contract_deleted_at')

      // Validar scope via whereHas para evitar que el mixin withBusinessUnitScope
      // de Employee filtre el preload y deje la relación en null.
      if (!isRoot) {
        query.whereHas('employee', (q) => {
          q.whereIn('business_unit_id', businessUnitScope)
        })
      }

      const contract = await query.first()

      if (!contract) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Contrato no encontrado',
          message: 'El contrato no fue encontrado',
          data: null,
        }
      }

      if (!contract.employeeContractFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Archivo no encontrado',
          message: 'El contrato no tiene un archivo asociado',
          data: null,
        }
      }

      const object = await uploadService.streamStoredFile(contract.employeeContractFile)

      if (!object) {
        logger.warn(
          { employeeContractId, path: contract.employeeContractFile },
          'Contrato registrado en BD pero no encontrado en almacenamiento'
        )
        response.status(404)
        return {
          type: 'warning',
          title: 'Archivo no encontrado',
          message: 'El archivo del contrato no fue encontrado en el almacenamiento',
          data: null,
        }
      }

      const fileName = `contrato-${contract.employeeContractFolio || employeeContractId}`

      response.header('Content-Type', object.contentType || 'application/octet-stream')
      response.header('Content-Disposition', `inline; filename="${fileName}"`)
      response.header('Cache-Control', 'private, no-store')
      if (object.contentLength !== undefined) {
        response.header('Content-Length', String(object.contentLength))
      }
      if (object.etag) {
        response.header('ETag', object.etag)
      }
      if (object.lastModified) {
        response.header('Last-Modified', object.lastModified.toUTCString())
      }

      response.status(200)
      return response.stream(object.stream)
    } catch (error: any) {
      logger.error(
        { err: error, employeeContractId: request.param('employeeContractId') },
        'Error inesperado al descargar contrato del almacenamiento'
      )
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al obtener el archivo del contrato',
        error: error?.message,
      }
    }
  }
}
