import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderStatusCard } from "../../src/components/ProviderStatusCard";

describe("ProviderStatusCard", () => {
  it("renders not_configured status correctly", () => {
    render(
      <ProviderStatusCard
        name="Plaid"
        status={{ level: "not_configured", label: "Not configured" }}
        helpText="Get credentials from the dashboard"
      />
    );
    expect(screen.getByText("Plaid")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText("Get credentials from the dashboard")).toBeInTheDocument();
  });

  it("renders configured status correctly", () => {
    render(
      <ProviderStatusCard name="AI" status={{ level: "configured", label: "Configured" }} />
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
  });

  it("renders connected status with last sync timestamp", () => {
    render(
      <ProviderStatusCard
        name="Plaid"
        status={{ level: "connected", label: "Connected" }}
        lastSyncAt="2026-05-01T12:00:00Z"
      />
    );
    expect(screen.getByText("Plaid")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/Synced/)).toBeInTheDocument();
  });

  it("renders needs_attention status with error", () => {
    render(
      <ProviderStatusCard
        name="Teller"
        status={{ level: "needs_attention", label: "Needs attention" }}
        error="Token expired"
      />
    );
    expect(screen.getByText("Teller")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Token expired")).toBeInTheDocument();
  });

  it("renders action buttons and calls handlers", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const onTertiary = vi.fn();
    render(
      <ProviderStatusCard
        name="Plaid"
        status={{ level: "connected", label: "Connected" }}
        onPrimaryAction={onPrimary}
        primaryActionLabel="Connect"
        onSecondaryAction={onSecondary}
        secondaryActionLabel="Sync"
        onTertiaryAction={onTertiary}
        tertiaryActionLabel="Disconnect"
      />
    );
    fireEvent.click(screen.getByText("Connect"));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Sync"));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Disconnect"));
    expect(onTertiary).toHaveBeenCalledTimes(1);
  });

  it("renders children content", () => {
    render(
      <ProviderStatusCard name="Plaid" status={{ level: "not_configured", label: "Not configured" }}>
        <div data-testid="child-content">Extra config here</div>
      </ProviderStatusCard>
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("does not render action buttons when no handlers given", () => {
    render(
      <ProviderStatusCard name="AI" status={{ level: "configured", label: "Configured" }} />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders setup link", () => {
    render(
      <ProviderStatusCard
        name="Plaid"
        status={{ level: "not_configured", label: "Not configured" }}
        setupLink={{ url: "https://dashboard.plaid.com", label: "Plaid Dashboard" }}
      />
    );
    const link = screen.getByText("Plaid Dashboard");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://dashboard.plaid.com");
  });
});
