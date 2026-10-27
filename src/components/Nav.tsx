"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Ask"],
  ["/saved", "Saved"],
  ["/history", "History"],
  ["/stats", "Stats"],
  ["/settings", "Settings"],
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login" || path.startsWith("/setup")) return null;
  return (
    <nav className="mb-6 flex gap-2 overflow-x-auto">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="chip" aria-pressed={path === href}>{label}</Link>
      ))}
    </nav>
  );
}
