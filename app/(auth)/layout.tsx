import Image from "next/image";
import authBg from "@/public/images/auth-bg.png";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 items-center justify-center px-4 py-10">
      <Image
        src={authBg}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="-z-10 object-cover"
      />
      {children}
    </main>
  );
}
