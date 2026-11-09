import type { Metadata } from "next";
import "./globals.css";
import "./components.css";

export const metadata: Metadata = {
  title: "vibe-stack-supabase",
  description: "Next.js + Supabase starter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {process.env.NEXT_PUBLIC_OPS_ENV !== "production" && (
          <div role="status" style={{padding: "12px", background: "#fff0c7", color: "#633b00", fontWeight: 800, textAlign: "center"}}>
            SIMULATION — NOT A CONFIRMED BOOKING. No payments, ticketing or client messaging.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
