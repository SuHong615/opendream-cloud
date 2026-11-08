// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--oc-bg)",
        surface: "var(--oc-surface)",
        raised: "var(--oc-surface-raised)",
        hover: "var(--oc-surface-hover)",
        border: "var(--oc-border)",
        "border-strong": "var(--oc-border-strong)",
        fg: "var(--oc-text)",
        "fg-secondary": "var(--oc-text-secondary)",
        "fg-tertiary": "var(--oc-text-tertiary)",
        primary: "var(--oc-primary)",
        "primary-hover": "var(--oc-primary-hover)",
        "primary-subtle": "var(--oc-primary-subtle)",
        success: "var(--oc-success)",
        "success-text": "var(--oc-success-text)",
        "success-subtle": "var(--oc-success-subtle)",
        warning: "var(--oc-warning)",
        "warning-text": "var(--oc-warning-text)",
        "warning-subtle": "var(--oc-warning-subtle)",
        danger: "var(--oc-danger)",
        "danger-text": "var(--oc-danger-text)",
        "danger-subtle": "var(--oc-danger-subtle)",
        info: "var(--oc-info)",
        "info-text": "var(--oc-info-text)",
        "info-subtle": "var(--oc-info-subtle)",
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      fontSize: {
        "2xs": ["11px", "16px"],
        xs: ["12px", "20px"],
        sm: ["13px", "20px"],
        base: ["14px", "22px"],
        md: ["16px", "24px"],
        lg: ["18px", "28px"],
        xl: ["20px", "30px"],
        "2xl": ["24px", "32px"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,.10), 0 1px 2px rgba(15,23,42,.06)",
        raised: "0 12px 32px rgba(15,23,42,.14)",
      },
      minHeight: {
        screen: "100vh",
      },
    },
  },
  plugins: [],
};

export default config;
