import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuroraRibbonHero } from "../components/AuroraRibbonHero";
import { Button } from "../components/ui/button";
import { ApiError, downloadPublicFile, getPublicFile } from "../lib/api";

export const Share = (): JSX.Element => {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [owner, setOwner] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      if (!shareCode) {
        setError("Некорректная ссылка");
        setLoading(false);
        return;
      }

      try {
        const response = await getPublicFile(shareCode);
        setFileName(response.file.name);
        setOwner(response.file.owner);
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

  const handleDownload = async () => {
    if (!shareCode || !fileName) {
      return;
    }

    try {
      await downloadPublicFile(shareCode, fileName);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Ошибка сети");
      }
    }
  };

  return (
    <main className="w-full h-screen relative overflow-hidden">
      <AuroraRibbonHero />

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
                <h2 className="text-2xl text-white font-light mb-3">Файл недоступен</h2>
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
                <h2 className="text-3xl text-white font-light mb-2">{fileName}</h2>
                <p className="text-white/70 mb-6">Владелец: {owner}</p>
                <Button
                  onClick={() => void handleDownload()}
                  className="w-full h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal"
                >
                  Скачать
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};
