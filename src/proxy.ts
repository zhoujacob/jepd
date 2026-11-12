import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (!config) return response;
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Refresh the session cookie. getClaims verifies the token locally when the
  // project uses asymmetric signing keys (no Auth round trip per request) and
  // otherwise asks Auth, as getUser would. Page-level guards do authorization.
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/home/:path*",
    "/tournaments/:path*",
    "/sessions/:path*",
    "/execs/:path*",
    "/discord/:path*",
    "/auth/discord/:path*",
    "/login",
  ],
};
