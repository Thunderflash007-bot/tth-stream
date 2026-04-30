# TTH Stream – Private Live-Streaming-Plattform

Vollständige Single-User-Streaming-Plattform. Alle Dienste laufen im Port-Bereich **4020–4029**.

| Port | Dienst | Beschreibung |
|------|--------|--------------|
| **4020** | Nginx (HTTP) | Web-Frontend & HLS-Auslieferung |
| **4021** | Node.js | Socket.io Chat-Server |
| **4022** | Nginx (RTMP) | RTMP-Eingang für OBS |

---

## Projektstruktur

```
tth-stream/
├── nginx/
│   └── nginx.conf          # Nginx + RTMP Konfiguration
├── html/
│   └── index.html          # Dark-Mode Frontend mit hls.js & Chat
├── chat/
│   ├── package.json
│   └── server.js           # Node.js Chat-Server (Socket.io)
└── docker-compose.yml
```

---

## 1. Stream-Key setzen

Ersetze in **beiden** Dateien den Platzhalter `DEIN_GEHEIMER_KEY` mit einem sicheren String:

```bash
# Zufälligen Key generieren
openssl rand -hex 16
```

Dateien, die angepasst werden müssen:
- `nginx/nginx.conf` → Zeile mit `$arg_name != "DEIN_GEHEIMER_KEY"`
- `html/index.html` → Zeile `const STREAM_KEY = 'DEIN_GEHEIMER_KEY';`

---

## 2. Starten (mit Docker)

```bash
docker compose up -d
```

Stoppen:

```bash
docker compose down
```

---

## 3. Starten (ohne Docker, Ubuntu)

### Nginx mit RTMP-Modul installieren

```bash
sudo apt update
sudo apt install nginx libnginx-mod-rtmp -y

sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

sudo mkdir -p /var/www/hls
sudo chown www-data:www-data /var/www/hls

sudo mkdir -p /var/www/html
sudo cp html/index.html /var/www/html/

sudo systemctl restart nginx
```

### Chat-Server starten

```bash
cd chat
npm install
node server.js
```

---

## 4. Firewall (UFW) öffnen

```bash
sudo ufw allow 4020:4029/tcp
sudo ufw reload
sudo ufw status
```

---

## 5. OBS-Einstellungen

`Einstellungen → Stream`

| Feld | Wert |
|------|------|
| **Dienst** | Benutzerdefiniert |
| **Server** | `rtmp://DEINE_SERVER_IP:4022/live` |
| **Stream-Key** | `DEIN_GEHEIMER_KEY` |

> Lokaler Test: `rtmp://127.0.0.1:4022/live`

---

## 6. Zuschauer-URL

```
http://DEINE_SERVER_IP:4020
```

---

## Sicherheitshinweise

- Den Stream-Key **niemals** öffentlich teilen.
- Für produktiven Betrieb: Nginx hinter einem Reverse-Proxy mit TLS (Port 443), `Access-Control-Allow-Origin *` auf die eigene Domain einschränken.
- Gesperrte Wörter im Chat: `BANNED_WORDS`-Array in `chat/server.js` befüllen.