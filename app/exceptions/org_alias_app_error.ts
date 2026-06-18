/**
 * Error de negocio para alias de organigrama (unicidad o formato).
 */
export default class OrgAliasAppError extends Error {
  readonly key: 'alias-en-uso' | 'alias-invalido'
  readonly title: string
  readonly detail: string

  constructor(key: 'alias-en-uso' | 'alias-invalido', title: string, detail: string) {
    super(detail)
    this.name = 'OrgAliasAppError'
    this.key = key
    this.title = title
    this.detail = detail
  }
}
