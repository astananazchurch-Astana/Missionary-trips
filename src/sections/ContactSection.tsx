import { ExternalLink } from "lucide-react";
import { church, contacts } from "../shared/config/church";
import { SectionHeading } from "../shared/ui/SectionHeading";

export function ContactSection() {
  return (
    <section id="contacts" className="section section--light contacts-section" data-reveal>
      <div className="container contact-layout">
        <div>
          <SectionHeading
            eyebrow="Контакты"
            title="Приезжайте в район Шубар"
            description="Адрес и график взяты из публичных справочников. Перед визитом на праздник или особое мероприятие лучше уточнить время."
          />

          <div className="contact-list">
            {contacts.map((contact) => {
              const Icon = contact.icon;
              return (
                <div className="contact-row" key={contact.label}>
                  <Icon size={22} aria-hidden="true" />
                  <span>{contact.label}</span>
                  <strong>{contact.value}</strong>
                </div>
              );
            })}
          </div>

          <a className="button button--primary" href={church.mapLink} target="_blank" rel="noreferrer">
            Открыть маршрут
            <ExternalLink size={19} aria-hidden="true" />
          </a>
        </div>

        <div className="map-frame">
          <iframe
            title="Карта: Церковь Назарянина Астана"
            src={church.mapUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
