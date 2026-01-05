import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Employee from '#models/employee'
import EmployeeContract from '#models/employee_contract'
import EmployeeShift from '#models/employee_shift'
import Position from '#models/position'
import Shift from '#models/shift'
import env from '#start/env'
import { I18n } from '@adonisjs/i18n'
import BiometricPositionInterface from '../interfaces/biometric_position_interface.js'
import { PositionShiftEmployeeWarningInterface } from '../interfaces/position_shift_employee_warning_interface.js'
import { PositionShiftFilterInterface } from '../interfaces/position_shift_filter_interface.js'
import EmployeeService from './employee_service.js'
import EmployeeShiftService from './employee_shift_service.js'

export default class PositionService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async syncCreate(position: BiometricPositionInterface) {
    const newPosition = new Position()
    newPosition.positionSyncId = position.id
    newPosition.parentPositionSyncId = position.parentPositionId
    newPosition.positionCode = position.positionCode
    newPosition.positionName = position.positionName
    newPosition.positionIsDefault = position.isDefault
    newPosition.positionActive = 1
    newPosition.parentPositionId = position.parentPositionId
      ? await this.getIdBySyncId(position.parentPositionId)
      : null
    newPosition.companyId = position.companyId
    newPosition.positionLastSynchronizationAt = new Date()
    await newPosition.save()
    return newPosition
  }

  async syncUpdate(position: BiometricPositionInterface, currentPosition: Position) {
    currentPosition.parentPositionSyncId = position.parentPositionId
    currentPosition.positionCode = position.positionCode
    currentPosition.positionName = position.positionName
    currentPosition.positionIsDefault = position.isDefault
    currentPosition.parentPositionId = position.parentPositionId
      ? await this.getIdBySyncId(position.parentPositionId)
      : null
    currentPosition.companyId = position.companyId
    currentPosition.positionLastSynchronizationAt = new Date()
    await currentPosition.save()
    return currentPosition
  }

  async create(position: Position) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnit = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
      .first()

    const newPosition = new Position()
    newPosition.positionCode = position.positionCode
    newPosition.positionName = position.positionName
    newPosition.positionAlias = position.positionAlias
    newPosition.positionIsDefault = position.positionIsDefault
    newPosition.positionActive = position.positionActive
    newPosition.parentPositionId = position.parentPositionId
    newPosition.businessUnitId = businessUnit?.businessUnitId || 0

    await newPosition.save()
    await newPosition.load('parentPosition')
    await newPosition.load('subPositions')

    return newPosition
  }

  async update(currentPosition: Position, position: Position) {
    currentPosition.positionCode = position.positionCode
    currentPosition.positionName = position.positionName
    currentPosition.positionAlias = position.positionAlias
    currentPosition.positionIsDefault = position.positionIsDefault
    currentPosition.positionActive = position.positionActive
    currentPosition.parentPositionId = position.parentPositionId
    currentPosition.companyId = position.companyId
    await currentPosition.save()
    await currentPosition.load('parentPosition')
    await currentPosition.load('subPositions')

    return currentPosition
  }

  async delete(currentPosition: Position) {
    await DepartmentPosition.query().where('position_id', currentPosition.positionId).delete()
    await currentPosition.delete()
    return currentPosition
  }

  async assignShift(filters: PositionShiftFilterInterface) {
    const employeeShiftService = new EmployeeShiftService(this.i18n)
    if (!employeeShiftService.isValidDate(filters.applySince)) {
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'Date is invalid',
        data: null,
      }
    }
    const employeeService = new EmployeeService(this.i18n)
    const departmentId = filters.departmentId
    const page = 1
    const limit = 999999999999999
    const resultEmployes = await employeeService.index(
      {
        search: '',
        departmentId: departmentId,
        positionId: filters.positionId,
        page: page,
        limit: limit,
        employeeWorkSchedule: '',
      },
      [departmentId]
    )
    const dataEmployes: any = resultEmployes
    const warnings = [] as Array<PositionShiftEmployeeWarningInterface>
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
    return {
      status: 201,
      type: 'success',
      title: 'Successfully action',
      message: 'Resource created',
      data: { warnings },
    }
  }

  async getIdBySyncId(positionSyncId: number) {
    const position = await Position.query().where('position_sync_id', positionSyncId).first()
    if (position) {
      return position.positionId
    } else {
      return 0
    }
  }

  async verifyExistPositionByName(positionName: string) {
    const position = await Position.query().where('position_name', positionName).first()
    if (position) {
      return position.positionId
    } else {
      return null
    }
  }

  async show(positionId: number) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    const position = await Position.query()
      .whereIn('businessUnitId', businessUnitsList)
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .preload('parentPosition')
      .preload('subPositions')
      .first()

    return position ? position : null
  }

  async get() {
    const positions = await Position.query().whereNull('position_deleted_at')
    return positions
  }

  async verifyInfoExist(position: Position) {
    if (position.parentPositionId) {
      const existPositionParent = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', position.parentPositionId)
        .first()

      if (!existPositionParent && position.parentPositionId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The position parent was not found',
          message: 'The position parent was not found with the entered ID',
          data: { ...position },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...position },
    }
  }

  async verifyInfo(position: Position) {
    const action = position.positionId > 0 ? 'updated' : 'created'
    const existCode = await Position.query()
      .if(position.positionId > 0, (query) => {
        query.whereNot('position_id', position.positionId)
      })
      .whereNull('position_deleted_at')
      .where('position_code', position.positionCode)
      .first()

    if (existCode && position.positionCode) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position code already exists for another position',
        message: `The position resource cannot be ${action} because the code is already assigned to another position`,
        data: { ...position },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...position },
    }
  }

  async verifyInfoAssignShift(filter: PositionShiftFilterInterface) {
    const departmentId = filter.departmentId
    const positionId = filter.positionId
    const shiftId = filter.shiftId
    if (!departmentId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The department Id was not found',
        message: 'Missing data to process',
        data: { departmentId },
      }
    }
    const currentDepartment = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()
    if (!currentDepartment) {
      return {
        status: 404,
        type: 'warning',
        title: 'The department was not found',
        message: 'The department was not found with the entered ID',
        data: { departmentId },
      }
    }
    if (!positionId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The position Id was not found',
        message: 'Missing data to process',
        data: { positionId },
      }
    }
    const currentPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .first()
    if (!currentPosition) {
      return {
        status: 404,
        type: 'warning',
        title: 'The position was not found',
        message: 'The position was not found with the entered ID',
        data: { positionId },
      }
    }
    if (!shiftId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The shift Id was not found',
        message: 'Missing data to process',
        data: { shiftId },
      }
    }
    const currentShift = await Shift.query()
      .whereNull('shift_deleted_at')
      .where('shift_id', shiftId)
      .first()
    if (!currentShift) {
      return {
        status: 404,
        type: 'warning',
        title: 'The shift was not found',
        message: 'The shift was not found with the entered ID',
        data: { shiftId },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...filter },
    }
  }

  /**
   * Elimina todos los puestos existentes y sus relaciones en otras tablas
   * 
   * Esta función:
   * 1. Elimina todas las relaciones en department_position
   * 2. Establece position_id en null para todos los empleados
   * 3. Establece position_id en null para todos los contratos de empleados
   * 4. Elimina todos los puestos (incluyendo relaciones padre-hijo)
   * 
   * @returns Objeto con el resultado de la operación
   */
  async deleteAllPositions() {
    try {
      // Contar registros antes de eliminar
      const totalPositions = await Position.query().whereNull('position_deleted_at').count('* as total')
      const totalDepartmentPositions = await DepartmentPosition.query()
        .whereNull('department_position_deleted_at')
        .count('* as total')
      const totalEmployeesWithPosition = await Employee.query()
        .whereNotNull('position_id')
        .whereNull('employee_deleted_at')
        .count('* as total')
      const totalContractsWithPosition = await EmployeeContract.query()
        .whereNotNull('position_id')
        .whereNull('employee_contract_deleted_at')
        .count('* as total')

      const counts = {
        positions: Number(totalPositions[0].$extras.total),
        departmentPositions: Number(totalDepartmentPositions[0].$extras.total),
        employees: Number(totalEmployeesWithPosition[0].$extras.total),
        contracts: Number(totalContractsWithPosition[0].$extras.total),
      }

      // 1. Eliminar todas las relaciones en department_position
      await DepartmentPosition.query()
        .delete()

      // 2. Establecer position_id en null para todos los empleados
      await Employee.query()
        .whereNotNull('position_id')
        .update({ positionId: null })

      // 3. Eliminar todos los contratos de empleados
      await EmployeeContract.query()
        .delete()
      
      // 4. Primero, eliminar todos los puestos que tengan padre
      await Position.query()
        .whereNotNull('parent_position_id')
        .update({ parentPositionId: null })

      // 5. Eliminar todos los puestos (ahora sin relaciones padre-hijo)
      await Position.query()
        .delete()

      return {
        status: 200,
        type: 'success',
        title: 'Positions deleted successfully',
        message: 'All positions and their relationships have been deleted successfully',
        data: {
          deleted: {
            positions: counts.positions,
            departmentPositions: counts.departmentPositions,
            employeesUpdated: counts.employees,
            contractsUpdated: counts.contracts,
          },
        },
      }
    } catch (error: any) {
      console.error('Error al eliminar todos los puestos:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to delete positions',
        message: 'An error occurred while trying to delete all positions',
        error: error.message,
        data: null,
      }
    }
  }

  /**
   * Busca un departamento por nombre (usando LIKE para flexibilidad)
   * @param departmentName - Nombre del departamento a buscar
   * @returns Departamento encontrado o null
   */
  private async findDepartmentByName(departmentName: string): Promise<Department | null> {
    return await Department.query()
      .where('department_name', 'like', `%${departmentName}%`)
      .whereNull('department_deleted_at')
      .first()
  }

  /**
   * Crea las posiciones demo relacionadas a los departamentos según el organigrama organizacional
   * 
   * Estructura de posiciones por departamento:
   * - Dirección General: Director general, Asistente de dirección
   * - Administración: Gerente administrativo
   * - Recursos Humanos: Gerente de recursos humanos, Reclutador, Desarrollador de talento
   * - Contabilidad: Gerente de contabilidad, Encargado de nóminas, Tesorería
   * - Operaciones: Director de operaciones, Auxiliar operativo
   * - Proyectos: Gerente de proyectos, Project Manager
   * - Diseño: Diseñador gráfico, Diseñador UX
   * - Prototipos: Líder de proyecto
   * - Distribución: Supervisor de distribución, Especialista de logística
   * - Producción: Supervisor de producción, Operador de producción
   * - Marketing: Supervisor de marketing, Content Manager, Especialista en Relaciones Públicas
   * - Investigación de Mercados: Analista de mercado
   * 
   * @returns Objeto con el resultado de la operación y las posiciones creadas
   */
  async createPositionDemo() {
    try {
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)
        .first()

      const businessUnitId = businessUnits?.businessUnitId || 0
      const createdPositions: { [key: string]: Position } = {}
      const createdRelations: Array<{ department: string; position: string }> = []

      // Find departments
      const generalManagement = await this.findDepartmentByName('Dirección General')
      const administration = await this.findDepartmentByName('Administración')
      const humanResources = await this.findDepartmentByName('Recursos Humanos')
      const accounting = await this.findDepartmentByName('Contabilidad')
      const operations = await this.findDepartmentByName('Operaciones')
      const projects = await this.findDepartmentByName('Proyectos')
      const design = await this.findDepartmentByName('Diseño')
      const prototypes = await this.findDepartmentByName('Prototipos')
      const distribution = await this.findDepartmentByName('Distribución')
      const production = await this.findDepartmentByName('Producción')
      const marketing = await this.findDepartmentByName('Marketing')
      const marketResearch = await this.findDepartmentByName('Investigación de Mercados')

      // 1. General Management
      const generalDirector = new Position()
      generalDirector.positionCode = 'POS-DIR-001'
      generalDirector.positionName = 'Director general'
      generalDirector.positionAlias = 'Director general'
      generalDirector.positionIsDefault = false
      generalDirector.positionActive = 1
      generalDirector.parentPositionId = null
      generalDirector.companyId = 0
      generalDirector.businessUnitId = businessUnitId
      generalDirector.positionSyncId = 0
      generalDirector.parentPositionSyncId = 0
      await generalDirector.save()
      createdPositions['Director general'] = generalDirector

      if (generalManagement) {
        const dp1 = new DepartmentPosition()
        dp1.departmentId = generalManagement.departmentId
        dp1.positionId = generalDirector.positionId
        dp1.departmentPositionLastSynchronizationAt = new Date()
        await dp1.save()
        createdRelations.push({ department: 'Dirección General', position: 'Director general' })
      }

      const managementAssistant = new Position()
      managementAssistant.positionCode = 'POS-ASD-001'
      managementAssistant.positionName = 'Asistente de dirección'
      managementAssistant.positionAlias = 'Asistente de dirección'
      managementAssistant.positionIsDefault = false
      managementAssistant.positionActive = 1
      managementAssistant.parentPositionId = generalDirector.positionId
      managementAssistant.companyId = 0
      managementAssistant.businessUnitId = businessUnitId
      managementAssistant.positionSyncId = 0
      managementAssistant.parentPositionSyncId = 0
      await managementAssistant.save()
      createdPositions['Asistente de dirección'] = managementAssistant

      if (generalManagement) {
        const dp2 = new DepartmentPosition()
        dp2.departmentId = generalManagement.departmentId
        dp2.positionId = managementAssistant.positionId
        dp2.departmentPositionLastSynchronizationAt = new Date()
        await dp2.save()
        createdRelations.push({ department: 'Dirección General', position: 'Asistente de dirección' })
      }

      // 2. Administration
      const administrativeManager = new Position()
      administrativeManager.positionCode = 'POS-GAD-001'
      administrativeManager.positionName = 'Gerente administrativo'
      administrativeManager.positionAlias = 'Gerente administrativo'
      administrativeManager.positionIsDefault = false
      administrativeManager.positionActive = 1
      administrativeManager.parentPositionId = null
      administrativeManager.companyId = 0
      administrativeManager.businessUnitId = businessUnitId
      administrativeManager.positionSyncId = 0
      administrativeManager.parentPositionSyncId = 0
      await administrativeManager.save()
      createdPositions['Gerente administrativo'] = administrativeManager

      if (administration) {
        const dp3 = new DepartmentPosition()
        dp3.departmentId = administration.departmentId
        dp3.positionId = administrativeManager.positionId
        dp3.departmentPositionLastSynchronizationAt = new Date()
        await dp3.save()
        createdRelations.push({ department: 'Administración', position: 'Gerente administrativo' })
      }

      // 3. Human Resources
      const hrManager = new Position()
      hrManager.positionCode = 'POS-GRH-001'
      hrManager.positionName = 'Gerente de recursos humanos'
      hrManager.positionAlias = 'Gerente de recursos humanos'
      hrManager.positionIsDefault = false
      hrManager.positionActive = 1
      hrManager.parentPositionId = null
      hrManager.companyId = 0
      hrManager.businessUnitId = businessUnitId
      hrManager.positionSyncId = 0
      hrManager.parentPositionSyncId = 0
      await hrManager.save()
      createdPositions['Gerente de recursos humanos'] = hrManager

      if (humanResources) {
        const dp4 = new DepartmentPosition()
        dp4.departmentId = humanResources.departmentId
        dp4.positionId = hrManager.positionId
        dp4.departmentPositionLastSynchronizationAt = new Date()
        await dp4.save()
        createdRelations.push({ department: 'Recursos Humanos', position: 'Gerente de recursos humanos' })
      }

      const recruiter = new Position()
      recruiter.positionCode = 'POS-REC-001'
      recruiter.positionName = 'Reclutador'
      recruiter.positionAlias = 'Reclutador'
      recruiter.positionIsDefault = false
      recruiter.positionActive = 1
      recruiter.parentPositionId = null
      recruiter.companyId = 0
      recruiter.businessUnitId = businessUnitId
      recruiter.positionSyncId = 0
      recruiter.parentPositionSyncId = 0
      await recruiter.save()
      createdPositions['Reclutador'] = recruiter

      if (humanResources) {
        const dp5 = new DepartmentPosition()
        dp5.departmentId = humanResources.departmentId
        dp5.positionId = recruiter.positionId
        dp5.departmentPositionLastSynchronizationAt = new Date()
        await dp5.save()
        createdRelations.push({ department: 'Recursos Humanos', position: 'Reclutador' })
      }

      const talentDeveloper = new Position()
      talentDeveloper.positionCode = 'POS-DTA-001'
      talentDeveloper.positionName = 'Desarrollador de talento'
      talentDeveloper.positionAlias = 'Desarrollador de talento'
      talentDeveloper.positionIsDefault = false
      talentDeveloper.positionActive = 1
      talentDeveloper.parentPositionId = null
      talentDeveloper.companyId = 0
      talentDeveloper.businessUnitId = businessUnitId
      talentDeveloper.positionSyncId = 0
      talentDeveloper.parentPositionSyncId = 0
      await talentDeveloper.save()
      createdPositions['Desarrollador de talento'] = talentDeveloper

      if (humanResources) {
        const dp6 = new DepartmentPosition()
        dp6.departmentId = humanResources.departmentId
        dp6.positionId = talentDeveloper.positionId
        dp6.departmentPositionLastSynchronizationAt = new Date()
        await dp6.save()
        createdRelations.push({ department: 'Recursos Humanos', position: 'Desarrollador de talento' })
      }

      // 4. Accounting
      const accountingManager = new Position()
      accountingManager.positionCode = 'POS-GCO-001'
      accountingManager.positionName = 'Gerente de contabilidad'
      accountingManager.positionAlias = 'Gerente de contabilidad'
      accountingManager.positionIsDefault = false
      accountingManager.positionActive = 1
      accountingManager.parentPositionId = null
      accountingManager.companyId = 0
      accountingManager.businessUnitId = businessUnitId
      accountingManager.positionSyncId = 0
      accountingManager.parentPositionSyncId = 0
      await accountingManager.save()
      createdPositions['Gerente de contabilidad'] = accountingManager

      if (accounting) {
        const dp7 = new DepartmentPosition()
        dp7.departmentId = accounting.departmentId
        dp7.positionId = accountingManager.positionId
        dp7.departmentPositionLastSynchronizationAt = new Date()
        await dp7.save()
        createdRelations.push({ department: 'Contabilidad', position: 'Gerente de contabilidad' })
      }

      const payrollManager = new Position()
      payrollManager.positionCode = 'POS-ENO-001'
      payrollManager.positionName = 'Encargado de nóminas'
      payrollManager.positionAlias = 'Encargado de nóminas'
      payrollManager.positionIsDefault = false
      payrollManager.positionActive = 1
      payrollManager.parentPositionId = null
      payrollManager.companyId = 0
      payrollManager.businessUnitId = businessUnitId
      payrollManager.positionSyncId = 0
      payrollManager.parentPositionSyncId = 0
      await payrollManager.save()
      createdPositions['Encargado de nóminas'] = payrollManager

      if (accounting) {
        const dp8 = new DepartmentPosition()
        dp8.departmentId = accounting.departmentId
        dp8.positionId = payrollManager.positionId
        dp8.departmentPositionLastSynchronizationAt = new Date()
        await dp8.save()
        createdRelations.push({ department: 'Contabilidad', position: 'Encargado de nóminas' })
      }

      const treasury = new Position()
      treasury.positionCode = 'POS-TES-001'
      treasury.positionName = 'Tesorería'
      treasury.positionAlias = 'Tesorería'
      treasury.positionIsDefault = false
      treasury.positionActive = 1
      treasury.parentPositionId = null
      treasury.companyId = 0
      treasury.businessUnitId = businessUnitId
      treasury.positionSyncId = 0
      treasury.parentPositionSyncId = 0
      await treasury.save()
      createdPositions['Tesorería'] = treasury

      if (accounting) {
        const dp9 = new DepartmentPosition()
        dp9.departmentId = accounting.departmentId
        dp9.positionId = treasury.positionId
        dp9.departmentPositionLastSynchronizationAt = new Date()
        await dp9.save()
        createdRelations.push({ department: 'Contabilidad', position: 'Tesorería' })
      }

      // 5. Operations
      const operationsDirector = new Position()
      operationsDirector.positionCode = 'POS-DOP-001'
      operationsDirector.positionName = 'Director de operaciones'
      operationsDirector.positionAlias = 'Director de operaciones'
      operationsDirector.positionIsDefault = false
      operationsDirector.positionActive = 1
      operationsDirector.parentPositionId = null
      operationsDirector.companyId = 0
      operationsDirector.businessUnitId = businessUnitId
      operationsDirector.positionSyncId = 0
      operationsDirector.parentPositionSyncId = 0
      await operationsDirector.save()
      createdPositions['Director de operaciones'] = operationsDirector

      if (operations) {
        const dp10 = new DepartmentPosition()
        dp10.departmentId = operations.departmentId
        dp10.positionId = operationsDirector.positionId
        dp10.departmentPositionLastSynchronizationAt = new Date()
        await dp10.save()
        createdRelations.push({ department: 'Operaciones', position: 'Director de operaciones' })
      }

      const operationsAssistant = new Position()
      operationsAssistant.positionCode = 'POS-AOP-001'
      operationsAssistant.positionName = 'Auxiliar operativo'
      operationsAssistant.positionAlias = 'Auxiliar operativo'
      operationsAssistant.positionIsDefault = false
      operationsAssistant.positionActive = 1
      operationsAssistant.parentPositionId = null
      operationsAssistant.companyId = 0
      operationsAssistant.businessUnitId = businessUnitId
      operationsAssistant.positionSyncId = 0
      operationsAssistant.parentPositionSyncId = 0
      await operationsAssistant.save()
      createdPositions['Auxiliar operativo'] = operationsAssistant

      if (operations) {
        const dp11 = new DepartmentPosition()
        dp11.departmentId = operations.departmentId
        dp11.positionId = operationsAssistant.positionId
        dp11.departmentPositionLastSynchronizationAt = new Date()
        await dp11.save()
        createdRelations.push({ department: 'Operaciones', position: 'Auxiliar operativo' })
      }

      // 6. Projects
      const projectsManager = new Position()
      projectsManager.positionCode = 'POS-GPR-001'
      projectsManager.positionName = 'Gerente de proyectos'
      projectsManager.positionAlias = 'Gerente de proyectos'
      projectsManager.positionIsDefault = false
      projectsManager.positionActive = 1
      projectsManager.parentPositionId = null
      projectsManager.companyId = 0
      projectsManager.businessUnitId = businessUnitId
      projectsManager.positionSyncId = 0
      projectsManager.parentPositionSyncId = 0
      await projectsManager.save()
      createdPositions['Gerente de proyectos'] = projectsManager

      if (projects) {
        const dp12 = new DepartmentPosition()
        dp12.departmentId = projects.departmentId
        dp12.positionId = projectsManager.positionId
        dp12.departmentPositionLastSynchronizationAt = new Date()
        await dp12.save()
        createdRelations.push({ department: 'Proyectos', position: 'Gerente de proyectos' })
      }

      const projectManager = new Position()
      projectManager.positionCode = 'POS-PMA-001'
      projectManager.positionName = 'Project Manager'
      projectManager.positionAlias = 'Project Manager'
      projectManager.positionIsDefault = false
      projectManager.positionActive = 1
      projectManager.parentPositionId = null
      projectManager.companyId = 0
      projectManager.businessUnitId = businessUnitId
      projectManager.positionSyncId = 0
      projectManager.parentPositionSyncId = 0
      await projectManager.save()
      createdPositions['Project Manager'] = projectManager

      if (projects) {
        const dp13 = new DepartmentPosition()
        dp13.departmentId = projects.departmentId
        dp13.positionId = projectManager.positionId
        dp13.departmentPositionLastSynchronizationAt = new Date()
        await dp13.save()
        createdRelations.push({ department: 'Proyectos', position: 'Project Manager' })
      }

      // 7. Design
      const graphicDesigner = new Position()
      graphicDesigner.positionCode = 'POS-DIG-001'
      graphicDesigner.positionName = 'Diseñador gráfico'
      graphicDesigner.positionAlias = 'Diseñador gráfico'
      graphicDesigner.positionIsDefault = false
      graphicDesigner.positionActive = 1
      graphicDesigner.parentPositionId = null
      graphicDesigner.companyId = 0
      graphicDesigner.businessUnitId = businessUnitId
      graphicDesigner.positionSyncId = 0
      graphicDesigner.parentPositionSyncId = 0
      await graphicDesigner.save()
      createdPositions['Diseñador gráfico'] = graphicDesigner

      if (design) {
        const dp14 = new DepartmentPosition()
        dp14.departmentId = design.departmentId
        dp14.positionId = graphicDesigner.positionId
        dp14.departmentPositionLastSynchronizationAt = new Date()
        await dp14.save()
        createdRelations.push({ department: 'Diseño', position: 'Diseñador gráfico' })
      }

      const uxDesigner = new Position()
      uxDesigner.positionCode = 'POS-DUX-001'
      uxDesigner.positionName = 'Diseñador UX'
      uxDesigner.positionAlias = 'Diseñador UX'
      uxDesigner.positionIsDefault = false
      uxDesigner.positionActive = 1
      uxDesigner.parentPositionId = null
      uxDesigner.companyId = 0
      uxDesigner.businessUnitId = businessUnitId
      uxDesigner.positionSyncId = 0
      uxDesigner.parentPositionSyncId = 0
      await uxDesigner.save()
      createdPositions['Diseñador UX'] = uxDesigner

      if (design) {
        const dp15 = new DepartmentPosition()
        dp15.departmentId = design.departmentId
        dp15.positionId = uxDesigner.positionId
        dp15.departmentPositionLastSynchronizationAt = new Date()
        await dp15.save()
        createdRelations.push({ department: 'Diseño', position: 'Diseñador UX' })
      }

      // 8. Prototypes
      const projectLeader = new Position()
      projectLeader.positionCode = 'POS-LPR-001'
      projectLeader.positionName = 'Líder de proyecto'
      projectLeader.positionAlias = 'Líder de proyecto'
      projectLeader.positionIsDefault = false
      projectLeader.positionActive = 1
      projectLeader.parentPositionId = null
      projectLeader.companyId = 0
      projectLeader.businessUnitId = businessUnitId
      projectLeader.positionSyncId = 0
      projectLeader.parentPositionSyncId = 0
      await projectLeader.save()
      createdPositions['Líder de proyecto'] = projectLeader

      if (prototypes) {
        const dp16 = new DepartmentPosition()
        dp16.departmentId = prototypes.departmentId
        dp16.positionId = projectLeader.positionId
        dp16.departmentPositionLastSynchronizationAt = new Date()
        await dp16.save()
        createdRelations.push({ department: 'Prototipos', position: 'Líder de proyecto' })
      }

      // 9. Distribution
      const distributionSupervisor = new Position()
      distributionSupervisor.positionCode = 'POS-SDI-001'
      distributionSupervisor.positionName = 'Supervisor de distribución'
      distributionSupervisor.positionAlias = 'Supervisor de distribución'
      distributionSupervisor.positionIsDefault = false
      distributionSupervisor.positionActive = 1
      distributionSupervisor.parentPositionId = null
      distributionSupervisor.companyId = 0
      distributionSupervisor.businessUnitId = businessUnitId
      distributionSupervisor.positionSyncId = 0
      distributionSupervisor.parentPositionSyncId = 0
      await distributionSupervisor.save()
      createdPositions['Supervisor de distribución'] = distributionSupervisor

      if (distribution) {
        const dp17 = new DepartmentPosition()
        dp17.departmentId = distribution.departmentId
        dp17.positionId = distributionSupervisor.positionId
        dp17.departmentPositionLastSynchronizationAt = new Date()
        await dp17.save()
        createdRelations.push({ department: 'Distribución', position: 'Supervisor de distribución' })
      }

      const logisticsSpecialist = new Position()
      logisticsSpecialist.positionCode = 'POS-ELO-001'
      logisticsSpecialist.positionName = 'Especialista de logística'
      logisticsSpecialist.positionAlias = 'Especialista de logística'
      logisticsSpecialist.positionIsDefault = false
      logisticsSpecialist.positionActive = 1
      logisticsSpecialist.parentPositionId = null
      logisticsSpecialist.companyId = 0
      logisticsSpecialist.businessUnitId = businessUnitId
      logisticsSpecialist.positionSyncId = 0
      logisticsSpecialist.parentPositionSyncId = 0
      await logisticsSpecialist.save()
      createdPositions['Especialista de logística'] = logisticsSpecialist

      if (distribution) {
        const dp18 = new DepartmentPosition()
        dp18.departmentId = distribution.departmentId
        dp18.positionId = logisticsSpecialist.positionId
        dp18.departmentPositionLastSynchronizationAt = new Date()
        await dp18.save()
        createdRelations.push({ department: 'Distribución', position: 'Especialista de logística' })
      }

      // 10. Production
      const productionSupervisor = new Position()
      productionSupervisor.positionCode = 'POS-SPR-001'
      productionSupervisor.positionName = 'Supervisor de producción'
      productionSupervisor.positionAlias = 'Supervisor de producción'
      productionSupervisor.positionIsDefault = false
      productionSupervisor.positionActive = 1
      productionSupervisor.parentPositionId = null
      productionSupervisor.companyId = 0
      productionSupervisor.businessUnitId = businessUnitId
      productionSupervisor.positionSyncId = 0
      productionSupervisor.parentPositionSyncId = 0
      await productionSupervisor.save()
      createdPositions['Supervisor de producción'] = productionSupervisor

      if (production) {
        const dp19 = new DepartmentPosition()
        dp19.departmentId = production.departmentId
        dp19.positionId = productionSupervisor.positionId
        dp19.departmentPositionLastSynchronizationAt = new Date()
        await dp19.save()
        createdRelations.push({ department: 'Producción', position: 'Supervisor de producción' })
      }

      const productionOperator = new Position()
      productionOperator.positionCode = 'POS-OPR-001'
      productionOperator.positionName = 'Operador de producción'
      productionOperator.positionAlias = 'Operador de producción'
      productionOperator.positionIsDefault = false
      productionOperator.positionActive = 1
      productionOperator.parentPositionId = null
      productionOperator.companyId = 0
      productionOperator.businessUnitId = businessUnitId
      productionOperator.positionSyncId = 0
      productionOperator.parentPositionSyncId = 0
      await productionOperator.save()
      createdPositions['Operador de producción'] = productionOperator

      if (production) {
        const dp20 = new DepartmentPosition()
        dp20.departmentId = production.departmentId
        dp20.positionId = productionOperator.positionId
        dp20.departmentPositionLastSynchronizationAt = new Date()
        await dp20.save()
        createdRelations.push({ department: 'Producción', position: 'Operador de producción' })
      }

      // 11. Marketing
      const marketingSupervisor = new Position()
      marketingSupervisor.positionCode = 'POS-SMA-001'
      marketingSupervisor.positionName = 'Supervisor de marketing'
      marketingSupervisor.positionAlias = 'Supervisor de marketing'
      marketingSupervisor.positionIsDefault = false
      marketingSupervisor.positionActive = 1
      marketingSupervisor.parentPositionId = null
      marketingSupervisor.companyId = 0
      marketingSupervisor.businessUnitId = businessUnitId
      marketingSupervisor.positionSyncId = 0
      marketingSupervisor.parentPositionSyncId = 0
      await marketingSupervisor.save()
      createdPositions['Supervisor de marketing'] = marketingSupervisor

      if (marketing) {
        const dp21 = new DepartmentPosition()
        dp21.departmentId = marketing.departmentId
        dp21.positionId = marketingSupervisor.positionId
        dp21.departmentPositionLastSynchronizationAt = new Date()
        await dp21.save()
        createdRelations.push({ department: 'Marketing', position: 'Supervisor de marketing' })
      }

      const contentManager = new Position()
      contentManager.positionCode = 'POS-CMA-001'
      contentManager.positionName = 'Content Manager'
      contentManager.positionAlias = 'Content Manager'
      contentManager.positionIsDefault = false
      contentManager.positionActive = 1
      contentManager.parentPositionId = null
      contentManager.companyId = 0
      contentManager.businessUnitId = businessUnitId
      contentManager.positionSyncId = 0
      contentManager.parentPositionSyncId = 0
      await contentManager.save()
      createdPositions['Content Manager'] = contentManager

      if (marketing) {
        const dp22 = new DepartmentPosition()
        dp22.departmentId = marketing.departmentId
        dp22.positionId = contentManager.positionId
        dp22.departmentPositionLastSynchronizationAt = new Date()
        await dp22.save()
        createdRelations.push({ department: 'Marketing', position: 'Content Manager' })
      }

      const prSpecialist = new Position()
      prSpecialist.positionCode = 'POS-ERP-001'
      prSpecialist.positionName = 'Especialista en Relaciones Públicas'
      prSpecialist.positionAlias = 'Especialista en Relaciones Públicas'
      prSpecialist.positionIsDefault = false
      prSpecialist.positionActive = 1
      prSpecialist.parentPositionId = null
      prSpecialist.companyId = 0
      prSpecialist.businessUnitId = businessUnitId
      prSpecialist.positionSyncId = 0
      prSpecialist.parentPositionSyncId = 0
      await prSpecialist.save()
      createdPositions['Especialista en Relaciones Públicas'] = prSpecialist

      if (marketing) {
        const dp23 = new DepartmentPosition()
        dp23.departmentId = marketing.departmentId
        dp23.positionId = prSpecialist.positionId
        dp23.departmentPositionLastSynchronizationAt = new Date()
        await dp23.save()
        createdRelations.push({ department: 'Marketing', position: 'Especialista en Relaciones Públicas' })
      }

      // 12. Market Research
      const marketAnalyst = new Position()
      marketAnalyst.positionCode = 'POS-AME-001'
      marketAnalyst.positionName = 'Analista de mercado'
      marketAnalyst.positionAlias = 'Analista de mercado'
      marketAnalyst.positionIsDefault = false
      marketAnalyst.positionActive = 1
      marketAnalyst.parentPositionId = null
      marketAnalyst.companyId = 0
      marketAnalyst.businessUnitId = businessUnitId
      marketAnalyst.positionSyncId = 0
      marketAnalyst.parentPositionSyncId = 0
      await marketAnalyst.save()
      createdPositions['Analista de mercado'] = marketAnalyst

      if (marketResearch) {
        const dp24 = new DepartmentPosition()
        dp24.departmentId = marketResearch.departmentId
        dp24.positionId = marketAnalyst.positionId
        dp24.departmentPositionLastSynchronizationAt = new Date()
        await dp24.save()
        createdRelations.push({ department: 'Investigación de Mercados', position: 'Analista de mercado' })
      }

      const withOutPosition = new Position()
      withOutPosition.positionId = 999
      withOutPosition.positionCode = 'POS-WOP-001'
      withOutPosition.positionName = 'Sin posición'
      withOutPosition.positionAlias = 'Sin posición'
      withOutPosition.positionIsDefault = false
      withOutPosition.positionActive = 1
      withOutPosition.parentPositionId = null
      withOutPosition.companyId = 0
      withOutPosition.businessUnitId = businessUnitId
      withOutPosition.positionSyncId = 0
      withOutPosition.parentPositionSyncId = 0
      await withOutPosition.save()
      createdPositions['Sin posición'] = withOutPosition
      
      const dp25 = new DepartmentPosition()
      dp25.departmentId = 999
      dp25.positionId = withOutPosition.positionId
      dp25.departmentPositionLastSynchronizationAt = new Date()
      await dp25.save()
      createdRelations.push({ department: 'Sin departamento', position: 'Sin posición' })
      

      // Preparar resumen
      const summary = Object.keys(createdPositions).map((key) => ({
        name: key,
        id: createdPositions[key].positionId,
        code: createdPositions[key].positionCode,
        parentId: createdPositions[key].parentPositionId,
      }))

      return {
        status: 201,
        type: 'success',
        title: 'Positions demo created',
        message: 'The positions demo structure was created successfully',
        data: {
          created: summary,
          total: Object.keys(createdPositions).length,
          relations: createdRelations,
        },
      }
    } catch (error: any) {
      console.error('Error al crear posiciones demo:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to create positions demo',
        message: 'An error occurred while trying to create the positions demo structure',
        error: error.message,
        data: null,
      }
    }
  }

  
}
