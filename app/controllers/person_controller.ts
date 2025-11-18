import { HttpContext } from '@adonisjs/core/http'
import { createPersonValidator, updatePersonValidator } from '../validators/person.js'
import Person from '#models/person'
import PersonService from '#services/person_service'
import { PersonFilterSearchInterface } from '../interfaces/person_filter_search_interface.js'

export default class PersonController {
  /**
   * @swagger
   * /api/persons:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Persons
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
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
   *                   description: Response message
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ request, response, i18n }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        page: page,
        limit: limit,
      } as PersonFilterSearchInterface
      const personService = new PersonService(i18n)
      const persons = await personService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Persons',
        message: 'The persons were found successfully',
        data: {
          persons,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/persons:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Persons
   *     summary: create new person
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               personFirstname:
   *                 type: string
   *                 description: Person first name
   *                 required: true
   *                 default: ''
   *               personLastname:
   *                 type: string
   *                 description: Person last name
   *                 required: true
   *                 default: ''
   *               personSecondLastname:
   *                 type: string
   *                 description: Person second last name
   *                 required: false
   *                 default: ''
   *               personGender:
   *                 type: string
   *                 description: Person gender
   *                 required: false
   *                 default: ''
   *               personBirthday:
   *                 type: string
   *                 format: date
   *                 description: Person birthday (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               personPhone:
   *                 type: string
   *                 description: Person phone
   *                 required: false
   *                 default: ''
   *               personEmail:
   *                 type: string
   *                 description: Person email
   *                 required: false
   *                 default: ''
   *               personCurp:
   *                 type: string
   *                 description: Person CURP
   *                 required: false
   *                 default: ''
   *               personRfc:
   *                 type: string
   *                 description: Person RFC
   *                 required: false
   *                 default: ''
   *               personImssNss:
   *                 type: string
   *                 description: Person IMSS NSS
   *                 required: false
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
  async store({ request, response, i18n }: HttpContext) {
    try {
      const personFirstname = request.input('personFirstname')
      const personLastname = request.input('personLastname')
      const personSecondLastname = request.input('personSecondLastname')
      const personGender = request.input('personGender')
      let personBirthday = request.input('personBirthday')
      personBirthday = personBirthday
        ? (personBirthday.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const personPhone = request.input('personPhone')
      const personEmail = request.input('personEmail')
      const personCurp = request.input('personCurp')
      const personRfc = request.input('personRfc')
      const personImssNss = request.input('personImssNss')
      const person = {
        personFirstname: personFirstname,
        personLastname: personLastname,
        personSecondLastname: personSecondLastname || '',
        personGender: personGender,
        personBirthday: personBirthday,
        personPhone: personPhone,
        personEmail: personEmail,
        personCurp: personCurp,
        personRfc: personRfc,
        personImssNss: personImssNss,
      } as Person
      const personService = new PersonService(i18n)
      await request.validateUsing(createPersonValidator)
      const newPerson = await personService.create(person)
      if (newPerson) {
        response.status(201)
        return {
          type: 'success',
          title: 'Persons',
          message: 'The person was created successfully',
          data: { person: newPerson },
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
   * /api/persons/{personId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Persons
   *     summary: update person
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: personId
   *         schema:
   *           type: number
   *         description: Person id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               personFirstname:
   *                 type: string
   *                 description: Person first name
   *                 required: true
   *                 default: ''
   *               personLastname:
   *                 type: string
   *                 description: Person last name
   *                 required: true
   *                 default: ''
   *               personSecondLastname:
   *                 type: string
   *                 description: Person second last name
   *                 required: false
   *                 default: ''
   *               personGender:
   *                 type: string
   *                 description: Person gender
   *                 required: false
   *                 default: ''
   *               personBirthday:
   *                 type: string
   *                 format: date
   *                 description: Person birthday (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               personPhone:
   *                 type: string
   *                 description: Person phone
   *                 required: false
   *                 default: ''
   *               personEmail:
   *                 type: string
   *                 description: Person email
   *                 required: false
   *                 default: ''
   *               personCurp:
   *                 type: string
   *                 description: Person CURP
   *                 required: false
   *                 default: ''
   *               personRfc:
   *                 type: string
   *                 description: Person RFC
   *                 required: false
   *                 default: ''
   *               personImssNss:
   *                 type: string
   *                 description: Person IMSS NSS
   *                 required: false
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
  async update({ request, response, i18n }: HttpContext) {
    try {
      const personId = request.param('personId')
      const personFirstname = request.input('personFirstname')
      const personLastname = request.input('personLastname')
      const personSecondLastname = request.input('personSecondLastname')
      const personGender = request.input('personGender')
      let personBirthday = request.input('personBirthday')
      personBirthday = personBirthday
        ? (personBirthday.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const personPhone = request.input('personPhone')
      const personEmail = request.input('personEmail')
      const personCurp = request.input('personCurp')
      const personRfc = request.input('personRfc')
      const personImssNss = request.input('personImssNss')
      const personPhoneSecondary = request.input('personPhoneSecondary')
      const personMaritalStatus = request.input('personMaritalStatus')
      const personPlaceOfBirthCountry = request.input('personPlaceOfBirthCountry')
      const personPlaceOfBirthState = request.input('personPlaceOfBirthState')
      const personPlaceOfBirthCity = request.input('personPlaceOfBirthCity')
      const person = {
        personId: personId,
        personFirstname: personFirstname,
        personLastname: personLastname,
        personSecondLastname: personSecondLastname || '',
        personGender: personGender,
        personBirthday: personBirthday,
        personPhone: personPhone,
        personEmail: personEmail,
        personCurp: personCurp,
        personRfc: personRfc,
        personImssNss: personImssNss,
        personPhoneSecondary: personPhoneSecondary,
        personMaritalStatus: personMaritalStatus,
        personPlaceOfBirthCountry: personPlaceOfBirthCountry,
        personPlaceOfBirthState: personPlaceOfBirthState,
        personPlaceOfBirthCity: personPlaceOfBirthCity,
      } as Person
      if (!personId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The person Id was not found',
          message: 'Missing data to process',
          data: { ...person },
        }
      }
      const currentPerson = await Person.query()
        .whereNull('person_deleted_at')
        .where('person_id', personId)
        .first()
      if (!currentPerson) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The person was not found',
          message: 'The person was not found with the entered ID',
          data: { ...person },
        }
      }
      const personService = new PersonService(i18n)
      const data = await request.validateUsing(updatePersonValidator)
      const verifyInfo = await personService.verifyInfo(person)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updatePerson = await personService.update(currentPerson, person)
      if (updatePerson) {
        response.status(201)
        return {
          type: 'success',
          title: 'Persons',
          message: 'The person was updated successfully',
          data: { person: updatePerson },
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
   * /api/persons/{personId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Persons
   *     summary: delete person
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: personId
   *         schema:
   *           type: number
   *         description: Person id
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
  async delete({ request, response, i18n }: HttpContext) {
    try {
      const personId = request.param('personId')
      if (!personId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The person Id was not found',
          message: 'Missing data to process',
          data: { personId },
        }
      }
      const currentPerson = await Person.query()
        .whereNull('person_deleted_at')
        .where('person_id', personId)
        .first()
      if (!currentPerson) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The person was not found',
          message: 'The person was not found with the entered ID',
          data: { personId },
        }
      }
      const personService = new PersonService(i18n)
      const deletePerson = await personService.delete(currentPerson)
      if (deletePerson) {
        response.status(201)
        return {
          type: 'success',
          title: 'Person',
          message: 'The person was deleted successfully',
          data: { person: deletePerson },
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
   * /api/persons/{personId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Persons
   *     summary: get person by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: personId
   *         schema:
   *           type: number
   *         description: Person id
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
      const personId = request.param('personId')
      if (!personId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The person Id was not found',
          message: 'Missing data to process',
          data: { personId },
        }
      }
      const personService = new PersonService(i18n)
      const showPerson = await personService.show(personId)
      if (!showPerson) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The person was not found',
          message: 'The person was not found with the entered ID',
          data: { personId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Persons',
          message: 'The person was found successfully',
          data: { person: showPerson },
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
   * /api/person-get-employee/{personId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Persons
   *     summary: get employee by person id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: personId
   *         schema:
   *           type: number
   *         description: Person id
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
  async getEmployee({ request, response, i18n }: HttpContext) {
    try {
      const personId = request.param('personId')
      if (!personId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The person Id was not found',
          message: 'Missing data to process',
          data: { personId },
        }
      }
      const personService = new PersonService(i18n)
      const employee = await personService.getEmployee(personId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { personId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Persons',
          message: 'The employee was found successfully',
          data: { employee: employee },
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
   * /api/persons-get-places-of-birth:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Persons
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: field
   *         in: query
   *         required: true
   *         description: Field
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
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
   *                   description: Response message
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getPlacesOfBirth({ request, response, i18n }: HttpContext) {
    try {
      const search = request.input('search')
      const field = request.input('field')
      const personService = new PersonService(i18n)
      const places = await personService.getPlacesOfBirth(search, field)
      response.status(200)
      return {
        type: 'success',
        title: 'Persons',
        message: 'The person places of birth were found successfully',
        data: {
          places,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
