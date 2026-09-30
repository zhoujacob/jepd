import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { isClubRole } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const origin = getSiteOrigin();
  if (!origin)
    return new NextResponse("Sign-in is not configured.", { status: 503 });

  const callbackOrigin = origin;

  function goTo(path: string) {
    const response = NextResponse.redirect(new URL(path, callbackOrigin));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || request.nextUrl.searchParams.has("error"))
    return goTo("/login?error=oauth");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return goTo("/login?error=oauth");

  const { data: role, error: accessError } = await supabase.rpc(
    "activate_club_access",
  );
  if (accessError || !isClubRole(role)) {
    await supabase.auth.signOut({ scope: "local" });
    return goTo(accessError ? "/login?error=setup" : "/login?error=access");
  }

  return goTo("/home");
}
