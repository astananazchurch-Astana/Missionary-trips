import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventStatus,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  isForbiddenError,
  isUnauthorizedError,
  updateCalendarEvent,
} from "../shared/lib/auth";

type AdminCalendarPanelProps = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onLogout: () => void;
};

type CalendarDay = {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
  isToday: boolean;
};

type CalendarEventFormState = CalendarEventInput;

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const calendarStatuses: Array<{ id: CalendarEventStatus; label: string }> = [
  { id: "planned", label: "Запланировано" },
  { id: "confirmed", label: "Подтверждено" },
  { id: "cancelled", label: "Отменено" },
];

const colorSwatches = [
  { color: "#2f5d50", label: "Зеленый" },
  { color: "#d7aa45", label: "Золотой" },
  { color: "#7d2836", label: "Бордовый" },
  { color: "#315f8c", label: "Синий" },
  { color: "#6f4fa3", label: "Фиолетовый" },
];

export function AdminCalendarPanel({
  canCreate,
  canUpdate,
  canDelete,
  onLogout,
}: AdminCalendarPanelProps) {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<CalendarEventFormState>(() => buildEmptyCalendarForm(todayKey));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState("");

  const monthDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);
  const rangeStart = monthDays[0]?.key || toDateKey(currentMonth);
  const rangeEnd = monthDays[monthDays.length - 1]?.key || toDateKey(currentMonth);
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const selectedEvents = eventsByDate.get(selectedDate) || [];
  const timelineHours = useMemo(() => buildTimelineHours(selectedEvents), [selectedEvents]);
  const monthTitle = formatMonthTitle(currentMonth);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      setError("");
      setIsLoading(true);

      try {
        const nextEvents = await fetchCalendarEvents({ start: rangeStart, end: rangeEnd });

        if (isMounted) {
          setEvents(sortCalendarEvents(nextEvents));
        }
      } catch (requestError) {
        if (isUnauthorizedError(requestError)) {
          onLogout();
          return;
        }

        if (isMounted) {
          setError(
            isForbiddenError(requestError)
              ? "Недостаточно прав для просмотра календаря."
              : "Не удалось загрузить события календаря.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadEvents();

    return () => {
      isMounted = false;
    };
  }, [onLogout, rangeEnd, rangeStart]);

  const selectDay = (day: CalendarDay) => {
    setSelectedDate(day.key);

    if (!day.isCurrentMonth) {
      setCurrentMonth(startOfMonth(day.date));
    }
  };

  const openCreateModal = (dateKey = selectedDate) => {
    if (!canCreate) {
      return;
    }

    setEditingEvent(null);
    setForm(buildEmptyCalendarForm(dateKey));
    setModalError("");
    setIsModalOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    if (!canUpdate) {
      return;
    }

    setEditingEvent(event);
    setForm(eventToForm(event));
    setModalError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
    setForm(buildEmptyCalendarForm(selectedDate));
    setModalError("");
  };

  const updateForm = (field: keyof CalendarEventFormState, value: string) => {
    setForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [field]: value,
      };

      if (field === "startAt" && value && nextForm.endAt <= value) {
        nextForm.endAt = addMinutesToDateTime(value, 60);
      }

      return nextForm;
    });
  };

  const handleSaveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");

    if (editingEvent ? !canUpdate : !canCreate) {
      setModalError("Недостаточно прав для сохранения события.");
      return;
    }

    if (form.endAt <= form.startAt) {
      setModalError("Время окончания должно быть позже времени начала.");
      return;
    }

    setIsSaving(true);

    try {
      const savedEvent = editingEvent
        ? await updateCalendarEvent(editingEvent.id, form)
        : await createCalendarEvent(form);

      setEvents((currentEvents) => {
        const nextEvents = editingEvent
          ? currentEvents.map((item) => (item.id === savedEvent.id ? savedEvent : item))
          : [...currentEvents, savedEvent];

        return sortCalendarEvents(nextEvents);
      });
      setSelectedDate(savedEvent.date);

      if (savedEvent.date < rangeStart || savedEvent.date > rangeEnd) {
        setCurrentMonth(startOfMonth(parseDateKey(savedEvent.date)));
      }

      closeModal();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setModalError(
        isForbiddenError(requestError)
          ? "Недостаточно прав для сохранения события."
          : "Не удалось сохранить событие. Проверьте заполнение полей.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (event: CalendarEvent) => {
    if (!canDelete) {
      return;
    }

    if (!window.confirm(`Удалить событие "${event.title}"?`)) {
      return;
    }

    setDeletingEventId(event.id);
    setError("");

    try {
      await deleteCalendarEvent(event.id);
      setEvents((currentEvents) => currentEvents.filter((item) => item.id !== event.id));
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setError(
        isForbiddenError(requestError)
          ? "Недостаточно прав для удаления события."
          : "Не удалось удалить событие.",
      );
    } finally {
      setDeletingEventId("");
    }
  };

  const goToMonth = (offset: number) => {
    const nextMonth = addMonths(currentMonth, offset);
    setCurrentMonth(nextMonth);
    setSelectedDate(toDateKey(nextMonth));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    setSelectedDate(toDateKey(today));
  };

  return (
    <>
      <header className="admin-topbar calendar-topbar">
        <div>
          <span className="admin-kicker">Календарь</span>
          <h1>Календарь мероприятий</h1>
          <p className="access-topbar__description">
            {formatLongDate(selectedDate)}
          </p>
        </div>
        {canCreate ? (
          <button className="button button--primary admin-create" type="button" onClick={() => openCreateModal()}>
            <Plus size={19} aria-hidden="true" />
            Новое событие
          </button>
        ) : null}
      </header>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="calendar-workspace">
        <div className="admin-panel calendar-month-panel">
          <div className="calendar-toolbar">
            <div className="calendar-toolbar__title">
              <CalendarDays size={20} aria-hidden="true" />
              <h2>{monthTitle}</h2>
            </div>
            <div className="calendar-toolbar__actions">
              <button className="icon-button" type="button" aria-label="Предыдущий месяц" onClick={() => goToMonth(-1)}>
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button className="button button--secondary button--neutral calendar-today" type="button" onClick={goToToday}>
                Сегодня
              </button>
              <button className="icon-button" type="button" aria-label="Следующий месяц" onClick={() => goToMonth(1)}>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="calendar-grid" role="grid" aria-label={monthTitle}>
            {weekDays.map((day) => (
              <span className="calendar-weekday" key={day}>
                {day}
              </span>
            ))}

            {monthDays.map((day) => {
              const dayEvents = eventsByDate.get(day.key) || [];

              return (
                <button
                  className={[
                    "calendar-day",
                    day.isCurrentMonth ? "" : "calendar-day--muted",
                    day.isToday ? "calendar-day--today" : "",
                    selectedDate === day.key ? "calendar-day--selected" : "",
                  ].filter(Boolean).join(" ")}
                  type="button"
                  role="gridcell"
                  aria-selected={selectedDate === day.key}
                  key={day.key}
                  onClick={() => selectDay(day)}
                >
                  <span className="calendar-day__number">{day.date.getDate()}</span>
                  <span className="calendar-day__events">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span className="calendar-event-chip" style={{ borderLeftColor: event.color }} key={event.id}>
                        {formatEventTime(event)}
                      </span>
                    ))}
                    {dayEvents.length > 3 ? (
                      <span className="calendar-event-chip calendar-event-chip--more">
                        +{dayEvents.length - 3}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {isLoading ? <p className="calendar-loading">Загружаем календарь...</p> : null}
        </div>

        <aside className="admin-panel calendar-day-panel" aria-label="День календаря">
          <div className="calendar-day-panel__header">
            <div>
              <span className="admin-kicker">День</span>
              <h2>{formatLongDate(selectedDate)}</h2>
            </div>
            {canCreate ? (
              <button className="icon-button" type="button" aria-label="Добавить событие" onClick={() => openCreateModal(selectedDate)}>
                <Plus size={20} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="calendar-day-summary">
            <span>
              <CalendarCheck size={17} aria-hidden="true" />
              {selectedEvents.length} {pluralizeEvents(selectedEvents.length)}
            </span>
            <span>
              <Clock3 size={17} aria-hidden="true" />
              {selectedEvents.length ? formatDayRange(selectedEvents) : "Свободный день"}
            </span>
          </div>

          <div className="calendar-timeline">
            {timelineHours.map((hour) => {
              const slotEvents = selectedEvents.filter((event) => getEventStartHour(event) === hour);

              return (
                <div className="calendar-slot" key={hour}>
                  <time className="calendar-slot__time">{String(hour).padStart(2, "0")}:00</time>
                  <div className="calendar-slot__body">
                    {slotEvents.length ? (
                      slotEvents.map((event) => (
                        <CalendarEventCard
                          canDelete={canDelete}
                          canUpdate={canUpdate}
                          event={event}
                          isDeleting={deletingEventId === event.id}
                          key={event.id}
                          onDelete={handleDeleteEvent}
                          onEdit={openEditModal}
                        />
                      ))
                    ) : (
                      <span className="calendar-slot__empty">Свободно</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      {isModalOpen ? (
        <CalendarEventModal
          error={modalError}
          event={editingEvent}
          form={form}
          isSaving={isSaving}
          onChange={updateForm}
          onClose={closeModal}
          onSubmit={handleSaveEvent}
        />
      ) : null}
    </>
  );
}

type CalendarEventCardProps = {
  canUpdate: boolean;
  canDelete: boolean;
  event: CalendarEvent;
  isDeleting: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
};

function CalendarEventCard({
  canUpdate,
  canDelete,
  event,
  isDeleting,
  onEdit,
  onDelete,
}: CalendarEventCardProps) {
  return (
    <article className="calendar-event-card" style={{ borderLeftColor: event.color }}>
      <div className="calendar-event-card__header">
        <div>
          <span>{formatEventTime(event)}</span>
          <h3>{event.title}</h3>
        </div>
        <div className="calendar-event-card__actions">
          {canUpdate ? (
            <button className="icon-button" type="button" aria-label="Редактировать" onClick={() => onEdit(event)}>
              <Pencil size={17} aria-hidden="true" />
            </button>
          ) : null}
          {canDelete ? (
            <button
              className="icon-button icon-button--danger"
              type="button"
              aria-label="Удалить"
              disabled={isDeleting}
              onClick={() => onDelete(event)}
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="calendar-event-card__meta">
        <span className={`status-pill calendar-status calendar-status--${event.status}`}>
          {getStatusLabel(event.status)}
        </span>
        {event.roleName ? (
          <span>
            <UserRound size={15} aria-hidden="true" />
            {event.roleName}
          </span>
        ) : null}
        {event.location ? (
          <span>
            <MapPin size={15} aria-hidden="true" />
            {event.location}
          </span>
        ) : null}
      </div>

      {event.description ? <p>{event.description}</p> : null}
    </article>
  );
}

type CalendarEventModalProps = {
  event: CalendarEvent | null;
  form: CalendarEventFormState;
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onChange: (field: keyof CalendarEventFormState, value: string) => void;
};

function CalendarEventModal({
  event,
  form,
  error,
  isSaving,
  onSubmit,
  onClose,
  onChange,
}: CalendarEventModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="trip-modal calendar-modal" role="dialog" aria-modal="true" aria-label="Событие календаря">
        <div className="trip-modal__header">
          <div>
            <span className="admin-kicker">{event ? "Редактирование" : "Новое событие"}</span>
            <h2>{event ? "Изменить событие" : "Создать событие"}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        <form className="trip-form calendar-form" onSubmit={onSubmit}>
          <label className="form-field form-field--wide">
            <span>Название</span>
            <div className="input-shell">
              <CalendarCheck size={19} aria-hidden="true" />
              <input
                required
                value={form.title}
                onChange={(inputEvent) => onChange("title", inputEvent.target.value)}
                placeholder="Например, встреча команды"
              />
            </div>
          </label>

          <label className="form-field">
            <span>Начало</span>
            <div className="input-shell">
              <Clock3 size={19} aria-hidden="true" />
              <input
                required
                type="datetime-local"
                value={form.startAt}
                onChange={(inputEvent) => onChange("startAt", inputEvent.target.value)}
              />
            </div>
          </label>

          <label className="form-field">
            <span>Окончание</span>
            <div className="input-shell">
              <Clock3 size={19} aria-hidden="true" />
              <input
                required
                type="datetime-local"
                value={form.endAt}
                onChange={(inputEvent) => onChange("endAt", inputEvent.target.value)}
              />
            </div>
          </label>

          <label className="form-field">
            <span>Место</span>
            <div className="input-shell">
              <MapPin size={19} aria-hidden="true" />
              <input
                value={form.location}
                onChange={(inputEvent) => onChange("location", inputEvent.target.value)}
                placeholder="Зал, адрес или онлайн"
              />
            </div>
          </label>

          <label className="form-field">
            <span>Роль</span>
            <div className="input-shell">
              <UserRound size={19} aria-hidden="true" />
              <input
                value={form.roleName}
                onChange={(inputEvent) => onChange("roleName", inputEvent.target.value)}
                placeholder="Например, координатор"
              />
            </div>
          </label>

          <label className="form-field">
            <span>Статус</span>
            <div className="input-shell input-shell--select">
              <Check size={19} aria-hidden="true" />
              <select
                required
                value={form.status}
                onChange={(inputEvent) => onChange("status", inputEvent.target.value)}
              >
                {calendarStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <fieldset className="calendar-color-field">
            <legend>Цвет</legend>
            <div className="calendar-color-field__swatches">
              {colorSwatches.map((swatch) => (
                <button
                  className={`calendar-color-swatch${form.color === swatch.color ? " calendar-color-swatch--active" : ""}`}
                  style={{ backgroundColor: swatch.color }}
                  type="button"
                  aria-label={swatch.label}
                  key={swatch.color}
                  onClick={() => onChange("color", swatch.color)}
                >
                  {form.color === swatch.color ? <Check size={16} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="form-field form-field--wide">
            <span>Описание</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(inputEvent) => onChange("description", inputEvent.target.value)}
              placeholder="Краткие детали встречи или мероприятия"
            />
          </label>

          {error ? (
            <p className="admin-error form-field--wide" role="alert">
              {error}
            </p>
          ) : null}

          <div className="trip-form__actions form-field--wide">
            <button className="button button--secondary button--neutral" type="button" onClick={onClose}>
              Отмена
            </button>
            <button className="button button--primary" type="submit" disabled={isSaving}>
              <CalendarCheck size={19} aria-hidden="true" />
              {isSaving ? "Сохраняем..." : event ? "Сохранить" : "Создать событие"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function buildMonthDays(monthDate: Date): CalendarDay[] {
  const monthStart = startOfMonth(monthDate);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridStart = addDays(monthStart, -firstWeekday);
  const todayKey = toDateKey(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const key = toDateKey(date);

    return {
      date,
      key,
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
      isToday: key === todayKey,
    };
  });
}

function buildEmptyCalendarForm(dateKey: string): CalendarEventFormState {
  return {
    title: "",
    description: "",
    location: "",
    startAt: `${dateKey}T09:00`,
    endAt: `${dateKey}T10:00`,
    roleName: "",
    color: colorSwatches[0].color,
    status: "planned",
  };
}

function eventToForm(event: CalendarEvent): CalendarEventFormState {
  return {
    title: event.title,
    description: event.description || "",
    location: event.location || "",
    startAt: event.startAt,
    endAt: event.endAt,
    roleName: event.roleName || "",
    color: event.color || colorSwatches[0].color,
    status: event.status || "planned",
  };
}

function groupEventsByDate(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();

  for (const event of sortCalendarEvents(events)) {
    const currentEvents = map.get(event.date) || [];
    currentEvents.push(event);
    map.set(event.date, currentEvents);
  }

  return map;
}

function sortCalendarEvents(events: CalendarEvent[]) {
  return [...events].sort((first, second) => first.startAt.localeCompare(second.startAt));
}

function buildTimelineHours(events: CalendarEvent[]) {
  const hours = new Set<number>();

  for (let hour = 8; hour <= 20; hour += 1) {
    hours.add(hour);
  }

  for (const event of events) {
    hours.add(getEventStartHour(event));
  }

  return Array.from(hours).sort((first, second) => first - second);
}

function getEventStartHour(event: CalendarEvent) {
  const time = event.startAt.split("T")[1] || "00:00";
  return Number(time.slice(0, 2));
}

function formatEventTime(event: CalendarEvent) {
  return `${event.startAt.slice(11, 16)}-${event.endAt.slice(11, 16)}`;
}

function formatDayRange(events: CalendarEvent[]) {
  const sortedEvents = sortCalendarEvents(events);
  const firstEvent = sortedEvents[0];
  const lastEvent = sortedEvents[sortedEvents.length - 1];

  return `${firstEvent.startAt.slice(11, 16)}-${lastEvent.endAt.slice(11, 16)}`;
}

function pluralizeEvents(count: number) {
  const moduloTen = count % 10;
  const moduloHundred = count % 100;

  if (moduloTen === 1 && moduloHundred !== 11) {
    return "событие";
  }

  if (moduloTen >= 2 && moduloTen <= 4 && (moduloHundred < 12 || moduloHundred > 14)) {
    return "события";
  }

  return "событий";
}

function getStatusLabel(status: CalendarEventStatus) {
  return calendarStatuses.find((item) => item.id === status)?.label || "Запланировано";
}

function formatMonthTitle(date: Date) {
  const title = new Intl.DateTimeFormat("ru", {
    month: "long",
    year: "numeric",
  }).format(date);

  return title.charAt(0).toUpperCase() + title.slice(1);
}

function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseDateKey(dateKey));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addMinutesToDateTime(value: string, minutes: number) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, currentMinutes] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, currentMinutes);

  date.setMinutes(date.getMinutes() + minutes);

  return `${toDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
