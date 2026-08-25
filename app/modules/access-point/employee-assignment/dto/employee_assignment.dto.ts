import type AccessPointEmployee from '#models/access_point_employee'

/**
 * Contrato de salida de una asignación entre empleado y punto de acceso.
 */
export type AccessPointEmployeeDto = {
  accessPointEmployeeId: number
  accessPointId: number
  employeeId: number
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
