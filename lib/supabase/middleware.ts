import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./config";

type CookieWrite = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

const publicRoutes = new Set([
  "/login",
  "/api/health",
  "/api/v1/inquiry",
  "/api/stripe/webhooks",
]);

function isPublicRoute(pathname: string) {
  return publicRoutes.has(pathname);
}

function unauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("error", "authentication_required");

  return NextResponse.redirect(loginUrl);
}

function forbiddenResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Owner access required." },
      { status: 403 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("error", "unauthorized");

  return NextResponse.redirect(loginUrl);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const routeIsPublic = isPublicRoute(pathname);

  let response = NextResponse.next({ request });

  if (!supabaseUrl || !supabasePublishableKey) {
    if (routeIsPublic) {
      return response;
    }

    return new NextResponse("Authentication service is not configured.", {
      status: 503,
    });
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieWrite[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );

            response = NextResponse.next({ request });

            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (routeIsPublic) {
      return response;
    }

    if (userError || !user) {
      return unauthorizedResponse(request);
    }

    const { data: owner, error: ownerError } = await supabase
      .from("app_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (ownerError) {
      return new NextResponse("Authorization service is unavailable.", {
        status: 503,
      });
    }

    if (!owner) {
      return forbiddenResponse(request);
    }

    return response;
  } catch {
    if (routeIsPublic) {
      return response;
    }

    return new NextResponse("Authentication service is unavailable.", {
      status: 503,
    });
  }
}