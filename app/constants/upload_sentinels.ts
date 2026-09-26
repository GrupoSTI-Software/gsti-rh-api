/**
 * Valores centinela que `UploadService.fileUpload` devuelve en lugar de una
 * referencia cuando no hay archivo o cuando el almacenamiento falla.
 *
 * No son rutas: son un canal de error dentro del valor de retorno, heredado del
 * diseño original del servicio. Cada consumidor DEBE comprobarlos antes de
 * persistir el resultado; guardarlos deja en la base una referencia que no
 * apunta a ningún objeto y que reventará al intentar leerla.
 */
export const UPLOAD_FILE_NOT_FOUND = 'file_not_found'
export const UPLOAD_FAILED = 'S3Producer.fileUpload'

export const UPLOAD_FAILURE_SENTINELS = [UPLOAD_FILE_NOT_FOUND, UPLOAD_FAILED] as const

/**
 * Verdadero si el valor es un centinela de error y no una referencia real.
 *
 * Se usa en los dos extremos: al persistir, para no guardar basura; y al leer,
 * porque en la base ya hay filas con estos valores de subidas que fallaron
 * antes de que existiera esta comprobación.
 */
export function isUploadFailureSentinel(value: string | null | undefined): boolean {
  return (UPLOAD_FAILURE_SENTINELS as readonly string[]).includes(`${value ?? ''}`)
}
