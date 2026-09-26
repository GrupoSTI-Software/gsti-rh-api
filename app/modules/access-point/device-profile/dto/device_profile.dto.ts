import type AccessPointProfile from '#models/access_point_profile'
import type {
  AccessPointClockSyncStatus,
  AccessPointProfileVersionsSource,
} from '#models/access_point_profile'
import type { AdmsDialect } from '#modules/adms/adms.constants'

export interface DeviceProfileDto {
  accessPointId: number
  available: boolean
  platform: string | null
  firmware: string | null
  pushVersion: string | null
  oemVendor: string | null
  dialect: AdmsDialect | null
  layoutKnown: boolean
  registryCode: string | null
  versions: {
    fp: string | null
    face: string | null
    fv: string | null
    pv: string | null
    source: AccessPointProfileVersionsSource | null
  }
  capabilities: {
    multiBioDataSupport: string | null
    multiBioPhotoSupport: string | null
    maxFaceCount: number | null
    maxUserPhotoCount: number | null
    maxUserCount: number | null
    maxFingerCount: number | null
    maxAttLogCount: number | null
  }
  counters: {
    users: number | null
    fingerprints: number | null
    faces: number | null
    transactions: number | null
  }
  features: {
    finger: number | null
    face: number | null
    photo: number | null
    userPicUrl: number | null
    visualIntercom: number | null
    sip: number | null
    subcontractingUpgrade: number | null
    videoProtocol: string | null
  }
  clock: {
    offsetSeconds: number | null
    measuredAt: string | null
    syncedAt: string | null
    status: AccessPointClockSyncStatus | null
  }
  optionsReadAt: string | null
  lastIpSeen: string | null
  lastIpSeenAt: string | null
}

/** Perfil consultable. Sin `optionsRaw`: es evidencia, no contrato del BO. */
export function toDeviceProfileDto(
  accessPointId: number,
  profile: AccessPointProfile | null
): DeviceProfileDto {
  if (!profile) {
    return {
      accessPointId,
      available: false,
      platform: null,
      firmware: null,
      pushVersion: null,
      oemVendor: null,
      dialect: null,
      layoutKnown: false,
      registryCode: null,
      versions: { fp: null, face: null, fv: null, pv: null, source: null },
      capabilities: {
        multiBioDataSupport: null,
        multiBioPhotoSupport: null,
        maxFaceCount: null,
        maxUserPhotoCount: null,
        maxUserCount: null,
        maxFingerCount: null,
        maxAttLogCount: null,
      },
      counters: { users: null, fingerprints: null, faces: null, transactions: null },
      features: {
        finger: null,
        face: null,
        photo: null,
        userPicUrl: null,
        visualIntercom: null,
        sip: null,
        subcontractingUpgrade: null,
        videoProtocol: null,
      },
      clock: { offsetSeconds: null, measuredAt: null, syncedAt: null, status: null },
      optionsReadAt: null,
      lastIpSeen: null,
      lastIpSeenAt: null,
    }
  }
  return {
    accessPointId,
    available: true,
    platform: profile.accessPointProfilePlatform ?? null,
    firmware: profile.accessPointProfileFwVersion ?? null,
    pushVersion: profile.accessPointProfilePushVersion ?? null,
    oemVendor: profile.accessPointProfileOemVendor ?? null,
    dialect: profile.accessPointProfileDialect,
    layoutKnown: profile.accessPointProfileLayoutKnown === 1,
    registryCode: profile.accessPointProfileRegistryCode ?? null,
    versions: {
      fp: profile.accessPointProfileFpVersion ?? null,
      face: profile.accessPointProfileFaceVersion ?? null,
      fv: profile.accessPointProfileFvVersion ?? null,
      pv: profile.accessPointProfilePvVersion ?? null,
      source: profile.accessPointProfileVersionsSource ?? null,
    },
    capabilities: {
      multiBioDataSupport: profile.accessPointProfileMultiBioDataSupport ?? null,
      multiBioPhotoSupport: profile.accessPointProfileMultiBioPhotoSupport ?? null,
      maxFaceCount: profile.accessPointProfileMaxFaceCount ?? null,
      maxUserPhotoCount: profile.accessPointProfileMaxUserPhotoCount ?? null,
      maxUserCount: profile.accessPointProfileMaxUserCount ?? null,
      maxFingerCount: profile.accessPointProfileMaxFingerCount ?? null,
      maxAttLogCount: profile.accessPointProfileMaxAttLogCount ?? null,
    },
    counters: {
      users: profile.accessPointProfileUserCount ?? null,
      fingerprints: profile.accessPointProfileFpCount ?? null,
      faces: profile.accessPointProfileFaceCount ?? null,
      transactions: profile.accessPointProfileTransactionCount ?? null,
    },
    features: {
      finger: profile.accessPointProfileFingerFunOn ?? null,
      face: profile.accessPointProfileFaceFunOn ?? null,
      photo: profile.accessPointProfilePhotoFunOn ?? null,
      userPicUrl: profile.accessPointProfileUserPicUrlFunOn ?? null,
      visualIntercom: profile.accessPointProfileVisualIntercomFunOn ?? null,
      sip: profile.accessPointProfileSipEnableUnit ?? null,
      subcontractingUpgrade: profile.accessPointProfileSubcontractingUpgradeFunOn ?? null,
      videoProtocol: profile.accessPointProfileVideoProtocol ?? null,
    },
    clock: {
      offsetSeconds: profile.accessPointProfileClockOffsetSeconds ?? null,
      measuredAt: profile.accessPointProfileClockMeasuredAt?.toISO() ?? null,
      syncedAt: profile.accessPointProfileClockSyncedAt?.toISO() ?? null,
      status: profile.accessPointProfileClockSyncStatus ?? null,
    },
    optionsReadAt: profile.accessPointProfileOptionsReadAt?.toISO() ?? null,
    lastIpSeen: profile.accessPointProfileLastIpSeen ?? null,
    lastIpSeenAt: profile.accessPointProfileLastIpSeenAt?.toISO() ?? null,
  }
}
