import { church, navLinks, sources } from "../shared/config/church";
import { Logo } from "../shared/ui/Logo";

export function Footer() {
  return (
    <footer className="site-footer" data-reveal>
      <div className="footer-grid">
        <div>
          <a className="brand brand--footer" href="#top" aria-label="На главную">
            <Logo className="brand__logo" />
            <span>
              <strong>{church.name}</strong>
              <small>{church.legalName}</small>
            </span>
          </a>
          <p>
            Мы открыты для гостей, семей, молодежи и всех, кто ищет живую церковную общину.
            Приходите на встречи, молитесь вместе с нами и участвуйте в служении людям.
          </p>
        </div>

        <div>
          <h3>Разделы</h3>
          <div className="footer-links">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3>Источники</h3>
          <div className="footer-links">
            {sources.map((source) => (
              <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 {church.name}</span>
        <span>Фото: {church.imageCredit}</span>
      </div>
    </footer>
  );
}
