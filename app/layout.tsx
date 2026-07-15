import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppProvider } from "@/lib/i18n/I18nProvider";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNavigation } from "@/components/navigation/BottomNavigation";
import { ClientErrorReporter } from "@/components/shared/ClientErrorReporter";

export const metadata: Metadata = {
  title: "Daily Health",
  description: "AI ingredient recognition, recipe recommendations, and everyday health tracking."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/capacitor-native-bridge.js" strategy="beforeInteractive" />
      </head>
      <body>
        <AppProvider>
          <ClientErrorReporter />
          <Navbar />
          {children}
          <BottomNavigation />
        </AppProvider>
      </body>
    </html>
  );
}
