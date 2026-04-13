import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangeSelector } from "../../src/components/DateRangeSelector";
import type { DateRange } from "../../src/types";
import { renderWithProviders } from "../utils/renderWithProviders";

describe("DateRangeSelector", () => {
  it("switches to a preset range", () => {
    const onChange = vi.fn();
    const range: DateRange = { start: "2026-04-01", end: "2026-04-10", option: "this-month" };

    renderWithProviders(<DateRangeSelector range={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /This Month/i }));
    fireEvent.click(screen.getByRole("button", { name: "Last Month" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ option: "last-month" }));
  });

  it("shows custom date inputs when custom range is selected", () => {
    const onChange = vi.fn();
    const range: DateRange = { start: "2026-04-01", end: "2026-04-10", option: "custom" };

    const { container } = renderWithProviders(<DateRangeSelector range={range} onChange={onChange} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    fireEvent.change(dateInputs[1], { target: { value: "2026-04-20" } });
    expect(onChange).toHaveBeenCalledWith({ start: "2026-04-01", end: "2026-04-20", option: "custom" });
  });
});
