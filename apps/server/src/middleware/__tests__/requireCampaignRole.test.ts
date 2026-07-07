import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createCampaignRoleGuard } from "../requireCampaignRole";

const { selectMock, fromMock, whereMock, limitMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock("@project/database", () => ({
  db: {
    select: selectMock,
  },
}));

describe("createCampaignRoleGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ limit: limitMock });
    selectMock.mockReturnValue({ from: fromMock });
  });

  const createRes = (): Response =>
    ({
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnValue(undefined),
    }) as unknown as Response;

  it("returns 401 when request user is missing", async () => {
    const guard = createCampaignRoleGuard({
      resolveCampaignId: () => "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
    });

    const req = {} as Request;
    const res = createRes();
    const next = vi.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a campaign member", async () => {
    limitMock.mockResolvedValue([]);
    const guard = createCampaignRoleGuard({
      resolveCampaignId: () => "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
    });

    const req = { user: { id: "user-1" } } as Request;
    const res = createRes();
    const next = vi.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not allowed", async () => {
    limitMock.mockResolvedValue([{ role: "player" }]);
    const guard = createCampaignRoleGuard({
      resolveCampaignId: () => "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
      allowedRoles: ["owner", "dm"],
    });

    const req = { user: { id: "user-1" } } as Request;
    const res = createRes();
    const next = vi.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when membership role is allowed", async () => {
    limitMock.mockResolvedValue([{ role: "dm" }]);
    const guard = createCampaignRoleGuard({
      resolveCampaignId: () => "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
    });

    const req = { user: { id: "user-1" } } as Request;
    const res = createRes();
    const next = vi.fn();

    await guard(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
