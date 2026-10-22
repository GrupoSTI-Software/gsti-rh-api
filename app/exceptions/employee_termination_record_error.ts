import {
  EMPLOYEE_TERMINATION_RECORD_ERROR_CODES,
  type EmployeeTerminationRecordErrorCode,
} from '../constants/employee_termination_record_error_codes.js'

/**
 * Error de dominio del registro de baja en la ficha (VLRH-H1792172889566).
 * Espejo de `EmployeeReactivationError` sin `data`: los dos rechazos llevan
 * texto fijo y nunca ecoan el payload (modalidad y tipo son datos laborales
 * confidenciales). Se responde antes del permiso cuando se decide con la fila
 * leída, y se lanza dentro de la transacción cuando se decide con la fila
 * bloqueada, para que el guardado completo haga rollback.
 */
export class EmployeeTerminationRecordError extends Error {
  readonly errorCode: EmployeeTerminationRecordErrorCode
  readonly httpStatus: number
  readonly key: string

  constructor(
    message: string,
    errorCode: EmployeeTerminationRecordErrorCode,
    key: string,
    httpStatus: number = 400
  ) {
    super(message)
    this.name = 'EmployeeTerminationRecordError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }

  /** Regla 1: en un activo el trío no se pone, cambia ni vacía desde la ficha. */
  static activeChangeForbidden(): EmployeeTerminationRecordError {
    return new EmployeeTerminationRecordError(
      'La fecha, la modalidad y el tipo de baja de un colaborador activo se programan en la sección Expediente de salida de su ficha. No se guardó ningún cambio.',
      EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.ACTIVE_CHANGE_FORBIDDEN,
      'baja-solo-desde-el-expediente'
    )
  }

  /** Regla 4: un dado de baja no se queda sin fecha de baja; para volver existe Reactivar. */
  static clearForbidden(): EmployeeTerminationRecordError {
    return new EmployeeTerminationRecordError(
      'El colaborador está dado de baja y su fecha de baja no puede quedar vacía. Para volver a activarlo usa Reactivar. No se guardó ningún cambio.',
      EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.CLEAR_FORBIDDEN,
      'la-baja-no-se-puede-quitar-desde-la-ficha'
    )
  }

  /**
   * VLRH-H1792361735984, regla 3c: la baja antigua de un activo con expediente
   * de salida en curso no se quita desde la ficha; se cancela en el expediente.
   * 409: conflicto con el estado del expediente, misma familia que el cupo.
   */
  static openCase(): EmployeeTerminationRecordError {
    return new EmployeeTerminationRecordError(
      'El colaborador tiene un expediente de salida en curso. Para quitar la baja, cancélala en la sección Expediente de salida de su ficha. No se guardó ningún cambio.',
      EMPLOYEE_TERMINATION_RECORD_ERROR_CODES.OPEN_CASE,
      'baja-programada-en-el-expediente',
      409
    )
  }
}
