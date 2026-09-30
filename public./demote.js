// commands/demote.js
async function demoteCommand(sock, from, msg, isAdmin) {
    try {
        if (!from.endsWith('@g.us')) {
            await sock.sendMessage(from, { text: "❌ This command can only be used in groups." }, { quoted: msg });
            return;
        }
        if (!isAdmin) {
            await sock.sendMessage(from, { text: "❌ Only group admins can use this command." }, { quoted: msg });
            return;
        }

        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length === 0) {
            await sock.sendMessage(from, { text: "⚠️ Please mention a user to demote.\nExample: `.demote @user`" }, { quoted: msg });
            return;
        }

        await sock.groupParticipantsUpdate(from, mentioned, "demote");
        await sock.sendMessage(from, { text: `✅ Demoted @${mentioned[0].split('@')[0]} from admin status.`, mentions: mentioned }, { quoted: msg });
    } catch (error) {
        console.error("Error in demote command:", error);
        await sock.sendMessage(from, { text: `❌ Error: ${error.message}` }, { quoted: msg });
    }
}

module.exports = demoteCommand;
