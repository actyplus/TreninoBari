# Protezioni TB: stato e limiti

Intervento del 12 settembre 2026. Non e una certificazione di sicurezza completa.

- `.vercelignore` esclude schema/migrazioni, documentazione interna, test,
  sorgenti di debug, backup e file di ambiente dalla pubblicazione web.
  Non esclude `data/fixtures.json` o le dipendenze delle funzioni API.
- CSP vieta oggetti/plugin e richiede HTTPS. Restano abilitate le integrazioni
  esistenti Supabase, Google via redirect/popup, YouTube e radiocronaca.
  Gli script inline sono ancora consentiti per compatibilita con index.html:
  estrarli e adottare hash/nonce richiede un intervento separato con test UI.
- L'endpoint di configurazione accetta solo chiavi publishable o JWT anon;
  rifiuta chiavi privilegiate anche se inserite per errore in variabili pubbliche.
  Non autentica utenti tramite decodifica JWT; l'identita rimane verificata
  da Supabase Auth nelle API che gestiscono azioni personali.
- XP, idempotenza dei premi e scadenze pronostici hanno gia controlli nel
  server/database. Non confondere il punteggio del gioco locale con XP online.

Da completare nella gestione account (non applicato da questi file):

1. Rendere privato GitHub, verificando accesso dell'integrazione Vercel e degli
   aggiornamenti editoriali. Le copie/fork gia esistenti non vengono ritirate.
2. Verificare 2FA, collaboratori e autorizzazioni GitHub/Vercel/Supabase.
3. Verificare in produzione RLS/grant e migrazioni, backup e ripristino,
   protezioni anti-bot/rate limit distribuiti e configurazione OAuth.
4. Scansione segreti dell'intera cronologia e rotazione SOLO di chiavi
   effettivamente compromesse, con aggiornamento coordinato dei servizi.
5. Valutare vecchi URL di deploy: le nuove esclusioni non ritirano file gia
   pubblicati su snapshot precedenti. Rimuoverli/proteggerli dal dashboard
   dopo aver verificato la produzione attiva.

Nessuna password davanti al sito pubblico. Non bloccare copia/incolla o il
tasto destro: non costituiscono una difesa. Frontend e contenuti pubblicati
restano accessibili ai browser. Le riserve sui diritti non includono idee,
fatti o materiali di terzi; non sostituiscono una verifica legale.

Dominio: aggiungere un dominio solo dopo acquisto/autorizzazione del titolare.
Prima di renderlo principale aggiornare URL consentiti Supabase/Google,
condivisioni e URL canonici, poi verificare login, HTTPS e redirect.
