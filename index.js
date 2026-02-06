const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const axios = require('axios');

// --- KONFIGURACJA ---
const TOKEN = 'MTQ2NjA0MTg2OTg2Njc2MjI2MA.G-0vgP.umgJNTql-6s4bv6wd23nqauZOG4pM4BEsO9ylI';
const CLIENT_ID = '1466041869866762260';
const WATERMARK_URL = "https://discord.gg/TESTYPL";
const WATERMARK_TEXT_DISPLAY = "DISCORD.GG/TESTYPL";
const DISCORD_USERNAME = "manager3194";
const DISCORD_USERNAME_2 = "duns0649";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- FUNKCJA NAKŁADANIA WATERMARKA ---
async function addWatermark(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const page of pages) {
        const { width, height } = page.getSize();

        // 1. Niebieskie ramki (tło góra i dół)
        page.drawRectangle({
            x: 0, y: 0, width: width, height: 50,
            color: rgb(0.9, 0.95, 1.0),
        });
        page.drawRectangle({
            x: 0, y: height - 20, width: width, height: 20,
            color: rgb(0.9, 0.95, 1.0),
        });

        // 2. Środkowe znaki wodne (duże, przezroczyste)
        for (let i = 1; i <= 5; i++) {
            const sideOffset = i % 2 === 0 ? -30 : 30;
            page.drawText(WATERMARK_TEXT_DISPLAY, {
                x: width / 2 + sideOffset - 100, // Wyśrodkowanie tekstu
                y: (height / 6) * i,
                size: 35,
                font: helveticaBold,
                color: rgb(0, 0, 0),
                opacity: 0.07,
                rotate: degrees(i % 2 === 0 ? 15 : -15),
            });
        }

        // 3. Małe maile rozsypane (dodatek dla bezpieczeństwa)
        const emails = ["nize@int.pl", "nizekontakt@int.pl"];
        emails.forEach(email => {
            page.drawText(email, {
                x: Math.random() * (width * 0.5) + (width * 0.2),
                y: Math.random() * (height * 0.5) + (height * 0.2),
                size: 10,
                font: helveticaBold,
                color: rgb(0, 0, 0),
                opacity: 0.1,
                rotate: degrees(25)
            });
        });

        // 4. Teksty na górze i dole
        // Góra
        page.drawText(`DOKUMENT WYGENEROWANY DLA: ${WATERMARK_TEXT_DISPLAY}`, {
            x: width / 2 - (helveticaBold.widthOfTextAtSize(`DOKUMENT WYGENEROWANY DLA: ${WATERMARK_TEXT_DISPLAY}`, 8) / 2),
            y: height - 13, size: 8, font: helveticaBold, color: rgb(0, 0, 0)
        });

        // Kontakt (środek stopki)
        const txtContact = `KONTAKT: ${DISCORD_USERNAME} | ${DISCORD_USERNAME_2} | nizekontakt@int.pl | nize@int.pl`;
        page.drawText(txtContact, {
            x: width / 2 - (helveticaBold.widthOfTextAtSize(txtContact, 10) / 2),
            y: 35, size: 10, font: helveticaBold, color: rgb(0, 0, 0)
        });

        // Zakup (pod kontaktem)
        const txtPurchase = `W CELU ZAKUPU LUB PYTAŃ: ${WATERMARK_TEXT_DISPLAY}`;
        page.drawText(txtPurchase, {
            x: width / 2 - (helveticaBold.widthOfTextAtSize(txtPurchase, 8) / 2),
            y: 23, size: 8, font: helveticaBold, color: rgb(0, 0, 0)
        });

        // Prawa autorskie i Data
        const time = new Date().toISOString().replace(/T/, ' ').substring(0, 16).replace('-', '/');
        const txtCopyright = `NIZE © 2026 - Wszelkie Prawa Zastrzeżone | DATA: ${time}`;
        page.drawText(txtCopyright, {
            x: width / 2 - (helvetica.widthOfTextAtSize(txtCopyright, 7) / 2),
            y: 11, size: 7, font: helvetica, color: rgb(0, 0, 0)
        });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

// --- REJESTRACJA KOMEND SLASH ---
const commands = [
    new SlashCommandBuilder()
        .setName('konw')
        .setDescription('Konwertuje PDF i wysyła na wybrany kanał')
        .addChannelOption(opt => opt.setName('kanal').setDescription('Gdzie wysłać wiadomość').setRequired(true))
        .addStringOption(opt => opt.setName('tytul').setDescription('Tytuł wiadomości').setRequired(true))
        .addStringOption(opt => opt.setName('wiadomosc').setDescription('Treść wiadomości').setRequired(true))
        .addAttachmentOption(opt => opt.setName('plik1').setDescription('Pierwszy plik PDF').setRequired(true))
        .addAttachmentOption(opt => opt.setName('plik2').setDescription('Drugi plik PDF').setRequired(false))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Komendy / zarejestrowane.');
    } catch (e) { console.error(e); }
})();

// --- OBSŁUGA ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'konw') {
        await interaction.deferReply({ ephemeral: true });

        const kanal = interaction.options.getChannel('kanal');
        const tytul = interaction.options.getString('tytul');
        const wiadomosc = interaction.options.getString('wiadomosc');
        
        const filesToProcess = [interaction.options.getAttachment('plik1')];
        const plik2 = interaction.options.getAttachment('plik2');
        if (plik2) filesToProcess.push(plik2);

        const processedFiles = [];

        for (const att of filesToProcess) {
            if (!att.name.toLowerCase().endsWith('.pdf')) continue;
            try {
                const response = await axios.get(att.url, { responseType: 'arraybuffer' });
                const pdf = await addWatermark(response.data);
                processedFiles.push(new AttachmentBuilder(pdf, { name: `NIZE_${att.name}` }));
            } catch (e) { console.error(e); }
        }

        const embed = new EmbedBuilder()
            .setTitle(tytul)
            .setDescription(wiadomosc)
            .setColor(0x0099FF)
            .setTimestamp();

        await kanal.send({ embeds: [embed], files: processedFiles });
        await interaction.editReply('✅ Przetworzono i wysłano pomyślnie!');
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!wyslij')) return;

    const attachments = Array.from(message.attachments.values()).filter(a => a.name.toLowerCase().endsWith('.pdf'));
    if (attachments.length === 0) return message.reply('❌ Załącz pliki PDF!');

    const statusMsg = await message.reply('⏳ Przetwarzam pliki, proszę czekać...');
    const processedFiles = [];

    for (const att of attachments) {
        try {
            const response = await axios.get(att.url, { responseType: 'arraybuffer' });
            const pdf = await addWatermark(response.data);
            processedFiles.push(new AttachmentBuilder(pdf, { name: `NIZE_${att.name}` }));
        } catch (e) { console.error(e); }
    }

    if (processedFiles.length > 0) {
        await message.channel.send({ content: `✅ Przetworzono ${processedFiles.length} plików:`, files: processedFiles });
    }
    await statusMsg.delete();
});

client.once('ready', () => console.log(`✅ Bot NIZE online jako ${client.user.tag}`));
client.login(TOKEN);
