import logger from '@adonisjs/core/services/logger'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'

/** Lo unico que estas guardas leen del colaborador. */
interface EmployeeBusinessUnit {
  employeeId: number
  businessUnitId: number | null
}

/**
 * Colaborador fuera del alcance de la peticion (VLRH-P0065).
 *
 * No lleva texto propio: `resolveAdmsApiError` le pone el titulo y el detalle
 * i18n de colaborador no encontrado (`access_point_employee_employee_not_found_*`,
 * los mismos del alta del vinculo). Lo lanzan `resolveScopedEmployee` y esta
 * guarda, asi que para quien pregunta es exactamente el mismo error. Un colaborador sin empresa no se distingue de
 * uno de otra empresa, y su id no sale en la respuesta.
 */
export class EmployeeOutOfScopeError extends AdmsError {
  constructor() {
    super(
      'colaborador-no-encontrado',
      ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
      404,
      'colaborador-no-encontrado'
    )
    this.name = 'EmployeeOutOfScopeError'
  }
}

function businessUnitOf(employee: EmployeeBusinessUnit): number | null {
  return employee.businessUnitId !== null && employee.businessUnitId !== undefined
    ? employee.businessUnitId
    : null
}

/**
 * Empresa del colaborador en la frontera multi-empresa, garantizada como
 * numero (VLRH-P0065).
 *
 * El modelo la declara `number`, pero la columna admite NULL. En la frontera
 * un `null` que se cuela como empresa (scope, alta, plantilla) es una fuga
 * silenciosa: aqui se corta como colaborador inexistente, con el mismo error
 * que `resolveScopedEmployee` da a uno fuera del alcance. El id va al log,
 * nunca a la respuesta.
 *
 * @throws EmployeeOutOfScopeError 404 `colaborador-no-encontrado` si no tiene empresa.
 */
export function requireEmployeeBusinessUnitId(employee: EmployeeBusinessUnit): number {
  const businessUnitId = businessUnitOf(employee)
  if (businessUnitId !== null) return businessUnitId
  logger.warn(
    { employeeId: employee.employeeId },
    'requireEmployeeBusinessUnitId: colaborador sin empresa, se responde como fuera de alcance'
  )
  throw new EmployeeOutOfScopeError()
}

/**
 * Empresa de un colaborador que ya se resolvio dentro del alcance (consulta
 * filtrada por empresa). Ahi un `null` no es de autorizacion sino de
 * integridad: se registra con el id y sale como error interno, que los
 * contratos de error responden con un 500 generico sin datos.
 *
 * @throws Error si no tiene empresa.
 */
export function requireStoredEmployeeBusinessUnitId(employee: EmployeeBusinessUnit): number {
  const businessUnitId = businessUnitOf(employee)
  if (businessUnitId !== null) return businessUnitId
  logger.error(
    { employeeId: employee.employeeId },
    'requireStoredEmployeeBusinessUnitId: colaborador ya resuelto en el alcance sin empresa'
  )
  throw new Error('Integridad: colaborador sin empresa')
}
