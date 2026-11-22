/**
 * True if a page's host name is this machine: `localhost`, a name ending in
 * `.localhost`, or a loopback address. Development-only tools, such as the
 * Debug button, are shown only there.
 */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' || host.endsWith('.localhost') || /^127(\.\d{1,3}){3}$/.test(host) || host === '::1' || host === '[::1]'
  );
}
