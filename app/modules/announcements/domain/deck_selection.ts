import type { DateTime } from 'luxon'
import {
  ANNOUNCEMENT_DECK_MAX_SLIDES,
  type AnnouncementSlideStatus,
  type AnnouncementSlideType,
} from '../announcements.constants.js'

/** Lo mínimo de un slide que la selección necesita para decidir. */
export interface DeckCandidate {
  id: number
  type: AnnouncementSlideType
  sortOrder: number
  status: AnnouncementSlideStatus
  publishedAt: DateTime | null
  permissionKey: string | null
}

/** Un slide publicado siempre tiene fecha de publicación. */
type PublishedCandidate<T extends DeckCandidate> = T & { publishedAt: DateTime }

function isPublished<T extends DeckCandidate>(slide: T): slide is PublishedCandidate<T> {
  return slide.status === 'published' && slide.publishedAt !== null
}

/**
 * Elige los slides del deck de un usuario. Función pura: no consulta BD ni reloj.
 *
 * Reglas:
 *  - Solo slides publicados.
 *  - Sin `permissionKey` los ve todo usuario; con clave, solo si está en
 *    `grantedPermissionKeys` (resuelto antes con el mecanismo de `permissionGate`).
 *  - Sin marca (`lastSeenAt` null, primer ingreso): solo `onboarding`, por
 *    `sortOrder` asc e `id` asc; se conservan los primeros cinco.
 *  - Con marca: solo `feature` con `publishedAt` estrictamente posterior a la marca,
 *    por `publishedAt` asc y `sortOrder` asc (`id` desempata); si pasan de cinco, se
 *    conservan los cinco más recientes, en el mismo orden.
 */
export function selectDeckSlides<T extends DeckCandidate>(
  slides: readonly T[],
  lastSeenAt: DateTime | null,
  grantedPermissionKeys: ReadonlySet<string>
): T[] {
  const visible = slides
    .filter(isPublished)
    .filter((slide) => slide.permissionKey === null || grantedPermissionKeys.has(slide.permissionKey))

  if (lastSeenAt === null) {
    return visible
      .filter((slide) => slide.type === 'onboarding')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .slice(0, ANNOUNCEMENT_DECK_MAX_SLIDES)
  }

  const seenMillis = lastSeenAt.toMillis()
  return visible
    .filter((slide) => slide.type === 'feature' && slide.publishedAt.toMillis() > seenMillis)
    .sort(
      (a, b) =>
        a.publishedAt.toMillis() - b.publishedAt.toMillis() ||
        a.sortOrder - b.sortOrder ||
        a.id - b.id
    )
    .slice(-ANNOUNCEMENT_DECK_MAX_SLIDES)
}

/**
 * Fecha de publicación más reciente entre TODOS los slides publicados, sin filtrar
 * por tipo ni por permiso. El BO la manda como nueva marca al cerrar el deck: así un
 * slide que el usuario no puede ver no lo hace reaparecer en cada ingreso.
 */
export function latestPublishedAt(slides: readonly DeckCandidate[]): DateTime | null {
  let latest: DateTime | null = null
  for (const slide of slides) {
    if (!isPublished(slide)) continue
    if (latest === null || slide.publishedAt.toMillis() > latest.toMillis()) {
      latest = slide.publishedAt
    }
  }
  return latest
}

/** Claves de permiso distintas de los slides publicados: las que hay que resolver. */
export function publishedPermissionKeys(slides: readonly DeckCandidate[]): string[] {
  const keys = new Set<string>()
  for (const slide of slides) {
    if (isPublished(slide) && slide.permissionKey !== null) keys.add(slide.permissionKey)
  }
  return [...keys]
}
