import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { AuroraRibbonHero } from "../components/AuroraRibbonHero";
import { ApiError, loginUser, registerUser, setAuthToken } from "../lib/api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Home = (): JSX.Element => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const [loginNickname, setLoginNickname] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerNickname, setRegisterNickname] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as
    | { openLogin?: boolean; openRegister?: boolean }
    | null;

  useEffect(() => {
    if (navState?.openLogin) {
      setShowRegisterModal(false);
      setShowLoginModal(true);
      setError("");
    }
    if (navState?.openRegister) {
      setShowLoginModal(false);
      setShowRegisterModal(true);
      setError("");
    }
  }, [location.state, navState?.openLogin, navState?.openRegister]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginNickname || !loginPassword) {
      setError("Заполните все поля");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await loginUser(loginNickname, loginPassword);
      setAuthToken(response.token);
      setShowLoginModal(false);
      navigate(`/home/cloud/${response.user.username}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Неверный логин или пароль");
        } else {
          setError(err.message);
        }
      } else {
        setError("Ошибка сети. Попробуйте снова");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!registerNickname || !registerPassword || !registerEmail) {
      setError("Заполните все поля");
      return;
    }

    const normalizedEmail = registerEmail.trim();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("Invalid email");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await registerUser(registerNickname, registerPassword, normalizedEmail);
      setAuthToken(response.token);
      setShowRegisterModal(false);
      navigate(`/home/cloud/${response.user.username}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Ошибка сети. Попробуйте снова");
      }
    } finally {
      setIsSubmitting(false);
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
              onClick={() => {
                setShowRegisterModal(false);
                setShowLoginModal(true);
                setError("");
              }}
              className="w-[140px] h-[52px] bg-transparent border border-white/40 hover:bg-white/5 rounded-[54px] [font-family:'Century_Gothic-Regular',Helvetica] text-lg font-normal text-white tracking-[0] leading-[normal]"
            >
              Вход
            </Button>

            <Button
              onClick={() => {
                setShowLoginModal(false);
                setShowRegisterModal(true);
                setError("");
              }}
              className="w-[140px] h-[52px] bg-transparent border border-white/40 hover:bg-white/5 rounded-[54px] [font-family:'Century_Gothic-Regular',Helvetica] text-lg font-normal text-white tracking-[0] leading-[normal]"
            >
              Регистрация
            </Button>
          </nav>
        </header>

        <section className="flex flex-col justify-center flex-1 px-8 md:px-16 lg:px-24">
          <h2 className="[text-shadow:0px_4px_4px_#00000040] [font-family:'Soledago-Regular',Helvetica] text-6xl md:text-7xl lg:text-8xl font-normal text-white tracking-[0] leading-tight">
            Попробуй <br />и влюбись
          </h2>

          <p className="mt-4 [text-shadow:7px_2px_2.7px_#00000040] [font-family:'Century_Gothic-Regular',Helvetica] text-xl md:text-2xl font-normal text-white tracking-[0] leading-[normal]">
            С заботой о пользовательском опыте
          </p>
        </section>
      </div>

      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowLoginModal(false)}>
          <div className="absolute inset-0 bg-black/50"></div>
          <div className="relative z-10 bg-white/12 border border-white/25 backdrop-blur-xl rounded-3xl p-10 w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-8">
              <h3 className="text-white text-3xl font-light [font-family:'Century_Gothic-Regular',Helvetica]">Вход</h3>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-white/60 text-sm [font-family:'Century_Gothic-Regular',Helvetica]">Логин</label>
                <input
                  type="text"
                  placeholder="Ник"
                  value={loginNickname}
                  onChange={(e) => setLoginNickname(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-white/60 text-sm [font-family:'Century_Gothic-Regular',Helvetica]">Пароль</label>
                <input
                  type="password"
                  placeholder="******"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>

              {error && <p className="text-white/70 text-sm">{error}</p>}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal mt-6"
              >
                {isSubmitting ? "Входим..." : "Войти"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowRegisterModal(false)}>
          <div className="absolute inset-0 bg-black/50"></div>
          <div className="relative z-10 bg-white/12 border border-white/25 backdrop-blur-xl rounded-3xl p-10 w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-8">
              <h3 className="text-white text-3xl font-light [font-family:'Century_Gothic-Regular',Helvetica]">Регистрация</h3>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label className="text-white/60 text-sm [font-family:'Century_Gothic-Regular',Helvetica]">Логин</label>
                <input
                  type="text"
                  placeholder="Ник"
                  value={registerNickname}
                  onChange={(e) => setRegisterNickname(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-white/60 text-sm [font-family:'Century_Gothic-Regular',Helvetica]">Почта</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-white/60 text-sm [font-family:'Century_Gothic-Regular',Helvetica]">Пароль</label>
                <input
                  type="password"
                  placeholder="******"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>

              {error && <p className="text-white/70 text-sm">{error}</p>}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 bg-gradient-to-r from-blue-500/80 via-violet-500/80 to-purple-600/80 hover:from-blue-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-xl [font-family:'Century_Gothic-Regular',Helvetica] font-normal mt-6"
              >
                {isSubmitting ? "Создаём..." : "Зарегистрироваться"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
