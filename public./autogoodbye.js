// commands/autogoodbye.js
async function autogoodbyeCommand(sock, from, msg, isAdmin, args, botData, saveBotData) {
    try {
        if (!from.endsWith('@g.us')) {
            await sock.sendMessage(from, { text: "❌ This command can only be used in groups." }, { quoted: msg });
            return;
        }
        if (!isAdmin) {
            await sock.sendMessage(from, { text: "❌ Only group admins can use this command." }, { quoted: msg });
            return;
        }

        const status = args[0]?.toLowerCase();
        if (!botData.goodbyeSettings) botData.goodbyeSettings = {};

        if (status === 'on') {
            botData.goodbyeSettings[from] = true;
            saveBotData();
            await sock.sendMessage(from, { text: "✅ Auto-Goodbye messages *ENABLED* for this group." }, { quoted: msg });
        } else if (status === 'off') {
            botData.goodbyeSettings[from] = false;
            saveBotData();
            await sock.sendMessage(from, { text: "❌ Auto-Goodbye messages *DISABLED* for this group." }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: "⚠️ Usage: `.autogoodbye on` or `.autogoodbye off`" }, { quoted: msg });
        }
    } catch (error) {
        console.error("Error in autogoodbye command:", error);
    }
}

module.exports = autogoodbyeCommand;
