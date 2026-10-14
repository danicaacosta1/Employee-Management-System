"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import logo from "@/public/images/logo.png";
import { signOut } from "@/lib/auth/actions";
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MegaphoneIcon,
  UserIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { cx, type IconType } from "./ui";
import { usePortal } from "./portal-context";

export type NavItem = { href: string; label: string; icon: IconType };

export const EMPLOYEE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/attendance", label: "Attendance Records", icon: CalendarIcon },
  { href: "/tasks", label: "My Tasks", icon: CheckCircleIcon },
  { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
  { href: "/leave", label: "Leave Requests", icon: FileTextIcon },
  { href: "/profile", label: "My Profile", icon: UserIcon },
];

export const MANAGER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/employees", label: "Employees", icon: UsersIcon },
  { href: "/attendance", label: "Attendance", icon: ClockIcon },
  { href: "/tasks", label: "Tasks", icon: CheckCircleIcon },
  { href: "/leave", label: "Leave Requests", icon: FileTextIcon },
  { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
];

export function PortalSidebar({
  nav,
  heading,
  onNavigate,
}: {
  nav: NavItem[];
  /** Small section label above the links (manager "WORKSPACE"). */
  heading?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { basePath, preview } = usePortal();

  return (
    <div className="flex h-full flex-col bg-[#1f2329] px-3 pt-5 pb-5 text-slate-300">
      <div className={cx("flex flex-col items-center gap-2.5", heading ? "mb-5" : "mb-6")}>
        <Image src={logo} alt="Ridleys Corp logo" width={96} height={93} priority className="size-24 object-contain" />
        <span className="text-[13px] font-bold tracking-wide text-white">RIDLEYS CORP</span>
      </div>

      <nav aria-label="Portal navigation" className="flex-1">
        {heading && <p className="mb-1.5 px-1 text-[9px] font-semibold tracking-wider text-slate-400 uppercase">{heading}</p>}
        <ul className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const target = `${basePath}${href}`;
            const active = pathname === target || pathname.startsWith(`${target}/`);
            return (
              <li key={href}>
                <Link
                  href={target}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex h-9 items-center gap-2.5 rounded-md px-3 text-[12.5px] transition-colors",
                    active ? "bg-[#2563eb] font-medium text-white" : "hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form action={preview ? undefined : signOut}>
        <button
          type={preview ? "button" : "submit"}
          className="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-[12.5px] hover:bg-white/5 hover:text-white"
        >
          <LogOutIcon className="size-3.5" />
          Logout
        </button>
      </form>
    </div>
  );
}

export function EmployeeSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return <PortalSidebar nav={EMPLOYEE_NAV} onNavigate={onNavigate} />;
}
