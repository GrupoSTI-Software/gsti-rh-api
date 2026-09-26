/**
 * Códigos estables para el cliente (tabulación de cuestionarios NOM-035).
 * Prefijo NOM035.TAB = NOM-035 Tabulación.
 */
export const NOM035_TABULATION_ERROR_CODES = {
  /** Parámetros de entrada inválidos (Vine o path param). */
  VAL_INPUT: 'NOM035.TAB.VAL_INPUT',
  /** La ronda no está cerrada y aún no es elegible para tabulación. */
  NOT_CLOSED: 'NOM035.TAB.NOT_CLOSED',
  /** La ronda no cumple el mínimo de respondientes exigido. */
  INSUFFICIENT_RESPONSES: 'NOM035.TAB.INSUFFICIENT_RESPONSES',
  /** La ronda no existe o está fuera del scope del usuario. */
  NOT_FOUND_APPLICATION: 'NOM035.TAB.NOT_FOUND_APPLICATION',
  /** La ronda existe, pero todavía no tiene tabulación persistida. */
  NOT_TABULATED: 'NOM035.TAB.NOT_TABULATED',
  /** Sin permiso para operar la tabulación. */
  FORBIDDEN: 'NOM035.TAB.FORBIDDEN',
  /** Option key inválido frente a la escala oficial de la pregunta. */
  INVALID_ANSWER_OPTION: 'NOM035.TAB.INVALID_ANSWER_OPTION',
  /** Error inesperado no tipado. */
  SYS_UNHANDLED: 'NOM035.TAB.SYS_UNHANDLED',
} as const

export type Nom035TabulationErrorCode =
  (typeof NOM035_TABULATION_ERROR_CODES)[keyof typeof NOM035_TABULATION_ERROR_CODES]
