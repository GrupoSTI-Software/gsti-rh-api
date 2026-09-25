import { HttpContext } from '@adonisjs/core/http'
import { createPersonValidator, updatePersonValidator } from '../validators/person.js'
import Person from '#models/person'
import PersonService from '#services/person_service'
import { PersonFilterSearchInterface } from '../interfaces/person_filter_search_interface.js'
import db from '@adonisjs/lucid/services/db'
import {
  emailMirrorActorFromContext,
  mirrorPersonEmailToUserEmail,
  toPublicEmailMirrorOutcome,
} from '#helpers/person_user_email_mirror'
import {
  isEmailMirrorConflictError,
  isEmailMirrorRefusedError,
  isUserAccessEmailDuplicatedIndexError,
  respondEmailMirrorConflict,
  respondEmailMirrorRefused,
  respondUserAccessEmailDuplicated,
} from '#helpers/user_access_email_api_error'
import { personIsCollaborator } from '#helpers/person_is_collaborator'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { sessionUserOwnsPerson } from '#helpers/session_user_owns_employee'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'
import { TenantContext } from '#utils/tenant_context'
import type { PersonIdentityField } from '#constants/person_identity_error_codes'
import { resolveRacedIdentityField } from '#helpers/person_identity_lookup'
import {
  personIdentityDuplicatedFieldFromValidationError,
  personIdentityDuplicatedIndexFromError,
  respondPersonIdentityDuplicated,
  respondPersonIdentityMissingCompany,
} from '#helpers/person_identity_api_error'
import {
  EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION,
  EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import {
  EMPLOYEES_READ_PERMISSION_DECLARATIONS,
  EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION,
} from '#constants/employees_read_permission_declarations'
import {
  resolvePersonSubjectType,
  personSubjectRequiresCollaboratorWritePermission,
} from '#constants/person_subject_type'

type IdentityRecheckTarget = { person: Person; companyId: number }

/**
 * Carrera contra el UNIQUE por empresa (USRH1789698261610): MySQL reporta el
 * índice en su propio orden, así que se reverifica con `verifyInfo`, que aplica
 * CURP > RFC > NSS. El índice reportado queda solo como respaldo.
 */
async function racedIdentityField(
  indexField: PersonIdentityField,
  i18n: HttpContext['i18n'],
  target: IdentityRecheckTarget | null
): Promise<PersonIdentityField> {
  if (!target) return indexField
  try {
    const recheck = await new PersonService(i18n).verifyInfo(target.person, target.companyId)
    return resolveRacedIdentityField(recheck, indexField)
  } catch {
    return indexField
  }
}

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
   *               personSubjectType:
   *                 type: string
   *                 enum: [collaborator, system-user]
   *                 description: Destino declarado del alta (no se persiste). Ausente, vacío o desconocido se resuelve como 'collaborator' y exige permiso de escritura de persona colaborador.
   *                 required: false
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
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Sin permiso para modificar datos sensibles
   *                 detail:
   *                   type: string
   *                   example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó.
   *                 key:
   *                   type: string
   *                   example: sin-permiso-para-modificar-datos-sensibles
   *                 code:
   *                   type: string
   *                   example: EMP.SENS.WRITE.FORBIDDEN
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    let identityRecheck: IdentityRecheckTarget | null = null
    try {
      const subjectType = resolvePersonSubjectType(request.input('personSubjectType'))
      if (personSubjectRequiresCollaboratorWritePermission(subjectType)) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      // USRH1789698261610: sin empresa no hay veredicto de duplicados (regla 10).
      // En HTTP el middleware ya la exige; esta guardia cubre cualquier otro camino.
      const storeCompanyId = ctx.businessUnitScope?.[0] ?? TenantContext.getScope()[0] ?? null
      if (!storeCompanyId) {
        return respondPersonIdentityMissingCompany(ctx)
      }
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
        businessUnitId: storeCompanyId,
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
      identityRecheck = { person, companyId: storeCompanyId }
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
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      // USRH1789698261610 regla 6: el rechazo habla de negocio, nunca de BD.
      const duplicatedField = personIdentityDuplicatedFieldFromValidationError(error)
      if (duplicatedField) {
        return respondPersonIdentityDuplicated(ctx, duplicatedField)
      }
      const racedField = personIdentityDuplicatedIndexFromError(error)
      if (racedField) {
        return respondPersonIdentityDuplicated(
          ctx,
          await racedIdentityField(racedField, i18n, identityRecheck)
        )
      }
      if (error.code === 'E_VALIDATION_ERROR') {
        const messageError = error.messages?.[0]?.message ?? 'Validation error'
        response.status(422)
        return {
          type: 'validation_error',
          title: 'Validation error',
          message: 'The provided data is invalid',
          error: messageError,
          errors: error.messages,
        }
      }
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
   *                   properties:
   *                     person:
   *                       type: object
   *                       description: Persona actualizada
   *                     emailMirror:
   *                       type: object
   *                       description: Resultado del espejo del correo del expediente hacia la credencial de acceso
   *                       properties:
   *                         status:
   *                           type: string
   *                           enum: [written, skipped]
   *                           description: written si se copió el correo a la credencial; skipped si no se escribió
   *                         target:
   *                           type: string
   *                           description: Destino de la copia cuando status es written (users)
   *                         reason:
   *                           type: string
   *                           description: Motivo de la omisión cuando status es skipped
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
   *         description: >-
   *           The parameters entered are invalid or essential data is missing to process the request.
   *           También responde 400 con {title, detail, key, code} cuando el correo ya lo usa otra cuenta de acceso viva (USR.MAIL.002) o la persona tiene más de una cuenta viva (USR.MAIL.006). Ningún campo se guardó.
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
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó. O la cuenta de acceso de la persona no pertenece a las empresas del actor (USR.MAIL.005).
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Sin permiso para modificar datos sensibles
   *                 detail:
   *                   type: string
   *                   example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó.
   *                 key:
   *                   type: string
   *                   example: sin-permiso-para-modificar-datos-sensibles
   *                 code:
   *                   type: string
   *                   example: EMP.SENS.WRITE.FORBIDDEN
   */
  async update(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    let identityRecheck: IdentityRecheckTarget | null = null
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
      const updateCompanyId = ctx.businessUnitScope?.[0] ?? TenantContext.getScope()[0] ?? null
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
      if (!personId || !Number.isInteger(Number(personId))) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The person Id was not found',
          message: 'Missing data to process',
          data: { ...person },
        }
      }
      // USRH1789698261610: sin empresa no hay veredicto de duplicados (regla 10).
      if (!updateCompanyId) {
        return respondPersonIdentityMissingCompany(ctx)
      }
      identityRecheck = { person, companyId: updateCompanyId }
      if (await personIsCollaborator(Number(personId))) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION
        )
        if (!allowed) {
          return
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
      // B7: se escribe el valor validado (con trim), no el crudo del request.
      person.personEmail = data.personEmail ?? null
      const identityCheck = await personService.verifyInfo(person, updateCompanyId)
      if (identityCheck.status === 400) {
        return respondPersonIdentityMissingCompany(ctx)
      }
      if (identityCheck.status === 422 && identityCheck.field !== 'email') {
        return respondPersonIdentityDuplicated(ctx, identityCheck.field)
      }
      if (identityCheck.status === 422) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Dato duplicado',
          message: 'Ya existe un trabajador con el mismo valor en: correo electrónico',
          data: { ...data },
        }
      }
      const actor = emailMirrorActorFromContext(ctx)
      const personBirthdayPast = currentPerson.personBirthday
      const { updatePerson, emailMirror } = await db.transaction(async (trx) => {
        const before = await Person.query({ client: trx })
          .where('person_id', currentPerson.personId)
          .whereNull('person_deleted_at')
          .forUpdate()
          .first()
        const persisted = await personService.update(currentPerson, person, trx)
        const outcome = await mirrorPersonEmailToUserEmail({
          personId: currentPerson.personId,
          personEmail: person.personEmail,
          previousSourceEmail: before?.personEmail ?? null,
          actor,
          trx,
        })
        return { updatePerson: persisted, emailMirror: outcome }
      })
      await personService.syncBirthdayCalendar(updatePerson, personBirthdayPast, person.personBirthday)
      response.status(201)
      return {
        type: 'success',
        title: 'Persons',
        message: 'The person was updated successfully',
        data: { person: updatePerson, emailMirror: toPublicEmailMirrorOutcome(emailMirror) },
      }
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      if (isEmailMirrorConflictError(error)) return respondEmailMirrorConflict(ctx, error)
      if (isEmailMirrorRefusedError(error)) return respondEmailMirrorRefused(ctx, error)
      if (isUserAccessEmailDuplicatedIndexError(error)) return respondUserAccessEmailDuplicated(ctx)
      // USRH1789698261610 regla 6: el rechazo habla de negocio, nunca de BD.
      const duplicatedField = personIdentityDuplicatedFieldFromValidationError(error)
      if (duplicatedField) {
        return respondPersonIdentityDuplicated(ctx, duplicatedField)
      }
      const racedField = personIdentityDuplicatedIndexFromError(error)
      if (racedField) {
        return respondPersonIdentityDuplicated(
          ctx,
          await racedIdentityField(racedField, i18n, identityRecheck)
        )
      }
      if (error.code === 'E_VALIDATION_ERROR') {
        const messageError = error.messages?.[0]?.message ?? 'Validation error'
        response.status(422)
        return {
          type: 'validation_error',
          title: 'Validation error',
          message: 'The provided data is invalid',
          error: messageError,
          errors: error.messages,
        }
      }
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
  async delete(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      const personId = request.param('personId')
      if (!personId || !Number.isInteger(Number(personId))) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The person Id was not found',
          message: 'Missing data to process',
          data: { personId },
        }
      }
      if (await personIsCollaborator(Number(personId))) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION
        )
        if (!allowed) {
          return
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
  async show(ctx: HttpContext) {
    const { request, response, i18n } = ctx
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
      const personIdNumber = Number(personId)
      if (
        !sessionUserOwnsPerson(ctx.auth.user, personIdNumber) &&
        (await personIsCollaborator(personIdNumber))
      ) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION
        )
        if (!allowed) {
          return
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
  async getEmployee(ctx: HttpContext) {
    const { request, response, i18n } = ctx
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
      const personIdNumber = Number(personId)
      if (
        !sessionUserOwnsPerson(ctx.auth.user, personIdNumber) &&
        (await personIsCollaborator(personIdNumber))
      ) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeByPerson
        )
        if (!allowed) {
          return
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
