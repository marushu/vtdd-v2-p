import test from "node:test";
import assert from "node:assert/strict";

import { DashboardChatRoom } from "../src/worker.js";
import { buildDashboardTurnInputText } from "../scripts/run-dashboard-app-server-bridge.mjs";

function createMockSocket(role, threadId) {
  return {
    readyState: 1,
    sent: [],
    send(message) {
      this.sent.push(String(message));
    },
    deserializeAttachment() {
      return { role, threadId };
    }
  };
}

function createMockDurableObjectStorage() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      return values.delete(key);
    }
  };
}

function createInMemoryDashboardChatStore() {
  const messages = [];
  return {
    async appendMany(threadId, incoming) {
      const stored = (Array.isArray(incoming) ? incoming : []).map((message) => ({
        ...message,
        threadId
      }));
      messages.push(...stored);
      return stored;
    },
    async listThread(threadId, filter = {}) {
      const limit = Number(filter.limit) || 80;
      return messages.filter((message) => message.threadId === threadId).slice(-limit);
    }
  };
}

function lastBridgeTurn(socket) {
  const payload = JSON.parse(socket.sent.at(-1));
  assert.equal(payload.type, "app_server_turn_requested");
  return payload;
}

test("E2E-845 owner goal survives Dashboard Mission runtime into VPS prompt without leaking into unrelated turns", async () => {
  const threadId = "dashboard-main-issue845-e2e";
  const storage = createMockDurableObjectStorage();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", threadId);
  const bridgeSocket = createMockSocket("app_server_bridge", threadId);
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId,
      clientMessageId: "dashboard_owner_message:issue845-tomio",
      text: "TOMIO を売れる状態まで持っていって"
    })
  );

  const missionTurn = lastBridgeTurn(bridgeSocket);
  assert.equal(missionTurn.businessMission.kind, "product_launch");
  assert.equal(missionTurn.businessMission.status, "active");
  assert.equal(missionTurn.businessMission.ownerGoal, "TOMIO を売れる状態まで持っていって");
  assert.equal(missionTurn.businessMissionSummary.nextAutomaticWork[0].role, "research");

  const missionId = missionTurn.businessMission.missionId;
  const storedMission = storage.values.get(`business_mission_active:${threadId}`);
  assert.equal(storedMission.missionId, missionId);

  const vpsPrompt = buildDashboardTurnInputText(missionTurn);
  assert.match(vpsPrompt, /businessMission/);
  assert.match(vpsPrompt, /TOMIO を売れる状態まで持っていって/);
  assert.match(vpsPrompt, /"role":"research"/);
  assert.match(vpsPrompt, /Agent \/ subagent の内部交通整理を owner に戻さず/);
  assert.match(vpsPrompt, /merge \/ deploy \/ spend \/ external publish/);

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId,
      clientMessageId: "dashboard_owner_message:issue845-date",
      text: "今日は何月何日？日本時間を答えて"
    })
  );

  const unrelatedTurn = lastBridgeTurn(bridgeSocket);
  assert.equal(unrelatedTurn.businessMission, null);
  assert.equal(unrelatedTurn.businessMissionSummary, null);
  assert.equal(storage.values.get(`business_mission_active:${threadId}`).missionId, missionId);
  assert.doesNotMatch(buildDashboardTurnInputText(unrelatedTurn), /businessMissionRule/);

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId,
      clientMessageId: "dashboard_owner_message:issue845-followup",
      text: "今どこまで進んだ？"
    })
  );

  const followupTurn = lastBridgeTurn(bridgeSocket);
  assert.equal(followupTurn.businessMission.missionId, missionId);
  assert.equal(followupTurn.businessMission.ownerGoal, "TOMIO を売れる状態まで持っていって");

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId,
      clientMessageId: "dashboard_owner_message:issue845-hibou",
      text: "hibou の問い合わせを一つも漏らさず全部処理して"
    })
  );

  const switchedTurn = lastBridgeTurn(bridgeSocket);
  assert.equal(switchedTurn.businessMission.kind, "customer_inquiry");
  assert.notEqual(switchedTurn.businessMission.missionId, missionId);
  assert.equal(switchedTurn.businessMissionSummary.nextAutomaticWork[0].role, "customer_support");

  const superseded = storage.values.get(`business_mission:${missionId}`);
  assert.equal(superseded.status, "cancelled");
  assert.equal(superseded.supersededByMissionId, switchedTurn.businessMission.missionId);

  const switchedPrompt = buildDashboardTurnInputText(switchedTurn);
  assert.match(switchedPrompt, /hibou の問い合わせを一つも漏らさず全部処理して/);
  assert.match(switchedPrompt, /"role":"customer_support"/);
});
