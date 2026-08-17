export default class SessionPermissionTreeUnresolvedError extends Error {
  constructor(message = 'No se pudo determinar el rol de la sesión') {
    super(message)
    this.name = 'SessionPermissionTreeUnresolvedError'
  }
}
