import Employee from '#models/employee'
import Person from '#models/person'
import { DateTime } from 'luxon'
import BiometricEmployeeInterface from '../interfaces/biometric_employee_interface.js'
import { PersonFilterSearchInterface } from '../interfaces/person_filter_search_interface.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import SyncAssistsService from './sync_assists_service.js'
import { I18n } from '@adonisjs/i18n'

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
        query.orWhereRaw('UPPER(person_phone) LIKE ?', [`%${filters.search.toUpperCase()}%`])
        query.orWhereRaw('UPPER(person_curp) LIKE ?', [`%${filters.search.toUpperCase()}%`])
        query.orWhereRaw('UPPER(person_rfc) LIKE ?', [`%${filters.search.toUpperCase()}%`])
        query.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [`%${filters.search.toUpperCase()}%`])
      })
      .orderBy('person_id')
      .paginate(filters.page, filters.limit)
    return persons
  }

  async create(person: Person) {
    const newPerson = new Person()
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

  async update(currentPerson: Person, person: Person) {
    const personBirthdayPast = currentPerson.personBirthday
    currentPerson.personFirstname = person.personFirstname
    currentPerson.personLastname = person.personLastname
    currentPerson.personSecondLastname = person.personSecondLastname || ''
    currentPerson.personBirthday = person.personBirthday
    currentPerson.personGender = person.personGender
    currentPerson.personPhone = person.personPhone
    currentPerson.personEmail = person.personEmail
    currentPerson.personCurp = person.personCurp
    currentPerson.personRfc = person.personRfc
    currentPerson.personImssNss = person.personImssNss
    currentPerson.personPhoneSecondary = person.personPhoneSecondary
    currentPerson.personMaritalStatus = person.personMaritalStatus
    currentPerson.personPlaceOfBirthCountry = person.personPlaceOfBirthCountry
    currentPerson.personPlaceOfBirthState = person.personPlaceOfBirthState
    currentPerson.personPlaceOfBirthCity = person.personPlaceOfBirthCity
    await currentPerson.save()

    await currentPerson.load('employee')
    if (currentPerson.employee) {
      if (currentPerson.personBirthday) {
        const birthdayDate = currentPerson.personBirthday;
        const date = typeof birthdayDate === 'string' ? new Date(birthdayDate) : birthdayDate;

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
        const fixedBirthdayString = person.personBirthday.replace('00:000:00', '00:00:00')

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

    return currentPerson
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

  async verifyInfo(person: Person) {
    const action = person.personId > 0 ? 'updated' : 'created'
    const existCurp = await Person.query()
      .if(person.personId > 0, (query) => {
        query.whereNot('person_id', person.personId)
      })
      .whereNull('person_deleted_at')
      .where('person_curp', person.personCurp)
      .first()

    if (existCurp && person.personCurp) {
      return {
        status: 400,
        type: 'warning',
        title: 'The person curp already exists for another person',
        message: `The person resource cannot be ${action} because the curp is already assigned to another person`,
        data: { ...person },
      }
    }
    const existRfc = await Person.query()
      .if(person.personId > 0, (query) => {
        query.whereNot('person_id', person.personId)
      })
      .whereNull('person_deleted_at')
      .where('person_rfc', person.personRfc)
      .first()

    if (existRfc && person.personRfc) {
      return {
        status: 400,
        type: 'warning',
        title: 'The person rfc already exists for another person',
        message: `The person resource cannot be ${action} because the rfc is already assigned to another person`,
        data: { ...person },
      }
    }
    const existImssNss = await Person.query()
      .if(person.personId > 0, (query) => {
        query.whereNot('person_id', person.personId)
      })
      .whereNull('person_deleted_at')
      .where('person_imss_nss', person.personImssNss)
      .first()

    if (existImssNss && person.personImssNss) {
      return {
        status: 400,
        type: 'warning',
        title: 'The person imss nss already exists for another person',
        message: `The person resource cannot be ${action} because the imss nss is already assigned to another person`,
        data: { ...person },
      }
    }
    const existEmail = await Person.query()
      .if(person.personId > 0, (query) => {
        query.whereNot('person_id', person.personId)
      })
      .whereNull('person_deleted_at')
      .where('person_email', person.personEmail)
      .first()

    if (existEmail && person.personEmail) {
      return {
        status: 400,
        type: 'warning',
        title: 'The person email already exists for another person',
        message: `The person resource cannot be ${action} because the email is already assigned to another person`,
        data: { ...person },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...person },
    }
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
      .orWhereRaw('UPPER(??) LIKE ?', [column, `%${search.toUpperCase()}%`])
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
}
