-- Resumen diario de tareas por Telegram: de 08:00 a 06:00 AR (09:00 UTC), lun-vie.

SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'tareas-telegram-diario'), schedule := '0 9 * * 1-5');
