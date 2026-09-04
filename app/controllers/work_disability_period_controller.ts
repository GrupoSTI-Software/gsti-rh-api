import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import { inject } from '@adonisjs/core'
import WorkDisabilityPeriod from '#models/work_disability_period'
import WorkDisabilityPeriodService from '#services/work_disability_period_service'
import UploadService from '#services/upload_service'
import { createWorkDisabilityPeriodValidator } from '#validators/work_disability_period'
import { WorkDisabilityPeriodAddShiftExceptionInterface } from '../interfaces/work_disability_period_add_shift_exception_interface.js'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'

/** 404 uniforme (no revela "no existe" vs "no es tuyo") — USRH1784259058498. */
function workDisabilityPeriodNotFoundResponse(response: HttpContext['response']) {
  return response.status(404).json({
    title: 'Recurso no encontrado',
    detail: 'El recurso solicitado no existe o está fuera de tu alcance.',
    key: 'recurso-no-encontrado',
    code: WORK_DISABILITY_ERROR_CODES.NOT_FOUND,
  })
}

export default class WorkDisabilityPeriodController {
  /**
   * @swagger
   * /api/work-disability-periods:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Periods
   *     summary: create new work disability period
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               workDisabilityPeriodStartDate:
   *                 type: string
   *                 format: date
   *                 description: Work disability period start date (YYYY-MM-DD)
   *                 example: "2025-01-08"
   *                 required: true
   *               workDisabilityPeriodEndDate:
   *                 type: string
   *                 format: date
   *                 description: Work disability period end date (YYYY-MM-DD)
   *                 example: "2025-01-08"
   *                 required: true
   *               workDisabilityPeriodTicketFolio:
   *                 type: number
   *                 description: Work disability period ticket folio
   *                 required: true
   *                 default: ''
   *               workDisabilityPeriodFile:
   *                 type: string
   *                 format: binary
   *                 description: Work disability period file to upload
   *               workDisabilityId:
   *                 type: number
   *                 description: Work disability id
   *                 required: true
   *                 default: ''
   *               workDisabilityTypeId:
   *                 type: number
   *                 description: Work disability type Id
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
  async store({ request, response, auth, i18n }: HttpContext) {
    try {
      const workDisabilityPeriodStartDate = request.input('workDisabilityPeriodStartDate')
      const workDisabilityPeriodEndDate = request.input('workDisabilityPeriodEndDate')
      const workDisabilityPeriodTicketFolio = request.input('workDisabilityPeriodTicketFolio')
      const workDisabilityId = request.input('workDisabilityId')
      const workDisabilityTypeId = request.input('workDisabilityTypeId')
      const workDisabilityPeriod = {
        workDisabilityPeriodStartDate: workDisabilityPeriodStartDate,
        workDisabilityPeriodEndDate: workDisabilityPeriodEndDate,
        workDisabilityPeriodTicketFolio: workDisabilityPeriodTicketFolio,
        workDisabilityId: workDisabilityId,
        workDisabilityTypeId: workDisabilityTypeId,
      } as WorkDisabilityPeriod
      const workDisabilityPeriodService = new WorkDisabilityPeriodService(i18n)
      const data = await request.validateUsing(createWorkDisabilityPeriodValidator)
      const exist = await workDisabilityPeriodService.verifyInfoExist(workDisabilityPeriod)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await workDisabilityPeriodService.verifyInfo(workDisabilityPeriod)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }

      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '10mb',
      }
      const workDisabilityPeriodFile = request.file('workDisabilityPeriodFile', validationOptions)
      if (workDisabilityPeriodFile) {
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
        if (!allowedExtensions.includes(workDisabilityPeriodFile.extname || '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: 'Only PDF or image files are allowed',
            code: WORK_DISABILITY_ERROR_CODES.INVALID_FILE,
          }
        }
        if (!workDisabilityPeriodFile.isValid) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: workDisabilityPeriodFile.errors[0]?.message || 'Invalid file',
            code: WORK_DISABILITY_ERROR_CODES.FILE_TOO_LARGE,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(workDisabilityPeriodFile, 'evidence-document', 'work-disability-files')
        workDisabilityPeriod.workDisabilityPeriodFile = fileUrl
      }

      const newWorkDisabilityPeriod = await workDisabilityPeriodService.create(workDisabilityPeriod)
      if (newWorkDisabilityPeriod) {
        const filters = {
          workDisabilityPeriod: newWorkDisabilityPeriod,
          auth: auth,
          request: request,
        } as WorkDisabilityPeriodAddShiftExceptionInterface
        const shiftExceptions = await workDisabilityPeriodService.addShiftExceptions(filters)

        await newWorkDisabilityPeriod.load('workDisability')
        if (newWorkDisabilityPeriod.workDisability) {
          const workDisabilityPeriodStart = newWorkDisabilityPeriod.workDisabilityPeriodStartDate
          const dateStart = typeof workDisabilityPeriodStart === 'string' ? new Date(workDisabilityPeriodStart) : workDisabilityPeriodStart
          const workDisabilityPeriodEnd = newWorkDisabilityPeriod.workDisabilityPeriodEndDate
          const dateEnd = typeof workDisabilityPeriodEnd === 'string' ? new Date(workDisabilityPeriodEnd) : workDisabilityPeriodEnd
      
          await workDisabilityPeriodService.updateAssistCalendar(newWorkDisabilityPeriod.workDisability.employeeId, dateStart, dateEnd)
        }

        response.status(201)
        return {
          type: 'success',
          title: 'Work disability periods',
          message: 'The work disability period was created successfully',
          data: {
            workDisabilityPeriod: newWorkDisabilityPeriod,
            shiftExceptionsSaved: shiftExceptions.shiftExceptionsSaved,
            shiftExceptionsError: shiftExceptions.shiftExceptionsError,
          },
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
   * /api/work-disability-periods/{workDisabilityPeriodId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Periods
   *     summary: update work disability period by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodId
   *         schema:
   *           type: number
   *         description: Work disability period id
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               workDisabilityPeriodStartDate:
   *                 type: string
   *                 format: date
   *                 description: Work disability period start date (YYYY-MM-DD)
   *                 example: "2025-01-08"
   *                 required: true
   *               workDisabilityPeriodEndDate:
   *                 type: string
   *                 format: date
   *                 description: Work disability period end date (YYYY-MM-DD)
   *                 example: "2025-01-08"
   *                 required: true
   *               workDisabilityPeriodTicketFolio:
   *                 type: number
   *                 description: Work disability period ticket folio
   *                 required: true
   *                 default: ''
   *               workDisabilityPeriodFile:
   *                 type: string
   *                 format: binary
   *                 description: Work disability period file to upload
   *               workDisabilityId:
   *                 type: number
   *                 description: Work disability id
   *                 required: true
   *                 default: ''
   *               workDisabilityTypeId:
   *                 type: number
   *                 description: Work disability type Id
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
  async update({ request, response, i18n }: HttpContext) {
    try {
      const workDisabilityPeriodId = request.param('workDisabilityPeriodId')
      if (!workDisabilityPeriodId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The work disability period Id was not found',
          message: 'Missing data to process',
          data: { workDisabilityPeriodId },
        }
      }
      const currentWorkDisabilityPeriod = await WorkDisabilityPeriod.query()
        .whereNull('work_disability_period_deleted_at')
        .where('work_disability_period_id', workDisabilityPeriodId)
        .first()
      if (!currentWorkDisabilityPeriod) {
        return workDisabilityPeriodNotFoundResponse(response)
      }
      const workDisabilityPeriodStartDate = request.input('workDisabilityPeriodStartDate')
      const workDisabilityPeriodEndDate = request.input('workDisabilityPeriodEndDate')
      const workDisabilityPeriodTicketFolio = request.input('workDisabilityPeriodTicketFolio')
      const workDisabilityId = request.input('workDisabilityId')
      const workDisabilityTypeId = request.input('workDisabilityTypeId')
      const workDisabilityPeriod = {
        workDisabilityPeriodStartDate: workDisabilityPeriodStartDate,
        workDisabilityPeriodEndDate: workDisabilityPeriodEndDate,
        workDisabilityId: workDisabilityId,
        workDisabilityPeriodId: workDisabilityPeriodId,
        workDisabilityPeriodTicketFolio: workDisabilityPeriodTicketFolio,
        workDisabilityTypeId: workDisabilityTypeId,
      } as WorkDisabilityPeriod
      const workDisabilityPeriodService = new WorkDisabilityPeriodService(i18n)
      const data = await request.validateUsing(createWorkDisabilityPeriodValidator)
      const exist = await workDisabilityPeriodService.verifyInfoExist(workDisabilityPeriod)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await workDisabilityPeriodService.verifyInfo(workDisabilityPeriod)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }

      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '10mb',
      }
      const workDisabilityPeriodFile = request.file('workDisabilityPeriodFile', validationOptions)
      if (workDisabilityPeriodFile) {
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
        if (!allowedExtensions.includes(workDisabilityPeriodFile.extname || '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: 'Only PDF or image files are allowed',
            code: WORK_DISABILITY_ERROR_CODES.INVALID_FILE,
          }
        }
        if (!workDisabilityPeriodFile.isValid) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: workDisabilityPeriodFile.errors[0]?.message || 'Invalid file',
            code: WORK_DISABILITY_ERROR_CODES.FILE_TOO_LARGE,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(workDisabilityPeriodFile, 'evidence-document', 'work-disability-files')
        if (currentWorkDisabilityPeriod.workDisabilityPeriodFile) {
          await uploadService.deleteFile(currentWorkDisabilityPeriod.workDisabilityPeriodFile)
        }
        workDisabilityPeriod.workDisabilityPeriodFile = fileUrl
      }
      if (!workDisabilityPeriod.workDisabilityPeriodFile) {
        workDisabilityPeriod.workDisabilityPeriodFile =
          currentWorkDisabilityPeriod.workDisabilityPeriodFile
      }
      const updateWorkDisabilityPeriod = await workDisabilityPeriodService.update(
        currentWorkDisabilityPeriod,
        workDisabilityPeriod
      )
      if (updateWorkDisabilityPeriod) {
        await updateWorkDisabilityPeriod.load('workDisability')
        await updateWorkDisabilityPeriod.load('workDisabilityType')
        await workDisabilityPeriodService.updateShiftExceptions(updateWorkDisabilityPeriod)

        if (updateWorkDisabilityPeriod.workDisability) {
          const workDisabilityPeriodStart = updateWorkDisabilityPeriod.workDisabilityPeriodStartDate
          const dateStart = typeof workDisabilityPeriodStart === 'string' ? new Date(workDisabilityPeriodStart) : workDisabilityPeriodStart
          const workDisabilityPeriodEnd = updateWorkDisabilityPeriod.workDisabilityPeriodEndDate
          const dateEnd = typeof workDisabilityPeriodEnd === 'string' ? new Date(workDisabilityPeriodEnd) : workDisabilityPeriodEnd
      
          await workDisabilityPeriodService.updateAssistCalendar(updateWorkDisabilityPeriod.workDisability.employeeId, dateStart, dateEnd)
        }

        response.status(200)
        return {
          type: 'success',
          title: 'Work disability periods',
          message: 'The work disability period was updated successfully',
          data: {
            workDisabilityPeriod: updateWorkDisabilityPeriod,
          },
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
   * /api/work-disability-periods/{workDisabilityPeriodId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Periods
   *     summary: get work disability period by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodId
   *         schema:
   *           type: number
   *         description: Work disability period Id
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
  async show({ request, response, i18n }: HttpContext) {
    try {
      const workDisabilityPeriodId = request.param('workDisabilityPeriodId')
      if (!workDisabilityPeriodId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The work disability period Id was not found',
          data: { workDisabilityPeriodId },
        }
      }
      const workDisabilityPeriodService = new WorkDisabilityPeriodService(i18n)
      const showWorkDisabilityPeriod =
        await workDisabilityPeriodService.show(workDisabilityPeriodId)
      if (!showWorkDisabilityPeriod) {
        return workDisabilityPeriodNotFoundResponse(response)
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disability periods',
          message: 'The work disability period was found successfully',
          data: { workDisabilityPeriod: showWorkDisabilityPeriod },
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
   * /api/work-disability-periods/{workDisabilityPeriodId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Periods
   *     summary: delete work disability period by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodId
   *         schema:
   *           type: number
   *         description: Work disability period id
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
  async delete({ request, response, i18n }: HttpContext) {
    try {
      const workDisabilityPeriodId = request.param('workDisabilityPeriodId')
      if (!workDisabilityPeriodId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The work disability period Id was not found',
          message: 'Missing data to process',
          data: { workDisabilityPeriodId },
        }
      }
      const currentWorkDisabilityPeriod = await WorkDisabilityPeriod.query()
        .whereNull('work_disability_period_deleted_at')
        .where('work_disability_period_id', workDisabilityPeriodId)
        .first()
      if (!currentWorkDisabilityPeriod) {
        return workDisabilityPeriodNotFoundResponse(response)
      }
      const workDisabilityPeriodService = new WorkDisabilityPeriodService(i18n)
      const deleteWorkDisabilityPeriod = await workDisabilityPeriodService.delete(
        currentWorkDisabilityPeriod
      )
      if (deleteWorkDisabilityPeriod) {
        await workDisabilityPeriodService.deleteShiftExceptions(currentWorkDisabilityPeriod)

        await deleteWorkDisabilityPeriod.load('workDisability')
        if (deleteWorkDisabilityPeriod.workDisability) {
          const workDisabilityPeriodStart = deleteWorkDisabilityPeriod.workDisabilityPeriodStartDate
          const dateStart = typeof workDisabilityPeriodStart === 'string' ? new Date(workDisabilityPeriodStart) : workDisabilityPeriodStart
          const workDisabilityPeriodEnd = deleteWorkDisabilityPeriod.workDisabilityPeriodEndDate
          const dateEnd = typeof workDisabilityPeriodEnd === 'string' ? new Date(workDisabilityPeriodEnd) : workDisabilityPeriodEnd
      
          await workDisabilityPeriodService.updateAssistCalendar(deleteWorkDisabilityPeriod.workDisability.employeeId, dateStart, dateEnd)
        }

        response.status(200)
        return {
          type: 'success',
          title: 'Work disability periods',
          message: 'The work disability period was deleted successfully',
          data: { workDisabilityPeriod: deleteWorkDisabilityPeriod },
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
   * /api/work-disability-periods/{workDisabilityPeriodId}/download:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Periods
   *     summary: download work disability period file (stream autenticado, USRH1787434050259)
   *     produces:
   *       - application/octet-stream
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodId
   *         required: true
   *         schema:
   *           type: number
   *         description: Work disability period id
   *     responses:
   *       200:
   *         description: Stream binario del documento
   *         headers:
   *           Content-Type:
   *             schema:
   *               type: string
   *           Content-Disposition:
   *             schema:
   *               type: string
   *           Cache-Control:
   *             schema:
   *               type: string
   *               example: private, no-store
   *       400:
   *         description: ID inválido
   *       401:
   *         description: Sin token de autenticación válido
   *       403:
   *         description: Sin permiso 'download-work-disability-file' (key PERM.DENIED / PERM.UNRESOLVED)
   *       404:
   *         description: Periodo de incapacidad no encontrado, fuera de tu alcance, o el X-Business-Unit-Id header es inválido (key BU.NOT.001)
   *       500:
   *         description: Error inesperado al descargar el archivo
   */
  @inject()
  async download(ctx: HttpContext, uploadService: UploadService) {
    const { request, response, logger } = ctx
    try {
      const canDownload = await ensureSecondaryPermission(
        ctx,
        EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.downloadWorkDisabilityFile
      )
      if (!canDownload) return

      const rawId = request.param('workDisabilityPeriodId')
      const workDisabilityPeriodId = Number(rawId)

      if (!Number.isInteger(workDisabilityPeriodId) || workDisabilityPeriodId <= 0) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del periodo de incapacidad es inválido',
          data: { workDisabilityPeriodId: rawId },
        }
      }

      // El propio modelo compone withBusinessUnitScope(): el filtro por tenant
      // se aplica automáticamente, no se necesita whereHas contra el empleado.
      const period = await WorkDisabilityPeriod.query()
        .where('work_disability_period_id', workDisabilityPeriodId)
        .whereNull('work_disability_period_deleted_at')
        .first()

      if (!period) {
        return workDisabilityPeriodNotFoundResponse(response)
      }

      if (!period.workDisabilityPeriodFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Archivo no encontrado',
          message: 'El periodo de incapacidad no tiene un archivo asociado',
          data: null,
        }
      }

      const object = await uploadService.streamStoredFile(period.workDisabilityPeriodFile)

      if (!object) {
        logger.warn(
          { workDisabilityPeriodId, path: period.workDisabilityPeriodFile },
          'Documento de incapacidad registrado en BD pero no encontrado en almacenamiento'
        )
        response.status(404)
        return {
          type: 'warning',
          title: 'Archivo no encontrado',
          message: 'El archivo del periodo de incapacidad no fue encontrado en el almacenamiento',
          data: null,
        }
      }

      const rawFileName = `incapacidad-${period.workDisabilityPeriodTicketFolio || workDisabilityPeriodId}`
      const safeName = rawFileName.replace(/[^\w.\- ]/g, '_')
      const isSvg = (object.contentType || '').toLowerCase().includes('svg')
      const disposition = isSvg ? 'attachment' : 'inline'

      response.header('Content-Type', object.contentType || 'application/octet-stream')
      response.header('Content-Disposition', `${disposition}; filename="${safeName}"`)
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
        { err: error, workDisabilityPeriodId: request.param('workDisabilityPeriodId') },
        'Error inesperado al descargar documento de incapacidad del almacenamiento'
      )
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al obtener el archivo del periodo de incapacidad',
        error: error?.message,
      }
    }
  }
}
