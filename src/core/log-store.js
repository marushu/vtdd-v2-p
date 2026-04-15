import {
  createDecisionLogEntry,
  createProposalLogEntry
} from "./log-contracts.js";

export function createInMemoryLogStore() {
  const state = {
    decisions: [],
    proposals: [],
    decisionCounter: 0,
    proposalCounter: 0
  };

  return {
    appendDecision(input) {
      const prepared = createDecisionLogEntry(input);
      if (!prepared.ok) {
        return prepared;
      }

      state.decisionCounter += 1;
      const entry = {
        id: makeId("decision", state.decisionCounter),
        ...prepared.entry
      };
      state.decisions.push(entry);
      return { ok: true, entry };
    },

    appendProposal(input) {
      const prepared = createProposalLogEntry(input);
      if (!prepared.ok) {
        return prepared;
      }

      state.proposalCounter += 1;
      const entry = {
        id: makeId("proposal", state.proposalCounter),
        ...prepared.entry
      };
      state.proposals.push(entry);
      return { ok: true, entry };
    },

    listDecisions(filter = {}) {
      const relatedIssue = normalizeIssue(filter.relatedIssue);
      if (!relatedIssue) {
        return [...state.decisions];
      }
      return state.decisions.filter((item) => item.relatedIssue === relatedIssue);
    },

    listProposals(filter = {}) {
      const relatedIssue = normalizeIssue(filter.relatedIssue);
      if (!relatedIssue) {
        return [...state.proposals];
      }
      return state.proposals.filter((item) => item.relatedIssue === relatedIssue);
    },

    supersedeDecision(input) {
      const targetId = String(input?.id ?? "").trim();
      const supersededBy = String(input?.supersededBy ?? "").trim();
      if (!targetId || !supersededBy) {
        return {
          ok: false,
          reason: "id and supersededBy are required"
        };
      }

      const target = state.decisions.find((item) => item.id === targetId);
      if (!target) {
        return {
          ok: false,
          reason: "decision entry not found"
        };
      }

      target.supersededBy = supersededBy;
      return { ok: true, entry: { ...target } };
    }
  };
}

function makeId(prefix, sequence) {
  return `${prefix}_${String(sequence).padStart(4, "0")}`;
}

function normalizeIssue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}
