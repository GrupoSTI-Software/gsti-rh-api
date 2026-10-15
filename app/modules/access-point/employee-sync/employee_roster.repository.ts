/** Datos de identificacion de un empleado de otra empresa, tal como estan en BD. */
export interface ForeignEmployeeRow {
  employeeId: number
  firstName: string | null
  lastName: string | null
  secondLastName: string | null
  /** Referencia guardada de la foto: URL publica o key privada del bucket. */
  photo: string | null
}

/**
 * Puerto de lectura del padron de un checador (VLRH-P0065, 6): lo que el
 * padron necesita y que el mixin de empresa no deja ver (nombres de empresa,
 * identidad del personal ajeno).
 */
export interface EmployeeRosterRepository {
  /** Nombre de cada empresa por id, en una sola consulta. */
  businessUnitNames(businessUnitIds: number[]): Promise<Map<number, string>>

  /**
   * Identificacion de los empleados dados, en una sola consulta y sin el
   * mixin: el llamador solo pide los de pivotes del aparato que ya puede leer.
   */
  foreignEmployees(employeeIds: number[]): Promise<ForeignEmployeeRow[]>
}
