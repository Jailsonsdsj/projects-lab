import * as ui from "../components/ui";

/** Visual components: PascalCase function exports (constants like ICONS are all
 *  caps). ToastProvider is listed as Toast, the component it renders. */
export const UI_COMPONENTS = Object.entries(ui)
  .filter(
    ([name, value]) => /^[A-Z][a-z]/.test(name) && typeof value === "function",
  )
  .map(([name]) => (name === "ToastProvider" ? "Toast" : name))
  .sort();

/** Every other runtime export: functions, hooks and constants with no UI.
 *  Type-only exports don't exist at runtime, so they're never here. */
export const UI_HELPERS = Object.entries(ui)
  .filter(
    ([name, value]) =>
      !(/^[A-Z][a-z]/.test(name) && typeof value === "function"),
  )
  .map(([name]) => name)
  .sort();
