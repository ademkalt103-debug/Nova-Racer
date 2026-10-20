NOVA RACER — STREET LEGENDS
===========================

SOLO-SPIEL STARTEN
1. Installiere Node.js LTS (falls noch nicht installiert).
2. Öffne ein Terminal in diesem Ordner und führe aus:
      npm start
3. Öffne http://localhost:3000 in Chrome, Edge oder Firefox.
4. Auto und Strecke wählen → RENNEN STARTEN.
Der WebSocket-Server nutzt nur Node.js-Bordmittel; `npm install` ist nicht nötig.

STEUERUNG
W / Pfeil hoch = Gas
S / Pfeil runter = Bremse / Rückwärts
A/D oder Pfeiltasten = Lenken
SHIFT = Nitro (bei gedrücktem Gas)
SPACE = Drift, lädt Nitro
E = Banane hinter dem Auto ablegen
F = Hupe
R = auf die Strecke zurücksetzen
P oder ESC = Pause

ECHTES ONLINE-RENNEN MIT BEITRITTSCODE
- Der Host startet den Server im Projektordner mit `npm start` und teilt die erreichbare URL.
- Im selben WLAN öffnen Freunde die LAN-Adresse des Host-PCs, z. B. `http://192.168.1.25:3000` (die echte IP findest du unter Windows mit `ipconfig`). Eventuell muss die Firewall Port 3000 erlauben.
- Für Freunde außerhalb des WLANs muss dieselbe Node-App auf einem öffentlichen Webservice laufen; dann teilen alle dessen HTTPS-Adresse.
- Host klickt „RAUM ERSTELLEN“, sendet den Code an bis zu 7 Freunde.
- Freunde geben den Code ein und klicken „BEITRETEN“.
- Der Host startet das Online-Rennen.

WICHTIG: `localhost` funktioniert nur auf dem eigenen Computer. Für Freunde außerhalb des WLANs muss der Ordner auf einem Node.js-fähigen Hosting-Dienst laufen und über HTTPS/WSS erreichbar sein. Ein normaler statischer Webseiten-Host reicht nicht, weil er den WebSocket-Server nicht ausführt. Der private WebSocket-Relay ist für Freundesrennen gedacht, nicht für manipulationssichere Turniere.

TECHNISCHER HINWEIS
Das Spiel ist ein selbstständiger Canvas-Arcade-Racer mit handgezeichneten Fahrzeug-Silhouetten, zehn Streckenlayouts, lokalen KI-Gegnern, Hitbox-Kollisionen, Nitro, Drift, Boost-Pickups, Öl, Hütchen und Bananen-Fallen. Die dargestellten Fahrzeugnamen sind Typreferenzen; das Spiel enthält keine offiziellen OEM-3D-Modelle, Markenlogos oder Herstellerlizenzen.

Online-Multiplayer wird über einen kleinen WebSocket-Relay-Server realisiert. Er ist für private Freundesrennen gedacht und keine manipulationssichere, autoritative Turnier-Infrastruktur.
