import Employee from '#models/employee'
import { DateTime } from 'luxon'

interface ShiftExceptionGeneralErrorInterface {
  shiftExceptionsDate: string | null | DateTime
  employee: Employee
  error: string
}

export type { ShiftExceptionGeneralErrorInterface }
