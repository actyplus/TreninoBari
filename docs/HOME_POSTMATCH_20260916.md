# Home e post-partita — 16 settembre 2026

## Correzioni

- Eliminati i cambi pagina verso Community da showAuthError e dall'evento pageshow del modulo account. Gli errori restano nel pannello account; la Home iniziale di index.html non viene più sostituita da un errore asincrono di Supabase. Restano invariati ripristino sessione, login e navigazione volontaria.
- I tre video Bari–Potenza erano già nell'HTML, ma il blocco Home era collocato sotto notizie del 12 settembre. video-news.js ora colloca il carosello in base alla pubblicazione più recente, conserva tutti i video e sincronizza le copie News senza duplicati.
- A parità di data di pubblicazione, highlights prima delle interviste. Aggiunti comandi Azioni salienti e Post-partita e link discreti alle fonti. Caricamento YouTube solo su richiesta, un player alla volta e pausa della radio durante il video.

## Video ricontrollati

- uRw1Mi68mJA — Bari–Potenza 0-0, highlights, canale Lega Pro / Serie C: https://www.youtube.com/watch?v=uRw1Mi68mJA
- EQGd8DMZVDg — Rastelli: https://www.sscalciobari.it/it/news/7369-barpot-rastelli-mi-tengo-stretto-il-pari-importante-muovere-la-classifica/
- SRd1ECQU4Ag — Elia: https://www.sscalciobari.it/it/news/7370-barpot-elia-quando-non-riesci-a-vincere-e-importante-non-perdere/

## Verifiche eseguite

- node --check su entrambi gli script.
- node tests/home-entry.test.cjs: sei scenari con API simulata, compresi configurazione assente, vecchio frammento Community, errore OAuth, accesso pendente, visitatore e ritorno autenticato.
- Chromium headless, fixture DOM isolata, 1280x850 e 390x844: Home con errore account, pageshow, navigazione esplicita, sei video in Home e News, ordinamento, nessun iframe prima del clic, cambio e chiusura player, nessun errore JavaScript.

Limiti: test DOM con API simulata, non un accesso Google reale né una prova di riproduzione end-to-end dei video sul dominio pubblico. La patch sistema navigazione e presentazione dell'archivio pubblicato: non introduce scoperta automatica di nuovi video esterni.
