'use client';

/** Sends a browser crash to the API, which logs it and forwards it to Sentry when configured. */
export function reportError(message: string, stack?: string) {
  try {
    void fetch('/api/v1/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app: 'web', message: message.slice(0, 2000), stack: stack?.slice(0, 10_000), url: window.location.pathname }),
      keepalive: true,
    });
  } catch {
    // never let reporting break the page
  }
}
