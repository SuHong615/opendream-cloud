// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenDream Cloud 控制台",
  description: "云端 opencode 工作区、模型、Skill、评测、应用与 MCP 控制台",
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('oc.theme');
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
