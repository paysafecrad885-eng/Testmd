// commands/chfollow.js

async function chfollowCommand(sock, from, msg, isAdmin, session, args, sessions) {
    try {
        // 1. Owner / Admin Check
        if (!isAdmin) {
            return await sock.sendMessage(from, { text: "❌ Only owner or admin can execute this command!" }, { quoted: msg });
        }

        const input = args[0];

        // 2. Input validation check
        if (!input) {
            return await sock.sendMessage(from, { 
                text: "❌ Please provide a valid WhatsApp Channel Link or Channel JID.\n\nUsage:\n`.chfollow https://whatsapp.com/channel/xxxxxxxxx`" 
            }, { quoted: msg });
        }

        // 3. Extract Invite Code or JID from URL
        let inviteCode = input;
        if (input.includes('whatsapp.com/channel/')) {
            inviteCode = input.split('whatsapp.com/channel/')[1].split('/')[0].trim();
        }

        await sock.sendMessage(from, { text: `⏳ Processing mass channel follow request for invite/JID: *${inviteCode}*...` }, { quoted: msg });

        // Active Connected Sessions Collect Karein
        const activeSessions = Object.values(sessions).filter(s => s && s.isConnected && s.sock);
        const totalBots = activeSessions.length;

        if (totalBots === 0) {
            return await sock.sendMessage(from, { text: "❌ No active bot sessions found to execute follow." }, { quoted: msg });
        }

        let successCount = 0;
        let failCount = 0;

        // First session se Channel Metadata fetch karein (Channel ID nikalne ke liye)
        let channelJid = inviteCode;
        if (!inviteCode.endsWith('@newsletter')) {
            try {
                const metadata = await sock.newsletterMetadata('invite', inviteCode);
                if (metadata && metadata.id) {
                    channelJid = metadata.id;
                } else {
                    return await sock.sendMessage(from, { text: "❌ Invalid WhatsApp Channel invite link." }, { quoted: msg });
                }
            } catch (err) {
                return await sock.sendMessage(from, { text: `❌ Could not resolve channel invite link: ${err.message}` }, { quoted: msg });
            }
        }

        // 4. Sabhi Connected Bots Se Loop Karein Aur Auto-Follow Karwayein
        for (const currentSession of activeSessions) {
            try {
                if (typeof currentSession.sock.newsletterFollow === 'function') {
                    await currentSession.sock.newsletterFollow(channelJid);
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                failCount++;
                console.error(`[ChFollow Error] Session ${currentSession.userId} failed:`, err?.message || err);
            }
            // Rapid Rate-limit ban se bachne ke liye 1 second ka delay
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 5. Final Summary Output Send Karein
        const responseMessage = `✅ **MASS CHANNEL FOLLOW COMPLETED** ✅\n\n` +
                                `🎯 **Total Connected Bots:** ${totalBots}\n` +
                                `💚 **Successfully Followed:** ${successCount}\n` +
                                `❌ **Failed / Unsupported:** ${failCount}\n\n` +
                                `📢 Channel JID: \`${channelJid}\``;

        await sock.sendMessage(from, { text: responseMessage }, { quoted: msg });

    } catch (error) {
        console.error("chfollowCommand Error:", error);
        await sock.sendMessage(from, { text: `❌ Error executing mass follow: ${error.message}` }, { quoted: msg });
    }
}

module.exports = chfollowCommand;
