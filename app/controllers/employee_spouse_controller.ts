import EmployeeSpouse from '#models/employee_spouse'
import EmployeeSpouseService from '#services/employee_spouse_service'
import {
  createEmployeeSpouseValidator,
  updateEmployeeSpouseValidator,
} from '#validators/employee_spouse'
import { HttpContext } from '@adonisjs/core/http'

export default class EmployeeSpouseController {
  /**
   * @swagger
   * /api/employee-spouses:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Spouses
   *     summary: create new employee spouse
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeSpouseFirstname:
   *                 type: string
   *                 description: Employee spouse first name
   *                 required: true
   *                 default: ''
   *               employeeSpouseLastname:
   *                 type: string
   *                 description: Employee spouse last name
   *                 required: true
   *                 default: ''
   *               employeeSpouseSecondLastname:
   *                 type: string
   *                 description: Employee spouse second last name
   *                 required: true
   *                 default: ''
   *               employeeSpouseOcupation:
   *                 type: string
   *                 description: Employee spouse ocupation
   *                 required: false
   *                 default: ''
   *               employeeSpouseBirthday:
   *                 type: string
   *                 format: date
   *                 description: Employee spouse birthday (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               employeeSpousePhone:
   *                 type: string
   *                 description: Employee spouse phone. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *                 required: false
   *                 default: ''
   *               employeeId:
   *                 type: number
   *                 description: Employee id
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
      const employeeSpouseFirstname = request.input('employeeSpouseFirstname')
      const employeeSpouseLastname = request.input('employeeSpouseLastname')
      const employeeSpouseSecondLastname = request.input('employeeSpouseSecondLastname')
      const employeeSpouseOcupation = request.input('employeeSpouseOcupation')
      const employeeId = request.input('employeeId')
      let employeeSpouseBirthday = request.input('employeeSpouseBirthday')
      employeeSpouseBirthday = employeeSpouseBirthday
        ? (employeeSpouseBirthday.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const employeeSpousePhone = request.input('employeeSpousePhone')
      const employeeSpouse = {
        employeeSpouseFirstname: employeeSpouseFirstname,
        employeeSpouseLastname: employeeSpouseLastname,
        employeeSpouseSecondLastname: employeeSpouseSecondLastname,
        employeeSpouseOcupation: employeeSpouseOcupation,
        employeeSpouseBirthday: employeeSpouseBirthday,
        employeeSpousePhone: employeeSpousePhone,
        employeeId: employeeId,
      } as EmployeeSpouse
      const employeeSpouseService = new EmployeeSpouseService()
      const exist = await employeeSpouseService.verifyInfoExist(employeeSpouse)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...employeeSpouse },
        }
      }
      await request.validateUsing(createEmployeeSpouseValidator)
      const newEmployeeSpouse = await employeeSpouseService.create(employeeSpouse)
      if (newEmployeeSpouse) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employee Spouse',
          message: 'The employee spouse was created successfully',
          data: { employeeSpouse: newEmployeeSpouse },
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
   * /api/employee-spouses/{employeeSpouseId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Spouses
   *     summary: update empoyee spouse
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeSpouseId
   *         schema:
   *           type: number
   *         description: Employee spouse id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeSpouseFirstname:
   *                 type: string
   *                 description: Employee spouse first name
   *                 required: true
   *                 default: ''
   *               employeeSpouseLastname:
   *                 type: string
   *                 description: Employee spouse last name
   *                 required: true
   *                 default: ''
   *               employeeSpouseSecondLastname:
   *                 type: string
   *                 description: Employee spouse second last name
   *                 required: true
   *                 default: ''
   *               employeeSpouseOcupation:
   *                 type: string
   *                 description: Employee spouse ocupation
   *                 required: false
   *                 default: ''
   *               employeeSpouseBirthday:
   *                 type: string
   *                 format: date
   *                 description: Employee spouse birthday (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               employeeSpousePhone:
   *                 type: string
   *                 description: Employee spouse phone. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *                 required: false
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
      const employeeSpouseId = request.param('employeeSpouseId')
      const employeeSpouseFirstname = request.input('employeeSpouseFirstname')
      const employeeSpouseLastname = request.input('employeeSpouseLastname')
      const employeeSpouseSecondLastname = request.input('employeeSpouseSecondLastname')
      const employeeSpouseOcupation = request.input('employeeSpouseOcupation')
      let employeeSpouseBirthday = request.input('employeeSpouseBirthday')
      employeeSpouseBirthday = employeeSpouseBirthday
        ? (employeeSpouseBirthday.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const employeeSpousePhone = request.input('employeeSpousePhone')
      const employeeSpouse = {
        employeeSpouseId: employeeSpouseId,
        employeeSpouseFirstname: employeeSpouseFirstname,
        employeeSpouseLastname: employeeSpouseLastname,
        employeeSpouseSecondLastname: employeeSpouseSecondLastname,
        employeeSpouseOcupation: employeeSpouseOcupation,
        employeeSpouseBirthday: employeeSpouseBirthday,
        employeeSpousePhone: employeeSpousePhone,
      } as EmployeeSpouse
      if (!employeeSpouseId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee spouse Id was not found',
          data: { ...employeeSpouse },
        }
      }

      const currentEmployeeSpouse = await EmployeeSpouse.query()
        .whereNull('employee_spouse_deleted_at')
        .where('employee_spouse_id', employeeSpouseId)
        .first()
      if (!currentEmployeeSpouse) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee spouse was not found',
          message: 'The employee spouse was not found with the entered ID',
          data: { ...employeeSpouse },
        }
      }
      const employeeSpouseService = new EmployeeSpouseService()
      await request.validateUsing(updateEmployeeSpouseValidator)
      const updateEmployeeSpouse = await employeeSpouseService.update(
        currentEmployeeSpouse,
        employeeSpouse
      )
      if (updateEmployeeSpouse) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee spouses',
          message: 'The employee spouse was updated successfully',
          data: { employeeSpouse: updateEmployeeSpouse },
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
   * /api/employee-spouses/{employeeSpouseId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Spouses
   *     summary: delete employee spouse
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeSpouseId
   *         schema:
   *           type: number
   *         description: Employee spouse id
   *         required: true
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
  async delete({ request, response }: HttpContext) {
    try {
      const employeeSpouseId = request.param('employeeSpouseId')
      if (!employeeSpouseId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee spouse Id was not found',
          message: 'Missing data to process',
          data: { employeeSpouseId },
        }
      }
      const currentEmployeeSpouse = await EmployeeSpouse.query()
        .whereNull('emoloyee_spouse_deleted_at')
        .where('employee_spouse_id', employeeSpouseId)
        .first()
      if (!currentEmployeeSpouse) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee spouse was not found',
          message: 'The employee spouse was not found with the entered ID',
          data: { employeeSpouseId },
        }
      }
      const employeeSpouseService = new EmployeeSpouseService()
      const deleteEmployeeSpouse = await employeeSpouseService.delete(currentEmployeeSpouse)
      if (deleteEmployeeSpouse) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employee spouse',
          message: 'The employee spouse was deleted successfully',
          data: { employeeSpouse: deleteEmployeeSpouse },
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
   * /api/employee-spouses/{employeeSpouseId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Spouses
   *     summary: get employee spouse by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeSpouseId
   *         schema:
   *           type: number
   *         description: Employee spouse id
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
      const employeeSpouseId = request.param('employeeSpouseId')
      if (!employeeSpouseId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee spouse Id was not found',
          data: { employeeSpouseId },
        }
      }
      const employeeSpouseService = new EmployeeSpouseService()
      const showEmployeeSpouse = await employeeSpouseService.show(employeeSpouseId)
      if (!showEmployeeSpouse) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee spouse was not found',
          message: 'The employee spouse was not found with the entered ID',
          data: { employeeSpouseId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee spouse',
          message: 'The employee spouse was found successfully',
          data: { employeeSpouse: showEmployeeSpouse },
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
