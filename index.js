require('dotenv').config();
const { Client, GatewayIntentBits, Partials, AttachmentBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const axios = require('axios');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// --- KONFIGURACJA ---
const CONFIG = {
    ADMIN_ROLE: "1437194858375680102",
    TIKTOK_CHANNEL: "1437380571180306534",
    WARN_LOG_CHANNEL: "1441576106556788766",
    VACATION_CHANNEL: "1452784717802766397",
    WATERMARK_URL: "https://discord.gg/TESTYPL",
    WATERMARK_TEXT: "DISCORD.GG/TESTYPL"
};

// Baza danych w pamięci (dla Render/produkcji zalecany MongoDB/SQLite)
let warns = [];
let vacations = [];

// --- LOGIKA PDF (STOPKA 1:1) ---
async function addWatermark(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const page of pages) {
        const { width, height } = page.getSize();

        // 1. Niebieskie ramki
        page.drawRectangle({ x: 0, y: 0, width, height: 50, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: width - 18, y: 0, width: 18, height, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: 0, width: 15, height, color: rgb(0.9, 0.95, 1) });

        // 2. Środkowe znaki wodne (Skośne)
        for (let i = 1; i <= 5; i++) {
            const sideOffset = i % 2 === 0 ? -30 : 30;
            page.drawText(CONFIG.WATERMARK_TEXT, {
                x: width / 2 + sideOffset,
                y: (height / 6) * i,
                size: 35,
                font: boldFont,
                color: rgb(0, 0, 0),
                opacity: 0.07,
                rotate: degrees(i % 2 === 0 ? 15 : -15),
            });
        }

        // 3. Teksty krawędziowe i stopka
        const now = new Date().toISOString().replace(/T/, '/').replace(/\..+/, '').slice(0, 16);
        
        // Góra
        page.drawText(`DOKUMENT WYGENEROWANY DLA: ${CONFIG.WATERMARK_TEXT}`, {
            x: width / 2 - 100, y: height - 13, size: 8, font: boldFont
        });

        // Dół
        page.drawText(`KONTAKT: manager3194 | duns0649 | nizekontakt@int.pl | nize@int.pl`, {
            x: width / 2 - 150, y: 35, size: 10, font: boldFont
        });

        // Linia z ©
        const footerText = `NIZE © 2026 - Wszelkie Prawa Zastrzeżone | DATA: ${now}`;
        page.drawText(footerText, { x: width / 2 - 130, y: 11, size: 6.5, font: regularFont });
    }

    return await pdfDoc.save();
}

// --- OBSŁUGA WIADOMOŚCI ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Anty-spam TikTok
    if (message.channelId === CONFIG.TIKTOK_CHANNEL) {
        if (!message.content.includes('tiktok.com')) {
            await message.delete().catch(() => {});
            return;
        }
    }

    // 2. System Urlopów (Wykrywanie postu)
    if (message.channelId === CONFIG.VACATION_CHANNEL) {
        await message.reply(`Cześć ${message.author}, Twój urlop został zapisany, ale opiekun musi zatwierdzić twoje zgłoszenie. Otrzymasz informację o zatwierdzeniu.`);
    }

    // --- KOMENDY ---
    if (!message.content.startsWith('!')) return;
    const args = message.content.slice(1).split(' ');
    const command = args.shift().toLowerCase();
    const hasRole = message.member?.roles.cache.has(CONFIG.ADMIN_ROLE);

    if (!hasRole) return;

    // !warn @user powód
    if (command === 'warn') {
        const target = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || "Brak powodu";
        if (!target) return message.reply("Oznacz osobę!");

        const warnId = Date.now();
        const warnEntry = { id: warnId, userId: target.id, reason, admin: message.author.tag };
        warns.push(warnEntry);

        const logChan = client.channels.cache.get(CONFIG.WARN_LOG_CHANNEL);
        const warnEmbed = new EmbedBuilder()
            .setTitle("Otrzymano Warna")
            .setDescription(`ID: ${warnId}\nPowód: ${reason}\nPrzez: ${message.author.tag}`)
            .setColor(0xFF0000);

        await logChan.send({ content: `Warn dla ${target}`, embeds: [warnEmbed] });
        await target.send(`Dostałeś warna na serwerze! Powód: ${reason}`).catch(() => {});
        message.reply(`Nadano warna użytkownikowi ${target.tag}`);
    }

    // !urlopy
    if (command === 'urlopy') {
        const list = vacations.map(v => `<@${v.userId}> do ${v.date}`).join('\n') || "Brak aktywnych urlopów.";
        message.reply(`**Aktywne urlopy:**\n${list}`);
    }
});

// --- SYSTEM REAKCJI (Zatwierdzanie urlopów) ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name === '✅' && reaction.message.channelId === CONFIG.VACATION_CHANNEL) {
        const member = await reaction.message.guild.members.fetch(user.id);
        if (!member.roles.cache.has(CONFIG.ADMIN_ROLE)) return;

        const content = reaction.message.content;
        const dateMatch = content.match(/do dnia (\d{2}\.\d{2}\.\d{4})/);
        
        if (dateMatch) {
            const date = dateMatch[1];
            vacations.push({ userId: reaction.message.author.id, date });
            
            await reaction.message.reply(`✅ Urlop użytkownika <@${reaction.message.author.id}> został zatwierdzony do ${date}.`);
            await reaction.message.author.send(`Twój urlop do ${date} został zatwierdzony!`).catch(() => {});
        }
    }
});

// --- SLASH COMMANDS (Wysyłanie plików) ---
// Note: Node.js Discord.js v14 używa InteractionCreate dla "/"
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'wiad' || interaction.commandName === 'pv') {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('kanal');
        const user = interaction.options.getUser('osoba');
        const subject = interaction.options.getString('temat');
        const text = interaction.options.getString('wiadomosc');
        const files = [];

        for (let i = 1; i <= 5; i++) {
            const file = interaction.options.getAttachment(`plik${i}`);
            if (file && file.contentType === 'application/pdf') {
                const response = await axios.get(file.url, { responseType: 'arraybuffer' });
                const processedPdf = await addWatermark(response.data);
                files.push(new AttachmentBuilder(Buffer.from(processedPdf), { name: `NIZE_${file.name}` }));
            }
        }

        const target = channel || user;
        await target.send({ content: `**${subject}**\n${text}`, files });
        await interaction.editReply("Wysłano pomyślnie!");
    }
});

// Zapobieganie uśpieniu (Cron-job)
client.on('ready', () => {
    console.log(`✅ Bot NIZE online jako ${client.user.tag}`);
    // Endpoint dla cron-job.org (jeśli używasz express)
});

client.login(process.env.TOKEN);
