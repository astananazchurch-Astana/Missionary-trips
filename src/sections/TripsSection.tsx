import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, MapPin, UsersRound } from "lucide-react";
import { fetchPublicTrips, type PublicTrip } from "../shared/lib/auth";
import { appPath } from "../shared/lib/routes";
import { SectionHeading } from "../shared/ui/SectionHeading";

type TripsSectionProps = {
  loginHref: string;
  onLoginClick: () => void;
};

const missionTripCues = [
  "молиться за людей и команды",
  "служить делом, временем и дарами",
  "ехать туда, где нужна поддержка",
  "возвращаться с отчетом и благодарностью",
];

export function TripsSection(_props: TripsSectionProps) {
  const [trips, setTrips] = useState<PublicTrip[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
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

  useEffect(() => {
    if (activeIndex >= trips.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, trips.length]);

  const activeTrip = trips[activeIndex] || null;
  const showControls = trips.length > 1;
  const carouselStyle = useMemo(
    () =>
      ({
        "--flag-url": activeTrip ? `url("${getFlagUrl(activeTrip.countryCode)}")` : "none",
      }) as CSSProperties,
    [activeTrip],
  );

  const goToPreviousTrip = () => {
    setActiveIndex((currentIndex) => (currentIndex === 0 ? trips.length - 1 : currentIndex - 1));
  };

  const goToNextTrip = () => {
    setActiveIndex((currentIndex) => (currentIndex + 1) % trips.length);
  };

  return (
    <section id="trips" className="section trips-section" data-reveal>
      <div className="container trips-layout">
        <div>
          <SectionHeading
            eyebrow="Миссионерские поездки"
            title="Идите и служите с любовью"
            description="«Идите по всему миру и проповедуйте Евангелие всей твари» — Марка 16:15."
          />

          <div className="check-list mission-cues">
            {missionTripCues.map((item) => (
              <span key={item}>
                <CheckCircle2 size={20} aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>

          {isLoadingTrips ? <p className="trips-loading">Загружаем поездки...</p> : null}
        </div>

        <div className="trip-carousel" aria-label="Актуальные поездки">
          <div className="trip-carousel__topline">
            <span>Актуальные поездки</span>
            {showControls ? (
              <div className="trip-carousel__controls">
                <button type="button" aria-label="Предыдущая поездка" onClick={goToPreviousTrip}>
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <button type="button" aria-label="Следующая поездка" onClick={goToNextTrip}>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>

          {activeTrip ? (
            <article className="trip-carousel-card" key={activeTrip.id} style={carouselStyle}>
              <div className="trip-carousel-card__content">
                <span className="trip-carousel-card__status">{activeTrip.status}</span>
                <h3>
                  {activeTrip.countryName}, {activeTrip.cityName}
                </h3>
                <p>{activeTrip.description}</p>

                <div className="trip-carousel-card__meta">
                  <small>
                    <CalendarDays size={17} aria-hidden="true" />
                    {formatDateRange(activeTrip.startDate || activeTrip.date, activeTrip.endDate || activeTrip.date)}
                  </small>
                  <small>
                    <CalendarDays size={17} aria-hidden="true" />
                    Регистрация до {formatDate(activeTrip.registrationDeadline || activeTrip.date)}
                  </small>
                  <small>
                    <UsersRound size={17} aria-hidden="true" />
                    Нужно людей: {getAvailableSpots(activeTrip)} из {activeTrip.peopleLimit}
                  </small>
                  <small>
                    <MapPin size={17} aria-hidden="true" />
                    {activeTrip.cost}
                  </small>
                </div>

                <a className="trip-carousel-card__cta" href={`${appPath("/apply")}?tripId=${activeTrip.id}`}>
                  Я хочу участвовать
                  <ArrowRight size={19} aria-hidden="true" />
                </a>
              </div>
            </article>
          ) : (
            <div className="trip-carousel-empty">
              <h3>Поездок пока нет</h3>
              <p>Когда появится новое направление, церковь увидит его здесь и сможет откликнуться.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function getAvailableSpots(trip: PublicTrip) {
  if (typeof trip.availableSpots === "number") {
    return Math.max(trip.availableSpots, 0);
  }

  return Math.max(Number(trip.peopleLimit || 0) - Number(trip.participantsCount || 0), 0);
}

function getFlagUrl(code: string) {
  const normalizedCode = code.trim().toLowerCase() || "kz";

  return `https://flagcdn.com/w640/${normalizedCode}.png`;
}

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatDateRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return "—";
  }

  if (startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}
