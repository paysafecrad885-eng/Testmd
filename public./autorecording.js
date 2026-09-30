// commands/autorecording.js
async function autorecordingCommand(sock, from, msg, args, botData, saveBotData) {
    try {
        const status = args[0]?.toLowerCase();
        if (!botData.autoRecording) botData.autoRecording = {};

        if (status === 'on') {
            botData.autoRecording[from] = true;
            saveBotData();
            await sock.sendPresenceUpdate('recording', from);
            await sock.sendMessage(from, { text: "✅ Auto-Recording is now *ENABLED* for this chat." }, { quoted: msg });
        } else if (status === 'off') {
            botData.autoRecording[from] = false;
            saveBotData();
            await sock.sendPresenceUpdate('paused', from);
            await sock.sendMessage(from, { text: "❌ Auto-Recording is now *DISABLED* for this chat." }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: "⚠️ Usage: `.autorecording on` or `.autorecording off`" }, { quoted: msg });
        }
    } catch (error) {
        console.error("Error in autorecording command:", error);
    }
}

module.exports = autorecordingCommand;
