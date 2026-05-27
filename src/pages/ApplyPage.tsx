import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  FileText,
  HeartHandshake,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  type PublicTrip,
  type PublicTripParticipant,
  type TripApplicationType,
  type TripCostDetails,
  type TripExpenseCommitment,
  fetchPublicTrip,
  submitTripApplication,
} from "../shared/lib/auth";
import { Logo } from "../shared/ui/Logo";

type ApplyPageProps = {
  homeHref: string;
  onHome: () => void;
};

type ReadConfirmations = {
  restrictions: boolean;
  note: boolean;
};

type TripInfoModalState = {
  title: string;
  content: string;
};

type ApplicationFormState = {
  fullName: string;
  applicationType: TripApplicationType | "";
  cityName: string;
  availableDays: string;
  phone: string;
  email: string;
  donation: string;
  expenseCommitmentIds: string[];
  comment: string;
};

type ApplicationStringField = Exclude<keyof ApplicationFormState, "expenseCommitmentIds">;

const emptyForm: ApplicationFormState = {
  fullName: "",
  applicationType: "",
  cityName: "",
  availableDays: "",
  phone: "+7 ",
  email: "",
  donation: "",
  expenseCommitmentIds: [],
  comment: "",
};

const applicationTypeLabels: Record<TripApplicationType, string> = {
  ready: "Готов поехать",
  reserve: "Готов поехать (резерв)",
  pray: "Буду молиться",
  support: "Поддержу финансово",
};

const costItemLabels = {
  travel: "Дорога",
  lodging: "Проживание",
  food: "Еда",
};

const kazakhstanCities = [
  "Астана",
  "Алматы",
  "Шымкент",
  "Караганда",
  "Актобе",
  "Тараз",
  "Павлодар",
  "Усть-Каменогорск",
  "Семей",
  "Атырау",
  "Костанай",
  "Кызылорда",
  "Уральск",
  "Петропавловск",
  "Актау",
  "Туркестан",
  "Кокшетау",
  "Талдыкорган",
  "Экибастуз",
  "Рудный",
];

export function ApplyPage({ homeHref, onHome }: ApplyPageProps) {
  const tripId = useMemo(() => new URLSearchParams(window.location.search).get("tripId") || "", []);
  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [form, setForm] = useState<ApplicationFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [readConfirmations, setReadConfirmations] = useState<ReadConfirmations>({
    restrictions: false,
    note: false,
  });
  const [activeInfoModal, setActiveInfoModal] = useState<TripInfoModalState | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!tripId) {
      setError("Поездка не выбрана.");
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    fetchPublicTrip(tripId)
      .then((nextTrip) => {
        if (isMounted) {
          setTrip(nextTrip);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Не удалось загрузить данные поездки.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [tripId]);

  useEffect(() => {
    setReadConfirmations({ restrictions: false, note: false });
    setActiveInfoModal(null);
  }, [trip?.id]);

  useEffect(() => {
    if (!activeInfoModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveInfoModal(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeInfoModal]);

  const participants = trip?.participants || [];
  const isClosed = trip ? isRegistrationClosed(trip.registrationDeadline || trip.date) : false;
  const availableSpots = Math.max(Number(trip?.availableSpots ?? trip?.peopleLimit ?? 0), 0);
  const canSendApplication = Boolean(trip && !isClosed);
  const isTravelApplication = form.applicationType === "ready" || form.applicationType === "reserve";
  const isSupportApplication = form.applicationType === "support";
  const isPrayerApplication = form.applicationType === "pray";
  const costItems = getCostItems(trip?.costDetails);
  const selectedExpenseCommitments = costItems.filter((item) => form.expenseCommitmentIds.includes(item.id));
  const tripTitle = trip ? `${trip.cityName}, ${trip.countryName}` : "Миссионерская поездка";
  const needsRestrictionsConfirmation = Boolean(trip?.restrictions);
  const needsNoteConfirmation = Boolean(trip?.note);
  const hasReadRequiredInfo =
    (!needsRestrictionsConfirmation || readConfirmations.restrictions) &&
    (!needsNoteConfirmation || readConfirmations.note);
  const canSubmitApplication = canSendApplication && Boolean(form.applicationType) && hasReadRequiredInfo && !isSubmitting;

  const updateForm = (field: ApplicationStringField, value: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: field === "phone" ? formatKzPhone(value) : value,
      ...(field === "applicationType" ? { expenseCommitmentIds: [], donation: "", comment: "" } : {}),
    }));
  };

  const toggleExpenseCommitment = (id: string, isChecked: boolean) => {
    setForm((currentForm) => ({
      ...currentForm,
      expenseCommitmentIds: isChecked
        ? [...new Set([...currentForm.expenseCommitmentIds, id])]
        : currentForm.expenseCommitmentIds.filter((currentId) => currentId !== id),
    }));
  };

  const updateReadConfirmation = (field: keyof ReadConfirmations, value: boolean) => {
    setReadConfirmations((currentConfirmations) => ({
      ...currentConfirmations,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!trip || !canSendApplication) {
      setError("Регистрация на эту поездку уже закрыта.");
      return;
    }

    if (!form.applicationType) {
      setError("Выберите, как вы хотите участвовать в поездке.");
      return;
    }

    if (form.applicationType === "ready" && availableSpots <= 0) {
      setError("Свободных мест уже нет. Вы можете выбрать резерв.");
      return;
    }

    if (!hasReadRequiredInfo) {
      setError("Подтвердите, что вы прочитали ограничения и примечание поездки.");
      return;
    }

    setIsSubmitting(true);

    try {
      const participant = await submitTripApplication(trip.id, {
        fullName: form.fullName,
        applicationType: form.applicationType,
        cityName: isTravelApplication ? form.cityName : undefined,
        availableDays: isTravelApplication ? Number(form.availableDays) : undefined,
        phone: isPrayerApplication ? undefined : form.phone,
        email: isPrayerApplication ? undefined : form.email,
        donation: isSupportApplication ? form.donation : "",
        expenseCommitments: selectedExpenseCommitments,
        comment: form.comment,
      });

      setTrip((currentTrip) => addParticipantToTrip(currentTrip, participant));
      setForm(emptyForm);
      setReadConfirmations({ restrictions: false, note: false });
      setSuccess("Заявка отправлена. Администратор увидит ваши данные в поездке.");
    } catch {
      setError("Не удалось отправить заявку. Проверьте поля и попробуйте еще раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="apply-page">
      <div className="apply-shell">
        <a
          className="apply-back"
          href={homeHref}
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          На лендинг
        </a>

        <section className="apply-hero">
          <div className="apply-hero__brand">
            <Logo className="apply-hero__logo" />
            <div>
              <span>Заявка на поездку</span>
              <h1 className={getApplyTitleClassName(tripTitle)}>{tripTitle}</h1>
            </div>
          </div>

          {isLoading ? <p className="apply-muted">Загружаем данные поездки...</p> : null}

          {!isLoading && trip ? (
            <>
              <p>{trip.description}</p>
              <div className="apply-trip-grid" aria-label="Данные поездки">
                <TripFact icon={MapPin} label="Направление" value={`${trip.cityName}, ${trip.countryName}`} />
                <TripFact
                  icon={CalendarDays}
                  label="Даты поездки"
                  value={formatDateRange(trip.startDate || trip.date, trip.endDate || trip.date)}
                />
                <TripFact
                  icon={CalendarDays}
                  label="Регистрация до"
                  value={formatDate(trip.registrationDeadline || trip.date)}
                />
                <TripFact icon={UsersRound} label="Нужно людей" value={`${availableSpots} из ${trip.peopleLimit}`} />
                <TripFact icon={Wallet} label="Стоимость на человека" value={getCostSummary(trip.costDetails) || trip.cost} />
                {trip.restrictions ? (
                  <TripFact
                    icon={ShieldCheck}
                    label="Ограничения"
                    value="Ознакомьтесь перед отправкой заявки"
                    onView={() =>
                      setActiveInfoModal({
                        title: "Ограничения поездки",
                        content: trip.restrictions || "",
                      })
                    }
                  />
                ) : null}
                {trip.note ? (
                  <TripFact
                    icon={FileText}
                    label="Примечание"
                    value="Дополнительная информация о поездке"
                    onView={() =>
                      setActiveInfoModal({
                        title: "Примечание к поездке",
                        content: trip.note || "",
                      })
                    }
                  />
                ) : null}
              </div>

              <div className="apply-participants">
                <div>
                  <span>Уже участвуют</span>
                  <strong>{participants.length ? `${participants.length} человек` : "Пока нет заявок"}</strong>
                </div>
                {participants.length ? (
                  <div className="apply-participants__names">
                    {participants.map((participant) => (
                      <span key={participant.id}>{participant.fullName}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {!isLoading && error && !trip ? (
            <p className="apply-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <section className="apply-card">
          <div className="apply-card__header">
            <span>Анкета участника</span>
            <h2>Заполните данные</h2>
          </div>

          {trip && isClosed ? (
            <div className="apply-closed">
              <strong>Регистрация закрыта</strong>
              <p>Эта поездка пока остается в списке, но новые заявки уже не принимаются.</p>
            </div>
          ) : null}

          <form className="apply-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>ФИО полностью</span>
              <div className="input-shell">
                <UserRound size={19} aria-hidden="true" />
                <input
                  required
                  value={form.fullName}
                  onChange={(event) => updateForm("fullName", event.target.value)}
                  placeholder="Иванов Иван Иванович"
                />
              </div>
            </label>

            <label className="form-field">
              <span>Как вы хотите участвовать</span>
              <div className="input-shell input-shell--select">
                <CheckCircle2 size={19} aria-hidden="true" />
                <select
                  required
                  value={form.applicationType}
                  onChange={(event) => updateForm("applicationType", event.target.value)}
                >
                  <option value="">Выберите вариант</option>
                  {availableSpots > 0 ? <option value="ready">{applicationTypeLabels.ready}</option> : null}
                  <option value="reserve">{applicationTypeLabels.reserve}</option>
                  <option value="pray">{applicationTypeLabels.pray}</option>
                  <option value="support">{applicationTypeLabels.support}</option>
                </select>
              </div>
            </label>

            {!isClosed && availableSpots <= 0 ? (
              <p className="apply-hint">Основные места заполнены, можно оставить резервную заявку или поддержать поездку.</p>
            ) : null}

            {isTravelApplication ? (
            <>
            <label className="form-field">
              <span>Город в Казахстане</span>
              <div className="input-shell input-shell--select">
                <MapPin size={19} aria-hidden="true" />
                <select
                  required
                  value={form.cityName}
                  onChange={(event) => updateForm("cityName", event.target.value)}
                >
                  <option value="">Выберите город</option>
                  {kazakhstanCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="form-field">
              <span>На сколько дней готовы поехать</span>
              <input
                required
                min={1}
                max={365}
                type="number"
                value={form.availableDays}
                onChange={(event) => updateForm("availableDays", event.target.value)}
                placeholder="Например, 7"
              />
            </label>

            </>
            ) : null}

            {form.applicationType && !isPrayerApplication ? (
            <>
            <label className="form-field">
              <span>Номер телефона</span>
              <div className="input-shell">
                <Phone size={19} aria-hidden="true" />
                <input
                  required
                  inputMode="tel"
                  pattern="\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}"
                  title="Введите номер в формате +7 (777) 777-77-77"
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="+7 (___) ___-__-__"
                />
              </div>
            </label>

            <label className="form-field">
              <span>Почта</span>
              <div className="input-shell">
                <Mail size={19} aria-hidden="true" />
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="name@example.com"
                />
              </div>
            </label>
            </>
            ) : null}

            {isSupportApplication ? (
            <label className="form-field">
              <span>Пожертвование на поездку</span>
              <div className="input-shell">
                <HeartHandshake size={19} aria-hidden="true" />
                <input
                  value={form.donation}
                  onChange={(event) => updateForm("donation", event.target.value)}
                  placeholder="Например, 50 000 ₸"
                />
              </div>
            </label>
            ) : null}

            {(isTravelApplication || isSupportApplication) && costItems.length ? (
              <div className="apply-cost-options">
                <div className="apply-cost-options__header">
                  <Wallet size={19} aria-hidden="true" />
                  <div>
                    <span>Стоимость на одного человека</span>
                    <strong>{getCostSummary(trip?.costDetails)}</strong>
                  </div>
                </div>
                <div className="apply-confirmations apply-confirmations--costs" aria-label="Расходы поездки">
                  {costItems.map((item) => (
                    <label className="apply-confirmation" key={item.id}>
                      <input
                        type="checkbox"
                        checked={form.expenseCommitmentIds.includes(item.id)}
                        onChange={(event) => toggleExpenseCommitment(item.id, event.target.checked)}
                      />
                      <span>{item.name} — {item.amount}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {(isPrayerApplication || isSupportApplication) ? (
              <label className="form-field">
                <span>{isPrayerApplication ? "За что будете молиться" : "Комментарий"}</span>
                <div className="input-shell input-shell--textarea">
                  <MessageSquare size={19} aria-hidden="true" />
                  <textarea
                    rows={3}
                    value={form.comment}
                    onChange={(event) => updateForm("comment", event.target.value)}
                    placeholder={isPrayerApplication ? "Напишите, как будете поддерживать молитвой" : "Например, удобный способ связи"}
                  />
                </div>
              </label>
            ) : null}

            {trip && (trip.restrictions || trip.note) ? (
              <div className="apply-confirmations" aria-label="Подтверждение ознакомления">
                {trip.restrictions ? (
                  <label className="apply-confirmation">
                    <input
                      required
                      type="checkbox"
                      checked={readConfirmations.restrictions}
                      onChange={(event) => updateReadConfirmation("restrictions", event.target.checked)}
                    />
                    <span>Я прочитал(а) ограничения поездки</span>
                  </label>
                ) : null}

                {trip.note ? (
                  <label className="apply-confirmation">
                    <input
                      required
                      type="checkbox"
                      checked={readConfirmations.note}
                      onChange={(event) => updateReadConfirmation("note", event.target.checked)}
                    />
                    <span>Я прочитал(а) примечание к поездке</span>
                  </label>
                ) : null}
              </div>
            ) : null}

            {error && trip ? (
              <p className="apply-error" role="alert">
                {error}
              </p>
            ) : null}

            {success ? (
              <p className="apply-success" role="status">
                {success}
              </p>
            ) : null}

            <button className="button button--primary apply-submit" type="submit" disabled={!canSubmitApplication}>
              {isSubmitting ? "Отправляем..." : "Отправить заявку"}
              <ArrowRight size={19} aria-hidden="true" />
            </button>
          </form>
        </section>
      </div>

      {activeInfoModal ? (
        <ApplyInfoModal
          title={activeInfoModal.title}
          content={activeInfoModal.content}
          onClose={() => setActiveInfoModal(null)}
        />
      ) : null}
    </main>
  );
}

type TripFactProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  onView?: () => void;
};

function TripFact({ icon: Icon, label, value, onView }: TripFactProps) {
  return (
    <div className={onView ? "apply-trip-fact apply-trip-fact--with-action" : "apply-trip-fact"}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {onView ? (
        <button className="apply-trip-fact__button" type="button" onClick={onView}>
          <Eye size={16} aria-hidden="true" />
          Смотреть
        </button>
      ) : null}
    </div>
  );
}

type ApplyInfoModalProps = {
  title: string;
  content: string;
  onClose: () => void;
};

function ApplyInfoModal({ title, content, onClose }: ApplyInfoModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="trip-modal apply-info-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="trip-modal__header">
          <div>
            <span className="admin-kicker">Информация о поездке</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        <p>{content}</p>

        <div className="apply-info-modal__actions">
          <button className="button button--primary" type="button" onClick={onClose}>
            Понятно
          </button>
        </div>
      </section>
    </div>
  );
}

function getApplyTitleClassName(title: string) {
  const longestTitlePartLength = Math.max(...title.split(/[\s,]+/).map((part) => part.length));

  if (title.length > 46 || longestTitlePartLength > 18) {
    return "apply-hero__title apply-hero__title--compact";
  }

  if (title.length > 30 || longestTitlePartLength > 12) {
    return "apply-hero__title apply-hero__title--medium";
  }

  return "apply-hero__title";
}

function getCostItems(costDetails?: TripCostDetails): TripExpenseCommitment[] {
  if (!costDetails) {
    return [];
  }

  const baseItems: TripExpenseCommitment[] = [
    { id: "travel", name: costItemLabels.travel, amount: costDetails.travel },
    { id: "lodging", name: costItemLabels.lodging, amount: costDetails.lodging },
    { id: "food", name: costItemLabels.food, amount: costDetails.food },
  ].filter((item) => item.amount.trim());

  const otherItems = (costDetails.other || [])
    .filter((item) => item.amount.trim())
    .map((item) => ({
      id: `other:${item.id}`,
      name: item.name.trim() || "Прочее",
      amount: item.amount.trim(),
    }));

  return [...baseItems, ...otherItems];
}

function getCostSummary(costDetails?: TripCostDetails) {
  const total = getCostItems(costDetails).reduce((sum, item) => sum + parseMoneyAmount(item.amount), 0);

  return total > 0 ? `${new Intl.NumberFormat("ru-RU").format(total)} ₸` : "";
}

function parseMoneyAmount(value: string) {
  const digits = value.replace(/[^\d]/g, "");

  return digits ? Number(digits) : 0;
}

function addParticipantToTrip(trip: PublicTrip | null, participant: PublicTripParticipant) {
  if (!trip) {
    return trip;
  }

  const isReadyParticipant = participant.applicationType === "ready" || !participant.applicationType;
  const participantsCount = Number(trip.participantsCount || 0) + (isReadyParticipant ? 1 : 0);

  return {
    ...trip,
    participants: isReadyParticipant ? [participant, ...(trip.participants || [])] : trip.participants || [],
    participantsCount,
    availableSpots: Math.max(Number(trip.peopleLimit || 0) - participantsCount, 0),
  };
}

function formatKzPhone(value: string) {
  let digits = value.replace(/\D/g, "");

  if (!digits) {
    return "+7 ";
  }

  if (digits[0] === "8") {
    digits = `7${digits.slice(1)}`;
  }

  if (digits[0] !== "7") {
    digits = `7${digits}`;
  }

  digits = digits.slice(0, 11);

  const code = digits.slice(1, 4);
  const first = digits.slice(4, 7);
  const second = digits.slice(7, 9);
  const third = digits.slice(9, 11);

  let formatted = "+7";

  if (code) {
    formatted += ` (${code}`;
  }

  if (code.length === 3) {
    formatted += ")";
  }

  if (first) {
    formatted += ` ${first}`;
  }

  if (second) {
    formatted += `-${second}`;
  }

  if (third) {
    formatted += `-${third}`;
  }

  return formatted;
}

function isRegistrationClosed(value: string) {
  if (!value) {
    return false;
  }

  return Date.now() > Date.parse(`${value.slice(0, 10)}T23:59:59`);
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
