import Department from '#models/department'
import Position from '#models/position'
import { cuid } from '@adonisjs/core/helpers'
import BiometricDepartmentInterface from '../interfaces/biometric_department_interface.js'
import BiometricPositionInterface from '../interfaces/biometric_position_interface.js'
import PositionService from './position_service.js'
import DepartmentPosition from '#models/department_position'
import { DepartmentShiftFilterInterface } from '../interfaces/department_shift_filter_interface.js'
import Shift from '#models/shift'
import EmployeeShiftService from './employee_shift_service.js'
import EmployeeService from './employee_service.js'
import { DepartmentShiftEmployeeWarningInterface } from '../interfaces/department_shift_employee_warning_interface.js'
import EmployeeShift from '#models/employee_shift'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import { DepartmentIndexFilterInterface } from '../interfaces/department_index_filter_interface.js'
import Employee from '#models/employee'
import EmployeeContract from '#models/employee_contract'
import RoleDepartment from '#models/role_department'
import { I18n } from '@adonisjs/i18n'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type {
  HasManyQueryBuilderContract,
  RelationQueryBuilderContract,
} from '@adonisjs/lucid/types/relations'

export default class DepartmentService {
  private t: (key: string,params?: { [key: string]: string | number }) => string
  private i18n: I18n

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
  }

  async index(departmentsList: Array<number>, filters?: DepartmentIndexFilterInterface) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    const departments = await Department.query()
      .whereIn('businessUnitId', businessUnitsList)
      .whereIn('departmentId', departmentsList)
      .where('departmentId', '<>', 999)
      .if(filters?.departmentName, (query) => {
        query.whereILike('departmentName', `%${filters?.departmentName}%`)
      })
      .if(filters?.onlyParents, (query) => {
        query.whereNull('parentDepartmentId')
      })
      .if(!filters?.onlyParents, (query) => {
        query.whereNotNull('parentDepartmentId')
      })
      .orderBy('departmentName', 'asc')

    return departments
  }

  async getOnlyWithEmployees(
    departmentsList: Array<number>,
    filters?: DepartmentIndexFilterInterface
  ) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    const departments = await Department.query()
      .whereIn('businessUnitId', businessUnitsList)
      .whereIn('departmentId', departmentsList)
      .where('departmentId', '<>', 999)
      .if(filters?.departmentName, (query) => {
        query.whereILike('departmentName', `%${filters?.departmentName}%`)
      })
      .if(filters?.onlyParents, (query) => {
        query.whereNull('parentDepartmentId')
      })
      .whereHas('employees', (query) => {
        query.orderBy('employee_id')
      })
      .preload('employees')
      .orderBy('departmentName', 'asc')

    return departments
  }

  async buildOrganization(/* departmentList: number[] */) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    const departmentsQuery = Department.query()
      .whereIn('businessUnitId', businessUnitsList)
      .where('departmentId', '<>', 999)
      .whereNull('parentDepartmentId')
      .orderBy('departmentName', 'asc')
    this.preloadDepartmentHierarchy(departmentsQuery)
    const departments = await departmentsQuery

    // const departments = await Department.query()
    //   .whereIn('businessUnitId', businessUnitsList)
    //   .whereIn('departmentId', departmentList)
    //   .where('departmentId', '<>', 999)
    //   .whereNull('parentDepartmentId')
    //   .orderBy('departmentName', 'asc')
    //   .preload('subDepartments', (child) => {
    //     child.whereIn('businessUnitId', businessUnitsList)
    //     child.preload('departmentsPositions', (deptQuery) => {
    //       deptQuery.whereHas('position', (position) => {
    //         position.whereNull('parentPositionId')
    //       })
    //       deptQuery.preload('position', (position) => {
    //         position.whereNull('parentPositionId')
    //         position.preload('subPositions', (subp1) => {
    //           subp1.preload('subPositions', (subp2) => {
    //             subp2.preload('subPositions')
    //           })
    //         })
    //       })
    //     })
    //   })
    //   .preload('departmentsPositions', (deptQuery) => {
    //     deptQuery.whereHas('position', (position) => {
    //       position.whereNull('parentPositionId')
    //     })
    //     deptQuery.preload('position', (position) => {
    //       position.whereNull('parentPositionId')
    //       position.preload('subPositions', (subp1) => {
    //         subp1.preload('subPositions', (subp2) => {
    //           subp2.preload('subPositions')
    //         })
    //       })
    //     })
    //   })

    return departments
  }

  async syncCreate(department: BiometricDepartmentInterface) {
    const newDepartment = new Department()
    newDepartment.departmentSyncId = department.id
    newDepartment.parentDepartmentSyncId = department.parentDeptId
    newDepartment.departmentCode = department.deptCode
    newDepartment.departmentName = department.deptName
    newDepartment.departmentIsDefault = department.isDefault
    newDepartment.departmentActive = 1
    newDepartment.parentDepartmentId = department.parentDeptId
      ? await this.getIdBySyncId(department.parentDeptId)
      : null
    newDepartment.companyId = department.companyId
    newDepartment.departmentLastSynchronizationAt = new Date()
    await newDepartment.save()
    return newDepartment
  }

  async syncUpdate(department: BiometricDepartmentInterface, currentDepartment: Department) {
    currentDepartment.parentDepartmentSyncId = department.parentDeptId
    currentDepartment.departmentCode = department.deptCode
    currentDepartment.departmentName = department.deptName
    currentDepartment.departmentIsDefault = department.isDefault
    currentDepartment.parentDepartmentId = department.parentDeptId
      ? await this.getIdBySyncId(department.parentDeptId)
      : null
    currentDepartment.companyId = department.companyId
    currentDepartment.departmentLastSynchronizationAt = new Date()
    await currentDepartment.save()
    return currentDepartment
  }

  async create(department: Department) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
      .first()

    const newDepartment = new Department()
    newDepartment.departmentCode = department.departmentCode
    newDepartment.departmentName = department.departmentName
    newDepartment.departmentAlias = department.departmentAlias
    newDepartment.departmentIsDefault = department.departmentIsDefault
    newDepartment.departmentActive = department.departmentActive
    newDepartment.parentDepartmentId = department.parentDepartmentId
    newDepartment.companyId = department.companyId
    newDepartment.businessUnitId = businessUnits?.businessUnitId || 0
    await newDepartment.save()
    return newDepartment
  }

  async update(currentDepartment: Department, department: Department) {
    currentDepartment.departmentCode = department.departmentCode
    currentDepartment.departmentName = department.departmentName
    currentDepartment.departmentAlias = department.departmentAlias
    currentDepartment.departmentIsDefault = department.departmentIsDefault
    currentDepartment.departmentActive = department.departmentActive
    currentDepartment.parentDepartmentId = department.parentDepartmentId
    currentDepartment.companyId = department.companyId
    await currentDepartment.save()
    return currentDepartment
  }

  async delete(currentDepartment: Department) {
    await currentDepartment.delete()
    return currentDepartment
  }

  async getIdBySyncId(departmentSyncId: number) {
    const department = await Department.query()
      .where('department_sync_id', departmentSyncId)
      .first()
    if (department) {
      return department.departmentId
    } else {
      return 0
    }
  }

  async showSync(departmentSyncId: number) {
    const department = await Department.query()
      .where('department_sync_id', departmentSyncId)
      .first()
    if (department) {
      return department
    } else {
      return null
    }
  }

  async addPosition(department: Department) {
    const positionService = new PositionService(this.i18n)
    const newPosition: BiometricPositionInterface = {
      id: 0,
      positionName: department.departmentName,
      positionCode: cuid(),
      isDefault: false,
      companyId: department.companyId,
      parentPositionId: 0,
    }
    const position = await positionService.syncCreate(newPosition)
    return position ? position.positionId : 0
  }

  private preloadDepartmentHierarchy(
    query:
      | ModelQueryBuilderContract<typeof Department, Department>
      | HasManyQueryBuilderContract<typeof Department, Department>
  ) {
    query.preload('departments', (childQuery) => {
      childQuery.orderBy('departmentName', 'asc')
      this.preloadDepartmentHierarchy(childQuery)
    })
    query.preload('departmentPositions', (departmentPositionQuery) => {
      departmentPositionQuery.preload('position', (positionQuery) => {
        this.preloadPositionHierarchy(positionQuery)
      })
    })
  }

  private preloadPositionHierarchy(
    query:
      | ModelQueryBuilderContract<typeof Position, Position>
      | RelationQueryBuilderContract<typeof Position, Position>
      | HasManyQueryBuilderContract<typeof Position, Position>
  ) {
    query.preload('parentPosition')
    query.preload('employees', (employeeQuery) => {
      employeeQuery.preload('person')
    })
    query.preload('positions', (childPositionQuery) => {
      this.preloadPositionHierarchy(childPositionQuery)
    })
  }

  async show(departmentId: number) {
    const department = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .preload('subDepartments', (query) => {
        query.preload('parentDepartment')
        query.orderBy('departmentName', 'asc')
      })
      .first()

    return department ? department : null
  }

  async assignShift(filters: DepartmentShiftFilterInterface) {
    const employeeShiftService = new EmployeeShiftService(this.i18n)
    if (!employeeShiftService.isValidDate(filters.applySince)) {
      const entity = this.t('date')
      return {
        status: 400,
        type: 'error',
        title: this.t('validation_error'),
        message: this.t('entity_is_not_valid', { entity }),
        data: null,
      }
    }
    const page = 1
    const limit = 999999999999999
    const employeeService = new EmployeeService(this.i18n)
    const departmentId = filters.departmentId
    const departmentPositions = await DepartmentPosition.query()
      .whereNull('department_position_deleted_at')
      .where('department_id', departmentId)
      .orderBy('position_id')
    const warnings = [] as Array<DepartmentShiftEmployeeWarningInterface>
    for await (const position of departmentPositions) {
      const resultEmployes = await employeeService.index(
        {
          search: '',
          departmentId: departmentId,
          positionId: position.positionId,
          page: page,
          limit: limit,
          employeeWorkSchedule: '',
        },
        [departmentId]
      )
      const dataEmployes: any = resultEmployes
      for await (const employee of dataEmployes) {
        const employeeShift = {
          employeeId: employee.employeeId,
          shiftId: filters.shiftId,
          employeShiftsApplySince: employeeShiftService.getDateAndTime(filters.applySince),
        } as EmployeeShift
        const verifyInfo = await employeeShiftService.verifyInfo(employeeShift)
        if (verifyInfo.status !== 200) {
          warnings.push({
            status: verifyInfo.status,
            type: verifyInfo.type,
            title: verifyInfo.title,
            message: verifyInfo.message,
            employee: employee,
          })
        } else {
          await EmployeeShift.create(employeeShift)
        }
      }
    }
    return {
      status: 201,
      type: 'success',
      title: this.t('resource'),
      message: this.t('resource_was_created_successfully'),
      data: { warnings },
    }
  }

  async verifyInfoExist(department: Department) {
    if (department.parentDepartmentId) {
      const existDepartmentParent = await Department.query()
        .whereNull('department_deleted_at')
        .where('department_id', department.parentDepartmentId)
        .first()

      if (!existDepartmentParent && department.parentDepartmentId) {
        const entity = `${this.t('department')}-${this.t('parent')}`
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...department },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...department },
    }
  }

  async verifyInfo(department: Department) {
    const action = department.departmentId > 0 ? 'updated' : 'created'
    const existCode = await Department.query()
      .if(department.departmentId > 0, (query) => {
        query.whereNot('department_id', department.departmentId)
      })
      .whereNull('department_deleted_at')
      .where('department_code', department.departmentCode)
      .first()

    if (existCode && department.departmentCode) {
      const entity = this.t('department')
      const param = `${this.t('department')} ${this.t('code')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
        data: { ...department },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...department },
    }
  }

  async verifyInfoAssignShift(filter: DepartmentShiftFilterInterface) {
    const departmentId = filter.departmentId
    const shiftId = filter.shiftId
    if (!departmentId) {
      const entity = this.t('department')
      return {
        status: 400,
        type: 'warning',
        title: this.t('resource'),
        message: this.t('entity_id_was_not_found', { entity }),
        data: { departmentId },
      }
    }
    const currentDepartment = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()
    if (!currentDepartment) {
      const entity = this.t('department')
      return {
        status: 404,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { departmentId },
      }
    }
    if (!shiftId) {
      const entity = this.t('shift')
      return {
        status: 400,
        type: 'warning',
        title: this.t('resource'),
        message: this.t('entity_id_was_not_found', { entity }),
        data: { shiftId },
      }
    }
    const currentShift = await Shift.query()
      .whereNull('shift_deleted_at')
      .where('shift_id', shiftId)
      .first()
    if (!currentShift) {
      const entity = this.t('shift')
      return {
        status: 404,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { shiftId },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...filter },
    }
  }

  async getPositions(departmentId: number, userResponsibleId?: number | null) {
    const positionList: number[] = []
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
      if (userResponsibleId &&
        typeof userResponsibleId && userResponsibleId > 0) {
          const employees = await Employee.query()
          .whereIn('businessUnitId', businessUnitsList)
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
          for await (const employee of employees) {
            if (employee.positionId) {
              const existPosition = positionList.find(a => a === employee.positionId)
              if (!existPosition) {
                positionList.push(employee.positionId)
              }
            }
          }
        }
    const positions = await DepartmentPosition.query()
      .where('department_id', departmentId)
      .if(userResponsibleId &&
        typeof userResponsibleId && userResponsibleId > 0, (query) => {
        query.whereIn('position_id', positionList)
      })
      .preload('position')
      .orderBy('position_id')
    return positions
  }

  /**
   * Elimina todos los departamentos existentes y sus relaciones en otras tablas
   * 
   * Esta función:
   * 1. Elimina todas las relaciones en department_position
   * 2. Elimina todas las relaciones en role_departments
   * 3. Establece department_id en null para todos los empleados
   * 4. Establece department_id en null para todos los contratos de empleados
   * 5. Elimina todos los departamentos (incluyendo relaciones padre-hijo)
   * 
   * @returns Objeto con el resultado de la operación
   */
  async deleteAllDepartments() {
    try {
      // Contar registros antes de eliminar
      const totalDepartments = await Department.query()
        .whereNull('department_deleted_at')
        .count('* as total')
      const totalDepartmentPositions = await DepartmentPosition.query()
        .whereNull('department_position_deleted_at')
        .count('* as total')
      const totalRoleDepartments = await RoleDepartment.query()
        .whereNull('role_department_deleted_at')
        .count('* as total')
      const totalEmployeesWithDepartment = await Employee.query()
        .whereNotNull('department_id')
        .whereNull('employee_deleted_at')
        .count('* as total')
      const totalContractsWithDepartment = await EmployeeContract.query()
        .whereNotNull('department_id')
        .whereNull('employee_contract_deleted_at')
        .count('* as total')

      const counts = {
        departments: Number(totalDepartments[0].$extras.total),
        departmentPositions: Number(totalDepartmentPositions[0].$extras.total),
        roleDepartments: Number(totalRoleDepartments[0].$extras.total),
        employees: Number(totalEmployeesWithDepartment[0].$extras.total),
        contracts: Number(totalContractsWithDepartment[0].$extras.total),
      }

      // 1. Eliminar todas las relaciones en department_position
      await DepartmentPosition.query()
        .delete()

      // 2. Eliminar todas las relaciones en role_departments
      await RoleDepartment.query()
        .delete()

      // 3. Establecer department_id en null para todos los empleados
      await Employee.query()
        .whereNotNull('department_id')
        .update({ departmentId: null })

      // 4. Establecer department_id en null para todos los contratos de empleados
      await EmployeeContract.query()
        .delete()

      // 5. Primero, establecer parent_department_id en null para evitar problemas de foreign key
      await Department.query()
        .whereNotNull('parent_department_id')
        .update({ parentDepartmentId: null })

      // 6. Eliminar todos los departamentos
      await Department.query()
        .delete()

      return {
        status: 200,
        type: 'success',
        title: 'Departments deleted successfully',
        message: 'All departments and their relationships have been deleted successfully',
        data: {
          deleted: {
            departments: counts.departments,
            departmentPositions: counts.departmentPositions,
            roleDepartments: counts.roleDepartments,
            employeesUpdated: counts.employees,
            contractsUpdated: counts.contracts,
          },
        },
      }
    } catch (error: any) {
      console.error('Error al eliminar todos los departamentos:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to delete departments',
        message: 'An error occurred while trying to delete all departments',
        error: error.message,
        data: null,
      }
    }
  }

  /**
   * Crea la estructura completa de departamentos según el organigrama organizacional demo
   * 
   * Estructura creada:
   * - GERENCIA (raíz)
   *   - ADMINISTRACION
   *     - RRHH
   *     - CONTABILIDAD
   *     - PROYECTOS
   *       - DISEÑO
   *       - PROTOTIPOS
   *   - OPERACIONES
   *     - DISTRIBUCION
   *     - PRODUCCIÓN
   *   - MARKETING
   *     - INVESTIGACION DE MERCADOS
   * 
   * @returns Objeto con el resultado de la operación y los departamentos creados
   */
  async createDepartmentDemo() {
    try {
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)
        .first()

      const businessUnitId = businessUnits?.businessUnitId || 0
      const createdDepartments: { [key: string]: Department } = {}

      // 1. Gerencia
      const management = new Department()
      management.departmentCode = 'GER-001'
      management.departmentName = '(D101) Dirección General'
      management.departmentAlias = 'Dirección General'
      management.departmentIsDefault = false
      management.departmentActive = 1
      management.parentDepartmentId = null
      management.companyId = 0
      management.businessUnitId = businessUnitId
      management.departmentSyncId = 0
      management.parentDepartmentSyncId = 0
      await management.save()
      createdDepartments['GERENCIA'] = management

      // 2. Administración
      const administration = new Department()
      administration.departmentCode = 'ADM-001'
      administration.departmentName = '(G101) Administración'
      administration.departmentAlias = 'Administración'
      administration.departmentIsDefault = false
      administration.departmentActive = 1
      administration.parentDepartmentId = management.departmentId
      administration.companyId = 0
      administration.businessUnitId = businessUnitId
      administration.departmentSyncId = 0
      administration.parentDepartmentSyncId = 0
      await administration.save()
      createdDepartments['Administración'] = administration

      const operations = new Department()
      operations.departmentCode = 'OPE-001'
      operations.departmentName = '(G101) Operaciones'
      operations.departmentAlias = 'Operaciones'
      operations.departmentIsDefault = false
      operations.departmentActive = 1
      operations.parentDepartmentId = management.departmentId
      operations.companyId = 0
      operations.businessUnitId = businessUnitId
      operations.departmentSyncId = 0
      operations.parentDepartmentSyncId = 0
      await operations.save()
      createdDepartments['Operaciones'] = operations

      const marketing = new Department()
      marketing.departmentCode = 'MAR-001'
      marketing.departmentName = '(G101) Marketing'
      marketing.departmentAlias = 'Marketing'
      marketing.departmentIsDefault = false
      marketing.departmentActive = 1
      marketing.parentDepartmentId = management.departmentId
      marketing.companyId = 0
      marketing.businessUnitId = businessUnitId
      marketing.departmentSyncId = 0
      marketing.parentDepartmentSyncId = 0
      await marketing.save()
      createdDepartments['Marketing'] = marketing

      // 3. Recursos Humanos
      const hr = new Department()
      hr.departmentCode = 'RRHH-001'
      hr.departmentName = '(G101) Recursos Humanos'
      hr.departmentAlias = 'Recursos Humanos'
      hr.departmentIsDefault = false
      hr.departmentActive = 1
      hr.parentDepartmentId = administration.departmentId
      hr.companyId = 0
      hr.businessUnitId = businessUnitId
      hr.departmentSyncId = 0
      hr.parentDepartmentSyncId = 0
      await hr.save()
      createdDepartments['Recursos Humanos'] = hr

      const accounting = new Department()
      accounting.departmentCode = 'CON-001'
        accounting.departmentName = '(G101) Contabilidad'
      accounting.departmentAlias = 'Contabilidad'
      accounting.departmentIsDefault = false
      accounting.departmentActive = 1
      accounting.parentDepartmentId = administration.departmentId
      accounting.companyId = 0
      accounting.businessUnitId = businessUnitId
      accounting.departmentSyncId = 0
      accounting.parentDepartmentSyncId = 0
      await accounting.save()
      createdDepartments['Contabilidad'] = accounting

      const projects = new Department()
      projects.departmentCode = 'PRO-001'
      projects.departmentName = '(G101) Proyectos'
      projects.departmentAlias = 'Proyectos'
      projects.departmentIsDefault = false
      projects.departmentActive = 1
      projects.parentDepartmentId = administration.departmentId
      projects.companyId = 0
      projects.businessUnitId = businessUnitId
      projects.departmentSyncId = 0
      projects.parentDepartmentSyncId = 0
      await projects.save()
      createdDepartments['Proyectos'] = projects

      // 4. Diseño
      const design = new Department()
      design.departmentCode = 'DIS-001'
      design.departmentName = '(G101) Diseño'
      design.departmentAlias = 'Diseño'
      design.departmentIsDefault = false
      design.departmentActive = 1
      design.parentDepartmentId = projects.departmentId
      design.companyId = 0
      design.businessUnitId = businessUnitId
      design.departmentSyncId = 0
      design.parentDepartmentSyncId = 0
      await design.save()
      createdDepartments['Diseño'] = design

      const prototypes = new Department()
      prototypes.departmentCode = 'PROT-001'
      prototypes.departmentName = '(G101) Prototipos'
      prototypes.departmentAlias = 'Prototipos'
      prototypes.departmentIsDefault = false
      prototypes.departmentActive = 1
      prototypes.parentDepartmentId = projects.departmentId
      prototypes.companyId = 0
      prototypes.businessUnitId = businessUnitId
      prototypes.departmentSyncId = 0
      prototypes.parentDepartmentSyncId = 0
      await prototypes.save()
      createdDepartments['Prototipos'] = prototypes

      // 5. Distribución
      const distribution = new Department()
      distribution.departmentCode = 'DIS-002'
        distribution.departmentName = '(G101) Distribución'
      distribution.departmentAlias = 'Distribución'
      distribution.departmentIsDefault = false
      distribution.departmentActive = 1
      distribution.parentDepartmentId = operations.departmentId
      distribution.companyId = 0
      distribution.businessUnitId = businessUnitId
      distribution.departmentSyncId = 0
      distribution.parentDepartmentSyncId = 0
      await distribution.save()
      createdDepartments['Distribución'] = distribution

      const production = new Department()
      production.departmentCode = 'PROD-001'
      production.departmentName = '(G101) Producción'
      production.departmentAlias = 'Producción'
      production.departmentIsDefault = false
      production.departmentActive = 1
      production.parentDepartmentId = operations.departmentId
      production.companyId = 0
      production.businessUnitId = businessUnitId
      production.departmentSyncId = 0
      production.parentDepartmentSyncId = 0
      await production.save()
      createdDepartments['Producción'] = production

      // 6. Investigación de Mercados
      const research = new Department()
      research.departmentCode = 'INV-001'
      research.departmentName = '(G101) Investigación de Mercados'
      research.departmentAlias = 'Investigación de Mercados'
      research.departmentIsDefault = false
      research.departmentActive = 1
      research.parentDepartmentId = marketing.departmentId
      research.companyId = 0
      research.businessUnitId = businessUnitId
      research.departmentSyncId = 0
      research.parentDepartmentSyncId = 0
      await research.save()
      createdDepartments['Investigación de Mercados'] = research

      // 7. Sin Departamento
      const withoutDepartment = new Department()
      withoutDepartment.departmentId = 999
      withoutDepartment.departmentCode = 'SIN-001'
      withoutDepartment.departmentName = '(D101) Sin Departamento'
      withoutDepartment.departmentAlias = 'Sin Departamento'
      withoutDepartment.departmentIsDefault = false
      withoutDepartment.departmentActive = 1
      withoutDepartment.parentDepartmentId = null
      withoutDepartment.companyId = 0
      withoutDepartment.businessUnitId = businessUnitId
      withoutDepartment.departmentSyncId = 0
      withoutDepartment.parentDepartmentSyncId = 0
      await withoutDepartment.save()
      createdDepartments['Sin Departamento'] = withoutDepartment

      // Preparar resumen
      const summary = Object.keys(createdDepartments).map((key) => ({
        name: key,
        id: createdDepartments[key].departmentId,
        code: createdDepartments[key].departmentCode,
        parentId: createdDepartments[key].parentDepartmentId,
      }))

      return {
        status: 201,
        type: 'success',
        title: 'Estructure organizational created',
        message: 'The structure organizational was created successfully',
        data: {
          created: summary,
          total: Object.keys(createdDepartments).length,
        },
      }
    } catch (error: any) {
      console.error('Error al crear estructura organizacional:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to create structure organizational',
        message: 'An error occurred while trying to create the organizational structure',
        error: error.message,
        data: null,
      }
    }
  }
  
}
