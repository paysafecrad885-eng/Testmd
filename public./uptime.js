// commands/uptime.js
const process = require('process');

async function uptimeCommand(sock, from, msg) {
    try {
        const totalSeconds = Math.floor(process.uptime());
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const uptimeText = `⏱️ *BOT UPTIME*\n\n` +
                           `⌛ *Running Time:* ${hours}h ${minutes}m ${seconds}s`;
        await sock.sendMessage(from, { text: uptimeText }, { quoted: msg });
    } catch (error) {
        console.error("Error in uptime command:", error);
    }
}

module.exports = uptimeCommand;
