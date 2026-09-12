# Account e interazioni TB

Applicare supabase/migrations/20260912_members.sql sul progetto Supabase già collegato, dopo lo schema esistente. Non cancella contenuti. Il backend richiede SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (oppure SUPABASE_SECRET_KEY) sul server Vercel: mai nel browser.

Google usa una sessione persistente e il ritorno nella stessa scheda alla radice del sito. Verificare che https://treninobari.vercel.app/ sia negli URL di ritorno autorizzati in Supabase e Google sia abilitato. Provare login, ritorno Home, profilo, reload e logout con account di prova autorizzato.

Senza migrazione il backend indica interazioni in attivazione: nessun contatore inventato e nessun XP locale presentato come punto account. Il gioco resta disponibile come allenamento.

## Regole

- Una reazione per account/notizia, modificabile o rimovibile.
- Letture: almeno due secondi visibili sul client, deduplica server per notizia/giorno UTC e identità pseudonima. Non sono persone uniche né una misura certificata contro bot. Nessun IP in chiaro nel database.
- Pronostico: 15 XP una volta per partita, modificabile prima del calcio d'inizio.
- Commento: 5 XP una volta per partita, almeno 12 caratteri; ricopiare da un'altra partita non assegna altri punti.
- Rigori: esito sul server, UUID idempotente, 3 secondi tra giocate, massimo 60 XP/giorno UTC. Non vengono accettati punti o risultati calcolati dal client.
- Inviti: 50 XP per nuovo account con email verificata entro 7 giorni dalla creazione. Un referente per nuovo iscritto, niente auto-inviti, massimo 10 premi nei 7 giorni precedenti. Non elimina ogni abuso multiaccount.
- Livello: 1 + parte intera XP/100. Classifica pubblica facoltativa.

Le nuove tabelle hanno RLS, senza accesso diretto anon/authenticated. RPC solo service_role; l'API verifica l'identità attraverso Auth e ignora user_id, punti ed esiti forniti dal client. La migrazione impedisce inoltre agli utenti di modificare il proprio ruolo.

## Editoriale

Leggere docs/editorial-updates.md. data/fixtures.json fornisce il calendario verificato per la chiusura dei pronostici. Le chiavi notizia derivano dal link fonte e quelle video dall'ID YouTube: un nuovo titolo non azzera reazioni.
