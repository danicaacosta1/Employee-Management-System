import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="w-full max-w-[440px] rounded-xl border border-white/70 bg-white/[0.86] px-8 pt-7 pb-6 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.45)] backdrop-blur-md">
      <header className="mb-5 text-center">
        {icon && <div className="mb-2 flex justify-center text-[#1e3a8a]">{icon}</div>}
        <h1 className="text-[22px] leading-7 font-medium tracking-[-0.01em] text-slate-900">
          {title}
        </h1>
        <p className="mx-auto mt-1 max-w-[300px] text-[12.5px] leading-[18px] text-slate-500">
          {subtitle}
        </p>
      </header>
      {children}
    </section>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="mt-5 text-center text-[12px] text-slate-500">{children}</p>;
}
