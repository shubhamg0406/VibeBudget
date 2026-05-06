import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateDetectionPanel } from "../../src/components/DuplicateDetectionPanel";
import { renderWithProviders } from "../utils/renderWithProviders";
import { makeTransaction } from "../utils/fixtures";

const mockApi = (groups: unknown[][] = [], deleteCount = 1) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/transactions/detect-duplicates")) {
      return new Response(JSON.stringify({ groups, totalGroups: groups.length }), { status: 200 });
    }
    if (url.includes("/api/transactions/delete-batch")) {
      return new Response(JSON.stringify({ success: true, deleted: deleteCount }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "Unexpected URL" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("DuplicateDetectionPanel", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the initial state with a Find Duplicates button", () => {
    renderWithProviders(
      <DuplicateDetectionPanel
        transactions={[]}
        onDeleteTransaction={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("Find Duplicates")).toBeInTheDocument();
    expect(screen.getByText("Duplicate Detection")).toBeInTheDocument();
  });

  it("shows no duplicates state when there are unique transactions", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([]);
    renderWithProviders(
      <DuplicateDetectionPanel
        transactions={[
          makeTransaction({ id: "1" }),
          makeTransaction({ id: "2", vendor: "Different Store", amount: 200 }),
        ]}
        onDeleteTransaction={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Find Duplicates"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/detect-duplicates",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("No duplicate transactions found")).toBeInTheDocument();
  });

  it("shows duplicate groups when duplicates are detected", async () => {
    const user = userEvent.setup();
    const duplicateGroup = [
      makeTransaction({ id: "1", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
      makeTransaction({ id: "2", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
    ];
    mockApi([duplicateGroup]);
    renderWithProviders(
      <DuplicateDetectionPanel
        transactions={[
          makeTransaction({ id: "1", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
          makeTransaction({ id: "2", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
          makeTransaction({ id: "3", vendor: "Unique Store", amount: 100, date: "2026-01-02" }),
        ]}
        onDeleteTransaction={vi.fn()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Find Duplicates"));
    expect(screen.getByText((content) => content.includes("Found") && content.includes("duplicate group"))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("total transactions"))).toBeInTheDocument();
  });

  it("calls onDeleteTransaction when deleting a single duplicate", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const duplicateGroup = [
      makeTransaction({ id: "1", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
      makeTransaction({ id: "2", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
    ];
    const fetchMock = mockApi([duplicateGroup]);
    renderWithProviders(
      <DuplicateDetectionPanel
        transactions={[
          makeTransaction({ id: "1", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
          makeTransaction({ id: "2", vendor: "Dupe Store", amount: 50, date: "2026-01-01" }),
        ]}
        onDeleteTransaction={onDelete}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Find Duplicates"));
    const deleteButtons = screen.getAllByRole("button", { name: /delete duplicate transaction/i });
    expect(deleteButtons.length).toBe(1);
    await user.click(deleteButtons[0]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/delete-batch",
      expect.objectContaining({ body: JSON.stringify({ ids: ["2"] }) }),
    );
    expect(onDelete).toHaveBeenCalledWith("2");
  });
});
