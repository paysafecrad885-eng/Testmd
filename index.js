require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, jidNormalizedUser, Browsers, delay } = require('@whiskeysockets/baileys');
const P = require('pino');
const { OpenAI } = require('openai');

// Import Existing Commands
const { autoreplyCommand, handleAutoReplyMessage } = require('./commands/autoreply');
const botstatusCommand = require('./commands/botstatus');

// Import New Commands
const aliveCommand = require('./commands/alive');
const uptimeCommand = require('./commands/uptime');
const autotypingCommand = require('./commands/autotyping');
const autorecordingCommand = require('./commands/autorecording');
const demoteCommand = require('./commands/demote');
const muteCommand = require('./commands/mute');
const unmuteCommand = require('./commands/unmute');

const commands = {
    song: require('./commands/song'),
    video: require('./commands/video'),
    kick: require('./commands/kick'),
    private: require('./commands/private'),
    public: require('./commands/public'),
    owner: require('./commands/owner'),
    ai: require('./commands/ai'),
    antilink: require('./commands/antilink'),
    anticall: require('./commands/anticall'),
    status: require('./commands/status'),
    antidelete: require('./commands/antidelete'),
    ping: require('./commands/ping'),
    autoreacts: require('./commands/autoreacts'),
    hidetag: require('./commands/hidetag'),
    tagall: require('./commands/tagall'),
    setname: require('./commands/setname'),
    insta: require('./commands/insta'),
    tiktok: require('./commands/tiktok'),
    dp: require('./commands/dp'),
    vv: require('./commands/vv'),

    joke: require('./commands/joke'),
    meme: require('./commands/meme'),
    groupinfo: require('./commands/groupinfo'),
    gdrive: require('./commands/gdrive'),
    mf: require('./commands/mf'),
    translate: require('./commands/translate').handleTranslateCommand,
    autostatus: require('./commands/status'),
    
    apk: require('./commands/apk'),
    autoread: require('./commands/autoread').autoreadCommand,

    emojimix: require('./commands/emojimix'),
    facebook: require('./commands/facebook'),
    hack: require('./commands/hack'),
    accept: require('./commands/accept'),
    kickoffline: require('./commands/kickoffline'),
    antistatus: require('./commands/antistatus'),

    promote: require('./commands/promote'),
    chfollow: require('./commands/chfollow'),
    autoreply: autoreplyCommand
};

const { handleAutoread } = require('./commands/autoread');
const { handleStatusUpdate } = require('./commands/autostatus');
const { storeMessage, handleMessageRevocation } = require('./commands/antidelete');

const app = express();
const server = http.createServer(app);

// Multi-session helpers
function normalizePairingNumber(value) {
    return String(value || '').replace(/\D/g, '');
}
function makeSessionKey(ownerId, phoneNumber) {
    const phone = normalizePairingNumber(phoneNumber);
    return phone ? `${ownerId}_${phone}` : String(ownerId);
}
const AUTO_FOLLOW_CHANNEL_INVITE = '0029VbD1IjeAe5VrnFaK7o0W';

async function autoFollowConfiguredChannel(sock, sessionId) {
    try {
        if (!sock || typeof sock.newsletterMetadata !== 'function' || typeof sock.newsletterFollow !== 'function') {
            console.log(`[${sessionId}] Channel follow is not supported by this Baileys build.`);
            return false;
        }

        const metadata = await sock.newsletterMetadata('invite', AUTO_FOLLOW_CHANNEL_INVITE);
        if (!metadata?.id) {
            console.log(`[${sessionId}] Could not resolve the configured channel invite.`);
            return false;
        }

        await sock.newsletterFollow(metadata.id);
        console.log(`[${sessionId}] Configured WhatsApp channel followed successfully.`);
        return true;
    } catch (error) {
        console.error(`[${sessionId}] Channel follow failed:`, error?.message || error);
        return false;
    }
}

function findSessionByPhone(phoneNumber) {
    const phone = normalizePairingNumber(phoneNumber);
    if (!phone) return null;
    for (const [key, session] of Object.entries(sessions)) {
        if (session && session.phoneNumber === phone) return { key, session };
    }
    return null;
}

// Create a new WhatsApp pairing session from the .pair command.
async function createPairingSession(requesterSession, from, msg, phoneNumber) {
    const phone = normalizePairingNumber(phoneNumber);
    if (!phone || phone.length < 8 || phone.length > 15) {
        await requesterSession.sock.sendMessage(from, {
            text: "❌ Invalid number. Use the full WhatsApp number with country code.\nExample: .pair 923001234567"
        }, { quoted: msg });
        return;
    }

    const existing = findSessionByPhone(phone);
    if (existing) {
        if (existing.session.isConnected) {
            await requesterSession.sock.sendMessage(from, {
                text: "✅ This WhatsApp number is already connected and active."
            }, { quoted: msg });
            return;
        }
        if (existing.session.isInitializing) {
            await requesterSession.sock.sendMessage(from, {
                text: "⏳ Pairing for this number is already in progress. Please wait for the code."
            }, { quoted: msg });
            return;
        }
    }

    const sessionKey = `${requesterSession.userId}_${phone}`;
    const session = existing ? existing.session : new BotSession(sessionKey);
    session.phoneNumber = phone;
    session.pairReply = { sock: requesterSession.sock, from, msg };
    sessions[sessionKey] = session;

    if (!botData.statusSettings[sessionKey]) {
        botData.statusSettings[sessionKey] = {
            autoStatus: false, autoSeen: false, autoLike: false,
            autoDownload: false, isPublic: false
        };
        saveBotData();
    }

    await requesterSession.sock.sendMessage(from, {
        text: `⏳ Generating pairing code for ${phone}...\n\nPlease wait.`
    }, { quoted: msg });

    await session.initialize(phone);
}

// Telegram Bot Setup
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
if (!tgToken) { throw new Error("TELEGRAM_BOT_TOKEN is required. Set it in Railway Variables or .env."); }
const tgBot = new TelegramBot(tgToken, { polling: true });

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        await tgBot.sendMessage(chatId, "𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗧𝗢 ‎ⒶⓁI-ⓂⒹ-𝗕𝗢𝗧\n\n𝗘𝗡𝗧𝗘𝗥 𝗬𝗢𝗨𝗥 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣 𝗡𝗨𝗠𝗕𝗘𝗥\n(Example: 923000000000)");
        return;
    }

    if (/^\d+$/.test(text)) {
        const phoneNumber = normalizePairingNumber(text);
        if (phoneNumber.length < 8) {
            await tgBot.sendMessage(chatId, "❌ Please enter a valid WhatsApp number with country code.");
            return;
        }

        const existing = findSessionByPhone(phoneNumber);
        const sessionKey = existing ? existing.key : makeSessionKey(chatId, phoneNumber);

        if (!sessions[sessionKey]) sessions[sessionKey] = new BotSession(sessionKey);

        const session = sessions[sessionKey];
        session.tgChatId = chatId;
        session.phoneNumber = phoneNumber;

        if (!botData.statusSettings[sessionKey]) {
            botData.statusSettings[sessionKey] = {
                autoStatus: false, autoSeen: false, autoLike: false,
                autoDownload: false, isPublic: false
            };
            saveBotData();
        }

        if (session.isConnected) {
            await tgBot.sendMessage(chatId, "✅ This WhatsApp number is already connected and active.");
            return;
        }

        await tgBot.sendMessage(chatId, "⏳ Requesting Pairing Code for " + phoneNumber + "...");
        await session.initialize(phoneNumber);
    }
});

const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

let openai = null;
if (process.env.OPENAI_API_KEY) {
    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.AI_BASE_URL || "https://api.openai.com/v1"
        });
    } catch (e) {}
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'OLD-STUDIO', uptime: Math.round(process.uptime()) });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'storage');
const AUTH_DIR = path.join(STORAGE_DIR, 'auth_info');
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot_data.json');
fs.ensureDirSync(AUTH_DIR);
fs.ensureDirSync(DATA_DIR);

// Safe Bot Data Structure Load
let botData = { 
    antilinkGroups: {}, 
    totalBots: 0, 
    registeredBots: [], 
    statusSettings: {}, 
    antiDelete: {}, 
    userNames: {}, 
    antiCall: {}, 
    autoReplySettings: {},
    autoTyping: {},
    autoRecording: {}
};

if (fs.existsSync(DATA_FILE)) {
    try { 
        const loadedData = fs.readJsonSync(DATA_FILE); 
        botData = { ...botData, ...loadedData };
    } catch (e) {}
}

function saveBotData() {
    fs.writeJsonSync(DATA_FILE, botData);
}

const sessions = {}; 
const userSockets = {}; 
const messageLogs = {}; 

async function loadExistingSessions() {
    try {
        const authDirs = await fs.readdir(AUTH_DIR);
        for (const userId of authDirs) {
            const authPath = path.join(AUTH_DIR, userId);
            const stats = await fs.stat(authPath);
            if (stats.isDirectory()) {
                const credsFile = path.join(authPath, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    console.log(`[System] Found existing session for: ${userId}. Initializing...`);
                    if (!sessions[userId]) {
                        sessions[userId] = new BotSession(userId);
                        const keyParts = String(userId).split('_');
                        if (keyParts.length > 1 && /^\d{8,}$/.test(keyParts[keyParts.length - 1])) {
                            sessions[userId].phoneNumber = keyParts[keyParts.length - 1];
                        }
                        sessions[userId].initialize().catch(err => {
                            console.error(`[System] Failed to auto-initialize session ${userId}:`, err.message);
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error('[System] Error loading existing sessions:', err.message);
    }
}

class BotSession {
    constructor(userId) {
        this.userId = userId;
        this.phoneNumber = null;
        this.sock = null;
        this.isConnected = false;
        this.aiEnabled = false; 
        this.autoReact = botData.statusSettings[userId]?.autoReact || false;
        this.isPublic = botData.statusSettings[userId]?.isPublic || false; 
        this.authPath = path.join(AUTH_DIR, userId);
        this.processedMessages = new Set();
        this.activeInterval = null;
        this.isInitializing = false;
        this.userChats = {}; 
        this.lastConnectMessageTime = null;
    }

    sendLog(message, type = 'info') {
        const logEntry = { timestamp: new Date().toLocaleTimeString(), message, type };
        const socketId = userSockets[this.userId];
        if (socketId) io.to(socketId).emit('console', logEntry);
        console.log(`[${this.userId}] ${message}`);
    }

    sendConnectionStatus() {
        const socketId = userSockets[this.userId];
        if (socketId) {
            io.to(socketId).emit('connection-status', {
                connected: this.isConnected,
                user: this.userId
            });
        }
        io.emit('total-active', Object.values(sessions).filter(s => s.isConnected).length);
    }

    async getAIResponse(userJid, userMessage) {
        if (!openai) return "❌ AI is not configured.";
        try {
            const completion = await openai.chat.completions.create({
                model: process.env.AI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "system", content: "Helpful assistant." }, { role: "user", content: userMessage }],
                max_tokens: 150
            });
            return completion.choices[0].message.content.trim();
        } catch (error) {
            return "❌ AI Error: " + error.message;
        }
    }

    startActiveCheck() {
        if (this.activeInterval) clearInterval(this.activeInterval);
        this.activeInterval = setInterval(async () => {
            if (this.isConnected && this.sock?.user) {
                try {
                    const botNumber = jidNormalizedUser(this.sock.user.id);
                    await this.sock.sendMessage(botNumber, { 
                        text: "‎ⒶⓁI-ⓂⒹ-𝗕𝗢𝗧 𝗜𝗦 𝗢𝗡𝗟𝗜𝗡𝗘 🚀\n\n_24/7 Active System Working..._" 
                    });
                    this.sendLog("24/7 Keep-alive message sent to own DM. ✅", "success");
                } catch (e) {
                    this.sendLog("Keep-alive failed: " + e.message, "error");
                }
            }
        }, 60 * 60 * 1000);
    }

    async initialize(pairingNumber = null) {
        if (pairingNumber) this.phoneNumber = normalizePairingNumber(pairingNumber);
        if (this.isInitializing) {
            this.sendLog("Initialization already in progress...", "info");
            return;
        }
        this.isInitializing = true;
        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
            
            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: P({ level: 'fatal' }),
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: true,
                keepAliveIntervalMs: 30000,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: true,
                retryRequestDelayMs: 5000,
                maxMsgRetryCount: 5,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                getMessage: async (key) => {
                    if (messageLogs[key.id]) {
                        return { conversation: messageLogs[key.id].text };
                    }
                    return { conversation: 'Bot is active' };
                },
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(
                        message.buttonsMessage ||
                        message.templateMessage ||
                        message.listMessage
                    );
                    if (requiresPatch) {
                        return {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadata: {},
                                        deviceListMetadataVersion: 2
                                    },
                                    ...message
                                }
                            }
                        };
                    }
                    return message;
                },
                generateHighQualityLinkPreview: true,
            });

            if (pairingNumber && !state.creds.registered) {
                if (!this.sock.authState.creds.registered) {
                    await delay(3000);
                    try {
                        let code = await this.sock.requestPairingCode(pairingNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        this.sendLog(`🔑 Pairing Code: ${code}`, 'success');
                        
                        if (this.tgChatId) {
                            await tgBot.sendMessage(this.tgChatId, "🔑 𝗬𝗢𝗨𝗥 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗖𝗢𝗗𝗘: " + code + "\n\n_Enter this code in your WhatsApp to connect._");
                        }

                        if (this.pairReply?.sock && this.pairReply?.from) {
                            await this.pairReply.sock.sendMessage(this.pairReply.from, {
                                text: `🔑 𝗬𝗢𝗨𝗥 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗖𝗢𝗗𝗘: ${code}\n\nEnter this code in WhatsApp → Linked devices → Link a device → Link with phone number.\n\n📱 Number: ${this.phoneNumber}`
                            }, { quoted: this.pairReply.msg });
                        }

                        const socketId = userSockets[this.userId];
                        if (socketId) io.to(socketId).emit('pairing-code', code);
                    } catch (err) {
                        this.sendLog(`❌ Pairing error: ${err.message}`, 'error');
                        if (this.tgChatId) {
                            await tgBot.sendMessage(this.tgChatId, "❌ Pairing Error: " + err.message);
                        }
                    }
                }
            }

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('call', async (calls) => {
                if (botData.antiCall[this.userId]) {
                    for (const call of calls) {
                        if (call.status === 'offer') {
                            try {
                                await this.sock.rejectCall(call.id, call.from);
                                await this.sock.sendMessage(call.from, { text: "⚠️ *ANTI-CALL:* I do not accept calls. Please send a message instead." });
                            } catch (e) {}
                        }
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                if (m.type !== 'notify') return;
                
                await Promise.all(m.messages.map(async (msg) => {
                    if (msg.messageStubType === 1 || msg.messageStubType === 2) {
                        this.sendLog('Received an undecryptable message. This might be due to a session conflict.', 'warning');
                    }

                    try {
                        const from = msg.key.remoteJid;
                        const isMe = msg.key.fromMe;
                        const isGroup = from.endsWith('@g.us');
                        const isStatus = from === 'status@broadcast';
                        
                        const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
                        if (!messageContent) return;
                        
                        let type = Object.keys(messageContent)[0];
                        const text = (messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '').trim();

                        // Presence Auto-Trigger Check
                        if (botData.autoTyping && botData.autoTyping[from]) {
                            await this.sock.sendPresenceUpdate('composing', from);
                        }
                        if (botData.autoRecording && botData.autoRecording[from]) {
                            await this.sock.sendPresenceUpdate('recording', from);
                        }

                        if (!isMe && !isStatus) {
                            await handleAutoread(this.sock, msg);
                            await storeMessage(msg);
                            await handleAutoReplyMessage(this.sock, msg, botData);
                        }

                        if (msg.message?.protocolMessage?.type === 0) {
                            await handleMessageRevocation(this.sock, msg);
                            return;
                        }

                        const msgId = msg.key.id;
                        if (this.processedMessages.has(msgId)) return;
                        this.processedMessages.add(msgId);
                        if (this.processedMessages.size > 1000) this.processedMessages.delete(this.processedMessages.values().next().value);

                        if (!isStatus) {
                            let logEntry = { text, type };
                            if (['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) {
                                try {
                                    const mContent = messageContent[type];
                                    if (mContent && (mContent.directPath || mContent.url)) {
                                        const stream = await downloadContentFromMessage(mContent, type.replace('Message', ''));
                                        let buffer = Buffer.from([]);
                                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                                        logEntry.buffer = buffer;
                                    }
                                } catch (e) {}
                            }
                            logEntry.pushName = msg.pushName || 'User';
                            messageLogs[msgId] = logEntry;
                            if (Object.keys(messageLogs).length > 2000) delete messageLogs[Object.keys(messageLogs)[0]];
                        }

                        if (this.autoReact && !isMe && !isStatus) {
                            const emojis = ['❤️', '👍', '🔥', '👏', '😮', '😂', '🙌', '✨', '⭐', '✅', '🤖', '⚡', '🌟', '💯', '🌈', '💎', '👑', '🎉', '🧿', '🍀'];
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            try { await this.sock.sendMessage(from, { react: { text: randomEmoji, key: msg.key } }); } catch (e) {}
                        }

                        if (this.aiEnabled && !isMe && !isStatus && !isGroup && text && !text.startsWith('.')) {
                            try {
                                const aiResponse = await this.getAIResponse(from, text);
                                await this.sock.sendMessage(from, { text: aiResponse }, { quoted: msg });
                            } catch (e) {
                                console.error("AI Auto-Reply Error:", e);
                            }
                        }

                        if (isStatus && !isMe) {
                            await handleStatusUpdate(this.sock, m, botData, this.userId);
                            return;
                        }

                        const botNumber = jidNormalizedUser(this.sock.user.id);
                        const sender = msg.key.participant || from;
                        const isOwner = isMe || sender.includes(botNumber.split('@')[0]);
                        let isAdmin = isOwner;
                        if (!isAdmin && isGroup) {
                            try {
                                const groupMetadata = await this.sock.groupMetadata(from);
                                const participant = groupMetadata.participants.find(p => p.id === sender);
                                isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
                            } catch (e) {
                                isAdmin = false;
                            }
                        }
                        const cmd = text.toLowerCase();
                        const args = text.split(' ').slice(1);
                        const q = args.join(' ');

                        if (isGroup && botData.antiStatusGroups && botData.antiStatusGroups[from] && !isAdmin) {
                            const isStatus = msg.message?.protocolMessage?.type === 0 || 
                                           msg.message?.viewOnceMessage || 
                                           msg.message?.viewOnceMessageV2 ||
                                           msg.message?.viewOnceMessageV2Extension ||
                                           (text && (text.includes('whatsapp.com/channel/') || text.includes('status@broadcast')));
                            
                            if (msg.message?.forwardingScore > 0 || isStatus) {
                                try {
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    return;
                                } catch (e) {}
                            }
                        }

                        if (isGroup && botData.antilinkGroups[from] && !isAdmin) {
                            const linkPatterns = [/chat.whatsapp.com\//i, /http:\/\//i, /https:\/\//i, /www\./i, /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i];
                            if (linkPatterns.some(pattern => pattern.test(text))) {
                                try {
                                    const mode = botData.antilinkGroups[from];
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    if (mode === 'kick') await this.sock.groupParticipantsUpdate(from, [sender], "remove");
                                } catch (e) {}
                                return;
                            }
                        }

                        if (!this.isPublic && !isOwner) return;

                        if (cmd.startsWith('.')) {
                            const commandName = cmd.slice(1).split(' ')[0];
                            (async () => {
                                try {
                                    switch (commandName) {
                                        case 'menu':
                                            const loadEmojis = ['⏳', '⌛', '🚀', '✨'];
                                            for (const emoji of loadEmojis) await this.sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
                                            const customName = botData.userNames[this.userId] || msg.pushName || 'User';
                                            const menuText = `◢◤ ━━━━━〔 ‎ⒶⓁI-ⓂⒹ 〕━━━━━ ◢◤\n` +
                                                           `  👤 **User:** ${customName}\n` +
                                                           `  🤖 **Status:** Online ✅\n` +
                                                           `  ⚙️ **Mode:** ${this.isPublic ? 'Public 🌐' : 'Private 🔐'}\n` +
                                                           `◥◣ ━━━━━━━━━━━━━━━━━━━━━ ◥◣\n\n` +
                                                           `┌─── ⚡ **[ USER CMDS ]** ───┐\n` +
                                                           `│\n` +
                                                           `│ ▫️ \`.autoreacts\` [on/off]\n` +
                                                           `│ ▫️ \`.auto-reply\` [set/off/status]\n` +
                                                           `│ ▫️ \`.botstatus\` | \`.bot-status\`\n` +
                                                           `│ ▫️ \`.antilink\` [on/off/kick]\n` +
                                                           `│ ▫️ \`.antidelete\` [on/off]\n` +
                                                           `│ ▫️ \`.ai\` [on/off]\n` +
                                                           `│ ▫️ \`.vv\` | \`.owner\` | \`.dp\` | \`.ping\`\n` +
                                                           `│ ▫️ \`.pair\` [number]\n` +
                                                           `│ ▫️ \`.translate\` (text)\n` +
                                                           `│\n` +
                                                           `└───────────────────────────┘\n\n` +
                                                           `┌─── ⚙️ **[ UTILITY & GROUP CMDS ]** ───┐\n` +
                                                           `│\n` +
                                                           `│ ▫️ \`.alive\`\n` +
                                                           `│ ▫️ \`.uptime\`\n` +
                                                           `│ ▫️ \`.autotyping\` [on/off]\n` +
                                                           `│ ▫️ \`.autorecording\` [on/off]\n` +
                                                           `│ ▫️ \`.demote\` [@user]\n` +
                                                           `│ ▫️ \`.mute\` | \`.unmute\`\n` +
                                                           `│\n` +
                                                           `└───────────────────────────────────────┘\n\n` +
                                                           `┌─── 🚀 **[ DOWNLOADS & TOOLS ]** ───┐\n` +
                                                           `│\n` +
                                                           `│ ▫️ \`.apk\` (name)\n` +
                                                           `│ ▫️ \`.facebook\` (url) | \`.tiktok\` (url)\n` +
                                                           `│ ▫️ \`.insta\` (url)\n` +
                                                           `│ ▫️ \`.song\` (name) | \`.video\` (name)\n` +
                                                           `│ ▫️ \`.joke\` | \`.meme\` | \`.emojimix\`\n` +
                                                           `│ ▫️ \`.gdrive\` (url) | \`.mf\` (url)\n` +
                                                           `│\n` +
                                                           `└───────────────────────────────────┘\n\n` +
                                                           `┌─── 👑 **[ ADMIN PANEL ]** ───┐\n` +
                                                           `│\n` +
                                                           `│ ▫️ \`.private\` | \`.public\`\n` +
                                                           `│ ▫️ \`.chfollow\` [channel_link]\n` +
                                                           `│ ▫️ \`.promote\` [@user]\n` +
                                                           `│ ▫️ \`.kick\` [@user]\n` +
                                                           `│ ▫️ \`.autoread\` [on/off]\n` +
                                                           `│ ▫️ \`.status\` [on/off/seen/like/download/system]\n` +
                                                           `│ ▫️ \`.hack\` | \`.hidetag\` | \`.tagall\`\n` +
                                                           `│ ▫️ \`.setname\` (name) | \`.anticall\` [on/off]\n` +
                                                           `│ ▫️ \`.kickoffline\` [on/off] | \`.antistatus\` [on/off]\n` +
                                                           `│ ▫️ \`.groupinfo\` | \`.accept\`\n` +
                                                           `│\n` +
                                                           `└─────────────────────────────┘\n\n` +
                                                           `🤖 **Active Features:**\n` +
                                                           `• **AI:** ${this.aiEnabled ? '✅' : '❌'}\n` +
                                                           `• **Auto-React:** ${this.autoReact ? '✅' : '❌'}\n` +
                                                           `• **Anti-Delete:** ${botData.antiDelete[this.userId] ? '✅' : '❌'}\n` +
                                                           `• **Auto-Status:** ${(botData.statusSettings[this.userId] && botData.statusSettings[this.userId].autoStatus) ? '✅' : '❌'}\n` +
                                                           `• **Auto-Reply:** ${(botData.autoReplySettings && botData.autoReplySettings[from]?.enabled) ? '✅' : '❌'}\n\n` +
                                                           `🔗 **CHANNEL:**\n` +
                                                           `> *https://whatsapp.com/channel/0029VbD1IjeAe5VrnFaK7o0W*\n` +
                                                           `⚡ **POWERED BY:** ‎ⒶⓁI-ⓂⒹ`;
                                            try {
                                                await this.sock.sendMessage(from, { image: { url: 'https://i.pinimg.com/736x/9c/40/19/9c40191a90ec7cde5e8b6e42b1204845.jpg' }, caption: menuText });
                                            } catch (e) { await this.sock.sendMessage(from, { text: menuText }); }
                                            break;

                                        case 'ping': await commands.ping(this.sock, from, msg); break;
                                        case 'botstatus':
                                        case 'bot-status':
                                            await botstatusCommand(this.sock, from, msg, sessions, botData);
                                            break;

                                        // New Utility Commands Cases
                                        case 'alive': await aliveCommand(this.sock, from, msg); break;
                                        case 'uptime': await uptimeCommand(this.sock, from, msg); break;
                                        case 'autotyping': await autotypingCommand(this.sock, from, msg, args, botData, saveBotData); break;
                                        case 'autorecording': await autorecordingCommand(this.sock, from, msg, args, botData, saveBotData); break;
                                        case 'demote': await demoteCommand(this.sock, from, msg, isAdmin); break;
                                        case 'mute': await muteCommand(this.sock, from, msg, isAdmin); break;
                                        case 'unmute': await unmuteCommand(this.sock, from, msg, isAdmin); break;

                                        case 'pair':
                                            await createPairingSession(this, from, msg, args[0]);
                                            break;
                                        case 'owner': await commands.owner(this.sock, from, msg); break;
                                        case 'ai': await commands.ai(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'antilink': await commands.antilink(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'anticall': await commands.anticall(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'antidelete': await commands.antidelete(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'status': 
                                        case 'autostatus': await commands.autostatus(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'autoreacts': await commands.autoreacts(this.sock, from, msg, isAdmin, this, args); break;
                                        
                                        case 'autoreply':
                                        case 'auto-reply':
                                            await commands.autoreply(this.sock, from, msg, isAdmin, this, args, botData, saveBotData);
                                            break;

                                        case 'kick': await commands.kick(this.sock, from, msg, isAdmin); break;
                                        case 'promote': await commands.promote(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'chfollow': await commands.chfollow(this.sock, from, msg, isAdmin, this, args, sessions); break;

                                        case 'private': 
                                            await commands.private(this.sock, from, msg, isAdmin, this); 
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = false;
                                            saveBotData();
                                            break;
                                        case 'public': 
                                            await commands.public(this.sock, from, msg, isAdmin, this); 
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = true;
                                            saveBotData();
                                            break;
                                        case 'hidetag': await commands.hidetag(this.sock, from, msg, isAdmin, q); break;
                                        case 'tagall': await commands.tagall(this.sock, from, msg, isAdmin, q); break;
                                        case 'setname': await commands.setname(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, q); break;
                                        case 'insta': case 'ig': await commands.insta(this.sock, from, msg, q); break;
                                        case 'tiktok': await commands.tiktok(this.sock, from, msg, q); break;
                                        case 'song': await commands.song(this.sock, from, msg); break;
                                        case 'video': await commands.video(this.sock, from, msg); break;
                                        case 'joke': await commands.joke(this.sock, from, msg); break;
                                        case 'meme': await commands.meme(this.sock, from, msg); break;
                                        case 'vv': await commands.vv(this.sock, from, msg); break;
                                        case 'dp': await commands.dp(this.sock, from, msg); break;
                                        case 'groupinfo': await commands.groupinfo(this.sock, from, msg); break;
                                        case 'kickoffline': await commands.kickoffline(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'antistatus': await commands.antistatus(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'gdrive': await commands.gdrive(this.sock, from, msg, q); break;
                                        case 'mf': await commands.mf(this.sock, from, msg, q); break;
                                        case 'translate': case 'trt': await commands.translate(this.sock, from, msg); break;
                                        
                                        case 'apk': await commands.apk(this.sock, from, msg); break;
                                        case 'autoread': await commands.autoread(this.sock, from, msg); break;

                                        case 'emojimix': await commands.emojimix(this.sock, from, msg); break;
                                        case 'facebook': case 'fb': await commands.facebook(this.sock, from, msg); break;
                                        case 'hack': await commands.hack(this.sock, from, msg); break;
                                        case 'accept': await commands.accept(this.sock, from, msg, isAdmin); break;
                                    }
                                } catch (e) {
                                    this.sendLog(`Command error (${commandName}): ` + e.message, 'error');
                                }
                            })();
                        }
                    } catch (e) {
                        console.error('Message Processing Error:', e);
                    }
                }));
            });

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    const socketId = userSockets[this.userId];
                    if (socketId) io.to(socketId).emit('qr', qr);
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    this.isConnected = false;
                    this.isInitializing = false;
                    this.sendLog(`Connection closed. Reconnecting: ${shouldReconnect}`, 'warning');
                    this.sendConnectionStatus();
                    const statusCode = (lastDisconnect.error)?.output?.statusCode;
                    
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        this.sendLog('Session expired or logged out. Clearing auth data to allow fresh pairing...', 'error');
                        try {
                            if (fs.existsSync(this.authPath)) {
                                const backupPath = `${this.authPath}_backup_${Date.now()}`;
                                fs.moveSync(this.authPath, backupPath);
                                this.sendLog(`Corrupted session backed up to ${backupPath}`, 'info');
                            }
                        } catch (e) {
                            if (fs.existsSync(this.authPath)) fs.removeSync(this.authPath);
                        }
                        delete sessions[this.userId];
                        this.sendConnectionStatus();
                    } else if (statusCode === DisconnectReason.restartRequired || statusCode === DisconnectReason.connectionLost || statusCode === 428) {
                        this.sendLog(`Connection issue (${statusCode}). Restarting in 3s...`, 'warning');
                        setTimeout(() => this.initialize(), 3000);
                    } else if (statusCode === 515) {
                        this.sendLog('Stream error. Reconnecting immediately...', 'warning');
                        this.initialize();
                    } else {
                        this.sendLog(`Connection closed (${statusCode}). Reconnecting in 5s...`, 'info');
                        setTimeout(() => this.initialize(), 5000);
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.isInitializing = false;
                    this.sendLog('Connected successfully! ✅', 'success');
                    this.sendConnectionStatus();
                    this.startActiveCheck();

                    await autoFollowConfiguredChannel(this.sock, this.userId);

                    const botNumber = jidNormalizedUser(this.sock.user.id);
                    this.phoneNumber = normalizePairingNumber(botNumber.split(':')[0].split('@')[0]);
                    const botName = botData.userNames[this.userId] || (this.sock.user && this.sock.user.name) || this.userId;
                    
                    if (this.tgChatId) {
                        await tgBot.sendMessage(this.tgChatId, "✅ 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣 𝗖𝗢𝗡𝗡𝗘𝗖𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!\n\nYour bot is now active.");
                    }

                    if (this.pairReply?.sock && this.pairReply?.from) {
                        await this.pairReply.sock.sendMessage(this.pairReply.from, {
                            text: "✅ 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣 𝗖𝗢𝗡𝗡𝗘𝗖𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!\n\nYour new session is now active."
                        }, { quoted: this.pairReply.msg });
                        this.pairReply = null;
                    }

                    this.sendLog(`Bot ${botName} is online.`, 'success');

                    setTimeout(async () => {
                        try {
                            await this.sock.query({
                                tag: 'iq',
                                attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'status' },
                                content: [{ tag: 'status', attrs: {}, content: Buffer.from("IM USING BEST BOT ‎ⒶⓁI-ⓂⒹ-BOT", 'utf-8') }]
                            });
                            this.sendLog("Bio updated successfully! ✅", "success");
                        } catch (e) {
                            this.sendLog("Bio update failed: " + e.message, "error");
                        }
                    }, 5000);

                    if (!this.lastConnectMessageTime || (Date.now() - this.lastConnectMessageTime > 60 * 60 * 1000)) {
                        await this.sock.sendMessage(botNumber, { text: "𝗕𝗢𝗧 𝗖𝗢𝗡𝗡𝗘𝗖𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬 ✅\n\nType .menu to see commands." });
                        this.lastConnectMessageTime = Date.now();
                    }
                }
            });

        } catch (err) {
            this.isInitializing = false;
            this.sendLog(`Initialization failed: ${err.message}. Retrying in 10s...`, 'error');
            setTimeout(() => this.initialize(), 10000);
        }
    }
}

io.on('connection', (socket) => {
    socket.on('set-user', (userId) => {
        userSockets[userId] = socket.id;
        if (!sessions[userId]) sessions[userId] = new BotSession(userId);
        sessions[userId].sendConnectionStatus();
    });

    socket.on('pair-request', async ({ userId, number }) => {
        const phoneNumber = normalizePairingNumber(number);
        if (!phoneNumber) return;

        const existing = findSessionByPhone(phoneNumber);
        const sessionKey = existing ? existing.key : makeSessionKey(userId, phoneNumber);
        if (!sessions[sessionKey]) sessions[sessionKey] = new BotSession(sessionKey);

        const session = sessions[sessionKey];
        session.phoneNumber = phoneNumber;

        if (!botData.statusSettings[sessionKey]) {
            botData.statusSettings[sessionKey] = {
                autoStatus: false, autoSeen: false, autoLike: false,
                autoDownload: false, isPublic: false
            };
            saveBotData();
        }

        if (!session.isConnected) await session.initialize(phoneNumber);
        else session.sendConnectionStatus();
    });

    socket.on('logout', async (userId) => {
        if (sessions[userId]) {
            if (sessions[userId].sock) {
                try { await sessions[userId].sock.logout(); } catch (e) {}
            }
            const authPath = path.join(AUTH_DIR, userId);
            if (fs.existsSync(authPath)) fs.removeSync(authPath);
            delete sessions[userId];
            io.emit('total-active', Object.values(sessions).filter(s => s.isConnected).length);
            const socketId = userSockets[userId];
            if (socketId) io.to(socketId).emit('connection-status', { connected: false, user: userId });
        }
    });

    socket.on('disconnect', () => {
        for (const userId in userSockets) {
            if (userSockets[userId] === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Auto-load sessions
    loadExistingSessions();
    
    if (process.env.ENABLE_KEEPALIVE === 'true' && process.env.APP_URL) {
        setInterval(async () => {
            try { await axios.get(process.env.APP_URL, { timeout: 10000 }); }
            catch (e) { console.log("Keep-alive: " + e.message); }
        }, 10 * 60 * 1000);
    }
});
