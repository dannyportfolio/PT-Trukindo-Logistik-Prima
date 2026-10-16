import { AgentState, AgentStateSchema } from "../../types/agent";
import { LeadStatus } from "../../types/lead";

/**
 * Error thrown when an illegal or unregistered state transition is attempted
 */
export class IllegalStateTransitionError extends Error {
  constructor(
    public readonly fromState: AgentState,
    public readonly toState: AgentState
  ) {
    super(`Illegal agent state transition: '${fromState}' -> '${toState}' is not permitted`);
    this.name = "IllegalStateTransitionError";
  }
}

/**
 * Permitted transition graph for Milestone 2 Finite State Machine
 */
export const PERMITTED_TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
  INGESTED: ["RESEARCHING", "FAILED", "CANCELLED"],
  RESEARCHING: ["RESEARCH_COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED"],
  RESEARCH_COMPLETED: ["SCORING", "FAILED", "CANCELLED"],
  SCORING: [
    "AWAITING_APPROVAL",
    "INSUFFICIENT_EVIDENCE",
    "DISQUALIFIED",
    "FAILED",
    "TIMED_OUT",
    "CANCELLED",
  ],
  // Human-in-the-Loop suspended states (Milestone 2 strictly bars automated outbound transitions)
  AWAITING_APPROVAL: [],
  INSUFFICIENT_EVIDENCE: [],
  // Terminal execution states
  DISQUALIFIED: [],
  CANCELLED: [],
  TIMED_OUT: [],
  FAILED: [],
} as const;

/**
 * Validates whether a state transition is permitted
 */
export function isValidTransition(fromState: AgentState, toState: AgentState): boolean {
  // Parsing defensively to ensure runtime safety
  const validFrom = AgentStateSchema.safeParse(fromState);
  const validTo = AgentStateSchema.safeParse(toState);
  if (!validFrom.success || !validTo.success) {
    return false;
  }

  // Same-state transitions are disallowed (no-op jumps)
  if (fromState === toState) {
    return false;
  }

  const allowedNext = PERMITTED_TRANSITIONS[fromState] ?? [];
  return (allowedNext as readonly string[]).includes(toState);
}

/**
 * Asserts that a state transition is valid, throwing an explicit IllegalStateTransitionError otherwise
 */
export function assertValidTransition(fromState: AgentState, toState: AgentState): void {
  if (!isValidTransition(fromState, toState)) {
    throw new IllegalStateTransitionError(fromState, toState);
  }
}

/**
 * Returns whether a state is terminal (completed, cancelled, or failed permanently)
 */
export function isTerminalState(state: AgentState): boolean {
  return (
    state === "DISQUALIFIED" ||
    state === "CANCELLED" ||
    state === "TIMED_OUT" ||
    state === "FAILED"
  );
}

/**
 * Returns whether a state is suspended awaiting Human-in-the-Loop review
 */
export function isSuspendedState(state: AgentState): boolean {
  return state === "AWAITING_APPROVAL" || state === "INSUFFICIENT_EVIDENCE";
}

/**
 * Returns whether an execution run in this state is still active
 */
export function isActiveState(state: AgentState): boolean {
  return !isTerminalState(state) && !isSuspendedState(state);
}

/**
 * Returns whether a state can be cancelled by an operator
 */
export function canCancelState(state: AgentState): boolean {
  return !isTerminalState(state);
}

/**
 * Returns list of permitted next states from a given state
 */
export function getPermittedNextStates(state: AgentState): AgentState[] {
  return [...(PERMITTED_TRANSITIONS[state] ?? [])];
}

/**
 * Returns whether an agent state is eligible to receive and execute new steps.
 * Only active execution states (INGESTED, RESEARCHING, RESEARCH_COMPLETED, SCORING)
 * may record steps. Suspended (AWAITING_APPROVAL, INSUFFICIENT_EVIDENCE) and
 * terminal states (DISQUALIFIED, CANCELLED, TIMED_OUT, FAILED) strictly cannot.
 */
export function isStateEligibleForStep(state: AgentState): boolean {
  return (
    state === "INGESTED" ||
    state === "RESEARCHING" ||
    state === "RESEARCH_COMPLETED" ||
    state === "SCORING"
  );
}

/**
 * Maps an agent execution state to the corresponding business lifecycle lead status.
 * Ensures internal execution states (e.g. RESEARCH_COMPLETED, SCORING) do not leak
 * into the business lead status domain, preventing state desynchronization.
 * 
 * CANCELLED by operator restores the lead's previous business status (e.g. AWAITING_APPROVAL
 * or INSUFFICIENT_EVIDENCE if rerun was cancelled) or resets to 'INGESTED' if the run started
 * from intake, preserving distinction between manual cancellation and unrecoverable failures.
 */
export function mapAgentStateToLeadStatus(
  agentState: AgentState,
  previousLeadStatus?: LeadStatus | null
): LeadStatus | null {
  switch (agentState) {
    case "INGESTED":
      return "INGESTED";
    case "RESEARCHING":
    case "RESEARCH_COMPLETED":
    case "SCORING":
      return "RESEARCHING";
    case "AWAITING_APPROVAL":
      return "AWAITING_APPROVAL";
    case "INSUFFICIENT_EVIDENCE":
      return "INSUFFICIENT_EVIDENCE";
    case "DISQUALIFIED":
      return "DISQUALIFIED";
    case "CANCELLED":
      return previousLeadStatus || "INGESTED";
    case "TIMED_OUT":
    case "FAILED":
      return "FAILED";
    default:
      return null;
  }
}
