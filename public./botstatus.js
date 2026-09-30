// commands/botstatus.js
const process = require('process');

async function botstatusCommand(sock, from, msg, sessions, botData) {
    try {
        // Calculate Total Connected Sessions / Devices
        const activeSessions = Object.values(sessions).filter(s => s && s.isConnected);
        const totalConnectedDevices = activeSessions.length;

        // Calculate Total Registered Users / Sessions in system
        const totalRegisteredUsers = Object.keys(sessions).length;

        // System Uptime Calculation
        const uptimeSeconds = Math.floor(process.uptime());
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const uptimeString = `${hours}h ${minutes}m ${seconds}s`;

        // RAM Usage Calculation
        const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

        const statusReport = `📊 *BOT SYSTEM STATUS* 📊\n\n` +
                             `📱 *Connected Devices:* ${totalConnectedDevices}\n` +
                             `👥 *Total Bot Users:* ${totalRegisteredUsers}\n` +
                             `⏱️ *System Uptime:* ${uptimeString}\n` +
                             `💾 *RAM Usage:* ${memoryUsage} MB\n` +
                             `⚡ *Status:* Operational ✅\n\n` +
                             `⚡ *POWERED BY:* ‎ⒶⓁI-ⓂⒹ`;

        await sock.sendMessage(from, { text: statusReport }, { quoted: msg });

    } catch (error) {
        console.error("BotStatus Command Error:", error);
        await sock.sendMessage(from, { text: `❌ Error fetching status: ${error.message}` }, { quoted: msg });
    }
}

module.exports = botstatusCommand;
