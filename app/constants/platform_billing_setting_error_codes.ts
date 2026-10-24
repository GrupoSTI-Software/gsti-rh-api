/** Prefijo PLT.BSET = PLaTaforma · Billing SETting (VLRH-H1791939650950). */
export const PLATFORM_BILLING_SETTING_ERROR_CODES = {
    /** Body o query inválido (Vine) */
    VAL_INPUT: 'PLT.BSET.VAL_INPUT',
    /** Error no tipado del sistema */
    SYS_UNHANDLED: 'PLT.BSET.SYS_UNHANDLED',
  } as const
  
  export type PlatformBillingSettingErrorCode =
    (typeof PLATFORM_BILLING_SETTING_ERROR_CODES)[keyof typeof PLATFORM_BILLING_SETTING_ERROR_CODES]