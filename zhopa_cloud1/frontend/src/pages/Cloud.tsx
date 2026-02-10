import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AuroraRibbonHero } from "../components/AuroraRibbonHero";
import { FileManager } from "../components/FileManager";
import { ApiError, clearAuthToken, fetchCurrentUser, getAuthToken, logoutUser } from "../lib/api";

export const Cloud = (): JSX.Element => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const sharedCode = (location.state as { sharedCode?: string } | null)?.sharedCode;

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      const token = getAuthToken();
      if (!token) {
        navigate("/", { state: { openLogin: true } });
        return;
      }

      try {
        const response = await fetchCurrentUser();
        setCurrentUser(response.user.username);
        if (username && response.user.username !== username) {
          navigate(`/home/cloud/${response.user.username}`, { replace: true });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuthToken();
        }
        navigate("/", { state: { openLogin: true } });
      } finally {
        setCheckingAuth(false);
      }
    };

    void run();
  }, [navigate, username]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
    }
    clearAuthToken();
    navigate("/");
  };

  if (checkingAuth) {
    return (
      <main className="w-full h-screen relative overflow-hidden">
        <AuroraRibbonHero />
        <div className="relative z-10 w-full h-full flex items-center justify-center text-white text-xl">
          Загрузка...
        </div>
      </main>
    );
  }

  return (
    <main className="w-full h-screen relative overflow-hidden">
      <AuroraRibbonHero />
      <FileManager
        userName={currentUser}
        onLogout={() => void handleLogout()}
        onUserNameClick={() => {
          if (currentUser) {
            navigate(`/home/cloud/${currentUser}`, { replace: true, state: null });
          }
        }}
        sharedCode={sharedCode}
      />
    </main>
  );
};
