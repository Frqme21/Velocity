import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/site";

export default function NotFound() {
  return (
    <main className="not-found">
      <Image
        src={site.mark}
        alt=""
        width={80}
        height={80}
        priority
      />
      <span className="not-found-code">404</span>
      <h1>Off the course.</h1>
      <p>That route does not exist. Head back to the start and pick another run.</p>
      <Link className="magnetic-button" href="/">
        Return home
      </Link>
    </main>
  );
}
