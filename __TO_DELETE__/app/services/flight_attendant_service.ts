import FlightAttendants from '#models/flight_attendant'
import Employee from '#models/employee'
import FlightAttendantsProceedingFile from '#models/flight_attendant_proceeding_file'
import { FlightAttendantFilterSearchInterface } from '../interfaces/flight_attendant_filter_search_interface.js'
import Pilot from '#models/pilot'
import Customer from '#models/customer'

export default class FlightAttendantService {
  async index(filters: FlightAttendantFilterSearchInterface) {
    const flightAttendants = await FlightAttendants.query()
      .whereNull('flight_attendant_deleted_at')
      .if(filters.search, (query) => {
        query.where((subQuery) => {
          subQuery.whereHas('employee', (employeeQuery) => {
            employeeQuery.whereHas('person', (personQuery) => {
              // PUNTO DE REINTRODUCCIÓN 08-10-04-01: búsqueda por rfc/curp/nss cifrados
              personQuery.whereRaw(
                'UPPER(CONCAT(person_firstname, " ", person_lastname, " ", person_second_lastname)) LIKE ?',
                [`%${filters.search.toUpperCase()}%`]
              )
            })
          })
        })
      })
      .preload('employee', (query) => {
        query.preload('person')
        query.preload('businessUnit')
        query.preload('department')
        query.preload('position')
      })
      .orderBy('flight_attendant_id')
      .paginate(filters.page, filters.limit)
    return flightAttendants
  }

  async create(flightAttendant: FlightAttendants) {
    const newFlightAttendants = new FlightAttendants()
    newFlightAttendants.employeeId = flightAttendant.employeeId
    newFlightAttendants.flightAttendantHireDate = flightAttendant.flightAttendantHireDate
    newFlightAttendants.flightAttendantPhoto = flightAttendant.flightAttendantPhoto
    await newFlightAttendants.save()
    return newFlightAttendants
  }

  async update(currentFlightAttendants: FlightAttendants, flightAttendant: FlightAttendants) {
    currentFlightAttendants.flightAttendantHireDate = flightAttendant.flightAttendantHireDate
    currentFlightAttendants.flightAttendantPhoto = flightAttendant.flightAttendantPhoto
    await currentFlightAttendants.save()
    return currentFlightAttendants
  }

  async delete(currentFlightAttendants: FlightAttendants) {
    await currentFlightAttendants.delete()
    return currentFlightAttendants
  }

  async show(flightAttendantId: number) {
    const flightAttendant = await FlightAttendants.query()
      .whereNull('flight_attendant_deleted_at')
      .where('flight_attendant_id', flightAttendantId)
      .whereHas('employee', (employeeQuery) => {
        employeeQuery.whereNull('employee_deleted_at')
      })
      .preload('employee', (query) => {
        query.preload('person')
        query.preload('businessUnit')
        query.preload('department')
        query.preload('position')
      })
      .first()
    return flightAttendant ? flightAttendant : null
  }

  async verifyInfoExist(flightAttendant: FlightAttendants) {
    if (!flightAttendant.flightAttendantId) {
      const existsEmployee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', flightAttendant.employeeId)
        .first()

      if (!existsEmployee && flightAttendant.employeeId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { ...flightAttendant },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...flightAttendant },
    }
  }

  async getProceedingFiles(employeeId: number) {
    const proceedingFiles = await FlightAttendantsProceedingFile.query()
      .whereNull('flight_attendant_proceeding_file_deleted_at')
      .where('flight_attendant_id', employeeId)
      .preload('proceedingFile', (query) => {
        query.preload('proceedingFileType')
      })
      .orderBy('flight_attendant_id')
    return proceedingFiles ? proceedingFiles : []
  }

  async verifyInfo(flightAttendant: FlightAttendants) {
    const action = flightAttendant.flightAttendantId > 0 ? 'updated' : 'created'
    if (!flightAttendant.flightAttendantId) {
      const existEmployeeId = await FlightAttendants.query()
        .if(flightAttendant.flightAttendantId > 0, (query) => {
          query.whereNot('flight_attendant_id', flightAttendant.flightAttendantId)
        })
        .whereNull('flight_attendant_deleted_at')
        .where('employee_id', flightAttendant.employeeId)
        .preload('employee')
        .first()

      if (existEmployeeId && flightAttendant.employeeId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The flight attendant employee id exists for another flight attendant',
          message: `The flight attendant resource cannot be ${action} because the person id is already assigned to another flight attendant`,
          data: { ...flightAttendant },
        }
      }
      const currentEmployee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', flightAttendant.employeeId)
        .first()
      if (currentEmployee) {
        const existPilotPersonId = await Pilot.query()
          .whereNull('pilot_deleted_at')
          .where('employee_id', currentEmployee.employeeId)
          .first()
        if (existPilotPersonId) {
          return {
            status: 400,
            type: 'warning',
            title: 'The employee id exists for another pilot',
            message: `The flight attendant resource cannot be ${action} because the person id is already assigned to another pilot`,
            data: { ...flightAttendant },
          }
        }
        const existCustomerPersonId = await Customer.query()
          .whereNull('customer_deleted_at')
          .where('person_id', currentEmployee.personId)
          .first()
        if (existCustomerPersonId) {
          return {
            status: 400,
            type: 'warning',
            title: 'The person id exists for another customer',
            message: `The flight attendant resource cannot be ${action} because the person id is already assigned to another customer`,
            data: { ...flightAttendant },
          }
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...flightAttendant },
    }
  }
}
