# Aggiornamenti coerenti Bari

Verificare data dell'evento e data della fonte: SSC Bari e Lega Pro prima delle testate locali. Conservare una fonte pertinente per ogni fatto.

Ogni evento richiede il controllo delle aree interessate: Home, News, Partite/risultati, prossimo incontro, calendario, classifica, rosa/disponibilità, marcatori/assist e statistiche. Cambiare solo dati confermati. Classifica provvisoria se il turno è incompleto; non dedurre posizioni, diagnosi, assist o formazioni ufficiali.

Aggiornare anche data/fixtures.json con ID stabile, home, away, kickoff ISO con fuso e fonte. Preservare l'ID nei rinvii/cambi orario. Non inserire orari non verificati. È la fonte che il server usa per chiudere i pronostici.

Si possono formulare testi originali dai dati: risultato, marcatori confermati, punti verificati e prossimo incontro documentato. Ogni frase deve essere riconducibile alle fonti. Se manca un dato, ometterlo o indicare che è da confermare. Distinguere ufficialità, analisi, dichiarazioni e indiscrezioni.

Video: aggiornare solo #bari-videos tra TB_VIDEOS_START/END, massimo 6 schede pertinenti. News li ricava da video-news.js. Verificare titolo/canale/data/ID e preservare le classi del player.

member.js aggiunge interazioni: preservare .source-line e il link canonico. Non scrivere contatori/XP e non modificare file account o migrazioni durante aggiornamenti editoriali. Conservare Home come vista iniziale.

Prima del commit rileggere main per integrare modifiche concorrenti, controllare coerenza numerica e temporale; dopo il commit verificare HTML, titolo e contenuti online. Nessuna notifica senza novità.

## Classifica e statistiche: controllo delle tabelle

A giornata in corso aggiornare le righe reali della classifica con tutti i risultati già conclusi e i dati della Lega Pro, indicando «provvisoria» e data/ora di verifica. Non lasciare una vecchia tabella sotto un riepilogo aggiornato. Riportare l'ordine ufficiale soltanto se verificato; altrimenti non attribuire una posizione. Non aspettare la fine del turno per aggiornare PG, GF, GS e punti confermati.

Dopo ogni gara di campionato ricalcolare presenze e gol della rosa da tutte le distinte di campionato: una presenza per titolare o subentrato, nessuna per la sola panchina. Escludere la Coppa Italia e distinguere i giocatori ceduti. Includere i nuovi arrivi anche nelle righe statistiche, oltre al riepilogo dei trasferimenti. Se un numero di maglia non è verificato, usare «—».

Confrontare Home, classifica, Marcatori Bari e Rosa: partite, punti e gol devono concordare. La somma dei gol individuali, più eventuali autoreti avversarie verificate, deve coincidere con i gol fatti della squadra. Verificare che i dati siano nelle tabelle visibili, non soltanto nei titoli o nelle note. Conservare i link ai tabellini utilizzati. Il 12 settembre 2026 le prime quattro gare sono Bari-Cavese, Barletta-Bari, Bari-Casarano e Altamura-Bari.

## Vista Partite interattiva

assets/matches.js costruisce la vista interattiva dai dati editoriali esistenti in index.html; nessun risultato viene dedotto dall'orario. Conservare le celle .mday.has-fixture con data-date ISO, title «Casa - Trasferta · Competizione · HH:MM / da definire», data-source HTTPS e data-round. Conservare le .match-row dei risultati con data-date, data-source, .match-main b e .result. Aggiornare questi elementi insieme dopo ogni finale o modifica del calendario; non modificare il DOM #tb-match-center generato. Le vecchie schede restano disponibili senza JavaScript. Mese e giorno correnti sono calcolati in Europe/Rome, anche fuori stagione.

## Video nelle partite giocate

Alle schede video canoniche in #bari-videos aggiungere data-match-date="YYYY-MM-DD" con la data verificata della partita raccontata (non la data di pubblicazione del video). Omettere l'attributo per video senza una partita precisa. assets/matches.js mostra automaticamente i video associati nei dettagli delle gare con risultato verificato, con indicatore 🎬 in calendario e in elenco. Non duplicare schede manualmente nel calendario o nelle News. Il player condiviso gestisce anche le schede generate e si chiude cambiando partita o sezione. Quando una scheda viene rimossa dall'archivio Home, non sarà più proposta neppure nei dettagli della partita.

## Copertura prepartita e dirette lecite

Nelle 48 ore precedenti ogni gara verificare anche dove sarà trasmessa, dando priorità a Lega Serie C, SSC Bari, Rai/RaiPlay e ai canali ufficiali delle emittenti. Aggiornare l'oggetto opzionale `coverage` della partita in `data/fixtures.json` con `access`, `provider`, `source`, `sourceName`, `confirmedAt` e, solo se pertinenti, `watchUrl` o `embedUrl`.

Valori ammessi per `access`: `free-embed` per un player ufficiale che consente espressamente l'incorporamento, `free-link` per una diretta gratuita apribile soltanto sul sito originale, `paid` per servizi in abbonamento, `none` quando è confermata l'assenza di video e `checking` se la programmazione non è ancora verificata. Non presentare come gratuita una gara soltanto perché una pagina o un flusso è raggiungibile.

La citazione della fonte assicura trasparenza ma non sostituisce l'autorizzazione. Non estrarre o ripubblicare flussi, playlist M3U8, token, contenuti protetti o player modificati; non nascondere loghi, controlli, pubblicità o attribuzioni dell'emittente. Il sito incorpora esclusivamente URL HTTPS dei player YouTube ufficiali ammessi dal codice; per RaiPlay o altre piattaforme non incorporabili usa il collegamento alla pagina originale.

La scheda `#matchCoverage` compare soltanto da 48 ore prima fino a 4 ore dopo il calcio d'inizio. Prima della gara promuove l'appuntamento e la condivisione; durante la partita offre il player ufficiale se autorizzato, altrimenti radiocronaca di Salomone, cronaca descrittiva e accesso alla community. Dopo la finestra live scompare: cronaca e video post partita rientrano nel normale asse temporale editoriale.

La stessa copertura deve comparire anche in News tramite `#newsMatchCoverage`, generata dagli stessi dati della Home e collocata in testa al feed soltanto durante la finestra attiva. Deve partecipare ai filtri «Tutto», «Squadra» e «Partita live», mantenere `.source-line`, condivisione e accesso alla copertura completa. Non duplicare il player video nella scheda News: il pulsante apre la copertura Home, così resta un solo player autorizzato e un’unica fonte dei dati.
