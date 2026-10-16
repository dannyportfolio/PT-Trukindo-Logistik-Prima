"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { PublicFooter } from "./PublicFooter";

export function ConditionalFooter() {
  const pathname = usePathname();

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/services") ||
    pathname.startsWith("/fleet-cargo") ||
    pathname.startsWith("/industries") ||
    pathname.startsWith("/operations-safety") ||
    pathname.startsWith("/quote") ||
    pathname.startsWith("/contact");

  if (!isPublicRoute) {
    return null;
  }

  return <PublicFooter />;
}
