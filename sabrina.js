// ========================================== //
//            SABRINABOT by shan             //
// ========================================== //

// IMPORTACIÓN DE LIBRERÍAS

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  downloadContentFromMessage,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require('qrcode');
const readline = require("readline");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Jimp = require("jimp");
const ffmpeg = require("fluent-ffmpeg");
const { Sticker, StickerTypes } = require("stickers-formatter");
const axios = require("axios");
const yts = require("yt-search");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const https = require("https");
const http = require("http");
const { exec } = require("child_process");

// MENUS
const { getMainMenu } = require("./menus/main");
const { getStickersMenu } = require("./menus/stickers");
const { getGrupoMenu } = require("./menus/grupo");
const { getDescargasMenu } = require("./menus/descargas");
const { getNsfwMenu } = require("./menus/nsfw");
const { getAccionesMenu } = require("./menus/acciones");
const { getSabrinamMenu } = require("./menus/sabrinam");
const { getJuegosMenu } = require("./menus/juegos");
const { getCasinoMenu } = require("./menus/casino");
const { getModoMenu } = require("./menus/modo");

// 📌 Almacén global de silenciados (Debe ir FUERA de sock.ev.on)
const mutedUsers = {};

// Configurar FFmpeg para usar el paquete nativo de Termux
const ffmpegPath = "ffmpeg";
ffmpeg.setFfmpegPath("ffmpeg");

//FIN DE IMPORTACIÓN DE LIBRERÍAS

// Crear y redefinir la carpeta temporal dentro de tu proyecto (con 15 GB de espacio)
const localTmpDir = path.join(__dirname, "temp");
if (!fs.existsSync(localTmpDir)) {
  fs.mkdirSync(localTmpDir, { recursive: true });
}

process.env.TMPDIR = localTmpDir;
process.env.TEMP = localTmpDir;
process.env.TMP = localTmpDir;

// Función para vaciar la carpeta temporal del servidor sin importar la extensión
function borrarTemporalesOcultos() {
  try {
    const tmpFolder = os.tmpdir();
    if (fs.existsSync(tmpFolder)) {
      const files = fs.readdirSync(tmpFolder);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(tmpFolder, file));
        } catch (e) {
          // Ignora si el archivo está siendo usado en ese instante
        }
      }
    }
  } catch (e) {
    console.error("⚠️ Error limpiando temporales:", e.message);
  }
}

// Ejecutar limpieza al iniciar
borrarTemporalesOcultos();

// Opcional: Ejecutar automáticamente cada 30 minutos para evitar que el disco se llene
setInterval(borrarTemporalesOcultos, 30 * 60 * 1000);

// TODOS los miembros pueden usar el bot en cualquier grupo
const modoSoloAdmins = new Set();

// Otorga permisos de ejecución a yt-dlp automáticamente en Linux
if (fs.existsSync("./yt-dlp")) {
  exec("chmod +x ./yt-dlp");
}

// Configuración de FFmpeg
process.env.FFMPEG_PATH = ffmpegPath;
ffmpeg.setFfmpegPath(ffmpegPath);

// Estado global del Bot (Activado por defecto)
let botActivado = true;

// Estado global del Antilink (Desactivado por defecto)
let antilinkActivado = false;

// Estado global de Comandos de Juegos (Activados por defecto)
let juegosActivados = true;

// Variable global para activar/desactivar (Acti)
let accionesActivadas = true;

const accionesMap = {
  besar: "besar",
  beso: "besar",
  abrazo: "abrazo",
  follar: "follar",
  coger: "follar",
  nalgada: "nalgada",
  nalgear: "nalgada",
  cumear: "cumear",
  cum: "cumear",
  footjob: "footjob",
  boobjob: "boobjob",
  balazo: "balazo",
  paja: "paja",
  dormir: "dormir",
  mear: "mear",
  meo: "mear",
  anal: "anal",
  dedear: "dedear",
};

//FUNCIONES NSFW
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const reqModule = url.startsWith("https") ? https : http;
    const req = reqModule.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      },
      (res) => {
        // Manejo de redirecciones HTTP (301, 302, 307)
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return downloadBuffer(res.headers.location)
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP Status ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", (err) => reject(err));
      },
    );

    req.on("error", (err) => reject(err));
  });
}

// LÓGICA DE BASE DE DATOS (DATABASE)

const dbPath = path.join(__dirname, "database.json");
let casinoActivo = true;
let audiosActivados = true;
let nsfwActivado = false;

function getStats(userId) {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
    }

    const content = fs.readFileSync(dbPath, "utf8");
    const data = content.trim() === "" ? {} : JSON.parse(content);

    if (!data[userId]) {
      data[userId] = { balance: 100, lastWork: 0 };
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    }
    return data[userId];
  } catch (e) {
    console.error("Error en getStats:", e);
    return { balance: 100, lastWork: 0 };
  }
}

function updateBalance(userId, amount) {
  try {
    const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    if (!data[userId]) data[userId] = { balance: 100, lastWork: 0 };

    data[userId].balance += amount;
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error en updateBalance:", e);
  }
}

// FUNCIÓN AUXILIAR: DESCARGAR ARCHIVOS MULTIMEDIA

async function descargarMedia(message) {
  const type = Object.keys(message)[0];
  const stream = await downloadContentFromMessage(
    message[type],
    type.replace("Message", ""),
  );
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

// FUNCIÓN AUXILIAR PARA HACER PREGUNTAS EN CONSOLA
const question = (texto) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(texto, (respuesta) => {
      rl.close();
      resolve(respuesta);
    }),
  );
};

// INICIALIZACIÓN DEL CLIENTE (BAILEYS)

async function iniciarBot() {
  // Manejo de estado de autenticación
  const { state, saveCreds } = await useMultiFileAuthState(
    "baileys_auth",
  ).catch(() => ({ state: null, saveCreds: () => {} }));

  // CORRECCIÓN: Se actualizan los valores por defecto a un formato válido de versión (3 números)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307],
  }));

  const yaRegistrado = state?.creds?.registered;

  // Conexión del Socket con logger silencioso
  const sock = makeWASocket({
    version,
    logger: pino({ level: "fatal" }),
    auth: state,
    browser: ["Sabrina by shan", "Desktop", "1.0"],
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // Eventos de conexión
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Dentro deconnection.update:
if (qr && !yaRegistrado) {
  console.log("\n================ ESCANEA EL CÓDIGO QR ================\n");
  QRCode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
    if (!err) console.log(url);
  });
}

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `🔴 Conexión cerrada (Status: ${statusCode}). Reconectando: ${shouldReconnect}`,
      );
      if (shouldReconnect) iniciarBot();
    } else if (connection === "open") {
      console.log("\n✅ --- Sabrina ESTÁ ONLINE Y ESCUCHANDO MENSAJES ---");
    }
  });

  // Evento Principal de Mensajes
  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const msg = chatUpdate.messages?.[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (!from || from === "status@broadcast") return;

      const isGroup = from.endsWith("@g.us");

      // Corrección de emisor para evitar tomar el ID del grupo
      const botJid = sock.user?.id || sock.user?.jid || "";
      const sender = isGroup
        ? msg.key.participant ||
          msg.participant ||
          (msg.key.fromMe ? botJid : "")
        : msg.key.remoteJid;

      // Extracción de texto y definición única de comando
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      const text = body.trim().toLowerCase();
      const comando = text.split(/\s+/)[0];
      const cmdMenu = comando;
      const command = comando;

      // Función responder declarada AQUÍ (evita el ReferenceError)
      const responder = async (texto, opciones = {}) => {
        return await sock
          .sendMessage(from, { text: texto, ...opciones }, { quoted: msg })
          .catch(() => {});
      };

      if (body) {
        const nombreEmisor = sender
          ? sender.split("@")[0].split(":")[0]
          : "Desconocido";
        console.log(
          `📩 [${isGroup ? "GRUPO" : "PRIVADO"}] de ${nombreEmisor}: ${body}`,
        );
      }

      // Lectura de Metadatos y Permisos de Admin
      let esAdmin = false;
      let isBotAdmin = false;

      // Si el mensaje lo envías tú mismo, siempre eres admin
      if (msg.key.fromMe) esAdmin = true;

      if (isGroup) {
        try {
          const groupMetadata = await sock.groupMetadata(from);
          const participants = groupMetadata?.participants || [];

          // Extraer solo los números limpios ignorando :1, @s.whatsapp.net, @lid, etc.
          const numSender = sender
            ? sender.split("@")[0].split(":")[0].replace(/\D/g, "")
            : "";
          const numBot = botJid
            ? botJid.split("@")[0].split(":")[0].replace(/\D/g, "")
            : "";
          const lidBot = sock.user?.lid
            ? sock.user.lid.split("@")[0].split(":")[0].replace(/\D/g, "")
            : "";

          // Comprobar Admin Usuario
          const participant = participants.find((p) => {
            const pNum = p.id.split("@")[0].split(":")[0].replace(/\D/g, "");
            return pNum === numSender;
          });
          if (
            participant &&
            (participant.admin === "admin" ||
              participant.admin === "superadmin")
          ) {
            esAdmin = true;
          }

          // Comprobar Admin Bot (compara tanto número normal como LID)
          const botParticipant = participants.find((p) => {
            const pNum = p.id.split("@")[0].split(":")[0].replace(/\D/g, "");
            return pNum === numBot || (lidBot && pNum === lidBot);
          });
          if (
            botParticipant &&
            (botParticipant.admin === "admin" ||
              botParticipant.admin === "superadmin")
          ) {
            isBotAdmin = true;
          }
        } catch (e) {
          console.error("Error leyendo metadatos del grupo:", e);
        }
      }

      // ========================================== //
      //COMANDOS DE SABRINABOT//
      // ========================================== //


// COMANDO !creador
if (text === '!creador' || text === '.creador') {
  try {
    // 1. Tarjeta de contacto (vCard)
    const phoneNumber = '593963365388';
    const vcard = 'BEGIN:VCARD\n'
      + 'VERSION:3.0\n'
      + 'FN:shan\n'
      + 'ORG:Creador de Sabrina;\n'
      + `TEL;type=CELL;type=VOICE;waid=${phoneNumber}:+${phoneNumber}\n`
      + 'END:VCARD';

    // 2. Mensaje de texto explicativo
    const textMsg = `💖 *¡Gracias por instalar a Sabrina!*\n\n` +
                    `Espero que disfrutes del bot y te sea de gran utilidad.\n` +
                    `Si tienes alguna duda, sugerencia o problema, puedes contactarme directamente. ✨`;

    // A) Enviar el mensaje de texto
    await sock.sendMessage(from, { text: textMsg }, { quoted: msg });

    // B) Enviar la tarjeta de contacto
    await sock.sendMessage(from, {
      contacts: {
        displayName: 'shan',
        contacts: [{ vcard }]
      }
    });

    // C) Enviar el audio de voz sabrina.ogg
    const audioPath = path.join(__dirname, "mp3", "sabrina.ogg");
    if (fs.existsSync(audioPath)) {
      const audioBuffer = fs.readFileSync(audioPath);
      await sock.sendMessage(
        from,
        {
          audio: audioBuffer,
          ptt: true,
          mimetype: "audio/ogg; codecs=opus"
        },
        { quoted: msg }
      );
    } else {
      console.log(`⚠️ Archivo no encontrado: ${audioPath}`);
    }

  } catch (error) {
    console.error("❌ Error en el comando !creador:", error.message);
  }
}



// Comando !repo o !repositorio
if (comando === '!repo' || comando === '!repositorio') {
    const repoText = `💋 *Sabrina - Repositorio Oficial*\n\n` +
                     `¿Quieres crear tu propio bot?\n` +
                     `Visita el repositorio en GitHub, dale una estrella ⭐ y sigue la guía de instalación:\n\n` +
                     `🔗 https://github.com/shanduy/Sabrina\n\n` +
                     `¡Gracias por el apoyo!`;

    await sock.sendMessage(from, { text: repoText }, { quoted: msg });
}


// ==========================================
// CANAL DE SABRINA
// =========================================


if (body === '!canal' || body === '!updates') {
    try {
        const canalUrl = 'https://whatsapp.com/channel/0029Vb8bws31iUxZGJYZpK0o';
        const imagePath = path.join(__dirname, '../media/sabrina.jpg');
        
        let imageBuffer = null;
        if (fs.existsSync(imagePath)) {
            imageBuffer = fs.readFileSync(imagePath);
        }

        const mensajeTexto = `💋 *CANAL OFICIAL DE SABRINA*\n\n` +
            `¡Únete a nuestro canal para no perderte nada!\n\n` +
            `✨ *¿Qué encontrarás aquí?*\n` +
            `🔹 Novedades y actualizaciones.\n` +
            `🔹 Anuncios sobre nuevos comandos y funciones.\n` +
            `🔹 Reporta problemas que tenga Sabrina.\n` +
            `🔹 Escribe sugerencias que tengas para implementarlas a Sabrina.\n\n` +
            `👇 Sigue el canal desde el enlace de abajo:`;

        // 1. Mensaje informativo de texto (limpio)
        await sock.sendMessage(from, { text: mensajeTexto }, { quoted: msg });

        // 2. Tarjeta oficial de canal mediante enlace con previsualización
        await sock.sendMessage(from, {
            text: canalUrl,
            linkPreview: {
                "canonical-url": canalUrl,
                "matched-text": canalUrl,
                "title": "Sabrina 💋",
                "description": "Sigue el canal de WhatsApp de Sabrina",
                "jpegThumbnail": imageBuffer
            }
        });

    } catch (error) {
        console.error('Error al ejecutar el comando !canal:', error);
        await sock.sendMessage(from, { text: '❌ Ocurrió un error al enviar la información del canal.' }, { quoted: msg });
    }
}


// ==========================================
// FINAL DEL CANAL DE SABRINA
// =========================================



      // ==========================================
      // CONTROL DE ENCENDIDO Y APAGADO DE SABRINABOT
      // ==========================================

      if (text.startsWith("!sa ") || text === "!sa") {
        const opcion = text.split(" ")[1]?.toLowerCase();

        if (opcion === "i" || opcion === "info" || opcion === "estado") {
          const estadoTexto = botActivado
            ? "🟢 *ENCENDIDA (Online)*"
            : "🔴 *APAGADA (Offline)*";
          return responder(`ℹ️ *Estado actual de Sabrina:*\n${estadoTexto}`);
        }

        if (isGroup && !esAdmin && !msg.key.fromMe) {
          return responder(
            "❌ Solo los administradores pueden encender o apagar el bot.",
          );
        }

        if (opcion === "off" || opcion === "apagar") {
          if (!botActivado) return responder("💤 Sabrina ya está apagada.");
          botActivado = false;
          return responder(
            "🔴 *Sabrina ha sido APAGADA.*",
          );
        }

        if (opcion === "on" || opcion === "encender" || opcion === "activar") {
          if (botActivado) return responder("⚡ Sabrina ya está encendida.");
          botActivado = true;
          return responder(
            "🟢 *Sabrina ha sido ENCENDIDA.*",
          );
        }

        return responder(
          "⚠️ Usa:\n• `!sa on` - Encender el bot\n• `!sa off` - Apagar el bot\n• `!sa i` - Ver estado actual",
        );
      }

      // 🛑 FRENO DE MANO: Si el bot está apagado, ignora TODOS los comandos
      if (!botActivado) {
        return;
      }

      // ==========================================
      // FIN DEL CONTROL DE ENCENDIDO Y APAGADO
      // ==========================================

      // ==========================================
      // CONTROLADOR DE MENÚS Y SUBMENÚS
      // ==========================================

      const comandosMenu = [
        "!menu",
        "!menú",
        "!sm",
        "!am",
        "!dm",
        "!nm",
        "!em",
        "!help",
        "!cm",
        "!sam",
        "!jm",
        "!mo",
      ];

      if (comandosMenu.includes(cmdMenu)) {
        const chatId = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        let textoMenu = "";

        // 1. Obtener texto del menú según el comando recibido
        try {
          switch (cmdMenu) {
            case "!menu":
            case "!help":
            case "!menú":
              textoMenu =
                typeof getMainMenu === "function"
                  ? getMainMenu()
                  : "⚠️ Menú Principal no disponible.";
              break;
            case "!sm":
              textoMenu =
                typeof getStickersMenu === "function"
                  ? getStickersMenu()
                  : "⚠️ Menú Stickers no disponible.";
              break;
            case "!am":
              textoMenu =
                typeof getGrupoMenu === "function"
                  ? getGrupoMenu()
                  : "⚠️ Menú Grupo no disponible.";
              break;
            case "!dm":
              textoMenu =
                typeof getDescargasMenu === "function"
                  ? getDescargasMenu()
                  : "⚠️ Menú Descargas no disponible.";
              break;
            case "!nm":
              textoMenu =
                typeof getNsfwMenu === "function"
                  ? getNsfwMenu()
                  : "⚠️ Menú NSFW no disponible.";
              break;
            case "!em":
              textoMenu =
                typeof getAccionesMenu === "function"
                  ? getAccionesMenu()
                  : "⚠️ Menú Acciones no disponible.";
              break;
            case "!sam":
              textoMenu =
                typeof getSabrinamMenu === "function"
                  ? getSabrinamMenu()
                  : "⚠️ Menú Sabrina no disponible.";
              break;
            case "!jm":
              textoMenu =
                typeof getJuegosMenu === "function"
                  ? getJuegosMenu()
                  : "⚠️ Menú Juegos no disponible.";
              break;
            case "!cm":
              textoMenu =
                typeof getCasinoMenu === "function"
                  ? getCasinoMenu()
                  : "⚠️ Menú Casino no disponible.";
              break;
               case "!mo":
              textoMenu =
                typeof getModoMenu === "function"
                  ? getModoMenu()
                  : "⚠️ Menú Modo no disponible.";
              break;
          }
        } catch (errMenu) {
          console.error("❌ Error generando el texto del menú:", errMenu);
          textoMenu = "❌ Ocurrió un error al generar el menú.";
        }

        const esMenuPrincipal = ["!menu", "!help", "!menú"].includes(cmdMenu);

        if (esMenuPrincipal) {
          const linkUrl = "https://instagram.com/shaanduy";
          const rutaImagenLocal = path.join(
            process.cwd(),
            "media",
            "sabrina.jpg",
          );

          // Se concatena el enlace al final del texto obligatoriamente para activar la tarjeta en WhatsApp
          const textoEnviar = textoMenu;
          let linkPreviewData = undefined;

          // 2. Cargar imagen local y generar vista previa
          try {
            console.log("🔄 Cargando sabrina.jpg desde la carpeta media...");

            if (fs.existsSync(rutaImagenLocal)) {
              const bufferImagen = fs.readFileSync(rutaImagenLocal);

              const { imageMessage } = await prepareWAMessageMedia(
                { image: bufferImagen },
                {
                  upload: sock.waUploadToServer,
                  mediaTypeOverride: "thumbnail-link",
                },
              );

              linkPreviewData = {
                "canonical-url": linkUrl,
                "matched-text": linkUrl,
                title: "Sabrina 💋",
                description: "by shan",
                jpegThumbnail: bufferImagen,
                highQualityThumbnail: imageMessage || undefined,
              };
              console.log("✅ Tarjeta lista con la imagen local sabrina.jpg.");
            } else {
              console.warn(
                `⚠️ No se encontró la imagen en: ${rutaImagenLocal}`,
              );
            }
          } catch (e) {
            console.error("⚠️ Error procesando sabrina.jpg:", e.message);
          }

          // 3. Contexto base
          const contextInfo = {
            mentionedJid: [senderJid],
            isForwarded: false,
          };

          // 4. Envío del mensaje principal con linkPreview
          try {
            await sock.sendMessage(
              chatId,
              {
                text: textoEnviar,
                linkPreview: linkPreviewData,
                contextInfo: contextInfo,
              },
              { quoted: msg },
            );

            console.log(`✅ Menú con tarjeta interactiva enviado a: ${chatId}`);
          } catch (errSend) {
            console.error(
              "❌ Error enviando tarjeta, enviando menú plano:",
              errSend.message,
            );
            await sock.sendMessage(
              chatId,
              { text: textoEnviar },
              { quoted: msg },
            );
          }
        } else {
          // Submenús estándar sin tarjeta
          await sock.sendMessage(chatId, { text: textoMenu }, { quoted: msg });
          console.log(`✅ Submenú (${cmdMenu}) enviado a: ${chatId}`);
        }
      }

      // ==========================================
      // FIN DEL CONTROLADOR DE MENÚS Y SUBMENÚS
      // =========================================

      // ==========================================
      // COMANDOS DE STICKERS
      // ==========================================

      if (
        text === "!s" ||
        text.startsWith("!s ") ||
        text.startsWith("!sticker")
      ) {
        try {
          let rawTarget = null;

          if (
            msg.message.imageMessage ||
            msg.message.videoMessage ||
            msg.message.viewOnceMessage ||
            msg.message.viewOnceMessageV2 ||
            msg.message.viewOnceMessageV2Extension
          ) {
            rawTarget = msg.message;
          } else if (
            msg.message.extendedTextMessage?.contextInfo?.quotedMessage
          ) {
            rawTarget =
              msg.message.extendedTextMessage.contextInfo.quotedMessage;
          }

          let mediaMessage = rawTarget;
          if (rawTarget?.viewOnceMessage?.message) {
            mediaMessage = rawTarget.viewOnceMessage.message;
          } else if (rawTarget?.viewOnceMessageV2?.message) {
            mediaMessage = rawTarget.viewOnceMessageV2.message;
          } else if (rawTarget?.viewOnceMessageV2Extension?.message) {
            mediaMessage = rawTarget.viewOnceMessageV2Extension.message;
          }

          if (
            mediaMessage &&
            (mediaMessage.imageMessage || mediaMessage.videoMessage)
          ) {
            const isAnimated = !!mediaMessage.videoMessage;

            console.log(
              `🖼️ Generando sticker (${isAnimated ? "Animado" : "Estático"})...`
            );

            const mediaBuffer = await descargarMedia(mediaMessage);

            // Obtener pack y autor si escriben !s Pack | Autor
            const argsText = text.replace(/^!sticker|^!s\s*/i, "").trim();
            const [customPack, customAuthor] = argsText.split("|").map((s) => s.trim());

            // Configuración que mantiene el formato del video (FULL) sin recortarlo
            let stickerOptions = {
              pack: customPack || "Sabrina 💋",
              author: customAuthor || "by shan",
              type: StickerTypes.FULL,
              quality: isAnimated ? 25 : 70,
              fps: isAnimated ? 10 : undefined,
            };

            let sticker = new Sticker(mediaBuffer, stickerOptions);
            let stickerBuffer = await sticker.toBuffer();

            // Compresión secundaria si supera 1 MB
            if (isAnimated && stickerBuffer.length > 1000000) {
              stickerOptions.quality = 12;
              stickerOptions.fps = 8;
              sticker = new Sticker(mediaBuffer, stickerOptions);
              stickerBuffer = await sticker.toBuffer();
            }

            // Envío directo
            await sock.sendMessage(
              from,
              { sticker: stickerBuffer },
              { quoted: msg }
            );
            console.log(`✅ Sticker enviado con éxito.`);
          }
        } catch (error) {
          console.error("❌ Error en sticker:", error.message || error);
          borrarTemporalesOcultos();
        }
      }

      // ==========================================
      // FIN DE COMANDOS DE STICKERS
      // =========================================

      // ==========================================
      // COMANDO TOIMG
      // ==========================================

      if (text === "!to" || text.startsWith("!toimg")) {
        try {
          let quoted =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

          if (!quoted) {
            return responder(
              "⚠️ Debes responder a un *sticker*, *foto* o *video* de una sola vista con `!to`.",
            );
          }

          // 1. Extraer mensaje si es de una sola vista (View Once)
          if (quoted.viewOnceMessageV2?.message) {
            quoted = quoted.viewOnceMessageV2.message;
          } else if (quoted.viewOnceMessage?.message) {
            quoted = quoted.viewOnceMessage.message;
          } else if (quoted.viewOnceMessageV2Extension?.message) {
            quoted = quoted.viewOnceMessageV2Extension.message;
          }

          // 2. Identificar el tipo de archivo
          const esSticker = quoted.stickerMessage;
          const esFoto = quoted.imageMessage;
          const esVideo = quoted.videoMessage;

          if (!esSticker && !esFoto && !esVideo) {
            return responder(
              "⚠️ Debes responder a un *sticker estático*, o a una *foto/video de una sola vista*.",
            );
          }

          // 3. Verificar si el sticker es animado
          if (esSticker && esSticker.isAnimated) {
            return responder(
              "⚠️ El comando solo admite stickers estáticos, o fotos/videos de una sola vista.",
            );
          }

          // 4. Descargar el contenido multimedia
          const mediaBuffer = await descargarMedia(quoted);

          // 5. Enviar según el tipo de archivo recibido
          if (esVideo) {
            await sock.sendMessage(
              from,
              {
                video: mediaBuffer,
                caption: "*Aquí tienes tu video.*",
                mimetype: "video/mp4",
              },
              { quoted: msg },
            );
          } else {
            await sock.sendMessage(
              from,
              {
                image: mediaBuffer,
                caption: "*Aquí tienes tu imagen.*",
              },
              { quoted: msg },
            );
          }

          console.log(
            "✅ Archivo (Sticker/Foto/Video) procesado y enviado con éxito.",
          );
        } catch (error) {
          console.error("❌ Error en !toimg:", error.message || error);
          await responder("❌ Ocurrió un error al procesar el archivo.");
        }
      }

      // ==========================================
      // FIN DE COMANDO TOIMG
      // =========================================

      // ==========================================
      // COMANDOS DE ADMINISTRACIÓN DE GRUPOS
      // ==========================================

      if (text === "!test") {
        await responder("¡Sabrina está escuchando este chat! ✅");
      }

      if (
        (comando === "!k" || comando === "!kick" || comando === "!dick") &&
        isGroup
      ) {
        try {
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          let rawTarget = ctx?.participant || ctx?.mentionedJid?.[0];

          if (!rawTarget) {
            return responder(
              "⚠️ Por favor, etiqueta a alguien o responde a su mensaje.",
            );
          }

          // Extraer números limpios para comparar
          const targetNum = rawTarget
            .split("@")[0]
            .split(":")[0]
            .replace(/\D/g, "");
          const botJid = sock.user?.id || "";
          const numBot = botJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          const lidBot = sock.user?.lid
            ? sock.user.lid.split("@")[0].split(":")[0].replace(/\D/g, "")
            : "";

          // 🛡️ PROTECCIÓN DEL BOT: Si intentan expulsar al bot (por número o LID)
          if (targetNum === numBot || (lidBot && targetNum === lidBot)) {
            const rutaSticker = path.join(__dirname, "media", "no-kick.webp");
            if (fs.existsSync(rutaSticker)) {
              await sock.sendMessage(
                from,
                { sticker: fs.readFileSync(rutaSticker) },
                { quoted: msg },
              );
            } else {
              await responder("❌ ¡No me puedes expulsar a mí!");
            }
            return; // Detiene la ejecución aquí
          }

          // Validaciones de permisos para el resto de usuarios
          if (!esAdmin && !msg.key.fromMe) {
            return responder(
              "❌ No tienes permisos de administrador para usar este comando.",
            );
          }

          if (!isBotAdmin) {
            return responder(
              "❌ Sabrina no tiene rol de administradora.",
            );
          }

          // Obtener la lista de participantes real del grupo
          const groupMetadata = await sock.groupMetadata(from);
          const participants = groupMetadata?.participants || [];

          // Buscar al participante exacto
          const actualParticipant = participants.find((p) => {
            const pNum = p.id.split("@")[0].split(":")[0].replace(/\D/g, "");
            return pNum === targetNum || p.id === rawTarget;
          });

          if (!actualParticipant) {
            return responder(
              "⚠️ No se encontró a ese usuario en la lista de integrantes del grupo.",
            );
          }

          const userToKick = actualParticipant.id;

          // Evitar expulsar a otros admins
          if (
            actualParticipant.admin === "admin" ||
            actualParticipant.admin === "superadmin"
          ) {
            return responder(
              "❌ No puedo expulsar a otro administrador del grupo.",
            );
          }

          const mensajeDespedida = await responder(
            `Chao del grupo @${targetNum}`,
            {
              mentions: [userToKick],
            },
          );

          const rutaAudio = path.join(__dirname, "mp3", "baneado.ogg");
          if (fs.existsSync(rutaAudio)) {
            const audioBuffer = fs.readFileSync(rutaAudio);
            await sock.sendMessage(
              from,
              { audio: audioBuffer, ptt: true, mimetype: "audio/mp4" },
              { quoted: mensajeDespedida },
            );
          }

          setTimeout(async () => {
            try {
              await sock.groupParticipantsUpdate(from, [userToKick], "remove");
            } catch (err) {
              console.error("Error al remover participante:", err);
            }
          }, 2000);
        } catch (error) {
          console.error("Error en Kick:", error);
        }
      }

      if (
        (text.startsWith("!todos") || text.startsWith("!mencionar")) &&
        isGroup
      ) {
        try {
          if (!esAdmin && !msg.key.fromMe) {
            return await responder(
              "❌ Necesitas ser administrador para usar este comando.",
            );
          }

          // 1. Obtener los datos del grupo (evita el ReferenceError)
          const groupMetadata = await sock.groupMetadata(from);

          // 2. Extraer mensaje adicional si existe (ej: "!todos reunión a las 5")
          const mensajeExtra = text.slice(text.indexOf(" ") + 1).trim();
          const tieneTextoExtra = text.includes(" ") && mensajeExtra.length > 0;

          let response = `📢 *¡Atención a todos!* ${tieneTextoExtra ? `\n\n📝 *Mensaje:* ${mensajeExtra}` : ""}\n\n`;
          let mentions = [];

          // 3. Recorrer la lista de participantes obtenida
          for (let participant of groupMetadata.participants) {
            mentions.push(participant.id);
            response += `@${participant.id.split("@")[0]}\n`;
          }

          // 4. Enviar mensaje con la propiedad mentions en el objeto del texto
          await sock.sendMessage(
            from,
            {
              text: response,
              mentions: mentions,
            },
            { quoted: msg },
          );
        } catch (error) {
          console.error("Error en !todos:", error);
          await responder("❌ Hubo un problema al mencionar a todos.");
        }
      }




if ((text === "!cerrar" || text === "!abrir") && isGroup) {
  try {
    // 1. Validar que el usuario que ejecuta el comando sea admin
    if (!esAdmin && !msg.key.fromMe) {
      return await responder(
        "❌ Necesitas ser administrador para usar este comando."
      );
    }

    // 2. Obtener metadatos frescos del grupo
    const groupMetadata = await sock.groupMetadata(from);

    // 3. Verificar si el BOT es administrador (compatible con JID y LID)
    const botPhone = sock.user.id.split("@")[0].split(":")[0];
    const botLid = sock.user.lid ? sock.user.lid.split("@")[0].split(":")[0] : null;

    const botParticipant = groupMetadata.participants.find((p) => {
      const pId = p.id.split("@")[0].split(":")[0];
      return pId === botPhone || (botLid && pId === botLid);
    });

    const isBotAdmin =
      botParticipant?.admin === "admin" ||
      botParticipant?.admin === "superadmin";

    // Si el bot NO es admin, detiene la ejecución inmediatamente
    if (!isBotAdmin) {
      return await responder("❌ Sabrina no tiene rol de administradora.");
    }

    // 4. Si el bot SÍ es admin, procede a verificar el estado actual
    const estaCerrado = groupMetadata.announce;

    if (text === "!cerrar") {
      if (estaCerrado) {
        return await responder("⚠️ El grupo *ya está cerrado*.");
      }
      await sock.groupSettingUpdate(from, "announcement");
      return await responder("🔒 *El grupo ha sido CERRADO.*");
    }

    if (text === "!abrir") {
      if (!estaCerrado) {
        return await responder("⚠️ El grupo *ya está abierto*.");
      }
      await sock.groupSettingUpdate(from, "not_announcement");
      return await responder("🔓 *El grupo ha sido ABIERTO.*");
    }
  } catch (e) {
    console.error(`Error en ${text}:`, e);

    if (e?.output?.statusCode === 403 || e?.toString().includes("403")) {
      return await responder("❌ Sabrina no tiene rol de administradora.");
    }

    await responder(
      "❌ Ocurrió un error al intentar cambiar la configuración del grupo."
    );
  }
}




      if (
        (text.startsWith("!promover") || text.startsWith("!admin")) &&
        isGroup
      ) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Necesitas ser administrador para usar este comando.",
            );

          let userToPromote =
            msg.message.extendedTextMessage?.contextInfo?.participant ||
            msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

          if (!userToPromote)
            return responder(
              "⚠️ Por favor, menciona a alguien o responde a su mensaje para darle admin.",
            );

          await sock.groupParticipantsUpdate(from, [userToPromote], "promote");
          await responder(
            `👑 @${userToPromote.split("@")[0]} ahora es **Administrador** del grupo.`,
            { mentions: [userToPromote] },
          );
        } catch (e) {
          console.error("Error en !promover:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if (
        (text.startsWith("!degradar") || text.startsWith("!qadmin")) &&
        isGroup
      ) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Necesitas ser administrador para usar este comando.",
            );

          let userToDemote =
            msg.message.extendedTextMessage?.contextInfo?.participant ||
            msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

          if (!userToDemote)
            return responder(
              "⚠️ Por favor, menciona a alguien o responde a su mensaje para quitarle admin.",
            );

          await sock.groupParticipantsUpdate(from, [userToDemote], "demote");
          await responder(
            `🪖 @${userToDemote.split("@")[0]} ya no es administrador.`,
            { mentions: [userToDemote] },
          );
        } catch (e) {
          console.error("Error en !degradar:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if ((comando === "!fg" || comando === "!fotogrupo") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe) {
            return responder(
              "❌ No tienes permisos de administrador para cambiar la foto del grupo.",
            );
          }

          if (!isBotAdmin) {
            return responder("❌ Sabrina no tiene rol de administradora.");
          }

          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const isImage = msg.message?.imageMessage;
          const quotedMsg = ctx?.quotedMessage;
          const isQuotedImage = quotedMsg?.imageMessage;

          if (!isImage && !isQuotedImage) {
            return responder(
              "⚠️ Debes responder a una imagen o enviar una foto junto con el comando `!fg`.",
            );
          }

          await responder("⏳ Actualizando la foto del grupo...");

          // 📌 CORRECCIÓN DE DESCARGA: Usa la función helper descargarMedia ya existente
          const targetMedia = isImage ? msg.message : quotedMsg;
          const imageBuffer = await descargarMedia(targetMedia);

          await sock.updateProfilePicture(from, imageBuffer);

          return responder(
            "✅ ¡La foto de perfil del grupo ha sido actualizada correctamente!",
          );
        } catch (error) {
          console.error("❌ Error al actualizar la foto del grupo:", error);
          return responder(
            "❌ Ocurrió un error al intentar cambiar la foto del grupo. Asegúrate de que el archivo sea una imagen válida.",
          );
        }
      }

      if (text.startsWith("!nombre ") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          const nuevoNombre = body.slice(8).trim();
          if (!nuevoNombre)
            return responder(
              "⚠️ Escribe el nuevo nombre. Ejemplo: *!nombre Grupo Oficial*",
            );

          await sock.groupUpdateSubject(from, nuevoNombre);
          await responder(`✅ Nombre del grupo cambiado a: *${nuevoNombre}*`);
        } catch (e) {
          console.error("Error en !nombre:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if (text.startsWith("!desc ") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          const nuevaDesc = body.slice(6).trim();
          if (!nuevaDesc)
            return responder(
              "⚠️ Escribe la nueva descripción. Ejemplo: *!desc Reglas: No spam.*",
            );

          await sock.groupUpdateDescription(from, nuevaDesc);
          await responder("✅ Descripción del grupo actualizada con éxito.");
        } catch (e) {
          console.error("Error en !desc:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if ((text === "!link" || text === "!enlace") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          const code = await sock.groupInviteCode(from);
          await responder(
            `🔗 *Enlace de invitación al grupo:*\nhttps://chat.whatsapp.com/${code}`,
          );
        } catch (e) {
          console.error("Error en !link:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if (text === "!reiniciar" && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          await sock.groupRevokeInvite(from);
          const newCode = await sock.groupInviteCode(from);
          await responder(
            `🔄 *Enlace restablecido exitosamente.*\nNuevo enlace:\nhttps://chat.whatsapp.com/${newCode}`,
          );
        } catch (e) {
          console.error("Error en !reiniciar:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      // COMANDO: CONFIGURAR ANTI-LINK
      if (text.startsWith("!antilink")) {
        if (!isGroup) {
          return responder("⚠️ Este comando solo se puede usar en grupos.");
        }

        if (!esAdmin && !msg.key.fromMe) {
          return responder(
            "❌ Solo los *administradores* del grupo pueden configurar el Anti-Link.",
          );
        }

        try {
          // 1. Obtener metadata y verificar si Sabrina es Admin
          const groupMetadata = await sock.groupMetadata(from);
          const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          const botParticipant = groupMetadata.participants.find(
            (p) => p.id === botJid || p.id === sock.user.id,
          );
          const isBotAdmin =
            botParticipant?.admin === "admin" ||
            botParticipant?.admin === "superadmin";

          // 2. Si el bot no es admin, no permitimos activar el Anti-Link
          if (!isBotAdmin) {
            return await responder(
              "❌ Sabrina no tiene rol de administradora.",
            );
          }

          const opcion = text.split(" ")[1]?.toLowerCase();

          if (opcion === "on" || opcion === "activar") {
            antilinkActivado = true;
            return responder("🛡️ *Anti-Link ACTIVADO.*");
          } else if (opcion === "off" || opcion === "desactivar") {
            antilinkActivado = false;
            return responder("🔓 *Anti-Link DESACTIVADO.*");
          } else {
            return responder(
              "⚠️ Uso correcto: `!antilink on` o `!antilink off`",
            );
          }
        } catch (e) {
          console.error("Error en !antilink:", e);
          return responder(
            "❌ Hubo un fallo al consultar los permisos del grupo.",
          );
        }
      }

      // DETECTOR DE ENLACES (EJECUCIÓN AUTOMÁTICA)
      if (isGroup && antilinkActivado) {
        const rawText =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "";

        const socialLinkRegex =
          /(chat\.whatsapp\.com|wa\.me|whatsapp\.com|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|t\.me|telegram\.me|youtube\.com|youtu\.be|x\.com|twitter\.com|discord\.gg|discord\.com\/invite)/i;

        if (socialLinkRegex.test(rawText)) {
          // Los administradores sí pueden enviar enlaces
          if (!esAdmin) {
            try {
              // Verificar en tiempo real si el bot sigue siendo admin
              const groupMetadata = await sock.groupMetadata(from);
              const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
              const botParticipant = groupMetadata.participants.find(
                (p) => p.id === botJid || p.id === sock.user.id,
              );
              const isBotAdmin =
                botParticipant?.admin === "admin" ||
                botParticipant?.admin === "superadmin";

              if (isBotAdmin) {
                // Borrar mensaje con el enlace
                await sock.sendMessage(from, { delete: msg.key });

                const userTag = `@${sender.split("@")[0]}`;
                await sock.sendMessage(from, {
                  text: `⚠️ ${userTag}, los enlaces a redes sociales no están permitidos en este grupo. Tu mensaje ha sido eliminado.`,
                  mentions: [sender],
                });
              } else {
                console.log(
                  "❌ Anti-Link: Sabrina detectó un enlace pero ya no es administradora para eliminarlo.",
                );
              }
            } catch (e) {
              console.error("Error en detección de Anti-Link:", e);
            }
          }
        }
      }

      // ==========================================
      // FIN DE COMANDOS DE ADMINISTRACIÓN DE GRUPOS
      // =========================================

      // ==========================================
      // 🔒 COMANDO !modoadmin (ON / OFF)
      // ==========================================
      if (comando === "!ma") {
        if (!isGroup)
          return responder("❌ Este comando solo se puede usar en grupos.");
        if (!esAdmin)
          return responder(
            "❌ Solo los administradores pueden cambiar esta configuración.",
          );

        const subcomando = text.split(/\s+/)[1];

        if (subcomando === "on" || subcomando === "activar") {
          if (modoSoloAdmins.has(from)) {
            return responder(
              "⚠️ El modo Solo Admins ya está *ACTIVADO* en este grupo.",
            );
          }
          modoSoloAdmins.add(from);
          return responder(
            "🔒 *Modo Solo Admins ACTIVADO.*",
          );
        }

        if (subcomando === "off" || subcomando === "desactivar") {
          if (!modoSoloAdmins.has(from)) {
            return responder(
              "⚠️ El modo Solo Admins ya está *DESACTIVADO* en este grupo.",
            );
          }
          modoSoloAdmins.delete(from);
          return responder(
            "🔓 *Modo Solo Admins DESACTIVADO.*",
          );
        }

        return responder(
          "❓ *Uso del comando:*\n• `!ma on` - Restringe el bot solo para admins.\n• `!ma off` - Permite el uso a todos los miembros.",
        );
      }

      // ==========================================
      // 🛡️ RESTRICCIÓN DE USO
      // ==========================================
      // Solo se bloquea si el grupo fue agregado a modoSoloAdmins Y el usuario no es admin
      if (isGroup && modoSoloAdmins.has(from) && !esAdmin) {
        return; // Ignora en silencio los mensajes de usuarios comunes
      }

      // ============================================================================
      // 🛡️ [ÁREA DE COMANDOS DE ADMINISTRADORES] - INICIO
      // ============================================================================

      // COMANDO: SILENCIAR / MUTE
      if (text.startsWith("!mute") || text.startsWith("!silenciar")) {
        if (!isGroup)
          return responder("❌ Este comando solo funciona en grupos.");
        if (!esAdmin && !msg.key.fromMe)
          return responder(
            "❌ Solo los *administradores* pueden usar este comando.",
          );

        try {
          // 1. Obtener metadata y verificar si Sabrina es Admin
          const groupMetadata = await sock.groupMetadata(from);
          const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          const botParticipant = groupMetadata.participants.find(
            (p) => p.id === botJid || p.id === sock.user.id,
          );
          const isBotAdmin =
            botParticipant?.admin === "admin" ||
            botParticipant?.admin === "superadmin";

          if (!isBotAdmin) {
            return await responder(
              "❌ Sabrina no tiene rol de administradora.",
            );
          }

          // 2. Extraer el usuario objetivo
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const quotedJid = ctx?.participant;
          const mentionedJids = ctx?.mentionedJid;
          const targetJid =
            mentionedJids && mentionedJids.length > 0
              ? mentionedJids[0]
              : quotedJid;

          if (!targetJid) {
            return responder(
              "❌ Debes *responder a un mensaje* o *etiquetar (@)* al usuario que deseas silenciar.",
            );
          }

          if (!mutedUsers[from]) mutedUsers[from] = [];

          const numMute = targetJid.replace(/\D/g, "");

          // Comprobar si ya está silenciado
          const yaSilenciado = mutedUsers[from].some(
            (jid) =>
              typeof jid === "string" && jid.replace(/\D/g, "") === numMute,
          );

          if (yaSilenciado) {
            return responder(
              "⚠️ Este usuario ya está silenciado en este grupo.",
            );
          }

          // Guardar en la lista de silenciados
          mutedUsers[from].push(targetJid);

          await sock.sendMessage(
            from,
            {
              text: `🤫 @${numMute} ha sido *silenciado*. Sus mensajes serán eliminados automáticamente.`,
              mentions: [targetJid],
            },
            { quoted: msg },
          );
        } catch (e) {
          console.error("Error en !mute:", e);
          await responder("❌ Hubo un error al ejecutar el comando.");
        }
        return;
      }

      // COMANDO: DESMUTEAR / UNMUTE
      if (text.startsWith("!unmute") || text.startsWith("!desmutear")) {
        if (!isGroup)
          return responder("❌ Este comando solo funciona en grupos.");
        if (!esAdmin && !msg.key.fromMe)
          return responder(
            "❌ Solo los *administradores* pueden usar este comando.",
          );

        try {
          // 1. Obtener metadata y verificar si Sabrina es Admin
          const groupMetadata = await sock.groupMetadata(from);
          const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          const botParticipant = groupMetadata.participants.find(
            (p) => p.id === botJid || p.id === sock.user.id,
          );
          const isBotAdmin =
            botParticipant?.admin === "admin" ||
            botParticipant?.admin === "superadmin";

          if (!isBotAdmin) {
            return await responder(
              "❌ Sabrina no tiene rol de administradora.",
            );
          }

          // 2. Extraer el usuario objetivo
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const quotedJid = ctx?.participant;
          const mentionedJids = ctx?.mentionedJid;
          const targetJid =
            mentionedJids && mentionedJids.length > 0
              ? mentionedJids[0]
              : quotedJid;

          if (!targetJid) {
            return responder(
              "❌ Debes *responder a un mensaje* o *etiquetar (@)* al usuario que deseas desmutear.",
            );
          }

          if (
            !mutedUsers[from] ||
            !Array.isArray(mutedUsers[from]) ||
            mutedUsers[from].length === 0
          ) {
            return responder("⚠️ No hay usuarios silenciados en este grupo.");
          }

          const numTarget = targetJid.replace(/\D/g, "");

          // 3. Verificamos si existe (CORREGIDO: se cambió !== por ===)
          const existe = mutedUsers[from].some(
            (jid) =>
              typeof jid === "string" && jid.replace(/\D/g, "") === numTarget,
          );

          if (!existe) {
            return responder("⚠️ Este usuario no está silenciado.");
          }

          // Removemos al usuario del array
          mutedUsers[from] = mutedUsers[from].filter(
            (jid) =>
              typeof jid === "string" && jid.replace(/\D/g, "") !== numTarget,
          );

          await sock.sendMessage(
            from,
            {
              text: `🔊 @${numTarget} ya no está silenciado. Puede volver a hablar.`,
              mentions: [targetJid],
            },
            { quoted: msg },
          );
        } catch (e) {
          console.error("Error en !unmute:", e);
          await responder("❌ Hubo un error al ejecutar el comando.");
        }
        return;
      }

      // ============================================================================
      // 🛡️ [ÁREA DE COMANDOS DE ADMINISTRADORES] - FIN
      // ============================================================================

      // ==========================================
      // COMANDOS DE MP3
      // ==========================================

      if (text.startsWith("!mp3")) {
        const query = body.slice(4).trim();

        if (!query) {
          return responder(
            "❌ Usa: *!mp3 [link o nombre]*\nEjemplo:\n*!mp3 Baby im back - The kid LAROI*",
          );
        }

        try {
          let videoUrl = query;
          let videoTitle = "";

          if (!query.startsWith("http://") && !query.startsWith("https://")) {
            const searchResult = await yts(query);

            if (!searchResult.videos.length) {
              return responder("❌ No se encontraron resultados en YouTube.");
            }

            videoUrl = searchResult.videos[0].url;
            videoTitle = searchResult.videos[0].title;
          } else {
            const searchResult = await yts(query);
            videoTitle =
              searchResult && searchResult.videos.length
                ? searchResult.videos[0].title
                : "Audio descargado";
          }

          await responder(`🔍 Buscando: *${videoTitle}*...`);

          // Petición a Lempi API
          const res = await axios.get(
            `https://api.lempi.lat/dl/yta?apikey=lem125&url=${encodeURIComponent(videoUrl)}`,
          );

          // Extracción directa según la estructura res.data.datos.url
          const downloadUrl =
            res.data?.datos?.url ||
            res.data?.result?.download?.url ||
            res.data?.url;
          const title = res.data?.titulo || videoTitle;

          if (!downloadUrl) {
            console.error("Respuesta inesperada de Lempi:", res.data);
            return responder(
              "❌ La API no devolvió un enlace de audio válido.",
            );
          }

          await responder(`🎶 *Canción:* ${title}`);

          // Enviar audio directamente por WhatsApp
          await sock.sendMessage(
            from,
            {
              audio: { url: downloadUrl },
              mimetype: "audio/mp4",
              fileName: `${title}.mp3`,
              ptt: false,
            },
            { quoted: msg },
          );

          console.log(`✅ [ÉXITO] Audio enviado con Lempi API: ${title}`);
        } catch (e) {
          console.error(
            "❌ [ERROR Lempi API]:",
            e.response?.data || e.message || e,
          );
          responder("❌ Ocurrió un error al procesar la descarga.");
        }
      }

      // ==========================================
      // FIN DE COMANDOS DE MP3
      // =========================================

      // ==========================================
      // CONTROL DE ACTIVACIÓN DE JUEGOS
      // ==========================================

      if (text.startsWith("!juegos") || text.startsWith("!juego")) {
        if (isGroup) {
          if (!esAdmin && !msg.key.fromMe) {
            return responder(
              "❌ Solo los administradores pueden activar o desactivar los juegos.",
            );
          }
        }

        const opcion = text.split(" ")[1]?.toLowerCase();

        if (opcion === "on" || opcion === "activar") {
          juegosActivados = true;
          return responder("🕹️ *Comandos de juegos ACTIVADOS.*");
        } else if (opcion === "off" || opcion === "desactivar") {
          juegosActivados = false;
          return responder("🔇 *Comandos de juegos DESACTIVADOS.*");
        } else {
          const estado = juegosActivados ? "ACTIVADOS 🟢" : "DESACTIVADOS 🔴";
          return responder(
            `ℹ️ Estado de los juegos: *${estado}*\nUsa: \`!juegos on\` o \`!juegos off\``,
          );
        }
      }

      // ==========================================
      // COMANDOS DE JUEGOS
      // ==========================================

      const cmdJuego = text.trim().split(/\s+/)[0].toLowerCase();

      if (
        [
          "!peruano",
          "!gay",
          "!racista",
          "!pija",
          "!down",
          "!topgay",
          "!tope",
        ].includes(cmdJuego)
      ) {
        if (!juegosActivados) {
          return responder("⚠️ Los juegos están desactivados");
        }

        const contextInfo =
          msg.message?.extendedTextMessage?.contextInfo ||
          msg.message?.imageMessage?.contextInfo ||
          msg.message?.videoMessage?.contextInfo ||
          {};

        let targetJid =
          contextInfo.participant ||
          contextInfo.mentionedJid?.[0] ||
          msg.key.participant ||
          msg.key.remoteJid;
        let targetTag = `@${targetJid.split("@")[0]}`;

        const porcentaje = Math.floor(Math.random() * 101);
        let respuestaText = "";

        switch (cmdJuego) {
          case "!peruano":
            respuestaText = `🇵🇪 *MEDIDOR DE PERUANIDAD* 🇵🇪\n\n👤 Usuario: ${targetTag}\n📊 Nivel de peruano: *${porcentaje}%*`;
            if (porcentaje > 80)
              respuestaText += "\nQue rico el motesito papai";
            else if (porcentaje > 40)
              respuestaText += "\nVamos por un caldito de mote?";
            else respuestaText += "\nAre u peruana? Never 🤮";
            break;

          case "!gay":
            respuestaText = `🏳️‍🌈 *MEDIDOR DE GAY* 🏳️‍🌈\n\n👤 Usuario: ${targetTag}\n📊 Nivel de gay: *${porcentaje}%*`;
            if (porcentaje > 80) respuestaText += "\nBasta chicos no soy gay.";
            else if (porcentaje > 40)
              respuestaText += "\nSi ves una pija te hace dudar.";
            else respuestaText += "\nOpa te salvaste";
            break;

          case "!racista":
            respuestaText = `🇮🇱 *MEDIDOR DE RACISMO* 🇮🇱\n\n👤 Usuario: ${targetTag}\n📊 Nivel de racismo: *${porcentaje}%*`;
            if (porcentaje > 80)
              respuestaText += "\nUsuario promedio de instagram.";
            else if (porcentaje > 40)
              respuestaText += "\nAgente secreto de Tel Aviv 🇮🇱";
            else respuestaText += "\nQue sos? Normal / Peruano";
            break;

          case "!down":
            respuestaText = `🤪 *MEDIDOR DE DOWN* 🤪\n\n👤 Usuario: ${targetTag}\n📊 Nivel de down: *${porcentaje}%*`;
            if (porcentaje > 80)
              respuestaText += "\nEu ato quiero un bajita ato dale.";
            else if (porcentaje > 40)
              respuestaText += "\nUsas xd en cada mensaje.";
            else respuestaText += "\nBautista";
            break;

          case "!pija":
            const medida = Math.floor(Math.random() * 28) + 1;
            respuestaText = `🍆 *MEDIDOR DE BIJA* 🍆\n\n👤 Usuario: ${targetTag}\n📏 Tamaño: *${medida} cm*`;
            if (medida > 20) respuestaText += "\nNormal";
            else if (medida > 12) respuestaText += "\nPasable";
            else if (medida > 5) respuestaText += "\nDemasido grande amigo";
            else respuestaText += "\nUsuario promedio de discord.";
            break;

          case "!topgay":
            if (!isGroup) {
              respuestaText = "❌ Este comando solo funciona en grupos.";
              break;
            }

            try {
              const groupMetadata = await sock.groupMetadata(from);
              const participants = groupMetadata.participants;

              if (participants.length < 5) {
                await sock.sendMessage(
                  from,
                  { text: "❌ Se necesitan al menos 5 personas en el grupo." },
                  { quoted: msg },
                );
                return;
              }

              // Selección aleatoria de 5 integrantes
              const shuffled = [...participants]
                .sort(() => 0.5 - Math.random())
                .slice(0, 5);

              const medallas = ["🥇", "🥈", "🥉", "🏅", "🎖️"];
              const porcentajes = [100, 85, 70, 55, 40];

              let textoTop = `🌈 *TOP 5 MÁS GAYS DEL GRUPO* 🌈\n\n`;
              let mencionesArray = [];

              shuffled.forEach((user, index) => {
                const jid = user.id.includes("@s.whatsapp.net")
                  ? user.id
                  : user.jid || user.id;
                const numero = jid.split("@")[0];

                mencionesArray.push(jid);
                textoTop += `${medallas[index]} *Top ${index + 1}:* @${numero} - *${porcentajes[index]}%*\n`;
              });

              textoTop += `\nGuarden sus penes.`;

              // Enviar el mensaje con las menciones
              await sock.sendMessage(
                from,
                {
                  text: textoTop,
                  mentions: mencionesArray,
                },
                { quoted: msg },
              );

              return;
            } catch (e) {
              console.error("❌ Error en !topgay:", e);
              await sock.sendMessage(
                from,
                { text: "❌ Error al obtener la lista del grupo." },
                { quoted: msg },
              );
              return;
            }

          case "!tope":
            if (!isGroup) {
              respuestaText = "❌ Este comando solo funciona en grupos.";
              break;
            }

            try {
              const groupMetadata = await sock.groupMetadata(from);
              const participants = groupMetadata.participants;

              if (participants.length < 5) {
                await sock.sendMessage(
                  from,
                  { text: "❌ Se necesitan al menos 5 personas en el grupo." },
                  { quoted: msg },
                );
                return;
              }

              // Selección aleatoria de 5 integrantes
              const shuffled = [...participants]
                .sort(() => 0.5 - Math.random())
                .slice(0, 5);

              const medallas = ["🥇", "🥈", "🥉", "🏅", "🎖️"];
              const porcentajes = [100, 85, 70, 55, 40];

              let textoTop = `🇵🇪 *TOP 5 MÁS PERUANOS DEL GRUPO* 🇵🇪\n\n`;
              let mencionesArray = [];

              shuffled.forEach((user, index) => {
                const jid = user.id.includes("@s.whatsapp.net")
                  ? user.id
                  : user.jid || user.id;
                const numero = jid.split("@")[0];

                mencionesArray.push(jid);
                textoTop += `${medallas[index]} *Top ${index + 1}:* @${numero} - *${porcentajes[index]}%*\n`;
              });

              textoTop += `\n¿Que rico el motesito papai o qué? 🍲`;

              // Enviar el mensaje directamente con las menciones activas
              await sock.sendMessage(
                from,
                {
                  text: textoTop,
                  mentions: mencionesArray,
                },
                { quoted: msg },
              );

              return;
            } catch (e) {
              console.error("❌ Error en !peruano:", e);
              await sock.sendMessage(
                from,
                { text: "❌ Error al obtener la lista del grupo." },
                { quoted: msg },
              );
              return;
            }
        }

        await responder(respuestaText, { mentions: [targetJid] });
      }

      // ==========================================
      // FIN DE COMANDOS DE JUEGOS
      // =========================================

      // ==========================================
      // JUEGO DEL CASINO
      // ==========================================

      if (text === "!cd") {
        if (!esAdmin && !msg.key.fromMe)
          return responder("❌ Solo administradores.");
        casinoActivo = false;
        return responder("🎰 El casino de Sabrina ha sido **DESACTIVADO** 🔴");
      }

      if (text === "!ca") {
        if (!esAdmin && !msg.key.fromMe)
          return responder("❌ Solo administradores.");
        casinoActivo = true;
        return responder("🎰 El casino de Sabrina ha sido **ACTIVADO** 🟢");
      }

      if (text === "!t" || text === "!w") {
        if (!casinoActivo) return responder("⚠️ El casino está desactivado.");

        let stats = getStats(sender);
        const now = Date.now();
        const cooldown = 3600000;

        if (now - stats.lastWork < cooldown) {
          const minutesLeft = Math.ceil(
            (cooldown - (now - stats.lastWork)) / 60000,
          );
          return responder(
            `⏳ Estás cansado. Vuelve a trabajar en ${minutesLeft} minutos.`,
          );
        }

        const ganancia = Math.floor(Math.random() * (200 - 50 + 1)) + 50;
        updateBalance(sender, ganancia);

        const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
        data[sender].lastWork = now;
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

        await responder(
          `💰 ¡Trabajaste duro y ganaste *$${ganancia}*! \nSaldo actual: *$${getStats(sender).balance}*`,
        );
      }

      if (text === "!bal") {
        const stats = getStats(sender);
        const numero = sender.split("@")[0];
        await responder(
          `🏦 *BANCO SABRINA*\n\n💰 Saldo de: @${numero}\n💵 Total: *$${stats.balance}*`,
          { mentions: [sender] },
        );
      }

      if (text.startsWith("!r ")) {
        if (!isGroup)
          return responder("❌ Este comando solo funciona en grupos.");
        if (!casinoActivo) return responder("⚠️ El casino está desactivado.");

        const args = text.split(" ");
        const eleccion = args[1];
        const inputApuesta = args[2];
        const stats = getStats(sender);

        const coloresValidos = ["rojo", "negro", "verde"];
        if (!coloresValidos.includes(eleccion) || !inputApuesta) {
          return responder(
            "Uso: *!r rojo 50* o *!r rojo todo* (Colores: rojo, negro, verde)",
          );
        }

        let apuesta =
          inputApuesta === "todo" || inputApuesta === "all"
            ? stats.balance
            : parseInt(inputApuesta);

        if (isNaN(apuesta) || apuesta <= 0)
          return responder("❌ Ingresa una cantidad válida o escribe *todo*.");
        if (stats.balance < apuesta)
          return responder(
            `❌ No tienes suficiente dinero. Saldo actual: *$${stats.balance}*`,
          );

        const resultadoNum = Math.floor(Math.random() * 37);
        let resultadoColor =
          resultadoNum === 0
            ? "verde"
            : resultadoNum % 2 === 0
              ? "negro"
              : "rojo";

        let mensaje = `🎰 La ruleta gira y cae en: *${resultadoNum} (${resultadoColor.toUpperCase()})*\n`;

        if (eleccion === resultadoColor) {
          let premio = resultadoColor === "verde" ? apuesta * 19 : apuesta;
          updateBalance(sender, premio);
          mensaje += `\n🎉 ¡GANASTE! Recibes *$${premio}*.`;
        } else {
          updateBalance(sender, -apuesta);
          mensaje += `\n💸 Perdiste *$${apuesta}*. ¡Suerte la próxima!`;
        }

        await responder(mensaje);
      }

      // ==========================================
      // FIN DE JUEGO DEL CASINO
      // =========================================

      // ==========================================
      // ACCIONES EN GRUPOS
      // ==========================================

      if (text.startsWith("!emotes")) {
        if (isGroup && !esAdmin && !msg.key.fromMe) {
          return responder(
            "⚠️ Solo los administradores pueden activar o desactivar los emotes.",
          );
        }

        const opcion = text.split(" ")[1]?.toLowerCase();

        if (opcion === "on" || opcion === "activar") {
          accionesActivadas = true;
          return responder("✅ Los comandos de emotes han sido *ACTIVADOS*");
        } else if (opcion === "off" || opcion === "desactivar") {
          accionesActivadas = false;
          return responder("❌ Los emotes han sido *DESACTIVADOS*");
        } else {
          return responder(
            "⚠️ Usa: `!emotes on` para activar o `!emotes off` para desactivar.",
          );
        }
      }

      // Verificar que el texto comience obligatoriamente con "!"
      if (text.startsWith("!")) {
        const commandWord = text.trim().split(/\s+/)[0].slice(1).toLowerCase();

        if (accionesMap[commandWord]) {
          if (!accionesActivadas) {
            return responder(
              "⚠️ Los comandos de emote están desactivados actualmente en este bot.",
            );
          }

          const senderJid = msg.key.participant || msg.key.remoteJid;
          const senderNum = senderJid
            .split("@")[0]
            .split(":")[0]
            .replace(/\D/g, "");
          const senderTag = `@${senderNum}`;

          const accionesSolo = ["paja", "dormir"];
          const esAccionSolo = accionesSolo.includes(accionesMap[commandWord]);

          let targetJid = null;
          let targetTag = "";
          let mentions = [senderJid];

          if (!esAccionSolo) {
            const contextInfo =
              msg.message?.extendedTextMessage?.contextInfo ||
              msg.message?.imageMessage?.contextInfo ||
              msg.message?.videoMessage?.contextInfo ||
              {};

            targetJid =
              contextInfo.participant || contextInfo.mentionedJid?.[0];

            if (!targetJid) {
              return responder(
                `⚠️ Debes responder al mensaje de alguien o etiquetarlo.\n\n*Ejemplo:* Responde a un mensaje con \`!${commandWord}\` o escribe \`!${commandWord} @usuario\``,
              );
            }

            const targetNum = targetJid
              .split("@")[0]
              .split(":")[0]
              .replace(/\D/g, "");

            if (senderNum === targetNum) {
              return responder(
                "⚠️ No puedes realizar esta acción sobre ti mismo.",
              );
            }

            targetTag = `@${targetNum}`;
            mentions.push(targetJid);
          }

          const accionNombre = accionesMap[commandWord];

          let fileName = `${accionNombre}.mp4`;
          if (!esAccionSolo) {
            const randomNum = Math.floor(Math.random() * 3) + 1;
            fileName = `${accionNombre}${randomNum}.mp4`;
          }

          const gifPath = path.join(__dirname, "gifs", fileName);

          if (!fs.existsSync(gifPath)) {
            return responder(
              `❌ No se encontró el archivo de animación: \`${fileName}\` en la carpeta gifs.`,
            );
          }

          const mensajesTexto = {
            besar: `💋 ${senderTag} le dio un apasionado beso a ${targetTag}!`,
            follar: `🔥 ${senderTag} se folló intensamente a ${targetTag}!`,
            abrazo: `🤗 ${senderTag} le dio un abrazo a ${targetTag}!`,
            nalgada: `🍑 ${senderTag} le dio una nalgada a ${targetTag}!`,
            mear: `💦 ${senderTag} meo a ${targetTag}!`,
            cumear: `💦 ${senderTag} cumeo a ${targetTag}!`,
            footjob: `🦶 ${senderTag} le dio un footjob a ${targetTag}!`,
            boobjob: `🍑 ${senderTag} le dio un boobjob a ${targetTag}!`,
            balazo: `🔫 ${senderTag} le metió un plomazo a ${targetTag}!`,
            paja: `💦 ${senderTag} se está pajeando!`,
            dormir: `😴 ${senderTag} se fue a dormir.`,
            anal: `🍆 ${senderTag} le hizo un anal a ${targetTag}!`,
            dedear: `👉 ${senderTag} dedeo a ${targetTag}!`,
          };

          const caption =
            mensajesTexto[accionNombre] ||
            `✨ ${senderTag} realizó ${accionNombre}!`;

          try {
            await sock.sendMessage(
              from,
              {
                video: { url: gifPath },
                gifPlayback: true,
                caption: caption,
                mentions: mentions,
              },
              { quoted: msg },
            );
          } catch (error) {
            console.error("❌ Error al enviar el GIF de acción:", error);
            await responder("❌ Ocurrió un error al cargar la animación.");
          }
        }
      }

      // =========================================
      // FIN DE ACCIONES EN GRUPOS
      // =========================================

      // ==========================================
      // CONTROL NSFW
      // ==========================================

      if (text === "!sabrina activa sexo") {
        nsfwActivado = !nsfwActivado;
        const estado = nsfwActivado ? "ACTIVADO 🔥" : "DESACTIVADO ❄️";
        return responder(
          `👑 *[Modo Creador]* Modo NSFW cambiado a: *${estado}*`,
        );
      }

      if (text.startsWith("!nsfw")) {
        const args = body.trim().split(/ +/).slice(1);
        const accion = args[0] ? args[0].toLowerCase() : "";

        if (accion === "on" || accion === "activar") {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Solo administradores pueden activar el modo NSFW.",
            );
          nsfwActivado = true;
          return responder("🔥 *Modo NSFW ACTIVADO*");
        } else if (accion === "off" || accion === "desactivar") {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Solo administradores pueden desactivar el modo NSFW.",
            );
          nsfwActivado = false;
          return responder("❄️ *Modo NSFW DESACTIVADO*");
        } else if (!accion) {
          const estadoActual = nsfwActivado ? "ACTIVADO 🔥" : "DESACTIVADO ❄️";
          return responder(
            `ℹ️ Estado NSFW actual: *${estadoActual}*\nUsa: *!nsfw on* o *!nsfw off*`,
          );
        }
      }

      // ==========================================
      // COMANDOS NSFW
      // ==========================================

      if (
        [
          "!waifu",
          "!hentai",
          "!neko",
          "!pussy",
          "!feet",
          "!tetas",
          "!culos",
          "!amateur",
          "!rusa",
        ].includes(text)
      ) {
        if (!nsfwActivado) {
          return responder(
            "❄️ El modo NSFW está desactivado en este bot. Pídele a un admin que use *!nsfw on*",
          );
        }

        try {
          let type = "hneko";
          if (text === "!hentai") type = "hentai";
          if (text === "!tetas") type = "boobs";
          if (text === "!amateur") type = "gonewild";
          if (text === "!rusa") type = "paizuri";
          if (text === "!culos") type = "ass";
          if (text === "!waifu") type = "paizuri";
          if (text === "!neko") type = "hneko";
          if (text === "!pussy") type = "pussy";
          if (text === "!feet") type = "feet";

          const apiUrl = `https://nekobot.xyz/api/image?type=${type}`;

          console.log(`🔍 Consultando NekoBot API (tipo: ${type})...`);

          const jsonBuffer = await downloadBuffer(apiUrl);
          const responseText = jsonBuffer.toString("utf-8").trim();

          let data;
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            return responder(
              "❌ La API devolvió una respuesta no válida. Inténtalo de nuevo.",
            );
          }

          if (!data || !data.message || !data.success) {
            return responder(
              "❌ No se encontró ninguna imagen en este momento.",
            );
          }

          const imageUrl = data.message;
          console.log(`🎯 Archivo encontrado: ${imageUrl}`);
          console.log("⏳ Descargando archivo a memoria...");

          const fileBuffer = await downloadBuffer(imageUrl);

          const frases = [
            "Que rico",
            "Que, que, queeee 👀",
            "Sale pajubi?",
            "Oaaaaaaa",
          ];
          const fraseAleatoria =
            frases[Math.floor(Math.random() * frases.length)];

          const urlLower = imageUrl.toLowerCase();
          const esVideo = urlLower.endsWith(".mp4");
          const esGif = urlLower.endsWith(".gif");

          if (esVideo) {
            await sock.sendMessage(
              from,
              {
                video: fileBuffer,
                caption: fraseAleatoria,
                mimetype: "video/mp4",
              },
              { quoted: msg },
            );
            console.log(`✅ Video MP4 NSFW enviado exitosamente.`);
          } else if (esGif) {
            await sock.sendMessage(
              from,
              {
                image: fileBuffer,
                caption: fraseAleatoria,
                mimetype: "image/gif",
              },
              { quoted: msg },
            );
            console.log(`✅ GIF animado NSFW enviado exitosamente.`);
          } else {
            await sock.sendMessage(
              from,
              {
                image: fileBuffer,
                caption: fraseAleatoria,
              },
              { quoted: msg },
            );
            console.log(`✅ Imagen NSFW enviada exitosamente.`);
          }
        } catch (error) {
          console.error("❌ Error enviando contenido NSFW:", error.message);
          await responder(
            "❌ Ocurrió un error al obtener el archivo. Inténtalo de nuevo.",
          );
        }
      }

      // ==========================================
      // FIN DE NSFW
      // ==========================================

      // ==========================================
      // CONTROL DE AUDIOS DE VOZ
      // ==========================================

      if (text === "!sabrina protocolo") {
        audiosActivados = !audiosActivados;
        const estado = audiosActivados ? "ACTIVADOS 🔊" : "DESACTIVADOS 🔇";
        return responder(
          `👑 *[Modo Creador]* Estado de audios cambiado a: *${estado}*`,
        );
      }

      if (text.startsWith("!audios")) {
        if (!esAdmin && !msg.key.fromMe) {
          return responder(
            "❌ Necesitas ser administrador del grupo para cambiar esta opción.",
          );
        }

        const accion = body.slice(7).trim().toLowerCase();

        if (accion === "on" || accion === "activar") {
          audiosActivados = true;
          return responder("🔊 *Audios de voz automáticos ACTIVADOS.*");
        } else if (accion === "off" || accion === "desactivar") {
          audiosActivados = false;
          return responder("🔇 *Audios de voz automáticos DESACTIVADOS.*");
        } else {
          const estadoActual = audiosActivados
            ? "ACTIVADOS 🔊"
            : "DESACTIVADOS 🔇";
          return responder(
            `ℹ️ Estado de audios: *${estadoActual}*\nUsa: *!audios on* o *!audios off*`,
          );
        }
      }

 // RESPUESTA CON AUDIOS DE VOZ
const sonidos = {
  'porno': 'ney.ogg',
  'peruano': 'gaspip.ogg',
  'boliviano': 'gaspib.ogg',
  ':v': 'viejo1.ogg',
  'god': 'sombare13.ogg',
  'good': 'sombare14.ogg',
  'vamoo': 'vamo.ogg',
  'pasen': 'maau2.ogg',
  'la nueva': 'mamut.ogg',
  'responde': 'hola.ogg',
  'respondeme': 'hola.ogg',
  'mil': 'mil.ogg',
  'fernan': 'fernan.ogg'
};

if (sonidos[text] && audiosActivados) {
  try {
    const nombreArchivo = sonidos[text];
    const audioPath = path.join(__dirname, "mp3", nombreArchivo);

    if (fs.existsSync(audioPath)) {
            const audioBuffer = fs.readFileSync(audioPath);
            await sock.sendMessage(
              from,
              {
                audio: audioBuffer,
                ptt: true,
                mimetype: "audio/ogg; codecs=opus",
              },
              { quoted: msg }
            );

            console.log(`✅ Audio enviado citando mensaje: ${nombreArchivo}`);
          } else {
            console.log(`⚠️ Archivo no encontrado: ${audioPath}`);
          }
        } catch (error) {
          console.error("❌ Error al enviar audio:", error.message);
        }
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje:", err);
    }
  });
}

// ===================================
// FIN DE AUDIOS
// ===================================

// INICIA EL BOT Y ACA TERMINA TODA LA PROGRAMACION NO BORRAR ESTA LINEA
iniciarBot();