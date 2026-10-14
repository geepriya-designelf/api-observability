// Hash-based stand-ins for next/navigation so the same app can ship as one
// self-contained HTML file (see preview/build.mjs).
import { useEffect, useState } from "react";

function current(): string {
  const h = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  return "/" + (h || "health");
}

export function usePathname(): string {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const on = () => setPath(current());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

export function useRouter() {
  return {
    push: (href: string) => {
      window.location.hash = href.replace(/^\//, "");
      window.scrollTo({ top: 0 });
    },
  };
}

export function redirect(href: string): never {
  window.location.hash = href.replace(/^\//, "");
  throw new Error("redirect");
}
