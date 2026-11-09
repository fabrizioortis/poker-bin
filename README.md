# poker-bin

Un MVP di poker binario per un giocatore contro la CPU, senza dipendenze.
Apri `index.html` in un browser moderno: non serve un server.

Sono disponibili 5 Card Draw e Texas Hold'em. Ogni mano parte con un invito
fino a 5 fiches per giocatore; la CPU può bluffare e può lasciare davanti a un
rilancio in base alla mano e all'importo. Il pulsante del suono attiva effetti
e jingles generati con Web Audio. Cambiare modalità ricomincia la partita e
ripristina le fiches.

Il mazzo contiene 64 carte: i valori da `0000` a `1111` in quattro semi
(rosso, verde, blu e oro). Le mani seguono una scala familiare: scala reale,
poker, full, colore, serie di almeno tre valori consecutivi, tris, doppia
coppia, coppia e carta alta. I valori binari fanno da spareggio. Il poker è
possibile; il pokerissimo richiederebbe un quinto seme o una carta jolly.

## Licenza

[Poker Binario © 2025 Fabrizio Ortis](https://fabrizioortis.com) è rilasciato con licenza
[Creative Commons Attribuzione - Non commerciale - Non opere derivate 4.0 Internazionale](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.it).
La licenza consente la condivisione non commerciale con attribuzione e senza
modifiche. La licenza non copre marchi, nomi o contenuti di terzi eventualmente
presenti.
