const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV4_MAPPED_PREFIX = '::ffff:'

function parseIpv4(value: string): number | null {
  const match = IPV4_PATTERN.exec(value)
  if (!match) return null
  let result = 0
  for (let index = 1; index <= 4; index += 1) {
    const octet = Number(match[index])
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null
    result = result * 256 + octet
  }
  return result
}

function normalizeIp(value: string): string {
  return value.startsWith(IPV4_MAPPED_PREFIX) ? value.slice(IPV4_MAPPED_PREFIX.length) : value
}

/**
 * Verdadero si la IP cae en alguna entrada de la lista.
 *
 * IPv4 con o sin mascara (`/32` implicito); IPv6 solo por igualdad exacta.
 * Una entrada invalida nunca autoriza: la lista es fail-closed cuando esta
 * configurada (spec v2, 13, regla 10).
 */
export function ipMatchesCidrList(ip: string, cidrs: readonly string[]): boolean {
  const candidate = normalizeIp(ip.trim())
  if (candidate.length === 0) return false
  const candidateV4 = parseIpv4(candidate)

  for (const entry of cidrs) {
    const [base, maskText] = entry.trim().split('/')
    const baseV4 = parseIpv4(base)

    if (baseV4 === null) {
      if (maskText === undefined && base.length > 0 && base === candidate) return true
      continue
    }
    if (candidateV4 === null) continue

    const mask = maskText === undefined ? 32 : Number(maskText)
    if (!Number.isInteger(mask) || mask < 0 || mask > 32) continue
    const bits = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0
    if (((candidateV4 & bits) >>> 0) === ((baseV4 & bits) >>> 0)) return true
  }
  return false
}
