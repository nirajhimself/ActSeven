import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="bg-obsidian text-ivory/85">
      <p className="shell flex h-9 items-center justify-center text-center text-[0.625rem] tracking-[0.22em] uppercase">
        <Link href="/collections/winter-edit" className="underline-offset-4 hover:underline">
          The Winter Edit is here <span className="text-gold">— Discover now</span>
        </Link>
      </p>
    </div>
  );
}
