// engagement-tracker.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_INVALID_ACTION_TYPE = 200;
const ERR_INSUFFICIENT_POINTS = 201;
const ERR_UNAUTHORIZED = 202;
const ERR_ACTION_ALREADY_LOGGED = 203;
const ERR_INVALID_TIMESTAMP = 204;
const ERR_MAX_ACTIONS_EXCEEDED = 205;
const ERR_INVALID_POINT_VALUE = 206;
const ERR_USER_NOT_FOUND = 207;
const ERR_CATEGORY_MISMATCH = 208;
const ERR_VERIFICATION_FAILED = 209;
const ERR_DUPLICATE_VERIFICATION = 210;
const ERR_INVALID_CATEGORY = 211;
const ERR_OVERALL_ENGAGEMENT_LIMIT = 212;
const ERR_TIMESTAMP_OUT_OF_ORDER = 213;

interface UserEngagement {
  totalPoints: number;
  actionCount: number;
  lastUpdate: number;
}

interface ActionLog {
  user: string;
  actionType: string;
  category: string;
  points: number;
  timestamp: number;
  verified: boolean;
}

interface CategoryConfig {
  maxPerCategory: number;
  description: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class EngagementTrackerMock {
  state: {
    nextActionId: number;
    maxActionsPerUser: number;
    admin: string;
    actionPoints: Array<{ type: string; points: number; category: string }>;
    userEngagements: Map<string, UserEngagement>;
    actionLogs: Map<number, ActionLog>;
    userActionIndex: Map<string, Set<number>>;
    categoryConfigs: Map<string, CategoryConfig>;
  } = {
    nextActionId: 0,
    maxActionsPerUser: 100,
    admin: "ST1ADMIN",
    actionPoints: [
      { type: "vote", points: 10, category: "voting" },
      { type: "post", points: 5, category: "discussion" },
      { type: "proposal", points: 20, category: "policy" },
      { type: "comment", points: 3, category: "community" },
    ],
    userEngagements: new Map(),
    actionLogs: new Map(),
    userActionIndex: new Map(),
    categoryConfigs: new Map([
      ["policy", { maxPerCategory: 10, description: "Policy actions" }],
      ["discussion", { maxPerCategory: 20, description: "Discussion posts" }],
      ["voting", { maxPerCategory: 50, description: "Voting activities" }],
      [
        "community",
        { maxPerCategory: 30, description: "Community interactions" },
      ],
    ]),
  };
  blockHeight: number = 0;
  caller: string = "ST1USER";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextActionId: 0,
      maxActionsPerUser: 100,
      admin: "ST1ADMIN",
      actionPoints: [
        { type: "vote", points: 10, category: "voting" },
        { type: "post", points: 5, category: "discussion" },
        { type: "proposal", points: 20, category: "policy" },
        { type: "comment", points: 3, category: "community" },
      ],
      userEngagements: new Map(),
      actionLogs: new Map(),
      userActionIndex: new Map(),
      categoryConfigs: new Map([
        ["policy", { maxPerCategory: 10, description: "Policy actions" }],
        ["discussion", { maxPerCategory: 20, description: "Discussion posts" }],
        ["voting", { maxPerCategory: 50, description: "Voting activities" }],
        [
          "community",
          { maxPerCategory: 30, description: "Community interactions" },
        ],
      ]),
    };
    this.blockHeight = 0;
    this.caller = "ST1USER";
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxActionsPerUser(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxActionsPerUser = newMax;
    return { ok: true, value: true };
  }

  setCategoryConfig(
    cat: string,
    maxPerCat: number,
    desc: string
  ): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (
      !["policy", "discussion", "voting", "community"].includes(cat) ||
      desc.length > 100
    )
      return { ok: false, value: false };
    this.state.categoryConfigs.set(cat, {
      maxPerCategory: maxPerCat,
      description: desc,
    });
    return { ok: true, value: true };
  }

  logEngagement(
    actionType: string,
    category: string,
    customPoints?: number
  ): Result<number> {
    if (!["vote", "post", "proposal", "comment"].includes(actionType))
      return { ok: false, value: ERR_INVALID_ACTION_TYPE };
    if (!["policy", "discussion", "voting", "community"].includes(category))
      return { ok: false, value: ERR_INVALID_CATEGORY };
    const pts =
      customPoints ||
      this.state.actionPoints.find((ap) => ap.type === actionType)?.points ||
      0;
    if (pts <= 0 || pts > 1000)
      return { ok: false, value: ERR_INVALID_POINT_VALUE };
    const userEng = this.state.userEngagements.get(this.caller) || {
      totalPoints: 0,
      actionCount: 0,
      lastUpdate: 0,
    };
    if (userEng.actionCount >= this.state.maxActionsPerUser)
      return { ok: false, value: ERR_MAX_ACTIONS_EXCEEDED };
    const userActions =
      this.state.userActionIndex.get(this.caller) || new Set();
    if (userActions.has(this.state.nextActionId))
      return { ok: false, value: ERR_ACTION_ALREADY_LOGGED };
    if (this.blockHeight < userEng.lastUpdate)
      return { ok: false, value: ERR_TIMESTAMP_OUT_OF_ORDER };
    const id = this.state.nextActionId;
    this.state.actionLogs.set(id, {
      user: this.caller,
      actionType,
      category,
      points: pts,
      timestamp: this.blockHeight,
      verified: false,
    });
    userActions.add(id);
    if (!this.state.userActionIndex.has(this.caller))
      this.state.userActionIndex.set(this.caller, userActions);
    this.state.userEngagements.set(this.caller, {
      totalPoints: userEng.totalPoints + pts,
      actionCount: userEng.actionCount + 1,
      lastUpdate: this.blockHeight,
    });
    this.state.nextActionId++;
    return { ok: true, value: id };
  }

  verifyAction(actionId: number): Result<boolean> {
    const action = this.state.actionLogs.get(actionId);
    if (!action) return { ok: false, value: ERR_USER_NOT_FOUND };
    if (action.verified)
      return { ok: false, value: ERR_DUPLICATE_VERIFICATION };
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_UNAUTHORIZED };
    this.state.actionLogs.set(actionId, { ...action, verified: true });
    return { ok: true, value: true };
  }

  updateActionPoints(actionType: string, newPoints: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (
      !["vote", "post", "proposal", "comment"].includes(actionType) ||
      newPoints <= 0 ||
      newPoints > 1000
    )
      return { ok: false, value: false };
    const index = this.state.actionPoints.findIndex(
      (ap) => ap.type === actionType
    );
    if (index !== -1) {
      this.state.actionPoints[index].points = newPoints;
    }
    return { ok: true, value: true };
  }

  getUserEngagement(user: string): UserEngagement | null {
    return this.state.userEngagements.get(user) || null;
  }

  getActionLog(actionId: number): ActionLog | null {
    return this.state.actionLogs.get(actionId) || null;
  }

  getCategoryConfig(cat: string): CategoryConfig | null {
    return this.state.categoryConfigs.get(cat) || null;
  }

  resetUserEngagement(targetUser: string): Result<boolean> {
    if (this.caller !== this.state.admin && this.caller !== targetUser)
      return { ok: false, value: false };
    this.state.userEngagements.set(targetUser, {
      totalPoints: 0,
      actionCount: 0,
      lastUpdate: 0,
    });
    return { ok: true, value: true };
  }

  getActionCount(): Result<number> {
    return { ok: true, value: this.state.nextActionId };
  }

  isActionVerified(actionId: number): Result<boolean> {
    const action = this.state.actionLogs.get(actionId);
    return { ok: true, value: !!action?.verified };
  }
}

describe("EngagementTracker", () => {
  let contract: EngagementTrackerMock;

  beforeEach(() => {
    contract = new EngagementTrackerMock();
    contract.reset();
  });

  it("logs engagement successfully with default points", () => {
    const result = contract.logEngagement("vote", "voting");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const eng = contract.getUserEngagement("ST1USER");
    expect(eng?.totalPoints).toBe(10);
    expect(eng?.actionCount).toBe(1);
    const log = contract.getActionLog(0);
    expect(log?.points).toBe(10);
    expect(log?.verified).toBe(false);
  });

  it("logs engagement with custom points", () => {
    const result = contract.logEngagement("post", "discussion", 15);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const eng = contract.getUserEngagement("ST1USER");
    expect(eng?.totalPoints).toBe(15);
  });

  it("rejects invalid action type", () => {
    const result = contract.logEngagement("invalid", "voting");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ACTION_TYPE);
  });

  it("rejects invalid category", () => {
    const result = contract.logEngagement("vote", "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CATEGORY);
  });

  it("rejects max actions exceeded", () => {
    contract.state.maxActionsPerUser = 1;
    contract.logEngagement("vote", "voting");
    const result = contract.logEngagement("post", "discussion");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ACTIONS_EXCEEDED);
  });

  it("rejects out-of-order timestamp", () => {
    contract.blockHeight = 5;
    contract.logEngagement("vote", "voting");
    contract.blockHeight = 3;
    const result = contract.logEngagement("post", "discussion");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TIMESTAMP_OUT_OF_ORDER);
  });

  it("verifies action successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.logEngagement("proposal", "policy");
    const result = contract.verifyAction(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const log = contract.getActionLog(0);
    expect(log?.verified).toBe(true);
  });

  it("rejects verification by non-admin", () => {
    contract.logEngagement("vote", "voting");
    const result = contract.verifyAction(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });

  it("rejects duplicate verification", () => {
    contract.caller = "ST1ADMIN";
    contract.logEngagement("post", "discussion");
    contract.verifyAction(0);
    const result = contract.verifyAction(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DUPLICATE_VERIFICATION);
  });

  it("updates action points successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.updateActionPoints("vote", 20);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const logResult = contract.logEngagement("vote", "voting");
    const log = contract.getActionLog(logResult.value!);
    expect(log?.points).toBe(20);
  });

  it("rejects action points update by non-admin", () => {
    const result = contract.updateActionPoints("post", 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets category config successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setCategoryConfig("policy", 15, "Updated policy");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const config = contract.getCategoryConfig("policy");
    expect(config?.maxPerCategory).toBe(15);
    expect(config?.description).toBe("Updated policy");
  });

  it("rejects category config set by non-admin", () => {
    const result = contract.setCategoryConfig("discussion", 25, "Updated");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("resets user engagement successfully by admin", () => {
    contract.caller = "ST1ADMIN";
    contract.logEngagement("comment", "community");
    const result = contract.resetUserEngagement("ST1USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const eng = contract.getUserEngagement("ST1USER");
    expect(eng?.totalPoints).toBe(0);
    expect(eng?.actionCount).toBe(0);
  });

  it("resets user engagement successfully by self", () => {
    contract.logEngagement("vote", "voting");
    const result = contract.resetUserEngagement("ST1USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const eng = contract.getUserEngagement("ST1USER");
    expect(eng?.totalPoints).toBe(0);
  });

  it("rejects reset by unauthorized user", () => {
    contract.caller = "ST2FAKE";
    const result = contract.resetUserEngagement("ST1USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns action count correctly", () => {
    contract.logEngagement("proposal", "policy");
    contract.logEngagement("post", "discussion");
    const result = contract.getActionCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks action verification correctly", () => {
    contract.logEngagement("comment", "community");
    let result = contract.isActionVerified(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
    contract.caller = "ST1ADMIN";
    contract.verifyAction(0);
    result = contract.isActionVerified(0);
    expect(result.value).toBe(true);
  });
});
