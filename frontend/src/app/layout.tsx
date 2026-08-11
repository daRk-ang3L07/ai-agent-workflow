import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "FlowAgent — AI Workflow Builder",
  description: "Build and run AI agent workflows with multi-step execution, live monitoring, and team permissions.",
  keywords: "AI workflow, agent automation, n8n, Hasura, nhost",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-950 text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
