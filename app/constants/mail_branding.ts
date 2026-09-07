/**
 * Identidad con la que sale TODO correo del producto: nombre y logotipo de
 * Valanserh, no los de la empresa cliente. Mismo criterio que los correos de
 * acceso (`magic_link_mail`), hasta que exista marca blanca.
 */
export const MAIL_BRAND_TRADE_NAME = 'Valanserh'

export const MAIL_BRAND_LOGO_URL =
  'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'

/**
 * Zona en la que se escriben las fechas de los correos. Los clientes operan en
 * el centro de México; el servidor corre en UTC.
 */
export const MAIL_TIME_ZONE = 'America/Mexico_City'
