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
import ExcelJS from 'exceljs'
import SystemSetting from '#models/system_setting'
import axios from 'axios'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { prepareAliasesForPersistence } from '#utils/org_alias_normalize'
import { applyPositionNameOrAliasesSearch } from '#utils/org_alias_search_sql'
import OrgAliasUniquenessService from '#services/org_alias_uniqueness_service'

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

    const prepared = prepareAliasesForPersistence(position.aliases ?? null)
    newPosition.aliases = prepared.display
    await new OrgAliasUniquenessService().assertUniqueForBusinessUnit({
      businessUnitId: newPosition.businessUnitId,
      normalizedTokens: prepared.normalizedTokens,
    })

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

    if (position.aliases !== undefined) {
      const prepared = prepareAliasesForPersistence(position.aliases ?? null)
      await new OrgAliasUniquenessService().assertUniqueForBusinessUnit({
        businessUnitId: currentPosition.businessUnitId,
        normalizedTokens: prepared.normalizedTokens,
        excludePositionId: currentPosition.positionId,
      })
      currentPosition.aliases = prepared.display
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

  async get(search?: string | null) {
    const positionsQuery = Position.query().whereNull('position_deleted_at')
    if (search?.trim()) {
      applyPositionNameOrAliasesSearch(positionsQuery, search)
    }
    const positions = await positionsQuery
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
      .whereNull('position_deleted_at')
      .where((sub) => {
        applyPositionNameOrAliasesSearch(sub, positionName)
      })
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
      for await (const deptName of departmentNames) {
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


  /**
   * Genera un documento PDF con la descripción y perfil completo de un puesto.
   *
   * Construye un PDF en formato carta (Letter) con encabezado corporativo,
   * objetivo general, KPIs, perfil del puesto, perfil de evaluación
   * (psicométrico), competencias funcionales/técnicas, equipo asignado y
   * cuadro de firmas (Elaboró/Validó). El método utiliza `pdfkit` y aplica un
   * parser HTML interno para soportar texto enriquecido proveniente del editor
   * Quill (negritas, cursivas, subrayado, listas ordenadas y no ordenadas con
   * indentación `ql-indent-N`).
   *
   * Reglas y consideraciones:
   * - El puesto debe pertenecer a una `BusinessUnit` activa cuyo slug esté
   *   incluido en la variable de entorno `SYSTEM_BUSINESS` (separada por comas).
   * - Solo se consideran puestos no eliminados (`position_deleted_at` nulo) y
   *   sus relaciones activas (funciones específicas, KPIs, competencias y
   *   perfiles de evaluación).
   * - Si existe un logo configurado en `SystemSetting.systemSettingLogo`, se
   *   descarga vía HTTP (timeout 8s); si la descarga falla, el documento se
   *   genera sin logo (no es un error fatal).
   * - El renderizado de secciones usa `ensureSpace()` para forzar saltos de
   *   página cuando no cabe el bloque siguiente y `drawPageHeader()` se
   *   registra en el evento `pageAdded` para reimprimir el encabezado.
   * - Los perfiles de evaluación se agrupan por nombre de prueba y se
   *   renderizan en grupos de hasta 3 columnas lado a lado.
   *
   * @param positionId Identificador único del puesto.
   * @returns Promesa con el `Buffer` del PDF generado, o `null` si el puesto
   *          no existe o no pertenece a una unidad de negocio permitida.
   */
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
      .preload('positionBusinessUnitCompetencyLevels')
      .preload('assessmentProfiles', (q) => {
        q.preload('assessmentTemplateDimension', (dq) => {
          dq.preload('assessmentTemplate')
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
        const listTypes: ('ul' | 'ol')[] = []
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
              case 'i': case 'em': italic = !close; break
              case 'u': case 'a': underline = !close; break
              case 'br': flush(); break
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

          block.spans.forEach((span, si) => {
            const isLast = si === block.spans.length - 1
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
            if (si === 0) {
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
          .text(t('profile_position.title'), rightColX + 4, hTop + 6, { width: rightColW - 8, align: 'center' })

        doc
          .fontSize(7).font('Regular').fillColor(black)
          .text(`${t('profile_position.implementation_date')}: ${implDate}`, rightColX + 4, row2Y + 4, { width: leftSubW - 8, lineBreak: false })
          .text(`${t('profile_position.revision')}: 01`, rightSubX + 4, row2Y + 4, { width: rightSubW - 8, lineBreak: false })
          .text(`${t('profile_position.control_key')}: ${position.positionCode ?? ''}`, rightColX + 4, row3Y + 4, { width: leftSubW - 8, lineBreak: false })
          .text(`${t('profile_position.replaces_revision')}: 00`, rightSubX + 4, row3Y + 4, { width: rightSubW - 8, lineBreak: false })
          .text(`${t('profile_position.reason_for_change')}:`, rightColX + 4, row4Y + 4, { width: motivoColW - 8, lineBreak: false })
          .text(`${t('profile_position.page')} ${pageNum}`, pagColX + 4, row4Y + 4, { width: pagColW - 8, align: 'center', lineBreak: false })

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
      const emLabel = `${t('profile_position.emission_date')}:`
      const emL1 = 44 + doc.widthOfString(emLabel) + 6
      const emL2 = 40 + half - 10
      doc.fontSize(8).font('Regular').fillColor(black)
        .text(emLabel, 44, emisionY + 5, { lineBreak: false })
        .text(today, emL1, emisionY + 5, { width: emL2 - emL1, align: 'center', lineBreak: false })
      doc.moveTo(emL1, emisionY + 15).lineTo(emL2, emisionY + 15).strokeColor(black).stroke()

      // Fila 1 - Derecha: F. Revisión
      const revLabel = `${t('profile_position.review_date')}:`
      const revL1 = 44 + half + doc.widthOfString(revLabel) + 6
      const revL2 = 40 + pageW - 10
      doc.fontSize(8).font('Regular').fillColor(black)
        .text(revLabel, 44 + half, emisionY + 5, { lineBreak: false })
        .text(today, revL1, emisionY + 5, { width: revL2 - revL1, align: 'center', lineBreak: false })
      doc.moveTo(revL1, emisionY + 15).lineTo(revL2, emisionY + 15).strokeColor(black).stroke()

      // Fila 2 - Izquierda: Dirección
      const dirY = emisionY + rowH2
      const dirLabel = `${t('profile_position.direction')}:`
      const dirL1 = 44 + doc.widthOfString(dirLabel) + 6
      const dirL2 = 40 + half - 10
      doc.fontSize(8).font('Regular').fillColor(black)
        .text(dirLabel, 44, dirY + 5, { lineBreak: false })
        .text('Recursos Humanos', dirL1, dirY + 5, { width: dirL2 - dirL1, align: 'center', lineBreak: false })
      doc.moveTo(dirL1, dirY + 15).lineTo(dirL2, dirY + 15).strokeColor(black).stroke()

      // Fila 2 - Derecha: Área /Cuenta
      const areaLabel = `${t('profile_position.area_account')}:`
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
        .text(t('profile_position.key_position'), 40, puestoClaveY + 5, { width: pageW - 8, align: 'right', lineBreak: false })
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
      drawSectionHeader(t('profile_position.general_objective'))
      const rawObj = position.positionGeneralObjective ?? t('profile_position.no_objective')
      const objH = htmlHeight(rawObj, pageW - 16) + 12
      ensureSpace(objH)
      const objY = doc.y
      doc.rect(40, objY, pageW, objH).stroke()
      renderHtml(rawObj, 45, objY + 6, pageW - 16)
      doc.y = objY + objH

      // ── KPIs ──────────────────────────────────────────────────────────────
      drawSectionHeader(t('profile_position.kpis'))
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
          .text(t('profile_position.indicator'), 45, kpiHeadY + 3, { width: kpiCol1 - 10, lineBreak: false })
          .text(t('profile_position.meta_ideal'), 45 + kpiCol1, kpiHeadY + 3, { width: kpiCol2 - 5, lineBreak: false })
          .text(t('profile_position.frequency'), 45 + kpiCol1 + kpiCol2, kpiHeadY + 3, { width: kpiCol3 - 5, lineBreak: false })
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
        doc.fontSize(9).fillColor(black).text(t('profile_position.no_kpis'), 45, kpiY + 5, { width: pageW - 16 })
        doc.y = kpiY + 20
      }

      // ── PERFIL DEL PUESTO ─────────────────────────────────────────────────
      drawSectionHeader(t('profile_position.position_profile'))

      const perfilRowH = 30
      const perfilY = doc.y
      const perfilCols = [pageW * 0.25, pageW * 0.25, pageW * 0.25, pageW * 0.25]
      const perfilLabels = [t('profile_position.schooling'), t('profile_position.age'), t('profile_position.languages'), t('profile_position.computing')]

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

      drawSectionHeader(t('profile_position.assessment_profile'))

      const profiles = position.assessmentProfiles ?? []

      if (!profiles.length) {
        const emptyY = doc.y
        doc.rect(40, emptyY, pageW, 20).stroke()
        doc.fontSize(9).font('Regular').fillColor(black)
          .text(t('profile_position.no_assessment'), 45, emptyY + 5, { width: pageW - 16, lineBreak: false })
        doc.y = emptyY + 20
      } else {
        const testsMap = new Map<string, { label: string; min: number; max: number }[]>()
        for (const profile of profiles) {
          const dimension = profile.assessmentTemplateDimension
          const templateName = (dimension as any)?.assessmentTemplate?.assessmentTemplateName
            ?? (dimension as any)?.$extras?.assessment_template_name
            ?? 'Sin prueba'
          const dimensionLabel = (dimension as any)?.assessmentTemplateDimensionName ?? ''
          if (!testsMap.has(templateName)) testsMap.set(templateName, [])
          testsMap.get(templateName)!.push({
            label: dimensionLabel,
            min: profile.positionAssessmentProfileMinimumValue,
            max: profile.positionAssessmentProfileMaximumValue,
          })
        }

        const testEntries = Array.from(testsMap.entries())

        // Renderizar en grupos de máximo 3 tests lado a lado
        for (let groupStart = 0; groupStart < testEntries.length; groupStart += 3) {
          const group = testEntries.slice(groupStart, groupStart + 3)
          const testColW = pageW / group.length

          // Fila de nombres de prueba
          ensureSpace(14 + 12 + 14)
          const testHeaderY = doc.y
          group.forEach(([testName], idx) => {
            const tx = 40 + idx * testColW
            doc.rect(tx, testHeaderY, testColW, 14).fillAndStroke(lightGray, black)
            doc.fontSize(9).font('Bold').fillColor(black)
              .text(testName.toUpperCase(), tx + 4, testHeaderY + 3, { width: testColW - 8, align: 'center', lineBreak: false })
          })
          doc.y = testHeaderY + 14

          // Encabezado de columnas: Dimensión | Mínimo | Máximo
          const colHeaderY = doc.y
          group.forEach((_, idx) => {
            const tx = 40 + idx * testColW
            const dimensionLabelW = testColW * 0.55
            const dimensionMinW = testColW * 0.225
            const dimensionMaxW = testColW * 0.225
            doc.rect(tx, colHeaderY, dimensionLabelW, 12).fillAndStroke(lightGray, black)
            doc.rect(tx + dimensionLabelW, colHeaderY, dimensionMinW, 12).fillAndStroke(lightGray, black)
            doc.rect(tx + dimensionLabelW + dimensionMinW, colHeaderY, dimensionMaxW, 12).fillAndStroke(lightGray, black)
            doc.fontSize(7).font('Bold').fillColor(black)
              .text(t('profile_position.dimension'), tx + 2, colHeaderY + 3, { width: dimensionLabelW - 4, align: 'center', lineBreak: false })
              .text(t('profile_position.min'), tx + dimensionLabelW + 2, colHeaderY + 3, { width: dimensionMinW - 4, align: 'center', lineBreak: false })
              .text(t('profile_position.max'), tx + dimensionLabelW + dimensionMinW + 2, colHeaderY + 3, { width: dimensionMaxW - 4, align: 'center', lineBreak: false })
          })
          doc.y = colHeaderY + 12

          // Filas de dimensiones
          const maxDimensionRows = Math.max(...group.map(([, dims]) => dims.length))
          for (let r = 0; r < maxDimensionRows; r++) {
            ensureSpace(14)
            const rowY = doc.y
            group.forEach(([, dimensions], idx) => {
              const tx = 40 + idx * testColW
              const dimension = dimensions[r]
              const dimensionLabelW = testColW * 0.55
              const dimensionMinW = testColW * 0.225
              const dimensionMaxW = testColW * 0.225

              doc.rect(tx, rowY, dimensionLabelW, 14).stroke()
              doc.rect(tx + dimensionLabelW, rowY, dimensionMinW, 14).stroke()
              doc.rect(tx + dimensionLabelW + dimensionMinW, rowY, dimensionMaxW, 14).stroke()

              if (dimension) {
                doc.fontSize(8).font('Regular').fillColor(black)
                  .text(dimension.label, tx + 4, rowY + 3, { width: dimensionLabelW - 8, lineBreak: false })
                  .text(String(dimension.min), tx + dimensionLabelW + 2, rowY + 3, { width: dimensionMinW - 4, align: 'center', lineBreak: false })
                  .text(String(dimension.max), tx + dimensionLabelW + dimensionMinW + 2, rowY + 3, { width: dimensionMaxW - 4, align: 'center', lineBreak: false })
              }
            })
            doc.y = rowY + 14
          }
        }
      }

      // ── Competencias ──────────────────────────────────────────────────────
      if (position.positionBusinessUnitCompetencyLevels?.length) {
        ensureSpace(90)
        drawSectionHeader(t('profile_position.competencies'))
        const transversalCompetencies = position.positionBusinessUnitCompetencyLevels.filter(
          (c) => c.competency?.competencyType === 'transversal'
        )
        const technicalCompetencies = position.positionBusinessUnitCompetencyLevels.filter(
          (c) => c.competency?.competencyType === 'technical'
        )

        const halfW = pageW / 2
        const cellW = pageW / 4

        ensureSpace(28)
        const competencySubHeaderY = doc.y
        doc.rect(40, competencySubHeaderY, halfW, 14).fillAndStroke('#2E5FA3', black)
        doc.rect(40 + halfW, competencySubHeaderY, halfW, 14).fillAndStroke('#2E5FA3', black)
        doc.fontSize(9).font('Bold').fillColor(white)
          .text(t('profile_position.functional'), 40, competencySubHeaderY + 3, { width: halfW, align: 'center', lineBreak: false })
        doc.fontSize(9).font('Bold').fillColor(white)
          .text(t('profile_position.technical'), 40 + halfW, competencySubHeaderY + 3, { width: halfW, align: 'center', lineBreak: false })
        doc.y = competencySubHeaderY + 14

        const numRows = Math.max(Math.ceil(transversalCompetencies.length / 2), Math.ceil(technicalCompetencies.length / 2), 1)

        for (let r = 0; r < numRows; r++) {
          const items = [
            transversalCompetencies[r * 2]?.competency?.competencyName,
            transversalCompetencies[r * 2 + 1]?.competency?.competencyName,
            technicalCompetencies[r * 2]?.competency?.competencyName,
            technicalCompetencies[r * 2 + 1]?.competency?.competencyName,
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
      drawSectionHeader(t('profile_position.assigned_equipment'), '#2E5FA3')

      ensureSpace(42)
      const equipSubY = doc.y
      const equipHalfW = pageW / 2

      // Sub-encabezados
      doc.rect(40, equipSubY, equipHalfW, 14).fillAndStroke('#2E5FA3', black)
      doc.rect(40 + equipHalfW, equipSubY, equipHalfW, 14).fillAndStroke('#2E5FA3', black)
      doc.fontSize(9).font('Bold').fillColor(white)
        .text(t('profile_position.personal_security'), 40, equipSubY + 3, { width: equipHalfW, align: 'center', lineBreak: false })
      doc.fontSize(9).font('Bold').fillColor(white)
        .text(t('profile_position.work_equipment'), 40 + equipHalfW, equipSubY + 3, { width: equipHalfW, align: 'center', lineBreak: false })
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
        .text(t('profile_position.elaborated_by'), 40, signSubY + 4, { width: signColW, align: 'center', lineBreak: false })
      doc.fontSize(9).font('Bold').fillColor(white)
        .text(t('profile_position.validated_by'), 40 + signColW * 2, signSubY + 4, { width: signColW, align: 'center', lineBreak: false })

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
          .text(t('profile_position.signed_by'), cellX + pad, signAreaY + pad, { lineBreak: false })

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

  /**
   * Genera un libro Excel (XLSX) con la descripción y perfil completo de un puesto.
   *
   * Crea un workbook de `exceljs` con una sola hoja en orientación vertical
   * carta. El layout utiliza 12 columnas (A-L) para mantener proporciones
   * equivalentes a la versión PDF, con celdas combinadas (`mergeCells`) para
   * armar el encabezado corporativo, los bloques de metadatos
   * (Fecha de Emisión / Revisión / Dirección / Área-Cuenta), nombre del puesto,
   * objetivo general, KPIs, perfil del puesto, perfiles de evaluación
   * (psicométricos), competencias, equipo asignado y firmas.
   *
   * Reglas y consideraciones:
   * - El puesto debe pertenecer a una `BusinessUnit` activa cuyo slug esté
   *   incluido en la variable de entorno `SYSTEM_BUSINESS` (separada por comas).
   * - Solo se consideran puestos no eliminados y relaciones activas
   *   (funciones específicas, KPIs, competencias y perfiles de evaluación).
   * - Si existe logo en `SystemSetting`, se descarga (timeout 8s) y se inserta
   *   como imagen anclada a las celdas A:B (filas 1-4). Detecta la extensión
   *   automáticamente (png, jpeg o gif) por la URL.
   * - El texto enriquecido HTML del objetivo general se convierte a `richText`
   *   mediante `htmlToRichText`, soportando negritas, cursivas, subrayado,
   *   listas ordenadas/desordenadas con indentación `ql-indent-N`.
   * - Los perfiles de evaluación se agrupan por nombre de prueba y se
   *   distribuyen en tercios A:D, E:H e I:L (hasta 3 pruebas por fila).
   * - Las columnas 13 y 14 se ocultan al final para limpiar el área visible.
   *
   * @param positionId Identificador único del puesto.
   * @returns Promesa con el `Buffer` del archivo XLSX generado, o `null` si el
   *          puesto no existe o no pertenece a una unidad de negocio permitida.
   */
  async getExcel(positionId: number): Promise<Buffer | null> {
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
      .preload('specificFunctions', (query) => query.whereNull('position_specific_function_deleted_at'))
      .preload('kpis', (query) => query.whereNull('position_kpi_deleted_at'))
      .preload('positionBusinessUnitCompetencyLevels')
      .preload('assessmentProfiles', (query) => {
        query.preload('assessmentTemplateDimension', (subQuery) => {
          subQuery.preload('assessmentTemplate')
        })
      })
      .first()

    if (!position) return null

    const systemSetting = await SystemSetting.query().whereNull('system_setting_deleted_at').first()
    let logoBuffer: Buffer | null = null
    let logoExtension: 'png' | 'jpeg' | 'gif' = 'png'
    if (systemSetting?.systemSettingLogo) {
      try {
        const logoRes = await axios.get(systemSetting.systemSettingLogo, {
          responseType: 'arraybuffer',
          timeout: 8000,
        })
        logoBuffer = Buffer.from(logoRes.data)
        const logoUrl = systemSetting.systemSettingLogo.toLowerCase()
        if (logoUrl.includes('.jpg') || logoUrl.includes('.jpeg')) logoExtension = 'jpeg'
        else if (logoUrl.includes('.gif')) logoExtension = 'gif'
      } catch {
        logoBuffer = null
      }
    }

    const t = (key: string) => this.i18n.t(key)
    const today = new Date().toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })

    const BLUE = 'FF2E5FA3'
    const GRAY = 'FFF2F2F2'
    const BLACK = 'FF000000'
    const WHITE = 'FFFFFFFF'

    const borderAll: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: BLACK } },
      left: { style: 'thin', color: { argb: BLACK } },
      bottom: { style: 'thin', color: { argb: BLACK } },
      right: { style: 'thin', color: { argb: BLACK } },
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'SAE'
    workbook.title = t('profile_position.title')

    const sheet = workbook.addWorksheet(t('profile_position.title'), {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    })

    // 12 columnas (A-L): mismo ancho total que el original de 4 cols (32+32+20+20=104)
    // Cada tercio de 4 cols mantiene la misma proporción: (32/3, 32/3, 20/3, 20/3) ≈ (11,11,7,7)
    sheet.columns = [
      { width: 13 }, { width: 13 }, { width: 7 }, { width: 7 }, // A-D  (tercio 1 / mitad izq)
      { width: 11 }, { width: 11 }, { width: 7 }, { width: 7 }, // E-H  (tercio 2)
      { width: 11 }, { width: 11 }, { width: 12 }, { width: 12 }, // I-L  (tercio 3 / mitad der)
    ]

    // Última columna del sheet
    const LAST = 'L'

    const mergeRow = (row: ExcelJS.Row, from: string, to: string) => {
      sheet.mergeCells(`${from}${row.number}:${to}${row.number}`)
    }

    const styleCell = (
      cell: ExcelJS.Cell,
      opts: {
        bold?: boolean
        size?: number
        color?: string
        bg?: string
        align?: ExcelJS.Alignment['horizontal']
        wrap?: boolean
      }
    ) => {
      cell.border = borderAll
      cell.font = { bold: opts.bold ?? false, size: opts.size ?? 9, color: { argb: opts.color ?? BLACK } }
      cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', wrapText: opts.wrap ?? false }
      if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } }
    }

    type RichRun = ExcelJS.RichText

    const htmlToRichText = (html: string): RichRun[] => {
      const decodeEnt = (s: string) =>
        s
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

      const runs: RichRun[] = []
      let bold = false
      let italic = false
      let underline = false
      let buf = ''
      const listStack: ('ul' | 'ol')[] = []
      const olCounters: number[] = []

      const flush = () => {
        const text = decodeEnt(buf)
        if (text) {
          runs.push({
            text,
            font: { bold: bold || undefined, italic: italic || undefined, underline: underline || undefined, size: 9 },
          })
        }
        buf = ''
      }

      const pushPrefix = (prefix: string) => {
        if (prefix) runs.push({ text: prefix, font: { size: 9 } })
      }

      const tagRe = /<(\/?)([a-z][a-z0-9]*)([^>]*)>/gi
      let last = 0
      let mx: RegExpExecArray | null

      // eslint-disable-next-line no-cond-assign
      while ((mx = tagRe.exec(html)) !== null) {
        buf += html.slice(last, mx.index)
        last = mx.index + mx[0].length

        const close = mx[1] === '/'
        const tag = mx[2].toLowerCase()
        const attrs = mx[3]

        if (tag === 'strong' || tag === 'b') {
          flush(); bold = !close
        } else if (tag === 'em' || tag === 'i') {
          flush(); italic = !close
        } else if (tag === 'u') {
          flush(); underline = !close
        } else if (tag === 'br') {
          buf += '\n'
        } else if (tag === 'p') {
          if (close) buf += '\n'
        } else if (tag === 'ol') {
          if (!close) { listStack.push('ol'); olCounters.push(0) }
          else { listStack.pop(); olCounters.pop() }
        } else if (tag === 'ul') {
          if (!close) listStack.push('ul')
          else listStack.pop()
        } else if (tag === 'li' && !close) {
          if (buf) {
            if (!buf.endsWith('\n')) buf += '\n'
          } else if (runs.length > 0 && !runs[runs.length - 1].text.endsWith('\n')) {
            runs[runs.length - 1] = { ...runs[runs.length - 1], text: runs[runs.length - 1].text + '\n' }
          }
          flush()
          const qlMatch = attrs.match(/ql-indent-(\d+)/)
          const depth = qlMatch ? Number.parseInt(qlMatch[1]) + 1 : listStack.length
          const indent = '    '.repeat(depth)
          const listType = listStack.at(-1) ?? 'ul'
          if (listType === 'ol') {
            const idx = olCounters.length - 1
            olCounters[idx] = (olCounters[idx] ?? 0) + 1
            pushPrefix(`${indent}${olCounters[idx]}. `)
          } else {
            pushPrefix(`${indent}• `)
          }
        }
      }

      buf += html.slice(last)
      flush()

      const cleaned = runs
        .map((r) => ({ ...r, text: r.text.replace(/\n{3,}/g, '\n\n') }))
        .filter((r) => r.text.length > 0)

      if (cleaned.length > 0) {
        cleaned[cleaned.length - 1].text = cleaned[cleaned.length - 1].text.trimEnd()
      }

      return cleaned
    }

    const addSectionHeader = (label: string, bg = BLUE) => {
      const row = sheet.addRow([label])
      mergeRow(row, 'A', LAST)
      styleCell(row.getCell('A'), { bold: true, size: 10, color: WHITE, bg, align: 'center' })
      row.height = 20
      return row
    }

    const addFullRow = (text: string) => {
      const row = sheet.addRow([text])
      mergeRow(row, 'A', LAST)
      const cell = row.getCell('A')
      styleCell(cell, { wrap: true })
      row.height = Math.max(18, text.split('\n').length * 14)
      return row
    }

    const addRichRow = (runs: RichRun[]) => {
      const row = sheet.addRow([''])
      mergeRow(row, 'A', LAST)
      const cell = row.getCell('A')
      cell.value = { richText: runs }
      cell.border = borderAll
      cell.alignment = { wrapText: true, vertical: 'top' }
      const fullText = runs.map((r) => r.text).join('').trimEnd()
      const hardLines = fullText.split('\n')
      const totalLines = hardLines.reduce((acc, line) => {
        if (!line.trim()) return acc
        return acc + Math.max(1, Math.ceil(line.length / 95))
      }, 0)
      row.height = Math.max(18, Math.ceil(totalLines) * 10)
      return row
    }

    // ── Encabezado: Logo + Título + Metadata ─────────────────────────────────
    // A:B = logo (merged filas 1-4), C:L = contenido
    const headerRow1 = sheet.addRow(['', '', t('profile_position.title')])
    sheet.mergeCells(`C${headerRow1.number}:${LAST}${headerRow1.number}`)
    styleCell(headerRow1.getCell('C'), { bold: true, size: 12, color: WHITE, bg: BLUE, align: 'center' })
    headerRow1.height = 26

    // Metadata: C:G = izquierda, H:L = derecha
    const headerRow2 = sheet.addRow(['', '', `${t('profile_position.implementation_date')}: ${today}`, '', '', '', '', `${t('profile_position.revision')}: 01`])
    sheet.mergeCells(`C${headerRow2.number}:G${headerRow2.number}`)
    sheet.mergeCells(`H${headerRow2.number}:${LAST}${headerRow2.number}`)
    styleCell(headerRow2.getCell('C'), { size: 8 })
    styleCell(headerRow2.getCell('H'), { size: 8 })
    headerRow2.height = 16

    const headerRow3 = sheet.addRow(['', '', `${t('profile_position.control_key')}: ${position.positionCode ?? ''}`, '', '', '', '', `${t('profile_position.replaces_revision')}: 00`])
    sheet.mergeCells(`C${headerRow3.number}:G${headerRow3.number}`)
    sheet.mergeCells(`H${headerRow3.number}:${LAST}${headerRow3.number}`)
    styleCell(headerRow3.getCell('C'), { size: 8 })
    styleCell(headerRow3.getCell('H'), { size: 8 })
    headerRow3.height = 16

    const headerRow4 = sheet.addRow(['', '', `${t('profile_position.reason_for_change')}:`, '', '', '', '', `${t('profile_position.page')} 1`])
    sheet.mergeCells(`C${headerRow4.number}:G${headerRow4.number}`)
    sheet.mergeCells(`H${headerRow4.number}:${LAST}${headerRow4.number}`)
    styleCell(headerRow4.getCell('C'), { size: 8 })
    styleCell(headerRow4.getCell('H'), { size: 8, align: 'right' })
    headerRow4.height = 16

    // Merge A:B para el logo (filas 1-4)
    sheet.mergeCells(`A${headerRow1.number}:B${headerRow4.number}`)
    const logoCell = sheet.getCell(`A${headerRow1.number}`)
    logoCell.border = borderAll
    logoCell.alignment = { horizontal: 'center', vertical: 'middle' }

    if (logoBuffer) {
      const imageId = workbook.addImage({ base64: logoBuffer.toString('base64'), extension: logoExtension })
      sheet.addImage(imageId, {
        tl: { col: 0, row: headerRow1.number - 0.85 } as ExcelJS.Anchor,
        br: { col: 2, row: headerRow4.number - 0.15 } as ExcelJS.Anchor,
        editAs: 'oneCell',
      })
    }

    // ── F. Emisión / F. Revisión ──────────────────────────────────────────────
    const emisionRow = sheet.addRow([`${t('profile_position.emission_date')}:`, '', '', today, '', '', `${t('profile_position.review_date')}:`, '', '', today])
    sheet.mergeCells(`A${emisionRow.number}:C${emisionRow.number}`)
    sheet.mergeCells(`D${emisionRow.number}:F${emisionRow.number}`)
    sheet.mergeCells(`G${emisionRow.number}:I${emisionRow.number}`)
    sheet.mergeCells(`J${emisionRow.number}:${LAST}${emisionRow.number}`)
    styleCell(emisionRow.getCell('A'), { size: 8 })
    styleCell(emisionRow.getCell('D'), { size: 8, align: 'center' })
    styleCell(emisionRow.getCell('G'), { size: 8 })
    styleCell(emisionRow.getCell('J'), { size: 8, align: 'center' })
    emisionRow.height = 18

    // ── Dirección / Área-Cuenta ───────────────────────────────────────────────
    const dirRow = sheet.addRow([`${t('profile_position.direction')}:`, '', '', 'Recursos Humanos', '', '', `${t('profile_position.area_account')}:`, '', '', 'Recursos Humanos'])
    sheet.mergeCells(`A${dirRow.number}:C${dirRow.number}`)
    sheet.mergeCells(`D${dirRow.number}:F${dirRow.number}`)
    sheet.mergeCells(`G${dirRow.number}:I${dirRow.number}`)
    sheet.mergeCells(`J${dirRow.number}:${LAST}${dirRow.number}`)
    styleCell(dirRow.getCell('A'), { size: 8 })
    styleCell(dirRow.getCell('D'), { size: 8, align: 'center' })
    styleCell(dirRow.getCell('G'), { size: 8 })
    styleCell(dirRow.getCell('J'), { size: 8, align: 'center' })
    dirRow.height = 18

    // ── PUESTO CLAVE ──────────────────────────────────────────────────────────
    const keyRow = sheet.addRow([t('profile_position.key_position')])
    mergeRow(keyRow, 'A', LAST)
    const keyCell = keyRow.getCell('A')
    keyCell.border = borderAll
    keyCell.font = { italic: true, size: 8 }
    keyCell.alignment = { horizontal: 'right', vertical: 'middle' }
    keyRow.height = 16

    // ── Nombre del puesto ────────────────────────────────────────────────────
    const nameText = (position.positionName ?? '').toUpperCase()
    const nameRow = sheet.addRow([nameText])
    mergeRow(nameRow, 'A', LAST)
    styleCell(nameRow.getCell('A'), { bold: true, size: 13, align: 'center' })
    nameRow.height = 28

    // ── Objetivo general ─────────────────────────────────────────────────────
    addSectionHeader(t('profile_position.general_objective'))
    addRichRow(htmlToRichText(position.positionGeneralObjective ?? t('profile_position.no_objective')))

    // ── KPI's ─────────────────────────────────────────────────── ─────────────
    // A:H = Indicador (8 cols), I:J = Meta/Ideal (2 cols), K:L = Frecuencia (2 cols)
    addSectionHeader(t('profile_position.kpis'))

    const kpiHead = sheet.addRow([t('profile_position.indicator'), '', '', '', '', '', '', '', t('profile_position.meta_ideal'), '', t('profile_position.frequency'), ''])
    sheet.mergeCells(`A${kpiHead.number}:H${kpiHead.number}`)
    sheet.mergeCells(`I${kpiHead.number}:J${kpiHead.number}`)
    sheet.mergeCells(`K${kpiHead.number}:${LAST}${kpiHead.number}`)
    styleCell(kpiHead.getCell('A'), { bold: true, bg: GRAY, align: 'center' })
    styleCell(kpiHead.getCell('I'), { bold: true, bg: GRAY, align: 'center' })
    styleCell(kpiHead.getCell('K'), { bold: true, bg: GRAY, align: 'center' })
    kpiHead.height = 18

    if (position.kpis?.length) {
      for (const kpi of position.kpis) {
        const kpiRow = sheet.addRow([kpi.positionKpiName ?? '', '', '', '', '', '', '', '', String(kpi.positionKpiIdeal ?? ''), '', kpi.positionKpiFrequency ?? '', ''])
        sheet.mergeCells(`A${kpiRow.number}:H${kpiRow.number}`)
        sheet.mergeCells(`I${kpiRow.number}:J${kpiRow.number}`)
        sheet.mergeCells(`K${kpiRow.number}:${LAST}${kpiRow.number}`)
        styleCell(kpiRow.getCell('A'), { wrap: true })
        styleCell(kpiRow.getCell('I'), { align: 'center' })
        styleCell(kpiRow.getCell('K'), { align: 'center' })
        kpiRow.height = 18
      }
    } else {
      addFullRow(t('profile_position.no_kpis'))
    }

    // ── Perfil del puesto (4 quarters: A:C, D:F, G:I, J:L) ──────────────────
    addSectionHeader(t('profile_position.position_profile'))

    const profileLabelsRow = sheet.addRow([t('profile_position.schooling'), '', '', t('profile_position.age'), '', '', t('profile_position.languages'), '', '', t('profile_position.computing'), '', ''])
    sheet.mergeCells(`A${profileLabelsRow.number}:C${profileLabelsRow.number}`)
    sheet.mergeCells(`D${profileLabelsRow.number}:F${profileLabelsRow.number}`)
    sheet.mergeCells(`G${profileLabelsRow.number}:I${profileLabelsRow.number}`)
    sheet.mergeCells(`J${profileLabelsRow.number}:${LAST}${profileLabelsRow.number}`)
      ; (['A', 'D', 'G', 'J'] as const).forEach((col) => {
        styleCell(profileLabelsRow.getCell(col), { bold: true, size: 8 })
      })
    profileLabelsRow.height = 16

    const profileValuesRow = sheet.addRow(['', '', '', '', '', '', '', '', '', '', '', ''])
    sheet.mergeCells(`A${profileValuesRow.number}:C${profileValuesRow.number}`)
    sheet.mergeCells(`D${profileValuesRow.number}:F${profileValuesRow.number}`)
    sheet.mergeCells(`G${profileValuesRow.number}:I${profileValuesRow.number}`)
    sheet.mergeCells(`J${profileValuesRow.number}:${LAST}${profileValuesRow.number}`)
      ; (['A', 'D', 'G', 'J'] as const).forEach((col) => {
        styleCell(profileValuesRow.getCell(col), { size: 8, align: 'center' })
      })
    profileValuesRow.height = 20

    addSectionHeader(t('profile_position.assessment_profile'))

    const profiles = position.assessmentProfiles ?? []
    if (!profiles.length) {
      addFullRow(t('profile_position.no_assessment'))
    } else {
      const testsMap = new Map<string, { label: string; min: number; max: number }[]>()
      for (const profile of profiles) {
        const dimension = profile.assessmentTemplateDimension
        const templateName =
          (dimension as any)?.assessmentTemplate?.assessmentTemplateName ??
          (dimension as any)?.$extras?.assessment_template_name ??
          'Sin prueba'
        const dimensionLabel = (dimension as any)?.assessmentTemplateDimensionName ?? ''
        if (!testsMap.has(templateName)) testsMap.set(templateName, [])
        testsMap.get(templateName)!.push({
          label: dimensionLabel,
          min: profile.positionAssessmentProfileMinimumValue,
          max: profile.positionAssessmentProfileMaximumValue,
        })
      }

      // Columnas de inicio de cada tercio (máximo 3 tests side by side)
      const tercioStart = ['A', 'E', 'I'] as const
      const tercioEnd = ['D', 'H', LAST] as const
      const tercioMin = ['C', 'G', 'K'] as const
      const tercioMax = ['D', 'H', LAST] as const
      const tercioDim = ['A', 'E', 'I'] as const
      const tercioDimEnd = ['B', 'F', 'J'] as const

      const testEntries = Array.from(testsMap.entries())

      // Agrupar de 3 en 3
      for (let groupStart = 0; groupStart < testEntries.length; groupStart += 3) {
        const group = testEntries.slice(groupStart, groupStart + 3)

        // Fila de nombres de prueba
        const testNameRow = sheet.addRow(Array(12).fill(''))
        group.forEach(([testName], gi) => {
          sheet.mergeCells(`${tercioStart[gi]}${testNameRow.number}:${tercioEnd[gi]}${testNameRow.number}`)
          styleCell(testNameRow.getCell(tercioStart[gi]), { bold: true, bg: GRAY, size: 9, align: 'center' })
          testNameRow.getCell(tercioStart[gi]).value = testName.toUpperCase()
        })
        // Rellenar tercios vacíos con borde
        for (let gi = group.length; gi < 3; gi++) {
          sheet.mergeCells(`${tercioStart[gi]}${testNameRow.number}:${tercioEnd[gi]}${testNameRow.number}`)
          testNameRow.getCell(tercioStart[gi]).border = borderAll
        }
        testNameRow.height = 16

        // Fila de encabezados de columna (Dimensión | Mín | Máx) por tercio
        const dimHeadRow = sheet.addRow(Array(12).fill(''))
        group.forEach((_, gi) => {
          sheet.mergeCells(`${tercioDim[gi]}${dimHeadRow.number}:${tercioDimEnd[gi]}${dimHeadRow.number}`)
          styleCell(dimHeadRow.getCell(tercioDim[gi]), { bold: true, bg: GRAY, size: 8, align: 'center' })
          dimHeadRow.getCell(tercioDim[gi]).value = t('profile_position.dimension')
          styleCell(dimHeadRow.getCell(tercioMin[gi]), { bold: true, bg: GRAY, size: 8, align: 'center' })
          dimHeadRow.getCell(tercioMin[gi]).value = t('profile_position.min')
          styleCell(dimHeadRow.getCell(tercioMax[gi]), { bold: true, bg: GRAY, size: 8, align: 'center' })
          dimHeadRow.getCell(tercioMax[gi]).value = t('profile_position.max')
        })
        for (let gi = group.length; gi < 3; gi++) {
          sheet.mergeCells(`${tercioStart[gi]}${dimHeadRow.number}:${tercioEnd[gi]}${dimHeadRow.number}`)
          dimHeadRow.getCell(tercioStart[gi]).border = borderAll
        }
        dimHeadRow.height = 14

        // Filas de datos de dimensiones
        const maxDims = Math.max(...group.map(([, dims]) => dims.length))
        for (let r = 0; r < maxDims; r++) {
          const dataRow = sheet.addRow(Array(12).fill(''))
          group.forEach(([, dims], gi) => {
            sheet.mergeCells(`${tercioDim[gi]}${dataRow.number}:${tercioDimEnd[gi]}${dataRow.number}`)
            const dim = dims[r]
            styleCell(dataRow.getCell(tercioDim[gi]), { size: 8 })
            styleCell(dataRow.getCell(tercioMin[gi]), { size: 8, align: 'center' })
            styleCell(dataRow.getCell(tercioMax[gi]), { size: 8, align: 'center' })
            if (dim) {
              dataRow.getCell(tercioDim[gi]).value = dim.label
              dataRow.getCell(tercioMin[gi]).value = dim.min
              dataRow.getCell(tercioMax[gi]).value = dim.max
            }
          })
          for (let gi = group.length; gi < 3; gi++) {
            sheet.mergeCells(`${tercioStart[gi]}${dataRow.number}:${tercioEnd[gi]}${dataRow.number}`)
            dataRow.getCell(tercioStart[gi]).border = borderAll
          }
          dataRow.height = 14
        }
      }
    }

    // ── Competencias (A:F transversales, G:L técnicas) ───────────────────────
    if (position.positionBusinessUnitCompetencyLevels?.length) {
      addSectionHeader(t('profile_position.competencies'))

      const transversalCompetencies = position.positionBusinessUnitCompetencyLevels.filter(
        (c) => c.competency?.competencyType === 'transversal'
      )
      const technicalCompetencies = position.positionBusinessUnitCompetencyLevels.filter(
        (c) => c.competency?.competencyType === 'technical'
      )

      const competencyHeaderRow = sheet.addRow([t('profile_position.functional'), '', '', '', '', '', t('profile_position.technical')])
      sheet.mergeCells(`A${competencyHeaderRow.number}:F${competencyHeaderRow.number}`)
      sheet.mergeCells(`G${competencyHeaderRow.number}:${LAST}${competencyHeaderRow.number}`)
      styleCell(competencyHeaderRow.getCell('A'), { bold: true, color: WHITE, bg: BLUE, align: 'center' })
      styleCell(competencyHeaderRow.getCell('G'), { bold: true, color: WHITE, bg: BLUE, align: 'center' })
      competencyHeaderRow.height = 18

      const numRows = Math.max(transversalCompetencies.length, technicalCompetencies.length, 1)
      for (let r = 0; r < numRows; r++) {
        const fName = transversalCompetencies[r]?.competency?.competencyName ?? ''
        const tName = technicalCompetencies[r]?.competency?.competencyName ?? ''
        const compRow = sheet.addRow([fName, '', '', '', '', '', tName])
        sheet.mergeCells(`A${compRow.number}:F${compRow.number}`)
        sheet.mergeCells(`G${compRow.number}:${LAST}${compRow.number}`)
        styleCell(compRow.getCell('A'), { wrap: true, align: 'center', bg: fName ? undefined : GRAY })
        styleCell(compRow.getCell('G'), { wrap: true, align: 'center', bg: tName ? undefined : GRAY })
        compRow.height = 18
      }
    }

    // ── Equipo asignado (A:F seguridad, G:L trabajo) ──────────────────────────
    addSectionHeader(t('profile_position.assigned_equipment'))

    const equipHead = sheet.addRow([t('profile_position.personal_security'), '', '', '', '', '', t('profile_position.work_equipment')])
    sheet.mergeCells(`A${equipHead.number}:F${equipHead.number}`)
    sheet.mergeCells(`G${equipHead.number}:${LAST}${equipHead.number}`)
    styleCell(equipHead.getCell('A'), { bold: true, color: WHITE, bg: BLUE, align: 'center' })
    styleCell(equipHead.getCell('G'), { bold: true, color: WHITE, bg: BLUE, align: 'center' })
    equipHead.height = 18

    const equipRow = sheet.addRow(['', '', '', '', '', '', ''])
    sheet.mergeCells(`A${equipRow.number}:F${equipRow.number}`)
    sheet.mergeCells(`G${equipRow.number}:${LAST}${equipRow.number}`)
    styleCell(equipRow.getCell('A'), {})
    styleCell(equipRow.getCell('G'), {})
    equipRow.height = 40

    // ── Elaboró / Validó (A:F, G:L) ───────────────────────────────────────────
    const signHead = sheet.addRow([t('profile_position.elaborated_by'), '', '', '', '', '', t('profile_position.validated_by')])
    sheet.mergeCells(`A${signHead.number}:F${signHead.number}`)
    sheet.mergeCells(`G${signHead.number}:${LAST}${signHead.number}`)
    styleCell(signHead.getCell('A'), { bold: true, color: WHITE, bg: BLUE, align: 'center' })
    styleCell(signHead.getCell('G'), { bold: true, color: WHITE, bg: BLUE, align: 'center' })
    signHead.height = 18

    const signRow = sheet.addRow([t('profile_position.signed_by'), '', '', '', '', '', t('profile_position.signed_by')])
    sheet.mergeCells(`A${signRow.number}:F${signRow.number}`)
    sheet.mergeCells(`G${signRow.number}:${LAST}${signRow.number}`)
    const signCellA = signRow.getCell('A')
    const signCellG = signRow.getCell('G')
    signCellA.border = borderAll
    signCellG.border = borderAll
    signCellA.font = { size: 9 }
    signCellG.font = { size: 9 }
    signCellA.alignment = { vertical: 'top' }
    signCellG.alignment = { vertical: 'top' }
    signRow.height = 80

    // Corregir borde derecho en última celda (L) de cada fila
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cellL = row.getCell(LAST)
      const existing = cellL.border ?? {}
      cellL.border = {
        top: existing.top ?? borderAll.top,
        bottom: existing.bottom ?? borderAll.bottom,
        left: existing.left,
        right: borderAll.right,
      }
    })
    sheet.getColumn(13).hidden = true
    sheet.getColumn(14).hidden = true

    const buf = await workbook.xlsx.writeBuffer()
    return Buffer.from(buf)
  }
}
