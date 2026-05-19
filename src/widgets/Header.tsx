import { useState } from "react";
import { Menu } from "lucide-react";
import { church, navLinks } from "../shared/config/church";
import { Logo } from "../shared/ui/Logo";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
        <a className="ghost-link" href="/login">
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
        <a href="/login" onClick={() => setIsMenuOpen(false)}>
          Вход
        </a>
      </nav>
    </header>
  );
}
