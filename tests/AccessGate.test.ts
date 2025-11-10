// access-gate.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_INVALID_FORUM_ID = 100;
const ERR_INSUFFICIENT_ENGAGEMENT = 101;
const ERR_UNAUTHORIZED = 102;
const ERR_INVALID_LEVEL = 103;
const ERR_FORUM_ALREADY_EXISTS = 104;
const ERR_FORUM_NOT_FOUND = 105;
const ERR_MAX_FORUMS_EXCEEDED = 106;
const ERR_INVALID_MIN_ENGAGEMENT = 107;
const ERR_INVALID_TIER_INDEX = 108;
const ERR_ACCESS_DENIED = 109;
const ERR_BADGE_NOT_OWNED = 110;
const ERR_LEVEL_MISMATCH = 111;
const ERR_TIMESTAMP_INVALID = 112;

interface ForumConfig {
  name: string;
  requiredLevel: string;
  createdAt: number;
  creator: string;
  active: boolean;
}

interface UserBadge {
  currentLevel: string;
  totalEngagement: number;
  badgeId: number;
}

interface UserAccessLog {
  lastAccess: number;
  accessCount: number;
}

interface TierConfig {
  minEngagement: number;
  maxUsers: number;
  description: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AccessGateMock {
  state: {
    nextForumId: number;
    maxForums: number;
    admin: string;
    defaultTiers: Array<{ level: string; minEngagement: number }>;
    forumConfigs: Map<number, ForumConfig>;
    userAccessLogs: Map<string, Map<number, UserAccessLog>>;
    tierConfigs: Map<string, TierConfig>;
    userBadges: Map<string, UserBadge>;
  } = {
    nextForumId: 0,
    maxForums: 500,
    admin: "ST1ADMIN",
    defaultTiers: [{ level: "bronze", minEngagement: 10 }, { level: "silver", minEngagement: 50 }, { level: "gold", minEngagement: 100 }],
    forumConfigs: new Map(),
    userAccessLogs: new Map(),
    tierConfigs: new Map([
      ["bronze", { minEngagement: 10, maxUsers: 100, description: "Basic access" }],
      ["silver", { minEngagement: 50, maxUsers: 50, description: "Mid-tier" }],
      ["gold", { minEngagement: 100, maxUsers: 10, description: "Elite" }]
    ]),
    userBadges: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1USER";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextForumId: 0,
      maxForums: 500,
      admin: "ST1ADMIN",
      defaultTiers: [{ level: "bronze", minEngagement: 10 }, { level: "silver", minEngagement: 50 }, { level: "gold", minEngagement: 100 }],
      forumConfigs: new Map(),
      userAccessLogs: new Map(),
      tierConfigs: new Map([
        ["bronze", { minEngagement: 10, maxUsers: 100, description: "Basic access" }],
        ["silver", { minEngagement: 50, maxUsers: 50, description: "Mid-tier" }],
        ["gold", { minEngagement: 100, maxUsers: 10, description: "Elite" }]
      ]),
      userBadges: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1USER";
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxForums(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxForums = newMax;
    return { ok: true, value: true };
  }

  setTierConfig(level: string, minEng: number, maxUsers: number, desc: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (!["bronze", "silver", "gold"].includes(level)) return { ok: false, value: false };
    if (minEng <= 0 || minEng > 10000 || desc.length > 100) return { ok: false, value: false };
    this.state.tierConfigs.set(level, { minEngagement: minEng, maxUsers, description: desc });
    return { ok: true, value: true };
  }

  createForum(name: string, reqLevel: string): Result<number> {
    if (this.state.nextForumId >= this.state.maxForums) return { ok: false, value: ERR_MAX_FORUMS_EXCEEDED };
    if (this.state.forumConfigs.has(this.state.nextForumId)) return { ok: false, value: ERR_FORUM_ALREADY_EXISTS };
    if (!["bronze", "silver", "gold"].includes(reqLevel) || name.length > 50) return { ok: false, value: ERR_INVALID_LEVEL };
    this.state.forumConfigs.set(this.state.nextForumId, {
      name,
      requiredLevel: reqLevel,
      createdAt: this.blockHeight,
      creator: this.caller,
      active: true
    });
    const id = this.state.nextForumId;
    this.state.nextForumId++;
    return { ok: true, value: id };
  }

  deactivateForum(forumId: number): Result<boolean> {
    const forum = this.state.forumConfigs.get(forumId);
    if (!forum || !forum.active) return { ok: false, value: false };
    if (forum.creator !== this.caller) return { ok: false, value: false };
    this.state.forumConfigs.set(forumId, { ...forum, active: false });
    return { ok: true, value: true };
  }

  getForumConfig(forumId: number): ForumConfig | null {
    return this.state.forumConfigs.get(forumId) || null;
  }

  checkAccess(forumId: number, user: string): Result<{ accessGranted: boolean; level: string; timestamp: number }> {
    const forum = this.state.forumConfigs.get(forumId);
    if (!forum || !forum.active) return { ok: false, value: ERR_FORUM_NOT_FOUND };
    const userBadge = this.state.userBadges.get(user);
    if (!userBadge) return { ok: false, value: ERR_BADGE_NOT_OWNED };
    const tierMin = this.state.tierConfigs.get(userBadge.currentLevel)?.minEngagement || 0;
    if (userBadge.totalEngagement < tierMin) return { ok: false, value: ERR_INSUFFICIENT_ENGAGEMENT };
    if (userBadge.currentLevel !== forum.requiredLevel) return { ok: false, value: ERR_LEVEL_MISMATCH };
    const key = `${user}-${forumId}`;
    const log = this.state.userAccessLogs.get(user)?.get(forumId) || { lastAccess: 0, accessCount: 0 };
    this.state.userAccessLogs.set(user, new Map([[forumId, { ...log, lastAccess: this.blockHeight, accessCount: log.accessCount + 1 }]]));
    return { ok: true, value: { accessGranted: true, level: userBadge.currentLevel, timestamp: this.blockHeight } };
  }

  updateUserBadge(user: string, newLevel: string, newEng: number): Result<boolean> {
    if (this.caller !== user) return { ok: false, value: false };
    if (!["bronze", "silver", "gold"].includes(newLevel)) return { ok: false, value: false };
    const currentBadge = this.state.userBadges.get(user);
    if (currentBadge && newEng < currentBadge.totalEngagement) return { ok: false, value: false };
    this.state.userBadges.set(user, {
      currentLevel: newLevel,
      totalEngagement: newEng,
      badgeId: currentBadge?.badgeId || this.blockHeight
    });
    return { ok: true, value: true };
  }

  getUserAccessLog(user: string, forumId: number): UserAccessLog | null {
    return this.state.userAccessLogs.get(user)?.get(forumId) || null;
  }

  getUserBadge(user: string): UserBadge | null {
    return this.state.userBadges.get(user) || null;
  }

  getTierConfig(level: string): TierConfig | null {
    return this.state.tierConfigs.get(level) || null;
  }

  setDefaultTiers(tiers: Array<{ level: string; minEngagement: number }>): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.defaultTiers = tiers;
    return { ok: true, value: true };
  }

  getForumCount(): Result<number> {
    return { ok: true, value: this.state.nextForumId };
  }

  isForumActive(forumId: number): Result<boolean> {
    const forum = this.state.forumConfigs.get(forumId);
    return { ok: true, value: !!forum?.active };
  }
}

describe("AccessGate", () => {
  let contract: AccessGateMock;

  beforeEach(() => {
    contract = new AccessGateMock();
    contract.reset();
  });

  it("creates a forum successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.createForum("Policy Forum", "bronze");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const forum = contract.getForumConfig(0);
    expect(forum?.name).toBe("Policy Forum");
    expect(forum?.requiredLevel).toBe("bronze");
    expect(forum?.active).toBe(true);
  });

  it("rejects forum creation with invalid level", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.createForum("Invalid Forum", "platinum");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LEVEL);
  });

  it("rejects forum creation when max exceeded", () => {
    contract.caller = "ST1ADMIN";
    contract.state.maxForums = 1;
    contract.createForum("First", "bronze");
    const result = contract.createForum("Second", "silver");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_FORUMS_EXCEEDED);
  });

  it("grants access successfully", () => {
    contract.caller = "ST1USER";
    contract.createForum("Test Forum", "bronze");
    contract.updateUserBadge("ST1USER", "bronze", 20);
    const result = contract.checkAccess(0, "ST1USER");
    expect(result.ok).toBe(true);
    expect(result.value.accessGranted).toBe(true);
    expect(result.value.level).toBe("bronze");
    const log = contract.getUserAccessLog("ST1USER", 0);
    expect(log?.accessCount).toBe(1);
  });

  it("denies access due to insufficient engagement", () => {
    contract.createForum("Test Forum", "bronze");
    contract.updateUserBadge("ST1USER", "bronze", 5);
    const result = contract.checkAccess(0, "ST1USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_ENGAGEMENT);
  });

  it("denies access for non-owned badge", () => {
    contract.createForum("Test Forum", "bronze");
    const result = contract.checkAccess(0, "ST2USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BADGE_NOT_OWNED);
  });

  it("denies access due to level mismatch", () => {
    contract.createForum("Test Forum", "silver");
    contract.updateUserBadge("ST1USER", "bronze", 60);
    const result = contract.checkAccess(0, "ST1USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_LEVEL_MISMATCH);
  });

  it("deactivates forum successfully", () => {
    contract.caller = "ST1CREATOR";
    contract.createForum("Deact Forum", "bronze");
    const result = contract.deactivateForum(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const forum = contract.getForumConfig(0);
    expect(forum?.active).toBe(false);
  });

  it("rejects deactivation by non-creator", () => {
    contract.caller = "ST1CREATOR";
    contract.createForum("Deact Forum", "bronze");
    contract.caller = "ST2FAKE";
    const result = contract.deactivateForum(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates user badge successfully", () => {
    const result = contract.updateUserBadge("ST1USER", "silver", 60);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const badge = contract.getUserBadge("ST1USER");
    expect(badge?.currentLevel).toBe("silver");
    expect(badge?.totalEngagement).toBe(60);
  });

  it("rejects badge update by unauthorized user", () => {
    contract.caller = "ST2FAKE";
    const result = contract.updateUserBadge("ST1USER", "gold", 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects badge update with invalid level", () => {
    const result = contract.updateUserBadge("ST1USER", "invalid", 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets tier config successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setTierConfig("gold", 200, 5, "Elite updated");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const tier = contract.getTierConfig("gold");
    expect(tier?.minEngagement).toBe(200);
    expect(tier?.description).toBe("Elite updated");
  });

  it("rejects tier config set by non-admin", () => {
    const result = contract.setTierConfig("bronze", 5, 200, "Basic updated");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets max forums successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxForums(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxForums).toBe(1000);
  });

  it("returns forum count correctly", () => {
    contract.caller = "ST1ADMIN";
    contract.createForum("One", "bronze");
    contract.createForum("Two", "silver");
    const result = contract.getForumCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks forum activity correctly", () => {
    contract.caller = "ST1ADMIN";
    contract.createForum("Active Forum", "bronze");
    let result = contract.isForumActive(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    contract.deactivateForum(0);
    result = contract.isForumActive(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });
});