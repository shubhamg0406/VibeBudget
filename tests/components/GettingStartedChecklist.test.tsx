import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GettingStartedChecklist, GETTING_STARTED_ACTIONS } from "../../src/components/GettingStartedChecklist";
import { renderWithProviders } from "../utils/renderWithProviders";

describe("GettingStartedChecklist", () => {
  it("renders all checklist items", () => {
    renderWithProviders(
      <GettingStartedChecklist onNavigate={vi.fn()} />
    );

    expect(screen.getByText("View Setup Guide")).toBeInTheDocument();
    expect(screen.getByText("Set Up Integrations")).toBeInTheDocument();
    expect(screen.getByText("Import Your Data")).toBeInTheDocument();
    expect(screen.getByText("Configure AI")).toBeInTheDocument();
    expect(screen.getByText("Manage Categories")).toBeInTheDocument();
  });

  it("navigates to Settings > Data when View Setup Guide is clicked", () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <GettingStartedChecklist onNavigate={onNavigate} />
    );

    screen.getByText("View Setup Guide").click();
    expect(onNavigate).toHaveBeenCalledWith("settings", "data");
  });

  it("navigates to Settings > Finance Feeds when Set Up Integrations is clicked", () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <GettingStartedChecklist onNavigate={onNavigate} />
    );

    screen.getByText("Set Up Integrations").click();
    expect(onNavigate).toHaveBeenCalledWith("settings", "finance_feeds");
  });

  it("navigates to Settings > Data when Import Your Data is clicked", () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <GettingStartedChecklist onNavigate={onNavigate} />
    );

    screen.getByText("Import Your Data").click();
    expect(onNavigate).toHaveBeenCalledWith("settings", "data");
  });

  it("navigates to Settings > AI when Configure AI is clicked", () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <GettingStartedChecklist onNavigate={onNavigate} />
    );

    screen.getByText("Configure AI").click();
    expect(onNavigate).toHaveBeenCalledWith("settings", "ai");
  });

  it("navigates to Settings > Maintenance when Manage Categories is clicked", () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <GettingStartedChecklist onNavigate={onNavigate} />
    );

    screen.getByText("Manage Categories").click();
    expect(onNavigate).toHaveBeenCalledWith("settings", "maintenance");
  });

  it("exports GETTING_STARTED_ACTIONS mapping with correct targets", () => {
    expect(GETTING_STARTED_ACTIONS["View Setup Guide"]).toEqual({
      targetView: "settings",
      targetSection: "data",
    });
    expect(GETTING_STARTED_ACTIONS["Set Up Integrations"]).toEqual({
      targetView: "settings",
      targetSection: "finance_feeds",
    });
    expect(GETTING_STARTED_ACTIONS["Import Your Data"]).toEqual({
      targetView: "settings",
      targetSection: "data",
    });
    expect(GETTING_STARTED_ACTIONS["Configure AI"]).toEqual({
      targetView: "settings",
      targetSection: "ai",
    });
    expect(GETTING_STARTED_ACTIONS["Manage Categories"]).toEqual({
      targetView: "settings",
      targetSection: "maintenance",
    });
  });
});
