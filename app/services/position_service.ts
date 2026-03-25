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
    newPosition.positionIsDefault = position.positionIsDefault
    newPosition.positionActive = position.positionActive
    newPosition.parentPositionId = position.parentPositionId
    newPosition.businessUnitId = businessUnit?.businessUnitId || 0
    newPosition.positionProfileExpirationDate = position.positionProfileExpirationDate

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
    currentPosition.positionIsDefault = position.positionIsDefault
    currentPosition.positionActive = position.positionActive
    currentPosition.parentPositionId = position.parentPositionId
    currentPosition.companyId = position.companyId
    currentPosition.positionProfileExpirationDate = position.positionProfileExpirationDate
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

  
}
