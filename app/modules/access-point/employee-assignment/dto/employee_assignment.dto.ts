import type AccessPointEmployee from '#models/access_point_employee'

/**
 * Contrato de salida de una asignación entre empleado y punto de acceso.
 */
export type AccessPointEmployeeDto = {
  accessPointEmployeeId: number
  accessPointId: number
  employeeId: number
  /**
   * Biometricos que salieron en copia hacia el equipo con esta alta.
   *
   * Se informa porque es trabajo que ocurrio sin que nadie lo pidiera: la
   * pantalla tiene que poder decir que la persona ya no necesita volver al
   * lector, o que no se copio nada y si tendra que volver.
   */
  queuedBiometrics?: number
  /**
   * El equipo no puede recibir ninguna de las huellas guardadas.
   *
   * Su version de algoritmo no coincide con la de los templates de la boveda, y
   * un template de otra generacion se descarta DENTRO del aparato sin devolver
   * error. La persona queda dada de alta pero no podra identificarse con el
   * dedo ahi hasta que se enrole en ese equipo.
   *
   * Se informa en el alta y no solo en la bitacora porque el operador esta
   * frente a la pantalla en ese momento: es cuando puede mandar a la persona al
   * lector en vez de enterarse el dia que se quede parada en la puerta.
   */
  fingerprintVersionMismatch?: boolean
}

/**
 * Reduce el modelo a lo que el cliente necesita.
 *
 * No se expone el pin ni la unidad de negocio: el primero es dato de la
 * terminal y la segunda es interna del control de alcance.
 *
 * @param model Registro de la asignación.
 * @returns El contrato de salida.
 */
export const toAccessPointEmployeeDto = (
  model: AccessPointEmployee
): AccessPointEmployeeDto => ({
  accessPointEmployeeId: model.accessPointEmployeeId,
  accessPointId: model.accessPointId,
  employeeId: model.employeeId,
})
