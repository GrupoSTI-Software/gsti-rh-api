export const QUESTIONNAIRE_APPLICATION_FOLIO_PREFIX = 'NOM035'

export const QUESTIONNAIRE_APPLICATION_STATUSES = ['borrador', 'en-curso', 'cerrada'] as const
export const QUESTIONNAIRE_APPLICATION_OPEN_STATUSES = ['en-curso'] as const
export const QUESTIONNAIRE_APPLICATION_TARGET_STATUSES = ['pendiente', 'respondido'] as const
export const QUESTIONNAIRE_APPLICATION_INSTRUMENTS = ['guide_ii', 'guide_iii'] as const

export const INSTRUMENT_TO_QUESTIONNAIRE_CODE = {
  guide_ii: 'GUIA-II-NOM035',
  guide_iii: 'GUIA-III-NOM035',
} as const
