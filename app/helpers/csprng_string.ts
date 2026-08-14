import { randomBytes } from 'node:crypto'

/**
 * Generador de cadenas aleatorias criptográficamente seguras
 * (USRH1783115930049). Extraído del mecanismo que ya probó
 * `demo_password.ts` (USRH1785438246847, regla dura 2026-07-21:
 * `Math.random`/`cuid`/`cuid2` vetados para credenciales) para
 * que el resto del sistema deje de reimplementarlo.
 *
 * Usa `randomBytes` de `node:crypto` con muestreo con rechazo: se
 * descartan los bytes que caerían fuera del múltiplo exacto del
 * tamaño del alfabeto, así ningún carácter queda sobre-representado
 * por el sesgo de módulo.
 */
export function randomStringFromAlphabet(alphabet: string, length: number): string {
  if (alphabet.length === 0) {
    throw new Error('El alfabeto no puede estar vacío')
  }
  if (length <= 0) {
    throw new Error('La longitud debe ser mayor a cero')
  }

  const rejectionBound = 256 - (256 % alphabet.length)
  const chars: string[] = []
  while (chars.length < length) {
    const bytes = randomBytes(length * 2)
    for (const byte of bytes) {
      if (chars.length >= length) {
        break
      }
      if (byte < rejectionBound) {
        chars.push(alphabet[byte % alphabet.length])
      }
    }
  }
  return chars.join('')
}
