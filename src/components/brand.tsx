import Image from "next/image";

export function Brand() {
  return (
    <div className="relative aspect-[2/1] w-[var(--brand-width,190px)] max-w-full shrink-0 overflow-hidden">
      <Image
        className="absolute top-1/2 left-1/2 h-auto w-[125%] max-w-none -translate-x-1/2 -translate-y-[51%] mix-blend-multiply"
        src="/images/uwp-white.jpg"
        alt="University of Waterloo Pickleball Club"
        width={1179}
        height={1179}
        sizes="350px"
        priority
      />
    </div>
  );
}
