-- Agrega configuración para el módulo de Social Listening (reputación online).
-- Cada hotel puede tener URLs de Google Maps, TripAdvisor y Booking.com.
-- El servicio se controla con hotel_services.social_listening (locked / unlocked / hidden),
-- siguiendo el mismo patrón que eventos / reservas / daypass / restaurante.

ALTER TABLE clients_config
  ADD COLUMN IF NOT EXISTS social_listening_config JSONB DEFAULT '{}';

-- Esquema esperado de social_listening_config:
-- {
--   "google_maps_url": "https://maps.google.com/?cid=...",
--   "tripadvisor_url": "https://www.tripadvisor.com.mx/Hotel_Review-...",
--   "booking_url":     "https://www.booking.com/hotel/mx/...",
--   "scrape_frequency_hours": 24,
--   "last_scraped_at": "2026-05-14T12:00:00Z",
--   "last_scrape_status": "ok" | "error",
--   "last_scrape_error":  "..."
-- }

NOTIFY pgrst, 'reload schema';
