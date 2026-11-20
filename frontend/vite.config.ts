
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],

  test: {
    // Simulate a browser environment for React components.
    environment: "jsdom",

    // Load shared test matchers before running tests.
    setupFiles: "./src/test/setup.ts",

    // Allow describe, it, expect without importing each time.
    globals: true,

    // Restore mocks between tests.
    clearMocks: true,
    restoreMocks: true,
  },
});
