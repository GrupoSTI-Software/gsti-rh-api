import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import MaintenanceExpense from '#models/maintenance_expense'
import MaintenanceExpenseService from '#services/maintenance_expense_service'
import { createMaintenanceExpenseValidator } from '#validators/maintenance_expense'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'

export default class MaintenanceExpenseController {
  /**
   * @swagger
   * /api/maintenance-expenses:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Maintenance Expenses
   *     summary: Get all Maintenance Expenses
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search by tracking number or category
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         default: 100
   *         schema:
   *           type: integer
   *       - name: aircraftMaintenanceId
   *         in: query
   *         required: false
   *         description: Aircraft Maintenance ID
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: List of expenses fetched successfully
   *       '400':
   *         description: Invalid parameters
   *       '500':
   *         description: Server error
   */
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const aircraftMaintenanceId = request.input('aircraftMaintenanceId')

      const filters = {
        search,
        page,
        limit,
      }

      const maintenanceExpenseService = new MaintenanceExpenseService()
      const expenses = await maintenanceExpenseService.index(filters, aircraftMaintenanceId)

      response.status(200).send({
        type: 'success',
        title: 'Maintenance Expenses',
        message: 'The maintenance expenses were retrieved successfully',
        data: { expenses },
      })
    } catch (error) {
      response.status(500).send({
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error occurred on the server',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/maintenance-expenses:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Maintenance Expenses
   *     summary: Create a new Maintenance Expense
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/MaintenanceExpense'
   *     responses:
   *       '201':
   *         description: Maintenance expense created successfully
   *       '400':
   *         description: Validation error
   *       '500':
   *         description: Server error
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createMaintenanceExpenseValidator)
      const maintenanceExpenseData = {
        aircraftMaintenanceId: data.aircraftMaintenanceId,
        maintenanceExpenseCategoryId: data.maintenanceExpenseCategoryId,
        maintenanceExpenseAmount: data.maintenanceExpenseAmount,
        maintenanceExpenseTrackingNumber: data.maintenanceExpenseTrackingNumber,
        maintenanceExpenseInternalFolio: data.maintenanceExpenseInternalFolio,
      } as MaintenanceExpense

      const maintenanceExpenseService = new MaintenanceExpenseService()
      const valid = await maintenanceExpenseService.verifyInfo(maintenanceExpenseData)

      if (valid.status !== 200) {
        response.status(valid.status).send(valid)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }
      const validationOptions = {
        types: ['image', 'pdf'],
        size: '',
      }
      const photo = request.file('photo', validationOptions)
      if (photo) {
        const allowedExtensions = ['jpeg', 'jpg', 'png', 'webp', 'pdf']
        if (!allowedExtensions.includes(photo.extname ? photo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: photo,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(photo, 'evidence-document', 'maintenance-expense')
        maintenanceExpenseData.maintenanceExpenseTicket = fileUrl
      }
      const newExpense = await maintenanceExpenseService.create(maintenanceExpenseData)

      response.status(201).send({
        type: 'success',
        title: 'Maintenance Expense Created',
        message: 'The expense was recorded successfully',
        data: { expense: newExpense },
      })
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500).send({
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error occurred on the server',
        error: messageError,
      })
    }
  }

  /**
   * @swagger
   * /api/maintenance-expenses/{maintenanceExpenseId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Maintenance Expenses
   *     summary: Update Maintenance Expense
   *     parameters:
   *       - in: path
   *         name: maintenanceExpenseId
   *         schema:
   *           type: number
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/MaintenanceExpense'
   *     responses:
   *       '200':
   *         description: Expense updated successfully
   *       '400':
   *         description: Validation error
   *       '404':
   *         description: Expense not found
   *       '500':
   *         description: Server error
   */
  async update({ request, response }: HttpContext) {
    try {
      const maintenanceExpenseId = request.param('id')
      const data = await request.validateUsing(createMaintenanceExpenseValidator)
      const maintenanceExpenseData = {
        maintenanceExpenseId,
        maintenanceExpenseCategoryId: data.maintenanceExpenseCategoryId,
        maintenanceExpenseAmount: data.maintenanceExpenseAmount,
        maintenanceExpenseInternalFolio: data.maintenanceExpenseInternalFolio,
        maintenanceExpenseTrackingNumber: data.maintenanceExpenseTrackingNumber,
        aircraftMaintenanceId: data.aircraftMaintenanceId,
      } as MaintenanceExpense

      const expense = await MaintenanceExpense.find(maintenanceExpenseId)
      if (!expense) {
        response.status(404).send({
          type: 'error',
          title: 'Expense Not Found',
          message: 'No expense found with the given ID',
        })
        return
      }

      const maintenanceExpenseService = new MaintenanceExpenseService()
      const valid = await maintenanceExpenseService.verifyInfo(maintenanceExpenseData)

      const validationOptions = {
        types: ['image', 'pdf'],
        size: '',
      }
      const photo = request.file('photo', validationOptions)
      maintenanceExpenseData.maintenanceExpenseTicket = expense.maintenanceExpenseTicket
      if (photo) {
        const allowedExtensions = ['jpeg', 'jpg', 'png', 'webp', 'pdf']
        if (!allowedExtensions.includes(photo.extname ? photo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: photo,
          }
        }
        const uploadService = new UploadService()
        if (expense.maintenanceExpenseTicket) {
          const fileNameWithExt = path.basename(expense.maintenanceExpenseTicket)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/maintenance-expense/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileUrl = await uploadService.fileUpload(photo, 'evidence-document', 'maintenance-expense')
        maintenanceExpenseData.maintenanceExpenseTicket = fileUrl
      }
      if (valid.status !== 200) {
        response.status(valid.status).send(valid)
        return
      }

      const updatedExpense = await maintenanceExpenseService.update(expense, maintenanceExpenseData)

      response.status(200).send({
        type: 'success',
        title: 'Expense Updated',
        message: 'The expense was updated successfully',
        data: { expense: updatedExpense },
      })
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500).send({
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error occurred on the server',
        error: messageError,
      })
    }
  }

  /**
   * @swagger
   * /api/maintenance-expenses/{maintenanceExpenseId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Maintenance Expenses
   *     summary: Delete Maintenance Expense
   *     parameters:
   *       - in: path
   *         name: maintenanceExpenseId
   *         schema:
   *           type: number
   *         required: true
   *     responses:
   *       '200':
   *         description: Expense deleted successfully
   *       '404':
   *         description: Expense not found
   *       '500':
   *         description: Server error
   */
  async destroy({ request, response }: HttpContext) {
    try {
      const maintenanceExpenseId = request.param('id')
      const expense = await MaintenanceExpense.find(maintenanceExpenseId)

      if (!expense) {
        response.status(404).send({
          type: 'error',
          title: 'Expense Not Found',
          message: 'No expense found with the given ID',
        })
        return
      }

      const maintenanceExpenseService = new MaintenanceExpenseService()
      await maintenanceExpenseService.delete(expense)

      response.status(200).send({
        type: 'success',
        title: 'Expense Deleted',
        message: 'The expense was deleted successfully',
      })
    } catch (error) {
      response.status(500).send({
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error occurred on the server',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/maintenance-expenses/{maintenanceExpenseId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Maintenance Expenses
   *     summary: Get Maintenance Expense by ID
   *     parameters:
   *       - in: path
   *         name: maintenanceExpenseId
   *         schema:
   *           type: number
   *         required: true
   *     responses:
   *       '200':
   *         description: Expense found
   *       '404':
   *         description: Expense not found
   *       '500':
   *         description: Server error
   */
  async show({ request, response }: HttpContext) {
    try {
      const maintenanceExpenseId = request.param('id')
      const expense = await MaintenanceExpense.find(maintenanceExpenseId)

      if (!expense) {
        response.status(404).send({
          type: 'error',
          title: 'Expense Not Found',
          message: 'No expense found with the given ID',
        })
        return
      }

      response.status(200).send({
        type: 'success',
        title: 'Expense Found',
        message: 'The expense was found successfully',
        data: { expense },
      })
    } catch (error) {
      response.status(500).send({
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error occurred on the server',
        error: error.message,
      })
    }
  }
}
