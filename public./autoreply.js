// commands/autoreply.js

async function autoreplyCommand(sock, from, msg, isAdmin, session, args, botData, saveBotData) {
    try {
        if (!isAdmin) {
            return await sock.sendMessage(from, { 
                text: "❌ Only bot owner or group admin can use this command!" 
            }, { quoted: msg });
        }

        const subCommand = args[0]?.toLowerCase();
        const customText = args.slice(1).join(' ');

        const usageText = `🤖 *AUTO-REPLY SETUP GUIDE*\n\n` +
                          `1️⃣ *Set Reply:* \n\` .auto-reply set <Aapka Text>\`\n` +
                          `   _Example:_ \`.auto-reply set Hello! I am currently busy.\`\n\n` +
                          `2️⃣ *Check Status:* \n\` .auto-reply status\`\n\n` +
                          `3️⃣ *Turn Off:* \n\` .auto-reply off\``;

        if (!subCommand) {
            return await sock.sendMessage(from, { text: usageText }, { quoted: msg });
        }

        if (subCommand === 'set') {
            if (!customText) {
                return await sock.sendMessage(from, { 
                    text: "❌ Please provide the text to reply!\n\n*Example:* `.auto-reply set Welcome to our chat!`" 
                }, { quoted: msg });
            }

            if (!botData.autoReplySettings) botData.autoReplySettings = {};
            
            botData.autoReplySettings[from] = {
                enabled: true,
                response: customText
            };

            if (typeof saveBotData === 'function') saveBotData();

            return await sock.sendMessage(from, { 
                text: `✅ *Auto-Reply Successfully Set!*\n\n📝 *Text:* ${customText}\n📍 *Chat:* ${from.endsWith('@g.us') ? 'Group Chat' : 'DM / Personal Chat'}` 
            }, { quoted: msg });
        }

        if (subCommand === 'off' || subCommand === 'disable') {
            if (botData.autoReplySettings && botData.autoReplySettings[from]) {
                botData.autoReplySettings[from].enabled = false;
                if (typeof saveBotData === 'function') saveBotData();
            }

            return await sock.sendMessage(from, { 
                text: "🛑 *Auto-Reply has been turned OFF for this chat.*" 
            }, { quoted: msg });
        }

        if (subCommand === 'status') {
            const currentSetting = botData.autoReplySettings?.[from];
            if (currentSetting && currentSetting.enabled) {
                return await sock.sendMessage(from, { 
                    text: `⚙️ *Auto-Reply Status:* Active ✅\n💬 *Response:* ${currentSetting.response}` 
                }, { quoted: msg });
            } else {
                return await sock.sendMessage(from, { 
                    text: "⚙️ *Auto-Reply Status:* Disabled ❌" 
                }, { quoted: msg });
            }
        }

        return await sock.sendMessage(from, { text: usageText }, { quoted: msg });

    } catch (error) {
        console.error("AutoReply Command Error:", error);
        await sock.sendMessage(from, { text: `❌ Error: ${error.message}` }, { quoted: msg });
    }
}

async function handleAutoReplyMessage(sock, msg, botData) {
    try {
        if (!msg?.key || !botData?.autoReplySettings) return;

        const from = msg.key.remoteJid;
        const isMe = msg.key.fromMe;

        if (isMe || !from || from === 'status@broadcast') return;

        const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message;
        const text = (messageContent?.conversation || messageContent?.extendedTextMessage?.text || '').trim();

        if (text.startsWith('.')) return;

        const setting = botData.autoReplySettings[from];

        if (setting && setting.enabled && setting.response) {
            await sock.sendMessage(from, { text: setting.response }, { quoted: msg });
        }

    } catch (error) {
        console.error("Handle AutoReply Error:", error);
    }
}

module.exports = {
    autoreplyCommand,
    handleAutoReplyMessage
};
