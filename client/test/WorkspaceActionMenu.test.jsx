import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceActionMenu from "../src/components/WorkspaceActionMenu.jsx";

afterEach(cleanup);

describe("workspace action menu", () => {
  it("closes its popup when the operator taps elsewhere", () => {
    render(<WorkspaceActionMenu actions={[{ key: "open", label: "Open register", onSelect: vi.fn() }]} />);

    const trigger = screen.getByLabelText("More actions");
    fireEvent.click(trigger);
    expect(trigger.closest("details")).toHaveAttribute("open");

    fireEvent.pointerDown(document.body);
    expect(trigger.closest("details")).not.toHaveAttribute("open");
  });
});
