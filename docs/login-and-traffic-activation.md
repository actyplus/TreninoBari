# Accesso e statistiche: attivazione e prove

## Stato rilevato

Il controllo del servizio ha verificato Google ed email abilitati, conferma email richiesta e tabelle profiles/consents raggiungibili. L'endpoint Google risponde 302 verso accounts.google.com con callback https://ltqblvdijzobtuxmbvsy.supabase.co/auth/v1/callback. Questo non verifica il Client Secret né prova un login completato. /api/community restituisce 503 MIGRATION_REQUIRED: manca la RPC tb_member_action, oppure non è visibile nello schema cache. Non risolvere il problema cambiando solo il pulsante.

## Database (progetto ltqblvdijzobtuxmbvsy)

Eseguire nel SQL Editor Supabase, in ordine:

1. `supabase/migrations/20260912_members.sql` (lo schema base esiste già). Contiene anche la correzione del trigger che limita i nickname Google a 24 caratteri: il vecchio trigger può rifiutare una nuova registrazione con nome lungo.
2. `supabase/migrations/20260913_traffic.sql` (statistiche). RLS attiva, nessun accesso diretto anon/authenticated, RPC eseguibile soltanto dal server.

Le migrazioni sono transazionali e rieseguibili; non cancellano notizie, account o punti esistenti. Non utilizzare comandi di reset del database. Il pacchetto `supabase/activate-login-and-traffic.sql` contiene entrambe nell'ordine corretto, per eseguirle in un'unica operazione. Mantenere service_role esclusivamente sul server. Non creare endpoint pubblici per eseguire SQL o amministrare Auth.

Verificare poi GET /api/community e GET /api/traffic: HTTP 200 con dati reali. Il solo commit GitHub non applica SQL a Supabase.

## Google e prova reale

In Authentication > Providers > Google confrontare Client ID e secret con lo stesso client OAuth Web application in Google Cloud. Negli Auth logs cercare il tentativo fallito e il dettaglio di invalid_client, redirect_uri_mismatch, invalid_grant o errore database. Non ruotare segreti senza diagnosi e non disattivare la validazione nonce. Callback Google: https://ltqblvdijzobtuxmbvsy.supabase.co/auth/v1/callback. Site URL/redirect Supabase: https://treninobari.vercel.app/.

Provare in un browser normale: Google senza flag email, completare la scelta account, ritorno Home con Profilo e form nascosto, ricaricare, chiudere/riaprire nello stesso browser, infine uscire. Ripetere da smartphone. Usare un account di prova autorizzato; non dedurre successo da un redirect o da un test simulato. Verificare anche registrazione email con conferma e successivo accesso.

Le correzioni frontend rimuovono le attese bloccanti dopo signup, controllano gli errori di logout, accettano la password esistente in login senza imporre il requisito delle nuove registrazioni, mantengono i consensi Google/email separati e rendono riconoscibili gli errori database.

## Definizioni contatori

- Raccolta solo con consenso separato nei pannelli Home/Community; il precedente consenso generico non abilita le nuove statistiche.
- Visite misurate: sessioni di browser; nuova visita dopo 30 minuti senza segnali. Identificativo casuale locale temporaneo, condiviso tra schede dello stesso browser.
- Pagine aperte: un caricamento di documento per visita; heartbeat e retry non incrementano. Cambiare scheda interna Home/News non è un nuovo caricamento.
- Connessi: segnali da pagine visibili negli ultimi 120 secondi; aggiornamento ogni minuto. Membri distinti per identità verificata da Supabase, ospiti distinti per browser. Non è un censimento esatto delle persone; browser diversi, blocchi, rifiuti, connessione e bot influenzano la misura.
- Nessun recupero retroattivo delle visite precedenti all'attivazione. Data iniziale esposta dal primo evento registrato. I totali sono aggregati nel database, non nel localStorage del gestore.
- Nessun IP/email in chiaro nelle tabelle statistiche. HMAC lato server per sessione/account; codici di rete giornalieri usati solo per il limite di richieste. Le righe temporanee scadute da 35 minuti vengono rimosse alla successiva raccolta; i totali aggregati rimangono.
- Rifiuto o revoca non cambiano login, contenuti o diritti di partecipazione. Alla revoca la presenza viene disattivata; una richiesta in ritardo non la riattiva. Le tabelle temporanee non sono consultabili dai visitatori, sono esposti solo aggregati.
- Limitazione condivisa nel database a 120 eventi/minuto per rete. Mitiga richieste ripetute, non elimina bot o abuso distribuito. Nessun servizio a pagamento è attivato. Monitorare le quote gratuite Vercel/Supabase al crescere del traffico.

## Test riproducibili

Con Node, jsdom e @electric-sql/pglite disponibili:

```
node tests/auth.cjs
node tests/member-db.cjs
node --test tests/traffic-api.cjs
node tests/traffic-db.cjs
node tests/traffic-ui.cjs
```

I test di unità e SQL usano mock/PGlite, non sono prove del database di produzione o di un accesso reale Google. In assenza di servizio, la UI mostra “—” e un avviso, mai numeri inventati.
