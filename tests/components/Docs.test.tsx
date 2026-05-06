import { screen, fireEvent } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Docs } from "../../src/components/Docs";
import { renderWithProviders } from "../utils/renderWithProviders";

beforeAll(() => {
  class MockIntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
});

describe("Docs", () => {
  const defaultProps = {
    theme: "dark" as const,
    onToggleTheme: vi.fn(),
    onBack: vi.fn(),
  };

  it("renders the docs page with a title", () => {
    renderWithProviders(<Docs {...defaultProps} />);
    expect(screen.getByText("VibeBudget Documentation")).toBeInTheDocument();
  });

  it("renders navigation sections in the sidebar", () => {
    renderWithProviders(<Docs {...defaultProps} />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Setup Guides")).toBeInTheDocument();
    expect(screen.getAllByText("Integrations").length).toBeGreaterThan(0);
    expect(screen.getByText("User Guide")).toBeInTheDocument();
    expect(screen.getByText("Troubleshooting")).toBeInTheDocument();
  });

  it("shows the Back button", () => {
    renderWithProviders(<Docs {...defaultProps} />);
    expect(screen.getByText("Back to app")).toBeInTheDocument();
  });

  it("calls onBack when the Back button is clicked", () => {
    const onBack = vi.fn();
    renderWithProviders(<Docs {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByText("Back to app"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleTheme when the theme toggle is clicked", () => {
    const onToggleTheme = vi.fn();
    renderWithProviders(<Docs {...defaultProps} onToggleTheme={onToggleTheme} />);
    fireEvent.click(screen.getByLabelText(/Switch to light mode/i));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("renders getting-started content in Overview", () => {
    renderWithProviders(<Docs {...defaultProps} />);
    expect(screen.getByText("Core Features")).toBeInTheDocument();
    expect(screen.getAllByText("Integrations").length).toBeGreaterThan(0);
    expect(screen.getByText("Product Principles")).toBeInTheDocument();
  });
});
