import Image from "next/image";
import Link from "next/link";

export function BrandMark() {
  return (
    <Link aria-label="Savant Gateway home" className="brand-mark" href="/">
      <Image alt="" height={36} src="/logo.png" width={36} />
      <span className="brand-word">
        SAVANT<b>{"//"}</b>
        <em>GATEWAY</em>
      </span>
    </Link>
  );
}
