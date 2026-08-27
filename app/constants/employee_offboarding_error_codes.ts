/**
 * Catálogo ÚNICO de códigos de error del módulo de salidas de personal
 * (cadena CAP-05-07). Lo crea "Configurar el catálogo de conceptos de salida"
 * (USRH1786568279581) y lo extienden las historias hermanas — USRH1786568279584
 * agrega `OFFB.CONCEPT.REORDER_INVALID` y `OFFB.CONCEPT.IN_USE`; no se
 * declaran aquí para no dejar constantes muertas.
 *
 * Convención vigente para toda la cadena: `OFFB.<SLICE>.<SEMANTICO>` en
 * SCREAMING_SNAKE, sin numeración (estilo `position_level_error_codes.ts`).
 * El BO ramifica su UI por `key`; estos códigos quedan para trazabilidad.
 */
export const EMPLOYEE_OFFBOARDING_ERROR_CODES = {
  /** Cuerpo o parámetros de consulta mal formados (VineJS) — 400. */
  VAL_INPUT: 'OFFB.CONCEPT.VAL_INPUT',
  /** Nombre duplicado en la misma empresa excluyendo eliminados (regla 4) — 409. */
  NAME_TAKEN: 'OFFB.CONCEPT.NAME_TAKEN',
  /** Concepto inexistente o fuera del alcance (regla 1) — 404 indistinguible. */
  NOT_FOUND: 'OFFB.CONCEPT.NOT_FOUND',
  /** Empresa inexistente, eliminada o fuera del alcance — 422. */
  REF_INVALID: 'OFFB.CONCEPT.REF_INVALID',
  /** Alterar la naturaleza o eliminar el concepto derivado (regla 6) — 422. */
  SOURCE_LOCKED: 'OFFB.CONCEPT.SOURCE_LOCKED',
  /** Segundo concepto derivado del inventario en la misma empresa (regla 6) — 409. */
  SOURCE_DUPLICATED: 'OFFB.CONCEPT.SOURCE_DUPLICATED',
  /** Reordenamiento con ids ajenos, duplicados o lista incompleta (USRH1786568279584) — 422. */
  REORDER_INVALID: 'OFFB.CONCEPT.REORDER_INVALID',
  /** Concepto ya usado en alguna salida registrada: se desactiva, no se elimina (USRH1786568279584) — 409. */
  IN_USE: 'OFFB.CONCEPT.IN_USE',
  /** Sin permiso sobre el módulo employee-offboardings (regla 9) — 403. */
  FORBIDDEN: 'OFFB.CONCEPT.FORBIDDEN',
  /** Error no clasificado del dominio — 500. */
  SYS_UNHANDLED: 'OFFB.CONCEPT.UNEXPECTED',
  /** Cuerpo o parámetros del expediente mal formados (USRH1786568279587) — 400. */
  CASE_VAL_INPUT: 'OFFB.CASE.VAL_INPUT',
  /** Colaborador inexistente o fuera del alcance (USRH1786568279587) — 404 uniforme. */
  CASE_EMPLOYEE_NOT_FOUND: 'OFFB.CASE.EMPLOYEE_NOT_FOUND',
  /** Colaborador sin expediente de salida abierto (USRH1786568279587) — 404. */
  CASE_NOT_FOUND: 'OFFB.CASE.NOT_FOUND',
  /** Ya existe un expediente abierto para el colaborador (regla 1, USRH1786568279587) — 409. */
  CASE_ALREADY_OPEN: 'OFFB.CASE.ALREADY_OPEN',
  /** Sin permiso sobre employee-offboardings en el slice del expediente — 403. */
  CASE_FORBIDDEN: 'OFFB.CASE.FORBIDDEN',
  /** Error no controlado del expediente — 500. */
  CASE_UNEXPECTED: 'OFFB.CASE.UNEXPECTED',
  /** Cerrar un expediente ya cerrado (USRH1786568279596) — 409. */
  CASE_ALREADY_CLOSED: 'OFFB.CASE.ALREADY_CLOSED',
  /** Reabrir un expediente que sigue abierto (USRH1786568279596) — 409. */
  CASE_NOT_CLOSED: 'OFFB.CASE.NOT_CLOSED',
  /** Escritura sobre pendientes o comprobantes de un expediente cerrado (regla 8, USRH1786568279596) — 409. */
  CASE_CLOSED_READ_ONLY: 'OFFB.CASE.CLOSED_READ_ONLY',
  /** Pendiente o expediente inexistente o fuera del alcance (USRH1786568279590) — 404 uniforme. */
  ITEM_NOT_FOUND: 'OFFB.ITEM.NOT_FOUND',
  /** Completar un pendiente ya cumplido (regla 3, USRH1786568279590) — 409. */
  ITEM_ALREADY_COMPLETED: 'OFFB.ITEM.ALREADY_COMPLETED',
  /** Revertir un pendiente que sigue pendiente (regla 3, USRH1786568279590) — 409. */
  ITEM_NOT_COMPLETED: 'OFFB.ITEM.NOT_COMPLETED',
  /** Importe en un pendiente cuyo concepto no lo admite (regla 4, USRH1786568279590) — 422. */
  ITEM_AMOUNT_NOT_ALLOWED: 'OFFB.ITEM.AMOUNT_NOT_ALLOWED',
  /**
   * Insumo no disponible al completar (regla 10, USRH1786568279590). NO es
   * respuesta de error: viaja como `supplyDiagnosticCode` en el cuerpo de
   * ÉXITO — el pendiente se completa igual y soporte puede rastrear por qué
   * se cerró sin retirar nada.
   */
  ITEM_SUPPLY_UNAVAILABLE: 'OFFB.ITEM.SUPPLY_UNAVAILABLE',
  /** Archivo con extensión o MIME fuera de PDF/JPG/PNG (regla 2, USRH1786568279593) — 400. */
  EVID_INVALID_FILE_TYPE: 'OFFB.EVID.INVALID_FILE_TYPE',
  /** Archivo mayor a 10 MB (regla 2, USRH1786568279593) — 400. */
  EVID_FILE_TOO_LARGE: 'OFFB.EVID.FILE_TOO_LARGE',
  /** Envío vacío o con más de 5 archivos (regla 2, USRH1786568279593) — 400. */
  EVID_BATCH_INVALID: 'OFFB.EVID.BATCH_INVALID',
  /** Evidencia inexistente o ajena al pendiente (D-8, USRH1786568279593) — 404 uniforme. */
  EVID_NOT_FOUND: 'OFFB.EVID.NOT_FOUND',
  /** Fallo de S3 al subir o al firmar el enlace (USRH1786568279593) — 500. */
  EVID_S3_FAILED: 'OFFB.EVID.S3_FAILED',
  /** Cuerpo o parámetros del documento mal formados (USRH1787433503686) — 400. */
  DOC_VAL_INPUT: 'OFFB.DOC.VAL_INPUT',
  /** Sin permiso create (emitir) o read (listar/descargar) — 403. */
  DOC_FORBIDDEN: 'OFFB.DOC.FORBIDDEN',
  /** Expediente inexistente, borrado o de otra empresa — 404 uniforme. */
  DOC_CASE_NOT_FOUND: 'OFFB.DOC.CASE_NOT_FOUND',
  /** Documento inexistente, borrado o de otro expediente — 404 uniforme. */
  DOC_NOT_FOUND: 'OFFB.DOC.NOT_FOUND',
  /** Segunda emisión sobre el mismo expediente (regla 9, H1a) — 409. */
  DOC_ALREADY_ISSUED: 'OFFB.DOC.ALREADY_ISSUED',
  /** Falta un dato obligatorio del documento (regla 6) — 422. */
  DOC_INCOMPLETE: 'OFFB.DOC.INCOMPLETE',
  /** Colaborador todavía activo (regla 1) — 422. */
  DOC_EMPLOYEE_STILL_ACTIVE: 'OFFB.DOC.EMPLOYEE_STILL_ACTIVE',
  /** pdfkit falló o el buffer salió vacío — 500. */
  DOC_RENDER_FAILED: 'OFFB.DOC.RENDER_FAILED',
  /** `uploadPrivateBuffer` devolvió null — 500. */
  DOC_STORAGE_FAILED: 'OFFB.DOC.STORAGE_FAILED',
  /** `getDownloadLink` no devolvió una cadena — 500. */
  DOC_DOWNLOAD_FAILED: 'OFFB.DOC.DOWNLOAD_FAILED',
  /** Error no clasificado del slice de documentos — 500. */
  DOC_UNEXPECTED: 'OFFB.DOC.UNEXPECTED',
} as const

export type EmployeeOffboardingErrorCode =
  (typeof EMPLOYEE_OFFBOARDING_ERROR_CODES)[keyof typeof EMPLOYEE_OFFBOARDING_ERROR_CODES]
