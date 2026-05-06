import { screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SetupChecklist } from "../../src/components/SetupChecklist";
import { renderWithProviders } from "../utils/renderWithProviders";
import type { SetupProgress } from "../../src/types";
import { createDefaultSetupProgress } from "../../src/types";

function makeProgress(overrides?: Partial<SetupProgress>): SetupProgress {
  return {
    ...createDefaultSetupProgress(),
    ...overrides,
    items: {
      ...createDefaultSetupProgress().items,
      ...(overrides?.items || {}),
    },
  };
}

describe("SetupChecklist", () => {
  it("renders all 7 checklist items", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    expect(screen.getByText("Set your currency")).toBeInTheDocument();
    expect(screen.getByText("Review expense categories")).toBeInTheDocument();
    expect(screen.getByText("Review income categories")).toBeInTheDocument();
    expect(screen.getByText("Connect Google Sheets")).toBeInTheDocument();
    expect(screen.getByText("Add AI provider key")).toBeInTheDocument();
    expect(screen.getByText("Connect bank feed")).toBeInTheDocument();
    expect(screen.getByText("Add your first entry")).toBeInTheDocument();
  });

  it("shows progress count", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    expect(screen.getByText("0 of 7 steps done")).toBeInTheDocument();
  });

  it("shows completed count when some items are done", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress({
          items: {
            currency: "completed",
            expense_categories: "completed",
            google_sheets: "completed",
            income_categories: "unchecked",
            ai_provider: "unchecked",
            bank_feed: "unchecked",
            first_entry: "unchecked",
          },
        })}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    expect(screen.getByText("3 of 7 steps done")).toBeInTheDocument();
  });

  it("shows 'All setup steps complete!' when all done", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress({
          items: {
            currency: "completed",
            expense_categories: "completed",
            income_categories: "completed",
            google_sheets: "completed",
            ai_provider: "completed",
            bank_feed: "completed",
            first_entry: "completed",
          },
        })}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    expect(screen.getByText(/All setup steps complete/)).toBeInTheDocument();
    expect(screen.getByText("You're all set!")).toBeInTheDocument();
  });

  it("auto-completes items from autoCompleted list", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={["currency", "first_entry"]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    expect(screen.getByText("2 of 7 steps done")).toBeInTheDocument();
  });

  it("calls onNavigate when Go button is clicked", () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={onNavigate}
        inline
      />,
    );

    const goButtons = screen.getAllByText("Go");
    expect(goButtons.length).toBe(7);
    fireEvent.click(goButtons[0]);
    expect(onNavigate).toHaveBeenCalledWith("currency");
  });

  it("calls onUpdateProgress with skipped item when Skip is clicked", () => {
    const onUpdateProgress = vi.fn();
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={[]}
        onUpdateProgress={onUpdateProgress}
        onNavigate={vi.fn()}
        inline
      />,
    );

    const skipButtons = screen.getAllByText("Skip");
    fireEvent.click(skipButtons[0]);
    expect(onUpdateProgress).toHaveBeenCalledWith({
      items: expect.objectContaining({ currency: "skipped" }),
    });
  });

  it("shows Done text for completed items", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress({
          items: {
            currency: "completed",
            expense_categories: "unchecked",
            income_categories: "unchecked",
            google_sheets: "unchecked",
            ai_provider: "unchecked",
            bank_feed: "unchecked",
            first_entry: "unchecked",
          },
        })}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("shows Undo for skipped items", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress({
          items: {
            currency: "skipped",
            expense_categories: "unchecked",
            income_categories: "unchecked",
            google_sheets: "unchecked",
            ai_provider: "unchecked",
            bank_feed: "unchecked",
            first_entry: "unchecked",
          },
        })}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    const undoButton = screen.getByText("Undo");
    expect(undoButton).toBeInTheDocument();
  });

  it("renders as overlay when not inline", () => {
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("calls onClose when Dismiss button is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText("Dismiss"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders progress bar when not all done", () => {
    const { container } = renderWithProviders(
      <SetupChecklist
        progress={makeProgress()}
        autoCompleted={[]}
        onUpdateProgress={vi.fn()}
        onNavigate={vi.fn()}
        inline
      />,
    );

    expect(container.querySelector(".bg-fintech-accent")).toBeTruthy();
  });
});
