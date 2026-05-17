export const REALTIME_CHANNELS = ['agents', 'sessions', 'tasks', 'dashboard'] as const

export type RealtimeChannel = typeof REALTIME_CHANNELS[number]

const REALTIME_CHANNEL_SET = new Set<string>(REALTIME_CHANNELS)

export function isRealtimeChannel(channel: unknown): channel is RealtimeChannel {
  return typeof channel === 'string' && REALTIME_CHANNEL_SET.has(channel)
}

export function getRealtimeChannelRoom(channel: RealtimeChannel): string {
  return `vis:${channel}`
}
