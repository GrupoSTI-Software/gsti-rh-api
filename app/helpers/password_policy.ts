/**
 * Política de contraseña del producto.
 *
 * Es la misma que aplican el backoffice (`new-password.helpers.ts`) y la app
 * (`password_policy.dart`), replicada aquí porque validar en el cliente no
 * valida nada: quien llame al endpoint directamente, o desde una versión vieja
 * de la app, se salta cualquier comprobación de pantalla.
 *
 * Cambiar una regla aquí obliga a cambiarla en los dos clientes: el backoffice
 * y la app pintan el medidor de fuerza con estas mismas cuatro.
 */

/** Longitud mínima. */
export const PASSWORD_MIN_LENGTH = 8

/** Símbolos aceptados como carácter especial. */
export const PASSWORD_SYMBOL_PATTERN = /[!@#$%^&*()_+[\]{}|;:,.<>?]/

/**
 * Las cuatro reglas en una sola expresión, para los validadores de VineJS, que
 * esperan un patrón y no una función.
 *
 * Equivale exactamente a {@link isValidPassword}; hay una prueba que compara
 * ambos caminos sobre el mismo set de casos para que no puedan separarse.
 */
export const PASSWORD_COMPLEXITY_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+[\]{}|;:,.<>?]).+$/

/** Estado de la política, una entrada por regla. */
export interface PasswordPolicyResult {
  minLength: boolean
  bothCases: boolean
  number: boolean
  symbol: boolean
}

/**
 * Evalúa la contraseña regla por regla.
 *
 * @param password - Contraseña candidata.
 * @returns Qué reglas cumple y cuáles no.
 */
export function evaluatePasswordPolicy(password: string): PasswordPolicyResult {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    bothCases: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: PASSWORD_SYMBOL_PATTERN.test(password),
  }
}

/**
 * Indica si la contraseña cumple la política completa.
 *
 * @param password - Contraseña candidata. Un valor que no sea texto se rechaza.
 * @returns true solo si cumple las cuatro reglas.
 */
export function isValidPassword(password: unknown): password is string {
  if (typeof password !== 'string') return false
  return Object.values(evaluatePasswordPolicy(password)).every(Boolean)
}
