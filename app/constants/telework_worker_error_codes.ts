/**
 * Catálogo estable de códigos de error del listado de teletrabajadores
 * (NOM-037 5.1, vista derivada). Se usan en las respuestas HTTP para que
 * los clientes reaccionen sin parsear mensajes localizados.
 *
 * Ver `docs/spec-USRH1782792802491.md` §4.
 */
export const TWK_ERROR_CODES = {
  /** Usuario sin permiso de lectura del módulo de teletrabajo */
  FORBIDDEN: 'TWK.AUTH.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'TWK.SYS.001',
} as const

export type TwkErrorCode = (typeof TWK_ERROR_CODES)[keyof typeof TWK_ERROR_CODES]

/** Slug del módulo/permiso del listado de teletrabajadores en el menú. */
export const TELEWORK_WORKERS_MODULE_SLUG = 'telework-workers'
