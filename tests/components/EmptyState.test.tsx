import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "../../src/components/common/EmptyState";
import { renderWithProviders } from "../utils/renderWithProviders";
import { PiggyBank } from "lucide-react";

describe("EmptyState", () => {
  it("renders title and description", () => {
    renderWithProviders(
      <EmptyState title="No data" description="There is nothing to show yet." />
    );

    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("There is nothing to show yet.")).toBeInTheDocument();
  });

  it("renders a custom icon", () => {
    renderWithProviders(
      <EmptyState icon={PiggyBank} title="No savings" description="Start saving to see progress." />
    );

    expect(screen.getByText("No savings")).toBeInTheDocument();
  });

  it("renders an action button when provided", () => {
    const onClick = vi.fn();
    renderWithProviders(
      <EmptyState
        title="Empty"
        description="Do something"
        action={{ label: "Add Item", onClick }}
      />
    );

    const btn = screen.getByRole("button", { name: "Add Item" });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders without an action when not provided", () => {
    renderWithProviders(
      <EmptyState title="Nothing here" description="No action needed." />
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders compact variant with smaller layout", () => {
    renderWithProviders(
      <EmptyState
        title="Compact empty"
        description="Smaller layout"
        compact
      />
    );

    expect(screen.getByText("Compact empty")).toBeInTheDocument();
    expect(screen.getByText("Smaller layout")).toBeInTheDocument();
  });
});
