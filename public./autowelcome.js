// commands/autowelcome.js
async function autowelcomeCommand(sock, from, msg, isAdmin, args, botData, saveBotData) {
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
        if (!botData.welcomeSettings) botData.welcomeSettings = {};

        if (status === 'on') {
            botData.welcomeSettings[from] = true;
            saveBotData();
            await sock.sendMessage(from, { text: "✅ Auto-Welcome messages *ENABLED* for this group." }, { quoted: msg });
        } else if (status === 'off') {
            botData.welcomeSettings[from] = false;
            saveBotData();
            await sock.sendMessage(from, { text: "❌ Auto-Welcome messages *DISABLED* for this group." }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: "⚠️ Usage: `.autowelcome on` or `.autowelcome off`" }, { quoted: msg });
        }
    } catch (error) {
        console.error("Error in autowelcome command:", error);
    }
}

module.exports = autowelcomeCommand;
