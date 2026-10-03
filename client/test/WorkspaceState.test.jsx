import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkspaceState from "../src/components/WorkspaceState.jsx";

describe("WorkspaceState", () => {
  it("presents loading as a non-actionable live status", () => {
    render(<WorkspaceState title="Loading collections" detail="Preparing the daily queue." />);

    const state = screen.getByRole("status");
    expect(state).toHaveTextContent("Loading workspace");
    expect(state).toHaveTextContent("Loading collections");
    expect(state).toHaveTextContent("Preparing the daily queue.");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("presents a failure and runs its supplied retry action once", () => {
    const onRetry = vi.fn();
    render(<WorkspaceState state="error" title="Collections are unavailable" detail="Try again in a moment." onRetry={onRetry} />);

    const state = screen.getByRole("alert");
    expect(state).toHaveTextContent("Workspace unavailable");
    expect(state).toHaveTextContent("Collections are unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
