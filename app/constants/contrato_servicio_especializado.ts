/**
 * Reglas de negocio de los contratos de servicios especializados REPSE.
 */

/**
 * Umbral de "por vencer": un contrato con estatus efectivo `vigente` cuya
 * `fechaFin` cae dentro de estos días (inclusive, en zona de negocio) se
 * marca `porVencer`. Fuente única para el listado de contratos, su filtro y
 * el panorama REPSE.
 */
export const CONTRATO_POR_VENCER_UMBRAL_DIAS = 45
