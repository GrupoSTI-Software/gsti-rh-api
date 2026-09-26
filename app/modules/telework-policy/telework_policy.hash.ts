import { createHash } from 'node:crypto'
import type { TeleworkPolicyComponent } from '#models/telework_policy_template'

/**
 * Sello de contenido de una versión publicada de la Política de Teletrabajo
 * (regla de negocio 2). sha256 sin secreto: autentica integridad (lo
 * acusado no cambió), no autoría — la autoría la dan `published_by_user_id`
 * + `published_at`. Se sella DENTRO de la misma transacción que publica.
 *
 * Módulo-local, NO reusa `work_journal.hash.ts` (ese es HMAC con
 * `WORK_JOURNAL_HMAC_SECRET`, acoplado a otro dominio); solo se toma
 * prestado el truco de canonicalizar con claves ordenadas para que el hash
 * sea determinista sin depender del orden de las propiedades.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }
  if (value !== null && typeof value === 'object') {
    const ordered: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      ordered[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return ordered
  }
  return value
}

/** sha256 hex (64 chars) de `title + components` canonicalizado. */
export function computeTeleworkPolicyContentHash(
  title: string,
  components: TeleworkPolicyComponent[]
): string {
  const canonicalPayload = JSON.stringify(canonicalize({ title, components }))
  return createHash('sha256').update(canonicalPayload).digest('hex')
}
