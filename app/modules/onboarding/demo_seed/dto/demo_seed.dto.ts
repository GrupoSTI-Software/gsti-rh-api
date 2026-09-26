import type { OnboardingMeDto } from '#modules/onboarding/catalog/dto/catalog.dto'

/** Paquete de datos de práctica sembrado para el recorrido guiado. */
export interface DemoPackageDto {
  department: { departmentId: number; departmentName: string }
  position: { positionId: number; positionName: string }
  employee: {
    employeeId: number
    employeeCode: string
    /** Necesario para que el BO navegue a /employees-attendance-monitor/:employee_number. */
    employeeSlug: string | null
    firstName: string
    lastName: string
    secondLastName: string
    hireDate: string
  }
  shift: {
    shiftId: number
    shiftName: string
    shiftTimeStart: string
    shiftActiveHours: number
    shiftRestDays: string
  }
  attendance: { dates: string[]; checkIn: string; checkOut: string }
  vacations: { dates: string[] }
}

/**
 * Credencial de práctica. `password` viaja EN CLARO una única vez (el request
 * que la generó); en el caso idempotente siempre es null (scrypt no reversible).
 */
export interface DemoCredentialsDto {
  email: string
  password: string | null
  passwordAvailable: boolean
  generatedAt: string | null
}

/** Respuesta de POST /api/onboarding/me/demo-seed. */
export interface DemoSeedResultDto {
  seededAt: string | null
  alreadySeeded: boolean
  package: DemoPackageDto
  credentials: DemoCredentialsDto
  onboarding: OnboardingMeDto
}
