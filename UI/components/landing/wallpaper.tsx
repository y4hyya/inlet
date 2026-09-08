"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./wallpaper.module.css";

const query = "(min-width: 900px) and (prefers-reduced-motion: no-preference)";

export function Wallpaper() {
  const [video, setVideo] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const media = window.matchMedia(query);
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => setVideo(media.matches && !connection?.saveData);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onVisibility = () => {
      if (document.hidden) element.pause();
      else void element.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [video]);

  return (
    <div className={styles.wallpaper} data-wallpaper="" aria-hidden="true">
      {video ? (
        <video ref={ref} className={styles.media} autoPlay muted loop playsInline preload="auto" poster="/wallpaper.jpg">
          <source src="/wallpaper.mp4" type="video/mp4" />
        </video>
      ) : (
        <img className={styles.media} src="/wallpaper.jpg" alt="" />
      )}
      <div className={styles.scrim} />
    </div>
  );
}
