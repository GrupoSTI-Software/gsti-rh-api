import Employee from '#models/employee'
import EmployeeAssistCalendar from '#models/employee_assist_calendar'
import EmployeeShift from '#models/employee_shift'
import EmployeeShiftChange from '#models/employee_shift_changes'
import Shift from '#models/shift'
import ShiftException from '#models/shift_exception'
import ShiftExceptionEvidence from '#models/shift_exception_evidence'
import env from '#start/env'

export default class ShiftService {
  async create(shift: Shift) {
    const newShift = new Shift()
    newShift.shiftName = shift.shiftName
    newShift.shiftCalculateFlag = shift.shiftCalculateFlag
    newShift.shiftDayStart = shift.shiftDayStart
    newShift.shiftTimeStart = shift.shiftTimeStart
    newShift.shiftActiveHours = shift.shiftActiveHours
    newShift.shiftRestDays = shift.shiftRestDays
    newShift.shiftAccumulatedFault = shift.shiftAccumulatedFault
    newShift.shiftBusinessUnits = shift.shiftBusinessUnits
    newShift.shiftTemp = shift.shiftTemp
    if (shift.shiftColor !== undefined && shift.shiftColor !== null) {
      newShift.shiftColor = shift.shiftColor
    }
    await newShift.save()

    return newShift
  }

  async verifyInfo(shift: Shift) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const action = shift.shiftId > 0 ? 'updated' : 'created'
    const existCode = await Shift.query()
      .if(shift.shiftId > 0, (query) => {
        query.whereNot('shift_id', shift.shiftId)
      })
      .where('shift_temp', 0)
      .whereNull('shift_deleted_at')
      .where('shift_name', shift.shiftName)
      .andWhere((subQuery) => {
        businessList.forEach((business) => {
          subQuery.orWhereRaw('FIND_IN_SET(?, shift_business_units)', [business.trim()])
        })
      })
      .first()

    if (existCode && shift.shiftName) {
      return {
        status: 400,
        type: 'warning',
        title: 'The shift name already exists for another shift',
        message: `The shift resource cannot be ${action} because the code is already assigned to another shift`,
        data: { ...shift },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...shift },
    }
  }

  /**
   * Elimina todos los turnos
   * 
   * Esta función:
   * 1. Elimina todas las relaciones en shift_exception_evidences
   * 2. Elimina todas las relaciones en shift_exceptions
   * 3. Elimina todas las relaciones en employee_assist_calendars
   * 4. Elimina todas las relaciones en employee_shifts
   * 5. Elimina todas las relaciones en employee_shift_changes
   * 6. Elimina todos los shifts
   * 
   * @returns Objeto con el resultado de la operación
   */
  async deleteAllShifts() {
    try {
      // Contar registros antes de eliminar
      const totalShifts = await Shift.query().count('* as total')
      const totalShiftExceptions = await ShiftException.query().count('* as total')
      const totalShiftExceptionEvidences = await ShiftExceptionEvidence.query().count('* as total')
      const totalEmployeeAssistCalendars = await EmployeeAssistCalendar.query().count('* as total')
      const totalEmployeeShifts = await EmployeeShift.query().count('* as total')
      const totalEmployeeShiftChanges = await EmployeeShiftChange.query().count('* as total')
      const counts = {
        shifts: Number(totalShifts[0].$extras.total),
        shiftExceptions: Number(totalShiftExceptions[0].$extras.total),
        shiftExceptionEvidences: Number(totalShiftExceptionEvidences[0].$extras.total),
        employeeAssistCalendars: Number(totalEmployeeAssistCalendars[0].$extras.total),
        employeeShifts: Number(totalEmployeeShifts[0].$extras.total),
        employeeShiftChanges: Number(totalEmployeeShiftChanges[0].$extras.total),
      }

      // 1. Eliminar todas las relaciones en shift_exception_evidences
      await ShiftExceptionEvidence.query()
        .delete()

      // 2. Eliminar todas las relaciones en shift_exceptions
      await ShiftException.query()
        .delete()

      // 3. Eliminar todas las relaciones en employee_assist_calendars
      await EmployeeAssistCalendar.query()
        .delete()

      // 4. Eliminar todas las relaciones en employee_shifts
      await EmployeeShift.query()
        .delete()

      // 5. Eliminar todas las relaciones en employee_shift_changes
      await EmployeeShiftChange.query()
        .delete()

      // 6. Eliminar todos los turnos
      await Shift.query()
        .delete()

      return {
        status: 200,
        type: 'success',
        title: 'Shifts deleted successfully',
        message: 'All shifts and their relationships have been deleted successfully',
        data: {
          deleted: {
            shifts: counts.shifts,
            shiftExceptions: counts.shiftExceptions,
            shiftExceptionEvidences: counts.shiftExceptionEvidences,
            employeeAssistCalendars: counts.employeeAssistCalendars,
            employeeShifts: counts.employeeShifts,
            employeeShiftChanges: counts.employeeShiftChanges,
          },
        },
      }
    } catch (error: any) {
      console.error('Error al eliminar todos los turnos:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to delete shifts',
        message: 'An error occurred while trying to delete all shifts',
        error: error.message,
        data: null,
      }
    }
  }

  /**
   * Crea un turno con los datos proporcionados
   * @param shiftData - Datos del turno a crear
   * @returns Turno creado
   */
  private async createShift(
    shiftData: {
      shiftName: string
      shiftTimeStart: string
      shiftActiveHours: number
      shiftRestDays: string
      shiftAccumulatedFault: number
      shiftCalculateFlag: string
      shiftDayStart: number
      shiftTemp: number
      shiftColor: string
    }): Promise<Shift> {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const shift = new Shift()
    shift.shiftName = shiftData.shiftName
    shift.shiftTimeStart = shiftData.shiftTimeStart
    shift.shiftActiveHours = shiftData.shiftActiveHours
    shift.shiftRestDays = shiftData.shiftRestDays
    shift.shiftAccumulatedFault = shiftData.shiftAccumulatedFault
    shift.shiftCalculateFlag = shiftData.shiftCalculateFlag
    shift.shiftBusinessUnits = businessConf
    shift.shiftTemp = shiftData.shiftTemp
    shift.shiftColor = shiftData.shiftColor
    shift.shiftDayStart = shiftData.shiftDayStart
    await shift.save()
    return shift
  }

  /**
   * Crea la estructura completa de turnos
   * 
   * Estructura de turnos creada:
   * - 00:00 to 00:00 - Rest (NA)
   * - 08:00 to 17:00 - Rest (NA)
   * - 08:00 to 17:00 - Rest (Sat, Sun)
   * - 08:00 to 08:00 - Rest (24x48)
   * - 08:00 to 20:00 - Rest (12x36)
   * @returns Objeto con el resultado de la operación y los turnos creados
   */
  async createShiftDemo() {
    try {
      const createdShifts: { [key: string]: Shift } = {}

      // Array de turnos a crear
      const shiftsData = [
        {
          shiftName: '00:00 to 00:00 - Rest (NA)',
          shiftTimeStart: '00:00',
          shiftActiveHours: 24,
          shiftRestDays: '0',
          shiftAccumulatedFault: 3,
          shiftCalculateFlag: '',
          shiftDayStart: 1,
          shiftTemp: 0,
          shiftColor: '#ffffff',
        },
        {
          shiftName: '08:00 to 17:00 - Rest (NA)',
          shiftTimeStart: '08:00',
          shiftActiveHours: 9,
          shiftRestDays: '0',
          shiftAccumulatedFault: 1,
          shiftCalculateFlag: '',
          shiftDayStart: 1,
          shiftTemp: 0,
          shiftColor: '#ffffff',
        },
        {
          shiftName: '08:00 to 17:00 - Rest (Sat, Sun)',
          shiftTimeStart: '08:00',
          shiftActiveHours: 9,
          shiftRestDays: '6,7',
          shiftAccumulatedFault: 1,
          shiftCalculateFlag: '',
          shiftDayStart: 1,
          shiftTemp: 0,
          shiftColor: '#ffffff',
        },
        {
          shiftName: '08:00 to 08:00 - Rest (24x48)',
          shiftTimeStart: '08:00',
          shiftActiveHours: 24,
          shiftRestDays: '0',
          shiftAccumulatedFault: 3,
          shiftCalculateFlag: '24x48',
          shiftDayStart: 1,
          shiftTemp: 0,
          shiftColor: '#ffffff',
        },
        {
          shiftName: '08:00 to 20:00 - Rest (12x36)',
          shiftTimeStart: '08:00',
          shiftActiveHours: 12,
          shiftRestDays: '0',
          shiftAccumulatedFault: 2,
          shiftCalculateFlag: '12x36',
          shiftDayStart: 1,
          shiftTemp: 0,
          shiftColor: '#ffffff',
        },
      ]

      // Crear todos los turnos
      for await(const shiftData of shiftsData) {
        const shift = await this.createShift(shiftData)
        createdShifts[shiftData.shiftName] = shift
      }

      // Preparar resumen
      const summary = Object.keys(createdShifts).map((key) => ({
        name: key,
        id: createdShifts[key].shiftId,
        code: createdShifts[key].shiftName,
        parentId: createdShifts[key].shiftTimeStart,
      }))

      return {
        status: 201,
        type: 'success',
        title: 'Shifts created successfully',
        message: 'The shifts were created successfully',
        data: {
          created: summary,
          total: Object.keys(createdShifts).length,
        },
      }
    } catch (error: any) {
      console.error('Error to create shifts:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to create shifts',
        message: 'An error occurred while trying to create the shifts',
        error: error.message,
        data: null,
      }
    }
  }


  /**
   * Asigna el turno 08:00 to 17:00 - Rest (Sat, Sun) a los empleados demo
   * 
   * @returns Objeto con el resultado de la operación y el total de empleados con el turno asignado
   */
  async assignShiftDemo() {
    try {
      const totalEmployeesWithShift = await EmployeeShift.query().count('* as total')

      const shiftId = await Shift.query()
        .where('shift_name', '08:00 to 17:00 - Rest (Sat, Sun)')
        .whereNull('shift_deleted_at')
        .first()
      if (!shiftId) {
        console.error('Shift not found:', shiftId)
        return {
          status: 400,
          type: 'error',
          title: 'Shift not found',
          message: 'The shift 08:00 to 17:00 - Rest (Sat, Sun) was not found',
          data: null,
        }
      }

      // Asignar el turno 08:00 to 17:00 - Rest (Sat, Sun) a los empleados demo
      const employees = await Employee.query()
        .whereNull('employee_deleted_at')

      for await(const employee of employees) {
        const employeeShift = new EmployeeShift()
        employeeShift.employeeId = employee.employeeId
        employeeShift.shiftId = shiftId?.shiftId
        employeeShift.employeShiftsApplySince = '2025-01-01'
        await employeeShift.save()
      }

      return {
        status: 201,
        type: 'success',
        title: 'Shifts assigned successfully',
        message: 'The shifts were assigned successfully',
        data: {
          total: totalEmployeesWithShift[0].$extras.total,
        },
      }
    } catch (error: any) {
      console.error('Error to assign shifts:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to assign shifts',
        message: 'An error occurred while trying to assign the shifts',
        error: error.message,
        data: null,
      }
    }
  }
}
