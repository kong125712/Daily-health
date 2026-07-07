"use client";

import { useEffect } from "react";
import { errorToMessage, errorToStack, reportClientError } from "@/lib/client/errorReporting";

export function ClientErrorReporter() {
  useEffect(() => {
    function onWindowError(event: ErrorEvent) {
      void reportClientError({
        source: "window-error",
        message: event.message || "Unhandled browser error",
        stack: errorToStack(event.error),
        details: {
          filename: event.filename,
          line: event.lineno,
          column: event.colno
        }
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      void reportClientError({
        source: "unhandled-rejection",
        message: errorToMessage(event.reason),
        stack: errorToStack(event.reason)
      });
    }

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
