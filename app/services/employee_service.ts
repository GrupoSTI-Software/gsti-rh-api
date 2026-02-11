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
import VacationAuthorizationSignature from '#models/vacation_authorization_signature'
import SystemSettingsEmployee from '#models/system_settings_employee'
import SystemSetting from '#models/system_setting'
import { I18n } from '@adonisjs/i18n'
import Shift from '#models/shift'
import SystemSettingService from './system_setting_service.js'
import sharp from 'sharp'
import EmployeeShiftService from './employee_shift_service.js'
import EmployeeShift from '#models/employee_shift'
import ShiftExceptionService from './shift_exception_service.js'
import Holiday from '#models/holiday'
import EmployeeAssistCalendar from '#models/employee_assist_calendar'

import ExcelJS from 'exceljs'
import EmployeeZone from '#models/employee_zone'
import Address from '#models/address'
import EmployeeAddress from '#models/employee_address'
import AddressType from '#models/address_type'
export default class EmployeeService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async syncCreate(employee: BiometricEmployeeInterface) {
    // Guardar el personId que viene del frontend
    let personIdToDelete = employee.personId || null
    // const newEmployee = new Employee()
    // const personService = new PersonService(this.i18n)
    // const newPerson = await personService.syncCreate(employee)
    // const employeeType = await EmployeeType.query()
    //   .where('employee_type_slug', 'employee')
    //   .whereNull('employee_type_deleted_at')
    //   .first()

    try {
      // Verificar límite de empleados dentro del try-catch
      const businessUnitId = employee.businessUnitId || 1
      const limitCheck = await this.verifyEmployeeLimit(businessUnitId)

      if (limitCheck.status !== 200) {
        throw new Error(limitCheck.message)
      }

      const newEmployee = new Employee()

      const employeeType = await EmployeeType.query()
        .where('employee_type_slug', 'employee')
        .whereNull('employee_type_deleted_at')
        .first()

      // Usar el personId que viene del frontend
      if (employee.personId) {
        newEmployee.personId = employee.personId
      } else {
        const personService = new PersonService(this.i18n)
        const newPerson = await personService.syncCreate(employee)
        newEmployee.personId = newPerson.personId
        personIdToDelete = newPerson.personId
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
      newEmployee.businessUnitId = businessUnitId

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

      // Guardar empleado
      await newEmployee.save()

      await this.updateEmployeeSlug(newEmployee)

      // Asignar usuarios responsables
      await this.setUserResponsible(newEmployee.employeeId, employee.usersResponsible ? employee.usersResponsible : [])

      return newEmployee
    } catch (error) {
      // Si hay error y tenemos un personId, eliminarlo
      if (personIdToDelete) {
        try {
          await this.deletePersonById(personIdToDelete)
        } catch (deleteError) {
          console.error('Error eliminando persona huérfana:', deleteError)
        }
      }
      throw error
    }

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

    const normalizeTime = (time?: string | null): string | null => {
      if (!time) {
        return null
      }
      const trimmed = time.trim()
      if (!trimmed) {
        return null
      }
      return trimmed.length === 5 ? `${trimmed}:00` : trimmed
    }

    const shiftStartTimeInit = normalizeTime(filters.shiftStartTimeInit ?? null)
    const shiftStartTimeEnd = normalizeTime(filters.shiftStartTimeEnd ?? null)
    const shiftEndTimeStart = normalizeTime(filters.shiftEndTimeStart ?? null)
    const shiftEndTimeEnd = normalizeTime(filters.shiftEndTimeEnd ?? null)

    const employees = await Employee.query()
      .whereIn('businessUnitId', businessUnitsList)
      .if(filters.onlyPayroll, (query) => {
        query.whereIn('payrollBusinessUnitId', businessUnitsList)
      })
      .if(filters.businessUnitId && filters.businessUnitId > 0, (query) => {
        query.where('businessUnitId', filters.businessUnitId!)
      })
      .if(filters.payrollBusinessUnitId && filters.payrollBusinessUnitId > 0, (query) => {
        query.where('payrollBusinessUnitId', filters.payrollBusinessUnitId!)
      })
      .if(filters.search, (query) => {
        query.where((subQuery) => {
          subQuery
            .whereRaw('UPPER(CONCAT(COALESCE(employee_first_name, ""), " ", COALESCE(employee_last_name, ""), " ", COALESCE(employee_second_last_name, ""))) LIKE ?', [`%${filters.search.toUpperCase()}%`])
            .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
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
      .if(shiftStartTimeInit || shiftStartTimeEnd || shiftEndTimeStart || shiftEndTimeEnd, (query) => {
        query.whereHas('employeeShifts', (employeeShiftQuery) => {
          employeeShiftQuery.whereNull('employe_shifts_deleted_at')
          if (filters.exceptionDate) {
            employeeShiftQuery.whereRaw('DATE(employe_shifts_apply_since) <= ?', [filters.exceptionDate])
          }
          employeeShiftQuery.whereHas('shift', (shiftQuery) => {
            // Filtro por rango de hora de entrada
            if (shiftStartTimeInit && shiftStartTimeEnd) {
              shiftQuery.whereRaw('TIME(shift_time_start) >= TIME(?)', [shiftStartTimeInit])
                .whereRaw('TIME(shift_time_start) <= TIME(?)', [shiftStartTimeEnd])
            } else if (shiftStartTimeInit) {
              shiftQuery.whereRaw('TIME(shift_time_start) >= TIME(?)', [shiftStartTimeInit])
            } else if (shiftStartTimeEnd) {
              shiftQuery.whereRaw('TIME(shift_time_start) <= TIME(?)', [shiftStartTimeEnd])
            }

            // Filtro por rango de hora de salida
            if (shiftEndTimeStart && shiftEndTimeEnd) {
              shiftQuery.whereRaw(
                'TIME(ADDTIME(shift_time_start, SEC_TO_TIME(shift_active_hours * 3600))) >= TIME(?)',
                [shiftEndTimeStart]
              )
              shiftQuery.whereRaw(
                'TIME(ADDTIME(shift_time_start, SEC_TO_TIME(shift_active_hours * 3600))) <= TIME(?)',
                [shiftEndTimeEnd]
              )
            } else if (shiftEndTimeStart) {
              shiftQuery.whereRaw(
                'TIME(ADDTIME(shift_time_start, SEC_TO_TIME(shift_active_hours * 3600))) >= TIME(?)',
                [shiftEndTimeStart]
              )
            } else if (shiftEndTimeEnd) {
              shiftQuery.whereRaw(
                'TIME(ADDTIME(shift_time_start, SEC_TO_TIME(shift_active_hours * 3600))) <= TIME(?)',
                [shiftEndTimeEnd]
              )
            }
          })
        })
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
        query.orderByRaw(`CAST(employee_payroll_code AS UNSIGNED) ${direction}, employee_payroll_code ${direction}`)
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
    // Guardar el personId que viene del frontend
    const personIdToDelete = employee.personId || null

    try {
      // Verificar límite de empleados dentro del try-catch
      const limitCheck = await this.verifyEmployeeLimit(employee.businessUnitId)
      if (limitCheck.status !== 200) {
        throw new Error(limitCheck.message)
      }
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
      newEmployee.employeeAuthorizeAnyZones = employee.employeeAuthorizeAnyZones

      // Guardar empleado
      await newEmployee.save()

      await this.updateEmployeeSlug(newEmployee)

      // Asignar usuarios responsables
      await this.setUserResponsible(newEmployee.employeeId, usersResponsible ? usersResponsible : [])

      await newEmployee.load('businessUnit')
      return newEmployee
    } catch (error) {
      // Si hay error y tenemos un personId, eliminarlo
      if (personIdToDelete) {
        try {
          await this.deletePersonById(personIdToDelete)
        } catch (deleteError) {
          console.error('Error eliminando persona huérfana:', deleteError)
        }
      }
      throw error
    }
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
    currentEmployee.employeeAuthorizeAnyZones = employee.employeeAuthorizeAnyZones
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

  async deleteEmployeePhoto(employeeId: number, uploadService: any) {
    const currentEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()

    if (!currentEmployee) {
      return {
        status: 404,
        type: 'warning',
        title: 'Employee not found',
        message: 'The employee was not found with the entered ID',
        data: { employeeId },
      }
    }

    if (!currentEmployee.employeePhoto) {
      return {
        status: 400,
        type: 'warning',
        title: 'No photo to delete',
        message: 'The employee does not have a photo to delete',
        data: { employeeId },
      }
    }

    try {
      // Extraer la key de S3 desde la URL completa
      const photoUrl = currentEmployee.employeePhoto
      let fileKey = photoUrl

      // Si es una URL completa, extraer la key
      if (photoUrl && (photoUrl.includes('http://') || photoUrl.includes('https://'))) {
        try {
          const url = new URL(photoUrl)
          // La key de S3 es el pathname sin el primer slash
          const pathname = url.pathname
          // Remover el primer slash si existe
          fileKey = pathname.startsWith('/') ? pathname.substring(1) : pathname
        } catch (error) {
          // Si no se puede parsear como URL, intentar extraer el nombre del archivo
          const path = await import('node:path')
          const Env = await import('#start/env')
          const fileNameWithExt = decodeURIComponent(path.default.basename(photoUrl))
          fileKey = `${Env.default.get('AWS_ROOT_PATH')}/employees/${fileNameWithExt}`
        }
      }

      // Eliminar el archivo de S3
      const deleteResult = await uploadService.deleteFile(fileKey)

      if (deleteResult.status !== 200) {
        return {
          status: 500,
          type: 'error',
          title: 'Error deleting photo',
          message: 'Error deleting photo from storage',
          data: { employeeId, error: deleteResult.message },
        }
      }

      // Actualizar el empleado para eliminar la referencia a la foto
      currentEmployee.employeePhoto = null
      await currentEmployee.save()

      return {
        status: 200,
        type: 'success',
        title: 'Photo deleted',
        message: 'The employee photo was deleted successfully',
        data: { employee: currentEmployee },
      }
    } catch (error: any) {
      return {
        status: 500,
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred while deleting the photo',
        data: { employeeId, error: error.message },
      }
    }
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

  /**
   * Reactivar un empleado eliminado (soft delete)
   * @param currentEmployee - Empleado a reactivar
   * @returns Promise<Employee>
   */
  async reactivate(currentEmployee: Employee) {
    // Verificar límite de empleados antes de reactivar
    const limitCheck = await this.verifyEmployeeLimit(currentEmployee.businessUnitId)
    if (limitCheck.status !== 200) {
      throw new Error(limitCheck.message)
    }

    // Restaurar el empleado eliminado
    await currentEmployee.restore()

    // Limpiar el código temporal si existe
    if (typeof currentEmployee.employeeCode === 'string' && currentEmployee.employeeCode.includes('-IN')) {
      const originalCode = currentEmployee.employeeCode.split('-IN')[0]
      currentEmployee.employeeCode = originalCode
      await currentEmployee.save()
    }

    return currentEmployee
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

      const signatures = await VacationAuthorizationSignature.query()
      .whereNull('vacation_authorization_signature_deleted_at')
      .whereIn('shift_exception_id', vacations.map((vacation: ShiftException) => vacation.shiftExceptionId))
      .orderBy('vacation_authorization_signature_created_at', 'asc')

    const vacationsWithSignatures = vacations.map((vacation) => {
      const signature = signatures.find((sig: VacationAuthorizationSignature) =>
        sig.shiftExceptionId === vacation.shiftExceptionId
      )?.vacationAuthorizationSignatureFile

      return {
        ...vacation.$attributes, // Solo los atributos del modelo
        signature: signature || null
      }
    })

    return vacationsWithSignatures ? vacationsWithSignatures : [] as (ShiftException & { signature: string })[]
  }

  /**
   * Obtiene el vacationSettingId correcto y valida vacaciones disponibles
   * para una fecha específica. Si no hay disponibles en el año actual,
   * busca en años anteriores.
   * @param employee - Empleado
   * @param vacationDate - Fecha de la vacación
   * @returns Objeto con vacationSettingId y disponibilidad, o null si no hay disponibles
   */
  private async getAvailableVacationSetting(
    employee: Employee,
    vacationDate: DateTime
  ): Promise<{ vacationSettingId: number; year: number } | null> {
    if (!employee.employeeHireDate) {
      return null
    }

    const vacationYear = vacationDate.year
    const start = DateTime.fromISO(employee.employeeHireDate.toString())

    if (!start.isValid) {
      return null
    }

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

    const month = start.month
    const day = start.day

    let currentYear = vacationYear
    const startYear = start.year
    const maxYearsToCheck = 5

    for (let i = 0; i < maxYearsToCheck; i++) {
      const checkYear = currentYear - i
      if (checkYear < startYear) {
        break
      }

      const yearsPassed = checkYear - startYear
      if (yearsPassed < 0) {
        continue
      }

      const checkFormattedDate = DateTime.fromObject({
        year: checkYear,
        month: month,
        day: day,
      }).toFormat('yyyy-MM-dd')

      const vacationSetting = await VacationSetting.query()
        .whereNull('vacation_setting_deleted_at')
        .where('vacation_setting_years_of_service', yearsPassed)
        .where('vacation_setting_apply_since', '<=', checkFormattedDate)
        .if(employeeIsCrew, (query) => {
          query.where('vacation_setting_crew', 1)
        })
        .orderBy('vacation_setting_years_of_service', 'desc')
        .first()

      if (!vacationSetting) {
        continue
      }

      const vacationsUsed = await ShiftException.query()
        .whereNull('shift_exceptions_deleted_at')
        .where('vacation_setting_id', vacationSetting.vacationSettingId)
        .where('employee_id', employee.employeeId)

      const daysUsed = vacationsUsed.length
      const daysAvailable = vacationSetting.vacationSettingVacationDays - daysUsed

      if (daysAvailable > 0) {
        return {
          vacationSettingId: vacationSetting.vacationSettingId,
          year: checkYear,
        }
      }
    }

    return null
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

  async getZones(employeeId: number) {
    const employeeZones = await EmployeeZone.query()
      .whereNull('employee_zone_deleted_at')
      .where('employee_id', employeeId)
      .preload('zone')
      .orderBy('employee_id')
      .paginate(1, 9999999)

    return employeeZones ? employeeZones : []
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
            .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
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

  async getAnniversary(filters: EmployeeFilterSearchInterface) {
    const year = filters.year
    if (!year) {
      return []
    }
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
            .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
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
      .whereNotNull('employee_hire_date')
      // Solo incluir empleados que empezaron antes del año especificado
      // Para que puedan cumplir uno o más años en el año consultado
      .whereRaw('YEAR(employee_hire_date) < ?', [year])
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
            .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
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

    const businessUnitsList = businessUnits.map((business) => business.businessUnitSlug)

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
   * Eliminar una persona por su ID
   * @param personId - ID de la persona a eliminar
   * @returns Promise<boolean> - true si se eliminó correctamente
   */
  async deletePersonById(personId: number): Promise<boolean> {
    try {
      const person = await Person.find(personId)
      if (person) {
        await person.delete()
        return true
      }
      return false
    } catch (error) {
      console.error('Error eliminando persona por ID:', error)
      return false
    }
  }

  /**
   * Limpiar registros huérfanos de personas que no tienen empleados asociados
   * Útil para limpiar registros que quedaron de intentos fallidos de creación
   * @returns Promise<number> - Número de registros eliminados
   */
  async cleanupOrphanPersons(): Promise<number> {
    try {
      // Buscar personas que no tienen empleados asociados
      const orphanPersons = await Person.query()
        .whereNotExists((query) => {
          query.from('employees')
            .whereRaw('employees.person_id = persons.person_id')
            .whereNull('employees.employee_deleted_at')
        })
        .whereNotExists((query) => {
          query.from('customers')
            .whereRaw('customers.person_id = persons.person_id')
            .whereNull('customers.customer_deleted_at')
        })
        .whereNotExists((query) => {
          query.from('users')
            .whereRaw('users.person_id = persons.person_id')
            .whereNull('users.user_deleted_at')
        })

      let deletedCount = 0
      for (const person of orphanPersons) {
        await person.delete()
        deletedCount++
      }

      return deletedCount
    } catch (error) {
      console.error('Error cleaning up orphan persons:', error)
      return 0
    }
  }

  /**
   * Verificar si se puede crear un empleado sin exceder el límite establecido
   * @param businessUnitId - ID de la unidad de negocio
   * @returns Promise<{status: number, type: string, title: string, message: string, data: any}>
   */
  async verifyEmployeeLimit(businessUnitId: number): Promise<{status: number, type: string, title: string, message: string, data: any}> {
    try {
      // Obtener el límite de empleados para la unidad de negocio
      const employeeLimit = await this.getEmployeeLimitForBusinessUnit(businessUnitId)

      if (employeeLimit === null) {
        // No hay límite establecido, permitir creación
        return {
          status: 200,
          type: 'success',
          title: 'Employee limit verification',
          message: 'No employee limit is set for this business unit',
          data: { businessUnitId, limit: null }
        }
      }

      // Contar empleados activos en la unidad de negocio
      const activeEmployees = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('businessUnitId', businessUnitId)
      const activeEmployeesCount = activeEmployees.length

      if (activeEmployeesCount >= employeeLimit) {
        return {
          status: 400,
          type: 'warning',
          title: 'Employee limit exceeded',
          message: `Cannot create employee. The business unit has reached its limit of ${employeeLimit} employees. Current count: ${activeEmployeesCount}`,
          data: { businessUnitId, limit: employeeLimit, currentCount: activeEmployeesCount }
        }
      }

      return {
        status: 200,
        type: 'success',
        title: 'Employee limit verification',
        message: 'Employee can be created within the established limit',
        data: { businessUnitId, limit: employeeLimit, currentCount: activeEmployeesCount }
      }
    } catch (error) {
      return {
        status: 400,
        type: 'error',
        title: 'Error verifying employee limit',
        message: 'An error occurred while verifying the employee limit',
        data: { businessUnitId, error: error.message }
      }
    }
  }

  /**
   * Obtener el límite de empleados para una unidad de negocio específica
   * @param businessUnitId - ID de la unidad de negocio
   * @returns Promise<number | null>
   */
  private async getEmployeeLimitForBusinessUnit(businessUnitId: number): Promise<number | null> {
    try {
      // Obtener la variable de entorno SYSTEM_BUSINESS
      const systemBusinessEnv = env.get('SYSTEM_BUSINESS', '')
      if (!systemBusinessEnv) {
        console.error('SYSTEM_BUSINESS environment variable not found')
        return null
      }

      // Convertir la variable de entorno a array de strings
      const systemBusinessUnits = systemBusinessEnv.split(',').map((unit: string) => unit.trim())

      // Obtener el nombre de la unidad de negocio
      const businessUnit = await BusinessUnit.find(businessUnitId)
      if (!businessUnit) {
        console.error('Business unit not found:', businessUnitId)
        return null
      }

      // Buscar el system_setting que contenga la unidad de negocio
      const systemSettings = await SystemSetting.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_active', 1)
        .select('system_setting_id', 'system_setting_business_units')

      let matchingSystemSettingId: number | null = null

      for (const setting of systemSettings) {
        const settingBusinessUnits = setting.systemSettingBusinessUnits.split(',').map((unit: string) => unit.trim())

        // Verificar si hay coincidencia entre las unidades de negocio
        const hasMatch = settingBusinessUnits.some((settingUnit: string) =>
          systemBusinessUnits.includes(settingUnit)
        )

        if (hasMatch) {
          matchingSystemSettingId = setting.systemSettingId
          break
        }
      }

      if (!matchingSystemSettingId) {
        return null
      }

      // Buscar el límite de empleados activo para el system_setting encontrado
      const result = await SystemSettingsEmployee.query()
        .where('is_active', 1)
        .where('system_setting_id', matchingSystemSettingId)
        .whereNull('system_setting_employee_deleted_at')
        .first()

      return result ? result.employeeLimit : null
    } catch (error) {
      console.error('Error getting employee limit for business unit:', error)
      return null
    }
  }

  /**
   * Import employees from Excel file
   */
  async importFromExcel(file: any) {
    const workbook = new ExcelJS.Workbook()

    try {
      // Leer el archivo Excel
      await workbook.xlsx.readFile(file.tmpPath)
      const worksheet = workbook.getWorksheet(1)

      if (!worksheet) {
        throw new Error('No se encontró ninguna hoja de trabajo en el archivo Excel')
      }

      const { headers, headerRowNumber } = this.validateExcelHeaders(worksheet)

      // Obtener departamentos, posiciones y unidades de negocio existentes para mapeo
      const departments = await Department.query()
        .whereNull('department_deleted_at')
        .select('departmentId', 'departmentName')

      const positions = await Position.query()
        .whereNull('position_deleted_at')
        .select('positionId', 'positionName')

      const businessUnits = await BusinessUnit.query()
        .whereNull('business_unit_deleted_at')
        .where('business_unit_active', 1)
        .select('businessUnitId', 'businessUnitName')

      const employeeTypes = await EmployeeType.query()
        .whereNull('employee_type_deleted_at')
        .select('employeeTypeId', 'employeeTypeName')

      // Buscar departamento y posición por defecto
      const defaultDepartment = departments.find(dept =>
        dept.departmentName?.toLowerCase().includes('sin departamento')
      )
      const defaultPosition = positions.find(pos =>
        pos.positionName?.toLowerCase().includes('sin posición')
      )

      // Obtener empleados existentes por número de nómina
      const existingEmployees = await Employee.query()
        .whereNull('deletedAt')
        .preload('person')
        .select(
          'employeeId',
          'employeeCode',
          'employeePayrollCode',
          'employeeFirstName',
          'employeeLastName',
          'employeeSecondLastName',
          'personId'
        )

      // Obtener códigos de empleado existentes para generar códigos únicos
      const existingEmployeeCodes = existingEmployees.map(emp =>
        emp.employeeCode.toString()
      )

      // Verificar límite de empleados (se verificará por unidad de negocio individual)

      const results = {
        totalRows: 0,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        limitReached: false,
        errors: [] as string[]
      }

      const rows: Array<{ row: any; rowNumber: number }> = []
      worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
        if (rowNumber <= headerRowNumber) return
        rows.push({ row, rowNumber })
      })

      // Encabezados requeridos para validación
      const requiredHeaders = [
        'Identificador de nómina',
        'Unidad de negocio de trabajo',
        'Unidad de negocio de nómina',
        'Nombre del empleado',
        'Apellido paterno del empleado'
      ]

      // Validar que todos los encabezados requeridos estén presentes
      const missingRequiredHeaders: string[] = []
      for (const requiredHeader of requiredHeaders) {
        const requiredLower = requiredHeader.toLowerCase().trim()
        const found = headers.some(header => {
          if (!header || typeof header !== 'string') return false
          const headerLower = header.toLowerCase().trim()
          return headerLower === requiredLower ||
                 headerLower.includes(requiredLower.substring(0, 10)) ||
                 requiredLower.includes(headerLower.substring(0, 10))
        })
        if (!found) {
          missingRequiredHeaders.push(requiredHeader)
        }
      }

      if (missingRequiredHeaders.length > 0) {
        throw this.createHeaderValidationError(
          `Faltan los siguientes encabezados requeridos: ${missingRequiredHeaders.join(', ')}`
        )
      }

      // Primero, validar que TODOS los registros tengan los campos requeridos
      // Si falta alguno, invalidar todo el archivo
      for (const { row, rowNumber } of rows) {
        const employeeData = this.extractEmployeeDataFromRow(row, headers)

        // Validar campos requeridos
        const requiredFieldsErrors: string[] = []

        if (!employeeData.employeeNumber || employeeData.employeeNumber.toString().trim() === '') {
          requiredFieldsErrors.push('Identificador de nómina')
        }
        if (!employeeData.businessUnit || employeeData.businessUnit.toString().trim() === '') {
          requiredFieldsErrors.push('Unidad de negocio de trabajo')
        }
        if (!employeeData.payrollBusinessUnit || employeeData.payrollBusinessUnit.toString().trim() === '') {
          requiredFieldsErrors.push('Unidad de negocio de nómina')
        }
        if (!employeeData.firstName || employeeData.firstName.toString().trim() === '') {
          requiredFieldsErrors.push('Nombre del empleado')
        }
        if (!employeeData.lastName || employeeData.lastName.toString().trim() === '') {
          requiredFieldsErrors.push('Apellido paterno del empleado')
        }

        // Si falta algún campo requerido, invalidar todo el archivo inmediatamente
        if (requiredFieldsErrors.length > 0) {
          throw this.createHeaderValidationError(
            'El archivo Excel contiene registros con campos requeridos faltantes. ' +
            `Fila ${rowNumber} falta: ${requiredFieldsErrors.join(', ')}. ` +
            'Todos los registros deben tener los campos requeridos completos.'
          )
        }
      }

      // Si llegamos aquí, todos los registros tienen los campos requeridos
      // Ahora procesar todas las filas para validar y contar empleados nuevos
      let newEmployeesCount = 0
      const validRows: Array<{ row: any; rowNumber: number; employeeData: any; businessUnitId: number | null; payrollBusinessUnitId: number | null }> = []

      for (const { row, rowNumber } of rows) {
        results.totalRows++

        try {
          const employeeData = this.extractEmployeeDataFromRow(row, headers)

          // Validar que los datos básicos estén presentes
          if (!employeeData.firstName && !employeeData.lastName) {
            results.skipped++
            results.errors.push(`Fila ${rowNumber}: Fila vacía o sin datos de empleado`)
            continue
          }

          // Validar datos del empleado
          const employeeValidation = this.validateEmployeeData(employeeData)
          if (!employeeValidation.isValid) {
            results.skipped++
            results.errors.push(`Fila ${rowNumber}: ${employeeValidation.errors.join(', ')}`)
            continue
          }

          // Validar datos de la persona
          const personValidation = this.validatePersonData(employeeData)
          if (!personValidation.isValid) {
            results.skipped++
            results.errors.push(`Fila ${rowNumber}: ${personValidation.errors.join(', ')}`)
            continue
          }

          // Mapear unidad de negocio de trabajo por nombre
          let businessUnitId = this.mapBusinessUnit(employeeData.businessUnit, businessUnits)
          // Si no se encuentra, usar la primera unidad de negocio de la base de datos (sin mensaje)
          if (businessUnitId === null && businessUnits.length > 0) {
            businessUnitId = businessUnits[0].businessUnitId
          }

          // Mapear unidad de negocio de nómina por nombre
          let payrollBusinessUnitId = this.mapBusinessUnit(employeeData.payrollBusinessUnit, businessUnits)
          // Si no se encuentra, usar la primera unidad de negocio de la base de datos (sin mensaje)
          if (payrollBusinessUnitId === null && businessUnits.length > 0) {
            payrollBusinessUnitId = businessUnits[0].businessUnitId
          }

          // Si no se especifica unidad de negocio de trabajo, usar la de nómina como fallback
          // Si tampoco hay de nómina, usar la primera de la base de datos
          const finalBusinessUnitId = businessUnitId || payrollBusinessUnitId || (businessUnits.length > 0 ? businessUnits[0].businessUnitId : null)
          const finalPayrollBusinessUnitId = payrollBusinessUnitId || businessUnitId || (businessUnits.length > 0 ? businessUnits[0].businessUnitId : null)

          if (finalBusinessUnitId === null) {
            results.skipped++
            results.errors.push(`Fila ${rowNumber}: No se pudo determinar la unidad de negocio`)
            continue
          }

          // Buscar empleado existente por ID (columna oculta) o por número de nómina
          const existingEmployee = this.findExistingEmployeeForImport(employeeData, existingEmployees)

          if (existingEmployee) {
            // Para empleados existentes, no contamos para el límite
            validRows.push({ row, rowNumber, employeeData, businessUnitId: finalBusinessUnitId, payrollBusinessUnitId: finalPayrollBusinessUnitId })
          } else {
            // Para empleados nuevos, contamos el total
            newEmployeesCount++
            validRows.push({ row, rowNumber, employeeData, businessUnitId: finalBusinessUnitId, payrollBusinessUnitId: finalPayrollBusinessUnitId })
          }

        } catch (error: any) {
          results.skipped++
          results.errors.push(`Fila ${rowNumber}: ${error.message}`)
        }
      }

      // Verificar límite general de empleados
      if (newEmployeesCount > 0) {
        // Obtener el límite general del sistema (usando la primera unidad de negocio como referencia)
        const firstBusinessUnit = businessUnits[0]
        const employeeLimit = firstBusinessUnit ? await this.getEmployeeLimitForBusinessUnit(firstBusinessUnit.businessUnitId) : null

        if (employeeLimit) {
          const currentTotalCount = await Employee.query()
            .whereNull('deletedAt')
            .count('* as total')
          const currentTotalEmployeeCount = Number(currentTotalCount[0].$extras.total)

          if (currentTotalEmployeeCount + newEmployeesCount > employeeLimit) {
            results.limitReached = true
            results.errors.push(`Límite general de empleados alcanzado. Límite: ${employeeLimit}, Actual: ${currentTotalEmployeeCount}, Intentando crear: ${newEmployeesCount}`)
          }
        }
      }

      // Si se alcanzó el límite, no procesar más empleados nuevos
      if (results.limitReached) {
        // Procesar solo empleados existentes (actualizaciones)
        for (const { rowNumber, employeeData, businessUnitId, payrollBusinessUnitId } of validRows) {
          const existingEmployee = this.findExistingEmployeeForImport(employeeData, existingEmployees)

          if (existingEmployee) {
            try {
              await this.updateExistingEmployee(existingEmployee, employeeData, departments, positions, defaultDepartment, defaultPosition, businessUnitId, payrollBusinessUnitId, employeeTypes)
              results.updated++
              results.processed++
            } catch (error: any) {
              results.skipped++
              results.errors.push(`Fila ${rowNumber}: ${error.message}`)
            }
          } else {
            results.skipped++
            results.errors.push(`Fila ${rowNumber}: Límite de empleados alcanzado - ${employeeData.firstName} ${employeeData.lastName}`)
          }
        }
      } else {
        // Procesar todos los empleados (creaciones y actualizaciones)
        const createdEmployees: Employee[] = [] // Array para almacenar empleados creados

        for (const { rowNumber, employeeData, businessUnitId, payrollBusinessUnitId } of validRows) {
          try {
            const existingEmployee = this.findExistingEmployeeForImport(employeeData, existingEmployees)

            if (existingEmployee) {
              await this.updateExistingEmployee(existingEmployee, employeeData, departments, positions, defaultDepartment, defaultPosition, businessUnitId, payrollBusinessUnitId, employeeTypes)
              results.updated++
              results.processed++
            } else {
              // Generar código de empleado único si no se proporciona
              let employeeCode = employeeData.employeeNumber
              if (!employeeCode || existingEmployeeCodes.includes(employeeCode)) {
                employeeCode = this.generateUniqueEmployeeCode(
                  existingEmployeeCodes
                )
              }
              existingEmployeeCodes.push(employeeCode)

              // Mapear departamento y posición usando búsqueda por similitud
              const departmentId = this.mapDepartmentBySimilarity(employeeData.department, departments, defaultDepartment)
              const positionId = this.mapPositionBySimilarity(employeeData.position, positions, defaultPosition)

              const person = await this.createPerson(employeeData)
              const newEmployee = await this.createEmployee(employeeData, person.personId, businessUnitId!, payrollBusinessUnitId!, departmentId, positionId, employeeCode, employeeTypes)
              await this.ensureEmployeeResidenceAddress(newEmployee.employeeId, employeeData)

              // Agregar a la lista de empleados creados para enviar a biométricos
              createdEmployees.push(newEmployee)

              results.created++
              results.processed++
            }

          } catch (error: any) {
            results.skipped++
            results.errors.push(`Fila ${rowNumber}: ${error.message}`)
          }
        }

        // Enviar empleados creados a la API de biométricos
        if (createdEmployees.length > 0) {
          try {
            const biometricResult = await this.sendEmployeesToBiometrics(createdEmployees)
            if (!biometricResult.success) {
              results.errors.push(`Error al sincronizar con biométricos: ${biometricResult.message}`)
            }
          } catch (error: any) {
            results.errors.push(`Error al sincronizar con biométricos: ${error.message}`)
          }
        }
      }

      return results

    } catch (error: any) {
      // Si es un error de validación de cabeceras, propagarlo tal cual
      if (error.isHeaderValidationError) {
        throw error
      }
      throw new Error(`Error al procesar el archivo Excel: ${error.message}`)
    }
  }

  /**
   * Buscar empleado existente para importación: primero por ID (columna oculta), luego por número de nómina
   */
  private findExistingEmployeeForImport(employeeData: any, existingEmployees: any[]): any {
    if (employeeData.employeeId) {
      const byId = existingEmployees.find((emp) => emp.employeeId === Number(employeeData.employeeId))
      if (byId) return byId
    }
    return existingEmployees.find(
      (emp) =>
        emp.employeePayrollCode?.toString() === employeeData.employeeNumber ||
        emp.employeeCode?.toString() === employeeData.employeeNumber
    ) ?? null
  }

  /**
   * Clase de error personalizada para errores de validación de cabeceras
   */
  private createHeaderValidationError(message: string): Error {
    const error = new Error(message)
    ;(error as any).isHeaderValidationError = true
    ;(error as any).statusCode = 400
    return error
  }

  /**
   * Validar encabezados del Excel
   */
  private validateExcelHeaders(worksheet: any) {
    const expectedHeaders = [
      'Identificador de nómina',
      'Unidad de negocio de trabajo',
      'Unidad de negocio de nómina',
      'Nombre del empleado',
      'Apellido paterno del empleado',
      'Apellido materno del empleado',
      'Fecha de contratación (yyyy/mm/dd)',
      'Departamento',
      'Posición',
      'Salario diario',
      'Fecha de nacimiento (dd/mm/yyyy)',
      'CURP',
      'RFC',
      'NSS',
      'Correo empresa',
      'Correo personal',
      'Teléfono Empresa',
      'Teléfono Personal'
    ]

    // Encabezados requeridos que deben estar presentes
    const requiredHeaders = [
      'Identificador de nómina',
      'Unidad de negocio de trabajo',
      'Unidad de negocio de nómina',
      'Nombre del empleado',
      'Apellido paterno del empleado'
    ]

    const r1 = worksheet.getRow(1)
    const cell1 = (r1.getCell(1).value ?? r1.getCell(2).value ?? '').toString().trim().toLowerCase()
    const isHeaderRow1 = cell1.includes('id empleado') || cell1.includes('identificador de nómina')
    const headerRowNumber = isHeaderRow1 ? 1 : 3

    const firstRow = worksheet.getRow(headerRowNumber)
    const headers: string[] = []

    firstRow.eachCell((cell: any, colNumber: number) => {
      const cellValue = cell.value
      if (cellValue !== null && cellValue !== undefined) {
        headers[colNumber] = String(cellValue).trim()
      } else {
        headers[colNumber] = ''
      }
    })

    // Filtrar cabeceras vacías y asegurar que todos los elementos sean strings válidos
    const nonEmptyHeaders = headers.filter((h): h is string =>
      h !== undefined && h !== null && typeof h === 'string' && h.trim() !== ''
    )

    if (nonEmptyHeaders.length === 0) {
      throw this.createHeaderValidationError('El archivo Excel no contiene cabeceras en la primera fila')
    }

    // Verificar que los encabezados coincidan
    const missingHeaders: string[] = []
    const incorrectHeaders: Array<{ found: string; expected: string }> = []

    // Filtrar headers válidos (no undefined, null o vacíos)
    const validHeaders = headers.filter((header): header is string =>
      header !== undefined && header !== null && typeof header === 'string' && header.trim() !== ''
    )

    // Mapa para rastrear qué headers ya fueron asignados
    const usedHeaders = new Set<string>()

    for (const expected of expectedHeaders) {
      const expectedLower = expected.toLowerCase().trim()

      // Primero buscar coincidencia exacta
      let foundHeader = validHeaders.find(header => {
        if (!header || typeof header !== 'string') return false
        const headerLower = header.toLowerCase().trim()
        return headerLower === expectedLower && !usedHeaders.has(headerLower)
      })

      // Si no hay coincidencia exacta, buscar coincidencia parcial
      // Pero ser más estricto para evitar falsos positivos
      if (!foundHeader) {
        // Calcular el mejor match basado en similitud
        let bestMatch: { header: string; score: number } | null = null

        for (const header of validHeaders) {
          if (!header || typeof header !== 'string') continue
          const headerLower = header.toLowerCase().trim()
          if (usedHeaders.has(headerLower)) continue

          // Calcular similitud
          let score = 0

          // Si es una coincidencia exacta (después de normalizar espacios)
          const normalizedHeader = headerLower.replace(/\s+/g, ' ').trim()
          const normalizedExpected = expectedLower.replace(/\s+/g, ' ').trim()
          if (normalizedHeader === normalizedExpected) {
            score = 100
          } else {
            // Verificar si el header contiene palabras clave importantes del esperado
            const expectedWords = normalizedExpected.split(' ').filter(w => w.length > 3)
            const headerWords = normalizedHeader.split(' ').filter(w => w.length > 3)

            // Contar palabras coincidentes
            const matchingWords = expectedWords.filter(ew =>
              headerWords.some(hw => hw === ew || hw.includes(ew) || ew.includes(hw))
            )

            // Calcular score basado en porcentaje de palabras coincidentes
            if (expectedWords.length > 0) {
              score = (matchingWords.length / expectedWords.length) * 100
            }

            // Penalizar si hay palabras importantes que no coinciden
            // Especialmente para headers similares como "trabajo" vs "nómina"
            if (normalizedExpected.includes('trabajo') && !normalizedHeader.includes('trabajo')) {
              score = 0
            }
            if (normalizedExpected.includes('nómina') && !normalizedHeader.includes('nómina')) {
              score = 0
            }
          }

          // Solo considerar matches con score > 70%
          if (score > 70 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { header, score }
          }
        }

        if (bestMatch) {
          foundHeader = bestMatch.header
        }
      }

      if (!foundHeader) {
        missingHeaders.push(expected)
      } else {
        // Marcar el header como usado
        const foundLower = foundHeader.toLowerCase().trim()
        usedHeaders.add(foundLower)

        // Solo marcar como incorrecto si la diferencia es significativa
        // (no solo espacios o mayúsculas/minúsculas)
        if (foundLower !== expectedLower) {
          // Verificar si la diferencia es solo en espacios o formato
          const normalizedFound = foundLower.replace(/\s+/g, ' ').trim()
          const normalizedExpected = expectedLower.replace(/\s+/g, ' ').trim()

          // Si después de normalizar espacios son iguales, no es un error
          if (normalizedFound !== normalizedExpected) {
            incorrectHeaders.push({ found: foundHeader, expected })
          }
        }
      }
    }

    // Construir mensaje de error detallado
    const errorMessages: string[] = []

    if (missingHeaders.length > 0) {
      errorMessages.push(`Faltan los siguientes encabezados requeridos: ${missingHeaders.join(', ')}`)
    }

    if (incorrectHeaders.length > 0) {
      const incorrectList = incorrectHeaders.map(inc => `"${inc.found}" (debería ser "${inc.expected}")`).join(', ')
      errorMessages.push(`Los siguientes encabezados están incorrectos: ${incorrectList}`)
    }

    // Verificar si hay cabeceras adicionales no esperadas (opcional, solo como advertencia)
    const unexpectedHeaders = validHeaders.filter(header => {
      if (!header || typeof header !== 'string' || header.trim() === '') return false
      return !expectedHeaders.some(expected => {
        const headerLower = header.toLowerCase().trim()
        const expectedLower = expected.toLowerCase().trim()
        return headerLower === expectedLower ||
               headerLower.includes(expectedLower.substring(0, 10)) ||
               expectedLower.includes(headerLower.substring(0, 10))
      })
    })

    if (unexpectedHeaders.length > 0 && errorMessages.length === 0) {
      // Si solo hay cabeceras inesperadas pero no faltan las requeridas, es una advertencia
      // pero no un error crítico
    }

    // Validar que los encabezados requeridos estén presentes
    const foundRequiredHeaders: string[] = []
    for (const requiredHeader of requiredHeaders) {
      const requiredLower = requiredHeader.toLowerCase().trim()
      const found = validHeaders.some(header => {
        if (!header || typeof header !== 'string') return false
        const headerLower = header.toLowerCase().trim()
        return headerLower === requiredLower ||
               headerLower.includes(requiredLower.substring(0, 10)) ||
               requiredLower.includes(headerLower.substring(0, 10))
      })
      if (found) {
        foundRequiredHeaders.push(requiredHeader)
      } else {
        errorMessages.push(`Falta el encabezado requerido: "${requiredHeader}"`)
      }
    }

    if (errorMessages.length > 0) {
      const fullMessage = `Error en las cabeceras del archivo Excel:\n${errorMessages.join('\n')}`
      throw this.createHeaderValidationError(fullMessage)
    }

    return { headers, headerRowNumber }
  }

  /**
   * Extraer datos del empleado de una fila
   */
  private extractEmployeeDataFromRow(row: any, headers: string[]) {
    const data: any = {}

    const parseYesNo = (v: string): number => {
      const s = (v || '').toString().trim().toLowerCase()
      if (s === 'sí' || s === 'si' || s === '1' || s === 'yes') return 1
      return 0
    }

    row.eachCell((cell: any, colNumber: number) => {
      const header = headers[colNumber]?.toLowerCase() || ''
      const isDateField = header.includes('fecha')
      const rawValue = cell.value
      const value = isDateField ? (rawValue !== null && rawValue !== undefined ? rawValue : '') : (rawValue?.toString() || '')

      if (header.includes('id empleado')) {
        const num = Number(rawValue)
        if (!Number.isNaN(num) && num > 0) data.employeeId = num
      } else if (header.includes('identificador de nómina')) {
        data.employeeNumber = value
      } else if (header.includes('unidad de negocio de trabajo')) {
        data.businessUnit = value
      } else if (header.includes('unidad de negocio de nómina')) {
        data.payrollBusinessUnit = value
      } else if (header.includes('nombre del empleado')) {
        data.firstName = value
      } else if (header.includes('apellido paterno del empleado')) {
        data.lastName = value
      } else if (header.includes('apellido materno del empleado')) {
        data.secondLastName = value
      } else if (header.includes('fecha de contratación')) {
        const cellText = cell.text ? cell.text.trim() : null
        const stringValue = rawValue ? rawValue.toString().trim() : null
        if (cellText && cellText.match(/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/)) {
          data.hireDate = cellText
        } else if (stringValue && stringValue.match(/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/)) {
          data.hireDate = stringValue
        } else if (rawValue instanceof Date) {
          data.hireDate = rawValue
        } else if (typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue) {
          data.hireDate = rawValue.value
        } else {
          data.hireDate = rawValue || cellText
        }
      } else if (header.includes('departamento')) {
        data.department = value
      } else if (header.includes('posición')) {
        data.position = value
      } else if (header.includes('salario diario')) {
        data.dailySalary = typeof rawValue === 'number' ? rawValue : (Number.parseFloat(value) || 0)
      } else if (header.includes('fecha de nacimiento')) {
        const cellText = cell.text ? cell.text.trim() : null
        if (rawValue instanceof Date) {
          data.birthDate = rawValue
        } else if (typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue) {
          data.birthDate = rawValue.value
        } else if (cellText && cellText.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
          data.birthDate = cellText
        } else if (typeof rawValue === 'number' && rawValue >= 1 && rawValue <= 1000000) {
          data.birthDate = rawValue
        } else {
          data.birthDate = rawValue || cellText
        }
      } else if (header.includes('curp')) {
        data.curp = value
      } else if (header.includes('rfc')) {
        data.rfc = value
      } else if (header.includes('nss')) {
        data.nss = value
      } else if (header.includes('correo empresa')) {
        data.businessEmail = (cell.text ? cell.text.trim() : '') || ''
      } else if (header.includes('correo personal')) {
        data.personalEmail = (cell.text ? cell.text.trim() : '') || ''
      } else if (header.includes('teléfono empresa')) {
        data.businessPhone = (cell.text ? cell.text.trim() : '') || ''
      } else if (header.includes('teléfono personal')) {
        data.personalPhone = (cell.text ? cell.text.trim() : '') || ''
      } else if (header.includes('modalidad de trabajo')) {
        const v = (value || '').toString().trim()
        data.employeeWorkSchedule = v.toLowerCase() === 'presencial' ? 'Onsite' : (v.toLowerCase() === 'home office' || v.toLowerCase() === 'remoto' ? 'Remote' : (v === 'Onsite' || v === 'Remote' ? v : ''))
      } else if (header.includes('discriminar asistencia')) {
        data.employeeAssistDiscriminator = parseYesNo(value)
      } else if (header.includes('ignorar ausencias consecutivas')) {
        data.employeeIgnoreConsecutiveAbsences = parseYesNo(value)
      } else if (header.includes('autorizar cualquier zona')) {
        data.employeeAuthorizeAnyZones = parseYesNo(value)
      } else if (header.includes('género')) {
        data.personGender = value
      } else if (header.includes('país de nacimiento')) {
        data.personPlaceOfBirthCountry = value
      } else if (header.includes('estado de nacimiento')) {
        data.personPlaceOfBirthState = value
      } else if (header.includes('ciudad de nacimiento')) {
        data.personPlaceOfBirthCity = value
      } else if (header.includes('estado civil')) {
        data.personMaritalStatus = this.translateMaritalStatusFromExcel(value)
      } else if (header.includes('país de residencia')) {
        data.addressCountry = value
      } else if (header.includes('estado de residencia')) {
        data.addressState = value
      } else if (header.includes('municipio de residencia')) {
        data.addressTownship = value
      } else if (header.includes('ciudad de residencia')) {
        data.addressCity = value
      } else if (header.includes('colonia') && !header.includes('código')) {
        data.addressSettlement = value
      } else if (header.includes('tipo de asentamiento')) {
        data.addressSettlementType = value
      } else if (header.includes('entre calle 1')) {
        data.addressBetweenStreet1 = value
      } else if (header.includes('entre calle 2')) {
        data.addressBetweenStreet2 = value
      } else if (header.includes('calle') && !header.includes('entre calle')) {
        data.addressStreet = value
      } else if (header.includes('número interior')) {
        data.addressInternalNumber = value
      } else if (header.includes('número exterior')) {
        data.addressExternalNumber = value
      } else if (header.includes('código postal')) {
        data.addressZipcode = value
      }
    })

    return data
  }

  /**
   * Crear o actualizar dirección de residencia del empleado a partir de datos de importación
   */
  private async ensureEmployeeResidenceAddress(employeeId: number, employeeData: any): Promise<void> {
    const hasAddress =
      (employeeData.addressCountry ?? '') !== '' ||
      (employeeData.addressState ?? '') !== '' ||
      (employeeData.addressCity ?? '') !== '' ||
      (employeeData.addressStreet ?? '') !== '' ||
      (employeeData.addressZipcode ?? '') !== ''
    if (!hasAddress) return

    let addressTypeId = 1
    const addressType = await AddressType.query()
      .whereNull('deletedAt')
      .whereRaw('LOWER(address_type_slug) LIKE ?', ['%residencia%'])
      .first()
    if (addressType) addressTypeId = addressType.addressTypeId
    else {
      const first = await AddressType.query().whereNull('deletedAt').first()
      if (first) addressTypeId = first.addressTypeId
    }

    const existingLink = await EmployeeAddress.query()
      .where('employeeId', employeeId)
      .whereNull('deletedAt')
      .preload('address')
      .first()

    const addressPayload = {
      addressZipcode: employeeData.addressZipcode || '',
      addressCountry: employeeData.addressCountry || '',
      addressState: employeeData.addressState || '',
      addressTownship: employeeData.addressTownship || '',
      addressCity: employeeData.addressCity || '',
      addressSettlement: employeeData.addressSettlement || '',
      addressSettlementType: employeeData.addressSettlementType || '',
      addressStreet: employeeData.addressStreet || '',
      addressInternalNumber: employeeData.addressInternalNumber || '',
      addressExternalNumber: employeeData.addressExternalNumber || '',
      addressBetweenStreet1: employeeData.addressBetweenStreet1 || '',
      addressBetweenStreet2: employeeData.addressBetweenStreet2 || '',
      addressTypeId
    }

    if (existingLink?.address) {
      const addr = existingLink.address
      addr.addressZipcode = addressPayload.addressZipcode
      addr.addressCountry = addressPayload.addressCountry
      addr.addressState = addressPayload.addressState
      addr.addressTownship = addressPayload.addressTownship
      addr.addressCity = addressPayload.addressCity
      addr.addressSettlement = addressPayload.addressSettlement
      addr.addressSettlementType = addressPayload.addressSettlementType
      addr.addressStreet = addressPayload.addressStreet
      addr.addressInternalNumber = addressPayload.addressInternalNumber
      addr.addressExternalNumber = addressPayload.addressExternalNumber
      addr.addressBetweenStreet1 = addressPayload.addressBetweenStreet1
      addr.addressBetweenStreet2 = addressPayload.addressBetweenStreet2
      addr.addressTypeId = addressPayload.addressTypeId
      await addr.save()
    } else {
      const newAddress = new Address()
      Object.assign(newAddress, addressPayload)
      await newAddress.save()
      const newLink = new EmployeeAddress()
      newLink.employeeId = employeeId
      newLink.addressId = newAddress.addressId
      await newLink.save()
    }
  }

  /**
   * Actualizar empleado existente
   */
  private async updateExistingEmployee(
    existingEmployee: any,
    employeeData: any,
    departments: any[],
    positions: any[],
    defaultDepartment: any,
    defaultPosition: any,
    businessUnitId: number | null,
    payrollBusinessUnitId: number | null,
    employeeTypes: any[] = []
  ) {
    existingEmployee.employeeFirstName = employeeData.firstName || existingEmployee.employeeFirstName
    existingEmployee.employeeLastName = employeeData.lastName || existingEmployee.employeeLastName
    existingEmployee.employeeSecondLastName = employeeData.secondLastName || existingEmployee.employeeSecondLastName

    if (employeeData.hireDate) {
      const parsedHireDate = this.parseDateToDateTime(employeeData.hireDate)
      if (parsedHireDate) {
        existingEmployee.employeeHireDate = parsedHireDate
      }
    }

    existingEmployee.dailySalary = employeeData.dailySalary ?? existingEmployee.dailySalary

    if (businessUnitId !== null) existingEmployee.businessUnitId = businessUnitId
    if (payrollBusinessUnitId !== null) existingEmployee.payrollBusinessUnitId = payrollBusinessUnitId
    if (employeeData.employeeNumber) existingEmployee.employeePayrollCode = employeeData.employeeNumber
    if (employeeData.businessEmail !== undefined) existingEmployee.employeeBusinessEmail = employeeData.businessEmail || ''
    if (employeeData.businessPhone !== undefined) existingEmployee.employeeBusinessPhone = employeeData.businessPhone || ''

    if (employeeData.employeeAssistDiscriminator !== undefined) existingEmployee.employeeAssistDiscriminator = employeeData.employeeAssistDiscriminator
    if (employeeData.employeeIgnoreConsecutiveAbsences !== undefined) existingEmployee.employeeIgnoreConsecutiveAbsences = employeeData.employeeIgnoreConsecutiveAbsences
    if (employeeData.employeeAuthorizeAnyZones !== undefined) existingEmployee.employeeAuthorizeAnyZones = employeeData.employeeAuthorizeAnyZones
    if (employeeData.employeeWorkSchedule === 'Onsite' || employeeData.employeeWorkSchedule === 'Remote') existingEmployee.employeeWorkSchedule = employeeData.employeeWorkSchedule
    const mappedTypeId = this.mapEmployeeType(employeeData.employeeTypeName, employeeTypes)
    if (mappedTypeId !== null) existingEmployee.employeeTypeId = mappedTypeId

    const departmentId = this.mapDepartmentBySimilarity(employeeData.department, departments, defaultDepartment)
    if (departmentId !== null) existingEmployee.departmentId = departmentId
    const positionId = this.mapPositionBySimilarity(employeeData.position, positions, defaultPosition)
    if (positionId !== null) existingEmployee.positionId = positionId

    await existingEmployee.save()

    if (existingEmployee.person) {
      const person = existingEmployee.person
      person.personFirstname = employeeData.firstName || person.personFirstname
      person.personLastname = employeeData.lastName || person.personLastname
      person.personSecondLastname = employeeData.secondLastName || person.personSecondLastname
      person.personCurp = employeeData.curp ?? person.personCurp
      person.personRfc = employeeData.rfc ?? person.personRfc
      person.personImssNss = employeeData.nss ?? person.personImssNss
      if (employeeData.personGender !== undefined) person.personGender = employeeData.personGender || ''
      if (employeeData.personPlaceOfBirthCountry !== undefined) person.personPlaceOfBirthCountry = employeeData.personPlaceOfBirthCountry || ''
      if (employeeData.personPlaceOfBirthState !== undefined) person.personPlaceOfBirthState = employeeData.personPlaceOfBirthState || ''
      if (employeeData.personPlaceOfBirthCity !== undefined) person.personPlaceOfBirthCity = employeeData.personPlaceOfBirthCity || ''
      if (employeeData.personMaritalStatus !== undefined) person.personMaritalStatus = employeeData.personMaritalStatus || ''
      const parsedBirthday = this.parseDate(employeeData.birthDate)
      if (parsedBirthday) person.personBirthday = parsedBirthday
      if (employeeData.personalEmail !== undefined) person.personEmail = employeeData.personalEmail || ''
      if (employeeData.personalPhone !== undefined) person.personPhone = employeeData.personalPhone || ''
      await person.save()
    }

    await this.ensureEmployeeResidenceAddress(existingEmployee.employeeId, employeeData)
  }

  /**
   * Generar código de empleado único
   */
  private generateUniqueEmployeeCode(existingCodes: string[]): string {
    let attempts = 0
    let code: string

    do {
      const randomNumber = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
      code = `27800${randomNumber}`
      attempts++
    } while (existingCodes.includes(code) && attempts < 100)

    if (attempts >= 100) {
      throw new Error('No se pudo generar un código de empleado único')
    }

    return code
  }

  /**
   * Mapear tipo de empleado por nombre (para employeeTypeId cuando se use)
   */
  private mapEmployeeType(employeeTypeName: string, employeeTypes: any[]): number | null {
    if (!employeeTypeName || !employeeTypes.length) return null
    const name = employeeTypeName.toString().trim().toLowerCase()
    const found = employeeTypes.find(et => (et.employeeTypeName || '').trim().toLowerCase() === name)
    return found ? found.employeeTypeId : null
  }

  /**
   * Traducir estado civil desde Excel (inglés u otro) a español para guardar en BD
   */
  private translateMaritalStatusFromExcel(value: string): string {
    if (!value || typeof value !== 'string') return ''
    const v = value.trim().toLowerCase()
    const map: Record<string, string> = {
      single: 'Soltero',
      soltero: 'Soltero',
      married: 'Casado',
      casado: 'Casado',
      divorced: 'Divorciado',
      divorciado: 'Divorciado',
      widowed: 'Viudo',
      viudo: 'Viudo',
      widow: 'Viuda',
      viuda: 'Viuda',
      'unión libre': 'Unión libre',
      'union libre': 'Unión libre',
      'domestic partnership': 'Unión libre',
      other: 'Otro',
      otro: 'Otro',
      separated: 'Separado',
      separado: 'Separado'
    }
    return map[v] ?? value.trim()
  }

  /**
   * Traducir estado civil desde BD a español para mostrar en Excel
   */
  private translateMaritalStatusToSpanish(value: string): string {
    if (!value || typeof value !== 'string') return ''
    const v = value.trim().toLowerCase()
    const map: Record<string, string> = {
      single: 'Soltero',
      married: 'Casado',
      divorced: 'Divorciado',
      widowed: 'Viudo',
      widow: 'Viuda',
      'domestic partnership': 'Unión libre',
      other: 'Otro',
      separated: 'Separado'
    }
    return map[v] ?? value.trim()
  }

  /**
   * Mapear unidad de negocio por nombre
   */
  private mapBusinessUnit(businessUnitName: string, businessUnits: any[]): number | null {
    if (!businessUnitName || businessUnitName.trim() === '') {
      return null
    }

    const normalizedSearch = businessUnitName.trim().toLowerCase()

    // Buscar coincidencia exacta primero (case-insensitive)
    const exactMatch = businessUnits.find(unit =>
      unit.businessUnitName?.trim().toLowerCase() === normalizedSearch
    )

    if (exactMatch) return exactMatch.businessUnitId

    // Buscar por similitud con umbral más alto (0.8 en lugar de 0.6)
    const similarMatch = this.findMostSimilar(
      businessUnitName,
      businessUnits,
      'businessUnitName',
      0.8
    )

    // No usar valor por defecto - retornar null si no se encuentra
    // Esto permitirá que el error se maneje apropiadamente
    return similarMatch ? similarMatch.businessUnitId : null
  }

  /**
   * Mapear departamento usando búsqueda por similitud
   */
  private mapDepartmentBySimilarity(departmentName: string, departments: any[], defaultDepartment: any): number | null {
    if (!departmentName) return defaultDepartment ? defaultDepartment.departmentId : null

    // Buscar coincidencia exacta primero
    const exactMatch = departments.find(dept =>
      dept.departmentName?.toLowerCase() === departmentName.toLowerCase()
    )

    if (exactMatch) return exactMatch.departmentId

    // Buscar por similitud
    const similarMatch = this.findMostSimilar(
      departmentName,
      departments,
      'departmentName',
      0.6
    )

    return similarMatch ? similarMatch.departmentId : (defaultDepartment ? defaultDepartment.departmentId : null)
  }

  /**
   * Mapear posición usando búsqueda por similitud
   */
  private mapPositionBySimilarity(positionName: string, positions: any[], defaultPosition: any): number | null {
    if (!positionName) return defaultPosition ? defaultPosition.positionId : null

    // Buscar coincidencia exacta primero
    const exactMatch = positions.find(pos =>
      pos.positionName?.toLowerCase() === positionName.toLowerCase()
    )

    if (exactMatch) return exactMatch.positionId

    // Buscar por similitud
    const similarMatch = this.findMostSimilar(
      positionName,
      positions,
      'positionName',
      0.6
    )

    return similarMatch ? similarMatch.positionId : (defaultPosition ? defaultPosition.positionId : null)
  }

  /**
   * Crear persona
   */
  private async createPerson(employeeData: any) {
    const person = new Person()
    person.personFirstname = employeeData.firstName || ''
    person.personLastname = employeeData.lastName || ''
    person.personSecondLastname = employeeData.secondLastName || ''
    person.personCurp = employeeData.curp || ''
    person.personRfc = employeeData.rfc || ''
    person.personImssNss = employeeData.nss || ''
    person.personBirthday = this.parseDate(employeeData.birthDate)
    person.personGender = employeeData.personGender || ''
    person.personPhone = employeeData.personalPhone || ''
    person.personEmail = employeeData.personalEmail || ''
    person.personPhoneSecondary = ''
    person.personMaritalStatus = employeeData.personMaritalStatus || ''
    person.personPlaceOfBirthCountry = employeeData.personPlaceOfBirthCountry || ''
    person.personPlaceOfBirthState = employeeData.personPlaceOfBirthState || ''
    person.personPlaceOfBirthCity = employeeData.personPlaceOfBirthCity || ''

    await person.save()
    return person
  }

  /**
   * Crear empleado
   */
  private async createEmployee(employeeData: any, personId: number, businessUnitId: number, payrollBusinessUnitId: number, departmentId: number | null, positionId: number | null, employeeCode: string, employeeTypes: any[] = []) {
    const employee = new Employee()
    employee.employeeCode = employeeCode
    employee.employeePayrollCode = employeeData.employeeNumber || employeeCode
    employee.employeeFirstName = employeeData.firstName || ''
    employee.employeeLastName = employeeData.lastName || ''
    employee.employeeSecondLastName = employeeData.secondLastName || ''

    if (employeeData.hireDate) {
      const parsedHireDate = this.parseDateToDateTime(employeeData.hireDate)
      if (parsedHireDate) {
        employee.employeeHireDate = parsedHireDate
      }
    }

    employee.companyId = 1
    employee.departmentId = departmentId
    employee.positionId = positionId
    employee.personId = personId
    employee.businessUnitId = businessUnitId
    employee.dailySalary = employeeData.dailySalary || 0
    employee.payrollBusinessUnitId = payrollBusinessUnitId
    employee.employeeAssistDiscriminator = employeeData.employeeAssistDiscriminator !== undefined ? employeeData.employeeAssistDiscriminator : 0
    employee.employeeTypeId = this.mapEmployeeType(employeeData.employeeTypeName, employeeTypes) ?? 1
    employee.employeeWorkSchedule = (employeeData.employeeWorkSchedule === 'Remote' || employeeData.employeeWorkSchedule === 'Onsite') ? employeeData.employeeWorkSchedule : 'Onsite'
    employee.employeeBusinessEmail = employeeData.businessEmail || ''
    employee.employeeBusinessPhone = employeeData.businessPhone || ''
    employee.employeeTypeOfContract = 'Internal'
    employee.employeeTerminatedDate = null
    employee.employeeIgnoreConsecutiveAbsences = employeeData.employeeIgnoreConsecutiveAbsences !== undefined ? employeeData.employeeIgnoreConsecutiveAbsences : 0
    employee.employeeAuthorizeAnyZones = employeeData.employeeAuthorizeAnyZones !== undefined ? employeeData.employeeAuthorizeAnyZones : 0
    employee.employeeSyncId = 0
    employee.departmentSyncId = 0
    employee.positionSyncId = 0
    employee.employeeLastSynchronizationAt = new Date()

    await employee.save()

    // Generar slug único después de guardar (necesita employeeId)
    await this.updateEmployeeSlug(employee)

    return employee
  }

  /**
   * Parsear fecha desde string, número o Date
   */
  private parseDate(dateString: string | number | Date): string | null {
    if (!dateString) return null

    let parsedDateTime: DateTime | null = null

    // Si es un objeto Date de JavaScript (ExcelJS puede devolverlo así)
    if (dateString instanceof Date) {
      parsedDateTime = DateTime.fromJSDate(dateString)
    }
    // Si es un número (fecha serial de Excel), convertirla
    else if (typeof dateString === 'number') {
      // Excel cuenta los días desde el 1 de enero de 1900 (día 1)
      // La fecha base de Excel es 1899-12-30
      // Excel tiene un bug: considera 1900 como año bisiesto
      const excelEpoch = DateTime.fromObject({ year: 1899, month: 12, day: 30 })

      // Calcular la fecha sumando los días
      parsedDateTime = excelEpoch.plus({ days: Math.floor(dateString) })

      // Ajuste para el bug de Excel: si la fecha es >= 60 (1 de marzo de 1900), restar 1 día
      // Esto es porque Excel cuenta incorrectamente el 29 de febrero de 1900
      if (dateString >= 60) {
        parsedDateTime = parsedDateTime.minus({ days: 1 })
      }
    } else {
      const dateStr = dateString.toString().trim()
      if (dateStr === '' || dateStr === 'null' || dateStr === 'undefined') return null

      try {
        // Priorizar formato dd/mm/yyyy ya que es el formato esperado del Excel
        // Intentar primero con formatos específicos de DD/MM/YYYY
        const formats = [
          'DD/MM/YYYY',  // 16/08/2021, 08/01/2024
          'D/M/YYYY',    // 8/1/2024, 16/8/2021
          'DD/MM/YY',    // 16/08/21
          'D/M/YY',      // 8/1/24
          'YYYY-MM-DD',  // 2021-08-16
          'MM/DD/YYYY'   // Fallback para formato americano
        ]

        for (const format of formats) {
          try {
            parsedDateTime = DateTime.fromFormat(dateStr, format)
            if (parsedDateTime.isValid) {
              // Validar que la fecha parseada sea razonable (entre 1900 y 2100)
              const year = parsedDateTime.year
              if (year >= 1900 && year <= 2100) {
                break
              } else {
                parsedDateTime = null
              }
            }
          } catch (e) {
            continue
          }
        }

        // Si no funcionó con formatos específicos, intentar parse automático
        if (!parsedDateTime || !parsedDateTime.isValid) {
          parsedDateTime = DateTime.fromISO(dateStr)
          // Validar que la fecha parseada sea razonable
          if (parsedDateTime.isValid) {
            const year = parsedDateTime.year
            if (year < 1900 || year > 2100) {
              parsedDateTime = null
            }
          }
        }
      } catch (error) {
        return null
      }
    }

    // Convertir a string ISO (YYYY-MM-DD) para personBirthday
    if (parsedDateTime && parsedDateTime.isValid) {
      return parsedDateTime.toISODate()
    }

    return null
  }

  /**
   * Parsear fecha desde string, número o Date a DateTime
   * Para hireDate: prioriza formato yyyy/mm/dd o yyyy-mm-dd
   */
  private parseDateToDateTime(dateString: string | number | Date): DateTime | null {
    if (!dateString) return null

    let parsedDateTime: DateTime | null = null

    // Si es un objeto Date de JavaScript (ExcelJS puede devolverlo así)
    if (dateString instanceof Date) {
      parsedDateTime = DateTime.fromJSDate(dateString)
    }
    // Si es un número (fecha serial de Excel), convertirla
    else if (typeof dateString === 'number') {
      // Excel cuenta los días desde el 1 de enero de 1900 (día 1)
      // La fecha base de Excel es 1899-12-30
      // Excel tiene un bug: considera 1900 como año bisiesto
      const excelEpoch = DateTime.fromObject({ year: 1899, month: 12, day: 30 })
      parsedDateTime = excelEpoch.plus({ days: Math.floor(dateString) })

      // Ajuste para el bug de Excel: si la fecha es >= 60 (1 de marzo de 1900), restar 1 día
      if (dateString >= 60) {
        parsedDateTime = parsedDateTime.minus({ days: 1 })
      }
    } else {
      const dateStr = dateString.toString().trim()
      if (dateStr === '' || dateStr === 'null' || dateStr === 'undefined') return null

      try {
        // Priorizar formato yyyy/mm/dd o yyyy-mm-dd para insertar directamente
        // Normalizar separadores: convertir / a - para ISO
        const normalizedDate = dateStr.replace(/\//g, '-')

        // Intentar primero con formato YYYY-MM-DD (ISO)
        if (normalizedDate.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
          parsedDateTime = DateTime.fromFormat(normalizedDate, 'yyyy-MM-dd')
          if (parsedDateTime.isValid) {
            const year = parsedDateTime.year
            if (year >= 1900 && year <= 2100) {
              // Retornar directamente si es válido
              return parsedDateTime.startOf('day')
            }
          }
        }

        // Si no funcionó, intentar otros formatos como fallback
        const formats = [
          'yyyy/MM/dd',   // 2021/08/16, 2024/01/08
          'yyyy-M-d',     // 2021-8-16, 2024-1-8
          'DD/MM/YYYY',   // 16/08/2021 (fallback)
          'D/M/YYYY',     // 8/1/2024 (fallback)
          'YYYY-MM-DD',   // 2021-08-16 (alternativo)
        ]

        for (const format of formats) {
          try {
            parsedDateTime = DateTime.fromFormat(dateStr, format)
            if (parsedDateTime.isValid) {
              const year = parsedDateTime.year
              if (year >= 1900 && year <= 2100) {
                break
              } else {
                parsedDateTime = null
              }
            }
          } catch (e) {
            continue
          }
        }

        // Si no funcionó con formatos específicos, intentar parse automático ISO
        if (!parsedDateTime || !parsedDateTime.isValid) {
          parsedDateTime = DateTime.fromISO(normalizedDate)
          if (parsedDateTime.isValid) {
            const year = parsedDateTime.year
            if (year < 1900 || year > 2100) {
              parsedDateTime = null
            }
          }
        }
      } catch (error) {
        return null
      }
    }

    // Retornar DateTime para employeeHireDate
    if (parsedDateTime && parsedDateTime.isValid) {
      // Asegurarse de que la hora sea medianoche (00:00:00) para consistencia con la BD
      return parsedDateTime.startOf('day')
    }

    return null
  }

  /**
   * Calcular similitud entre dos strings usando algoritmo de Levenshtein
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim()
    const s2 = str2.toLowerCase().trim()

    if (s1 === s2) return 1.0

    const matrix = []
    const len1 = s1.length
    const len2 = s2.length

    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    const maxLen = Math.max(len1, len2)
    return maxLen === 0 ? 1.0 : (maxLen - matrix[len2][len1]) / maxLen
  }

  /**
   * Buscar el elemento más similar en una lista
   */
  private findMostSimilar<T>(
    searchTerm: string,
    items: T[],
    nameField: keyof T,
    threshold: number = 0.6
  ): T | null {
    if (!searchTerm || !items.length) return null

    let bestMatch: T | null = null
    let bestScore = 0

    for (const item of items) {
      const itemName = String(item[nameField] || '').trim()
      if (!itemName) continue

      const score = this.calculateSimilarity(searchTerm, itemName)

      if (score > bestScore && score >= threshold) {
        bestScore = score
        bestMatch = item
      }
    }

    return bestMatch
  }

  /**
   * Validar datos del empleado usando las mismas reglas que los validadores
   */
  private validateEmployeeData(employeeData: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validar código de empleado
    if (!employeeData.employeeNumber || employeeData.employeeNumber.trim().length === 0) {
      errors.push('El código de empleado es requerido')
    } else if (employeeData.employeeNumber.length > 200) {
      errors.push('El código de empleado no puede exceder 200 caracteres')
    }

    // Validar nombres
    if (employeeData.firstName && employeeData.firstName.length > 25) {
      errors.push('El nombre no puede exceder 25 caracteres')
    }

    if (employeeData.lastName && employeeData.lastName.length > 25) {
      errors.push('El apellido paterno no puede exceder 25 caracteres')
    }

    if (employeeData.secondLastName && employeeData.secondLastName.length > 25) {
      errors.push('El apellido materno no puede exceder 25 caracteres')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Validar datos de la persona usando las mismas reglas que los validadores
   */
  private validatePersonData(personData: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validar nombre
    if (!personData.firstName || personData.firstName.trim().length === 0) {
      errors.push('El nombre de la persona es requerido')
    } else if (personData.firstName.length > 150) {
      errors.push('El nombre no puede exceder 150 caracteres')
    }

    // Validar apellidos
    if (personData.lastName && personData.lastName.length > 150) {
      errors.push('El apellido paterno no puede exceder 150 caracteres')
    }

    if (personData.secondLastName && personData.secondLastName.length > 150) {
      errors.push('El apellido materno no puede exceder 150 caracteres')
    }

    // Validar teléfono
    if (personData.phone && personData.phone.length > 45) {
      errors.push('El teléfono no puede exceder 45 caracteres')
    }

    // Validar email
    if (personData.email && personData.email.length > 200) {
      errors.push('El email no puede exceder 200 caracteres')
    }

    // Validar CURP
    if (personData.curp && personData.curp.length > 45) {
      errors.push('La CURP no puede exceder 45 caracteres')
    }

    // Validar RFC
    if (personData.rfc && personData.rfc.length > 45) {
      errors.push('El RFC no puede exceder 45 caracteres')
    }

    // Validar NSS
    if (personData.nss && personData.nss.length > 45) {
      errors.push('El NSS no puede exceder 45 caracteres')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Mapear empleado local al formato de la API de biométricos
   * Formato basado en la estructura de la base de datos de biométricos
   */
  private mapEmployeeToBiometricFormat(employee: Employee): any {
    const payrollNum = env.get('SYSTEM_BUSINESS', '')

    // Normalizar gender a un solo carácter (M/F) o null
    let genderValue: string | null = null
    if (employee.person?.personGender) {
      const gender = String(employee.person.personGender).trim().toUpperCase()
      if (gender === 'M' || gender.startsWith('M') || gender.includes('HOMBRE') || gender.includes('MALE')) {
        genderValue = 'M'
      } else if (gender === 'F' || gender.startsWith('F') || gender.includes('MUJER') || gender.includes('FEMALE')) {
        genderValue = 'F'
      }
    }

    // Helper para normalizar strings (convertir vacíos a null)
    const normalizeString = (value: any): string | null => {
      if (value === null || value === undefined) return null
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    }

    // Helper para normalizar fechas (formato YYYY-MM-DD)
    const normalizeDate = (value: any): string | null => {
      if (!value) return null
      // Si es un string, validar formato
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.length === 0) return null
        // Si ya está en formato YYYY-MM-DD, retornarlo
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          return trimmed
        }
        return trimmed
      }
      // Si es un objeto DateTime (Luxon)
      if (value && typeof value.toISODate === 'function') {
        return value.toISODate()
      }
      // Si es un objeto Date
      if (value instanceof Date) {
        const year = value.getFullYear()
        const month = String(value.getMonth() + 1).padStart(2, '0')
        const day = String(value.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      return null
    }

    // Construir el objeto siguiendo el formato de la base de datos de biométricos
    // Basado en la estructura de la API que acepta correctamente
    const now = new Date().toISOString()

    const biometricEmployee: any = {
      // Campos básicos requeridos
      empCode: employee.employeeCode ? Number(employee.employeeCode) : 0,
      firstName: normalizeString(employee.employeeFirstName),
      lastName: normalizeString(employee.employeeLastName),
      companyId: 1,
      departmentId: 1,
      positionId: 1,
      payrollNum: normalizeString(payrollNum),

      // Campos de timestamps
      createTime: now,
      createUser: null,
      changeTime: now,
      changeUser: null,
      updateTime: now,

      // Campos requeridos con valores por defecto
      status: 0,
      isAdmin: false,
      empType: 0,
      enableAtt: true,
      enablePayroll: true,
      enableOvertime: false,
      enableHoliday: true,
      deleted: false,
      reserved: 0,
      delTag: 0,
      appStatus: 0,
      appRole: 0,
      isActive: true,
      vacationRule: 0,

      // Campos opcionales - enviar null si no tenemos datos
      nickname: normalizeString(employee.employeeSecondLastName),
      gender: genderValue,
      birthday: normalizeDate(employee.person?.personBirthday),
      hireDate: normalizeDate(employee.employeeHireDate),
      email: normalizeString(employee.person?.personEmail),
      mobile: normalizeString(employee.person?.personPhone),
      nationalNum: normalizeString(employee.person?.personCurp) || normalizeString(employee.person?.personImssNss),
      ssn: normalizeString(employee.person?.personRfc),
      internalEmpNum: null,
      city: null,
      lastLogin: null,

      // Campos que deben ser null según especificación
      accTimezone: null,
      enrollSn: null
    }

    // Asegurar que todos los valores undefined se conviertan en null
    Object.keys(biometricEmployee).forEach(key => {
      if (biometricEmployee[key] === undefined) {
        biometricEmployee[key] = null
      }
    })

    return biometricEmployee
  }

  /**
   * Enviar empleados a la API de biométricos en bulk
   */
  async sendEmployeesToBiometrics(employees: Employee[]): Promise<{ success: boolean; message: string; errors?: any[] }> {
    try {
      const apiHost = env.get('API_BIOMETRICS_HOST')

      if (!apiHost) {
        return {
          success: false,
          message: 'API_BIOMETRICS_HOST no está configurada en las variables de entorno'
        }
      }

      // Cargar relaciones necesarias
      await Promise.all(employees.map(emp => emp.load('person')))

      // Mapear empleados al formato de la API
      const biometricEmployees = employees.map(emp => this.mapEmployeeToBiometricFormat(emp))

      // Enviar a la API
      const apiUrl = `${apiHost}/employees/bulk`
      const response = await axios.post(apiUrl, {
        employees: biometricEmployees
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      return {
        success: true,
        message: `${employees.length} empleado(s) enviado(s) exitosamente a biométricos`,
        errors: response.data?.errors || []
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Error al enviar empleados a biométricos: ${error.message}`,
        errors: error.response?.data || []
      }
    }
  }

  /**
   * Enviar un empleado individual a la API de biométricos
   */
  async sendEmployeeToBiometrics(employeeId: number): Promise<{ success: boolean; message: string; error?: any }> {
    try {
      const employee = await Employee.query()
        .where('employeeId', employeeId)
        .whereNull('deletedAt')
        .preload('person')
        .first()

      if (!employee) {
        return {
          success: false,
          message: 'Empleado no encontrado'
        }
      }

      const apiHost = env.get('API_BIOMETRICS_HOST')

      if (!apiHost) {
        return {
          success: false,
          message: 'API_BIOMETRICS_HOST no está configurada en las variables de entorno'
        }
      }

      // Mapear empleado al formato de la API
      const biometricEmployee = this.mapEmployeeToBiometricFormat(employee)

      // Enviar a la API
      const apiUrl = `${apiHost}/employees`
      await axios.post(apiUrl, biometricEmployee, {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      return {
        success: true,
        message: 'Empleado enviado exitosamente a biométricos'
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Error al enviar empleado a biométricos: ${error.message}`,
        error: error.response?.data || error.message
      }
    }
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

  /**
   * Calcular la luminosidad de un color hexadecimal
   * @param hexColor - Color en formato hex (con o sin #, con o sin alpha)
   * @returns number - Luminosidad entre 0 (oscuro) y 255 (claro)
   */
  private calculateColorLuminosity(hexColor: string): number {
    try {
      // Remover # y alpha si existen
      let color = hexColor.replace('#', '').toUpperCase()
      // Si tiene 8 caracteres (ARGB), quitar los primeros 2 (alpha)
      if (color.length === 8) {
        color = color.substring(2)
      }
      // Si tiene 6 caracteres, usarlo directamente
      if (color.length !== 6) {
        return 128 // Valor por defecto si el formato no es válido
      }

      // Convertir hex a RGB
      const r = Number.parseInt(color.substring(0, 2), 16)
      const g = Number.parseInt(color.substring(2, 4), 16)
      const b = Number.parseInt(color.substring(4, 6), 16)

      // Calcular luminosidad usando la fórmula estándar
      // 0.299*R + 0.587*G + 0.114*B
      const luminosity = 0.299 * r + 0.587 * g + 0.114 * b

      return luminosity
    } catch (error) {
      return 128 // Valor por defecto en caso de error
    }
  }

  /**
   * Determinar el color del texto basado en la luminosidad del fondo
   * @param backgroundColor - Color de fondo en formato ARGB
   * @returns string - Color del texto en formato ARGB ('FFFFFFFF' para blanco, 'FF001A04' para oscuro)
   */
  private getTextColorForBackground(backgroundColor: string): string {
    // Extraer el color hex sin el alpha para calcular luminosidad
    const hexColor = backgroundColor.length === 8 ? backgroundColor.substring(2) : backgroundColor
    const luminosity = this.calculateColorLuminosity(hexColor)

    // Si la luminosidad es menor a 128, el color es oscuro, usar texto blanco
    // Si es mayor o igual a 128, el color es claro, usar texto oscuro
    return luminosity < 128 ? 'FFFFFFFF' : 'FF001A04'
  }

  /**
   * Convertir color hexadecimal a formato ARGB para ExcelJS
   * @param hexColor - Color en formato hex (con o sin #)
   * @returns string - Color en formato ARGB (ej: 'FFE67E22')
   */
  private hexToArgb(hexColor: string | null | undefined): string {
    if (!hexColor) return 'FFFFFFFF'
    // Remover el # si existe
    let color = hexColor.replace('#', '').toUpperCase()
    // Si el color tiene 6 caracteres, agregar FF al inicio para formato ARGB
    if (color.length === 6) {
      return 'FF' + color
    }
    // Si ya tiene 8 caracteres, asumir que ya está en formato ARGB
    if (color.length === 8) {
      return color
    }
    // Color por defecto si el formato no es válido
    return 'FFFFFFFF'
  }

  /**
   * Obtener el color de la unidad de negocio activa desde SystemSetting
   * @returns Promise<string> - Color en formato ARGB para ExcelJS (ej: 'FFD6FFDC')
   */
  private async getActiveBusinessUnitColor(): Promise<string> {
    try {
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      if (!businessConf) {
        return 'FFD6FFDC' // Color por defecto si no hay configuración (ARGB)
      }

      const businessList = businessConf.split(',').map((unit: string) => unit.trim())

      const systemSettings = await SystemSetting.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_active', 1)

      for (const systemSetting of systemSettings) {
        if (systemSetting.systemSettingBusinessUnits) {
          const units = systemSetting.systemSettingBusinessUnits
            .split(',')
            .map((unit: string) => unit.trim())

          const hasMatch = businessList.some((businessUnit: string) =>
            units.includes(businessUnit)
          )

          if (hasMatch && systemSetting.systemSettingSidebarColor) {
            // Remover el # si existe y convertir a ARGB (agregar FF al inicio para alpha)
            let color = systemSetting.systemSettingSidebarColor.replace('#', '').toUpperCase()
            // Si el color tiene 6 caracteres, agregar FF al inicio para formato ARGB
            if (color.length === 6) {
              color = 'FF' + color
            }
            // Si ya tiene 8 caracteres, asumir que ya está en formato ARGB
            return color
          }
        }
      }

      return 'FFD6FFDC' // Color por defecto si no se encuentra (ARGB)
    } catch (error) {
      console.error('Error obteniendo color de unidad de negocio:', error)
      return 'FFD6FFDC' // Color por defecto en caso de error (ARGB)
    }
  }

  /**
   * Obtener el logo del systemSetting
   */
  private async getLogo(): Promise<string> {
    let imageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive?.systemSettingLogo) {
      imageLogo = systemSettingActive.systemSettingLogo
    }
    return imageLogo
  }

  /**
   * Agregar logo al worksheet
   */
  private async addImageLogo(workbook: any, worksheet: any, imageLogo: string) {
    try {
      const imageResponse = await axios.get(imageLogo, { responseType: 'arraybuffer' })
      const imageBuffer = imageResponse.data

      const metadata = await sharp(imageBuffer).metadata()
      const imageWidth = metadata.width ? metadata.width : 0
      const imageHeight = metadata.height ? metadata.height : 0

      const targetWidth = 139
      const targetHeight = 49
      const scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight)

      const adjustedWidth = imageWidth * scale
      const adjustedHeight = imageHeight * scale

      const imageId = workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      })

      worksheet.addImage(imageId, {
        tl: { col: 0.28, row: 0.7 },
        ext: { width: adjustedWidth, height: adjustedHeight },
      })
    } catch (error) {
      console.error('Error loading logo:', error)
    }
  }

  /**
   * Generar plantilla de Excel para importación masiva de empleados.
   * Incluye columna oculta ID Empleado, dropdowns dinámicos y todas las columnas del perfil.
   * @param options.fillWithExisting - Si true, descarga plantilla llena con empleados existentes
   */
  async generateEmployeeImportTemplate(options?: { fillWithExisting?: boolean }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Empleados')

    const activeBusinessUnitColor = await this.getActiveBusinessUnitColor()

    const logoUrl = await this.getLogo()
    await this.addImageLogo(workbook, worksheet, logoUrl)

    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .orderBy('business_unit_name')
      .select('businessUnitId', 'businessUnitName')

    const businessUnitNames = businessUnits.map(bu => bu.businessUnitName).filter(Boolean)

    const departments = await Department.query()
      .whereNull('department_deleted_at')
      .preload('departmentPositions', (query) => {
        query.preload('position', (posQuery) => {
          posQuery.whereNull('position_deleted_at')
          posQuery.where('position_active', 1)
        })
      })
      .orderBy('department_name')

    const departmentNames = departments.map(dept => dept.departmentName).filter(Boolean)

    const employeeTypes = await EmployeeType.query()
      .whereNull('employee_type_deleted_at')
      .orderBy('employee_type_name')
      .select('employeeTypeId', 'employeeTypeName')

    const workScheduleList = ['Presencial', 'Home office']
    const yesNoList = ['Sí', 'No']
    const genderList = ['Hombre', 'Mujer', 'Otro']

    const listSheet = workbook.addWorksheet('Listas', { state: 'hidden' })

    let listRow = 1
    businessUnitNames.forEach((name) => {
      listSheet.getCell(listRow++, 1).value = name
    })
    const businessUnitRange = `Listas!$A$1:$A$${Math.max(1, businessUnitNames.length)}`
    listRow = 1
    departmentNames.forEach((name) => {
      listSheet.getCell(listRow++, 2).value = name
    })
    const departmentRange = `Listas!$B$1:$B$${Math.max(1, departmentNames.length)}`

    let deptPosRow = 1
    departments.forEach((dept) => {
      const deptName = dept.departmentName
      if (!deptName) return
      const positions = dept.departmentPositions
        .map(dp => dp.position?.positionName)
        .filter(Boolean)
      positions.forEach((posName) => {
        listSheet.getCell(deptPosRow, 3).value = deptName
        listSheet.getCell(deptPosRow, 4).value = posName
        deptPosRow++
      })
    })

    workScheduleList.forEach((name, i) => {
      listSheet.getCell(i + 1, 5).value = name
    })
    const workScheduleRange = `Listas!$E$1:$E$${workScheduleList.length}`

    yesNoList.forEach((v, i) => { listSheet.getCell(i + 1, 6).value = v })
    const yesNoRange = 'Listas!$F$1:$F$2'

    const genderRange = `Listas!$G$1:$G$${Math.max(1, genderList.length)}`
    genderList.forEach((v, i) => { listSheet.getCell(i + 1, 7).value = v })

    const writeList = (values: string[], colIdx: number) => {
      const vals = values.length ? values : ['']
      vals.forEach((v, i) => { listSheet.getCell(i + 1, colIdx).value = v })
      return `Listas!$${String.fromCharCode(64 + colIdx)}$1:$${String.fromCharCode(64 + colIdx)}$${vals.length}`
    }
    const maritalStatusOptions = ['Soltero', 'Casado', 'Divorciado', 'Viudo', 'Unión libre', 'Separado', 'Otro']
    const maritalRange = writeList(maritalStatusOptions, 11)

    const headers = [
      'ID Empleado',
      'Identificador de nómina',
      'Unidad de negocio de trabajo',
      'Unidad de negocio de nómina',
      'Nombre del empleado',
      'Apellido paterno del empleado',
      'Apellido materno del empleado',
      'Fecha de contratación (yyyy/mm/dd)',
      'Departamento',
      'Posición',
      'Salario diario',
      'Fecha de nacimiento (dd/mm/yyyy)',
      'CURP',
      'RFC',
      'NSS',
      'Correo empresa',
      'Correo personal',
      'Teléfono Empresa',
      'Teléfono Personal',
      'Modalidad de trabajo',
      'Discriminar asistencia',
      'Ignorar ausencias consecutivas',
      'Autorizar cualquier zona',
      'Género',
      'País de nacimiento',
      'Estado de nacimiento',
      'Ciudad de nacimiento',
      'Estado civil',
      'País de residencia',
      'Estado de residencia',
      'Municipio de residencia',
      'Ciudad de residencia',
      'Colonia',
      'Tipo de asentamiento',
      'Calle',
      'Número interior',
      'Número exterior',
      'Entre calle 1',
      'Entre calle 2',
      'Código postal'
    ]

    const requiredHeaders = [
      'Identificador de nómina',
      'Unidad de negocio de trabajo',
      'Unidad de negocio de nómina',
      'Nombre del empleado',
      'Apellido paterno del empleado'
    ]

    worksheet.getRow(1).height = 60
    const titleRow = worksheet.addRow([''])
    titleRow.height = 30
    worksheet.mergeCells(2, 1, 2, 40)
    titleRow.getCell(1).value = 'Plantilla de importación de empleados'
    titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF000000' } }
    titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    titleRow.getCell(1).border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }

    const headerRow = worksheet.addRow(headers)
    headerRow.height = 30

    const requiredHeaderColor = activeBusinessUnitColor
    const optionalHeaderColor = 'FFD6D6D6'
    const requiredHeaderTextColor = this.getTextColorForBackground(requiredHeaderColor)
    const optionalHeaderTextColor = 'FF001A04'

    headerRow.eachCell((cell, colNumber) => {
      const headerValue = headers[colNumber - 1]
      const isRequired = requiredHeaders.includes(headerValue)
      const backgroundColor = isRequired ? requiredHeaderColor : optionalHeaderColor
      const textColor = isRequired ? requiredHeaderTextColor : optionalHeaderTextColor
      cell.font = { bold: true, size: 9, color: { argb: textColor } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: backgroundColor } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      }
    })

    worksheet.getColumn(1).hidden = true

    const columnWidths = [
      10, 25, 30, 30, 25, 25, 25, 30, 30, 30, 15, 30, 20, 20, 20, 30, 30, 20, 20,
      22, 20, 28, 24, 12, 18, 18, 18, 14, 18, 18, 18, 18, 18, 18, 25, 15, 15, 18, 18, 15
    ]
    columnWidths.forEach((w, i) => {
      worksheet.getColumn(i + 1).width = w
    })

    for (let row = 4; row <= 1001; row++) {
      worksheet.getCell(row, 3).dataValidation = {
        type: 'list', allowBlank: true, formulae: [businessUnitRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione una unidad de negocio válida'
      }
      worksheet.getCell(row, 4).dataValidation = {
        type: 'list', allowBlank: true, formulae: [businessUnitRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione una unidad de negocio válida'
      }
      worksheet.getCell(row, 9).dataValidation = {
        type: 'list', allowBlank: true, formulae: [departmentRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione un departamento válido'
      }
      const positionFormula = `INDIRECT("Listas!$D$"&MATCH(I${row},Listas!$C:$C,0)&":$D$"&(MATCH(I${row},Listas!$C:$C,0)+COUNTIF(Listas!$C:$C,I${row})-1))`
      worksheet.getCell(row, 10).dataValidation = {
        type: 'list', allowBlank: true, formulae: [positionFormula],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Primero seleccione un departamento válido'
      }
      worksheet.getCell(row, 20).dataValidation = {
        type: 'list', allowBlank: true, formulae: [workScheduleRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione Presencial o Home office'
      }
      worksheet.getCell(row, 21).dataValidation = {
        type: 'list', allowBlank: true, formulae: [yesNoRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione Sí o No'
      }
      worksheet.getCell(row, 22).dataValidation = {
        type: 'list', allowBlank: true, formulae: [yesNoRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione Sí o No'
      }
      worksheet.getCell(row, 23).dataValidation = {
        type: 'list', allowBlank: true, formulae: [yesNoRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione Sí o No'
      }
      worksheet.getCell(row, 24).dataValidation = {
        type: 'list', allowBlank: true, formulae: [genderRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione un género válido'
      }
      // Columnas 25-27 (país, estado, ciudad de nacimiento): sin dropdown, texto libre
      worksheet.getCell(row, 28).dataValidation = {
        type: 'list', allowBlank: true, formulae: [maritalRange],
        errorStyle: 'warning', showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Seleccione estado civil'
      }
      // Columnas 29-40 (residencia): sin dropdown, flexibles para cualquier texto
    }

    worksheet.getColumn(8).numFmt = 'yyyy/mm/dd'
    worksheet.getColumn(12).numFmt = 'dd/mm/yyyy'
    worksheet.getColumn(11).numFmt = '#,##0.00'

    worksheet.views = [
      { state: 'frozen', ySplit: 3, topLeftCell: 'A4', activeCell: 'B4' }
    ]

    if (options?.fillWithExisting) {
      const employees = await Employee.query()
        .whereNull('deletedAt')
        .preload('person')
        .preload('address', (q) => q.preload('address'))
        .preload('businessUnit')
        .preload('department')
        .preload('position')
        .preload('employeeType')
        .orderBy('employee_id')

      const payrollUnitName = (payrollId: number) =>
        businessUnits.find(bu => bu.businessUnitId === payrollId)?.businessUnitName ?? ''

      const DateTimeFmt = (d: DateTime | Date | string | null) => {
        if (!d) return ''
        const dt = typeof d === 'string' ? DateTime.fromISO(d) : (d instanceof Date ? DateTime.fromJSDate(d) : d)
        return dt.isValid ? dt.toFormat('yyyy/MM/dd') : ''
      }
      const DateTimeFmtBirth = (d: DateTime | Date | string | null) => {
        if (!d) return ''
        const dt = typeof d === 'string' ? DateTime.fromISO(d) : (d instanceof Date ? DateTime.fromJSDate(d) : d)
        return dt.isValid ? dt.toFormat('dd/MM/yyyy') : ''
      }

      employees.forEach((emp, idx) => {
        const rowNum = idx + 4
        const person = emp.person
        const resAddress = emp.address?.[0]?.address

        worksheet.getCell(rowNum, 1).value = emp.employeeId
        worksheet.getCell(rowNum, 2).value = emp.employeePayrollCode ?? emp.employeeCode ?? ''
        worksheet.getCell(rowNum, 3).value = emp.businessUnit?.businessUnitName ?? ''
        worksheet.getCell(rowNum, 4).value = payrollUnitName(emp.payrollBusinessUnitId)
        worksheet.getCell(rowNum, 5).value = emp.employeeFirstName ?? ''
        worksheet.getCell(rowNum, 6).value = emp.employeeLastName ?? ''
        worksheet.getCell(rowNum, 7).value = emp.employeeSecondLastName ?? ''
        worksheet.getCell(rowNum, 8).value = emp.employeeHireDate ? DateTimeFmt(emp.employeeHireDate) : ''
        worksheet.getCell(rowNum, 9).value = emp.department?.departmentName ?? ''
        worksheet.getCell(rowNum, 10).value = emp.position?.positionName ?? ''
        worksheet.getCell(rowNum, 11).value = emp.dailySalary ?? 0
        worksheet.getCell(rowNum, 12).value = person?.personBirthday ? DateTimeFmtBirth(person.personBirthday) : ''
        worksheet.getCell(rowNum, 13).value = person?.personCurp ?? ''
        worksheet.getCell(rowNum, 14).value = person?.personRfc ?? ''
        worksheet.getCell(rowNum, 15).value = person?.personImssNss ?? ''
        worksheet.getCell(rowNum, 16).value = emp.employeeBusinessEmail ?? ''
        worksheet.getCell(rowNum, 17).value = person?.personEmail ?? ''
        worksheet.getCell(rowNum, 18).value = emp.employeeBusinessPhone ?? ''
        worksheet.getCell(rowNum, 19).value = person?.personPhone ?? ''
        worksheet.getCell(rowNum, 20).value = emp.employeeWorkSchedule === 'Remote' ? 'Home office' : (emp.employeeWorkSchedule === 'Onsite' ? 'Presencial' : (emp.employeeWorkSchedule || ''))
        worksheet.getCell(rowNum, 21).value = emp.employeeAssistDiscriminator === 1 ? 'Sí' : 'No'
        worksheet.getCell(rowNum, 22).value = emp.employeeIgnoreConsecutiveAbsences === 1 ? 'Sí' : 'No'
        worksheet.getCell(rowNum, 23).value = emp.employeeAuthorizeAnyZones === 1 ? 'Sí' : 'No'
        worksheet.getCell(rowNum, 24).value = person?.personGender ?? ''
        worksheet.getCell(rowNum, 25).value = person?.personPlaceOfBirthCountry ?? ''
        worksheet.getCell(rowNum, 26).value = person?.personPlaceOfBirthState ?? ''
        worksheet.getCell(rowNum, 27).value = person?.personPlaceOfBirthCity ?? ''
        worksheet.getCell(rowNum, 28).value = this.translateMaritalStatusToSpanish(person?.personMaritalStatus ?? '') || ''
        worksheet.getCell(rowNum, 29).value = resAddress?.addressCountry ?? ''
        worksheet.getCell(rowNum, 30).value = resAddress?.addressState ?? ''
        worksheet.getCell(rowNum, 31).value = resAddress?.addressTownship ?? ''
        worksheet.getCell(rowNum, 32).value = resAddress?.addressCity ?? ''
        worksheet.getCell(rowNum, 33).value = resAddress?.addressSettlement ?? ''
        worksheet.getCell(rowNum, 34).value = resAddress?.addressSettlementType ?? ''
        worksheet.getCell(rowNum, 35).value = resAddress?.addressStreet ?? ''
        worksheet.getCell(rowNum, 36).value = resAddress?.addressInternalNumber ?? ''
        worksheet.getCell(rowNum, 37).value = resAddress?.addressExternalNumber ?? ''
        worksheet.getCell(rowNum, 38).value = resAddress?.addressBetweenStreet1 ?? ''
        worksheet.getCell(rowNum, 39).value = resAddress?.addressBetweenStreet2 ?? ''
        worksheet.getCell(rowNum, 40).value = resAddress?.addressZipcode ?? ''
      })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  /**
 * Generar plantilla de Excel para asignación de turnos
 * Genera una plantilla dinámica con fechas, empleados pre-cargados, posiciones y turnos
 * @param startDate - Fecha de inicio (formato: yyyy-MM-dd)
 * @param endDate - Fecha de fin (formato: yyyy-MM-dd)
 * @param employeeIds - IDs opcionales de empleados a filtrar
 * @param isReport - Si es true, genera un reporte con turnos asignados basados en applySince
 * @returns Promise<Buffer> - Buffer del archivo Excel generado
 */
async generateShiftAssignmentTemplate(
  startDate: string,
  endDate: string,
  employeeIds?: number[],
  isReport?: boolean
): Promise<Buffer> {

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Plantilla de asignación de turnos')

  // Obtener el color de la unidad de negocio activa
  const activeBusinessUnitColor = await this.getActiveBusinessUnitColor()

  // Obtener logo y agregarlo
  const logoUrl = await this.getLogo()
  await this.addImageLogo(workbook, worksheet, logoUrl)

  // Convertir fechas a DateTime
  const startDateTime = DateTime.fromISO(startDate)
  const endDateTime = DateTime.fromISO(endDate)

  if (!startDateTime.isValid || !endDateTime.isValid) {
    throw new Error('Fechas inválidas. Use el formato yyyy-MM-dd')
  }

  if (startDateTime > endDateTime) {
    throw new Error('La fecha de inicio debe ser anterior a la fecha de fin')
  }

  // Generar array de fechas
  const dates: DateTime[] = []
  let currentDate = startDateTime
  while (currentDate <= endDateTime) {
    dates.push(currentDate)
    currentDate = currentDate.plus({ days: 1 })
  }

  // OBTENER DÍAS FESTIVOS DE LA BASE DE DATOS
  const holidayDates = new Set<string>()
  try {
    // Obtener unidades de negocio activas
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',').map((unit: string) => unit.trim()).filter((unit) => unit.length > 0)

    // Consultar todos los días festivos que coincidan con las unidades de negocio
    // No filtramos por fecha aquí porque necesitamos procesar festivos recurrentes
    let holidaysQuery = Holiday.query().whereNull('holiday_deleted_at')

    if (businessList.length > 0) {
      holidaysQuery = holidaysQuery.andWhere((query) => {
        query.andWhere((subQuery) => {
          businessList.forEach((business) => {
            subQuery.orWhereRaw('FIND_IN_SET(?, holiday_business_units)', [business])
          })
        })
      })
    }

    const holidays = await holidaysQuery

    const startYear = startDateTime.year
    const endYear = endDateTime.year

    // Procesar cada festivo según su frecuencia
    // SOLO incluir días festivos que son descanso oficial (feriados)
    holidays.forEach((holiday) => {
      // Verificar si es descanso oficial (manejar tanto boolean como number)
      const holidayAny = holiday as any
      const isOfficialRestDay =
        holiday.holidayIsOfficialRestDay === true ||
        holidayAny.holidayIsOfficialRestDay === 1 ||
        holidayAny.holiday_is_official_rest_day === true ||
        holidayAny.holiday_is_official_rest_day === 1

      // Solo procesar si es descanso oficial
      if (!isOfficialRestDay) {
        return
      }

      // Manejar tanto string como Date dependiendo de cómo Lucid devuelva el dato
      let baseHolidayDate: DateTime
      const holidayDateValue = holiday.holidayDate as any
      if (holidayDateValue instanceof Date) {
        baseHolidayDate = DateTime.fromJSDate(holidayDateValue)
      } else if (typeof holidayDateValue === 'string') {
        baseHolidayDate = DateTime.fromISO(holidayDateValue)
      } else {
        console.warn(`Tipo de fecha no soportado para festivo: ${holiday.holidayName}`)
        return
      }

      if (!baseHolidayDate.isValid) {
        console.warn(`Fecha inválida para festivo: ${holiday.holidayName}`)
        return
      }

      // Si holidayFrequency es 0, es un festivo específico (solo esa fecha exacta)
      if (holiday.holidayFrequency === 0) {
        // Solo agregar si la fecha está dentro del rango
        if (baseHolidayDate >= startDateTime && baseHolidayDate <= endDateTime) {
          holidayDates.add(baseHolidayDate.toFormat('yyyy-MM-dd'))
        }
      } else {
        // Si holidayFrequency >= 1, es un festivo recurrente
        // Aplicar para todos los años en el rango basándose en el mes y día
        for (let year = startYear; year <= endYear; year++) {
          const recurringDate = DateTime.fromObject({
            year: year,
            month: baseHolidayDate.month,
            day: baseHolidayDate.day
          })

          if (recurringDate >= startDateTime && recurringDate <= endDateTime) {
            holidayDates.add(recurringDate.toFormat('yyyy-MM-dd'))
          }
        }
      }
    })
  } catch (error) {
    console.warn('Error obteniendo días festivos de la base de datos:', error)
  }

  // Obtener unidades de negocio del ENV
  const businessConf = `${env.get('SYSTEM_BUSINESS')}`
  const businessList = businessConf.split(',').map((unit: string) => unit.trim()).filter((unit) => unit.length > 0)
  const businessUnits = await BusinessUnit.query()
    .where('business_unit_active', 1)
    .whereIn('business_unit_slug', businessList)

  const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

  // Obtener empleados activos con sus posiciones (solo de las unidades de negocio del ENV)
  let employeesQuery = Employee.query()
    .whereNull('deletedAt')
    .whereIn('businessUnitId', businessUnitsList)

  // Filtrar por IDs de empleados si se proporcionan
  if (employeeIds && employeeIds.length > 0) {
    employeesQuery = employeesQuery.whereIn('employeeId', employeeIds)
  }

  const employees = await employeesQuery
    .preload('position', (query) => {
      query.whereNull('position_deleted_at')
      query.where('position_active', 1)
    })
    .preload('department', (query) => {
      query.whereNull('department_deleted_at')
    })
    .orderBy('employeeFirstName')
    .orderBy('employeeLastName')

  // Obtener turnos activos con sus unidades de negocio
  const shifts = await Shift.query()
    .whereNull('shift_deleted_at')
    .select('shiftId', 'shiftName', 'shiftAlias', 'shiftTimeStart', 'shiftActiveHours', 'shiftBusinessUnits', 'shiftColor')
    .orderBy('shiftName')

  // Crear mapa de shiftId -> color para uso en modo reporte
  const shiftColorMap = new Map<number, string>()
  shifts.forEach((shift) => {
    const color = this.hexToArgb(shift.shiftColor)
    shiftColorMap.set(shift.shiftId, color)
  })

  // Obtener tipos de excepciones masivas
  const massiveExceptionTypes = await ExceptionType.query()
    .whereNull('exception_type_deleted_at')
    .where('exceptionTypeCanMasive', true)
    .where('exceptionTypeActive', 1)
    .orderBy('exceptionTypeTypeName')

  // ==============================
  //   HOJA OCULTA PARA DROPDOWNS
  // ==============================
  const listSheet = workbook.addWorksheet('Listas', { state: 'hidden' })

  // Estructura de la hoja oculta:
  // Columna A: Valor a mostrar en dropdown (alias si existe, sino nombre formateado)
  // Columna B: Shift ID
  // Columna C: Business Units (IDs separados por comas)
  // Columna D: Nombre formateado completo (para búsqueda durante importación)

  // Turnos → Columnas A, B, C, D
  let shiftRow = 1
  shifts.forEach((shift) => {
    // Generar nombre formateado con horario
    let formattedName = shift.shiftName
    if (shift.shiftTimeStart && shift.shiftActiveHours && typeof shift.shiftActiveHours === 'number') {
      try {
        const startTime = String(shift.shiftTimeStart).trim()
        const timeParts = startTime.split(':')
        if (timeParts.length >= 2) {
          const hours = Number.parseInt(timeParts[0], 10)
          const minutes = Number.parseInt(timeParts[1], 10)

          if (!Number.isNaN(hours) && !Number.isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            const shiftStartTime = DateTime.fromObject({ hour: hours, minute: minutes })
            const shiftEndTime = shiftStartTime.plus({ hours: shift.shiftActiveHours })
            const endTime = shiftEndTime.toFormat('HH:mm')
            const formattedStartTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
            formattedName = `${formattedStartTime} to ${endTime} - Rest (NA)`
          }
        }
      } catch (error) {
        console.warn(`Error al formatear turno ${shift.shiftName}:`, error)
      }
    }

    // Valor a mostrar en dropdown: alias si existe, sino nombre formateado
    const displayValue = shift.shiftAlias && shift.shiftAlias.trim() !== ''
      ? shift.shiftAlias.trim()
      : formattedName

    listSheet.getCell(shiftRow, 1).value = displayValue // Valor para dropdown
    listSheet.getCell(shiftRow, 2).value = shift.shiftId // Shift ID
    listSheet.getCell(shiftRow, 3).value = shift.shiftBusinessUnits || '' // Business Units
    listSheet.getCell(shiftRow, 4).value = formattedName // Nombre formateado completo
    shiftRow++
  })

  // Agregar opciones adicionales
  listSheet.getCell(shiftRow, 1).value = 'vacaciones'
  listSheet.getCell(shiftRow, 2).value = 'SPECIAL_VACATION'
  listSheet.getCell(shiftRow, 3).value = ''
  listSheet.getCell(shiftRow, 4).value = 'vacaciones'
  shiftRow++

  listSheet.getCell(shiftRow, 1).value = 'Día festivo'
  listSheet.getCell(shiftRow, 2).value = 'SPECIAL_HOLIDAY'
  listSheet.getCell(shiftRow, 3).value = ''
  listSheet.getCell(shiftRow, 4).value = 'Día festivo'
  shiftRow++

  // Agregar tipos de excepciones masivas
  massiveExceptionTypes.forEach((exceptionType) => {
    listSheet.getCell(shiftRow, 1).value = exceptionType.exceptionTypeTypeName
    listSheet.getCell(shiftRow, 2).value = `EXCEPTION_${exceptionType.exceptionTypeId}`
    listSheet.getCell(shiftRow, 3).value = ''
    listSheet.getCell(shiftRow, 4).value = exceptionType.exceptionTypeTypeName
    shiftRow++
  })
  const totalShiftOptions = shiftRow - 1

  // Rangos para validación
  const shiftRange = `Listas!$A$1:$A$${totalShiftOptions}`

  // ==============================
  //       TÍTULO Y ENCABEZADOS
  // ==============================
  // Fila del título (después del logo)
  worksheet.getRow(1).height = 60
  const titleRow = worksheet.addRow([''])
  titleRow.height = 30
  worksheet.mergeCells(`A2:${String.fromCharCode(65 + 3 + dates.length)}2`)
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF000000' } }
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }

  // Primera fila de encabezados (fechas)
  const headerRow1 = ['ID Empleado (BD)', 'Código de Empleado', 'Empleado', 'Posición']
  dates.forEach((date) => {
    const dateStr = date.toFormat('dd/MM/yyyy')
    headerRow1.push(dateStr)
  })
  const row1 = worksheet.addRow(headerRow1)
  row1.height = 30

  // Segunda fila de encabezados (días de la semana)
  const headerRow2 = ['', '', '', '']
  dates.forEach((date) => {
    const dayName = date.toFormat('cccc', { locale: 'es' })
    headerRow2.push(dayName)
  })
  const row2 = worksheet.addRow(headerRow2)
  row2.height = 30

  const headerColor = activeBusinessUnitColor
  const headerTextColor = this.getTextColorForBackground(headerColor)
  const subHeaderColor = 'FF4472C4'
  const subHeaderTextColor = 'FFFFFFFF'

  // Aplicar formato a la primera fila de encabezados
  row1.eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: headerTextColor } }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerColor }
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  })

  // Aplicar formato a la segunda fila de encabezados
  row2.eachCell((cell, colNum) => {
    if (colNum > 4) {
      cell.font = { bold: true, size: 9, color: { argb: subHeaderTextColor } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: subHeaderColor }
      }
    } else {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: headerColor }
      }
      cell.font = { bold: true, size: 9, color: { argb: headerTextColor } }
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  })

  // ==============================
  //     ANCHO DE COLUMNAS
  // ==============================
  worksheet.getColumn(1).width = 0 // ID Empleado (BD) - OCULTA
  worksheet.getColumn(2).width = 20 // Código de Empleado
  worksheet.getColumn(3).width = 35 // Empleado
  worksheet.getColumn(4).width = 30 // Posición
  worksheet.getColumn(4).alignment = { wrapText: true }

  // Aplicar ancho estándar a todas las columnas de fechas
  for (let col = 5; col <= 4 + dates.length; col++) {
    worksheet.getColumn(col).width = 20
  }

  // ==============================
  //   CARGAR EMPLEADOS Y TURNOS
  // ==============================
  const startDataRow = 5 // Después de los encabezados

  // Si es modo reporte, cargar calendarios de asistencia
  let employeeCalendarsMap = new Map<number, Map<string, { shiftId: number | null; shiftName: string | null; isVacation: boolean; isHoliday: boolean; exceptionType?: string }>>()

  if (isReport) {
    const employeeIdsList = employees.map(emp => emp.employeeId)
    if (employeeIdsList.length > 0) {
      // Cargar calendarios de asistencia (datos explícitos guardados)
      const calendars = await EmployeeAssistCalendar.query()
        .whereIn('employeeId', employeeIdsList)
        .whereBetween('day', [startDate, endDate])
        .whereNull('deletedAt')
        .preload('dateShift')

      calendars.forEach((calendar) => {
        const empId = calendar.employeeId
        const day = calendar.day

        if (!employeeCalendarsMap.has(empId)) {
          employeeCalendarsMap.set(empId, new Map())
        }

        const dayMap = employeeCalendarsMap.get(empId)!
        let shiftName: string | null = null
        let shiftId: number | null = calendar.shiftId

        if (calendar.isVacationDate) {
          shiftName = 'vacaciones'
        } else if (calendar.isHoliday) {
          shiftName = 'Día festivo'
        } else if (calendar.dateShift) {
          // Usar alias si existe, sino usar nombre formateado
          let formattedDisplayName = calendar.dateShift.shiftName
          if (calendar.dateShift.shiftTimeStart && calendar.dateShift.shiftActiveHours && typeof calendar.dateShift.shiftActiveHours === 'number') {
            try {
              const startTime = String(calendar.dateShift.shiftTimeStart).trim()
              const timeParts = startTime.split(':')
              if (timeParts.length >= 2) {
                const hours = Number.parseInt(timeParts[0], 10)
                const minutes = Number.parseInt(timeParts[1], 10)
                if (!Number.isNaN(hours) && !Number.isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                  const shiftStartTime = DateTime.fromObject({ hour: hours, minute: minutes })
                  const shiftEndTime = shiftStartTime.plus({ hours: calendar.dateShift.shiftActiveHours })
                  const endTime = shiftEndTime.toFormat('HH:mm')
                  const formattedStartTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                  formattedDisplayName = `${formattedStartTime} to ${endTime} - Rest (NA)`
                }
              }
            } catch (error) {
              // Usar el nombre del turno por defecto
            }
          }
          // Priorizar alias si existe
          shiftName = (calendar.dateShift.shiftAlias && calendar.dateShift.shiftAlias.trim() !== '')
            ? calendar.dateShift.shiftAlias.trim()
            : formattedDisplayName
        }

        dayMap.set(day, {
          shiftId,
          shiftName,
          isVacation: calendar.isVacationDate || false,
          isHoliday: calendar.isHoliday || false
        })
      })

      // Cargar turnos asignados desde EmployeeShift (basados en applySince)
      // Obtener todos los turnos asignados que puedan aplicarse en el rango de fechas
      const employeeShifts = await EmployeeShift.query()
        .whereIn('employeeId', employeeIdsList)
        .whereNull('deletedAt')
        .whereRaw('DATE(employe_shifts_apply_since) <= ?', [endDate])
        .preload('shift')
        .orderBy('employe_shifts_apply_since', 'desc')

      // Organizar turnos por empleado para acceso rápido
      const employeeShiftsMap = new Map<number, EmployeeShift[]>()
      employeeShifts.forEach((empShift) => {
        if (!employeeShiftsMap.has(empShift.employeeId)) {
          employeeShiftsMap.set(empShift.employeeId, [])
        }
        employeeShiftsMap.get(empShift.employeeId)!.push(empShift)
      })

      // Para cada fecha y cada empleado, determinar el turno activo basado en applySince
      dates.forEach((date) => {
        const dateStr = date.toFormat('yyyy-MM-dd')
        const dateDateTime = date.startOf('day')

        employeeIdsList.forEach((empId) => {
          // Si ya hay un registro en el calendario para esta fecha, no sobrescribir
          const employeeCalendar = employeeCalendarsMap.get(empId)
          if (employeeCalendar && employeeCalendar.has(dateStr)) {
            return
          }

          // Buscar el turno asignado más reciente que sea <= a esta fecha
          const assignedShifts = employeeShiftsMap.get(empId) || []
          let activeShift: EmployeeShift | null = null

          for (const shift of assignedShifts) {
            let shiftApplySince: DateTime
            const applySinceValue = shift.employeShiftsApplySince
            if (applySinceValue instanceof Date) {
              shiftApplySince = DateTime.fromJSDate(applySinceValue).startOf('day')
            } else if (typeof applySinceValue === 'string') {
              shiftApplySince = DateTime.fromISO(applySinceValue).startOf('day')
            } else {
              continue
            }

            if (shiftApplySince.isValid && shiftApplySince <= dateDateTime) {
              activeShift = shift
              break // Ya está ordenado desc, el primero que cumpla es el más reciente
            }
          }

          // Si encontramos un turno activo, agregarlo al calendario
          if (activeShift && activeShift.shift) {
            if (!employeeCalendarsMap.has(empId)) {
              employeeCalendarsMap.set(empId, new Map())
            }

            const dayMap = employeeCalendarsMap.get(empId)!
            let formattedDisplayName = activeShift.shift.shiftName
            const shiftId: number | null = activeShift.shiftId

            // Formatear el nombre del turno con horario si está disponible
            if (activeShift.shift.shiftTimeStart && activeShift.shift.shiftActiveHours && typeof activeShift.shift.shiftActiveHours === 'number') {
              try {
                const startTime = String(activeShift.shift.shiftTimeStart).trim()
                const timeParts = startTime.split(':')
                if (timeParts.length >= 2) {
                  const hours = Number.parseInt(timeParts[0], 10)
                  const minutes = Number.parseInt(timeParts[1], 10)
                  if (!Number.isNaN(hours) && !Number.isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    const shiftStartTime = DateTime.fromObject({ hour: hours, minute: minutes })
                    const shiftEndTime = shiftStartTime.plus({ hours: activeShift.shift.shiftActiveHours })
                    const endTime = shiftEndTime.toFormat('HH:mm')
                    const formattedStartTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                    formattedDisplayName = `${formattedStartTime} to ${endTime} - Rest (NA)`
                  }
                }
              } catch (error) {
                // Usar el nombre del turno por defecto
              }
            }
            // Priorizar alias si existe
            const shiftName: string | null = (activeShift.shift.shiftAlias && activeShift.shift.shiftAlias.trim() !== '')
              ? activeShift.shift.shiftAlias.trim()
              : formattedDisplayName

            // Solo agregar si no existe ya un registro para esta fecha
            if (!dayMap.has(dateStr)) {
              dayMap.set(dateStr, {
                shiftId,
                shiftName,
                isVacation: false,
                isHoliday: false
              })
            }
          }
        })
      })
    }
  }

  // Función para obtener color del turno
  // En modo reporte usa shiftColor, en modo template genera color dinámico
  const getShiftColor = (shiftId: number | null): string => {
    if (!shiftId) return 'FFFFFFFF'
    // En modo reporte, usar el color del turno de la base de datos
    if (isReport && shiftColorMap.has(shiftId)) {
      return shiftColorMap.get(shiftId) || 'FFFFFFFF'
    }
    // En modo template o si no hay color definido, generar color dinámico
    const hue = (shiftId * 137.508) % 360
    const saturation = 50 + (shiftId % 30)
    const lightness = 75 + (shiftId % 15)

    const h = hue / 360
    const s = saturation / 100
    const l = lightness / 100

    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs((h * 6) % 2 - 1))
    const m = l - c / 2

    let r = 0
    let g = 0
    let b = 0
    if (h < 1/6) {
      r = c
      g = x
      b = 0
    } else if (h < 2/6) {
      r = x
      g = c
      b = 0
    } else if (h < 3/6) {
      r = 0
      g = c
      b = x
    } else if (h < 4/6) {
      r = 0
      g = x
      b = c
    } else if (h < 5/6) {
      r = x
      g = 0
      b = c
    } else {
      r = c
      g = 0
      b = x
    }

    const R = Math.round((r + m) * 255)
    const G = Math.round((g + m) * 255)
    const B = Math.round((b + m) * 255)

    return `FF${R.toString(16).padStart(2, '0')}${G.toString(16).padStart(2, '0')}${B.toString(16).padStart(2, '0')}`.toUpperCase()
  }

  employees.forEach((employee, index) => {
    const row = startDataRow + index
    worksheet.getRow(row).height = 45
    const fullName = `${employee.employeeFirstName} ${employee.employeeLastName} ${employee.employeeSecondLastName || ''}`.trim()
    const positionName = employee.position?.positionName || 'Sin posición'


    // ID Empleado (BD) - Columna A (oculta)
    worksheet.getCell(row, 1).value = employee.employeeId
    worksheet.getCell(row, 1).protection = { locked: true }

    // Código de Empleado - Columna B
    worksheet.getCell(row, 2).value = employee.employeePayrollCode || 'Sin código'
    worksheet.getCell(row, 2).protection = { locked: true }

    // Empleado - Columna C
    worksheet.getCell(row, 3).value = fullName
    worksheet.getCell(row, 3).protection = { locked: true }

    // Posición - Columna D
    worksheet.getCell(row, 4).value = positionName
    worksheet.getCell(row, 4).protection = { locked: true }

    // Aplicar formato a las primeras 4 columnas
    for (let col = 1; col <= 4; col++) {
      worksheet.getCell(row, col).alignment = {
        vertical: 'middle',
        horizontal: col === 4 ? 'left' : 'center',
        wrapText: true
      }
      worksheet.getCell(row, col).border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      }
    }

    // Obtener calendario del empleado si es modo reporte
    const employeeCalendar = isReport ? employeeCalendarsMap.get(employee.employeeId) : null

    // Columnas de fechas (desde columna E)
    dates.forEach((date, dateIndex) => {
      const colNumber = 5 + dateIndex
      const dateStr = date.toFormat('yyyy-MM-dd')
      const isHoliday = holidayDates.has(dateStr)

      // Aplicar formato de celda
      worksheet.getCell(row, colNumber).alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      }
      worksheet.getCell(row, colNumber).border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      }

      if (isReport) {
        // MODO REPORTE: Mostrar turnos asignados con colores
        const dayData = employeeCalendar?.get(dateStr)
        let cellValue = ''
        let cellColor = 'FFFFFFFF'

        // Solo mostrar "Día festivo" si es descanso oficial (feriado)
        // isHoliday solo es true para descansos oficiales después del filtro
        if (isHoliday || dayData?.isHoliday) {
          cellValue = 'Día festivo'
          cellColor = 'FFE0E0E0' // Gris claro para días festivos
        } else if (dayData?.isVacation) {
          cellValue = 'vacaciones'
          cellColor = 'FFFFE4B5' // Amarillo claro para vacaciones
        } else if (dayData?.shiftName) {
          // Si hay turno asignado, mostrarlo (incluso si es un día festivo que NO es descanso oficial)
          cellValue = dayData.shiftName
          cellColor = getShiftColor(dayData.shiftId)
        }

        worksheet.getCell(row, colNumber).value = cellValue
        worksheet.getCell(row, colNumber).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: cellColor }
        }
        worksheet.getCell(row, colNumber).protection = { locked: true }
      } else {
        // MODO TEMPLATE: Comportamiento normal (editable)
        if (isHoliday) {
          // Si es día festivo, solo poner "Día festivo" y proteger la celda
          worksheet.getCell(row, colNumber).value = 'Día festivo'
          worksheet.getCell(row, colNumber).protection = { locked: true }
        } else {
          // Si NO es día festivo, agregar dropdown para turnos (editable)
          worksheet.getCell(row, colNumber).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [shiftRange],
            errorStyle: 'warning',
            showErrorMessage: true,
            errorTitle: 'Valor inválido',
            error: 'Seleccione un turno válido o deje vacío'
          }
          worksheet.getCell(row, colNumber).protection = { locked: false }
        }
      }
    })
  })

  // ==============================
  //     OCULTAR COLUMNA ID
  // ==============================
  worksheet.getColumn(1).hidden = true

  // ==============================
  //     PROTEGER HOJA
  // ==============================
  // En modo reporte, proteger toda la hoja. En modo template, permitir editar turnos
  if (isReport) {
    await worksheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: false,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false
    })
  } else {
    await worksheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false
    })
  }

  // ==============================
  //     CONGELAR ENCABEZADOS
  // ==============================
  worksheet.views = [
    { state: 'frozen', ySplit: 4, xSplit: 4, topLeftCell: 'E5', activeCell: 'E5' }
  ]

  // ==============================
  //       GENERAR ARCHIVO
  // ==============================
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Importar asignaciones de turnos desde archivo Excel
 * Lee el Excel generado por generateShiftAssignmentTemplate y guarda las asignaciones
 * @param file - Archivo Excel subido
 * @param rawHeaders - Headers de la request para logs
 * @param userId - ID del usuario para logs
 * @returns Promise con resultados de la importación
 */
async importShiftAssignmentsFromExcel(file: any, rawHeaders?: string[], userId?: number) {
  const workbook = new ExcelJS.Workbook()

  try {
    // Leer el archivo Excel
    await workbook.xlsx.readFile(file.tmpPath)
    const worksheet = workbook.getWorksheet(1)

    if (!worksheet) {
      throw new Error('No se encontró ninguna hoja de trabajo en el archivo Excel')
    }

    // Obtener todas las filas
    const rows: Array<{ row: any; rowNumber: number }> = []
    worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      rows.push({ row, rowNumber })
    })

    // Las primeras 4 filas son encabezados
    const startDataRow = 5

    // Obtener encabezados de fechas (fila 3)
    const dateHeaders: Array<{ date: DateTime; colNumber: number }> = []
    const headerRow = worksheet.getRow(3)

    if (headerRow) {
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        // Las primeras 4 columnas son: ID (BD), Código, Empleado, Posición
        if (colNumber > 4) {
          const cellValue = cell.value
          if (cellValue && typeof cellValue === 'string') {
            try {
              const date = DateTime.fromFormat(cellValue, 'dd/MM/yyyy')
              if (date.isValid) {
                dateHeaders.push({ date, colNumber })
              }
            } catch (error) {
              console.warn(`Error parseando fecha en columna ${colNumber}: ${cellValue}`)
            }
          }
        }
      })
    }

    // Obtener todos los turnos para mapear nombres/alias a IDs
    const shifts = await Shift.query()
      .whereNull('shift_deleted_at')
      .select('shiftId', 'shiftName', 'shiftAlias', 'shiftTimeStart', 'shiftActiveHours', 'shiftBusinessUnits')

    // Mapa: clave = valor normalizado, valor = objeto con shiftId y businessUnits
    const shiftMap = new Map<string, Array<{ shiftId: number; businessUnits: string | null }>>()

    shifts.forEach((shift) => {
      const shiftNameLower = shift.shiftName.toLowerCase().trim()

      // Agregar nombre del turno
      if (!shiftMap.has(shiftNameLower)) {
        shiftMap.set(shiftNameLower, [])
      }
      shiftMap.get(shiftNameLower)!.push({
        shiftId: shift.shiftId,
        businessUnits: shift.shiftBusinessUnits
      })

      // Si tiene alias, agregarlo también
      if (shift.shiftAlias && shift.shiftAlias.trim() !== '') {
        const aliasLower = shift.shiftAlias.toLowerCase().trim()
        if (!shiftMap.has(aliasLower)) {
          shiftMap.set(aliasLower, [])
        }
        shiftMap.get(aliasLower)!.push({
          shiftId: shift.shiftId,
          businessUnits: shift.shiftBusinessUnits
        })
      }

      // Agregar nombres formateados con horarios
      if (shift.shiftTimeStart && shift.shiftActiveHours) {
        try {
          const startTime = String(shift.shiftTimeStart).trim()
          const timeParts = startTime.split(':')
          if (timeParts.length >= 2) {
            const hours = Number.parseInt(timeParts[0], 10)
            const minutes = Number.parseInt(timeParts[1], 10)
            if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
              const shiftStartTime = DateTime.fromObject({ hour: hours, minute: minutes })
              const shiftEndTime = shiftStartTime.plus({ hours: shift.shiftActiveHours })
              const endTime = shiftEndTime.toFormat('HH:mm')
              const formattedStartTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

              const formattedName1 = `${formattedStartTime} to ${endTime} - Rest (NA)`
              const formattedName2 = `${formattedStartTime} to ${endTime}`
              const formattedName3 = `${formattedStartTime}-${endTime}`

              const formattedNames = [formattedName1, formattedName2, formattedName3]
              formattedNames.forEach((formattedName) => {
                const formattedLower = formattedName.toLowerCase()
                if (!shiftMap.has(formattedLower)) {
                  shiftMap.set(formattedLower, [])
                }
                shiftMap.get(formattedLower)!.push({
                  shiftId: shift.shiftId,
                  businessUnits: shift.shiftBusinessUnits
                })
              })
            }
          }
        } catch (error) {
          // Ignorar errores
        }
      }
    })

    const specialOptions = ['vacaciones', 'día festivo', 'dia festivo']

    // Obtener todos los tipos de excepciones para mapeo
    const exceptionTypes = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .select('exceptionTypeId', 'exceptionTypeSlug', 'exceptionTypeTypeName', 'exceptionTypeCanMasive')

    const exceptionTypeMap = new Map<string, number>()
    exceptionTypes.forEach((exceptionType) => {
      exceptionTypeMap.set(exceptionType.exceptionTypeSlug, exceptionType.exceptionTypeId)
    })

    // Mapa de nombres de excepciones masivas a sus IDs
    const massiveExceptionTypeMap = new Map<string, number>()
    exceptionTypes.forEach((exceptionType) => {
      if (exceptionType.exceptionTypeCanMasive) {
        const typeName = exceptionType.exceptionTypeTypeName?.toLowerCase().trim()
        if (typeName) {
          massiveExceptionTypeMap.set(typeName, exceptionType.exceptionTypeId)
        }
      }
    })

    const specialOptionToSlug: Record<string, string> = {
      'vacaciones': 'vacation',
      'día festivo': 'absence-from-work',
      'dia festivo': 'absence-from-work'
    }

    const results = {
      totalRows: 0,
      processed: 0,
      created: 0,
      skipped: 0,
      errors: [] as string[]
    }

    // Procesar cada fila de datos
    for (const { row, rowNumber } of rows) {
      if (rowNumber < startDataRow) continue

      results.totalRows++

      // Obtener ID del empleado de la primera columna (columna A - oculta)
      const employeeIdCell = row.getCell(1)
      const employeeId = employeeIdCell.value

      // Si no hay ID de empleado, saltar
      if (!employeeId || employeeId === '' || employeeId === null || employeeId === undefined) {
        results.skipped++
        continue
      }

      // Verificar que el empleado existe
      const employee = await Employee.find(employeeId)
      if (!employee) {
        results.skipped++
        results.errors.push(`Fila ${rowNumber}: Empleado con ID ${employeeId} no encontrado`)
        continue
      }

      // Procesar cada fecha/columna
      let processedAny = false
      for (const { date, colNumber } of dateHeaders) {
        const shiftCell = row.getCell(colNumber)
        let shiftValue = shiftCell.value

        // Si es una fórmula, obtener el valor calculado
        if (shiftCell.type === ExcelJS.ValueType.Formula) {
          shiftValue = shiftCell.result
        }

        // Si la celda está vacía, ignorarla (SOLO PROCESAR CELDAS CON VALOR)
        if (!shiftValue || shiftValue === '' || shiftValue === null || shiftValue === undefined) {
          continue
        }

        const shiftName = String(shiftValue).trim()
        const shiftNameLower = shiftName.toLowerCase()

        let shiftId: number | null = null
        let isSpecialOption = false
        let exceptionTypeSlug: string | null = null
        let isMassiveException = false
        let massiveExceptionTypeId: number | null = null

        // Verificar si es una excepción masiva
        massiveExceptionTypeId = massiveExceptionTypeMap.get(shiftNameLower) || null
        if (massiveExceptionTypeId) {
          isMassiveException = true
        }

        // Verificar si es una opción especial
        if (specialOptions.includes(shiftNameLower)) {
          isSpecialOption = true
          exceptionTypeSlug = specialOptionToSlug[shiftNameLower] || null
        }

        // Si es una excepción masiva, crear excepción
        if (isMassiveException && massiveExceptionTypeId) {
          const dateStr = date.toFormat('yyyy-MM-dd')
          const shiftExceptionService = new ShiftExceptionService(this.i18n)

          try {
            const shiftException = {
              employeeId: employeeId,
              exceptionTypeId: massiveExceptionTypeId,
              shiftExceptionsDate: dateStr,
              shiftExceptionsDescription: `Importado desde Excel: ${shiftName}`,
              shiftExceptionEnjoymentOfSalary: 0,
              shiftExceptionCheckInTime: null,
              shiftExceptionCheckOutTime: null,
              shiftExceptionTimeByTime: null,
              vacationSettingId: null,
              workDisabilityPeriodId: null,
            } as ShiftException

            const verifyInfo = await shiftExceptionService.verifyInfo(shiftException)

            if (verifyInfo.status !== 200) {
              const existingException = await ShiftException.query()
                .whereNull('shift_exceptions_deleted_at')
                .where('employeeId', employeeId)
                .where('shiftExceptionsDate', dateStr)
                .where('exceptionTypeId', massiveExceptionTypeId)
                .first()

              if (!existingException) {
                results.errors.push(
                  `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: ${verifyInfo.message}`
                )
                continue
              }
            } else {
              await shiftExceptionService.create(shiftException)
            }

            processedAny = true
            results.created++
          } catch (error: any) {
            results.errors.push(
              `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: Error al crear excepción - ${error.message}`
            )
          }
          continue
        }

        // Si es una opción especial, crear excepción
        if (isSpecialOption && exceptionTypeSlug) {
          const exceptionTypeId = exceptionTypeMap.get(exceptionTypeSlug)

          if (!exceptionTypeId) {
            results.errors.push(
              `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: Tipo de excepción "${exceptionTypeSlug}" no encontrado`
            )
            continue
          }

          const dateStr = date.toFormat('yyyy-MM-dd')
          const shiftExceptionService = new ShiftExceptionService(this.i18n)

          try {
            let vacationSettingId: number | null = null

            if (exceptionTypeSlug === 'vacation') {
              const availableVacation = await this.getAvailableVacationSetting(
                employee,
                date
              )

              if (!availableVacation) {
                results.errors.push(
                  `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: No hay vacaciones disponibles para el empleado`
                )
                continue
              }

              vacationSettingId = availableVacation.vacationSettingId
            }

            const shiftException = {
              employeeId: employeeId,
              exceptionTypeId: exceptionTypeId,
              shiftExceptionsDate: dateStr,
              shiftExceptionsDescription: `Importado desde Excel: ${shiftName}`,
              shiftExceptionEnjoymentOfSalary: exceptionTypeSlug === 'vacation' ? 1 : 0,
              shiftExceptionCheckInTime: null,
              shiftExceptionCheckOutTime: null,
              shiftExceptionTimeByTime: null,
              vacationSettingId: vacationSettingId,
              workDisabilityPeriodId: null,
            } as ShiftException

            const verifyInfo = await shiftExceptionService.verifyInfo(shiftException)

            if (verifyInfo.status !== 200) {
              const existingException = await ShiftException.query()
                .whereNull('shift_exceptions_deleted_at')
                .where('employeeId', employeeId)
                .where('shiftExceptionsDate', dateStr)
                .where('exceptionTypeId', exceptionTypeId)
                .first()

              if (!existingException) {
                results.errors.push(
                  `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: ${verifyInfo.message}`
                )
                continue
              }
            } else {
              await shiftExceptionService.create(shiftException)
            }

            processedAny = true
            results.created++
          } catch (error: any) {
            results.errors.push(
              `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: Error al crear excepción - ${error.message}`
            )
          }
          continue
        }

        // Buscar el turno considerando alias y unidad de negocio del empleado
        const normalizedShiftName = shiftNameLower.replace(/\s+/g, ' ').trim()
        const employeeBusinessUnitId = employee.businessUnitId

        // Función auxiliar para verificar si el businessUnitId está en shiftBusinessUnits
        const isBusinessUnitMatch = (businessUnitsStr: string | null, targetBusinessUnitId: number): boolean => {
          if (!businessUnitsStr || businessUnitsStr.trim() === '') return false
          const businessUnitsList = businessUnitsStr.split(',').map(bu => bu.trim())
          return businessUnitsList.includes(String(targetBusinessUnitId))
        }

        // Buscar primero por coincidencia exacta
        const exactMatches = shiftMap.get(normalizedShiftName)
        if (exactMatches && exactMatches.length > 0) {
          // Si hay coincidencia exacta, buscar la que coincida con la unidad de negocio
          const matchingShift = exactMatches.find(s =>
            isBusinessUnitMatch(s.businessUnits, employeeBusinessUnitId)
          )
          if (matchingShift) {
            shiftId = matchingShift.shiftId
          } else if (exactMatches.length === 1) {
            // Si solo hay uno y no hay filtro de unidad de negocio, usarlo
            shiftId = exactMatches[0].shiftId
          }
        }

        // Si no se encontró, buscar por coincidencia parcial
        if (!shiftId) {
          for (const [mapKey, shiftsList] of shiftMap.entries()) {
            const normalizedMapKey = mapKey.replace(/\s+/g, ' ').trim()

            // Coincidencia exacta normalizada
            if (normalizedMapKey === normalizedShiftName) {
              const matchingShift = shiftsList.find(s =>
                isBusinessUnitMatch(s.businessUnits, employeeBusinessUnitId)
              )
              if (matchingShift) {
                shiftId = matchingShift.shiftId
                break
              } else if (shiftsList.length === 1) {
                shiftId = shiftsList[0].shiftId
                break
              }
              continue
            }

            // Coincidencia por patrón de tiempo
            const timePattern = /(\d{1,2}):(\d{2})\s*(?:to|-)\s*(\d{1,2}):(\d{2})/i
            const matchExcel = normalizedShiftName.match(timePattern)
            const matchMap = normalizedMapKey.match(timePattern)

            if (matchExcel && matchMap) {
              const excelStart = `${matchExcel[1].padStart(2, '0')}:${matchExcel[2]}`
              const excelEnd = `${matchExcel[3].padStart(2, '0')}:${matchExcel[4]}`
              const mapStart = `${matchMap[1].padStart(2, '0')}:${matchMap[2]}`
              const mapEnd = `${matchMap[3].padStart(2, '0')}:${matchMap[4]}`

              if (excelStart === mapStart && excelEnd === mapEnd) {
                const matchingShift = shiftsList.find(s =>
                  isBusinessUnitMatch(s.businessUnits, employeeBusinessUnitId)
                )
                if (matchingShift) {
                  shiftId = matchingShift.shiftId
                  break
                } else if (shiftsList.length === 1) {
                  shiftId = shiftsList[0].shiftId
                  break
                }
              }
            }

            // Coincidencia por inclusión
            if (normalizedMapKey.includes(normalizedShiftName) || normalizedShiftName.includes(normalizedMapKey)) {
              const matchingShift = shiftsList.find(s =>
                isBusinessUnitMatch(s.businessUnits, employeeBusinessUnitId)
              )
              if (matchingShift) {
                shiftId = matchingShift.shiftId
                break
              } else if (shiftsList.length === 1) {
                shiftId = shiftsList[0].shiftId
                break
              }
            }

            // Coincidencia por limpieza de caracteres especiales
            const nameClean = normalizedMapKey.replace(/[-\s()]/g, '').toLowerCase()
            const shiftNameClean = normalizedShiftName.replace(/[-\s()]/g, '').toLowerCase()
            if (nameClean === shiftNameClean && nameClean.length > 0) {
              const matchingShift = shiftsList.find(s =>
                isBusinessUnitMatch(s.businessUnits, employeeBusinessUnitId)
              )
              if (matchingShift) {
                shiftId = matchingShift.shiftId
                break
              } else if (shiftsList.length === 1) {
                shiftId = shiftsList[0].shiftId
                break
              }
            }

            // Coincidencia por primera parte del nombre (antes de "to" o "-")
            const nameOnly = normalizedMapKey.split(/\s*(?:to|-)\s*/)[0].trim()
            const shiftNameOnly = normalizedShiftName.split(/\s*(?:to|-)\s*/)[0].trim()
            if (nameOnly && shiftNameOnly && nameOnly === shiftNameOnly) {
              const matchingShift = shiftsList.find(s =>
                isBusinessUnitMatch(s.businessUnits, employeeBusinessUnitId)
              )
              if (matchingShift) {
                shiftId = matchingShift.shiftId
                break
              } else if (shiftsList.length === 1) {
                shiftId = shiftsList[0].shiftId
                break
              }
            }
          }
        }

        if (!shiftId) {
          results.errors.push(
            `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: Turno "${shiftName}" no encontrado para la unidad de negocio del empleado`
          )
          continue
        }

        const employeeShiftService = new EmployeeShiftService(this.i18n)
        const dateStr = `${date.toFormat('yyyy-MM-dd')} 00:00:00`

        try {
          const employeeShift = {
            employeeId: employeeId,
            shiftId: shiftId,
            employeShiftsApplySince: employeeShiftService.getDateAndTime(dateStr),
          } as EmployeeShift

          const verifyInfo = await employeeShiftService.verifyInfo(employeeShift)

          if (verifyInfo.status !== 200) {
            results.errors.push(
              `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: ${verifyInfo.message}`
            )
            continue
          }

          await employeeShiftService.deleteEmployeeShifts(employeeShift)
          const newEmployeeShift = await EmployeeShift.create(employeeShift)

          // Guardar log en MongoDB si se proporcionan headers y userId
          if (rawHeaders && userId) {
            try {
              const logEmployeeShift =
                employeeShiftService.createActionLog(rawHeaders, 'store')
              logEmployeeShift.user_id = userId
              logEmployeeShift.record_current =
                JSON.parse(JSON.stringify(newEmployeeShift))
              await employeeShiftService.saveActionOnLog(logEmployeeShift)
            } catch (logError) {
              // Si falla el log, no interrumpir la importación
              console.warn('Error guardando log de importación:', logError)
            }
          }

          const dateObj = date.toJSDate()
          await employeeShiftService.updateAssistCalendar(employeeId, dateObj)

          processedAny = true
          results.created++
        } catch (error: any) {
          results.errors.push(
            `Fila ${rowNumber}, Fecha ${date.toFormat('dd/MM/yyyy')}: Error al asignar turno - ${error.message}`
          )
        }
      }

      if (processedAny) {
        results.processed++
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Importación completada',
      message: 'Las asignaciones de turnos se importaron correctamente',
      data: results
    }
  } catch (error: any) {
    return {
      status: 500,
      type: 'error',
      title: 'Error al importar',
      message: 'Ocurrió un error al procesar el archivo Excel',
      error: error.message,
      data: null
    }
  }
}
}
