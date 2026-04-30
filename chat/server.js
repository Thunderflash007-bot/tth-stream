'use strict';

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');

const PORT     = 4021;
const MAX_MSG_LENGTH = 300;
const MAX_NICK_LENGTH = 24;
// Einfache Sperrliste – beliebig erweiterbar
const BANNED_WORDS = [];

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors: {
        origin: (origin, cb) => cb(null, true), // Erlaubt alle Origins inkl. Codespace-Domains
        methods: ['GET', 'POST']
    }
});

// Aktive Nutzer: socket.id → nickname
const users = new Map();

// Rate-Limiting: socket.id → Timestamp der letzten Nachricht
const lastMessage = new Map();
const RATE_LIMIT_MS = 1000; // max. 1 Nachricht pro Sekunde

io.on('connection', (socket) => {
    console.log(`[+] Verbunden: ${socket.id}`);

    // ── Nickname setzen ──────────────────────────────────────────────────────
    socket.on('set_nick', (raw) => {
        const nick = String(raw).trim().slice(0, MAX_NICK_LENGTH);

        if (!nick || nick.length < 2) {
            socket.emit('error_msg', 'Nickname muss mindestens 2 Zeichen lang sein.');
            return;
        }

        // Doppelte Nicknames verhindern
        for (const existing of users.values()) {
            if (existing.toLowerCase() === nick.toLowerCase()) {
                socket.emit('error_msg', 'Dieser Nickname ist bereits vergeben.');
                return;
            }
        }

        users.set(socket.id, nick);
        socket.emit('nick_ok', nick);
        io.emit('system_msg', `👤 ${nick} hat den Chat betreten.`);
        io.emit('user_count', users.size);
    });

    // ── Nachricht senden ─────────────────────────────────────────────────────
    socket.on('chat_msg', (raw) => {
        const nick = users.get(socket.id);
        if (!nick) {
            socket.emit('error_msg', 'Bitte zuerst einen Nickname setzen.');
            return;
        }

        // Rate-Limiting
        const now = Date.now();
        const last = lastMessage.get(socket.id) || 0;
        if (now - last < RATE_LIMIT_MS) {
            socket.emit('error_msg', 'Bitte nicht so schnell schreiben.');
            return;
        }
        lastMessage.set(socket.id, now);

        // Nachricht bereinigen
        let msg = String(raw).trim().slice(0, MAX_MSG_LENGTH);
        if (!msg) return;

        // Gesperrte Wörter filtern
        for (const word of BANNED_WORDS) {
            const re = new RegExp(word, 'gi');
            msg = msg.replace(re, '***');
        }

        io.emit('chat_msg', { nick, msg, ts: now });
    });

    // ── Trennung ─────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const nick = users.get(socket.id);
        users.delete(socket.id);
        lastMessage.delete(socket.id);
        if (nick) {
            io.emit('system_msg', `👋 ${nick} hat den Chat verlassen.`);
        }
        io.emit('user_count', users.size);
        console.log(`[-] Getrennt: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Chat-Server läuft auf Port ${PORT}`);
});
