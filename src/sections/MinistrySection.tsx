import { ministries } from "../shared/config/church";
import { SectionHeading } from "../shared/ui/SectionHeading";

export function MinistrySection() {
  return (
    <section id="ministries" className="section section--warm" data-reveal>
      <div className="container">
        <SectionHeading
          align="center"
          eyebrow="Секции лендинга"
          title="Служения, которые стоит вынести на главную"
          description="Контент собран так, чтобы после подключения backend администратор мог редактировать эти блоки из панели."
        />

        <div className="ministry-grid">
          {ministries.map((ministry) => {
            const Icon = ministry.icon;
            return (
              <article className="ministry-card" key={ministry.title}>
                <Icon size={26} aria-hidden="true" />
                <h3>{ministry.title}</h3>
                <p>{ministry.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
