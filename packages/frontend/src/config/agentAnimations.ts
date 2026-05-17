export type AgentSemanticAction =
  | 'idle'
  | 'move'
  | 'work'
  | 'think'
  | 'tool'
  | 'guard'
  | 'complete'
  | 'error'

export type AgentDirection =
  | 'right'
  | 'up'
  | 'down'
  | 'upRight'
  | 'downRight'

export interface AgentAnimationClip {
  key: string
  path: string
  frameW: number
  frameH: number
  frames: number
  loop?: boolean
  speedMultiplier?: number
}

export interface AgentVisualContext {
  state?: string
  toolName?: string
  detail?: string
  direction?: AgentDirection
}

type AgentClipMap = Record<string, AgentAnimationClip>

function clip(
  key: string,
  path: string,
  frameW: number,
  frameH: number,
  frames: number,
  options: Pick<AgentAnimationClip, 'loop' | 'speedMultiplier'> = {}
): AgentAnimationClip {
  return { key, path, frameW, frameH, frames, loop: options.loop ?? true, speedMultiplier: options.speedMultiplier ?? 1 }
}

export const AGENT_ANIMATION_CLIPS: Record<string, AgentClipMap> = {
  warrior: {
    idle: clip('idle', '/assets/sprites/black-units/Warrior/Warrior_Idle.png', 192, 192, 8),
    move: clip('move', '/assets/sprites/black-units/Warrior/Warrior_Run.png', 192, 192, 6, { speedMultiplier: 1.15 }),
    attack1: clip('attack1', '/assets/sprites/black-units/Warrior/Warrior_Attack1.png', 192, 192, 4, { speedMultiplier: 1.45 }),
    attack2: clip('attack2', '/assets/sprites/black-units/Warrior/Warrior_Attack2.png', 192, 192, 4, { speedMultiplier: 1.45 }),
    guard: clip('guard', '/assets/sprites/black-units/Warrior/Warrior_Guard.png', 192, 192, 6)
  },
  archer: {
    idle: clip('idle', '/assets/sprites/black-units/Archer/Archer_Idle.png', 192, 192, 6),
    move: clip('move', '/assets/sprites/black-units/Archer/Archer_Run.png', 192, 192, 4, { speedMultiplier: 1.15 }),
    shoot: clip('shoot', '/assets/sprites/black-units/Archer/Archer_Shoot.png', 192, 192, 8, { speedMultiplier: 1.35 })
  },
  lancer: {
    idle: clip('idle', '/assets/sprites/black-units/Lancer/Lancer_Idle.png', 320, 320, 12),
    move: clip('move', '/assets/sprites/black-units/Lancer/Lancer_Run.png', 320, 320, 6, { speedMultiplier: 1.15 }),
    attackRight: clip('attackRight', '/assets/sprites/black-units/Lancer/Lancer_Right_Attack.png', 320, 320, 3, { speedMultiplier: 1.55 }),
    attackUp: clip('attackUp', '/assets/sprites/black-units/Lancer/Lancer_Up_Attack.png', 320, 320, 3, { speedMultiplier: 1.55 }),
    attackDown: clip('attackDown', '/assets/sprites/black-units/Lancer/Lancer_Down_Attack.png', 320, 320, 3, { speedMultiplier: 1.55 }),
    attackUpRight: clip('attackUpRight', '/assets/sprites/black-units/Lancer/Lancer_UpRight_Attack.png', 320, 320, 3, { speedMultiplier: 1.55 }),
    attackDownRight: clip('attackDownRight', '/assets/sprites/black-units/Lancer/Lancer_DownRight_Attack.png', 320, 320, 3, { speedMultiplier: 1.55 }),
    defenceRight: clip('defenceRight', '/assets/sprites/black-units/Lancer/Lancer_Right_Defence.png', 320, 320, 6),
    defenceUp: clip('defenceUp', '/assets/sprites/black-units/Lancer/Lancer_Up_Defence.png', 320, 320, 6),
    defenceDown: clip('defenceDown', '/assets/sprites/black-units/Lancer/Lancer_Down_Defence.png', 320, 320, 6),
    defenceUpRight: clip('defenceUpRight', '/assets/sprites/black-units/Lancer/Lancer_UpRight_Defence.png', 320, 320, 6),
    defenceDownRight: clip('defenceDownRight', '/assets/sprites/black-units/Lancer/Lancer_DownRight_Defence.png', 320, 320, 6)
  },
  monk: {
    idle: clip('idle', '/assets/sprites/black-units/Monk/Idle.png', 192, 192, 6),
    move: clip('move', '/assets/sprites/black-units/Monk/Run.png', 192, 192, 4, { speedMultiplier: 1.15 }),
    heal: clip('heal', '/assets/sprites/black-units/Monk/Heal.png', 192, 192, 11, { speedMultiplier: 1.2 }),
    healEffect: clip('healEffect', '/assets/sprites/black-units/Monk/Heal_Effect.png', 192, 192, 11, { loop: false, speedMultiplier: 1.25 })
  },
  pawn: {
    idle: clip('idle', '/assets/sprites/black-units/Pawn/Pawn_Idle.png', 192, 192, 8),
    move: clip('move', '/assets/sprites/black-units/Pawn/Pawn_Run.png', 192, 192, 6, { speedMultiplier: 1.15 }),
    idleGold: clip('idleGold', '/assets/sprites/black-units/Pawn/Pawn_Idle_Gold.png', 192, 192, 8),
    idleHammer: clip('idleHammer', '/assets/sprites/black-units/Pawn/Pawn_Idle_Hammer.png', 192, 192, 8),
    interactAxe: clip('interactAxe', '/assets/sprites/black-units/Pawn/Pawn_Interact_Axe.png', 192, 192, 8, { speedMultiplier: 1.25 }),
    interactHammer: clip('interactHammer', '/assets/sprites/black-units/Pawn/Pawn_Interact_Hammer.png', 192, 192, 8, { speedMultiplier: 1.25 }),
    interactKnife: clip('interactKnife', '/assets/sprites/black-units/Pawn/Pawn_Interact_Knife.png', 192, 192, 8, { speedMultiplier: 1.25 }),
    interactPickaxe: clip('interactPickaxe', '/assets/sprites/black-units/Pawn/Pawn_Interact_Pickaxe.png', 192, 192, 8, { speedMultiplier: 1.25 })
  }
}

const DEFAULT_ACTIONS: Record<string, Partial<Record<AgentSemanticAction, string>>> = {
  warrior: {
    idle: 'idle',
    move: 'move',
    work: 'attack1',
    think: 'guard',
    tool: 'attack2',
    guard: 'guard',
    complete: 'guard',
    error: 'guard'
  },
  archer: {
    idle: 'idle',
    move: 'move',
    work: 'shoot',
    think: 'idle',
    tool: 'shoot',
    guard: 'idle',
    complete: 'shoot',
    error: 'idle'
  },
  lancer: {
    idle: 'idle',
    move: 'move',
    work: 'attackRight',
    think: 'defenceRight',
    tool: 'attackRight',
    guard: 'defenceRight',
    complete: 'attackRight',
    error: 'defenceRight'
  },
  monk: {
    idle: 'idle',
    move: 'move',
    work: 'heal',
    think: 'heal',
    tool: 'heal',
    guard: 'idle',
    complete: 'heal',
    error: 'idle'
  },
  pawn: {
    idle: 'idle',
    move: 'move',
    work: 'interactHammer',
    think: 'idleHammer',
    tool: 'interactHammer',
    guard: 'idle',
    complete: 'idleGold',
    error: 'idle'
  }
}

function getDirectionalKey(prefix: 'attack' | 'defence', direction?: AgentDirection): string {
  switch (direction) {
    case 'up':
      return `${prefix}Up`
    case 'down':
      return `${prefix}Down`
    case 'upRight':
      return `${prefix}UpRight`
    case 'downRight':
      return `${prefix}DownRight`
    case 'right':
    default:
      return `${prefix}Right`
  }
}

function resolvePawnToolAction(context: AgentVisualContext): string {
  const toolText = `${context.toolName || ''} ${context.detail || ''}`.toLowerCase()

  if (/(shell|command|terminal|exec|process|run)/.test(toolText)) return 'interactPickaxe'
  if (/(patch|edit|write|file|save|move|rename|delete|apply)/.test(toolText)) return 'interactHammer'
  if (/(search|fetch|browser|web|http|api|read|inspect)/.test(toolText)) return 'interactKnife'

  return 'interactHammer'
}

export function getSemanticActionForAgentState(state?: string): AgentSemanticAction {
  switch (state) {
    case 'idle':
      return 'idle'
    case 'thinking':
      return 'think'
    case 'tool_calling':
      return 'tool'
    case 'waiting_approval':
      return 'guard'
    case 'complete':
      return 'complete'
    case 'error':
    case 'stale':
      return 'error'
    case 'running':
    case 'busy':
    case 'generating':
    case 'finalizing':
    default:
      return 'work'
  }
}

export function resolveAgentAnimationKey(unitId: string, context: AgentVisualContext): string {
  const semanticAction = getSemanticActionForAgentState(context.state)

  if (unitId === 'lancer') {
    if (semanticAction === 'work' || semanticAction === 'tool' || semanticAction === 'complete') {
      return getDirectionalKey('attack', context.direction)
    }
    if (semanticAction === 'think' || semanticAction === 'guard' || semanticAction === 'error') {
      return getDirectionalKey('defence', context.direction)
    }
  }

  if (unitId === 'pawn' && semanticAction === 'tool') {
    return resolvePawnToolAction(context)
  }

  return DEFAULT_ACTIONS[unitId]?.[semanticAction] || DEFAULT_ACTIONS[unitId]?.idle || 'idle'
}

export function getAgentAnimationClip(unitId: string, animationKey: string): AgentAnimationClip | undefined {
  const clips = AGENT_ANIMATION_CLIPS[unitId]
  if (!clips) return undefined

  return clips[animationKey] || clips.idle
}

export function getAgentEffectClip(unitId: string, animationKey: string): AgentAnimationClip | undefined {
  if (unitId === 'monk' && animationKey === 'heal') return AGENT_ANIMATION_CLIPS.monk.healEffect
  return undefined
}
