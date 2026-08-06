/**
 * Fila del "Resumen de incidencias" con paridad completa contra el builder
 * client-side (USRH1785766125036): 20 conteos base + reforma de 40h +
 * columnas condicionales de nomina (`toPay`/`discountFaults`).
 * Interfaz nueva (no reutiliza `AssistIncidentExcelRowInterface`, que se
 * queda con su forma de 19 columnas usada por el builder 3 de nomina).
 */
interface AssistIncidentSummaryV2ExcelRowInterface {
  workBusinessUnit: string
  payrollBusinessUnit: string
  employeeId: string
  employeeName: string
  department: string
  daysWorked: number
  daysOnTime: number
  tolerances: number
  delays: number
  earlyOuts: number
  rests: number
  sundayBonus: number
  vacations: number
  exeptions: number
  holidaysWorked: number
  restWorked: number
  faults: number
  delayFaults: number
  earlyOutsFaults: number
  totalFaults: number
  hoursWorked: number
  hoursAssigned: number
  timeDifferenceAssigned: number
  hoursByLaw: number | null
  timeDifferenceLaw: number | null
  toPay: number
  discountFaults: number
}
export type { AssistIncidentSummaryV2ExcelRowInterface }
