import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ImagePlus, Save, Send, Trash2 } from "lucide-react";
import {
  type SaveTripReportInput,
  type Trip,
  type TripReport,
  completeTripReport,
  isForbiddenError,
  isUnauthorizedError,
  saveTripReport,
} from "../shared/lib/auth";

type TripReportEditorProps = {
  trip: Trip;
  canCreate: boolean;
  canUpdate: boolean;
  onLogout: () => void;
  onReportSaved: (report: TripReport, isCompleted: boolean) => void;
};

type ReviewState = {
  participantId: string;
  fullName: string;
  text: string;
};

export function TripReportEditor({
  trip,
  canCreate,
  canUpdate,
  onLogout,
  onReportSaved,
}: TripReportEditorProps) {
  const participants = useMemo(() => trip.participants || [], [trip.participants]);
  const [summary, setSummary] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ReviewState[]>([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    const report = trip.report;
    const reviewMap = new Map((report?.participantReviews || []).map((review) => [review.participantId, review.text]));

    setSummary(report?.summary || "");
    setPhotos(report?.photos || []);
    setReviews(
      participants.map((participant) => ({
        participantId: participant.id,
        fullName: participant.fullName,
        text: reviewMap.get(participant.id) || "",
      })),
    );
    setError("");
  }, [participants, trip.report]);

  const canSave = trip.report ? canUpdate : canCreate;
  const isCompleted = trip.report?.status === "completed";

  const updateReview = (participantId: string, text: string) => {
    setReviews((currentReviews) =>
      currentReviews.map((review) =>
        review.participantId === participantId ? { ...review, text } : review,
      ),
    );
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setError("");
    const files = Array.from(event.target.files || []);

    try {
      const nextPhotos = await Promise.all(files.map(readImageFile));
      setPhotos((currentPhotos) => [...currentPhotos, ...nextPhotos].slice(0, 6));
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Не удалось загрузить фото.");
    } finally {
      event.target.value = "";
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSave) {
      setError("Недостаточно прав для сохранения отчета.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const report = await saveTripReport(trip.id, buildPayload(summary, photos, reviews));
      onReportSaved(report, false);
    } catch (requestError) {
      handleReportError(requestError, onLogout, setError, "Не удалось сохранить отчет.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!canSave) {
      setError("Недостаточно прав для завершения отчета.");
      return;
    }

    const validationError = validateComplete(summary, photos, reviews);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsCompleting(true);
    setError("");

    try {
      const report = await completeTripReport(trip.id, buildPayload(summary, photos, reviews));
      onReportSaved(report, true);
    } catch (requestError) {
      handleReportError(requestError, onLogout, setError, "Не удалось завершить поездку.");
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <section className="trip-report-editor" aria-label="Отчет лидера">
      <div className="trip-report-editor__header">
        <div>
          <span className="admin-kicker">Отчет лидера</span>
          <h3>{isCompleted ? "Поездка завершена" : "Заполнить отчет"}</h3>
        </div>
        <span className={`status-pill${isCompleted ? " status-pill--success" : ""}`}>
          {isCompleted ? "Завершено" : "Черновик"}
        </span>
      </div>

      <form className="trip-report-form" onSubmit={handleSave}>
        <label className="form-field form-field--wide">
          <span>Что делали в поездке</span>
          <textarea
            rows={5}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Опишите служение, события, результаты и важные детали поездки"
          />
        </label>

        <div className="form-field form-field--wide">
          <span>Фото</span>
          <label className="report-photo-picker">
            <ImagePlus size={20} aria-hidden="true" />
            <span>Прикрепить фото</span>
            <input accept="image/*" multiple type="file" onChange={handlePhotoChange} />
          </label>
          {photos.length ? (
            <div className="report-photo-grid">
              {photos.map((photo, index) => (
                <figure className="report-photo" key={`${photo.slice(0, 40)}-${index}`}>
                  <img src={photo} alt={`Фото отчета ${index + 1}`} />
                  <button
                    className="icon-button icon-button--danger"
                    type="button"
                    aria-label="Удалить фото"
                    onClick={() => setPhotos((currentPhotos) => currentPhotos.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </figure>
              ))}
            </div>
          ) : null}
        </div>

        <div className="form-field form-field--wide">
          <span>Характеристика участников</span>
          <div className="report-review-list">
            {reviews.map((review) => (
              <label className="report-review" key={review.participantId}>
                <strong>{review.fullName}</strong>
                <textarea
                  rows={3}
                  value={review.text}
                  onChange={(event) => updateReview(review.participantId, event.target.value)}
                  placeholder="Характер, участие, ответственность, что важно помнить"
                />
              </label>
            ))}
          </div>
        </div>

        {error ? (
          <p className="admin-error form-field--wide" role="alert">
            {error}
          </p>
        ) : null}

        {isCompleted ? (
          <div className="report-completed-note form-field--wide">
            <CheckCircle2 size={20} aria-hidden="true" />
            <span>Отчет отправлен, поездка отмечена как завершенная.</span>
          </div>
        ) : null}

        <div className="trip-form__actions form-field--wide">
          <button className="button button--secondary button--neutral" type="submit" disabled={isSaving || !canSave}>
            <Save size={18} aria-hidden="true" />
            {isSaving ? "Сохраняем..." : "Сохранить отчет"}
          </button>
          <button className="button button--primary" type="button" disabled={isCompleting || !canSave} onClick={handleComplete}>
            <Send size={18} aria-hidden="true" />
            {isCompleting ? "Завершаем..." : "Завершить поездку"}
          </button>
        </div>
      </form>
    </section>
  );
}

function buildPayload(summary: string, photos: string[], reviews: ReviewState[]): SaveTripReportInput {
  return {
    summary,
    photos,
    participantReviews: reviews.map((review) => ({
      participantId: review.participantId,
      text: review.text,
    })),
  };
}

function validateComplete(summary: string, photos: string[], reviews: ReviewState[]) {
  if (!summary.trim()) {
    return "Заполните общий отчет по поездке.";
  }

  if (!photos.length) {
    return "Прикрепите хотя бы одно фото.";
  }

  if (reviews.some((review) => !review.text.trim())) {
    return "Заполните характеристику каждого участника.";
  }

  return "";
}

async function readImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Можно прикреплять только изображения.");
  }

  if (file.size > 1_500_000) {
    throw new Error("Одно фото должно быть меньше 1.5 МБ.");
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Не удалось прочитать фото.")));
    reader.readAsDataURL(file);
  });
}

function handleReportError(
  error: unknown,
  onLogout: () => void,
  setError: (message: string) => void,
  fallback: string,
) {
  if (isUnauthorizedError(error)) {
    onLogout();
    return;
  }

  if (isForbiddenError(error)) {
    setError("Недостаточно прав для отчета.");
    return;
  }

  setError(error instanceof Error && error.message ? error.message : fallback);
}
