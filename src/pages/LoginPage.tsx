import { type FormEvent, type MouseEvent, useState } from "react";
import { ArrowLeft, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { signInAdmin } from "../shared/lib/auth";
import { Logo } from "../shared/ui/Logo";

type LoginPageProps = {
  homeHref: string;
  onBack: () => void;
  onSuccess: () => void;
};

export function LoginPage({ homeHref, onBack, onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBack = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onBack();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const result = await signInAdmin(username.trim(), password);

    setIsSubmitting(false);

    if (result.ok) {
      onSuccess();
      return;
    }

    setError(result.message || "Не удалось войти");
  };

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label="Вход администратора">
        <div className="auth-brand-panel">
          <a className="auth-back" href={homeHref} onClick={handleBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            На лендинг
          </a>
          <Logo className="auth-logo" />
          <span className="auth-kicker">Административный доступ</span>
          <h1>Вход в панель управления</h1>
          <p>Закрытая часть для управления поездками, заявками и контентом лендинга.</p>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <div className="auth-card__icon">
              <LockKeyhole size={24} aria-hidden="true" />
            </div>
            <div>
              <span>Admin</span>
              <h2>Авторизация</h2>
            </div>
          </div>

          <label className="form-field">
            <span>Логин</span>
            <div className="input-shell">
              <UserRound size={19} aria-hidden="true" />
              <input
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Введите логин"
              />
            </div>
          </label>

          <label className="form-field">
            <span>Пароль</span>
            <div className="input-shell">
              <LockKeyhole size={19} aria-hidden="true" />
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль"
              />
            </div>
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Проверяем..." : "Войти"}
            <LogIn size={19} aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  );
}
