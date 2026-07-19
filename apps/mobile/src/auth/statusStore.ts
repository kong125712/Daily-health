// TypeScript's generic module resolver uses this file; Metro selects the
// platform-specific implementation at runtime.
export { readCachedAuthStatus, writeCachedAuthStatus } from "./status.native";
