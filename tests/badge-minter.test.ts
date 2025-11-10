// badge-minter.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import {
  stringAsciiCV,
  uintCV,
  listCV,
  someCV,
  noneCV,
} from "@stacks/transactions";

const ERR_INVALID_MINT_TYPE = 300;
const ERR_INSUFFICIENT_ENGAGEMENT = 301;
const ERR_UNAUTHORIZED = 302;
const ERR_MINT_ALREADY_EXISTS = 303;
const ERR_INVALID_TIMESTAMP = 304;
const ERR_MAX_MINTS_EXCEEDED = 305;
const ERR_INVALID_TRAIT = 306;
const ERR_BADGE_NOT_SOULBOUND = 307;
const ERR_METADATA_INVALID = 308;
const ERR_SUPPLY_EXCEEDED = 309;
const ERR_LEVEL_MISMATCH = 310;
const ERR_ROYALTY_SET_FAILED = 311;
const ERR_TRANSFER_NOT_ALLOWED = 312;
const ERR_USER_NOT_REGISTERED = 313;
const ERR_COLLECTION_ALREADY_INIT = 314;
const ERR_INVALID_ROYALTY = 315;

interface BadgeNFT {
  owner: string;
  level: string;
  traits: string[];
  mintedAt: number;
  metadata: string;
}

interface UserMints {
  mintCount: number;
  firstMint: number;
  lastUpgrade: number;
}

interface CollectionMetadata {
  name: string;
  symbol: string;
  totalSupply: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class BadgeMinterMock {
  state: {
    nextMintId: number;
    maxMintsPerUser: number;
    admin: string;
    collectionUri: string;
    royaltyPercent: number;
    soulboundEnforced: boolean;
    userMints: Map<string, UserMints>;
    badgeNfts: Map<number, BadgeNFT>;
    mintIndex: Map<string, Set<number>>;
    collectionMetadata: Map<number, CollectionMetadata>;
  } = {
    nextMintId: 0,
    maxMintsPerUser: 5,
    admin: "ST1ADMIN",
    collectionUri: "https://civicengage.io/badges/",
    royaltyPercent: 500,
    soulboundEnforced: true,
    userMints: new Map(),
    badgeNfts: new Map(),
    mintIndex: new Map(),
    collectionMetadata: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1USER";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextMintId: 0,
      maxMintsPerUser: 5,
      admin: "ST1ADMIN",
      collectionUri: "https://civicengage.io/badges/",
      royaltyPercent: 500,
      soulboundEnforced: true,
      userMints: new Map(),
      badgeNfts: new Map(),
      mintIndex: new Map(),
      collectionMetadata: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1USER";
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxMintsPerUser(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxMintsPerUser = newMax;
    return { ok: true, value: true };
  }

  setCollectionUri(newUri: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newUri.length > 200) return { ok: false, value: false };
    this.state.collectionUri = newUri;
    return { ok: true, value: true };
  }

  setSoulboundEnforced(enforced: boolean): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.soulboundEnforced = enforced;
    return { ok: true, value: true };
  }

  initCollection(name: string, symbol: string, supply: number): Result<number> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (this.state.collectionMetadata.has(1))
      return { ok: false, value: ERR_COLLECTION_ALREADY_INIT };
    if (name.length > 50 || symbol.length > 10 || supply <= 0)
      return { ok: false, value: false };
    this.state.collectionMetadata.set(1, { name, symbol, totalSupply: supply });
    return { ok: true, value: 1 };
  }

  mintBadge(
    level: string,
    engagement: number,
    traits: string[],
    metadata: string
  ): Result<number> {
    if (!["bronze", "silver", "gold"].includes(level))
      return { ok: false, value: ERR_INVALID_MINT_TYPE };
    const minEng = level === "bronze" ? 10 : level === "silver" ? 50 : 100;
    if (engagement < minEng)
      return { ok: false, value: ERR_INSUFFICIENT_ENGAGEMENT };
    const userMint = this.state.userMints.get(this.caller) || {
      mintCount: 0,
      firstMint: 0,
      lastUpgrade: 0,
    };
    if (userMint.mintCount >= this.state.maxMintsPerUser)
      return { ok: false, value: ERR_MAX_MINTS_EXCEEDED };
    const userMints = this.state.mintIndex.get(this.caller) || new Set();
    if (userMints.has(this.state.nextMintId))
      return { ok: false, value: ERR_MINT_ALREADY_EXISTS };
    if (traits.some((t) => t.length < 1 || t.length > 20))
      return { ok: false, value: ERR_INVALID_TRAIT };
    if (metadata.length > 200)
      return { ok: false, value: ERR_METADATA_INVALID };
    const id = this.state.nextMintId;
    this.state.badgeNfts.set(id, {
      owner: this.caller,
      level,
      traits,
      mintedAt: this.blockHeight,
      metadata,
    });
    userMints.add(id);
    if (!this.state.mintIndex.has(this.caller))
      this.state.mintIndex.set(this.caller, userMints);
    this.state.userMints.set(this.caller, {
      mintCount: userMint.mintCount + 1,
      firstMint: userMint.mintCount === 0 ? id : userMint.firstMint,
      lastUpgrade: this.blockHeight,
    });
    this.state.nextMintId++;
    return { ok: true, value: id };
  }

  burnBadge(tokenId: number): Result<boolean> {
    const badge = this.state.badgeNfts.get(tokenId);
    if (!badge || badge.owner !== this.caller)
      return { ok: false, value: false };
    if (!this.state.soulboundEnforced)
      return { ok: false, value: ERR_BADGE_NOT_SOULBOUND };
    this.state.badgeNfts.delete(tokenId);
    const userMints = this.state.mintIndex.get(this.caller);
    userMints?.delete(tokenId);
    if (userMints && userMints.size === 0)
      this.state.mintIndex.delete(this.caller);
    return { ok: true, value: true };
  }

  setRoyalty(
    tokenId: number,
    royalty?: { recipient: string; percentage: number }
  ): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (royalty && (royalty.percentage > 10000 || royalty.percentage < 0))
      return { ok: false, value: ERR_INVALID_ROYALTY };
    return { ok: true, value: true };
  }

  getBadgeDetails(tokenId: number): BadgeNFT | null {
    return this.state.badgeNfts.get(tokenId) || null;
  }

  getUserMintInfo(user: string): UserMints | null {
    return this.state.userMints.get(user) || null;
  }

  getCollectionMetadata(collectionId: number): CollectionMetadata | null {
    return this.state.collectionMetadata.get(collectionId) || null;
  }

  transferBadge(tokenId: number, recipient: string): Result<boolean> {
    if (this.state.soulboundEnforced)
      return { ok: false, value: ERR_TRANSFER_NOT_ALLOWED };
    const badge = this.state.badgeNfts.get(tokenId);
    if (!badge || badge.owner !== this.caller)
      return { ok: false, value: false };
    this.state.badgeNfts.set(tokenId, { ...badge, owner: recipient });
    return { ok: true, value: true };
  }

  getMintCount(): Result<number> {
    return { ok: true, value: this.state.nextMintId };
  }

  isSoulboundEnforced(): Result<boolean> {
    return { ok: true, value: this.state.soulboundEnforced };
  }
}

describe("BadgeMinter", () => {
  let contract: BadgeMinterMock;

  beforeEach(() => {
    contract = new BadgeMinterMock();
    contract.reset();
  });

  it("mints bronze badge successfully", () => {
    const result = contract.mintBadge(
      "bronze",
      15,
      ["trait1", "trait2"],
      "meta"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const badge = contract.getBadgeDetails(0);
    expect(badge?.level).toBe("bronze");
    expect(badge?.owner).toBe("ST1USER");
    expect(badge?.traits).toEqual(["trait1", "trait2"]);
    const info = contract.getUserMintInfo("ST1USER");
    expect(info?.mintCount).toBe(1);
  });

  it("mints silver badge with sufficient engagement", () => {
    const result = contract.mintBadge(
      "silver",
      60,
      ["silver-trait"],
      "silver-meta"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const badge = contract.getBadgeDetails(0);
    expect(badge?.level).toBe("silver");
  });

  it("rejects insufficient engagement for gold", () => {
    const result = contract.mintBadge("gold", 90);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_ENGAGEMENT);
  });

  it("rejects invalid mint type", () => {
    const result = contract.mintBadge("platinum", 100, [], "");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MINT_TYPE);
  });

  it("rejects max mints exceeded", () => {
    contract.state.maxMintsPerUser = 1;
    contract.mintBadge("bronze", 15, [], "");
    const result = contract.mintBadge("silver", 60, [], "");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_MINTS_EXCEEDED);
  });

  it("rejects invalid trait length", () => {
    const result = contract.mintBadge(
      "bronze",
      15,
      ["toolongtrait123456789012345678901"],
      ""
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TRAIT);
  });

  it("rejects invalid metadata length", () => {
    const longMeta = "a".repeat(201);
    const result = contract.mintBadge("bronze", 15, [], longMeta);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_METADATA_INVALID);
  });

  it("burns badge successfully when soulbound enforced", () => {
    contract.mintBadge("bronze", 15, [], "");
    const result = contract.burnBadge(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const badge = contract.getBadgeDetails(0);
    expect(badge).toBeNull();
  });

  it("rejects burn by non-owner", () => {
    contract.caller = "ST1USER";
    contract.mintBadge("bronze", 15, [], "");
    contract.caller = "ST2FAKE";
    const result = contract.burnBadge(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets royalty successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setRoyalty(0, {
      recipient: "ST1ROYALTY",
      percentage: 100,
    });
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects royalty set by non-admin", () => {
    const result = contract.setRoyalty(0, {
      recipient: "ST1ROYALTY",
      percentage: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects invalid royalty percentage", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setRoyalty(0, {
      recipient: "ST1ROYALTY",
      percentage: 10001,
    });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROYALTY);
  });

  it("initializes collection successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.initCollection("Civic Badges", "CB", 1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const meta = contract.getCollectionMetadata(1);
    expect(meta?.name).toBe("Civic Badges");
    expect(meta?.totalSupply).toBe(1000);
  });

  it("rejects collection init by non-admin", () => {
    const result = contract.initCollection("Test", "TB", 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects duplicate collection init", () => {
    contract.caller = "ST1ADMIN";
    contract.initCollection("Civic Badges", "CB", 1000);
    const result = contract.initCollection("Duplicate", "DB", 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_COLLECTION_ALREADY_INIT);
  });

  it("rejects transfer when soulbound", () => {
    contract.mintBadge("bronze", 15, [], "");
    const result = contract.transferBadge(0, "ST2RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_NOT_ALLOWED);
  });

  it("returns mint count correctly", () => {
    contract.mintBadge("silver", 60, [], "");
    contract.mintBadge("gold", 110, [], "");
    const result = contract.getMintCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});
