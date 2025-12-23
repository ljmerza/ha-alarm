/**
 * Type definitions and guards for rule definitions
 * Provides type-safe handling of rule when/then structures
 */

import { isRecord } from '@/lib/typeGuards'
import type { WhenOperator, AlarmArmMode } from '@/lib/typeGuards'

// ============================================================================
// When Condition Nodes
// ============================================================================

/**
 * Base entity state condition
 */
export interface EntityStateNode {
  op: 'entity_state'
  entity_id: string
  equals: string
}

/**
 * Negation wrapper
 */
export interface NotNode {
  op: 'not'
  child: EntityStateNode
}

/**
 * Logical operator node (all/any)
 */
export interface LogicalNode {
  op: WhenOperator
  children: ConditionNode[]
}

/**
 * For duration wrapper
 */
export interface ForNode {
  op: 'for'
  seconds: number
  child: WhenNode
}

/**
 * Union of all condition node types
 */
export type ConditionNode = EntityStateNode | NotNode

/**
 * Union of all when node types
 */
export type WhenNode = EntityStateNode | LogicalNode | ForNode | Record<string, never>

// ============================================================================
// Action Nodes
// ============================================================================

/**
 * Alarm disarm action
 */
export interface AlarmDisarmAction {
  type: 'alarm_disarm'
}

/**
 * Alarm trigger action
 */
export interface AlarmTriggerAction {
  type: 'alarm_trigger'
}

/**
 * Alarm arm action
 */
export interface AlarmArmAction {
  type: 'alarm_arm'
  mode: AlarmArmMode
}

/**
 * Home Assistant call service action
 */
export interface HaCallServiceAction {
  type: 'ha_call_service'
  domain: string
  service: string
  target?: {
    entity_ids: string[]
  }
  service_data?: Record<string, unknown>
}

/**
 * Union of all action types
 */
export type ActionNode = AlarmDisarmAction | AlarmTriggerAction | AlarmArmAction | HaCallServiceAction

// ============================================================================
// Rule Definition
// ============================================================================

/**
 * Complete rule definition structure
 */
export interface RuleDefinition {
  when: WhenNode
  then: ActionNode[]
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if node is an EntityStateNode
 */
export function isEntityStateNode(node: unknown): node is EntityStateNode {
  return (
    isRecord(node) &&
    node.op === 'entity_state' &&
    typeof node.entity_id === 'string' &&
    typeof node.equals === 'string'
  )
}

/**
 * Check if node is a NotNode
 */
export function isNotNode(node: unknown): node is NotNode {
  return isRecord(node) && node.op === 'not' && isEntityStateNode(node.child)
}

/**
 * Check if node is a ConditionNode
 */
export function isConditionNode(node: unknown): node is ConditionNode {
  return isEntityStateNode(node) || isNotNode(node)
}

/**
 * Check if node is a LogicalNode
 */
export function isLogicalNode(node: unknown): node is LogicalNode {
  if (!isRecord(node)) return false
  if (node.op !== 'all' && node.op !== 'any') return false
  if (!Array.isArray(node.children)) return false
  return node.children.every(isConditionNode)
}

/**
 * Check if node is a ForNode
 */
export function isForNode(node: unknown): node is ForNode {
  return (
    isRecord(node) &&
    node.op === 'for' &&
    typeof node.seconds === 'number' &&
    isWhenNode(node.child)
  )
}

/**
 * Check if node is a valid WhenNode
 */
export function isWhenNode(node: unknown): node is WhenNode {
  // Empty when node
  if (isRecord(node) && Object.keys(node).length === 0) return true

  return isEntityStateNode(node) || isLogicalNode(node) || isForNode(node)
}

/**
 * Check if action is AlarmDisarmAction
 */
export function isAlarmDisarmAction(action: unknown): action is AlarmDisarmAction {
  return isRecord(action) && action.type === 'alarm_disarm'
}

/**
 * Check if action is AlarmTriggerAction
 */
export function isAlarmTriggerAction(action: unknown): action is AlarmTriggerAction {
  return isRecord(action) && action.type === 'alarm_trigger'
}

/**
 * Check if action is AlarmArmAction
 */
export function isAlarmArmAction(action: unknown): action is AlarmArmAction {
  return (
    isRecord(action) &&
    action.type === 'alarm_arm' &&
    typeof action.mode === 'string' &&
    ['armed_home', 'armed_away', 'armed_night', 'armed_vacation'].includes(action.mode as string)
  )
}

/**
 * Check if action is HaCallServiceAction
 */
export function isHaCallServiceAction(action: unknown): action is HaCallServiceAction {
  if (!isRecord(action)) return false
  if (action.type !== 'ha_call_service') return false
  if (typeof action.domain !== 'string') return false
  if (typeof action.service !== 'string') return false

  // target and service_data are optional
  if ('target' in action) {
    const target = action.target
    if (!isRecord(target)) return false
    if ('entity_ids' in target && !Array.isArray(target.entity_ids)) return false
  }

  if ('service_data' in action && !isRecord(action.service_data)) return false

  return true
}

/**
 * Check if action is a valid ActionNode
 */
export function isActionNode(action: unknown): action is ActionNode {
  return (
    isAlarmDisarmAction(action) ||
    isAlarmTriggerAction(action) ||
    isAlarmArmAction(action) ||
    isHaCallServiceAction(action)
  )
}

/**
 * Check if value is a valid RuleDefinition
 */
export function isRuleDefinition(data: unknown): data is RuleDefinition {
  if (!isRecord(data)) return false
  if (!('when' in data) || !('then' in data)) return false

  const { when, then } = data

  // Validate when node
  if (!isWhenNode(when)) return false

  // Validate then actions
  if (!Array.isArray(then)) return false
  if (!then.every(isActionNode)) return false

  return true
}

/**
 * Parse and validate rule definition from unknown data
 * Returns the validated definition or undefined if invalid
 */
export function parseRuleDefinition(data: unknown): RuleDefinition | undefined {
  return isRuleDefinition(data) ? data : undefined
}

/**
 * Create an empty rule definition
 */
export function createEmptyRuleDefinition(): RuleDefinition {
  return {
    when: {},
    then: [],
  }
}
