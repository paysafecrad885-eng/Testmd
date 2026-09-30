// commands/promote.js

async function promoteCommand(sock, from, msg, isAdmin, session, args) {
    try {
        const isGroup = from.endsWith('@g.us');

        // 1. Group Check: Yeh command sirf groups me chal sakta hai
        if (!isGroup) {
            return await sock.sendMessage(from, { text: "❌ This command can only be used in groups!" }, { quoted: msg });
        }

        // 2. Admin Check: Command chalane wala user khud admin hona chahiye
        if (!isAdmin) {
            return await sock.sendMessage(from, { text: "❌ Only group admins can use this command!" }, { quoted: msg });
        }

        // 3. Mentioned Users Extract Karein
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // Agar kisi ko mention nahi kiya gaya
        if (mentionedJids.length === 0) {
            return await sock.sendMessage(from, { 
                text: "❌ Please mention the user you want to make admin.\n\nExample: `.promote @user`" 
            }, { quoted: msg });
        }

        // 4. Group Action: Mentioned users ko admin banayein
        await sock.groupParticipantsUpdate(from, mentionedJids, "promote");

        // 5. Success Message Output
        const promotedUsers = mentionedJids.map(jid => `@${jid.split('@')[0]}`).join(' ');
        await sock.sendMessage(from, { 
            text: `✅ Successfully promoted to Admin:\n${promotedUsers}`,
            mentions: mentionedJids
        }, { quoted: msg });

    } catch (error) {
        // Agar bot khud group admin nahi hoga to catch error chalega
        await sock.sendMessage(from, { 
            text: "❌ Failed to promote! Make sure the bot is an Admin in this group." 
        }, { quoted: msg });
    }
}

module.exports = promoteCommand;
