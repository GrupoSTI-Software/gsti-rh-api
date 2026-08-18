/**
 * Enmascara el buzón de un correo para pantallas públicas de invitación.
 * Criterio: primer carácter + `***` + `@` + dominio completo (`j***@empresa.com`).
 */
export function maskUserEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) {
    return '***'
  }

  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)
  const visibleChar = localPart.slice(0, 1)

  return `${visibleChar}***@${domain}`
}
