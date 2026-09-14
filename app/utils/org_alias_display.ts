/**
 * Resuelve la etiqueta que se imprime en las columnas de estructura
 * (departamento y puesto) de los reportes de asistencia en Excel.
 *
 * Se muestra el alias cuando la empresa lo capturó y el nombre cuando no hay
 * alias (USRH1788466831291, regla 3). Cuando no hay ninguno de los dos —el
 * empleado no tiene departamento o puesto asignado, o su registro fue
 * eliminado del organigrama y ya no se carga— la celda queda vacía, sin
 * texto de relleno (regla 2).
 *
 * Los parámetros aceptan `null` y `undefined` a propósito: el departamento y
 * el puesto del empleado son opcionales, y el preload los deja sin valor
 * cuando el registro ya no existe. Quien llama pasa el acceso con `?.` y esta
 * funcion se encarga del resto.
 *
 * @param alias Alias capturado por la empresa para el registro.
 * @param name Nombre del registro.
 * @returns El alias, el nombre, o cadena vacía. Nunca `null` ni `undefined`.
 */
export function resolveOrgAliasDisplay(
  alias?: string | null,
  name?: string | null
): string {
  if (alias) {
    return alias
  }
  if (name) {
    return name
  }
  return ''
}
