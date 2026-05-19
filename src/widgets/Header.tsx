import { type MouseEvent, useState } from "react";
import { Menu } from "lucide-react";
import { church, navLinks } from "../shared/config/church";
import { Logo } from "../shared/ui/Logo";

type HeaderProps = {
  loginHref: string;
  onLoginClick: () => void;
};

export function Header({ loginHref, onLoginClick }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLoginClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setIsMenuOpen(false);
    onLoginClick();
  };

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="На главную">
        <Logo className="brand__logo" />
        <span>
          <strong>{church.name}</strong>
          <small>Astana Nazarene Church</small>
        </span>
      </a>

      <nav className="site-nav" aria-label="Основная навигация">
        {navLinks.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="header-actions">
        <a className="ghost-link" href={loginHref} onClick={handleLoginClick}>
          Вход
        </a>
        <button
          className="menu-button"
          type="button"
          aria-label="Открыть меню"
          aria-controls="mobile-nav"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </div>

      <nav
        id="mobile-nav"
        className={`mobile-nav ${isMenuOpen ? "mobile-nav--open" : ""}`}
        aria-label="Мобильная навигация"
      >
        {navLinks.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setIsMenuOpen(false)}>
            {link.label}
          </a>
        ))}
        <a href={loginHref} onClick={handleLoginClick}>
          Вход
        </a>
      </nav>
    </header>
  );
}
