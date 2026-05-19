import { type MouseEvent, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, MapPin, UsersRound } from "lucide-react";
import { tripHighlights } from "../shared/config/church";
import { fetchPublicTrips, type PublicTrip } from "../shared/lib/auth";
import { SectionHeading } from "../shared/ui/SectionHeading";

type TripsSectionProps = {
  loginHref: string;
  onLoginClick: () => void;
};

export function TripsSection({ loginHref, onLoginClick }: TripsSectionProps) {
  const [trips, setTrips] = useState<PublicTrip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchPublicTrips()
      .then((nextTrips) => {
        if (isMounted) {
          setTrips(nextTrips);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTrips([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingTrips(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoginClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onLoginClick();
  };

  return (
    <section id="trips" className="section trips-section" data-reveal>
      <div className="container trips-layout">
        <div>
          <SectionHeading
            eyebrow="Миссионерские поездки"
            title="Актуальные направления для служения"
            description="Поездки создаются в админ-панели и автоматически появляются на лендинге с флагом страны, датой и ключевыми деталями."
          />

          {isLoadingTrips ? <p className="trips-loading">Загружаем поездки...</p> : null}

          {!isLoadingTrips && trips.length ? (
            <div className="landing-trips-grid">
              {trips.map((trip) => (
                <article className="landing-trip-card" key={trip.id}>
                  <div className="landing-trip-card__flag" aria-hidden="true">
                    {countryFlag(trip.countryCode)}
                  </div>
                  <div>
                    <span>{trip.status}</span>
                    <h3>
                      {trip.cityName}, {trip.countryName}
                    </h3>
                    <p>{trip.description}</p>
                    <div className="landing-trip-card__meta">
                      <small>
                        <CalendarDays size={16} aria-hidden="true" />
                        {formatDateRange(trip.startDate || trip.date, trip.endDate || trip.date)}
                      </small>
                      <small>
                        <CalendarDays size={16} aria-hidden="true" />
                        регистрация до {formatDate(trip.registrationDeadline || trip.date)}
                      </small>
                      <small>
                        <UsersRound size={16} aria-hidden="true" />
                        {trip.peopleLimit} мест
                      </small>
                      <small>
                        <MapPin size={16} aria-hidden="true" />
                        {trip.cost}
                      </small>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {!isLoadingTrips && !trips.length ? (
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
          ) : null}
        </div>

        <div className="trip-feature">
          <span>Следующий этап</span>
          <h3>Админка + кабинет участника</h3>
          <p>
            Администратор создает поездки и группы, участник подает заявку и видит свой
            статус. Backend хранит пользователей, роли, формы, расписание, файлы и отчеты.
          </p>
          <a className="inline-action" href={loginHref} onClick={handleLoginClick}>
            Войти в будущий кабинет
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateRange(startDate: string, endDate: string) {
  if (startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}
