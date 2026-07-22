import { HttpContext } from '@adonisjs/core/http'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'
import WorkDisabilityPeriodExpense from '#models/work_disability_period_expense'
import WorkDisabilityPeriodExpenseService from '#services/work_disability_period_expense_service'
import { createWorkDisabilityPeriodExpenseValidator } from '#validators/work_disability_period_expense'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'

/** 404 uniforme (no revela "no existe" vs "no es tuyo") — USRH1784259058498. */
function workDisabilityPeriodExpenseNotFoundResponse(response: HttpContext['response']) {
  return response.status(404).json({
    title: 'Recurso no encontrado',
    detail: 'El recurso solicitado no existe o está fuera de tu alcance.',
    key: 'recurso-no-encontrado',
    code: WORK_DISABILITY_ERROR_CODES.NOT_FOUND,
  })
}

export default class WorkDisabilityPeriodExpenseController {
  /**
   * @swagger
   * /api/work-disability-period-expenses:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Period Expenses
   *     summary: create new work disability period expense
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               workDisabilityPeriodExpenseFile:
   *                 type: string
   *                 format: binary
   *                 description: Work disability period expense file to upload
   *               workDisabilityPeriodExpenseAmount:
   *                 type: number
   *                 description: Work disability period expense amount
   *                 required: true
   *                 default: ''
   *               workDisabilityPeriodId:
   *                 type: number
   *                 description: Work disability period id
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
      const workDisabilityPeriodExpenseAmount = request.input('workDisabilityPeriodExpenseAmount')
      const workDisabilityPeriodId = request.input('workDisabilityPeriodId')
      const workDisabilityPeriodExpense = {
        workDisabilityPeriodExpenseAmount: workDisabilityPeriodExpenseAmount,
        workDisabilityPeriodId: workDisabilityPeriodId,
      } as WorkDisabilityPeriodExpense
      const workDisabilityPeriodExpenseService = new WorkDisabilityPeriodExpenseService()
      const data = await request.validateUsing(createWorkDisabilityPeriodExpenseValidator)
      const exist = await workDisabilityPeriodExpenseService.verifyInfoExist(
        workDisabilityPeriodExpense
      )
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
        types: ['image', 'document'],
        size: '',
      }
      const workDisabilityPeriodExpenseFile = request.file(
        'workDisabilityPeriodExpenseFile',
        validationOptions
      )
      if (!workDisabilityPeriodExpenseFile) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The work disability period expense file was not found',
          data: { workDisabilityPeriodExpense },
        }
      }
      const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp']
      if (!allowedExtensions.includes(workDisabilityPeriodExpenseFile.extname || '')) {
        response.status(400)
        return {
          status: 400,
          type: 'warning',
          title: 'Please upload a valid file',
          message: 'Only PDF or image files are allowed',
        }
      }
      const fileName = `${new Date().getTime()}_${workDisabilityPeriodExpenseFile.clientName}`
      const uploadService = new UploadService()
      const fileUrl = await uploadService.fileUpload(
        workDisabilityPeriodExpenseFile,
        'work-disability-period-expenses-files',
        fileName
      )
      workDisabilityPeriodExpense.workDisabilityPeriodExpenseFile = fileUrl
      const newWorkDisabilityPeriodExpense = await workDisabilityPeriodExpenseService.create(
        workDisabilityPeriodExpense
      )
      if (newWorkDisabilityPeriodExpense) {
        response.status(201)
        return {
          type: 'success',
          title: 'Work disability period expenses',
          message: 'The work disability period expense was created successfully',
          data: {
            workDisabilityPeriodExpense: newWorkDisabilityPeriodExpense,
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
   * /api/work-disability-period-expenses/{workDisabilityPeriodExpenseId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Period Expenses
   *     summary: update work disability period expense by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodExpenseId
   *         schema:
   *           type: number
   *         description: Work disability period expense id
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               workDisabilityPeriodExpenseFile:
   *                 type: string
   *                 format: binary
   *                 description: Work disability period expense file to upload
   *               workDisabilityPeriodExpenseAmount:
   *                 type: number
   *                 description: Work disability period expense amount
   *                 required: true
   *                 default: ''
   *               workDisabilityPeriodId:
   *                 type: number
   *                 description: Work disability period id
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
      const workDisabilityPeriodExpenseId = request.param('workDisabilityPeriodExpenseId')
      if (!workDisabilityPeriodExpenseId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The work disability period expense Id was not found',
          data: { workDisabilityPeriodExpenseId },
        }
      }
      const currentWorkDisabilityPeriodExpense = await WorkDisabilityPeriodExpense.query()
        .whereNull('work_disability_period_expense_deleted_at')
        .where('work_disability_period_expense_id', workDisabilityPeriodExpenseId)
        .first()
      if (!currentWorkDisabilityPeriodExpense) {
        return workDisabilityPeriodExpenseNotFoundResponse(response)
      }
      const workDisabilityPeriodExpenseAmount = request.input('workDisabilityPeriodExpenseAmount')
      const workDisabilityPeriodId = request.input('workDisabilityPeriodId')
      const workDisabilityPeriodExpense = {
        workDisabilityPeriodExpenseAmount: workDisabilityPeriodExpenseAmount,
        workDisabilityPeriodId: workDisabilityPeriodId,
      } as WorkDisabilityPeriodExpense
      const workDisabilityPeriodExpenseService = new WorkDisabilityPeriodExpenseService()
      const data = await request.validateUsing(createWorkDisabilityPeriodExpenseValidator)
      const exist = await workDisabilityPeriodExpenseService.verifyInfoExist(
        workDisabilityPeriodExpense
      )
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
        types: ['image', 'document'],
        size: '',
      }
      const workDisabilityPeriodExpenseFile = request.file(
        'workDisabilityPeriodExpenseFile',
        validationOptions
      )
      if (workDisabilityPeriodExpenseFile) {
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp']
        if (!allowedExtensions.includes(workDisabilityPeriodExpenseFile.extname || '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: 'Only PDF or image files are allowed',
          }
        }
        const fileName = `${new Date().getTime()}_${workDisabilityPeriodExpenseFile.clientName}`
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(
          workDisabilityPeriodExpenseFile,
          'work-disability-period-expenses-files',
          fileName
        )
        if (currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseFile) {
          const fileNameWithExt = decodeURIComponent(
            path.basename(currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseFile)
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/work-disability-period-expenses-files/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        workDisabilityPeriodExpense.workDisabilityPeriodExpenseFile = fileUrl
      }
      if (!workDisabilityPeriodExpense.workDisabilityPeriodExpenseFile) {
        workDisabilityPeriodExpense.workDisabilityPeriodExpenseFile =
          currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseFile
      }
      const updateWorkDisabilityPeriodExpense = await workDisabilityPeriodExpenseService.update(
        currentWorkDisabilityPeriodExpense,
        workDisabilityPeriodExpense
      )
      if (updateWorkDisabilityPeriodExpense) {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disability period expenses',
          message: 'The work disability period expense was updated successfully',
          data: {
            workDisabilityPeriodExpense: updateWorkDisabilityPeriodExpense,
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
   * /api/work-disability-period-expenses/{workDisabilityPeriodExpenseId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Period Expenses
   *     summary: get work disability period expense by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodExpenseId
   *         schema:
   *           type: number
   *         description: Work disability period expense Id
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
      const workDisabilityPeriodExpenseId = request.param('workDisabilityPeriodExpenseId')
      if (!workDisabilityPeriodExpenseId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The work disability period expense Id was not found',
          data: { workDisabilityPeriodExpenseId },
        }
      }
      const workDisabilityPeriodExpenseService = new WorkDisabilityPeriodExpenseService()
      const showWorkDisabilityPeriodExpense = await workDisabilityPeriodExpenseService.show(
        workDisabilityPeriodExpenseId
      )
      if (!showWorkDisabilityPeriodExpense) {
        return workDisabilityPeriodExpenseNotFoundResponse(response)
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disability period expenses',
          message: 'The work disability period expense was found successfully',
          data: { workDisabilityPeriodExpense: showWorkDisabilityPeriodExpense },
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
   * /api/work-disability-period-expenses/{workDisabilityPeriodExpenseId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Period Expenses
   *     summary: delete work disability period expense by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodExpenseId
   *         schema:
   *           type: number
   *         description: Work disability period expense id
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
      const workDisabilityPeriodExpenseId = request.param('workDisabilityPeriodExpenseId')
      if (!workDisabilityPeriodExpenseId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The work disability period expense Id was not found',
          data: { workDisabilityPeriodExpenseId },
        }
      }
      const currentWorkDisabilityPeriodExpense = await WorkDisabilityPeriodExpense.query()
        .whereNull('work_disability_period_expense_deleted_at')
        .where('work_disability_period_expense_id', workDisabilityPeriodExpenseId)
        .first()
      if (!currentWorkDisabilityPeriodExpense) {
        return workDisabilityPeriodExpenseNotFoundResponse(response)
      }
      const workDisabilityPeriodExpenseService = new WorkDisabilityPeriodExpenseService()
      const deleteWorkDisabilityPeriodExpense = await workDisabilityPeriodExpenseService.delete(
        currentWorkDisabilityPeriodExpense
      )
      if (deleteWorkDisabilityPeriodExpense) {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disability period expenses',
          message: 'The work disability period expense was deleted successfully',
          data: { workDisabilityPeriod: deleteWorkDisabilityPeriodExpense },
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
