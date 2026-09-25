import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { login } from "./actions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
      authentication_required: "Sign in to continue to TravelPro Operations.",
  missing_credentials: "Enter both email address and password.",
  invalid_credentials: "The email address or password is incorrect.",
  session_verification_failed:
    "Your session could not be verified. Please sign in again.",
  unauthorized:
    "This account is not authorised to access TravelPro Operations.",
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: operator } = await supabase
      .from("app_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (operator) {
      redirect("/");
    }
  }

  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f4f1e9",
        color: "#102a43",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "36px",
          border: "1px solid #cbd5e1",
          borderRadius: "18px",
          background: "#ffffff",
          boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            color: "#087f73",
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.14em",
          }}
        >
          TRAVELPRO OPERATIONS
        </p>

        <h1
          style={{
            margin: "0 0 10px",
            fontSize: "36px",
            lineHeight: 1.1,
          }}
        >
          Owner sign in
        </h1>

        <p
          style={{
            margin: "0 0 28px",
            color: "#52647a",
            lineHeight: 1.6,
          }}
        >
          Sign in with your authorised owner account to access operational
          records and proposal controls.
        </p>

        {errorMessage && (
          <div
            role="alert"
            style={{
              marginBottom: "20px",
              padding: "12px 14px",
              border: "1px solid #fecaca",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#991b1b",
            }}
          >
            {errorMessage}
          </div>
        )}

        <form action={login}>
          <label
            htmlFor="email"
            style={{
              display: "block",
              marginBottom: "18px",
              fontWeight: 700,
            }}
          >
            Email address
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "12px 14px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                font: "inherit",
                boxSizing: "border-box",
              }}
            />
          </label>

          <label
            htmlFor="password"
            style={{
              display: "block",
              marginBottom: "24px",
              fontWeight: 700,
            }}
          >
            Password
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "12px 14px",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                font: "inherit",
                boxSizing: "border-box",
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "13px 18px",
              border: 0,
              borderRadius: "10px",
              background: "#087f73",
              color: "#ffffff",
              font: "inherit",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Sign in securely
          </button>
        </form>

        <p
          style={{
            margin: "22px 0 0",
            color: "#64748b",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          Access is restricted to authorised TravelPro operators. There is no
          public account registration.
        </p>
      </section>
    </main>
  );
}