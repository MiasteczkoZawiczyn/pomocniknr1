const { Client, GatewayIntentBits, Partials, AttachmentBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const axios = require('axios');
const fontkit = require('@pdf-lib/fontkit');

const CONFIG = {
    TOKEN: process.env.TOKEN,
    REQUIRED_ROLE: "1437194858375680102",
    WARN_LOG_CHANNEL: "1441576106556788766",
    TIKTOK_CHANNEL: "1437380571180306534",
    VACATION_CHANNEL: "1452784717802766397",
    WATERMARK_URL: "https://discord.gg/TESTYPL",
    WATERMARK_TEXT: "DISCORD.GG/TESTYPL",
    DISCORD_USER1: "manager3194",
    DISCORD_USER2: "duns0649",
    FONTS: {
        regular: "https://raw.githubusercontent.com/MiasteczkoZawiczyn/pomocniknr1/main/Helvetica.ttf",
        bold: "https://raw.githubusercontent.com/MiasteczkoZawiczyn/pomocniknr1/main/Helvetica-Bold.ttf"
    }
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Prosta baza danych w pamięci (dla stabilności na Render użyj bazy zewnętrznej, np. MongoDB)
let db = { warns: [], vacations: [] };

// --- FUNKCJA PDF (STOPKA 1:1) ---
async function addWatermark(pdfBytes) {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);

    const fontBytesBold = await axios.get(CONFIG.FONTS.bold, { responseType: 'arraybuffer' });
    const fontBytesReg = await axios.get(CONFIG.FONTS.regular, { responseType: 'arraybuffer' });
    const customBold = await pdfDoc.embedFont(fontBytesBold.data);
    const customReg = await pdfDoc.embedFont(fontBytesReg.data);

    const pages = pdfDoc.getPages();
    const now = new Date().toISOString().replace('T', '/').slice(0, 16);

    for (const page of pages) {
        const { width, height } = page.getSize();

        // Niebieskie ramki
        const lightBlue = rgb(0.9, 0.95, 1.0);
        page.drawRectangle({ x: 0, y: 0, width, height: 50, color: lightBlue }); // Dół
        page.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: lightBlue }); // Góra
        page.drawRectangle({ x: width - 18, y: 0, width: 18, height, color: lightBlue }); // Prawa
        page.drawRectangle({ x: 0, y: 0, width: 15, height, color: lightBlue }); // Lewa

        // Środkowe znaki wodne
        for (let i = 1; i <= 5; i++) {
            const sideOffset = i % 2 === 0 ? -30 : 30;
            page.drawText(CONFIG.WATERMARK_TEXT, {
                x: width / 2 + sideOffset,
                y: (height / 6) * i,
                size: 35,
                font: customBold,
                color: rgb(0, 0, 0),
                opacity: 0.07,
                rotate: degrees(i % 2 === 0 ? 15 : -15),
            });
        }

        // Teksty krawędziowe
        const sideTxtR = `DISCORD: ${CONFIG.DISCORD_USER1} | ${CONFIG.DISCORD_USER2} | ZAKUP: ${CONFIG.WATERMARK_TEXT} | EMAIL: nizekontakt@int.pl`;
        const bottomContact = `KONTAKT: ${CONFIG.DISCORD_USER1} | ${CONFIG.DISCORD_USER2} | nizekontakt@int.pl | nize@int.pl`;
        const purchaseTxt = `W CELU ZAKUPU LUB PYTAŃ: ${CONFIG.WATERMARK_TEXT}`;

        // Dół
        page.drawText(bottomContact, { x: width / 2 - (customBold.widthOfTextAtSize(bottomContact, 10) / 2), y: 35, size: 10, font: customBold });
        page.drawText(purchaseTxt, { x: width / 2 - (customBold.widthOfTextAtSize(purchaseTxt, 8) / 2), y: 23, size: 8, font: customBold });

        // Specjalna linia z copyright
        const cpLeft = "NIZE ";
        const cpSymbol = "©";
        const cpRight = ` 2026 - Wszelkie Prawa Zastrzeżone | DATA: ${now}`;
        const totalW = customReg.widthOfTextAtSize(cpLeft, 6.5) + customBold.widthOfTextAtSize(cpSymbol, 12) + customReg.widthOfTextAtSize(cpRight, 6.5);
        let startX = (width - totalW) / 2;

        page.drawText(cpLeft, { x: startX, y: 11, size: 6.5, font: customReg });
        startX += customReg.widthOfTextAtSize(cpLeft, 6.5);
        page.drawText(cpSymbol, { x: startX, y: 10, size: 12, font: customBold });
        startX += customBold.widthOfTextAtSize(cpSymbol, 12);
        page.drawText(cpRight, { x: startX, y: 11, size: 6.5, font: customReg });

        // Boki
        page.drawText(sideTxtR, { x: width - 8, y: height / 2 - (customBold.widthOfTextAtSize(sideTxtR, 9) / 2), size: 9, font: customBold, rotate: degrees(90) });
    }

    return await pdfDoc.save();
}

// --- LOGIKA BOTA ---

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Filtr TikToka
    if (message.channelId === CONFIG.TIKTOK_CHANNEL) {
        if (!message.content.includes('tiktok.com')) {
            return message.delete().catch(() => {});
        }
    }

    // 2. Automatyczna odpowiedź na urlop
    if (message.channelId === CONFIG.VACATION_CHANNEL) {
        message.reply(`Cześć ${message.author},\nTwój urlop został zapisany ale opiekun musi zatwierdzić twoje zgłoszenie. Otrzymasz informację o zatwierdzeniu.`);
    }

    // 3. Komendy (Tylko dla roli)
    if (!message.content.startsWith('!')) return;
    if (!message.member.roles.cache.has(CONFIG.REQUIRED_ROLE)) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !warn @osoba powód
    if (command === 'warn') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || "Brak powodu";
        if (!target) return message.reply("Oznacz osobę!");

        const warnId = Date.now();
        db.warns.push({ id: warnId, userId: target.id, reason, moderator: message.author.tag });

        const logChan = client.channels.cache.get(CONFIG.WARN_LOG_CHANNEL);
        const embed = new EmbedBuilder().setTitle("Nowy Warn").addFields(
            { name: "Użytkownik", value: `${target}` },
            { name: "Powód", value: reason },
            { name: "ID", value: `${warnId}` }
        ).setColor("Red");

        if (logChan) logChan.send({ embeds: [embed] });
        target.send(`Otrzymałeś warna na serwerze! Powód: ${reason}`).catch(() => {});
        message.reply(`Nadano warna użytkownikowi ${target}.`);
    }

    // !unwarn @osoba
    if (command === 'unwarn') {
        const target = message.mentions.members.first();
        if (!target) return message.reply("Oznacz osobę!");
        
        const userWarns = db.warns.filter(w => w.userId === target.id);
        if (userWarns.length === 0) return message.reply("Ten użytkownik nie ma warnów.");

        // Tutaj dla uproszczenia usuwamy ostatni. Możesz rozbudować o wybór ID.
        const removed = db.warns.splice(db.warns.findIndex(w => w.userId === target.id), 1);
        message.reply(`Usunięto warna o ID ${removed[0].id} dla ${target}.`);
    }

    // !urlopy
    if (command === 'urlopy') {
        if (db.vacations.length === 0) return message.reply("Brak aktywnych urlopów.");
        const list = db.vacations.map(v => `<@${v.userId}> do ${v.date}`).join('\n');
        message.reply(`Aktywne urlopy:\n${list}`);
    }
});

// Slash Commands / Interaction (Wysyłanie plików)
client.on('interactionCreate', async (interaction) => {
    // Uwaga: W Node.js komendy / wymagają rejestracji. 
    // Poniżej obsługa wiadomości z załącznikami jako komendy tekstowe dla ułatwienia, 
    // lub obsługa Slash jeśli je zarejestrujesz.
});

// Reakcja na urlop
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.message.channelId !== CONFIG.VACATION_CHANNEL) return;
    if (reaction.emoji.name === '✅') {
        const member = await reaction.message.guild.members.fetch(user.id);
        if (!member.roles.cache.has(CONFIG.REQUIRED_ROLE)) return;

        const content = reaction.message.content;
        const dateMatch = content.match(/(\d{2}\.\d{2}\.\d{4})/);
        const date = dateMatch ? dateMatch[0] : "Nieokreślony";

        db.vacations.push({ userId: reaction.message.author.id, date });
        
        reaction.message.reply(`✅ Twój urlop do dnia ${date} został zatwierdzony!`);
        reaction.message.author.send(`Twój urlop został zatwierdzony do ${date}.`).catch(() => {});
    }
});

// Anty-uśpienie (dla cron-job.org)
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000);

client.login(CONFIG.TOKEN);
