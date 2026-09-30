// commands/mute.js
async function muteCommand(sock, from, msg, isAdmin) {
    try {
        if (!from.endsWith('@g.us')) {
            await sock.sendMessage(from, { text: "❌ This command can only be used in groups." }, { quoted: msg });
            return;
        }
        if (!isAdmin) {
            await sock.sendMessage(from, { text: "❌ Only group admins can use this command." }, { quoted: msg });
            return;
        }

        await sock.groupSettingUpdate(from, 'announcement');
        await sock.sendMessage(from, { text: "🔒 *Group Muted!* Only admins can send messages now." }, { quoted: msg });
    } catch (error) {
        console.error("Error in mute command:", error);
        await sock.sendMessage(from, { text: `❌ Error: ${error.message}` }, { quoted: msg });
    }
}

module.exports = muteCommand;
