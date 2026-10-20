import { vi } from "vitest";

type Handler = (init?: RequestInit) => Response | Promise<Response>;

/** Mocks fetch with one handler per "METHOD /path"; anything else fails loudly. */
export function mockApi(routes: Record<string, Handler>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      const key = `${init?.method ?? "GET"} ${url}`;
      const handler = routes[key];
      if (!handler) throw new Error(`unexpected request ${key}`);
      return handler(init);
    });
}

export const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

/** Settings' Backup card reads its status on open: no backup yet. */
export const NO_BACKUP = { lastExportedAt: null };

/** The calls a test's action made: everything but the Backup card's own read. */
export function actionCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.filter(
    ([input]) => String(input) !== "/api/backup",
  );
}
