import { EMPLOYEE_BADGE_ERROR_CODES } from '#constants/employee_badge_error_codes'
import { EmployeeBadgeError } from '#exceptions/employee_badge_error'

/**
 * Parseo manual de `employeeId` (path param) — espejo exacto de
 * `parseResourceId`/`parseProviderId` (`providers.controller.ts`,
 * `expediente.controller.ts`): sin VineJS para params simples, 422
 * `BDG.VAL.001` con key `entrada-invalida`.
 */
export function parseEmployeeIdParam(raw: unknown): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new EmployeeBadgeError(
      'El identificador del empleado es inválido.',
      EMPLOYEE_BADGE_ERROR_CODES.VAL_INPUT,
      422,
      'entrada-invalida'
    )
  }
  return id
}
