interface LogCertification {
  user_id: number
  action: string
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  record_previous?: Record<string, unknown>
  record_current: Record<string, unknown>
}
export type { LogCertification }
