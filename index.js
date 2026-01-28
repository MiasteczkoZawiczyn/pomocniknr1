require('dotenv').config();
const { Client, GatewayIntentBits, Partials, AttachmentBuilder, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const axios = require('axios');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot NIZE is active!'));
app.listen(process.env.PORT || 10000, () => console.log('Serwer HTTP gotowy.'));

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
    WATERMARK_TEXT: "DISCORD.GG/TESTYPL",
    DISCORD_USER1: "manager3194",
    DISCORD_USER2: "duns0649"
};

// Baza danych w pamięci
let warns = [];
let vacations = [];

// --- GENEROWANIE STOPKI PDF (1:1 z Twoim wzorem) ---
async function addWatermark(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const page of pages) {
        const { width, height } = page.getSize();

        // Niebieskie ramki
        page.drawRectangle({ x: 0, y: 0, width, height: 50, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: width - 18, y: 0, width: 18, height, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: 0, width: 15, height, color: rgb(0.9, 0.95, 1) });

        // Środkowe znaki wodne (Skośne)
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

        // Małe maile w losowych miejscach
        const emails = ["nize@int.pl", "nizekontakt@int.pl"];
        emails.forEach(mail => {
            page.drawText(mail, {
                x: Math.random() * (width * 0.5) + (width * 0.25),
                y: Math.random() * (height * 0.5) + (height * 0.25),
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0),
                opacity: 0.1,
                rotate: degrees(25)
            });
        });

        // Teksty krawędziowe
        const sideTextR = `DISCORD: ${CONFIG.DISCORD_USER1} | ${CONFIG.DISCORD_USER2} | ZAKUP: ${CONFIG.WATERMARK_TEXT} | EMAIL: nizekontakt@int.pl`;
        page.drawText(sideTextR, { x: width - 8, y: height / 2 - 100, size: 9, font: boldFont, rotate: degrees(90) });

        const sideTextL = `DISCORD: ${CONFIG.DISCORD_USER1} | ${CONFIG.DISCORD_USER2} | ZAKUP: ${CONFIG.WATERMARK_TEXT} | EMAIL: nize@int.pl`;
        page.drawText(sideTextL, { x: 8, y: height / 2 - 100, size: 9, font: boldFont, rotate: degrees(90) });

        // Stopka dół
        const now = new Date().toISOString().replace(/T/, '/').slice(0, 16).replace('-', '/');
        page.drawText(`DOKUMENT WYGENEROWANY DLA: ${CONFIG.WATERMARK_TEXT}`, { x: width / 2 - 120, y: height - 13, size: 8, font: boldFont });
        page.drawText(`KONTAKT: ${CONFIG.DISCORD_USER1} | ${CONFIG.DISCORD_USER2} | nizekontakt@int.pl | nize@int.pl`, { x: width / 2 - 160, y: 35, size: 10, font: boldFont });
        page.drawText(`W CELU ZAKUPU LUB PYTAŃ: ${CONFIG.WATERMARK_TEXT}`, { x: width / 2 - 100, y: 23, size: 8, font: boldFont });

        // Specjalna linia z ©
        const footerBase = `NIZE © 2026 - Wszelkie Prawa Zastrzeżone | DATA: ${now}`;
        page.drawText(footerBase, { x: width / 2 - 140, y: 11, size: 6.5, font: regularFont });
    }
    return await pdfDoc.save();
}

// --- LOGIKA WIADOMOŚCI ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Anty-Link TikTok
    if (message.channelId === CONFIG.TIKTOK_CHANNEL) {
        if (!message.content.includes('tiktok.com')) {
            return message.delete().catch(() => {});
        }
    }

    // 2. Automatyczna odpowiedź na urlop
    if (message.channelId === CONFIG.VACATION_CHANNEL) {
        await message.reply(`Cześć ${message.author},\nTwój urlop został zapisany ale opiekun musi zatwierdzić twoje zgłoszenie. Otrzymasz informację o zatwierdzeniu.`);
    }

    // 3. Komendy Prefiksowe (!warn, !unwarn, !urlopy)
    if (!message.content.startsWith('!')) return;
    const args = message.content.slice(1).split(/ +/);
    const command = args.shift().toLowerCase();
    const isAdmin = message.member?.roles.cache.has(CONFIG.ADMIN_ROLE);

    if (!isAdmin) return;

    if (command === 'warn') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || "Brak powodu";
        if (!target) return message.reply("Oznacz osobę!");

        const warnObj = { id: Date.now(), userId: target.id, reason, admin: message.author.tag };
        warns.push(warnObj);

        const logChan = client.channels.cache.get(CONFIG.WARN_LOG_CHANNEL);
        if (logChan) {
            logChan.send(`⚠️ **WARN** | ID: \`${warnObj.id}\` | Użytkownik: ${target} | Powód: ${reason} | Przez: ${message.author.tag}`);
        }
        await target.send(`Dostałeś warna! Powód: ${reason}`).catch(() => {});
        message.reply(`Nadano warna użytkownikowi ${target.user.tag}`);
    }

    if (command === 'unwarn') {
        const target = message.mentions.members.first();
        if (!target) return message.reply("Oznacz osobę!");
        
        const userWarns = warns.filter(w => w.userId === target.id);
        if (userWarns.length === 0) return message.reply("Ta osoba nie ma warnów.");

        const row = new ActionRowBuilder();
        userWarns.slice(0, 5).forEach(w => {
            row.addComponents(new ButtonBuilder().setCustomId(`unwarn_${w.id}`).setLabel(`Usuń: ${w.reason.slice(0, 10)}`).setStyle(ButtonStyle.Danger));
        });

        message.reply({ content: `Wybierz warn do usunięcia dla ${target}:`, components: [row] });
    }

    if (command === 'urlopy') {
        const active = vacations.map(v => `<@${v.userId}> - do ${v.date}`).join('\n') || "Brak urlopów.";
        message.reply(`**Aktywne urlopy:**\n${active}`);
    }
});

// --- REAKCJE (Zatwierdzanie urlopu) ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name === '✅' && reaction.message.channelId === CONFIG.VACATION_CHANNEL) {
        const member = await reaction.message.guild.members.fetch(user.id);
        if (!member.roles.cache.has(CONFIG.ADMIN_ROLE)) return;

        // Wyciąganie daty ze wzoru: "do dnia 29.01.2026"
        const dateMatch = reaction.message.content.match(/do dnia (\d{2}\.\d{2}\.\d{4})/);
        if (dateMatch) {
            const date = dateMatch[1];
            vacations.push({ userId: reaction.message.author.id, date });
            await reaction.message.reply(`✅ Urlop użytkownika <@${reaction.message.author.id}> został zatwierdzony do dnia ${date}.`);
            await reaction.message.author.send(`Twój urlop został zatwierdzony do ${date}!`).catch(() => {});
        }
    }
});

// --- SLASH COMMANDS (/wiad, /pv) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('unwarn_')) {
            const warnId = parseInt(interaction.customId.split('_')[1]);
            warns = warns.filter(w => w.id !== warnId);
            await interaction.update({ content: "✅ Warn został usunięty z systemu.", components: [] });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'wiad' || interaction.commandName === 'pv') {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('kanal');
        const targetUser = interaction.options.getUser('osoba');
        const subject = interaction.options.getString('temat');
        const body = interaction.options.getString('wiadomosc');
        
        const files = [];
        for (let i = 1; i <= 5; i++) {
            const file = interaction.options.getAttachment(`plik${i}`);
            if (file && file.contentType === 'application/pdf') {
                const res = await axios.get(file.url, { responseType: 'arraybuffer' });
                const modified = await addWatermark(res.data);
                files.push(new AttachmentBuilder(Buffer.from(modified), { name: `NIZE_${file.name}` }));
            }
        }

        try {
            const sendTarget = interaction.commandName === 'wiad' ? channel : targetUser;
            await sendTarget.send({ content: `## ${subject}\n${body}`, files });
            await interaction.editReply("Wysłano pomyślnie.");
        } catch (e) {
            await interaction.editReply("Błąd wysyłania: " + e.message);
        }
    }
});

client.login(process.env.TOKEN);
