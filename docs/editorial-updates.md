# Aggiornamenti coerenti Bari

Verificare data dell'evento e data della fonte: SSC Bari e Lega Pro prima delle testate locali. Conservare una fonte pertinente per ogni fatto.

Ogni evento richiede il controllo delle aree interessate: Home, News, Partite/risultati, prossimo incontro, calendario, classifica, rosa/disponibilità, marcatori/assist e statistiche. Cambiare solo dati confermati. Classifica provvisoria se il turno è incompleto; non dedurre posizioni, diagnosi, assist o formazioni ufficiali.

Aggiornare anche data/fixtures.json con ID stabile, home, away, kickoff ISO con fuso e fonte. Preservare l'ID nei rinvii/cambi orario. Non inserire orari non verificati. È la fonte che il server usa per chiudere i pronostici.

Si possono formulare testi originali dai dati: risultato, marcatori confermati, punti verificati e prossimo incontro documentato. Ogni frase deve essere riconducibile alle fonti. Se manca un dato, ometterlo o indicare che è da confermare. Distinguere ufficialità, analisi, dichiarazioni e indiscrezioni.

Video: aggiornare solo #bari-videos tra TB_VIDEOS_START/END, massimo 6 schede pertinenti. News li ricava da video-news.js. Verificare titolo/canale/data/ID e preservare le classi del player.

member.js aggiunge interazioni: preservare .source-line e il link canonico. Non scrivere contatori/XP e non modificare file account o migrazioni durante aggiornamenti editoriali. Conservare Home come vista iniziale.

Prima del commit rileggere main per integrare modifiche concorrenti, controllare coerenza numerica e temporale; dopo il commit verificare HTML, titolo e contenuti online. Nessuna notifica senza novità.
