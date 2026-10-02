/**
 * Puerto de las direcciones aproximadas: traduce coordenadas a una dirección
 * legible. Devuelve `null` si el servicio no conoce una dirección para ese
 * punto y lanza si no respondió.
 */
export interface ReverseGeocoder {
  reverse(latitude: number, longitude: number): Promise<string | null>
}
