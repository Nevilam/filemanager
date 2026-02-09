import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { VideoBackground } from "./components/VideoBackground";
import { Cloud } from "./pages/Cloud";
import { Home } from "./pages/Home";
import { Share } from "./pages/Share";

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <VideoBackground className="video-bg__root">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home/cloud/:username" element={<Cloud />} />
          <Route path="/share/:shareCode" element={<Share />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </VideoBackground>
    </BrowserRouter>
  </StrictMode>,
);
