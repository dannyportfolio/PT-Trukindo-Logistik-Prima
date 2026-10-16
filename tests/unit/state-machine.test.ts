import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  assertValidTransition,
  IllegalStateTransitionError,
  isTerminalState,
  isSuspendedState,
  isActiveState,
  isStateEligibleForStep,
  canCancelState,
  getPermittedNextStates,
  mapAgentStateToLeadStatus,
} from "@/lib/agent/state-machine";
import { AgentState } from "@/types/agent";

describe("Deterministic Finite State Machine (FSM)", () => {
  describe("Valid Transition Progressions", () => {
    it("should allow standard happy path: INGESTED -> RESEARCHING -> RESEARCH_COMPLETED -> SCORING -> AWAITING_APPROVAL", () => {
      expect(isValidTransition("INGESTED", "RESEARCHING")).toBe(true);
      expect(isValidTransition("RESEARCHING", "RESEARCH_COMPLETED")).toBe(true);
      expect(isValidTransition("RESEARCH_COMPLETED", "SCORING")).toBe(true);
      expect(isValidTransition("SCORING", "AWAITING_APPROVAL")).toBe(true);
    });

    it("should allow routing to INSUFFICIENT_EVIDENCE from SCORING", () => {
      expect(isValidTransition("SCORING", "INSUFFICIENT_EVIDENCE")).toBe(true);
    });

    it("should allow routing to DISQUALIFIED from SCORING", () => {
      expect(isValidTransition("SCORING", "DISQUALIFIED")).toBe(true);
    });

    it("should allow operator cancellation from any active state", () => {
      const activeStates: AgentState[] = [
        "INGESTED",
        "RESEARCHING",
        "RESEARCH_COMPLETED",
        "SCORING",
      ];
      for (const state of activeStates) {
        expect(isValidTransition(state, "CANCELLED")).toBe(true);
        expect(() => assertValidTransition(state, "CANCELLED")).not.toThrow();
      }
    });

    it("should allow timeout transition from active executing states", () => {
      expect(isValidTransition("RESEARCHING", "TIMED_OUT")).toBe(true);
      expect(isValidTransition("SCORING", "TIMED_OUT")).toBe(true);
    });

    it("should allow failure transition from any active state", () => {
      const activeStates: AgentState[] = [
        "INGESTED",
        "RESEARCHING",
        "RESEARCH_COMPLETED",
        "SCORING",
      ];
      for (const state of activeStates) {
        expect(isValidTransition(state, "FAILED")).toBe(true);
        expect(() => assertValidTransition(state, "FAILED")).not.toThrow();
      }
    });
  });

  describe("Rejection of Illegal State Transitions", () => {
    it("should reject illegal forward skip from INGESTED directly to AWAITING_APPROVAL", () => {
      expect(isValidTransition("INGESTED", "AWAITING_APPROVAL")).toBe(false);
      expect(() => assertValidTransition("INGESTED", "AWAITING_APPROVAL")).toThrow(
        IllegalStateTransitionError
      );
    });

    it("should reject illegal forward skip from INGESTED directly to SCORING", () => {
      expect(isValidTransition("INGESTED", "SCORING")).toBe(false);
      expect(() => assertValidTransition("INGESTED", "SCORING")).toThrow(
        IllegalStateTransitionError
      );
    });

    it("should reject illegal forward skip from RESEARCHING directly to AWAITING_APPROVAL", () => {
      expect(isValidTransition("RESEARCHING", "AWAITING_APPROVAL")).toBe(false);
      expect(() => assertValidTransition("RESEARCHING", "AWAITING_APPROVAL")).toThrow(
        IllegalStateTransitionError
      );
    });

    it("should reject backward transition from SCORING to RESEARCHING", () => {
      expect(isValidTransition("SCORING", "RESEARCHING")).toBe(false);
      expect(() => assertValidTransition("SCORING", "RESEARCHING")).toThrow(
        IllegalStateTransitionError
      );
    });

    it("should reject any transition out of terminal states", () => {
      const terminalStates: AgentState[] = [
        "DISQUALIFIED",
        "CANCELLED",
        "TIMED_OUT",
        "FAILED",
      ];
      for (const termState of terminalStates) {
        expect(isValidTransition(termState, "RESEARCHING")).toBe(false);
        expect(isValidTransition(termState, "INGESTED")).toBe(false);
        expect(getPermittedNextStates(termState)).toEqual([]);
        expect(() => assertValidTransition(termState, "RESEARCHING")).toThrow(
          IllegalStateTransitionError
        );
      }
    });

    it("should reject automated transitions out of Human-in-the-Loop review states in M2", () => {
      const reviewStates: AgentState[] = ["AWAITING_APPROVAL", "INSUFFICIENT_EVIDENCE"];
      for (const revState of reviewStates) {
        expect(isValidTransition(revState, "RESEARCHING")).toBe(false);
        expect(isValidTransition(revState, "SCORING")).toBe(false);
        expect(getPermittedNextStates(revState)).toEqual([]);
      }
    });

    it("should reject self-transitions (no-op jumps)", () => {
      const states: AgentState[] = [
        "INGESTED",
        "RESEARCHING",
        "RESEARCH_COMPLETED",
        "SCORING",
        "AWAITING_APPROVAL",
        "INSUFFICIENT_EVIDENCE",
      ];
      for (const state of states) {
        expect(isValidTransition(state, state)).toBe(false);
        expect(() => assertValidTransition(state, state)).toThrow(
          IllegalStateTransitionError
        );
      }
    });

    it("should reject invalid/unrecognized state strings", () => {
      // @ts-expect-error Testing invalid runtime string
      expect(isValidTransition("INVALID_STATE", "RESEARCHING")).toBe(false);
      // @ts-expect-error Testing invalid runtime string
      expect(isValidTransition("INGESTED", "NON_EXISTENT")).toBe(false);
    });
  });

  describe("State Classification Helpers", () => {
    it("should correctly classify terminal states", () => {
      expect(isTerminalState("DISQUALIFIED")).toBe(true);
      expect(isTerminalState("CANCELLED")).toBe(true);
      expect(isTerminalState("TIMED_OUT")).toBe(true);
      expect(isTerminalState("FAILED")).toBe(true);

      expect(isTerminalState("INGESTED")).toBe(false);
      expect(isTerminalState("RESEARCHING")).toBe(false);
      expect(isTerminalState("AWAITING_APPROVAL")).toBe(false);
      expect(isTerminalState("INSUFFICIENT_EVIDENCE")).toBe(false);
    });

    it("should correctly classify suspended review states", () => {
      expect(isSuspendedState("AWAITING_APPROVAL")).toBe(true);
      expect(isSuspendedState("INSUFFICIENT_EVIDENCE")).toBe(true);

      expect(isSuspendedState("RESEARCHING")).toBe(false);
      expect(isSuspendedState("FAILED")).toBe(false);
    });

    it("should correctly classify active executing states", () => {
      expect(isActiveState("INGESTED")).toBe(true);
      expect(isActiveState("RESEARCHING")).toBe(true);
      expect(isActiveState("RESEARCH_COMPLETED")).toBe(true);
      expect(isActiveState("SCORING")).toBe(true);

      expect(isActiveState("AWAITING_APPROVAL")).toBe(false);
      expect(isActiveState("FAILED")).toBe(false);
      expect(isActiveState("CANCELLED")).toBe(false);
    });

    it("should correctly determine if a state is cancellable", () => {
      expect(canCancelState("INGESTED")).toBe(true);
      expect(canCancelState("RESEARCHING")).toBe(true);
      expect(canCancelState("SCORING")).toBe(true);
      expect(canCancelState("AWAITING_APPROVAL")).toBe(true);

      expect(canCancelState("CANCELLED")).toBe(false);
      expect(canCancelState("FAILED")).toBe(false);
      expect(canCancelState("TIMED_OUT")).toBe(false);
      expect(canCancelState("DISQUALIFIED")).toBe(false);
    });

    it("should correctly classify states eligible for recording steps", () => {
      // Eligible: active execution states
      expect(isStateEligibleForStep("INGESTED")).toBe(true);
      expect(isStateEligibleForStep("RESEARCHING")).toBe(true);
      expect(isStateEligibleForStep("RESEARCH_COMPLETED")).toBe(true);
      expect(isStateEligibleForStep("SCORING")).toBe(true);

      // Ineligible: suspended human-in-the-loop review states
      expect(isStateEligibleForStep("AWAITING_APPROVAL")).toBe(false);
      expect(isStateEligibleForStep("INSUFFICIENT_EVIDENCE")).toBe(false);

      // Ineligible: terminal states
      expect(isStateEligibleForStep("DISQUALIFIED")).toBe(false);
      expect(isStateEligibleForStep("CANCELLED")).toBe(false);
      expect(isStateEligibleForStep("TIMED_OUT")).toBe(false);
      expect(isStateEligibleForStep("FAILED")).toBe(false);
    });

    it("should correctly map agent states to lead statuses without business status leakage", () => {
      expect(mapAgentStateToLeadStatus("INGESTED")).toBe("INGESTED");
      expect(mapAgentStateToLeadStatus("RESEARCHING")).toBe("RESEARCHING");
      expect(mapAgentStateToLeadStatus("RESEARCH_COMPLETED")).toBe("RESEARCHING");
      expect(mapAgentStateToLeadStatus("SCORING")).toBe("RESEARCHING");
      expect(mapAgentStateToLeadStatus("AWAITING_APPROVAL")).toBe("AWAITING_APPROVAL");
      expect(mapAgentStateToLeadStatus("INSUFFICIENT_EVIDENCE")).toBe("INSUFFICIENT_EVIDENCE");
      expect(mapAgentStateToLeadStatus("DISQUALIFIED")).toBe("DISQUALIFIED");

      // CANCELLED resets lead to retryable INGESTED business status (not FAILED) or restores previousLeadStatus
      expect(mapAgentStateToLeadStatus("CANCELLED")).toBe("INGESTED");
      expect(mapAgentStateToLeadStatus("CANCELLED", "AWAITING_APPROVAL")).toBe("AWAITING_APPROVAL");
      expect(mapAgentStateToLeadStatus("CANCELLED", "INSUFFICIENT_EVIDENCE")).toBe("INSUFFICIENT_EVIDENCE");
      expect(mapAgentStateToLeadStatus("CANCELLED", "INGESTED")).toBe("INGESTED");

      // Technical failures map to FAILED
      expect(mapAgentStateToLeadStatus("TIMED_OUT")).toBe("FAILED");
      expect(mapAgentStateToLeadStatus("FAILED")).toBe("FAILED");
    });
  });
});
