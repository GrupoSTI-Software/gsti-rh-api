/**
 * Error de dominio para `PositionApprovalHistory` (USRH1784259058555).
 * Permite al controlador responder con el código HTTP correcto (404 fuera
 * de scope) en vez de caer al 500 genérico.
 */
export class PositionApprovalHistoryError extends Error {
  readonly httpStatus: number

  constructor(message: string, httpStatus: number = 404) {
    super(message)
    this.name = 'PositionApprovalHistoryError'
    this.httpStatus = httpStatus
  }
}
