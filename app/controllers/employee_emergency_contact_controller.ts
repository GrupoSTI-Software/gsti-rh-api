import EmployeeEmergencyContact from '#models/employee_emergency_contact'
import Employee from '#models/employee'
import EmployeeEmergencyContactService from '#services/employee_emergency_contact_service'
import {
  createEmployeeEmergencyContactValidator,
  updateEmployeeEmergencyContactValidator,
} from '#validators/employee_emergency_contact'
import { HttpContext } from '@adonisjs/core/http'

export default class EmployeeEmergencyContactController {
  /**
   * @swagger
   * /api/employee-emergency-contacts:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Emergency Contacts
   *     summary: create new employee emergency contact
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeEmergencyContactFirstname:
   *                 type: string
   *                 description: Employee emergency contact first name
   *                 required: true
   *                 default: ''
   *               employeeEmergencyContactLastname:
   *                 type: string
   *                 description: Employee emergency contact last name
   *                 required: true
   *                 default: ''
   *               employeeEmergencyContactSecondLastname:
   *                 type: string
   *                 description: Employee emergency contact second last name
   *                 required: true
   *                 default: ''
   *               employeeEmergencyContactRelationship:
   *                 type: string
   *                 description: Employee emergency contact relationship
   *                 required: false
   *                 default: ''
   *               employeeEmergencyContactPhone:
   *                 type: string
   *                 description: Employee emergency contact phone
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
      const employeeEmergencyContactFirstname = request.input('employeeEmergencyContactFirstname')
      const employeeEmergencyContactLastname = request.input('employeeEmergencyContactLastname')
      const employeeEmergencyContactSecondLastname = request.input(
        'employeeEmergencyContactSecondLastname'
      )
      const employeeEmergencyContactRelationship = request.input(
        'employeeEmergencyContactRelationship'
      )
      const employeeId = request.input('employeeId')
      let employeeEmergencyContactBirthday = request.input('employeeEmergencyContactBirthday')
      employeeEmergencyContactBirthday = employeeEmergencyContactBirthday
        ? (employeeEmergencyContactBirthday.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const employeeEmergencyContactPhone = request.input('employeeEmergencyContactPhone')
      const employeeEmergencyContact = {
        employeeEmergencyContactFirstname: employeeEmergencyContactFirstname,
        employeeEmergencyContactLastname: employeeEmergencyContactLastname,
        employeeEmergencyContactSecondLastname: employeeEmergencyContactSecondLastname,
        employeeEmergencyContactRelationship: employeeEmergencyContactRelationship,
        employeeEmergencyContactPhone: employeeEmergencyContactPhone,
        employeeId: employeeId,
      } as EmployeeEmergencyContact
      const employeeEmergencyContactService = new EmployeeEmergencyContactService()
      const exist = await employeeEmergencyContactService.verifyInfoExist(employeeEmergencyContact)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...employeeEmergencyContact },
        }
      }
      await request.validateUsing(createEmployeeEmergencyContactValidator)
      const newEmployeeEmergencyContact =
        await employeeEmergencyContactService.create(employeeEmergencyContact)
      if (newEmployeeEmergencyContact) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employee emergency contact',
          message: 'The employee emergency contact was created successfully',
          data: { employeeEmergencyContact: newEmployeeEmergencyContact },
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
   * /api/employee-emergency-contacts/{employeeEmergencyContactId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Emergency Contacts
   *     summary: update empoyee emergency contact
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeEmergencyContactId
   *         schema:
   *           type: number
   *         description: Employee emergency contact id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeEmergencyContactFirstname:
   *                 type: string
   *                 description: Employee emergency contact first name
   *                 required: true
   *                 default: ''
   *               employeeEmergencyContactLastname:
   *                 type: string
   *                 description: Employee emergency contact last name
   *                 required: true
   *                 default: ''
   *               employeeEmergencyContactSecondLastname:
   *                 type: string
   *                 description: Employee emergency contact second last name
   *                 required: true
   *                 default: ''
   *               employeeEmergencyContactRelationship:
   *                 type: string
   *                 description: Employee emergency contact relationship
   *                 required: false
   *                 default: ''
   *               employeeEmergencyContactPhone:
   *                 type: string
   *                 description: Employee emergency contact phone
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
      const employeeEmergencyContactId = request.param('employeeEmergencyContactId')
      const employeeEmergencyContactFirstname = request.input('employeeEmergencyContactFirstname')
      const employeeEmergencyContactLastname = request.input('employeeEmergencyContactLastname')
      const employeeEmergencyContactSecondLastname = request.input(
        'employeeEmergencyContactSecondLastname'
      )
      const employeeEmergencyContactRelationship = request.input(
        'employeeEmergencyContactRelationship'
      )
      let employeeEmergencyContactBirthday = request.input('employeeEmergencyContactBirthday')
      employeeEmergencyContactBirthday = employeeEmergencyContactBirthday
        ? (employeeEmergencyContactBirthday.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const employeeEmergencyContactPhone = request.input('employeeEmergencyContactPhone')
      const employeeEmergencyContact = {
        employeeEmergencyContactId: employeeEmergencyContactId,
        employeeEmergencyContactFirstname: employeeEmergencyContactFirstname,
        employeeEmergencyContactLastname: employeeEmergencyContactLastname,
        employeeEmergencyContactSecondLastname: employeeEmergencyContactSecondLastname,
        employeeEmergencyContactRelationship: employeeEmergencyContactRelationship,
        employeeEmergencyContactPhone: employeeEmergencyContactPhone,
      } as EmployeeEmergencyContact
      if (!employeeEmergencyContactId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee emergency contact Id was not found',
          data: { ...employeeEmergencyContact },
        }
      }
      const currentEmployeeEmergencyContact = await EmployeeEmergencyContact.query()
        .whereNull('employee_emergency_contact_deleted_at')
        .where('employee_emergency_contact_id', employeeEmergencyContactId)
        .first()
      if (!currentEmployeeEmergencyContact) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee emergency contact was not found',
          message: 'The employee emergency contact was not found with the entered ID',
          data: { ...employeeEmergencyContact },
        }
      }
      const employeeEmergencyContactService = new EmployeeEmergencyContactService()
      await request.validateUsing(updateEmployeeEmergencyContactValidator)
      const updateEmployeeEmergencyContact = await employeeEmergencyContactService.update(
        currentEmployeeEmergencyContact,
        employeeEmergencyContact
      )
      if (updateEmployeeEmergencyContact) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee emergency contacts',
          message: 'The employee emergency contact was updated successfully',
          data: { employeeEmergencyContact: updateEmployeeEmergencyContact },
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
   * /api/employee-emergency-contacts/{employeeEmergencyContactId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Emergency Contacts
   *     summary: delete employee emergency contact
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeEmergencyContactId
   *         schema:
   *           type: number
   *         description: Employee emergency contact id
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
      const employeeEmergencyContactId = request.param('employeeEmergencyContactId')
      if (!employeeEmergencyContactId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee emergency contact Id was not found',
          message: 'Missing data to process',
          data: { employeeEmergencyContactId },
        }
      }

      const currentEmployeeEmergencyContact = await EmployeeEmergencyContact.query()
        .whereNull('employee_emergency_contact_deleted_at')
        .where('employee_emergency_contact_id', employeeEmergencyContactId)
        .first()
      if (!currentEmployeeEmergencyContact) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee emergency contact was not found',
          message: 'The employee emergency contact was not found with the entered ID',
          data: { employeeEmergencyContactId },
        }
      }
      const employeeEmergencyContactService = new EmployeeEmergencyContactService()
      const deleteEmployeeEmergencyContact = await employeeEmergencyContactService.delete(
        currentEmployeeEmergencyContact
      )
      if (deleteEmployeeEmergencyContact) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employee emergency contacts',
          message: 'The employee emergency contact was deleted successfully',
          data: { employeeEmergencyContact: deleteEmployeeEmergencyContact },
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
   * /api/employee-emergency-contacts/{employeeEmergencyContactId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Emergency Contacts
   *     summary: get employee emergency contact by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeEmergencyContactId
   *         schema:
   *           type: number
   *         description: Employee emergency contact id
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
      const employeeEmergencyContactId = request.param('employeeEmergencyContactId')
      if (!employeeEmergencyContactId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee emergency contact Id was not found',
          data: { employeeEmergencyContactId },
        }
      }
      const employeeEmergencyContactService = new EmployeeEmergencyContactService()
      const showEmployeeEmergencyContact = await employeeEmergencyContactService.show(
        employeeEmergencyContactId
      )
      if (!showEmployeeEmergencyContact) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee emergency contact was not found',
          message: 'The employee emergency contact was not found with the entered ID',
          data: { employeeEmergencyContactId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee emergency contacts',
          message: 'The employee emergency contact was found successfully',
          data: { employeeEmergencyContact: showEmployeeEmergencyContact },
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
   * /api/employee-emergency-contacts/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Emergency Contacts
   *     summary: get employee emergency contacts by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
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
   *                   properties:
   *                     employeeEmergencyContacts:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/EmployeeEmergencyContact'
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
  async getByEmployeeId({ request, response }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee ID was not found',
          data: { employeeId },
        }
      }

      // Verificar que el empleado existe
      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', employeeId)
        .first()

      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Employee not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const employeeEmergencyContactService = new EmployeeEmergencyContactService()
      const employeeEmergencyContacts = await employeeEmergencyContactService.getByEmployeeId(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employee emergency contacts',
        message: `Found ${employeeEmergencyContacts.length} emergency contact(s) for employee`,
        data: { employeeEmergencyContacts },
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
