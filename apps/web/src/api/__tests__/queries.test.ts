import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCharacterSheet, useUpdateFlavor } from "../queries";

const { mockUseQuery, mockUseMutation, mockUseQueryClient, mockApiClient } =
  vi.hoisted(() => ({
    mockUseQuery: vi.fn(),
    mockUseMutation: vi.fn(),
    mockUseQueryClient: vi.fn(),
    mockApiClient: vi.fn(),
  }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("../client", () => ({
  apiClient: mockApiClient,
}));

describe("api query hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("configures useCharacterSheet query key and maps character payload", async () => {
    mockUseQuery.mockImplementation((options: any) => options);
    mockApiClient.mockResolvedValue({
      character: { id: "char_1", totalLevel: 2, currentHp: 17 },
    });

    const queryOptions = useCharacterSheet() as any;
    const data = await queryOptions.queryFn();

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["character"],
        staleTime: 1000 * 60 * 5,
      }),
    );
    expect(mockApiClient).toHaveBeenCalledWith("/character");
    expect(data).toEqual({ id: "char_1", totalLevel: 2, currentHp: 17 });
  });

  it("configures useUpdateFlavor mutation and invalidates character cache", async () => {
    const invalidateQueries = vi.fn();
    mockUseQueryClient.mockReturnValue({ invalidateQueries });
    mockUseMutation.mockImplementation((options: any) => options);
    mockApiClient.mockResolvedValue({ ok: true });

    const mutationOptions = useUpdateFlavor() as any;
    await mutationOptions.mutationFn({ alignment: "Neutral Good" });
    mutationOptions.onSuccess();

    expect(mockApiClient).toHaveBeenCalledWith("/character/flavor", {
      method: "PATCH",
      body: JSON.stringify({ alignment: "Neutral Good" }),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["character"] });
  });
});
