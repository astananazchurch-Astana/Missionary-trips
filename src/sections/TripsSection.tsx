import { ArrowRight } from "lucide-react";
import { tripHighlights } from "../shared/config/church";
import { SectionHeading } from "../shared/ui/SectionHeading";

export function TripsSection() {
  return (
    <section id="trips" className="section trips-section" data-reveal>
      <div className="container trips-layout">
        <div>
          <SectionHeading
            eyebrow="Миссионерские поездки"
            title="Отдельный модуль для будущей user-панели"
            description="На лендинге оставляем понятный вход в направление, а регистрацию, статусы, документы и отчеты позже переносим в личный кабинет."
          />

          <div className="check-list">
            {tripHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <span key={item.text}>
                  <Icon size={20} aria-hidden="true" />
                  {item.text}
                </span>
              );
            })}
          </div>
        </div>

        <div className="trip-feature">
          <span>Следующий этап</span>
          <h3>Админка + кабинет участника</h3>
          <p>
            Администратор создает поездки и группы, участник подает заявку и видит свой
            статус. Backend хранит пользователей, роли, формы, расписание, файлы и отчеты.
          </p>
          <a className="inline-action" href="/login">
            Войти в будущий кабинет
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
