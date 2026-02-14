import { useState, useEffect, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, type Event, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './calendar.css';

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    getDay,
    locales,
});

interface CalendarEntry {
    showTitle: string;
    showPoster: string | null;
    tmdbId: number;
    episodeName: string;
    airDate: string;
    season: number;
    episode: number;
}

interface CalEvent extends Event {
    showPoster: string | null;
    tmdbId: number;
    episodeName: string;
    season: number;
    episode: number;
}

function EventComponent({ event }: { event: CalEvent }) {
    return (
        <div className="cal-event" title={`${event.title} — S${event.season}E${event.episode}: ${event.episodeName}`}>
            {event.showPoster ? (
                <img src={event.showPoster} alt={String(event.title)} className="cal-event-poster" loading="lazy" />
            ) : (
                <div className="cal-event-placeholder">{String(event.title).charAt(0)}</div>
            )}
            <span className="cal-event-label">{event.title}</span>
        </div>
    );
}

export default function CalendarTab() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [entries, setEntries] = useState<CalendarEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchCalendar = useCallback(async (date: Date) => {
        setLoading(true);
        try {
            const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const res = await fetch(`/api/calendar?month=${monthStr}`);
            if (res.ok) {
                const data = await res.json();
                setEntries(data);
            }
        } catch (err) {
            console.error('Calendar fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCalendar(currentDate);
    }, [currentDate, fetchCalendar]);

    // Map entries to react-big-calendar events
    const events: CalEvent[] = entries.map(entry => {
        const d = new Date(entry.airDate + 'T00:00:00');
        return {
            title: entry.showTitle,
            start: d,
            end: d,
            allDay: true,
            showPoster: entry.showPoster,
            tmdbId: entry.tmdbId,
            episodeName: entry.episodeName,
            season: entry.season,
            episode: entry.episode,
        };
    });

    const handleNavigate = (date: Date) => {
        setCurrentDate(date);
    };

    return (
        <div className="calendar-container">
            {loading && <div className="cal-loading"><div className="spinner" /></div>}
            <Calendar<CalEvent>
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                defaultView="month"
                views={['month'] as View[]}
                onNavigate={handleNavigate}
                date={currentDate}
                style={{ height: 700 }}
                components={{
                    event: EventComponent as any,
                }}
                popup
                eventPropGetter={() => ({
                    style: {
                        backgroundColor: 'transparent',
                        border: 'none',
                        padding: 0,
                    },
                })}
            />
            {!loading && entries.length === 0 && (
                <div className="cal-empty">
                    No upcoming episodes this month. Add shows with status "Watching" to see their airing schedule here.
                </div>
            )}
        </div>
    );
}
