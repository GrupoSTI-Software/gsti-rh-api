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

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 })
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

      const navy = '#1B3A6B'
      const white = '#FFFFFF'
      const lightGray = '#F5F5F5'
      const black = '#000000'
      const pageW = doc.page.width - 80
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
          .fontSize(10).font('Helvetica-Bold').fillColor(black)
          .text('DESCRIPCIÓN Y PERFIL DE PUESTO', rightColX + 4, hTop + 6, { width: rightColW - 8, align: 'center' })

        doc
          .fontSize(7).font('Helvetica').fillColor(black)
          .text(`Fecha de implementación: ${implDate}`, rightColX + 4, row2Y + 4, { width: leftSubW - 8, lineBreak: false })
          .text('Revisión: 01', rightSubX + 4, row2Y + 4, { width: rightSubW - 8, lineBreak: false })
          .text(`Clave de control: ${position.positionCode ?? ''}`, rightColX + 4, row3Y + 4, { width: leftSubW - 8, lineBreak: false })
          .text('Reemplaza a revisión: 00', rightSubX + 4, row3Y + 4, { width: rightSubW - 8, lineBreak: false })
          .text('Motivo del cambio:', rightColX + 4, row4Y + 4, { width: motivoColW - 8, lineBreak: false })
          .text(`Pág. ${pageNum}`, pagColX + 4, row4Y + 4, { width: pagColW - 8, align: 'center', lineBreak: false })

        doc.y = hBot + 10
      }

      // ── Función: secciones de contenido ───────────────────────────────────
      const drawSectionHeader = (label: string) => {
        ensureSpace(40)
        const sY = doc.y
        doc.rect(40, sY, pageW, 18).fill(navy)
        doc
          .fontSize(9)
          .fillColor(white)
          .font('Helvetica-Bold')
          .text(label, 40, sY + 5, { width: pageW, align: 'center', lineBreak: false })
        doc.y = sY + 18 + 5
        doc.fillColor(black).font('Helvetica')
      }

      const drawSubSectionHeader = (label: string) => {
        ensureSpace(30)
        const sY = doc.y
        doc.rect(40, sY, pageW, 16).fill('#2E5FA3')
        doc
          .fontSize(8)
          .fillColor(white)
          .font('Helvetica-Bold')
          .text(label, 45, sY + 4, { width: pageW - 10, align: 'center', lineBreak: false })
        doc.y = sY + 16 + 4
        doc.fillColor(black).font('Helvetica')
      }

      // ── Registrar encabezado en páginas nuevas ────────────────────────────
      doc.on('pageAdded', () => {
        currentPage++
        drawPageHeader(currentPage)
      })

      // ── Página 1: encabezado completo ─────────────────────────────────────
      drawPageHeader(1)

      // ── F. Emisión / F. Revisión ──────────────────────────────────────────
      const emisionY = doc.y
      doc.fontSize(8).font('Helvetica').fillColor(black)
        .text('F. Emisión:', 40, emisionY)
        .text(today, 40 + half - 90, emisionY, { width: 80, align: 'right' })
      doc.moveTo(40 + 68, emisionY + 10).lineTo(40 + half - 10, emisionY + 10).strokeColor(black).stroke()
      doc
        .text('F. Revisión:', 40 + half + 10, emisionY)
        .text(today, 40 + half + 80, emisionY, { width: half - 90 })
      doc.moveTo(40 + half + 74, emisionY + 10).lineTo(40 + pageW, emisionY + 10).stroke()
      doc.y = emisionY + 20

      // ── Dirección / Área-Cuenta ───────────────────────────────────────────
      const dirY = doc.y
      doc.fontSize(8).font('Helvetica').fillColor(black)
        .text('Dirección:', 40, dirY)
        .text('Recursos Humanos', 40 + 70, dirY, { width: half - 80 })
      doc.moveTo(40 + 64, dirY + 10).lineTo(40 + half - 10, dirY + 10).stroke()
      doc
        .text('Área /Cuenta:', 40 + half + 10, dirY)
        .text('Recursos Humanos', 40 + half + 82, dirY, { width: half - 92 })
      doc.moveTo(40 + half + 78, dirY + 10).lineTo(40 + pageW, dirY + 10).stroke()
      doc.y = dirY + 20

      // ── PUESTO CLAVE ──────────────────────────────────────────────────────
      doc
        .fontSize(8).font('Helvetica-Oblique').fillColor(black)
        .text('PUESTO CLAVE', 40, doc.y, { width: pageW, align: 'right' })
      doc.moveDown(0.5)

      // ── Nombre del puesto ─────────────────────────────────────────────────
      const nameText = (position.positionName ?? '').toUpperCase()
      const nameH = doc.heightOfString(nameText, { width: pageW - 16 }) + 14
      const nameY = doc.y
      doc.rect(40, nameY, pageW, nameH).stroke()
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor(black)
        .text(nameText, 40, nameY + 7, { width: pageW, align: 'center' })
      doc.y = nameY + nameH + 6
      doc.font('Helvetica')

      // ── Objetivo general ──────────────────────────────────────────────────
      drawSectionHeader('OBJETIVO GENERAL DEL PUESTO')
      const objText = position.positionGeneralObjective ?? 'Sin objetivo registrado.'
      const objH = doc.heightOfString(objText, { width: pageW - 16 }) + 12
      const objY = doc.y
      doc.rect(40, objY, pageW, objH).stroke()
      doc.fontSize(9).font('Helvetica').fillColor(black)
        .text(objText, 45, objY + 6, { width: pageW - 16, align: 'justify' })
      doc.y = objY + objH + 4

      // ── Objetivos específicos / Funciones ─────────────────────────────────
      drawSectionHeader('OBJETIVOS ESPECÍFICOS DEL PUESTO')
      if (position.specificFunctions?.length) {
        for (const fn of position.specificFunctions) {
          const fnText = fn.positionSpecificFunctionName
          const fnH = doc.heightOfString(fnText, { width: pageW - 16 }) + 10
          ensureSpace(fnH)
          const fnY = doc.y
          doc.rect(40, fnY, pageW, fnH).stroke()
          doc.fontSize(9).font('Helvetica').fillColor(black)
            .text(fnText, 45, fnY + 5, { width: pageW - 16 })
          doc.y = fnY + fnH
        }
        doc.moveDown(0.4)
      } else {
        const fnY = doc.y
        doc.rect(40, fnY, pageW, 20).stroke()
        doc.fontSize(9).text('Sin funciones registradas.', 45, fnY + 5, { width: pageW - 16 })
        doc.y = fnY + 20
        doc.moveDown(0.4)
      }

      // ── KPIs ──────────────────────────────────────────────────────────────
      drawSectionHeader("KPI's")
      if (position.kpis?.length) {
        const kpiCol1 = pageW * 0.55
        const kpiCol2 = pageW * 0.25
        const kpiCol3 = pageW * 0.2

        // Encabezado de tabla KPIs
        const kpiHeadY = doc.y
        doc.rect(40, kpiHeadY, kpiCol1, 14).fill(lightGray).stroke()
        doc.rect(40 + kpiCol1, kpiHeadY, kpiCol2, 14).fill(lightGray).stroke()
        doc.rect(40 + kpiCol1 + kpiCol2, kpiHeadY, kpiCol3, 14).fill(lightGray).stroke()
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(black)
          .text('Indicador', 45, kpiHeadY + 3, { width: kpiCol1 - 10, lineBreak: false })
          .text('Meta / Ideal', 45 + kpiCol1, kpiHeadY + 3, { width: kpiCol2 - 5, lineBreak: false })
          .text('Frecuencia', 45 + kpiCol1 + kpiCol2, kpiHeadY + 3, { width: kpiCol3 - 5, lineBreak: false })
        doc.y = kpiHeadY + 14

        for (const kpi of position.kpis) {
          ensureSpace(14)
          const rowY = doc.y
          doc.rect(40, rowY, kpiCol1, 14).stroke()
          doc.rect(40 + kpiCol1, rowY, kpiCol2, 14).stroke()
          doc.rect(40 + kpiCol1 + kpiCol2, rowY, kpiCol3, 14).stroke()
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(black)
            .text(kpi.positionKpiName, 45, rowY + 3, { width: kpiCol1 - 10, lineBreak: false })
            .text(String(kpi.positionKpiIdeal ?? ''), 45 + kpiCol1, rowY + 3, { width: kpiCol2 - 5, lineBreak: false })
            .text(kpi.positionKpiFrequency ?? '', 45 + kpiCol1 + kpiCol2, rowY + 3, { width: kpiCol3 - 5, lineBreak: false })
          doc.y = rowY + 14
        }
        doc.moveDown(0.6)
      } else {
        const kpiY = doc.y
        doc.rect(40, kpiY, pageW, 20).stroke()
        doc.fontSize(9).fillColor(black).text('Sin KPIs registrados.', 45, kpiY + 5, { width: pageW - 16 })
        doc.y = kpiY + 20
        doc.moveDown(0.4)
      }

      // ── PERFIL DEL PUESTO ─────────────────────────────────────────────────
      drawSectionHeader('PERFIL DEL PUESTO')

      const perfilRowH = 30
      const perfilY = doc.y
      const perfilCols = [pageW * 0.25, pageW * 0.25, pageW * 0.25, pageW * 0.25]
      const perfilLabels = ['Escolaridad :', 'Edad :', 'Idiomas :', 'Computación :']

      // Encabezados / etiquetas
      let px = 40
      for (let i = 0; i < 4; i++) {
        doc.rect(px, perfilY, perfilCols[i], perfilRowH).stroke()
        doc.fontSize(7).font('Helvetica-Bold').fillColor(black)
          .text(perfilLabels[i], px + 4, perfilY + 4, { width: perfilCols[i] - 8, lineBreak: false })
        px += perfilCols[i]
      }

      // Valores (tomados de positionSpecificRequirement como texto libre o vacíos)
      const reqText = position.positionSpecificRequirement ?? ''
      px = 40
      const perfilValues = [reqText, '', '', '']
      for (let i = 0; i < 4; i++) {
        doc.fontSize(8).font('Helvetica').fillColor(black)
          .text(perfilValues[i], px + 4, perfilY + 15, { width: perfilCols[i] - 8, lineBreak: false })
        px += perfilCols[i]
      }

      doc.y = perfilY + perfilRowH + 8

      // ── PERFIL PSICOMÉTRICO ───────────────────────────────────────────────
      drawSectionHeader('PERFIL PSICOMÉTRICO')

      const profiles = position.psychometricProfiles ?? []

      if (!profiles.length) {
        const emptyY = doc.y
        doc.rect(40, emptyY, pageW, 20).stroke()
        doc.fontSize(9).font('Helvetica').fillColor(black)
          .text('Sin perfil psicométrico registrado.', 45, emptyY + 5, { width: pageW - 16, lineBreak: false })
        doc.y = emptyY + 20 + 6
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
          doc.rect(tx, testHeadY, testColW, 14).fill(lightGray).stroke()
          doc.fontSize(8).font('Helvetica-Bold').fillColor(black)
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
              doc.fontSize(8).font('Helvetica').fillColor(black)
                .text(dim.label, tx + 4, rowY + 3, { width: dimLabelW - 8, lineBreak: false })
                .text(`${dim.min} - ${dim.max}`, tx + dimLabelW + 4, rowY + 3, { width: dimValW - 8, lineBreak: false })
            }
          })
          doc.y = rowY + 14
        }
        doc.moveDown(0.6)
      }

      // ── CONOCIMIENTOS Y HABILIDADES ───────────────────────────────────────
      drawSectionHeader('CONOCIMIENTOS Y HABILIDADES')

      // Sub-sección: Experiencia
      const expText = position.positionSpecificRequirement ?? 'Sin información registrada.'
      const expH = doc.heightOfString(expText, { width: pageW - 16 }) + 10
      drawSubSectionHeader('Experiencia')
      ensureSpace(expH)
      const expY = doc.y
      doc.rect(40, expY, pageW, expH).stroke()
      doc.fontSize(9).font('Helvetica').fillColor(black)
        .text(expText, 45, expY + 5, { width: pageW - 16, align: 'justify' })
      doc.y = expY + expH + 4

      // Sub-sección: Conocimientos teóricos y prácticos
      const knowText = position.positionDescription ?? 'Sin información registrada.'
      const knowH = doc.heightOfString(knowText, { width: pageW - 16 }) + 10
      drawSubSectionHeader('Conocimientos teóricos y prácticos')
      ensureSpace(knowH)
      const knowY = doc.y
      doc.rect(40, knowY, pageW, knowH).stroke()
      doc.fontSize(9).font('Helvetica').fillColor(black)
        .text(knowText, 45, knowY + 5, { width: pageW - 16, align: 'justify' })
      doc.y = knowY + knowH + 8

      // ── Competencias ──────────────────────────────────────────────────────
      if (position.competencies?.length) {
        drawSectionHeader('COMPETENCIAS')

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
        doc.rect(40, compSubY, halfW, 14).fillAndStroke('#2E5FA3', '#2E5FA3')
        doc.rect(40 + halfW, compSubY, halfW, 14).fillAndStroke('#2E5FA3', '#2E5FA3')
        doc.fontSize(8).font('Helvetica-Bold').fillColor(white)
          .text('Funcionales', 40, compSubY + 3, { width: halfW, align: 'center', lineBreak: false })
        doc.fontSize(8).font('Helvetica-Bold').fillColor(white)
          .text('Técnicas', 40 + halfW, compSubY + 3, { width: halfW, align: 'center', lineBreak: false })
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
              doc.fontSize(8).font('Helvetica').fillColor(black)
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
        doc.moveDown(0.6)
      }

      // ── EQUIPO ASIGNADO AL EMPLEADO ───────────────────────────────────────
      drawSectionHeader('EQUIPO ASIGNADO AL EMPLEADO')

      ensureSpace(42)
      const equipSubY = doc.y
      const equipHalfW = pageW / 2

      // Sub-encabezados
      doc.rect(40, equipSubY, equipHalfW, 14).fillAndStroke('#2E5FA3', '#2E5FA3')
      doc.rect(40 + equipHalfW, equipSubY, equipHalfW, 14).fillAndStroke('#2E5FA3', '#2E5FA3')
      doc.fontSize(8).font('Helvetica-Bold').fillColor(white)
        .text('De Seguridad Personal', 40, equipSubY + 3, { width: equipHalfW, align: 'center', lineBreak: false })
      doc.fontSize(8).font('Helvetica-Bold').fillColor(white)
        .text('De Trabajo', 40 + equipHalfW, equipSubY + 3, { width: equipHalfW, align: 'center', lineBreak: false })
      doc.y = equipSubY + 14

      // Fila vacía
      const equipRowY = doc.y
      doc.rect(40, equipRowY, equipHalfW, 24).stroke()
      doc.rect(40 + equipHalfW, equipRowY, equipHalfW, 24).stroke()
      doc.y = equipRowY + 24 + 8

      // ── Pie de página ─────────────────────────────────────────────────────
      doc
        .fontSize(7)
        .fillColor('#888888')
        .text(`Generado el ${today}`, 40, doc.page.height - 40, {
          width: pageW,
          align: 'right',
        })

      doc.end()
    })
  }
}
