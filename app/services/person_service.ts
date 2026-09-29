import Employee from '#models/employee'
import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'
import { livePersonWithIdentityExists } from '#helpers/person_identity_lookup'
import { personEmailExistsGlobally } from '#helpers/person_email_global_uniqueness'
import { DateTime } from 'luxon'
import BiometricEmployeeInterface from '../interfaces/biometric_employee_interface.js'
import { PersonFilterSearchInterface } from '../interfaces/person_filter_search_interface.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import SyncAssistsService from './sync_assists_service.js'
import { I18n } from '@adonisjs/i18n'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class PersonService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async syncCreate(employee: BiometricEmployeeInterface) {
    const newPerson = new Person()
    newPerson.personFirstname = employee.firstName
    newPerson.personLastname = employee.lastName
    newPerson.personSecondLastname = employee.secondLastName || ''
    if (employee.gender) {
      if (employee.gender === 'M') {
        newPerson.personGender = 'Hombre'
      } else if (employee.gender === 'F') {
        newPerson.personGender = 'Mujer'
      }
    }
    await newPerson.save()
    return newPerson
  }

  async index(filters: PersonFilterSearchInterface) {
    const persons = await Person.query()
      .if(filters.search, (query) => {
        query.whereRaw(
          'UPPER(CONCAT(person_firstname, " ", person_lastname, " ", person_second_lastname)) LIKE ?',
          [`%${filters.search.toUpperCase()}%`]
        )
        // PUNTO DE REINTRODUCCIÓN 08-10-04-01: búsqueda por phone/curp/rfc/nss cifrados
      })
      .orderBy('person_id')
      .paginate(filters.page, filters.limit)
    return persons
  }

  /**
   * @param trx Transacción opcional (p. ej. la del alta self-service en
   * `SignupDraftService.complete()`, USRH1783712837572). Sin `trx`, se
   * comporta igual que antes (compatible hacia atrás).
   */
  async create(person: Person, trx?: TransactionClientContract) {
    const newPerson = new Person()
    // USRH1789698261609: la marca viaja con la persona que arma el llamador
    // (signup self-service). Con contexto de tenant y sin marca, la pone el hook
    // del modelo; sin contexto y sin marca queda null (persona de plataforma).
    newPerson.businessUnitId = person.businessUnitId ?? null
    newPerson.personFirstname = person.personFirstname
    newPerson.personLastname = person.personLastname
    newPerson.personSecondLastname = person.personSecondLastname || ''
    newPerson.personBirthday = person.personBirthday
    newPerson.personGender = person.personGender
    newPerson.personPhone = person.personPhone
    newPerson.personEmail = person.personEmail
    newPerson.personCurp = person.personCurp
    newPerson.personRfc = person.personRfc
    newPerson.personImssNss = person.personImssNss
    newPerson.personPhoneSecondary = person.personPhoneSecondary
    newPerson.personMaritalStatus = person.personMaritalStatus
    newPerson.personPlaceOfBirthCountry = person.personPlaceOfBirthCountry
    newPerson.personPlaceOfBirthState = person.personPlaceOfBirthState
    newPerson.personPlaceOfBirthCity = person.personPlaceOfBirthCity
    if (trx) {
      newPerson.useTransaction(trx)
    }
    await newPerson.save()

    await newPerson.load('employee')
    if (newPerson.employee) {
      if (newPerson.personBirthday) {
        const birthdayDate = newPerson.personBirthday;
        const date = typeof birthdayDate === 'string' ? new Date(birthdayDate) : birthdayDate;

        const currentYear = new Date().getFullYear()
        const month = date.getMonth()
        const day = date.getDate()

        let updatedBirthday = new Date(currentYear, month, day)
        if (updatedBirthday.getMonth() !== month || updatedBirthday.getDate() !== day) {
          updatedBirthday = new Date(currentYear, 1, 28)
        }
        await this.updateAssistCalendar(newPerson.employee.employeeId, updatedBirthday)
      }
    }
    return newPerson
  }

  /**
   * @param trx La del llamador (USRH1789698261612). Con `trx`, el recálculo del
   * calendario de asistencia NO corre aquí: es dato derivado y recalculable,
   * `SyncAssistsService` no acepta transacción, y lo dispara el llamador con
   * `syncBirthdayCalendar` después del commit.
   */
  async update(currentPerson: Person, person: Person, trx?: TransactionClientContract) {
    const personBirthdayPast = currentPerson.personBirthday
    currentPerson.personFirstname = person.personFirstname
    currentPerson.personLastname = person.personLastname
    currentPerson.personSecondLastname = person.personSecondLastname || ''
    currentPerson.personBirthday = person.personBirthday
    currentPerson.personGender = person.personGender
    // Campos sensibles: null = "no actualizar" — el BO los envía como null cuando
    // los muestra enmascarados y el usuario no los modificó en esa sesión.
    // Solo se sobreescribe si llega un valor concreto (string no nulo).
    if (person.personPhone !== null && person.personPhone !== undefined) {
      currentPerson.personPhone = person.personPhone
    }
    if (person.personPhoneSecondary !== null && person.personPhoneSecondary !== undefined) {
      currentPerson.personPhoneSecondary = person.personPhoneSecondary
    }
    if (person.personEmail !== null && person.personEmail !== undefined) {
      currentPerson.personEmail = person.personEmail
    }
    if (person.personCurp !== null && person.personCurp !== undefined) {
      currentPerson.personCurp = person.personCurp
    }
    if (person.personRfc !== null && person.personRfc !== undefined) {
      currentPerson.personRfc = person.personRfc
    }
    if (person.personImssNss !== null && person.personImssNss !== undefined) {
      currentPerson.personImssNss = person.personImssNss
    }
    currentPerson.personMaritalStatus = person.personMaritalStatus
    currentPerson.personPlaceOfBirthCountry = person.personPlaceOfBirthCountry
    currentPerson.personPlaceOfBirthState = person.personPlaceOfBirthState
    currentPerson.personPlaceOfBirthCity = person.personPlaceOfBirthCity
    if (trx) currentPerson.useTransaction(trx)
    await currentPerson.save()

    await currentPerson.load('employee')
    if (!trx) {
      await this.syncBirthdayCalendar(currentPerson, personBirthdayPast, person.personBirthday)
    }
    return currentPerson
  }

  /**
   * Recalcula el día de cumpleaños en el calendario de asistencia del empleado
   * de la persona (año en curso y, si cambió, la fecha anterior ya vencida).
   * Requiere `currentPerson.employee` cargado.
   */
  async syncBirthdayCalendar(
    currentPerson: Person,
    personBirthdayPast: string | null,
    personBirthdayInput: string | null
  ) {
    if (!currentPerson.employee) return
    if (currentPerson.personBirthday) {
      const birthdayDate = currentPerson.personBirthday
      const date = typeof birthdayDate === 'string' ? new Date(birthdayDate) : birthdayDate

      const currentYear = new Date().getFullYear()
      const month = date.getMonth()
      const day = date.getDate()

      let updatedBirthday = new Date(currentYear, month, day)
      if (updatedBirthday.getMonth() !== month || updatedBirthday.getDate() !== day) {
        updatedBirthday = new Date(currentYear, 1, 28)
      }
      await this.updateAssistCalendar(currentPerson.employee.employeeId, updatedBirthday)
    }
    if (personBirthdayPast) {
      const newPersonBirthdayPast = new Date(personBirthdayPast)
      const datePast = typeof newPersonBirthdayPast === 'string' ? new Date(newPersonBirthdayPast) : newPersonBirthdayPast
      const fixedBirthdayString = personBirthdayInput!.replace('00:000:00', '00:00:00')

      const birthdayISO = DateTime.fromFormat(fixedBirthdayString, 'yyyy-MM-dd HH:mm:ss').toISO()
      const datePastISO = DateTime.fromJSDate(datePast).toISO()

      if (datePastISO !== birthdayISO) {
        const today = new Date()
        const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        if (datePast <= todayAtMidnight) {
          await this.updateAssistCalendar(currentPerson.employee.employeeId, datePast)
        }
      }
    }
  }

  async delete(currentPerson: Person) {
    await currentPerson.delete()
    return currentPerson
  }

  async show(personId: number) {
    const person = await Person.query()
      .whereNull('person_deleted_at')
      .where('person_id', personId)
      .preload('user')
      .first()
    return person ? person : null
  }

  async getEmployee(personId: number) {
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('person_id', personId)
      .preload('department')
      .preload('position')
      .first()
    return employee ? employee : null
  }

  /**
   * Comprueba los datos de identidad del expediente antes de escribirlo (USRH1789698261614).
   *
   * Devuelve una unión discriminada, no un cuerpo de respuesta: traducir a HTTP
   * es del controlador, y en el caso del correo, del emisor único
   * `respondPersonEmailNotAvailable` compartido con `POST /api/persons`, que es
   * lo que hace que los dos caminos respondan byte a byte igual. El correo se
   * comprueba GLOBAL a propósito (puede ser credencial) y precede a CURP/RFC/NSS:
   * si coinciden ambos, responde el que no revela; nunca se acumulan. RFC, CURP y
   * NSS se comparan SOLO dentro de la empresa indicada; sin empresa no hay
   * veredicto: se informa y quien llama responde 400. Solo cuentan los vivos: la
   * baja libera.
   */
  async verifyInfo(
    person: Person,
    businessUnitId: number | null | undefined
  ): Promise<
    | { status: 200 }
    | { status: 400; missingCompany: true }
    | { status: 422; field: 'curp' | 'rfc' | 'nss' }
    | { status: 422; reason: 'email-not-available' }
  > {
    if (!businessUnitId) return { status: 400, missingCompany: true }

    const excludePersonId = person.personId > 0 ? person.personId : 0

    if (person.personEmail && person.personEmail.trim() !== '') {
      if (await personEmailExistsGlobally(person.personEmail, excludePersonId)) {
        return { status: 422, reason: 'email-not-available' }
      }
    }

    if (person.personCurp && person.personCurp.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'curp',
        blindIndex(person.personCurp),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'curp' }
    }

    if (person.personRfc && person.personRfc.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'rfc',
        blindIndex(person.personRfc),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'rfc' }
    }

    if (person.personImssNss && person.personImssNss.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'nss',
        blindIndex(person.personImssNss),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'nss' }
    }

    return { status: 200 }
  }

  async getPlacesOfBirth(search: string, field: 'countries' | 'states' | 'cities') {
    const fieldMap: { [key in 'countries' | 'states' | 'cities']: string } = {
      countries: 'person_place_of_birth_country',
      states: 'person_place_of_birth_state',
      cities: 'person_place_of_birth_city',
    }
    const column = fieldMap[field]
    if (!column) return []
    const persons = await Person.query()
      .distinct(column)
      // USRH1789698261609: `whereRaw`, no `orWhereRaw`. Es la única condición
      // previa de la query, así que el `or` era semánticamente inútil; con `or`
      // quedaba expuesto a que un futuro `.orWhere*()` agregado aquí generara
      // `A OR (B AND business_unit_id IN (...))` y filtrara filas de otro
      // tenant por la rama A, porque el mixin de tenant inyecta su filtro AL
      // FINAL. `whereRaw` cierra esa trampa estructuralmente.
      .whereRaw('UPPER(??) LIKE ?', [column, `%${search.toUpperCase()}%`])
      .withTrashed()
      .orderBy(column)

    return persons
  }

  async updateAssistCalendar(employeeId: number, date: Date) {
    const dateStart = new Date(date)
    dateStart.setDate(dateStart.getDate())

    const dateEnd = new Date(date)
    dateEnd.setDate(dateEnd.getDate())

    const filter: SyncAssistsServiceIndexInterface = {
        date: this.formatDate(dateStart),
        dateEnd: this.formatDate(dateEnd),
        employeeID: employeeId
      }
      const syncAssistsService = new SyncAssistsService(this.i18n)
      await syncAssistsService.setDateCalendar(filter)
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }


  /**
   * Crea una persona demo con los datos proporcionados
   * @param firstName - Nombre
   * @param lastName - Apellido paterno
   * @param secondLastName - Apellido materno
   * @param gender - Género
   * @param phone - Teléfono
   * @param email - Email
   * @param curp - CURP
   * @param rfc - RFC
   * @param imssNss - NSS
   * @param maritalStatus - Estado civil
   * @param birthDate - Fecha de nacimiento
   * @param birthState - Estado de nacimiento
   * @param birthCity - Ciudad de nacimiento
   * @param birthCountry - País de nacimiento
   * @returns Persona creada
   */
  async createDemoPerson(
    firstName: string,
    lastName: string,
    secondLastName: string,
    gender: string,
    phone: string,
    email: string,
    curp: string,
    rfc: string,
    imssNss: string,
    maritalStatus: string,
    birthDate: string,
    birthState: string,
    birthCity: string,
    birthCountry: string,
  ): Promise<Person> {
    const person = new Person()
    person.personFirstname = firstName
    person.personLastname = lastName
    person.personSecondLastname = secondLastName || '.'
    person.personGender = gender
    person.personPhone = phone
    person.personEmail = email
    person.personCurp = curp
    person.personRfc = rfc
    person.personImssNss = imssNss
    person.personMaritalStatus = maritalStatus
    person.personBirthday = birthDate
    person.personPlaceOfBirthCountry = birthCountry
    person.personPlaceOfBirthState = birthState
    person.personPlaceOfBirthCity = birthCity
    await person.save()
    return person
  }
}
