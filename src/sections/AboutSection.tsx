import { church, facts } from "../shared/config/church";
import { SectionHeading } from "../shared/ui/SectionHeading";

export function AboutSection() {
  return (
    <section id="about" className="section section--light" data-reveal>
      <div className="container about-layout">
        <div>
          <SectionHeading
            eyebrow="О церкви"
            title="Поместная церковь Назарянина в районе Есиль"
            description="Публичные данные подтверждают регистрацию религиозного объединения в Астане, адрес на улице Нуртаса Ондасынова и деятельность религиозной организации."
          />
          <p className="lead">
            Мы подаем церковь как открытую христианскую общину: поклонение Богу, забота о
            людях, ученичество и служение городу. Юридическое наименование оставлено в
            справочной информации, а на сайте используем понятное название для гостей и прихожан.
          </p>
        </div>

        <div className="fact-panel">
          <span className="fact-panel__label">Официальные данные</span>
          <h3>{church.legalName}</h3>
          <p>Руководитель: {church.leader}</p>
          <div className="fact-grid">
            {facts.map((fact) => {
              const Icon = fact.icon;
              return (
                <article className="fact-card" key={fact.title}>
                  <Icon size={24} aria-hidden="true" />
                  <h4>{fact.title}</h4>
                  <p>{fact.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
