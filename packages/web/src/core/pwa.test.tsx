import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui";
import { ReadView } from "./ReadView";
import { UpdatePrompt } from "./UpdatePrompt";

const register = vi.hoisted(() => ({
  needRefresh: false,
  updateServiceWorker: vi.fn(async () => {}),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [register.needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: register.updateServiceWorker,
  }),
}));

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  register.needRefresh = false;
  vi.restoreAllMocks();
});

/** The owner switches to another app and back (Claude wrote meanwhile). */
async function comeBack() {
  await act(async () => {
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function view(load: () => Promise<string | null>) {
  return render(
    <ReadView
      load={load}
      empty={<p>Nothing here yet</p>}
      skeleton={<p>Loading</p>}
    >
      {(data) => <p>Got {data}</p>}
    </ReadView>,
  );
}

describe("a read when the app comes back", () => {
  it("shows what was written meanwhile, without navigating or a loading flash", async () => {
    let finish: (value: string) => void = () => {};
    const load = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("FE-01")
      .mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );
    view(load);
    expect(await screen.findByText("Got FE-01")).toBeInTheDocument();

    await comeBack();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Got FE-01")).toBeInTheDocument(); // still shown
    expect(screen.queryByText("Loading")).toBeNull();

    await act(async () => finish("FE-02"));
    expect(screen.getByText("Got FE-02")).toBeInTheDocument();
  });

  it("keeps what's on screen when the background read fails", async () => {
    const load = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("FE-01")
      .mockRejectedValueOnce(new Error("500"));
    view(load);
    await screen.findByText("Got FE-01");
    await comeBack();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Got FE-01")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load this")).toBeNull();
  });

  it("reads again when the connection returns", async () => {
    const load = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce("grades");
    view(load);
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(await screen.findByText("Got grades")).toBeInTheDocument();
  });

  it("doesn't read while the app is in the background", async () => {
    const load = vi.fn(async () => "x");
    view(load);
    await screen.findByText("Got x");
    await act(async () => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("UpdatePrompt", () => {
  it("says nothing until a new version is waiting", () => {
    render(
      <ToastProvider>
        <UpdatePrompt />
      </ToastProvider>,
    );
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("offers Reload for a waiting version, and only then switches to it", async () => {
    register.needRefresh = true;
    render(
      <ToastProvider>
        <UpdatePrompt />
      </ToastProvider>,
    );
    expect(
      screen.getByText("A new version of Projects Lab is ready."),
    ).toBeInTheDocument();
    expect(register.updateServiceWorker).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(register.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
