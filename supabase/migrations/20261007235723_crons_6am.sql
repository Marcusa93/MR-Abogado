-- sae-daily-reminders y caja-analisis-ia: de 08:00 a 06:00 AR (09:00 UTC).

SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'sae-daily-reminders'), schedule := '0 9 * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'caja-analisis-ia'), schedule := '0 9 * * *');
