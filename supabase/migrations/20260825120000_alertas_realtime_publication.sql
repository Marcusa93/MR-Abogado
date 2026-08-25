-- Habilitar realtime para la tabla alertas.
-- Sin esto, useAlertasRealtime (postgres_changes) nunca dispara y las
-- notificaciones solo aparecen tras el refetchInterval de 60 segundos.
ALTER PUBLICATION supabase_realtime ADD TABLE alertas;
