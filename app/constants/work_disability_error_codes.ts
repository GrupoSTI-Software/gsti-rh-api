/**
 * Códigos de error del dominio de incapacidades laborales.
 * USRH1784259058487 — 404 uniforme fuera de alcance (anti-IDOR).
 * USRH1787434050259 — validación de archivo y descarga privada.
 */
export const WORK_DISABILITY_ERROR_CODES = {
  NOT_FOUND: 'WD.NF.001',
  /** Archivo ausente o con formato/extensión no permitida. */
  INVALID_FILE: 'WD.VAL.FILE.001',
  /** Archivo excede el tamaño máximo permitido (10 MB). */
  FILE_TOO_LARGE: 'WD.VAL.FILE.002',
  /** Registrado en BD pero no encontrado en el almacenamiento (S3). */
  FILE_NOT_IN_STORAGE: 'WD.NF.FILE.001',
  /** Folio ausente o fuera del formato del IMSS (dos letras y seis dígitos). */
  FOLIO_INVALID: 'WD.VAL.FOLIO.001',
  /** El folio ya está asignado a otro periodo de la empresa. */
  FOLIO_DUPLICATED: 'WD.VAL.FOLIO.002',
  /** El rango se empalma con otro periodo del colaborador. */
  PERIOD_OVERLAP: 'WD.VAL.PER.001',
  /** El periodo inicial no se borra suelto: se borra la incapacidad. */
  INITIAL_PERIOD_LOCKED: 'WD.VAL.PER.002',
  /** Cobertura o tipo de periodo que no existe o no aplica. */
  INVALID_CATALOG: 'WD.VAL.CAT.001',
  /** El regreso anticipado cae fuera de los días amparados. */
  RETURN_OUT_OF_RANGE: 'WD.VAL.RET.001',
} as const
