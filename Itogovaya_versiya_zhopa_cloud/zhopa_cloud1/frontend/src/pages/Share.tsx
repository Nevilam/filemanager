import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuroraRibbonHero } from "../components/AuroraRibbonHero";
import { FileManager } from "../components/FileManager";
import { Button } from "../components/ui/button";
import { Home } from "./Home";
import {
  ApiError,
  clearAuthToken,
  downloadPublicFile,
  fetchCurrentUser,
  getAuthToken,
  getPublicItem,
  logoutUser,
  type PublicItem,
} from "../lib/api";

export const Share = (): JSX.Element => {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();

  const initialToken = getAuthToken();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [item, setItem] = useState<PublicItem | null>(null);
  const [owner, setOwner] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<string>("");
  const [showAuthNotice, setShowAuthNotice] = useState(!initialToken);
  const [authState, setAuthState] = useState<"checking" | "authorized" | "unauthorized">(
    initialToken ? "checking" : "unauthorized",
  );

  useEffect(() => {
    const run = async () => {
      if (!shareCode) {
        setError("Некорректная ссылка");
        setLoading(false);
        return;
      }

      try {
        const response = await getPublicItem(shareCode);
        setItem(response.item);
        setOwner(response.item.owner);
        setError("");
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Ошибка сети");
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [shareCode]);

  useEffect(() => {
    if (!initialToken) {
      return;
    }

    const run = async () => {
      try {
        const response = await fetchCurrentUser();
        setCurrentUser(response.user.username);
        setAuthState("authorized");
        setShowAuthNotice(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setCurrentUser("");
          setAuthState("unauthorized");
          setShowAuthNotice(true);
        }
      }
    };

    void run();
  }, [initialToken]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
    }
    clearAuthToken();
    navigate("/");
  };

  const handleDownload = async () => {
    if (!shareCode || !item || item.type !== "file") {
      return;
    }

    try {
      await downloadPublicFile(shareCode, item.name);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Ошибка сети");
      }
    }
  };

  if (authState === "unauthorized") {
    return (
      <>
        <Home />
        {showAuthNotice && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={() => setShowAuthNotice(false)}
          >
            <div className="absolute inset-0 bg-black/50"></div>
            <div
              className="relative z-10 bg-white/12 border border-white/25 backdrop-blur-xl rounded-3xl p-8 w-[90%] max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h3 className="text-white text-2xl font-light [font-family:'Century_Gothic-Regular',Helvetica]">
                  Вы не авторизованы
                </h3>
                <p className="text-white/70 mt-2">
                  Войдите, чтобы получить полный доступ.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => navigate("/", { state: { openLogin: true } })}
                  className="flex-1 h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal"
                >
                  Войти
                </Button>
                <Button
                  onClick={() => setShowAuthNotice(false)}
                  className="flex-1 h-12 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20"
                >
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!loading && !error && currentUser && item) {
    return (
      <main className="w-full h-screen relative overflow-hidden">
        <AuroraRibbonHero />
        <FileManager
          userName={currentUser}
          onLogout={() => void handleLogout()}
          onUserNameClick={() => navigate(`/home/cloud/${currentUser}`, { replace: true })}
          shareOnly
          sharedRootItem={item}
        />
      </main>
    );
  }

  return (
    <main className="w-full h-screen relative overflow-hidden">
      <AuroraRibbonHero />
      {showAuthNotice && (
        <div className="absolute inset-0 z-20 pointer-events-none" aria-hidden="true">
          <Home />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full">
        <header className="flex items-center justify-between px-8 md:px-16 lg:px-24 pt-8">
          <h1 className="[font-family:'Aquire-Light',Helvetica] font-light text-white text-2xl md:text-3xl tracking-[0] leading-[normal]">
            GlassCloud
          </h1>

          <nav className="flex gap-4">
            <Button
              onClick={() => navigate("/", { state: { openLogin: true } })}
              className="w-[140px] h-[52px] bg-transparent border border-white/40 hover:bg-white/5 rounded-[54px] [font-family:'Century_Gothic-Regular',Helvetica] text-lg font-normal text-white tracking-[0] leading-[normal]"
            >
              Вход
            </Button>
          </nav>
        </header>

        <section className="flex flex-col justify-center flex-1 px-8 md:px-16 lg:px-24">
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-10 shadow-2xl max-w-xl">
            {loading ? (
              <div className="text-white/70">Загрузка...</div>
            ) : error ? (
              <div>
                <h2 className="text-2xl text-white font-light mb-3">Ссылка недоступна</h2>
                <p className="text-white/70 mb-6">{error}</p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => navigate("/")}
                    className="h-12 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20"
                  >
                    На главную
                  </Button>
                  <Button
                    onClick={() => navigate("/", { state: { openLogin: true } })}
                    className="h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl"
                  >
                    Войти
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {item?.type === "folder" ? (
                  <>
                    <h2 className="text-3xl text-white font-light mb-2">{item.name}</h2>
                    <p className="text-white/70 mb-6">Владелец: {owner}</p>
                    {currentUser ? (
                      <Button
                        onClick={() =>
                          navigate(`/home/cloud/${currentUser}`, { replace: true })
                        }
                        className="w-full h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal"
                      >
                        Открыть папку
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-white/70">Войдите, чтобы открыть эту папку.</p>
                        <Button
                          onClick={() => navigate("/", { state: { openLogin: true } })}
                          className="w-full h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal"
                        >
                          Войти
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl text-white font-light mb-2">{item?.name ?? ""}</h2>
                    <p className="text-white/70 mb-6">Владелец: {owner}</p>
                    <Button
                      onClick={() => void handleDownload()}
                      className="w-full h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal"
                    >
                      Скачать
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {showAuthNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setShowAuthNotice(false)}
        >
          <div className="absolute inset-0 bg-black/50"></div>
          <div
            className="relative z-10 bg-white/12 border border-white/25 backdrop-blur-xl rounded-3xl p-8 w-[90%] max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <h3 className="text-white text-2xl font-light [font-family:'Century_Gothic-Regular',Helvetica]">
                Вы не авторизованы
              </h3>
              <p className="text-white/70 mt-2">Войдите, чтобы получить полный доступ.</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => navigate("/", { state: { openLogin: true } })}
                className="flex-1 h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal"
              >
                Войти
              </Button>
              <Button
                onClick={() => setShowAuthNotice(false)}
                className="flex-1 h-12 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20"
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
