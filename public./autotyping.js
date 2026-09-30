// commands/autotyping.js
async function autotypingCommand(sock, from, msg, args, botData, saveBotData) {
    try {
        const status = args[0]?.toLowerCase();
        if (!botData.autoTyping) botData.autoTyping = {};

        if (status === 'on') {
            botData.autoTyping[from] = true;
            saveBotData();
            await sock.sendPresenceUpdate('composing', from);
            await sock.sendMessage(from, { text: "✅ Auto-Typing is now *ENABLED* for this chat." }, { quoted: msg });
        } else if (status === 'off') {
            botData.autoTyping[from] = false;
            saveBotData();
            await sock.sendPresenceUpdate('paused', from);
            await sock.sendMessage(from, { text: "❌ Auto-Typing is now *DISABLED* for this chat." }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: "⚠️ Usage: `.autotyping on` or `.autotyping off`" }, { quoted: msg });
        }
    } catch (error) {
        console.error("Error in autotyping command:", error);
    }
}

module.exports = autotypingCommand;
