/**
 * Token store for the web app. sessionStorage ONLY — a JWT in localStorage
 * survives browser restarts and is readable by any script on page load;
 * sessionStorage is scoped to the tab and dies with it.
 *
 * Same rule the server side follows: token travels in socket handshake auth
 * (never a query string) and here never touches localStorage.
 */
const KEY = "aiops.token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null; // storage unavailable (private mode edge cases)
  }
}

export function setToken(t: string): void {
  try {
    sessionStorage.setItem(KEY, t);
  } catch {
    // ignore
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
