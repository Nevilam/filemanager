import { useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import backgroundVideo from "../screens/фон2.mp4";
import backgroundImage from "../screens/фон.jpg";

type VideoBackgroundProps = PropsWithChildren<{
  className?: string;
}>;

export function VideoBackground({ className, children }: VideoBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const hasFrameRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const video = document.createElement("video") as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: (now: number, metadata: any) => void) => number;
    };
    video.src = backgroundVideo;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.autoplay = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");

    let animationId = 0;
    let running = true;

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };

    const markHasFrame = () => {
      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        setHasFrame(true);
      }
    };

    const drawFrame = () => {
      if (!running) {
        return;
      }

      if (video.readyState >= 2) {
        markHasFrame();

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const videoWidth = video.videoWidth || canvasWidth;
        const videoHeight = video.videoHeight || canvasHeight;
        const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
        const drawWidth = videoWidth * scale;
        const drawHeight = videoHeight * scale;
        const offsetX = (canvasWidth - drawWidth) / 2;
        const offsetY = (canvasHeight - drawHeight) / 2;

        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
      }

      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(drawFrame);
      } else {
        animationId = window.requestAnimationFrame(drawFrame);
      }
    };

    const startPlayback = async () => {
      try {
        await video.play();
      } catch {
        // Autoplay might be blocked; fallback background image remains.
      }
    };

    const handleCanPlay = () => {
      startPlayback();
      drawFrame();
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    video.addEventListener("canplay", handleCanPlay);
    video.load();

    return () => {
      running = false;
      window.removeEventListener("resize", updateCanvasSize);
      video.removeEventListener("canplay", handleCanPlay);
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (animationId) {
        window.cancelAnimationFrame(animationId);
      }
    };
  }, []);

  return (
    <div
      className={className}
      style={hasFrame ? undefined : { backgroundImage: `url(${backgroundImage})` }}
    >
      <canvas className="video-bg__canvas" ref={canvasRef} aria-hidden="true" />
      <div className="video-bg__content">{children}</div>
    </div>
  );
}
