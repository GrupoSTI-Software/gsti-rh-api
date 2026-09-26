/**
 * Códigos estables para el cliente (registro self-service / signup).
 * Prefijo SGNP = Signup.
 */
export const SIGNUP_ERROR_CODES = {
  /**
   * Falló la provisión del `system_settings` del tenant nuevo dentro de la
   * transacción del alta (USRH1783712837572). El alta completa se revierte
   * (fail-closed, sin fallback silencioso).
   */
  SETTINGS_PROVISIONING_FAILED: 'SGNP.SETTINGS.001',
  /** Error no tipado durante el armado transaccional del alta (revisar logs). */
  SYS_UNHANDLED: 'SGNP.SYS.001',
} as const

export type SignupErrorCode = (typeof SIGNUP_ERROR_CODES)[keyof typeof SIGNUP_ERROR_CODES]
