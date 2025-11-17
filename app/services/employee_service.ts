import Department from '#models/department'
import Employee from '#models/employee'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import ExceptionType from '#models/exception_type'
import Person from '#models/person'
import Position from '#models/position'
import ShiftException from '#models/shift_exception'
import User from '#models/user'
import { DateTime } from 'luxon'
import BiometricEmployeeInterface from '../interfaces/biometric_employee_interface.js'
import { EmployeeFilterSearchInterface } from '../interfaces/employee_filter_search_interface.js'
import DepartmentService from './department_service.js'
import PersonService from './person_service.js'
import PositionService from './position_service.js'
import VacationSetting from '#models/vacation_setting'
import FlightAttendant from '#models/flight_attendant'
import Customer from '#models/customer'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import EmployeeType from '#models/employee_type'
import axios from 'axios'
import EmployeeContract from '#models/employee_contract'
import EmployeeBank from '#models/employee_bank'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import { EmployeeSyncInterface } from '../interfaces/employee_sync_interface.js'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async syncCreate(employee: BiometricEmployeeInterface) {
    const newEmployee = new Employee()
    const personService = new PersonService(this.i18n)
    const newPerson = await personService.syncCreate(employee)
    const employeeType = await EmployeeType.query()
      .where('employee_type_slug', 'employee')
      .whereNull('employee_type_deleted_at')
      .first()

    if (newPerson) {
      newEmployee.personId = newPerson.personId
    }
    newEmployee.employeeSyncId = employee.id
    newEmployee.employeeCode = employee.empCode
    newEmployee.employeeFirstName = employee.firstName
    newEmployee.employeeLastName = employee.lastName
    newEmployee.employeeSecondLastName = employee.secondLastName
    newEmployee.employeePayrollNum = employee.payrollNum
    newEmployee.employeeHireDate = employee.hireDate
    newEmployee.companyId = employee.companyId
    newEmployee.departmentId = employee.departmentId
    newEmployee.positionId = employee.positionId
    newEmployee.businessUnitId = employee.businessUnitId || 1

    if (employeeType?.employeeTypeId) {
      newEmployee.employeeTypeId = employeeType.employeeTypeId
    }
    if (employee.empCode) {
      const urlPhoto = `${env.get('API_BIOMETRICS_EMPLOYEE_PHOTO_URL')}/${employee.empCode}.jpg`
      const existPhoto = await this.verifyExistPhoto(urlPhoto)
      if (existPhoto) {
        newEmployee.employeePhoto = urlPhoto
      }
    }
    newEmployee.employeeLastSynchronizationAt = new Date()
    await newEmployee.save()
    await this.updateEmployeeSlug(newEmployee)
    await this.setUserResponsible(newEmployee.employeeId, employee.usersResponsible ? employee.usersResponsible : [])
   /*  await newEmployee.load('employeeType')
    if (newEmployee.employeeType.employeeTypeSlug === 'employee' && newPerson) {
      const user = {
        userEmail: newPerson.personEmail,
        userPassword: '',
        userActive: 1,
        roleId: roleId,
        personId: personId,
      } as User
      const userService = new UserService()
      const data = await request.validateUsing(createUserValidator)
      const exist = await userService.verifyInfoExist(user)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
    } */
    return newEmployee
  }

  async syncUpdate(
    employee: BiometricEmployeeInterface,
    currentEmployee: Employee,
    departmentService: DepartmentService,
    positionService: PositionService
  ) {
    if (!currentEmployee.personId) {
      const personService = new PersonService(this.i18n)
      const newPerson = await personService.syncCreate(employee)
      currentEmployee.personId = newPerson ? newPerson.personId : 0
    }
    currentEmployee.employeeSyncId = employee.id
    currentEmployee.employeeCode = employee.empCode
    currentEmployee.employeeFirstName = employee.firstName
    currentEmployee.employeeLastName = employee.lastName
    currentEmployee.employeeSecondLastName = employee.secondLastName
    currentEmployee.employeePayrollNum = employee.payrollNum
    currentEmployee.employeeHireDate = employee.hireDate
    currentEmployee.companyId = employee.companyId
    currentEmployee.departmentId = await departmentService.getIdBySyncId(employee.departmentId)
    const positionRealId = await positionService.getIdBySyncId(employee.positionId)
    if (positionRealId) {
      currentEmployee.positionId = positionRealId
    } else {
      currentEmployee.positionId = await this.getNewPosition(
        employee,
        positionService,
        departmentService
      )
    }
    currentEmployee.departmentSyncId = employee.departmentId
    currentEmployee.positionSyncId = employee.positionId
    currentEmployee.employeeLastSynchronizationAt = new Date()
    await currentEmployee.save()
    await this.updateEmployeeSlug(currentEmployee)
    return currentEmployee
  }

  async index(filters: EmployeeFilterSearchInterface, departmentsList: Array<number>) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    const employees = await Employee.query()
      .whereIn('businessUnitId', businessUnitsList)
      .if(filters.onlyPayroll, (query) => {
        query.whereIn('payrollBusinessUnitId', businessUnitsList)
      })
      .if(filters.search, (query) => {
        query.where((subQuery) => {
          subQuery
            .whereRaw('UPPER(CONCAT(COALESCE(employee_first_name, ""), " ", COALESCE(employee_last_name, ""), " ", COALESCE(employee_second_last_name, ""))) LIKE ?', [`%${filters.search.toUpperCase()}%`])
            .orWhereRaw('UPPER(employee_code) = ?', [`${filters.search.toUpperCase()}`])
            .orWhereHas('person', (personQuery) => {
              personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_email) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
            })
        })
      })
      .if(filters.employeeWorkSchedule, (query) => {
        query.where((subQuery) => {
          subQuery.whereRaw('UPPER(employee_work_schedule) LIKE ?', [
            `%${filters.employeeWorkSchedule.toUpperCase()}%`,
          ])
        })
      })
      .if(filters.departmentId && filters.departmentId > 0, (query) => {
        query.where('department_id', filters.departmentId)
      })
      .if(filters.departmentId  && filters.departmentId > 0 && filters.positionId  && filters.positionId > 0, (query) => {
        query.where('department_id', filters.departmentId)
        query.where('position_id', filters.positionId)
      })
      .if(filters.ignoreDiscriminated === 1, (query) => {
        query.where('employeeAssistDiscriminator', 0)
      })
      .if(filters.ignoreExternal === 1, (query) => {
        query.where('employee_type_of_contract', 'Internal')
      })
      .if(
        filters.onlyInactive && (filters.onlyInactive === 'true' || filters.onlyInactive === true),
        (query) => {
          query.whereNotNull('employee_deleted_at')
          query.withTrashed()
        }
      )
      .if(filters.employeeTypeId, (query) => {
        query.where('employee_type_id', filters.employeeTypeId ? filters.employeeTypeId : 0)
      })
      .if(filters.userResponsibleId &&
        typeof filters.userResponsibleId && filters.userResponsibleId > 0,
        (query) => {
          query.where((subQuery) => {
            subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
              userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
              userResponsibleEmployeeQuery.whereNull('user_responsible_employee_deleted_at')
            })
            subQuery.orWhereHas('person', (personQuery) => {
              personQuery.whereHas('user', (userQuery) => {
                userQuery.where('userId', filters.userResponsibleId!)
              })
            })
          })
        }
      )
      .if(
        !filters.userResponsibleId,
        (query) => {
          query.whereIn('departmentId', departmentsList)
        }
      )
      .preload('department')
      .preload('position')
      .preload('person')
      .preload('businessUnit')
      .preload('address')
      .if(filters.orderBy === 'number', (query) => {
        const direction = this.getOrderDirection(filters.orderDirection)
        query.orderByRaw(`CAST(employee_code AS UNSIGNED) ${direction}, employee_code ${direction}`)
      })
      .if(filters.orderBy === 'name', (query) => {
        const direction = this.getOrderDirection(filters.orderDirection)
        query.orderByRaw(`CONCAT(COALESCE(employee_first_name, ''), ' ', COALESCE(employee_last_name, ''), ' ', COALESCE(employee_second_last_name, '')) ${direction}`)
      })
      .if(!filters.orderBy, (query) => {
        query.orderBy('employee_id')
      })
      .paginate(filters.page, filters.limit)

    return employees
  }

  async create(employee: Employee, usersResponsible: User[]) {
    const newEmployee = new Employee()
    newEmployee.employeeFirstName = employee.employeeFirstName
    newEmployee.employeeLastName = employee.employeeLastName
    newEmployee.employeeSecondLastName = employee.employeeSecondLastName
    newEmployee.employeeCode = employee.employeeCode
    newEmployee.employeePayrollNum = employee.employeePayrollNum
    newEmployee.employeePayrollCode = employee.employeePayrollCode
    newEmployee.employeeHireDate = employee.employeeHireDate
    newEmployee.employeeTerminatedDate = employee.employeeTerminatedDate
    newEmployee.companyId = employee.companyId
    newEmployee.departmentId = employee.departmentId
    newEmployee.positionId = employee.positionId
    newEmployee.personId = employee.personId
    newEmployee.businessUnitId = employee.businessUnitId
    newEmployee.dailySalary = employee.dailySalary || 0
    newEmployee.payrollBusinessUnitId = employee.payrollBusinessUnitId
    newEmployee.employeeWorkSchedule = employee.employeeWorkSchedule
    newEmployee.employeeAssistDiscriminator = employee.employeeAssistDiscriminator
    newEmployee.employeeTypeOfContract = employee.employeeTypeOfContract
    newEmployee.employeeTypeId = employee.employeeTypeId
    newEmployee.employeeBusinessEmail = employee.employeeBusinessEmail
    newEmployee.employeeIgnoreConsecutiveAbsences = employee.employeeIgnoreConsecutiveAbsences
    await newEmployee.save()
    await this.updateEmployeeSlug(newEmployee)
    await newEmployee.load('businessUnit')
    await this.setUserResponsible(newEmployee.employeeId, usersResponsible ? usersResponsible : [])
    return newEmployee
  }

  async update(currentEmployee: Employee, employee: Employee) {
    currentEmployee.employeeFirstName = employee.employeeFirstName
    currentEmployee.employeeLastName = employee.employeeLastName
    currentEmployee.employeeSecondLastName = employee.employeeSecondLastName
    currentEmployee.employeeCode = employee.employeeCode
    currentEmployee.employeePayrollNum = employee.employeePayrollNum
    currentEmployee.employeePayrollCode = employee.employeePayrollCode
    currentEmployee.employeeHireDate = employee.employeeHireDate
    currentEmployee.employeeTerminatedDate = employee.employeeTerminatedDate
    currentEmployee.companyId = employee.companyId
    currentEmployee.departmentId = employee.departmentId
    currentEmployee.positionId = employee.positionId
    currentEmployee.businessUnitId = employee.businessUnitId
    currentEmployee.dailySalary = employee.dailySalary || 0
    currentEmployee.payrollBusinessUnitId = employee.payrollBusinessUnitId
    currentEmployee.employeeWorkSchedule = employee.employeeWorkSchedule
    currentEmployee.employeeAssistDiscriminator = employee.employeeAssistDiscriminator
    currentEmployee.employeeTypeOfContract = employee.employeeTypeOfContract
    currentEmployee.employeeTypeId = employee.employeeTypeId
    currentEmployee.employeeBusinessEmail = employee.employeeBusinessEmail
    currentEmployee.employeeIgnoreConsecutiveAbsences = employee.employeeIgnoreConsecutiveAbsences
    await currentEmployee.save()
    await this.updateEmployeeSlug(currentEmployee)
    await currentEmployee.load('businessUnit')
    return currentEmployee
  }

  async updateEmployeePhotoUrl(employeeId: number, photoUrl: string) {
    const currentEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()
    if (!currentEmployee) {
      return null
    }
    currentEmployee.employeePhoto = photoUrl
    await currentEmployee.save()
    return Employee.query()
      .preload('person')
      .preload('department')
      .preload('position')
      .where('employee_id', employeeId)
      .first()
  }

  async delete(currentEmployee: Employee) {
    currentEmployee.employeeCode = `${currentEmployee.employeeCode}-IN${DateTime.now().toSeconds().toFixed(0)}`
    await currentEmployee.save()
    await currentEmployee.delete()
    return currentEmployee
  }

  private async updateEmployeeSlug(employee: Employee) {
    if (!employee.employeeId) {
      return
    }

    const slug = this.generateEmployeeSlug(employee)
    await Employee.query()
      .where('employee_id', employee.employeeId)
      .update({ employee_slug: slug })
    employee.employeeSlug = slug
  }

  private generateEmployeeSlug(employee: Employee) {
    const firstNamePart = this.normalizeSlugSegment(employee.employeeFirstName)
    const lastNamePart = this.normalizeSlugSegment(employee.employeeLastName)
    const secondLastNamePart = this.normalizeSlugSegment(employee.employeeSecondLastName)
    const namePart =
      [firstNamePart, lastNamePart, secondLastNamePart].filter((part) => part).join('-') || 'sin-nombre'

    const payrollPart = this.normalizeSlugSegment(employee.employeePayrollCode, 'sin-codigo')
    const idPart = employee.employeeId ? `${employee.employeeId}` : '0'

    return `${namePart}---${payrollPart}---${idPart}`.toLowerCase()
  }

  private normalizeSlugSegment(value?: string | null, fallback = '') {
    if (!value) {
      return fallback
    }

    return value
      .toString()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
  }

  async show(employeeId: number) {
    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .preload('department')
      .preload('position')
      .preload('person')
      .preload('businessUnit')
      .preload('spouse')
      .preload('emergencyContact')
      .preload('children')
      .withTrashed()
      .first()
    return employee ? employee : null
  }

  async getById(employeeId: number, userResponsibleId?: number | null) {
    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .if(userResponsibleId &&
        typeof userResponsibleId && userResponsibleId > 0,
        (query) => {
          query.where((subQuery) => {
            subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
              userResponsibleEmployeeQuery.where('userId', userResponsibleId!)
              userResponsibleEmployeeQuery.whereNull('user_responsible_employee_deleted_at')
            })
            subQuery.orWhereHas('person', (personQuery) => {
              personQuery.whereHas('user', (userQuery) => {
                userQuery.where('userId', userResponsibleId!)
              })
            })
          })
        }
      )
      .preload('department')
      .preload('position')
      .preload('person')
      .preload('businessUnit')
      .withTrashed()
      .first()
    return employee ? employee : null
  }

  async getNewPosition(
    employee: BiometricEmployeeInterface,
    positionService: PositionService,
    departmentService: DepartmentService
  ) {
    let positionId = 0
    const department = await departmentService.showSync(employee.departmentId)
    if (department) {
      const existPosition = await positionService.verifyExistPositionByName(
        department.departmentName
      )
      if (existPosition) {
        positionId = existPosition
      } else {
        positionId = await departmentService.addPosition(department)
      }
    }
    return positionId
  }

  async verifyInfoExist(employee: Employee) {
    if (!employee.departmentId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The department was not found',
        message: 'The department was not found with the entered ID',
        data: { ...employee },
      }
    }
    const existDepartment = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', employee.departmentId)
      .first()

    if (!existDepartment && employee.departmentId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The department was not found',
        message: 'The department was not found with the entered ID',
        data: { ...employee },
      }
    }
    if (!employee.positionId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position was not found',
        message: 'The position was not found with the entered ID',
        data: { ...employee },
      }
    }

    const existPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', employee.positionId)
      .first()

    if (!existPosition && employee.positionId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position was not found',
        message: 'The position was not found with the entered ID',
        data: { ...employee },
      }
    }

    const existEmployeeType = await EmployeeType.query()
      .whereNull('employee_type_deleted_at')
      .where('employee_type_id', employee.employeeTypeId)
      .first()

    if (!existEmployeeType && employee.employeeTypeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee type was not found',
        message: 'The employee type was not found with the entered ID',
        data: { ...employee },
      }
    }
    if (!employee.employeeId) {
      const existPerson = await Person.query()
        .whereNull('person_deleted_at')
        .where('person_id', employee.personId)
        .first()

      if (!existPerson && employee.personId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The person was not found',
          message: 'The person was not found with the entered ID',
          data: { ...employee },
        }
      }
    }
    if (!employee.businessUnitId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The business unit id was not found',
        message: 'The business unit was not found with the entered ID',
        data: { ...employee },
      }
    }
    const existBusinessUnitId = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_id', employee.businessUnitId)
      .first()

    if (!existBusinessUnitId && employee.businessUnitId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The business unit was not found',
        message: 'The business unit was not found with the entered ID',
        data: { ...employee },
      }
    }
    if (!employee.payrollBusinessUnitId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The payroll business unit id was not found',
        message: 'The payroll business unit was not found with the entered ID',
        data: { ...employee },
      }
    }
    const existPayrollBusinessUnitId = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_id', employee.payrollBusinessUnitId)
      .first()

    if (!existPayrollBusinessUnitId && employee.payrollBusinessUnitId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The payroll business unit was not found',
        message: 'The payroll business unit was not found with the entered ID',
        data: { ...employee },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...employee },
    }
  }

  async verifyInfo(employee: Employee) {
    const action = employee.employeeId > 0 ? 'updated' : 'created'
    const existCode = await Employee.query()
      .if(employee.employeeId > 0, (query) => {
        query.whereNot('employee_id', employee.employeeId)
      })
      .whereNull('employee_deleted_at')
      .where('employee_code', employee.employeeCode)
      .first()

    if (existCode && employee.employeeCode) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee code already exists for another employee',
        message: `The employee resource cannot be ${action} because the code is already assigned to another employee`,
        data: { ...employee },
      }
    }
    const existBusinessEmail = await Employee.query()
      .if(employee.employeeId > 0, (query) => {
        query.whereNot('employee_id', employee.employeeId)
      })
      .whereNull('employee_deleted_at')
      .where('employee_business_email', employee.employeeBusinessEmail)
      .first()

    if (existBusinessEmail && employee.employeeBusinessEmail) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee business email already exists for another employee',
        message: `The employee resource cannot be ${action} because the business email is already assigned to another employee`,
        data: { ...employee },
      }
    }
    if (!employee.employeeId) {
      const existPersonId = await Employee.query()
        .if(employee.employeeId > 0, (query) => {
          query.whereNot('employee_id', employee.employeeId)
        })
        .whereNull('employee_deleted_at')
        .where('person_id', employee.personId)
        .first()
      if (existPersonId && employee.personId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The employee person id exists for another employee',
          message: `The employee resource cannot be ${action} because the person id is already assigned to another employee`,
          data: { ...employee },
        }
      }
      const existFlightAttendantPersonId = await FlightAttendant.query()
        .whereNull('flight_attendant_deleted_at')
        .where('employee_id', employee.employeeId)
        .first()
      if (existFlightAttendantPersonId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The employee id exists for another flight attendant',
          message: `The employee resource cannot be ${action} because the person id is already assigned to another flight attendant`,
          data: { ...employee },
        }
      }
      const existCustomerPersonId = await Customer.query()
        .whereNull('customer_deleted_at')
        .where('person_id', employee.personId)
        .first()
      if (existCustomerPersonId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The person id exists for another customer',
          message: `The employee resource cannot be ${action} because the person id is already assigned to another customer`,
          data: { ...employee },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...employee },
    }
  }

  async indexWithOutUser(filters: EmployeeFilterSearchInterface) {
    const personUsed = await User.query()
      .whereNull('user_deleted_at')
      .select('person_id')
      .distinct('person_id')
      .orderBy('person_id')
    const persons = [] as Array<number>
    for await (const user of personUsed) {
      persons.push(user.personId)
    }
    const employees = await Employee.query()
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
        query.orWhereRaw('UPPER(employee_code) = ?', [`${filters.search.toUpperCase()}`])
      })
      .if(filters.departmentId && filters.positionId, (query) => {
        query.where('department_id', filters.departmentId)
        query.where('position_id', filters.positionId)
      })
      .whereNotIn('person_id', persons)
      .preload('department')
      .preload('position')
      .preload('person')
      .orderBy('employee_id')
      .paginate(filters.page, filters.limit)
    return employees
  }

  async getWorkSchedules() {
    const workSchedules = await Employee.query()
      .whereNull('employee_deleted_at')
      .select('employee_work_schedule')
      .distinct('employee_work_schedule')
    return workSchedules
  }

  async getProceedingFiles(employeeId: number, fileType: number) {
    const proceedingFiles = await EmployeeProceedingFile.query()
      .whereNull('employee_proceeding_file_deleted_at')
      .where('employee_id', employeeId)
      .whereHas('proceedingFile', (fileQuery) => {
        fileQuery.if(fileType, (query) => {
          query.where('proceedingFileTypeId', fileType)
        })
      })
      .preload('proceedingFile', (query) => {
        query.preload('proceedingFileType')
        query.if(fileType, (subquery) => {
          subquery.where('proceedingFileTypeId', fileType)
        })
      })
      .orderBy('employee_id')
      .paginate(1, 9999999)

    return proceedingFiles ? proceedingFiles : []

    // AircraftProceedingFile.query()
    //         .whereNull('deletedAt')
    //         .where('aircraftId', aircraftId)
    //         .whereHas('proceedingFile', (fileQuery) => {
    //           fileQuery.if(fileType, (query) => {
    //             query.where('proceedingFileTypeId', fileType)
    //           })
    //         })
    //         .preload('proceedingFile', (fileQuery) => {
    //           fileQuery.preload('proceedingFileType')
    //           fileQuery.preload('proceedingFileStatus')
    //           fileQuery.if(fileType, (query) => {
    //             query.where('proceedingFileTypeId', fileType)
    //           })
    //         })
    //         .orderBy('aircraftProceedingFileCreatedAt', 'desc')
  }

  async getVacationsUsed(employee: Employee) {
    const shiftExceptionVacation = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()
    if (!shiftExceptionVacation) {
      return {
        status: 404,
        type: 'warning',
        title: 'The exception type vacation was not found',
        message: 'The exception type vacation was not found with the entered ID',
        data: {},
      }
    }
    const period = await this.getCurrentVacationPeriod(employee)
    if (period && period.vacationPeriodStart) {
      const vacations = await ShiftException.query()
        .whereNull('shift_exceptions_deleted_at')
        .where('employee_id', employee.employeeId)
        .where('exception_type_id', shiftExceptionVacation.exceptionTypeId)
        .whereRaw('DATE(shift_exceptions_date) >= ?', [period.vacationPeriodStart])
        .whereRaw('DATE(shift_exceptions_date) <= ?', [period.vacationPeriodEnd])
        .orderBy('employee_id')
      const vacationsUsed = vacations ? vacations.length : 0
      return {
        status: 200,
        type: 'success',
        title: 'Info verifiy successfully',
        message: 'Info verifiy successfully',
        data: vacationsUsed,
      }
    } else {
      return {
        status: 400,
        type: 'warning',
        title: 'The vacation period was not found',
        message: 'The vacation period was not found ',
        data: {},
      }
    }
  }

  async getDaysVacationsCorresponing(employee: Employee) {
    const employeeVacationsInfo = await this.getCurrentVacationPeriod(employee)
    if (employeeVacationsInfo && employeeVacationsInfo.yearsWorked) {
      const yearWorked = Math.floor(employeeVacationsInfo.yearsWorked)
      const employeeType = await EmployeeType.query()
        .whereNull('employee_type_deleted_at')
        .where('employee_type_id', employee.employeeTypeId)
        .first()
      let employeeIsCrew = false
      if (employeeType) {
        if (
          employeeType.employeeTypeSlug === 'pilot' ||
          employeeType.employeeTypeSlug === 'flight-attendant'
        ) {
          employeeIsCrew = true
        }
      }
      let vacationSetting = await VacationSetting.query()
        .whereNull('vacation_setting_deleted_at')
        .where('vacation_setting_years_of_service', yearWorked)
        .if(employeeIsCrew, (query) => {
          query.where('vacation_setting_crew', 1)
        })
        .first()
      if (!vacationSetting) {
        vacationSetting = await VacationSetting.query()
          .whereNull('vacation_setting_deleted_at')
          .orderBy('vacation_setting_years_of_service', 'desc')
          .if(employeeIsCrew, (query) => {
            query.where('vacation_setting_crew', 1)
          })
          .first()
        if (!vacationSetting) {
          return {
            status: 404,
            type: 'warning',
            title: 'The vacation setting was not found',
            message: `The vacation setting was not found with the years worked ${yearWorked}`,
            data: {},
          }
        }
      }
      const vacationSettingVacationDays = vacationSetting.vacationSettingVacationDays
      return {
        status: 200,
        type: 'success',
        title: 'Info verifiy successfully',
        message: 'Info verifiy successfully',
        data: vacationSettingVacationDays,
      }
    } else {
      return {
        status: 400,
        type: 'warning',
        title: 'The vacation period was not found',
        message: 'The vacation period was not found ',
        data: {},
      }
    }
  }

  private getCurrentVacationPeriod(employee: Employee) {
    if (!employee.employeeHireDate) {
      return null
    }
    const currentDate = DateTime.now()
    const startDate = DateTime.fromISO(employee.employeeHireDate.toString())
    if (!startDate.isValid) {
      return null
    }
    const yearsWorked = currentDate.diff(startDate, 'years').years
    if (yearsWorked < 1) {
      return null
    }
    const vacationYear = Math.floor(yearsWorked)
    const vacationPeriodStart = startDate.plus({ years: vacationYear }).startOf('day')
    const vacationPeriodEnd = vacationPeriodStart.plus({ years: 1 }).minus({ days: 1 }).endOf('day')
    return {
      yearsWorked,
      startDate,
      vacationYear,
      vacationPeriodStart: vacationPeriodStart.toISODate(),
      vacationPeriodEnd: vacationPeriodEnd.toISODate(),
    }
  }

  async hasEmployeesPosition(positionId: number): Promise<boolean> {
    const employees = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('position_id', positionId)
    return employees.length > 0
  }

  async getYearsWorked(employee: Employee, yearTemp: number) {
    if (yearTemp) {
      if (yearTemp > 3000) {
        return {
          status: 400,
          type: 'warning',
          title: 'The year is incorrect',
          message: 'the year must be less than 3000',
          data: { yearTemp: yearTemp },
        }
      }
    }
    if (employee.employeeHireDate) {
      const employeeType = await EmployeeType.query()
        .whereNull('employee_type_deleted_at')
        .where('employee_type_id', employee.employeeTypeId)
        .first()
      let employeeIsCrew = false
      if (employeeType) {
        if (
          employeeType.employeeTypeSlug === 'pilot' ||
          employeeType.employeeTypeSlug === 'flight-attendant'
        ) {
          employeeIsCrew = true
        }
      }
      const start = DateTime.fromISO(employee.employeeHireDate.toString())
      const startYear = yearTemp ? yearTemp : start.year
      const currentYear = yearTemp ? yearTemp : DateTime.now().year + 1
      let yearsPassed = startYear - start.year
      if (yearsPassed < 0) {
        return {
          status: 400,
          type: 'warning',
          title: 'The year is incorrect',
          message: 'The year is not valid ',
          data: { startYear: startYear },
        }
      }
      const month = start.month
      const day = start.day
      const yearsWroked = []
      for (let year = startYear; year <= currentYear; year++) {
        yearsPassed = year - start.year
        const formattedDate = DateTime.fromObject({
          year: year,
          month: month,
          day: day,
        }).toFormat('yyyy-MM-dd')
        const vacationSetting = await VacationSetting.query()
          .whereNull('vacation_setting_deleted_at')
          .where('vacation_setting_years_of_service', yearsPassed)
          .where('vacation_setting_apply_since', '<=', formattedDate ? formattedDate : '')
          .if(employeeIsCrew, (query) => {
            query.where('vacation_setting_crew', 1)
          })
          .first()
        let vacationsUsedList = [] as Array<ShiftException>
        if (vacationSetting) {
          vacationsUsedList = await ShiftException.query()
            .whereNull('shift_exceptions_deleted_at')
            .where('vacation_setting_id', vacationSetting.vacationSettingId)
            .where('employee_id', employee.employeeId)
            .orderBy('shift_exceptions_date', 'asc')
        }
        yearsWroked.push({ year, yearsPassed, vacationSetting, vacationsUsedList })
      }
      return {
        status: 200,
        type: 'success',
        title: 'Info get successfully',
        message: 'Info get successfully',
        data: yearsWroked,
      }
    } else {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee hire date was not found',
        message: 'The employee hire date was not found ',
        data: {},
      }
    }
  }

  async getYearWorked(employee: Employee, yearTemp: number) {
    if (yearTemp) {
      if (yearTemp > 3000) {
        return {
          status: 400,
          type: 'warning',
          title: 'The year is incorrect',
          message: 'the year must be less than 3000',
          data: { yearTemp: yearTemp },
        }
      }
    }
    if (employee.employeeHireDate) {
      const start = DateTime.fromISO(employee.employeeHireDate.toString())
      const startYear = yearTemp ? yearTemp : start.year
      const yearsPassed = startYear - start.year
      if (yearsPassed < 0) {
        return {
          status: 400,
          type: 'warning',
          title: 'The year is incorrect',
          message: 'The year is not valid ',
          data: { startYear: startYear },
        }
      }
      const month = start.month
      const day = start.day
      const yearsPassedToEnd = yearTemp - start.year
      const formattedDate = DateTime.fromObject({
        year: yearTemp,
        month: month,
        day: day,
      }).toFormat('yyyy-MM-dd')
      const employeeType = await EmployeeType.query()
        .whereNull('employee_type_deleted_at')
        .where('employee_type_id', employee.employeeTypeId)
        .first()
      let employeeIsCrew = false
      if (employeeType) {
        if (
          employeeType.employeeTypeSlug === 'pilot' ||
          employeeType.employeeTypeSlug === 'flight-attendant'
        ) {
          employeeIsCrew = true
        }
      }
      const vacationSetting = await VacationSetting.query()
        .whereNull('vacation_setting_deleted_at')
        .where('vacation_setting_years_of_service', yearsPassed)
        .where('vacation_setting_apply_since', '<=', formattedDate ? formattedDate : '')
        .if(employeeIsCrew, (query) => {
          query.where('vacation_setting_crew', 1)
        })
        .first()
      let vacationsUsedList = [] as Array<ShiftException>
      if (vacationSetting) {
        vacationsUsedList = await ShiftException.query()
          .whereNull('shift_exceptions_deleted_at')
          .where('vacation_setting_id', vacationSetting.vacationSettingId)
          .where('employee_id', employee.employeeId)
          .orderBy('shift_exceptions_date', 'asc')
      }
      return {
        status: 200,
        type: 'success',
        title: 'Info get successfully',
        message: 'Info get successfully',
        data: {
          year: yearTemp,
          yearsPassed: yearsPassedToEnd,
          vacationSetting: vacationSetting,
          vacationUsedList: vacationsUsedList,
        },
      }
    } else {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee hire date was not found',
        message: 'The employee hire date was not found ',
        data: {},
      }
    }
  }

  getYearsBetweenDates(startDate: string, endDate: string) {
    const start = DateTime.fromISO(startDate)
    const end = DateTime.fromISO(endDate)
    const yearsDifference = end.diff(start, 'years').years
    return yearsDifference.toFixed(2)
  }

  async getVacationsByPeriod(employeeId: number, vacationSettingId: number) {
    const vacations = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('vacation_setting_id', vacationSettingId)
      .where('employee_id', employeeId)
      .orderBy('shift_exceptions_date', 'asc')

    return vacations ? vacations : []
  }

  async verifyExistPhoto(url: string) {
    try {
      const response = await axios.head(url)
      if (response.status === 200) {
        return true
      }
    } catch (error) {}
    return false
  }

  async getContracts(employeeId: number) {
    const employeeContracts = await EmployeeContract.query()
      .whereNull('employee_contract_deleted_at')
      .where('employee_id', employeeId)
      .orderBy('employee_id')
      .preload('employeeContractType')
      .preload('department')
      .preload('position')
      .preload('payrollBusinessUnit')
      .orderBy('employee_contract_start_date')

    return employeeContracts ? employeeContracts : []
  }

  async getBanks(employeeId: number) {
    const employeeBanks = await EmployeeBank.query()
      .whereNull('employee_bank_deleted_at')
      .where('employee_id', employeeId)
      .preload('bank')
      .orderBy('employee_id')
      .paginate(1, 9999999)

    return employeeBanks ? employeeBanks : []
  }

  async getBirthday(filters: EmployeeFilterSearchInterface) {
    const year = filters.year
    const cutoffDate = DateTime.fromObject({ year, month: 1, day: 1 }).toSQLDate()!
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
    const employees = await Employee.query()
      .whereIn('businessUnitId', businessUnitsList)
      .if(filters.search, (query) => {
        query.where((subQuery) => {
          subQuery
            .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
              `%${filters.search.toUpperCase()}%`,
            ])
            .orWhereRaw('UPPER(employee_code) = ?', [`${filters.search.toUpperCase()}`])
            .orWhereHas('person', (personQuery) => {
              personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_email) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
            })
        })
      })
      .if(filters.departmentId, (query) => {
        query.where('department_id', filters.departmentId)
      })
      .if(filters.departmentId && filters.positionId, (query) => {
        query.where('department_id', filters.departmentId)
        query.where('position_id', filters.positionId)
      })
      .whereHas('person', (personQuery) => {
        personQuery.whereNotNull('person_birthday')
      })
      .preload('department')
      .preload('position')
      .preload('person')
      .preload('businessUnit')
      .preload('address')
      .withTrashed()
      .andWhere((query) => {
        query
          .whereNull('employee_deleted_at')
          .orWhere('employee_deleted_at', '>=', cutoffDate)
      })
      .if(filters.userResponsibleId &&
        typeof filters.userResponsibleId && filters.userResponsibleId > 0,
        (query) => {
          query.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
            userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
          })
        }
      )
      .orderBy('employee_id')

    return employees
  }

  async getVacations(filters: EmployeeFilterSearchInterface) {
    const shiftExceptionVacation = await ExceptionType.query()
    .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()
    if (!shiftExceptionVacation) {
     return []
    }
    const year = filters.year
    const cutoffDate = DateTime.fromObject({ year, month: 1, day: 1 }).toSQLDate()!
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
    const employees = await Employee.query()
      .whereIn('businessUnitId', businessUnitsList)
      .if(filters.search, (query) => {
        query.where((subQuery) => {
          subQuery
            .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
              `%${filters.search.toUpperCase()}%`,
            ])
            .orWhereRaw('UPPER(employee_code) = ?', [`${filters.search.toUpperCase()}`])
            .orWhereHas('person', (personQuery) => {
              personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_email) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
            })
        })
      })
      .if(filters.departmentId, (query) => {
        query.where('department_id', filters.departmentId)
      })
      .if(filters.departmentId && filters.positionId, (query) => {
        query.where('department_id', filters.departmentId)
        query.where('position_id', filters.positionId)
      })
      .preload('shift_exceptions', (exceptionQuery) => {
        exceptionQuery.whereNull('shift_exceptions_deleted_at')
        exceptionQuery.where('exception_type_id', shiftExceptionVacation.exceptionTypeId)
        exceptionQuery.whereRaw('YEAR(shift_exceptions_date) = ?', [year ? year : 0])
        exceptionQuery.select('shift_exceptions_date', 'exception_type_id')
      })
      .preload('department')
      .preload('position')
      .preload('person')
      .preload('businessUnit')
      .withTrashed()
      .andWhere((query) => {
        query
          .whereNull('employee_deleted_at')
          .orWhere('employee_deleted_at', '>=', cutoffDate)
      })
      .if(filters.userResponsibleId &&
        typeof filters.userResponsibleId && filters.userResponsibleId > 0,
        (query) => {
          query.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
            userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
          })
        }
      )
      .orderBy('employee_id')
    return employees
  }

  async getAllVacationsByPeriod(filters: EmployeeFilterSearchInterface, departmentsList: Array<number>) {
    const shiftExceptionVacation = await ExceptionType.query()
    .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()
    if (!shiftExceptionVacation) {
     return []
    }
    const dateStart = filters.dateStart
    const dateEnd = filters.dateEnd
    if (!dateStart || !dateEnd) {
      return []
    }
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
    const employees = await Employee.query()
      .whereIn('businessUnitId', businessUnitsList)
      .if(filters.search, (query) => {
        query.where((subQuery) => {
          subQuery
            .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
              `%${filters.search.toUpperCase()}%`,
            ])
            .orWhereRaw('UPPER(employee_code) = ?', [`${filters.search.toUpperCase()}`])
            .orWhereHas('person', (personQuery) => {
              personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              personQuery.orWhereRaw('UPPER(person_email) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
            })
        })
      })
      .if(filters.departmentId, (query) => {
        query.where('department_id', filters.departmentId)
      })
      .if(filters.departmentId && filters.positionId, (query) => {
        query.where('department_id', filters.departmentId)
        query.where('position_id', filters.positionId)
      })
      .whereHas('shift_exceptions', (exceptionQuery) => {
        exceptionQuery.whereNull('shift_exceptions_deleted_at')
        exceptionQuery.where('exception_type_id', shiftExceptionVacation.exceptionTypeId)
        exceptionQuery.whereBetween('shift_exceptions_date', [dateStart, dateEnd])
      })
      .preload('shift_exceptions', (exceptionQuery) => {
        exceptionQuery.whereNull('shift_exceptions_deleted_at')
        exceptionQuery.where('exception_type_id', shiftExceptionVacation.exceptionTypeId)
        exceptionQuery.whereBetween('shift_exceptions_date', [dateStart, dateEnd])
        exceptionQuery.select('shift_exceptions_date', 'exception_type_id')
      })
      .whereIn('departmentId', departmentsList)
      .preload('department')
      .preload('position')
      .preload('person')
      .preload('businessUnit')
      .withTrashed()
      .andWhere((query) => {
        query
          .whereNull('employee_deleted_at')
          .orWhere('employee_deleted_at', '<=', dateEnd ? dateEnd : '')
      })
      .if(filters.userResponsibleId &&
        typeof filters.userResponsibleId && filters.userResponsibleId > 0,
        (query) => {
          query.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
            userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
          })
        }
      )
      .orderBy('employee_id')
    return employees
  }

  async getUserResponsible(employeeId: number, userId: number) {
    const userResponsibleEmployees = await UserResponsibleEmployee.query()
      .whereNull('user_responsible_employee_deleted_at')
      .where('employee_id', employeeId)
      .whereHas('user', (userQuery) => {
        userQuery.whereNull('user_deleted_at')
      })
      .if(userId && typeof userId && userId > 0, (userQuery) => {
        userQuery.where('user_id', userId)
      })
      .preload('user')
      .orderBy('employee_id')
      .paginate(1, 9999999)

    return userResponsibleEmployees ? userResponsibleEmployees : []
  }

  async setUserResponsible(employeeId: number, usersResponsible: User[]) {
    for await (const user of usersResponsible) {
      const userResponsibleEmployee = new UserResponsibleEmployee
      userResponsibleEmployee.userId = user.userId
      userResponsibleEmployee.employeeId = employeeId
      if (user.role.roleSlug === 'nominas') {
        userResponsibleEmployee.userResponsibleEmployeeReadonly = 1
      }
      await userResponsibleEmployee.save()
    }
  }

  splitCompoundSurnames(fullSurnames: string): { paternalSurname: string, maternalSurname: string } {
    const particles = [
      'de', 'del', 'de la', 'de los', 'de las',
      'la', 'las', 'los',
      'san', 'santa',
      'mc', 'mac',
      'van', 'von',
      'di', 'da',
      'dos', 'do'
    ]

    const knownCompoundSurnames = [
      'de la rosa', 'de la mora', 'de la cruz', 'de la fuente', 'de la vega', 'de la torre',
      'de la peña', 'de la garza', 'de la madrid', 'de la serna', 'de la luz', 'de la paz', 'de la parra',
      'del río', 'del valle', 'del ángel', 'del monte', 'del campo', 'del toro', 'del real',
      'del castillo', 'del villar', 'del olmo', 'del carmen',
      'de los santos', 'de los ángeles', 'de todos los ángeles', 'de los ríos', 'de las nieves',
      'san martín', 'san juan', 'san román', 'santa cruz', 'santa maría', 'santa ana',
      'mac gregor', 'mc gregor', 'van rijn', 'von humboldt',
      'de jesus', 'de gracia', 'de león', 'de anda', 'de aquino', 'de haro', 'de la ossa'
    ]

    const words = fullSurnames.trim().split(/\s+/)
    const total = words.length

    if (total === 1) {
      return { paternalSurname: words[0], maternalSurname: '' }
    }

    let bestMatch: { paternalSurname: string, maternalSurname: string } | null = null
    let bestScore = 0

    // Probar todas las divisiones posibles
    for (let i = 1; i < total; i++) {
      const paternalWords = words.slice(0, i).join(' ').toLowerCase()
      const maternalWords = words.slice(i).join(' ').toLowerCase()

      const isPaternalKnown = knownCompoundSurnames.includes(paternalWords)
      const isMaternalKnown = knownCompoundSurnames.includes(maternalWords)
      const maternalStartsWithParticle = particles.some(p =>
        maternalWords.startsWith(p + ' ') || maternalWords === p
      )

      let score = 0
      if (isPaternalKnown) score += 2
      if (isMaternalKnown) score += 2
      else if (maternalStartsWithParticle) score += 1

      // Guardar si tiene mejor score que el anterior
      if (score > bestScore) {
        bestScore = score
        bestMatch = {
          paternalSurname: words.slice(0, i).join(' '),
          maternalSurname: words.slice(i).join(' ')
        }

        // ✅ si ambos apellidos son compuestos conocidos, este es el mejor posible
        if (score === 4) break
      }
    }

    if (bestMatch) return bestMatch
    // Fallback
    const midpoint = Math.floor(total / 2)

    return {
      paternalSurname: words.slice(0, midpoint).join(' '),
      maternalSurname: words.slice(midpoint).join(' ')
    }
  }

  async getEmployeesToSyncFromBiometrics() {

    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitName)

    let apiUrl = `${env.get('API_BIOMETRICS_HOST')}/employees`
    apiUrl = `${apiUrl}?page=${1}`
    apiUrl = `${apiUrl}&limit=${9999999}`

    const apiResponse = await axios.get(apiUrl)
    const data = apiResponse.data.data
    const employeesSync = [] as EmployeeSyncInterface[]

    if (data) {
      data.sort((a: BiometricEmployeeInterface, b: BiometricEmployeeInterface) => a.id - b.id)

      for await (const employee of data) {
        let existInBusinessUnitList = false

        if (employee.payrollNum) {
          if (`${businessUnitsList}`.toLocaleLowerCase().includes(`${employee.payrollNum}`.toLocaleLowerCase())) {
            existInBusinessUnitList = true
          }
        } else if (employee.personnelEmployeeArea.length > 0) {
          for await (const personnelEmployeeArea of employee.personnelEmployeeArea) {
            if (personnelEmployeeArea.personnelArea) {
              if (`${businessUnitsList}`.toLocaleLowerCase().includes(`${personnelEmployeeArea.personnelArea.areaName}`.toLocaleLowerCase())) {
                existInBusinessUnitList = true
                break
              }
            }
          }
        }

        if (existInBusinessUnitList) {
          const dataEmployee = await this.verifyExistFromBiometrics(employee)

          if (dataEmployee.show) {
            dataEmployee.employeeCode = employee.empCode
            dataEmployee.employeeFirstName = employee.firstName
            dataEmployee.employeeLastName = employee.lastName
            employeesSync.push(dataEmployee)
          }
        }
      }
    }

    return employeesSync
  }

  async verifyExistFromBiometrics(employee: BiometricEmployeeInterface) {
    const fullName = `${employee.firstName} ${employee.lastName}`
    const data = {
      message: '',
      show: false,
      canSelect: false
    } as EmployeeSyncInterface

    const existEmployeeCode = await Employee.query()
      .where('employee_code', employee.empCode)
      .withTrashed()
      .first()

    if (existEmployeeCode) {
      const fullNameFind = `${existEmployeeCode.employeeFirstName} ${existEmployeeCode.employeeLastName}`

      if (this.cleanString(fullName) !== this.cleanString(fullNameFind)) {
        data.show = true
        data.message = `This employee cannot be selected because their ID is already in use by "${fullNameFind}".`
        data.canSelect = false
      }

      return data
    }

    const existEmployeeCodeDelete = await Employee.query()
      .whereRaw("SUBSTRING_INDEX(employee_code, '-', 1) = ?", [employee.empCode])
      // .withTrashed()
      .first()

    if (existEmployeeCodeDelete) {
      const fullNameFind = `${existEmployeeCodeDelete.employeeFirstName} ${existEmployeeCodeDelete.employeeLastName}`

      if (this.cleanString(fullName) !== this.cleanString(fullNameFind)) {
        data.show = true
        data.message = `This employee cannot be selected because their ID is already in use by "${fullNameFind}".`
        data.canSelect = false
      }

      return data
    }

    const existEmployeeName = await Employee.query()
      .whereRaw("LOWER(CONCAT(employee_first_name, ' ', employee_last_name)) = LOWER(?)", [fullName])
      .withTrashed()
      .first()

    if (existEmployeeName) {
      data.show = true
      data.message = 'One employee with the same name already exists in the system. Please verify before making a selection.'
      data.canSelect = true
      return data
    }

    data.show = true
    data.message = ''
    data.canSelect = true

    return data
  }

  cleanString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z\s]/g, '')
      .toLowerCase()
      .trim()
  }

  /**
   * Normaliza los valores de orderDirection para manejar tanto inglés como español
   * @param orderDirection - Dirección del ordenamiento
   * @returns 'desc' o 'asc'
   */
  private getOrderDirection(orderDirection?: string): string {
    if (!orderDirection) return 'asc'

    const normalizedDirection = orderDirection.toLowerCase()

    // Manejar valores en inglés
    if (normalizedDirection === 'descend' || normalizedDirection === 'desc') {
      return 'desc'
    }

    // Manejar valores en español
    if (normalizedDirection === 'descendente') {
      return 'desc'
    }

    // Por defecto, ordenamiento ascendente
    return 'asc'
  }
}
