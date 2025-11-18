import { HttpContext } from '@adonisjs/core/http'
import WorkDisabilityPeriod from '#models/work_disability_period'
import WorkDisabilityPeriodService from '#services/work_disability_period_service'
import UploadService from '#services/upload_service'
import { createWorkDisabilityPeriodValidator } from '#validators/work_disability_period'
import { WorkDisabilityPeriodAddShiftExceptionInterface } from '../interfaces/work_disability_period_add_shift_exception_interface.js'
import path from 'node:path'
import Env from '#start/env'

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
        size: '',
      }
      const workDisabilityPeriodFile = request.file('workDisabilityPeriodFile', validationOptions)
      if (workDisabilityPeriodFile) {
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp']
        if (!allowedExtensions.includes(workDisabilityPeriodFile.extname || '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: 'Only PDF or image files are allowed',
          }
        }
        const fileName = `${new Date().getTime()}_${workDisabilityPeriodFile.clientName}`
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(
          workDisabilityPeriodFile,
          'work-disability-files',
          fileName
        )
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
        response.status(404)
        return {
          type: 'warning',
          title: 'The work disability period was not found',
          message: 'The work disability period was not found with the entered ID',
          data: { workDisabilityPeriodId },
        }
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
        size: '',
      }
      const workDisabilityPeriodFile = request.file('workDisabilityPeriodFile', validationOptions)
      if (workDisabilityPeriodFile) {
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp']
        if (!allowedExtensions.includes(workDisabilityPeriodFile.extname || '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: 'Only PDF or image files are allowed',
          }
        }
        const fileName = `${new Date().getTime()}_${workDisabilityPeriodFile.clientName}`
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(
          workDisabilityPeriodFile,
          'work-disability-files',
          fileName
        )
        if (currentWorkDisabilityPeriod.workDisabilityPeriodFile) {
          const fileNameWithExt = decodeURIComponent(
            path.basename(currentWorkDisabilityPeriod.workDisabilityPeriodFile)
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/work-disability-files/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
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
        response.status(404)
        return {
          type: 'warning',
          title: 'The work disability period was not found',
          message: 'The work disability period was not found with the entered ID',
          data: { workDisabilityPeriodId },
        }
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
        response.status(404)
        return {
          type: 'warning',
          title: 'The work disability period was not found',
          message: 'The work disability period was not found with the entered ID',
          data: { workDisabilityPeriodId },
        }
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
}
