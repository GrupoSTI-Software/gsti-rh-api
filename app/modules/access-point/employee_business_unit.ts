import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'

/**
 * Empresa del colaborador, garantizada como numero (VLRH-P0065).
 *
 * El modelo la declara `number`, pero la columna admite NULL. En la frontera
 * multi-empresa un `null` que se cuela como empresa (scope, alta, plantilla)
 * es una fuga silenciosa: aqui se corta como colaborador inexistente, igual
 * que `resolveScopedEmployee` trata a uno fuera del alcance. Sustituye a los
 * `as number` sobre `employee.businessUnitId`.
 *
 * @throws AdmsError 404 `colaborador-no-encontrado` si no tiene empresa.
 */
export function requireEmployeeBusinessUnitId(employee: {
  employeeId: number
  businessUnitId: number | null
}): number {
  if (employee.businessUnitId !== null && employee.businessUnitId !== undefined) {
    return employee.businessUnitId
  }
  throw new AdmsError(
    `El colaborador ${employee.employeeId} no tiene empresa`,
    ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
    404,
    'colaborador-no-encontrado',
    'No se encontro el colaborador.'
  )
}
