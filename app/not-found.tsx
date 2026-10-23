import { Monogram } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <Monogram className="h-10 w-auto text-gold-deep" />
      <h1 className="display mt-8 text-5xl">This page has moved on.</h1>
      <p className="mt-4 text-sm text-taupe">The piece or page you were looking for isn&apos;t here.</p>
      <ButtonLink href="/collections/all" className="mt-8">
        Explore the collection
      </ButtonLink>
    </div>
  );
}
