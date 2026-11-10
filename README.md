# poker-bin

Poker Binario: un gioco di poker contro la CPU per imparare il sistema binario
partendo da zero, senza dipendenze.
Apri `index.html` in un browser moderno: non serve un server.

Sono disponibili 5 Card Draw e Texas Hold'em. Si parte da 128 fiches e ogni mano ha un invito
di 2 fiches per giocatore; la CPU può bluffare e può lasciare davanti a un
rilancio in base alla mano e all'importo. Il pulsante del suono attiva effetti
e jingles generati con Web Audio. Cambiare modalità ricomincia la partita e
ripristina le fiches.

Il mazzo contiene 64 carte: i valori da `0000` a `1111` in quattro semi
(rosso, verde, blu e nero/microchip). Le mani seguono una scala familiare: scala reale,
poker, full, colore, serie di almeno tre valori consecutivi, tris, doppia
coppia, coppia e carta alta. I valori binari fanno da spareggio. Il poker è
possibile; il pokerissimo richiederebbe un quinto seme o una carta jolly.

## Didattica

Con la modalità didattica attiva (predefinita) il gioco mostra i pesi dei bit
sotto fiches e piatto, scompone ogni carta toccata o puntata (`0110 = 4 + 2 = 6`,
seme a 2 bit, carta a 6 bit) e propone una pillola binaria al posto dei tip di
poker. Il Laboratorio binario permette di accendere i bit e convertire tra
decimale e binario. Lo scopo è facilitare la conoscenza del binario; non servono
conoscenze preliminari.

## Licenza

**CC BY-NC-SA 4.0 · 2026 Fabrizio Ortis.**

Quest'opera è distribuita con licenza
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.it): puoi
condividere e modificare Poker Binario per fini non commerciali, con attribuzione.
Le opere derivate devono essere distribuite con la stessa licenza. L'uso didattico
non commerciale (classi, laboratori, corsi) è incoraggiato, con attribuzione.
