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
  Plane,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventStatus,
  type CalendarPlace,
  type CalendarPlaceInput,
  createCalendarEvent,
  createCalendarPlace,
  deleteCalendarEvent,
  deleteCalendarPlace,
  fetchCalendarEvents,
  fetchCalendarPlaces,
  isForbiddenError,
  isUnauthorizedError,
  updateCalendarEvent,
  updateCalendarPlace,
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

type CalendarView = "calendar" | "places";
type CalendarEventFormState = CalendarEventInput;
type CalendarPlaceFormState = CalendarPlaceInput;

type PositionedCalendarEvent = {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
};

type TimelineLayout = {
  events: PositionedCalendarEvent[];
  startHour: number;
  endHour: number;
};

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const defaultDayStartHour = 9;
const defaultDayEndHour = 18;
const hourHeight = 54;

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

const emptyPlaceForm: CalendarPlaceFormState = {
  name: "",
  description: "",
  color: colorSwatches[0].color,
};

export function AdminCalendarPanel({ canCreate, canUpdate, canDelete, onLogout }: AdminCalendarPanelProps) {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [activeView, setActiveView] = useState<CalendarView>("calendar");
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [places, setPlaces] = useState<CalendarPlace[]>([]);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editingPlace, setEditingPlace] = useState<CalendarPlace | null>(null);
  const [eventForm, setEventForm] = useState<CalendarEventFormState>(() => buildEmptyCalendarForm(todayKey, ""));
  const [placeForm, setPlaceForm] = useState<CalendarPlaceFormState>(emptyPlaceForm);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState("");
  const [deletingPlaceId, setDeletingPlaceId] = useState("");

  const monthDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);
  const rangeStart = monthDays[0]?.key || toDateKey(currentMonth);
  const rangeEnd = monthDays[monthDays.length - 1]?.key || toDateKey(currentMonth);
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) || [] : [];
  const selectedTripEvents = selectedEvents.filter((event) => event.sourceType === "trip");
  const selectedTimedEvents = selectedEvents.filter((event) => event.sourceType !== "trip");
  const timelineLayout = useMemo(() => buildTimelineLayout(selectedTimedEvents), [selectedTimedEvents]);
  const monthTitle = formatMonthTitle(currentMonth);
  const firstPlaceId = places[0]?.id || "";

  useEffect(() => {
    let isMounted = true;

    async function loadCalendarData() {
      setError("");
      setIsLoading(true);

      try {
        const [nextEvents, nextPlaces] = await Promise.all([
          fetchCalendarEvents({ start: rangeStart, end: rangeEnd }),
          fetchCalendarPlaces(),
        ]);

        if (isMounted) {
          setEvents(sortCalendarEvents(nextEvents));
          setPlaces(nextPlaces);
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
              : "Не удалось загрузить календарь.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCalendarData();

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

  const openCreateEventModal = (dateKey = selectedDate || todayKey) => {
    if (!canCreate) {
      return;
    }

    setEditingEvent(null);
    setEventForm(buildEmptyCalendarForm(dateKey, firstPlaceId));
    setModalError("");
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (event: CalendarEvent) => {
    if (!canUpdate || event.sourceType === "trip") {
      return;
    }

    setEditingEvent(event);
    setEventForm(eventToForm(event));
    setModalError("");
    setIsEventModalOpen(true);
  };

  const closeEventModal = () => {
    setIsEventModalOpen(false);
    setEditingEvent(null);
    setEventForm(buildEmptyCalendarForm(selectedDate || todayKey, firstPlaceId));
    setModalError("");
  };

  const openCreatePlaceModal = () => {
    if (!canCreate) {
      return;
    }

    setEditingPlace(null);
    setPlaceForm(emptyPlaceForm);
    setModalError("");
    setIsPlaceModalOpen(true);
  };

  const openEditPlaceModal = (place: CalendarPlace) => {
    if (!canUpdate) {
      return;
    }

    setEditingPlace(place);
    setPlaceForm({
      name: place.name,
      description: place.description || "",
      color: place.color || colorSwatches[0].color,
    });
    setModalError("");
    setIsPlaceModalOpen(true);
  };

  const closePlaceModal = () => {
    setIsPlaceModalOpen(false);
    setEditingPlace(null);
    setPlaceForm(emptyPlaceForm);
    setModalError("");
  };

  const updateEventForm = (field: keyof CalendarEventFormState, value: string) => {
    setEventForm((currentForm) => {
      const nextForm = { ...currentForm, [field]: value };

      if (field === "locationId") {
        const place = places.find((item) => item.id === value);
        nextForm.location = place?.name || "";
        nextForm.color = place?.color || nextForm.color;
      }

      if (field === "startAt" && value && nextForm.endAt <= value) {
        nextForm.endAt = addMinutesToDateTime(value, 60);
      }

      return nextForm;
    });
  };

  const updatePlaceForm = (field: keyof CalendarPlaceFormState, value: string) => {
    setPlaceForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSaveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");

    if (editingEvent ? !canUpdate : !canCreate) {
      setModalError("Недостаточно прав для сохранения события.");
      return;
    }

    if (eventForm.endAt <= eventForm.startAt) {
      setModalError("Время окончания должно быть позже времени начала.");
      return;
    }

    setIsSaving(true);

    try {
      const savedEvent = editingEvent
        ? await updateCalendarEvent(editingEvent.id, eventForm)
        : await createCalendarEvent(eventForm);

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

      closeEventModal();
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

  const handleSavePlace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");
    setIsSaving(true);

    try {
      const savedPlace = editingPlace
        ? await updateCalendarPlace(editingPlace.id, placeForm)
        : await createCalendarPlace(placeForm);

      setPlaces((currentPlaces) => {
        const nextPlaces = editingPlace
          ? currentPlaces.map((item) => (item.id === savedPlace.id ? savedPlace : item))
          : [savedPlace, ...currentPlaces];

        return nextPlaces.sort((first, second) => first.name.localeCompare(second.name));
      });
      closePlaceModal();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setModalError(
        isForbiddenError(requestError)
          ? "Недостаточно прав для сохранения места."
          : "Не удалось сохранить место.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (event: CalendarEvent) => {
    if (!canDelete || event.sourceType === "trip") {
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

  const handleDeletePlace = async (place: CalendarPlace) => {
    if (!canDelete) {
      return;
    }

    if (!window.confirm(`Удалить место "${place.name}"?`)) {
      return;
    }

    setDeletingPlaceId(place.id);
    setError("");

    try {
      await deleteCalendarPlace(place.id);
      setPlaces((currentPlaces) => currentPlaces.filter((item) => item.id !== place.id));
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setError(
        isForbiddenError(requestError)
          ? "Недостаточно прав для удаления места."
          : "Не удалось удалить место.",
      );
    } finally {
      setDeletingPlaceId("");
    }
  };

  const goToMonth = (offset: number) => {
    const nextMonth = addMonths(currentMonth, offset);
    setCurrentMonth(nextMonth);
    setSelectedDate("");
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
          <h1>{activeView === "calendar" ? "Календарь мероприятий" : "Места церкви"}</h1>
          <p className="access-topbar__description">
            {activeView === "calendar"
              ? "Выберите дату, чтобы открыть расписание дня."
              : "Добавляйте залы, комнаты и площадки для событий."}
          </p>
        </div>
        {activeView === "calendar" && canCreate ? (
          <button className="button button--primary admin-create" type="button" onClick={() => openCreateEventModal()}>
            <Plus size={19} aria-hidden="true" />
            Новое событие
          </button>
        ) : null}
        {activeView === "places" && canCreate ? (
          <button className="button button--primary admin-create" type="button" onClick={openCreatePlaceModal}>
            <Plus size={19} aria-hidden="true" />
            Новое место
          </button>
        ) : null}
      </header>

      <nav className="calendar-tabs" aria-label="Раздел календаря">
        <button
          className={activeView === "calendar" ? "calendar-tab calendar-tab--active" : "calendar-tab"}
          type="button"
          onClick={() => setActiveView("calendar")}
        >
          <CalendarDays size={18} aria-hidden="true" />
          Календарь
        </button>
        <button
          className={activeView === "places" ? "calendar-tab calendar-tab--active" : "calendar-tab"}
          type="button"
          onClick={() => setActiveView("places")}
        >
          <MapPin size={18} aria-hidden="true" />
          Место
        </button>
      </nav>

      {error ? <p className="admin-error" role="alert">{error}</p> : null}

      {activeView === "calendar" ? (
        <section className="calendar-workspace calendar-workspace--single">
          {selectedDate ? (
            <section className="admin-panel calendar-day-panel calendar-day-panel--full" aria-label="День календаря">
              <div className="calendar-day-panel__header">
                <div>
                  <span className="admin-kicker">День</span>
                  <h2>{formatLongDate(selectedDate)}</h2>
                </div>
                <div className="calendar-day-panel__actions">
                  <button className="button button--secondary button--neutral calendar-back" type="button" onClick={() => setSelectedDate("")}>
                    <ChevronLeft size={18} aria-hidden="true" />
                    К календарю
                  </button>
                  {canCreate ? (
                    <button className="icon-button" type="button" aria-label="Добавить событие" onClick={() => openCreateEventModal(selectedDate)}>
                      <Plus size={20} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="calendar-day-summary">
                <span><CalendarCheck size={17} aria-hidden="true" />{selectedEvents.length} {pluralizeEvents(selectedEvents.length)}</span>
                <span><Clock3 size={17} aria-hidden="true" />{selectedTimedEvents.length ? formatDayRange(selectedTimedEvents) : "Нет событий по времени"}</span>
              </div>

              {selectedTripEvents.length ? (
                <div className="calendar-day-trips">
                  {selectedTripEvents.map((event) => (
                    <span key={event.id}>
                      <Plane size={16} aria-hidden="true" />
                      {event.title}
                    </span>
                  ))}
                </div>
              ) : null}

              <DayTimeline
                canDelete={canDelete}
                canUpdate={canUpdate}
                isDeletingId={deletingEventId}
                layout={timelineLayout}
                onDelete={handleDeleteEvent}
                onEdit={openEditEventModal}
              />
            </section>
          ) : (
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
                {weekDays.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
                {monthDays.map((day) => {
                  const dayEvents = eventsByDate.get(day.key) || [];

                  return (
                    <button
                      className={[
                        "calendar-day",
                        day.isCurrentMonth ? "" : "calendar-day--muted",
                        day.isToday ? "calendar-day--today" : "",
                      ].filter(Boolean).join(" ")}
                      type="button"
                      role="gridcell"
                      aria-selected={false}
                      key={day.key}
                      onClick={() => selectDay(day)}
                    >
                      <span className="calendar-day__number">{day.date.getDate()}</span>
                      <span className="calendar-day__events">
                        {dayEvents.slice(0, 4).map((event) => (
                          <span
                            className={event.sourceType === "trip" ? "calendar-event-chip calendar-event-chip--trip" : "calendar-event-chip"}
                            style={{ borderLeftColor: event.color }}
                            key={event.id}
                          >
                            {event.sourceType === "trip" ? <Plane size={13} aria-hidden="true" /> : null}
                            {event.sourceType === "trip" ? "Поездка" : formatEventTime(event)}
                          </span>
                        ))}
                        {dayEvents.length > 4 ? <span className="calendar-event-chip calendar-event-chip--more">+{dayEvents.length - 4}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              {isLoading ? <p className="calendar-loading">Загружаем календарь...</p> : null}
            </div>
          )}
        </section>
      ) : (
        <PlacesPanel
          canDelete={canDelete}
          canUpdate={canUpdate}
          deletingPlaceId={deletingPlaceId}
          places={places}
          onDelete={handleDeletePlace}
          onEdit={openEditPlaceModal}
        />
      )}

      {isEventModalOpen ? (
        <CalendarEventModal
          error={modalError}
          event={editingEvent}
          form={eventForm}
          isSaving={isSaving}
          places={places}
          onChange={updateEventForm}
          onClose={closeEventModal}
          onSubmit={handleSaveEvent}
        />
      ) : null}

      {isPlaceModalOpen ? (
        <CalendarPlaceModal
          error={modalError}
          form={placeForm}
          isSaving={isSaving}
          place={editingPlace}
          onChange={updatePlaceForm}
          onClose={closePlaceModal}
          onSubmit={handleSavePlace}
        />
      ) : null}
    </>
  );
}

type DayTimelineProps = {
  layout: TimelineLayout;
  canUpdate: boolean;
  canDelete: boolean;
  isDeletingId: string;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
};

function DayTimeline({ layout, canUpdate, canDelete, isDeletingId, onEdit, onDelete }: DayTimelineProps) {
  const hours = Array.from({ length: layout.endHour - layout.startHour + 1 }, (_, index) => layout.startHour + index);
  const timelineHeight = (layout.endHour - layout.startHour + 1) * hourHeight;

  return (
    <div className="calendar-day-scroll">
      <div className="calendar-timeline-board" style={{ height: timelineHeight }}>
        <div className="calendar-time-axis">
          {hours.map((hour) => (
            <time className="calendar-time-label" style={{ top: (hour - layout.startHour) * hourHeight }} key={hour}>
              {String(hour).padStart(2, "0")}:00
            </time>
          ))}
        </div>
        <div className="calendar-time-grid" aria-hidden="true">
          {hours.map((hour) => (
            <span style={{ top: (hour - layout.startHour) * hourHeight }} key={hour} />
          ))}
        </div>
        <div className="calendar-event-lanes">
          {layout.events.map((item) => (
            <CalendarEventBlock
              canDelete={canDelete}
              canUpdate={canUpdate}
              event={item.event}
              isDeleting={isDeletingId === item.event.id}
              key={item.event.id}
              left={item.left}
              top={item.top}
              width={item.width}
              height={item.height}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type CalendarEventBlockProps = {
  event: CalendarEvent;
  top: number;
  left: number;
  width: number;
  height: number;
  canUpdate: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
};

function CalendarEventBlock({
  event,
  top,
  left,
  width,
  height,
  canUpdate,
  canDelete,
  isDeleting,
  onEdit,
  onDelete,
}: CalendarEventBlockProps) {
  const isTrip = event.sourceType === "trip";

  return (
    <article
      className={isTrip ? "calendar-event-block calendar-event-block--trip" : "calendar-event-block"}
      style={{
        top,
        left: `${left}%`,
        width: `calc(${width}% - 8px)`,
        minHeight: height,
        borderLeftColor: event.color,
      }}
    >
      <div className="calendar-event-block__header">
        <span>{isTrip ? "Поездка" : formatEventTime(event)}</span>
        {isTrip ? <Plane size={16} aria-hidden="true" /> : null}
      </div>
      <h3>{event.title}</h3>
      <div className="calendar-event-block__meta">
        {event.location ? <span><MapPin size={13} aria-hidden="true" />{event.location}</span> : null}
        {event.roleName ? <span><UserRound size={13} aria-hidden="true" />{event.roleName}</span> : null}
      </div>
      {event.description ? <p>{event.description}</p> : null}
      {!isTrip && (canUpdate || canDelete) ? (
        <div className="calendar-event-block__actions">
          {canUpdate ? (
            <button className="icon-button" type="button" aria-label="Редактировать" onClick={() => onEdit(event)}>
              <Pencil size={15} aria-hidden="true" />
            </button>
          ) : null}
          {canDelete ? (
            <button className="icon-button icon-button--danger" type="button" aria-label="Удалить" disabled={isDeleting} onClick={() => onDelete(event)}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

type PlacesPanelProps = {
  places: CalendarPlace[];
  canUpdate: boolean;
  canDelete: boolean;
  deletingPlaceId: string;
  onEdit: (place: CalendarPlace) => void;
  onDelete: (place: CalendarPlace) => void;
};

function PlacesPanel({ places, canUpdate, canDelete, deletingPlaceId, onEdit, onDelete }: PlacesPanelProps) {
  return (
    <section className="admin-panel calendar-places-panel">
      {places.length ? (
        <div className="calendar-places-grid">
          {places.map((place) => (
            <article className="calendar-place-card" style={{ borderLeftColor: place.color }} key={place.id}>
              <div>
                <span className="calendar-place-card__color" style={{ backgroundColor: place.color }} />
                <h3>{place.name}</h3>
                {place.description ? <p>{place.description}</p> : null}
              </div>
              <div className="calendar-place-card__actions">
                {canUpdate ? (
                  <button className="icon-button" type="button" aria-label="Редактировать место" onClick={() => onEdit(place)}>
                    <Pencil size={17} aria-hidden="true" />
                  </button>
                ) : null}
                {canDelete ? (
                  <button className="icon-button icon-button--danger" type="button" aria-label="Удалить место" disabled={deletingPlaceId === place.id} onClick={() => onDelete(place)}>
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state--compact">
          <h3>Мест пока нет</h3>
          <p>Добавьте зал, комнату или площадку, чтобы выбирать их в событии.</p>
        </div>
      )}
    </section>
  );
}

type CalendarEventModalProps = {
  event: CalendarEvent | null;
  form: CalendarEventFormState;
  places: CalendarPlace[];
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onChange: (field: keyof CalendarEventFormState, value: string) => void;
};

function CalendarEventModal({ event, form, places, error, isSaving, onSubmit, onClose, onChange }: CalendarEventModalProps) {
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
              <input required value={form.title} onChange={(inputEvent) => onChange("title", inputEvent.target.value)} placeholder="Например, молодежка" />
            </div>
          </label>

          <label className="form-field">
            <span>Начало</span>
            <div className="input-shell">
              <Clock3 size={19} aria-hidden="true" />
              <input required type="datetime-local" value={form.startAt} onChange={(inputEvent) => onChange("startAt", inputEvent.target.value)} />
            </div>
          </label>

          <label className="form-field">
            <span>Окончание</span>
            <div className="input-shell">
              <Clock3 size={19} aria-hidden="true" />
              <input required type="datetime-local" value={form.endAt} onChange={(inputEvent) => onChange("endAt", inputEvent.target.value)} />
            </div>
          </label>

          <label className="form-field">
            <span>Место</span>
            <div className="input-shell input-shell--select">
              <MapPin size={19} aria-hidden="true" />
              <select value={form.locationId} onChange={(inputEvent) => onChange("locationId", inputEvent.target.value)}>
                <option value="">Выберите место</option>
                {places.map((place) => (
                  <option value={place.id} key={place.id}>{place.name}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="form-field">
            <span>Другое место</span>
            <div className="input-shell">
              <MapPin size={19} aria-hidden="true" />
              <input value={form.location} onChange={(inputEvent) => onChange("location", inputEvent.target.value)} placeholder="Если нет в списке" />
            </div>
          </label>

          <label className="form-field">
            <span>Ответственный</span>
            <div className="input-shell">
              <UserRound size={19} aria-hidden="true" />
              <input value={form.roleName} onChange={(inputEvent) => onChange("roleName", inputEvent.target.value)} placeholder="Например, координатор" />
            </div>
          </label>

          <label className="form-field">
            <span>Статус</span>
            <div className="input-shell input-shell--select">
              <Check size={19} aria-hidden="true" />
              <select required value={form.status} onChange={(inputEvent) => onChange("status", inputEvent.target.value)}>
                {calendarStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
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
            <textarea rows={4} value={form.description} onChange={(inputEvent) => onChange("description", inputEvent.target.value)} placeholder="Краткие детали мероприятия" />
          </label>

          {error ? <p className="admin-error form-field--wide" role="alert">{error}</p> : null}

          <div className="trip-form__actions form-field--wide">
            <button className="button button--secondary button--neutral" type="button" onClick={onClose}>Отмена</button>
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

type CalendarPlaceModalProps = {
  place: CalendarPlace | null;
  form: CalendarPlaceFormState;
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onChange: (field: keyof CalendarPlaceFormState, value: string) => void;
};

function CalendarPlaceModal({ place, form, error, isSaving, onSubmit, onClose, onChange }: CalendarPlaceModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="trip-modal calendar-modal" role="dialog" aria-modal="true" aria-label="Место">
        <div className="trip-modal__header">
          <div>
            <span className="admin-kicker">{place ? "Редактирование" : "Новое место"}</span>
            <h2>{place ? "Изменить место" : "Добавить место"}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>
        <form className="trip-form calendar-form" onSubmit={onSubmit}>
          <label className="form-field">
            <span>Название</span>
            <div className="input-shell">
              <MapPin size={19} aria-hidden="true" />
              <input required value={form.name} onChange={(inputEvent) => onChange("name", inputEvent.target.value)} placeholder="Большой зал" />
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
            <textarea rows={4} value={form.description} onChange={(inputEvent) => onChange("description", inputEvent.target.value)} placeholder="Где находится, для чего используется" />
          </label>
          {error ? <p className="admin-error form-field--wide" role="alert">{error}</p> : null}
          <div className="trip-form__actions form-field--wide">
            <button className="button button--secondary button--neutral" type="button" onClick={onClose}>Отмена</button>
            <button className="button button--primary" type="submit" disabled={isSaving}>
              <MapPin size={19} aria-hidden="true" />
              {isSaving ? "Сохраняем..." : place ? "Сохранить" : "Добавить место"}
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

    return { date, key, isCurrentMonth: date.getMonth() === monthStart.getMonth(), isToday: key === todayKey };
  });
}

function buildEmptyCalendarForm(dateKey: string, locationId: string): CalendarEventFormState {
  return {
    title: "",
    description: "",
    location: "",
    locationId,
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
    locationId: event.locationId || "",
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

function buildTimelineLayout(events: CalendarEvent[]): TimelineLayout {
  const startHour = getTimelineStartHour(events);
  const endHour = getTimelineEndHour(events, startHour);
  const sortedEvents = sortCalendarEvents(events);
  const activeColumns: Array<{ end: number }> = [];
  const initial = sortedEvents.map((event) => {
    const start = Math.max(getEventMinuteOfDay(event.startAt), startHour * 60);
    const end = Math.min(getEventMinuteOfDay(event.endAt), (endHour + 1) * 60);
    const columnIndex = findAvailableColumn(activeColumns, start);
    activeColumns[columnIndex] = { end };
    return { event, start, end, columnIndex, columnCount: 1 };
  });

  return {
    startHour,
    endHour,
    events: initial.map((item) => {
      const overlappingItems = initial.filter((candidate) => item.start < candidate.end && candidate.start < item.end);
      const columnCount = Math.max(...overlappingItems.map((candidate) => candidate.columnIndex + 1), 1);
      const width = 100 / columnCount;
      return {
        event: item.event,
        top: ((item.start - startHour * 60) / 60) * hourHeight,
        height: Math.max(((item.end - item.start) / 60) * hourHeight, 48),
        left: item.columnIndex * width,
        width,
      };
    }),
  };
}

function getTimelineStartHour(events: CalendarEvent[]) {
  if (!events.length) {
    return defaultDayStartHour;
  }

  const firstMinute = Math.min(...events.map((event) => getEventMinuteOfDay(event.startAt)));
  return Math.max(0, Math.floor(firstMinute / 60) - 1);
}

function getTimelineEndHour(events: CalendarEvent[], startHour: number) {
  if (!events.length) {
    return defaultDayEndHour;
  }

  const lastMinute = Math.max(...events.map((event) => getEventMinuteOfDay(event.endAt)));
  return Math.min(23, Math.max(startHour + 3, Math.ceil(lastMinute / 60)));
}

function findAvailableColumn(columns: Array<{ end: number }>, start: number) {
  const index = columns.findIndex((column) => column.end <= start);
  return index === -1 ? columns.length : index;
}

function getEventMinuteOfDay(value: string) {
  const time = value.split("T")[1] || "00:00";
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatEventTime(event: CalendarEvent) {
  return `${event.startAt.slice(11, 16)}-${event.endAt.slice(11, 16)}`;
}

function formatDayRange(events: CalendarEvent[]) {
  const sortedEvents = sortCalendarEvents(events);
  const firstEvent = sortedEvents[0];
  const lastEvent = sortedEvents.reduce((latest, event) => (event.endAt > latest.endAt ? event : latest), sortedEvents[0]);
  return `${firstEvent.startAt.slice(11, 16)}-${lastEvent.endAt.slice(11, 16)}`;
}

function pluralizeEvents(count: number) {
  const moduloTen = count % 10;
  const moduloHundred = count % 100;
  if (moduloTen === 1 && moduloHundred !== 11) return "событие";
  if (moduloTen >= 2 && moduloTen <= 4 && (moduloHundred < 12 || moduloHundred > 14)) return "события";
  return "событий";
}

function formatMonthTitle(date: Date) {
  const title = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(date);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" }).format(parseDateKey(dateKey));
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
