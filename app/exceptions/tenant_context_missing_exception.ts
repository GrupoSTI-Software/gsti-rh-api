export const TENANT_CONTEXT_MISSING = {
  code: 'TENANT.CONTEXT.MISSING',
  title: 'No se identificó la empresa de la consulta',
  key: 'no-se-identifico-la-empresa-de-la-consulta',
} as const

export type TenantContextMissingHook = 'find' | 'fetch' | 'paginate'

export class TenantContextMissingException extends Error {
  readonly code = TENANT_CONTEXT_MISSING.code
  readonly key = TENANT_CONTEXT_MISSING.key
  readonly title = TENANT_CONTEXT_MISSING.title
  readonly httpStatus = 500
  readonly detail: string
  readonly table: string
  readonly hook: TenantContextMissingHook

  constructor(table: string, hook: TenantContextMissingHook) {
    const detail =
      `La consulta a «${table}» (${hook}) se ejecutó sin empresa identificada y sin excepción declarada. ` +
      'Ábrela con TenantContext.run(alcance) o declárala con TenantContext.runUnscoped y un motivo de TENANT_UNSCOPED_REASON.'
    super(`${TENANT_CONTEXT_MISSING.title}: ${detail}`)
    this.name = 'TenantContextMissingException'
    this.detail = detail
    this.table = table
    this.hook = hook
  }
}
