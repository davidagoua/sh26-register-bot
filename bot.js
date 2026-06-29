const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const mime = require('mime-types');
const path = require('path');

// Dossiers de stockage
const UPLOAD_DIR = './inscriptions_photos';
const PDF_DIR = './inscriptions_pdf';
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(PDF_DIR);

const DB_FILE = './utilisateurs.json';
if (!fs.existsSync(DB_FILE)) fs.writeJsonSync(DB_FILE, {});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', (qr) => {
    console.log('Scannez ce QR Code avec WhatsApp :');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Le bot WhatsApp est prêt !');
});

const sessions = {};

// Fonction pour générer le code HTML personnalisé à partir de vos variables
function genererHtmlFiche(data) {
    // Note : Pour l'image de profil et le logo, convertissez-les idéalement en base64 
    // ou passez des chemins absolus compréhensibles par Puppeteer (ex: `file://...`)
    const photoAbsolue = path.resolve(data.photoPath);
    
    return `
    <!doctype html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>Badge Inscription</title>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 20px; background-color: #ffffff; }
            .border { border: 1px solid #dee2e6!important; }
            .rounded { border-radius: .25rem!important; }
            .p-3 { padding: 1rem!important; }
            .m-3 { margin: 1rem!important; }
            .text-center { text-align: center!important; }
            hr { margin-top: 1rem; margin-bottom: 1rem; border: 0; border-top: 1px solid rgba(0,0,0,.1); }
            .row { display: flex; flex-wrap: wrap; }
            .col-left { width: 30%; padding-right: 15px; }
            .col-right { width: 70%; }
            .w-100 { width: 100%!important; }
            .mt-2 { margin-top: .5rem!important; }
            .field-row { display: flex; margin-bottom: 8px; border-bottom: 1px dashed #efefef; padding-bottom: 5px; }
            .field-label { width: 40%; font-weight: bold; }
            .field-value { width: 60%; font-style: italic; color: #555; }
            .img-profile { width: 120px; height: 150px; object-fit: cover; border: 2px solid #ddd; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div id="section-pdf" class="p-3 border rounded m-3">
            <div class="text-center">
                <!-- Remplacer par l'URL de votre logo en ligne ou une image base64 -->
                <h2 style="margin:0; color:#111;">Sacerdoce des Héritiers - S'24</h2>
            </div>
            <hr>
            <div class="row">
                <div class="col-left text-center">
                    <div>
                        <!-- On utilise le protocole file:// pour que Puppeteer lise le fichier local -->
                        <img src="file://${photoAbsolue}" class="img-profile" alt="Photo de profil">
                    </div>
                    <div class="mt-2" style="font-weight: bold; color: #007bff;">
                        ID: ${data.participantId}
                    </div>
                    <div class="mt-2" style="font-size: 12px; color: #666;">
                        Contact Wave:<br>0101495342
                    </div>
                </div>
                <div class="col-right">
                    <div class="field-row"><div class="field-label">Nom:</div><div class="field-value">${data.nom}</div></div>
                    <div class="field-row"><div class="field-label">Prénoms:</div><div class="field-value">${data.prenom}</div></div>
                    <div class="field-row"><div class="field-label">Date de naissance:</div><div class="field-value">${data.dateNaissance}</div></div>
                    <div class="field-row"><div class="field-label">Lieu de naissance:</div><div class="field-value">${data.lieuNaissance}</div></div>
                    <div class="field-row"><div class="field-label">Contact:</div><div class="field-value">${data.telephone}</div></div>
                    <div class="field-row"><div class="field-label">Adresse:</div><div class="field-value">${data.adresse}</div></div>
                    <div class="field-row"><div class="field-label">Date d'entretien:</div><div class="field-value">07 Août 2026</div></div>
                </div>
            </div>
        </div>
    </body>
    </html>`;
}

client.on('message', async (msg) => {
    const chatId = msg.from;
    const text = msg.body ? msg.body.trim() : '';

    if (!sessions[chatId]) {
        sessions[chatId] = { step: 'IDLE', data: {} };
    }

    const session = sessions[chatId];

    if (text.toLowerCase() === 'annuler' || text.toLowerCase() === 'recommencer') {
        sessions[chatId] = { step: 'IDLE', data: {} };
        await msg.reply("L'inscription a été annulée. Tapez 'Inscription' pour recommencer.");
        return;
    }

    switch (session.step) {
        case 'IDLE':
            if (text.toLowerCase().includes('inscr') || text.toLowerCase() === 'bonjour') {
                session.step = 'NOM';
                await msg.reply("Bonjour ! Débutons votre inscription. Quel est votre **Nom de famille** ?");
            } else {
                await msg.reply("Bonjour ! Tapez *'Inscription'* pour démarrer.");
            }
            break;

        case 'NOM':
            session.data.nom = text.toUpperCase();
            session.step = 'PRENOM';
            await msg.reply("Merci. Quel est votre **Prénom** ?");
            break;

        case 'PRENOM':
            session.data.prenom = text;
            session.step = 'DATE_NAISSANCE';
            await msg.reply("Quelle est votre **Date de naissance** ? (JJ/MM/AAAA)");
            break;

        case 'DATE_NAISSANCE':
            if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
                await msg.reply("Format invalide (JJ/MM/AAAA) :");
                return;
            }
            session.data.dateNaissance = text;
            session.step = 'LIEU_NAISSANCE';
            await msg.reply("Quel est votre **Lieu de naissance** ?");
            break;

        case 'LIEU_NAISSANCE':
            session.data.lieuNaissance = text;
            session.step = 'ADRESSE';
            await msg.reply("Quelle est votre **Adresse de résidence** complète ?");
            break;

        case 'ADRESSE':
            session.data.adresse = text;
            session.step = 'TELEPHONE';
            await msg.reply("Quel est votre **Numéro de téléphone** de contact ?");
            break;

        case 'TELEPHONE':
            session.data.telephone = text;
            session.step = 'PHOTO';
            await msg.reply("📸 Veuillez envoyer votre **Photo d'identité**.");
            break;

        case 'PHOTO':
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (!media.mimetype.startsWith('image/')) {
                        await msg.reply("Fichier invalide, envoyez une image.");
                        return;
                    }

                    const extension = mime.extension(media.mimetype);
                    const filename = `${chatId.replace('@c.us', '')}_${Date.now()}.${extension}`;
                    const filePath = path.join(UPLOAD_DIR, filename);
                    
                    await fs.writeFile(filePath, media.data, 'base64');
                    
                    // Générer un ID Participant unique à 4 chiffres pour le badge
                    const randomId = Math.floor(1000 + Math.random() * 9000);
                    
                    session.data.photoPath = filePath;
                    session.data.participantId = `SH-26-${randomId}`; // ID Dynamique
                    session.step = 'CONFIRMATION';

                    const recap = `📋 *Récapitulatif :*\n\n` +
                                  `• *Nom :* ${session.data.nom}\n` +
                                  `• *Prénom :* ${session.data.prenom}\n` +
                                  `• *Téléphone :* ${session.data.telephone}\n\n` +
                                  `Est-ce correct ? Répondez par *OUI* ou *NON*.`;
                    
                    await msg.reply(recap);

                } catch (error) {
                    console.error(error);
                    await msg.reply("Erreur lors de la réception de la photo. Réessayez.");
                }
            } else {
                await msg.reply("Veuillez envoyer une photo.");
            }
            break;

        case 'CONFIRMATION':
            if (text.toLowerCase() === 'oui') {
                await msg.reply("⏳ Génération de votre fiche d'inscription en cours, veuillez patienter...");

                try {
                    // Sauvegarde dans la base de données JSON
                    const db = await fs.readJson(DB_FILE);
                    db[chatId] = { ...session.data, dateInscription: new Date().toISOString() };
                    await fs.writeJson(DB_FILE, db, { spaces: 2 });

                    // --- GÉNÉRATION DU PDF VIA L'INSTANCE PUPPETEER DU BOT ---
                    const htmlContent = genererHtmlFiche(session.data);
                    
                    // On récupère l'instance de navigateur de whatsapp-web.js
                    const browser = client.pupBrowser; 
                    const page = await browser.newPage();
                    
                    // Charger le contenu HTML dans la page Puppeteer
                    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                    
                    // Définir le chemin de sortie du PDF
                    const pdfPath = path.join(PDF_DIR, `${session.data.participantId}.pdf`);
                    
                    // Création effective du fichier PDF (format A5 ou dimension personnalisée pour les fiches)
                    await page.pdf({
                        path: pdfPath,
                        format: 'A5',
                        printBackground: true // Indispensable pour garder les fonds et bordures
                    });
                    
                    await page.close(); // On ferme l'onglet temporaire

                    // --- ENVOI DU PDF SUR WHATSAPP ---
                    const pdfMedia = MessageMedia.fromFilePath(pdfPath);
                    await client.sendMessage(chatId, pdfMedia, { 
                        caption: `🎉 Inscription validée ! Voici votre fiche d'inscription officielle pour l'entretien.` 
                    });

                    // Réinitialisation de la session
                    sessions[chatId] = { step: 'IDLE', data: {} };

                } catch (err) {
                    console.error("Erreur de génération PDF :", err);
                    await msg.reply("Félicitations, votre inscription est validée, mais une erreur est survenue lors de l'envoi de la fiche PDF. Nos équipes vous contacteront.");
                    sessions[chatId] = { step: 'IDLE', data: {} };
                }
            } else if (text.toLowerCase() === 'non') {
                sessions[chatId] = { step: 'IDLE', data: {} };
                await msg.reply("Recommençons. Quel est votre **Nom de famille** ?");
                sessions[chatId].step = 'NOM';
            } else {
                await msg.reply("Répondez par *OUI* ou *NON*.");
            }
            break;
    }
});

client.initialize();