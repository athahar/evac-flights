// Vercel Routing Middleware: gate the whole personal site behind HTTP Basic Auth.
// Any username works; the password must match PERSONAL_PASSWORD. Fails closed if unset.
export const config = { matcher: "/:path*" };

export default function middleware(request) {
  const expected = process.env.PERSONAL_PASSWORD;
  const header = request.headers.get("authorization") || "";

  if (expected && header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return;
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Personal Flights"' }
  });
}
