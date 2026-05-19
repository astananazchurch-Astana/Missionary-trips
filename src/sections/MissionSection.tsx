import { missionValues } from "../shared/config/church";
import { SectionHeading } from "../shared/ui/SectionHeading";

export function MissionSection() {
  return (
    <section id="mission" className="section section--dark" data-reveal>
      <div className="container mission-layout">
        <SectionHeading
          eyebrow="Миссия"
          title="Делать учеников Христа и служить людям"
          description="Церковь Назарянина относится к протестантской уэслианско-святостной традиции. Ее глобальный акцент: христианская вера, святость жизни и миссия."
        />

        <div className="value-grid">
          {missionValues.map((value) => {
            const Icon = value.icon;
            return (
              <article className="value-card" key={value.title}>
                <div className="icon-badge">
                  <Icon size={24} aria-hidden="true" />
                </div>
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
