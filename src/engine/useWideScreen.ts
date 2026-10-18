import { useEffect, useState } from "react";

/** True on screens wide enough for the Explore flow chart; phones get the folder browser. */
export function useWideScreen(query = "(min-width: 760px)"): boolean {
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setWide(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return wide;
}
