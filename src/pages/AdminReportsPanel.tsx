import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, Trash2, UserRound } from "lucide-react";
import {
  type TripReport,
  deleteTripReport,
  fetchReports,
  isForbiddenError,
  isUnauthorizedError,
} from "../shared/lib/auth";

type AdminReportsPanelProps = {
  canDelete: boolean;
  onLogout: () => void;
};

export function AdminReportsPanel({ canDelete, onLogout }: AdminReportsPanelProps) {
  const [reports, setReports] = useState<TripReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) || reports[0] || null,
    [reports, selectedReportId],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadReports() {
      setError("");
      setIsLoading(true);

      try {
        const nextReports = await fetchReports();

        if (isMounted) {
          setReports(nextReports);
          setSelectedReportId((currentId) =>
            nextReports.some((report) => report.id === currentId) ? currentId : nextReports[0]?.id || "",
          );
        }
      } catch (requestError) {
        if (isUnauthorizedError(requestError)) {
          onLogout();
          return;
        }

        if (isMounted) {
          setError(isForbiddenError(requestError) ? "Недостаточно прав для просмотра отчетов." : "Не удалось загрузить отчеты.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      isMounted = false;
    };
  }, [onLogout]);

  const handleDelete = async () => {
    if (!selectedReport || !canDelete) {
      return;
    }

    if (!window.confirm("Удалить отчет по этой поездке?")) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await deleteTripReport(selectedReport.id);
      setReports((currentReports) => currentReports.filter((report) => report.id !== selectedReport.id));
      setSelectedReportId("");
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setError(isForbiddenError(requestError) ? "Недостаточно прав для удаления отчета." : "Не удалось удалить отчет.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <header className="admin-topbar">
        <div>
          <span className="admin-kicker">Отчеты</span>
          <h1>Отчеты по поездкам</h1>
          <p className="access-topbar__description">
            Здесь появляются отчеты лидеров после заполнения и завершения поездки.
          </p>
        </div>
      </header>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <section className="admin-panel">
          <div className="empty-state empty-state--compact">
            <h3>Загружаем отчеты</h3>
            <p>Сейчас подтянем данные лидеров и поездок.</p>
          </div>
        </section>
      ) : reports.length ? (
        <section className="reports-layout">
          <div className="admin-panel reports-list" aria-label="Список отчетов">
            {reports.map((report) => (
              <button
                className={`reports-list__item${selectedReport?.id === report.id ? " reports-list__item--active" : ""}`}
                type="button"
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
              >
                <FileText size={18} aria-hidden="true" />
                <span>
                  <strong>{report.trip?.cityName || "Поездка"}</strong>
                  <small>{report.status === "completed" ? "Завершен" : "Черновик"}</small>
                </span>
              </button>
            ))}
          </div>

          {selectedReport ? (
            <article className="admin-panel report-detail">
              <div className="report-detail__header">
                <div>
                  <span className="admin-kicker">{selectedReport.status === "completed" ? "Завершенный отчет" : "Черновик"}</span>
                  <h2>{selectedReport.trip?.cityName || "Поездка"}</h2>
                </div>
                {canDelete ? (
                  <button className="button button--danger" type="button" disabled={isDeleting} onClick={handleDelete}>
                    <Trash2 size={18} aria-hidden="true" />
                    {isDeleting ? "Удаляем..." : "Удалить"}
                  </button>
                ) : null}
              </div>

              <div className="report-detail__meta">
                <span>
                  <UserRound size={16} aria-hidden="true" />
                  {selectedReport.leaderName || "Лидер не указан"}
                </span>
                <span>
                  <CalendarDays size={16} aria-hidden="true" />
                  {formatDateTime(selectedReport.completedAt || selectedReport.updatedAt)}
                </span>
              </div>

              <section className="trip-detail__section">
                <h3>Что делали</h3>
                <p>{selectedReport.summary || "Отчет пока не заполнен."}</p>
              </section>

              {selectedReport.photos.length ? (
                <section className="trip-detail__section">
                  <h3>Фото</h3>
                  <div className="report-photo-grid report-photo-grid--readonly">
                    {selectedReport.photos.map((photo, index) => (
                      <figure className="report-photo" key={`${photo.slice(0, 40)}-${index}`}>
                        <img src={photo} alt={`Фото отчета ${index + 1}`} />
                      </figure>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="trip-detail__section">
                <h3>Характеристики участников</h3>
                <div className="report-review-list report-review-list--readonly">
                  {selectedReport.participantReviews.map((review) => (
                    <div className="report-review report-review--readonly" key={review.participantId}>
                      <strong>{review.fullName}</strong>
                      <p>{review.text || "Характеристика пока не заполнена."}</p>
                    </div>
                  ))}
                </div>
              </section>
            </article>
          ) : null}
        </section>
      ) : (
        <section className="admin-panel">
          <div className="empty-state empty-state--compact">
            <h3>Отчетов пока нет</h3>
            <p>Когда лидер завершит поездку и отправит отчет, он появится здесь.</p>
          </div>
        </section>
      )}
    </>
  );
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Нет даты";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Нет даты";
  }

  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
