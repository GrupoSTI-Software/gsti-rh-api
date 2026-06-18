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
import { prepareAliasesForPersistence } from '#utils/org_alias_normalize'
import { applyDepartmentNameOrAliasesSearch } from '#utils/org_alias_search_sql'
import OrgAliasUniquenessService from '#services/org_alias_uniqueness_service'

export default class DepartmentService {
  private t: (key: string,params?: { [key: string]: string | number }) => string
  private i18n: I18n

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
  }

  async index(departmentsList: Array<number>, filters?: DepartmentIndexFilterInterface, allowedBusinessUnitIds: number[] = []) {
    if (allowedBusinessUnitIds.length === 0) return []
    const departments = await Department.query()
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .whereIn('departmentId', departmentsList)
      .where('departmentId', '<>', 999)
      .if(filters?.departmentName, (query) => {
        applyDepartmentNameOrAliasesSearch(query, filters?.departmentName)
      })
      // `only-parents=true` limita a departamentos raíz; sin el flag se devuelven
      // todos (raíces incluidas) para poder elegirlos como padre en los selectores.
      .if(filters?.onlyParents, (query) => {
        query.whereNull('parentDepartmentId')
      })
      .orderBy('departmentName', 'asc')

    return departments
  }

  async getOnlyWithEmployees(
    departmentsList: Array<number>,
    filters?: DepartmentIndexFilterInterface,
    allowedBusinessUnitIds: number[] = []
  ) {
    if (allowedBusinessUnitIds.length === 0) return []
    const departments = await Department.query()
      .whereIn('businessUnitId', allowedBusinessUnitIds)
      .whereIn('departmentId', departmentsList)
      .where('departmentId', '<>', 999)
      .if(filters?.departmentName, (query) => {
        applyDepartmentNameOrAliasesSearch(query, filters?.departmentName)
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

  async buildOrganization(businessUnitId: number) {

    const departmentsQuery = Department.query()
      .where('businessUnitId', businessUnitId)
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
    const newDepartment = new Department()
    newDepartment.departmentCode = department.departmentCode
    newDepartment.departmentName = department.departmentName
    newDepartment.departmentAlias = department.departmentAlias
    newDepartment.departmentIsDefault = department.departmentIsDefault
    newDepartment.departmentActive = department.departmentActive
    newDepartment.parentDepartmentId = department.parentDepartmentId
    newDepartment.companyId = department.companyId
    newDepartment.businessUnitId = department.businessUnitId

    const prepared = prepareAliasesForPersistence(department.aliases ?? null)
    newDepartment.aliases = prepared.display
    await new OrgAliasUniquenessService().assertUniqueForBusinessUnit({
      businessUnitId: newDepartment.businessUnitId,
      normalizedTokens: prepared.normalizedTokens,
    })

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

    if (department.aliases !== undefined) {
      const prepared = prepareAliasesForPersistence(department.aliases ?? null)
      await new OrgAliasUniquenessService().assertUniqueForBusinessUnit({
        businessUnitId: currentDepartment.businessUnitId,
        normalizedTokens: prepared.normalizedTokens,
        excludeDepartmentId: currentDepartment.departmentId,
      })
      currentDepartment.aliases = prepared.display
    }

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
      departmentPositionQuery
        .whereNull('department_position_deleted_at')
        .whereHas('position', (pq) => {
          pq.whereNull('position_deleted_at').whereNull('parent_position_id')
        })
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
      childPositionQuery.whereNull('position_deleted_at').orderBy('positionName', 'asc')
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

  async getPositions(departmentId: number, userResponsibleId?: number | null, allowedBusinessUnitIds: number[] = []) {
    const positionList: number[] = []
      if (userResponsibleId &&
        typeof userResponsibleId && userResponsibleId > 0) {
          const employees = await Employee.query()
          .if(allowedBusinessUnitIds.length > 0, (q) => q.whereIn('businessUnitId', allowedBusinessUnitIds))
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
   * Busca un departamento por nombre (usando LIKE para flexibilidad)
   * @param departmentName - Nombre del departamento a buscar
   * @returns Departamento encontrado o null
   */
  async findDepartmentByName(departmentName: string): Promise<Department | null> {
    return await Department.query()
      .whereNull('department_deleted_at')
      .where((sub) => {
        applyDepartmentNameOrAliasesSearch(sub, departmentName)
      })
      .first()
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
   * Crea un departamento con los datos proporcionados
   * @param departmentData - Datos del departamento a crear
   * @param businessUnitId - ID de la unidad de negocio
   * @param parentDepartmentId - ID del departamento padre (opcional)
   * @returns Departamento creado
   */
  private async createDepartment(
    departmentData: {
      code: string
      name: string
      alias: string
      departmentId?: number
    },
    businessUnitId: number,
    parentDepartmentId: number | null = null
  ): Promise<Department> {
    const department = new Department()
    if (departmentData.departmentId) {
      department.departmentId = departmentData.departmentId
    }
    department.departmentCode = departmentData.code
    department.departmentName = departmentData.name
    department.departmentAlias = departmentData.alias
    department.departmentIsDefault = false
    department.departmentActive = 1
    department.parentDepartmentId = parentDepartmentId
    department.companyId = 0
    department.businessUnitId = businessUnitId
    department.departmentSyncId = 0
    department.parentDepartmentSyncId = 0
    await department.save()
    return department
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
  async createDepartmentDemo(allowedBusinessUnitIds: number[] = []) {
    try {
      const query = BusinessUnit.query().where('business_unit_active', 1)
      if (allowedBusinessUnitIds.length > 0) {
        query.whereIn('business_unit_id', allowedBusinessUnitIds)
      }
      const firstBusinessUnit = await query.first()

      const businessUnitId = firstBusinessUnit?.businessUnitId || 0
      const createdDepartments: { [key: string]: Department } = {}

      // Array de departamentos a crear (ordenados para que los padres se creen antes que los hijos)
      const departmentsData = [
        {
          key: 'GERENCIA',
          code: 'GER-001',
          name: '(D101) Dirección General',
          alias: 'Dirección General',
          parentKey: null,
          departmentId: undefined,
        },
        {
          key: 'Administración',
          code: 'ADM-001',
          name: '(G101) Administración',
          alias: 'Administración',
          parentKey: 'GERENCIA',
          departmentId: undefined,
        },
        {
          key: 'Operaciones',
          code: 'OPE-001',
          name: '(G101) Operaciones',
          alias: 'Operaciones',
          parentKey: 'GERENCIA',
          departmentId: undefined,
        },
        {
          key: 'Marketing',
          code: 'MAR-001',
          name: '(G101) Marketing',
          alias: 'Marketing',
          parentKey: 'GERENCIA',
          departmentId: undefined,
        },
        {
          key: 'Recursos Humanos',
          code: 'RRHH-001',
          name: '(G101) Recursos Humanos',
          alias: 'Recursos Humanos',
          parentKey: 'Administración',
          departmentId: undefined,
        },
        {
          key: 'Contabilidad',
          code: 'CON-001',
          name: '(G101) Contabilidad',
          alias: 'Contabilidad',
          parentKey: 'Administración',
          departmentId: undefined,
        },
        {
          key: 'Proyectos',
          code: 'PRO-001',
          name: '(G101) Proyectos',
          alias: 'Proyectos',
          parentKey: 'Administración',
          departmentId: undefined,
        },
        {
          key: 'Diseño',
          code: 'DIS-001',
          name: '(G101) Diseño',
          alias: 'Diseño',
          parentKey: 'Proyectos',
          departmentId: undefined,
        },
        {
          key: 'Prototipos',
          code: 'PROT-001',
          name: '(G101) Prototipos',
          alias: 'Prototipos',
          parentKey: 'Proyectos',
          departmentId: undefined,
        },
        {
          key: 'Distribución',
          code: 'DIS-002',
          name: '(G101) Distribución',
          alias: 'Distribución',
          parentKey: 'Operaciones',
          departmentId: undefined,
        },
        {
          key: 'Producción',
          code: 'PROD-001',
          name: '(G101) Producción',
          alias: 'Producción',
          parentKey: 'Operaciones',
          departmentId: undefined,
        },
        {
          key: 'Investigación de Mercados',
          code: 'INV-001',
          name: '(G101) Investigación de Mercados',
          alias: 'Investigación de Mercados',
          parentKey: 'Marketing',
          departmentId: undefined,
        },
        {
          key: 'Sin Departamento',
          code: 'SIN-001',
          name: '(D101) Sin Departamento',
          alias: 'Sin Departamento',
          parentKey: null,
          departmentId: 999,
        },
      ]

      // Crear todos los departamentos
      for await(const deptData of departmentsData) {
        const parentDepartmentId = deptData.parentKey
          ? createdDepartments[deptData.parentKey]?.departmentId || null
          : null

        const department = await this.createDepartment(
          {
            code: deptData.code,
            name: deptData.name,
            alias: deptData.alias,
            departmentId: deptData.departmentId,
          },
          businessUnitId,
          parentDepartmentId
        )

        createdDepartments[deptData.key] = department
      }

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
