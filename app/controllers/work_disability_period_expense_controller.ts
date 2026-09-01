import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import WorkDisabilityPeriodExpense from '#models/work_disability_period_expense'
import WorkDisabilityPeriodExpenseService from '#services/work_disability_period_expense_service'
import { createWorkDisabilityPeriodExpenseValidator } from '#validators/work_disability_period_expense'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'

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
        size: '10mb',
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
      const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
      if (!allowedExtensions.includes(workDisabilityPeriodExpenseFile.extname || '')) {
        response.status(400)
        return {
          status: 400,
          type: 'warning',
          title: 'Please upload a valid file',
          message: 'Only PDF or image files are allowed',
          code: WORK_DISABILITY_ERROR_CODES.INVALID_FILE,
        }
      }
      if (!workDisabilityPeriodExpenseFile.isValid) {
        response.status(400)
        return {
          status: 400,
          type: 'warning',
          title: 'Please upload a valid file',
          message: workDisabilityPeriodExpenseFile.errors[0]?.message || 'Invalid file',
          code: WORK_DISABILITY_ERROR_CODES.FILE_TOO_LARGE,
        }
      }
      const uploadService = new UploadService()
      const fileUrl = await uploadService.fileUpload(workDisabilityPeriodExpenseFile, 'evidence-document', 'work-disability-period-expenses-files')
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
        size: '10mb',
      }
      const workDisabilityPeriodExpenseFile = request.file(
        'workDisabilityPeriodExpenseFile',
        validationOptions
      )
      if (workDisabilityPeriodExpenseFile) {
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
        if (!allowedExtensions.includes(workDisabilityPeriodExpenseFile.extname || '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: 'Only PDF or image files are allowed',
            code: WORK_DISABILITY_ERROR_CODES.INVALID_FILE,
          }
        }
        if (!workDisabilityPeriodExpenseFile.isValid) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a valid file',
            message: workDisabilityPeriodExpenseFile.errors[0]?.message || 'Invalid file',
            code: WORK_DISABILITY_ERROR_CODES.FILE_TOO_LARGE,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(workDisabilityPeriodExpenseFile, 'evidence-document', 'work-disability-period-expenses-files')
        if (currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseFile) {
          await uploadService.deleteFile(
            currentWorkDisabilityPeriodExpense.workDisabilityPeriodExpenseFile
          )
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
  /**
   * @swagger
   * /api/work-disability-period-expenses/{workDisabilityPeriodExpenseId}/download:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Period Expenses
   *     summary: download work disability period expense file (stream autenticado, USRH1787434050259)
   *     produces:
   *       - application/octet-stream
   *     parameters:
   *       - in: path
   *         name: workDisabilityPeriodExpenseId
   *         required: true
   *         schema:
   *           type: number
   *         description: Work disability period expense id
   *     responses:
   *       200:
   *         description: Stream binario del comprobante
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
   *         description: Comprobante no encontrado, fuera de tu alcance, o el X-Business-Unit-Id header es inválido (key BU.NOT.001)
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

      const rawId = request.param('workDisabilityPeriodExpenseId')
      const workDisabilityPeriodExpenseId = Number(rawId)

      if (!Number.isInteger(workDisabilityPeriodExpenseId) || workDisabilityPeriodExpenseId <= 0) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del comprobante de gasto es inválido',
          data: { workDisabilityPeriodExpenseId: rawId },
        }
      }

      // El propio modelo compone withBusinessUnitScope(): el filtro por tenant
      // se aplica automáticamente, no se necesita whereHas contra el periodo/empleado.
      const expense = await WorkDisabilityPeriodExpense.query()
        .where('work_disability_period_expense_id', workDisabilityPeriodExpenseId)
        .whereNull('work_disability_period_expense_deleted_at')
        .first()

      if (!expense) {
        return workDisabilityPeriodExpenseNotFoundResponse(response)
      }

      if (!expense.workDisabilityPeriodExpenseFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Archivo no encontrado',
          message: 'El comprobante de gasto no tiene un archivo asociado',
          data: null,
        }
      }

      const object = await uploadService.streamStoredFile(expense.workDisabilityPeriodExpenseFile)

      if (!object) {
        logger.warn(
          { workDisabilityPeriodExpenseId, path: expense.workDisabilityPeriodExpenseFile },
          'Comprobante de gasto de incapacidad registrado en BD pero no encontrado en almacenamiento'
        )
        response.status(404)
        return {
          type: 'warning',
          title: 'Archivo no encontrado',
          message: 'El archivo del comprobante de gasto no fue encontrado en el almacenamiento',
          data: null,
        }
      }

      const rawFileName = `comprobante-incapacidad-${workDisabilityPeriodExpenseId}`
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
        {
          err: error,
          workDisabilityPeriodExpenseId: request.param('workDisabilityPeriodExpenseId'),
        },
        'Error inesperado al descargar comprobante de gasto de incapacidad del almacenamiento'
      )
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al obtener el archivo del comprobante de gasto',
        error: error?.message,
      }
    }
  }
}
