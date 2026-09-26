import Employee from '#models/employee'
import { AssistDayInterface } from './assist_day_interface.js'

/**
 * Filtros de `buildIncidentSummaryRow` (USRH1785766125036).
 */
interface AssistIncidentSummaryV2CalendarExcelFilterInterface {
  employee: Employee
  employeeCalendar: AssistDayInterface[]
  tardies: number
  toleranceCountPerAbsences: number
  dateEnd: string
  /**
   * Mapa `fecha-inicio-de-semana (ISO) -> tope semanal legal`, resuelto por
   * el motor de jornada para la unidad de negocio del reporte. `null` en
   * una semana implica jornada no resuelta (la celda del empleado se
   * reporta N/D).
   */
  weekHoursByLawMap: Map<string, number | null>
}
export type { AssistIncidentSummaryV2CalendarExcelFilterInterface }
