/**
 * Catálogo estable de códigos de error del módulo de contratos
 * de servicios especializados REPSE (anexo 15-D LFT).
 */
export const CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'CSE.VAL.001',
  /** Coherencia de fechas inválida */
  VAL_FECHAS: 'CSE.VAL.FECHAS.001',
  /** Contrato inexistente o ajeno al tenant */
  NOT_FOUND: 'CSE.NF.001',
  /** Empresa contratante inexistente o ajena al tenant */
  CONTRATANTE_NOT_FOUND: 'CSE.NF.CONTRATANTE.001',
  /** Registro REPSE activo no encontrado en el tenant */
  REPSE_NOT_FOUND: 'CSE.NF.REPSE.001',
  /** Número de contrato duplicado en el tenant */
  NUMERO_DUPLICATE: 'CSE.CONFLICT.NUMERO.001',
  /** serviciosRegistradosIds ausente o vacío */
  SERVICIOS_REGISTRADOS_REQUERIDOS: 'CSE.VAL.SERVICIOS.001',
  /** Algún id de servicio registrado no existe o es de otro tenant */
  SERVICIO_REGISTRADO_NOT_FOUND: 'CSE.NF.SERVICIO.001',
  /** Sin permiso sobre el módulo */
  FORBIDDEN: 'CSE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'CSE.SYS.001',
  /** Cabeceras del Excel de importación no emparejables */
  IMP_HEADERS: 'CSE.IMP.HEADERS.001',
  /** El archivo subido no es un Excel válido */
  IMP_ARCHIVO: 'CSE.IMP.FILE.001',
  /** Motivo de fila de importación no mapeable a un error tipado del dominio */
  IMP_FILA_INVALIDA: 'CSE.IMP.ROW.001',
  /** RFC de contratante no resuelto (índice ciego) dentro del tenant durante la importación */
  IMP_RFC_NF: 'CSE.IMP.CONTRATANTE.001',
  /** Número de contrato repetido entre filas del mismo archivo de importación */
  IMP_NUMERO_DUP_ARCHIVO: 'CSE.IMP.NUMERO.DUP.001',
  /** Celda compuesta (compromisos documentales o servicios registrados) malformada */
  IMP_CELDA_COMPUESTA: 'CSE.IMP.CELL.001',
  /** Límite de intentos de importación excedido para el usuario */
  IMP_RATE_LIMIT: 'CSE.IMP.RATE.001',
  /** Filas de datos por encima del máximo soportado en una sola petición */
  IMP_ROWS: 'CSE.IMP.ROWS.001',
} as const

export type ContratoServicioEspecializadoErrorCode =
  (typeof CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES)[keyof typeof CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES]

/** Contrato multipart documentado para POST /api/contratos-servicios-especializados/importacion */
export const CONTRATO_IMPORT_UPLOAD = {
  multipartField: 'archivo',
  acceptedExtensions: ['.xlsx'] as const,
  /** Alineado con límite del backoffice (10 MB) */
  maxFileBytes: 10 * 1024 * 1024,
  maxFileSizeLabel: '10 MB',
  /**
   * Tope de filas de datos por archivo (sin contar cabecera). Por encima de
   * este número, el procesamiento secuencial fila por fila arriesga superar el
   * timeout del proxy/gateway delante de esta API dentro de una sola petición
   * HTTP síncrona (mismo criterio que empleados).
   */
  maxDataRows: 500,
} as const
