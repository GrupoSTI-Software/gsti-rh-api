/**
 * Marca final que la baja agrega al código del colaborador para liberar el
 * original: `-IN<epoch en segundos>` (`EmployeeService.delete`). Solo al final
 * y solo con dígitos: un código como `MX-INV-7` no lleva marca y no se toca.
 */
export const EMPLOYEE_TERMINATION_CODE_SUFFIX_PATTERN = /-IN\d+$/

/**
 * Código original del colaborador: quita únicamente la marca final de la baja
 * (VLRH-H1790812613829, regla 3). Con un doble sufijo heredado quita solo el
 * último; sin marca devuelve el código tal cual. El modelo declara el código
 * como `number | string`, por eso acepta ambos y siempre devuelve texto.
 */
export function stripTerminationCodeSuffix(code: string | number): string {
  return String(code).replace(EMPLOYEE_TERMINATION_CODE_SUFFIX_PATTERN, '')
}
