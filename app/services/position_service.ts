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
import DepartmentService from './department_service.js'
import PDFDocument from 'pdfkit'
import SystemSetting from '#models/system_setting'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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
    newPosition.positionDescription = position.positionDescription
    newPosition.positionGeneralObjective = position.positionGeneralObjective
    newPosition.positionSpecificRequirement = position.positionSpecificRequirement
    newPosition.positionEvaluationFrequency = position.positionEvaluationFrequency
    newPosition.positionEvaluationDurationDays = position.positionEvaluationDurationDays
    newPosition.positionEvaluationStartDay = position.positionEvaluationStartDay
    newPosition.positionIsDefault = position.positionIsDefault
    newPosition.positionActive = position.positionActive
    newPosition.parentPositionId = position.parentPositionId
    newPosition.businessUnitId = businessUnit?.businessUnitId || 0
    newPosition.positionProfileExpirationDate = position.positionProfileExpirationDate
    newPosition.positionMinStaff = position.positionMinStaff ?? null
    newPosition.positionIdealStaff = position.positionIdealStaff ?? null
    newPosition.positionMaxStaff = position.positionMaxStaff ?? null
    newPosition.positionMinActiveStaffPerShift = position.positionMinActiveStaffPerShift ?? null

    await newPosition.save()
    await newPosition.load('parentPosition')
    await newPosition.load('subPositions')

    return newPosition
  }

  async update(currentPosition: Position, position: Position) {
    currentPosition.positionCode = position.positionCode
    currentPosition.positionName = position.positionName
    currentPosition.positionAlias = position.positionAlias
    currentPosition.positionDescription = position.positionDescription
    currentPosition.positionGeneralObjective = position.positionGeneralObjective
    currentPosition.positionSpecificRequirement = position.positionSpecificRequirement
    currentPosition.positionEvaluationFrequency = position.positionEvaluationFrequency
    currentPosition.positionEvaluationDurationDays = position.positionEvaluationDurationDays
    currentPosition.positionEvaluationStartDay = position.positionEvaluationStartDay
    currentPosition.positionIsDefault = position.positionIsDefault
    currentPosition.positionActive = position.positionActive
    currentPosition.parentPositionId = position.parentPositionId
    currentPosition.companyId = position.companyId
    currentPosition.positionProfileExpirationDate = position.positionProfileExpirationDate
    if (position.positionMinStaff !== undefined) {
      currentPosition.positionMinStaff = position.positionMinStaff
    }
    if (position.positionIdealStaff !== undefined) {
      currentPosition.positionIdealStaff = position.positionIdealStaff
    }
    if (position.positionMaxStaff !== undefined) {
      currentPosition.positionMaxStaff = position.positionMaxStaff
    }
    if (position.positionMinActiveStaffPerShift !== undefined) {
      currentPosition.positionMinActiveStaffPerShift = position.positionMinActiveStaffPerShift
    }
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
   * Busca una posición por su nombre
   * @param positionName - Nombre de la posición a buscar
   * @returns Posición encontrada o null
   */
   async findPositionByName(positionName: string): Promise<Position | null> {
    const position = await Position.query()
      .where('position_alias', positionName)
      .whereNull('position_deleted_at')
      .first()
    return position || null
  }

  /**
   * Crea una posición con los datos proporcionados
   * @param positionData - Datos de la posición a crear
   * @param businessUnitId - ID de la unidad de negocio
   * @param parentPositionId - ID de la posición padre (opcional)
   * @returns Posición creada
   */
  private async createPosition(
    positionData: {
      code: string
      name: string
      alias: string
      positionId?: number
    },
    businessUnitId: number,
    parentPositionId: number | null = null
  ): Promise<Position> {
    const position = new Position()
    if (positionData.positionId) {
      position.positionId = positionData.positionId
    }
    position.positionCode = positionData.code
    position.positionName = positionData.name
    position.positionAlias = positionData.alias
    position.positionIsDefault = false
    position.positionActive = 1
    position.parentPositionId = parentPositionId
    position.companyId = 0
    position.businessUnitId = businessUnitId
    position.positionSyncId = 0
    position.parentPositionSyncId = 0
    await position.save()
    return position
  }

  /**
   * Relaciona una posición con un departamento
   * @param positionId - ID de la posición
   * @param departmentId - ID del departamento
   * @returns Relación creada
   */
  private async createDepartmentPositionRelation(
    positionId: number,
    departmentId: number
  ): Promise<DepartmentPosition> {
    const departmentPosition = new DepartmentPosition()
    departmentPosition.departmentId = departmentId
    departmentPosition.positionId = positionId
    departmentPosition.departmentPositionLastSynchronizationAt = new Date()
    await departmentPosition.save()
    return departmentPosition
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
      const departmentsMap: { [key: string]: Department | null } = {}
      const departmentNames = [
        'Dirección General',
        'Administración',
        'Recursos Humanos',
        'Contabilidad',
        'Operaciones',
        'Proyectos',
        'Diseño',
        'Prototipos',
        'Distribución',
        'Producción',
        'Marketing',
        'Investigación de Mercados',
      ]
      const departmentService = new DepartmentService(this.i18n)
      for await(const deptName of departmentNames) {
        departmentsMap[deptName] = await departmentService.findDepartmentByName(deptName)
      }

      // Special case for "Sin Departamento" (ID 999)
      const withoutDepartment = await Department.query()
        .where('department_id', 999)
        .whereNull('department_deleted_at')
        .first()
      departmentsMap['Sin Departamento'] = withoutDepartment || null

      // Array de posiciones a crear (ordenadas para que los padres se creen antes que los hijos)
      const positionsData = [
        {
          key: 'Director general',
          code: 'POS-DIR-001',
          name: '(P101) Director general',
          alias: 'Director general',
          parentKey: null,
          departmentName: 'Dirección General',
          positionId: undefined,
        },
        {
          key: 'Asistente de dirección',
          code: 'POS-ASD-001',
          name: '(P101) Asistente de dirección',
          alias: 'Asistente de dirección',
          parentKey: 'Director general',
          departmentName: 'Dirección General',
          positionId: undefined,
        },
        {
          key: 'Gerente administrativo',
          code: 'POS-GAD-001',
          name: '(P101) Gerente administrativo',
          alias: 'Gerente administrativo',
          parentKey: null,
          departmentName: 'Administración',
          positionId: undefined,
        },
        {   
          key: 'Gerente de recursos humanos',
          code: 'POS-GRH-001',
          name: '(P101) Gerente de recursos humanos',
          alias: 'Gerente de recursos humanos',
          parentKey: null,
          departmentName: 'Recursos Humanos',
          positionId: undefined,
        },
        {
          key: 'Reclutador',
          code: 'POS-REC-001',
          name: '(P101) Reclutador',
          alias: 'Reclutador',
          parentKey: null,
          departmentName: 'Recursos Humanos',
          positionId: undefined,
        },
        {
          key: 'Desarrollador de talento',
          code: 'POS-DTA-001',
          name: '(P101) Desarrollador de talento',
          alias: 'Desarrollador de talento',
          parentKey: null,
          departmentName: 'Recursos Humanos',
          positionId: undefined,
        },
        {
          key: 'Gerente de contabilidad',
          code: 'POS-GCO-001',
          name: '(P101) Gerente de contabilidad',
          alias: 'Gerente de contabilidad',
          parentKey: null,
          departmentName: 'Contabilidad',
          positionId: undefined,
        },
        {
          key: 'Encargado de nóminas',
          code: 'POS-ENO-001',
          name: '(P101) Encargado de nóminas',
          alias: 'Encargado de nóminas',
          parentKey: null,
          departmentName: 'Contabilidad',
          positionId: undefined,
        },
        {
          key: 'Tesorería',
          code: 'POS-TES-001',
          name: '(P101) Tesorería',
          alias: 'Tesorería',
          parentKey: null,
          departmentName: 'Contabilidad',
          positionId: undefined,
        },
        {
          key: 'Director de operaciones',
          code: 'POS-DOP-001',
          name: '(P101) Director de operaciones',
          alias: 'Director de operaciones',
          parentKey: null,
          departmentName: 'Operaciones',
          positionId: undefined,
        },
        {
          key: 'Auxiliar operativo',
          code: 'POS-AOP-001',
          name: '(P101) Auxiliar operativo',
          alias: 'Auxiliar operativo',
          parentKey: null,
          departmentName: 'Operaciones',
          positionId: undefined,
        },
        {
          key: 'Gerente de proyectos',
          code: 'POS-GPR-001',
          name: '(P101) Gerente de proyectos',
          alias: 'Gerente de proyectos',
          parentKey: null,
          departmentName: 'Proyectos',
          positionId: undefined,
        },
        {
          key: 'Project Manager',
          code: 'POS-PMA-001',
          name: '(P101) Project Manager',
          alias: 'Project Manager',
          parentKey: null,
          departmentName: 'Proyectos',
          positionId: undefined,
        },
        {
          key: 'Diseñador gráfico',
          code: 'POS-DIG-001',
          name: '(P101) Diseñador gráfico',
          alias: 'Diseñador gráfico',
          parentKey: null,
          departmentName: 'Diseño',
          positionId: undefined,
        },
        {
          key: 'Diseñador UX',
          code: 'POS-DUX-001',
          name: '(P101) Diseñador UX',
          alias: 'Diseñador UX',
          parentKey: null,
          departmentName: 'Diseño',
          positionId: undefined,
        },
        {
          key: 'Líder de proyecto',
          code: 'POS-LPR-001',
          name: '(P101) Líder de proyecto',
          alias: 'Líder de proyecto',
          parentKey: null,
          departmentName: 'Prototipos',
          positionId: undefined,
        },
        {
          key: 'Supervisor de distribución',
          code: 'POS-SDI-001',
          name: '(P101) Supervisor de distribución',
          alias: 'Supervisor de distribución',
          parentKey: null,
          departmentName: 'Distribución',
          positionId: undefined,
        },
        {
          key: 'Especialista de logística',
          code: 'POS-ELO-001',
          name: '(P101) Especialista de logística',
          alias: 'Especialista de logística',
          parentKey: null,
          departmentName: 'Distribución',
          positionId: undefined,
        },
        {
          key: 'Supervisor de producción',
          code: 'POS-SPR-001',
          name: '(P101) Supervisor de producción',
          alias: 'Supervisor de producción',
          parentKey: null,
          departmentName: 'Producción',
          positionId: undefined,
        },
        {
          key: 'Operador de producción',
          code: 'POS-OPR-001',
          name: '(P101) Operador de producción',
          alias: 'Operador de producción',
          parentKey: null,
          departmentName: 'Producción',
          positionId: undefined,
        },
        {
          key: 'Supervisor de marketing',
          code: 'POS-SMA-001',
          name: '(P101) Supervisor de marketing',
          alias: 'Supervisor de marketing',
          parentKey: null,
          departmentName: 'Marketing',
          positionId: undefined,
        },
        {
          key: 'Content Manager',
          code: 'POS-CMA-001',
          name: '(P101) Content Manager',
          alias: 'Content Manager',
          parentKey: null,
          departmentName: 'Marketing',
          positionId: undefined,
        },
        {
          key: 'Especialista en Relaciones Públicas',
          code: 'POS-ERP-001',
          name: '(P101) Especialista en Relaciones Públicas',
          alias: 'Especialista en Relaciones Públicas',
          parentKey: null,
          departmentName: 'Marketing',
          positionId: undefined,
        },
        {
          key: 'Analista de mercado',
          code: 'POS-AME-001',
          name: '(P101) Analista de mercado',
          alias: 'Analista de mercado',
          parentKey: null,
          departmentName: 'Investigación de Mercados',
          positionId: undefined,
        },
        {
          key: 'Sin posición',
          code: 'POS-WOP-001',
          name: '(P101) Sin posición',
          alias: 'Sin posición',
          parentKey: null,
          departmentName: 'Sin Departamento',
          positionId: 999,
        },
      ]

      // Crear todas las posiciones
      for await (const posData of positionsData) {
        const parentPositionId = posData.parentKey
          ? createdPositions[posData.parentKey]?.positionId || null
          : null

        const position = await this.createPosition(
          {
            code: posData.code,
            name: posData.name,
            alias: posData.alias,
            positionId: posData.positionId,
          },
          businessUnitId,
          parentPositionId
        )

        createdPositions[posData.key] = position

        // Relacionar posición con departamento
        const department = departmentsMap[posData.departmentName]
        if (department) {
          await this.createDepartmentPositionRelation(position.positionId, department.departmentId)
          createdRelations.push({ department: posData.departmentName, position: posData.name })
        } else if (posData.departmentName === 'Sin Departamento' && posData.positionId === 999) {
          // Caso especial para "Sin posición" con departamento ID 999
          await this.createDepartmentPositionRelation(position.positionId, 999)
          createdRelations.push({ department: 'Sin departamento', position: posData.name })
        }
      }
      

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


  async getPdf(positionId: number): Promise<Buffer | null> {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
    const businessUnitsList = businessUnits.map((b) => b.businessUnitId)

    const position = await Position.query()
      .whereIn('businessUnitId', businessUnitsList)
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .preload('specificFunctions', (q) => q.whereNull('position_specific_function_deleted_at'))
      .preload('kpis', (q) => q.whereNull('position_kpi_deleted_at'))
      .preload('competencies', (q) => {
        q.whereNull('position_competency_deleted_at').preload('weight')
      })
      .preload('psychometricProfiles', (q) => {
        q.preload('psychometricTestDimension', (dq) => {
          dq.preload('psychometricTest')
        })
      })
      .first()

    if (!position) return null

    // Obtener logo desde SystemSetting
    const systemSetting = await SystemSetting.query().whereNull('system_setting_deleted_at').first()
    let logoBuffer: Buffer | null = null
    if (systemSetting?.systemSettingLogo) {
      try {
        const res = await axios.get(systemSetting.systemSettingLogo, {
          responseType: 'arraybuffer',
          timeout: 8000,
        })
        logoBuffer = Buffer.from(res.data)
      } catch {
        logoBuffer = null
      }
    }

    const DIRNAME = dirname(fileURLToPath(import.meta.url))
    const fontsDir = join(DIRNAME, '..', '..', 'resources', 'fonts')

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 40,
        info: {
          Title: 'Descripcion y Perfil de Puesto',
          Creator: 'SAE API',
          Producer: 'PDFKit',
        },
      })

      doc.registerFont('Regular', join(fontsDir, 'Roboto-Regular.ttf'))
      doc.registerFont('Bold', join(fontsDir, 'Roboto-Bold.ttf'))
      doc.registerFont('Italic', join(fontsDir, 'Roboto-Italic.ttf'))
      doc.registerFont('BoldItalic', join(fontsDir, 'Roboto-BoldItalic.ttf'))
      doc.font('Regular')
      const chunks: Uint8Array[] = []
      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk))
      doc.on('end', () => {
        const total = chunks.reduce((acc, c) => acc + c.length, 0)
        const merged = new Uint8Array(total)
        let offset = 0
        for (const c of chunks) {
          merged.set(c, offset)
          offset += c.length
        }
        resolve(Buffer.from(merged.buffer))
      })
      doc.on('error', reject)

      const navy = '#2E5FA3'
      const white = '#FFFFFF'
      const lightGray = '#F5F5F5'
      const black = '#000000'
      const pageW = doc.page.width - 80

      const t = (key: string) => this.i18n.t(key)

      const decodeEntities = (s: string) =>
        s
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')

      // Elimina emojis y caracteres fuera del plano BMP que Roboto no soporta
      const stripEmojis = (s: string): string =>
        s.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{1F300}-\u{1FBFF}]/gu, '')

      const INDENT_PX = 18

      type HtmlSpan = { text: string; bold: boolean; italic: boolean; underline: boolean }
      type HtmlBlock = { spans: HtmlSpan[]; indent: number; bulletText: string | null }

      const parseHtml = (html: string): HtmlBlock[] => {
        const blocks: HtmlBlock[] = []
        let bold = false
        let italic = false
        let underline = false
        let listDepth = 0
        // Stack de tipos de lista para distinguir <ul> de <ol>
        const listTypes: ('ul' | 'ol')[] = []
        // Contadores de <ol> por nivel de indentación
        const olCounters = new Map<number, number>()
        let cur: HtmlBlock = { spans: [], indent: 0, bulletText: null }

        const flush = () => {
          const spans = cur.spans.filter((s) => s.text.trim())
          if (spans.length || cur.bulletText) blocks.push({ ...cur, spans })
          cur = { spans: [], indent: Math.max(0, listDepth - 1), bulletText: null }
        }

        const addText = (raw: string) => {
          const text = stripEmojis(decodeEntities(raw)).replace(/[ \t]+/g, ' ')
          if (text.trim()) cur.spans.push({ text, bold, italic, underline })
        }

        const re = /<(\/?)(\w+)([^>]*)>|([^<]+)/g
        let m: RegExpExecArray | null
        while ((m = re.exec(html)) !== null) {
          const [, closing, tag, attrs, textNode] = m
          const tl = (tag || '').toLowerCase()
          const close = closing === '/'

          if (textNode !== undefined) {
            textNode.split('\n').forEach((line, i) => {
              if (i > 0 && cur.spans.length) flush()
              addText(line)
            })
          } else {
            switch (tl) {
              case 'b': case 'strong': bold = !close; break
              case 'i': case 'em':    italic = !close; break
              case 'u': case 'a':     underline = !close; break
              case 'br':              flush(); break
              case 'p': case 'div':
              case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
                if (close) {
                  flush()
                } else {
                  if (cur.spans.length) flush()
                  const qlIndent = (attrs || '').match(/ql-indent-(\d+)/)
                  if (qlIndent) cur.indent = Number.parseInt(qlIndent[1])
                }
                break
              case 'ul': case 'ol':
                if (!close) {
                  listDepth++
                  listTypes.push(tl as 'ul' | 'ol')
                  if (tl === 'ol') olCounters.clear()
                } else {
                  flush()
                  listDepth = Math.max(0, listDepth - 1)
                  listTypes.pop()
                }
                break
              case 'li':
                if (!close) {
                  flush()
                  const qlMatch = (attrs || '').match(/ql-indent-(\d+)/)
                  // Sin clase: 1 nivel de sangría base. Con ql-indent-N: N+1 para mantener jerarquía
                  const indentLevel = qlMatch ? Number.parseInt(qlMatch[1]) + 1 : listDepth
                  cur.indent = indentLevel
                  const currentListType = listTypes.length > 0 ? listTypes[listTypes.length - 1] : 'ul'
                  if (currentListType === 'ol') {
                    const n = (olCounters.get(indentLevel) || 0) + 1
                    olCounters.set(indentLevel, n)
                    cur.bulletText = `${n}.`
                  } else {
                    cur.bulletText = '•'
                  }
                } else { flush() }
                break
            }
          }
        }
        flush()
        return blocks
      }

      const htmlHeight = (html: string, width: number, fs: number = 9): number => {
        const blocks = parseHtml(html)
        if (!blocks.length) return 20
        doc.fontSize(fs).font('Regular')
        let h = 0
        for (const block of blocks) {
          const iw = width - block.indent * INDENT_PX
          const prefix = block.bulletText ? block.bulletText + ' ' : ''
          const plain = prefix + block.spans.map((s) => s.text).join('')
          h += doc.heightOfString(plain.trim() || ' ', { width: iw })
        }
        return h
      }

      const renderHtml = (html: string, x: number, y: number, width: number, fs: number = 9): void => {
        const blocks = parseHtml(html)
        doc.y = y

        for (const block of blocks) {
          const ix = x + block.indent * INDENT_PX
          const iw = width - block.indent * INDENT_PX
          if (!block.spans.length) continue

          block.spans.forEach((span, i) => {
            const isLast = i === block.spans.length - 1
            const font =
              span.bold && span.italic ? 'BoldItalic'
              : span.bold ? 'Bold'
              : span.italic ? 'Italic'
              : 'Regular'
            const opts: PDFKit.Mixins.TextOptions = {
              width: iw,
              continued: !isLast,
              lineBreak: true,
              underline: span.underline,
            }
            if (i === 0) {
              const prefix = block.bulletText ? block.bulletText + ' ' : ''
              doc.font(font).fontSize(fs).fillColor(black)
                .text(prefix + span.text, ix, doc.y, opts)
            } else {
              doc.font(font).fontSize(fs).fillColor(black)
                .text(span.text, opts)
            }
          })
        }
      }

      const today = new Date().toLocaleDateString('es-MX')

      // ── Constantes de layout ──────────────────────────────────────────────
      const logoColW = 120
      const rightColX = 40 + logoColW
      const rightColW = pageW - logoColW
      const titleRowH = 22
      const metaRowH = 16
      const hHeight = titleRowH + metaRowH * 3
      const leftSubW = Math.round(rightColW * 0.62)
      const rightSubX = rightColX + leftSubW
      const rightSubW = rightColW - leftSubW
      const pagColW = 68
      const motivoColW = rightColW - pagColW
      const pagColX = rightColX + motivoColW
      const half = pageW / 2

      const implDate = position.positionCreatedAt
        ? position.positionCreatedAt.setLocale('es-MX').toFormat('d \'de\' MMMM \'del\' yyyy')
        : today

      let currentPage = 1
      const pageBottomLimit = doc.page.height - 60

      // Fuerza salto de página si no hay suficiente espacio
      const ensureSpace = (needed: number) => {
        if (doc.y + needed > pageBottomLimit) {
          doc.addPage()
        }
      }

      // ── Función: encabezado de página ─────────────────────────────────────
      const drawPageHeader = (pageNum: number) => {
        const hTop = 40
        const row2Y = hTop + titleRowH
        const row3Y = row2Y + metaRowH
        const row4Y = row3Y + metaRowH
        const hBot = hTop + hHeight

        doc.rect(40, hTop, pageW, hHeight).stroke()
        doc.moveTo(rightColX, hTop).lineTo(rightColX, hBot).stroke()
        doc.moveTo(rightColX, row2Y).lineTo(40 + pageW, row2Y).stroke()
        doc.moveTo(rightColX, row3Y).lineTo(40 + pageW, row3Y).stroke()
        doc.moveTo(rightColX, row4Y).lineTo(40 + pageW, row4Y).stroke()
        doc.moveTo(rightSubX, row2Y).lineTo(rightSubX, row4Y).stroke()
        doc.moveTo(pagColX, row4Y).lineTo(pagColX, hBot).stroke()

        if (logoBuffer) {
          try {
            doc.image(logoBuffer, 44, hTop + 4, {
              fit: [logoColW - 8, hHeight - 8],
              align: 'center',
              valign: 'center',
            })
          } catch { /* sin logo */ }
        }

        doc
          .fontSize(10).font('Bold').fillColor(black)
          .text(t('pdf_title'), rightColX + 4, hTop + 6, { width: rightColW - 8, align: 'center' })

        doc
          .fontSize(7).font('Regular').fillColor(black)
          .text(`${t('pdf_implementation_date')}: ${implDate}`, rightColX + 4, row2Y + 4, { width: leftSubW - 8, lineBreak: false })
          .text(`${t('pdf_revision')}: 01`, rightSubX + 4, row2Y + 4, { width: rightSubW - 8, lineBreak: false })
          .text(`${t('pdf_control_key')}: ${position.positionCode ?? ''}`, rightColX + 4, row3Y + 4, { width: leftSubW - 8, lineBreak: false })
          .text(`${t('pdf_replaces_revision')}: 00`, rightSubX + 4, row3Y + 4, { width: rightSubW - 8, lineBreak: false })
          .text(`${t('pdf_reason_for_change')}:`, rightColX + 4, row4Y + 4, { width: motivoColW - 8, lineBreak: false })
          .text(`${t('pdf_page')} ${pageNum}`, pagColX + 4, row4Y + 4, { width: pagColW - 8, align: 'center', lineBreak: false })

        doc.y = hBot
      }

      // ── Función: secciones de contenido ───────────────────────────────────
      const drawSectionHeader = (label: string, bgColor: string = navy) => {
        ensureSpace(40)
        const sY = doc.y
        doc.rect(40, sY, pageW, 18).fillAndStroke(bgColor, black)
        doc
          .fontSize(9)
          .fillColor(white)
          .font('Bold')
          .text(label, 40, sY + 4, { width: pageW, align: 'center', lineBreak: false })
        doc.y = sY + 18
        doc.fillColor(black).font('Regular')
      }

      const drawSubSectionHeader = (label: string) => {
        ensureSpace(30)
        const sY = doc.y
        doc.rect(40, sY, pageW, 16).fillAndStroke('#2E5FA3', black)
        doc
          .fontSize(9)
          .fillColor(white)
          .font('Bold')
          .text(label, 45, sY + 4, { width: pageW - 10, align: 'center', lineBreak: false })
        doc.y = sY + 16
        doc.fillColor(black).font('Regular')
      }

      // ── Registrar encabezado en páginas nuevas ────────────────────────────
      doc.on('pageAdded', () => {
        currentPage++
        drawPageHeader(currentPage)
      })

      // ── Página 1: encabezado completo ─────────────────────────────────────
      drawPageHeader(1)

      // ── F. Emisión / F. Revisión + Dirección / Área-Cuenta ───────────────
      const rowH2 = 20
      const emisionY = doc.y

      // Un solo rect que engloba ambas filas
      doc.rect(40, emisionY, pageW, rowH2 * 2).stroke()

      // Fila 1 - Izquierda: F. Emisión
      const emLabel = `${t('pdf_emission_date')}:`
      const emL1 = 44 + doc.widthOfString(emLabel) + 6
      const emL2 = 40 + half - 10
      doc.fontSize(8).font('Regular').fillColor(black)
        .text(emLabel, 44, emisionY + 5, { lineBreak: false })
        .text(today, emL1, emisionY + 5, { width: emL2 - emL1, align: 'center', lineBreak: false })
      doc.moveTo(emL1, emisionY + 15).lineTo(emL2, emisionY + 15).strokeColor(black).stroke()

      // Fila 1 - Derecha: F. Revisión
      const revLabel = `${t('pdf_review_date')}:`
      const revL1 = 44 + half + doc.widthOfString(revLabel) + 6
      const revL2 = 40 + pageW - 10
      doc.fontSize(8).font('Regular').fillColor(black)
        .text(revLabel, 44 + half, emisionY + 5, { lineBreak: false })
        .text(today, revL1, emisionY + 5, { width: revL2 - revL1, align: 'center', lineBreak: false })
      doc.moveTo(revL1, emisionY + 15).lineTo(revL2, emisionY + 15).strokeColor(black).stroke()

      // Fila 2 - Izquierda: Dirección
      const dirY = emisionY + rowH2
      const dirLabel = `${t('pdf_direction')}:`
      const dirL1 = 44 + doc.widthOfString(dirLabel) + 6
      const dirL2 = 40 + half - 10
      doc.fontSize(8).font('Regular').fillColor(black)
        .text(dirLabel, 44, dirY + 5, { lineBreak: false })
        .text('Recursos Humanos', dirL1, dirY + 5, { width: dirL2 - dirL1, align: 'center', lineBreak: false })
      doc.moveTo(dirL1, dirY + 15).lineTo(dirL2, dirY + 15).strokeColor(black).stroke()

      // Fila 2 - Derecha: Área /Cuenta
      const areaLabel = `${t('pdf_area_account')}:`
      const areaL1 = 44 + half + doc.widthOfString(areaLabel) + 6
      const areaL2 = 40 + pageW - 10
      doc.fontSize(8).font('Regular').fillColor(black)
        .text(areaLabel, 44 + half, dirY + 5, { lineBreak: false })
        .text('Recursos Humanos', areaL1, dirY + 5, { width: areaL2 - areaL1, align: 'center', lineBreak: false })
      doc.moveTo(areaL1, dirY + 15).lineTo(areaL2, dirY + 15).strokeColor(black).stroke()

      doc.y = emisionY + rowH2 * 2

      // ── PUESTO CLAVE ──────────────────────────────────────────────────────
      const puestoClaveY = doc.y
      doc.rect(40, puestoClaveY, pageW, rowH2).stroke()
      doc.fontSize(8).font('Italic').fillColor(black)
        .text(t('pdf_key_position'), 40, puestoClaveY + 5, { width: pageW - 8, align: 'right', lineBreak: false })
      doc.y = puestoClaveY + rowH2

      // ── Nombre del puesto ─────────────────────────────────────────────────
      const nameText = (position.positionName ?? '').toUpperCase()
      const nameH = doc.heightOfString(nameText, { width: pageW - 16 }) + 14
      const nameY = doc.y
      doc.rect(40, nameY, pageW, nameH).stroke()
      doc
        .fontSize(13)
        .font('Bold')
        .fillColor(black)
        .text(nameText, 40, nameY + 7, { width: pageW, align: 'center' })
      doc.y = nameY + nameH
      doc.font('Regular')

      // ── Objetivo general ──────────────────────────────────────────────────
      drawSectionHeader(t('pdf_general_objective'))
      const rawObj = position.positionGeneralObjective ?? t('pdf_no_objective')
      const objH = htmlHeight(rawObj, pageW - 16) + 12
      const objY = doc.y
      doc.rect(40, objY, pageW, objH).stroke()
      renderHtml(rawObj, 45, objY + 6, pageW - 16)
      doc.y = objY + objH

      // ── Objetivos específicos / Funciones ─────────────────────────────────
      drawSectionHeader(t('pdf_specific_objectives'))
      if (position.specificFunctions?.length) {
        for (const fn of position.specificFunctions) {
          const rawFn = fn.positionSpecificFunctionName
          const fnH = htmlHeight(rawFn, pageW - 16) + 10
          ensureSpace(fnH)
          const fnY = doc.y
          doc.rect(40, fnY, pageW, fnH).stroke()
          renderHtml(rawFn, 45, fnY + 5, pageW - 16)
          doc.y = fnY + fnH
        }
      } else {
        const fnY = doc.y
        doc.rect(40, fnY, pageW, 20).stroke()
        doc.fontSize(9).text(t('pdf_no_functions'), 45, fnY + 5, { width: pageW - 16 })
        doc.y = fnY + 20
      }

      // ── KPIs ──────────────────────────────────────────────────────────────
      drawSectionHeader(t('pdf_kpis'))
      if (position.kpis?.length) {
        const kpiCol1 = pageW * 0.55
        const kpiCol2 = pageW * 0.25
        const kpiCol3 = pageW * 0.2

        // Encabezado de tabla KPIs
        const kpiHeadY = doc.y
        doc.rect(40, kpiHeadY, kpiCol1, 14).fillAndStroke(lightGray, black)
        doc.rect(40 + kpiCol1, kpiHeadY, kpiCol2, 14).fillAndStroke(lightGray, black)
        doc.rect(40 + kpiCol1 + kpiCol2, kpiHeadY, kpiCol3, 14).fillAndStroke(lightGray, black)
        doc
          .font('Bold')
          .fontSize(9)
          .fillColor(black)
          .text(t('pdf_indicator'), 45, kpiHeadY + 3, { width: kpiCol1 - 10, lineBreak: false })
          .text(t('pdf_meta_ideal'), 45 + kpiCol1, kpiHeadY + 3, { width: kpiCol2 - 5, lineBreak: false })
          .text(t('pdf_frequency'), 45 + kpiCol1 + kpiCol2, kpiHeadY + 3, { width: kpiCol3 - 5, lineBreak: false })
        doc.y = kpiHeadY + 14

        for (const kpi of position.kpis) {
          ensureSpace(14)
          const rowY = doc.y
          doc.rect(40, rowY, kpiCol1, 14).stroke()
          doc.rect(40 + kpiCol1, rowY, kpiCol2, 14).stroke()
          doc.rect(40 + kpiCol1 + kpiCol2, rowY, kpiCol3, 14).stroke()
          doc
            .font('Regular')
            .fontSize(8)
            .fillColor(black)
            .text(kpi.positionKpiName, 45, rowY + 3, { width: kpiCol1 - 10, lineBreak: false })
            .text(String(kpi.positionKpiIdeal ?? ''), 45 + kpiCol1, rowY + 3, { width: kpiCol2 - 5, lineBreak: false })
            .text(kpi.positionKpiFrequency ?? '', 45 + kpiCol1 + kpiCol2, rowY + 3, { width: kpiCol3 - 5, lineBreak: false })
          doc.y = rowY + 14
        }
      } else {
        const kpiY = doc.y
        doc.rect(40, kpiY, pageW, 20).stroke()
        doc.fontSize(9).fillColor(black).text(t('pdf_no_kpis'), 45, kpiY + 5, { width: pageW - 16 })
        doc.y = kpiY + 20
      }

      // ── PERFIL DEL PUESTO ─────────────────────────────────────────────────
      drawSectionHeader(t('pdf_position_profile'))

      const perfilRowH = 30
      const perfilY = doc.y
      const perfilCols = [pageW * 0.25, pageW * 0.25, pageW * 0.25, pageW * 0.25]
      const perfilLabels = [t('pdf_schooling'), t('pdf_age'), t('pdf_languages'), t('pdf_computing')]

      // Encabezados / etiquetas
      let px = 40
      for (let i = 0; i < 4; i++) {
        doc.rect(px, perfilY, perfilCols[i], perfilRowH).stroke()
        doc.fontSize(7).font('Bold').fillColor(black)
          .text(perfilLabels[i], px + 4, perfilY + 4, { width: perfilCols[i] - 8, lineBreak: false })
        px += perfilCols[i]
      }

      // Valores (tomados de positionSpecificRequirement como texto libre o vacíos)
      // const reqText = position.positionSpecificRequirement ?? ''
      // px = 40
      // const perfilValues = [reqText, '', '', '']
      // for (let i = 0; i < 4; i++) {
      //   doc.fontSize(8).font('Regular').fillColor(black)
      //     .text(perfilValues[i], px + 4, perfilY + 15, { width: perfilCols[i] - 8, lineBreak: false })
      //   px += perfilCols[i]
      // }

      doc.y = perfilY + perfilRowH

      // ── PERFIL PSICOMÉTRICO ───────────────────────────────────────────────
      drawSectionHeader(t('pdf_psychometric_profile'))

      const profiles = position.psychometricProfiles ?? []

      if (!profiles.length) {
        const emptyY = doc.y
        doc.rect(40, emptyY, pageW, 20).stroke()
        doc.fontSize(9).font('Regular').fillColor(black)
          .text(t('pdf_no_psychometric'), 45, emptyY + 5, { width: pageW - 16, lineBreak: false })
        doc.y = emptyY + 20
      } else {
        // Agrupar por prueba (test)
        const testMap = new Map<string, { label: string; min: number; max: number }[]>()
        for (const profile of profiles) {
          const dim = profile.psychometricTestDimension
          const testName = (dim as any)?.psychometricTest?.psychometricTestName
            ?? (dim as any)?.$extras?.psychometric_test_name
            ?? 'Sin prueba'
          const dimLabel = (dim as any)?.psychometricTestDimensionName ?? ''
          if (!testMap.has(testName)) testMap.set(testName, [])
          testMap.get(testName)!.push({
            label: dimLabel,
            min: profile.positionPsychometricProfileMinimumValue,
            max: profile.positionPsychometricProfileMaximumValue,
          })
        }

        const tests = Array.from(testMap.entries())
        const testColW = pageW / tests.length

        // Encabezados de prueba
        const testHeadY = doc.y
        tests.forEach(([testName], idx) => {
          const tx = 40 + idx * testColW
          doc.rect(tx, testHeadY, testColW, 14).fillAndStroke(lightGray, black)
          doc.fontSize(9).font('Bold').fillColor(black)
            .text(testName.toUpperCase(), tx + 4, testHeadY + 3, { width: testColW - 8, align: 'center', lineBreak: false })
        })
        doc.y = testHeadY + 14

        // Filas de dimensiones
        const maxRows = Math.max(...tests.map(([, dims]) => dims.length))
        for (let r = 0; r < maxRows; r++) {
          ensureSpace(14)
          const rowY = doc.y
          tests.forEach(([, dims], idx) => {
            const tx = 40 + idx * testColW
            const dim = dims[r]
            const dimLabelW = testColW * 0.55
            const dimValW = testColW * 0.45

            doc.rect(tx, rowY, dimLabelW, 14).stroke()
            doc.rect(tx + dimLabelW, rowY, dimValW, 14).stroke()

            if (dim) {
              doc.fontSize(8).font('Regular').fillColor(black)
                .text(dim.label, tx + 4, rowY + 3, { width: dimLabelW - 8, lineBreak: false })
                .text(`${dim.min} - ${dim.max}`, tx + dimLabelW + 4, rowY + 3, { width: dimValW - 8, lineBreak: false })
            }
          })
          doc.y = rowY + 14
        }
      }

      // ── CONOCIMIENTOS Y HABILIDADES ───────────────────────────────────────
      drawSectionHeader(t('pdf_knowledge_skills'))

      // Sub-sección: Experiencia
      const rawExp = position.positionSpecificRequirement ?? t('pdf_no_info')
      const expH = htmlHeight(rawExp, pageW - 16) + 10
      drawSubSectionHeader(t('pdf_experience'))
      ensureSpace(expH)
      const expY = doc.y
      doc.rect(40, expY, pageW, expH).stroke()
      renderHtml(rawExp, 45, expY + 5, pageW - 16)
      doc.y = expY + expH

      // Sub-sección: Conocimientos teóricos y prácticos
      const rawKnow = position.positionDescription ?? t('pdf_no_info')
      const knowH = htmlHeight(rawKnow, pageW - 16) + 10
      drawSubSectionHeader(t('pdf_theoretical_knowledge'))
      ensureSpace(knowH)
      const knowY = doc.y
      doc.rect(40, knowY, pageW, knowH).stroke()
      renderHtml(rawKnow, 45, knowY + 5, pageW - 16)
      doc.y = knowY + knowH

      // ── Competencias ──────────────────────────────────────────────────────
      if (position.competencies?.length) {
        ensureSpace(90)
        drawSectionHeader(t('pdf_competencies'))

        const funcionales = position.competencies.filter(
          (c) => c.positionCompetencyType === 'functional' || c.positionCompetencyType === 'value'
        )
        const tecnicas = position.competencies.filter(
          (c) => c.positionCompetencyType === 'technical'
        )

        const halfW = pageW / 2
        const cellW = pageW / 4

        // Sub-encabezados: Funcionales | Técnicas
        ensureSpace(28)
        const compSubY = doc.y
        doc.rect(40, compSubY, halfW, 14).fillAndStroke('#2E5FA3', black)
        doc.rect(40 + halfW, compSubY, halfW, 14).fillAndStroke('#2E5FA3', black)
        doc.fontSize(9).font('Bold').fillColor(white)
          .text(t('pdf_functional'), 40, compSubY + 3, { width: halfW, align: 'center', lineBreak: false })
        doc.fontSize(9).font('Bold').fillColor(white)
          .text(t('pdf_technical'), 40 + halfW, compSubY + 3, { width: halfW, align: 'center', lineBreak: false })
        doc.y = compSubY + 14

        // Filas: 2 funcionales y 2 técnicas por fila
        const numRows = Math.max(Math.ceil(funcionales.length / 2), Math.ceil(tecnicas.length / 2), 1)

        for (let r = 0; r < numRows; r++) {
          const items = [
            funcionales[r * 2]?.positionCompetencyName,
            funcionales[r * 2 + 1]?.positionCompetencyName,
            tecnicas[r * 2]?.positionCompetencyName,
            tecnicas[r * 2 + 1]?.positionCompetencyName,
          ]

          const rowH = Math.max(
            ...items.map((name) =>
              name ? doc.heightOfString(name, { width: cellW - 10 }) + 14 : 28
            )
          )

          ensureSpace(rowH)
          const rowY = doc.y

          items.forEach((name, idx) => {
            const cx = 40 + idx * cellW
            if (name) {
              doc.rect(cx, rowY, cellW, rowH).stroke()
              doc.fontSize(8).font('Regular').fillColor(black)
                .text(name, cx + 5, rowY + Math.round((rowH - 12) / 2), {
                  width: cellW - 10,
                  align: 'center',
                  lineBreak: true,
                })
            } else {
              doc.rect(cx, rowY, cellW, rowH).fillAndStroke(lightGray, black)
            }
          })

          doc.y = rowY + rowH
        }
      }

      // ── EQUIPO ASIGNADO AL EMPLEADO ───────────────────────────────────────
      drawSectionHeader(t('pdf_assigned_equipment'), '#2E5FA3')

      ensureSpace(42)
      const equipSubY = doc.y
      const equipHalfW = pageW / 2

      // Sub-encabezados
      doc.rect(40, equipSubY, equipHalfW, 14).fillAndStroke('#2E5FA3', black)
      doc.rect(40 + equipHalfW, equipSubY, equipHalfW, 14).fillAndStroke('#2E5FA3', black)
      doc.fontSize(9).font('Bold').fillColor(white)
        .text(t('pdf_personal_security'), 40, equipSubY + 3, { width: equipHalfW, align: 'center', lineBreak: false })
      doc.fontSize(9).font('Bold').fillColor(white)
        .text(t('pdf_work_equipment'), 40 + equipHalfW, equipSubY + 3, { width: equipHalfW, align: 'center', lineBreak: false })
      doc.y = equipSubY + 14

      // Fila vacía
      const equipRowY = doc.y
      doc.rect(40, equipRowY, equipHalfW, 24).stroke()
      doc.rect(40 + equipHalfW, equipRowY, equipHalfW, 24).stroke()
      doc.y = equipRowY + 24

      // ── ELABORÓ / VALIDÓ ──────────────────────────────────────────────────
      const signRowH = 100
      const signColW = pageW / 3
      ensureSpace(signRowH + 20)
      const signSubY = doc.y

      // Sub-encabezados: ELABORÓ | (vacío) | VALIDÓ
      doc.rect(40, signSubY, signColW, 16).fillAndStroke('#2E5FA3', black)
      doc.rect(40 + signColW, signSubY, signColW, 16).fillAndStroke(lightGray, black)
      doc.rect(40 + signColW * 2, signSubY, signColW, 16).fillAndStroke('#2E5FA3', black)
      doc.fontSize(9).font('Bold').fillColor(white)
        .text(t('pdf_elaborated_by'), 40, signSubY + 4, { width: signColW, align: 'center', lineBreak: false })
      doc.fontSize(9).font('Bold').fillColor(white)
        .text(t('pdf_validated_by'), 40 + signColW * 2, signSubY + 4, { width: signColW, align: 'center', lineBreak: false })

      // Bordear las 3 celdas del área de firmas
      const signAreaY = signSubY + 16
      doc.rect(40, signAreaY, signColW, signRowH).stroke()
      doc.rect(40 + signColW, signAreaY, signColW, signRowH).fillAndStroke(lightGray, black)
      doc.rect(40 + signColW * 2, signAreaY, signColW, signRowH).stroke()

      // Contenido interior de cada celda firmante
      const drawSignCell = (cellX: number) => {
        const pad = 8

        // "Firmado por:" con corchete izquierdo
        doc.fontSize(7).font('Regular').fillColor(black)
          .text(t('pdf_signed_by'), cellX + pad, signAreaY + pad, { lineBreak: false })

        // Corchete izquierdo (línea vertical + dos horizontales)
        const brkX = cellX + pad
        const brkY = signAreaY + pad + 9
        const brkH = 38
        doc.moveTo(brkX, brkY).lineTo(brkX, brkY + brkH)
          .moveTo(brkX, brkY).lineTo(brkX + 6, brkY)
          .moveTo(brkX, brkY + brkH).lineTo(brkX + 6, brkY + brkH)
          .strokeColor(black).stroke()


      }

      drawSignCell(40)
      drawSignCell(40 + signColW * 2)

      doc.y = signAreaY + signRowH + 8

      // ── Pie de página ─────────────────────────────────────────────────────
      doc
        .fontSize(7)
        .fillColor('#888888')
        .text(`Generado el ${today}`, 40, doc.y + 6, {
          width: pageW,
          align: 'right',
          lineBreak: false,
        })

      doc.end()
    })
  }
}
