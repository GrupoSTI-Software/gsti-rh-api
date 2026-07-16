/**
 * Códigos estables para el cliente (aplicabilidad de cuestionarios NOM-035).
 * Prefijo NOM035.APP = NOM-035 Questionnaire Applicability.
 */
export const QUESTIONNAIRE_APPLICABILITY_ERROR_CODES = {
  /** Parámetros de query inválidos (Vine) */
  VAL_INPUT: 'NOM035.APP.VAL_INPUT',
  /** Sucursal inexistente, eliminada o fuera del alcance del tenant */
  NOT_FOUND_BRANCH: 'NOM035.APP.NOT_FOUND_BRANCH',
  /** Empresa inexistente o fuera del alcance del tenant */
  NOT_FOUND_COMPANY: 'NOM035.APP.NOT_FOUND_COMPANY',
  /** Sin permisos para consultar este módulo */
  FORBIDDEN: 'NOM035.APP.FORBIDDEN',
  /** Error no tipado en el controlador (revisar logs) */
  SYS_UNHANDLED: 'NOM035.APP.SYS_UNHANDLED',
} as const

export type QuestionnaireApplicabilityErrorCode =
  (typeof QUESTIONNAIRE_APPLICABILITY_ERROR_CODES)[keyof typeof QUESTIONNAIRE_APPLICABILITY_ERROR_CODES]
