# Accesso Google TB

Il sito usa il client Supabase nel browser, con sessione persistente e rinnovo automatico. Non cambiare il nome della chiave di sessione durante gli aggiornamenti. Google usa lo stesso tab e redirectTo all'origine corrente + `/`, senza codici o errori di tentativi precedenti. Il ritorno si riconosce dai parametri OAuth o da `tb-oauth-started-at` (validità 15 minuti). Dopo il ripristino si apre Home con il profilo autenticato; profilo, consensi e feed sono richieste secondarie e non bloccano questo passaggio.

Gli errori di callback in query o frammento sono acquisiti prima dell'inizializzazione SDK, mostrati sopra il pulsante Google e rimossi dall'URL. Non registrare token, codici OAuth o segreti nei log o nelle notifiche. Non mostrare un account come autenticato in assenza di sessione Supabase.

## Se compare TB-GOOGLE-EXCHANGE

Il messaggio `Unable to exchange external code` proviene dallo scambio del codice Google effettuato da Supabase, prima che il sito riceva una sessione. Non è un problema del checkbox email. Il solo frontend non può correggere una configurazione OAuth errata.

Nel progetto Supabase `ltqblvdijzobtuxmbvsy`, controllare Authentication > Sign In / Providers > Google e i log Auth all'ora del tentativo. Confrontare Client ID e Client Secret con lo stesso client Web application di Google Cloud; verificare che il secret sia attivo. Non copiare mai segreti in chat, nel repository o nelle variabili pubbliche Vercel. Conservare nonce e validazione del codice.

Callback Google autorizzato: `https://ltqblvdijzobtuxmbvsy.supabase.co/auth/v1/callback`. Site URL e redirect di produzione Supabase: `https://treninobari.vercel.app/`. Verificare il dettaglio nei log prima di modificare credenziali: anche codici scaduti/riutilizzati e problemi transitori possono interrompere lo scambio. Non aggirare la validazione.

Documentazione ufficiale: https://supabase.com/docs/guides/auth/social-login/auth-google

## Verifica

Eseguire `node tests/auth.cjs` con jsdom disponibile. I test verificano sessione iniziale, eventi di login/logout, errori SDK e callback, ritorno Home, profilo lento e consenso email separato. Sono simulazioni, non provano l'autenticazione reale Google.

La verifica finale richiede un accesso reale: scegliere Google, completare l'autorizzazione, vedere Profilo e la registrazione nascosta; ricaricare e verificare che l'utente resti connesso. Verificare anche l'uscita. Usare una finestra normale sullo stesso dominio; la sessione non si trasferisce tra browser, modalità anonima e domini diversi.
