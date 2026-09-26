/**
 * Idiomas en los que existe el catálogo de correos. Se mantienen los dos: las
 * cadenas se siguen escribiendo en `es` y `en` para no acumular deuda cuando el
 * producto abra el inglés.
 */
export type MailLocale = 'es' | 'en'

/**
 * Idioma en el que sale TODO correo del producto hoy.
 *
 * El backoffice y la app ya se pueden usar en inglés, pero la comunicación por
 * correo todavía no está revisada en ese idioma, y un mensaje a medio traducir
 * se ve peor que uno en español. Hasta el lanzamiento en inglés, los correos
 * salen en español sin importar lo que pida el cliente.
 */
export const MAIL_FORCED_LOCALE: MailLocale = 'es'

/**
 * Resuelve el idioma de un correo.
 *
 * Hoy ignora lo solicitado y devuelve siempre {@link MAIL_FORCED_LOCALE}. Es el
 * único punto donde se decide: para abrir el inglés basta con devolver
 * `requested`, sin tocar ningún mail ni ninguna vista.
 *
 * @param requested - Idioma que pidió el cliente. Se conserva en las firmas
 *   para que abrir el inglés no obligue a volver a cablear a los llamadores.
 * @returns El idioma en el que se debe redactar el correo.
 */
export function resolveMailLocale(requested?: MailLocale | string | null): MailLocale {
  // `requested` se ignora a propósito: ver MAIL_FORCED_LOCALE.
  void requested
  return MAIL_FORCED_LOCALE
}
