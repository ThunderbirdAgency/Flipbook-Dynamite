import Image from 'next/image';
// The artwork is black line-work and black "DYNAMITE" lettering with a
// transparent background — drawn for a light surface. Dropped straight onto the
// site's near-black chrome, everything but the blue "FLIPBOOK" vanishes. The
// white plate gives it the surface it was designed for, so the mark reads the
// same way everywhere it appears.
export default function BrandLogo() {
  return (
    <span className="inline-flex items-center rounded-xl bg-white px-3 py-1.5 ring-1 ring-white/15">
      <Image
        src="/flipbook-dynamite-logo.png"
        alt="Flipbook Dynamite"
        width={940}
        height={363}
        priority
        className="h-auto w-36 sm:w-44"
      />
    </span>
  );
}
