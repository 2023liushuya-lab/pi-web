import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Noto_Sans_Mono } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import "katex/dist/katex.min.css";
import "./globals.css";

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-noto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "芫荽 Pi Web",
  description: "芫荽 — Enhanced web interface for the pi coding agent",
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("pi-locale");
  const serverLocale = (localeCookie?.value === "zh" ? "zh" : "en") as "en" | "zh";

  return (
    <html lang={serverLocale} className={notoSansMono.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <I18nProvider initialLocale={serverLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
