import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import { TEST_TIMEOUT_MS } from "../vitest.config";

configure({ asyncUtilTimeout: TEST_TIMEOUT_MS / 2 });

afterEach(() => {
  cleanup();
});
