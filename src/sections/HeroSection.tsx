import type { CSSProperties } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { church } from "../shared/config/church";
import { Logo } from "../shared/ui/Logo";

export function HeroSection() {
  return (
    <section
      id="top"
      className="hero"
      data-reveal
      style={{ "--hero-image": `url(${church.heroImage})` } as CSSProperties}
    >
      <div className="hero__content">
        <Logo className="hero__logo" />
        <span className="hero__eyebrow">Астана • Назаряне • служение</span>
        <h1>{church.name}</h1>
        <p>{church.tagline}</p>

        <div className="hero__actions">
          <a className="button button--primary" href="#contacts">
            <MapPin size={20} aria-hidden="true" />
            Как нас найти
          </a>
          <a className="button button--secondary" href="#trips">
            Миссионерские поездки
            <ArrowRight size={20} aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="hero__meta" aria-label="Краткая информация">
        <span>{church.workingHours}</span>
        <span>{church.address}</span>
      </div>
    </section>
  );
}
