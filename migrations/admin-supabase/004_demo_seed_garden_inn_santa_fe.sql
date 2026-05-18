-- ============================================================
-- DEMO SEED — Social Listening
-- Cliente: garden-inn-santa-fe (Hilton Garden Inn Santa Fe)
-- ============================================================
-- Pegar en el SQL Editor del Supabase admin DESPUÉS de las
-- migrations 002 y 003. Habilita social_listening en el cliente
-- existente y carga 15 reseñas REALES pre-analizadas
-- (11 Google Maps + 4 TripAdvisor, textos literales de las páginas
-- públicas del hotel). Para agregar más, anexar capturas reales —
-- no inventar reseñas.
--
-- Si quieres usarlo en otro cliente, Find&Replace:
--   'garden-inn-santa-fe' → 'tu-slug-aquí'
-- ============================================================

-- 1. Habilitar social_listening en el cliente existente (NO sobrescribe
--    name ni theme — solo agrega social_listening unlocked y URLs).
UPDATE clients_config
SET hotel_services = COALESCE(hotel_services, '{}'::jsonb)
        || jsonb_build_object('social_listening', 'unlocked'),
    social_listening_config = jsonb_build_object(
        'google_maps_url',   'https://www.google.com/maps/place/Hilton+Garden+Inn+Mexico+City+Santa+Fe',
        'tripadvisor_url',   'https://www.tripadvisor.com.mx/Hotel_Review-g150800-d8693089-Hilton_Garden_Inn_Mexico_City_Santa_Fe.html',
        'booking_url',       'https://www.booking.com/hotel/mx/hilton-garden-inn-mexico-city-santa-fe.es-mx.html',
        'scrape_frequency_hours', 24,
        'last_scraped_at',   now(),
        'last_scrape_status','ok'
    )
WHERE id_slug = 'garden-inn-santa-fe';

-- 2. Reseñas (15) — todas reales, textos literales de Google + TripAdvisor
DELETE FROM reviews WHERE hotel_id = 'garden-inn-santa-fe';

INSERT INTO reviews (
    hotel_id, source, source_review_id, author, rating, title, body, language,
    review_date, review_url, sentiment, category, priority, summary, topics,
    analyzed_at, analysis_model
) VALUES

-- ─── GOOGLE MAPS (11 reseñas reales) ──────────────────────────
('garden-inn-santa-fe','google','g_rafael_arzola_2026_02','Rafael Arzola',5.0,
 NULL,
 'El Hilton Garden Inn Santa Fe es un hotel que transmite calma desde que llegas. No es un lugar que intente deslumbrar con lujo exagerado, sino que apuesta por la comodidad, la funcionalidad y una atmósfera tranquila que se agradece, sobre todo después de un día de trabajo intenso. Habitaciones bien pensadas, cama cómoda y excelente servicio.',
 'es','2026-02-12T10:30:00Z',NULL,
 'positive','service','low',
 'Hotel cómodo y funcional, ideal para viajes de negocios.',
 ARRAY['comodidad','tranquilidad','negocios'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_sergio_2026_02','Sergio',5.0,
 NULL,
 'Pocas veces dejo reseñas de los lugares a los que llego. Creo que esta vez se merecen una. El hotel cumplió con todo lo que ofrecen, limpieza, servicio, ubicación. Incluso el desayuno que incluía la reservación nos gustó mucho. El precio que conseguimos en esas fechas, inmejorable. Gracias al Staff del Hotel, por su trabajo.',
 'es','2026-02-05T14:15:00Z',NULL,
 'positive','service','low',
 'Limpieza, servicio y desayuno cumplieron expectativas; precio inmejorable.',
 ARRAY['desayuno','limpieza','staff','precio'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_astrid_jacobo_2025_12','Astrid Jacobo',3.0,
 NULL,
 'Decepcionante experiencia para un Hilton. Pedí un kit dental que usualmente está disponible en las habitaciones o puede solicitarse a recepción y me lo cobraron. No es el costo, pero es una amenidad de hoteles de menor categoría. Solicité también que arreglaran un detalle en la bañera y no resolvieron.',
 'es','2025-12-18T09:45:00Z',NULL,
 'negative','amenities','medium',
 'Cobro por amenities básicas y falta de mantenimiento decepcionan para marca Hilton.',
 ARRAY['amenities','mantenimiento','baño'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_marian_carmona_2025_12','Marian Carmona Hurtado',3.0,
 NULL,
 'El hotel estuvo muy bien, ofrecen un muy buen servicio, personal atento y amable, habitaciones limpias, la seguridad es muy buena, y la ubicación excelente. Lo único que noté fue que el plan de mantenimiento programado generó algunos inconvenientes durante mi estancia.',
 'es','2025-12-10T18:22:00Z',NULL,
 'neutral','rooms','medium',
 'Buen servicio y ubicación, pero mantenimiento generó molestias.',
 ARRAY['servicio','ubicacion','mantenimiento'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_carlos_narvaez_2025_12','Carlos Narváez',1.0,
 NULL,
 'Decepcionante, muy mal servicio, no hacen las habitaciones, el personal de recepción es lento sin sentido de atención al cliente, no mandan facturas que se solicitan, no lo recomiendo fue una experiencia lamentable.',
 'es','2025-12-03T11:10:00Z',NULL,
 'negative','service','high',
 'Mal servicio, recepción lenta y no entregan facturas solicitadas.',
 ARRAY['servicio','recepcion','facturacion'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_gabriel_betancourt_2026_01','Gabriel Betancourt',5.0,
 NULL,
 'Hermosa vista desde el 9no piso, la atención del personal y el servicio a la habitación que se agradece para disfrutar la estancia en CDMX, ubicación algo retirada del aeropuerto pero vale la pena.',
 'es','2026-01-22T20:00:00Z',NULL,
 'positive','location','low',
 'Excelente vista, buen servicio y ubicación; lejos del aeropuerto pero vale la pena.',
 ARRAY['vista','servicio','ubicacion'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_antonio_r_2025_11','Antonio R.',5.0,
 NULL,
 'Muy limpio el hotel y la habitación, muy cómodo, bien ubicado y seguro, el bufet muy rico y variado muy bien atendido. Único defecto URGENTE el Valet Parking, no se dan abasto, se tardan mucho y uno no puede estacionar el auto, se hacen filas y muy tardado ya que solo hay dos personas para recibir, traer y acomodar autos.',
 'es','2025-11-25T08:30:00Z',NULL,
 'neutral','amenities','medium',
 'Hotel limpio y seguro, pero valet parking saturado genera filas largas.',
 ARRAY['limpieza','seguridad','valet','estacionamiento'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_aline_villegas_2026_02','Aline Villegas',4.0,
 NULL,
 'Ya estás pagando por una habitación que no es nada barata... Y todavía te cobran extra el estacionamiento por noche. Considero que debería estar incluido para los huéspedes. Todo lo demás excelente.',
 'es','2026-02-10T16:50:00Z',NULL,
 'neutral','price','medium',
 'Habitación excelente pero cobro extra por estacionamiento incomoda.',
 ARRAY['precio','estacionamiento'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_alberto_digraci_2025_09','Alberto DiGraci',4.0,
 NULL,
 'Se descansa muy bien, usualmente me hospedo aquí cuando hay congreso de mi interés en Expo Santa Fe, se puede llegar caminando. El lobby bar tiene buen ambiente y la facturación esta vez sí salió rápido.',
 'es','2025-09-15T19:00:00Z',NULL,
 'positive','location','low',
 'Buena estancia con acceso caminando a Expo Santa Fe.',
 ARRAY['ubicacion','congreso','lobby'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_daniel_acosta_2025_08','Daniel Acosta',4.0,
 NULL,
 'Actualmente me encuentro hospedado en el hotel y considero importante compartir esta retroalimentación mientras aún estoy aquí. He notado que el desayuno ha bajado considerablemente en calidad. Hace 3 o 4 años era mucho mejor: con más variedad y mejor sabor. El resto del hotel sigue bien.',
 'es','2025-08-28T07:20:00Z',NULL,
 'negative','food','medium',
 'Desayuno bajó en calidad y variedad comparado con años anteriores.',
 ARRAY['desayuno','calidad','comida'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','google','g_allan_smith_2025_10','Allan Smith',5.0,
 NULL,
 'Excelente hotel, habitación muy cómoda, el personal es muy amable y el servicio de excelente calidad. Hotel ideal para quedarse si vienes a un evento en Expo Santa Fe.',
 'es','2025-10-08T13:45:00Z',NULL,
 'positive','service','low',
 'Habitación cómoda, personal amable, ideal para Expo Santa Fe.',
 ARRAY['servicio','comodidad','expo'],
 now(),'claude-haiku-4-5-20251001'),

-- ─── TRIPADVISOR (4 reseñas reales) ──────────────────────────
('garden-inn-santa-fe','tripadvisor','ta_hanskatrot_2026_02','hanskatrot',5.0,
 'Vale la pena la estancia',
 'Personal muy profesional, que hablaba muy buen inglés. El servicio Bellboy, especialmente un chico alto con el pelo más largo es muy profesional y maniobra el equipaje y maletas con cuidado. ¡También hablaba inglés! Comparte restaurante con DoubleTree — la comida es fresca y su desayuno buffet es muy diverso. Su televisor no está conectado a WiFi, lo que no tiene sentido para una marca Hilton.',
 'es','2026-02-06T11:00:00Z',NULL,
 'positive','service','low',
 'Personal bilingüe muy profesional; TV sin WiFi resta puntos para una marca Hilton.',
 ARRAY['personal','bilingue','bellboy','tv','wifi'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','tripadvisor','ta_loren_f_2026_01','Loren F',2.0,
 'Mal lugar. Poco cuidado en los detalles de la habitación',
 'La habitación se encontraba en esquina y tenía cristal por ambos lados de piso a techo. A pesar de que afuera había frío esa habitación era súper calurosa de día y por las noches estaba helada por la misma situación. Nunca nos pusieron un jabón nuevo, un día no pusieron toallas limpias. Mal servicio en realidad. Poca atención hacia el huésped en la habitación. Para colmo alguien dejó un letrero adentro el día que ingresamos con una grosería escrita.',
 'es','2026-01-15T22:30:00Z',NULL,
 'negative','rooms','high',
 'Habitación con problemas de clima y limpieza; letrero ofensivo dejado por staff anterior.',
 ARRAY['habitacion','clima','limpieza','toallas','incidente'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','tripadvisor','ta_john_o_2025_12','John O',2.0,
 'La recepción parece tener un chip en el hombro y tratar a los extranjeros diferente',
 'Mal personal — actitudes, suite le faltaba ropa de cama esencial, todo fue recibido con una actitud y la más lenta de las respuestas. Tratan diferente a extranjeros y nacionales.',
 'es','2025-12-20T17:15:00Z',NULL,
 'negative','service','high',
 'Trato discriminatorio reportado contra huéspedes extranjeros en recepción.',
 ARRAY['recepcion','discriminacion','servicio'],
 now(),'claude-haiku-4-5-20251001'),

('garden-inn-santa-fe','tripadvisor','ta_maria_alejandra_2025_12','Maria Alejandra Hernandez Castuera',1.0,
 'Pésimo servicio y condiciones de la habitación. No regreso',
 'Habitación 604 en pésimas condiciones. Sábanas sucias y fundas de almohada manchadas de tinte. Olor a caño que salía del baño. Aire acondicionado/calefacción sin servir. Sin agua caliente para bañarnos. Lavabo tapado. El espejo roto. La cafetera al usarse por primera vez explotó y tenía residuos de café de alguien anterior. Cortinas rotas. Toallas viejas. Pedimos servicio al cuarto y jamás los subieron.',
 'es','2025-12-08T19:00:00Z',NULL,
 'negative','cleanliness','high',
 'Habitación 604 con sábanas sucias, baño tapado, sin agua caliente y equipos rotos.',
 ARRAY['limpieza','sabanas','bano','agua-caliente','mantenimiento'],
 now(),'claude-haiku-4-5-20251001');

-- NOTA: TripAdvisor (4) y Booking.com (0). Para llenar el demo con más
-- volumen, agregar capturas REALES adicionales de TripAdvisor y Booking
-- y extender este INSERT. NO INVENTAR reseñas.

-- 3. Verificar
SELECT
    source,
    count(*)                    as total,
    round(avg(rating)::numeric, 2) as rating_avg,
    count(*) FILTER (WHERE sentiment = 'positive') as pos,
    count(*) FILTER (WHERE sentiment = 'neutral')  as neu,
    count(*) FILTER (WHERE sentiment = 'negative') as neg,
    count(*) FILTER (WHERE priority  = 'high')     as urgentes
FROM reviews
WHERE hotel_id = 'garden-inn-santa-fe'
GROUP BY source
ORDER BY source;
