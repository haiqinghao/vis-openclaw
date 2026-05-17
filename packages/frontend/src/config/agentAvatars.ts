// Agent 形象配置
// 定义可用于 Agent 形象的单位类型

export interface AgentAvatarUnit {
  id: string           // 单位ID（用于保存到数据库）
  name: string         // 显示名称
  icon: string         // emoji图标
  color: number        // 颜色（用于背景）
  folder: string       // 素材文件夹
  file: string         // 素材文件名
  frameW: number       // 帧宽度
  frameH: number       // 帧高度
  frames: number       // 帧数
  avatarImg: string    // UI头像图片文件名
}

// 可用的 Agent 形象列表
export const AGENT_AVATAR_UNITS: AgentAvatarUnit[] = [
  {
    id: 'archer',
    name: '弓箭手',
    icon: '🏹',
    color: 0x4a90d9,
    folder: 'black-units/Archer',
    file: 'Archer_Idle',
    frameW: 192,
    frameH: 192,
    frames: 6,
    avatarImg: 'Avatars_03.png'
  },
  {
    id: 'warrior',
    name: '战士',
    icon: '⚔️',
    color: 0xd94a4a,
    folder: 'black-units/Warrior',
    file: 'Warrior_Idle',
    frameW: 192,
    frameH: 192,
    frames: 8,
    avatarImg: 'Avatars_01.png'
  },
  {
    id: 'lancer',
    name: '枪骑兵',
    icon: '🏇',
    color: 0x4ad98f,
    folder: 'black-units/Lancer',
    file: 'Lancer_Idle',
    frameW: 320,
    frameH: 320,
    frames: 12,
    avatarImg: 'Avatars_02.png'
  },
  {
    id: 'monk',
    name: '僧侣',
    icon: '🧙',
    color: 0xd9d94a,
    folder: 'black-units/Monk',
    file: 'Idle',
    frameW: 192,
    frameH: 192,
    frames: 6,
    avatarImg: 'Avatars_04.png'
  },
  {
    id: 'pawn',
    name: '士兵',
    icon: '🔨',
    color: 0xd9904a,
    folder: 'black-units/Pawn',
    file: 'Pawn_Idle',
    frameW: 192,
    frameH: 192,
    frames: 8,
    avatarImg: 'Avatars_05.png'
  },
]

// 根据 ID 获取形象配置
export function getAgentAvatarUnitById(id: string): AgentAvatarUnit | undefined {
  return AGENT_AVATAR_UNITS.find(u => u.id === id)
}

// 获取形象素材路径
export function getAvatarUnitPath(unit: AgentAvatarUnit): string {
  return `/assets/sprites/${unit.folder}/${unit.file}.png`
}

// 获取头像素材路径
export function getAvatarImgPath(unit: AgentAvatarUnit): string {
  return `/assets/sprites/ui/avatars/${unit.avatarImg}`
}