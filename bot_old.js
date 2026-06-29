const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const mime = require('mime-types');
const path = require('path');

// Dossier où seront sauvegardées les photos d'identité
const UPLOAD_DIR = './inscriptions_photos';
fs.ensureDirSync(UPLOAD_DIR);

// Fichier JSON pour stocker les données des utilisateurs (Simule une base de données)
const DB_FILE = './utilisateurs.json';
if (!fs.existsSync(DB_FILE)) fs.writeJsonSync(DB_FILE, {});

// Initialisation du client WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

// Génération du QR Code dans le terminal pour se connecter
client.on('qr', (qr) => {
    console.log('Scannez ce QR Code avec votre application WhatsApp :');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Le bot WhatsApp est prêt et en ligne !');
});

// Structure pour suivre l'état de la conversation par utilisateur
// États possibles : 'IDLE', 'NOM', 'PRENOM', 'DATE_NAISSANCE', 'LIEU_NAISSANCE', 'ADRESSE', 'TELEPHONE', 'PHOTO', 'CONFIRMATION'
const sessions = {};

client.on('message', async (msg) => {
    const chatId = msg.from;
    const text = msg.body ? msg.body.trim() : '';

    // Initialiser la session si elle n'existe pas
    if (!sessions[chatId]) {
        sessions[chatId] = { step: 'IDLE', data: {} };
    }

    const session = sessions[chatId];

    // Commande pour réinitialiser à tout moment
    if (text.toLowerCase() === 'annuler' || text.toLowerCase() === 'recommencer') {
        sessions[chatId] = { step: 'IDLE', data: {} };
        await msg.reply("L'inscription a été annulée. Tapez 'Inscription' pour recommencer.");
        return;
    }

    // --- MACHINE À ÉTATS (LOGIQUE DU FORMULAIRE) ---
    switch (session.step) {
        
        case 'IDLE':
            if (text.toLowerCase().includes('inscr') || text.toLowerCase() === 'bonjour') {
                session.step = 'NOM';
                await msg.reply("Bonjour ! Bienvenue dans le processus d'inscription. 📝\n\nPour commencer, quel est votre **Nom de famille** ?\n*(Vous pouvez taper 'annuler' à tout moment)*");
            } else {
                await msg.reply("Bonjour ! Tapez *'Inscription'* pour démarrer le formulaire.");
            }
            break;

        case 'NOM':
            session.data.nom = text;
            session.step = 'PRENOM';
            await msg.reply("Merci. Quel est votre **Prénom** ?");
            break;

        case 'PRENOM':
            session.data.prenom = text;
            session.step = 'DATE_NAISSANCE';
            await msg.reply("Parfait. Quelle est votre **Date de naissance** ? (Format: JJ/MM/AAAA)");
            break;

        case 'DATE_NAISSANCE':
            // Validation basique du format de date
            if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
                await msg.reply("Format invalide. Veuillez entrer votre date au format JJ/MM/AAAA (ex: 25/08/1995) :");
                return;
            }
            session.data.dateNaissance = text;
            session.step = 'LIEU_NAISSANCE';
            await msg.reply("Quel est votre **Lieu de naissance** (Ville/Pays) ?");
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
            await msg.reply("📸 Étape importante : Veuillez envoyer votre **Photo d'identité**.\n(Prenez une photo ou joignez une image depuis votre galerie).");
            break;

        case 'PHOTO':
            // Vérifier si le message contient un média
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    
                    // Vérifier si c'est bien une image
                    if (!media.mimetype.startsWith('image/')) {
                        await msg.reply("Désolé, le fichier doit être une image. Veuillez réessayer.");
                        return;
                    }

                    // Sauvegarde locale de l'image
                    const extension = mime.extension(media.mimetype);
                    const filename = `${chatId}_${Date.now()}.${extension}`;
                    const filePath = path.join(UPLOAD_DIR, filename);
                    
                    await fs.writeFile(filePath, media.data, 'base64');
                    
                    session.data.photoPath = filePath; // Enregistre le chemin du fichier local
                    session.step = 'CONFIRMATION';

                    // Afficher le récapitulatif
                    const recap = `📋 *Récapitulatif de votre inscription :*\n\n` +
                                  `• *Nom :* ${session.data.nom}\n` +
                                  `• *Prénom :* ${session.data.prenom}\n` +
                                  `• *Né(e) le :* ${session.data.dateNaissance}\n` +
                                  `• *À :* ${session.data.lieuNaissance}\n` +
                                  `• *Adresse :* ${session.data.adresse}\n` +
                                  `• *Téléphone :* ${session.data.telephone}\n` +
                                  `• *Photo d'identité :* Reçue ✅\n\n` +
                                  `Est-ce que ces informations sont correctes ?\n` +
                                  `Répondez par *OUI* pour valider ou *NON* pour tout recommencer.`;
                    
                    await msg.reply(recap);

                } catch (error) {
                    console.error("Erreur lors du téléchargement de l'image:", error);
                    await msg.reply("Une erreur est survenue lors de la réception de la photo. Veuillez réessayer.");
                }
            } else {
                await msg.reply("Veuillez envoyer une image valide (photo d'identité) pour continuer.");
            }
            break;

        case 'CONFIRMATION':
            if (text.toLowerCase() === 'oui') {
                // Sauvegarde des données dans le fichier JSON global
                try {
                    const db = await fs.readJson(DB_FILE);
                    db[chatId] = {
                        ...session.data,
                        dateInscription: new Date().toISOString()
                    };
                    await fs.writeJson(DB_FILE, db, { spaces: 2 });

                    await msg.reply("🎉 Félicitations ! Votre inscription a bien été enregistrée. Notre équipe va étudier votre dossier.");
                    
                    // Réinitialisation de la session de l'utilisateur
                    sessions[chatId] = { step: 'IDLE', data: {} };
                } catch (err) {
                    console.error(err);
                    await msg.reply("Erreur lors de la sauvegarde du dossier. Veuillez réessayer plus tard.");
                }
            } else if (text.toLowerCase() === 'non') {
                sessions[chatId] = { step: 'IDLE', data: {} };
                await msg.reply("Pas de problème. Recommençons. Quel est votre **Nom de famille** ?");
                sessions[chatId].step = 'NOM';
            } else {
                await msg.reply("Veuillez répondre par *OUI* pour valider ou *NON* pour corriger.");
            }
            break;
    }
});


client.initialize();