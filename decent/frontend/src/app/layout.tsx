import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "react-hot-toast";
// import { AgentationWrapper } from "@/components/AgentationWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human Resource Management System",
  description: "Human Resource Management System",
  icons: {
    icon: "/fav.ico",
    shortcut: "/fav.ico",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased min-h-screen text-slate-900 dark:text-slate-100 flex flex-col"
      >
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
          
        </AuthProvider>
      </body>
    </html>
  );
}