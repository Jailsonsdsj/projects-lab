// Stand-in for vite-plugin-pwa's virtual module, which exists only in a Vite
// build with the plugin. Tests that exercise updates mock it with vi.mock.
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  };
}
