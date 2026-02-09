import { useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import backgroundVideo from "../screens/фон2.mp4";
import backgroundImage from "../screens/фон.jpg";

type VideoBackgroundProps = PropsWithChildren<{
  className?: string;
}>;

export function VideoBackground({ className, children }: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const hasFrameRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let rafId = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const draw = () => {
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (!hasFrameRef.current) {
          hasFrameRef.current = true;
          setHasFrame(true);
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      className={className}
      style={hasFrame ? undefined : { backgroundImage: `url(${backgroundImage})` }}
    >
      <canvas className="video-bg__canvas" ref={canvasRef} aria-hidden="true" />
      <video
        className="video-bg__source"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        disablePictureInPicture
        disableRemotePlayback
        controls={false}
        controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
        onContextMenu={(e) => e.preventDefault()}
        tabIndex={-1}
        draggable={false}
        ref={videoRef}
      >
        <source src={backgroundVideo} type="video/mp4" />
      </video>
      <div className="video-bg__content">{children}</div>
    </div>
  );
}
