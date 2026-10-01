/**
 * Tipos de resultado del borrado de estructura organizacional
 * (USRH1788466831356). Los controladores leen solo estas formas, sin acceso
 * a los modelos internos del servicio.
 */

/**
 * Resultado de una eliminación exitosa (201).
 * `affectedEmployees` es el número de filas que `update()` de MySQL reportó
 * como modificadas (`.affectedRows`), no un conteo previo.
 */
export interface OrgStructureDeleteResult {
  /** Número de empleados que quedaron sin departamento o sin puesto. */
  affectedEmployees: number
}

/**
 * Resultado del conteo previo al eliminar un departamento (R3).
 * La transacción queda abierta hasta confirmar o cancelar.
 */
export interface OrgStructureCountResult {
  /** Empleados activos de la empresa asignados a ese departamento. */
  affectedEmployees: number
}
