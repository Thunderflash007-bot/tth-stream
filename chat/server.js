'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');

const PORT     = 4021;
const MAX_MSG_LENGTH = 300;
const MAX_USERNAME_LENGTH = 24;
const MIN_PASSWORD_LENGTH = 4;
// Einfache Sperrliste – beliebig erweiterbar
const BANNED_WORDS = [];
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors: {
        origin: (origin, cb) => cb(null, true), // Erlaubt alle Origins inkl. Codespace-Domains
        methods: ['GET', 'POST']
    }
});

// Aktive Nutzer: socket.id → username
const sessions = new Map();

// Rate-Limiting: socket.id → Timestamp der letzten Nachricht
const lastMessage = new Map();
const RATE_LIMIT_MS = 1000; // max. 1 Nachricht pro Sekunde

function ensureUsersStore() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, '{}\n', 'utf8');
    }
}

function readUsers() {
    ensureUsersStore();
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (_error) {
        return {};
    }
}

function writeUsers(users) {
    ensureUsersStore();
    fs.writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function normalizeUsername(raw) {
    return String(raw).trim().slice(0, MAX_USERNAME_LENGTH);
}

function emitUserCount() {
    io.emit('user_count', sessions.size);
}

function getActiveUsername(socket) {
    return sessions.get(socket.id);
}

io.on('connection', (socket) => {
    console.log(`[+] Verbunden: ${socket.id}`);

    // ── Account erstellen ───────────────────────────────────────────────────
    socket.on('auth_register', ({ username: rawUsername, password: rawPassword }) => {
        const username = normalizeUsername(rawUsername);
        const password = String(rawPassword || '');

        if (!username || username.length < 2) {
            socket.emit('error_msg', 'Benutzername muss mindestens 2 Zeichen lang sein.');
            return;
        }

        if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
            socket.emit('error_msg', 'Benutzername darf nur Buchstaben, Zahlen, _ und - enthalten.');
            return;
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            socket.emit('error_msg', `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
            return;
        }

        const users = readUsers();
        const usernameKey = username.toLowerCase();
        if (users[usernameKey]) {
            socket.emit('error_msg', 'Benutzername ist bereits registriert.');
            return;
        }

        users[usernameKey] = {
            username,
            passwordHash: hashPassword(password),
            createdAt: Date.now()
        };
        writeUsers(users);

        sessions.set(socket.id, username);
        socket.emit('auth_ok', { username, mode: 'register' });
        io.emit('system_msg', `👤 ${username} hat den Chat betreten.`);
        emitUserCount();
    });

    // ── Login ───────────────────────────────────────────────────────────────
    socket.on('auth_login', ({ username: rawUsername, password: rawPassword }) => {
        const username = normalizeUsername(rawUsername);
        const password = String(rawPassword || '');
        const users = readUsers();
        const entry = users[username.toLowerCase()];

        if (!entry || entry.passwordHash !== hashPassword(password)) {
            socket.emit('error_msg', 'Benutzername oder Passwort ist falsch.');
            return;
        }

        sessions.set(socket.id, entry.username);
        socket.emit('auth_ok', { username: entry.username, mode: 'login' });
        io.emit('system_msg', `👤 ${entry.username} hat den Chat betreten.`);
        emitUserCount();
    });

    socket.on('auth_logout', () => {
        const username = getActiveUsername(socket);
        sessions.delete(socket.id);
        if (username) {
            io.emit('system_msg', `👋 ${username} hat den Chat verlassen.`);
        }
        emitUserCount();
    });

    // ── Nachricht senden ─────────────────────────────────────────────────────
    socket.on('chat_msg', (raw) => {
        const username = getActiveUsername(socket);
        if (!username) {
            socket.emit('error_msg', 'Bitte zuerst einloggen oder registrieren.');
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

        io.emit('chat_msg', { nick: username, msg, ts: now });
    });

    // ── Trennung ─────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const username = getActiveUsername(socket);
        sessions.delete(socket.id);
        lastMessage.delete(socket.id);
        if (username) {
            io.emit('system_msg', `👋 ${username} hat den Chat verlassen.`);
        }
        emitUserCount();
        console.log(`[-] Getrennt: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Chat-Server läuft auf Port ${PORT}`);
});
