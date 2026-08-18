/**
 * Contrato HTTP del perfil de facturación fiscal del tenant (USRH1786737531057).
 *
 * Envoltura de éxito fijada para las historias siguientes de la cadena CAP-07-06:
 * `{ type: 'success', data: TenantBillingProfileView }`.
 * Errores: `{ title, detail, key, code }` vía prefijo `TNT.BILL.*`.
 */

/** Vista del perfil de facturación expuesta al cliente tenant. */
export interface TenantBillingProfileView {
  /** Indica si ya existe fila persistida en `tenant_billing_profiles`. */
  exists: boolean
  /** RFC en claro; `null` si no se ha capturado o se omitió en el alta. */
  rfc: string | null
  /** Razón social fiscal impresa en la factura (independiente del nombre legal registrado). */
  legalName: string
  /** ISO-8601 de creación; `null` cuando `exists` es false (sin fila). */
  createdAt: string | null
  /** ISO-8601 de última actualización; `null` cuando `exists` es false. */
  updatedAt: string | null
}

/** Entrada del upsert de perfil de facturación. */
export interface TenantBillingProfileUpsertInput {
  /** Obligatoria en el body HTTP; opcional aquí para distinguir "no enviado" vs `null`. */
  legalName: string
  /**
   * Ausente en el input del servicio = conservar valor previo en actualización.
   * `null` explícito = limpiar RFC y huella.
   */
  rfc?: string | null
}

/** Cuerpo JSON de error estable del módulo (`TNT.BILL.*`). */
export interface TenantBillingProfileErrorBody {
  title: string
  detail: string
  key: string
  code: string
}

/** Respuesta exitosa de GET/PUT `/api/billing/profile`. */
export interface TenantBillingProfileSuccessResponse {
  type: 'success'
  data: TenantBillingProfileView
}
